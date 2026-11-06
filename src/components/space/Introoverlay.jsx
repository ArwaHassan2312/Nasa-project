import { useEffect, useState } from 'react';
import NeonTypewriter from './NeonTypewriter';

const FINAL_LINES = ['A new world to explore. Your space adventure starts here.'];

export default function IntroOverlay({ visible, finished = false, onStart, onSkip }) {
  const [textVisible, setTextVisible] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);

  useEffect(() => {
    if (!finished) return undefined;

    const textFrame = requestAnimationFrame(() => {
      setTextVisible(true);
    });

    return () => {
      cancelAnimationFrame(textFrame);
    };
  }, [finished]);

  const handleTextDone = () => {
    setButtonVisible(true);
  };

  const showButton = finished && buttonVisible && visible;

  return (
    <div className={`intro-overlay ui-fade ${visible ? '' : 'ui-hidden'} ${finished ? 'intro-overlay--finished' : ''}`}>
      {!finished && <button type="button" className="intro-skip" onClick={onSkip}>Skip intro</button>}
      <div className={`intro-title intro-final-title ui-fade ${finished && textVisible ? '' : 'ui-hidden'}`}>
        {finished && <NeonTypewriter lines={FINAL_LINES} startDelay={350} speed={11} lineDelay={110} punctDelay={50} onDone={handleTextDone} />}
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
