import * as THREE from 'three';

// Top-surface collision height field for the lunar outpost.
//
// Every triangle of the outpost meshes is rasterized into a grid of "column
// tops". Walking rules on top of that grid:
//   - a column whose top is more than COLLIDE_STEP_HEIGHT above the walker's
//     feet is a solid wall — components become physical, you cannot walk
//     through them;
//   - anything a step can reach is climbable ground — ramps, low decks and
//     stair-like geometry are walked up and down naturally.
//
// The same rasterizer feeds both blocking and the ground support height, so
// the walker always stands exactly on what is drawn.

export const COLLIDE_CELL = 0.4; // grid resolution in world units
export const COLLIDE_STEP_HEIGHT = 0.8; // tallest rise the walker can climb
export const COLLIDE_PLAYER_RADIUS = 0.35; // blocking test stencil radius

export function buildOutpostHeightField(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return null;

  const minX = bounds.min.x - 1;
  const minZ = bounds.min.z - 1;
  const cols = Math.ceil((bounds.max.x - minX + 1) / COLLIDE_CELL) + 1;
  const rows = Math.ceil((bounds.max.z - minZ + 1) / COLLIDE_CELL) + 1;
  const tops = new Float32Array(cols * rows).fill(-Infinity);

  root.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.traverse(object => {
    if (!object.isMesh || !object.geometry) return;
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    const index = object.geometry.getIndex();
    const matrix = object.matrixWorld;
    const count = index ? index.count : position.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const i1 = index ? index.getX(t + 1) : t + 1;
      const i2 = index ? index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(matrix);
      b.fromBufferAttribute(position, i1).applyMatrix4(matrix);
      c.fromBufferAttribute(position, i2).applyMatrix4(matrix);
      rasterizeTriangle(tops, cols, rows, minX, minZ, a, b, c);
    }
  });

  return { minX, minZ, cols, rows, tops };
}

function rasterizeTriangle(tops, cols, rows, minX, minZ, a, b, c) {
  // A vertical face walls off its cell but contributes no walkable top.
  const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  if (Math.abs(ny) < 1e-9) return;
  const denom = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(denom) < 1e-12) return;

  const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - minX) / COLLIDE_CELL));
  const i1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x, c.x) - minX) / COLLIDE_CELL));
  const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - minZ) / COLLIDE_CELL));
  const j1 = Math.min(rows - 1, Math.ceil((Math.max(a.z, b.z, c.z) - minZ) / COLLIDE_CELL));

  for (let j = j0; j <= j1; j++) {
    const pz = minZ + j * COLLIDE_CELL;
    for (let i = i0; i <= i1; i++) {
      const px = minX + i * COLLIDE_CELL;
      const w0 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / denom;
      if (w0 < -1e-6) continue;
      const w1 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / denom;
      if (w1 < -1e-6) continue;
      const w2 = 1 - w0 - w1;
      if (w2 < -1e-6) continue;
      const y = w0 * a.y + w1 * b.y + w2 * c.y;
      const k = j * cols + i;
      if (y > tops[k]) tops[k] = y;
    }
  }
}

// Top of the outpost surface at (x, z), or null when outside / no geometry.
export function sampleOutpostTop(field, x, z) {
  if (!field) return null;
  const i = Math.round((x - field.minX) / COLLIDE_CELL);
  const j = Math.round((z - field.minZ) / COLLIDE_CELL);
  if (i < 0 || j < 0 || i >= field.cols || j >= field.rows) return null;
  const v = field.tops[j * field.cols + i];
  return Number.isFinite(v) ? v : null;
}

// A column blocks the walker when it rises more than a step above where the
// walker stands. The stencil points keep the walker's body out of side walls,
// but they are measured against the surface at the destination — a slope
// rising ahead underfoot is climbable ground, not a wall.
export function isOutpostBlocked(field, x, z, feetY, radius = COLLIDE_PLAYER_RADIUS) {
  const centerTop = sampleOutpostTop(field, x, z);
  if (centerTop !== null && centerTop - feetY > COLLIDE_STEP_HEIGHT) return true;
  if (radius <= 0) return false;
  const reference = centerTop !== null && centerTop > feetY ? centerTop : feetY;
  return isColumnBlocked(field, x + radius, z, reference)
    || isColumnBlocked(field, x - radius, z, reference)
    || isColumnBlocked(field, x, z + radius, reference)
    || isColumnBlocked(field, x, z - radius, reference);
}

function isColumnBlocked(field, x, z, referenceY) {
  const top = sampleOutpostTop(field, x, z);
  return top !== null && top - referenceY > COLLIDE_STEP_HEIGHT;
}
