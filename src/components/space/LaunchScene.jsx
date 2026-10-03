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
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import Earth from './Earth';
import Atmosphere from './Atmosphere';
import Rocket from './Rocket';
import LaunchPad from './LaunchPad';
import UndergroundLaunchShaft from './UndergroundLaunchShaft';
import RocketExhaust from './RocketExhaust';
import LaunchCamera from './LaunchCamera';
import {
  SUN_DIR, UP, TANGENT, RIGHT, PAD_HEIGHT, UNDERGROUND_DEPTH, LAUNCH_RADIUS,
  TIMELINE, altitudeAt, speedAt,
} from './launchConfig';

function Lights({ state }) {
  const sun = useRef(null);
  useFrame(() => {
    if (!sun.current) return;
    const outside = THREE.MathUtils.smoothstep(state.surfaceMix, 0.3, 1);
    sun.current.intensity = THREE.MathUtils.lerp(0.18, 3.2, outside);
  });
  return (
    <>
      <ambientLight intensity={0.055} />
      <hemisphereLight args={['#6f8fc7', '#05070b', 0.22]} />
      <directionalLight ref={sun} position={SUN_DIR.clone().multiplyScalar(100)} intensity={0.18} color="#fff4e6" />
    </>
  );
}

/** Screen-space countdown driven directly by the same elapsed-time clock as the launch. */
function Countdown({ state }) {
  const label = useRef(null);
  useFrame(() => {
    if (!label.current) return;
    const remaining = Math.ceil(TIMELINE.ignite - state.t);
    label.current.textContent = state.playing && remaining > 0 && remaining <= 5
      ? `T − ${remaining}`
      : state.t >= TIMELINE.ignite && state.t < TIMELINE.liftoff
        ? 'ENGINE IGNITION'
        : '';
  });
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div ref={label} style={{
        position: 'absolute', left: '50%', top: '16%', transform: 'translateX(-50%)',
        color: '#e8edf2', font: '600 13px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace',
        letterSpacing: '0.24em', textShadow: '0 1px 12px #000', whiteSpace: 'nowrap',
      }} />
    </Html>
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
    state.surfaceMix = THREE.MathUtils.smoothstep(
      state.altitude,
      UNDERGROUND_DEPTH - PAD_HEIGHT - 0.45,
      UNDERGROUND_DEPTH - PAD_HEIGHT + 0.45
    );

    const rocket = rocketRef.current;
    if (rocket) {
      rocket.position.copy(UP).multiplyScalar(LAUNCH_RADIUS + state.altitude);
      const amp = 0.004 * state.throttle * (1 - THREE.MathUtils.clamp(s / 3, 0, 1));
      if (amp > 0) {
        rocket.position
          .addScaledVector(TANGENT, Math.sin(t * 93) * amp)
          .addScaledVector(RIGHT, Math.sin(t * 71 + 1.3) * amp);
      }
      qRoll.setFromAxisAngle(Y, s * 0.04);
      rocket.quaternion.copy(q0).multiply(qRoll);
      rocket.scale.setScalar(1);
      rocket.visible = true;
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
    () => ({ t: 0, throttle: 0, altitude: 0, speed: 0, surfaceMix: 0, done: false, playing: false }),
    []
  );
  useEffect(() => { state.playing = playing; }, [playing, state]);

  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      dpr={[1, 2]}
      camera={{ fov: 48, near: 0.05, far: 600, position: [0, 0, 8] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Suspense fallback={null}>
        <Lights state={state} />
        <Earth state={state} />
        {/* <Atmosphere state={state} /> */}
        <UndergroundLaunchShaft state={state} />
        <LaunchPad state={state} />
        <Rocket ref={rocketRef} />
        <RocketExhaust rocketRef={rocketRef} state={state} timeline={TIMELINE} />
        <Director rocketRef={rocketRef} state={state} onComplete={onComplete} />
        <LaunchCamera state={state} />
        <Countdown state={state} />
      </Suspense>
    </Canvas>
  );
}
