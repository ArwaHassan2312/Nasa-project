import { useCallback, useEffect, useState } from 'react';
import { MOON_EVENTS } from '../data/moonEvents';
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

export type GameStatus = 'playing' | 'success' | 'failed';
export type ResourceLevels = Record<ResourceKey, number>;
export type EventPhase = 'idle' | 'pending' | 'presenting' | 'awaitingDecision' | 'resolving';
export type DayPhase = 'active' | 'closing' | 'report' | 'transition';

export interface DayReport {
  day: number;
  completedTasks: string[];
  overdueTasks: string[];
  resources: ResourceLevels;
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
  queuedEvents: { event: GameEvent; drainElapsedMs: number; presented: boolean }[];
  eventPhase: EventPhase;
  eventEffectId: string | null;
  flags: string[];
  gameStatus: GameStatus;
  failureReason: ResourceKey | null;
  decisionHistory: DecisionRecord[];
  eventHistory: EventOccurrence[];
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
export const LUNAR_DAY_DURATION_MS =  1* 60 * 1000;
const DAILY_TASK_COUNT = 3;
const DAY_TRANSITION_DURATION_MS = 3200;
const CLOCK_UPDATE_INTERVAL_MS = 1000;
// Task completion toast stays on screen for this long before auto-dismissing.
const CHALLENGE_FEEDBACK_DURATION_MS = 3000;

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
  const firstTaskIndex = (DAILY_CHALLENGES.length - 1 + (day - 1) * DAILY_TASK_COUNT)
    % DAILY_CHALLENGES.length;
  return Array.from({ length: Math.min(DAILY_TASK_COUNT, DAILY_CHALLENGES.length) }, (_, index) => {
    const challenge = DAILY_CHALLENGES[(firstTaskIndex + index) % DAILY_CHALLENGES.length]!;
    return {
      ...challenge,
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
    };
  });
}

function createInitialState(seed: number): GameState {
  return {
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
    flags: [],
    gameStatus: 'playing',
    failureReason: null,
    decisionHistory: [],
    eventHistory: [],
    faultHistory: [],
    postponementHistory: [],
    dailyChallenges: createDailyChallenges(),
    activeChallengeId: null,
    challengeHistory: [],
    challengeFeedback: null,
    warningTaskId: null,
  };
}

function prepareEventForReadiness(
  event: GameEvent,
  flags: string[],
  systemConditions: SystemConditions,
): GameEvent {
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
      event.id === 'power_failure'
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
    if (event.id === 'power_failure' && decision.id === 'C' && flags.includes('powerDebt')) {
      return {
        ...decision,
        effects: { ...decision.effects, power: -30 },
        cost: 'Power -30',
        risk: 'Existing power debt compounds the crisis',
      };
    }
    if (
      event.id === 'fire_lab'
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
    if (event.id === 'water_leak' && decision.id === 'B' && isPrepared('waterLineInspected')) {
      return {
        ...decision,
        effects: { ...decision.effects, equipment: -5 },
        benefit: 'Water +25; inspected repair points reduce spare-part use',
        cost: 'Equipment -5, Power -8',
      };
    }
    if (
      event.id === 'lunar_night'
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
      event.id === 'water_ice_exploration'
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
    if (event.id === 'solar_storm' && isPrepared('solarArrayInspected')) {
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
  const updatedResources = { ...resources };

  for (const [resource, change] of Object.entries(effects) as [ResourceKey, number][]) {
    updatedResources[resource] = Math.max(
      0,
      Math.min(MAX_RESOURCE_LEVEL, updatedResources[resource] + change),
    );
  }

  return updatedResources;
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
  elapsedMs: number,
): DailyChallenge {
  return {
    ...definition,
    id,
    priority: 'critical',
    deadlineDay: day + 1,
    conditionRecovery: 8,
    overdueConditionLoss: definition.urgentConditionLoss,
    postponement: {
      warning: `${definition.title} is an active emergency and cannot be postponed.`,
      riskOnlyConsequence: definition.riskIfDelayed,
    },
    emergency: true,
    status: 'inProgress',
    startedDay: day,
    completedDay: null,
    postponed: false,
    deadlineMissed: false,
    overdueEffectApplied: false,
    postponementEffectApplied: false,
    urgentStartedAtMs: elapsedMs,
    urgentDeadlineAtMs: elapsedMs + definition.responseDeadlineMs,
    escalationAtMs: elapsedMs + definition.responseDeadlineMs + definition.escalationDelayMs,
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
      resources = applyEffects(resources, challenge.urgentResourceEffects ?? {});
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
      resources = applyEffects(resources, nextChallenge.escalationResourceEffects ?? {});
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
  if (state.currentEvent || state.queuedEvents.length > 0) return state;
  return {
    ...state,
    dayPhase: 'report',
    dayReport: {
      day: state.day,
      completedTasks: state.dailyChallenges
        .filter((task) => task.status === 'completed')
        .map((task) => task.title),
      overdueTasks: state.dailyChallenges
        .filter((task) => task.status !== 'completed')
        .map((task) => task.title),
      resources: { ...state.resources },
    },
  };
}

function queueOverdueTaskEvents(state: GameState): GameState {
  const alreadyQueued = new Set([
    ...(state.currentEvent ? [state.currentEvent.id] : []),
    ...state.queuedEvents.map(({ event }) => event.id),
  ]);
  const triggeredEvents: GameEvent[] = [];

  for (const task of state.dailyChallenges) {
    if (task.status !== 'overdue') continue;
    const relatedEvent = MOON_EVENTS.find((event) => (
      event.riskTaskIds?.includes(task.id)
      && !alreadyQueued.has(event.id)
      && !event.preventedByFlags?.some((flag) => state.flags.includes(flag))
      && state.eventHistory.filter((entry) => entry.eventId === event.id).length < event.maxOccurrences
    ));
    if (!relatedEvent) continue;

    const event = prepareEventForReadiness(
      { ...relatedEvent, day: state.day },
      state.flags,
      state.systemConditions,
    );
    triggeredEvents.push(event);
    alreadyQueued.add(event.id);
  }

  if (triggeredEvents.length === 0) return state;

  const eventHistory = [
    ...state.eventHistory,
    ...triggeredEvents.map((event) => ({
      eventId: event.id,
      day: state.day,
      elapsedMs: state.campaignElapsedMs,
    })),
  ];
  if (state.currentEvent && state.eventPhase === 'awaitingDecision') {
    const currentEvent = triggeredEvents[0];
    if (!currentEvent) return state;
    const queuedEvents = triggeredEvents.slice(1);
    return {
      ...state,
      currentEvent,
      queuedEvents: [
        ...state.queuedEvents,
        {
          event: state.currentEvent,
          drainElapsedMs: state.eventDrainElapsedMs,
          presented: true,
        },
        ...queuedEvents.map((event) => ({ event, drainElapsedMs: 0, presented: false })),
      ],
      eventPhase: 'pending',
      eventDrainElapsedMs: 0,
      eventEffectId: currentEvent.id,
      eventHistory,
    };
  }
  if (state.currentEvent) {
    return {
      ...state,
      queuedEvents: [
        ...state.queuedEvents,
        ...triggeredEvents.map((event) => ({
          event,
          drainElapsedMs: 0,
          presented: false,
        })),
      ],
      eventHistory,
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
      ...queuedEvents.map((event) => ({ event, drainElapsedMs: 0, presented: false })),
    ],
    eventPhase: 'pending',
    eventDrainElapsedMs: 0,
    eventEffectId: currentEvent.id,
    eventHistory,
  };
}

function beginDayClosing(state: GameState, dayDurationMs: number): GameState {
  if (state.dayPhase !== 'active') return state;

  const resources = applyEffects(state.resources, DAILY_CONSUMPTION);
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
  closingState = queueOverdueTaskEvents(closingState);
  return createDayReport(closingState);
}

function createNextDayChallenges(state: GameState, day: number): DailyChallenge[] {
  const freshChallenges = createDailyChallenges(day);
  const carryOverTasks = state.dailyChallenges.filter((task) => (
    task.status === 'overdue' || (task.emergency && task.status !== 'completed')
  ));
  const carryOverIds = new Set(carryOverTasks.map((task) => task.id));
  const remainingTaskSlots = Math.max(0, DAILY_TASK_COUNT - carryOverTasks.length);
  const newDailyTasks = freshChallenges
    .filter((task) => !carryOverIds.has(task.id))
    .slice(0, remainingTaskSlots);
  return [...carryOverTasks, ...newDailyTasks];
}

function advanceClockState(
  initialState: GameState,
  elapsedMs: number,
  dayDurationMs: number,
): GameState {
  let nextState = initialState;
  if (nextState.dayPhase === 'report' || nextState.dayPhase === 'transition') return nextState;
  const hasUnfinishedTasks = nextState.dailyChallenges.some((task) => task.status !== 'completed');
  let remainingMs = elapsedMs * (hasUnfinishedTasks ? 0.5 : 1);

  while (
    remainingMs > 0
    && nextState.gameStatus === 'playing'
    && !nextState.warningTaskId
  ) {
    const untilDayEnd = nextState.dayPhase === 'active'
      ? dayDurationMs - nextState.dayElapsedMs
      : Number.POSITIVE_INFINITY;
    const untilSchedulerCheck = EVENT_SCHEDULER_CONFIG.checkIntervalMs
      - nextState.schedulerElapsedMs;
    const untilTaskTransition = nextState.dailyChallenges.reduce((nearest, challenge) => {
      if (challenge.status === 'completed') return nearest;
      const transitionAt = !challenge.urgentConsequenceApplied
        ? challenge.urgentDeadlineAtMs
        : !challenge.escalationApplied
          ? challenge.escalationAtMs
          : null;
      if (transitionAt === null) return nearest;
      const remaining = transitionAt - nextState.campaignElapsedMs;
      return remaining > 0 ? Math.min(nearest, remaining) : nearest;
    }, Number.POSITIVE_INFINITY);
    const step = Math.min(remainingMs, untilDayEnd, untilSchedulerCheck, untilTaskTransition);
    nextState = {
      ...nextState,
      dayElapsedMs: nextState.dayPhase === 'active'
        ? nextState.dayElapsedMs + step
        : nextState.dayElapsedMs,
      campaignElapsedMs: nextState.campaignElapsedMs + step,
      schedulerElapsedMs: nextState.schedulerElapsedMs + step,
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

    nextState = applyTimedTaskConsequences(nextState);
    if (nextState.gameStatus !== 'playing') return nextState;

    if (nextState.dayPhase === 'active' && nextState.dayElapsedMs >= dayDurationMs) {
      nextState = beginDayClosing(nextState, dayDurationMs);
      if (nextState.gameStatus !== 'playing') return nextState;
      if (nextState.dayPhase === 'report') return nextState;
    }

    if (nextState.schedulerElapsedMs >= EVENT_SCHEDULER_CONFIG.checkIntervalMs) {
      nextState = { ...nextState, schedulerElapsedMs: 0 };
      const selection = selectMajorEvent({
        events: nextState.dayPhase === 'closing'
          ? MOON_EVENTS.filter((event) => (
            !nextState.currentEvent?.id || nextState.currentEvent.id !== event.id
          ) && !nextState.queuedEvents.some((queued) => queued.event.id === event.id)
            && nextState.dailyChallenges.some((task) => (
              task.status === 'overdue' && event.riskTaskIds?.includes(task.id)
            )))
          : MOON_EVENTS,
        day: nextState.day,
        maxDays: nextState.maxDays,
        dayDurationMs,
        elapsedMs: nextState.campaignElapsedMs,
        rngState: nextState.rngState,
        flags: nextState.flags,
        systemConditions: nextState.systemConditions,
        resources: nextState.resources,
        eventHistory: nextState.eventHistory,
        overdueTaskIds: nextState.dailyChallenges
          .filter((challenge) => challenge.status === 'overdue')
          .map((challenge) => challenge.id),
      }, EVENT_SCHEDULER_CONFIG.checkIntervalMs);
      nextState = { ...nextState, rngState: selection.rngState };
      if (selection.event) {
        const event = prepareEventForReadiness(
          { ...selection.event, day: nextState.day },
          nextState.flags,
          nextState.systemConditions,
        );
        const activeEvent = nextState.currentEvent;
        const isShowingDecision = nextState.eventPhase === 'awaitingDecision';
        const isPresentingEvent = nextState.eventPhase === 'pending'
          || nextState.eventPhase === 'presenting';
        nextState = {
          ...nextState,
          ...(activeEvent && isShowingDecision
            ? {
              // Put the unresolved incident aside while the new incident gets
              // its camera presentation and decision focus.
              currentEvent: event,
              queuedEvents: [
                ...nextState.queuedEvents,
                {
                  event: activeEvent,
                  drainElapsedMs: nextState.eventDrainElapsedMs,
                  presented: true,
                },
              ],
              eventPhase: 'pending' as const,
              eventDrainElapsedMs: 0,
              eventEffectId: event.id,
            }
            : activeEvent && isPresentingEvent
              ? {
                // Finish the camera move already in progress, then present
                // this incident before returning to any decision screens.
                queuedEvents: [
                  ...nextState.queuedEvents,
                  { event, drainElapsedMs: 0, presented: false },
                ],
              }
              : {
                // This also handles a new incident arriving while the previous
                // choice is resolving; that choice has already been applied.
                currentEvent: event,
                eventPhase: 'pending' as const,
                eventDrainElapsedMs: 0,
                eventEffectId: event.id,
              }),
          eventHistory: [
            ...nextState.eventHistory,
            {
              eventId: event.id,
              day: nextState.day,
              elapsedMs: nextState.campaignElapsedMs,
            },
          ],
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

  const advanceClock = useCallback((elapsedMs: number) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.dayPhase === 'report' ||
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
      !enabled ||
      state.gameStatus !== 'playing' ||
      state.dayPhase === 'report' ||
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
  ]);

  useEffect(() => {
    if (state.dayPhase !== 'transition') return undefined;
    const transitionDay = state.day;
    const timerId = window.setTimeout(() => {
      setState((currentState) => (
        currentState.dayPhase === 'transition' && currentState.day === transitionDay
          ? { ...currentState, dayPhase: 'active' }
          : currentState
      ));
    }, DAY_TRANSITION_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [state.day, state.dayPhase]);

  const beginPresentation = useCallback((eventId: string) => {
    setState((currentState) => {
      if (
        currentState.currentEvent?.id !== eventId ||
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
        currentState.currentEvent?.id !== eventId ||
        currentState.eventPhase !== 'presenting'
      ) {
        return currentState;
      }
      const nextPresentationIndex = currentState.queuedEvents.findIndex(
        (queued) => !queued.presented,
      );
      if (nextPresentationIndex < 0) {
        return { ...currentState, eventPhase: 'awaitingDecision' };
      }

      const nextQueuedEvent = currentState.queuedEvents[nextPresentationIndex];
      const remainingQueuedEvents = currentState.queuedEvents.filter(
        (_queued, index) => index !== nextPresentationIndex,
      );
      return {
        ...currentState,
        currentEvent: nextQueuedEvent.event,
        queuedEvents: [
          ...remainingQueuedEvents,
          {
            event: currentState.currentEvent,
            drainElapsedMs: currentState.eventDrainElapsedMs,
            presented: true,
          },
        ],
        eventPhase: 'pending',
        eventDrainElapsedMs: nextQueuedEvent.drainElapsedMs,
        eventEffectId: nextQueuedEvent.event.id,
      };
    });
  }, []);

  const makeDecision = useCallback((decision: Decision) => {
    setState((currentState) => {
      const event = currentState.currentEvent;
      if (
        currentState.gameStatus !== 'playing' ||
        !event ||
        currentState.eventPhase !== 'awaitingDecision' ||
        !event.decisions.some((option) => option.id === decision.id)
      ) {
        return currentState;
      }

      const resources = applyEffects(currentState.resources, decision.effects);
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
      const actualEffects = (Object.entries(decision.effects) as [ResourceKey, number][])
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
      const resolvedLinkedTasks = currentState.dailyChallenges.filter((task) => (
        task.status === 'overdue' && event.riskTaskIds?.includes(task.id)
      ));
      const linkedTaskIds = new Set(resolvedLinkedTasks.map((task) => task.id));
      const nextFlags = [...new Set([
        ...flags,
        ...resolvedLinkedTasks.map((task) => task.readinessFlag),
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
      const emergencyTask = event.emergencyTask
        ? createEmergencyChallenge(
          event.emergencyTask,
          `emergency-${event.id}-${currentState.eventHistory.length}`,
          event.day ?? currentState.day,
          currentState.campaignElapsedMs,
        )
        : null;

      return {
        ...currentState,
        resources,
        systemConditions,
        faultHistory,
        eventPhase: 'resolving',
        eventEffectId: null,
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
      };
    });
  }, []);

  const completeResolution = useCallback((eventId: string) => {
    setState((currentState) => {
      if (
        currentState.currentEvent?.id !== eventId ||
        currentState.eventPhase !== 'resolving'
      ) {
        return currentState;
      }
      const [nextQueuedEvent, ...remainingQueuedEvents] = currentState.queuedEvents;
      let nextState: GameState = {
        ...currentState,
        currentEvent: nextQueuedEvent?.event ?? null,
        queuedEvents: remainingQueuedEvents,
        eventPhase: nextQueuedEvent
          ? nextQueuedEvent.presented ? 'awaitingDecision' : 'pending'
          : 'idle',
        eventDrainElapsedMs: nextQueuedEvent?.drainElapsedMs ?? 0,
        eventEffectId: nextQueuedEvent?.event.id ?? null,
      };
      if (
        nextState.gameStatus === 'playing'
        && nextState.dayPhase === 'closing'
        && !nextState.currentEvent
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
        dailyChallenges: createNextDayChallenges(currentState, currentState.day + 1),
        activeChallengeId: null,
        warningTaskId: null,
        eventPhase: 'idle',
      };
      nextState = queueOverdueTaskEvents(nextState);
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

      return {
        ...currentState,
        activeChallengeId: challenge.id,
        challengeFeedback: null,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id
            ? {
              ...task,
              status: task.status === 'overdue' ? 'overdue' : 'inProgress',
              startedDay: task.startedDay ?? currentState.day,
              urgentStartedAtMs: task.urgentStartedAtMs
                ?? (task.responseDeadlineMs ? currentState.campaignElapsedMs : null),
              urgentDeadlineAtMs: task.urgentDeadlineAtMs
                ?? (task.responseDeadlineMs
                  ? currentState.campaignElapsedMs + task.responseDeadlineMs
                  : null),
              escalationAtMs: task.escalationAtMs
                ?? (task.responseDeadlineMs && task.escalationDelayMs
                  ? currentState.campaignElapsedMs + task.responseDeadlineMs + task.escalationDelayMs
                  : null),
            }
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
      const systemConditions = changeSystemCondition(
        currentState.systemConditions,
        challenge.affectedSystem,
        challenge.conditionRecovery,
      );

      let nextState: GameState = {
        ...currentState,
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
      if (nextState.dailyChallenges.every((task) => task.status === 'completed')) {
        nextState = beginDayClosing(nextState, dayDurationMs);
      }
      return nextState;
    });
  }, []);

  const requestDailyChallengePostponement = useCallback((challengeId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing'
        || !['idle', 'awaitingDecision'].includes(currentState.eventPhase)
        || currentState.warningTaskId
      ) return currentState;

      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (
        !challenge
        || challenge.status === 'completed'
        || challenge.status === 'overdue'
        || challenge.postponed
        || challenge.postponementEffectApplied
        || challenge.urgentStartedAtMs !== null
      ) return currentState;

      if (challenge.postponement.immediateConditionLoss) {
        return { ...currentState, warningTaskId: challenge.id };
      }

      return {
        ...currentState,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id ? { ...task, postponed: true } : task,
        ),
        postponementHistory: [
          ...currentState.postponementHistory,
          {
            day: currentState.day,
            taskTitle: challenge.title,
            system: challenge.affectedSystem,
            consequence: challenge.postponement.riskOnlyConsequence,
          },
        ],
        challengeFeedback: challenge.postponement.riskOnlyConsequence,
      };
    });
  }, []);

  const cancelDailyChallengePostponement = useCallback(() => {
    setState((currentState) => (
      currentState.warningTaskId
        ? { ...currentState, warningTaskId: null }
        : currentState
    ));
  }, []);

  const confirmDailyChallengePostponement = useCallback(() => {
    setState((currentState) => {
      const challenge = currentState.dailyChallenges.find(
        (task) => task.id === currentState.warningTaskId,
      );
      if (
        currentState.gameStatus !== 'playing'
        || !challenge
        || challenge.status === 'completed'
        || challenge.postponementEffectApplied
      ) {
        return { ...currentState, warningTaskId: null };
      }

      const loss = challenge.postponement.immediateConditionLoss ?? 0;
      const conditionChange = -loss;
      const conditionBefore = currentState.systemConditions[challenge.affectedSystem];
      const systemConditions = changeSystemCondition(
        currentState.systemConditions,
        challenge.affectedSystem,
        conditionChange,
      );
      const faultHistory = loss > 0
        ? [
          ...currentState.faultHistory,
          {
            day: currentState.day,
            system: challenge.affectedSystem,
            kind: 'postponement' as const,
            reason: `Confirmed postponement of ${challenge.title}`,
            change: systemConditions[challenge.affectedSystem] - conditionBefore,
          },
        ]
        : currentState.faultHistory;

      return {
        ...currentState,
        warningTaskId: null,
        systemConditions,
        faultHistory,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id
            ? { ...task, postponed: true, postponementEffectApplied: true }
            : task,
        ),
        postponementHistory: [
          ...currentState.postponementHistory,
          {
            day: currentState.day,
            taskTitle: challenge.title,
            system: challenge.affectedSystem,
            consequence: challenge.postponement.warning,
          },
        ],
        challengeFeedback: `Postponement confirmed: ${challenge.affectedSystem} condition fell by ${loss}. ${challenge.title} remains unfinished.`,
      };
    });
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState(seed ?? createRandomSeed()));
  }, [seed]);

  const testTaskEventTrigger = useCallback((challengeId: string) => {
    setState((currentState) => {
      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      const relatedEvent = MOON_EVENTS.find((event) => event.riskTaskIds?.includes(challengeId));
      if (
        currentState.gameStatus !== 'playing'
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
        overdueTaskIds: [challengeId],
      }, EVENT_SCHEDULER_CONFIG.checkIntervalMs);

      if (!selection.event) {
        return {
          ...currentState,
          challengeFeedback: `TEST PASSED: ${relatedEvent.name} was blocked by the completed ${challenge.title} task.`,
        };
      }

      const event = prepareEventForReadiness(
        { ...selection.event, day: currentState.day },
        currentState.flags,
        currentState.systemConditions,
      );
      return {
        ...currentState,
        rngState: selection.rngState,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challengeId
            ? { ...task, status: 'overdue', deadlineMissed: true }
            : task,
        ),
        currentEvent: event,
        eventPhase: 'pending',
        eventDrainElapsedMs: 0,
        eventEffectId: event.id,
        eventHistory: [
          ...currentState.eventHistory,
          { eventId: event.id, day: currentState.day, elapsedMs: currentState.campaignElapsedMs },
        ],
        challengeFeedback: `TEST: overdue ${challenge.title} triggered ${event.name}.`,
      };
    });
  }, [dayDurationMs]);

  const testTaskEventPrevention = useCallback((challengeId: string) => {
    setState((currentState) => {
      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      const relatedEvent = MOON_EVENTS.find((event) => event.riskTaskIds?.includes(challengeId));
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
        overdueTaskIds: [challengeId],
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

  // Notifications remain queued through event cinematics and dismiss only when
  // the idle gameplay state can actually display the toast.
  useEffect(() => {
    if (!state.challengeFeedback || state.eventPhase !== 'idle') return undefined;
    const timerId = window.setTimeout(
      () => dismissChallengeFeedback(),
      CHALLENGE_FEEDBACK_DURATION_MS,
    );
    return () => window.clearTimeout(timerId);
  }, [state.challengeFeedback, state.eventPhase, dismissChallengeFeedback]);

  return {
    ...state,
    dayDurationMs,
    timeOfDay: formatLunarTime(state.dayElapsedMs, dayDurationMs),
    remainingDays: state.gameStatus === 'playing'
      ? Math.max(0, state.maxDays - state.day + 1)
      : 0,
    isPaused: Boolean(state.warningTaskId),
    beginPresentation,
    completePresentation,
    completeResolution,
    advanceDay,
    startDailyChallenge,
    completeDailyChallenge,
    requestDailyChallengePostponement,
    cancelDailyChallengePostponement,
    confirmDailyChallengePostponement,
    dismissChallengeFeedback,
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
