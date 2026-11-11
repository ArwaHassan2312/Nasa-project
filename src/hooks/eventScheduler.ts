import type { GameEvent, ResourceKey, SystemKey } from '../data/moonEvents';

export interface EventOccurrence {
  eventId: string;
  day: number;
  elapsedMs: number;
  /** Elapsed time within the current day, used only for the first independent-event delay. */
  independentElapsedMs?: number;
  source?: 'independent' | 'task';
  occurrenceId?: string;
  sourceEventId?: string;
}

export interface EventSchedulerInput {
  events: GameEvent[];
  day: number;
  maxDays: number;
  dayDurationMs: number;
  elapsedMs: number;
  rngState: number;
  flags: string[];
  systemConditions: Record<SystemKey, number>;
  resources: Record<ResourceKey, number>;
  eventHistory: EventOccurrence[];
  seenEventIds?: string[];
  forceEvent?: boolean;
  ignoreMinimumDay?: boolean;
  ignorePreventedByFlags?: boolean;
}

export const EVENT_SCHEDULER_CONFIG = {
  checkIntervalMs: 10_000,
  minimumCooldownDays: 2,
  firstEventEarliestDay: 1,
  minimumIndependentEventElapsedMs: 120_000,
  maximumIndependentEventElapsedMs: 240_000,
  minimumBeforeDayEndMs: 60_000,
  elevatedSeverityCondition: 40,
  criticalSeverityCondition: 20,
} as const;

export function getIndependentEventWindowEndMs(dayDurationMs: number): number {
  return Math.max(0, Math.min(
    dayDurationMs - EVENT_SCHEDULER_CONFIG.minimumBeforeDayEndMs,
    EVENT_SCHEDULER_CONFIG.maximumIndependentEventElapsedMs,
  ));
}

function nextRandom(state: number): { value: number; state: number } {
  let nextState = (state + 0x6D2B79F5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    value: ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296,
    state: nextState,
  };
}

export function selectMajorEvent(
  input: EventSchedulerInput,
  _intervalMs: number,
): { event: GameEvent | null; rngState: number } {
  const {
    events,
    day,
    maxDays,
    dayDurationMs,
    elapsedMs,
    independentElapsedMs,
    flags,
    systemConditions,
    resources,
    eventHistory,
    seenEventIds = [],
    forceEvent = false,
    ignoreMinimumDay = false,
    ignorePreventedByFlags = false,
  } = input;
  const independentWindowEndMs = getIndependentEventWindowEndMs(dayDurationMs);
  const selectionElapsedMs = independentElapsedMs ?? elapsedMs;
  if (
    day < EVENT_SCHEDULER_CONFIG.firstEventEarliestDay
    || day > maxDays
    || !Number.isFinite(dayDurationMs)
    || dayDurationMs <= 0
    || (independentElapsedMs !== undefined && selectionElapsedMs >= independentWindowEndMs)
  ) {
    return { event: null, rngState: input.rngState };
  }

  const lastEvent = eventHistory[eventHistory.length - 1];
  const daysSinceLastEvent = lastEvent
    ? (elapsedMs - lastEvent.elapsedMs) / dayDurationMs
    : elapsedMs / dayDurationMs;
  if (
    lastEvent
    && !forceEvent
    && daysSinceLastEvent < EVENT_SCHEDULER_CONFIG.minimumCooldownDays
  ) {
    return { event: null, rngState: input.rngState };
  }

  const eligible = events.filter((event) => {
    const occurrences = eventHistory.filter((entry) => entry.eventId === event.id);
    const previousOccurrence = occurrences[occurrences.length - 1];
    const minimumCooldown = Math.max(
      EVENT_SCHEDULER_CONFIG.minimumCooldownDays,
      event.cooldownDays,
    );
    return (ignoreMinimumDay || day >= event.minDay)
      && occurrences.length < event.maxOccurrences
      && (!event.requiredFlags || event.requiredFlags.every((flag) => flags.includes(flag)))
      && (ignorePreventedByFlags || !event.preventedByFlags?.some((flag) => flags.includes(flag)))
      && (
        forceEvent
        || !previousOccurrence
        || (elapsedMs - previousOccurrence.elapsedMs) / dayDurationMs >= minimumCooldown
      );
  });
  if (eligible.length === 0) return { event: null, rngState: input.rngState };

  const seenIds = new Set([
    ...eventHistory.flatMap((entry) => [entry.eventId, entry.sourceEventId]),
    ...seenEventIds,
  ].filter((id): id is string => Boolean(id)));
  const unencountered = eligible.filter((event) => !seenIds.has(event.id));
  // Independent Moon events are session-unique. Once every eligible event has
  // occurred, leave the scheduler idle instead of cycling back to old events.
  const candidates = unencountered;
  if (candidates.length === 0) return { event: null, rngState: input.rngState };

  let rngState = input.rngState;
  if (
    !forceEvent
    && selectionElapsedMs < EVENT_SCHEDULER_CONFIG.minimumIndependentEventElapsedMs
  ) {
    return { event: null, rngState: input.rngState };
  }
  // Story chapters do not gate independent Moon events. Once an event is
  // eligible and the global cooldown has passed, choose from the full pool;
  // only event readiness and preventive work can keep an event out.

  const weightedCandidates = candidates.map((event) => {
    const conditionRisk = event.affectedSystems.reduce(
      (total, system) => total + (100 - systemConditions[system]) / 100,
      0,
    ) / event.affectedSystems.length;
    const resourceRisk = event.riskResources.reduce(
      (total, resource) => total + (100 - resources[resource]) / 100,
      0,
    ) / event.riskResources.length;
    const decisionHistoryRisk = (
      (event.id === 'power_failure' || event.id === 'lunar_night')
      && (flags.includes('powerDebt') || flags.includes('batteryDrained'))
        ? 0.45
        : 0
    ) + (event.id === 'fire_lab' && flags.includes('labDamaged') ? 0.3 : 0)
      + (event.id === 'water_leak' && flags.includes('sparesLow') ? 0.3 : 0);
    const weight = event.baseWeight * (
      1 + conditionRisk * 0.65 + resourceRisk * 0.4 + decisionHistoryRisk
    );
    return { event, weight };
  });
  const totalWeight = weightedCandidates.reduce((total, entry) => total + entry.weight, 0);
  const selection = nextRandom(rngState);
  rngState = selection.state;
  let threshold = selection.value * totalWeight;
  for (const candidate of weightedCandidates) {
    threshold -= candidate.weight;
    if (threshold < 0) return { event: candidate.event, rngState };
  }

  return {
    event: weightedCandidates[weightedCandidates.length - 1].event,
    rngState,
  };
}

export function createRandomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
}
