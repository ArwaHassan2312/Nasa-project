
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { UP, TANGENT, RIGHT } from './launchConfig';

const FLAME_COUNT = 240;
const { lerp, smoothstep } = THREE.MathUtils;

/* ---------- procedural soft, lumpy sprite (no external texture) ---------- */
function makeSmokeTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  let s = 1337;
  const rnd = () =>
    ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * size * 0.26;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const r = size * (0.08 + rnd() * 0.17);

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(
      0,
      `rgba(255,255,255,${0.1 + rnd() * 0.12})`
    );
    g.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.globalCompositeOperation = 'destination-in';

  const m = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.5
  );

  m.addColorStop(0, 'rgba(255,255,255,1)');
  m.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = m;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(c);
}

/* ---------- point-sprite shaders ---------- */
const particleVert = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute float aSeed;

  uniform float uHeight;

  varying float vLife;
  varying float vSeed;

  void main() {
    vLife = aLife;
    vSeed = aSeed;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);

    gl_Position = projectionMatrix * mv;

    float px =
      aSize *
      uHeight *
      0.5 *
      projectionMatrix[1][1] /
      max(-mv.z, 0.001);

    gl_PointSize = aLife < 0.0
      ? 0.0
      : min(px, 700.0);

    if (aLife < 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    }
  }
`;

const particleFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uOpacity;

  varying float vLife;
  varying float vSeed;

  void main() {
    float a =
      vSeed * 6.2831 +
      vLife * (vSeed - 0.5) * 2.0;

    vec2 c = gl_PointCoord - 0.5;

    mat2 R = mat2(
      cos(a), -sin(a),
      sin(a), cos(a)
    );

    vec2 uv = R * c + 0.5;

    float n = smoothstep(
      0.0,
      0.9,
      texture2D(uMap, uv).a
    );

    float fadeIn = smoothstep(0.0, 0.06, vLife);
    float fadeOut = 1.0 - smoothstep(0.3, 1.0, vLife);

    float alpha =
      n *
      fadeIn *
      fadeOut *
      uOpacity;

    vec3 col = mix(
      uColorA,
      uColorB,
      smoothstep(0.0, 0.4, vLife)
    );

    col = mix(
      col,
      uColorC,
      smoothstep(0.3, 1.0, vLife)
    );

    col *= 0.85 + 0.3 * vSeed;

    gl_FragColor = vec4(col, alpha);
  }
`;

function makeParticleMaterial(
  map,
  colors,
  opacity,
  additive
) {
  return new THREE.ShaderMaterial({
    vertexShader: particleVert,
    fragmentShader: particleFrag,

    uniforms: {
      uMap: { value: map },
      uHeight: { value: 1080 },
      uOpacity: { value: opacity },

      uColorA: {
        value: new THREE.Color(...colors[0]),
      },

      uColorB: {
        value: new THREE.Color(...colors[1]),
      },

      uColorC: {
        value: new THREE.Color(...colors[2]),
      },
    },

    transparent: true,
    depthWrite: false,

    blending: additive
      ? THREE.AdditiveBlending
      : THREE.NormalBlending,
  });
}

/* ---------- CPU particle pool ---------- */
function createPool(count, material) {
  const pool = {
    count,
    cursor: 0,
    carry: 0,

    pos: new Float32Array(count * 3),
    vel: new Float32Array(count * 3),

    age: new Float32Array(count),
    dur: new Float32Array(count).fill(1),

    s0: new Float32Array(count),
    s1: new Float32Array(count),

    size: new Float32Array(count),
    life: new Float32Array(count).fill(-1),

    seed: new Float32Array(count),
  };

  const geo = new THREE.BufferGeometry();

  const dyn = (arr, n) =>
    new THREE.BufferAttribute(arr, n)
      .setUsage(THREE.DynamicDrawUsage);

  geo.setAttribute(
    'position',
    dyn(pool.pos, 3)
  );

  geo.setAttribute(
    'aSize',
    dyn(pool.size, 1)
  );

  geo.setAttribute(
    'aLife',
    dyn(pool.life, 1)
  );

  geo.setAttribute(
    'aSeed',
    dyn(pool.seed, 1)
  );

  pool.geo = geo;

  pool.points = new THREE.Points(
    geo,
    material
  );

  pool.points.frustumCulled = false;

  return pool;
}

function emit(
  p,
  x,
  y,
  z,
  vx,
  vy,
  vz,
  dur,
  s0,
  s1
) {
  const i = p.cursor;

  p.cursor =
    (p.cursor + 1) % p.count;

  p.pos[i * 3] = x;
  p.pos[i * 3 + 1] = y;
  p.pos[i * 3 + 2] = z;

  p.vel[i * 3] = vx;
  p.vel[i * 3 + 1] = vy;
  p.vel[i * 3 + 2] = vz;

  p.age[i] = 0;
  p.dur[i] = dur;

  p.s0[i] = s0;
  p.s1[i] = s1;

  p.size[i] = s0;
  p.life[i] = 0;

  p.seed[i] = Math.random();
}

function updatePool(
  p,
  dt,
  t,
  drag,
  turb
) {
  const damp = Math.exp(-drag * dt);

  for (let i = 0; i < p.count; i++) {
    if (p.life[i] < 0) continue;

    const a =
      (p.age[i] += dt / p.dur[i]);

    if (a >= 1) {
      p.life[i] = -1;
      p.size[i] = 0;
      continue;
    }

    p.life[i] = a;

    const i3 = i * 3;

    const sd =
      p.seed[i] * 40;

    let vx =
      p.vel[i3] * damp;

    let vy =
      p.vel[i3 + 1] * damp;

    let vz =
      p.vel[i3 + 2] * damp;

    const px = p.pos[i3];
    const py = p.pos[i3 + 1];
    const pz = p.pos[i3 + 2];

    vx +=
      Math.sin(
        py * 2.3 +
        t * 1.1 +
        sd
      ) *
      turb *
      dt;

    vy +=
      Math.sin(
        pz * 2.1 +
        t * 0.9 +
        sd * 1.3
      ) *
      turb *
      dt;

    vz +=
      Math.cos(
        px * 2.5 +
        t * 1.2 +
        sd * 0.7
      ) *
      turb *
      dt;

    p.vel[i3] = vx;
    p.vel[i3 + 1] = vy;
    p.vel[i3 + 2] = vz;

    p.pos[i3] =
      px + vx * dt;

    p.pos[i3 + 1] =
      py + vy * dt;

    p.pos[i3 + 2] =
      pz + vz * dt;

    const e =
      1 -
      (1 - a) *
      (1 - a);

    p.size[i] =
      p.s0[i] +
      (p.s1[i] - p.s0[i]) * e;
  }

  p.geo.attributes.position.needsUpdate = true;
  p.geo.attributes.aSize.needsUpdate = true;
  p.geo.attributes.aLife.needsUpdate = true;
  p.geo.attributes.aSeed.needsUpdate = true;
}

/* ---------- flame cone ---------- */
const coneVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;

  void main() {
    vUv = uv;
    vN = normalMatrix * normal;

    vec4 mv =
      modelViewMatrix *
      vec4(position, 1.0);

    vV = -mv.xyz;

    gl_Position =
      projectionMatrix * mv;
  }
`;

const coneFrag = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uWhite;

  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;

  void main() {
    float t = 1.0 - vUv.y;

    float core =
      pow(1.0 - t, 1.5);

    vec3 col =
      mix(
        vec3(1.0, 0.97, 0.85),
        vec3(1.0, 0.5, 0.12),
        smoothstep(0.0, 0.55, t) *
        (1.0 - uWhite)
      );

    col =
      mix(
        col,
        vec3(0.8, 0.2, 0.05),
        smoothstep(0.5, 1.0, t) *
        (1.0 - uWhite)
      );

    float fres =
      pow(
        abs(
          dot(
            normalize(vN),
            normalize(vV)
          )
        ),
        1.4
      );

    float flick =
      0.85 +
      0.15 *
      sin(
        uTime * 60.0 +
        t * 14.0
      );

    float alpha =
      core *
      fres *
      uIntensity *
      flick;

    gl_FragColor =
      vec4(col, alpha);
  }
`;

function makeConeMaterial(white) {
  return new THREE.ShaderMaterial({
    vertexShader: coneVert,
    fragmentShader: coneFrag,

    uniforms: {
      uTime: { value: 0 },

      uIntensity: {
        value: white
          ? 1.4
          : 0.9,
      },

      uWhite: {
        value: white
          ? 1
          : 0,
      },
    },

    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/* ---------- component ---------- */
export default function RocketExhaust({
  rocketRef,
  state,
  timeline,
}) {
  const gl = useThree(
    (s) => s.gl
  );

  const coneRef = useRef();
  const lightRef = useRef();

  const res = useMemo(() => {
    const map =
      makeSmokeTexture();

    const flameMat =
      makeParticleMaterial(
        map,
        [
          [1.0, 0.95, 0.8],
          [1.0, 0.55, 0.15],
          [0.55, 0.1, 0.02],
        ],
        0.9,
        true
      );

    const coneGeo =
      new THREE.CylinderGeometry(
        1,
        0.05,
        1,
        24,
        1,
        true
      );

    coneGeo.translate(
      0,
      -0.5,
      0
    );

    return {
      map,
      flameMat,
      coneGeo,

      outerMat:
        makeConeMaterial(false),

      innerMat:
        makeConeMaterial(true),

      flame:
        createPool(
          FLAME_COUNT,
          flameMat
        ),
    };
  }, []);

  useEffect(
    () => () => {
      res.map.dispose();
      res.flameMat.dispose();

      res.coneGeo.dispose();
      res.outerMat.dispose();
      res.innerMat.dispose();

      res.flame.geo.dispose();
    },
    [res]
  );

  const tmp = useMemo(
    () => ({
      noz: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      has: false,

      buf: new THREE.Vector2(),
      dir: new THREE.Vector3(),
    }),
    []
  );

  useFrame((_, dtRaw) => {
    const rocket =
      rocketRef.current;

    if (!rocket) return;

    const dt =
      Math.min(dtRaw, 0.05);

    const t = state.t;
    const thr = state.throttle;
    const alt = state.altitude;

    const {
      noz,
      prev,
      buf,
    } = tmp;

    noz.copy(
      rocket.position
    );

    if (!tmp.has) {
      prev.copy(noz);
      tmp.has = true;
    }

    // 0 = atmosphere
    // 1 = space
    const vac =
      smoothstep(
        alt,
        4,
        22
      );

    gl.getDrawingBufferSize(
      buf
    );

    res.flameMat.uniforms.uHeight.value =
      buf.y;

    /* ---------- emission ---------- */
    if (thr > 0.02) {
      const { flame } = res;
      let n;

      /* ---------- flame ---------- */
      flame.carry +=
        180 *
        thr *
        dt;

      n =
        Math.floor(
          flame.carry
        );

      flame.carry -= n;

      while (n-- > 0) {
        const f =
          Math.random();

        const sp =
          7 +
          Math.random() * 6;

        const th =
          Math.random() *
          Math.PI *
          2;

        const l =
          Math.random() *
          0.4;

        emit(
          flame,

          lerp(
            prev.x,
            noz.x,
            f
          ),

          lerp(
            prev.y,
            noz.y,
            f
          ),

          lerp(
            prev.z,
            noz.z,
            f
          ),

          -UP.x * sp +
            (
              TANGENT.x *
                Math.cos(th) +
              RIGHT.x *
                Math.sin(th)
            ) *
              l,

          -UP.y * sp +
            (
              TANGENT.y *
                Math.cos(th) +
              RIGHT.y *
                Math.sin(th)
            ) *
              l,

          -UP.z * sp +
            (
              TANGENT.z *
                Math.cos(th) +
              RIGHT.z *
                Math.sin(th)
            ) *
              l,

          0.12 +
            Math.random() *
              0.18,

          (
            0.1 +
            Math.random() *
              0.08
          ) *
            (1 +
              vac * 1.2),

          0.03
        );
      }
    }

    prev.copy(noz);

    /* ---------- update particles ---------- */
    updatePool(
      res.flame,
      dt,
      t,
      0.2,
      0.5
    );

    /* ---------- flame cone ---------- */
    const flick =
      1 +
      0.08 *
        Math.sin(t * 47) +
      0.06 *
        Math.sin(t * 83 + 1.7);

    const cone =
      coneRef.current;

    if (cone) {
      cone.visible =
        thr > 0.02;

      if (cone.visible) {
        const len =
          thr *
          flick *
          0.9 *
          (1 + vac);

        const rad =
          thr *
          (1 + vac * 1.6) *
          0.07;

        cone.position.copy(
          rocket.position
        );

        cone.quaternion.copy(
          rocket.quaternion
        );

        cone.scale.set(
          rad,
          len,
          rad
        );

        res.outerMat.uniforms.uTime.value =
          t;

        res.innerMat.uniforms.uTime.value =
          t;
      }
    }

    /* ---------- engine light ---------- */
    const light =
      lightRef.current;

    if (light) {
      const pre =
        smoothstep(
          t,
          timeline.ignite - 2,
          timeline.ignite
        ) *
        0.15;

      light.position
        .copy(rocket.position)
        .addScaledVector(
          UP,
          -0.15
        );

      light.intensity =
        (thr + pre) *
        flick *
        2.5;
    }
  });

  return (
    <>
      <primitive
        object={res.flame.points}
        renderOrder={4}
      />

      <group
        ref={coneRef}
        visible={false}
        renderOrder={4}
      >
        <mesh
          geometry={res.coneGeo}
          material={res.outerMat}
        />

        <mesh
          geometry={res.coneGeo}
          material={res.innerMat}
          scale={[0.5, 0.65, 0.5]}
        />
      </group>

      <pointLight
        ref={lightRef}
        color="#ff8a3a"
        intensity={0}
        distance={6}
        decay={2}
      />
    </>
  );
}

