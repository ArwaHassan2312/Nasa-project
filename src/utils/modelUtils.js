import * as THREE from 'three';

/** Clone, centre and scale a model so its largest dimension equals 2*radius. */
export function prepareEarth(scene, radius) {
  const model = scene.clone(true);
  const holder = new THREE.Group();
  holder.add(model);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
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