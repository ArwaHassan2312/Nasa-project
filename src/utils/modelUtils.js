import * as THREE from 'three';

/** Clone, centre and scale a model so its largest dimension equals 2*radius. */
export function prepareEarth(scene, radius, opts = {}) {
  const { exclude = null, include = null, autoShell = false, debug = false } = opts;
  const model = scene.clone(true);
  model.updateMatrixWorld(true);

  const infos = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = b.getSize(new THREE.Vector3());
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    infos.push({
      mesh: o,
      name: o.name || '(unnamed)',
      maxDim: Math.max(s.x, s.y, s.z),
      verts: o.geometry?.attributes?.position?.count ?? 0,
      transparent: !!mat?.transparent,
    });
  });

  // reference = smallest "real" mesh (the planet body)
  const real = infos.filter((i) => i.verts >= 1000);
  const ref = real.length ? Math.min(...real.map((i) => i.maxDim)) : 0;

  infos.forEach((i) => {
    let keep = true;
    if (include) keep = include.includes(i.name);
    else if (exclude && exclude.test(i.name)) keep = false;
    else if (autoShell && ref > 0 && i.maxDim > ref * 1.6) keep = false;
    i.keep = keep;
    i.mesh.visible = keep;
  });

  if (debug) {
    console.table(
      infos.map(({ name, maxDim, verts, transparent, keep }) => ({
        name, size: +maxDim.toFixed(3), verts, transparent, keep,
      }))
    );
  }

  const box = new THREE.Box3();
  infos.filter((i) => i.keep).forEach((i) => box.expandByObject(i.mesh));
  if (box.isEmpty()) box.setFromObject(model); // safety net

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const holder = new THREE.Group();
  holder.add(model);
  model.position.sub(center);
  holder.scale.setScalar((radius * 2) / Math.max(size.x, size.y, size.z));
  return holder;
}

/**
 * Clone the rocket, rotate its longest axis to +Y (nose up), scale to `height`,
 * and put its base (engine end) at the local origin.
 */
export function prepareRocket(scene, height, flip = false) {
  const model = scene.clone(true);
  const holder = new THREE.Group();
  holder.add(model);

  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  let rx = 0, rz = 0;
  if (size.x > size.y && size.x >= size.z) rz = flip ? -Math.PI / 2 : Math.PI / 2;
  else if (size.z > size.y && size.z > size.x) rx = flip ? Math.PI / 2 : -Math.PI / 2;
  else if (flip) rx = Math.PI;
  holder.rotation.set(rx, 0, rz);
  holder.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(holder);
  const h = box.getSize(new THREE.Vector3()).y;
  holder.scale.setScalar(height / h);
  holder.updateMatrixWorld(true);

  box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.set(-c.x, -box.min.y, -c.z);

  const outer = new THREE.Group();
  outer.add(holder);
  return outer;
}