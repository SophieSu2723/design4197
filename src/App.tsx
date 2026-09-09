import React, { useState, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import PlanetCanvas from './components/PlanetCanvas';
import MapCanvas2D, { MapViewHandle } from './components/MapCanvas2D';
import { defaultPlanetSettings, PlanetSettings } from './types/planet';
import './App.css';

const App: React.FC = () => {
  const [settings, setSettings] = useState<PlanetSettings>(defaultPlanetSettings);
  const [view, setView] = useState<'3d' | 'map'>('3d');
  const [eroding, setEroding] = useState(false);
  const mapRef = useRef<MapViewHandle>(null);

  const handleMapAction = (action: 'load' | 'erode' | 'reset' | 'apply' | 'clear') => {
    if (action === 'apply' || action === 'clear') {
      setEroding(false);
      setView('3d');   // jump to the planet to see the result
      if (action === 'apply') {
        // The eroded map was generated FROM the stack, so it replaces it:
        // add it as a map layer and mute the layers it already bakes in.
        const snap = mapRef.current?.snapshot();
        if (!snap) return;
        setSettings((s) => ({ ...s, terrain: { ...s.terrain, enabled: true, soloLayerId: null, layers: [
          ...s.terrain.layers.filter((l) => l.type !== 'map').map((l) => ({ ...l, enabled: false })),
          { id: Date.now(), name: 'Eroded map', type: 'map' as const, enabled: true, intensity: 1, map: snap },
        ] } }));
      } else {
        setSettings((s) => ({ ...s, terrain: { ...s.terrain, soloLayerId: null, layers:
          s.terrain.layers.filter((l) => l.type !== 'map').map((l) => ({ ...l, enabled: true })) } }));
      }
      return;
    }
    setView('map');
    if (action === 'erode') { setEroding((e) => !e); return; }
    setEroding(false);
    const map = mapRef.current;
    if (!map) return;
    if (action === 'load') map.loadTopography();
    else map.reset();
  };

  return (
    <div className="app">
      <ControlPanel settings={settings} onSettingsChange={setSettings} onMapAction={handleMapAction} eroding={eroding} />

      <main className="canvas-area">
        <div className="canvas-toolbar">
          <span className="toolbar-title">Procedural World Builder</span>
          <div className="view-tabs">
            <button type="button" className={`view-tab ${view === '3d' ? 'active' : ''}`} onClick={() => setView('3d')}>3D</button>
            <button type="button" className={`view-tab ${view === 'map' ? 'active' : ''}`} onClick={() => setView('map')}>2D map</button>
          </div>
        </div>
        {/* Both views stay mounted so the WebGL scene and the eroded map survive tab switches */}
        <div className="canvas-viewport" style={{ display: view === '3d' ? undefined : 'none' }}>
          <PlanetCanvas settings={settings} />
        </div>
        <div className="canvas-viewport" style={{ display: view === 'map' ? undefined : 'none' }}>
          <MapCanvas2D ref={mapRef} settings={settings} eroding={eroding} />
        </div>
      </main>
    </div>
  );
};

export default App;
