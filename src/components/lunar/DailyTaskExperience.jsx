import { useEffect, useRef, useState } from 'react';
import { getDailyTaskExperience, getFirstFiveTaskPlan } from '../../data/dailyTaskExperiences';
import ThreeDEquipmentViewer from './ThreeDEquipmentViewer';
import './DailyTaskExperience.css';
import './ThreeDEquipmentViewer.css';

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
const REPAIR_PART_NAMES = {
  waterSeal: 'water seal',
  oxygenFilter: 'air filter',
  solarPatch: 'panel patch',
};
const BACKPACK_TOOL_DETAILS = {
  tester: { name: 'Diagnostic Scanner', picture: 'tester' },
  wrench: { name: 'Wrench', picture: 'wrench' },
  screwdriver: { name: 'Screwdriver', picture: 'screwdriver' },
  flashlight: { name: 'Flashlight', picture: 'flashlight' },
  pliers: { name: 'Pliers', picture: 'pliers' },
  gloves: { name: 'Safety Gloves', picture: 'gloves' },
  'repair-kit': { name: 'Repair Kit', picture: 'repair-kit' },
  clamp: { name: 'Pipe Clamp', picture: 'clamp' },
  patch: { name: 'Patch Applicator', picture: 'patch' },
  brush: { name: 'Filter Brush', picture: 'brush' },
};
const REPAIR_PART_DETAILS = {
  waterSeal: { name: 'Water seal', icon: '🫧' },
  oxygenFilter: { name: 'Air filter', icon: '🌬️' },
  solarPatch: { name: 'Solar patch', icon: '☀️' },
};
const REPAIR_ACTIONS = {
  'habitat-waterline-inspection': {
    'replace-water-seal': [
      { kind: 'tool', id: 'wrench', zone: 'valve', label: 'Turn off the water valve' },
      { kind: 'tool', id: 'patch', zone: 'fault', label: 'Prepare the seal applicator' },
      { kind: 'part', id: 'waterSeal', zone: 'fault', label: 'Fit the fresh water seal' },
      { kind: 'tool', id: 'wrench', zone: 'valve', label: 'Turn the valve back on' },
    ],
    'clamp-waterline': [
      { kind: 'tool', id: 'clamp', zone: 'fault', label: 'Place the clamp on the leak' },
      { kind: 'tool', id: 'wrench', zone: 'fault', label: 'Tighten the clamp' },
    ],
  },
  'oxygen-loop-filter-service': {
    'replace-oxygen-filter': [
      { kind: 'tool', id: 'wrench', zone: 'cover', label: 'Open the filter compartment' },
      { kind: 'part', id: 'oxygenFilter', zone: 'fault', label: 'Slide in the fresh air filter' },
      { kind: 'tool', id: 'wrench', zone: 'cover', label: 'Close the compartment' },
    ],
    'clean-oxygen-filter': [
      { kind: 'tool', id: 'wrench', zone: 'cover', label: 'Open the filter compartment' },
      { kind: 'tool', id: 'brush', zone: 'fault', label: 'Brush the filter clean' },
      { kind: 'tool', id: 'wrench', zone: 'cover', label: 'Put the filter back' },
    ],
  },
  'solar-array-inspection': {
    'patch-solar-panel': [
      { kind: 'tool', id: 'wrench', zone: 'connector', label: 'Loosen the cable connector' },
      { kind: 'tool', id: 'patch', zone: 'fault', label: 'Prepare the solar patch' },
      { kind: 'part', id: 'solarPatch', zone: 'fault', label: 'Fit the solar connection patch' },
      { kind: 'tool', id: 'wrench', zone: 'connector', label: 'Secure the connection' },
    ],
    'clean-solar-panel': [
      { kind: 'tool', id: 'wrench', zone: 'connector', label: 'Tighten the loose connection' },
    ],
  },
};

// Tasks that should use SVG diagrams instead of 3D models
const SVG_ONLY_TASKS = [
  'medical-kit-expiry-audit', // 2D inventory sorting is clearest
];

// Tasks that use hybrid 3D + SVG overlays
const HYBRID_TASKS = [
  'habitat-air-seal-check',
  'radiation-shelter-seal-check',
];

export default function DailyTaskExperience(props) {
  const experience = getDailyTaskExperience(props.task);
  const use3D = !SVG_ONLY_TASKS.includes(props.task.id);
  const useHybrid = HYBRID_TASKS.includes(props.task.id);
  
  if (props.task.scheduledDay <= 5 && !experience.repair) {
    return <FirstFiveDayTaskExperience 
      {...props} 
      experience={experience} 
      plan={getFirstFiveTaskPlan(props.task)}
      use3D={use3D}
      useHybrid={useHybrid}
    />;
  }
  if (experience.repair) {
    return <RepairAdventure
      {...props}
      experience={experience}
      repair={experience.repair}
      firstFiveDays={props.task.scheduledDay <= 5}
      use3D={use3D}
      useHybrid={useHybrid}
    />;
  }
  return <BasicDailyTaskExperience {...props} experience={experience} use3D={use3D} />;
}

// Shared pointer drag engine: a drop only registers after real pointer movement
// (8px), so a stray click never counts as a drop. Works for mouse and touch.
function useRepairDrag(onDrop) {
  const [dragging, setDragging] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const didDragRef = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    if (!dragging) return undefined;
    const handlePointerMove = (event) => {
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 8) {
        didDragRef.current = true;
      }
      setDragging((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    };
    const handlePointerUp = (event) => {
      if (didDragRef.current) {
        const target = document.elementFromPoint(event.clientX, event.clientY)
          ?.closest('[data-repair-zone]');
        if (target) dropRef.current?.(dragging.item, target.dataset.repairZone);
      }
      setDragging(null);
    };
    const handlePointerCancel = () => {
      didDragRef.current = false;
      setDragging(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dragging]);

  const startDrag = (item, event) => {
    didDragRef.current = false;
    setSelectedItem(null);
    setDragging({
      item,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
  };
  const chooseItem = (item) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelectedItem(item);
  };
  const useSelectedItem = (zone) => {
    if (!selectedItem) return;
    dropRef.current?.(selectedItem, zone);
    setSelectedItem(null);
  };
  return { dragging, didDragRef, selectedItem, startDrag, chooseItem, useSelectedItem };
}

function FirstFiveDayTaskExperience({
  task,
  onClose,
  onFindLocation,
  inventory,
  experience,
  plan,
  onComplete,
  use3D = false,  // NEW: whether to use 3D equipment viewer
}) {
  const [stage, setStage] = useState(task.status === 'completed' ? 'success' : 'diagnose');
  const [hintLevel, setHintLevel] = useState(0);
  const [hint, setHint] = useState('');
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [testArmed, setTestArmed] = useState(false);
  const completionRef = useRef(false);
  const availableTools = inventory?.tools ?? [];
  const visibleStage = task.status === 'completed' ? 'success' : stage;
  const steps = ['Diagnose', 'Repair', 'Test'];
  const stageIndex = { diagnose: 0, repair: 1, test: 2, success: 2 }[visibleStage];
  const toolName = (toolId) => BACKPACK_TOOL_DETAILS[toolId]?.name ?? toolId;
  const itemName = (item) => toolName(item?.id);
  const repairTool = plan.toolId;
  const requiredTool = visibleStage === 'repair' ? repairTool : 'tester';

  const handleDrop = (item, zone) => {
    if (item?.kind !== 'tool') {
      setHint('This job uses a reusable tool, not a spare part. Open the Engineer Backpack.');
      return;
    }
    if (visibleStage === 'diagnose') {
      if (item.id !== 'tester') {
        setHint('Try the Diagnostic Scanner. It can find the hidden fault!');
        return;
      }
      if (zone !== 'fault') {
        setHint(`Scanner ping! ${experience.hint}`);
        return;
      }
      setHint('Great detective work! The fault is glowing. Now choose the right tool to fix it.');
      setHintLevel(0);
      setStage('repair');
      return;
    }
    if (visibleStage === 'repair') {
      if (item.id !== repairTool) {
        setHint(`The ${toolName(item.id)} helps with another job. Use the ${toolName(repairTool)} to ${plan.action.toLowerCase()}.`);
        return;
      }
      if (zone !== 'fault') {
        setHint(`Drop the ${toolName(repairTool)} on the glowing ${experience.brokenPart}.`);
        return;
      }
      setHint('Nice work! The repair is done. Let’s test it.');
      setHintLevel(0);
      setTestArmed(false);
      setStage('test');
      return;
    }
    if (visibleStage === 'test') {
      if (item.id !== 'tester' || zone !== 'test') {
        setHint('Drag the Diagnostic Scanner to the test port to check your repair.');
        return;
      }
      setTestArmed(true);
      setHint('System test complete. Select the reading that confirms the repair.');
    }
  };

  const { dragging, didDragRef, selectedItem, startDrag, chooseItem, useSelectedItem } = useRepairDrag(handleDrop);

  const finishTask = (reading) => {
    if (reading !== plan.passingReading) {
      setHint('That reading means the job is not finished yet. Look again and choose the result that shows it works.');
      return;
    }
    if (completionRef.current) return;
    completionRef.current = true;
    setStage('success');
    onComplete();
  };
  const advanceHint = () => {
    setHintLevel((current) => Math.min(3, current + 1));
    setHint('');
  };
  const hintText = hintLevel === 0 ? ''
    : hintLevel === 1 ? experience.hint
      : hintLevel === 2
        ? visibleStage === 'repair'
          ? `Use the ${toolName(repairTool)} on the ${experience.brokenPart}.`
          : 'Use the Diagnostic Scanner on the glowing target.'
        : `Demonstration: drag the ${visibleStage === 'repair' ? toolName(repairTool) : 'Diagnostic Scanner'} from the Backpack onto the highlighted ${visibleStage === 'test' ? 'test port' : experience.brokenPart}.`;
  const instruction = visibleStage === 'diagnose'
    ? 'Drag the Diagnostic Scanner onto the fault to find the problem.'
    : visibleStage === 'repair'
      ? `Drag the ${toolName(repairTool)} onto the ${experience.brokenPart} to ${plan.action.toLowerCase()}.`
      : visibleStage === 'test'
        ? testArmed ? 'Select the reading that confirms the repair.' : 'Drag the Diagnostic Scanner to the test port.'
        : '';
  const rewardText = Object.entries(task.completionResourceEffects ?? {})
    .filter(([, amount]) => amount !== 0)
    .map(([resource, amount]) => `${amount > 0 ? '+' : ''}${amount} ${resource}`)
    .join(' · ');
  const zones = [
    { id: 'fault', label: experience.brokenPart, className: 'is-fault' },
    { id: 'test', label: 'System test', className: 'is-test' },
  ];

  return (
    <div className="daily-task-experience-backdrop" role="presentation">
      <section className="daily-task-experience repair-adventure first-five-repair-adventure" role="dialog" aria-modal="true" aria-labelledby="daily-task-experience-title">
        <button className="daily-task-experience-close" type="button" aria-label="Close task activity" onClick={onClose}>×</button>
        <header className="daily-task-experience-header repair-adventure-header">
          <span className="daily-task-experience-kicker">Lunar Engineering · Day {task.scheduledDay}</span>
          <h2 id="daily-task-experience-title">{task.title}</h2>
          {visibleStage !== 'success' && (
            <div className="repair-adventure-progress" aria-label={`Stage ${stageIndex + 1} of ${steps.length}`}>
              {steps.map((label, index) => (
                <span className={index < stageIndex ? 'is-done' : index === stageIndex ? 'is-active' : ''} key={label}>
                  <b>{index < stageIndex ? '✓' : index + 1}</b>{label}
                </span>
              ))}
            </div>
          )}
        </header>

        {visibleStage === 'success' ? (
          <div className="repair-adventure-success is-first-five">
            <span className="daily-task-success-check" aria-label="Task complete">✓</span>
            <h3>System test passed</h3>
            <p>{task.completionFeedback}</p>
            {rewardText && <p className="first-five-reward">Campaign reward · {rewardText}</p>}
            <article className="daily-task-fact-card"><strong>Engineering note</strong><p>{experience.fact}</p></article>
            <button className="daily-task-primary" type="button" onClick={onClose}>Return to mission control</button>
          </div>
        ) : (
          <>
            <div className={`repair-mission-hud is-first-five${hintLevel === 3 ? ' is-demonstrating' : ''}`}>
              <p>{hint || instruction}</p>
              <dl className="first-five-hud-details">
                <div><dt>Action</dt><dd>{instruction}</dd></div>
                <div><dt>Tool</dt><dd>{toolName(requiredTool)}</dd></div>
                <div><dt>Target</dt><dd>{task.targetComponentName} · {visibleStage === 'test' ? 'System test port' : experience.brokenPart}</dd></div>
                <div><dt>Gesture</dt><dd>{visibleStage === 'test' && testArmed ? 'Select the reading that confirms the repair.' : 'Drag the tool from the Backpack onto the highlighted work zone.'}</dd></div>
              </dl>
              <button className="daily-task-hint-button" type="button" onClick={advanceHint}>Hint {hintLevel}/3</button>
            </div>
            {/* Conditional 3D or SVG equipment viewer */}
            {use3D ? (
              <div className="repair-threed-container">
                <ThreeDEquipmentViewer
                  taskId={task.id}
                  onPartClick={(partId) => {
                    if (selectedItem) {
                      handleDrop(selectedItem, 'fault');
                    }
                  }}
                  highlightPart={visibleStage === 'repair' || visibleStage === 'test' ? experience.brokenPart.toLowerCase().replace(/\s+/g, '-') : null}
                  showLabels={visibleStage === 'diagnose'}
                  interactionMode={visibleStage === 'test' ? 'test' : 'repair'}
                />
              </div>
            ) : (
              <RepairWorkbench
                taskId={task.id}
                picture={experience.picture}
                brokenPart={experience.brokenPart}
                parts={experience.parts}
                stage={visibleStage}
                zones={zones}
                nextAction={visibleStage === 'repair' ? { zone: 'fault', label: plan.action } : null}
                demonstrating={hintLevel === 3}
                onZoneClick={useSelectedItem}
              />
            )}
            <button className="daily-task-secondary" type="button" onClick={onFindLocation}>Locate target in the environment</button>
            {visibleStage === 'test' && testArmed && (
              <div className="first-five-test-results">
                <p>{plan.testPrompt}</p>
                {[plan.passingReading, plan.failingReading].map((reading) => (
                  <button type="button" key={reading} onClick={() => finishTask(reading)}>{reading}</button>
                ))}
              </div>
            )}
            {hintText && (
              <p className={`daily-task-hint${hintLevel === 3 ? ' is-demo' : ''}`} role="status" aria-live="polite">
                {hintLevel === 3 && <span className="first-five-demo-beacon" aria-hidden="true" />}
                {hintText}
              </p>
            )}
          </>
        )}

        {visibleStage !== 'success' && (
          <>
            <div className="repair-footer">
              <button
                type="button"
                className={`repair-backpack-toggle${backpackOpen ? ' is-open' : ''}`}
                aria-expanded={backpackOpen}
                onClick={() => setBackpackOpen((open) => !open)}
              >
                Engineer Backpack <small>Reusable equipment</small>
              </button>
              <span className="repair-drag-tip">{selectedItem ? `Ready: ${itemName(selectedItem)}` : 'Drag a tool onto the glowing part'}</span>
            </div>
            {backpackOpen && (
              <aside className="repair-backpack-panel" aria-label="Engineer backpack inventory">
                <div className="repair-backpack-heading">
                  <div><strong>Engineer Backpack</strong></div>
                  <button type="button" aria-label="Close backpack" onClick={() => setBackpackOpen(false)}>×</button>
                </div>
                <strong className="repair-inventory-label">REUSABLE TOOLS · NOT CONSUMED</strong>
                <div className="repair-tool-inventory">
                  {availableTools.map((toolId) => {
                    const item = { kind: 'tool', id: toolId };
                    const highlighted = toolId === requiredTool;
                    return (
                      <button
                        type="button"
                        key={toolId}
                        className={`repair-inventory-item${highlighted ? ' is-required-tool' : ''}${selectedItem?.id === toolId ? ' is-selected' : ''}`}
                        onPointerDown={(event) => { setBackpackOpen(false); startDrag(item, event); }}
                        onClick={() => chooseItem(item)}
                        aria-label={`Pick up reusable ${toolName(toolId)}`}
                      >
                        <ToolPicture kind={BACKPACK_TOOL_DETAILS[toolId]?.picture ?? 'tester'} />
                        <strong>{toolName(toolId)}</strong>
                        <small>{highlighted ? 'Required for this step' : 'Reusable'}</small>
                      </button>
                    );
                  })}
                </div>
                <p className="repair-inventory-footnote">Tools are reusable and are never used up. Drop a tool on the glowing target to use it.</p>
              </aside>
            )}
            {dragging && didDragRef.current && (
              <div className="repair-drag-ghost" style={{ left: dragging.x, top: dragging.y }} aria-hidden="true">
                <ToolPicture kind={BACKPACK_TOOL_DETAILS[dragging.item.id]?.picture ?? 'tester'} />
                <strong>{itemName(dragging.item)}</strong>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function BasicDailyTaskExperience({ task, initialStage = 'idea', onClose, onFindLocation, onComplete, experience }) {
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

function RepairTaskExperience({
  task,
  initialStage = 'idea',
  onClose,
  onFindLocation,
  inventory,
  progress,
  onDiagnose,
  onSelectStrategy,
  onRepairStep,
  onVerify,
  experience,
  repair,
}) {
  const [stage, setStage] = useState(() => (
    task.status === 'completed'
      ? 'success'
      : initialStage === 'idea'
        ? 'idea'
        : progress?.repairStepCompleted
          ? 'verify'
          : progress?.selectedStrategyId
            ? 'repair'
            : progress?.diagnosedPart
              ? 'strategy'
              : 'diagnose'
  ));
  const [diagnosisTool, setDiagnosisTool] = useState(null);
  const [strategyStep, setStrategyStep] = useState(0);
  const [hint, setHint] = useState('');
  const selectedStrategy = repair.strategies.find(
    (strategy) => strategy.id === progress?.selectedStrategyId,
  );
  const availableTools = experience.tools.filter((choice) => inventory.tools.includes(choice.id));
  const visibleStage = task.status === 'completed' ? 'success' : stage;
  const activeStep = ['diagnose', 'inspect'].includes(visibleStage) ? 0
    : visibleStage === 'strategy' ? 1
      : visibleStage === 'repair' ? 2 : 3;

  const chooseDiagnosisTool = (choice) => {
    if (choice.id !== repair.diagnosisToolId) {
      setHint('This tool helps with a different job. Try the tester to find the problem.');
      return;
    }
    setDiagnosisTool(choice);
    setHint('');
  };

  const choosePart = (part) => {
    if (part !== experience.brokenPart) {
      setHint(`That part looks okay. ${experience.hint}`);
      return;
    }
    onDiagnose(task.id, diagnosisTool?.id, part);
    setHint('');
    setStage('strategy');
  };

  const chooseStrategy = (strategy) => {
    const hasParts = Object.entries(strategy.partsCost ?? {}).every(([part, amount]) => (
      (inventory.spareParts[part] ?? 0) >= amount
    ));
    if (!inventory.tools.includes(strategy.toolId) || !hasParts) {
      setHint('That plan needs a tool or spare part that is not in the bag. Try the no-parts plan.');
      return;
    }
    onSelectStrategy(task.id, strategy.id);
    setStrategyStep(0);
    setHint('');
    setStage('repair');
  };

  const doRepairStep = () => {
    if (!selectedStrategy) return;
    const nextStep = strategyStep + 1;
    setStrategyStep(nextStep);
    if (nextStep >= selectedStrategy.steps.length) {
      onRepairStep(task.id);
      setStage('verify');
    }
  };

  const verify = (optionId) => {
    const correct = optionId === selectedStrategy?.correctVerificationId;
    setHint(correct
      ? 'Great check! Saving your repair and updating the outpost…'
      : 'Not quite. Look at the system reading and try the check again.');
    onVerify(task.id, task.targetComponentId, optionId);
  };

  const steps = ['Find the fault', 'Choose a plan', 'Fix it', 'Check the repair'];
  return (
    <div className="daily-task-experience-backdrop" role="presentation">
      <section className="daily-task-experience" role="dialog" aria-modal="true" aria-labelledby="daily-task-experience-title">
        <button className="daily-task-experience-close" type="button" aria-label="Close task activity" onClick={onClose}>×</button>
        <header className="daily-task-experience-header">
          <span className="daily-task-experience-kicker">Crew helper activity · Day {task.scheduledDay}</span>
          <h2 id="daily-task-experience-title">{task.title}</h2>
          {visibleStage !== 'success' && (
            <div className="daily-task-step-list" aria-label="Repair steps">
              {steps.map((label, index) => (
                <span className={index <= activeStep ? 'is-current' : ''} key={label}>
                  <b>{index + 1}</b>{label}
                </span>
              ))}
            </div>
          )}
        </header>

        {visibleStage === 'idea' && (
          <div className="daily-task-stage">
            <ObjectPicture picture={experience.picture} />
            <span className="daily-task-stage-label">Let’s fix it!</span>
            <p>{experience.scenario}</p>
            <p className="daily-task-location-note">Go to <strong>{task.targetComponentName}</strong> to start the repair.</p>
            <button className="daily-task-primary" type="button" onClick={onFindLocation}>Find the repair</button>
          </div>
        )}

        {visibleStage === 'diagnose' && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">1 · Find the fault</span>
            <p>{repair.diagnosisPrompt}</p>
            <div className="daily-task-tool-grid">
              {availableTools.map((choice) => (
                <button key={choice.id} type="button" onClick={() => chooseDiagnosisTool(choice)}>
                  <ToolPicture kind={choice.picture} />
                  <strong>{choice.name}</strong>
                  <small>Reusable tool</small>
                </button>
              ))}
            </div>
            {diagnosisTool && (
              <>
                <ObjectPicture picture={experience.picture} brokenPart={experience.brokenPart} />
                <p>With the tester, tap the part that needs help.</p>
                <div className="daily-task-part-grid">
                  {experience.parts.map((part) => (
                    <button key={part} type="button" onClick={() => choosePart(part)}>
                      <span className="daily-task-part-dot" aria-hidden="true" />{part}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {visibleStage === 'strategy' && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">2 · Choose a repair plan</span>
            <p>Tools in your bag can be reused. Spare parts are limited.</p>
            <div className="daily-task-repair-inventory">
              <strong>Smart Tool Bag</strong>
              <span>{availableTools.map((toolChoice) => toolChoice.name).join(' · ')}</span>
              <strong>Spare parts</strong>
              <span>Water seals {inventory.spareParts.waterSeal} · Air filters {inventory.spareParts.oxygenFilter} · Panel patches {inventory.spareParts.solarPatch}</span>
            </div>
            <div className="daily-task-repair-strategies">
              {repair.strategies.map((strategy) => {
                const hasParts = Object.entries(strategy.partsCost ?? {}).every(([part, amount]) => (
                  (inventory.spareParts[part] ?? 0) >= amount
                ));
                return (
                  <button
                    type="button"
                    key={strategy.id}
                    disabled={!hasParts || !inventory.tools.includes(strategy.toolId)}
                    onClick={() => chooseStrategy(strategy)}
                  >
                    <strong>{strategy.name}</strong>
                    <span>{strategy.description}</span>
                    <small>Tool: {experience.tools.find((entry) => entry.id === strategy.toolId)?.name ?? strategy.toolId} · {Object.keys(strategy.partsCost ?? {}).length
                      ? `Uses ${Object.entries(strategy.partsCost).map(([part, count]) => `${count} ${REPAIR_PART_NAMES[part] ?? part}`).join(', ')}`
                      : 'No spare parts used'}</small>
                  </button>
                );
              })}
            </div>
            {hint && <p className="daily-task-hint" role="status">{hint}</p>}
          </div>
        )}

        {visibleStage === 'repair' && selectedStrategy && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">3 · Fix it together</span>
            <p>Use the <strong>{experience.tools.find((entry) => entry.id === selectedStrategy.toolId)?.name ?? selectedStrategy.toolId}</strong> for: {selectedStrategy.name}.</p>
            <div className="daily-task-repair-steps">
              {selectedStrategy.steps.map((step, index) => (
                <span className={index < strategyStep ? 'is-done' : ''} key={step}>
                  <b>{index < strategyStep ? '✓' : index + 1}</b>{step}
                </span>
              ))}
            </div>
            <button className="daily-task-primary" type="button" onClick={doRepairStep}>
              {selectedStrategy.steps[strategyStep] ?? 'Repair step'}
            </button>
            <button className="daily-task-secondary" type="button" onClick={() => setStage('strategy')}>
              Choose a different plan
            </button>
            <p className="daily-task-location-note">No supplies are used until the repair passes its final check.</p>
          </div>
        )}

        {visibleStage === 'verify' && selectedStrategy && (
          <div className="daily-task-stage">
            <span className="daily-task-stage-label">4 · Check the repair</span>
            <p>{selectedStrategy.verificationQuestion}</p>
            <div className="daily-task-part-grid">
              {selectedStrategy.verificationOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => verify(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button className="daily-task-secondary" type="button" onClick={() => setStage('strategy')}>
              Choose a different plan
            </button>
            {hint && <p className="daily-task-hint" role="status">{hint}</p>}
          </div>
        )}

        {visibleStage === 'success' && (
          <div className="daily-task-stage daily-task-success-stage">
            <span className="daily-task-success-check" aria-label="Repair verified">✓</span>
            <span className="daily-task-stage-label">Repair checked and working!</span>
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

function RepairAdventure({
  task,
  initialStage = 'idea',
  onClose,
  onFindLocation,
  inventory,
  progress,
  onDiagnose,
  onSelectStrategy,
  onRepairStep,
  onVerify,
  experience,
  repair,
  firstFiveDays = false,
}) {
  const [stage, setStage] = useState(() => (
    task.status === 'completed' ? 'success'
      : progress?.repairStepCompleted ? 'verify'
        : progress?.selectedStrategyId ? 'repair'
          : progress?.diagnosedPart ? 'strategy'
            : initialStage === 'idea' ? 'idea' : 'diagnose'
  ));
  const [strategyStep, setStrategyStep] = useState(0);
  const [hint, setHint] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [testArmed, setTestArmed] = useState(false);
  const [dragging, setDragging] = useState(null);
  const didDragRef = useRef(false);
  const dropHandlerRef = useRef(null);
  const audioContextRef = useRef(null);
  const selectedStrategy = repair.strategies.find(
    (strategy) => strategy.id === progress?.selectedStrategyId,
  );
  const visibleStage = task.status === 'completed' ? 'success' : stage;
  const sequence = selectedStrategy
    ? REPAIR_ACTIONS[task.id]?.[selectedStrategy.id] ?? []
    : [];
  const nextAction = sequence[strategyStep];
  const toolIds = inventory.tools;
  const availableParts = Object.entries(REPAIR_PART_DETAILS)
    .filter(([part]) => Number.isInteger(inventory.spareParts[part])
      && inventory.spareParts[part] > 0);
  const activeStep = firstFiveDays
    ? visibleStage === 'idea' ? 0
      : visibleStage === 'diagnose' ? 1
        : visibleStage === 'strategy' ? 2
          : visibleStage === 'repair' ? 3 : 4
    : ['idea', 'diagnose'].includes(visibleStage) ? 0
      : visibleStage === 'strategy' ? 1
        : visibleStage === 'repair' ? 2 : 3;
  const itemName = (item) => item?.kind === 'part'
    ? REPAIR_PART_DETAILS[item.id]?.name ?? item.id
    : BACKPACK_TOOL_DETAILS[item?.id]?.name ?? item?.id;
  const playChime = (notes) => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current
      ?? (audioContextRef.current = new AudioContextConstructor());
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((error) => {
        console.warn('Repair sound effects are unavailable.', error);
      });
    }
    notes.forEach((frequency, index) => {
      const startAt = audioContext.currentTime + index * 0.1;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.17);
    });
  };

  useEffect(() => () => {
    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch((error) => {
        console.warn('Repair sound effects could not be stopped cleanly.', error);
      });
    }
  }, []);

  const startStrategy = (strategy) => {
    const hasParts = Object.entries(strategy.partsCost ?? {}).every(([part, amount]) => (
      Number.isInteger(amount) && amount >= 0 && (inventory.spareParts[part] ?? 0) >= amount
    ));
    if (!inventory.tools.includes(strategy.toolId) || !hasParts) {
      setHint('That part is not in the bag. Try the repair path without spare parts.');
      return;
    }
    onSelectStrategy(task.id, strategy.id);
    setStrategyStep(0);
    setSelectedItem(null);
    setBackpackOpen(false);
    setHint('Plan ready! Follow the glowing work steps.');
    setHintLevel(0);
    setStage('repair');
  };

  const handleDrop = (item, zone) => {
    setSelectedItem(null);
    if (visibleStage === 'diagnose') {
      if (item.kind !== 'tool' || item.id !== repair.diagnosisToolId) {
        setHint('Try the Diagnostic Scanner. It can find the hidden fault!');
        return;
      }
      if (zone !== 'fault') {
        setHint(`Scanner ping! ${experience.hint}`);
        return;
      }
      onDiagnose(task.id, item.id, experience.brokenPart);
      playChime([620, 880]);
      setHint('Beep-beep! The fault is glowing. Great detective work!');
      setHintLevel(0);
      setStage('strategy');
      return;
    }

    if (visibleStage === 'strategy') {
      if (item.kind === 'part') {
        const strategy = repair.strategies.find(
          (entry) => (entry.partsCost?.[item.id] ?? 0) > 0,
        );
        if (!strategy) {
          setHint('That spare does not fit this repair. Try another part or a tool.');
          return;
        }
        startStrategy(strategy);
        return;
      }
      const noPartsStrategy = repair.strategies.find(
        (entry) => Object.keys(entry.partsCost ?? {}).length === 0 && entry.toolId === item.id,
      );
      if (noPartsStrategy) {
        startStrategy(noPartsStrategy);
        return;
      }
      setHint('Try a spare part for a full repair, or drag the no-parts tool onto the fault.');
      return;
    }

    if (visibleStage === 'repair' && nextAction) {
      if (item.kind !== nextAction.kind || item.id !== nextAction.id || zone !== nextAction.zone) {
        setHint('Almost! Watch the glowing part and the helper’s tip, then try again.');
        return;
      }
      const nextStep = strategyStep + 1;
      setStrategyStep(nextStep);
      playChime([520, 690]);
      setHint(nextStep < sequence.length ? 'Nice work! One more careful move.' : 'Repair steps complete! Let’s test it.');
      if (nextStep >= sequence.length) {
        onRepairStep(task.id);
        setStage('verify');
      }
      return;
    }

    if (visibleStage === 'verify') {
      if (item.kind !== 'tool' || item.id !== repair.diagnosisToolId || zone !== 'test') {
        setHint('Drag the Diagnostic Scanner to the test port to check your repair.');
        return;
      }
      if (!selectedStrategy) return;
      playChime([660, 830, 1040]);
      if (!firstFiveDays) {
        setHint('System test running…');
        onVerify(task.id, task.targetComponentId, selectedStrategy.correctVerificationId);
        return;
      }
      setTestArmed(true);
      setHint('System test complete. Select the reading that confirms the repair.');
    }
  };
  const verifyReading = (verificationId) => {
    if (!selectedStrategy) return;
    const passed = verificationId === selectedStrategy.correctVerificationId;
    setHint(passed
      ? 'Test passed. Updating the outpost systems…'
      : 'Test did not pass. Review the system reading and try another result.');
    onVerify(task.id, task.targetComponentId, verificationId);
  };

  dropHandlerRef.current = handleDrop;
  useEffect(() => {
    if (!dragging) return undefined;
    const handlePointerMove = (event) => {
      if (Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) > 8) {
        didDragRef.current = true;
      }
      setDragging((current) => current
        ? { ...current, x: event.clientX, y: event.clientY }
        : current);
    };
    const handlePointerUp = (event) => {
      if (didDragRef.current) {
        const target = document.elementFromPoint(event.clientX, event.clientY)
          ?.closest('[data-repair-zone]');
        if (target) dropHandlerRef.current?.(dragging.item, target.dataset.repairZone);
      }
      setDragging(null);
    };
    const handlePointerCancel = () => {
      didDragRef.current = false;
      setDragging(null);
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dragging]);

  const chooseItem = (item) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setSelectedItem(item);
    setBackpackOpen(false);
    setHint(`Picked up ${itemName(item)}. Tap a glowing part to use it.`);
  };
  const useSelectedItem = (zone) => {
    if (selectedItem) handleDrop(selectedItem, zone);
  };

  const instruction = visibleStage === 'diagnose'
    ? firstFiveDays
      ? 'Select the Diagnostic Scanner from the Backpack and apply it to the fault.'
      : 'Drag your scanner over the equipment.'
    : visibleStage === 'strategy'
      ? firstFiveDays
        ? 'Open the Backpack and apply a compatible tool or spare part to the fault.'
        : 'Choose a spare part, or try a repair with your tools.'
      : visibleStage === 'repair'
        ? nextAction?.label ?? 'Finish the repair.'
        : visibleStage === 'verify'
          ? firstFiveDays && testArmed ? 'Select the result that confirms the repair.' : 'Drag your scanner to the test port.'
          : 'Let’s get this outpost system working again!';
  const hintCopy = hintLevel === 0 ? ''
    : hintLevel === 1 ? experience.hint
      : hintLevel === 2
        ? visibleStage === 'idea'
          ? `Tool: visual inspection · Target: ${task.targetComponentName} — ${experience.brokenPart} · Gesture: locate the marked equipment and inspect the affected component.`
          : visibleStage === 'diagnose'
          ? `Tool: Diagnostic Scanner · Target: ${experience.brokenPart} · Gesture: drag the scanner onto the fault.`
          : visibleStage === 'strategy'
            ? `Open the Backpack and apply one compatible option to ${experience.brokenPart}: ${repair.strategies.map((strategy) => `${BACKPACK_TOOL_DETAILS[strategy.toolId]?.name ?? strategy.toolId}${strategy.partsCost ? ` or ${Object.keys(strategy.partsCost).map((part) => REPAIR_PART_DETAILS[part]?.name ?? part).join(', ')}` : ''}`).join('; ')}.`
            : visibleStage === 'repair'
              ? `Tool: ${nextAction ? itemName(nextAction) : 'the selected repair tool'} · Target: ${task.targetComponentName} — ${nextAction?.zone === 'fault' ? experience.brokenPart : nextAction?.zone === 'valve' ? 'water valve' : nextAction?.zone === 'cover' ? 'filter cover' : nextAction?.zone === 'connector' ? 'cable connector' : nextAction?.zone ?? experience.brokenPart} · Gesture: drag and drop onto the highlighted work zone.`
              : `Tool: Diagnostic Scanner · Target: ${task.targetComponentName} — pressure test port · Gesture: drag the scanner onto the test port.`
        : `Demonstration: ${visibleStage === 'repair' ? nextAction?.label ?? 'Follow the highlighted repair zone.' : `the highlighted ${experience.brokenPart} is the target; follow the cyan target marker.`}`;
  const advanceHint = () => {
    setHintLevel((current) => Math.min(3, current + 1));
    setHint('');
  };
  const toolRequiredForStrategy = (toolId) => (
    visibleStage === 'diagnose'
      ? toolId === repair.diagnosisToolId
      : visibleStage === 'strategy' && repair.strategies.some((strategy) => (
        strategy.toolId === toolId && Object.entries(strategy.partsCost ?? {}).every(([part, amount]) => (
          (inventory.spareParts[part] ?? 0) >= amount
        ))
      ))
  );
  const partRequiredForStrategy = (partId) => (
    visibleStage === 'strategy' && repair.strategies.some((strategy) => (
      (strategy.partsCost?.[partId] ?? 0) > 0
      && (inventory.spareParts[partId] ?? 0) >= (strategy.partsCost?.[partId] ?? 0)
    ))
  );

  return (
    <div className="daily-task-experience-backdrop repair-adventure-backdrop" role="presentation">
      <section className={`daily-task-experience repair-adventure${firstFiveDays ? ' first-five-repair-adventure' : ''}`} role="dialog" aria-modal="true" aria-labelledby="daily-task-experience-title">
        <button className="daily-task-experience-close" type="button" aria-label="Close repair mission" onClick={onClose}>×</button>
        <header className="daily-task-experience-header repair-adventure-header">
          <span className="daily-task-experience-kicker">Lunar Engineering · Day {task.scheduledDay}</span>
          <h2 id="daily-task-experience-title">{task.title}</h2>
          <div className="repair-adventure-progress" aria-label={`Mission step ${activeStep + 1} of ${firstFiveDays ? 5 : 4}`}>
            {(firstFiveDays
              ? ['Discover', 'Diagnose', 'Choose tools', 'Repair', 'Test & celebrate']
              : ['Find it', 'Choose a fix', 'Repair', 'Test']
            ).map((label, index) => (
              <span className={index < activeStep ? 'is-done' : index === activeStep ? 'is-active' : ''} key={label}>
                <b>{index < activeStep ? '✓' : index + 1}</b>{label}
              </span>
            ))}
          </div>
        </header>

        {visibleStage === 'idea' ? (
          <div className={`repair-adventure-intro${firstFiveDays ? ' is-first-five' : ''}${firstFiveDays && hintLevel === 3 ? ' is-demonstrating' : ''}`}>
            <ObjectPicture picture={experience.picture} />
            {!firstFiveDays && <span className="repair-helper-avatar" aria-hidden="true">🧑‍🚀</span>}
            <div><strong>{firstFiveDays ? 'Discover the fault' : 'Ready to help, astronaut?'}</strong><p>{experience.scenario}</p></div>
            {firstFiveDays && <p className="first-five-location">Target: <strong>{task.targetComponentName} · {experience.brokenPart}</strong></p>}
            {firstFiveDays && (
              <dl className="first-five-hud-details">
                <div><dt>Action</dt><dd>Inspect the equipment and identify the visible fault.</dd></div>
                <div><dt>Tool</dt><dd>Visual inspection</dd></div>
                <div><dt>Target</dt><dd>{task.targetComponentName} · {experience.brokenPart}</dd></div>
                <div><dt>Gesture</dt><dd>Locate the equipment in the environment, then inspect the affected component.</dd></div>
              </dl>
            )}
            <button className="daily-task-primary" type="button" onClick={onFindLocation}>{firstFiveDays ? 'Locate and inspect target' : 'Head to the equipment'}</button>
            {firstFiveDays && (
              <button className="daily-task-hint-button" type="button" onClick={advanceHint}>Hint {hintLevel}/3</button>
            )}
            {firstFiveDays && hintCopy && <p className={`daily-task-hint${hintLevel === 3 ? ' is-demo' : ''}`} role="status">{hintCopy}</p>}
          </div>
        ) : visibleStage === 'success' ? (
          <div className={`repair-adventure-success${firstFiveDays ? ' is-first-five' : ''}`}>
            {!firstFiveDays && <div className="repair-celebration-stars" aria-hidden="true">⭐ ✨ 🌟</div>}
            <span className="daily-task-success-check" aria-label="Repair complete">✓</span>
            <h3>{firstFiveDays ? 'System test passed' : 'Outpost system restored!'}</h3>
            {!firstFiveDays && <div className={`repair-success-signal is-${task.id}`} aria-hidden="true">
              {task.id === 'habitat-waterline-inspection' ? '💧' : task.id === 'oxygen-loop-filter-service' ? '🌬️' : '⚡'}
            </div>}
            <p>{task.completionFeedback}</p>
            {firstFiveDays && <p className="first-five-reward">Campaign reward applied to the outpost.</p>}
            {!firstFiveDays && <div className="repair-reward-stars">+1 Engineer Star</div>}
            <button className="daily-task-primary" type="button" onClick={onClose}>{firstFiveDays ? 'Return to mission control' : 'Back to the outpost'}</button>
          </div>
        ) : (
          <>
            <div className={`repair-mission-hud${firstFiveDays ? ' is-first-five' : ''}${hintLevel === 3 ? ' is-demonstrating' : ''}`}>
              {!firstFiveDays && <span className="repair-helper-avatar" aria-hidden="true">🧑‍🚀</span>}
              <p>{hint || instruction}</p>
              {firstFiveDays && (
                <dl className="first-five-hud-details">
                  <div><dt>Action</dt><dd>{instruction}</dd></div>
                  <div><dt>Tool</dt><dd>{visibleStage === 'diagnose' || visibleStage === 'verify'
                    ? 'Diagnostic Scanner'
                    : visibleStage === 'repair' && nextAction
                      ? itemName(nextAction)
                      : visibleStage === 'strategy'
                        ? repair.strategies.map((strategy) => `${BACKPACK_TOOL_DETAILS[strategy.toolId]?.name ?? strategy.toolId}${strategy.partsCost ? ` or ${Object.keys(strategy.partsCost).map((part) => REPAIR_PART_DETAILS[part]?.name ?? part).join(', ')}` : ''}`).join(' · ')
                        : 'Selected reusable tool'}</dd></div>
                  <div><dt>Target</dt><dd>{visibleStage === 'verify' ? `${task.targetComponentName} · Pressure test port` : `${task.targetComponentName} · ${visibleStage === 'repair' ? nextAction?.zone ?? experience.brokenPart : experience.brokenPart}`}</dd></div>
                  <div><dt>Gesture</dt><dd>{visibleStage === 'verify' && testArmed
                    ? 'Select the observed result from the test readings.'
                    : visibleStage === 'strategy' || visibleStage === 'diagnose' || visibleStage === 'verify'
                      ? 'Drag the selected item from the Backpack to the highlighted work zone.'
                      : instruction}</dd></div>
                </dl>
              )}
              {!firstFiveDays && <span className="repair-heartbeat" aria-label="System needs repair">●</span>}
            </div>
            {firstFiveDays && (
              <button className="daily-task-hint-button" type="button" onClick={advanceHint}>
                Hint {hintLevel}/3
              </button>
            )}
            <RepairWorkbench
              taskId={task.id}
              picture={experience.picture}
              brokenPart={experience.brokenPart}
              parts={experience.parts}
              stage={visibleStage}
              nextAction={nextAction}
              demonstrating={firstFiveDays && hintLevel === 3}
              onZoneClick={useSelectedItem}
            />
            {visibleStage === 'repair' && (
              <div className="repair-action-progress" aria-label={`Repair action ${strategyStep + 1} of ${sequence.length}`}>
                <span style={{ width: `${Math.min(100, (strategyStep / Math.max(1, sequence.length)) * 100)}%` }} />
                <small>{strategyStep} of {sequence.length} repair moves</small>
              </div>
            )}
            {visibleStage === 'verify' && testArmed && selectedStrategy && (
              <div className="first-five-test-results">
                <p>{selectedStrategy.verificationQuestion}</p>
                {selectedStrategy.verificationOptions.map((option) => (
                  <button type="button" key={option.id} onClick={() => verifyReading(option.id)}>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {visibleStage !== 'success' && (
          <>
            <div className="repair-footer">
              <button
                type="button"
                className={`repair-backpack-toggle${backpackOpen ? ' is-open' : ''}`}
                aria-expanded={backpackOpen}
                onClick={() => setBackpackOpen((open) => !open)}
              >
                {!firstFiveDays && <span aria-hidden="true">🎒</span>} Engineer Backpack
                <small>{availableParts.length} spare types</small>
              </button>
              <span className="repair-drag-tip">{selectedItem ? `Ready: ${itemName(selectedItem)}` : 'Drag a tool onto the glowing part'}</span>
            </div>
            {backpackOpen && (
              <aside className="repair-backpack-panel" aria-label="Engineer backpack inventory">
                <div className="repair-backpack-heading">
                  <div>{!firstFiveDays && <span aria-hidden="true">🎒</span>}<strong>Engineer Backpack</strong></div>
                  <button type="button" aria-label="Close backpack" onClick={() => setBackpackOpen(false)}>×</button>
                </div>
                <strong className="repair-inventory-label">REUSABLE TOOLS</strong>
                <div className="repair-tool-inventory">
                  {toolIds.map((toolId) => {
                    const tool = BACKPACK_TOOL_DETAILS[toolId] ?? { name: toolId, picture: 'tester' };
                    const item = { kind: 'tool', id: toolId };
                    return (
                      <button
                        type="button"
                        key={toolId}
                        className={`repair-inventory-item${selectedItem?.id === toolId && selectedItem.kind === 'tool' ? ' is-selected' : ''}${firstFiveDays && toolRequiredForStrategy(toolId) ? ' is-required-tool' : ''}`}
                        onPointerDown={(event) => {
                          didDragRef.current = false;
                          setBackpackOpen(false);
                          setDragging({
                            item,
                            x: event.clientX,
                            y: event.clientY,
                            startX: event.clientX,
                            startY: event.clientY,
                          });
                        }}
                        onClick={() => chooseItem(item)}
                        aria-label={`Pick up reusable ${tool.name}`}
                      >
                        <ToolPicture kind={tool.picture} />
                        <strong>{tool.name}</strong>
                        <small>Reusable</small>
                      </button>
                    );
                  })}
                </div>
                <strong className="repair-inventory-label">SPARE PARTS</strong>
                <div className="repair-parts-inventory">
                  {Object.entries(REPAIR_PART_DETAILS).map(([partId, part]) => {
                    const amount = inventory.spareParts[partId] ?? 0;
                    const item = { kind: 'part', id: partId };
                    return (
                      <button
                        type="button"
                        key={partId}
                        disabled={amount < 1}
                        className={`repair-part-inventory-item${selectedItem?.id === partId && selectedItem.kind === 'part' ? ' is-selected' : ''}${firstFiveDays && partRequiredForStrategy(partId) ? ' is-required-part' : ''}`}
                        onPointerDown={(event) => {
                          if (amount < 1) return;
                          didDragRef.current = false;
                          setBackpackOpen(false);
                          setDragging({
                            item,
                            x: event.clientX,
                            y: event.clientY,
                            startX: event.clientX,
                            startY: event.clientY,
                          });
                        }}
                        onClick={() => amount > 0 && chooseItem(item)}
                      >
                        <span className="repair-part-icon" aria-hidden="true">{firstFiveDays ? 'PART' : part.icon}</span>
                        <span><strong>{part.name}</strong><small>{amount > 0 ? 'Ready to use' : 'Out of stock'}</small></span>
                        <b>×{amount}</b>
                      </button>
                    );
                  })}
                </div>
                <p className="repair-inventory-footnote">Tools are reusable. A spare is used only when your repair passes its final test.</p>
              </aside>
            )}
            {dragging && didDragRef.current && (
              <div className="repair-drag-ghost" style={{ left: dragging.x, top: dragging.y }} aria-hidden="true">
                {dragging.item.kind === 'tool'
                  ? <ToolPicture kind={BACKPACK_TOOL_DETAILS[dragging.item.id]?.picture ?? 'tester'} />
                  : firstFiveDays ? 'PART' : REPAIR_PART_DETAILS[dragging.item.id]?.icon}
                <strong>{itemName(dragging.item)}</strong>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function RepairWorkbench({
  taskId,
  picture,
  brokenPart,
  parts,
  stage,
  nextAction,
  demonstrating = false,
  onZoneClick,
  zones: zoneOverride,
}) {
  const bespoke = taskId === 'habitat-waterline-inspection'
    || taskId === 'oxygen-loop-filter-service'
    || taskId === 'solar-array-inspection';
  const zones = zoneOverride ?? (taskId === 'habitat-waterline-inspection'
    ? [
      { id: 'valve', label: 'Water valve', className: 'is-valve' },
      { id: 'fault', label: brokenPart, className: 'is-fault' },
      { id: 'test', label: 'Pressure test', className: 'is-test' },
    ]
    : taskId === 'oxygen-loop-filter-service'
      ? [
        { id: 'cover', label: 'Filter cover', className: 'is-cover' },
        { id: 'fault', label: brokenPart, className: 'is-fault' },
        { id: 'test', label: 'Airflow test', className: 'is-test' },
      ]
      : [
        { id: 'connector', label: 'Cable connector', className: 'is-connector' },
        { id: 'fault', label: brokenPart, className: 'is-fault' },
        { id: 'test', label: 'Power test', className: 'is-test' },
      ]);
  const glowingZone = stage === 'diagnose' || stage === 'strategy'
    ? 'fault'
    : stage === 'repair' ? nextAction?.zone
      : stage === 'verify' || stage === 'test' ? 'test' : null;
  const sceneClass = taskId === 'habitat-waterline-inspection'
    ? 'is-water'
    : taskId === 'oxygen-loop-filter-service'
      ? 'is-oxygen'
      : taskId === 'solar-array-inspection' ? 'is-solar' : 'is-generic';

  return (
    <div className={`repair-workbench ${sceneClass}`}>
      <div className="repair-workbench-sky" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="repair-workbench-title">
        <span>MISSION BAY</span><strong>{picture}</strong>
      </div>
      <svg className="repair-equipment-art" viewBox="0 0 640 300" role="img" aria-label={`${picture} repair workbench`}>
        <defs>
          <linearGradient id="repair-metal-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b9dbe6" />
            <stop offset="1" stopColor="#527b91" />
          </linearGradient>
        </defs>
        <path className="repair-art-floor" d="M37 252h566l-44 34H81z" />
        <path className="repair-art-horizon" d="M54 227h532" />
        {taskId === 'habitat-waterline-inspection' && (
          <g className="repair-art-water">
            <path d="M86 100h130v56h207v-58h132v82h-135v36H216v-35H86z" />
            <path className="repair-art-joint" d="M198 105v47m-18-20h36m188-4v45m-19-23h39" />
            <path className="repair-art-valve" d="M352 118v-37m-24 0h48m-24-19v37m-18-18h37" />
            <circle className="repair-art-leak" cx="215" cy="170" r="7" />
            <path className="repair-art-water-drop" d="M215 179c-11 13-9 23 0 23s11-10 0-23" />
          </g>
        )}
        {taskId === 'oxygen-loop-filter-service' && (
          <g className="repair-art-oxygen">
            <rect x="216" y="58" width="207" height="166" rx="26" />
            <rect className="repair-art-filter-cover" x="243" y="82" width="153" height="116" rx="15" />
            <path className="repair-art-filter-lines" d="M267 111h105m-105 24h105m-105 24h105" />
            <circle className="repair-art-air-light" cx="373" cy="72" r="9" />
            <path className="repair-art-air-flow" d="M151 127h54m-13-15 15 15-15 15m291-15h49m-15-15 15 15-15 15" />
          </g>
        )}
        {taskId === 'solar-array-inspection' && (
          <g className="repair-art-solar">
            <path d="m140 88 350 0 48 119H101z" />
            <path className="repair-art-solar-grid" d="m194 88-38 119m116-119-18 119m99-119 3 119m97-119 26 119M120 146h394m-404 37h423" />
            <path className="repair-art-solar-cable" d="M325 208v23h96v-33" />
            <circle className="repair-art-spark" cx="421" cy="193" r="12" />
            <path className="repair-art-spark-lines" d="m420 185-5 8h6l-2 8 8-11h-6l3-5" />
          </g>
        )}
        {!bespoke && (
          <g className="repair-art-generic">
            <rect x="196" y="66" width="248" height="150" rx="22" />
            <rect className="repair-art-generic-panel" x="222" y="92" width="196" height="72" rx="12" />
            <path className="repair-art-generic-lines" d="M244 116h152m-152 24h152" />
            <circle className="repair-art-generic-light" cx="410" cy="80" r="8" />
            <path className="repair-art-generic-port" d="M300 190h40v18h-40z" />
          </g>
        )}
        <path className="repair-art-console" d="M254 231h132l-14 21h-104z" />
        <rect className="repair-art-console-screen" x="290" y="235" width="62" height="9" rx="4" />
        <circle className="repair-art-console-light" cx="365" cy="240" r="4" />
      </svg>
      {zones.map((zone) => (
        <button
          type="button"
          key={zone.id}
          data-repair-zone={zone.id}
          className={`repair-zone ${zone.className}${glowingZone === zone.id ? ' is-glowing' : ''}${demonstrating && glowingZone === zone.id ? ' is-demonstrating' : ''}`}
          onClick={() => onZoneClick(zone.id)}
          aria-label={`Repair target: ${zone.label}`}
        >
          <span className="repair-zone-pulse" aria-hidden="true" />
          <strong>{zone.label}</strong>
        </button>
      ))}
      <span className="repair-scene-caption" aria-live="polite">
        {stage === 'diagnose' ? `Scan near: ${parts.join(' · ')}` : stage === 'verify' || stage === 'test' ? 'Ready for system test' : 'Touch or drop a tool on the workbench'}
      </span>
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
  if (kind === 'flashlight') return <g {...common}><path d="m19 18 27 9-13 29-20-7 6-31Zm-4-7 33 11m-34 34 8 3m-12-37 16 6"/><path d="m44 18 12-5m-8 12 13-1"/></g>;
  if (kind === 'pliers') return <g {...common}><path d="m20 14 15 18m9-18L29 32m-8 0-8 18 8 5 13-19m8-4 8 18-8 5-13-19"/><circle cx="32" cy="33" r="5"/></g>;
  if (kind === 'repair-kit') return <g {...common}><rect x="12" y="23" width="40" height="31" rx="6"/><path d="M23 23v-8h18v8m-9 8v17m-8-9h16"/></g>;
  if (kind === 'screwdriver') return <g {...common}><path d="m23 44 24-24 8 8-24 24m-8-8 8 8M43 18l7-7 9 9-7 7"/></g>;
  if (kind === 'wrench' || kind === 'clamp') return <g {...common}><path d="M39 13a17 17 0 0 0-21 21L9 43a8 8 0 0 0 12 12l10-10a17 17 0 0 0 21-21L42 34l-10-2-2-10Z"/></g>;
  if (kind === 'brush' || kind === 'cloth') return <g {...common}><path d="M18 40 41 17l8 8-23 23m-12 2q12-2 11 7H9q-2-7 5-14Zm23-31 8-8 14 14-8 8"/></g>;
  if (kind === 'cable') return <g {...common}><path d="M17 12v11m30-11v11M17 23c0 26 30 9 30 29"/><rect x="11" y="8" width="12" height="8" rx="2"/><rect x="41" y="8" width="12" height="8" rx="2"/><circle cx="47" cy="52" r="5"/></g>;
  if (kind === 'patch') return <g {...common}><path d="m18 46 28-28 10 10-28 28H18Z"/><path d="M31 23 41 33M24 30l10 10m-9 16h27"/></g>;
  if (kind === 'tester') return <g {...common}><circle cx="28" cy="27" r="16"/><path d="m40 39 14 14M20 28l6 6 11-14"/></g>;
  if (kind === 'watering') return <g {...common}><path d="M18 30h29v24H18zM47 35h8l6 8H47M23 30V20h18l6 10M26 18V12"/><path d="M30 39h5m7 0h0"/></g>;
  if (kind === 'checklist') return <g {...common}><rect x="15" y="12" width="36" height="44" rx="5"/><path d="m22 25 4 4 7-8m-11 17 4 4 7-8m8-8h7m-7 16h7"/></g>;
  if (kind === 'scissors') return <g {...common}><circle cx="18" cy="45" r="8"/><circle cx="18" cy="19" r="8"/><path d="m24 24 30 29M24 40l30-29m-20 16 10 10"/></g>;
  return <g {...common}><path d="m16 48 31-31 6 6-31 31H16Zm23-23 8 8M12 13l39 39"/></g>;
}
