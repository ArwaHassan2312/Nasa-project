import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { EARTH_RADIUS, EARTH_ROTATION } from './launchConfig';

const EARTH_TEXTURES = [
  '/Textures/8k_earth_daymap.jpg',
  '/Textures/8k_earth_nightmap.jpg',
  '/Textures/8k_earth_clouds.jpg',
  '/Textures/8k_earth_specular.jpeg',
];

export default function Earth() {
  const [dayMap, nightMap, cloudMap, specularMap] = useTexture(EARTH_TEXTURES);

  const { surfaceMaterial, cloudMaterial } = useMemo(() => {
    dayMap.colorSpace = THREE.SRGBColorSpace;
    nightMap.colorSpace = THREE.SRGBColorSpace;
    cloudMap.colorSpace = THREE.SRGBColorSpace;
    specularMap.colorSpace = THREE.NoColorSpace;

    for (const texture of [dayMap, nightMap, cloudMap, specularMap]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.anisotropy = 8;
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
  }, [dayMap, nightMap, cloudMap, specularMap]);

  useEffect(() => () => {
    surfaceMaterial.dispose();
    cloudMaterial.dispose();
  }, [surfaceMaterial, cloudMaterial]);

  return (
    <group rotation={EARTH_ROTATION}>
      <mesh material={surfaceMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 96]} />
      </mesh>
      <mesh material={cloudMaterial} scale={1.003} renderOrder={1}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 96]} />
      </mesh>
    </group>
  );
}
