import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { UP, TANGENT, RIGHT, EARTH_RADIUS } from './launchConfig';

// Key: t = seconds, v = [tangent, up, right, anchorWeight, lookUp]
// Offsets are in the launch-site frame, relative to a base that blends from
// Earth's centre (w=0) to the rocket (w=1).
const toLocal = (v) => [v.dot(TANGENT), v.dot(UP), v.dot(RIGHT)];
const KEYS = [
  { t: 0,    v: [...toLocal(new THREE.Vector3(44, 3, 0)), 0, 6] },  // 1 wide Earth, rocket in profile
  { t: 5.5,  v: [11, 5, 6, 1, 0.8] },                               // 2 move toward pad
  { t: 9,    v: [5, 1.5, 2.6, 1, 1.0] },                            // 3 ignition close-up
  { t: 11,   v: [4.8, 1.5, 2.5, 1, 1.0] },
  { t: 15,   v: [6.5, 2.5, 3.6, 1, 0.5] },                          // 4 follow
  { t: 23,   v: [16, 6.5, 8, 1, 0] },                               // 5 pull back
  { t: 30,   v: [20, 4, 40, 0.8, 3] },                              // 6 entering space
  { t: 37,   v: [12, 0, 70, 0.5, 0] },                              // 7 rocket + Earth
];

// Catmull-Rom for smooth velocity across keys
const cr = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

export default function LaunchCamera({ state }) {
  const init = useRef(false);
  const o = useMemo(() => ({
    base: new THREE.Vector3(), desired: new THREE.Vector3(),
    target: new THREE.Vector3(), cur: new THREE.Vector3(), val: [0, 0, 0, 0, 0],
  }), []);

  useFrame(({ camera, size }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const aspect = size.width / size.height;
    const fit = Math.max(1, 1.5 / aspect); // keep composition on narrow screens
    const t = Math.min(state.t, KEYS[KEYS.length - 1].t);

    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const a = KEYS[Math.max(i - 1, 0)].v, b = KEYS[i].v, c = KEYS[i + 1].v;
    const d = KEYS[Math.min(i + 2, KEYS.length - 1)].v;
    const u = THREE.MathUtils.clamp((t - KEYS[i].t) / (KEYS[i + 1].t - KEYS[i].t), 0, 1);
    for (let j = 0; j < 5; j++) o.val[j] = cr(a[j], b[j], c[j], d[j], u);

    const w = THREE.MathUtils.clamp(o.val[3], 0, 1);
    o.base.copy(UP).multiplyScalar((EARTH_RADIUS + state.altitude) * w);
    o.desired.copy(o.base)
      .addScaledVector(TANGENT, o.val[0] * fit)
      .addScaledVector(UP, o.val[1] * fit)
      .addScaledVector(RIGHT, o.val[2] * fit);
    o.target.copy(o.base).addScaledVector(UP, o.val[4]);

    if (!init.current) {
      camera.position.copy(o.desired);
      o.cur.copy(o.target);
      init.current = true;
    } else {
      const k = 1 - Math.exp(-dt * 3.5);
      camera.position.lerp(o.desired, k);
      o.cur.lerp(o.target, k);
    }
    camera.lookAt(o.cur);
  });

  return null;
}