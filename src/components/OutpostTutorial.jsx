import { useCallback, useEffect, useRef, useState } from 'react';
import { MissionStoryAvatar } from './MissionStoryIntro';
import { createNoorSpeech } from '../utils/missionVoice';
import './OutpostTutorial.css';

const TOUR = [
  { target: 'mission-control', place: 'MISSION CONTROL', title: 'Your way back to mission selection', player: 'What does this button do?', guide: 'This takes you back to the mission selection screen. Your outpost will be here when you return.' },
  { target: 'mission-status', place: 'MISSION STATUS', title: 'Read the lunar mission clock', player: 'What are all these numbers?', guide: 'This strip shows the current lunar day, time left in the day, Moon time, days remaining, and the outpost readiness status.' },
  { target: 'live-map', place: 'LIVE MAP', title: 'See where everything is', player: 'How do I find a module or task?', guide: 'The live map shows the outpost layout and where you are. Activate it or press M for the full map with task markers and destinations.' },
  { target: 'science-notebook', place: 'SCIENCE NOTEBOOK', title: 'Keep every discovery', player: 'Where does our science go?', guide: 'New discoveries are saved in your Science Notebook. The number shows how many we have found so far. Open it to read our research.' },
  { target: 'photo-mode', place: 'PHOTO MODE', title: 'Revisit mission photos', player: 'Where do the Moon pictures go?', guide: 'Photo Mode opens your mission photo collection so you can revisit the pictures saved during the mission.' },
  { target: 'daily-jobs', place: 'TODAY’S JOBS', title: 'Choose a job for today', player: 'How do I look after the outpost?', guide: 'Open Today’s jobs to see the repairs and checks for today. Pick one, then follow its marker. Urgent problems will be flagged too.' },
  { target: 'resources', place: 'RESOURCES', title: 'Watch our supplies and safety', player: 'What should I keep an eye on?', guide: 'Open Resources to check power, battery, oxygen, water, food, and crew safety. If something gets low, prioritize a job that can help.' },
  { target: 'walk-around', place: 'WALK AROUND', title: 'Explore the base on foot', player: 'How do I walk up to a module?', guide: 'In the overview, arrow keys move your commander. Choose Walk around for first person, then use W, A, S, D and your mouse to explore.' },
  { target: 'drive-rover', place: 'DRIVE ROVER', title: 'Travel farther by rover', player: 'How do I explore the lunar surface?', guide: 'Choose Drive rover to switch to rover view. Use W or the up arrow to drive, S or down to reverse, and left or right to steer. Drag to look around and scroll to zoom.' },
  { target: null, place: 'READY FOR LAUNCH', title: 'Your first day starts now', player: 'I think I’m ready. What happens next?', guide: 'Welcome! Are you ready to get started? Let’s begin our adventure together!' },
];

export default function OutpostTutorial({ onComplete }) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [cardHeight, setCardHeight] = useState(390);
  const cardRef = useRef(null);
  const current = TOUR[step];

  const finish = useCallback(() => onComplete(), [onComplete]);

  useEffect(() => {
    const updateTarget = () => {
      const element = document.querySelector(`[data-tour-target="${current.target}"]`);
      if (!element) { setTarget(null); return; }
      const rect = element.getBoundingClientRect();
      const next = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      setTarget((previous) => previous && Object.keys(next).every((key) => Math.abs(previous[key] - next[key]) < 1) ? previous : next);
    };
    updateTarget();
    const timer = window.setInterval(updateTarget, 250);
    window.addEventListener('resize', updateTarget);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', updateTarget); };
  }, [current.target]);

  useEffect(() => {
    if (!current.target) return undefined;
    const element = document.querySelector(`[data-tour-target="${current.target}"]`);
    if (!element) return undefined;
    element.classList.add('outpost-tour-target-highlight');
    return () => element.classList.remove('outpost-tour-target-highlight');
  }, [current.target]);

  useEffect(() => {
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const height = cardRef.current?.getBoundingClientRect().height;
      if (height) setCardHeight(height);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' || !cardRef.current
      ? null
      : new ResizeObserver(measure);
    if (observer && cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  useEffect(() => {
    if (!voiceEnabled || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(createNoorSpeech(current.guide));
    return () => window.speechSynthesis.cancel();
  }, [current.guide, voiceEnabled]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); setStep((value) => Math.min(value + 1, TOUR.length - 1)); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setStep((value) => Math.max(value - 1, 0)); }
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [finish]);

  const groupWidth = Math.min(410, viewport.width - 28);
  const activeTarget = current.target ? target : null;
  const safeCardHeight = Math.min(cardHeight, viewport.height * 0.76);
  const groupTop = activeTarget
    ? (() => {
        const below = activeTarget.y + activeTarget.height + 18;
        const above = activeTarget.y - safeCardHeight - 18;
        const belowSpace = viewport.height - below - 12;
        const aboveSpace = activeTarget.y - 18;
        const preferred = belowSpace >= safeCardHeight || belowSpace >= aboveSpace ? below : above;
        return Math.max(12, Math.min(viewport.height - safeCardHeight - 12, preferred));
      })()
    : Math.max(12, (viewport.height - safeCardHeight) / 2);
  const groupLeft = activeTarget
    ? Math.max(14, Math.min(viewport.width - groupWidth - 14, activeTarget.x + activeTarget.width / 2 - groupWidth / 2))
    : Math.max(14, (viewport.width - groupWidth) / 2);
  const aperture = activeTarget ? 8 : 0;
  const skipPosition = { right: 20, bottom: 20 };
  const shieldPanels = activeTarget ? [
    { left: 0, top: 0, width: '100%', height: Math.max(0, activeTarget.y - aperture) },
    { left: 0, top: activeTarget.y + activeTarget.height + aperture, width: '100%', height: Math.max(0, viewport.height - activeTarget.y - activeTarget.height - aperture) },
    { left: 0, top: activeTarget.y - aperture, width: Math.max(0, activeTarget.x - aperture), height: activeTarget.height + aperture * 2 },
    { left: activeTarget.x + activeTarget.width + aperture, top: activeTarget.y - aperture, width: Math.max(0, viewport.width - activeTarget.x - activeTarget.width - aperture), height: activeTarget.height + aperture * 2 },
  ] : [{ left: 0, top: 0, width: '100%', height: '100%' }];
  const advance = () => step === TOUR.length - 1 ? finish() : setStep((value) => value + 1);

  return (
    <main className="outpost-tour" role="dialog" aria-modal="true" aria-labelledby="outpost-tour-title">
      {activeTarget && <div className="tour-shield" aria-hidden="true">{shieldPanels.map((style, index) => <span key={index} className="tour-shield-panel" style={style} />)}</div>}
      {activeTarget && <div className="tour-spotlight" style={{ left: activeTarget.x - 8, top: activeTarget.y - 8, width: activeTarget.width + 16, height: activeTarget.height + 16 }} />}
      <section className={`tour-guide-group${activeTarget ? ' has-active-target' : ''}`} style={{ left: groupLeft, top: groupTop, width: groupWidth }}>
        <article className="tour-card" key={`tour-${step}`} ref={cardRef}>
          <div className="tour-card-kicker"><span>{current.place} · OUTPOST GUIDE</span><small>{step + 1} / {TOUR.length}</small></div>
          <h1 id="outpost-tour-title">{current.title}</h1>
          <div className="tour-dialogue tour-player"><span>YOU</span><p>{current.player}</p></div>
          <div className="tour-guide-message">
            <MissionStoryAvatar />
            <div className="tour-dialogue tour-guide"><span>DR. NOOR · MISSION CONTROL</span><p>{current.guide}</p></div>
          </div>
          <div className="tour-actions">
            <button type="button" className="tour-back" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>← Back</button>
            <div className="tour-progress" aria-label={`Tour step ${step + 1} of ${TOUR.length}`}>{TOUR.map((item, index) => <i key={item.target} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} />)}</div>
            <button type="button" className="tour-next" onClick={advance}>{step === TOUR.length - 1 ? 'Start exploring' : 'Next'} <span>→</span></button>
          </div>
          <div className="tour-card-footer"><span>← → MOVE BETWEEN STOPS</span><button type="button" onClick={() => setVoiceEnabled((enabled) => !enabled)}>{voiceEnabled ? '🔊 Guide on' : '🔇 Guide off'}</button></div>
        </article>
      </section>
      <header className="tour-topline" style={skipPosition}><button type="button" onClick={finish}>Skip tutorial <b>×</b></button></header>
    </main>
  );
}
