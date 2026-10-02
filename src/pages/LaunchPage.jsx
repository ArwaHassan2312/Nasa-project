import { useCallback, useEffect, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import LaunchScene from '../components/space/LaunchScene';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/IntroOverlay';
import MissionSelect from '../components/space/MissionSelect';
import '../components/space/Ui.css';

// phases: 'intro' -> 'launch' -> 'select'
export default function LaunchPage() {
  const [phase, setPhase] = useState('intro');
  const [sceneMounted, setSceneMounted] = useState(true);
  const [selected, setSelected] = useState(null);
  const [videoDone, setVideoDone] = useState(false);

  const handleStart = useCallback(() => setPhase('launch'), []);
  const handleComplete = useCallback(() => setPhase('select'), []);
  const handleVideoDone = useCallback(() => setVideoDone(true), []);

  useEffect(() => {
    if (phase !== 'select') return;
    const id = setTimeout(() => setSceneMounted(false), 2400); // after the 1.8 s fade-out
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <div className="launch-root">
      <SpaceBackground />
      {sceneMounted && (
        <div className={`scene-layer ${phase === 'select' ? 'scene-layer--fade' : ''}`}>
          <LaunchScene playing={phase !== 'intro'} onComplete={handleComplete} />
        </div>
      )}
      <IntroBackdrop visible={phase === 'intro'} onFinish={handleVideoDone} />
      {phase !== 'select' && (
        <IntroOverlay visible={phase === 'intro'} ready={videoDone} onStart={handleStart} />
      )}
      {phase === 'select' && <MissionSelect selected={selected} onSelect={setSelected} />}
    </div>
  );
}