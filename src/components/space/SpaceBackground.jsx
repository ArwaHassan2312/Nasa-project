import { ASSETS } from './launchConfig';

export default function SpaceBackground({ src = ASSETS.background }) {
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 0,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'brightness(0.8)',
      }}
    />
  );
}