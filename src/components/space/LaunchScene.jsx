// import { Suspense, useMemo, useRef } from 'react';
// import { Canvas, useFrame } from '@react-three/fiber';
// import * as THREE from 'three';
// import Earth from './Earth';
// import Atmosphere from './Atmosphere';
// import Rocket from './Rocket';
// import RocketExhaust from './RocketExhaust';
// import LaunchCamera from './LaunchCamera';
// import {
//   SUN_DIR, UP, TANGENT, RIGHT, EARTH_RADIUS, TIMELINE, altitudeAt, speedAt,
// } from './launchConfig';

// function Lights() {
//   return (
//     <>
//       <ambientLight intensity={0.06} />
//       <hemisphereLight args={['#6f8fc7', '#05070b', 0.18]} />
//       <directionalLight position={SUN_DIR.clone().multiplyScalar(100)} intensity={3.2} color="#fff4e6" />
//     </>
//   );
// }

// /** Master clock + rocket motion. Writes to a plain mutable object (no React re-renders). */
// function Director({ rocketRef, state, onComplete }) {
//   const q0 = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), UP), []);
//   const qRoll = useMemo(() => new THREE.Quaternion(), []);
//   const Y = useMemo(() => new THREE.Vector3(0, 1, 0), []);

//   useFrame((_, dtRaw) => {
//     const dt = Math.min(dtRaw, 0.05);
//     state.t += dt;
//     const t = state.t;

//     const ig = THREE.MathUtils.clamp((t - TIMELINE.ignite) / 3.5, 0, 1);
//     state.throttle = Math.pow(ig, 0.7);

//     const s = Math.max(0, t - TIMELINE.liftoff);
//     state.altitude = altitudeAt(s);
//     state.speed = speedAt(s);

//     const rocket = rocketRef.current;
//     if (rocket) {
//       rocket.position.copy(UP).multiplyScalar(EARTH_RADIUS + state.altitude);
//       // engine rumble on the pad
//       const amp = 0.004 * state.throttle * (1 - THREE.MathUtils.clamp(s / 3, 0, 1));
//       if (amp > 0) {
//         rocket.position
//           .addScaledVector(TANGENT, Math.sin(t * 93) * amp)
//           .addScaledVector(RIGHT, Math.sin(t * 71 + 1.3) * amp);
//       }
//       qRoll.setFromAxisAngle(Y, s * 0.04);
//       rocket.quaternion.copy(q0).multiply(qRoll);
//     }

//     if (!state.done && t >= TIMELINE.end) {
//       state.done = true;
//       onComplete?.();
//     }
//   });
//   return null;
// }

// export default function LaunchScene({ onComplete }) {
//   const rocketRef = useRef(null);
//   const state = useMemo(() => ({ t: 0, throttle: 0, altitude: 0, speed: 0, done: false }), []);

//   return (
//     <Canvas
//       style={{ position: 'absolute', inset: 0, zIndex: 1 }}
//       dpr={[1, 2]}
//       camera={{ fov: 40, near: 0.05, far: 600, position: [0, 2, 38] }}
//       gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
//       onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
//     >
//       <Suspense fallback={null}>
//         <Lights />
//         <Earth />
//         <Atmosphere />
//         <Rocket ref={rocketRef} />
//         <RocketExhaust rocketRef={rocketRef} state={state} timeline={TIMELINE} />
//         <Director rocketRef={rocketRef} state={state} onComplete={onComplete} />
//         <LaunchCamera state={state} />
//       </Suspense>
//     </Canvas>
//   );
// }



import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Earth from './Earth';
import Atmosphere from './Atmosphere';
import Rocket from './Rocket';
import RocketExhaust from './RocketExhaust';
import LaunchCamera from './LaunchCamera';
import {
  SUN_DIR, UP, TANGENT, RIGHT, EARTH_RADIUS, TIMELINE, altitudeAt, speedAt,
} from './launchConfig';

function Lights() {
  return (
    <>
      <ambientLight intensity={0.1} />
      <hemisphereLight args={['#6f8fc7', '#05070b', 0.22]} />
      <directionalLight position={SUN_DIR.clone().multiplyScalar(100)} intensity={3.2} color="#fff4e6" />
    </>
  );
}

/** Master clock + rocket motion. The clock only runs once `state.playing` is true. */
function Director({ rocketRef, state, onComplete }) {
  const q0 = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), UP), []);
  const qRoll = useMemo(() => new THREE.Quaternion(), []);
  const Y = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    if (state.playing) state.t += dt;
    const t = state.t;

    const ig = THREE.MathUtils.clamp((t - TIMELINE.ignite) / 3.5, 0, 1);
    state.throttle = Math.pow(ig, 0.7);

    const s = Math.max(0, t - TIMELINE.liftoff);
    state.altitude = altitudeAt(s);
    state.speed = speedAt(s);

    const rocket = rocketRef.current;
    if (rocket) {
      rocket.position.copy(UP).multiplyScalar(EARTH_RADIUS + state.altitude);
      const amp = 0.004 * state.throttle * (1 - THREE.MathUtils.clamp(s / 3, 0, 1));
      if (amp > 0) {
        rocket.position
          .addScaledVector(TANGENT, Math.sin(t * 93) * amp)
          .addScaledVector(RIGHT, Math.sin(t * 71 + 1.3) * amp);
      }
      qRoll.setFromAxisAngle(Y, s * 0.04);
      rocket.quaternion.copy(q0).multiply(qRoll);
    }

    if (!state.done && t >= TIMELINE.end) {
      state.done = true;
      onComplete?.();
    }
  });
  return null;
}

export default function LaunchScene({ playing = false, onComplete }) {
  const rocketRef = useRef(null);
  const state = useMemo(
    () => ({ t: 0, throttle: 0, altitude: 0, speed: 0, done: false, playing: false }),
    []
  );
  useEffect(() => { state.playing = playing; }, [playing, state]);

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      dpr={[1, 2]}
      camera={{ fov: 40, near: 0.05, far: 600, position: [44, 3, 0] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Suspense fallback={null}>
        <Lights />
        <Earth />
        <Atmosphere />
        <Rocket ref={rocketRef} />
        <RocketExhaust rocketRef={rocketRef} state={state} timeline={TIMELINE} />
        <Director rocketRef={rocketRef} state={state} onComplete={onComplete} />
        <LaunchCamera state={state} />
      </Suspense>
    </Canvas>
  );
}