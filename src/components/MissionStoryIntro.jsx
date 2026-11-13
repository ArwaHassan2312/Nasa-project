import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { createNoorSpeech } from '../utils/missionVoice';
import './MissionStoryIntro.css';

const OPENING = [
  {
    character: 'noor',
    eyebrow: 'MISSION CONTROL · EARTH',
    title: 'A question for the Moon',
    text: (name) => `Welcome, Commander ${name || 'Explorer'}! You made it to the Moon. Here is our big question: can people live here for a long time?`,
  },
  {
    character: 'noor',
    eyebrow: 'YOUR MISSION · 15 DAYS',
    title: 'Your 15-day mission',
    text: (_name, base) => `You have 15 days to care for ${base || 'your lunar base'}, explore the Moon, and collect science. On Day 15, you’ll send your final report to Earth.`,
  },
  {
    character: 'noor',
    eyebrow: 'MISSION CONTROL · DR. NOOR',
    title: 'Your link to Earth',
    text: () => 'I’m Dr. Noor. I’ll help you make sense of mission events, receive your science data, and read your daily reports. If the outpost needs help, I’ll be here with a plan.',
  },
  {
    character: 'noor',
    eyebrow: 'MISSION CONTROL · DR. NOOR',
    title: 'Deploy to the outpost',
    text: () => 'Your base is ready on the lunar surface. The camera will take a quick look around before your mission begins.',
  },
];

export default function MissionStoryIntro({ onBegin }) {
  const [commanderName, setCommanderName] = useState('');
  const [baseName, setBaseName] = useState('');
  const [step, setStep] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const current = OPENING[step];
  const line = current.text(commanderName.trim(), baseName.trim());

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    if (!voiceEnabled || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return undefined;
    window.speechSynthesis?.cancel();
    const speech = createNoorSpeech(line);
    window.speechSynthesis?.speak(speech);
    return () => window.speechSynthesis?.cancel();
  }, [current.character, line, step, voiceEnabled]);

  const goForward = () => {
    if (step < OPENING.length - 1) setStep((value) => value + 1);
    else onBegin({ commanderName: commanderName.trim() || 'Commander', baseName: baseName.trim() || 'Moonbase Alpha' });
  };

  return (
    <div className="mission-story-backdrop" role="dialog" aria-modal="true" aria-labelledby="mission-story-title">
      <section className="mission-story-intro">
        <div className="mission-story-sky" aria-hidden="true" />
        <header className="mission-story-topline"><span>MOONBASE ALPHA</span><span>THE QUESTION OF HOME</span></header>
        <div className="mission-story-scene">
          <div className="mission-story-moon" aria-hidden="true" />
          <CharacterModel />
          <div className="mission-story-orbit-mark" aria-hidden="true">⌖</div>
        </div>
        <div className="mission-story-copy">
          <span className={`mission-story-speaker is-${current.character}`}>{current.eyebrow}</span>
          <h1 id="mission-story-title">{current.title}</h1>
          <p>{line}</p>
          {step === 0 && (
            <div className="mission-story-name-fields">
              <label>Commander name<input value={commanderName} onChange={(event) => setCommanderName(event.target.value)} maxLength={24} placeholder="Your name" autoComplete="given-name" /></label>
              <label>Base name<input value={baseName} onChange={(event) => setBaseName(event.target.value)} maxLength={28} placeholder="Moonbase Alpha" /></label>
            </div>
          )}
          <div className="mission-story-actions">
            <button type="button" className="mission-story-voice" onClick={() => setVoiceEnabled((enabled) => !enabled)}>{voiceEnabled ? 'Voice on' : 'Hear the message'}</button>
            <button type="button" className="mission-story-next" onClick={goForward}>{step === OPENING.length - 1 ? 'Deploy to outpost' : 'Continue'} <span aria-hidden="true">→</span></button>
          </div>
          <div className="mission-story-progress" aria-label={`Opening ${step + 1} of ${OPENING.length}`}>
            {OPENING.map((entry, index) => <i key={entry.eyebrow} className={index <= step ? 'is-lit' : ''} />)}
          </div>
        </div>
      </section>
    </div>
  );
}

function CharacterModel() {
  return (
    <div className="mission-character mission-character-noor" aria-label="3D portrait of Dr. Noor">
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 4.4], fov: 36 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[3, 4, 5]} intensity={2.4} color="#d6faff" />
        <pointLight position={[-2, 0, 2]} intensity={1.2} color="#4cbace" />
        <NoorModel />
      </Canvas>
    </div>
  );
}

export function MissionStoryAvatar() {
  return <CharacterModel />;
}

function NoorModel() {
  const group = useRef(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(clock.elapsedTime * 0.34) * 0.075;
    group.current.position.y = -0.18 + Math.sin(clock.elapsedTime * 1.15) * 0.025;
  });
  return (
    <group ref={group} position={[0, -0.18, 0]} scale={1.08}>
      <mesh position={[0, -0.2, 0]} castShadow><capsuleGeometry args={[0.58, 0.92, 8, 24]} /><meshStandardMaterial color="#26708a" roughness={0.52} /></mesh>
      <mesh position={[0, -0.2, 0.03]}><capsuleGeometry args={[0.42, 0.72, 8, 20]} /><meshStandardMaterial color="#39a3ad" roughness={0.62} /></mesh>
      <mesh position={[0, 0.73, 0]} castShadow><sphereGeometry args={[0.46, 40, 32]} /><meshStandardMaterial color="#d59b7b" roughness={0.68} /></mesh>
      <mesh position={[0, 1.03, -0.06]}><sphereGeometry args={[0.47, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.44]} /><meshStandardMaterial color="#273544" roughness={0.78} /></mesh>
      <mesh position={[0, 0.76, 0.398]}><sphereGeometry args={[0.065, 16, 12]} /><meshStandardMaterial color="#122b3a" /></mesh>
      <mesh position={[0.16, 0.76, 0.398]}><sphereGeometry args={[0.065, 16, 12]} /><meshStandardMaterial color="#122b3a" /></mesh>
      <mesh position={[-0.015, 0.58, 0.405]} rotation={[0, 0, -0.08]}><torusGeometry args={[0.07, 0.018, 8, 24, Math.PI]} /><meshStandardMaterial color="#914f52" /></mesh>
      <mesh position={[0, -0.14, 0.48]}><torusGeometry args={[0.1, 0.025, 8, 24]} /><meshStandardMaterial color="#b7f4df" emissive="#35a9a0" emissiveIntensity={0.7} /></mesh>
      <mesh position={[-0.55, 0.4, 0.08]} rotation={[0.2, 0, -0.28]}><capsuleGeometry args={[0.07, 0.38, 6, 12]} /><meshStandardMaterial color="#e1b87d" roughness={0.62} /></mesh>
      <mesh position={[-0.51, 0.46, 0]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#70dbd1" metalness={0.45} roughness={0.35} /></mesh>
    </group>
  );
}
