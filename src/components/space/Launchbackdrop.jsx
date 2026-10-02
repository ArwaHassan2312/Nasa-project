import { useEffect, useRef } from 'react';
import {
  ASSETS, EARTH_IMAGE_POSITION, EARTH_PARALLAX, HALF_VIEW_HEIGHT,
} from './launchConfig';

/**
 * Two layers behind the 3D canvas:
 *  - the space GIF (hidden at first, fades in as the rocket climbs)
 *  - the Earth photo, which drops away with the camera as the rocket rises
 * Driven by a requestAnimationFrame loop that reads the shared launch state,
 * so React never re-renders during the launch.
 */
export default function LaunchBackdrop({ state }) {
  const earthRef = useRef(null);
  const starsRef = useRef(null);

  useEffect(() => {
    let raf;
    const tick = () => {
      const vh = window.innerHeight;
      const shift = (state.camY / HALF_VIEW_HEIGHT) * 0.5 * vh * EARTH_PARALLAX; // px
      if (earthRef.current) earthRef.current.style.transform = `translate3d(0, ${shift}px, 0)`;
      if (starsRef.current) {
        starsRef.current.style.opacity = String(Math.min(1, Math.max(0, shift / (vh * 0.25))));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const fill = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    pointerEvents: 'none',
    userSelect: 'none',
  };
  const fade = 'linear-gradient(to bottom, transparent 0%, #000 22%)';

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000', zIndex: 0 }}>
      <img
        ref={starsRef}
        src={ASSETS.background}
        alt=""
        draggable={false}
        style={{ ...fill, opacity: 0, filter: 'brightness(0.8)' }}
      />
      <div
        ref={earthRef}
        style={{
          position: 'absolute',
          inset: 0,
          willChange: 'transform',
          WebkitMaskImage: fade,
          maskImage: fade,
        }}
      >
        <img
          src={ASSETS.earthImage}
          alt=""
          draggable={false}
          style={{ ...fill, objectPosition: EARTH_IMAGE_POSITION }}
        />
      </div>
    </div>
  );
}