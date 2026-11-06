import { useEffect, useRef, useState } from 'react';
import { getDailyTaskExperience } from '../../data/dailyTaskExperiences';
import './DailyTaskExperience.css';

const STEPS = ['Task idea', 'Inspect', 'Choose a tool', 'Do the job'];
const TOOL_PURPOSES = {
  cable: 'connect equipment to power',
  wrench: 'tighten or loosen parts',
  brush: 'clear dust and dirt',
  patch: 'cover a hole or tear',
  tester: 'check a signal or reading',
  watering: 'water and feed plants',
  checklist: 'keep supplies in order',
  screwdriver: 'turn small screws',
  clamp: 'hold parts together',
  scissors: 'trim or cut plants',
  gloves: 'protect hands while working',
  cloth: 'wipe a surface clean',
};

export default function DailyTaskExperience({ task, initialStage = 'idea', onClose, onFindLocation, onComplete }) {
  const experience = getDailyTaskExperience(task);
  const [stage, setStage] = useState(initialStage);
  const [hint, setHint] = useState('');
  const [selectedTool, setSelectedTool] = useState(null);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const completionRef = useRef(false);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!holding || stage !== 'perform') return undefined;
    const timer = window.setInterval(() => {
      const next = Math.min(100, progressRef.current + 5);
      progressRef.current = next;
      setProgress(next);
      if (next >= 100) {
        window.clearInterval(timer);
        setHolding(false);
        setStage('success');
        if (!completionRef.current) {
          completionRef.current = true;
          onComplete();
        }
      }
    }, 65);
    return () => window.clearInterval(timer);
  }, [holding, stage, onComplete]);

  const stopHolding = () => setHolding(false);
  const handleToolChoice = (choice) => {
    if (choice.id === experience.correctTool) {
      setSelectedTool(choice);
      setHint('');
      setStage('perform');
      return;
    }
    const purpose = TOOL_PURPOSES[choice.id] ?? 'help with another kind of job';
    const rightTool = experience.tools.find((item) => item.id === experience.correctTool);
    setHint(`${choice.name} is useful to ${purpose}, but it won’t ${experience.action.toLowerCase()}. Try the ${rightTool?.name ?? 'other tool'} for this ${experience.brokenPart.toLowerCase()}.`);
  };

  return (
    <div className="daily-task-experience-backdrop" role="presentation">
      <section className="daily-task-experience" role="dialog" aria-modal="true" aria-labelledby="daily-task-experience-title">
        <button className="daily-task-experience-close" type="button" aria-label="Close task activity" onClick={onClose}>×</button>
        <header className="daily-task-experience-header">
          <span className="daily-task-experience-kicker">Crew helper activity · Day {task.scheduledDay}</span>
          <h2 id="daily-task-experience-title">{task.title}</h2>
          {stage !== 'success' && <div className="daily-task-step-list" aria-label={`Step ${Math.max(0, STEPS.indexOf(stage)) + 1} of 4`}>
            {STEPS.map((label, index) => (
              <span className={index <= STEPS.indexOf(stage) ? 'is-current' : ''} key={label}>
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

        {stage === 'inspect' && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">Inspect</span>
            <p>{experience.scenario}</p>
            <p>Look closely at this {experience.picture.toLowerCase()}. Tap the part that needs help.</p>
            <ObjectPicture picture={experience.picture} brokenPart={experience.brokenPart} />
            <div className="daily-task-part-grid">
              {experience.parts.map((part) => (
                <button key={part} type="button" onClick={() => {
                  if (part === experience.brokenPart) {
                    setHint('');
                    setStage('tools');
                  } else {
                    setHint(`Hmm, the ${part.toLowerCase()} looks okay. ${experience.hint} Let’s keep looking!`);
                  }
                }}>
                  <span className="daily-task-part-dot" aria-hidden="true" />{part}
                </button>
              ))}
            </div>
            {hint && <p className="daily-task-hint" role="status">{hint}</p>}
          </div>
        )}

        {stage === 'tools' && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">Choose the tool</span>
            <p>Which tool will help with <strong>{experience.brokenPart.toLowerCase()}</strong>?</p>
            <div className="daily-task-tool-grid">
              {experience.tools.map((choice) => (
                <button key={choice.id} type="button" onClick={() => handleToolChoice(choice)}>
                  <ToolPicture kind={choice.picture} />
                  <strong>{choice.name}</strong>
                </button>
              ))}
            </div>
            {hint && <p className="daily-task-hint" role="status">{hint}</p>}
          </div>
        )}

        {stage === 'perform' && selectedTool && (
          <div className="daily-task-stage daily-task-perform-stage">
            <span className="daily-task-stage-label">Do the job</span>
            <p>Use the <strong>{selectedTool.name.toLowerCase()}</strong> to {experience.action.toLowerCase()}.</p>
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

        {stage === 'success' && (
          <div className="daily-task-stage daily-task-success-stage">
            <span className="daily-task-success-check" aria-label="Task complete">✓</span>
            <span className="daily-task-stage-label">You did it!</span>
            <p>{task.completionFeedback}</p>
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

function ToolPicture({ kind, large = false }) {
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
  if (kind === 'wrench' || kind === 'clamp' || kind === 'screwdriver') return <g {...common}><path d="M39 13a17 17 0 0 0-21 21L9 43a8 8 0 0 0 12 12l10-10a17 17 0 0 0 21-21L42 34l-10-2-2-10Z"/></g>;
  if (kind === 'brush' || kind === 'cloth') return <g {...common}><path d="M18 40 41 17l8 8-23 23m-12 2q12-2 11 7H9q-2-7 5-14Zm23-31 8-8 14 14-8 8"/></g>;
  if (kind === 'cable') return <g {...common}><path d="M17 12v11m30-11v11M17 23c0 26 30 9 30 29"/><rect x="11" y="8" width="12" height="8" rx="2"/><rect x="41" y="8" width="12" height="8" rx="2"/><circle cx="47" cy="52" r="5"/></g>;
  if (kind === 'patch') return <g {...common}><path d="m18 46 28-28 10 10-28 28H18Z"/><path d="M31 23 41 33M24 30l10 10m-9 16h27"/></g>;
  if (kind === 'tester') return <g {...common}><circle cx="28" cy="27" r="16"/><path d="m40 39 14 14M20 28l6 6 11-14"/></g>;
  if (kind === 'watering') return <g {...common}><path d="M18 30h29v24H18zM47 35h8l6 8H47M23 30V20h18l6 10M26 18V12"/><path d="M30 39h5m7 0h0"/></g>;
  if (kind === 'checklist') return <g {...common}><rect x="15" y="12" width="36" height="44" rx="5"/><path d="m22 25 4 4 7-8m-11 17 4 4 7-8m8-8h7m-7 16h7"/></g>;
  if (kind === 'scissors') return <g {...common}><circle cx="18" cy="45" r="8"/><circle cx="18" cy="19" r="8"/><path d="m24 24 30 29M24 40l30-29m-20 16 10 10"/></g>;
  return <g {...common}><path d="m16 48 31-31 6 6-31 31H16Zm23-23 8 8M12 13l39 39"/></g>;
}
