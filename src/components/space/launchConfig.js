import * as THREE from 'three';
import backgroundUrl from '../../assets/images/1773008.png';
// import earthImageUrl from '../../assets/images/earth/download.jpg';
import introImageUrl from '../../assets/images/earth/EVER QUITE AND DANGEROUS PLACE.jpg';

// Files in /public are served from the site root (no "/public" prefix).
export const ASSETS = {
  earth: '/models/earth-00.glb',
  rocket: '/models/3d-white-rocket.glb',
  mars: '/models/24881_Mars_1_6792.glb',
  moon: '/models/moon.glb',
  background: backgroundUrl,
  // earthImage: earthImageUrl,
  introImage: introImageUrl,
};

// Scene units. The rocket is exaggerated vs. the real Earth, otherwise it would be sub-pixel.
export const EARTH_RADIUS = 10;
export const ROCKET_HEIGHT = 2.0;
export const ROCKET_FLIP = false;          // set true if the nose points down after load
export const PAD_SINK = 0;                 // set e.g. 0.03 if the rocket hovers slightly
export const EARTH_ROTATION = [0, 0, 0];   // euler radians; spin the globe to show a nicer region at the pad

// Timeline (seconds, counted from the moment the player clicks START)
export const TIMELINE = { ignite: 7.5, liftoff: 11, end: 38 };

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

// Launch-site frame (Earth centred at origin)
export const UP = new THREE.Vector3(0, 0.6, 0.8).normalize();
export const RIGHT = new THREE.Vector3(1, 0, 0);
export const TANGENT = new THREE.Vector3().crossVectors(RIGHT, UP).normalize();
export const LAUNCH_POINT = UP.clone().multiplyScalar(EARTH_RADIUS - PAD_SINK);

export const SUN_DIR = new THREE.Vector3(30, 18, 40).normalize();

// Earth model cleanup
export const EARTH_DEBUG = true;                       // prints a mesh table in the browser console
export const EARTH_EXCLUDE = /atmos|glow|halo|sky|star|ring|orbit/i; // mesh names to hide
export const EARTH_INCLUDE = null;                     // e.g. ['Sphere'] = keep ONLY these meshes