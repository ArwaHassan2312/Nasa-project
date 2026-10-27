import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before, describe } from 'node:test';
import { transformWithOxc } from 'vite';
import {
  applyResourceEffects,
  canTriggerLinkedTaskEvent,
  excludeTaskEventSources,
  getTaskCompletionResourceEffects,
  getTaskEventRecovery,
  getTaskMissResourceEffects,
  getResolvedLinkedTasks,
  hasEventOccurredOnDay,
  hasTaskEventOccurredOnDay,
  removeEventOccurrence,
  shouldCreateEmergencyFollowUp,
  shouldDeferCriticalTaskAtDayEnd,
  selectDailyTaskDefinitions,
  startTaskOccurrence,
} from './taskLifecycle.js';

let scheduler;
let events;

before(async () => {
  const source = await readFile(new URL('./eventScheduler.ts', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'eventScheduler.ts');
  scheduler = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const eventSource = await readFile(new URL('../data/moonEvents.ts', import.meta.url), 'utf8');
  const transformedEvents = await transformWithOxc(eventSource, 'moonEvents.ts');
  events = await import(`data:text/javascript;base64,${Buffer.from(transformedEvents.code).toString('base64')}`);
});

function task(overrides = {}) {
  return {
    id: 'task-a',
    priority: 'critical',
    status: 'available',
    scheduledDay: 1,
    startedDay: null,
    urgentStartedAtMs: null,
    urgentDeadlineAtMs: null,
    responseDeadlineMs: 60_000,
    escalationDelayMs: 60_000,
    overdueEffectApplied: false,
    completionResourceEffects: { power: 3 },
    missedResourceEffects: { battery: -7 },
    ...overrides,
  };
}

describe('task lifecycle', () => {
  test('leaves unstarted Critical timers idle and starts only the selected task', () => {
    const taskA = task({ id: 'a' });
    const taskB = task({ id: 'b' });
    assert.equal(shouldDeferCriticalTaskAtDayEnd(taskA, 120_000), true);
    const startedA = startTaskOccurrence(taskA, 1, 10_000);
    const tasks = [taskA, taskB].map((entry) => entry.id === 'a' ? startedA : entry);
    assert.equal(tasks[0].urgentDeadlineAtMs, 70_000);
    assert.equal(tasks[1], taskB);
    assert.equal(tasks[1].urgentDeadlineAtMs, null);
    assert.equal(shouldDeferCriticalTaskAtDayEnd(startedA, 20_000), true);
    assert.equal(shouldDeferCriticalTaskAtDayEnd(startedA, 70_000), false);
  });

  test('only a started overdue task can trigger its own linked event', () => {
    const eventA = { riskTaskIds: ['a'] };
    const overdueA = task({ id: 'a', status: 'overdue', startedDay: 1 });
    const unstartedB = task({ id: 'b', status: 'overdue' });
    assert.equal(canTriggerLinkedTaskEvent(overdueA, eventA), true);
    assert.equal(canTriggerLinkedTaskEvent(unstartedB, eventA), false);
    assert.equal(canTriggerLinkedTaskEvent(task({ id: 'a', status: 'overdue' }), eventA), false);
    assert.equal(canTriggerLinkedTaskEvent(task({
      id: 'a',
      priority: 'high',
      status: 'overdue',
    }), eventA), false);
  });

  test('applies task resource effects by outcome and limits resource recovery to task events', () => {
    assert.deepEqual(getTaskMissResourceEffects(task({ priority: 'high' })), { battery: -7 });
    assert.deepEqual(getTaskMissResourceEffects(task({
      priority: 'high',
      overdueEffectApplied: true,
    })), {});
    assert.deepEqual(getTaskMissResourceEffects(task()), {});
    assert.deepEqual(getTaskCompletionResourceEffects(task()), { power: 3 });
    assert.deepEqual(getTaskEventRecovery({ triggerSource: 'task', riskResources: ['power', 'oxygen'] }), {
      power: 3,
      oxygen: 3,
    });
    assert.deepEqual(getTaskEventRecovery({ triggerSource: 'independent', riskResources: ['power'] }), {});
  });

  test('a resolved task-triggered event does not create an automatically started emergency task', () => {
    const event = { triggerSource: 'task', emergencyTask: { title: 'follow-up' } };
    assert.equal(shouldCreateEmergencyFollowUp(event), false);
    assert.equal(shouldCreateEmergencyFollowUp({ ...event, triggerSource: 'independent' }), true);
  });

  test('only resolving a task-caused event completes its overdue linked task', () => {
    const missed = task({ id: 'missed', status: 'overdue' });
    const untouched = task({ id: 'untouched', status: 'available' });
    assert.deepEqual(
      getResolvedLinkedTasks([missed, untouched], {
        triggerSource: 'independent',
        riskTaskIds: ['missed', 'untouched'],
      }),
      [],
    );
    assert.deepEqual(
      getResolvedLinkedTasks([missed, untouched], {
        triggerSource: 'task',
        riskTaskIds: ['missed', 'untouched'],
      }),
      [missed],
    );
  });

  test('the daily event guard blocks a second source after either source has recorded an event', () => {
    const event = { eventId: 'incident', day: 2, source: 'task' };
    assert.equal(hasEventOccurredOnDay({ day: 2, eventHistory: [event], currentEvent: null, queuedEvents: [] }), true);
    assert.equal(hasEventOccurredOnDay({
      day: 2,
      eventHistory: [],
      currentEvent: null,
      queuedEvents: [{ event: { day: 2 }, presented: false }],
    }), true);
    assert.equal(hasEventOccurredOnDay({ day: 2, eventHistory: [], currentEvent: null, queuedEvents: [] }), false);
  });

  test('a Day 1 independent event does not block the missed Critical task consequence', () => {
    const independentEvent = {
      day: 1,
      eventHistory: [{ day: 1, source: 'independent' }],
      currentEvent: { day: 1, triggerSource: 'independent' },
      queuedEvents: [],
    };
    assert.equal(hasEventOccurredOnDay(independentEvent), true);
    assert.equal(hasTaskEventOccurredOnDay(independentEvent), false);
    assert.equal(hasTaskEventOccurredOnDay({
      ...independentEvent,
      eventHistory: [...independentEvent.eventHistory, { day: 1, source: 'task' }],
    }), true);
  });

  test('removing one active alert preserves the other event and its independent timer', () => {
    const first = { id: 'event-a', occurrenceId: 'occurrence-a', day: 1 };
    const second = { id: 'event-b', occurrenceId: 'occurrence-b', day: 1 };
    const third = { id: 'event-c', occurrenceId: 'occurrence-c', day: 1 };
    const queued = [
      { event: second, drainElapsedMs: 1200, presented: false, deadlineAtMs: 60_000 },
      { event: third, drainElapsedMs: 800, presented: false, deadlineAtMs: 75_000 },
    ];

    const afterSecond = removeEventOccurrence(first, queued, 'occurrence-b');
    assert.equal(afterSecond.isCurrent, false);
    assert.equal(afterSecond.event, second);
    assert.equal(afterSecond.queuedEvents.length, 1);
    assert.equal(afterSecond.queuedEvents[0].event, third);
    assert.equal(afterSecond.queuedEvents[0].deadlineAtMs, 75_000);

    const afterFirst = removeEventOccurrence(first, queued, 'occurrence-a');
    assert.equal(afterFirst.isCurrent, true);
    assert.equal(afterFirst.queuedEvents, queued);
    assert.equal(afterFirst.event, first);
  });
});

test('an expired Power Failure event applies its defined severe losses once', () => {
  const event = events.MOON_EVENTS.find(({ id }) => id === 'power_failure');
  const startingResources = {
    power: 100,
    battery: 100,
    equipment: 100,
  };
  const failedResources = applyResourceEffects(startingResources, event.failureEffects);
  assert.deepEqual(failedResources, { power: 82, battery: 88, equipment: 92 });
  assert.equal(startingResources.power, 100);
});

test('independent event scheduling uses each day timer and can select at 20 seconds on every day', () => {
  const event = {
    id: 'timing-probe',
    minDay: 1,
    cooldownDays: 1,
    maxOccurrences: 1,
    baseWeight: 1,
    affectedSystems: ['power'],
    riskResources: ['power'],
  };
  const base = {
    events: [event],
    day: 1,
    maxDays: 30,
    dayDurationMs: 120_000,
    rngState: 0,
    flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [],
  };
  for (const day of [1, 2, 12, 30]) {
    const beforeThreshold = scheduler.selectMajorEvent({
      ...base, day, elapsedMs: day * base.dayDurationMs, independentElapsedMs: 19_999, rngState: 1,
    }, 10_000);
    assert.equal(beforeThreshold.event, null);
    assert.equal(beforeThreshold.rngState, 1);

    let selected = null;
    for (let seed = 1; seed < 10_000 && !selected; seed += 1) {
      const result = scheduler.selectMajorEvent({
        ...base,
        day,
        elapsedMs: day * base.dayDurationMs + 20_000,
        independentElapsedMs: 20_000,
        rngState: seed,
      }, 10_000);
      if (result.event) selected = result.event;
    }
    assert.equal(selected?.id, 'timing-probe');
  }
  assert.equal(scheduler.EVENT_SCHEDULER_CONFIG.minimumIndependentEventElapsedMs, 20_000);
});

test('Day 1 independent event is guaranteed at 20 seconds, even if the ordinary roll misses', () => {
  const event = {
    id: 'day-one-event', minDay: 1, cooldownDays: 1, maxOccurrences: 1,
    baseWeight: 1, affectedSystems: ['power'], riskResources: ['power'],
  };
  const base = {
    events: [event], day: 1, maxDays: 30, dayDurationMs: 120_000,
    elapsedMs: 20_000, independentElapsedMs: 20_000, rngState: 1,
    flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [],
  };
  assert.equal(scheduler.selectMajorEvent(base, 10_000).event, null);
  assert.equal(
    scheduler.selectMajorEvent({ ...base, forceEvent: true }, 10_000).event?.id,
    'day-one-event',
  );
});

test('Day 2 Water Leak is forced at the early-day threshold despite ordinary event cooldown', () => {
  const event = {
    id: 'water_leak', minDay: 2, cooldownDays: 5, maxOccurrences: 2,
    baseWeight: 1.1, affectedSystems: ['water', 'lifeSupport'], riskResources: ['water'],
  };
  const selection = scheduler.selectMajorEvent({
    events: [event], day: 2, maxDays: 30, dayDurationMs: 120_000,
    elapsedMs: 140_000, independentElapsedMs: 20_000, rngState: 1,
    flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [{ eventId: 'prior-event', day: 1, elapsedMs: 20_000 }],
    forceEvent: true,
  }, 10_000);
  assert.equal(selection.event?.id, 'water_leak');
});

test('Day 2 independent event selection excludes the source of an active task consequence', () => {
  const waterlineTask = {
    id: 'habitat-waterline-inspection', priority: 'normal', status: 'available',
  };
  const independentEvents = excludeTaskEventSources(
    events.MOON_EVENTS,
    events.TASK_CONSEQUENCE_EVENTS,
    [waterlineTask],
  );
  assert.equal(independentEvents.some(({ id }) => id === 'water_leak'), false);
  const selection = scheduler.selectMajorEvent({
    events: independentEvents, day: 2, maxDays: 30, dayDurationMs: 120_000,
    elapsedMs: 140_000, independentElapsedMs: 20_000, rngState: 1,
    flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [{ eventId: 'prior-event', day: 1, elapsedMs: 20_000 }],
    forceEvent: true,
  }, 10_000);
  assert.ok(selection.event);
  assert.notEqual(selection.event.id, 'water_leak');
});

test('task consequences use unique event definitions and task-specific options', () => {
  const regularIds = new Set(events.MOON_EVENTS.map(({ id }) => id));
  assert.equal(events.TASK_CONSEQUENCE_EVENTS.length, 3);
  for (const taskEvent of events.TASK_CONSEQUENCE_EVENTS) {
    assert.equal(regularIds.has(taskEvent.id), false);
    assert.equal(taskEvent.riskTaskIds.length, 1);
    const regularSource = events.MOON_EVENTS.find((event) => event.riskTaskIds?.includes(taskEvent.riskTaskIds[0]));
    assert.ok(regularSource);
    assert.notEqual(taskEvent.name, regularSource.name);
    assert.notEqual(taskEvent.situation, regularSource.situation);
    assert.equal(taskEvent.sourceEventId, regularSource.id);
    assert.notDeepEqual(
      taskEvent.decisions.map(({ label }) => label),
      regularSource.decisions.map(({ label }) => label),
    );
    assert.deepEqual(taskEvent.failureEffects, regularSource.failureEffects);
    assert.deepEqual(taskEvent.failureConditionEffects, regularSource.failureConditionEffects);
    assert.deepEqual(
      taskEvent.decisions.map(({ effects, conditionEffects }) => ({ effects, conditionEffects })),
      regularSource.decisions.map(({ effects, conditionEffects }) => ({ effects, conditionEffects })),
    );
  }
});

test('new day task generation replaces prior High and Critical tasks', () => {
  const definitions = [
    { id: 'high-a', priority: 'high' },
    { id: 'normal-a', priority: 'normal' },
    { id: 'normal-b', priority: 'normal' },
    { id: 'normal-c', priority: 'normal' },
    { id: 'critical-a', priority: 'critical' },
  ];
  const dayOne = selectDailyTaskDefinitions(definitions, 1, 3);
  assert.deepEqual(dayOne.map(({ id }) => id), ['critical-a', 'high-a', 'normal-a']);
  const dayTwo = selectDailyTaskDefinitions(definitions, 2, 3);
  assert.equal(dayTwo.length, 3);
  assert.equal(dayTwo.some(({ id }) => id === 'critical-a' || id === 'high-a'), false);
  assert.deepEqual(dayTwo.map(({ id }) => id), ['normal-b', 'normal-c', 'normal-a']);
  let previousDay = dayTwo;
  for (let day = 3; day <= 30; day += 1) {
    const currentDay = selectDailyTaskDefinitions(definitions, day, 3);
    const previousUrgentIds = new Set(previousDay
      .filter(({ priority }) => priority === 'high' || priority === 'critical')
      .map(({ id }) => id));
    assert.equal(currentDay.length, 3);
    assert.equal(currentDay.some(({ id }) => previousUrgentIds.has(id)), false);
    previousDay = currentDay;
  }
});

test('the independent-event delay resets on a new day while campaign cooldown time stays cumulative', () => {
  const event = {
    id: 'timing-probe', minDay: 1, cooldownDays: 1, maxOccurrences: 1,
    baseWeight: 1, affectedSystems: ['power'], riskResources: ['power'],
  };
  const base = {
    events: [event], day: 2, maxDays: 30, dayDurationMs: 120_000,
    elapsedMs: 140_000, flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [],
  };
  const beforeThreshold = scheduler.selectMajorEvent({
    ...base, independentElapsedMs: 19_999, rngState: 1,
  }, 10_000);
  assert.equal(beforeThreshold.event, null);
  assert.equal(beforeThreshold.rngState, 1);
  let selected = null;
  for (let seed = 1; seed < 10_000 && !selected; seed += 1) {
    selected = scheduler.selectMajorEvent({
      ...base, independentElapsedMs: 20_000, rngState: seed,
    }, 10_000).event;
  }
  assert.equal(selected?.id, 'timing-probe');
});
