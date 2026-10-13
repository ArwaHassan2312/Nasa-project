import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import NeonTypewriter from './NeonTypewriter';
import TypedBriefing from './TypedBriefing';
import { DESTINATIONS } from './destinations';
import { ASSETS } from './launchConfig';
import { prepareEarth } from '../../utils/modelUtils'; // generic "centre + scale to radius"
import { makePlanetTexture } from '../../utils/Planettexture';

const PLANETS = [
  { id: 'moon', name: 'Moon', url: ASSETS.moon, kind: 'moon' },
  { id: 'mars', name: 'Mars', url: ASSETS.mars, kind: 'mars' },
];
const LINES = [
  'Your destination awaits.',
  '',
  'Choose your world.',
  'Choose your landing site.',
  'Shape your mission.',
];
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

/** Keeps the planet centred and fully inside the card while the card resizes. */
function FitCamera({ enabled }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    if (!enabled) return;
    const aspect = size.width / Math.max(size.height, 1);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const z = (RADIUS * 1.32) / (tan * Math.min(1, aspect));
    camera.position.set(0, 0, z);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size, enabled]);
  return null;
}

/** Sun light that rides with the camera, so the world stays lit while the player orbits it. */
function CameraLights() {
  const ref = useRef();
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <>
      <ambientLight intensity={0.15} />
      <group ref={ref}>
        <directionalLight position={[-4, 2.5, 4]} intensity={3.2} color="#fff3e2" />
      </group>
    </>
  );
}

function PlanetCanvas({ planet, hovered, interactive }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 35, position: [0, 0, 5.2] }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <FitCamera enabled={!interactive} />
      <CameraLights />
      <PlanetBoundary fallback={<PlanetProcedural kind={planet.kind} hovered={hovered} />}>
        <Suspense fallback={null}>
          <PlanetGLB url={planet.url} hovered={hovered} />
        </Suspense>
      </PlanetBoundary>
      {interactive && (
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.8}
          zoomSpeed={0.6}
          minDistance={3}
          maxDistance={9}
        />
      )}
    </Canvas>
  );
}

export default function MissionSelect({ selected, onSelect, onLaunchMission }) {
  const [show, setShow] = useState(false);
  const [hover, setHover] = useState(null);
  const [panelOn, setPanelOn] = useState(false);   // info panel slides in
  const [settled, setSettled] = useState(false);   // slide finished -> model becomes draggable
  const [view, setView] = useState(null);          // { id, n } -> remounts the typing per selection
  const [prevSelected, setPrevSelected] = useState(null);

  // Reset derived state during render when the selection changes (no effect needed)
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    setPanelOn(false);
    setSettled(false);
    if (selected) setView((v) => ({ id: selected, n: (v?.n ?? 0) + 1 }));
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Only schedules timers; setState happens inside the callbacks
  useEffect(() => {
    if (!selected) return undefined;
    const t1 = setTimeout(() => setPanelOn(true), 800);
    const t2 = setTimeout(() => setSettled(true), 1250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onSelect?.(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onSelect]);

  const pick = (id) => {
    if (!selected) onSelect?.(id);
  };

  return (
    <div className={`select-screen ${show ? 'visible' : ''} ${selected ? 'has-selection' : ''}`}>
      <div className="select-heading">
        <NeonTypewriter lines={LINES} startDelay={350} speed={11} lineDelay={110} punctDelay={50} />
      </div>

      <div className="dest-stage">
        {PLANETS.map((p, idx) => {
          const isSel = selected === p.id;
          const dismissed = !!selected && !isSel;
          const interactive = isSel && settled;
          const tag = isSel
            ? settled ? 'Drag to rotate · Scroll to zoom' : 'Destination locked'
            : hover === p.id && !selected ? 'Select destination' : '\u00A0';
          return (
            <div
              key={p.id}
              role="button"
              aria-pressed={isSel}
              aria-disabled={!!selected}
              tabIndex={selected ? -1 : 0}
              className={[
                'dest-card',
                idx === 0 ? 'dest-card--left' : 'dest-card--right',
                isSel ? 'selected' : '',
                dismissed ? 'dismissed' : '',
                interactive ? 'is-interactive' : '',
              ].join(' ')}
              onClick={() => pick(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(p.id);
                }
              }}
              onPointerEnter={() => setHover(p.id)}
              onPointerLeave={() => setHover(null)}
            >
              <div className={`dest-canvas ${!selected ? 'dest-canvas--image' : ''}`}>
                {selected ? (
                  <PlanetCanvas
                    planet={p}
                    hovered={hover === p.id && !selected}
                    interactive={interactive}
                  />
                ) : (
                  <img className="dest-planet-image" src={p.id === 'moon' ? ASSETS.moonImage : ASSETS.marsImage} alt={`${p.name}`} />
                )}
              </div>
              <div className="dest-meta">
                <div className="planet-name">{p.name}</div>
                <div className="planet-tag">{tag}</div>
              </div>
            </div>
          );
        })}

        {view && (
          <aside className={`dest-info ${selected && panelOn ? 'dest-info--on' : ''}`}>
            <TypedBriefing
              key={`${view.id}-${view.n}`}
              data={DESTINATIONS[view.id]}
              active={!!selected && panelOn}
            />
            {selected === 'moon' && (
              <div className="dest-action-container">
                <button
                  type="button"
                  className="dest-deploy-btn"
                  onClick={() => onLaunchMission?.('moon')}
                >
                  <span className="dest-deploy-icon">⚡</span>
                  <div className="dest-deploy-info">
                    <span className="dest-deploy-title">DEPLOY TO LUNAR SURFACE</span>
                    <span className="dest-deploy-desc">Apollo 12 & 16 Outpost Recon · Habitat & Greenhouse</span>
                  </div>
                  <span className="dest-deploy-arrow">→</span>
                </button>
              </div>
            )}
            {selected === 'mars' && (
              <div className="dest-action-container">
                <div className="dest-deploy-btn dest-deploy-btn--disabled">
                  <span className="dest-deploy-icon">⏳</span>
                  <div className="dest-deploy-info">
                    <span className="dest-deploy-title">MARS RECONNAISSANCE</span>
                    <span className="dest-deploy-desc">Orbital scan active · Surface mission in development</span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      <button
        type="button"
        className={`dest-back ${selected ? 'dest-back--on' : ''}`}
        tabIndex={selected ? 0 : -1}
        onClick={() => onSelect?.(null)}
      >
        ← Change destination
      </button>
    </div>
  );
}
