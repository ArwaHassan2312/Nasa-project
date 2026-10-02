import SpaceBackground from '../components/space/SpaceBackground';
import LaunchScene from '../components/space/LaunchScene';

export default function LaunchPage() {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: '#000' }}>
      <SpaceBackground />
      <LaunchScene />
    </div>
  );
}