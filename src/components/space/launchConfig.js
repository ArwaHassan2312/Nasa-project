import * as THREE from 'three';

// ---- Asset paths (files live in /public) ----
export const ASSETS = {
  earth: '/public/models/earth-00.glb',
  rocket: '/public/models/3d-white-rocket.glb',
  background: '/src/assets/images/1773008.png',
  mars: '/public/models/24881_Mars_1_6792.glb',
  moon: '/public/models/moon.glb',
  earthImage: '/src/assets/images/earth-00.png',
};

// ---- Scale (scene units). Rocket is exaggerated vs. real Earth, otherwise it would be sub-pixel. ----
export const EARTH_RADIUS = 10;
export const ROCKET_HEIGHT = 1.2;
export const ROCKET_FLIP = false; // set true if the nose points down after load

// ---- Timeline (seconds) ----
export const TIMELINE = { ignite: 7.5, liftoff: 11, end: 38 };

// altitude = ACCEL * s^2 for ACCEL_PHASE seconds, then constant velocity
export const ACCEL = 0.07;
export const ACCEL_PHASE = 14;

export function altitudeAt(s) {
  if (s <= 0) return 0;
  return s <= ACCEL_PHASE
    ? ACCEL * s * s
    : ACCEL * ACCEL_PHASE * ACCEL_PHASE + 2 * ACCEL * ACCEL_PHASE * (s - ACCEL_PHASE);
}
export function speedAt(s) {
  if (s <= 0) return 0;
  return 2 * ACCEL * Math.min(s, ACCEL_PHASE);
}

// ---- Launch site frame (Earth centred at origin) ----
export const UP = new THREE.Vector3(0, 0.6, 0.8).normalize(); // surface normal at launch site
export const RIGHT = new THREE.Vector3(1, 0, 0);
export const TANGENT = new THREE.Vector3().crossVectors(RIGHT, UP).normalize();
export const LAUNCH_POINT = UP.clone().multiplyScalar(EARTH_RADIUS);

// ---- Sun ----
export const SUN_DIR = new THREE.Vector3(30, 18, 40).normalize();