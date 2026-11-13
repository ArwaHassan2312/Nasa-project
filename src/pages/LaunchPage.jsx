import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/Introoverlay';
import MissionStoryIntro from '../components/MissionStoryIntro';
import OutpostTutorial from '../components/OutpostTutorial';
import '../components/space/Ui.css';

const preloadLunarOutpost = () => import('../components/lunar/LunarOutpost');
const LunarOutpost = lazy(preloadLunarOutpost);

// Phases: intro -> briefing -> preparing -> tutorial -> lunar.
export default function LaunchPage({ simulation, onMissionStart, onMissionPause }) {
  const [phase, setPhase] = useState('intro');
  const [introFinished, setIntroFinished] = useState(false);
  const [missionStarted, setMissionStarted] = useState(false);
  const [commanderProfile, setCommanderProfile] = useState({
    commanderName: 'Commander',
    baseName: 'Moonbase Alpha',
  });
  const tutorialDecisionRef = useRef(null);
  tutorialDecisionRef.current = { phase };

  const finishIntro = useCallback(() => setIntroFinished(true), []);

  const enterMoonMission = useCallback(() => {
    if (missionStarted) {
      onMissionStart?.(commanderProfile);
      setPhase('lunar');
      return;
    }
    setPhase('briefing');
  }, [commanderProfile, missionStarted, onMissionStart]);

  const handleSkip = useCallback(() => {
    setIntroFinished(true);
    enterMoonMission();
  }, [enterMoonMission]);

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
    setMissionStarted(true);
    setPhase('lunar');
  }, [commanderProfile, onMissionStart]);

  const handleExitToOrbit = useCallback(() => {
    onMissionPause?.();
    setIntroFinished(true);
    setPhase('intro');
  }, [onMissionPause]);

  const isMoonOutpostMounted = ['preparing', 'tutorial', 'lunar'].includes(phase);

  return (
    <div className="launch-root">
      {isMoonOutpostMounted ? (
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
          {phase === 'intro' && (
            <IntroOverlay
              visible
              finished={introFinished}
              onSkip={handleSkip}
              onStart={enterMoonMission}
              startLabel={missionStarted ? 'Resume Moon mission' : 'Start Moon mission'}
            />
          )}
          {phase === 'briefing' && <MissionStoryIntro onBegin={beginMission} />}
        </>
      )}
    </div>
  );
}
