import * as THREE from 'three';

/** Clone, centre and scale a model so its largest dimension equals 2*radius. */
export function prepareEarth(scene, radius, opts = {}) {
  const {
    exclude = null, include = null, autoShell = false, debug = false, fitToBody = false,
  } = opts;
  const model = scene.clone(true);
  model.updateMatrixWorld(true);

  const infos = [];
  model.traverse((o) => {
    if (fitToBody && o.isLight) { o.visible = false; return; } // lights baked into the GLB
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const s = b.getSize(new THREE.Vector3());
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    infos.push({
      mesh: o,
      name: o.name || '(unnamed)',
      maxDim: Math.max(s.x, s.y, s.z),
      minDim: Math.min(s.x, s.y, s.z),
      verts: o.geometry?.attributes?.position?.count ?? 0,
      transparent: !!mat?.transparent,
    });
  });

  // planet body = roughly spherical, detailed mesh (opaque preferred).
  // Shells (clouds/atmosphere) share the planet's detail but are larger,
  // so among the detailed spheres we take the SMALLEST one.
  let body = null;
  if (fitToBody) {
    const allowed = (i) => (include ? include.includes(i.name) : !(exclude && exclude.test(i.name)));
    const pool = infos.filter(
      (i) => i.verts >= 1000 && i.maxDim > 0 && i.minDim / i.maxDim >= 0.5 && allowed(i)
    );
    const opaque = pool.filter((i) => !i.transparent);
    const cand = opaque.length ? opaque : pool;
    if (cand.length) {
      const maxV = Math.max(...cand.map((i) => i.verts));
      const detailed = cand.filter((i) => i.verts >= maxV * 0.5);
      body = detailed.reduce((a, b) => (b.maxDim < a.maxDim ? b : a));
    }
  }

  // reference = the planet body (or, as before, the smallest "real" mesh)
  const real = infos.filter((i) => i.verts >= 1000);
  const ref = body ? body.maxDim : real.length ? Math.min(...real.map((i) => i.maxDim)) : 0;

  infos.forEach((i) => {
    let keep = true;
    if (include) keep = include.includes(i.name);
    else if (exclude && exclude.test(i.name)) keep = false;
    else if (autoShell && ref > 0 && i.maxDim > ref * 1.6) keep = false;
    if (body && i === body) keep = true;
    i.keep = keep;
    i.mesh.visible = keep;
  });

  // any remaining outer shell must not hide the planet: make it see-through, no depth write
  if (body) {
    infos.forEach((i) => {
      if (!i.keep || i === body || i.maxDim <= body.maxDim * 1.002) return;
      const mats = Array.isArray(i.mesh.material) ? i.mesh.material : [i.mesh.material];
      mats.forEach((m) => { m.transparent = true; m.depthWrite = false; m.needsUpdate = true; });
      i.mesh.renderOrder = 1;
    });
  }

  if (debug) {
    console.table(
      infos.map(({ name, maxDim, verts, transparent, keep }) => ({
        name, size: +maxDim.toFixed(3), verts, transparent, keep, body: body ? name === body.name : false,
      }))
    );
  }

  let size, center;
  if (body) {
    const b = new THREE.Box3().setFromObject(body.mesh);
    size = b.getSize(new THREE.Vector3());
    center = b.getCenter(new THREE.Vector3());
  } else {
    const box = new THREE.Box3();
    infos.filter((i) => i.keep).forEach((i) => box.expandByObject(i.mesh));
    if (box.isEmpty()) box.setFromObject(model); // safety net
    size = box.getSize(new THREE.Vector3());
    center = box.getCenter(new THREE.Vector3());
  }

  const holder = new THREE.Group();
  holder.add(model);
  model.position.sub(center);

  const d = radius * 2;
  const mx = Math.max(size.x, size.y, size.z);
  if (body && Math.min(size.x, size.y, size.z) / mx < 0.97) {
    // stretched body (non-uniform scale baked into the file): make it a true sphere
    holder.scale.set(d / size.x, d / size.y, d / size.z);
  } else {
    holder.scale.setScalar(d / mx);
  }
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