import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, Center, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getDailyTaskExperience, getDailyTaskSolutions } from '../../data/dailyTaskExperiences';
import './DailyTaskExperience.css';

const STEPS = ['Task Idea', 'Discover Problem', 'Choose a Solution', 'Complete Task', 'Conclusion'];
const STAGE_ORDER = ['idea', 'discover', 'solutions', 'perform', 'conclusion'];

function getSolutionIcon(solution, experience, task, used) {
  const action = solution.name.toLowerCase();
  const context = `${experience.brokenPart} ${task.title} ${task.targetComponentName}`.toLowerCase();
  let choices;
  if (/record|note/.test(action)) choices = ['chart', 'clipboard', 'notes'];
  else if (/harvest|pick /.test(action)) choices = ['plant-cut', 'basket', 'leaf'];
  else if (/charge/.test(action)) choices = /solar|panel/.test(action) ? ['sun', 'battery', 'orbit'] : ['battery', 'circuit', 'bolt'];
  else if (/brush/.test(action)) choices = ['brush', 'airflow', 'spark'];
  else if (/wipe|clean/.test(action)) choices = ['cloth', 'spark', 'water'];
  else if (/rinse|flush/.test(action)) choices = ['water', 'filter', 'flow'];
  else if (/clear/.test(action)) choices = ['airflow', 'brush', 'spark'];
  else if (/replace|swap|fit a new/.test(action)) choices = ['replace', 'toolbox', 'part'];
  else if (/patch|seal/.test(action)) choices = ['seal', 'patch', 'shield'];
  else if (/compare/.test(action)) choices = ['compare', 'chart', 'meter'];
  else if (/test|check|read|match|calibrat/.test(action)) choices = ['inspect', 'meter', 'target'];
  else if (/sort|move|group|follow the/.test(action)) choices = ['sort', 'boxes', 'route'];
  else if (/aim|line up|point|angle/.test(action)) choices = ['target', 'compass', 'sun'];
  else if (/tighten|secure|adjust|set |balance/.test(action)) choices = ['wrench', 'clamp', 'tune'];
  else if (/mix|feed/.test(action)) choices = ['plant', 'water', 'sprout'];
  else if (/solar|sun|panel|tracker/.test(context)) choices = ['sun', 'panel', 'target'];
  else if (/radio|antenna|signal/.test(context)) choices = ['antenna', 'signal', 'circuit'];
  else if (/wheel|brake|tire/.test(context)) choices = ['wheel', 'wrench', 'brake'];
  else if (/plant|crop|greenhouse|leaf/.test(context)) choices = ['plant', 'leaf', 'sprout'];
  else if (/meal|food|medical kit|supply/.test(context)) choices = ['boxes', 'clipboard', 'kit'];
  else if (/pipe|water|filter|airflow|hose|recycler/.test(context)) choices = ['water', 'filter', 'flow'];
  else if (/door|seal|hatch|shelter/.test(context)) choices = ['door', 'shield', 'seal'];
  else choices = ['wrench', 'inspect', 'spark'];
  const selected = choices.find((candidate) => !used.has(candidate)) ?? choices[0];
  used.add(selected);
  return selected;
}

function SolutionIcon({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.3, strokeLinecap: 'round', strokeLinejoin: 'round' };
  let drawing;
  switch (kind) {
    case 'antenna': drawing = <><path d="M24 39V13m-8 26h16M19 13h10M13 18c-7 6-7 13 0 19m22-19c7 6 7 13 0 19M19 23c-4 4-4 8 0 12m10-12c4 4 4 8 0 12"/><circle cx="24" cy="10" r="2.5"/></>; break;
    case 'signal': drawing = <><path d="M8 18a22 22 0 0 1 32 0M13 23a15 15 0 0 1 22 0M18 28a8 8 0 0 1 12 0"/><circle cx="24" cy="34" r="2"/></>; break;
    case 'battery': drawing = <><rect x="9" y="15" width="30" height="22" rx="3"/><path d="M18 15v-4h12v4m-9 7-3 6h6l-3 5"/></>; break;
    case 'circuit': drawing = <><path d="M10 12h8v8h12v-8h8M10 36h8v-8h12v8h8M24 20v8"/><circle cx="10" cy="12" r="2"/><circle cx="38" cy="12" r="2"/><circle cx="10" cy="36" r="2"/><circle cx="38" cy="36" r="2"/></>; break;
    case 'wrench': drawing = <><path d="M28 11a10 10 0 0 0-12 13L9 31a4 4 0 0 0 6 6l7-7a10 10 0 0 0 13-12l-7 7-6-6Z"/></>; break;
    case 'clamp': drawing = <><path d="M35 12H20a11 11 0 0 0 0 22h15M35 8v32M29 22h6m-6 6h6"/></>; break;
    case 'inspect': drawing = <><circle cx="21" cy="21" r="10"/><path d="m29 29 9 9M17 21h8m-4-4v8"/></>; break;
    case 'meter': drawing = <><rect x="11" y="10" width="26" height="29" rx="4"/><path d="M17 29a7 7 0 0 1 14 0m-7 0 5-7M18 34h12"/></>; break;
    case 'compare': drawing = <><path d="M12 36V18m0 0-5 5m5-5 5 5M36 12v18m0 0-5-5m5 5 5-5M19 36h10"/></>; break;
    case 'target': drawing = <><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="8"/><circle cx="24" cy="24" r="2"/><path d="m27 21 9-9"/></>; break;
    case 'sun': drawing = <><circle cx="24" cy="24" r="8"/><path d="M24 7v5m0 24v5M7 24h5m24 0h5M12 12l4 4m16 16 4 4m0-24-4 4m-16 16-4 4"/></>; break;
    case 'panel': drawing = <><path d="m12 13 23 0 5 21H7Z M18 13l-3 21m11-21v21m7-21 3 21M9 24h28M23 34v6m-8 0h16"/></>; break;
    case 'replace': drawing = <><path d="M12 18h22l-5-5m7 17H14l5 5M34 18a12 12 0 0 1 2 12m-24 0a12 12 0 0 1 2-12"/><path d="M20 23h8v8h-8z"/></>; break;
    case 'seal': case 'shield': case 'patch': drawing = <><path d="M24 7 37 12v10c0 9-6 15-13 19-7-4-13-10-13-19V12Z"/><path d="m17 24 5 5 10-11"/></>; break;
    case 'cloth': drawing = <><path d="m12 13 23-4 3 25-24 5Z M17 19l15-3m-14 9 15-3m-13 9 11-2"/></>; break;
    case 'brush': drawing = <><path d="m14 30 16-16 7 7-16 16Zm12-12 7 7M10 39l7-7"/><path d="M8 11h6m-3-3v6m22 23h6m-3-3v6"/></>; break;
    case 'water': case 'flow': drawing = <><path d="M24 8S13 21 13 29a11 11 0 0 0 22 0C35 21 24 8 24 8Z"/><path d="M19 30a5 5 0 0 0 5 5"/></>; break;
    case 'filter': drawing = <><path d="M10 11h28L27 25v11l-6 3V25Z"/><path d="M17 17h14m-10 5h7"/></>; break;
    case 'plant': case 'leaf': case 'sprout': drawing = <><path d="M24 39V22m0 7c-10 0-14-7-14-15 9 0 14 4 14 15Zm0-5c0-9 5-15 15-15 0 10-5 15-15 15Z"/><path d="M13 39h22"/></>; break;
    case 'plant-cut': drawing = <><path d="M24 37V19m0 8c-9 0-13-6-13-13 9 0 13 4 13 13Zm0-5c0-8 5-13 13-13 0 9-5 13-13 13ZM12 36l8-8m-8 0 8 8"/></>; break;
    case 'chart': case 'clipboard': case 'notes': drawing = <><rect x="12" y="10" width="24" height="29" rx="3"/><path d="M19 10V7h10v3M18 20h12m-12 6h12m-12 6h8"/></>; break;
    case 'sort': case 'boxes': case 'toolbox': case 'kit': drawing = <><rect x="9" y="15" width="30" height="23" rx="3"/><path d="M18 15v-5h12v5m-21 8h30m-18-2v5h6v-5"/></>; break;
    case 'door': drawing = <><path d="M13 39V10l21-3v32M18 17l11-2v19l-11 2Zm15 2h.1"/></>; break;
    case 'wheel': case 'brake': drawing = <><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="5"/><path d="M24 9v10m15 5H29M13 35l7-7m-8-13 8 7m11 6 5 7"/></>; break;
    case 'compass': case 'route': drawing = <><circle cx="24" cy="24" r="15"/><path d="m29 17-4 10-7 4 4-10Zm-5-8v4m0 22v4m15-15h-4M13 24H9"/></>; break;
    case 'spark': drawing = <><path d="M24 7 28 19l12 5-12 4-4 13-4-13-12-4 12-5Z"/><path d="m36 8 1 4 4 1-4 1-1 4-1-4-4-1 4-1Z"/></>; break;
    case 'bolt': drawing = <path d="M27 6 13 26h10l-2 16 14-22H25Z"/>; break;
    case 'orbit': drawing = <><circle cx="24" cy="24" r="4"/><ellipse cx="24" cy="24" rx="17" ry="8" transform="rotate(-35 24 24)"/><circle cx="37" cy="14" r="2"/></>; break;
    case 'tune': drawing = <><path d="M10 15h28M10 24h28M10 33h28"/><circle cx="19" cy="15" r="3"/><circle cx="30" cy="24" r="3"/><circle cx="17" cy="33" r="3"/></>; break;
    default: drawing = <><path d="M24 7v34m-8 0h16M19 14h10m-5-7-5 7h10Z"/><path d="M14 20c-7 5-7 12 0 17m20-17c7 5 7 12 0 17"/></>;
  }
  return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>{drawing}</svg>;
}

export default function DailyTaskExperience({ task, initialStage = 'idea', progressState = {}, resourceChanges, componentChange, taskFact, startMessage, suspended = false, onClose, onFindLocation, onSelectSolution, onComplete }) {
  const experience = getDailyTaskExperience(task);
  const [stage, setStage] = useState(initialStage);
  const [hint, setHint] = useState('');
  const selectedSolution = progressState.solution;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [problemFound, setProblemFound] = useState(false);
  const problemFoundRef = useRef(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const completionRef = useRef(false);
  const progressRef = useRef(0);
  const selectionTimerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(selectionTimerRef.current), []);

  useEffect(() => {
    if (task.status === 'completed' && stage === 'complete-pending') setStage('conclusion');
    else if (task.status === 'overdue' && task.recoveryStatus !== 'active' && stage === 'complete-pending') setStage('failed');
  }, [task.status, task.recoveryStatus, stage]);

  useEffect(() => {
    if (!holding || stage !== 'perform' || suspended) return undefined;
    const timer = window.setInterval(() => {
      const next = Math.min(100, progressRef.current + 5);
      progressRef.current = next;
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(timer);
        setHolding(false);
        setStage('complete-pending');
        if (!completionRef.current) {
          completionRef.current = true;
          onComplete(selectedSolution);
        }
      }
    }, 65);
    return () => window.clearInterval(timer);
  }, [holding, stage, suspended, onComplete, selectedSolution]);

  useEffect(() => {
    if (suspended) setHolding(false);
  }, [suspended]);

  const stopHolding = () => setHolding(false);
  const handleProblemFound = () => {
    if (problemFoundRef.current) return;
    problemFoundRef.current = true;
    setProblemFound(true);
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(990, context.currentTime + 0.16);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.25);
      oscillator.onended = () => context.close();
    } catch { /* Audio may be unavailable; discovery still completes. */ }
  };
  const handleSolution = (solution) => {
    if (selectedOptionId) return;
    setSelectedOptionId(solution.id);
    onSelectSolution(solution);
    selectionTimerRef.current = window.setTimeout(() => setStage('perform'), 280);
  };

  const guideMessages = {
    idea: startMessage ?? 'Mission ready! Let’s find the equipment that needs help.',
    discover: problemFound ? 'You found the trouble spot! Great eyes, Commander.' : 'Drag the magnifying glass over the picture to find the trouble spot.',
    solutions: 'Pick the plan you like best. Every choice can help!',
    perform: 'You’re ready! Hold the button and keep going until it’s done.',
    'complete-pending': 'Almost there! Your work is being saved.',
    conclusion: 'Mission complete! You helped the outpost today.',
    failed: 'This job needs another try. You can give it another go.',
  };

  return (
    <div className={`daily-task-experience-backdrop${suspended ? ' is-suspended' : ''}`} role="presentation" aria-hidden={suspended}>
      <section className="daily-task-experience" role="dialog" aria-modal="true" aria-labelledby="daily-task-experience-title">
        <button className="daily-task-experience-close" type="button" aria-label="Close task activity" onClick={onClose}>×</button>
        <header className="daily-task-experience-header">
          <span className="daily-task-experience-kicker">Commander activity · Day {task.scheduledDay}</span>
          <h2 id="daily-task-experience-title">{task.title}</h2>
          {stage !== 'conclusion' && stage !== 'complete-pending' && stage !== 'failed' && <div className="daily-task-step-list" aria-label={`Step ${Math.max(0, STAGE_ORDER.indexOf(stage)) + 1} of ${STEPS.length}`}>
            {STEPS.map((label, index) => (
              <span className={index <= STAGE_ORDER.indexOf(stage) ? 'is-current' : ''} key={label}>
                <b>{index + 1}</b>{label}
              </span>
            ))}
          </div>}
        </header>

        <div className="daily-task-guide" role="status" aria-live="polite">
          <MissionBuddy />
          <p>{guideMessages[stage] ?? guideMessages.idea}</p>
        </div>

        {stage === 'idea' && (
          <div className="daily-task-stage daily-task-idea-stage">
            <ObjectPicture picture={experience.picture} />
            <span className="daily-task-stage-label">Task idea</span>
            <p>{experience.scenario}</p>
            <p className="daily-task-location-note">Your check is at <strong>{task.targetComponentName}</strong>.</p>
            <button type="button" className="daily-task-why-button" aria-expanded={whyOpen} onClick={() => setWhyOpen((open) => !open)}>{whyOpen ? 'Hide why' : 'Why does this matter?'}</button>
            {whyOpen && <p className="daily-task-why-note">{task.riskIfDelayed}</p>}
            <button className="daily-task-primary" type="button" onClick={onFindLocation}>Let’s find it!</button>
          </div>
        )}

        {stage === 'discover' && (
          <div className="daily-task-stage daily-task-discover-stage">
            <span className="daily-task-stage-label">Discover Problem</span>
            <p>Let’s look closely at the <strong>{experience.picture.toLowerCase()}</strong>. Drag the magnifying glass across it to find the part that needs help.</p>
            <DiscoverProblemBoard
              picture={experience.picture}
              brokenPart={experience.brokenPart}
              componentId={task.targetComponentId}
              problemFound={problemFound}
              onProblemFound={handleProblemFound}
            />
            <p className={`daily-task-discover-feedback${problemFound ? ' is-found' : ''}`} role="status" aria-live="polite">
              {problemFound
                ? `You found the ${experience.brokenPart.toLowerCase()}! Nice spotting. Ready to choose a plan?`
                : 'The trouble spot is hiding in the picture. Keep looking!'}
            </p>
            {problemFound && <button className="daily-task-primary" type="button" onClick={() => setStage('solutions')}>Let’s choose a solution!</button>}
          </div>
        )}

        {stage === 'solutions' && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">Choose a Solution</span>
            <p>{experience.scenario}</p>
            <p>Which plan sounds good to you? Pick one and let’s get to work!</p>
            <ObjectPicture picture={experience.picture} brokenPart={experience.brokenPart} />
            <div className="daily-task-tool-grid daily-task-solution-options">
              {(() => {
                const usedEmojis = new Set();
                return getDailyTaskSolutions(task, experience).map((solution) => (
                <button
                  key={solution.id}
                  type="button"
                  className={selectedOptionId === solution.id ? 'is-selected' : ''}
                  aria-pressed={selectedOptionId === solution.id}
                  disabled={Boolean(selectedOptionId)}
                  onClick={() => handleSolution(solution)}
                >
                  <span className="daily-task-option-icon" aria-hidden="true"><SolutionIcon kind={getSolutionIcon(solution, experience, task, usedEmojis)} /></span>
                  <strong>{solution.name}</strong>
                  <small>{solution.playerDescription}</small>
                </button>
                ));
              })()}
            </div>
          </div>
        )}

        {stage === 'perform' && selectedSolution && (
          <div className="daily-task-stage daily-task-perform-stage">
            <span className="daily-task-stage-label">Complete Task</span>
            <p>Ready? Hold the button to {experience.action.toLowerCase()} your chosen plan.</p>
            <button
              className={`daily-task-hold-button${holding ? ' is-holding' : ''}`}
              type="button"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setHolding(true);
              }}
              onPointerUp={stopHolding}
              onPointerCancel={stopHolding}
              onLostPointerCapture={stopHolding}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  setHolding(true);
                }
              }}
              onKeyUp={stopHolding}
              aria-pressed={holding}
              aria-label={`Hold to ${experience.action.toLowerCase()}`}
            >
              <span className="daily-task-progress-fill" style={{ width: `${progress}%` }} />
              <span className="daily-task-hold-label">{holding ? 'Keep holding…' : `${experience.action} · Hold here`}</span>
            </button>
            <span className="daily-task-progress-label">{Math.round(progress)}% done</span>
          </div>
        )}

        {stage === 'complete-pending' && <div className="daily-task-stage"><span className="daily-task-stage-label">Saving task outcome</span><p>Almost there! Your work is being saved.</p></div>}
        {stage === 'failed' && <div className="daily-task-stage"><span className="daily-task-stage-label">Task needs recovery</span><p>The task deadline was reached before this completion could be recorded. Follow the existing recovery instructions to try again.</p><button className="daily-task-primary" type="button" onClick={onClose}>Close</button></div>}

        {stage === 'conclusion' && (
          <div className="daily-task-stage daily-task-success-stage">
            <span className="daily-task-success-check" aria-label="Task complete">✓</span>
            <span className="daily-task-stage-label">Conclusion</span>
            <p>You chose <strong>{selectedSolution?.name}</strong>. Nice work, Commander!</p>
            <p>{task.completionFeedback}</p>
            {componentChange !== null && componentChange !== undefined && <p>{componentChange > 0 ? `${task.affectedSystem} condition improved by ${componentChange} points.` : componentChange < 0 ? `${task.affectedSystem} condition changed by ${componentChange} points.` : 'The affected component condition stayed the same.'}</p>}
            <p>{resourceChanges && Object.keys(resourceChanges).length > 0
              ? `Actual resource changes: ${Object.entries(resourceChanges).map(([key, amount]) => `${key === 'science' ? 'Science' : key === 'power' ? 'Power' : key === 'water' ? 'Water' : key === 'oxygen' ? 'Oxygen' : key === 'food' ? 'Food' : key === 'battery' ? 'Battery' : key} ${amount > 0 ? '+' : ''}${amount}%`).join(', ')}.`
              : 'No resource values changed during this task.'}</p>
            <article className="daily-task-fact-card">
              <strong>Space fact</strong>
              <p>{taskFact ?? experience.fact}</p>
            </article>
            <button className="daily-task-primary" type="button" onClick={onClose}>Done</button>
          </div>
        )}
      </section>
    </div>
  );
}

function ObjectPicture({ picture, brokenPart }) {
  const cluePosition = getFaultCluePosition(picture, brokenPart);
  return (
    <div className="daily-task-object-picture" role="img" aria-label={`Illustration of ${picture}`}>
      <svg viewBox="0 0 240 132" aria-hidden="true">
        <circle cx="120" cy="66" r="56" fill="rgba(121, 216, 230, 0.1)" />
        <ObjectDrawing picture={picture} />
        {cluePosition && <FaultClue x={cluePosition.x} y={cluePosition.y} kind={cluePosition.kind} />}
      </svg>
      <strong>{picture}</strong>
    </div>
  );
}

function DiscoverProblemBoard({ picture, brokenPart, componentId, problemFound, onProblemFound }) {
  const [lensPosition, setLensPosition] = useState({ x: 32, y: 109 });
  const [isDragging, setIsDragging] = useState(false);
  const [targetPosition, setTargetPosition] = useState(null);
  const draggingRef = useRef(false);
  const cluePosition = getFaultCluePosition(picture, brokenPart);
  const activeCluePosition = targetPosition ?? cluePosition;
  const moveLensTo = (x, y) => {
    const next = { x: Math.max(17, Math.min(216, x)), y: Math.max(17, Math.min(109, y)) };
    setLensPosition(next);
    if (activeCluePosition && Math.hypot(next.x - activeCluePosition.x, next.y - activeCluePosition.y) <= 18) onProblemFound();
  };
  const moveLensFromPointer = (event) => {
    if (!draggingRef.current) return;
    const svg = event.currentTarget;
    const matrix = svg.getScreenCTM?.();
    if (!matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    moveLensTo(local.x, local.y);
  };

  return (
    <div className={`daily-task-discover-board${problemFound ? ' is-found' : ''}`}>
      <div className="daily-task-discover-scene" aria-label={`3D view of the ${picture}`}>
        <Suspense fallback={<DiscoverPreviewLoading />}>
          <OutpostComponentPreview
            componentId={componentId}
            cluePosition={cluePosition}
            problemFound={problemFound}
            onTargetPosition={setTargetPosition}
          />
        </Suspense>
        <svg
          className="daily-task-discover-overlay"
          viewBox="0 0 240 132"
          aria-label={`Drag the magnifying glass over the ${picture} to discover the ${brokenPart.toLowerCase()}.`}
          onPointerMove={moveLensFromPointer}
          onPointerUp={() => { draggingRef.current = false; setIsDragging(false); }}
          onPointerCancel={() => { draggingRef.current = false; setIsDragging(false); }}
        >
          {problemFound && activeCluePosition && <FaultClue x={activeCluePosition.x} y={activeCluePosition.y} kind={cluePosition?.kind ?? 'crack'} />}
          <g
            className={`daily-task-discovery-lens${isDragging ? ' is-dragging' : ''}`}
            transform={`translate(${lensPosition.x} ${lensPosition.y})`}
            role="button"
            tabIndex="0"
            aria-label="Magnifying glass. Drag it over the picture, or use the arrow keys."
            onPointerDown={(event) => {
              event.preventDefault();
              draggingRef.current = true;
              setIsDragging(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const steps = { ArrowUp: [0, -7], ArrowDown: [0, 7], ArrowLeft: [-7, 0], ArrowRight: [7, 0] };
              const step = steps[event.key];
              if (!step) return;
              event.preventDefault();
              moveLensTo(lensPosition.x + step[0], lensPosition.y + step[1]);
            }}
          >
            <circle className="daily-task-discovery-lens-glass" r="16" />
            <circle className="daily-task-discovery-lens-glint" cx="-5" cy="-5" r="3" />
            <path d="M11 11 23 23" />
            <circle className="daily-task-discovery-lens-handle" cx="0" cy="0" r="20" />
          </g>
        </svg>
      </div>
      <span>{problemFound ? 'Problem found!' : 'Drag the glass over the picture. Arrow keys work too.'}</span>
    </div>
  );
}

function OutpostComponentPreview({ componentId, cluePosition, problemFound, onTargetPosition }) {
  const { scene } = useGLTF('/lunar/model.glb');
  const component = useMemo(() => {
    scene.updateMatrixWorld(true);
    let source = null;
    scene.traverse((object) => {
      if (!source && object.name?.match(new RegExp(`^${componentId}-[^/]+$`))) source = object;
    });
    if (!source) return null;
    const isolated = source.clone(true);
    isolated.applyMatrix4(source.matrixWorld);
    isolated.updateMatrixWorld(true);
    return isolated;
  }, [scene, componentId]);

  if (!component) {
    return <div className="daily-task-discover-preview-unavailable" role="status">This component preview isn’t available yet.</div>;
  }

  return (
    <Canvas className="daily-task-discover-canvas" dpr={[1, 1.5]} camera={{ position: [0, 0, 5], fov: 34 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1.7} />
      <directionalLight position={[3, 5, 6]} intensity={2.4} />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} />
      <Bounds fit clip margin={1.25}>
        <Center>
          <OutpostModelPart
            component={component}
            cluePosition={cluePosition}
            problemFound={problemFound}
            onTargetPosition={onTargetPosition}
          />
        </Center>
      </Bounds>
    </Canvas>
  );
}

function DiscoverPreviewLoading() {
  return (
    <div className="daily-task-discover-loading" role="status" aria-live="polite">
      <span className="daily-task-discover-spinner" aria-hidden="true" />
      <span>Loading component…</span>
    </div>
  );
}

function OutpostModelPart({ component, cluePosition, problemFound, onTargetPosition }) {
  const groupRef = useRef(null);
  const lastTargetRef = useRef({ x: Number.NaN, y: Number.NaN });
  const bounds = useMemo(() => new THREE.Box3().setFromObject(component), [component]);
  const size = useMemo(() => bounds.getSize(new THREE.Vector3()), [bounds]);
  const issuePoint = useMemo(() => {
    if (!cluePosition || bounds.isEmpty()) return null;
    return new THREE.Vector3(
      bounds.min.x + size.x * (cluePosition.x / 240),
      bounds.max.y - size.y * (cluePosition.y / 132),
      bounds.max.z + Math.max(size.z * 0.015, 0.01),
    );
  }, [bounds, cluePosition, size]);
  const markerRadius = Math.max(size.length() * 0.018, 0.04);

  useFrame(({ camera }) => {
    if (!groupRef.current || !issuePoint) return;
    const screenPoint = groupRef.current.localToWorld(issuePoint.clone()).project(camera);
    if (screenPoint.z < -1 || screenPoint.z > 1) return;
    const next = {
      x: Math.max(17, Math.min(216, ((screenPoint.x + 1) / 2) * 240)),
      y: Math.max(17, Math.min(109, ((1 - screenPoint.y) / 2) * 132)),
    };
    if (Math.abs(next.x - lastTargetRef.current.x) > 0.5 || Math.abs(next.y - lastTargetRef.current.y) > 0.5) {
      lastTargetRef.current = next;
      onTargetPosition(next);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={component} />
      {problemFound && issuePoint && (
        <mesh position={issuePoint}>
          <sphereGeometry args={[markerRadius, 24, 24]} />
          <meshStandardMaterial color="#ffc96d" emissive="#ff783f" emissiveIntensity={1.6} />
        </mesh>
      )}
    </group>
  );
}

function MissionBuddy() {
  return (
    <svg className="daily-task-buddy" viewBox="0 0 48 48" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 8V5m-4 0h8" />
        <rect x="9" y="13" width="30" height="25" rx="9" />
        <path d="M16 24h.1m15 0h.1M18 31c3 3 9 3 12 0M5 23v7m38-7v7" />
        <circle cx="24" cy="5" r="2" />
      </g>
    </svg>
  );
}

function DiscoverArtwork({ picture }) {
  const name = picture.toLowerCase();
  const outline = { stroke: '#b9edf1', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const panelCells = <g stroke="#75c8dc" strokeWidth="1.5" opacity="0.9"><path d="m78 42-12 42m31-42-7 42m31-42-2 42m28-42 4 42m18-42 10 42M72 57h95M68 72h104" /></g>;

  let object;
  if (/battery|power unit|cooling loop/.test(name)) {
    object = <>
      <rect x="68" y="32" width="105" height="76" rx="13" fill="url(#discover-metal)" {...outline} />
      <path d="M101 32V23h39v9" fill="none" stroke="#d2e7e3" strokeWidth="4" strokeLinecap="round" />
      <rect x="84" y="48" width="73" height="28" rx="6" fill="#132f42" stroke="#67b9c8" strokeWidth="2" />
      <path d="M92 67h12l7-12 8 15 8-10 8 7h14" fill="none" stroke="#8df0c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="86" cy="91" r="4" fill="#8ef0c4" /><circle cx="100" cy="91" r="4" fill="#ffd47d" />
      <path d="M173 55h18v30h-18m9-30v-8m0 68v-8" fill="none" stroke="#91b9c6" strokeWidth="4" strokeLinecap="round" />
      <path d="M188 65h11m-11 10h11" stroke="#66d8da" strokeWidth="3" strokeLinecap="round" />
    </>;
  } else if (/solar|panel|radiator|tracker/.test(name)) {
    object = <>
      <path d="m73 34 99 0 22 55H53Z" fill="url(#discover-panel-glass)" {...outline} />
      {panelCells}
      <path d="m112 90-7 20m37-20 8 20m-62 1h88" fill="none" stroke="#d0e4c1" strokeWidth="5" strokeLinecap="round" />
      <circle cx="111" cy="108" r="5" fill="#92c9d5" stroke="#d9f3ed" strokeWidth="2" />
      <circle cx="142" cy="108" r="5" fill="#92c9d5" stroke="#d9f3ed" strokeWidth="2" />
      <circle cx="192" cy="31" r="13" fill="#ffc96d" opacity="0.95" />
      <path d="M192 11v-5m0 50v-5m20-20h5m-50 0h5m34-14 4-4m-36 36 4-4m28 0 4 4m-36-36 4 4" stroke="#ffd991" strokeWidth="2.5" strokeLinecap="round" />
    </>;
  } else if (/plant|crop|greenhouse|harvest/.test(name)) {
    object = <>
      <path d="M51 105V54l69-37 69 37v51" fill="rgba(68, 157, 162, 0.17)" stroke="#a5e8e5" strokeWidth="3" strokeLinejoin="round" />
      <path d="M51 54h138M120 19v86" fill="none" stroke="#77c9d2" strokeWidth="2" opacity="0.75" />
      <path d="M63 104h114v13H63z" fill="#536c54" stroke="#b4d8ba" strokeWidth="2" />
      <path d="M81 103V77m0 15c-15 0-19-11-18-21 12 1 20 8 18 21Zm0-7c1-13 10-19 21-18-1 13-8 19-21 18Z" fill="#68bd82" stroke="#c0f1bd" strokeWidth="2" strokeLinejoin="round" />
      <path d="M120 103V68m0 18c-16 0-21-12-19-23 13 1 22 9 19 23Zm0-8c2-14 12-21 24-19-2 14-11 21-24 19Z" fill="#79d18b" stroke="#c0f1bd" strokeWidth="2" strokeLinejoin="round" />
      <path d="M158 103V80m0 14c-12 0-15-9-14-17 9 1 15 6 14 17Zm0-6c1-10 8-15 17-14-1 10-7 15-17 14Z" fill="#63b77d" stroke="#c0f1bd" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="177" cy="32" r="6" fill="#ffd47d" />
    </>;
  } else if (/pipe|water|filter|recycler|air filter|hose/.test(name)) {
    object = <>
      <path d="M45 39h38v23h75V39h38v57h-39V78H83v18H45Z" fill="none" stroke="#92dbe5" strokeWidth="12" strokeLinejoin="round" />
      <path d="M45 39h38v23h75V39h38v57h-39V78H83v18H45Z" fill="none" stroke="#d5f3f0" strokeWidth="3" strokeLinejoin="round" />
      <rect x="105" y="53" width="33" height="37" rx="9" fill="url(#discover-metal)" stroke="#d2eeee" strokeWidth="2.5" />
      <path d="M111 60h21m-21 8h21m-21 8h21" stroke="#65c7d5" strokeWidth="2" strokeLinecap="round" />
      <circle cx="121" cy="70" r="5" fill="#ffd47d" stroke="#fff0bd" strokeWidth="2" />
      <path d="M68 51v-9m108 45v-9" stroke="#7fd4e4" strokeWidth="3" strokeLinecap="round" />
      <path d="M195 104c0-5 7-12 7-12s7 7 7 12a7 7 0 0 1-14 0Z" fill="#74d7ec" stroke="#d8f7fa" strokeWidth="2" />
    </>;
  } else if (/door|airlock|hatch|seal|shelter/.test(name)) {
    object = <>
      <rect x="63" y="18" width="116" height="101" rx="28" fill="url(#discover-metal)" stroke="#c4e7e9" strokeWidth="4" />
      <rect x="76" y="29" width="90" height="82" rx="23" fill="#18344a" stroke="#67b8c6" strokeWidth="3" />
      <circle cx="121" cy="70" r="31" fill="#24495b" stroke="#9bd8db" strokeWidth="4" />
      <circle cx="121" cy="70" r="22" fill="#183348" stroke="#7ebdc6" strokeWidth="2" />
      <path d="M105 70h32m-16-16v32" stroke="#c2e8df" strokeWidth="4" strokeLinecap="round" />
      <circle cx="121" cy="70" r="5" fill="#ffd47d" />
      <g fill="#d6edf0"><circle cx="72" cy="45" r="2"/><circle cx="170" cy="45" r="2"/><circle cx="72" cy="96" r="2"/><circle cx="170" cy="96" r="2"/></g>
    </>;
  } else if (/antenna|radio|mast|beacon/.test(name)) {
    object = <>
      <path d="M120 110V37m-28 74h56m-36-74h16" fill="none" stroke="#d3e6e6" strokeWidth="5" strokeLinecap="round" />
      <path d="M111 37h18l-9-17Z" fill="#7acbd8" stroke="#d3f1ee" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="120" cy="34" r="6" fill="#ffd47d" stroke="#fff0bd" strokeWidth="2" />
      <path d="M101 47c-15 12-15 27 0 39m38-39c15 12 15 27 0 39M108 56c-8 6-8 15 0 21m24-21c8 6 8 15 0 21" fill="none" stroke="#70d5de" strokeWidth="3" strokeLinecap="round" />
      <rect x="84" y="81" width="20" height="20" rx="4" fill="#315d6e" stroke="#9bdce0" strokeWidth="2" />
      <circle cx="94" cy="91" r="3" fill="#8ef0c4" />
    </>;
  } else if (/rover|wheel|brake/.test(name)) {
    object = <>
      <path d="m62 75 20-34h77l20 34-9 15H72Z" fill="url(#discover-metal)" stroke="#c8e6e6" strokeWidth="3" strokeLinejoin="round" />
      <path d="M89 45h20v26H75Zm28 0h35v26h-35Z" fill="#4c9ca9" stroke="#a8e3e5" strokeWidth="2" />
      <path d="M119 49v18m10-18v18m10-18v18" stroke="#bdebf0" strokeWidth="1.5" />
      <circle cx="88" cy="91" r="16" fill="#132837" stroke="#d7e8d9" strokeWidth="5" />
      <circle cx="153" cy="91" r="16" fill="#132837" stroke="#d7e8d9" strokeWidth="5" />
      <circle cx="88" cy="91" r="5" fill="#ffc96d" /><circle cx="153" cy="91" r="5" fill="#ffc96d" />
      <path d="M94 77V66h36v10" fill="none" stroke="#d0e4c1" strokeWidth="4" strokeLinecap="round" />
    </>;
  } else if (/suit/.test(name)) {
    object = <>
      <circle cx="120" cy="35" r="25" fill="url(#discover-metal)" stroke="#d5eeee" strokeWidth="3" />
      <path d="M101 32q19-17 38 0v11q-19 17-38 0Z" fill="#173247" stroke="#75ccd4" strokeWidth="2.5" />
      <path d="M94 65q26-15 52 0l17 45H77Z" fill="url(#discover-metal)" stroke="#c6e8e9" strokeWidth="3" strokeLinejoin="round" />
      <rect x="104" y="74" width="32" height="23" rx="5" fill="#23485b" stroke="#a6dfe0" strokeWidth="2" />
      <circle cx="120" cy="85" r="6" fill="#ffd47d" />
      <path d="m95 72-18 20m68-20 18 20m-43 18v10m17-10v10" fill="none" stroke="#d5eeee" strokeWidth="4" strokeLinecap="round" />
    </>;
  } else if (/medical|food|supply|container|kit|shelf/.test(name)) {
    object = <>
      <path d="M57 43h126v66H57Z" fill="url(#discover-metal)" stroke="#c5e8e9" strokeWidth="3" />
      <path d="M57 63h126M57 87h126" stroke="#91cbd0" strokeWidth="3" />
      <rect x="72" y="33" width="30" height="27" rx="5" fill="#285267" stroke="#c2e8e5" strokeWidth="2" />
      <rect x="113" y="33" width="29" height="27" rx="5" fill="#315a68" stroke="#c2e8e5" strokeWidth="2" />
      <rect x="152" y="33" width="20" height="27" rx="5" fill="#254659" stroke="#c2e8e5" strokeWidth="2" />
      <path d="M81 44h12m-6-6v12" stroke="#ff9d91" strokeWidth="3" strokeLinecap="round" />
      <path d="M68 74h23m-23 23h33m11-23h27m-27 23h42" stroke="#ffd47d" strokeWidth="3" strokeLinecap="round" />
      <path d="M71 109v8m98-8v8" stroke="#d1e8df" strokeWidth="5" strokeLinecap="round" />
    </>;
  } else if (/telescope|science|sensor/.test(name)) {
    object = <>
      <path d="m66 40 91 13-7 31-91-13Z" fill="url(#discover-metal)" stroke="#c8e8e9" strokeWidth="3" strokeLinejoin="round" />
      <path d="m77 42-5 24m72-11-4 22" stroke="#68c8d4" strokeWidth="2" />
      <circle cx="158" cy="57" r="14" fill="#274c60" stroke="#b7e9e6" strokeWidth="3" />
      <circle cx="158" cy="57" r="7" fill="#7de0e7" opacity="0.75" />
      <path d="m112 81-22 34m48-27 19 27m-44-32 18 32m-42 0h80" fill="none" stroke="#d1e8df" strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="106" r="4" fill="#ffd47d" />
    </>;
  } else if (/workshop|tool/.test(name)) {
    object = <>
      <path d="M49 84h143v15H49Zm13-17h117v17H62Z" fill="url(#discover-metal)" stroke="#c9e7e8" strokeWidth="3" strokeLinejoin="round" />
      <path d="M74 99v17m94-17v17" stroke="#b9d9d9" strokeWidth="5" strokeLinecap="round" />
      <path d="M90 61 111 40l8 8-21 21Zm49-14 8-8 18 18-8 8Z" fill="#79cbd6" stroke="#d3f0ed" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="157" cy="55" r="8" fill="#203f54" stroke="#bde9e8" strokeWidth="2" />
      <path d="M84 76h83" stroke="#71c6d2" strokeWidth="2" />
    </>;
  } else {
    object = <>
      <rect x="62" y="32" width="116" height="77" rx="13" fill="url(#discover-metal)" stroke="#c6e8e9" strokeWidth="3" />
      <path d="M95 32v-9h49v9m-25 22v35m-17-17h34" stroke="#d7efeb" strokeWidth="4" strokeLinecap="round" />
      <rect x="76" y="45" width="21" height="14" rx="3" fill="#224459" stroke="#7ccbd2" strokeWidth="2" />
      <circle cx="164" cy="51" r="5" fill="#8ef0c4" />
      <path d="M78 96h85" stroke="#6dbbca" strokeWidth="3" strokeLinecap="round" />
    </>;
  }

  return (
    <g className="daily-task-discover-artwork">
      <defs>
        <linearGradient id="discover-panel-glass" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#42a8bc" /><stop offset="1" stopColor="#244e70" /></linearGradient>
        <linearGradient id="discover-metal" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#6ba8b2" /><stop offset="0.55" stopColor="#31576b" /><stop offset="1" stopColor="#243a52" /></linearGradient>
        <radialGradient id="discover-back-glow"><stop stopColor="#3a91a1" stopOpacity="0.34" /><stop offset="1" stopColor="#132a3c" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="120" cy="70" rx="112" ry="62" fill="url(#discover-back-glow)" />
      <ellipse cx="120" cy="117" rx="78" ry="7" fill="#76c9d2" opacity="0.14" />
      {object}
    </g>
  );
}

function getFaultCluePosition(picture, brokenPart = '') {
  if (!brokenPart) return null;
  const part = brokenPart.toLowerCase();
  const context = picture.toLowerCase();
  if (/dusty|clogged/.test(part)) return { x: 145, y: 52, kind: 'dust' };
  if (/pipe joint/.test(part)) return { x: 111, y: 63, kind: 'leak' };
  if (/charge port/.test(part)) return { x: 120, y: 30, kind: 'spark' };
  if (/door|hatch|container.*seal|seal/.test(part)) return { x: 80, y: 58, kind: 'crack' };
  if (/terminal|connector|antenna|backup switch|warning light|tracker control/.test(part)) {
    return /antenna/.test(part) ? { x: 120, y: 43, kind: 'spark' } : { x: 151, y: 55, kind: 'spark' };
  }
  if (/plant feed|ready leaves/.test(part)) return { x: 120, y: 76, kind: 'droop' };
  if (/shelf|supply tray/.test(part)) return { x: 143, y: 79, kind: 'mess' };
  if (/wheel|brake/.test(part)) return { x: 91, y: 91, kind: 'crack' };
  if (/lens|sensor/.test(part)) return { x: 110, y: 52, kind: 'smudge' };
  if (/loose tool handle/.test(part)) return { x: 101, y: 53, kind: 'crack' };
  if (/air hose/.test(part)) return { x: 145, y: 82, kind: 'crack' };
  if (/coolant pipe/.test(part)) return { x: 111, y: 63, kind: 'crack' };
  if (/test panel|temperature sensor/.test(part)) return { x: 120, y: 67, kind: 'smudge' };
  if (/plant|greenhouse/.test(context)) return { x: 120, y: 76, kind: 'droop' };
  if (/rover|wheel/.test(context)) return { x: 91, y: 91, kind: 'crack' };
  if (/antenna|radio|mast/.test(context)) return { x: 120, y: 43, kind: 'spark' };
  return { x: 148, y: 72, kind: 'crack' };
}

function FaultClue({ x, y, kind }) {
  return (
    <g className={`daily-task-fault-clue is-${kind}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r="10" />
      {kind === 'dust' && <><circle cx="-3" cy="-2" r="1.5" /><circle cx="3" cy="2" r="2" /><circle cx="1" cy="-4" r="1" /></>}
      {kind === 'leak' && <><path d="M0-6C-1-3-4-1-4 2a4 4 0 0 0 8 0C4-1 1-3 0-6Z" /><path d="M5 5v3" /></>}
      {kind === 'crack' && <path d="m-4-5 3 4-2 2 5 4" />}
      {kind === 'spark' && <path d="m1-6-4 6h4l-2 6 6-8H1Z" />}
      {kind === 'droop' && <path d="M0 5V-3m0 1-4-3m4 2 4-4" />}
      {kind === 'mess' && <><path d="M-5 5h10M-3 1h6M-2-3h4" /><circle cx="5" cy="-5" r="1" /></>}
      {kind === 'smudge' && <><path d="M-5-3h10M-4 0h8M-5 3h6" /><circle cx="4" cy="-5" r="1" /></>}
    </g>
  );
}

function ObjectDrawing({ picture }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (/battery/i.test(picture)) return <g {...common}><rect x="74" y="39" width="92" height="63" rx="10"/><path d="M99 39V29h42v10m-42 32h42m-21-19v38"/><circle cx="89" cy="54" r="3"/><circle cx="151" cy="54" r="3"/></g>;
  if (/plant|crop|greenhouse/i.test(picture)) return <g {...common}><path d="M120 104V54m0 22C89 77 86 51 87 42c22 2 34 11 33 34Zm1-12c7-23 27-27 42-25-2 22-14 32-42 34Z"/><path d="M94 108h52"/></g>;
  if (/recycler/i.test(picture)) return <g {...common}><circle cx="120" cy="66" r="34"/><path d="m106 40 14-10 4 17m11 8 16 9-15 9m-24 5-1 18-14-10"/><path d="M103 65h34m-28-10 22 22m0-22-22 22"/></g>;
  if (/pipe|water|cooling loop/i.test(picture)) return <g {...common}><path d="M61 39h33v24h50V39h34v55h-36V76H94v18H61Z"/><circle cx="111" cy="63" r="9"/><path d="M71 51h11m83 29h12"/></g>;
  if (/solar|panel|radiator|cooling/i.test(picture)) return <g {...common}><path d="m82 37 73 0 16 47H66Z"/><path d="M91 38 80 84m28-46-6 46m29-46 1 46m15-46 9 46M72 60h82M69 74h92M120 85v22m-25 0h50"/></g>;
  if (/antenna|radio|mast|beacon/i.test(picture)) return <g {...common}><path d="M120 103V45m-21 58h42M110 45h20M98 57c-16 13-16 27 0 39m44-39c16 13 16 27 0 39M106 67c-8 7-8 14 0 20m28-20c8 7 8 14 0 20"/><circle cx="120" cy="43" r="6"/></g>;
  if (/rover|wheel/i.test(picture)) return <g {...common}><path d="M72 83h96l-12-26H91Z"/><circle cx="91" cy="91" r="15"/><circle cx="151" cy="91" r="15"/><path d="M104 56V44h32v13"/></g>;
  if (/door|airlock|hatch|seal|shelter/i.test(picture)) return <g {...common}><rect x="78" y="27" width="84" height="82" rx="20"/><rect x="91" y="39" width="58" height="65" rx="14"/><circle cx="136" cy="72" r="3"/><path d="M66 110h108"/></g>;
  if (/filter|recycler/i.test(picture)) return <g {...common}><path d="M91 28h58l-5 17 12 14v37q-35 21-70 0V59l12-14Z"/><path d="M97 62h46m-46 13h46m-46 13h46"/></g>;
  if (/suit/i.test(picture)) return <g {...common}><circle cx="120" cy="40" r="20"/><path d="M99 63q21-14 42 0l13 42h-68Zm4 10-18 20m52-20 18 20M108 84v21m24-21v21"/><path d="M108 37h24"/></g>;
  if (/telescope|science/i.test(picture)) return <g {...common}><path d="m78 37 81 17-8 28-81-17Z"/><path d="m101 69-15 38m44-29 14 29m-37-42 22 42m-39 0h62"/><circle cx="158" cy="56" r="8"/></g>;
  if (/medical|supply|food|container|kit/i.test(picture)) return <g {...common}><rect x="72" y="42" width="96" height="63" rx="10"/><path d="M100 42v-9h40v9m-20 17v28m-14-14h28"/><path d="M84 94h72"/></g>;
  if (/workshop|tool/i.test(picture)) return <g {...common}><path d="M67 82h106v13H67Zm14-13h78v13H81Zm15-26 15 15-9 9-15-15q-12 5-20-5l15-3 3-15q10 9 1 19Zm57 3h18v23h-18z"/><path d="M91 95v13m58-13v13"/></g>;
  return <g {...common}><rect x="72" y="34" width="96" height="70" rx="12"/><circle cx="120" cy="69" r="16"/><path d="M91 93h58M120 34V21m-8 0h16"/></g>;
}

export function ToolPicture({ kind, large = false }) {
  return (
    <span className={`daily-task-tool-picture${large ? ' is-large' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <ToolDrawing kind={kind} />
      </svg>
    </span>
  );
}

function ToolDrawing({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (kind === 'gloves') return <g {...common}><path d="M18 36V18a4 4 0 0 1 8 0v12-16a4 4 0 0 1 8 0v16-13a4 4 0 0 1 8 0v15-9a4 4 0 0 1 8 0v20q0 13-13 13H31q-9 0-13-10l-5-11a5 5 0 0 1 5-6Z"/><path d="M28 44h17"/></g>;
  if (kind === 'wrench') return <g {...common}><path d="M39 12a17 17 0 0 0-20 21L9 43a8 8 0 0 0 12 12l10-10a17 17 0 0 0 21-20l-12 11-10-2-2-10Z"/></g>;
  if (kind === 'clamp') return <g {...common}><path d="M49 12H27a17 17 0 0 0 0 34h22M49 8v42M40 27h9m-9 7h9"/></g>;
  if (kind === 'screwdriver') return <g {...common}><path d="m16 47 26-26m-7-7 7-7 13 13-7 7m-32 27 6-6m-13 9 8-8"/></g>;
  if (kind === 'brush') return <g {...common}><path d="m18 43 24-24 9 9-24 24-9-9Zm19-29 8-8 13 13-8 8M13 48l9 9"/><path d="M12 13h8m-4-4v8"/></g>;
  if (kind === 'cloth') return <g {...common}><path d="m13 15 36-7 5 40-37 8Z"/><path d="m21 24 22-4m-20 13 22-4m-20 13 16-3"/></g>;
  if (kind === 'cable') return <g {...common}><path d="M17 12v11m30-11v11M17 23c0 26 30 9 30 29"/><rect x="11" y="8" width="12" height="8" rx="2"/><rect x="41" y="8" width="12" height="8" rx="2"/><circle cx="47" cy="52" r="5"/></g>;
  if (kind === 'patch') return <g {...common}><path d="M15 15h34v34H15z"/><path d="M22 22h20v20H22zM15 25h7m-7 8h7m-7 8h7m20-26v7m-8-7v7m-8 20v7m8-7v7m8-14h7m-7-8h7"/></g>;
  if (kind === 'filter') return <g {...common}><path d="M20 16h24l6 9v25l-6 7H20l-6-7V25Z"/><path d="M20 27h24M20 34h24M20 41h24M20 48h24M25 16v-5h14v5"/></g>;
  if (kind === 'tester') return <g {...common}><circle cx="28" cy="27" r="16"/><path d="m40 39 14 14M20 28l6 6 11-14"/></g>;
  if (kind === 'watering') return <g {...common}><path d="M18 30h29v24H18zM47 35h8l6 8H47M23 30V20h18l6 10M26 18V12"/><path d="M30 39h5m7 0h0"/></g>;
  if (kind === 'checklist') return <g {...common}><rect x="15" y="12" width="36" height="44" rx="5"/><path d="m22 25 4 4 7-8m-11 17 4 4 7-8m8-8h7m-7 16h7"/></g>;
  if (kind === 'scissors') return <g {...common}><circle cx="18" cy="45" r="8"/><circle cx="18" cy="19" r="8"/><path d="m24 24 30 29M24 40l30-29m-20 16 10 10"/></g>;
  return <g {...common}><path d="m16 48 31-31 6 6-31 31H16Zm23-23 8 8M12 13l39 39"/></g>;
}
