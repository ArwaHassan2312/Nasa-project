import { useEffect } from 'react';
import { createNoorSpeech } from '../utils/missionVoice';
import './MissionStoryReward.css';

const STORY = { title: 'Apollo 11: first footsteps', year: '1969 · APOLLO 11', text: 'Neil Armstrong and Buzz Aldrin became the first people to walk on the Moon. They explored the surface while Michael Collins piloted the command module in lunar orbit.', fact: 'The three astronauts worked as one team, with Collins staying above the Moon while his crewmates explored below.', source: 'https://www.nasa.gov/history/apollo-11-mission-overview/', art: 'footprints' };

function StoryIllustration({ type }) {
  return <svg className={`reward-art art-${type}`} viewBox="0 0 440 270" role="img" aria-label="Animated illustration of a real Apollo mission">
    <defs><linearGradient id="moonGround" x2="0" y2="1"><stop stopColor="#73849a"/><stop offset="1" stopColor="#29384a"/></linearGradient><radialGradient id="moonGlow"><stop stopColor="#fff7ca"/><stop offset="1" stopColor="#f4c96c"/></radialGradient></defs>
    <circle className="art-moon" cx="350" cy="48" r="29" fill="url(#moonGlow)"/><circle cx="48" cy="44" r="2" fill="#fff"/><circle cx="120" cy="63" r="1.5" fill="#fff"/><circle cx="274" cy="24" r="2" fill="#fff"/>
    <path d="M0 208 Q85 175 170 207 T330 200 T440 196 V270 H0Z" fill="url(#moonGround)"/><ellipse cx="83" cy="232" rx="29" ry="7" fill="#17283a" opacity=".6"/><ellipse cx="355" cy="220" rx="39" ry="9" fill="#17283a" opacity=".6"/>
    {type === 'footprints' && <g className="art-walker"><path d="M200 193 207 124 218 102 233 110 238 152 250 178 245 194Z" fill="#f0f4ee"/><circle cx="222" cy="91" r="14" fill="#d9e1e2"/><path d="M210 91h24M222 78v27" stroke="#62cddd" strokeWidth="3"/><path d="m212 137-28 27m48-26 20 25" stroke="#eff7f5" strokeWidth="8" strokeLinecap="round"/><path d="M185 204h9m19 8h9m-39 11h9" stroke="#d6e4e5" strokeWidth="4" strokeLinecap="round"/></g>}
    {type === 'rover' && <g className="art-rover"><path d="M160 173h115l-17 27h-83Z" fill="#e7b44d"/><path d="m180 174 18-39h45l20 39" fill="#d8e0dc"/><path d="M205 135v-28m0 0 31-8" stroke="#78d8e1" strokeWidth="5"/><circle cx="179" cy="207" r="14" fill="#111e2c" stroke="#dbe4e1" strokeWidth="5"/><circle cx="259" cy="207" r="14" fill="#111e2c" stroke="#dbe4e1" strokeWidth="5"/><path d="M152 222h130" stroke="#dfe8e7" strokeWidth="2" strokeDasharray="5 8"/></g>}
    {type === 'earthrise' && <g className="art-earth"><circle cx="220" cy="133" r="61" fill="#3187c3"/><path d="M172 112q24-26 46-11t36-10q25 18 23 42t-32 22q-18 19-44 4t-32-47" fill="#8fd08e"/><path d="M165 102q50-51 105-12" fill="none" stroke="#e4f8ff" strokeWidth="5"/><path className="art-spark" d="m308 95 6 13 14 2-11 9 3 14-12-7-12 7 3-14-11-9 14-2Z" fill="#fff0a8"/></g>}
  </svg>;
}

export default function MissionStoryReward({ day, onClose, voiceEnabled = true }) {
  const story = STORY;
  useEffect(() => {
    if (!voiceEnabled) { window.speechSynthesis?.cancel(); return undefined; }
    const line = `You did it, Commander! You finished every job today. I’m so proud of you. Let’s celebrate with a real space story! ${story.title}. ${story.text}`;
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(createNoorSpeech(line));
    return () => window.speechSynthesis.cancel();
  }, [story, voiceEnabled]);
  return <div className="mission-reward-backdrop" role="dialog" aria-modal="true" aria-labelledby="mission-reward-title">
    <section className="mission-reward-card"><button className="mission-reward-close" type="button" aria-label="Close story reward" onClick={onClose}>×</button>
      <div className="mission-reward-heading"><span>DAY {day} COMPLETE · MISSION STORY TIME</span><h2 id="mission-reward-title">A real story from the Moon</h2><p>Every job is done. Here’s one true Apollo story to celebrate.</p></div>
      <StoryIllustration type={story.art}/>
      <article className="mission-reward-story"><span>{story.year}</span><h3>{story.title}</h3><p>{story.text}</p><aside>Teamwork fact: {story.fact}</aside><a href={story.source} target="_blank" rel="noreferrer">Read the NASA story ↗</a></article>
      <footer><button className="mission-reward-next" type="button" onClick={onClose}>Back to the outpost ✓</button></footer>
    </section>
  </div>;
}
