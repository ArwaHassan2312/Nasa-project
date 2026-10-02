import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import NeonTypewriter from './NeonTypewriter';
import { ASSETS } from './launchConfig';
import { prepareEarth } from '../../utils/modelUtils'; // generic "centre + scale to radius"
import { makePlanetTexture } from '../../utils/planetTexture';

const PLANETS = [
  { id: 'mars', name: 'Mars', url: ASSETS.mars, kind: 'mars' },
  { id: 'moon', name: 'The Moon', url: ASSETS.moon, kind: 'moon' },
];
const LINES = ['Choose your world.', 'Choose your landing site.', 'Shape your mission.'];
const RADIUS = 1.25;

/** Falls back to a procedural planet if the GLB is missing or fails to load. */
class PlanetBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Slow spin + hover scale. */
function Spin({ hovered, children }) {
  const ref = useRef();
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y += dt * 0.12;
    const s = THREE.MathUtils.lerp(g.scale.x, hovered ? 1.07 : 1, 1 - Math.exp(-dt * 6));
    g.scale.setScalar(s);
  });
  return (
    <group rotation={[0.2, 0, -0.12]}>
      <group ref={ref}>{children}</group>
    </group>
  );
}

function PlanetGLB({ url, hovered }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => prepareEarth(scene, RADIUS), [scene]);
  return (
    <Spin hovered={hovered}>
      <primitive object={obj} />
    </Spin>
  );
}

function PlanetProcedural({ kind, hovered }) {
  const tex = useMemo(() => makePlanetTexture(kind), [kind]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <Spin hovered={hovered}>
      <mesh>
        <sphereGeometry args={[RADIUS, 64, 48]} />
        <meshStandardMaterial map={tex} roughness={1} metalness={0} />
      </mesh>
    </Spin>
  );
}

function PlanetCanvas({ planet, hovered }) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 35, position: [0, 0, 5.2] }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <ambientLight intensity={0.12} />
      <directionalLight position={[-4, 2.5, 4]} intensity={3.2} color="#fff3e2" />
      <PlanetBoundary fallback={<PlanetProcedural kind={planet.kind} hovered={hovered} />}>
        <Suspense fallback={null}>
          <PlanetGLB url={planet.url} hovered={hovered} />
        </Suspense>
      </PlanetBoundary>
    </Canvas>
  );
}

export default function MissionSelect({ selected, onSelect }) {
  const [show, setShow] = useState(false);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`select-screen ${show ? 'visible' : ''}`}>
      <div className="planet-row">
        {PLANETS.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            className={`planet-card ${selected === p.id ? 'selected' : ''}`}
            onClick={() => onSelect?.(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(p.id);
              }
            }}
            onPointerEnter={() => setHover(p.id)}
            onPointerLeave={() => setHover(null)}
          >
            <div className="planet-canvas">
              <PlanetCanvas planet={p} hovered={hover === p.id || selected === p.id} />
            </div>
            <div className="planet-name">{p.name}</div>
          </div>
        ))}
      </div>

      <NeonTypewriter lines={LINES} startDelay={1400} />
    </div>
  );
}