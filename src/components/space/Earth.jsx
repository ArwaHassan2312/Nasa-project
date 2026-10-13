import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getDownscaledTexture } from '../../utils/textureUtils';
import { EARTH_RADIUS, EARTH_ROTATION } from './launchConfig';

const EARTH_TEXTURES = [
  { path: '/Textures/8k_earth_daymap.jpg', colorSpace: THREE.SRGBColorSpace, budget: 4096 },
  { path: '/Textures/8k_earth_nightmap.jpg', colorSpace: THREE.SRGBColorSpace, budget: 4096 },
  { path: '/Textures/8k_earth_clouds.jpg', colorSpace: THREE.SRGBColorSpace, budget: 2048 },
  { path: '/Textures/8k_earth_specular.jpeg', colorSpace: THREE.NoColorSpace, budget: 2048 },
];

export default function Earth() {
  const [textures, setTextures] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(EARTH_TEXTURES.map(entry => getDownscaledTexture(entry.path, entry.budget, entry.colorSpace)))
      .then(maps => { if (!cancelled) setTextures(maps); })
      .catch(error => console.warn('Could not load Earth textures.', error));
    return () => { cancelled = true; };
  }, []);

  const { surfaceMaterial, cloudMaterial } = useMemo(() => {
    if (!textures) return {};
    const [dayMap, nightMap, cloudMap, specularMap] = textures;

    for (const texture of textures) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
    }

    return {
      surfaceMaterial: new THREE.MeshPhongMaterial({
        map: dayMap,
        emissiveMap: nightMap,
        emissive: new THREE.Color(0xffc777),
        emissiveIntensity: 0.7,
        specularMap,
        specular: new THREE.Color(0x454545),
        shininess: 18,
      }),
      cloudMaterial: new THREE.MeshPhongMaterial({
        map: cloudMap,
        alphaMap: cloudMap,
        color: 0xffffff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        specular: new THREE.Color(0x111111),
        shininess: 8,
      }),
    };
  }, [textures]);

  useEffect(() => () => {
    surfaceMaterial?.dispose();
    cloudMaterial?.dispose();
  }, [surfaceMaterial, cloudMaterial]);

  if (!surfaceMaterial) return null;

  return (
    <group rotation={EARTH_ROTATION}>
      <mesh material={surfaceMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 64]} />
      </mesh>
      <mesh material={cloudMaterial} scale={1.003} renderOrder={1}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 64]} />
      </mesh>
    </group>
  );
}
