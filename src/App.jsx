import { useState, useCallback } from 'react';
import SpineCanvas from './SpineCanvas';
import './App.css';

const CHARACTERS = [
  { label: 'ErpinRoyale', json: '/ErpinRoyale/ErpinRoyale.json', atlas: '/ErpinRoyale/ErpinRoyale.atlas' },
  { label: 'Magician',    json: '/Magician/Magician.json',       atlas: '/Magician/Magician.atlas'       },
];

const DEBUG_ITEMS = [
  { key: 'bones',          label: 'Bones' },
  { key: 'regions',        label: 'Regions' },
  { key: 'meshHull',       label: 'Mesh Hull' },
  { key: 'meshTriangles',  label: 'Mesh Triangles' },
  { key: 'boundingBoxes',  label: 'Bounding Boxes' },
  { key: 'paths',          label: 'Paths' },
  { key: 'points',         label: 'Points' },
  { key: 'clipping',       label: 'Clipping' },
];

const DEFAULT_DEBUG = {
  bones: false, regions: false, meshHull: false, meshTriangles: false,
  boundingBoxes: false, paths: false, points: false, clipping: false,
};

export default function App() {
  const [charIndex, setCharIndex] = useState(0);
  const [animations, setAnimations] = useState([]);
  const [currentAnim, setCurrentAnim] = useState(null);
  const [debugOptions, setDebugOptions] = useState(DEFAULT_DEBUG);

  const handleAnimationsLoaded = useCallback((names) => {
    setAnimations(names);
    setCurrentAnim(names[0] ?? null);
  }, []);

  const toggleDebug = useCallback((key) => {
    setDebugOptions(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const char = CHARACTERS[charIndex];

  return (
    <div className="app">
      <h1 className="title">{char.label}</h1>

      <div className="viewer">
        <SpineCanvas
          jsonUrl={char.json}
          atlasUrl={char.atlas}
          animation={currentAnim}
          scale={0.4}
          onAnimationsLoaded={handleAnimationsLoaded}
          debugOptions={debugOptions}
        />
      </div>

      {animations.length > 0 && (
        <div className="controls">
          <div className="control-row">
            <div className="control-group">
              <p className="label">캐릭터</p>
              <select
                className="anim-select"
                value={charIndex}
                onChange={(e) => setCharIndex(Number(e.target.value))}
              >
                {CHARACTERS.map((c, i) => (
                  <option key={c.label} value={i}>{c.label}</option>
                ))}
              </select>
            </div>

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
              <div className="debug-list">
                {DEBUG_ITEMS.map(({ key, label }) => (
                  <label key={key} className="debug-toggle">
                    <input
                      type="checkbox"
                      checked={debugOptions[key]}
                      onChange={() => toggleDebug(key)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
