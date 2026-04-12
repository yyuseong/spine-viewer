import { useState, useCallback } from 'react';
import SpineCanvas from './SpineCanvas';
import './App.css';

export default function App() {
  const [animations, setAnimations] = useState([]);
  const [currentAnim, setCurrentAnim] = useState(null);
  const [debugBones, setDebugBones] = useState(false);

  const handleAnimationsLoaded = useCallback((names) => {
    setAnimations(names);
    setCurrentAnim(names[0] ?? null);
  }, []);

  return (
    <div className="app">
      <h1 className="title">ErpinRoyale</h1>

      <div className="viewer">
        <SpineCanvas
          jsonUrl="/ErpinRoyale.json"
          atlasUrl="/ErpinRoyale.atlas"
          animation={currentAnim}
          scale={0.4}
          onAnimationsLoaded={handleAnimationsLoaded}
          debugBones={debugBones}
        />
      </div>

      {animations.length > 0 && (
        <div className="controls">
          <div className="control-row">
            <div className="control-group">
              <p className="label">애니메이션</p>
              <select
                className="anim-select"
                value={currentAnim ?? ''}
                onChange={(e) => setCurrentAnim(e.target.value)}
              >
                {animations.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <p className="label">디버그</p>
              <label className="debug-toggle">
                <input
                  type="checkbox"
                  checked={debugBones}
                  onChange={(e) => setDebugBones(e.target.checked)}
                />
                <span>Bones</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
