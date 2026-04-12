import { useState, useCallback } from 'react';
import SpineCanvas from './SpineCanvas';
import './App.css';

export default function App() {
  const [animations, setAnimations] = useState([]);
  const [currentAnim, setCurrentAnim] = useState(null);

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
        />
      </div>

      {animations.length > 0 && (
        <div className="controls">
          <p className="label">애니메이션</p>
          <div className="anim-list">
            {animations.map((name) => (
              <button
                key={name}
                className={`anim-btn ${currentAnim === name ? 'active' : ''}`}
                onClick={() => setCurrentAnim(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
