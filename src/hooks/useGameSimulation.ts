import { useCallback, useEffect, useState } from 'react';
import { MOON_EVENTS } from '../data/moonEvents';
import type { Decision, GameEvent, ResourceKey } from '../data/moonEvents';
import { DAILY_CHALLENGES } from '../data/dailyChallenges';
import type { DailyChallengeDefinition } from '../data/dailyChallenges';

export type GameStatus = 'playing' | 'success' | 'failed';
export type ResourceLevels = Record<ResourceKey, number>;
export type EventPhase = 'idle' | 'pending' | 'presenting' | 'awaitingDecision' | 'resolving';

export interface DecisionRecord {
  day: number;
  eventName: string;
  decisionLabel: string;
  lesson: string;
  futureConsequence: string;
}

export interface GameSimulationOptions {
  enabled?: boolean;
  dayDurationMs?: number;
}

export type DailyChallengeStatus = 'available' | 'inProgress' | 'completed';
export interface DailyChallenge extends DailyChallengeDefinition {
  status: DailyChallengeStatus;
  startedDay: number | null;
  completedDay: number | null;
}

export interface DailyChallengeCompletion {
  id: string;
  title: string;
  day: number;
}

interface GameState {
  day: number;
  maxDays: number;
  dayElapsedMs: number;
  resources: ResourceLevels;
  currentEvent: GameEvent | null;
  eventPhase: EventPhase;
  eventEffectId: string | null;
  flags: string[];
  gameStatus: GameStatus;
  failureReason: ResourceKey | null;
  decisionHistory: DecisionRecord[];
  dailyChallenges: DailyChallenge[];
  activeChallengeId: string | null;
  challengeHistory: DailyChallengeCompletion[];
  challengeFeedback: string | null;
}


const MAX_RESOURCE_LEVEL = 100;
export const MISSION_LENGTH_DAYS = 30;
export const LUNAR_DAY_DURATION_MS = 1 * 60 * 1000;
const CLOCK_UPDATE_INTERVAL_MS = 1000;

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

function createDailyChallenges(): DailyChallenge[] {
  return DAILY_CHALLENGES.map((challenge) => ({
    ...challenge,
    status: 'available',
    startedDay: null,
    completedDay: null,
  }));
}

function createInitialState(): GameState {
  return {
    day: 1,
    maxDays: MISSION_LENGTH_DAYS,
    dayElapsedMs: 0,
    resources: { ...INITIAL_RESOURCES },
    currentEvent: null,
    eventPhase: 'idle',
    eventEffectId: null,
    flags: [],
    gameStatus: 'playing',
    failureReason: null,
    decisionHistory: [],
    dailyChallenges: createDailyChallenges(),
    activeChallengeId: null,
    challengeHistory: [],
    challengeFeedback: null,
  };
}

function prepareEventForReadiness(event: GameEvent, flags: string[]): GameEvent {
  const decisions = event.decisions.map((decision) => {
    if (event.id === 'power_failure' && decision.id === 'B' && flags.includes('batteryReadinessVerified')) {
      return {
        ...decision,
        effects: { ...decision.effects, battery: -15 },
        benefit: 'Power +20; verified reserve used efficiently',
        cost: 'Battery -15',
      };
    }
    if (event.id === 'fire_lab' && decision.id === 'B' && flags.includes('workshopMaintenanceComplete')) {
      return {
        ...decision,
        effects: { ...decision.effects, equipment: -2 },
        benefit: 'Science +5; calibrated equipment limits equipment loss',
        cost: 'Health -8, Oxygen -3, Equipment -2',
      };
    }
    if (event.id === 'water_leak' && decision.id === 'B' && flags.includes('waterLineInspected')) {
      return {
        ...decision,
        effects: { ...decision.effects, equipment: -5 },
        benefit: 'Water +25; inspected repair points reduce spare-part use',
        cost: 'Equipment -5, Power -8',
      };
    }
    return decision;
  });

  return { ...event, decisions };
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
  return VITAL_RESOURCES.find((resource) => resources[resource] <= 0) ?? null;
}

function advanceClockState(
  initialState: GameState,
  elapsedMs: number,
  dayDurationMs: number,
): GameState {
  let nextState = initialState;
  let remainingMs = elapsedMs;

  while (remainingMs > 0 && nextState.gameStatus === 'playing' && !nextState.currentEvent) {
    const dayProgressMs = nextState.dayElapsedMs + remainingMs;
    if (dayProgressMs < dayDurationMs) {
      return { ...nextState, dayElapsedMs: dayProgressMs };
    }

    remainingMs = dayProgressMs - dayDurationMs;
    const decay = Object.fromEntries(
      Object.entries(DAILY_CONSUMPTION).map(([resource, amount]) => [
        resource,
        -amount,
      ]),
    ) as Partial<Record<ResourceKey, number>>;
    const resources = applyEffects(nextState.resources, decay);
    const failedVital = findFailedVital(resources);

    if (failedVital) {
      return {
        ...nextState,
        dayElapsedMs: dayDurationMs,
        resources,
        gameStatus: 'failed',
        failureReason: failedVital,
      };
    }

    if (nextState.day >= nextState.maxDays) {
      return {
        ...nextState,
        dayElapsedMs: dayDurationMs,
        resources,
        gameStatus: 'success',
        currentEvent: null,
        eventPhase: 'idle',
        eventEffectId: null,
      };
    }

    const day = nextState.day + 1;
    const scheduledEvent = MOON_EVENTS.find((candidate) => candidate.day === day) ?? null;
    const event = scheduledEvent
      ? prepareEventForReadiness(scheduledEvent, nextState.flags)
      : null;
    nextState = {
      ...nextState,
      day,
      dayElapsedMs: 0,
      resources,
      currentEvent: event,
      eventPhase: event ? 'pending' : 'idle',
      eventEffectId: event?.id ?? null,
    };

    if (event) return nextState;
  }

  return nextState;
}

export function useGameSimulation({
  enabled = true,
  dayDurationMs = LUNAR_DAY_DURATION_MS,
}: GameSimulationOptions = {}) {
  const [state, setState] = useState<GameState>(createInitialState);

  const advanceClock = useCallback((elapsedMs: number) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.currentEvent ||
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
      state.currentEvent ||
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
  }, [advanceClock, dayDurationMs, enabled, state.currentEvent, state.gameStatus]);

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
      return { ...currentState, eventPhase: 'awaitingDecision' };
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
      const flags = decision.setFlags
        ? [...new Set([...currentState.flags, ...decision.setFlags])]
        : currentState.flags;

      return {
        ...currentState,
        resources,
        eventPhase: 'resolving',
        eventEffectId: null,
        flags,
        gameStatus: failedVital ? 'failed' : 'playing',
        failureReason: failedVital,
        decisionHistory: [
          ...currentState.decisionHistory,
          {
            day: event.day,
            eventName: event.name,
            decisionLabel: decision.label,
            lesson: event.lesson,
            futureConsequence: decision.futureConsequence,
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
      return {
        ...currentState,
        currentEvent: null,
        eventPhase: 'idle',
        eventEffectId: null,
      };
    });
  }, []);

  const startDailyChallenge = useCallback((challengeId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.eventPhase !== 'idle' ||
        currentState.currentEvent
      ) {
        return currentState;
      }

      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (!challenge || challenge.status !== 'available') return currentState;

      return {
        ...currentState,
        activeChallengeId: challenge.id,
        challengeFeedback: null,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id
            ? { ...task, status: 'inProgress', startedDay: currentState.day }
            : task,
        ),
      };
    });
  }, []);

  const completeDailyChallenge = useCallback((challengeId: string, componentId: string) => {
    setState((currentState) => {
      if (
        currentState.gameStatus !== 'playing' ||
        currentState.eventPhase !== 'idle' ||
        currentState.currentEvent
      ) {
        return currentState;
      }

      const challenge = currentState.dailyChallenges.find((task) => task.id === challengeId);
      if (
        !challenge ||
        challenge.status !== 'inProgress' ||
        challenge.targetComponentId !== componentId
      ) {
        return currentState;
      }

      return {
        ...currentState,
        dailyChallenges: currentState.dailyChallenges.map((task) =>
          task.id === challenge.id
            ? { ...task, status: 'completed', completedDay: currentState.day }
            : task,
        ),
        activeChallengeId: currentState.activeChallengeId === challenge.id
          ? currentState.dailyChallenges.find(
            (task) => task.id !== challenge.id && task.status === 'inProgress',
          )?.id ?? null
          : currentState.activeChallengeId,
        flags: currentState.flags.includes(challenge.readinessFlag)
          ? currentState.flags
          : [...currentState.flags, challenge.readinessFlag],
        challengeHistory: [
          ...currentState.challengeHistory,
          { id: challenge.id, title: challenge.title, day: currentState.day },
        ],
        challengeFeedback: challenge.completionFeedback,
      };
    });
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
  }, []);

  const dismissChallengeFeedback = useCallback(() => {
    setState((currentState) => (
      currentState.challengeFeedback
        ? { ...currentState, challengeFeedback: null }
        : currentState
    ));
  }, []);

  return {
    ...state,
    dayDurationMs,
    timeOfDay: formatLunarTime(state.dayElapsedMs, dayDurationMs),
    remainingDays: state.gameStatus === 'playing'
      ? Math.max(0, state.maxDays - state.day + 1)
      : 0,
    isPaused: state.eventPhase !== 'idle',
    beginPresentation,
    completePresentation,
    completeResolution,
    startDailyChallenge,
    completeDailyChallenge,
    dismissChallengeFeedback,
    makeDecision,
    restart,
  };
}

function formatLunarTime(dayElapsedMs: number, dayDurationMs: number): string {
  if (!Number.isFinite(dayDurationMs) || dayDurationMs <= 0) return '--:--';
  const elapsedMinutes = Math.floor((dayElapsedMs / dayDurationMs) * 24 * 60);
  const hours = Math.floor(elapsedMinutes / 60) % 24;
  const minutes = elapsedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
