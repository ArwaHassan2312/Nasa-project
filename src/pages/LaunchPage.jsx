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


import { Suspense, lazy, useCallback, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/Introoverlay';
import MissionSelect from '../components/space/Missionselect';
import MissionStoryIntro from '../components/MissionStoryIntro';
import MultiplayerLobby from '../components/MultiplayerLobby';
import '../components/space/Ui.css';

const LunarOutpost = lazy(() => import('../components/lunar/LunarOutpost'));

// phases: 'intro' -> 'select' -> 'mode' -> 'briefing' -> 'lunar'
export default function LaunchPage({
  simulation,
  onMissionStart,
  onMissionPause,
}) {
  const [phase, setPhase] = useState('intro');
  const [selected, setSelected] = useState(null);
  const [introFinished, setIntroFinished] = useState(false);
  const [commanderProfile, setCommanderProfile] = useState({ commanderName: 'Commander', baseName: 'Moonbase Alpha' });
  const [playMode, setPlayMode] = useState('single');

  const handleStart = useCallback(() => setPhase('select'), []);
  const finishIntro = useCallback(() => setIntroFinished(true), []);

  const handleLaunchMission = useCallback((id) => {
    if (id === 'moon') {
      setPhase('mode');
    }
  }, []);

  const beginMission = useCallback((profile) => {
    const missionProfile = playMode === 'multi'
      ? { ...profile, commanderName: profile.commanderName, baseName: 'Moonbase Alpha' }
      : profile;
    setCommanderProfile(missionProfile);
    onMissionStart?.(missionProfile);
    setPhase('lunar');
  }, [onMissionStart, playMode, commanderProfile]);

  const handleCrewReady = useCallback((profile) => {
    beginMission(profile);
  }, [beginMission]);

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
      {phase === 'lunar' ? (
        <Suspense fallback={null}>
          <LunarOutpost
            onExitToOrbit={handleExitToOrbit}
            simulation={simulation}
            commanderProfile={commanderProfile}
          />
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
          {phase === 'mode' && (
            <section className="play-mode-screen">
              <div className="play-mode-card">
                <span>MISSION CONFIGURATION</span>
                <h1>How will you play?</h1>
                <p>Choose a solo mission or assemble a crew to work on the outpost together.</p>
                <button onClick={() => { setPlayMode('single'); setPhase('briefing'); }}>Single player <small>Launch a solo mission</small></button>
                <button onClick={() => { setPlayMode('multi'); setPhase('lobby'); }}>Multiplayer <small>Create a room or join your crew</small></button>
                <button className="play-mode-back" onClick={() => setPhase('select')}>Back to destinations</button>
              </div>
            </section>
          )}
          {phase === 'lobby' && playMode === 'multi' && <MultiplayerLobby onStart={handleCrewReady} />}
        </>
      )}
    </div>
  );
}
