import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/Introoverlay';
import MissionSelect from '../components/space/Missionselect';
import MissionStoryIntro from '../components/MissionStoryIntro';
import MultiplayerLobby from '../components/MultiplayerLobby';
import OutpostTutorial from '../components/OutpostTutorial';
import '../components/space/Ui.css';

const preloadLunarOutpost = () => import('../components/lunar/LunarOutpost');
const LunarOutpost = lazy(preloadLunarOutpost);

// Single player phases include the outpost tutorial; multiplayer launches directly from the crew lobby.
export default function LaunchPage({ simulation, onMissionStart, onMissionPause }) {
  const [phase, setPhase] = useState('intro');
  const [selected, setSelected] = useState(null);
  const [introFinished, setIntroFinished] = useState(false);
  const [commanderProfile, setCommanderProfile] = useState({ commanderName: 'Commander', baseName: 'Moonbase Alpha' });
  const [resumeMissionId, setResumeMissionId] = useState(null);
  const [playMode, setPlayMode] = useState('single');
  const tutorialDecisionRef = useRef(null);
  tutorialDecisionRef.current = { phase };

  const handleStart = useCallback(() => setPhase('select'), []);
  const finishIntro = useCallback(() => setIntroFinished(true), []);

  const handleLaunchMission = useCallback(async (id) => {
    if (id !== 'moon') return;

    if (resumeMissionId === id) {
      await preloadLunarOutpost();
      setCommanderProfile({ commanderName: simulation.commanderName, baseName: simulation.baseName });
      setPhase('tutorial');
    } else {
      void preloadLunarOutpost();
      setPhase('mode');
    }
    setResumeMissionId(null);
  }, [resumeMissionId, simulation.baseName, simulation.commanderName]);

  const beginMission = useCallback(async (profile) => {
    await preloadLunarOutpost();
    setCommanderProfile(profile);
    setPhase('preparing');
  }, []);

  const handleInitialCameraSettled = useCallback(() => {
    if (tutorialDecisionRef.current.phase === 'preparing') setPhase('tutorial');
  }, []);

  const finishTutorial = useCallback(() => {
    onMissionStart?.(commanderProfile);
    setPhase('lunar');
  }, [commanderProfile, onMissionStart]);

  const handleCrewReady = useCallback(async (profile) => {
    await preloadLunarOutpost();
    const missionProfile = { ...profile, baseName: 'Moonbase Alpha' };
    setCommanderProfile(missionProfile);
    onMissionStart?.(missionProfile);
    setPhase('lunar');
  }, [onMissionStart]);

  const handleRoomExit = useCallback(() => setPhase('mode'), []);

  // Skipping the cinematic still takes the player through mission configuration.
  const handleSkip = useCallback(() => {
    void handleLaunchMission('moon');
  }, [handleLaunchMission]);

  const handleExitToOrbit = useCallback(() => {
    setResumeMissionId('moon');
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
          {phase === 'briefing' && <MissionStoryIntro onBegin={beginMission} />}
          {phase === 'mode' && (
            <section className="play-mode-screen">
              <div className="play-mode-card">
                <span>MISSION CONFIGURATION</span>
                <h1>How will you play?</h1>
                <p>Choose a solo mission or assemble a crew to work on the outpost together.</p>
                <button onClick={() => { setPlayMode('single'); setPhase('briefing'); }}>
                  Single player <small>Launch a solo mission</small>
                </button>
                <button onClick={() => { setPlayMode('multi'); setPhase('lobby'); }}>
                  Multiplayer <small>Create a room or join your crew</small>
                </button>
                <button className="play-mode-back" onClick={() => setPhase('select')}>Back to destinations</button>
              </div>
            </section>
          )}
          {phase === 'lobby' && playMode === 'multi' && (
            <MultiplayerLobby onStart={handleCrewReady} onRoomExit={handleRoomExit} />
          )}
        </>
      )}
    </div>
  );
}
