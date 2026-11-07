import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let viteServer;
let simulation;
let consequenceEvents;
before(async () => {
  viteServer = await createServer({
    configFile: 'vite.config.js',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  simulation = await viteServer.ssrLoadModule('/src/hooks/useGameSimulation.ts');
  ({ TASK_CONSEQUENCE_EVENTS: consequenceEvents } = await viteServer.ssrLoadModule('/src/data/moonEvents.ts'));
});
after(async () => {
  await viteServer?.close();
});

test('an unresolved event expires at day end, applies its consequences, and leaves no event or pending resource state', () => {
  const duration = simulation.LUNAR_DAY_DURATION_MS;
  const initial = simulation.createInitialState(0x51a7);
  const event = {
    id: 'power_failure',
    occurrenceId: 'independent-1-1',
    day: 1,
    triggerSource: 'independent',
    name: 'Power Failure',
    affectedSystems: ['power'],
    riskResources: ['power'],
    failureEffects: { power: -25 },
    failureConditionEffects: { power: -5 },
    failureFeedback: 'Reserve capacity was depleted.',
  };
  const endOfDay = simulation.advanceClockState({
    ...initial,
    dayPhase: 'active',
    dayElapsedMs: duration - 1_000,
    resourceElapsedMs: duration - 1_000,
    campaignElapsedMs: 100_000,
    schedulerElapsedMs: 0,
    resources: { ...initial.resources, power: 50 },
    dailyChallenges: initial.dailyChallenges.map((task) => ({ ...task, status: 'completed' })),
    currentEvent: event,
    queuedEvents: [],
    eventPhase: 'awaitingDecision',
    eventDeadlineAtMs: 160_000,
    pendingResourceEffects: { power: -3 },
  }, 1_000, duration);

  assert.equal(endOfDay.dayPhase, 'report');
  assert.equal(endOfDay.currentEvent, null);
  assert.deepEqual(endOfDay.queuedEvents, []);
  assert.deepEqual(endOfDay.pendingResourceEffects, {});
  assert.equal(endOfDay.resources.power, 21);
  assert.equal(endOfDay.eventOutcomeHistory.at(-1).resourceChanges.power, -25);
  assert.equal(endOfDay.eventOutcomeHistory.at(-1).status, 'expired');
  assert.equal(endOfDay.expiredEventHistory.at(-1).occurrenceId, event.occurrenceId);
});

test('a missed critical timer holds its event for 45 in-game minutes, then triggers it', () => {
  const initial = simulation.createInitialState(0x51a9);
  const definition = consequenceEvents.find((event) => event.riskTaskIds?.includes('solar-array-inspection'));
  const task = {
    ...initial.dailyChallenges[0],
    id: 'solar-array-inspection',
    title: 'Solar Panel Inspection',
    priority: 'critical',
    status: 'inProgress',
    responseDeadlineMs: 1_000,
    urgentStartedAtMs: 0,
    urgentDeadlineAtMs: 1_000,
    urgentConditionLoss: 6,
    urgentResourceEffects: { power: -4 },
    overdueEffectApplied: false,
    urgentConsequenceApplied: false,
    recoveryStatus: null,
    recoveryDeadlineAtMs: null,
    recoveryResourceLosses: {},
    triggeredEventIds: [],
  };
  const state = {
    ...initial,
    day: 3,
    dayElapsedMs: 0,
    campaignElapsedMs: 0,
    resourceElapsedMs: 0,
    resources: { ...initial.resources, power: 70 },
    eventHistory: [{ eventId: 'prior-independent-event', day: 3, elapsedMs: 0, source: 'independent' }],
    independentEventHistory: [{ eventId: 'prior-independent-event', day: 3, elapsedMs: 0, source: 'independent' }],
    dailyChallenges: [task],
  };
  const afterInitialDeadline = simulation.advanceClockState(
    state,
    1_000,
    simulation.LUNAR_DAY_DURATION_MS,
  );
  assert.equal(afterInitialDeadline.dailyChallenges[0].recoveryStatus, 'available');
  assert.equal(afterInitialDeadline.resources.power, 66);
  assert.equal(afterInitialDeadline.currentEvent, null);
  assert.equal(afterInitialDeadline.eventHistory.filter((event) => event.source === 'task').length, 0);

  const recoveryActive = {
    ...afterInitialDeadline,
    dailyChallenges: [{
      ...afterInitialDeadline.dailyChallenges[0],
      recoveryStatus: 'active',
      recoveryDeadlineAtMs: afterInitialDeadline.campaignElapsedMs
        + Math.round(simulation.LUNAR_DAY_DURATION_MS * 45 / (24 * 60)),
    }],
  };
  const recoveryDurationMs = recoveryActive.dailyChallenges[0].recoveryDeadlineAtMs
    - recoveryActive.campaignElapsedMs;
  const afterRecoveryDeadline = simulation.advanceClockState(
    recoveryActive,
    recoveryDurationMs,
    simulation.LUNAR_DAY_DURATION_MS,
  );
  assert.equal(afterRecoveryDeadline.dailyChallenges[0].recoveryStatus, 'expired', JSON.stringify({
    campaignElapsedMs: afterRecoveryDeadline.campaignElapsedMs,
    recoveryDeadlineAtMs: afterRecoveryDeadline.dailyChallenges[0].recoveryDeadlineAtMs,
    phase: afterRecoveryDeadline.dayPhase,
    eventPhase: afterRecoveryDeadline.eventPhase,
    warningTaskId: afterRecoveryDeadline.warningTaskId,
  }));
  assert.equal(afterRecoveryDeadline.currentEvent?.triggerSource, 'task');
  assert.equal(afterRecoveryDeadline.currentEvent?.id, definition.id);
  assert.equal(afterRecoveryDeadline.eventHistory.filter((event) => event.eventId === definition.id).length, 1);
});

test('an unresolved recovery at day end triggers the end-of-day consequence and explanation', () => {
  const initial = simulation.createInitialState(0x51aa);
  const duration = simulation.LUNAR_DAY_DURATION_MS;
  const definition = consequenceEvents.find((event) => event.riskTaskIds?.includes('solar-array-inspection'));
  const task = {
    ...initial.dailyChallenges[0],
    id: 'solar-array-inspection',
    title: 'Solar Panel Inspection',
    priority: 'critical',
    status: 'overdue',
    urgentDeadlineAtMs: 60_000,
    urgentConsequenceApplied: true,
    overdueEffectApplied: true,
    recoveryStatus: 'active',
    recoveryDeadlineAtMs: 150_000,
    recoveryResourceLosses: { power: 4 },
    triggeredEventIds: [],
  };
  const state = {
    ...initial,
    dayPhase: 'active',
    dayElapsedMs: duration - 1_000,
    resourceElapsedMs: duration - 1_000,
    campaignElapsedMs: 100_000,
    schedulerElapsedMs: 0,
    resources: { ...initial.resources, power: 80, battery: 80, equipment: 80 },
    dailyChallenges: [task],
  };
  const atDayEnd = simulation.advanceClockState(state, 1_000, duration);
  assert.equal(atDayEnd.dayPhase, 'closing');
  assert.equal(atDayEnd.endOfDayEvents[0]?.endOfDayConsequence, true);
  assert.equal(atDayEnd.endOfDayEvents[0]?.id, definition.id);
  assert.match(atDayEnd.eventOutcomeHistory.at(-1).feedback, /not completed before day end/i);
  assert.match(atDayEnd.eventOutcomeHistory.at(-1).feedback, /opportunity to prevent/i);
  assert.ok(atDayEnd.resources.power <= 50, 'day-end failure penalty is larger than the event onset penalty');
  assert.equal(atDayEnd.eventHistory.filter((event) => event.eventId === definition.id).length, 1);
});

test('lunar day duration is three minutes', () => {
  assert.equal(simulation.LUNAR_DAY_DURATION_MS, 180_000);
});

test('event timeout applies its authored resource penalty once and removes the active event', () => {
  const initial = simulation.createInitialState(0x51a8);
  const event = {
    id: 'solar_storm',
    occurrenceId: 'independent-1-timeout',
    day: 1,
    triggerSource: 'independent',
    name: 'Solar Storm',
    affectedSystems: ['power', 'equipment'],
    riskResources: ['power', 'battery', 'radProtection', 'health'],
    failureEffects: { power: -25, battery: -25, radProtection: -25, health: -25 },
    failureConditionEffects: { power: -10 },
    failureFeedback: 'The storm passed without shelter.',
  };
  const beforeTimeout = {
    ...initial,
    dayPhase: 'active',
    dayElapsedMs: 90_000,
    campaignElapsedMs: 90_000,
    schedulerElapsedMs: 0,
    resources: { ...initial.resources, power: 80, battery: 80, radProtection: 80, health: 80 },
    currentEvent: event,
    eventPhase: 'awaitingDecision',
    eventDeadlineAtMs: 91_000,
  };

  const expired = simulation.advanceClockState(beforeTimeout, 1_000, simulation.LUNAR_DAY_DURATION_MS);
  const afterAnotherTick = simulation.advanceClockState(expired, 1_000, simulation.LUNAR_DAY_DURATION_MS);
  assert.equal(expired.currentEvent, null);
  assert.deepEqual(expired.resources, {
    ...initial.resources,
    power: 55,
    battery: 55,
    radProtection: 55,
    health: 55,
  });
  assert.deepEqual(afterAnotherTick.resources, expired.resources);
  assert.equal(expired.eventFailureNotices.at(-1).changes.power, -25);
  assert.equal(expired.eventFailureNotices.length, 1);
});
