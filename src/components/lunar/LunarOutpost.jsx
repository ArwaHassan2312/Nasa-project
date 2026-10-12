import { useEffect, useRef, useState } from 'react';
import { createLunarEngine } from './lunarOutpostEngine';
import './LunarOutpost.css';

export default function LunarOutpost({ onExitToOrbit }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [cameraMode, setCameraMode] = useState('free');
  const [prompt, setPrompt] = useState({ type: null, data: null });
  const [insidePanel, setInsidePanel] = useState({
    visible: false,
    label: '',
    buttonText: ''
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'lunar-canvas';
    containerRef.current.prepend(canvas);

    const engine = createLunarEngine(canvas, {
      onLoading: (state) => setIsLoading(state.active),
      onModeChange: (mode) => setCameraMode(mode),
      onPromptChange: (type, data) => setPrompt({ type, data }),
      onInsidePanelChange: (panel) => setInsidePanel(panel)
    });

    engineRef.current = engine;

    return () => {
      engine?.destroy?.();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  return (
    <div className="lunar-root" ref={containerRef}>
      <div className="lunar-grain" />
      <div className="lunar-shade" />

      {/* Simple Loading Indicator */}
      {isLoading && (
        <div className="lunar-simple-loader">
          <div className="lunar-simple-spinner" />
          <span>LOADING LUNAR OUTPOST...</span>
        </div>
      )}

      {/* Crosshair in First Person */}
      {cameraMode !== 'free' && !insidePanel.visible && !prompt.type && (
        <div className="lunar-crosshair" />
      )}

      {/* Clean HUD: Mission Control & Camera Mode Toggle */}
      <div className="lunar-hud-clean">
        {onExitToOrbit && (
          <button
            type="button"
            className="lunar-orbit-btn"
            onClick={onExitToOrbit}
            title="Return to Mission Control"
          >
            <span>←</span> MISSION CONTROL
          </button>
        )}

        <div className="lunar-actions-group">
          {insidePanel.visible ? (
            <div className="lunar-inside-panel">
              <span>{insidePanel.label}</span>
              <button
                type="button"
                onClick={() => engineRef.current?.exitAirlock()}
              >
                {insidePanel.buttonText || 'EXIT'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`lunar-btn ${cameraMode === 'first-person' ? 'active' : ''}`}
              onClick={() => engineRef.current?.toggleCameraMode()}
            >
              {cameraMode === 'free' ? 'FIRST PERSON' : 'FREE CAMERA'}
            </button>
          )}
        </div>
      </div>

      {/* Interactive Modal Prompts */}
      {prompt.type === 'airlock' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="airlock-title">
          <div className="lunar-modal-kicker">HABITAT ACCESS</div>
          <h2 id="airlock-title">{prompt.data?.title || 'Enter the airlock?'}</h2>
          <p>{prompt.data?.message || 'You are at the habitat entrance.'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.enterAirlock()}
            >
              YES · ENTER
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.dismissAirlock()}
            >
              NO · STAY OUTSIDE
            </button>
          </div>
          <div className="lunar-modal-hint">Press E to enter · Esc to dismiss</div>
        </div>
      )}

      {prompt.type === 'airlockEnd' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="airlock-end-title">
          <div className="lunar-modal-kicker">AIRLOCK TRANSIT</div>
          <h2 id="airlock-end-title">{prompt.data?.title || 'Choose a direction'}</h2>
          <p>{prompt.data?.message || 'Choose a side: the greenhouse or the workshop.'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.enterGreenhouse()}
            >
              LEFT · GREENHOUSE
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.enterWorkshop()}
            >
              RIGHT · WORKSHOP
            </button>
          </div>
          <div className="lunar-modal-hint">A or ← for greenhouse · D or → for workshop</div>
        </div>
      )}

      {prompt.type === 'greenhouseDoor' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="greenhouse-door-title">
          <div className="lunar-modal-kicker">GREENHOUSE EXIT</div>
          <h2 id="greenhouse-door-title">{prompt.data?.title || 'Return to the airlock?'}</h2>
          <p>{prompt.data?.message || 'You are at the greenhouse door. Leave the crop bay and go back to the airlock?'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.leaveGreenhouse()}
            >
              YES · AIRLOCK
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.stayGreenhouse()}
            >
              NO · STAY HERE
            </button>
          </div>
          <div className="lunar-modal-hint">Press E to return · Esc to stay</div>
        </div>
      )}

      {prompt.type === 'component' && (
        <div className="lunar-modal" role="dialog" aria-labelledby="component-title">
          <div className="lunar-modal-kicker">OUTPOST MODULE</div>
          <h2 id="component-title">{prompt.data?.title || 'Enter this module?'}</h2>
          <p>{prompt.data?.message || 'You are close to an outpost component.'}</p>
          <div className="lunar-modal-actions">
            <button
              type="button"
              className="lunar-action-primary"
              onClick={() => engineRef.current?.enterNearbyComponent()}
            >
              YES · ENTER
            </button>
            <button
              type="button"
              className="lunar-action-secondary"
              onClick={() => engineRef.current?.dismissComponent()}
            >
              NO · STAY OUTSIDE
            </button>
          </div>
          <div className="lunar-modal-hint">Press E to enter · Esc to dismiss</div>
        </div>
      )}
    </div>
  );
}
