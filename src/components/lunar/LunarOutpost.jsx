import { useEffect, useRef, useState } from 'react';
import { createLunarEngine } from './lunarOutpostEngine';
import EventModal from '../EventModal';
import EndGameReport from '../EndGameReport';
import './LunarOutpost.css';
import '../../simulation.css';

const RESOURCE_ITEMS = [
  ['power', 'Power reserve', '⚡'],
  ['battery', 'Battery', '▰'],
  ['oxygen', 'Oxygen reserve', '◉'],
  ['water', 'Water reserve', '◆'],
  ['food', 'Food', '✦'],
  ['habitat', 'Habitat', '⌂'],
  ['equipment', 'Equipment stock', '⚙'],
  ['health', 'Crew health', '♥'],
  ['radProtection', 'Radiation shield', '◈'],
  ['comms', 'Communications', '⌁'],
  ['science', 'Science', '✧'],
  ['emergencyReserve', 'Emergency reserve', '⬡'],
  ['potentialWater', 'Potential water', '❄']
];

const TASK_EVENT_TESTS = [
  ['workshop-equipment-maintenance', 'Workshop maintenance', 'Habitat fire'],
  ['solar-array-inspection', 'Solar array inspection', 'Power failure'],
  ['habitat-waterline-inspection', 'Waterline inspection', 'Water leak'],
];

function getSystemConditionLevel(value) {
  if (value === 0) return 'failed';
  if (value < 20) return 'severe';
  if (value < 40) return 'critical';
  if (value < 60) return 'degraded';
  if (value < 80) return 'stable';
  return 'healthy';
}

function formatRemainingTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function LunarOutpost({ onExitToOrbit, simulation }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const presentedEventRef = useRef(null);
  const returningEventRef = useRef(null);
  const dayStartCameraDayRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [cameraMode, setCameraMode] = useState('free');
  const [roverReady, setRoverReady] = useState(false);
  const [roverCameraActive, setRoverCameraActive] = useState(false);
  const [prompt, setPrompt] = useState({ type: null, data: null });
  const [insidePanel, setInsidePanel] = useState({
    visible: false,
    label: '',
    buttonText: '',
    componentId: null
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [dailyTasksOpen, setDailyTasksOpen] = useState(false);
  const [eventOptionsOpen, setEventOptionsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapOpenedAtDecisionCount, setMapOpenedAtDecisionCount] = useState(0);
  const [selectedMapTaskId, setSelectedMapTaskId] = useState(null);
  const [selectedMapComponentId, setSelectedMapComponentId] = useState(null);
  const [mapSnapshot, setMapSnapshot] = useState(null);
  const [miniSnapshot, setMiniSnapshot] = useState(null);
  const {
    eventPhase,
    currentEvent,
    beginPresentation,
    completePresentation,
    completeResolution,
    startDailyChallenge,
    completeDailyChallenge,
    requestDailyChallengePostponement,
    cancelDailyChallengePostponement,
    confirmDailyChallengePostponement,
    dismissChallengeFeedback,
  } = simulation;
  const eventGameplayActive = eventPhase === 'idle' || eventPhase === 'awaitingDecision';
  // Only tasks activated from the Daily Tasks list show a button in the inside
  // panel; available or completed tasks add no interior UI at all.
  const insideComponentTasks = insidePanel.componentId
    ? simulation.dailyChallenges.filter(
        (challenge) => challenge.targetComponentId === insidePanel.componentId
          && (challenge.status === 'inProgress' || challenge.status === 'overdue'),
      )
    : [];
  const promptedChallenge = simulation.dailyChallenges.find(
    (challenge) => (challenge.status === 'inProgress' || challenge.status === 'overdue')
      && challenge.targetComponentId === prompt.data?.id,
  );
  const taskActionRef = useRef(null);
  taskActionRef.current = (componentId, taskId) => {
    const challenge = taskId
      ? simulation.dailyChallenges.find((entry) => entry.id === taskId)
      : simulation.dailyChallenges.find(
        (entry) => (entry.status === 'inProgress' || entry.status === 'overdue')
          && entry.targetComponentId === componentId,
      );
    if (challenge && (challenge.status === 'inProgress' || challenge.status === 'overdue')) {
      completeDailyChallenge(challenge.id, challenge.targetComponentId);
    }
  };
  const [consoleEdit, setConsoleEdit] = useState(false);
  const [consoleInfo, setConsoleInfo] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const canvas = document.createElement('canvas');
    canvas.className = 'lunar-canvas';
    container.prepend(canvas);

    let engine = null;
    try {
      engine = createLunarEngine(canvas, {
        onLoading: (state) => setIsLoading(state.active),
        onModeChange: (mode) => setCameraMode(mode),
        onRoverReady: (ready) => setRoverReady(ready),
        onRoverCameraChange: (active) => setRoverCameraActive(active),
        onPromptChange: (type, data) => setPrompt({ type, data }),
        onInsidePanelChange: (panel) => setInsidePanel(panel),
        onTaskAction: (componentId, taskId) => taskActionRef.current?.(componentId, taskId),
        onConsoleEdit: (info) => setConsoleInfo(info)
      });
    } catch (error) {
      console.error('[LunarOutpost] Engine failed to start, retry on next mount.', error);
      if (canvas.parentNode) canvas.remove();
      return undefined;
    }

    engineRef.current = engine;

    return () => {
      try {
        engine?.destroy?.();
      } catch (error) {
        console.error('[LunarOutpost] Engine destroy failed.', error);
      }
      engineRef.current = null;
      if (canvas.parentNode) canvas.remove();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setEventEffect(simulation.eventEffectId);
  }, [simulation.eventEffectId]);

  useEffect(() => {
    if (simulation.dayPhase !== 'transition') {
      dayStartCameraDayRef.current = null;
      return;
    }
    if (dayStartCameraDayRef.current === simulation.day) return;

    dayStartCameraDayRef.current = simulation.day;
    engineRef.current?.returnToFirstPersonStart();
  }, [simulation.day, simulation.dayPhase]);

  useEffect(() => {
    engineRef.current?.setChallengeFlags(simulation.flags);
  }, [simulation.flags]);

  useEffect(() => {
    engineRef.current?.setTaskTargets?.(
      simulation.dailyChallenges.map((challenge) => ({
        componentId: challenge.targetComponentId,
        taskId: challenge.id,
        label: challenge.actionLabel,
        status: challenge.status,
      }))
    );
  }, [simulation.dailyChallenges]);

  useEffect(() => {
    engineRef.current?.setConsoleEditMode?.(consoleEdit);
  }, [consoleEdit]);

  // Keep interiors clean: entering a component closes the drawers, leaving
  // only the inside label, EXIT and MOVE buttons. Leaving resets console edit.
  const [prevInsidePanelVisible, setPrevInsidePanelVisible] = useState(false);
  if (prevInsidePanelVisible !== insidePanel.visible) {
    setPrevInsidePanelVisible(insidePanel.visible);
    if (insidePanel.visible) {
      setDailyTasksOpen(false);
      setStatusOpen(false);
    } else {
      setConsoleEdit(false);
    }
  }

  // Fallback: guarantee Enter works while a proximity prompt is visible,
  // even if the engine key handler missed it (e.g. focus quirks).
  useEffect(() => {
    if (!prompt.type || !['idle', 'awaitingDecision'].includes(simulation.eventPhase) || simulation.warningTaskId) return undefined;
    const onKey = (event) => {
      const key = (event.key || '').toLowerCase();
      const code = event.code || '';
      if (key !== 'enter' && code !== 'Enter' && code !== 'NumpadEnter') return;
      event.preventDefault();
      if (prompt.type === 'component') engineRef.current?.enterNearbyComponent();
      else if (prompt.type === 'airlock') engineRef.current?.enterAirlock();
      else if (prompt.type === 'greenhouseDoor') engineRef.current?.leaveGreenhouse();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompt.type, simulation.eventPhase, simulation.warningTaskId]);

  // Press M to open/close the full outpost map (same gating as the map entry points).
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return;
      if ((event.key || '').toLowerCase() !== 'm') return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (
        !eventGameplayActive
        || simulation.gameStatus !== 'playing'
        || simulation.warningTaskId
      ) return;
      event.preventDefault();
      if (mapOpen) {
        setMapOpen(false);
      } else {
        setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
        setMapOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    mapOpen,
    simulation.decisionHistory.length,
    eventGameplayActive,
    simulation.gameStatus,
    simulation.warningTaskId,
  ]);

  useEffect(() => {
    if (isLoading || simulation.gameStatus !== 'playing') return undefined;

    const updateMiniSnapshot = () => {
      const nextSnapshot = engineRef.current?.getMapSnapshot() ?? null;
      setMiniSnapshot((currentSnapshot) => {
        if (!nextSnapshot) return currentSnapshot;
        const samePlayer = currentSnapshot?.player === null && nextSnapshot.player === null
          || currentSnapshot?.player && nextSnapshot.player
            && Math.abs(currentSnapshot.player.x - nextSnapshot.player.x) < 0.3
            && Math.abs(currentSnapshot.player.z - nextSnapshot.player.z) < 0.3
            && Math.abs(currentSnapshot.player.yaw - nextSnapshot.player.yaw) < 0.05
            && currentSnapshot.player.location === nextSnapshot.player.location;
        if (
          currentSnapshot?.components === nextSnapshot.components
          && currentSnapshot.cameraMode === nextSnapshot.cameraMode
          && samePlayer
        ) {
          return currentSnapshot;
        }
        return nextSnapshot;
      });
    };

    updateMiniSnapshot();
    const miniIntervalId = window.setInterval(updateMiniSnapshot, 250);
    return () => window.clearInterval(miniIntervalId);
  }, [isLoading, simulation.gameStatus]);

  useEffect(() => {
    if (
      !mapOpen
      || mapOpenedAtDecisionCount !== simulation.decisionHistory.length
      || !eventGameplayActive
      || simulation.gameStatus !== 'playing'
    ) return undefined;

    const updateMapSnapshot = () => {
      const nextSnapshot = engineRef.current?.getMapSnapshot() ?? null;
      setMapSnapshot((currentSnapshot) => {
        if (!nextSnapshot) return currentSnapshot;
        const samePlayer = currentSnapshot?.player === null && nextSnapshot.player === null
          || currentSnapshot?.player && nextSnapshot.player
            && Math.abs(currentSnapshot.player.x - nextSnapshot.player.x) < 0.35
            && Math.abs(currentSnapshot.player.z - nextSnapshot.player.z) < 0.35
            && Math.abs(currentSnapshot.player.yaw - nextSnapshot.player.yaw) < 0.06;
        if (
          currentSnapshot?.components === nextSnapshot.components
          && currentSnapshot.cameraMode === nextSnapshot.cameraMode
          && samePlayer
        ) {
          return currentSnapshot;
        }
        return nextSnapshot;
      });
    };

    updateMapSnapshot();
    const intervalId = window.setInterval(updateMapSnapshot, 200);
    return () => window.clearInterval(intervalId);
  }, [eventGameplayActive, eventPhase, mapOpen, mapOpenedAtDecisionCount, simulation.decisionHistory.length, simulation.gameStatus]);

  useEffect(() => {
    const event = currentEvent;
    if (!event) {
      presentedEventRef.current = null;
      returningEventRef.current = null;
      setEventOptionsOpen(false);
      return;
    }

    if (eventPhase === 'pending') {
      beginPresentation(event.id);
      return;
    }

    if (
      eventPhase === 'presenting' &&
      presentedEventRef.current !== event
    ) {
      presentedEventRef.current = event;
      engineRef.current?.presentEvent(event.id, () => {
        completePresentation(event.id);
      });
      return;
    }

    if (
      eventPhase === 'resolving' &&
      returningEventRef.current !== event
    ) {
      returningEventRef.current = event;
      engineRef.current?.returnFromEvent(() => {
        completeResolution(event.id);
      });
    }
  }, [
    beginPresentation,
    completePresentation,
    completeResolution,
    currentEvent,
    eventPhase,
  ]);

  const selectedMapTask = simulation.dailyChallenges.find(
    (challenge) => challenge.id === selectedMapTaskId,
  );
  const mapIsOpen = mapOpen
    && mapOpenedAtDecisionCount === simulation.decisionHistory.length
    && eventGameplayActive
    && simulation.gameStatus === 'playing';
  const mapSpan = mapSnapshot
    ? Math.max(
      mapSnapshot.bounds.maxX - mapSnapshot.bounds.minX,
      mapSnapshot.bounds.maxZ - mapSnapshot.bounds.minZ,
    )
    : 1;
  const mapPadding = mapSpan * 0.09;
  const mapViewBox = mapSnapshot
    ? `${mapSnapshot.bounds.minX - mapPadding} ${-mapSnapshot.bounds.maxZ - mapPadding} ${mapSnapshot.bounds.maxX - mapSnapshot.bounds.minX + mapPadding * 2} ${mapSnapshot.bounds.maxZ - mapSnapshot.bounds.minZ + mapPadding * 2}`
    : undefined;
  const miniFitBounds = (() => {
    if (!miniSnapshot) return null;
    const base = miniSnapshot.bounds;
    const player = miniSnapshot.player;
    return {
      minX: Math.min(base.minX, player?.x ?? Number.POSITIVE_INFINITY),
      maxX: Math.max(base.maxX, player?.x ?? Number.NEGATIVE_INFINITY),
      minZ: Math.min(base.minZ, player?.z ?? Number.POSITIVE_INFINITY),
      maxZ: Math.max(base.maxZ, player?.z ?? Number.NEGATIVE_INFINITY),
    };
  })();
  const miniSpan = miniFitBounds
    ? Math.max(
      miniFitBounds.maxX - miniFitBounds.minX,
      miniFitBounds.maxZ - miniFitBounds.minZ,
    )
    : 1;
  const miniPadding = miniSpan * 0.3;
  const miniViewBox = miniFitBounds
    ? `${miniFitBounds.minX - miniPadding} ${-miniFitBounds.maxZ - miniPadding} ${miniFitBounds.maxX - miniFitBounds.minX + miniPadding * 2} ${miniFitBounds.maxZ - miniFitBounds.minZ + miniPadding * 2}`
    : undefined;
  const miniMarkerMargin = miniSpan * 0.04;
  const miniPlayerX = miniSnapshot?.player && miniFitBounds
    ? Math.min(
      Math.max(miniSnapshot.player.x, miniFitBounds.minX - miniPadding + miniMarkerMargin),
      miniFitBounds.maxX + miniPadding - miniMarkerMargin,
    )
    : 0;
  const miniPlayerZ = miniSnapshot?.player && miniFitBounds
    ? Math.min(
      Math.max(miniSnapshot.player.z, miniFitBounds.minZ - miniPadding + miniMarkerMargin),
      miniFitBounds.maxZ + miniPadding - miniMarkerMargin,
    )
    : 0;
  const showMinimap = miniSnapshot && miniViewBox
    && !isLoading
    && !mapIsOpen
    && simulation.gameStatus === 'playing'
    && eventGameplayActive;
  const systemEntries = [
    ['power', 'Power System'],
    ['lifeSupport', 'Life Support'],
    ['water', 'Water System'],
    ['equipment', 'Equipment'],
  ];
  const lowestSystem = systemEntries.reduce((lowest, entry) => (
    simulation.systemConditions[entry[0]] < simulation.systemConditions[lowest[0]]
      ? entry
      : lowest
  ), systemEntries[0]);
  const averageCondition = systemEntries.reduce(
    (total, [system]) => total + simulation.systemConditions[system],
    0,
  ) / systemEntries.length;
  const overdueTasks = simulation.dailyChallenges.filter((task) => task.status === 'overdue');
  const activeTask = simulation.dailyChallenges.find(
    (task) => task.status === 'inProgress' || task.status === 'overdue',
  );
  const vitalRisk = simulation.resources.power <= 20
    || simulation.resources.oxygen <= 20
    || simulation.resources.water <= 20;
  const averageVitalReserve = (
    simulation.resources.power + simulation.resources.oxygen + simulation.resources.water
  ) / 3;
  const overallReadiness = Math.max(
    0,
    Math.round(averageCondition * 0.7 + averageVitalReserve * 0.3 - overdueTasks.length * 3),
  );
  const readinessLevel = vitalRisk
    || simulation.systemConditions[lowestSystem[0]] <= 25
    || overallReadiness < 45
    ? 'Critical'
    : overdueTasks.length > 0 || overallReadiness < 75
      ? 'At Risk'
      : 'Ready';
  const readinessForecast = vitalRisk
    ? 'Vital consumable reserves are critically low; protect the affected operations.'
    : simulation.systemConditions[lowestSystem[0]] < 75
    ? `${lowestSystem[1]} may face elevated risk.`
    : overdueTasks.length > 0
      ? 'Overdue maintenance is increasing operational risk.'
      : 'No elevated system-specific threat is indicated; continue routine maintenance.';
  const matchingSystemTask = simulation.dailyChallenges.find(
    (task) => task.affectedSystem === lowestSystem[0] && task.status !== 'completed',
  );
  const readinessRecommendation = overdueTasks[0]
    ? `Recover ${overdueTasks[0].title} (deadline Day ${overdueTasks[0].deadlineDay}).`
    : vitalRisk
      ? 'Conserve power, oxygen, and water while prioritizing maintenance.'
      : matchingSystemTask
        ? `Prioritize ${matchingSystemTask.title} (deadline Day ${matchingSystemTask.deadlineDay}).`
        : `Review ${lowestSystem[1].toLowerCase()} maintenance.`;
  const warningTask = simulation.dailyChallenges.find(
    (task) => task.id === simulation.warningTaskId,
  );

  return (
    <div className="lunar-root" ref={containerRef}>
      <div className="lunar-grain" />
      <div className="lunar-shade" />
    {simulation.eventEffectId === 'lunar_night' && (
      <div className="lunar-night-overlay" aria-hidden="true" />
    )}

      {/* Simple Loading Indicator */}
      {isLoading && (
        <div className="lunar-simple-loader">
          <div className="lunar-simple-spinner" />
          <span>LOADING LUNAR OUTPOST...</span>
        </div>
      )}

      {/* Crosshair in First Person / interior - needed to aim at the task console */}
      {(cameraMode === 'interior' || (eventGameplayActive && cameraMode !== 'free' && !insidePanel.visible)) && (
        <div className="lunar-crosshair" />
      )}

      {/* Clean HUD: Mission Control & Camera Mode Toggle */}
      <div className="lunar-hud-clean">
        {onExitToOrbit && (
          <button
            type="button"
            className="lunar-orbit-btn"
            onClick={onExitToOrbit}
            title="Return to Mission Control"
          >
            <span>←</span> MISSION CONTROL
          </button>
        )}

        <div className="lunar-mission-status" aria-live="polite">
          <span className="lunar-status-dot" />
          <span>DAY {simulation.day} / {simulation.maxDays}</span>
          <span className="lunar-status-divider">·</span>
          <span>{simulation.dayPhase === 'closing' || simulation.dayPhase === 'report' ? '24:00' : simulation.timeOfDay} LUNAR</span>
          <span className="lunar-status-divider">·</span>
          <span>{simulation.remainingDays} DAYS LEFT</span>
          <span className="lunar-status-divider">·</span>
          <span>
            {simulation.warningTaskId
              ? 'TASK DECISION PAUSED'
              : simulation.isPaused
                ? 'TASK DECISION PAUSED'
                : simulation.gameStatus === 'playing'
                  ? `READINESS ${readinessLevel.toUpperCase()}`
                  : 'MISSION ENDED'}
          </span>
        </div>

        <div className="lunar-actions-group">
          {simulation.eventPhase === 'awaitingDecision' && simulation.currentEvent && (
            <button
              type="button"
              className="lunar-event-alert-button"
              aria-expanded={eventOptionsOpen}
              aria-controls="event-title"
              onClick={() => setEventOptionsOpen(true)}
            >
              <span className="lunar-event-alert-pulse" aria-hidden="true" />
              RED ALERT · {simulation.currentEvent.name}
              {simulation.queuedEvents.length > 0 && ` · ${simulation.queuedEvents.length} MORE INCIDENT${simulation.queuedEvents.length === 1 ? '' : 'S'}`}
            </button>
          )}
          {!insidePanel.visible && (
            <>
              <button
                type="button"
                className="lunar-btn lunar-status-toggle"
                aria-expanded={dailyTasksOpen}
                aria-controls="lunar-daily-tasks"
                disabled={!eventGameplayActive || simulation.gameStatus !== 'playing'}
                onClick={() => setDailyTasksOpen((open) => !open)}
              >
                DAILY TASKS
              </button>
              <button
                type="button"
                className="lunar-btn lunar-status-toggle"
                aria-expanded={statusOpen}
                aria-controls="lunar-status-drawer"
                disabled={!eventGameplayActive}
                onClick={() => setStatusOpen((open) => !open)}
              >
                 OUTPOST STATUS
              </button>
            </>
          )}
          {insidePanel.visible ? (
            <div className="lunar-inside-panel">
              <span>{insidePanel.label}</span>
              {insideComponentTasks.map((challenge) => (
                <div className="lunar-task-inline-action-wrap" key={challenge.id}>
                  <button
                    type="button"
                    className="lunar-task-inline-action"
                    title={`${challenge.title} — verify this task now`}
                    disabled={!eventGameplayActive || simulation.gameStatus !== 'playing'}
                    onClick={() => completeDailyChallenge(challenge.id, challenge.targetComponentId)}
                  >
                    {challenge.actionLabel}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => engineRef.current?.exitAirlock()}
              >
                {insidePanel.buttonText || 'EXIT'}
              </button>
              <button
                type="button"
                className={consoleEdit ? 'lunar-console-edit-active' : ''}
                title="Move / resize the task console"
                onClick={() => setConsoleEdit((editing) => !editing)}
              >
                {consoleEdit ? 'DONE' : 'MOVE'}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`lunar-btn ${cameraMode === 'first-person' ? 'active' : ''}`}
                disabled={roverCameraActive || !['idle', 'awaitingDecision'].includes(simulation.eventPhase) || simulation.gameStatus !== 'playing'}
                onClick={() => engineRef.current?.toggleCameraMode()}
              >
                {cameraMode === 'free' ? 'FIRST PERSON' : 'FREE CAMERA'}
              </button>
              <button
                type="button"
                className={`lunar-btn ${roverCameraActive ? 'active' : ''}`}
                aria-pressed={roverCameraActive}
                disabled={!roverCameraActive && (!roverReady || cameraMode === 'interior' || !eventGameplayActive || simulation.gameStatus !== 'playing')}
                onClick={() => engineRef.current?.toggleRoverCamera()}
                title={roverReady ? 'Switch between player view and rover follow camera' : 'Loading rover'}
              >
                {roverCameraActive ? 'PLAYER CAMERA' : roverReady ? 'ROVER CAMERA' : 'LOADING ROVER'}
              </button>
            </>
          )}
        </div>
      </div>

      {cameraMode !== 'interior' && (
        <div className="lunar-rover-help" role="note" aria-label="Rover keyboard controls">
          {roverCameraActive ? (
            <>
              <strong>ROVER</strong>
              <span>DRAG MOUSE TO ORBIT</span>
              <span>SCROLL TO ZOOM</span>
              <span><kbd>↑</kbd> DRIVE</span>
              <span><kbd>←</kbd> <kbd>→</kbd> STEER</span>
              <span><kbd>↓</kbd> REVERSE</span>
            </>
          ) : (
            <span>PLAYER CAMERA Â· ARROWS MOVE PLAYER Â· PRESS V OR SELECT ROVER CAMERA TO DRIVE</span>
          )}
        </div>
      )}

      {import.meta.env.DEV && (
        <details className="lunar-event-test-tools">
          <summary>TEST TASK ↔ EVENT LINKS</summary>
          {TASK_EVENT_TESTS.map(([challengeId, taskLabel, eventLabel]) => (
            <div className="lunar-event-test-row" key={challengeId}>
              <span>{taskLabel} / {eventLabel}</span>
              <button
                type="button"
                disabled={simulation.gameStatus !== 'playing' || Boolean(simulation.currentEvent) || Boolean(simulation.warningTaskId)}
                onClick={() => simulation.testTaskEventTrigger(challengeId)}
              >
                TEST OVERDUE TRIGGER
              </button>
              <button
                type="button"
                disabled={simulation.gameStatus !== 'playing' || Boolean(simulation.currentEvent) || Boolean(simulation.warningTaskId)}
                onClick={() => simulation.testTaskEventPrevention(challengeId)}
              >
                TEST COMPLETION BLOCK
              </button>
            </div>
          ))}
        </details>
      )}

      {/* Task console editor (positioning only, no coordinates) */}
      {consoleEdit && insidePanel.visible && (
        <div className="lunar-console-editor" role="status" aria-label="Task console position editor">
          <div className="lunar-console-editor-title">
            <span>CONSOLE · {consoleInfo?.kind ? consoleInfo.kind.toUpperCase() : ''}</span>
          </div>
          <small>Drag the button to move it · mouse wheel resizes · saved automatically</small>
          <button
            type="button"
            onClick={() => engineRef.current?.resetConsolePlacement?.()}
          >
            RESET POSITION
          </button>
        </div>
      )}

      {/* Live opacity minimap - top-left under Mission Control, realtime player tracking */}
      {showMinimap && (
        <div
          className="lunar-minimap"
          role="button"
          tabIndex={0}
          title="Open full outpost map (M)"
          aria-label="Live outpost minimap. Activate or press M to open the full map."
          onClick={() => {
            setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
            setMapOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
              setMapOpen(true);
            }
          }}
        >          <div className="lunar-minimap-header">
            <span>LIVE MAP</span>
            <i className={miniSnapshot.player ? 'on' : 'off'} />
          </div>
          <svg className="lunar-minimap-svg" viewBox={miniViewBox} aria-hidden="true">
            {miniSnapshot.components.map((component) => {
              const x = (component.minX + component.maxX) / 2;
              const y = -(component.minZ + component.maxZ) / 2;
              const width = Math.max(component.maxX - component.minX, miniSpan * 0.035);
              const height = Math.max(component.maxZ - component.minZ, miniSpan * 0.035);
              const task = simulation.dailyChallenges.find(
                (challenge) => challenge.targetComponentId === component.id
                  && (challenge.status === 'inProgress' || challenge.status === 'overdue'),
              );
              return (
                <g key={component.id} className={`lunar-minimap-component lunar-minimap-${component.category}`}>
                  {component.category === 'equipment' ? (
                    <circle cx={x} cy={y} r={Math.max(miniSpan * 0.028, 1.1)} className="lunar-minimap-equipment" />
                  ) : (
                    <rect
                      x={x - width / 2}
                      y={y - height / 2}
                      width={width}
                      height={height}
                      rx={Math.max(miniSpan * 0.008, 0.35)}
                      className="lunar-minimap-footprint"
                    />
                  )}
                  {component.category !== 'equipment' && (
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(miniSpan * 0.035, 1)}
                      textLength={Math.max(2, Math.min(miniSpan * 0.22, component.name.length * miniSpan * 0.016))}
                      lengthAdjust="spacingAndGlyphs"
                      className="lunar-minimap-room-label"
                    >
                      {component.name}
                    </text>
                  )}
                  {task && (
                    <circle cx={x} cy={y} r={miniSpan * 0.02} className="lunar-minimap-task-dot" />
                  )}
                </g>
              );
            })}
            {miniSnapshot.player && miniFitBounds && (
              <g
                className="lunar-minimap-player"
                transform={`translate(${miniPlayerX} ${-miniPlayerZ})`}
              >
                <circle r={miniSpan * 0.055} className="lunar-minimap-player-halo" />
                <path
                  d="M 0 -1.8 L 1.25 1.15 L 0 0.55 L -1.25 1.15 Z"
                  transform={`rotate(${miniSnapshot.player.yaw * 180 / Math.PI + 180}) scale(${miniSpan * 0.026})`}
                  className="lunar-minimap-player-arrow"
                />
              </g>
            )}
          </svg>
          {!miniSnapshot.player && (
            <div className="lunar-minimap-note">FREE CAM</div>
          )}
        </div>
      )}

      {mapIsOpen && (
        <div className="lunar-map-backdrop" onClick={() => setMapOpen(false)}>
          <section
            className="lunar-map-panel"
            id="lunar-map-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lunar-map-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="lunar-map-header">
              <div>
                <span className="lunar-modal-kicker">OUTPOST NAVIGATION · LIVE POSITION</span>
                <h2 id="lunar-map-title">Lunar Outpost Map</h2>
              </div>
              <button
                type="button"
                className="lunar-map-close"
                aria-label="Close map"
                onClick={() => setMapOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="lunar-map-content">
              <div className="lunar-map-canvas">
                {mapSnapshot && mapViewBox ? (
                  <svg
                    className="lunar-map-svg"
                    viewBox={mapViewBox}
                    role="img"
                    aria-label="Top-down map generated from the named outpost model components"
                  >
                    <defs>
                      <pattern id="lunar-map-grid" width={mapSpan / 18} height={mapSpan / 18} patternUnits="userSpaceOnUse">
                        <path
                          d={`M ${mapSpan / 18} 0 L 0 0 0 ${mapSpan / 18}`}
                          fill="none"
                          stroke="rgba(127, 240, 255, 0.075)"
                          strokeWidth={Math.max(mapSpan / 900, 0.04)}
                        />
                      </pattern>
                    </defs>
                    <rect
                      x={mapSnapshot.bounds.minX - mapPadding}
                      y={-mapSnapshot.bounds.maxZ - mapPadding}
                      width={mapSnapshot.bounds.maxX - mapSnapshot.bounds.minX + mapPadding * 2}
                      height={mapSnapshot.bounds.maxZ - mapSnapshot.bounds.minZ + mapPadding * 2}
                      fill="url(#lunar-map-grid)"
                    />

                    {mapSnapshot.components.map((component) => {
                      const selected = selectedMapTask?.targetComponentId === component.id;
                      const selectedLocation = selectedMapComponentId === component.id;
                      const x = (component.minX + component.maxX) / 2;
                      const y = -(component.minZ + component.maxZ) / 2;
                      const width = Math.max(component.maxX - component.minX, mapSpan * 0.012);
                      const height = Math.max(component.maxZ - component.minZ, mapSpan * 0.012);
                      const task = simulation.dailyChallenges.find(
                        (challenge) => challenge.targetComponentId === component.id,
                      );
                      const taskOverdue = task?.status === 'overdue';

                      return (
                        <g
                          key={component.id}
                          className={`lunar-map-component lunar-map-${component.category}${selected || selectedLocation ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedMapComponentId(component.id);
                            setSelectedMapTaskId(
                              simulation.dailyChallenges.find(
                                (challenge) => challenge.targetComponentId === component.id,
                              )?.id ?? null,
                            );
                          }}
                        >
                          <title>{component.id} · {component.name}{selected ? ' · selected task destination' : ''}</title>
                          {component.category === 'equipment' ? (
                            <circle
                              cx={x}
                              cy={y}
                              r={Math.max(mapSpan * 0.012, 0.7)}
                              className="lunar-map-equipment"
                            />
                          ) : (
                            <rect
                              x={x - width / 2}
                              y={y - height / 2}
                              width={width}
                              height={height}
                              rx={Math.max(mapSpan * 0.006, 0.25)}
                              className="lunar-map-footprint"
                            />
                          )}
                          {component.category !== 'equipment' && (
                            <text
                              x={x}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={Math.max(mapSpan * 0.018, 0.55)}
                              textLength={Math.max(2, Math.min(mapSpan * 0.12, component.name.length * mapSpan * 0.009))}
                              lengthAdjust="spacingAndGlyphs"
                              className="lunar-map-room-label"
                            >
                              {component.name}
                            </text>
                          )}
                          {task && (
                            <g
                              className={`lunar-map-task-marker status-${taskOverdue ? 'overdue' : task.status}`}
                              onClick={() => {
                                setSelectedMapTaskId(task.id);
                                setSelectedMapComponentId(component.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedMapTaskId(task.id);
                                  setSelectedMapComponentId(component.id);
                                }
                              }}
                              role="button"
                              aria-label={`${task.title}, ${taskOverdue ? 'overdue' : task.status}, ${component.name}`}
                              tabIndex={0}
                            >
                              <circle cx={x} cy={y} r={mapSpan * 0.023} className="lunar-map-task-halo" />
                              <circle cx={x} cy={y} r={mapSpan * 0.012} className="lunar-map-task-dot" />
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {mapSnapshot.player && (
                      <g
                        className="lunar-map-player"
                        transform={`translate(${mapSnapshot.player.x} ${-mapSnapshot.player.z})`}
                      >
                        <circle r={mapSpan * 0.025} className="lunar-map-player-halo" />
                        <path
                          d="M 0 -1.8 L 1.25 1.15 L 0 0.55 L -1.25 1.15 Z"
                          transform={`rotate(${mapSnapshot.player.yaw * 180 / Math.PI + 180}) scale(${mapSpan * 0.012})`}
                          className="lunar-map-player-arrow"
                        />
                      </g>
                    )}
                  </svg>
                ) : (
                  <div className="lunar-map-loading">
                    <span>OUTPOST MODEL IS STILL LOADING</span>
                    <small>The map will populate from the scene component bounds.</small>
                  </div>
                )}
              </div>

              <aside className="lunar-map-details" aria-label="Map locations and task destinations">
                <h3>Task destinations</h3>
                <div className="lunar-map-task-list">
                  {simulation.dailyChallenges.map((task) => {
                    const status = task.status;
                    return (
                      <button
                        type="button"
                        key={task.id}
                        className={`lunar-map-task lunar-map-task-${status}${selectedMapTaskId === task.id ? ' is-selected' : ''}`}
                        onClick={() => {
                          setSelectedMapTaskId(task.id);
                          setSelectedMapComponentId(task.targetComponentId);
                        }}
                      >
                        <strong>{task.title}</strong>
                        <span>{status === 'inProgress' ? 'In progress' : status === 'available' ? 'Available' : status === 'completed' ? 'Completed' : 'Overdue'} · {task.priority} priority</span>
                        <small>{task.targetComponentName} · component {task.targetComponentId}</small>
                      </button>
                    );
                  })}
                </div>
                {mapSnapshot?.components && (
                  <div className="lunar-map-location-list">
                    <h3>Outpost locations</h3>
                    <div>
                      {mapSnapshot.components.map((component) => (
                        <button
                          type="button"
                          key={component.id}
                          className={selectedMapComponentId === component.id ? 'is-selected' : ''}
                          onClick={() => {
                            setSelectedMapComponentId(component.id);
                            setSelectedMapTaskId(
                              simulation.dailyChallenges.find(
                                (task) => task.targetComponentId === component.id,
                              )?.id ?? null,
                            );
                          }}
                        >
                          <span>{component.name}</span>
                          <small>{component.id} · {component.category}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="lunar-map-legend" aria-label="Map legend">
                  <h3>Legend</h3>
                  <span><i className="legend-player" /> You · facing direction</span>
                  <span><i className="legend-task legend-available" /> Available task</span>
                  <span><i className="legend-task legend-progress" /> In progress</span>
                  <span><i className="legend-task legend-overdue" /> Overdue (still completable)</span>
                  <span><i className="legend-task legend-completed" /> Completed</span>
                  <span><i className="legend-equipment" /> Equipment</span>
                </div>
                {!mapSnapshot?.player && (
                  <p className="lunar-map-note">
                    Switch to first-person mode to see your live position. Free camera is an observer, not a player location.
                  </p>
                )}
                {mapSnapshot?.player?.location === 'interior' && (
                  <p className="lunar-map-note">
                    Interior position is shown at the actual exterior footprint of the entered component.
                  </p>
                )}
                {selectedMapTask && (
                  <p className="lunar-map-selected-note">
                    Highlighted destination: {selectedMapTask.targetComponentName}. No route is shown because room-to-room connections are not defined as reliable navigation data.
                  </p>
                )}
              </aside>
            </div>
          </section>
        </div>
      )}

      {dailyTasksOpen && eventGameplayActive && simulation.gameStatus === 'playing' && (
        <aside className="lunar-daily-tasks" id="lunar-daily-tasks" aria-label="Daily tasks">
          <div className="lunar-drawer-heading">
            <div>
              <span className="lunar-modal-kicker">Day {simulation.day} objectives</span>
              <h2>Daily Tasks</h2>
            </div>
            <button type="button" aria-label="Close daily tasks" onClick={() => setDailyTasksOpen(false)}>×</button>
          </div>
          <p className="lunar-task-intro">
            Complete today’s checklist to close the day early. While tasks remain, the mission clock runs at half speed. If time expires, unfinished tasks become overdue; linked incidents must be handled before the day report.
          </p>
          <div className="lunar-task-list">
            {simulation.dailyChallenges.map((challenge) => {
              const isActive = challenge.status === 'inProgress' || challenge.status === 'overdue';
              const isUnfinished = challenge.status !== 'completed';

              return (
                <article className={`lunar-task-card lunar-task-${challenge.status}`} key={challenge.id}>
                  <div className="lunar-task-title-row">
                    <h3>{challenge.title}</h3>
                    <span>{challenge.status === 'inProgress' ? 'IN PROGRESS' : challenge.status.toUpperCase()}</span>
                  </div>
                  <div className="lunar-task-meta">
                    <span className={`lunar-task-priority lunar-task-priority-${challenge.priority}`}>
                      {challenge.priority === 'critical' ? 'CRITICAL' : challenge.priority.toUpperCase()} priority
                    </span>
                    <span>Location: {challenge.targetComponentName}</span>
                    <span>{challenge.status === 'overdue' ? `Overdue from Day ${challenge.deadlineDay}` : 'Due today'}</span>
                  </div>
                  <p>{challenge.description}</p>
                  <small>{challenge.objective}</small>
                  {(challenge.status === 'available' || challenge.status === 'overdue' || isActive) && (
                    <button
                      type="button"
                      className="lunar-task-action"
                      onClick={() => startDailyChallenge(challenge.id)}
                    >
                      {challenge.status === 'overdue'
                        ? 'Start recovery task'
                        : isActive
                          ? simulation.activeChallengeId === challenge.id ? 'Selected task' : 'Focus task'
                          : 'Start task'}
                    </button>
                  )}
                  {challenge.urgentDeadlineAtMs !== null && isUnfinished && (
                    <div className={`lunar-task-countdown ${
                      challenge.status === 'overdue' ? 'is-overdue' : ''
                    } ${
                      challenge.urgentDeadlineAtMs - simulation.campaignElapsedMs <= 30_000
                        ? 'is-imminent'
                        : ''
                    }`}>
                      {challenge.status === 'overdue'
                        ? 'OVERDUE · Expected system impact has occurred'
                        : `${challenge.priority.toUpperCase()} · ${formatRemainingTime(
                          challenge.urgentDeadlineAtMs - simulation.campaignElapsedMs,
                        )} remaining`}
                    </div>
                  )}
                  {challenge.urgentDeadlineAtMs !== null && isUnfinished && (
                    <small className="lunar-task-risk">If delayed: {challenge.riskIfDelayed}</small>
                  )}
                  {isUnfinished && challenge.status !== 'overdue' && challenge.urgentStartedAtMs === null && (
                    <button
                      type="button"
                      className="lunar-task-postpone"
                      disabled={challenge.postponed}
                      onClick={() => requestDailyChallengePostponement(challenge.id)}
                    >
                      {challenge.postponed ? 'Postponed' : 'Postpone'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="lunar-task-locate"
                    onClick={() => {
                      setSelectedMapTaskId(challenge.id);
                      setSelectedMapComponentId(challenge.targetComponentId);
                      setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
                      setMapOpen(true);
                    }}
                  >
                    Locate on map
                  </button>
                  {isActive && (
                    <div className="lunar-task-current">
                      {challenge.status === 'overdue' ? 'OVERDUE · Recovery remains available' : 'Active'}
                      {challenge.startedDay !== null ? ` · Started day ${challenge.startedDay}` : ''}
                    </div>
                  )}
                  {challenge.status === 'completed' && (
                    <div className="lunar-task-current">
                      Completed on day {challenge.completedDay}
                      {challenge.completedAfterDeadline === true ? ' · After deadline' : ''}
                      {challenge.emergencyPrevented ? ' · Emergency prevented' : ''}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {simulation.challengeHistory.length > 0 && (
            <p className="lunar-task-history">
              Completed tasks this mission: {simulation.challengeHistory.length}
            </p>
          )}
          {simulation.challengeFeedback && (
            <p className="lunar-task-feedback" role="status">{simulation.challengeFeedback}</p>
          )}
        </aside>
      )}

      {statusOpen && eventGameplayActive && !simulation.warningTaskId && (
        <aside className="lunar-status-drawer" id="lunar-status-drawer" aria-label="Outpost readiness and systems overview">
          <div className="lunar-drawer-heading">
            <div>
              <span className="lunar-modal-kicker">Day {simulation.day} · OUTPOST READINESS</span>
              <h2>Mission Systems</h2>
            </div>
            <button type="button" aria-label="Close outpost status" onClick={() => setStatusOpen(false)}>×</button>
          </div>
          <section className={`lunar-readiness lunar-readiness-${readinessLevel.toLowerCase().replace(' ', '-')}`}>
            <div className="lunar-readiness-summary">
              <strong>{readinessLevel}</strong>
              <span>Overall readiness · {overallReadiness}/100</span>
            </div>
            <p>{readinessForecast}</p>
            <p><b>Recommended:</b> {readinessRecommendation}</p>
            <div className="lunar-readiness-task">
              <span>Active task</span>
              <strong>{activeTask ? activeTask.title : 'None'}</strong>
              {activeTask && <small>Deadline Day {activeTask.deadlineDay} · {activeTask.status === 'overdue' ? 'Overdue' : 'In progress'}</small>}
            </div>
            {overdueTasks.length > 0 && (
              <div className="lunar-readiness-overdue">
                Overdue: {overdueTasks.map((task) => task.title).join(', ')}
              </div>
            )}
          </section>
          <h3 className="lunar-system-heading">System condition · reliability</h3>
          <div className="lunar-system-condition-list">
            {systemEntries.map(([key, label]) => {
              const value = simulation.systemConditions[key];
              const level = getSystemConditionLevel(value);
              return (
                <div className={`lunar-system-condition lunar-system-${level}`} key={key}>
                  <div className="lunar-resource-heading">
                    <span>{label}</span>
                    <strong>{value}/100 · {level}</strong>
                  </div>
                  <div className="lunar-resource-meter">
                    <span style={{ width: `${value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <h3 className="lunar-system-heading">Consumable reserves</h3>
          <div className="lunar-resource-list">
            {RESOURCE_ITEMS.map(([key, label, icon]) => {
              const value = simulation.resources[key];
              const level = value <= 25 ? 'critical' : value <= 50 ? 'low' : 'healthy';

              return (
                <div className={`lunar-resource lunar-resource-${level}`} key={key}>
                  <div className="lunar-resource-heading">
                    <span>{icon} {label}</span>
                    <strong>{value}%</strong>
                  </div>
                  <div className="lunar-resource-meter">
                    <span style={{ width: `${value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="lunar-resource-footnote">Daily consumption: Power −1 · Oxygen −1 · Water −1 · Food −1</p>
        </aside>
      )}

      {simulation.eventEffectId === 'solar_storm' && (
        <div className="lunar-storm-overlay" aria-hidden="true" />
      )}

      {simulation.challengeFeedback && simulation.eventPhase === 'idle' && (
        <div className="lunar-task-toast" role="status">
          <span>{simulation.challengeFeedback}</span>
          <button
            type="button"
            aria-label="Dismiss task feedback"
            onClick={dismissChallengeFeedback}
          >
            ×
          </button>
        </div>
      )}

      {warningTask && simulation.eventPhase === 'idle' && simulation.gameStatus === 'playing' && (
        <div className="simulation-modal-backdrop" role="presentation">
          <section
            className="simulation-warning-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="postponement-title"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="simulation-eyebrow">Task postponement · Day {simulation.day}</div>
            <h2 id="postponement-title">Accept the system risk?</h2>
            <p>{warningTask.postponement.warning}</p>
            <p><strong>Affected system:</strong> {warningTask.affectedSystem}</p>
            <p>
              Confirming will reduce {warningTask.affectedSystem} condition by{' '}
              {warningTask.postponement.immediateConditionLoss} points. The task remains unfinished
              and its Day {warningTask.deadlineDay} deadline still applies.
            </p>
            <div className="simulation-warning-actions">
              <button
                type="button"
                className="simulation-warning-return"
                autoFocus
                onClick={() => {
                  cancelDailyChallengePostponement();
                  setDailyTasksOpen(true);
                }}
              >
                Return and prioritize task
              </button>
              <button
                type="button"
                className="simulation-warning-confirm"
                onClick={confirmDailyChallengePostponement}
              >
                Confirm postponement
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Proximity prompts - small bottom toast, pointer lock stays active */}
      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'airlock' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Airlock prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Enter the airlock?'}</strong>
            <small>Press <kbd>Enter</kbd> to enter · <kbd>N</kbd> to dismiss</small>
          </div>
          <button
            type="button"
            className="lunar-proximity-enter"
            onClick={() => engineRef.current?.enterAirlock()}
          >
            ENTER ⏎
          </button>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'airlockEnd' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Airlock direction prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Choose a direction'}</strong>
            <small><kbd>A</kbd>/<kbd>←</kbd> greenhouse · <kbd>D</kbd>/<kbd>→</kbd> workshop</small>
          </div>
          <div className="lunar-proximity-split">
            <button
              type="button"
              className="lunar-proximity-enter"
              onClick={() => engineRef.current?.enterGreenhouse()}
            >
              ◀ GREEN
            </button>
            <button
              type="button"
              className="lunar-proximity-enter"
              onClick={() => engineRef.current?.enterWorkshop()}
            >
              WORK ▶
            </button>
          </div>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'greenhouseDoor' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Greenhouse door prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Return to the airlock?'}</strong>
            <small>Press <kbd>Enter</kbd> to return · <kbd>N</kbd> to stay</small>
          </div>
          <button
            type="button"
            className="lunar-proximity-enter"
            onClick={() => engineRef.current?.leaveGreenhouse()}
          >
            ENTER ⏎
          </button>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'component' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Component prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Enter this module?'}{promptedChallenge ? ' ★' : ''}</strong>
            <small>Press <kbd>Enter</kbd> to enter · <kbd>N</kbd> to dismiss{promptedChallenge ? ` · Task: ${promptedChallenge.actionLabel}` : ''}</small>
          </div>
          <button
            type="button"
            className="lunar-proximity-enter"
            onClick={() => engineRef.current?.enterNearbyComponent()}
          >
            ENTER ⏎
          </button>
        </div>
      )}

      <EventModal
        event={eventOptionsOpen && simulation.eventPhase === 'awaitingDecision' && !simulation.warningTaskId ? simulation.currentEvent : null}
        onSelectDecision={simulation.makeDecision}
        onClose={() => setEventOptionsOpen(false)}
      />
      {simulation.dayPhase === 'report' && simulation.dayReport && (
        <div className="lunar-day-transition" role="dialog" aria-modal="true" aria-labelledby="day-report-title">
          <section className="lunar-day-report">
            <span className="lunar-day-report-kicker">Lunar operations · Day {simulation.dayReport.day}</span>
            <h2 id="day-report-title">Day {simulation.dayReport.day} ended</h2>
            <p className="lunar-day-report-summary">
              {simulation.dayReport.completedTasks.length} task{simulation.dayReport.completedTasks.length === 1 ? '' : 's'} completed · {simulation.dayReport.overdueTasks.length} carried overdue
            </p>
            <div className="lunar-day-report-grid">
              <div>
                <h3>Completed</h3>
                {simulation.dayReport.completedTasks.length > 0 ? (
                  <ul>{simulation.dayReport.completedTasks.map((title) => <li key={title}>{title}</li>)}</ul>
                ) : <p>No tasks completed.</p>}
              </div>
              <div>
                <h3>Carried forward</h3>
                {simulation.dayReport.overdueTasks.length > 0 ? (
                  <ul>{simulation.dayReport.overdueTasks.map((title) => <li key={title}>{title}</li>)}</ul>
                ) : <p>Nothing overdue.</p>}
              </div>
            </div>
            <div className="lunar-day-report-resources">
              <span>Power <strong>{simulation.dayReport.resources.power}%</strong></span>
              <span>Oxygen <strong>{simulation.dayReport.resources.oxygen}%</strong></span>
              <span>Water <strong>{simulation.dayReport.resources.water}%</strong></span>
              <span>Food <strong>{simulation.dayReport.resources.food}%</strong></span>
            </div>
            <button type="button" className="lunar-day-advance" onClick={simulation.advanceDay}>
              {simulation.dayReport.day >= simulation.maxDays
                ? 'COMPLETE MISSION'
                : `ADVANCE TO DAY ${simulation.dayReport.day + 1}`}
            </button>
          </section>
        </div>
      )}
      {simulation.dayPhase === 'transition' && (
        <div className="lunar-day-transition lunar-day-transition-opening" role="status" aria-live="assertive">
          <span className="lunar-day-report-kicker">Lunar operations</span>
          <h2>Day {simulation.day}</h2>
          <p>Mission day commencing</p>
        </div>
      )}
      {simulation.gameStatus !== 'playing' && simulation.eventPhase !== 'resolving' && (
        <EndGameReport
          status={simulation.gameStatus}
          day={simulation.day}
          maxDays={simulation.maxDays}
          resources={simulation.resources}
          failureReason={simulation.failureReason}
          decisionHistory={simulation.decisionHistory}
          dailyChallenges={simulation.dailyChallenges}
          systemConditions={simulation.systemConditions}
          faultHistory={simulation.faultHistory}
          postponementHistory={simulation.postponementHistory}
          eventHistory={simulation.eventHistory}
          onRestart={() => {
            setMapOpen(false);
            simulation.restart();
          }}
        />
      )}
    </div>
  );
}
