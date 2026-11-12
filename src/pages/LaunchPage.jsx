// import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
// import SpaceBackground from '../components/space/SpaceBackground';
// import LaunchScene from '../components/space/LaunchScene';
// import IntroBackdrop from '../components/space/IntroBackdrop';
// import IntroOverlay from '../components/space/Introoverlay';
// import MissionSelect from '../components/space/Missionselect';
// import '../components/space/Ui.css';

// const LunarOutpost = lazy(() => import('../components/lunar/LunarOutpost'));

// // phases: 'intro' -> 'launch' -> 'select' -> 'lunar'
// export default function LaunchPage({
//   simulation,
//   onMissionStart,
//   onMissionPause,
// }) {
//   const [phase, setPhase] = useState('intro');
//   const [sceneMounted, setSceneMounted] = useState(true);
//   const [selected, setSelected] = useState(null);
//   const [videoDone, setVideoDone] = useState(false);

//   const handleStart = useCallback(() => setPhase('launch'), []);
//   const handleComplete = useCallback(() => setPhase('select'), []);
//   const handleVideoDone = useCallback(() => setVideoDone(true), []);
//   const handleLaunchMission = useCallback((id) => {
//     if (id === 'moon') {
//       onMissionStart?.();
//       setPhase('lunar');
//     }
//   }, [onMissionStart]);

//   const handleExitToOrbit = useCallback(() => {
//     onMissionPause?.();
//     setPhase('select');
//   }, [onMissionPause]);

//   useEffect(() => {
//     if (phase !== 'select') return;
//     const id = setTimeout(() => setSceneMounted(false), 2400); // after the 1.8 s fade-out
//     return () => clearTimeout(id);
//   }, [phase]);

//   return (
//     <div className="launch-root">
//       {phase === 'lunar' ? (
//         <Suspense fallback={null}>
//           <LunarOutpost
//             onExitToOrbit={handleExitToOrbit}
//             simulation={simulation}
//           />
//         </Suspense>
//       ) : (
//         <>
//           <SpaceBackground />
//           {sceneMounted && (
//             <div className={`scene-layer ${phase === 'select' ? 'scene-layer--fade' : ''}`}>
//               <LaunchScene playing={phase !== 'intro'} onComplete={handleComplete} />
//             </div>
//           )}
//           <IntroBackdrop visible={phase === 'intro'} onFinish={handleVideoDone} />
//           {phase !== 'select' && (
//             <IntroOverlay visible={phase === 'intro'} ready={videoDone} onStart={handleStart} />
//           )}
//           {phase === 'select' && (
//             <MissionSelect
//               selected={selected}
//               onSelect={setSelected}
//               onLaunchMission={handleLaunchMission}
//             />
//           )}
//         </>
//       )}
//     </div>
//   );
// }


import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/Introoverlay';
import MissionSelect from '../components/space/Missionselect';
import MissionStoryIntro from '../components/MissionStoryIntro';
import OutpostTutorial from '../components/OutpostTutorial';
import '../components/space/Ui.css';

const LunarOutpost = lazy(() => import('../components/lunar/LunarOutpost'));

// phases: 'intro' -> 'select' -> 'briefing' -> 'preparing' -> 'tutorial' -> 'lunar'
export default function LaunchPage({
  simulation,
  onMissionStart,
  onMissionPause,
}) {
  const [phase, setPhase] = useState('intro');
  const [selected, setSelected] = useState(null);
  const [introFinished, setIntroFinished] = useState(false);
  const [commanderProfile, setCommanderProfile] = useState({ commanderName: 'Commander', baseName: 'Moonbase Alpha' });
  const tutorialDecisionRef = useRef(null);
  tutorialDecisionRef.current = { phase };

  const handleStart = useCallback(() => setPhase('select'), []);
  const finishIntro = useCallback(() => setIntroFinished(true), []);

  const handleLaunchMission = useCallback((id) => {
    if (id === 'moon') {
      setPhase('briefing');
    }
  }, []);

  const beginMission = useCallback((profile) => {
    setCommanderProfile(profile);
    setPhase('preparing');
  }, []);

  const handleInitialCameraSettled = useCallback(() => {
    const current = tutorialDecisionRef.current;
    if (current.phase !== 'preparing') return;
    setPhase('tutorial');
  }, []);

  const finishTutorial = useCallback(() => {
    onMissionStart?.(commanderProfile);
    setPhase('lunar');
  }, [commanderProfile, onMissionStart]);

  // Skipping the cinematic still takes the player through the mission briefing.
  const handleSkip = useCallback(() => {
    handleLaunchMission('moon');
  }, [handleLaunchMission]);

  const handleExitToOrbit = useCallback(() => {
    onMissionPause?.();
    setPhase('select');
  }, [onMissionPause]);

  return (
    <div className="launch-root">
      {['preparing', 'tutorial', 'lunar'].includes(phase) ? (
        <Suspense fallback={null}>
          <LunarOutpost
            onExitToOrbit={handleExitToOrbit}
            simulation={simulation}
            commanderProfile={commanderProfile}
            tutorialMode={phase !== 'lunar'}
            tutorialActive={phase === 'tutorial'}
            onInitialCameraSettled={handleInitialCameraSettled}
          />
          {phase === 'tutorial' && <OutpostTutorial onComplete={finishTutorial} />}
        </Suspense>
      ) : (
        <>
          <SpaceBackground />
          <IntroBackdrop
            visible={phase === 'intro'}
            finished={introFinished}
            onSequenceEnd={finishIntro}
          />
          {phase !== 'select' && (
            <IntroOverlay
              visible={phase === 'intro'}
              finished={introFinished}
              onSkip={handleSkip}
              onStart={handleStart}
            />
          )}
          {phase === 'select' && (
            <MissionSelect
              selected={selected}
              onSelect={setSelected}
              onLaunchMission={handleLaunchMission}
            />
          )}
          {phase === 'briefing' && (
            <MissionStoryIntro onBegin={beginMission} />
          )}
        </>
      )}
    </div>
  );
}
