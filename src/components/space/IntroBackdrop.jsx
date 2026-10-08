import { useEffect, useRef } from 'react';
import { ASSETS, INTRO_VIDEO_SECONDS } from './launchConfig';

/**
 * Full-screen intro video (muted autoplay, object-fit: cover, no stretching).
 * Calls onFinish once, after INTRO_VIDEO_SECONDS of playback (or when the clip ends / fails).
 * Afterwards it stays on its last frame behind the text, and cross-fades away on start.
 */
export default function IntroBackdrop({ visible, onFinish }) {
  const videoRef = useRef(null);
  const finished = useRef(false);
  const timer = useRef(null);
  const safety = useRef(null);
  const cb = useRef(onFinish);
  useEffect(() => { cb.current = onFinish; });

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    clearTimeout(timer.current);
    clearTimeout(safety.current);
    videoRef.current?.pause();
    cb.current?.();
  };

  // starts counting the 10 s only when playback has really begun
  const startTimer = () => {
    if (timer.current || finished.current) return;
    timer.current = setTimeout(finish, INTRO_VIDEO_SECONDS * 1000);
  };

  useEffect(() => {
    videoRef.current?.play?.().catch(() => {});
    // safety net: if the video never starts (blocked / missing file) don't leave the player stuck
    safety.current = setTimeout(finish, (INTRO_VIDEO_SECONDS + 4) * 1000);
    return () => {
      clearTimeout(timer.current); timer.current = null;
      clearTimeout(safety.current);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={ASSETS.introVideo}
      poster={ASSETS.introImage}
      className={`intro-backdrop ${visible ? '' : 'intro-backdrop--gone'}`}
      autoPlay
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      draggable={false}
      onPlaying={startTimer}
      onEnded={finish}
      onError={finish}
    />
  );
}