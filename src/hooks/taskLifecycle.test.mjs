import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { before, describe } from 'node:test';
import { transformWithOxc } from 'vite';
import {
  applyResourceEffects,
  BASELINE_DAILY_CONSUMPTION,
  canTriggerLinkedTaskEvent,
  excludeTaskEventSources,
  getTaskCompletionResourceEffects,
  getHalfResourceRestoration,
  getElapsedResourceEffects,
  findFailedEssentialResource,
  getTaskMissResourceEffects,
  getSuccessfulEventResourceEffects,
  getResolvedLinkedTasks,
  getUnresolvedEventOccurrenceIdsAtDayEnd,
  hasEventOccurredOnDay,
  hasEventOccurredInSession,
  hasTaskEventOccurredOnDay,
  removeEventOccurrence,
  selectRandomDailyTaskDefinitions,
  selectDailyTaskDefinitions,
  selectUntriggeredCriticalTaskEvents,
  settlePendingResourceEffects,
  startTaskOccurrence,
} from './taskLifecycle.js';

let scheduler;
let events;
let challengeDefinitions;
let buildMissionFailureNarrative;

before(async () => {
  const source = await readFile(new URL('./eventScheduler.ts', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'eventScheduler.ts');
  scheduler = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const eventSource = await readFile(new URL('../data/moonEvents.ts', import.meta.url), 'utf8');
  const transformedEvents = await transformWithOxc(eventSource, 'moonEvents.ts');
  const eventModuleUrl = `data:text/javascript;base64,${Buffer.from(transformedEvents.code).toString('base64')}`;
  events = await import(eventModuleUrl);
  const challengeSource = await readFile(new URL('../data/dailyChallenges.ts', import.meta.url), 'utf8');
  const transformedChallenges = await transformWithOxc(challengeSource, 'dailyChallenges.ts');
  challengeDefinitions = await import(`data:text/javascript;base64,${Buffer.from(transformedChallenges.code).toString('base64')}`);
  const narrativeSource = await readFile(new URL('../components/missionFailureNarrative.ts', import.meta.url), 'utf8');
  const transformedNarrative = await transformWithOxc(narrativeSource, 'missionFailureNarrative.ts');
  const narrativeCode = transformedNarrative.code.replaceAll('"../data/moonEvents"', `"${eventModuleUrl}"`);
  ({ buildMissionFailureNarrative } = await import(
    `data:text/javascript;base64,${Buffer.from(narrativeCode).toString('base64')}`
  ));
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
    missedResourceEffects: { battery: -1 },
    ...overrides,
  };
}

describe('task lifecycle', () => {
  test('starts a Critical response timer only when selected; incomplete tasks fail at day end', () => {
    const taskA = task({ id: 'a' });
    const taskB = task({ id: 'b' });
    const startedA = startTaskOccurrence(taskA, 1, 10_000);
    const tasks = [taskA, taskB].map((entry) => entry.id === 'a' ? startedA : entry);
    assert.equal(tasks[0].urgentDeadlineAtMs, 70_000);
    assert.equal(tasks[1], taskB);
    assert.equal(tasks[1].urgentDeadlineAtMs, null);
    assert.equal(startedA.urgentDeadlineAtMs, 70_000);
  });

  test('an overdue Critical task triggers its linked event whether started or not', () => {
    const eventA = { riskTaskIds: ['a'] };
    const overdueA = task({ id: 'a', status: 'overdue', startedDay: 1 });
    const unstartedB = task({ id: 'a', status: 'overdue' });
    assert.equal(canTriggerLinkedTaskEvent(overdueA, eventA), true);
    assert.equal(canTriggerLinkedTaskEvent(unstartedB, eventA), true);
    assert.equal(canTriggerLinkedTaskEvent(task({ id: 'a', status: 'available' }), eventA), false);
    assert.equal(canTriggerLinkedTaskEvent(task({
      id: 'a',
      priority: 'high',
      status: 'overdue',
    }), eventA), false);
  });

  test('applies targeted task resource effects only once and avoids blanket event recovery', () => {
    assert.deepEqual(getTaskMissResourceEffects(task({ priority: 'high' })), { battery: -1 });
    assert.deepEqual(getTaskMissResourceEffects(task({
      priority: 'high',
      overdueEffectApplied: true,
    })), {});
    assert.deepEqual(getTaskMissResourceEffects(task({ missedResourceEffects: { power: -4 } })), { power: -4 });
    assert.deepEqual(getTaskMissResourceEffects(task({
      missedResourceEffects: { power: -4 },
      overdueEffectApplied: true,
    })), {});
    assert.deepEqual(getTaskCompletionResourceEffects(task()), { power: 3 });
  });

  test('recovery restores only half of the resources actually lost to the missed-task penalty', () => {
    assert.deepEqual(getHalfResourceRestoration({ power: 20, water: 7, oxygen: 1 }), {
      power: 10,
      water: 4,
      oxygen: 1,
    });
    assert.deepEqual(getHalfResourceRestoration({ power: 20 }), { power: 10 });
  });

  test('scales baseline resource use by elapsed time and clamps resource levels', () => {
    const dailyUse = BASELINE_DAILY_CONSUMPTION;
    const halfDay = getElapsedResourceEffects(dailyUse, 0, 60_000, 120_000);
    const otherHalf = getElapsedResourceEffects(dailyUse, 60_000, 120_000, 120_000);
    assert.equal(halfDay.power ?? 0, 0);
    assert.equal(halfDay.oxygen ?? 0, 0);
    assert.deepEqual({
      ...Object.fromEntries(Object.keys(dailyUse).map((resource) => [
        resource,
        (halfDay[resource] ?? 0) + (otherHalf[resource] ?? 0),
      ])),
    }, dailyUse);
    assert.deepEqual(getElapsedResourceEffects(dailyUse, 0, 500, 0), {});
    assert.deepEqual(applyResourceEffects({ oxygen: 5, power: 98 }, { oxygen: -9, power: 20 }), {
      oxygen: 4, power: 99,
    });
    assert.deepEqual(applyResourceEffects({ oxygen: 42.7 }, { oxygen: -0.8 }), { oxygen: 42 });
  });

  test('mission failure threshold applies to survival resources, not progress or equipment', () => {
    assert.equal(findFailedEssentialResource({ oxygen: 10, water: 80, power: 80 }), 'oxygen');
    assert.equal(findFailedEssentialResource({ science: 0, equipment: 0, health: 60 }), null);
    assert.equal(findFailedEssentialResource({ battery: 9 }), 'battery');
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

  test('session history recognizes task events by their regular Moon event source', () => {
    assert.equal(hasEventOccurredInSession([
      { eventId: 'task_power_failure', sourceEventId: 'power_failure' },
    ], 'power_failure'), true);
    assert.equal(hasEventOccurredInSession([
      { eventId: 'power_failure' },
    ], 'task_power_failure'), false);
  });

  test('day-end expiration collects unresolved active and queued events, but not an already resolving event', () => {
    const active = { id: 'active-event', occurrenceId: 'active-1' };
    const queued = { id: 'queued-event', occurrenceId: 'queued-1' };
    assert.deepEqual(getUnresolvedEventOccurrenceIdsAtDayEnd(
      active, [{ event: queued }], 'awaitingDecision',
    ), ['active-1', 'queued-1']);
    assert.deepEqual(getUnresolvedEventOccurrenceIdsAtDayEnd(
      active, [{ event: queued }], 'resolving',
    ), ['queued-1']);
  });

  test('day-end settlement applies pending incident losses once and clears them before the next day', () => {
    const settled = settlePendingResourceEffects(
      { power: 70, water: 50 },
      { power: -12, water: -7 },
    );
    assert.deepEqual(settled, {
      resources: { power: 58, water: 43 },
      pendingResourceEffects: {},
    });
  });

  test('successful event choices protect event-risk resources while retaining unrelated decision costs', () => {
    assert.deepEqual(getSuccessfulEventResourceEffects(
      { riskResources: ['power', 'battery'] },
      { effects: { power: -10, battery: 5, science: -4, food: 2 } },
    ), { battery: 5, science: -4, food: 2 });
  });

  test('selects zero, one, or multiple unresolved Critical task consequences without duplicates', () => {
    const consequenceEvents = events.TASK_CONSEQUENCE_EVENTS;
    const criticalTasks = consequenceEvents.slice(0, 2).map((event) => ({
      id: event.riskTaskIds[0],
      priority: 'critical',
      status: 'overdue',
      triggeredEventIds: [],
    }));
    const firstOnly = selectUntriggeredCriticalTaskEvents(
      [criticalTasks[0]], consequenceEvents, [], [],
    );
    const both = selectUntriggeredCriticalTaskEvents(
      criticalTasks, consequenceEvents, [], [],
    );
    const highPriorityTask = {
      ...criticalTasks[0],
      priority: 'high',
    };

    assert.deepEqual(selectUntriggeredCriticalTaskEvents([], consequenceEvents, [], []), []);
    assert.deepEqual(selectUntriggeredCriticalTaskEvents(
      [highPriorityTask], consequenceEvents, [], [],
    ), []);
    assert.equal(firstOnly.length, 1);
    assert.equal(firstOnly[0].task.id, criticalTasks[0].id);
    assert.equal(both.length, 2);
    assert.equal(new Set(both.map(({ event }) => event.sourceEventId)).size, 2);
    const sourceAlreadyOccurred = [{
      eventId: firstOnly[0].event.sourceEventId,
      sourceEventId: firstOnly[0].event.sourceEventId,
      source: 'independent',
    }];
    assert.equal(selectUntriggeredCriticalTaskEvents(
      [criticalTasks[0]], consequenceEvents, sourceAlreadyOccurred,
    ).length, 1);
    assert.equal(selectUntriggeredCriticalTaskEvents(
      [criticalTasks[0]], consequenceEvents,
      [{ eventId: firstOnly[0].event.id, sourceEventId: firstOnly[0].event.sourceEventId }],
    ).length, 0);
  });

  test('a started Critical task that expires still triggers its unique linked event exactly once', () => {
    const linkedEvent = events.TASK_CONSEQUENCE_EVENTS.find((event) => (
      event.riskTaskIds.includes('solar-array-inspection')
    ));
    const started = startTaskOccurrence(task({
      id: 'solar-array-inspection',
      status: 'available',
      triggeredEventIds: [],
    }), 1, 10_000);
    const expired = { ...started, status: 'overdue', urgentConsequenceApplied: true };

    assert.equal(started.status, 'inProgress');
    assert.equal(selectUntriggeredCriticalTaskEvents(
      [expired], [linkedEvent], [{ eventId: linkedEvent.sourceEventId, source: 'independent' }],
    ).length, 1);
    assert.equal(selectUntriggeredCriticalTaskEvents(
      [{ ...expired, status: 'completed' }], [linkedEvent], [],
    ).length, 0);
    assert.equal(selectUntriggeredCriticalTaskEvents(
      [{ ...expired, triggeredEventIds: [linkedEvent.id] }], [linkedEvent], [],
    ).length, 0);
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

test('the one-point task/background update helper stays separate from authored event impact values', () => {
  const event = events.MOON_EVENTS.find(({ id }) => id === 'power_failure');
  const startingResources = {
    power: 100,
    battery: 100,
    equipment: 100,
  };
  const failedResources = applyResourceEffects(startingResources, { power: -1, battery: -1, equipment: -1 });
  assert.deepEqual(failedResources, { power: 99, battery: 99, equipment: 99 });
  assert.deepEqual(event.failureEffects, { power: -30, battery: -25, equipment: -20 });
  assert.equal(startingResources.power, 100);
});

test('every Moon event has a relevant resource risk map and ongoing losses stay within that map', () => {
  const penaltyProfiles = new Set();
  for (const event of events.MOON_EVENTS) {
    assert.ok(event.riskResources.length > 0, `${event.id} should retain its scheduler risk map`);
    for (const resource of event.riskResources) {
      assert.ok(event.failureEffects[resource] <= -15,
        `${event.id} should apply a noticeable ${resource} loss on timeout`);
    }
    assert.deepEqual(Object.keys(event.failureEffects).sort(), [...event.riskResources].sort(),
      `${event.id} should penalize only its directly affected resources`);
    assert.ok(new Set(Object.values(event.failureEffects)).size > 1,
      `${event.id} should scale losses to each resource's exposure`);
    penaltyProfiles.add(Object.entries(event.failureEffects).sort().map(([resource, amount]) => `${resource}:${amount}`).join('|'));
    for (const resource of Object.keys(event.failureEffects)) {
      assert.ok(event.riskResources.includes(resource), `${event.id} failure ${resource} must be a mapped risk`);
    }
    for (const resource of Object.keys(event.initialResourceEffects ?? {})) {
      assert.ok(event.riskResources.includes(resource), `${event.id} initial ${resource} must be a mapped risk`);
    }
    for (const resource of Object.keys(event.ongoingResourceEffects ?? {})) {
      assert.ok(event.riskResources.includes(resource), `${event.id} ongoing ${resource} must be a mapped risk`);
    }
    for (const amount of Object.values(event.initialResourceEffects ?? {})) {
      assert.ok(Number.isInteger(amount), `${event.id} initial impact must be an integer`);
    }
    for (const amount of Object.values(event.ongoingResourceEffects ?? {})) {
      assert.ok(Number.isInteger(amount) && amount < 0, `${event.id} ongoing impact must be integer deterioration`);
    }
    for (const amount of Object.values(event.failureEffects)) {
      assert.ok(Number.isInteger(amount), `${event.id} failure impact must be an integer`);
    }
    if (event.id !== 'water_ice_exploration') {
      assert.ok(event.initialResourceEffects, `${event.id} should apply a defined incident-start impact`);
      assert.ok(event.ongoingResourceEffects, `${event.id} should deteriorate while unresolved`);
      assert.ok(Number.isInteger(event.ongoingEffectIntervalMs) && event.ongoingEffectIntervalMs > 0);
    }
  }
  assert.equal(penaltyProfiles.size, events.MOON_EVENTS.length,
    'Each event should have an event-specific unresolved-penalty profile');
  const leak = events.MOON_EVENTS.find(({ id }) => id === 'water_leak');
  assert.deepEqual(leak.ongoingResourceEffects, { water: -1, emergencyReserve: -1, oxygen: -1 });
  assert.equal(leak.failureEffects.water, -30);
  const waterSurvey = events.MOON_EVENTS.find(({ id }) => id === 'water_ice_exploration');
  assert.equal(waterSurvey.ongoingResourceEffects, undefined);
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

test('independent event scheduler skips events already seen in the gameplay session', () => {
  const event = {
    id: 'session-unique', minDay: 1, cooldownDays: 1, maxOccurrences: 5,
    baseWeight: 1, affectedSystems: ['power'], riskResources: ['power'],
  };
  const input = {
    events: [event], day: 4, maxDays: 30, dayDurationMs: 120_000,
    elapsedMs: 380_000, independentElapsedMs: 20_000, rngState: 11,
    flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [{ eventId: event.id, day: 1, elapsedMs: 20_000 }],
    forceEvent: true,
  };
  const selection = scheduler.selectMajorEvent(input, 10_000);
  assert.equal(selection.event, null);
  assert.equal(selection.rngState, input.rngState);
});

test('task consequence source IDs exclude their regular Moon event from future draws', () => {
  const event = {
    id: 'power_failure', minDay: 1, cooldownDays: 1, maxOccurrences: 3,
    baseWeight: 1, affectedSystems: ['power'], riskResources: ['power'],
  };
  const selection = scheduler.selectMajorEvent({
    events: [event], day: 4, maxDays: 30, dayDurationMs: 120_000,
    elapsedMs: 380_000, independentElapsedMs: 20_000, rngState: 5,
    flags: [],
    systemConditions: { power: 100, lifeSupport: 100, water: 100, equipment: 100 },
    resources: { power: 100, battery: 100, oxygen: 100, water: 100 },
    eventHistory: [{
      eventId: 'task_power_failure', sourceEventId: event.id, day: 1, elapsedMs: 20_000,
    }],
    forceEvent: true,
  }, 10_000);
  assert.equal(selection.event, null);
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

test('random daily challenge selection varies between three and four tasks without session repeats', () => {
  const definitions = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `critical-${index}`, priority: 'critical' })),
    ...Array.from({ length: 7 }, (_, index) => ({ id: `high-${index}`, priority: 'high' })),
    ...Array.from({ length: 8 }, (_, index) => ({ id: `normal-${index}`, priority: 'normal' })),
  ];
  const generated = [];
  const taskCounts = [];
  let previousTaskIds = [];
  for (let day = 1; day <= 30; day += 1) {
    const tasks = selectRandomDailyTaskDefinitions(definitions, day, 0x1248abcd, previousTaskIds);
    assert.ok(tasks.length <= 4);
    if (definitions.length - previousTaskIds.length >= 3) {
      assert.ok(tasks.length >= 3);
    }
    assert.equal(new Set(tasks.map(({ id }) => id)).size, tasks.length);
    assert.equal(tasks.some(({ id }) => previousTaskIds.includes(id)), false);
    assert.ok(tasks.filter(({ priority }) => priority === 'critical').length <= 1);
    if (tasks.length > 0) {
      assert.ok(tasks.some(({ priority }) => priority === 'normal' || priority === 'high'));
    }
    generated.push(tasks.map(({ id }) => id).sort().join('|'));
    taskCounts.push(tasks.length);
    previousTaskIds = [...previousTaskIds, ...tasks.map(({ id }) => id)];
  }
  assert.ok(new Set(generated.filter(Boolean)).size > 2);
  assert.ok(taskCounts.includes(3));
  assert.ok(taskCounts.includes(4));
  assert.equal(taskCounts.at(-1), 0);
});

test('the mission task pool supplies three or four fresh task IDs on every mission day', () => {
  const definitions = challengeDefinitions.DAILY_CHALLENGES;
  const usedTaskIds = [];
  for (let day = 1; day <= 30; day += 1) {
    const tasks = selectRandomDailyTaskDefinitions(definitions, day, 0x6a09e667, usedTaskIds);
    assert.ok(tasks.length >= 3 && tasks.length <= 4, `day ${day} should receive 3–4 tasks`);
    assert.equal(tasks.some(({ id }) => usedTaskIds.includes(id)), false);
    usedTaskIds.push(...tasks.map(({ id }) => id));
  }
  assert.equal(new Set(usedTaskIds).size, usedTaskIds.length);
});

test('every Critical daily challenge has a timer and a matching task consequence event', () => {
  const tasks = challengeDefinitions.DAILY_CHALLENGES;
  const criticalTasks = tasks.filter(
    ({ priority }) => priority === 'critical',
  );
  assert.ok(criticalTasks.length >= 3);
  for (const task of criticalTasks) {
    assert.ok(task.responseDeadlineMs > 0, `${task.id} must have a response timer`);
    assert.ok(events.TASK_CONSEQUENCE_EVENTS.some((event) => (
      event.riskTaskIds?.includes(task.id)
    )), `${task.id} must link to its consequence event`);
  }
  assert.ok(challengeDefinitions.DAILY_CHALLENGES
    .filter(({ priority }) => priority !== 'critical')
    .every((task) => !events.TASK_CONSEQUENCE_EVENTS.some((event) => (
      event.riskTaskIds?.includes(task.id)
    ))));
  for (const task of tasks.filter(({ priority }) => priority === 'high')) {
    assert.ok(Object.keys(task.missedResourceEffects ?? {}).length > 0,
      `${task.id} must have a targeted missed-task resource impact`);
  }
  for (const task of tasks.filter(({ priority }) => priority === 'normal')) {
    assert.ok(Object.keys(task.missedResourceEffects ?? {}).length > 0,
      `${task.id} should have a small, targeted missed-task resource impact`);
    assert.ok(task.overdueConditionLoss <= 1,
      `${task.id} should have only a negligible missed-task condition impact`);
  }
  for (const task of tasks) {
    const rewards = Object.values(task.completionResourceEffects ?? {});
    assert.ok(rewards.length > 0 && rewards.some((reward) => reward > 0),
      `${task.id} should provide a relevant resource reward when completed`);
    const minimumReward = task.priority === 'critical' ? 5
      : task.priority === 'high' ? 3
        : 2;
    assert.ok(rewards.some((reward) => reward >= minimumReward),
      `${task.id} should receive a reward appropriate to its ${task.priority} priority`);
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

test('mission failure analysis summarizes recorded behavior without listing task or event names', () => {
  const taskEvent = events.TASK_CONSEQUENCE_EVENTS.find((event) => (
    event.riskTaskIds.includes('solar-array-inspection')
  ));
  const narrative = buildMissionFailureNarrative({
    day: 3,
    failureReason: 'power',
    threshold: 10,
    resources: { power: 8, battery: 12, oxygen: 44, water: 50 },
    tasks: [{
      id: 'solar-array-inspection',
      title: 'Inspect Solar Array',
      priority: 'critical',
      status: 'overdue',
      day: 2,
      affectedSystem: 'power',
    }],
    events: [{ eventId: taskEvent.id, day: 2, occurrenceId: 'task-solar-array-inspection-2' }],
    outcomes: [{
      eventId: taskEvent.id,
      eventName: taskEvent.name,
      day: 2,
      occurrenceId: 'task-solar-array-inspection-2',
      status: 'expired',
      feedback: taskEvent.failureFeedback,
      resourceChanges: { power: -24, battery: -20 },
    }],
    decisions: [{
      day: 1,
      eventName: 'Power Failure',
      decisionLabel: 'Reroute Through the Battery Bus',
      actualOutcome: 'Battery -10; Power +5',
      resourceChanges: { battery: -10, power: 5 },
    }],
  });

  assert.match(narrative.explanation[0], /Day 3/);
  assert.match(narrative.explanation[0], /Power ended at 8%/);
  assert.match(narrative.explanation[0], /1 missed Critical\/High task/);
  assert.match(narrative.explanation[0], /1 unresolved event/);
  assert.equal(narrative.explanation[0].includes('Inspect Solar Array'), false);
  assert.equal(narrative.explanation[0].includes(taskEvent.name), false);
  assert.equal(narrative.stats.completedTasks, 0);
  assert.equal(narrative.stats.missedTasks, 1);
  assert.equal(narrative.stats.taskCompletionRate, 0);
  assert.equal(narrative.stats.resolvedEvents, 0);
  assert.equal(narrative.stats.unresolvedEvents, 1);
  assert.equal(narrative.behavior[1].detail, '1 missed · 100%');
});
