import { useEffect, useRef, useState } from 'react';
import { createLunarEngine } from './lunarOutpostEngine';
import EventModal from '../EventModal';
import EndGameReport from '../EndGameReport';
import './LunarOutpost.css';
import '../../simulation.css';

const RESOURCE_ITEMS = [
  ['power', 'Power', '⚡'],
  ['battery', 'Battery', '▰'],
  ['oxygen', 'Oxygen', '◉'],
  ['water', 'Water', '◆'],
  ['food', 'Food', '✦'],
  ['habitat', 'Habitat', '⌂'],
  ['equipment', 'Equipment', '⚙'],
  ['health', 'Crew health', '♥'],
  ['radProtection', 'Radiation shield', '◈'],
  ['comms', 'Communications', '⌁'],
  ['science', 'Science', '✧'],
  ['emergencyReserve', 'Emergency reserve', '⬡'],
  ['potentialWater', 'Potential water', '❄']
];

export default function LunarOutpost({ onExitToOrbit, simulation }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const presentedEventRef = useRef(null);
  const returningEventRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [cameraMode, setCameraMode] = useState('free');
  const [prompt, setPrompt] = useState({ type: null, data: null });
  const [insidePanel, setInsidePanel] = useState({
    visible: false,
    label: '',
    buttonText: '',
    componentId: null
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [dailyTasksOpen, setDailyTasksOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapOpenedAtDecisionCount, setMapOpenedAtDecisionCount] = useState(0);
  const [selectedMapTaskId, setSelectedMapTaskId] = useState(null);
  const [selectedMapComponentId, setSelectedMapComponentId] = useState(null);
  const [mapSnapshot, setMapSnapshot] = useState(null);
  const {
    eventPhase,
    currentEvent,
    beginPresentation,
    completePresentation,
    completeResolution,
    startDailyChallenge,
    completeDailyChallenge,
    dismissChallengeFeedback,
  } = simulation;
  const insideChallenge = simulation.dailyChallenges.find(
    (challenge) => challenge.status === 'inProgress'
      && challenge.targetComponentId === insidePanel.componentId,
  );
  const promptedChallenge = simulation.dailyChallenges.find(
    (challenge) => challenge.status === 'inProgress'
      && challenge.targetComponentId === prompt.data?.id,
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'lunar-canvas';
    containerRef.current.prepend(canvas);

    const engine = createLunarEngine(canvas, {
      onLoading: (state) => setIsLoading(state.active),
      onModeChange: (mode) => setCameraMode(mode),
      onPromptChange: (type, data) => setPrompt({ type, data }),
      onInsidePanelChange: (panel) => setInsidePanel(panel)
    });

    engineRef.current = engine;

    return () => {
      engine?.destroy?.();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setEventEffect(simulation.eventEffectId);
  }, [simulation.eventEffectId]);

  useEffect(() => {
    engineRef.current?.setChallengeFlags(simulation.flags);
  }, [simulation.flags]);

  useEffect(() => {
    if (
      !mapOpen
      || mapOpenedAtDecisionCount !== simulation.decisionHistory.length
      || eventPhase !== 'idle'
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
  }, [eventPhase, mapOpen, mapOpenedAtDecisionCount, simulation.decisionHistory.length, simulation.gameStatus]);

  useEffect(() => {
    const event = currentEvent;
    if (!event) {
      presentedEventRef.current = null;
      returningEventRef.current = null;
      return;
    }

    if (eventPhase === 'pending') {
      beginPresentation(event.id);
      return;
    }

    if (
      eventPhase === 'presenting' &&
      presentedEventRef.current !== event.id
    ) {
      presentedEventRef.current = event.id;
      engineRef.current?.presentEvent(event.id, () => {
        completePresentation(event.id);
      });
      return;
    }

    if (
      eventPhase === 'resolving' &&
      returningEventRef.current !== event.id
    ) {
      returningEventRef.current = event.id;
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
    && eventPhase === 'idle'
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

      {/* Crosshair in First Person */}
      {simulation.eventPhase === 'idle' && cameraMode !== 'free' && !insidePanel.visible && !prompt.type && (
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
          <span>{simulation.timeOfDay} LUNAR</span>
          <span className="lunar-status-divider">·</span>
          <span>{simulation.remainingDays} DAYS LEFT</span>
          <span className="lunar-status-divider">·</span>
          <span>{simulation.isPaused ? 'EVENT PAUSED' : simulation.gameStatus === 'playing' ? 'SYSTEMS NOMINAL' : 'MISSION ENDED'}</span>
        </div>

        <div className="lunar-actions-group">
          <button
            type="button"
            className="lunar-btn lunar-map-toggle"
            aria-expanded={mapIsOpen}
            aria-controls="lunar-map-panel"
            disabled={simulation.eventPhase !== 'idle' || simulation.gameStatus !== 'playing'}
            onClick={() => {
              setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
              setMapOpen(true);
            }}
          >
            MAP
          </button>
          <button
            type="button"
            className="lunar-btn lunar-status-toggle"
            aria-expanded={dailyTasksOpen}
            aria-controls="lunar-daily-tasks"
            disabled={simulation.eventPhase !== 'idle' || simulation.gameStatus !== 'playing'}
            onClick={() => setDailyTasksOpen((open) => !open)}
          >
            DAILY TASKS
          </button>
          <button
            type="button"
            className="lunar-btn lunar-status-toggle"
            aria-expanded={statusOpen}
            aria-controls="lunar-status-drawer"
            disabled={simulation.eventPhase !== 'idle'}
            onClick={() => setStatusOpen((open) => !open)}
          >
             OUTPOST STATUS
          </button>
          {insidePanel.visible ? (
            <div className="lunar-inside-panel">
              <span>{insidePanel.label}</span>
              {insideChallenge && (
                <div className="lunar-task-inline-action-wrap">
                  <button
                    type="button"
                    className="lunar-task-inline-action"
                    disabled={simulation.eventPhase !== 'idle' || simulation.gameStatus !== 'playing'}
                    onClick={() => completeDailyChallenge(insideChallenge.id, insidePanel.componentId)}
                  >
                    {insideChallenge.actionLabel}
                  </button>
                  <small className="lunar-task-action-cost">No additional campaign time</small>
                </div>
              )}
              <button
                type="button"
                onClick={() => engineRef.current?.exitAirlock()}
              >
                {insidePanel.buttonText || 'EXIT'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`lunar-btn ${cameraMode === 'first-person' ? 'active' : ''}`}
              disabled={simulation.eventPhase !== 'idle' || simulation.gameStatus !== 'playing'}
              onClick={() => engineRef.current?.toggleCameraMode()}
            >
              {cameraMode === 'free' ? 'FIRST PERSON' : 'FREE CAMERA'}
            </button>
          )}
        </div>
      </div>

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
                      const taskOverdue = task?.status === 'inProgress'
                        && task.startedDay !== null
                        && simulation.day > task.startedDay;

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
                          transform={`rotate(${mapSnapshot.player.yaw * 180 / Math.PI}) scale(${mapSpan * 0.012})`}
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
                    const overdue = task.status === 'inProgress'
                      && task.startedDay !== null
                      && simulation.day > task.startedDay;
                    const status = overdue ? 'overdue' : task.status;
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

      {dailyTasksOpen && simulation.eventPhase === 'idle' && simulation.gameStatus === 'playing' && (
        <aside className="lunar-daily-tasks" id="lunar-daily-tasks" aria-label="Daily tasks">
          <div className="lunar-drawer-heading">
            <div>
              <span className="lunar-modal-kicker">Day {simulation.day} objectives</span>
              <h2>Daily Tasks</h2>
            </div>
            <button type="button" aria-label="Close daily tasks" onClick={() => setDailyTasksOpen(false)}>×</button>
          </div>
          <p className="lunar-task-intro">
            Tasks persist until completed. Travel to the named component, enter it, then use its interior action. Travel uses the continuous clock; task actions add no extra time.
          </p>
          <div className="lunar-task-list">
            {simulation.dailyChallenges.map((challenge) => {
              const isActive = challenge.status === 'inProgress';

              return (
                <article className={`lunar-task-card lunar-task-${challenge.status}`} key={challenge.id}>
                  <div className="lunar-task-title-row">
                    <h3>{challenge.title}</h3>
                    <span>{challenge.status === 'inProgress' ? 'IN PROGRESS' : challenge.status.toUpperCase()}</span>
                  </div>
                  <div className="lunar-task-meta">
                    <span className={`lunar-task-priority lunar-task-priority-${challenge.priority}`}>
                      {challenge.priority} priority
                    </span>
                    <span>Location: {challenge.targetComponentName}</span>
                  </div>
                  <p>{challenge.description}</p>
                  <small>{challenge.objective}</small>
                  {challenge.status === 'available' && (
                    <button
                      type="button"
                      className="lunar-task-action"
                      onClick={() => startDailyChallenge(challenge.id)}
                    >
                      Start task
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
                      Active · Started day {challenge.startedDay} · No expiry
                    </div>
                  )}
                  {challenge.status === 'completed' && (
                    <div className="lunar-task-current">
                      Completed on day {challenge.completedDay}
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

      {statusOpen && simulation.eventPhase === 'idle' && (
        <aside className="lunar-status-drawer" id="lunar-status-drawer" aria-label="Outpost systems overview">
          <div className="lunar-drawer-heading">
            <div>
              <span className="lunar-modal-kicker">Mission systems</span>
              <h2>Outpost Status</h2>
            </div>
            <button type="button" aria-label="Close outpost status" onClick={() => setStatusOpen(false)}>×</button>
          </div>
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

      {/* Interactive Modal Prompts */}
      {simulation.eventPhase === 'idle' && prompt.type === 'airlock' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="airlock-title">
          <div className="lunar-modal-kicker">HABITAT ACCESS</div>
          <h2 id="airlock-title">{prompt.data?.title || 'Enter the airlock?'}</h2>
          <p>{prompt.data?.message || 'You are at the habitat entrance.'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.enterAirlock()}
            >
              YES · ENTER
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.dismissAirlock()}
            >
              NO · STAY OUTSIDE
            </button>
          </div>
          <div className="lunar-modal-hint">Press E to enter · Esc to dismiss</div>
        </div>
      )}

      {simulation.eventPhase === 'idle' && prompt.type === 'airlockEnd' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="airlock-end-title">
          <div className="lunar-modal-kicker">AIRLOCK TRANSIT</div>
          <h2 id="airlock-end-title">{prompt.data?.title || 'Choose a direction'}</h2>
          <p>{prompt.data?.message || 'Choose a side: the greenhouse or the workshop.'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.enterGreenhouse()}
            >
              LEFT · GREENHOUSE
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.enterWorkshop()}
            >
              RIGHT · WORKSHOP
            </button>
          </div>
          <div className="lunar-modal-hint">A or ← for greenhouse · D or → for workshop</div>
        </div>
      )}

      {simulation.eventPhase === 'idle' && prompt.type === 'greenhouseDoor' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="greenhouse-door-title">
          <div className="lunar-modal-kicker">GREENHOUSE EXIT</div>
          <h2 id="greenhouse-door-title">{prompt.data?.title || 'Return to the airlock?'}</h2>
          <p>{prompt.data?.message || 'You are at the greenhouse door. Leave the crop bay and go back to the airlock?'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.leaveGreenhouse()}
            >
              YES · AIRLOCK
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.stayGreenhouse()}
            >
              NO · STAY HERE
            </button>
          </div>
          <div className="lunar-modal-hint">Press E to return · Esc to stay</div>
        </div>
      )}

      {simulation.eventPhase === 'idle' && prompt.type === 'component' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="component-title">
          <div className="lunar-modal-kicker">
            {promptedChallenge ? 'DAILY TASK COMPONENT' : 'OUTPOST MODULE'}
          </div>
          <h2 id="component-title">{prompt.data?.title || 'Enter this module?'}</h2>
          <p>{prompt.data?.message || 'You are close to an outpost component.'}</p>
          {promptedChallenge && (
            <div className="lunar-context-task">
              <strong>Daily task target</strong>
              <span>Enter this component to perform: {promptedChallenge.actionLabel}.</span>
            </div>
          )}
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.enterNearbyComponent()}
            >
              YES · ENTER
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.dismissComponent()}
            >
              NO · STAY OUTSIDE
            </button>
          </div>
          <div className="lunar-modal-hint">Press E to enter · Esc to dismiss</div>
        </div>
      )}

      <EventModal
        event={simulation.eventPhase === 'awaitingDecision' ? simulation.currentEvent : null}
        onSelectDecision={simulation.makeDecision}
      />
      {simulation.gameStatus !== 'playing' && simulation.eventPhase !== 'resolving' && (
        <EndGameReport
          status={simulation.gameStatus}
          day={simulation.day}
          maxDays={simulation.maxDays}
          resources={simulation.resources}
          failureReason={simulation.failureReason}
          decisionHistory={simulation.decisionHistory}
          dailyChallenges={simulation.dailyChallenges}
          onRestart={() => {
            setMapOpen(false);
            simulation.restart();
          }}
        />
      )}
    </div>
  );
}
