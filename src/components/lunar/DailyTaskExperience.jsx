import { useEffect, useRef, useState } from 'react';
import { getDailyTaskExperience, getDailyTaskSolutions } from '../../data/dailyTaskExperiences';
import './DailyTaskExperience.css';

const STEPS = ['Task Idea', 'Choose a Solution', 'Tool Selection', 'Complete Task', 'Conclusion'];
const STAGE_ORDER = ['idea', 'solutions', 'tool', 'perform', 'conclusion'];

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

export default function DailyTaskExperience({ task, initialStage = 'idea', progressState = {}, resourceChanges, componentChange, onClose, onFindLocation, onSelectSolution, onPickUpTool, onComplete }) {
  const experience = getDailyTaskExperience(task);
  const [stage, setStage] = useState(initialStage);
  const [hint, setHint] = useState('');
  const selectedTool = progressState.pickedUp ? progressState.solution?.tool : null;
  const selectedSolution = progressState.solution;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const completionRef = useRef(false);
  const progressRef = useRef(0);

  useEffect(() => {
    if (task.status === 'completed' && stage === 'complete-pending') setStage('conclusion');
    else if (task.status === 'overdue' && task.recoveryStatus !== 'active' && stage === 'complete-pending') setStage('failed');
  }, [task.status, task.recoveryStatus, stage]);

  useEffect(() => {
    if (!holding || stage !== 'perform') return undefined;
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
  }, [holding, stage, onComplete, selectedSolution]);

  const stopHolding = () => setHolding(false);
  const handleSolution = (solution) => { onSelectSolution(solution); setStage('tool'); };

  return (
    <div className="daily-task-experience-backdrop" role="presentation">
      <section className="daily-task-experience" role="dialog" aria-modal="true" aria-labelledby="daily-task-experience-title">
        <button className="daily-task-experience-close" type="button" aria-label="Close task activity" onClick={onClose}>×</button>
        <header className="daily-task-experience-header">
          <span className="daily-task-experience-kicker">Crew helper activity · Day {task.scheduledDay}</span>
          <h2 id="daily-task-experience-title">{task.title}</h2>
          {stage !== 'conclusion' && stage !== 'complete-pending' && stage !== 'failed' && <div className="daily-task-step-list" aria-label={`Step ${Math.max(0, STAGE_ORDER.indexOf(stage)) + 1} of 5`}>
            {STEPS.map((label, index) => (
              <span className={index <= STAGE_ORDER.indexOf(stage) ? 'is-current' : ''} key={label}>
                <b>{index + 1}</b>{label}
              </span>
            ))}
          </div>}
        </header>

        {stage === 'idea' && (
          <div className="daily-task-stage daily-task-idea-stage">
            <ObjectPicture picture={experience.picture} />
            <span className="daily-task-stage-label">Task idea</span>
            <p>{experience.scenario}</p>
            <p className="daily-task-location-note">Your check is at <strong>{task.targetComponentName}</strong>.</p>
            <button className="daily-task-primary" type="button" onClick={onFindLocation}>Let’s find it!</button>
          </div>
        )}

        {stage === 'solutions' && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">Choose a Solution</span>
            <p>{experience.scenario}</p>
            <p>How would you like to help? Every choice can solve the problem.</p>
            <ObjectPicture picture={experience.picture} brokenPart={experience.brokenPart} />
            <div className="daily-task-tool-grid daily-task-solution-options">
              {(() => {
                const usedEmojis = new Set();
                return getDailyTaskSolutions(task, experience).map((solution) => (
                <button key={solution.id} type="button" onClick={() => handleSolution(solution)}>
                  <span className="daily-task-option-icon" aria-hidden="true"><SolutionIcon kind={getSolutionIcon(solution, experience, task, usedEmojis)} /></span>
                  <strong>{solution.name}</strong>
                  <small>{solution.playerDescription}</small>
                </button>
                ));
              })()}
            </div>
          </div>
        )}

        {stage === 'tool' && selectedSolution && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">Tool Selection</span>
            <p>Great choice! You picked <strong>{selectedSolution.name}</strong>.</p>
            <ToolPicture kind={selectedSolution.tool.picture} large />
            <p><strong>{selectedSolution.tool.name}</strong> · {selectedSolution.toolExplanation}</p>
            <button className="daily-task-primary" type="button" onClick={onPickUpTool}>Let’s Pick Up the Tool</button>
          </div>
        )}

        {stage === 'waiting' && <div className="daily-task-stage"><span className="daily-task-stage-label">Tool required</span><p>Pick up the <strong>{selectedSolution?.tool.name}</strong> in the Workshop and return to this location. Your solution is saved.</p><button className="daily-task-primary" type="button" onClick={onClose}>Continue exploring</button></div>}

        {stage === 'perform' && (!selectedTool || !selectedSolution) && <div className="daily-task-stage"><span className="daily-task-stage-label">Required tool</span><p>Equip the selected tool in the Workshop before continuing.</p></div>}

        {stage === 'perform' && selectedTool && selectedSolution && (
          <div className="daily-task-stage daily-task-perform-stage">
            <span className="daily-task-stage-label">Complete Task</span>
            <p><strong>{selectedSolution.name}</strong>: use the <strong>{selectedTool.name.toLowerCase()}</strong> to {experience.action.toLowerCase()}.</p>
            <ToolPicture kind={selectedTool.picture} large />
            <button
              className="daily-task-hold-button"
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
              aria-label={`Hold to ${experience.action.toLowerCase()}`}
            >
              <span className="daily-task-progress-fill" style={{ width: `${progress}%` }} />
              <span className="daily-task-hold-label">{holding ? 'Keep holding…' : `${experience.action} · Hold here`}</span>
            </button>
            <span className="daily-task-progress-label">{Math.round(progress)}% done</span>
          </div>
        )}

        {stage === 'complete-pending' && <div className="daily-task-stage"><span className="daily-task-stage-label">Saving task outcome</span><p>The outpost is recording the repair and its effects.</p></div>}
        {stage === 'failed' && <div className="daily-task-stage"><span className="daily-task-stage-label">Task needs recovery</span><p>The task deadline was reached before this completion could be recorded. Follow the existing recovery instructions to try again.</p><button className="daily-task-primary" type="button" onClick={onClose}>Close</button></div>}

        {stage === 'conclusion' && (
          <div className="daily-task-stage daily-task-success-stage">
            <span className="daily-task-success-check" aria-label="Task complete">✓</span>
            <span className="daily-task-stage-label">Conclusion</span>
            <p>You selected <strong>{selectedSolution?.name}</strong> using the <strong>{selectedTool?.name}</strong>. Nice work!</p>
            <p>{task.completionFeedback}</p>
            {componentChange !== null && componentChange !== undefined && <p>{componentChange > 0 ? `${task.affectedSystem} condition improved by ${componentChange} points.` : componentChange < 0 ? `${task.affectedSystem} condition changed by ${componentChange} points.` : 'The affected component condition stayed the same.'}</p>}
            <p>{resourceChanges && Object.keys(resourceChanges).length > 0
              ? `Actual resource changes: ${Object.entries(resourceChanges).map(([key, amount]) => `${key === 'science' ? 'Science' : key === 'power' ? 'Power' : key === 'water' ? 'Water' : key === 'oxygen' ? 'Oxygen' : key === 'food' ? 'Food' : key === 'battery' ? 'Battery' : key} ${amount > 0 ? '+' : ''}${amount}%`).join(', ')}.`
              : 'No resource values changed during this task.'}</p>
            <article className="daily-task-fact-card">
              <strong>Space fact</strong>
              <p>{experience.fact}</p>
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
