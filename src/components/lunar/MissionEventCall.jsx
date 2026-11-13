import { useEffect } from 'react';
import { MissionStoryAvatar } from '../MissionStoryIntro';
import { createNoorSpeech } from '../../utils/missionVoice';
import { getPlayerAddress } from '../../utils/playerAddress';
import './MissionEventCall.css';

export default function MissionEventCall({ call, narration, location, commanderName, onAnswer, onContinue }) {
  const playerAddress = getPlayerAddress(commanderName);
  const event = call?.event;
  const eventKey = event?.occurrenceId ?? `${event?.id ?? 'event'}-${event?.day ?? 0}`;
  const cause = event?.triggerSource === 'task'
    ? `This started after ${event.missedTaskTitle || 'an important job'} was left unfinished.`
    : 'The outpost sensors detected a new problem. I checked the system readings to understand what changed.';
  const message = event
    ? `${narration?.noor ?? event.situation} ${cause} Here is why it matters: ${event.lesson} If we wait: ${event.failureFeedback}`
    : '';

  useEffect(() => {
    if (!event || call.stage !== 'connected' || !('speechSynthesis' in window)) return undefined;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(createNoorSpeech(message));
    return () => window.speechSynthesis.cancel();
  }, [eventKey, call?.stage, message, event]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!call || !event) return null;

  return (
    <div className="mission-event-call-backdrop" role="dialog" aria-modal="true" aria-labelledby="mission-event-call-title">
      {call.stage === 'incoming' ? (
        <section className="mission-event-incoming-card">
          <div className="mission-event-call-copy">
            <span className="mission-event-call-kicker">INCOMING OUTPOST CALL</span>
            <h2 id="mission-event-call-title">Dr. Noor is calling</h2>
            <p>She wants to explain <strong>{event.name}</strong> and how we can help.</p>
            <button type="button" className="mission-event-call-button" onClick={onAnswer}>Okay, answer the call</button>
          </div>
        </section>
      ) : (
        <section className="mission-event-call-screen">
          <header><span>◉ LIVE TRANSMISSION</span><span>DR. NOOR · MISSION CONTROL</span><span>DAY {event.day ?? '—'}</span></header>
          <div className="mission-event-tv-body">
            <div className="mission-event-tv-portrait"><MissionStoryAvatar /><i aria-hidden="true" /></div>
            <div className="mission-event-tv-message">
              <span className="mission-event-call-kicker">LET’S LOOK AT WHAT HAPPENED</span>
              <h2 id="mission-event-call-title">{event.name}</h2>
              <p>{narration?.noor ?? event.situation}</p>
              <article><strong>Why it matters</strong><p>{event.lesson}</p></article>
              <article className="mission-event-consequence"><strong>If we wait</strong><p>{event.failureFeedback}</p></article>
              {event.triggerSource === 'task' && <small>Cause: the {event.missedTaskTitle || 'related critical job'} was not completed in time.</small>}
              <small>Location: {location?.name ?? 'Outpost'}</small>
            </div>
          </div>
          <footer><span>NOOR: “You’ve got this, {playerAddress}. Let’s take care of it together.”</span><button type="button" className="mission-event-call-button" onClick={onContinue}>Thanks, Dr. Noor · Let’s go</button></footer>
        </section>
      )}
    </div>
  );
}
