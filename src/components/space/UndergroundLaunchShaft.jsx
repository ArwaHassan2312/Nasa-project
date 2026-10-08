
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { UP } from './launchConfig';

const RING_Y = [-2.55, -1.65, -0.75, 0.15, 1.05, 1.95, 2.82];
const DETAIL_Y = [-2.2, -1.1, 0, 1.1, 2.2];

/** Underground launch shaft extending from the chamber to the Earth's surface. */
export default function UndergroundLaunchShaft({ state }) {
  const orientation = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), UP),
    []
  );

  const shaftCenter = useMemo(
    () => UP.clone().multiplyScalar(6.5),
    []
  );

  const res = useMemo(() => {
    const shaftGeo = new THREE.CylinderGeometry(1.42, 1.42, 5.8, 36, 1, true);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: '#252b30',
      metalness: 0.68,
      roughness: 0.72,
      side: THREE.BackSide,
    });

    const ringGeo = new THREE.TorusGeometry(1.38, 0.045, 8, 36);
    const ringMat = new THREE.MeshStandardMaterial({
      color: '#4a5258',
      metalness: 0.82,
      roughness: 0.48,
    });

    const beamGeo = new THREE.BoxGeometry(0.12, 5.55, 0.12);
    const beamMat = new THREE.MeshStandardMaterial({
      color: '#515a60',
      metalness: 0.74,
      roughness: 0.5,
    });

    const detailGeo = new THREE.BoxGeometry(0.2, 0.045, 0.025);
    const detailMat = new THREE.MeshStandardMaterial({
      color: '#b27632',
      emissive: '#5a2a08',
      emissiveIntensity: 0.28,
      metalness: 0.35,
      roughness: 0.6,
    });

    const stripGeo = new THREE.BoxGeometry(0.035, 5.2, 0.025);
    const stripMat = new THREE.MeshBasicMaterial({ color: '#b96824' });

    return {
      shaftGeo, shaftMat, ringGeo, ringMat, beamGeo, beamMat, detailGeo, detailMat, stripGeo, stripMat,
    };
  }, []);

  useEffect(() => () => {
    res.shaftGeo.dispose();
    res.shaftMat.dispose();
    res.ringGeo.dispose();
    res.ringMat.dispose();
    res.beamGeo.dispose();
    res.beamMat.dispose();
    res.detailGeo.dispose();
    res.detailMat.dispose();
    res.stripGeo.dispose();
    res.stripMat.dispose();
  }, [res]);

  return (
    <group>
      <group
        position={shaftCenter}
        quaternion={orientation}
        visible={(state?.surfaceMix ?? 0) < 0.999}
      >
        {/* Open-ended steel and basalt-lined shaft */}
        <mesh geometry={res.shaftGeo} material={res.shaftMat} />

        {/* Shaft support rings */}
        {RING_Y.map((y) => (
          <mesh
            key={y}
            geometry={res.ringGeo}
            material={res.ringMat}
            position={[0, y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          />
        ))}

        {/* Vertical support beams */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 1.1, 0, 0]}>
            <mesh geometry={res.beamGeo} material={res.beamMat} />

            {/* Small illuminated support details */}
            {DETAIL_Y.map((y) => (
              <mesh
                key={y}
                geometry={res.detailGeo}
                material={res.detailMat}
                position={[0, y, 0.075]}
              />
            ))}
          </group>
        ))}

        {/* Dim guide strips */}
        {[-0.66, 0.66].map((x) => (
          <mesh
            key={x}
            geometry={res.stripGeo}
            material={res.stripMat}
            position={[x, 0, 1.18]}
          />
        ))}
      </group>
    </group>
  );
}
