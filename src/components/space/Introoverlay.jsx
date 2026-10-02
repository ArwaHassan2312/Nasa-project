import { useState } from 'react';
import NeonTypewriter from './NeonTypewriter';

const LINES = [
  'Every decision matters.',
  'Every resource counts.',
  'And the future of your outpost is in your hands.',
];

export default function IntroOverlay({ visible, ready = false, onStart }) {
  const [typed, setTyped] = useState(false);
  const showButton = ready && typed && visible;

  return (
    <div className={`intro-overlay ui-fade ${visible ? '' : 'ui-hidden'}`}>
      <div className="intro-title">
        {ready && <NeonTypewriter lines={LINES} startDelay={600} onDone={() => setTyped(true)} />}
      </div>

      <div className={`intro-action ui-fade ${showButton ? '' : 'ui-hidden'}`}>
        <div className="mission-btn-wrap">
          <span className="mission-btn-ring" />
          <button type="button" className="mission-btn" onClick={onStart} disabled={!showButton}>
            Start your mission
          </button>
        </div>
      </div>
    </div>
  );
}