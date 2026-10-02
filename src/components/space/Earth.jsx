import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { ASSETS, EARTH_RADIUS } from './launchConfig';
import { prepareEarth } from '../../utils/modelUtils';

export default function Earth() {
  const { scene } = useGLTF(ASSETS.earth);
  const gl = useThree((s) => s.gl);

  const earth = useMemo(() => {
    const obj = prepareEarth(scene, EARTH_RADIUS);
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy());
    obj.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          ['map', 'normalMap', 'roughnessMap', 'emissiveMap'].forEach((k) => {
            if (m[k]) m[k].anisotropy = aniso;
          });
        });
      }
    });
    return obj;
  }, [scene, gl]);

  return <primitive object={earth} />;
}

useGLTF.preload(ASSETS.earth);