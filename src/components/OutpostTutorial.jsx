import { useCallback, useEffect, useState } from 'react';
import { createLumiSpeech } from '../utils/missionVoice';
import './OutpostTutorial.css';

const TOUR = [
  { target: 'mission-control', place: 'MISSION CONTROL', title: 'Your way back to mission selection', player: 'What does this button do?', lumi: 'This takes you back to the mission selection screen. Your outpost will be here when you return.' },
  { target: 'mission-status', place: 'MISSION STATUS', title: 'Read the lunar mission clock', player: 'What are all these numbers?', lumi: 'This strip shows the current lunar day, time left in the day, Moon time, days remaining, and the outpost readiness status.' },
  { target: 'live-map', place: 'LIVE MAP', title: 'See where everything is', player: 'How do I find a module or task?', lumi: 'The live map shows the outpost layout and where you are. Activate it or press M for the full map with task markers and destinations.' },
  { target: 'science-notebook', place: 'SCIENCE NOTEBOOK', title: 'Keep every discovery', player: 'Where does our science go?', lumi: 'New discoveries are saved in your Science Notebook. The number shows how many we have found so far. Open it to read our research.' },
  { target: 'photo-mode', place: 'PHOTO MODE', title: 'Revisit mission photos', player: 'Where do the Moon pictures go?', lumi: 'Photo Mode opens your mission photo collection so you can revisit the pictures saved during the mission.' },
  { target: 'talk-lumi', place: 'TALK TO LUMI', title: 'Ask me whenever you need', player: 'Can I ask you for help later?', lumi: 'Tap Talk to Lumi whenever you want a hint, a Moon fact, or an idea for what we can explore next.' },
  { target: 'daily-jobs', place: 'TODAY’S JOBS', title: 'Choose a job for today', player: 'How do I look after the outpost?', lumi: 'Open Today’s jobs to see the repairs and checks for today. Pick one, then follow its marker. Urgent problems will be flagged too.' },
  { target: 'resources', place: 'RESOURCES', title: 'Watch our supplies and safety', player: 'What should I keep an eye on?', lumi: 'Open Resources to check power, battery, oxygen, water, food, and crew safety. If something gets low, prioritize a job that can help.' },
  { target: 'walk-around', place: 'WALK AROUND', title: 'Explore the base on foot', player: 'How do I walk up to a module?', lumi: 'In the overview, arrow keys move your commander. Choose Walk around for first person, then use W, A, S, D and your mouse to explore.' },
  { target: 'drive-rover', place: 'DRIVE ROVER', title: 'Travel farther by rover', player: 'How do I explore the lunar surface?', lumi: 'Choose Drive rover to switch to rover view. Use W or the up arrow to drive, S or down to reverse, and left or right to steer. Drag to look around and scroll to zoom.' },
  { target: null, place: 'READY FOR LAUNCH', title: 'Your first day starts now', player: 'I think I’m ready. What happens next?', lumi: 'Welcome to the outpost, Commander! I’m Lumi, your buddy. Let’s explore together, solve today’s tasks, and discover what the Moon has waiting for us!' },
];

function LumiTourRobot() {
  return (
    <svg viewBox="0 0 160 190" aria-hidden="true">
      <path className="tour-bot-antenna" d="M80 27V15"/><circle className="tour-bot-tip" cx="80" cy="12" r="5"/>
      <path className="tour-bot-arm tour-bot-wave" d="M42 112 22 95 12 81"/><path className="tour-bot-hand" d="M8 77q-7 3-4 10l8 11q5 5 10 0l7-8"/>
      <path className="tour-bot-arm" d="m118 112 17 19"/><path className="tour-bot-hand" d="m132 130 9 10q6 3 9-3t-2-10l-10-8"/>
      <path className="tour-bot-body" d="M48 105q32-14 64 0l8 39q-3 22-40 23-38-1-40-23z"/><path className="tour-bot-belly" d="M52 124q28 12 56 0l5 20q-4 13-34 13-29 0-33-13z"/>
      <path className="tour-bot-leg" d="m56 165-2 12q1 8 12 8t14-8v-10m25-2 2 12q-1 8-12 8t-14-8v-10"/>
      <path className="tour-bot-head" d="M43 40q3-13 16-16h42q14 3 16 17l5 43q1 28-40 31-43-2-42-31z"/><path className="tour-bot-ear" d="M40 55q-12-5-12 9t13 14m79-23q12-5 12 9t-13 14"/>
      <rect className="tour-bot-screen" x="49" y="44" width="62" height="43" rx="18"/><ellipse className="tour-bot-eye" cx="66" cy="63" rx="5" ry="9"/><ellipse className="tour-bot-eye" cx="94" cy="63" rx="5" ry="9"/><path className="tour-bot-smile" d="M72 76q8 7 16 0"/>
    </svg>
  );
}

export default function OutpostTutorial({ onComplete }) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
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
    if (!voiceEnabled || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(createLumiSpeech(current.lumi));
    return () => window.speechSynthesis.cancel();
  }, [current.lumi, voiceEnabled]);

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

  const groupWidth = Math.min(410, window.innerWidth - 28);
  const activeTarget = current.target ? target : null;
  const groupTop = activeTarget
    ? Math.max(90, Math.min(window.innerHeight - 365, activeTarget.y > window.innerHeight * 0.55 ? activeTarget.y - 350 : activeTarget.y + activeTarget.height + 16))
    : Math.max(100, (window.innerHeight - 330) / 2);
  const groupLeft = activeTarget
    ? Math.max(14, Math.min(window.innerWidth - groupWidth - 14, activeTarget.x + activeTarget.width / 2 - groupWidth / 2))
    : Math.max(14, (window.innerWidth - groupWidth) / 2);
  const aperture = activeTarget ? 8 : 0;
  const shieldPanels = activeTarget ? [
    { left: 0, top: 0, width: '100%', height: Math.max(0, activeTarget.y - aperture) },
    { left: 0, top: activeTarget.y + activeTarget.height + aperture, width: '100%', height: Math.max(0, window.innerHeight - activeTarget.y - activeTarget.height - aperture) },
    { left: 0, top: activeTarget.y - aperture, width: Math.max(0, activeTarget.x - aperture), height: activeTarget.height + aperture * 2 },
    { left: activeTarget.x + activeTarget.width + aperture, top: activeTarget.y - aperture, width: Math.max(0, window.innerWidth - activeTarget.x - activeTarget.width - aperture), height: activeTarget.height + aperture * 2 },
  ] : [{ left: 0, top: 0, width: '100%', height: '100%' }];
  const advance = () => step === TOUR.length - 1 ? finish() : setStep((value) => value + 1);

  return (
    <main className="outpost-tour" role="dialog" aria-modal="true" aria-labelledby="outpost-tour-title">
      {activeTarget && <div className="tour-shield" aria-hidden="true">{shieldPanels.map((style, index) => <span key={index} className="tour-shield-panel" style={style} />)}</div>}
      {activeTarget && <div className="tour-spotlight" style={{ left: activeTarget.x - 8, top: activeTarget.y - 8, width: activeTarget.width + 16, height: activeTarget.height + 16 }} />}
      <section className="tour-guide-group" style={{ left: groupLeft, top: groupTop, width: groupWidth }}>
        <div className="tour-robot" aria-hidden="true"><LumiTourRobot /></div>
        <article className="tour-card" key={`tour-${step}`}>
          <div className="tour-card-kicker"><span>{current.place} · LUMI</span><small>{step + 1} / {TOUR.length}</small></div>
          <h1 id="outpost-tour-title">{current.title}</h1>
          <div className="tour-dialogue tour-player"><span>YOU</span><p>{current.player}</p></div>
          <div className="tour-dialogue tour-lumi"><span>✦ LUMI</span><p>{current.lumi}</p></div>
          <div className="tour-actions">
            <button type="button" className="tour-back" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>← Back</button>
            <div className="tour-progress" aria-label={`Tour step ${step + 1} of ${TOUR.length}`}>{TOUR.map((item, index) => <i key={item.target} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} />)}</div>
            <button type="button" className="tour-next" onClick={advance}>{step === TOUR.length - 1 ? 'Start exploring' : 'Next'} <span>→</span></button>
          </div>
          <div className="tour-card-footer"><span>← → MOVE BETWEEN STOPS</span><button type="button" onClick={() => setVoiceEnabled((enabled) => !enabled)}>{voiceEnabled ? '🔊 Lumi on' : '🔇 Lumi off'}</button></div>
        </article>
      </section>
      <header className="tour-topline"><button type="button" onClick={finish}>Skip tutorial <b>×</b></button></header>
    </main>
  );
}
