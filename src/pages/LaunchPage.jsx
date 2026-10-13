import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import LaunchScene from '../components/space/LaunchScene';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/IntroOverlay';
import MissionSelect from '../components/space/MissionSelect';
import '../components/space/Ui.css';

const LunarOutpost = lazy(() => import('../components/lunar/LunarOutpost'));

// phases: 'intro' -> 'launch' -> 'select' -> 'lunar'
export default function LaunchPage({
  simulation,
  onMissionStart,
  onMissionPause,
}) {
  const [phase, setPhase] = useState('intro');
  const [sceneMounted, setSceneMounted] = useState(true);
  const [selected, setSelected] = useState(null);
  const [videoDone, setVideoDone] = useState(false);

  const handleStart = useCallback(() => setPhase('launch'), []);
  const handleComplete = useCallback(() => setPhase('select'), []);
  const handleVideoDone = useCallback(() => setVideoDone(true), []);
  const handleLaunchMission = useCallback((id) => {
    if (id === 'moon') {
      onMissionStart?.();
      setPhase('lunar');
    }
  }, [onMissionStart]);
  const handleSkipToOutpost = useCallback(() => {
    onMissionStart?.();
    setPhase('lunar');
  }, [onMissionStart]);

  const handleExitToOrbit = useCallback(() => {
    onMissionPause?.();
    setPhase('select');
  }, [onMissionPause]);

  useEffect(() => {
    if (phase !== 'select') return;
    const id = setTimeout(() => setSceneMounted(false), 2400); // after the 1.8 s fade-out
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <div className="launch-root">
      {phase === 'lunar' ? (
        <Suspense fallback={null}>
          <LunarOutpost
            onExitToOrbit={handleExitToOrbit}
            simulation={simulation}
          />
        </Suspense>
      ) : (
        <>
          <SpaceBackground />
          {sceneMounted && (
            <div className={`scene-layer ${phase === 'select' ? 'scene-layer--fade' : ''}`}>
              <LaunchScene playing={phase !== 'intro'} onComplete={handleComplete} />
            </div>
          )}
          <IntroBackdrop visible={phase === 'intro'} onFinish={handleVideoDone} />
          {phase !== 'select' && (
            <IntroOverlay visible={phase === 'intro'} ready={videoDone} onStart={handleStart} onSkip={handleSkipToOutpost} />
          )}
          {phase === 'select' && (
            <MissionSelect
              selected={selected}
              onSelect={setSelected}
              onLaunchMission={handleLaunchMission}
            />
          )}
        </>
      )}
    </div>
  );
}
