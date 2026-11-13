import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { createNoorSpeech } from '../utils/missionVoice';
import './MissionStoryIntro.css';

const NOOR_ROBOT_MODEL = '/lunar/futuristic_flying_animated_robot_-_low_poly.glb';

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
        <Suspense fallback={null}>
          <NoorModel />
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload(NOOR_ROBOT_MODEL);

export function MissionStoryAvatar() {
  return <CharacterModel />;
}

function NoorModel() {
  const group = useRef(null);
  const { scene, animations } = useGLTF(NOOR_ROBOT_MODEL);
  const { actions } = useAnimations(animations, group);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const height = Math.max(size.x, size.y, size.z, 0.001);
    return { scene: clone, center, scale: 2.35 / height };
  }, [scene]);

  useEffect(() => {
    const action = Object.values(actions).find(Boolean);
    if (!action) return undefined;
    action.reset().fadeIn(0.3).play();
    return () => { action.fadeOut(0.2); };
  }, [actions]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(clock.elapsedTime * 0.34) * 0.075;
    group.current.position.y = Math.sin(clock.elapsedTime * 1.15) * 0.035;
  });
  return (
    <group ref={group}>
      <group scale={model.scale} position={[-model.center.x * model.scale, -model.center.y * model.scale, -model.center.z * model.scale]}>
        <primitive object={model.scene} />
      </group>
    </group>
  );
}
