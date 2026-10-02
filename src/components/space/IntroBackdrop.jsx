import { ASSETS } from './launchConfig';

/** Full-screen intro image. Sits above the 3D canvas and cross-fades away on start. */
export default function IntroBackdrop({ visible }) {
  return (
    <img
      src={ASSETS.introImage}
      alt=""
      draggable={false}
      className={`intro-backdrop ${visible ? '' : 'intro-backdrop--gone'}`}
    />
  );
}