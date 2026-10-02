// import { useMemo } from 'react';
// import { useGLTF } from '@react-three/drei';
// import { useThree } from '@react-three/fiber';
// import { ASSETS, EARTH_RADIUS } from './launchConfig';
// import { prepareEarth } from '../../utils/modelUtils';

// export default function Earth() {
//   const { scene } = useGLTF(ASSETS.earth);
//   const gl = useThree((s) => s.gl);

//   const earth = useMemo(() => {
//     const obj = prepareEarth(scene, EARTH_RADIUS);
//     const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
//     obj.traverse((o) => {
//       if (o.isMesh && o.material) {
//         const mats = Array.isArray(o.material) ? o.material : [o.material];
//         mats.forEach((m) => {
//           ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].forEach((k) => {
//             if (m[k]) m[k].anisotropy = aniso;
//           });
//         });
//       }
//     });
//     return obj;
//   }, [scene, gl]);

//   return <primitive object={earth} />;
// }

// useGLTF.preload(ASSETS.earth);



import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ASSETS, EARTH_RADIUS, EARTH_ROTATION, EARTH_DEBUG, EARTH_EXCLUDE, EARTH_INCLUDE,
} from './launchConfig';
import { prepareEarth } from '../../utils/modelUtils';

export default function Earth() {
  const { scene } = useGLTF(ASSETS.earth);
  const gl = useThree((s) => s.gl);

  const earth = useMemo(() => {
    const obj = prepareEarth(scene, EARTH_RADIUS, {
      exclude: EARTH_EXCLUDE,
      include: EARTH_INCLUDE,
      autoShell: true,
      debug: EARTH_DEBUG,
    });
    obj.rotation.set(...EARTH_ROTATION);
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].forEach((k) => {
          if (m[k]) m[k].anisotropy = aniso;
        });
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        m.needsUpdate = true;
      });
    });
    return obj;
  }, [scene, gl]);

  return <primitive object={earth} />;
}

useGLTF.preload(ASSETS.earth);