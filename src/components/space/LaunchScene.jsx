import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import Earth from './Earth';
import Atmosphere from './Atmosphere';
import Rocket from './Rocket';
import RocketExhaust from './RocketExhaust';
import LaunchCamera from './LaunchCamera';
import {
  SUN_LIGHT_POS, UP, LAUNCH_RADIUS, START_ALTITUDE,
  TIMELINE, altitudeAt, speedAt,
} from './launchConfig';

function Lights() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#6f8fc7', '#05070b', 0.35]} />
      <directionalLight position={SUN_LIGHT_POS} intensity={1.2} color="#fff4e6" />
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

    state.throttle = state.playing ? 1 : 0;
    state.altitude = START_ALTITUDE + altitudeAt(t);
    state.speed = speedAt(t);
    state.surfaceMix = 1;

    const rocket = rocketRef.current;
    if (rocket) {
      rocket.position.copy(UP).multiplyScalar(LAUNCH_RADIUS + state.altitude);
      qRoll.setFromAxisAngle(Y, t * 0.025);
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
      dpr={[1, 1.5]}
      camera={{ fov: 48, near: 0.05, far: 600, position: [0, 0, 8] }}
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
        <Countdown state={state} />
      </Suspense>
    </Canvas>
  );
}
