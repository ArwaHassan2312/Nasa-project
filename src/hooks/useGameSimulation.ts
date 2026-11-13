import { useCallback, useEffect, useRef, useState } from 'react';
import { MOON_EVENTS, TASK_CONSEQUENCE_EVENTS } from '../data/moonEvents';
import type {
  Decision,
  GameEvent,
  ResourceKey,
  SurvivalResourceKey,
  SystemKey,
} from '../data/moonEvents';
import { DAILY_CHALLENGES } from '../data/dailyChallenges';
import type { DailyChallengeDefinition } from '../data/dailyChallenges';
import {
  createRandomSeed,
  EVENT_SCHEDULER_CONFIG,
  getIndependentEventWindowEndMs,
  selectMajorEvent,
} from './eventScheduler';
import type { EventOccurrence } from './eventScheduler';
import {
  BASELINE_DAILY_CONSUMPTION,
  excludeTaskEventSources,
  getUnresolvedEventOccurrenceIdsAtDayEnd,
  hasEventOccurredOnDay,
  removeEventOccurrence,
  getTaskCompletionResourceEffects,
  getHalfResourceRestoration,
  getSuccessfulEventResourceEffects,
  getTaskMissResourceEffects,
  getElapsedResourceEffects,
  findFailedEssentialResource,
  getResolvedLinkedTasks,
  selectUntriggeredCriticalTaskEvents,
  selectRandomDailyTaskDefinitions,
  settlePendingResourceEffects,
  startTaskOccurrence,
} from './taskLifecycle';

export type GameStatus = 'playing' | 'success' | 'failed';
export type ResourceLevels = Record<ResourceKey, number>;
export type EventPhase = 'idle' | 'pending' | 'presenting' | 'awaitingDecision' | 'resolving';
export type DayPhase = 'active' | 'closing' | 'report' | 'transition';
type DisplayResourceKey = 'power' | 'battery' | 'oxygen' | 'water' | 'food' | 'health' | 'science';

const VISITED_LOCATIONS_STORAGE_KEY = 'lunar-outpost-visited-locations-v1';
const GAME_PROGRESS_STORAGE_KEY = 'lunar-outpost-progress-v1';

function readVisitedLocationIds(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const saved = JSON.parse(window.localStorage.getItem(VISITED_LOCATIONS_STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveVisitedLocationIds(locationIds: string[]) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VISITED_LOCATIONS_STORAGE_KEY, JSON.stringify(locationIds));
    }
  } catch {
    // The in-memory visit state still works if browser storage is unavailable.
  }
}

export interface DayReport {
  day: number;
  completedTasks: string[];
  overdueTasks: string[];
  totalEvents: number;
  expiredEvents: number;
  eventOutcomes: EventOutcomeRecord[];
  resourceStart: Record<DisplayResourceKey, number>;
  resources: Record<DisplayResourceKey, number>;
  resourceChanges: Partial<Record<DisplayResourceKey, number>>;
}

export interface DecisionRecord {
  day: number;
  eventName: string;
  decisionLabel: string;
  lesson: string;
  futureConsequence: string;
  actualOutcome: string;
  resourceChanges?: Partial<Record<ResourceKey, number>>;
}

export interface GameSimulationOptions {
  enabled?: boolean;
  dayDurationMs?: number;
  seed?: number;
}

export type DailyChallengeStatus = 'available' | 'inProgress' | 'overdue' | 'completed';
export type CriticalTaskRecoveryStatus = 'available' | 'active' | 'completed' | 'expired' | null;
export interface DailyChallenge extends DailyChallengeDefinition {
  scheduledDay: number;
  status: DailyChallengeStatus;
  startedDay: number | null;
  completedDay: number | null;
  postponed: boolean;
  deadlineMissed: boolean;
  overdueEffectApplied: boolean;
  postponementEffectApplied: boolean;
  urgentStartedAtMs: number | null;
  urgentDeadlineAtMs: number | null;
  escalationAtMs: number | null;
  recoveryStatus: CriticalTaskRecoveryStatus;
  recoveryAttempted: boolean;
  recoveryDeadlineAtMs: number | null;
  recoveryResourceLosses: Partial<Record<ResourceKey, number>>;
  urgentConsequenceApplied: boolean;
  escalationApplied: boolean;
  targetComponentName: string;
  deadlineDay: number;
  completedAfterDeadline: boolean | null;
  responseTimeMs: number | null;
  emergencyPrevented: boolean;
  emergency: boolean;
  triggeredEventIds: string[];
}

export interface DailyChallengeCompletion {
  id: string;
  title: string;
  day: number;
  deadlineMissed: boolean;
  responseTimeMs: number | null;
  emergency: boolean;
  preventedEscalation: boolean;
}

export interface TaskMissionRecord {
  id: string;
  title: string;
  priority: DailyChallengeDefinition['priority'];
  status: DailyChallengeStatus;
  affectedSystem: SystemKey;
  day: number;
  emergency: boolean;
  completedAfterDeadline: boolean | null;
  responseTimeMs: number | null;
  emergencyPrevented: boolean;
  escalationApplied: boolean;
  targetComponentName: string;
  deadlineDay: number;
}

export type SystemConditions = Record<SystemKey, number>;

export interface SystemFaultRecord {
  day: number;
  system: SystemKey;
  kind: 'event' | 'overdue-task' | 'postponement' | 'secondary';
  reason: string;
  change: number;
}

export interface PostponementRecord {
  day: number;
  taskTitle: string;
  system: SystemKey;
  consequence: string;
}

export interface EventOutcomeRecord {
  occurrenceId: string;
  day: number;
  eventId: string;
  eventName: string;
  status: 'resolved' | 'failed' | 'expired';
  decision?: string;
  feedback: string;
  resourceChanges?: Partial<Record<ResourceKey, number>>;
}

interface GameState {
  commanderName: string;
  baseName: string;
  storyPaused: boolean;
  visitedLocationIds: string[];
  scienceNotebookIds: string[];
  missionLogEntries: { id: string; day: number; category: string; text: string }[];
  collectedIceSamples: { id: string; label: string; day: number }[];
  day: number;
  maxDays: number;
  dayPhase: DayPhase;
  dayReport: DayReport | null;
  dayElapsedMs: number;
  resourceElapsedMs: number;
  campaignElapsedMs: number;
  schedulerElapsedMs: number;
  eventDrainElapsedMs: number;
  rngState: number;
  resources: ResourceLevels;
  pendingResourceEffects: Partial<Record<ResourceKey, number>>;
  systemConditions: SystemConditions;
  currentEvent: GameEvent | null;
  queuedEvents: { event: GameEvent; drainElapsedMs: number; presented: boolean; deadlineAtMs: number | null }[];
  endOfDayEvents: GameEvent[];
  endOfDayNoticeHistory: GameEvent[];
  endOfDayNoticePresentationIds: string[];
  endOfDaySequenceFinished: boolean;
  eventPhase: EventPhase;
  eventEffectId: string | null;
  eventDeadlineAtMs: number | null;
  dayStartResources: ResourceLevels;
  eventFailureNotices: { id: string; day: number; name: string; feedback: string; changes: Partial<Record<ResourceKey, number>>; expired: boolean; status?: 'resolved' | 'failed' | 'expired'; decision?: string }[];
  expiredEventHistory: { day: number; occurrenceId: string }[];
  taskFailureNotices: { id: string; day: number; task: string; event: string; occurrenceId: string | undefined; presented: boolean }[];
  sceneReady: boolean;
  eventResolutionLocked: boolean;
  endOfDayCriticalTransition: boolean;
  flags: string[];
  gameStatus: GameStatus;
  failureReason: ResourceKey | null;
  decisionHistory: DecisionRecord[];
  eventHistory: EventOccurrence[];
  eventOutcomeHistory: EventOutcomeRecord[];
  independentEventHistory: EventOccurrence[];
  faultHistory: SystemFaultRecord[];
  postponementHistory: PostponementRecord[];
  dailyChallenges: DailyChallenge[];
  usedDailyChallengeIds: string[];
  activeChallengeId: string | null;
  challengeHistory: DailyChallengeCompletion[];
  taskMissionHistory: TaskMissionRecord[];
  challengeFeedback: string | null;
  warningTaskId: string | null;
}

function clearSavedGameState() {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(GAME_PROGRESS_STORAGE_KEY);
  } catch {
    // The new mission can still start without storage access.
  }
}


const MAX_RESOURCE_LEVEL = 100;
export const MISSION_FAILURE_RESOURCE_THRESHOLD = 10;
export const MISSION_LENGTH_DAYS = 15;
export const LUNAR_DAY_DURATION_MS = 300_000;
const DAY_TRANSITION_DURATION_MS = 5000;
const EVENT_RESPONSE_DURATION_MS = 60_000;
const CRITICAL_TASK_RECOVERY_DURATION_MS = 45_000;
const CLOCK_UPDATE_INTERVAL_MS = 1000;
const RESOURCE_DISPLAY_NAMES: Record<ResourceKey, string> = {
  power: 'Power', battery: 'Battery', oxygen: 'Oxygen', water: 'Water', food: 'Food',
  habitat: 'Crew safety', equipment: 'Crew safety', health: 'Crew safety',
  radProtection: 'Commander safety', comms: 'Power', science: 'Science',
  emergencyReserve: 'Water', potentialWater: 'Water',
};
const SYSTEM_DISPLAY_NAMES: Record<SystemKey, string> = {
  power: 'Power', lifeSupport: 'Air', water: 'Water', equipment: 'Outpost tools',
};
// Task completion toast stays on screen for this long before auto-dismissing.
const CHALLENGE_FEEDBACK_DURATION_MS = 3000;
const EVENT_OPTION_RESOURCES: SurvivalResourceKey[] = ['oxygen', 'water', 'power', 'food', 'health'];

function isEventOptionResource(resource: string): resource is SurvivalResourceKey {
  return EVENT_OPTION_RESOURCES.includes(resource as SurvivalResourceKey);
}

function eventOccurrenceKey(event: GameEvent | null | undefined): string | null {
  return event?.occurrenceId ?? (event ? `${event.id}-${event.day ?? 0}` : null);
}

function hasPendingCriticalTaskNotice(state: GameState): boolean {
  return state.taskFailureNotices.length > 0 || state.endOfDayNoticeHistory.length > 0;
}

function hasIndependentEventOccurredOnDay(state: GameState): boolean {
  return state.independentEventHistory.some((event) => event.day === state.day)
    || (state.currentEvent?.triggerSource === 'independent'
      && (state.currentEvent.day ?? state.day) === state.day)
    || state.queuedEvents.some(({ event }) => (
      event.triggerSource === 'independent' && (event.day ?? state.day) === state.day
    ));
}

function hasUnresolvedCriticalTaskEvent(tasks: DailyChallenge[]): boolean {
  return tasks.some((task) => task.status !== 'completed'
    && (task.recoveryStatus === 'available'
      || task.recoveryStatus === 'active'
      || task.recoveryStatus === 'expired')
    && TASK_CONSEQUENCE_EVENTS.some((event) => event.riskTaskIds?.includes(task.id)));
}

function getEventVisualId(event: GameEvent | null | undefined): string | null {
  return event?.sourceEventId ?? event?.id ?? null;
}

const INITIAL_RESOURCES: ResourceLevels = {
  power: 100,
  battery: 80,
  oxygen: 100,
  water: 100,
  food: 100,
  habitat: 100,
  equipment: 100,
  health: 100,
  radProtection: 100,
  comms: 100,
  science: 30,
  emergencyReserve: 60,
  potentialWater: 0,
};

function createDailyChallenges(
  day = 1,
  selectionSeed = day,
  usedTaskIds: string[] = [],
): DailyChallenge[] {
  const selectedChallenges = selectRandomDailyTaskDefinitions(
    DAILY_CHALLENGES,
    day,
    selectionSeed,
    usedTaskIds,
  );
  return selectedChallenges.map((challenge) => {
    return {
      ...challenge,
      scheduledDay: day,
      deadlineDay: day,
      status: 'available',
      startedDay: null,
      completedDay: null,
      postponed: false,
      deadlineMissed: false,
      overdueEffectApplied: false,
      postponementEffectApplied: false,
      urgentStartedAtMs: null,
      urgentDeadlineAtMs: null,
      escalationAtMs: null,
      recoveryStatus: null,
      recoveryAttempted: false,
      recoveryDeadlineAtMs: null,
      recoveryResourceLosses: {},
      urgentConsequenceApplied: false,
      escalationApplied: false,
      completedAfterDeadline: null,
      responseTimeMs: null,
      emergencyPrevented: false,
      emergency: challenge.emergency ?? false,
      triggeredEventIds: [],
    };
  });
}

export function createInitialState(seed: number): GameState {
  const initialChallenges = createDailyChallenges(1, seed);
  const initialState: GameState = {
    commanderName: 'Commander',
    baseName: 'Moonbase Alpha',
    storyPaused: false,
    visitedLocationIds: readVisitedLocationIds(),
    scienceNotebookIds: [],
    missionLogEntries: [],
    collectedIceSamples: [],
    day: 1,
    maxDays: MISSION_LENGTH_DAYS,
    dayPhase: 'active',
    dayReport: null,
    dayElapsedMs: 0,
    resourceElapsedMs: 0,
    campaignElapsedMs: 0,
    schedulerElapsedMs: 0,
    eventDrainElapsedMs: 0,
    rngState: seed >>> 0,
    resources: { ...INITIAL_RESOURCES },
    pendingResourceEffects: {},
    systemConditions: {
      power: 85,
      lifeSupport: 90,
      water: 88,
      equipment: 82,
    },
    currentEvent: null,
    queuedEvents: [],
    endOfDayEvents: [],
    endOfDayNoticeHistory: [],
    endOfDayNoticePresentationIds: [],
    endOfDaySequenceFinished: false,
    eventPhase: 'idle',
    eventEffectId: null,
    eventDeadlineAtMs: null,
    dayStartResources: { ...INITIAL_RESOURCES },
    eventFailureNotices: [],
    expiredEventHistory: [],
    taskFailureNotices: [],
    sceneReady: false,
    eventResolutionLocked: false,
    endOfDayCriticalTransition: false,
    flags: [],
    gameStatus: 'playing',
    failureReason: null,
    decisionHistory: [],
    eventHistory: [],
    eventOutcomeHistory: [],
    independentEventHistory: [],
    faultHistory: [],
    postponementHistory: [],
    dailyChallenges: initialChallenges,
    usedDailyChallengeIds: initialChallenges.map(({ id }) => id),
    activeChallengeId: null,
    challengeHistory: [],
    taskMissionHistory: [],
    challengeFeedback: null,
    warningTaskId: null,
  };
  return initialState;
}

function prepareEventForReadiness(
  event: GameEvent,
  flags: string[],
  systemConditions: SystemConditions,
): GameEvent {
  const readinessEventId = event.sourceEventId ?? event.id;
  const lowestRelevantCondition = Math.min(
    ...event.affectedSystems.map((system) => systemConditions[system]),
  );
  const severity: GameEvent['severity'] = lowestRelevantCondition <= EVENT_SCHEDULER_CONFIG.criticalSeverityCondition
    ? 'critical'
    : lowestRelevantCondition <= EVENT_SCHEDULER_CONFIG.elevatedSeverityCondition
      && (event.severity === 'low' || event.severity === 'medium')
      ? 'high'
      : event.severity;
  const isPrepared = (flag: string) => (
    event.preparationFlags.includes(flag) && flags.includes(flag)
  );
  const decisions = event.decisions.map((decision) => {
    if (
      readinessEventId === 'power_failure'
      && decision.id === 'B'
      && isPrepared('batteryReadinessVerified')
      && !flags.includes('batteryDrained')
    ) {
      return {
        ...decision,
        effects: { ...decision.effects, power: 8 },
        benefit: 'Power +8; the checked reserve helps',
        cost: 'Food -5',
      };
    }
    if (readinessEventId === 'power_failure' && decision.id === 'C' && flags.includes('powerDebt')) {
      return {
        ...decision,
        effects: { ...decision.effects, health: -8 },
        cost: 'Commander safety -8',
        risk: 'Existing power debt compounds the crisis',
      };
    }
    if (
      readinessEventId === 'fire_lab'
      && decision.id === 'B'
      && (isPrepared('workshopMaintenanceComplete') || isPrepared('habitatSealVerified'))
    ) {
      const effects = { ...decision.effects };
      const conditionEffects = { ...decision.conditionEffects };
      const benefits: string[] = [];
      if (isPrepared('workshopMaintenanceComplete')) {
        benefits.push('the workshop check limits further damage');
      }
      if (isPrepared('habitatSealVerified')) {
        if (conditionEffects.lifeSupport !== undefined) {
          conditionEffects.lifeSupport = Math.ceil(conditionEffects.lifeSupport / 2);
        }
        benefits.push('verified habitat seals limit oxygen loss');
      }
      return {
        ...decision,
        effects,
        conditionEffects,
        benefit: `Food +4; ${benefits.join('; ')}`,
        cost: 'Power -5',
      };
    }
    if (readinessEventId === 'water_leak' && decision.id === 'B' && isPrepared('waterLineInspected')) {
      return {
        ...decision,
        benefit: 'Water +25; the checked repair points help',
        cost: 'Power -8',
      };
    }
    if (
      readinessEventId === 'lunar_night'
      && decision.id === 'A'
      && isPrepared('batteryReadinessVerified')
      && !flags.includes('batteryDrained')
    ) {
      return {
        ...decision,
        effects: { ...decision.effects, power: 35 },
        benefit: 'Power +35; the checked reserve helps',
      };
    }
    if (
      readinessEventId === 'water_ice_exploration'
      && decision.id === 'A'
      && isPrepared('workshopMaintenanceComplete')
    ) {
      return {
        ...decision,
        conditionEffects: { ...decision.conditionEffects, equipment: -3 },
        benefit: 'Water +25; the outpost check makes ice collection safer',
        cost: 'Food -8',
      };
    }
    if (readinessEventId === 'solar_storm' && isPrepared('solarArrayInspected')) {
      const conditionEffects = { ...decision.conditionEffects };
      if (conditionEffects.power !== undefined && conditionEffects.power < 0) {
        conditionEffects.power = Math.ceil(conditionEffects.power / 2);
      }
      const effects = { ...decision.effects };
      if (effects.power !== undefined && effects.power < 0) {
        effects.power = Math.ceil(effects.power / 2);
      }
      return {
        ...decision,
        effects,
        conditionEffects,
        benefit: `${decision.benefit}; inspected array limits storm damage`,
      };
    }
    return decision;
  });

  return { ...event, severity, decisions };
}

function applyEffects(
  resources: ResourceLevels,
  effects: Partial<Record<ResourceKey, number>>,
): ResourceLevels {
  return applyIncidentEffects(resources, effects);
}

function roundResourceEffects(effects: Partial<Record<ResourceKey, number>>): Partial<Record<ResourceKey, number>> {
  return Object.fromEntries(Object.entries(effects).map(([resource, amount]) => (
    [resource, Math.sign(amount ?? 0) * Math.round(Math.abs(amount ?? 0))]
  ))) as Partial<Record<ResourceKey, number>>;
}

function applyIncidentEffects(
  resources: ResourceLevels,
  effects: Partial<Record<ResourceKey, number>>,
): ResourceLevels {
  const updated = { ...resources };
  for (const [resource, change] of Object.entries(effects) as [ResourceKey, number][]) {
    updated[resource] = Math.max(0, Math.min(MAX_RESOURCE_LEVEL,
      Math.trunc(updated[resource]) + Math.trunc(change)));
  }
  return updated;
}

function findFailedVital(resources: ResourceLevels): ResourceKey | null {
  return findFailedEssentialResource(resources, MISSION_FAILURE_RESOURCE_THRESHOLD) as ResourceKey | null;
}

function changeSystemCondition(
  conditions: SystemConditions,
  system: SystemKey,
  change: number,
): SystemConditions {
  return {
    ...conditions,
    [system]: Math.max(0, Math.min(MAX_RESOURCE_LEVEL, conditions[system] + change)),
  };
}

function applyConditionEffects(
  conditions: SystemConditions,
  effects: Partial<Record<SystemKey, number>>,
  affectedSystems: SystemKey[] = [],
): SystemConditions {
  let nextConditions = conditions;
  for (const [system, change] of Object.entries(effects) as [SystemKey, number][]) {
    const lowConditionMultiplier = change < 0
      && affectedSystems.includes(system)
      && nextConditions[system] < 40
      ? 1.25
      : 1;
    nextConditions = changeSystemCondition(
      nextConditions,
      system,
      change < 0 ? Math.floor(change * lowConditionMultiplier) : change,
    );
  }
  return nextConditions;
}

function applyDayStartConsequences(state: GameState, day: number): GameState {
  let systemConditions = state.systemConditions;
  const faultHistory = [...state.faultHistory];
  let challengeFeedback: string | null = state.challengeFeedback;
  const dailyChallenges = state.dailyChallenges.map((challenge) => {
    if (challenge.status === 'completed' || day <= challenge.deadlineDay) return challenge;

    let nextTask = challenge;
    if (!challenge.overdueEffectApplied) {
      const conditionBefore = systemConditions[challenge.affectedSystem];
      systemConditions = changeSystemCondition(
        systemConditions,
        challenge.affectedSystem,
        -challenge.overdueConditionLoss,
      );
      faultHistory.push({
        day,
        system: challenge.affectedSystem,
        kind: 'overdue-task',
        reason: `${challenge.title} passed its Day ${challenge.deadlineDay} deadline`,
        change: systemConditions[challenge.affectedSystem] - conditionBefore,
      });
      challengeFeedback = `${challenge.title} is overdue. ${challenge.affectedSystem} condition fell by ${challenge.overdueConditionLoss}.`;
      nextTask = { ...challenge, overdueEffectApplied: true, deadlineMissed: true };
    }
    return { ...nextTask, status: 'overdue' as const, deadlineMissed: true };
  });

  let nextState: GameState = {
    ...state,
    dailyChallenges,
    systemConditions,
    faultHistory,
    challengeFeedback,
  };
  const systemResource: Record<SystemKey, ResourceKey> = {
    power: 'power',
    lifeSupport: 'oxygen',
    water: 'water',
    equipment: 'equipment',
  };
  for (const system of Object.keys(systemResource) as SystemKey[]) {
    const relatedOverdueTask = dailyChallenges.find(
      (task) => task.affectedSystem === system && task.status === 'overdue',
    );
    const alreadyFailed = faultHistory.some(
      (fault) => fault.kind === 'secondary' && fault.system === system,
    );
    if (
      !alreadyFailed
      && relatedOverdueTask
      && systemConditions[system] <= 20
      && nextState.resources[systemResource[system]] <= 50
      && !faultHistory.some((fault) => fault.kind === 'secondary' && fault.day === day)
    ) {
      const amount = system === 'lifeSupport' ? 5 : 4;
      const conditionBefore = systemConditions[system];
      systemConditions = changeSystemCondition(systemConditions, system, -amount);
      const resources = applyEffects(nextState.resources, { [systemResource[system]]: -3 });
      faultHistory.push({
        day,
        system,
        kind: 'secondary',
        reason: `Secondary ${system} failure after ${relatedOverdueTask.title} remained overdue at critical condition`,
        change: systemConditions[system] - conditionBefore,
      });
      nextState = {
        ...nextState,
        resources,
        systemConditions,
        faultHistory,
        challengeFeedback: `A ${system} problem needs care: ${relatedOverdueTask.title} was still waiting. Use what you learned to act sooner next time.`,
      };
      const failedVital = findFailedVital(resources);
      if (failedVital) {
        nextState = { ...nextState, gameStatus: 'failed', failureReason: failedVital };
        return nextState;
      }
    }
  }

  return { ...nextState, systemConditions, faultHistory };
}

function applyTimedTaskConsequences(state: GameState): GameState {
  let resources = state.resources;
  let systemConditions = state.systemConditions;
  const faultHistory = [...state.faultHistory];
  let challengeFeedback = state.challengeFeedback;
  let gameStatus = state.gameStatus;
  let failureReason = state.failureReason;

  const dailyChallenges = state.dailyChallenges.map((challenge) => {
    if (challenge.status === 'completed') return challenge;
    let nextChallenge = challenge.recoveryStatus === 'active'
      && challenge.recoveryDeadlineAtMs !== null
      && state.campaignElapsedMs >= challenge.recoveryDeadlineAtMs
      ? { ...challenge, recoveryStatus: 'expired' as const, recoveryDeadlineAtMs: null }
      : challenge;

    if (
      nextChallenge.urgentDeadlineAtMs !== null
      && !nextChallenge.urgentConsequenceApplied
      && state.campaignElapsedMs >= nextChallenge.urgentDeadlineAtMs
    ) {
      if (!nextChallenge.overdueEffectApplied) {
        const systemBefore = systemConditions[nextChallenge.affectedSystem];
        systemConditions = changeSystemCondition(
          systemConditions,
          nextChallenge.affectedSystem,
          -(nextChallenge.urgentConditionLoss ?? nextChallenge.overdueConditionLoss),
        );
        faultHistory.push({
          day: state.day,
          system: nextChallenge.affectedSystem,
          kind: 'overdue-task',
          reason: `${nextChallenge.title} response deadline expired`,
          change: systemConditions[nextChallenge.affectedSystem] - systemBefore,
        });
      }
      const missedResourceEffects = nextChallenge.priority === 'high' || nextChallenge.priority === 'critical'
        ? nextChallenge.urgentResourceEffects ?? getTaskMissResourceEffects(nextChallenge)
        : {};
      const roundedMissedResourceEffects = roundResourceEffects(missedResourceEffects);
      const resourcesBeforeMiss = resources;
      resources = applyEffects(resources, roundedMissedResourceEffects);
      const canRecover = nextChallenge.priority === 'critical'
        && TASK_CONSEQUENCE_EVENTS.some((event) => event.riskTaskIds?.includes(nextChallenge.id))
        && nextChallenge.triggeredEventIds.length === 0;
      const recoveryResourceLosses = (Object.keys(roundedMissedResourceEffects) as ResourceKey[])
        .reduce((losses, resource) => {
          const lost = Math.max(0, resourcesBeforeMiss[resource] - resources[resource]);
          if (lost > 0) losses[resource] = lost;
          return losses;
        }, {} as Partial<Record<ResourceKey, number>>);
      challengeFeedback = canRecover
        ? `Time ran out for ${nextChallenge.title}, and some resources were used. Try the recovery job to win half back. The related problem will wait while you do.`
        : `${nextChallenge.title} is still waiting. ${nextChallenge.riskIfDelayed} You can try it sooner next time.`;
      nextChallenge = {
        ...nextChallenge,
        status: 'overdue',
        deadlineMissed: true,
        overdueEffectApplied: true,
        urgentConsequenceApplied: true,
        recoveryStatus: canRecover ? 'available' : nextChallenge.recoveryStatus,
        recoveryResourceLosses: canRecover ? recoveryResourceLosses : nextChallenge.recoveryResourceLosses,
      };
    }

    if (
      nextChallenge.status !== 'completed'
      && nextChallenge.urgentConsequenceApplied
      && !nextChallenge.escalationApplied
      && nextChallenge.escalationAtMs !== null
      && nextChallenge.recoveryStatus !== 'available'
      && nextChallenge.recoveryStatus !== 'active'
      && state.campaignElapsedMs >= nextChallenge.escalationAtMs
      && systemConditions[nextChallenge.affectedSystem]
        <= (nextChallenge.escalationConditionAtOrBelow ?? 0)
    ) {
      const systemBefore = systemConditions[nextChallenge.affectedSystem];
      systemConditions = changeSystemCondition(
        systemConditions,
        nextChallenge.affectedSystem,
        -(nextChallenge.escalationConditionLoss ?? 0),
      );
      const hasLinkedEvent = nextChallenge.priority === 'critical'
        && TASK_CONSEQUENCE_EVENTS.some((event) => event.riskTaskIds?.includes(nextChallenge.id));
      if (!hasLinkedEvent) {
        resources = applyEffects(resources, nextChallenge.escalationResourceEffects ?? {});
      }
      faultHistory.push({
        day: state.day,
        system: nextChallenge.affectedSystem,
        kind: 'secondary',
        reason: `Second-stage escalation: ${nextChallenge.title} remained unresolved`,
        change: systemConditions[nextChallenge.affectedSystem] - systemBefore,
      });
      challengeFeedback = `This emergency is getting worse: ${nextChallenge.title}. ${nextChallenge.riskIfDelayed}`;
      nextChallenge = { ...nextChallenge, escalationApplied: true };
    }

    return nextChallenge;
  });

  const awaitingRecoveryOrEvent = dailyChallenges.some((challenge) => (
    challenge.recoveryStatus === 'available'
    || challenge.recoveryStatus === 'active'
    || (challenge.status !== 'completed'
      && challenge.recoveryStatus === 'expired'
      && TASK_CONSEQUENCE_EVENTS.some((event) => event.riskTaskIds?.includes(challenge.id)))
  ));
  const failedVital = findFailedVital(resources);
  if (failedVital && !awaitingRecoveryOrEvent) {
    gameStatus = 'failed';
    failureReason = failedVital;
  }
  return {
    ...state,
    resources,
    systemConditions,
    faultHistory,
    challengeFeedback,
    gameStatus,
    failureReason,
    dailyChallenges,
  };
}

function createDayReport(state: GameState): GameState {
  if (state.gameStatus !== 'playing' || hasPendingCriticalTaskNotice(state)) return state;
  return {
    ...state,
    dayPhase: 'report',
    eventFailureNotices: [],
    challengeFeedback: null,
    dayReport: {
      day: state.day,
      completedTasks: state.dailyChallenges
        .filter((task) => task.status === 'completed')
        .map((task) => task.title),
      overdueTasks: state.dailyChallenges
        .filter((task) => task.status === 'overdue')
        .map((task) => task.title),
      totalEvents: state.eventHistory.filter((event) => event.day === state.day).length,
      expiredEvents: state.expiredEventHistory.filter((event) => event.day === state.day).length,
      eventOutcomes: state.eventOutcomeHistory.filter((event) => event.day === state.day),
      resourceStart: getVisibleResourceLevels(state.dayStartResources),
      resources: getVisibleResourceLevels(state.resources),
      resourceChanges: getResourceChanges(state.resources, state.dayStartResources),
    },
  };
}

function resumePendingDayReport(state: GameState): GameState {
  if (
    state.gameStatus !== 'playing'
    || state.dayPhase !== 'closing'
    || state.currentEvent
    || state.queuedEvents.length > 0
    || (state.endOfDayEvents.length > 0 && !state.endOfDaySequenceFinished)
    || hasPendingCriticalTaskNotice(state)
  ) return state;
  return createDayReport(state);
}

function getResourceChanges(
  resources: ResourceLevels,
  resourceStart: ResourceLevels,
): Partial<Record<DisplayResourceKey, number>> {
  return getVisibleResourceChanges(getVisibleResourceLevels(resources), getVisibleResourceLevels(resourceStart));
}

function getVisibleResourceChanges(
  currentVisible: Record<DisplayResourceKey, number>,
  startingVisible: Record<DisplayResourceKey, number>,
): Partial<Record<DisplayResourceKey, number>> {
  return (Object.keys(currentVisible) as DisplayResourceKey[]).reduce((changes, key) => {
    const change = currentVisible[key] - startingVisible[key];
    if (change !== 0) changes[key] = change;
    return changes;
  }, {} as Partial<Record<DisplayResourceKey, number>>);
}

function getVisibleResourceLevels(resources: ResourceLevels): Record<DisplayResourceKey, number> {
  return {
    power: resources.power,
    battery: resources.battery,
    oxygen: resources.oxygen,
    water: resources.water,
    food: resources.food,
    health: (resources.health + resources.habitat + resources.radProtection) / 3,
    science: resources.science,
  };
}

function refreshDayReportResources(state: GameState): GameState {
  if (!state.dayReport) return state;
  return {
    ...state,
    dayReport: {
      ...state.dayReport,
      resources: getVisibleResourceLevels(state.resources),
      resourceChanges: getVisibleResourceChanges(getVisibleResourceLevels(state.resources), state.dayReport.resourceStart),
    },
  };
}

function queueOverdueTaskEvents(state: GameState): GameState {
  const selectedEvents = selectUntriggeredCriticalTaskEvents(
    state.dailyChallenges.filter((task) => (
      task.recoveryStatus !== 'available' && task.recoveryStatus !== 'active'
    )),
    TASK_CONSEQUENCE_EVENTS,
    state.eventHistory,
    state.flags,
  );
  const triggeredEvents: GameEvent[] = selectedEvents.map(({ task, event: definition }) => (
    prepareEventForReadiness(
      {
        ...definition,
        day: state.day,
        situation: `Caused by the missed task “${task.title}”: ${definition.situation}`,
        triggerSource: 'task',
        occurrenceId: `task-${task.id}-${state.day}`,
      },
      state.flags,
      state.systemConditions,
    )
  ));

  if (triggeredEvents.length === 0) return state;

  const eventHistory = [
    ...state.eventHistory,
    ...triggeredEvents.map((event) => ({
      eventId: event.id,
      sourceEventId: event.sourceEventId,
      day: state.day,
      elapsedMs: state.campaignElapsedMs,
      source: 'task' as const,
      occurrenceId: event.occurrenceId,
    })),
  ];
  const taskFailureNotices = [
    ...state.taskFailureNotices,
    ...triggeredEvents.flatMap((event) => state.dailyChallenges
      .filter((task) => task.status === 'overdue' && event.riskTaskIds?.includes(task.id))
      .map((task) => ({
        id: `${task.id}-${state.day}`,
        day: state.day,
        task: task.title,
        event: event.name,
        occurrenceId: event.occurrenceId,
        presented: false,
      }))),
  ].filter((notice, index, all) => all.findIndex((entry) => entry.id === notice.id) === index);
  const dailyChallenges = state.dailyChallenges.map((task) => {
    const triggeredForTask = triggeredEvents
      .filter((event) => event.riskTaskIds?.includes(task.id))
      .map((event) => event.id);
    return triggeredForTask.length > 0
      ? { ...task, triggeredEventIds: [...new Set([...task.triggeredEventIds, ...triggeredForTask])] }
      : task;
  });
  const pendingResourceEffects = state.pendingResourceEffects;
  const resources = triggeredEvents.reduce(
    (current, event) => applyIncidentEffects(current, event.initialResourceEffects ?? {}),
    state.resources,
  );
  const failedVital = findFailedVital(resources);
  const taskEventPending = triggeredEvents.some((event) => event.triggerSource === 'task');
  if (state.currentEvent) {
    return {
      ...state,
      resources,
      pendingResourceEffects,
      ...(failedVital && !taskEventPending ? { gameStatus: 'failed' as const, failureReason: failedVital } : {}),
      queuedEvents: [
        ...state.queuedEvents,
        ...triggeredEvents.map((event) => ({
          event,
          drainElapsedMs: 0,
          presented: false,
          deadlineAtMs: state.campaignElapsedMs + EVENT_RESPONSE_DURATION_MS,
        })),
      ],
      eventHistory,
      taskFailureNotices,
      dailyChallenges,
      ...(state.dayPhase === 'closing' ? { eventResolutionLocked: true } : {}),
    };
  }

  const currentEvent = triggeredEvents[0];
  if (!currentEvent) return state;
  const queuedEvents = triggeredEvents.slice(1);
  return {
    ...state,
    resources,
    pendingResourceEffects,
    ...(failedVital && !taskEventPending ? { gameStatus: 'failed' as const, failureReason: failedVital } : {}),
    currentEvent,
    queuedEvents: [
      ...state.queuedEvents,
      ...queuedEvents.map((event) => ({
        event,
        drainElapsedMs: 0,
        presented: false,
        deadlineAtMs: state.campaignElapsedMs + EVENT_RESPONSE_DURATION_MS,
      })),
    ],
    eventPhase: 'pending',
    eventDrainElapsedMs: 0,
    eventEffectId: getEventVisualId(currentEvent),
    eventDeadlineAtMs: state.eventDeadlineAtMs,
    eventHistory,
    taskFailureNotices,
    dailyChallenges,
    ...(state.dayPhase === 'closing' ? { eventResolutionLocked: true } : {}),
  };
}

function triggerEndOfDayCriticalConsequences(state: GameState): GameState {
  const selectedEvents = selectUntriggeredCriticalTaskEvents(
    state.dailyChallenges,
    TASK_CONSEQUENCE_EVENTS,
    state.eventHistory,
    state.flags,
  );
  if (selectedEvents.length === 0) return state;
  const missedWithoutRecovery = selectedEvents.filter(({ task }) => !task.recoveryAttempted);
  const challengeFeedback = state.challengeFeedback
    && missedWithoutRecovery.some(({ task }) => state.challengeFeedback?.includes(task.title))
    ? null
    : state.challengeFeedback;

  const triggeredEvents = selectedEvents.map(({ task, event: definition }) => (
    prepareEventForReadiness({
      ...definition,
      day: state.day,
      situation: `Caused by the missed task “${task.title}”: ${definition.situation}`,
      triggerSource: 'task',
      endOfDayConsequence: true,
      missedTaskTitle: task.title,
      occurrenceId: `end-of-day-${task.id}-${state.day}`,
    }, state.flags, state.systemConditions)
  ));
  const pendingResourceEffects = state.pendingResourceEffects;
  let resources = state.resources;
  const eventResourceChanges = new Map<string, Partial<Record<ResourceKey, number>>>();
  for (const event of triggeredEvents) {
    const before = resources;
    resources = applyIncidentEffects(resources, roundResourceEffects(event.failureEffects));
    const changes = getVisibleResourceChanges(
      getVisibleResourceLevels(resources),
      getVisibleResourceLevels(before),
    );
    eventResourceChanges.set(event.occurrenceId ?? `${event.id}-${state.day}`, changes);
  }
  let systemConditions = state.systemConditions;
  const faultHistory = [...state.faultHistory];
  const eventHistory = [
    ...state.eventHistory,
    ...triggeredEvents.map((event) => ({
      eventId: event.id,
      sourceEventId: event.sourceEventId,
      day: state.day,
      elapsedMs: state.campaignElapsedMs,
      source: 'task' as const,
      occurrenceId: event.occurrenceId,
    })),
  ];
  const dailyChallenges = state.dailyChallenges.map((task) => {
    const triggeredForTask = triggeredEvents
      .filter((event) => event.riskTaskIds?.includes(task.id))
      .map((event) => event.id);
    return triggeredForTask.length > 0
      ? { ...task, triggeredEventIds: [...new Set([...task.triggeredEventIds, ...triggeredForTask])] }
      : task;
  });
  const eventOutcomeHistory = [...state.eventOutcomeHistory];
  for (const event of triggeredEvents) {
    const systemConditionsBeforeEvent = systemConditions;
    systemConditions = applyConditionEffects(
      systemConditions,
      event.failureConditionEffects ?? {},
      event.affectedSystems,
    );
    for (const system of Object.keys(event.failureConditionEffects ?? {}) as SystemKey[]) {
      const change = systemConditions[system] - systemConditionsBeforeEvent[system];
      if (change !== 0) {
        faultHistory.push({
          day: state.day,
          system,
          kind: 'event',
          reason: `${event.name} followed the missed Critical task “${event.missedTaskTitle}”.`,
          change,
        });
      }
    }
    eventOutcomeHistory.push({
      occurrenceId: event.occurrenceId ?? `${event.id}-${state.day}`,
      day: state.day,
      eventId: event.id,
      eventName: event.name,
      status: 'failed',
      feedback: `You couldn’t finish “${event.missedTaskTitle}” today, so ${event.name} happened. Next time, you can act sooner. ${event.failureFeedback}`,
      resourceChanges: eventResourceChanges.get(event.occurrenceId ?? `${event.id}-${state.day}`),
    });
  }

  const failedVital = findFailedVital(resources);
  return {
    ...state,
    resources,
    pendingResourceEffects,
    systemConditions,
    faultHistory,
    eventHistory,
    challengeFeedback,
    eventOutcomeHistory,
    dailyChallenges,
    endOfDayEvents: triggeredEvents,
    endOfDayNoticeHistory: [
      ...state.endOfDayNoticeHistory,
      ...triggeredEvents.filter((event) => !state.endOfDayNoticeHistory.some(
        (existing) => eventOccurrenceKey(existing) === eventOccurrenceKey(event),
      )),
    ],
    endOfDaySequenceFinished: false,
    ...(failedVital ? { gameStatus: 'failed' as const, failureReason: failedVital } : {}),
  };
}

function failEventOccurrence(state: GameState, occurrenceId: string, expired = false): GameState {
  const removedOccurrence = removeEventOccurrence(state.currentEvent, state.queuedEvents, occurrenceId);
  const { isCurrent, event } = removedOccurrence;
  if (!event) return state;
  const resources = applyIncidentEffects(state.resources, event.failureEffects);
  const pendingResourceEffects = state.pendingResourceEffects;
  const systemConditions = applyConditionEffects(
    state.systemConditions,
    event.failureConditionEffects ?? {},
    event.affectedSystems,
  );
  const changes = getVisibleResourceChanges(
    getVisibleResourceLevels(resources),
    getVisibleResourceLevels(state.resources),
  );
  const remainingQueuedEvents = removedOccurrence.queuedEvents;
  const nextQueued = isCurrent ? remainingQueuedEvents[0] : undefined;
  const restQueuedEvents = isCurrent ? remainingQueuedEvents.slice(1) : remainingQueuedEvents;
  const faultHistory = [
    ...state.faultHistory,
    ...(Object.keys(event.failureConditionEffects ?? {}) as SystemKey[])
      .map((system) => ({
        system,
        change: systemConditions[system] - state.systemConditions[system],
      }))
      .filter(({ change }) => change !== 0)
      .map(({ system, change }) => ({
        day: event.day ?? state.day,
        system,
        kind: 'event' as const,
        reason: `${event.name} failed: ${event.failureFeedback}`,
        change,
      })),
  ];
  let next: GameState = {
    ...state,
    resources,
    pendingResourceEffects,
    systemConditions,
    faultHistory,
    currentEvent: isCurrent ? nextQueued?.event ?? null : state.currentEvent,
    queuedEvents: isCurrent ? restQueuedEvents : remainingQueuedEvents,
    eventPhase: isCurrent
      ? nextQueued ? (nextQueued.presented ? 'awaitingDecision' : 'pending') : 'idle'
      : state.eventPhase,
    eventDrainElapsedMs: isCurrent ? nextQueued?.drainElapsedMs ?? 0 : state.eventDrainElapsedMs,
    eventEffectId: isCurrent ? getEventVisualId(nextQueued?.event) : state.eventEffectId,
    eventDeadlineAtMs: isCurrent ? nextQueued?.deadlineAtMs ?? null : state.eventDeadlineAtMs,
    eventFailureNotices: state.eventFailureNotices.some((notice) => (
      notice.id === (eventOccurrenceKey(event) ?? `${event.id}-${state.day}-${state.campaignElapsedMs}`)
    ))
      ? state.eventFailureNotices
      : [...state.eventFailureNotices, {
        id: eventOccurrenceKey(event) ?? `${event.id}-${state.day}-${state.campaignElapsedMs}`,
        day: event.day ?? state.day,
        name: event.name,
        feedback: event.failureFeedback,
        changes,
        expired,
        status: expired ? 'expired' : 'failed',
      }],
    eventOutcomeHistory: [...state.eventOutcomeHistory, {
      occurrenceId: eventOccurrenceKey(event) ?? `${event.id}-${state.day}`,
      day: event.day ?? state.day,
      eventId: event.id,
      eventName: event.name,
      status: expired ? 'expired' : 'failed',
      feedback: event.failureFeedback,
      resourceChanges: changes,
    }],
    ...(expired ? { expiredEventHistory: [...state.expiredEventHistory, {
      day: event.day ?? state.day,
      occurrenceId: eventOccurrenceKey(event) ?? `${event.id}-${state.day}`,
    }] } : {}),
  };
  const failedVital = findFailedVital(resources);
  if (failedVital) next = { ...next, gameStatus: 'failed', failureReason: failedVital };
  if (
    next.dayPhase === 'closing'
    && !next.currentEvent
    && next.queuedEvents.length === 0
    && (next.endOfDayEvents.length === 0 || next.endOfDaySequenceFinished)
  ) {
    next = createDayReport(next);
  }
  return next;
}

function failCurrentEvent(state: GameState, expectedOccurrenceId?: string, expired = false): GameState {
  const occurrenceId = expectedOccurrenceId ?? eventOccurrenceKey(state.currentEvent);
  return occurrenceId ? failEventOccurrence(state, occurrenceId, expired) : state;
}

function expireUnresolvedEventsAtDayEnd(state: GameState): GameState {
  let nextState = state;
  if (nextState.currentEvent && nextState.eventPhase === 'resolving') {
    const [nextQueued, ...remainingQueued] = nextState.queuedEvents;
    nextState = {
      ...nextState,
      currentEvent: nextQueued?.event ?? null,
      queuedEvents: remainingQueued,
      eventPhase: nextQueued ? (nextQueued.presented ? 'awaitingDecision' : 'pending') : 'idle',
      eventDrainElapsedMs: nextQueued?.drainElapsedMs ?? 0,
      eventEffectId: getEventVisualId(nextQueued?.event),
      eventDeadlineAtMs: nextQueued?.deadlineAtMs ?? null,
    };
  }

  const occurrenceIds = getUnresolvedEventOccurrenceIdsAtDayEnd(
    nextState.currentEvent,
    nextState.queuedEvents,
    nextState.eventPhase,
  );
  for (const occurrenceId of occurrenceIds) {
    nextState = failEventOccurrence(nextState, occurrenceId, true);
  }
  return nextState;
}

function beginDayClosing(state: GameState, dayDurationMs: number): GameState {
  if (state.dayPhase !== 'active') return state;
  state = expireUnresolvedEventsAtDayEnd(state);
  const criticalTaskInProgress = state.dailyChallenges.some((task) => (
    task.priority === 'critical' && task.status !== 'completed'
  ));

  let resources = state.resources;
  const existingFailure = findFailedVital(resources);

  const faultHistory = [...state.faultHistory];
  let systemConditions = state.systemConditions;
  const dailyChallenges = state.dailyChallenges.map((task) => {
    if (task.status === 'completed') return task;
    if (!task.overdueEffectApplied) {
      const before = systemConditions[task.affectedSystem];
      systemConditions = changeSystemCondition(
        systemConditions,
        task.affectedSystem,
        -task.overdueConditionLoss,
      );
      faultHistory.push({
        day: state.day,
        system: task.affectedSystem,
        kind: 'overdue-task',
        reason: `${task.title} was not completed by the end of Day ${state.day}`,
        change: systemConditions[task.affectedSystem] - before,
      });
    }
    const taskMissEffects = getTaskMissResourceEffects(task);
    resources = applyEffects(resources, task.priority === 'critical'
      ? roundResourceEffects(taskMissEffects)
      : taskMissEffects);
    return {
      ...task,
      status: 'overdue' as const,
      deadlineMissed: true,
      overdueEffectApplied: true,
      ...(task.priority === 'critical' ? {
        recoveryStatus: 'expired' as const,
        recoveryDeadlineAtMs: null,
      } : {}),
    };
  });
  let closingState: GameState = {
    ...state,
    dayPhase: 'closing',
    ...(existingFailure ? { gameStatus: 'failed' as const, failureReason: existingFailure } : {}),
    endOfDayCriticalTransition: criticalTaskInProgress,
    eventResolutionLocked: false,
    dayElapsedMs: dayDurationMs,
    resources,
    dailyChallenges,
    systemConditions,
    faultHistory,
  };
  const taskMissFailure = findFailedVital(resources);
  if (taskMissFailure) {
    closingState = { ...closingState, gameStatus: 'failed', failureReason: taskMissFailure };
  }
  const systemResources: Record<SystemKey, ResourceKey> = {
    power: 'power',
    lifeSupport: 'oxygen',
    water: 'water',
    equipment: 'equipment',
  };
  for (const system of Object.keys(systemResources) as SystemKey[]) {
    if (closingState.gameStatus !== 'playing') break;
    const overdueTask = closingState.dailyChallenges.find((task) => (
      task.status === 'overdue' && task.affectedSystem === system
    ));
    if (
      !overdueTask
      || closingState.systemConditions[system] > 20
      || closingState.resources[systemResources[system]] > 50
      || closingState.faultHistory.some((fault) => (
        fault.kind === 'secondary' && fault.system === system
      ))
    ) continue;

    const conditionLoss = system === 'lifeSupport' ? 5 : 4;
    const before = closingState.systemConditions[system];
    const systemConditions = changeSystemCondition(
      closingState.systemConditions,
      system,
      -conditionLoss,
    );
    const resources = applyEffects(closingState.resources, {
      [systemResources[system]]: -3,
    });
    closingState = {
      ...closingState,
      resources,
      systemConditions,
      faultHistory: [
        ...closingState.faultHistory,
        {
          day: state.day,
          system,
          kind: 'secondary',
          reason: `Secondary ${system} fault after ${overdueTask.title} remained overdue at critical condition`,
          change: systemConditions[system] - before,
        },
      ],
    };
    const failedVital = findFailedVital(resources);
    if (failedVital) {
      closingState = { ...closingState, gameStatus: 'failed', failureReason: failedVital };
      break;
    }
  }
  closingState = triggerEndOfDayCriticalConsequences(closingState);
  const settledResources = settlePendingResourceEffects(
    closingState.resources,
    closingState.pendingResourceEffects,
  );
  const closingFailure = findFailedVital(settledResources.resources);
  closingState = {
    ...closingState,
    ...settledResources,
    ...(closingFailure ? { gameStatus: 'failed', failureReason: closingFailure } : {}),
  };
  return closingState.currentEvent
    || closingState.queuedEvents.length > 0
    || closingState.endOfDayEvents.length > 0
    ? closingState
    : createDayReport(closingState);
}

function createNextDayChallenges(
  day: number,
  selectionSeed: number,
  usedTaskIds: string[],
): DailyChallenge[] {
  return createDailyChallenges(day, selectionSeed, usedTaskIds);
}

export function advanceClockState(
  initialState: GameState,
  elapsedMs: number,
  dayDurationMs: number,
): GameState {
  let nextState = initialState;
  if (nextState.storyPaused) return nextState;
  if (nextState.dayPhase === 'transition') return nextState;
  let remainingMs = elapsedMs;

  while (
    remainingMs > 0
    && nextState.gameStatus === 'playing'
    && !nextState.warningTaskId
  ) {
    // Task and event notices are non-blocking UI; their visibility must never
    // pause the lunar day or the independent task/event clocks.
    const criticalNoticeOpen = false;
    const dayClockPaused = false;
    const untilDayEnd = nextState.dayPhase === 'active' && !dayClockPaused
      ? Math.max(0, dayDurationMs - nextState.dayElapsedMs)
      : Number.POSITIVE_INFINITY;
    const independentWindowEndMs = getIndependentEventWindowEndMs(dayDurationMs);
    const untilIndependentWindowEnd = nextState.dayPhase === 'active'
      && !dayClockPaused
      && nextState.dayElapsedMs < independentWindowEndMs
      ? independentWindowEndMs - nextState.dayElapsedMs
      : Number.POSITIVE_INFINITY;
    // Scheduler boundaries only gate gameplay while the day is active. If the
    // day ends on the same tick as a scheduler check, carrying a zero interval
    // into `closing` makes the clock loop spin forever while queued incidents
    // resolve, which appears as a freeze just before the report.
    const untilSchedulerCheck = nextState.dayPhase === 'active'
      && !criticalNoticeOpen
      && nextState.dayElapsedMs < independentWindowEndMs
      && !hasIndependentEventOccurredOnDay(nextState)
      ? Math.max(0, EVENT_SCHEDULER_CONFIG.checkIntervalMs - nextState.schedulerElapsedMs)
      : Number.POSITIVE_INFINITY;
    const untilTaskTransition = nextState.dayPhase === 'active' && !criticalNoticeOpen
      ? nextState.dailyChallenges.reduce((nearest, challenge) => {
      if (challenge.status === 'completed') return nearest;
      const transitionAt = challenge.recoveryStatus === 'active'
        ? challenge.recoveryDeadlineAtMs
        : !challenge.urgentConsequenceApplied
          ? challenge.urgentDeadlineAtMs
        : !challenge.escalationApplied
          ? challenge.escalationAtMs
          : null;
      if (transitionAt === null) return nearest;
      const remaining = transitionAt - nextState.campaignElapsedMs;
      return remaining > 0 ? Math.min(nearest, remaining) : nearest;
      }, Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;
    const eventDeadlines = [
      nextState.eventDeadlineAtMs,
      ...nextState.queuedEvents.map((queued) => queued.deadlineAtMs),
    ].filter((deadline): deadline is number => deadline !== null);
    const untilEventTimeout = !criticalNoticeOpen && eventDeadlines.length > 0
      ? Math.max(0, Math.min(...eventDeadlines) - nextState.campaignElapsedMs)
      : Number.POSITIVE_INFINITY;
    const step = Math.min(
      remainingMs,
      CLOCK_UPDATE_INTERVAL_MS,
      untilDayEnd,
      untilIndependentWindowEnd,
      untilSchedulerCheck,
      untilTaskTransition,
      untilEventTimeout,
    );
    const previousResourceElapsedMs = nextState.resourceElapsedMs;
    nextState = {
      ...nextState,
      dayElapsedMs: nextState.dayPhase === 'active' && !dayClockPaused
        ? nextState.dayElapsedMs + step
        : nextState.dayElapsedMs,
      resourceElapsedMs: nextState.dayPhase === 'active'
        ? nextState.resourceElapsedMs + step
        : nextState.resourceElapsedMs,
      campaignElapsedMs: nextState.campaignElapsedMs + (criticalNoticeOpen ? 0 : step),
      schedulerElapsedMs: nextState.dayPhase === 'active' && !criticalNoticeOpen
        ? nextState.schedulerElapsedMs + step
        : nextState.schedulerElapsedMs,
    };
    remainingMs -= step;

    // Baseline consumption accumulates gradually over the lunar day. During
    // the story's long-night stretch, solar power is unavailable, so the base
    // draws a little extra power and uses stored battery energy.
    const dailyResourceUse = nextState.day >= 8 && nextState.day < 10
      ? { ...BASELINE_DAILY_CONSUMPTION, power: BASELINE_DAILY_CONSUMPTION.power - 1, battery: -2 }
      : BASELINE_DAILY_CONSUMPTION;
    const eventDrains: Partial<Record<ResourceKey, number>> = nextState.dayPhase === 'active'
      ? getElapsedResourceEffects(
        dailyResourceUse,
        previousResourceElapsedMs,
        nextState.resourceElapsedMs,
        dayDurationMs,
      )
      : {};
    const activeEvent = nextState.currentEvent;
    if (!criticalNoticeOpen && activeEvent && nextState.eventPhase !== 'resolving'
      && activeEvent.ongoingEffectIntervalMs && activeEvent.ongoingResourceEffects) {
      const totalElapsedMs = nextState.eventDrainElapsedMs + step;
      const impactSteps = Math.floor(totalElapsedMs / activeEvent.ongoingEffectIntervalMs);
      nextState = {
        ...nextState,
        eventDrainElapsedMs: totalElapsedMs - impactSteps * activeEvent.ongoingEffectIntervalMs,
      };
      if (impactSteps > 0) {
        for (const [resource, loss] of Object.entries(activeEvent.ongoingResourceEffects) as [ResourceKey, number][]) {
          eventDrains[resource] = (eventDrains[resource] ?? 0) + loss * impactSteps;
        }
      }
    }
    if (!criticalNoticeOpen) nextState = {
      ...nextState,
      queuedEvents: nextState.queuedEvents.map((queued) => {
        const { ongoingEffectIntervalMs, ongoingResourceEffects } = queued.event;
        if (!ongoingEffectIntervalMs || !ongoingResourceEffects) return queued;
        const totalElapsedMs = queued.drainElapsedMs + step;
        const impactSteps = Math.floor(totalElapsedMs / ongoingEffectIntervalMs);
        if (impactSteps > 0) {
          for (const [resource, loss] of Object.entries(ongoingResourceEffects) as [ResourceKey, number][]) {
            eventDrains[resource] = (eventDrains[resource] ?? 0) + loss * impactSteps;
          }
        }
        return {
          ...queued,
          drainElapsedMs: totalElapsedMs - impactSteps * ongoingEffectIntervalMs,
        };
      }),
    };
    const pendingResourceEffects = { ...nextState.pendingResourceEffects };
    for (const [resource, pendingChange] of Object.entries(pendingResourceEffects) as [ResourceKey, number][]) {
      if (pendingChange === 0) {
        delete pendingResourceEffects[resource];
        continue;
      }
      if (pendingChange < 0 && nextState.resources[resource] <= 0) {
        delete pendingResourceEffects[resource];
        continue;
      }
      if (eventDrains[resource]) continue;
      const appliedChange = Math.sign(pendingChange);
      eventDrains[resource] = appliedChange;
      const remaining = pendingChange - appliedChange;
      if (remaining === 0) delete pendingResourceEffects[resource];
      else pendingResourceEffects[resource] = remaining;
    }
    nextState = { ...nextState, pendingResourceEffects };
    if (Object.keys(eventDrains).length > 0) {
      const resources = applyEffects(nextState.resources, eventDrains);
      const failedVital = findFailedVital(resources);
      nextState = {
        ...nextState,
        resources,
        ...(failedVital && !hasUnresolvedCriticalTaskEvent(nextState.dailyChallenges)
          ? { gameStatus: 'failed' as const, failureReason: failedVital }
          : {}),
      };
      nextState = refreshDayReportResources(nextState);
      if (nextState.gameStatus !== 'playing') return nextState;
    }

    if (nextState.dayPhase === 'active' && !criticalNoticeOpen) {
      nextState = applyTimedTaskConsequences(nextState);
      if (nextState.dayElapsedMs < dayDurationMs) {
        nextState = queueOverdueTaskEvents(nextState);
      }
    }
    if (nextState.gameStatus !== 'playing') return nextState;

    const expiredEventIds = criticalNoticeOpen ? [] : [
      ...(nextState.currentEvent
        && nextState.eventPhase !== 'resolving'
        && nextState.eventDeadlineAtMs !== null
        && nextState.campaignElapsedMs >= nextState.eventDeadlineAtMs
        ? [eventOccurrenceKey(nextState.currentEvent)] : []),
      ...nextState.queuedEvents
        .filter((queued) => queued.deadlineAtMs !== null
          && nextState.campaignElapsedMs >= queued.deadlineAtMs)
        .map(({ event }) => eventOccurrenceKey(event)),
    ].filter((id): id is string => id !== null);
    for (const occurrenceId of expiredEventIds) {
      nextState = failEventOccurrence(nextState, occurrenceId, true);
    }

    if (nextState.dayPhase === 'active' && nextState.dayElapsedMs >= dayDurationMs) {
      nextState = beginDayClosing(nextState, dayDurationMs);
      if (nextState.gameStatus !== 'playing') return nextState;
      if (nextState.dayPhase === 'report') return nextState;
    }

    if (
      nextState.dayPhase === 'closing'
      && !nextState.currentEvent
      && nextState.queuedEvents.length === 0
      && (nextState.endOfDayEvents.length === 0 || nextState.endOfDaySequenceFinished)
    ) return createDayReport(nextState);

    if (nextState.dayPhase === 'active'
      && nextState.dayElapsedMs < independentWindowEndMs
      && !hasIndependentEventOccurredOnDay(nextState)
      && nextState.schedulerElapsedMs >= EVENT_SCHEDULER_CONFIG.checkIntervalMs) {
      nextState = { ...nextState, schedulerElapsedMs: 0 };
      const selection = selectMajorEvent({
        events: excludeTaskEventSources(
          MOON_EVENTS,
          TASK_CONSEQUENCE_EVENTS,
          nextState.dailyChallenges,
        ),
        day: nextState.day,
        maxDays: nextState.maxDays,
        dayDurationMs,
        elapsedMs: nextState.campaignElapsedMs,
        independentElapsedMs: nextState.dayElapsedMs,
        rngState: nextState.rngState,
        flags: nextState.flags,
        systemConditions: nextState.systemConditions,
        resources: nextState.resources,
        eventHistory: nextState.independentEventHistory,
        seenEventIds: nextState.eventHistory.flatMap((entry) => (
          [entry.eventId, entry.sourceEventId].filter((id): id is string => Boolean(id))
        )),
        ignorePreventedByFlags: true,
      }, EVENT_SCHEDULER_CONFIG.checkIntervalMs);
      nextState = { ...nextState, rngState: selection.rngState };
      if (selection.event) {
        const event = prepareEventForReadiness(
          {
            ...selection.event,
            day: nextState.day,
            triggerSource: 'independent',
            occurrenceId: `independent-${nextState.day}-${nextState.independentEventHistory.length + 1}`,
          },
          nextState.flags,
          nextState.systemConditions,
        );
        const resources = applyIncidentEffects(
          nextState.resources,
          event.initialResourceEffects ?? {},
        );
        const failedVital = findFailedVital(resources);
        nextState = {
          ...nextState,
          pendingResourceEffects: nextState.pendingResourceEffects,
          resources,
          ...(failedVital ? { gameStatus: 'failed', failureReason: failedVital } : {}),
          ...(nextState.currentEvent
            ? {
              queuedEvents: [...nextState.queuedEvents, {
                event,
                drainElapsedMs: 0,
                presented: false,
                deadlineAtMs: nextState.campaignElapsedMs + EVENT_RESPONSE_DURATION_MS,
              }],
            }
            : {
              currentEvent: event,
              eventPhase: 'pending' as const,
              eventDrainElapsedMs: 0,
              eventEffectId: getEventVisualId(event),
              eventDeadlineAtMs: null,
            }),
          eventHistory: [
            ...nextState.eventHistory,
            {
              eventId: event.id,
              day: nextState.day,
              elapsedMs: nextState.campaignElapsedMs,
              source: 'independent',
              occurrenceId: event.occurrenceId,
            },
          ],
          independentEventHistory: [
            ...nextState.independentEventHistory,
            {
              eventId: event.id,
              day: nextState.day,
              elapsedMs: nextState.campaignElapsedMs,
              source: 'independent',
              occurrenceId: event.occurrenceId,
            },
          ],
          ...(nextState.dayPhase === 'closing' ? { eventResolutionLocked: true } : {}),
        };
        return nextState;
      }
    }
  }

  return nextState;
}

export function useGameSimulation({
  enabled = true,
  dayDurationMs = LUNAR_DAY_DURATION_MS,
  seed,
}: GameSimulationOptions = {}) {
  const [state, setState] = useState<GameState>(() => createInitialState(seed ?? createRandomSeed()));

  useEffect(() => {
    clearSavedGameState();
  }, []);

  const setSceneReady = useCallback((ready: boolean) => {
    setState((current) => current.sceneReady === ready ? current : { ...current, sceneReady: ready });
  }, []);

  const setMissionProfile = useCallback((profile: { commanderName?: string; baseName?: string }) => {
    setState((current) => ({
      ...current,
      commanderName: profile.commanderName?.trim() || current.commanderName,
      baseName: profile.baseName?.trim() || current.baseName,
    }));
  }, []);

  const setStoryPaused = useCallback((paused: boolean) => {
    setState((current) => current.storyPaused === paused ? current : { ...current, storyPaused: paused });
  }, []);

  const markLocationVisited = useCallback((locationId: string, locationName: string) => {
    const persistedLocationIds = readVisitedLocationIds();
    if (!persistedLocationIds.includes(locationId)) {
      saveVisitedLocationIds([...persistedLocationIds, locationId]);
    }
    setState((current) => current.visitedLocationIds.includes(locationId) ? current : {
      ...current,
      visitedLocationIds: [...current.visitedLocationIds, locationId],
      missionLogEntries: [...current.missionLogEntries, {
        id: `location-${locationId}-${current.day}`,
        day: current.day,
        category: 'Location',
        text: `Day ${current.day}: First visit to ${locationName}.`,
      }],
    });
  }, []);

  const unlockScienceDiscovery = useCallback((discoveryId: string, title: string) => {
    setState((current) => current.scienceNotebookIds.includes(discoveryId) ? current : {
      ...current,
      scienceNotebookIds: [...current.scienceNotebookIds, discoveryId],
      missionLogEntries: [...current.missionLogEntries, {
        id: `discovery-${discoveryId}`,
        day: current.day,
        category: 'Discovery',
        text: `Day ${current.day}: New discovery added to the Science Notebook — ${title}.`,
      }],
    });
  }, []);

  const addMissionLogEntry = useCallback((text: string, category = 'Mission') => {
    setState((current) => ({
      ...current,
      missionLogEntries: [...current.missionLogEntries, {
        id: `${category}-${current.day}-${current.campaignElapsedMs}-${current.missionLogEntries.length}`,
        day: current.day,
        category,
        text,
      }],
    }));
  }, []);

  const collectIceSample = useCallback((sampleId: string, label: string) => {
    setState((current) => {
      if (current.day < 11 || current.dayPhase !== 'active'
        || current.collectedIceSamples.some((sample) => sample.id === sampleId)) return current;
      return {
        ...current,
        resources: applyEffects(current.resources, { science: 3 }),
        collectedIceSamples: [...current.collectedIceSamples, { id: sampleId, label, day: current.day }],
        missionLogEntries: [...current.missionLogEntries, {
          id: `sample-${sampleId}`,
          day: current.day,
          category: 'Sample',
          text: `Day ${current.day}: Rover sample collected — ${label}. Science +3.`,
        }],
      };
    });
  }, []);

  const advanceClock = useCallback((elapsedMs: number) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.storyPaused ||
        currentState.dayPhase === 'transition' ||
        currentState.warningTaskId ||
        !Number.isFinite(dayDurationMs) ||
        dayDurationMs <= 0
      ) {
        return currentState;
      }
      return advanceClockState(currentState, elapsedMs, dayDurationMs);
    });
  }, [dayDurationMs]);

  useEffect(() => {
    if (
      !enabled || !state.sceneReady || state.storyPaused ||
      state.gameStatus !== 'playing' ||
      state.dayPhase === 'transition' ||
      state.warningTaskId ||
      !Number.isFinite(dayDurationMs) ||
      dayDurationMs <= 0
    ) {
      return undefined;
    }

    let previousTime = performance.now();
    const timerId = window.setInterval(() => {
      const currentTime = performance.now();
      const elapsedMs = currentTime - previousTime;
      previousTime = currentTime;
      if (document.visibilityState === 'visible' && elapsedMs > 0) {
        advanceClock(elapsedMs);
      }
    }, CLOCK_UPDATE_INTERVAL_MS);
    const resetClockBaseline = () => {
      previousTime = performance.now();
    };
    document.addEventListener('visibilitychange', resetClockBaseline);
    return () => {
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', resetClockBaseline);
    };
  }, [
    advanceClock,
    dayDurationMs,
    enabled,
    state.gameStatus,
    state.dayPhase,
    state.warningTaskId,
    state.sceneReady,
    state.storyPaused,
  ]);

  useEffect(() => {
    if (
      state.dayPhase !== 'closing'
      || state.endOfDayEvents.length === 0
      || state.endOfDaySequenceFinished
    ) return undefined;
    const closingDay = state.day;
    const timerId = window.setTimeout(() => {
      setState((currentState) => {
        if (
          currentState.day !== closingDay
          || currentState.dayPhase !== 'closing'
          || currentState.endOfDaySequenceFinished
        ) return currentState;
        let nextState: GameState = { ...currentState, endOfDaySequenceFinished: true };
        if (
          nextState.gameStatus === 'playing'
          && !nextState.currentEvent
          && nextState.queuedEvents.length === 0
        ) nextState = createDayReport(nextState);
        return nextState;
      });
    }, 2000);
    return () => window.clearTimeout(timerId);
  }, [state.day, state.dayPhase, state.endOfDayEvents.length, state.endOfDaySequenceFinished]);

  useEffect(() => {
    if (state.dayPhase !== 'transition') return undefined;
    const transitionDay = state.day;
    const timerId = window.setTimeout(() => {
      setState((currentState) => (
        currentState.dayPhase === 'transition' && currentState.day === transitionDay
          ? { ...currentState, dayPhase: 'active', dayElapsedMs: 0, schedulerElapsedMs: 0 }
          : currentState
      ));
    }, DAY_TRANSITION_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [dayDurationMs, state.day, state.dayPhase]);

  useEffect(() => {
    if (!state.eventResolutionLocked || state.eventPhase !== 'awaitingDecision') return undefined;
    const occurrenceId = eventOccurrenceKey(state.currentEvent);
    const resolutionDay = state.day;
    const timerId = window.setTimeout(() => {
      setState((current) => current.day === resolutionDay
        && current.eventResolutionLocked
        && eventOccurrenceKey(current.currentEvent) === occurrenceId
        ? failCurrentEvent(current, occurrenceId ?? undefined, true)
        : current);
    }, 5000);
    return () => window.clearTimeout(timerId);
  }, [state.day, state.eventResolutionLocked, state.eventPhase, state.currentEvent?.occurrenceId, state.currentEvent?.id]);

  const beginPresentation = useCallback((eventId: string) => {
    setState((currentState) => {
      if (
        eventOccurrenceKey(currentState.currentEvent) !== eventId ||
        currentState.eventPhase !== 'pending'
      ) {
        return currentState;
      }
      return { ...currentState, eventPhase: 'presenting' };
    });
  }, []);

  const completePresentation = useCallback((eventId: string) => {
    setState((currentState) => {
      if (
        eventOccurrenceKey(currentState.currentEvent) !== eventId ||
        currentState.eventPhase !== 'presenting'
      ) {
        return currentState;
      }
      return {
        ...currentState,
        eventPhase: 'awaitingDecision',
        eventDeadlineAtMs: currentState.eventDeadlineAtMs
          ?? currentState.campaignElapsedMs + EVENT_RESPONSE_DURATION_MS,
        taskFailureNotices: currentState.taskFailureNotices.map((notice) => (
          notice.occurrenceId === eventId ? { ...notice, presented: true } : notice
        )),
      };
    });
  }, []);

  const completeQueuedPresentation = useCallback((eventId: string) => {
    setState((currentState) => {
      const queuedEvents = currentState.queuedEvents.map((entry) => (
        eventOccurrenceKey(entry.event) === eventId
          ? { ...entry, presented: true }
          : entry
      ));
      const isCurrent = eventOccurrenceKey(currentState.currentEvent) === eventId;
      return {
        ...currentState,
        queuedEvents,
        ...(isCurrent && currentState.eventPhase === 'presenting'
          ? { eventPhase: 'awaitingDecision' as const }
          : {}),
        taskFailureNotices: currentState.taskFailureNotices.map((notice) => (
          notice.occurrenceId === eventId ? { ...notice, presented: true } : notice
        )),
      };
    });
  }, []);

  const makeDecision = useCallback((decision: Decision, expectedOccurrenceId?: string) => {
    setState((currentState) => {
      const occurrenceId = expectedOccurrenceId ?? eventOccurrenceKey(currentState.currentEvent);
      const isCurrentEvent = Boolean(occurrenceId)
        && eventOccurrenceKey(currentState.currentEvent) === occurrenceId;
      const queuedEvent = currentState.queuedEvents.find(
        ({ event: queued }) => eventOccurrenceKey(queued) === occurrenceId,
      );
      const event = isCurrentEvent ? currentState.currentEvent : queuedEvent?.event;
      if (
        currentState.gameStatus !== 'playing' ||
        !['active', 'report'].includes(currentState.dayPhase) ||
        !event ||
        (isCurrentEvent && currentState.eventPhase !== 'awaitingDecision') ||
        currentState.eventResolutionLocked ||
        !event.decisions.some((option) => option.id === decision.id)
      ) {
        return currentState;
      }
      const deadlineAtMs = isCurrentEvent
        ? currentState.eventDeadlineAtMs
        : queuedEvent?.deadlineAtMs ?? null;
      if (deadlineAtMs !== null && currentState.campaignElapsedMs >= deadlineAtMs) {
        return occurrenceId ? failEventOccurrence(currentState, occurrenceId, true) : currentState;
      }

      // A task the commander is actively working on stays open through its
      // linked event. Resolving the event handles the incident; the commander
      // still needs to finish that task explicitly.
      const resolvedLinkedTasks = getResolvedLinkedTasks(currentState.dailyChallenges, event)
        .filter((task) => task.id !== currentState.activeChallengeId);
      const resolutionEffects: Partial<Record<ResourceKey, number>> = {
        ...getSuccessfulEventResourceEffects(event, decision),
      };
      for (const task of resolvedLinkedTasks) {
        for (const [resource, amount] of Object.entries(getTaskCompletionResourceEffects(task))
          .filter(([key]) => isEventOptionResource(key) || key === 'science') as [SurvivalResourceKey | 'science', number][]) {
          resolutionEffects[resource] = (resolutionEffects[resource] ?? 0) + amount;
        }
      }
      const resources = applyIncidentEffects(currentState.resources, resolutionEffects);
      const pendingResourceEffects = currentState.pendingResourceEffects;
      const failedVital = findFailedVital(resources);
      const systemConditions = applyConditionEffects(
        currentState.systemConditions,
        decision.conditionEffects ?? {},
        event.affectedSystems,
      );
      const faultHistory = [
        ...currentState.faultHistory,
        ...(Object.entries(decision.conditionEffects ?? {}) as [SystemKey, number][])
          .map(([system]) => ({
            system,
            change: systemConditions[system] - currentState.systemConditions[system],
          }))
          .filter(({ change }) => change < 0)
          .map(({ system, change }) => ({
            day: event.day ?? currentState.day,
            system,
            kind: 'event' as const,
            reason: `${event.name}: ${decision.label}`,
            change,
          })),
      ];
      const conditionSummary = (Object.entries(decision.conditionEffects ?? {}) as [SystemKey, number][])
        .map(([system]) => {
          const change = systemConditions[system] - currentState.systemConditions[system];
          return `${SYSTEM_DISPLAY_NAMES[system]} ${change >= 0 ? 'improved' : 'dropped'} by ${Math.abs(change)}%`;
        })
        .join('; ');
      const outcomeFeedback = conditionSummary
        ? `${conditionSummary}. ${decision.futureConsequence}`
        : decision.futureConsequence;
      const actualResourceChanges = getVisibleResourceChanges(
        getVisibleResourceLevels(resources),
        getVisibleResourceLevels(currentState.resources),
      );
      const actualEffects = (Object.entries(actualResourceChanges) as [DisplayResourceKey, number][])
        .map(([resource, change]) => `${RESOURCE_DISPLAY_NAMES[resource]} ${change > 0 ? '+' : ''}${Number(change.toFixed(1))}%`)
        .concat((Object.entries(decision.conditionEffects ?? {}) as [SystemKey, number][])
          .map(([system]) => {
            const change = systemConditions[system] - currentState.systemConditions[system];
            return `${SYSTEM_DISPLAY_NAMES[system]} ${change >= 0 ? 'improved' : 'dropped'} by ${Math.abs(change)}%`;
          }))
        .join('; ');
      const flags = decision.setFlags
        ? [...new Set([...currentState.flags, ...decision.setFlags])]
        : currentState.flags;
      const linkedTaskIds = new Set(resolvedLinkedTasks.map((task) => task.id));
      const nextFlags = [...new Set([
        ...flags,
        ...(event.triggerSource === 'task'
          ? []
          : resolvedLinkedTasks.map((task) => task.readinessFlag)),
      ])];
      const dailyChallenges = currentState.dailyChallenges.map((task) => (
        linkedTaskIds.has(task.id)
          ? {
            ...task,
            status: 'completed' as const,
            completedDay: currentState.day,
            deadlineMissed: true,
            completedAfterDeadline: true,
          }
          : task
      ));
      const challengeHistory = [
        ...currentState.challengeHistory,
        ...resolvedLinkedTasks.map((task) => ({
          id: task.id,
          title: task.title,
          day: currentState.day,
          deadlineMissed: true,
          responseTimeMs: null,
          emergency: task.emergency,
          preventedEscalation: false,
        })),
      ];
      return refreshDayReportResources({
        ...currentState,
        resources,
        pendingResourceEffects,
        systemConditions,
        faultHistory,
        ...(isCurrentEvent
          ? {
            eventPhase: 'resolving' as const,
            eventEffectId: null,
            eventDeadlineAtMs: null,
          }
          : {
            queuedEvents: removeEventOccurrence(
              currentState.currentEvent,
              currentState.queuedEvents,
              occurrenceId ?? '',
            ).queuedEvents,
          }),
        flags: nextFlags,
        gameStatus: failedVital ? 'failed' : 'playing',
        failureReason: failedVital,
        challengeFeedback: null,
        dailyChallenges,
        challengeHistory,
        activeChallengeId: currentState.activeChallengeId && linkedTaskIds.has(currentState.activeChallengeId)
          ? dailyChallenges.find((task) => (
            task.status === 'inProgress' || task.status === 'overdue'
          ))?.id ?? null
          : currentState.activeChallengeId,
        decisionHistory: [
          ...currentState.decisionHistory,
          {
            day: event.day ?? currentState.day,
            eventName: event.name,
            decisionLabel: decision.label,
            lesson: event.lesson,
            futureConsequence: decision.futureConsequence,
            actualOutcome: actualEffects || 'No immediate resource or condition changes.',
            resourceChanges: actualResourceChanges,
          },
        ],
        eventOutcomeHistory: [
          ...currentState.eventOutcomeHistory,
          {
            occurrenceId: eventOccurrenceKey(event) ?? `${event.id}-${currentState.day}`,
            day: event.day ?? currentState.day,
            eventId: event.id,
            eventName: event.name,
            status: 'resolved',
            decision: decision.label,
            feedback: outcomeFeedback,
          resourceChanges: actualResourceChanges,
          },
        ],
        eventFailureNotices: currentState.eventFailureNotices.some((notice) => (
          notice.id === (eventOccurrenceKey(event) ?? `${event.id}-${currentState.day}`)
        ))
          ? currentState.eventFailureNotices
          : [...currentState.eventFailureNotices, {
            id: eventOccurrenceKey(event) ?? `${event.id}-${currentState.day}`,
            day: event.day ?? currentState.day,
            name: event.name,
            feedback: outcomeFeedback,
            changes: actualResourceChanges,
            expired: false,
            status: 'resolved',
            decision: decision.label,
          }],
      });
    });
  }, []);

  const completeResolution = useCallback((eventId: string) => {
    setState((currentState) => {
      if (
        eventOccurrenceKey(currentState.currentEvent) !== eventId ||
        currentState.eventPhase !== 'resolving'
      ) {
        return currentState;
      }
      const [nextQueuedEvent, ...remainingQueuedEvents] = currentState.queuedEvents;
      let nextState: GameState = {
        ...currentState,
        currentEvent: nextQueuedEvent?.event ?? null,
        queuedEvents: remainingQueuedEvents,
        eventPhase: nextQueuedEvent ? (nextQueuedEvent.presented ? 'awaitingDecision' : 'pending') : 'idle',
        eventDrainElapsedMs: nextQueuedEvent?.drainElapsedMs ?? 0,
        eventEffectId: getEventVisualId(nextQueuedEvent?.event),
        eventDeadlineAtMs: nextQueuedEvent?.deadlineAtMs ?? null,
      };
      if (
        nextState.gameStatus === 'playing'
        && nextState.dayPhase === 'closing'
        && !nextState.currentEvent
        && nextState.queuedEvents.length === 0
        && (nextState.endOfDayEvents.length === 0 || nextState.endOfDaySequenceFinished)
      ) {
        nextState = createDayReport(nextState);
      }
      return nextState;
    });
  }, []);

  const advanceDay = useCallback(() => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing'
        || currentState.dayPhase !== 'report'
        || !currentState.dayReport
        || hasPendingCriticalTaskNotice(currentState)
      ) {
        return currentState;
      }
      if (currentState.day >= currentState.maxDays) {
        return {
          ...currentState,
          gameStatus: 'success',
          dayPhase: 'active',
          dayReport: null,
        };
      }

      const nextDailyChallenges = createNextDayChallenges(
        currentState.day + 1,
        currentState.rngState,
        currentState.usedDailyChallengeIds,
      );
      let nextState: GameState = {
        ...currentState,
        taskMissionHistory: [
          ...currentState.taskMissionHistory,
          ...currentState.dailyChallenges.map((task) => ({
            id: task.id,
            title: task.title,
            priority: task.priority,
            status: task.status,
            affectedSystem: task.affectedSystem,
            day: currentState.day,
            emergency: task.emergency,
            completedAfterDeadline: task.completedAfterDeadline,
            responseTimeMs: task.responseTimeMs,
            emergencyPrevented: task.emergencyPrevented,
            escalationApplied: task.escalationApplied,
            targetComponentName: task.targetComponentName,
            deadlineDay: task.deadlineDay,
          })),
        ],
        day: currentState.day + 1,
        dayPhase: 'transition',
        dayReport: null,
        dayElapsedMs: 0,
        resourceElapsedMs: 0,
        schedulerElapsedMs: 0,
        pendingResourceEffects: {},
        currentEvent: null,
        queuedEvents: [],
        endOfDayEvents: [],
        endOfDaySequenceFinished: false,
        eventPhase: 'idle',
        eventDrainElapsedMs: 0,
        eventEffectId: null,
        eventDeadlineAtMs: null,
        dayStartResources: { ...currentState.resources },
        eventFailureNotices: [],
        eventResolutionLocked: false,
        endOfDayCriticalTransition: false,
        dailyChallenges: nextDailyChallenges,
        usedDailyChallengeIds: [
          ...currentState.usedDailyChallengeIds,
          ...nextDailyChallenges.map(({ id }) => id),
        ],
        activeChallengeId: null,
        challengeFeedback: null,
        warningTaskId: null,
      };
      return nextState;
    });
  }, []);

  const dismissEndOfDayTaskNotice = useCallback((occurrenceId: string) => {
    setState((currentState) => {
      if (!currentState.endOfDayNoticeHistory.some((event) => eventOccurrenceKey(event) === occurrenceId)) {
        return currentState;
      }
      return resumePendingDayReport({
        ...currentState,
        endOfDayNoticeHistory: currentState.endOfDayNoticeHistory.filter(
          (event) => eventOccurrenceKey(event) !== occurrenceId,
        ),
        endOfDayNoticePresentationIds: currentState.endOfDayNoticePresentationIds.filter(
          (id) => id !== occurrenceId,
        ),
      });
    });
  }, []);

  const presentEndOfDayTaskNotice = useCallback((occurrenceId: string) => {
    setState((currentState) => {
      if (!currentState.endOfDayNoticeHistory.some((event) => eventOccurrenceKey(event) === occurrenceId)
        || currentState.endOfDayNoticePresentationIds.includes(occurrenceId)) return currentState;
      return {
        ...currentState,
        endOfDayNoticePresentationIds: [...currentState.endOfDayNoticePresentationIds, occurrenceId],
      };
    });
  }, []);

  const startDailyChallenge = useCallback((challengeId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.dayPhase !== 'active' ||
        currentState.warningTaskId
      ) {
        return currentState;
      }

      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (
        !challenge
        || challenge.status === 'completed'
      ) return currentState;

      const startedTask = startTaskOccurrence(
        challenge,
        currentState.day,
        currentState.campaignElapsedMs,
      );

      return {
        ...currentState,
        activeChallengeId: challenge.id,
        challengeFeedback: null,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id
            ? startedTask
            : task,
        ),
      };
    });
  }, []);

  const startCriticalTaskRecovery = useCallback((challengeId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing'
        || currentState.dayPhase !== 'active'
        || currentState.warningTaskId
      ) return currentState;
      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (!challenge || challenge.priority !== 'critical'
        || challenge.status !== 'overdue'
        || challenge.recoveryStatus !== 'available'
        || !TASK_CONSEQUENCE_EVENTS.some((event) => event.riskTaskIds?.includes(challenge.id))) {
        return currentState;
      }
      return {
        ...currentState,
        activeChallengeId: challenge.id,
        challengeFeedback: `Try ${challenge.title} again in 45 seconds to win back half of the resources lost.`,
        dailyChallenges: currentState.dailyChallenges.map((task) => task.id === challenge.id
          ? {
            ...task,
            recoveryStatus: 'active',
            recoveryAttempted: true,
            recoveryDeadlineAtMs: currentState.campaignElapsedMs + CRITICAL_TASK_RECOVERY_DURATION_MS,
          }
          : task),
      };
    });
  }, []);

  const completeDailyChallenge = useCallback((challengeId: string, componentId: string, selectedSolution?: { resourceEffects?: Partial<Record<ResourceKey, number>>; conditionDelta?: number }) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.dayPhase !== 'active' ||
        currentState.warningTaskId
      ) {
        return currentState;
      }

      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (
        !challenge ||
        (challenge.status !== 'inProgress' && challenge.status !== 'overdue') ||
        (challenge.recoveryStatus === 'available') ||
        (challenge.priority === 'critical'
          && TASK_CONSEQUENCE_EVENTS.some((event) => event.riskTaskIds?.includes(challenge.id))
          && challenge.urgentConsequenceApplied
          && challenge.recoveryStatus !== 'active') ||
        challenge.targetComponentId !== componentId
      ) {
        return currentState;
      }

      const startedDay = challenge.startedDay ?? currentState.day;
      const completedAfterDeadline = challenge.deadlineMissed
        || (challenge.urgentDeadlineAtMs !== null
          && currentState.campaignElapsedMs >= challenge.urgentDeadlineAtMs);
      const responseTimeMs = challenge.urgentStartedAtMs !== null
        ? currentState.campaignElapsedMs - challenge.urgentStartedAtMs
        : null;
      const emergencyPrevented = challenge.emergency
        && !completedAfterDeadline
        && !challenge.urgentConsequenceApplied
        && !challenge.escalationApplied;
      const completionEffects: Partial<Record<ResourceKey, number>> = challenge.recoveryStatus === 'active'
        ? roundResourceEffects(getTaskCompletionResourceEffects(challenge))
        : getTaskCompletionResourceEffects(challenge);
      for (const [resource, amount] of Object.entries(selectedSolution?.resourceEffects ?? {}) as [ResourceKey, number][]) {
        completionEffects[resource] = (completionEffects[resource] ?? 0) + amount;
      }
      let resources = applyEffects(
        currentState.resources,
        completionEffects,
      );
      const recoveryRestoration = challenge.recoveryStatus === 'active'
        ? getHalfResourceRestoration(challenge.recoveryResourceLosses)
        : {};
      if (Object.keys(recoveryRestoration).length > 0) {
        resources = applyEffects(resources, recoveryRestoration);
      }
      const systemConditions = changeSystemCondition(
        currentState.systemConditions,
        challenge.affectedSystem,
        challenge.conditionRecovery + (selectedSolution?.conditionDelta ?? 0),
      );
      const taskResourceChanges = (Object.entries(getVisibleResourceChanges(
        getVisibleResourceLevels(resources),
        getVisibleResourceLevels(currentState.resources),
      )) as [DisplayResourceKey, number][])
        .map(([resource, change]) => ({ resource, change }));
      const taskResourceSummary = taskResourceChanges.length > 0
        ? ` Resource changes: ${taskResourceChanges.map(({ resource, change }) => `${RESOURCE_DISPLAY_NAMES[resource]} ${change > 0 ? '+' : ''}${Number(change.toFixed(1))}%`).join(', ')}.`
        : ' Your resource bars stayed the same.';
      const taskConditionChange = systemConditions[challenge.affectedSystem]
        - currentState.systemConditions[challenge.affectedSystem];
      const taskConditionSummary = taskConditionChange > 0
        ? ` ${SYSTEM_DISPLAY_NAMES[challenge.affectedSystem]} is working ${taskConditionChange}% better.`
        : taskConditionChange < 0
          ? ` ${SYSTEM_DISPLAY_NAMES[challenge.affectedSystem]} is working ${Math.abs(taskConditionChange)}% less well.`
          : '';
      const taskSuccessFeedback = `You did it! ${challenge.title} is done. ${challenge.completionFeedback}${taskResourceSummary}${taskConditionSummary}`;

      let nextState: GameState = {
        ...currentState,
        resources,
        systemConditions,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id
            ? {
              ...task,
              status: 'completed',
              startedDay,
              completedDay: currentState.day,
              deadlineMissed: task.deadlineMissed || completedAfterDeadline,
              completedAfterDeadline,
              responseTimeMs,
              emergencyPrevented,
              recoveryStatus: challenge.recoveryStatus === 'active' ? 'completed' : challenge.recoveryStatus,
              recoveryDeadlineAtMs: null,
            }
            : task,
        ),
        activeChallengeId: currentState.activeChallengeId === challenge.id
          ? currentState.dailyChallenges.find(
            (task) => task.id !== challenge.id
              && (task.status === 'inProgress' || task.status === 'overdue'),
          )?.id ?? null
          : currentState.activeChallengeId,
        flags: currentState.flags.includes(challenge.readinessFlag)
          ? currentState.flags
          : [...currentState.flags, challenge.readinessFlag],
        challengeHistory: [
          ...currentState.challengeHistory,
          {
            id: challenge.id,
            title: challenge.title,
            day: currentState.day,
            deadlineMissed: completedAfterDeadline,
            responseTimeMs,
            emergency: challenge.emergency,
            preventedEscalation: emergencyPrevented,
          },
        ],
        challengeFeedback: challenge.recoveryStatus === 'active'
          ? `Great recovery! You won back half the resources from this job. ${challenge.completionFeedback}`
          : emergencyPrevented
          ? `Nice work! You finished ${challenge.title} in time and stopped a bigger problem. ${challenge.completionFeedback}`
          : completedAfterDeadline
            ? `Job saved! You finished ${challenge.title} late. ${challenge.completionFeedback}`
            : challenge.priority === 'normal' || challenge.priority === 'high'
              ? taskSuccessFeedback
              : challenge.completionFeedback,
      };
      const failedVital = findFailedVital(resources);
      if (failedVital) {
        nextState = { ...nextState, gameStatus: 'failed', failureReason: failedVital };
      }
      return nextState;
    });
  }, []);

  const restart = useCallback(() => {
    clearSavedGameState();
    setState((current) => ({
      ...createInitialState(seed ?? createRandomSeed()),
      commanderName: current.commanderName,
      baseName: current.baseName,
    }));
  }, [seed]);

  const testTaskEventTrigger = useCallback((challengeId: string) => {
    setState((currentState) => {
      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      const relatedEvent = TASK_CONSEQUENCE_EVENTS.find((event) => event.riskTaskIds?.includes(challengeId));
      if (
        currentState.gameStatus !== 'playing'
        || currentState.dayPhase !== 'active'
        || hasEventOccurredOnDay(currentState)
        || currentState.currentEvent
        || currentState.warningTaskId
        || !challenge
        || !relatedEvent
      ) return currentState;

      const testDay = Math.max(currentState.day, relatedEvent.minDay);
      const selection = selectMajorEvent({
        events: [relatedEvent],
        day: testDay,
        maxDays: Math.max(currentState.maxDays, testDay),
        dayDurationMs,
        elapsedMs: currentState.campaignElapsedMs,
        rngState: currentState.rngState,
        flags: currentState.flags,
        systemConditions: currentState.systemConditions,
        resources: currentState.resources,
        eventHistory: [],
        forceEvent: true,
        ignoreMinimumDay: true,
      }, EVENT_SCHEDULER_CONFIG.checkIntervalMs);

      if (!selection.event) {
        return {
          ...currentState,
          challengeFeedback: `TEST PASSED: ${relatedEvent.name} was blocked by the completed ${challenge.title} task.`,
        };
      }

      const event = prepareEventForReadiness(
        {
          ...selection.event,
          day: currentState.day,
          triggerSource: 'task',
          occurrenceId: `task-${challengeId}-${currentState.day}`,
        },
        currentState.flags,
        currentState.systemConditions,
      );
      return {
        ...currentState,
        rngState: selection.rngState,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challengeId
            ? {
              ...startTaskOccurrence(task, currentState.day, currentState.campaignElapsedMs),
              status: 'overdue',
              deadlineMissed: true,
              triggeredEventIds: [...new Set([...task.triggeredEventIds, relatedEvent.id])],
            }
            : task,
        ),
        currentEvent: event,
        eventPhase: 'pending',
        eventDrainElapsedMs: 0,
        eventEffectId: getEventVisualId(event),
        eventHistory: [
          ...currentState.eventHistory,
          {
            eventId: event.id,
            day: currentState.day,
            elapsedMs: currentState.campaignElapsedMs,
            source: 'task',
            occurrenceId: event.occurrenceId,
          },
        ],
        challengeFeedback: `TEST: overdue ${challenge.title} triggered ${event.name}.`,
      };
    });
  }, [dayDurationMs]);

  const testTaskEventPrevention = useCallback((challengeId: string) => {
    setState((currentState) => {
      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      const relatedEvent = TASK_CONSEQUENCE_EVENTS.find((event) => event.riskTaskIds?.includes(challengeId));
      if (
        currentState.gameStatus !== 'playing'
        || currentState.currentEvent
        || currentState.warningTaskId
        || !challenge
        || !relatedEvent
      ) return currentState;

      const flags = [...new Set([...currentState.flags, challenge.readinessFlag])];
      const testDay = Math.max(currentState.day, relatedEvent.minDay);
      const selection = selectMajorEvent({
        events: [relatedEvent],
        day: testDay,
        maxDays: Math.max(currentState.maxDays, testDay),
        dayDurationMs,
        elapsedMs: currentState.campaignElapsedMs,
        rngState: currentState.rngState,
        flags,
        systemConditions: currentState.systemConditions,
        resources: currentState.resources,
        eventHistory: [],
        forceEvent: true,
        ignoreMinimumDay: true,
      }, EVENT_SCHEDULER_CONFIG.checkIntervalMs);

      if (selection.event) return currentState;
      return {
        ...currentState,
        flags,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challengeId
            ? { ...task, status: 'completed', completedDay: currentState.day }
            : task,
        ),
        challengeFeedback: `TEST PASSED: completing ${challenge.title} blocks ${relatedEvent.name} for this mission.`,
      };
    });
  }, [dayDurationMs]);

  const dismissChallengeFeedback = useCallback(() => {
    setState((currentState) => (
      currentState.challengeFeedback
        ? { ...currentState, challengeFeedback: null }
        : currentState
    ));
  }, []);

  const abandonEvent = useCallback((expectedOccurrenceId?: string) => {
    setState((current) => {
      const occurrenceId = expectedOccurrenceId ?? eventOccurrenceKey(current.currentEvent);
      const exists = Boolean(occurrenceId)
        && (eventOccurrenceKey(current.currentEvent) === occurrenceId
          || current.queuedEvents.some(({ event }) => eventOccurrenceKey(event) === occurrenceId));
      return current.gameStatus === 'playing'
        && ['active', 'report'].includes(current.dayPhase)
        && !current.eventResolutionLocked
        && exists
        ? failEventOccurrence(current, occurrenceId!)
        : current;
    });
  }, []);
  const dismissEventFailureNotice = useCallback((id: string) => {
    setState((current) => ({ ...current, eventFailureNotices: current.eventFailureNotices.filter((notice) => notice.id !== id) }));
  }, []);
  const dismissTaskFailureNotice = useCallback((id: string) => {
    setState((current) => resumePendingDayReport({
      ...current,
      taskFailureNotices: current.taskFailureNotices.filter((notice) => notice.id !== id),
    }));
  }, []);

  // Task feedback uses its own timer and does not wait for event presentation.
  useEffect(() => {
    if (!state.challengeFeedback) return undefined;
    if (state.challengeFeedback.startsWith('Initial deadline missed')) return undefined;
    const feedback = state.challengeFeedback;
    const feedbackDay = state.day;
    const timerId = window.setTimeout(
      () => setState((current) => current.day === feedbackDay && current.challengeFeedback === feedback
        ? { ...current, challengeFeedback: null }
        : current),
      CHALLENGE_FEEDBACK_DURATION_MS,
    );
    return () => window.clearTimeout(timerId);
  }, [
    state.challengeFeedback,
    state.day,
  ]);

  return {
    ...state,
    setSceneReady,
    setMissionProfile,
    setStoryPaused,
    markLocationVisited,
    unlockScienceDiscovery,
    addMissionLogEntry,
    collectIceSample,
    dayDurationMs,
    dayRemainingMs: Math.max(0, dayDurationMs - state.dayElapsedMs),
    timeOfDay: formatLunarTime(state.dayElapsedMs, dayDurationMs),
    remainingDays: state.gameStatus === 'playing'
      ? Math.max(0, state.maxDays - state.day + 1)
      : 0,
    isPaused: Boolean(state.warningTaskId),
    beginPresentation,
    completePresentation,
    completeQueuedPresentation,
    completeResolution,
    advanceDay,
    dismissEndOfDayTaskNotice,
    presentEndOfDayTaskNotice,
    startDailyChallenge,
    startCriticalTaskRecovery,
    completeDailyChallenge,
    dismissChallengeFeedback,
    abandonEvent,
    dismissEventFailureNotice,
    dismissTaskFailureNotice,
    makeDecision,
    restart,
    testTaskEventTrigger,
    testTaskEventPrevention,
  };
}

function formatLunarTime(dayElapsedMs: number, dayDurationMs: number): string {
  if (!Number.isFinite(dayDurationMs) || dayDurationMs <= 0) return '--:--';
  const elapsedMinutes = Math.floor((dayElapsedMs / dayDurationMs) * 24 * 60);
  const hours = Math.floor(elapsedMinutes / 60) % 24;
  const minutes = elapsedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
