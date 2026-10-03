
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_RADIUS, UP } from './launchConfig';

/** Underground launch shaft extending from the chamber to the Earth's surface. */
export default function UndergroundLaunchShaft({ state }) {
  const orientation = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        UP
      ),
    []
  );

  const shaftCenter = useMemo(
    () => UP.clone().multiplyScalar(6.5),
    []
  );

  return (
    <group>
      <group
        position={shaftCenter}
        quaternion={orientation}
        visible={(state?.surfaceMix ?? 0) < 0.999}
      >
        {/* Open-ended steel and basalt-lined shaft */}
        <mesh>
          <cylinderGeometry args={[1.42, 1.42, 5.8, 48, 1, true]} />
          <meshStandardMaterial
            color="#252b30"
            metalness={0.68}
            roughness={0.72}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Shaft support rings */}
        {[-2.55, -1.65, -0.75, 0.15, 1.05, 1.95, 2.82].map((y) => (
          <mesh
            key={y}
            position={[0, y, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[1.38, 0.045, 8, 48]} />
            <meshStandardMaterial
              color="#4a5258"
              metalness={0.82}
              roughness={0.48}
            />
          </mesh>
        ))}

        {/* Vertical support beams */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 1.1, 0, 0]}>
            <mesh>
              <boxGeometry args={[0.12, 5.55, 0.12]} />
              <meshStandardMaterial
                color="#515a60"
                metalness={0.74}
                roughness={0.5}
              />
            </mesh>

            {/* Small illuminated support details */}
            {[-2.2, -1.1, 0, 1.1, 2.2].map((y) => (
              <mesh key={y} position={[0, y, 0.075]}>
                <boxGeometry args={[0.2, 0.045, 0.025]} />
                <meshStandardMaterial
                  color="#b27632"
                  emissive="#5a2a08"
                  emissiveIntensity={0.28}
                  metalness={0.35}
                  roughness={0.6}
                />
              </mesh>
            ))}
          </group>
        ))}

        {/* Dim guide strips */}
        {[-0.66, 0.66].map((x) => (
          <mesh key={x} position={[x, 0, 1.18]}>
            <boxGeometry args={[0.035, 5.2, 0.025]} />
            <meshBasicMaterial color="#b96824" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
