import { useCallback, useEffect, useState } from 'react';
import { MOON_EVENTS, TASK_CONSEQUENCE_EVENTS } from '../data/moonEvents';
import type {
  Decision,
  EmergencyTaskDefinition,
  GameEvent,
  ResourceKey,
  SystemKey,
} from '../data/moonEvents';
import { DAILY_CHALLENGES } from '../data/dailyChallenges';
import type { DailyChallengeDefinition } from '../data/dailyChallenges';
import {
  createRandomSeed,
  EVENT_SCHEDULER_CONFIG,
  selectMajorEvent,
} from './eventScheduler';
import type { EventOccurrence } from './eventScheduler';
import {
  applyResourceEffects,
  canTriggerLinkedTaskEvent,
  excludeTaskEventSources,
  hasEventOccurredOnDay,
  removeEventOccurrence,
  getTaskCompletionResourceEffects,
  getTaskEventRecovery,
  getTaskMissResourceEffects,
  getResolvedLinkedTasks,
  selectDailyTaskDefinitions,
  shouldCreateEmergencyFollowUp,
  shouldDeferCriticalTaskAtDayEnd,
  startTaskOccurrence,
} from './taskLifecycle';

export type GameStatus = 'playing' | 'success' | 'failed';
export type ResourceLevels = Record<ResourceKey, number>;
export type EventPhase = 'idle' | 'pending' | 'presenting' | 'awaitingDecision' | 'resolving';
export type DayPhase = 'active' | 'closing' | 'report' | 'transition';

export interface DayReport {
  day: number;
  completedTasks: string[];
  overdueTasks: string[];
  totalEvents: number;
  expiredEvents: number;
  eventOutcomes: EventOutcomeRecord[];
  resourceStart: ResourceLevels;
  resources: ResourceLevels;
  resourceChanges: Partial<Record<ResourceKey, number>>;
}

export interface DecisionRecord {
  day: number;
  eventName: string;
  decisionLabel: string;
  lesson: string;
  futureConsequence: string;
  actualOutcome: string;
}

export interface GameSimulationOptions {
  enabled?: boolean;
  dayDurationMs?: number;
  seed?: number;
}

export type DailyChallengeStatus = 'available' | 'inProgress' | 'overdue' | 'completed';
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
  urgentConsequenceApplied: boolean;
  escalationApplied: boolean;
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

interface EventOutcomeRecord {
  occurrenceId: string;
  day: number;
  eventId: string;
  eventName: string;
  status: 'resolved' | 'failed' | 'expired';
  decision?: string;
  feedback: string;
}

interface GameState {
  day: number;
  maxDays: number;
  dayPhase: DayPhase;
  dayReport: DayReport | null;
  dayElapsedMs: number;
  campaignElapsedMs: number;
  schedulerElapsedMs: number;
  eventDrainElapsedMs: number;
  rngState: number;
  resources: ResourceLevels;
  systemConditions: SystemConditions;
  currentEvent: GameEvent | null;
  queuedEvents: { event: GameEvent; drainElapsedMs: number; presented: boolean; deadlineAtMs: number | null }[];
  eventPhase: EventPhase;
  eventEffectId: string | null;
  eventDeadlineAtMs: number | null;
  dayStartResources: ResourceLevels;
  eventFailureNotices: { id: string; day: number; name: string; feedback: string; changes: Partial<Record<ResourceKey, number>>; expired: boolean }[];
  eventSuccessNotices: { id: string; day: number; name: string; decision: string; feedback: string; changes: Partial<Record<ResourceKey, number>> }[];
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
  activeChallengeId: string | null;
  challengeHistory: DailyChallengeCompletion[];
  challengeFeedback: string | null;
  warningTaskId: string | null;
}


const MAX_RESOURCE_LEVEL = 100;
export const MISSION_FAILURE_RESOURCE_THRESHOLD = 10;
export const MISSION_LENGTH_DAYS = 30;
export const LUNAR_DAY_DURATION_MS = 120_000;
const DAILY_TASK_COUNT = 3;
const DAY_TRANSITION_DURATION_MS = 5000;
const EVENT_RESPONSE_DURATION_MS = 60_000;
const CLOCK_UPDATE_INTERVAL_MS = 1000;
// Task completion toast stays on screen for this long before auto-dismissing.
const CHALLENGE_FEEDBACK_DURATION_MS = 3000;

function eventOccurrenceKey(event: GameEvent | null | undefined): string | null {
  return event?.occurrenceId ?? (event ? `${event.id}-${event.day ?? 0}` : null);
}

function getEventVisualId(event: GameEvent | null | undefined): string | null {
  return event?.sourceEventId ?? event?.id ?? null;
}

const VITAL_RESOURCES: ResourceKey[] = ['oxygen', 'water', 'power'];

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

const DAILY_CONSUMPTION: Partial<Record<ResourceKey, number>> = {
  power: 1,
  oxygen: 1,
  water: 1,
  food: 1,
};

function createDailyChallenges(day = 1): DailyChallenge[] {
  const selectedChallenges = selectDailyTaskDefinitions(
    DAILY_CHALLENGES,
    day,
    DAILY_TASK_COUNT,
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

function createInitialState(seed: number): GameState {
  const initialState: GameState = {
    day: 1,
    maxDays: MISSION_LENGTH_DAYS,
    dayPhase: 'active',
    dayReport: null,
    dayElapsedMs: 0,
    campaignElapsedMs: 0,
    schedulerElapsedMs: 0,
    eventDrainElapsedMs: 0,
    rngState: seed >>> 0,
    resources: { ...INITIAL_RESOURCES },
    systemConditions: {
      power: 85,
      lifeSupport: 90,
      water: 88,
      equipment: 82,
    },
    currentEvent: null,
    queuedEvents: [],
    eventPhase: 'idle',
    eventEffectId: null,
    eventDeadlineAtMs: null,
    dayStartResources: { ...INITIAL_RESOURCES },
    eventFailureNotices: [],
    eventSuccessNotices: [],
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
    dailyChallenges: createDailyChallenges(),
    activeChallengeId: null,
    challengeHistory: [],
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
        effects: { ...decision.effects, battery: -15 },
        benefit: 'Power +20; verified reserve used efficiently',
        cost: 'Battery -15',
      };
    }
    if (readinessEventId === 'power_failure' && decision.id === 'C' && flags.includes('powerDebt')) {
      return {
        ...decision,
        effects: { ...decision.effects, power: -30 },
        cost: 'Power -30',
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
        effects.equipment = -2;
        benefits.push('calibrated equipment limits equipment loss');
      }
      if (isPrepared('habitatSealVerified')) {
        effects.oxygen = -1;
        if (conditionEffects.lifeSupport !== undefined) {
          conditionEffects.lifeSupport = Math.ceil(conditionEffects.lifeSupport / 2);
        }
        benefits.push('verified habitat seals limit oxygen loss');
      }
      return {
        ...decision,
        effects,
        conditionEffects,
        benefit: `Science +5; ${benefits.join('; ')}`,
        cost: `Health -8, Oxygen ${effects.oxygen}, Equipment ${effects.equipment}`,
      };
    }
    if (readinessEventId === 'water_leak' && decision.id === 'B' && isPrepared('waterLineInspected')) {
      return {
        ...decision,
        effects: { ...decision.effects, equipment: -5 },
        benefit: 'Water +25; inspected repair points reduce spare-part use',
        cost: 'Equipment -5, Power -8',
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
        benefit: 'Stored Power +35; verified battery preparation improves reserve efficiency',
      };
    }
    if (
      readinessEventId === 'water_ice_exploration'
      && decision.id === 'A'
      && isPrepared('workshopMaintenanceComplete')
    ) {
      return {
        ...decision,
        effects: { ...decision.effects, equipment: -5 },
        conditionEffects: { ...decision.conditionEffects, equipment: -3 },
        benefit: 'Potential Water +40; calibrated equipment reduces exploration wear',
        cost: 'Power -20, Equipment -5',
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
  return applyResourceEffects(resources, effects, MAX_RESOURCE_LEVEL) as ResourceLevels;
}

function findFailedVital(resources: ResourceLevels): ResourceKey | null {
  return VITAL_RESOURCES.find(
    (resource) => resources[resource] <= MISSION_FAILURE_RESOURCE_THRESHOLD,
  ) ?? null;
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
        challengeFeedback: `Secondary ${system} fault: ${relatedOverdueTask.title} remained overdue while the system was critical.`,
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

function createEmergencyChallenge(
  definition: EmergencyTaskDefinition,
  id: string,
  day: number,
): DailyChallenge {
  return {
    ...definition,
    taskType: 'event-prevention',
    id,
    scheduledDay: day,
    priority: 'critical',
    deadlineDay: day + 1,
    conditionRecovery: 8,
    overdueConditionLoss: definition.urgentConditionLoss,
    postponement: {
      warning: `${definition.title} is an active emergency and cannot be postponed.`,
      riskOnlyConsequence: definition.riskIfDelayed,
    },
    emergency: true,
    triggeredEventIds: [],
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
    urgentConsequenceApplied: false,
    escalationApplied: false,
    completedAfterDeadline: null,
    responseTimeMs: null,
    emergencyPrevented: false,
  };
}

function applyTimedTaskConsequences(state: GameState): GameState {
  let resources = state.resources;
  let systemConditions = state.systemConditions;
  const faultHistory = [...state.faultHistory];
  let challengeFeedback = state.challengeFeedback;
  let gameStatus = state.gameStatus;
  let failureReason = state.failureReason;

  const dailyChallenges = state.dailyChallenges.map((challenge) => {
    if (challenge.status === 'completed' || challenge.urgentDeadlineAtMs === null) {
      return challenge;
    }
    let nextChallenge = challenge;

    if (
      !challenge.urgentConsequenceApplied
      && state.campaignElapsedMs >= challenge.urgentDeadlineAtMs
    ) {
      if (!challenge.overdueEffectApplied) {
        const systemBefore = systemConditions[challenge.affectedSystem];
        systemConditions = changeSystemCondition(
          systemConditions,
          challenge.affectedSystem,
          -(challenge.urgentConditionLoss ?? challenge.overdueConditionLoss),
        );
        faultHistory.push({
          day: state.day,
          system: challenge.affectedSystem,
          kind: 'overdue-task',
          reason: `${challenge.title} response deadline expired`,
          change: systemConditions[challenge.affectedSystem] - systemBefore,
        });
      }
      const hasLinkedEvent = MOON_EVENTS.some((event) => event.riskTaskIds?.includes(challenge.id));
      if (!hasLinkedEvent) resources = applyEffects(resources, challenge.urgentResourceEffects ?? {});
      challengeFeedback = `${challenge.priority.toUpperCase()} task overdue: ${challenge.title}. ${challenge.riskIfDelayed}`;
      nextChallenge = {
        ...challenge,
        status: 'overdue',
        deadlineMissed: true,
        overdueEffectApplied: true,
        urgentConsequenceApplied: true,
      };
      const failedVital = findFailedVital(resources);
      if (failedVital) {
        gameStatus = 'failed';
        failureReason = failedVital;
      }
    }

    if (
      nextChallenge.status !== 'completed'
      && nextChallenge.urgentConsequenceApplied
      && !nextChallenge.escalationApplied
      && nextChallenge.escalationAtMs !== null
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
      const hasLinkedEvent = MOON_EVENTS.some((event) => event.riskTaskIds?.includes(challenge.id));
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
      challengeFeedback = `EMERGENCY ESCALATED: ${nextChallenge.title}. ${nextChallenge.riskIfDelayed}`;
      nextChallenge = { ...nextChallenge, escalationApplied: true };
      const failedVital = findFailedVital(resources);
      if (failedVital) {
        gameStatus = 'failed';
        failureReason = failedVital;
      }
    }

    return nextChallenge;
  });

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
  return {
    ...state,
    dayPhase: 'report',
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
      resourceStart: { ...state.dayStartResources },
      resources: { ...state.resources },
      resourceChanges: (Object.keys(state.resources) as ResourceKey[]).reduce((changes, key) => {
        const change = state.resources[key] - state.dayStartResources[key];
        if (change !== 0) changes[key] = change;
        return changes;
      }, {} as Partial<Record<ResourceKey, number>>),
    },
  };
}

function queueOverdueTaskEvents(state: GameState): GameState {
  const triggeredEvents: GameEvent[] = [];

  for (const task of state.dailyChallenges) {
    if (task.status !== 'overdue') continue;
    if (task.priority === 'critical' && task.startedDay === null) continue;
    const relatedEvent = TASK_CONSEQUENCE_EVENTS.find((event) => (
      canTriggerLinkedTaskEvent(task, event)
      && !task.triggeredEventIds.includes(event.id)
      && !event.preventedByFlags?.some((flag) => state.flags.includes(flag))
    ));
    if (!relatedEvent) continue;

    const event = prepareEventForReadiness(
      {
        ...relatedEvent,
        day: state.day,
        situation: `Caused by the missed task “${task.title}”: ${relatedEvent.situation}`,
        triggerSource: 'task',
        occurrenceId: `task-${task.id}-${state.day}`,
      },
      state.flags,
      state.systemConditions,
    );
    triggeredEvents.push(event);
  }

  if (triggeredEvents.length === 0) return state;

  const eventHistory = [
    ...state.eventHistory,
    ...triggeredEvents.map((event) => ({
      eventId: event.id,
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
  if (state.currentEvent) {
    return {
      ...state,
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
    eventHistory,
    taskFailureNotices,
    dailyChallenges,
    ...(state.dayPhase === 'closing' ? { eventResolutionLocked: true } : {}),
  };
}

function failEventOccurrence(state: GameState, occurrenceId: string, expired = false): GameState {
  const removedOccurrence = removeEventOccurrence(state.currentEvent, state.queuedEvents, occurrenceId);
  const { isCurrent, event } = removedOccurrence;
  if (!event) return state;
  const resources = applyEffects(state.resources, event.failureEffects);
  const systemConditions = applyConditionEffects(
    state.systemConditions,
    event.failureConditionEffects ?? {},
    event.affectedSystems,
  );
  const changes = (Object.keys(event.failureEffects) as ResourceKey[]).reduce((result, key) => {
    const actual = resources[key] - state.resources[key];
    if (actual !== 0) result[key] = actual;
    return result;
  }, {} as Partial<Record<ResourceKey, number>>);
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
    eventFailureNotices: [...state.eventFailureNotices, {
      id: eventOccurrenceKey(event) ?? `${event.id}-${state.day}-${state.campaignElapsedMs}`,
      day: event.day ?? state.day,
      name: event.name,
      feedback: event.failureFeedback,
      changes,
      expired,
    }],
    eventOutcomeHistory: [...state.eventOutcomeHistory, {
      occurrenceId: eventOccurrenceKey(event) ?? `${event.id}-${state.day}`,
      day: event.day ?? state.day,
      eventId: event.id,
      eventName: event.name,
      status: expired ? 'expired' : 'failed',
      feedback: event.failureFeedback,
    }],
    ...(expired ? { expiredEventHistory: [...state.expiredEventHistory, {
      day: event.day ?? state.day,
      occurrenceId: eventOccurrenceKey(event) ?? `${event.id}-${state.day}`,
    }] } : {}),
  };
  const failedVital = findFailedVital(resources);
  if (failedVital) next = { ...next, gameStatus: 'failed', failureReason: failedVital };
  if (next.dayPhase === 'closing' && !next.currentEvent && next.queuedEvents.length === 0) {
    next = createDayReport(next);
  }
  return next;
}

function failCurrentEvent(state: GameState, expectedOccurrenceId?: string, expired = false): GameState {
  const occurrenceId = expectedOccurrenceId ?? eventOccurrenceKey(state.currentEvent);
  return occurrenceId ? failEventOccurrence(state, occurrenceId, expired) : state;
}

function beginDayClosing(state: GameState, dayDurationMs: number): GameState {
  if (state.dayPhase !== 'active') return state;
  const criticalTaskInProgress = state.dailyChallenges.some((task) => (
    (task.emergency || task.taskType === 'event-prevention') && task.status === 'inProgress'
    && task.urgentDeadlineAtMs !== null
    && state.campaignElapsedMs < task.urgentDeadlineAtMs
  ));

  let resources = applyEffects(state.resources, DAILY_CONSUMPTION);
  const failedVital = findFailedVital(resources);
  if (failedVital) {
    return {
      ...state,
      dayElapsedMs: dayDurationMs,
      resources,
      gameStatus: 'failed',
      failureReason: failedVital,
    };
  }

  const faultHistory = [...state.faultHistory];
  let systemConditions = state.systemConditions;
  const dailyChallenges = state.dailyChallenges.map((task) => {
    if (task.status === 'completed') return task;
    // A Critical task's timer begins only when the player starts that task.
    // Unstarted Critical tasks remain available across the day boundary.
    // A started Critical task whose own response timer has not expired keeps
    // running across the transition; day end is not its deadline.
    if (shouldDeferCriticalTaskAtDayEnd(task, state.campaignElapsedMs)) return task;
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
    resources = applyEffects(resources, getTaskMissResourceEffects(task));
    return {
      ...task,
      status: 'overdue' as const,
      deadlineMissed: true,
      overdueEffectApplied: true,
    };
  });
  let closingState: GameState = {
    ...state,
    dayPhase: 'closing',
    endOfDayCriticalTransition: criticalTaskInProgress,
    eventResolutionLocked: false,
    dayElapsedMs: dayDurationMs,
    resources,
    dailyChallenges,
    systemConditions,
    faultHistory,
  };
  const systemResources: Record<SystemKey, ResourceKey> = {
    power: 'power',
    lifeSupport: 'oxygen',
    water: 'water',
    equipment: 'equipment',
  };
  for (const system of Object.keys(systemResources) as SystemKey[]) {
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
      return { ...closingState, gameStatus: 'failed', failureReason: failedVital };
    }
  }
  return createDayReport(closingState);
}

function createNextDayChallenges(day: number): DailyChallenge[] {
  return createDailyChallenges(day);
}

function advanceClockState(
  initialState: GameState,
  elapsedMs: number,
  dayDurationMs: number,
): GameState {
  let nextState = initialState;
  if (nextState.dayPhase === 'transition') return nextState;
  let remainingMs = elapsedMs;

  while (
    remainingMs > 0
    && nextState.gameStatus === 'playing'
    && !nextState.warningTaskId
  ) {
    const untilDayEnd = nextState.dayPhase === 'active'
      ? Math.max(0, dayDurationMs - nextState.dayElapsedMs)
      : Number.POSITIVE_INFINITY;
    // Scheduler boundaries only gate gameplay while the day is active. If the
    // day ends on the same tick as a scheduler check, carrying a zero interval
    // into `closing` makes the clock loop spin forever while queued incidents
    // resolve, which appears as a freeze just before the report.
    const untilSchedulerCheck = nextState.dayPhase === 'active' && !hasEventOccurredOnDay(nextState)
      ? Math.max(0, EVENT_SCHEDULER_CONFIG.checkIntervalMs - nextState.schedulerElapsedMs)
      : Number.POSITIVE_INFINITY;
    const untilTaskTransition = nextState.dayPhase === 'active'
      ? nextState.dailyChallenges.reduce((nearest, challenge) => {
      if (challenge.status === 'completed') return nearest;
      const transitionAt = !challenge.urgentConsequenceApplied
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
    const untilEventTimeout = eventDeadlines.length > 0
      ? Math.max(0, Math.min(...eventDeadlines) - nextState.campaignElapsedMs)
      : Number.POSITIVE_INFINITY;
    const step = Math.min(remainingMs, untilDayEnd, untilSchedulerCheck, untilTaskTransition, untilEventTimeout);
    nextState = {
      ...nextState,
      dayElapsedMs: nextState.dayPhase === 'active'
        ? nextState.dayElapsedMs + step
        : nextState.dayElapsedMs,
      campaignElapsedMs: nextState.campaignElapsedMs + step,
      schedulerElapsedMs: nextState.dayPhase === 'active'
        ? nextState.schedulerElapsedMs + step
        : nextState.schedulerElapsedMs,
    };
    remainingMs -= step;

    // Each active event drains its threatened resources in visible half point
    // steps while preserving the rate of one point per lunar day per event.
    const eventDrains: Partial<Record<ResourceKey, number>> = {};
    const halfDayMs = dayDurationMs / 2;
    const activeEvent = nextState.currentEvent;
    if (activeEvent && nextState.eventPhase !== 'resolving') {
      const totalElapsedMs = nextState.eventDrainElapsedMs + step;
      const halfPointSteps = Math.floor(totalElapsedMs / halfDayMs);
      const drain = halfPointSteps * 0.5;
      nextState = {
        ...nextState,
        eventDrainElapsedMs: totalElapsedMs - halfPointSteps * halfDayMs,
      };
      if (drain > 0) {
        for (const resource of activeEvent.riskResources) {
          eventDrains[resource] = (eventDrains[resource] ?? 0) - drain;
        }
      }
    }
    nextState = {
      ...nextState,
      queuedEvents: nextState.queuedEvents.map((queued) => {
        const totalElapsedMs = queued.drainElapsedMs + step;
        const halfPointSteps = Math.floor(totalElapsedMs / halfDayMs);
        const drain = halfPointSteps * 0.5;
        if (drain > 0) {
          for (const resource of queued.event.riskResources) {
            eventDrains[resource] = (eventDrains[resource] ?? 0) - drain;
          }
        }
        return {
          ...queued,
          drainElapsedMs: totalElapsedMs - halfPointSteps * halfDayMs,
        };
      }),
    };
    if (Object.keys(eventDrains).length > 0) {
      const resources = applyEffects(nextState.resources, eventDrains);
      const failedVital = findFailedVital(resources);
      nextState = {
        ...nextState,
        resources,
        ...(failedVital ? { gameStatus: 'failed' as const, failureReason: failedVital } : {}),
      };
      if (nextState.gameStatus !== 'playing') return nextState;
    }

    if (nextState.dayPhase === 'active') {
      nextState = applyTimedTaskConsequences(nextState);
      nextState = queueOverdueTaskEvents(nextState);
    }
    if (nextState.gameStatus !== 'playing') return nextState;

    const expiredEventIds = [
      ...(nextState.currentEvent
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

    const forceDayTwoIndependentEvent = nextState.day === 2
      && nextState.dayElapsedMs >= EVENT_SCHEDULER_CONFIG.minimumIndependentEventElapsedMs
      && !nextState.independentEventHistory.some((entry) => entry.day === 2);
    if (nextState.dayPhase === 'active'
      && (!hasEventOccurredOnDay(nextState) || forceDayTwoIndependentEvent)
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
        ignorePreventedByFlags: true,
        forceEvent: (nextState.day === 1 || nextState.day === 2)
          && nextState.dayElapsedMs >= EVENT_SCHEDULER_CONFIG.minimumIndependentEventElapsedMs,
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
        nextState = {
          ...nextState,
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
  const [state, setState] = useState<GameState>(
    () => createInitialState(seed ?? createRandomSeed()),
  );

  const setSceneReady = useCallback((ready: boolean) => {
    setState((current) => current.sceneReady === ready ? current : { ...current, sceneReady: ready });
  }, []);

  const advanceClock = useCallback((elapsedMs: number) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
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
      !enabled || !state.sceneReady ||
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
  ]);

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

      const eventRecovery = getTaskEventRecovery(event) as Partial<Record<ResourceKey, number>>;
      const resources = applyEffects(
        applyEffects(currentState.resources, decision.effects),
        eventRecovery,
      );
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
          return `${system} condition ${change > 0 ? '+' : ''}${change}`;
        })
        .join('; ');
      const outcomeFeedback = conditionSummary
        ? `${conditionSummary}. ${decision.futureConsequence}`
        : decision.futureConsequence;
      const actualResourceChanges = [...new Set([
        ...(Object.keys(decision.effects) as ResourceKey[]),
        ...(Object.keys(eventRecovery) as ResourceKey[]),
      ])]
        .reduce((changes, resource) => {
          const change = resources[resource] - currentState.resources[resource];
          if (change !== 0) changes[resource] = change;
          return changes;
        }, {} as Partial<Record<ResourceKey, number>>);
      const actualEffects = (Object.entries(actualResourceChanges) as [ResourceKey, number][])
        .map(([resource, change]) => `${resource} ${change > 0 ? '+' : ''}${change}`)
        .concat((Object.entries(decision.conditionEffects ?? {}) as [SystemKey, number][])
          .map(([system]) => {
            const change = systemConditions[system] - currentState.systemConditions[system];
            return `${system} condition ${change > 0 ? '+' : ''}${change}`;
          }))
        .join('; ');
      const flags = decision.setFlags
        ? [...new Set([...currentState.flags, ...decision.setFlags])]
        : currentState.flags;
      const resolvedLinkedTasks = getResolvedLinkedTasks(currentState.dailyChallenges, event);
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
      const emergencyTaskDefinition = shouldCreateEmergencyFollowUp(event)
        ? event.emergencyTask
        : undefined;
      const emergencyTask = emergencyTaskDefinition
        ? createEmergencyChallenge(
          emergencyTaskDefinition,
          `emergency-${event.id}-${currentState.eventHistory.length}`,
          event.day ?? currentState.day,
        )
        : null;

      return {
        ...currentState,
        resources,
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
        challengeFeedback: emergencyTask
          ? `CRITICAL: ${emergencyTask.title}. ${emergencyTask.riskIfDelayed}`
          : `${event.name}: ${decision.label}. ${outcomeFeedback}`,
        dailyChallenges: emergencyTask
          ? [...dailyChallenges, emergencyTask]
          : dailyChallenges,
        challengeHistory,
        activeChallengeId: emergencyTask?.id
          ?? (currentState.activeChallengeId && linkedTaskIds.has(currentState.activeChallengeId)
            ? dailyChallenges.find((task) => (
              task.status === 'inProgress' || task.status === 'overdue'
            ))?.id ?? null
            : currentState.activeChallengeId),
        decisionHistory: [
          ...currentState.decisionHistory,
          {
            day: event.day ?? currentState.day,
            eventName: event.name,
            decisionLabel: decision.label,
            lesson: event.lesson,
            futureConsequence: decision.futureConsequence,
            actualOutcome: actualEffects || 'No immediate resource or condition changes.',
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
          },
        ],
        eventSuccessNotices: [
          ...currentState.eventSuccessNotices,
          {
            id: eventOccurrenceKey(event) ?? `${event.id}-${currentState.day}`,
            day: event.day ?? currentState.day,
            name: event.name,
            decision: decision.label,
            feedback: outcomeFeedback,
            changes: actualResourceChanges,
          },
        ],
      };
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

      let nextState: GameState = {
        ...currentState,
        day: currentState.day + 1,
        dayPhase: 'transition',
        dayReport: null,
        dayElapsedMs: 0,
        schedulerElapsedMs: 0,
        dayStartResources: { ...currentState.resources },
        eventFailureNotices: [],
        eventSuccessNotices: [],
        taskFailureNotices: [],
        eventResolutionLocked: false,
        endOfDayCriticalTransition: false,
        dailyChallenges: createNextDayChallenges(currentState.day + 1),
        activeChallengeId: null,
        challengeFeedback: null,
        warningTaskId: null,
      };
      return nextState;
    });
  }, []);

  const startDailyChallenge = useCallback((challengeId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.dayPhase !== 'active' ||
        !['idle', 'awaitingDecision'].includes(currentState.eventPhase) ||
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

  const completeDailyChallenge = useCallback((challengeId: string, componentId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.dayPhase !== 'active' ||
        !['idle', 'awaitingDecision'].includes(currentState.eventPhase) ||
        currentState.warningTaskId
      ) {
        return currentState;
      }

      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (
        !challenge ||
        (challenge.status !== 'inProgress' && challenge.status !== 'overdue') ||
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
      const resources = applyEffects(
        currentState.resources,
        getTaskCompletionResourceEffects(challenge),
      );
      const systemConditions = changeSystemCondition(
        currentState.systemConditions,
        challenge.affectedSystem,
        challenge.conditionRecovery,
      );

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
        challengeFeedback: emergencyPrevented
          ? `Emergency contained: ${challenge.title} completed before escalation. ${challenge.completionFeedback}`
          : completedAfterDeadline
            ? `Recovery complete: ${challenge.title} was finished after its response deadline. ${challenge.completionFeedback}`
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
    setState(createInitialState(seed ?? createRandomSeed()));
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
  const dismissEventSuccessNotice = useCallback((id: string) => {
    setState((current) => ({ ...current, eventSuccessNotices: current.eventSuccessNotices.filter((notice) => notice.id !== id) }));
  }, []);
  const dismissTaskFailureNotice = useCallback((id: string) => {
    setState((current) => ({ ...current, taskFailureNotices: current.taskFailureNotices.filter((notice) => notice.id !== id) }));
  }, []);

  // Notifications remain queued through event cinematics and dismiss only when
  // the idle gameplay state can actually display the toast.
  useEffect(() => {
    if (!state.challengeFeedback || state.eventPhase !== 'idle') return undefined;
    const feedback = state.challengeFeedback;
    const feedbackDay = state.day;
    const timerId = window.setTimeout(
      () => setState((current) => current.day === feedbackDay && current.challengeFeedback === feedback
        ? { ...current, challengeFeedback: null }
        : current),
      CHALLENGE_FEEDBACK_DURATION_MS,
    );
    return () => window.clearTimeout(timerId);
  }, [state.challengeFeedback, state.eventPhase, state.day]);

  return {
    ...state,
    setSceneReady,
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
    startDailyChallenge,
    completeDailyChallenge,
    dismissChallengeFeedback,
    abandonEvent,
    dismissEventFailureNotice,
    dismissEventSuccessNotice,
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
