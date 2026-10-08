import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ASSETS, EARTH_RADIUS, EARTH_ROTATION, EARTH_DEBUG, EARTH_EXCLUDE, EARTH_INCLUDE,
} from './launchConfig';
import { prepareEarth } from '../../utils/modelUtils';

export default function Earth({ state }) {
  const { scene } = useGLTF(ASSETS.earth);
  const gl = useThree((s) => s.gl);

  const earth = useMemo(() => {
    const obj = prepareEarth(scene, EARTH_RADIUS, {
      exclude: EARTH_EXCLUDE,
      include: EARTH_INCLUDE,
      autoShell: false,
      fitToBody: false,            // NEW
      debug: EARTH_DEBUG,
    });
    obj.rotation.set(...EARTH_ROTATION);
    const fadeMaterials = [];
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const sourceMats = Array.isArray(o.material) ? o.material : [o.material];
      const mats = sourceMats.map((material) => {
        const materialClone = material.clone();
        fadeMaterials.push({ material: materialClone, opacity: materialClone.opacity });
        return materialClone;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
      mats.forEach((m) => {
        ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].forEach((k) => {
          if (m[k]) m[k].anisotropy = aniso;
        });
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;   // NEW
        // glTF defaults metallicFactor to 1; with no env map that renders a black planet
        if (m.isMeshStandardMaterial && !m.metalnessMap && m.metalness > 0.1) m.metalness = 0; // NEW
        m.needsUpdate = true;
      });
    });
    obj.userData.fadeMaterials = fadeMaterials;
    return obj;
  }, [scene, gl]);

  let lastReveal = -1;
  useFrame(() => {
    const reveal = state?.surfaceMix ?? 1;
    if (Math.abs(reveal - lastReveal) < 0.001) return;
    lastReveal = reveal;

    earth.visible = reveal > 0.005;
    if (!earth.visible) return;

    const fading = reveal < 0.995;
    const fadeMaterials = earth.userData.fadeMaterials;
    for (let i = 0; i < fadeMaterials.length; i++) {
      const item = fadeMaterials[i];
      const mat = item.material;
      if (mat.transparent !== fading) {
        mat.transparent = fading;
        mat.depthWrite = !fading;
        mat.needsUpdate = true;
      }
      mat.opacity = item.opacity * reveal;
    }
  });

  useEffect(() => () => {
    earth.userData.fadeMaterials?.forEach(({ material }) => material.dispose());
  }, [earth]);

  return <primitive object={earth} />;
}

useGLTF.preload(ASSETS.earth);
