import { forwardRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { ASSETS, ROCKET_HEIGHT, ROCKET_FLIP, LAUNCH_POINT } from './launchConfig';
import { prepareRocket } from '../../utils/modelUtils';

/** Group origin = base of the rocket (engine end). Animate this group via ref. */
const Rocket = forwardRef(function Rocket(
  { height = ROCKET_HEIGHT, flip = ROCKET_FLIP },
  ref
) {
  const { scene } = useGLTF(ASSETS.rocket);
  const model = useMemo(() => prepareRocket(scene, height, flip), [scene, height, flip]);

  return (
    <group ref={ref} position={LAUNCH_POINT}>
      <primitive object={model} />
    </group>
  );
});

export default Rocket;

useGLTF.preload(ASSETS.rocket);