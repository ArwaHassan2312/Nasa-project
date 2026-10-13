import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS } from './launchConfig';

/** Plays the intro clips in sequence with one continuous voice-over track. */
export default function IntroBackdrop({ visible, finished, onSequenceEnd }) {
  const firstRef = useRef(null);
  const secondRef = useRef(null);
  const audioRef = useRef(null);
  const audioStartedRef = useRef(false);
  const audioDoneRef = useRef(false);
  const secondDoneRef = useRef(false);
  const activeRef = useRef(false);
  const attemptRef = useRef(0);
  const [secondActive, setSecondActive] = useState(false);
  activeRef.current = visible && !finished;

  const finishSequenceIfReady = useCallback(() => {
    if (activeRef.current && audioDoneRef.current && secondDoneRef.current) onSequenceEnd?.();
  }, [onSequenceEnd]);

  const finishAudio = useCallback(() => {
    audioDoneRef.current = true;
    finishSequenceIfReady();
  }, [finishSequenceIfReady]);

  const stopAll = useCallback(() => {
    attemptRef.current += 1;
    audioStartedRef.current = false;
    [firstRef.current, secondRef.current, audioRef.current].forEach((media) => media?.pause());
  }, []);

  const beginPlayback = useCallback(() => {
    if (!activeRef.current || audioDoneRef.current || audioStartedRef.current) return;
    const attempt = ++attemptRef.current;
    const first = firstRef.current;
    const audio = audioRef.current;
    if (!first || !audio) return;

    audioStartedRef.current = true;
    const videoPromise = first.play();
    const audioPromise = audio.play();
    Promise.allSettled([videoPromise, audioPromise]).then(([videoResult, audioResult]) => {
      if (!activeRef.current || attempt !== attemptRef.current) return;
      if (audioResult.status === 'rejected') {
        audioStartedRef.current = false;
        audioDoneRef.current = true;
        console.warn('Intro voice-over autoplay was blocked or failed.', audioResult.reason);
        finishSequenceIfReady();
      }
      if (videoResult.status === 'rejected') {
        console.error('Intro video playback failed.', videoResult.reason);
        first.pause();
        audio.pause();
        audioDoneRef.current = true;
        finishSequenceIfReady();
      }
    });
  }, [finishSequenceIfReady]);

  useEffect(() => {
    if (visible && !finished) beginPlayback();
    else stopAll();
    return stopAll;
  }, [visible, finished, beginPlayback, stopAll]);

  const handleFirstEnded = () => {
    if (!activeRef.current) return;
    setSecondActive(true);
    secondRef.current?.play().catch((error) => {
      if (activeRef.current) console.error('Second intro video playback failed.', error);
    });
  };

  const handleSecondEnded = () => {
    secondDoneRef.current = true;
    finishSequenceIfReady();
  };

  const handleAudioError = () => {
    if (!activeRef.current || audioDoneRef.current) return;
    audioStartedRef.current = false;
    audioDoneRef.current = true;
    console.error('Intro voice-over could not be loaded or played.', audioRef.current?.error);
    finishSequenceIfReady();
  };

  return (
    <div className={`intro-media ${visible ? '' : 'intro-media--gone'} ${finished ? 'intro-media--skipped' : ''}`}>
      <video ref={firstRef} className={`intro-backdrop ${secondActive ? 'intro-backdrop--inactive' : ''}`} src={ASSETS.introVideo} muted playsInline preload="auto" disablePictureInPicture onEnded={handleFirstEnded} onError={handleFirstEnded} />
      <video ref={secondRef} className={`intro-backdrop ${secondActive ? '' : 'intro-backdrop--inactive'}`} src={ASSETS.introVideoSecond} muted playsInline preload="auto" disablePictureInPicture onEnded={handleSecondEnded} />
      <audio ref={audioRef} src={ASSETS.introVoiceover} preload="auto" onEnded={finishAudio} onError={handleAudioError} />
    </div>
  );
}
