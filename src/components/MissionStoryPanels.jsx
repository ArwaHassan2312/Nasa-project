import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MOON_FACTS, SCIENCE_DISCOVERIES } from '../data/missionStory';
import { MissionStoryAvatar } from './MissionStoryIntro';
import { createNoorSpeech } from '../utils/missionVoice';
import './MissionStoryPanels.css';

export function MissionStoryMoment({ moment, onClose, onContinue = onClose, voiceEnabled = true }) {
  const [voiceOn, setVoiceOn] = useState(false);
  const spokenText = moment?.location
    ? `${moment.location.what} ${moment.location.why} Did you know? ${moment.location.fact}`
    : `${moment?.text ?? ''} ${moment?.extra ?? ''}`;

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    if (!voiceEnabled || !voiceOn || !spokenText || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    window.speechSynthesis?.cancel();
    const speech = createNoorSpeech(spokenText);
    window.speechSynthesis?.speak(speech);
    return () => window.speechSynthesis?.cancel();
  }, [moment?.character, spokenText, voiceOn, voiceEnabled]);

  if (!moment) return null;
  return (
    <div className="mission-story-panel-backdrop" role="dialog" aria-modal="true" aria-labelledby="story-moment-title">
      <section className={`mission-story-moment${moment.location ? ' is-location-intro' : ''}`}>
        <button type="button" className="story-panel-close" aria-label="Close story card" onClick={onClose}>×</button>
        {!moment.location && <div className="story-moment-visual"><MissionStoryAvatar /></div>}
        <div className="story-moment-content">
          <span className="story-panel-kicker">{moment.location ? 'LOCATION GUIDE · YOUR MOON BASE' : moment.eyebrow ?? 'DR. NOOR · MISSION CONTROL'}</span>
          <h2 id="story-moment-title">{moment.title}</h2>
          {moment.location ? (
            <>
              <p className="story-location-intro">Welcome to {moment.location.name}! This is one of the places that helps your Moon base work.</p>
              <div className="story-location-facts">
              <article><span>WHAT HAPPENS HERE</span><p>{moment.location.what}</p></article>
              <article><span>WHY IT MATTERS</span><p>{moment.location.why}</p></article>
              <article className="story-fun-fact"><span>FUN FACT</span><p>{moment.location.fact}</p></article>
              </div>
            </>
          ) : <p className="story-moment-message">{moment.text}</p>}
          {moment.extra && <p className="story-moment-extra">{moment.extra}</p>}
          <div className="story-moment-actions">
            {!moment.noReplay && <button type="button" className="story-panel-voice" onClick={() => setVoiceOn((value) => !value)}>{voiceOn ? 'Voice on' : 'Hear message'}</button>}
            <button type="button" className="story-panel-continue" onClick={onContinue}>Continue <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function MissionArchive({ open, onClose, activeTab, setActiveTab, simulation, photos, onCapturePhoto, onSavePhoto, pendingPhoto, setPendingPhoto }) {
  if (!open) return null;
  const tabs = [
    ['notebook', 'Science Notebook'],
    ['log', 'Mission Log'],
    ['facts', 'Moon Facts'],
    ['photos', 'Photo Album'],
  ];
  const discoveries = SCIENCE_DISCOVERIES.filter((entry) => simulation.scienceNotebookIds.includes(entry.id));
  const log = [
    ...simulation.missionLogEntries,
    ...simulation.decisionHistory.map((entry, index) => ({ id: `choice-${index}`, day: entry.day, category: 'Decision', text: `Day ${entry.day}: ${entry.decisionLabel} — ${entry.actualOutcome}` })),
    ...simulation.challengeHistory.map((entry) => ({ id: `job-${entry.id}`, day: entry.day, category: 'Task', text: `Day ${entry.day}: Finished ${entry.title}.` })),
    ...simulation.eventOutcomeHistory.map((entry) => ({ id: `event-${entry.occurrenceId}`, day: entry.day, category: 'Event', text: `Day ${entry.day}: ${entry.eventName} — ${entry.status}. ${entry.feedback}` })),
  ].sort((first, second) => second.day - first.day || second.id.localeCompare(first.id));

  return createPortal((
    <div className="mission-story-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mission-archive" role="dialog" aria-modal="true" aria-labelledby="mission-archive-title">
        <button type="button" className="story-panel-close" aria-label="Close mission archive" onClick={onClose}>×</button>
        <header className="mission-archive-header"><span>COMMANDER {simulation.commanderName.toUpperCase()} · DAY {simulation.day}</span><h2 id="mission-archive-title">Mission Archive</h2><p>{simulation.baseName} · Science {Math.round(simulation.resources.science)}%</p><p className="mission-archive-help">Your notebook saves discoveries and rover samples. Photo Mode saves a picture of your current Moon view.</p></header>
        <nav className="mission-archive-tabs" aria-label="Mission archive sections">
          {tabs.map(([id, label]) => <button key={id} type="button" className={activeTab === id ? 'is-active' : ''} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}>{label}</button>)}
        </nav>
        <div className="mission-archive-content">
          {activeTab === 'notebook' && (
            discoveries.length || simulation.collectedIceSamples.length ? <>
              {discoveries.length > 0 && <div className="science-discovery-grid">{discoveries.map((entry, index) => <article className="science-discovery-card" key={entry.id}>
                <div className={`science-discovery-art art-${entry.id}`} aria-hidden="true"><DiscoveryIllustration index={index} /></div>
                <div><span>DISCOVERY {String(index + 1).padStart(2, '0')} · DAY {entry.day}</span><h3>{entry.title}</h3><p>{entry.summary}</p><small><b>Did you know?</b> {entry.didYouKnow}</small></div>
              </article>)}</div>}
              {simulation.collectedIceSamples.length > 0 && <section className="science-sample-section"><h3>Rover samples</h3><div className="science-discovery-grid">{simulation.collectedIceSamples.map((sample) => <article className="science-discovery-card science-sample-card" key={sample.id}>
                <div className="science-discovery-art art-water-ice" aria-hidden="true"><DiscoveryIllustration index={3} /></div>
                <div><span>SAMPLE · DAY {sample.day} · SCIENCE +3</span><h3>{sample.label}</h3><p>Collected by rover and saved for study. This sample helps compare the crater ground and look for signs of water ice.</p><small><b>Did you know?</b> Samples from different places help scientists compare what the lunar ground is made of.</small></div>
              </article>)}</div></section>}
            </> : <div className="story-empty-state"><span>◈</span><h3>Your notebook is ready</h3><p>Careful observations and science points will unlock discoveries as the mission goes on.</p></div>
          )}
          {activeTab === 'log' && (
            log.length ? <ol className="mission-log-list">{log.map((entry) => <li key={entry.id}><span>DAY {entry.day} · {entry.category.toUpperCase()}</span><p>{entry.text}</p></li>)}</ol> : <div className="story-empty-state"><span>⌁</span><h3>Your first day starts here</h3><p>Important visits, choices, jobs, and discoveries will be saved in this log.</p></div>
          )}
          {activeTab === 'facts' && <div className="moon-fact-grid">{MOON_FACTS.map((fact, index) => <article key={fact}><span>MOON FACT {String(index + 1).padStart(2, '0')}</span><p>{fact}</p></article>)}</div>}
          {activeTab === 'photos' && <div className="mission-photo-content">
            <div className="mission-photo-actions"><p>Take a picture of the Moon view you are looking at. Add a caption and save it in your Photo Album.</p><button type="button" className="story-panel-continue" onClick={onCapturePhoto}>Capture photo</button></div>
            {pendingPhoto && <form className="mission-photo-pending" onSubmit={(event) => { event.preventDefault(); onSavePhoto(pendingPhoto); }}><img src={pendingPhoto.data} alt="New Moonbase photo preview" /><label>Photo caption<input autoFocus value={pendingPhoto.caption} maxLength={80} onChange={(event) => setPendingPhoto({ ...pendingPhoto, caption: event.target.value })} placeholder="What do you see?" /></label><button className="story-panel-continue" type="submit">Save to album</button></form>}
            {photos.length > 0 ? <div className="mission-photo-grid">{photos.map((photo) => <figure key={photo.id}><img src={photo.data} alt={photo.caption || 'Saved outpost photo'} /><figcaption><span>DAY {photo.day}</span>{photo.caption}</figcaption></figure>)}</div> : <div className="story-empty-state"><span>◉</span><h3>Your photo album is empty</h3><p>Capture a moment on the Moon and add a caption.</p></div>}
          </div>}
        </div>
      </section>
    </div>
  ), document.body);
}

export function IceSampleActivity({ open, samples, onCollect, onClose }) {
  const options = [
    { id: 'shadow-ice', title: 'Shadowed crater', description: 'Check the cold ground for signs of ice.', icon: '❄' },
    { id: 'ridge-dust', title: 'Crater ridge', description: 'Collect a dust sample to compare with the shadow.', icon: '◌' },
    { id: 'rocky-slope', title: 'Rocky slope', description: 'Look for clues in the nearby rock.', icon: '⬡' },
  ];
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => { if (!open) { setSelected(null); setResult(null); } }, [open]);
  if (!open) return null;
  const available = options.filter((item) => !samples.some((sample) => sample.id === item.id));
  const collect = (item) => {
    onCollect(item.id, item.title);
    setSelected(item);
    setResult(true);
  };
  return (
    <div className="mission-story-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ice-sample-panel" role="dialog" aria-modal="true" aria-labelledby="ice-sample-title">
        <button type="button" className="story-panel-close" aria-label="Close sample collection" onClick={onClose}>×</button>
        <span className="story-panel-kicker">ROVER SCIENCE RUN · DAY 11–15</span><h2 id="ice-sample-title">Collect a crater sample</h2>
        <p className="ice-sample-intro">Your rover is at the crater. Pick a marked spot, collect one sample, and record what you find. Each sample adds to the science record.</p>
        {result ? <div className="ice-sample-result"><div className="ice-sample-stone" aria-hidden="true">{selected.icon}</div><h3>Sample secured!</h3><p>{selected.title} is safely packed for study. <strong>Science +3</strong></p><button type="button" className="story-panel-continue" onClick={onClose}>Return to the rover</button></div>
          : available.length ? <div className="ice-sample-options">{available.map((item) => <button type="button" key={item.id} onClick={() => collect(item)}><span aria-hidden="true">{item.icon}</span><strong>{item.title}</strong><small>{item.description}</small></button>)}</div>
            : <div className="story-empty-state"><span>✓</span><h3>All samples collected</h3><p>You have saved every marked sample from this rover run.</p><button type="button" className="story-panel-continue" onClick={onClose}>Close</button></div>}
        <div className="ice-sample-counter">{samples.length} / {options.length} samples in the notebook</div>
      </section>
    </div>
  );
}

export function RadioCall({ open, onClose, commanderName, baseName, day }) {
  const [reply, setReply] = useState(false);
  useEffect(() => {
    if (!open) { setReply(false); return undefined; }
    const timeout = window.setTimeout(() => setReply(true), 1300);
    return () => window.clearTimeout(timeout);
  }, [open]);
  if (!open) return null;
  return (
    <div className="mission-story-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mission-radio-panel" role="dialog" aria-modal="true" aria-labelledby="radio-call-title">
        <button type="button" className="story-panel-close" aria-label="Close radio call" onClick={onClose}>×</button>
        <span className="story-panel-kicker">COMMUNICATIONS MAST · SIGNAL DELAY 1.3 SECONDS</span><h2 id="radio-call-title">Call to Mission Control</h2>
        <article className="radio-message radio-outgoing"><span>TO: MISSION CONTROL · FROM: {commanderName.toUpperCase()}</span><p>Day {day} check-in from {baseName}. The outpost is still sending science and system readings.</p></article>
        <div className={`radio-signal-delay${reply ? ' is-arrived' : ''}`}><i /><span>{reply ? 'Signal received on Earth' : 'Radio signal travelling to Earth…'}</span></div>
        {reply && <article className="radio-message radio-incoming"><span>DR. NOOR · MISSION CONTROL</span><p>Message received, Commander! The signal took about 1.3 seconds to reach us. Your observations are helping the whole team understand the Moon.</p></article>}
        <button type="button" className="story-panel-continue" onClick={onClose}>{reply ? 'End call' : 'Close radio'}</button>
      </section>
    </div>
  );
}

function DiscoveryIllustration({ index }) {
  const drawings = [
    <><circle cx="50" cy="50" r="33" fill="#1b3e52" /><path d="M50 18v64M31 34l38 32M69 34 31 66" stroke="#83e8e4" strokeWidth="5" strokeLinecap="round" /><circle cx="50" cy="50" r="12" fill="#182b3a" /></>,
    <><circle cx="35" cy="40" r="10" fill="#87d8e5" /><circle cx="67" cy="63" r="17" fill="#d0c6a4" /><path d="m27 69 16-12m15-26 18 16" stroke="#f4cd76" strokeWidth="4" strokeLinecap="round" /></>,
    <><path d="M18 70c17-26 24-35 32-35s17 9 32 35" fill="none" stroke="#b0edda" strokeWidth="6" strokeLinecap="round" /><circle cx="50" cy="38" r="4" fill="#d9fbff" /></>,
    <><path d="M16 67 30 34l16 33 11-27 27 27Z" fill="#9cbcc0" /><circle cx="31" cy="49" r="4" fill="#667b83" /><circle cx="66" cy="57" r="6" fill="#71858b" /></>,
  ];
  return <svg viewBox="0 0 100 100" aria-hidden="true">{drawings[index % drawings.length]}</svg>;
}
