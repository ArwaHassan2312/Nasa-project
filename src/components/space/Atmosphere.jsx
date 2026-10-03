import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EARTH_RADIUS, SUN_DIR } from './launchConfig';

const vert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWorldPos;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Outer halo: back faces of a larger sphere; fades to zero at its silhouette (no hard outline).
const haloFrag = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uSunDir; uniform float uIntensity;
  varying vec3 vN; varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = abs(dot(N, V));
    float g = pow(smoothstep(0.0, 0.42, d), 2.4);
    float lit = 0.12 + 0.88 * smoothstep(-0.25, 0.55, dot(N, uSunDir));
    gl_FragColor = vec4(uColor * g * lit * uIntensity, 1.0);
  }
`;

// Inner rim: thin fresnel tint on the limb of the planet.
const rimFrag = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uSunDir; uniform float uIntensity;
  varying vec3 vN; varying vec3 vWorldPos;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float f = 1.0 - max(dot(N, V), 0.0);
    float rim = pow(f, 4.0) * (1.0 - smoothstep(0.85, 1.0, f));
    float lit = 0.1 + 0.9 * smoothstep(-0.2, 0.5, dot(N, uSunDir));
    gl_FragColor = vec4(uColor * rim * lit * uIntensity, 1.0);
  }
`;

function makeMaterial(frag, side, intensity) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uColor: { value: new THREE.Color(0.28, 0.52, 1.0) },
      uSunDir: { value: SUN_DIR.clone() },
      uIntensity: { value: intensity },
    },
    side,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export default function Atmosphere({ state }) {
  const halo = useMemo(() => makeMaterial(haloFrag, THREE.BackSide, 0.55), []);
  const rim = useMemo(() => makeMaterial(rimFrag, THREE.FrontSide, 0.7), []);
  useFrame(() => {
    const reveal = state?.surfaceMix ?? 1;
    halo.uniforms.uIntensity.value = 0.55 * reveal;
    rim.uniforms.uIntensity.value = 0.7 * reveal;
  });
  useEffect(() => () => { halo.dispose(); rim.dispose(); }, [halo, rim]);

  return (
    <group renderOrder={2}>
      <mesh material={halo} renderOrder={2}>
        <sphereGeometry args={[EARTH_RADIUS * 1.1, 96, 64]} />
      </mesh>
      <mesh material={rim} renderOrder={2}>
        <sphereGeometry args={[EARTH_RADIUS * 1.015, 96, 64]} />
      </mesh>
    </group>
  );
}
