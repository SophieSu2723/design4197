import React, { useState } from 'react';
import { PlanetSettings, NoiseLayer, NoiseType, ShaderStyle, TerrainColorMode, ColorStop, TerrainLayer } from '../types/planet';
import './ControlPanel.css';

type SectionId = 'shape' | 'layers' | 'terrain' | 'ocean' | 'erosion' | 'atmosphere' | 'biomes' | 'shaders';

interface Props {
  settings: PlanetSettings;
  onSettingsChange: (settings: PlanetSettings) => void;
  onMapAction: (action: 'load' | 'erode' | 'reset' | 'apply' | 'clear') => void;
  eroding: boolean;   // erosion animation currently running
}

const RESOLUTIONS = [8, 16, 32, 64, 128, 256, 512, 1024, 2048] as const;
const NOISE_TYPES: NoiseType[] = ['perlin', 'ridged', 'warp'];
const SHADER_STYLES: ShaderStyle[] = ['standard-lit', 'unlit'];
const COLOR_MODES: TerrainColorMode[] = ['solid', 'gradient', 'stepped'];
const MAX_STOPS = 5;

interface LayerControlsProps {
  layer: NoiseLayer;
  onChange: (patch: Partial<NoiseLayer>) => void;
}

const LayerControls: React.FC<LayerControlsProps> = ({ layer, onChange }) => (
  <div className="layer-controls">
    <div className="ctrl-btn-group">
      {NOISE_TYPES.map((t) => (
        <button key={t} type="button"
          className={`ctrl-seg-btn ${layer.noiseType === t ? 'active' : ''}`}
          onClick={() => onChange({ noiseType: t })}>{t}</button>
      ))}
    </div>
    <label className="ctrl-row" title="Noise frequency — higher makes smaller, more frequent features"><span className="ctrl-label">Scale</span><span className="ctrl-value">{layer.scale.toFixed(1)}</span></label>
    <input type="range" className="ctrl-slider" min={0.2} max={10.0} step={0.1} value={layer.scale} onChange={(e) => onChange({ scale: parseFloat(e.target.value) })} />
    <label className="ctrl-row" title="Stacked layers of noise — more octaves add finer detail"><span className="ctrl-label">Octaves</span><span className="ctrl-value">{layer.octaves}</span></label>
    <input type="range" className="ctrl-slider" min={1} max={8} step={1} value={layer.octaves} onChange={(e) => onChange({ octaves: parseInt(e.target.value, 10) })} />
    <label className="ctrl-row" title="Amplitude falloff per octave — higher keeps fine detail strong (rougher terrain)"><span className="ctrl-label">Persistence</span><span className="ctrl-value">{layer.persistence.toFixed(2)}</span></label>
    <input type="range" className="ctrl-slider" min={0.1} max={1.0} step={0.05} value={layer.persistence} onChange={(e) => onChange({ persistence: parseFloat(e.target.value) })} />
    <label className="ctrl-row" title="Frequency multiplier per octave — higher spreads detail across more scales"><span className="ctrl-label">Lacunarity</span><span className="ctrl-value">{layer.lacunarity.toFixed(1)}</span></label>
    <input type="range" className="ctrl-slider" min={1.0} max={4.0} step={0.1} value={layer.lacunarity} onChange={(e) => onChange({ lacunarity: parseFloat(e.target.value) })} />
  </div>
);

const ControlPanel: React.FC<Props> = ({ settings, onSettingsChange, onMapAction, eroding }) => {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    shape: true, layers: false, terrain: false, ocean: false, erosion: false, atmosphere: false, biomes: false, shaders: false,
  });

  const toggle = (id: SectionId) => setOpenSections((p) => ({ ...p, [id]: !p[id] }));

  const set = <K extends keyof PlanetSettings>(key: K) =>
    (patch: Partial<PlanetSettings[K]>) =>
      onSettingsChange({ ...settings, [key]: { ...(settings[key] as object), ...patch } });

  const setShape    = set('shape');
  const setTerrain  = set('terrain');
  const setOcean    = set('ocean');
  const setShaders  = set('shaders');
  const setErosion  = set('erosion');
  const setAtmo     = set('atmosphere');
  const setBiomes   = set('biomes');
  const terrainLayers = settings.terrain.layers;
  const updateLayer = (id: number, patch: Partial<TerrainLayer>) =>
    setTerrain({ layers: terrainLayers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLayer = (id: number) =>
    setTerrain({
      layers: terrainLayers.filter((l) => l.id !== id),
      soloLayerId: settings.terrain.soloLayerId === id ? null : settings.terrain.soloLayerId,
    });
  const toggleSolo = (id: number) =>
    setTerrain({ soloLayerId: settings.terrain.soloLayerId === id ? null : id });
  const addNoiseLayer = () =>
    setTerrain({ layers: [...terrainLayers, {
      id: Date.now(),
      name: `Noise ${terrainLayers.filter((l) => l.type === 'noise').length + 1}`,
      type: 'noise', enabled: true, intensity: 0.5,
      noise: { noiseType: 'perlin', scale: 2.0, octaves: 4, persistence: 0.5, lacunarity: 2.0 },
    }] });

  const ramp = settings.shaders.ramp;
  const updateStop = (i: number, patch: Partial<ColorStop>) =>
    setShaders({ ramp: ramp.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addStop = () => {
    if (ramp.length >= MAX_STOPS) return;
    setShaders({ ramp: [...ramp, { color: '#ffffff', position: 1.0 }] });
  };
  const removeStop = (i: number) => {
    if (ramp.length <= 2) return;
    setShaders({ ramp: ramp.filter((_, idx) => idx !== i) });
  };

  const resBtns = (current: number, onChange: (r: number) => void) => (
    <div className="ctrl-btn-group ctrl-btn-group--wrap">
      {RESOLUTIONS.map((r) => (
        <button key={r} type="button"
          className={`ctrl-seg-btn ${current === r ? 'active' : ''}`}
          onClick={() => onChange(r)}>{r}</button>
      ))}
    </div>
  );

  return (
    <aside className="control-panel">
      <div className="panel-hdr"><span className="panel-hdr-title">layers</span></div>
      <div className="panel-scroll">

        {/* ── Shape ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('shape')} aria-expanded={openSections.shape}>
            <span className="section-hdr-label">Shape</span>
            <span className={`section-chevron ${openSections.shape ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.shape && (
            <div className="section-body">
              <label className="ctrl-row" title="Planet radius in world units"><span className="ctrl-label">Radius</span><span className="ctrl-value">{settings.shape.radius.toFixed(1)}</span></label>
              <input type="range" className="ctrl-slider" min={0.5} max={2.0} step={0.1} value={settings.shape.radius} onChange={(e) => setShape({ radius: parseFloat(e.target.value) })} />
              <label className="ctrl-row" style={{ marginTop: 10 }} title="Sphere mesh subdivisions — higher is smoother and holds more terrain detail, but heavier (1024/2048 can take seconds to rebuild)"><span className="ctrl-label">Resolution</span><span className="ctrl-value">{settings.shape.resolution}</span></label>
              {resBtns(settings.shape.resolution, (r) => setShape({ resolution: r }))}
              <label className="ctrl-row" style={{ marginTop: 10 }} title="Overlay the planet's triangle mesh on top of the shading"><span className="ctrl-label">Wireframe</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.shape.wireframe} onChange={(e) => setShape({ wireframe: e.target.checked })} /></label>
            </div>
          )}
        </section>

        {/* ── Layer Manager ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('layers')} aria-expanded={openSections.layers}>
            <span className="section-hdr-label">Layer Manager</span>
            <span className={`section-chevron ${openSections.layers ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.layers && (
            <div className="section-body">
              {terrainLayers.length === 0 && <p className="ctrl-coming-soon">no terrain layers yet</p>}
              {terrainLayers.map((layer) => (
                <React.Fragment key={layer.id}>
                  <label className="ctrl-row" title="Solo isolates this layer's effect on the planet and the 2D map">
                    <span className="ctrl-label" style={{ opacity: layer.enabled ? 1 : 0.45 }}>{layer.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="ctrl-value">{layer.intensity.toFixed(2)}</span>
                      <button type="button"
                        className={`ctrl-seg-btn ${settings.terrain.soloLayerId === layer.id ? 'active' : ''}`}
                        style={{ flex: 'none', padding: '1px 6px' }}
                        onClick={() => toggleSolo(layer.id)}>solo</button>
                    </span>
                  </label>
                  <input type="range" className="ctrl-slider" min={0} max={2} step={0.05} value={layer.intensity}
                    onChange={(e) => updateLayer(layer.id, { intensity: parseFloat(e.target.value) })} />
                </React.Fragment>
              ))}
            </div>
          )}
        </section>

        {/* ── Terrain ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('terrain')} aria-expanded={openSections.terrain}>
            <span className="section-hdr-label">Terrain</span>
            <span className={`section-chevron ${openSections.terrain ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.terrain && (
            <div className="section-body">
              <label className="ctrl-row"><span className="ctrl-label">Enabled</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.terrain.enabled} onChange={(e) => setTerrain({ enabled: e.target.checked })} /></label>
              <label className="ctrl-row" title="Overall height of the accumulated layer stack above (and below) the base sphere"><span className="ctrl-label">Height</span><span className="ctrl-value">{settings.terrain.elevationScale.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0.0} max={0.8} step={0.01} value={settings.terrain.elevationScale} onChange={(e) => setTerrain({ elevationScale: parseFloat(e.target.value) })} />

              {terrainLayers.map((layer) => (
                <React.Fragment key={layer.id}>
                  <div className="layer-divider">{layer.name}</div>
                  <label className="ctrl-row" title="Toggle this layer's contribution on/off">
                    <span className="ctrl-label">Active</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" className="ctrl-checkbox" checked={layer.enabled} onChange={(e) => updateLayer(layer.id, { enabled: e.target.checked })} />
                      <button type="button" className="ramp-stop-del" title="Remove layer" onClick={() => removeLayer(layer.id)}>×</button>
                    </span>
                  </label>
                  {layer.type === 'noise' && layer.noise && (
                    <LayerControls layer={layer.noise} onChange={(p) => updateLayer(layer.id, { noise: { ...layer.noise!, ...p } })} />
                  )}
                  {layer.type === 'map' && (
                    <p className="ctrl-coming-soon">heightmap applied from the 2D erosion view</p>
                  )}
                </React.Fragment>
              ))}
              <button type="button" className="ramp-add-btn" style={{ width: '100%', marginTop: 8 }} onClick={addNoiseLayer}>+ add noise layer</button>
            </div>
          )}
        </section>

        {/* ── Ocean ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('ocean')} aria-expanded={openSections.ocean}>
            <span className="section-hdr-label">Ocean</span>
            <span className={`section-chevron ${openSections.ocean ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.ocean && (
            <div className="section-body">
              <label className="ctrl-row"><span className="ctrl-label">Enabled</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.ocean.enabled} onChange={(e) => setOcean({ enabled: e.target.checked })} /></label>

              <label className="ctrl-row" title="Ocean radius offset from the planet surface — raise to flood, lower to drain"><span className="ctrl-label">Sea level</span><span className="ctrl-value">{settings.ocean.seaLevel.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={-0.5} max={0.5} step={0.01} value={settings.ocean.seaLevel} onChange={(e) => setOcean({ seaLevel: parseFloat(e.target.value) })} />

              <label className="ctrl-row" style={{ marginTop: 8 }}><span className="ctrl-label">Resolution</span><span className="ctrl-value">{settings.ocean.resolution}</span></label>
              {resBtns(settings.ocean.resolution, (r) => setOcean({ resolution: r }))}

              <div className="layer-divider">Colors</div>
              <label className="ctrl-row"><span className="ctrl-label">Deep</span>
                <input type="color" className="ctrl-color" value={settings.ocean.deepColor} onChange={(e) => setOcean({ deepColor: e.target.value })} /></label>
              <label className="ctrl-row"><span className="ctrl-label">Shallow</span>
                <input type="color" className="ctrl-color" value={settings.ocean.shallowColor} onChange={(e) => setOcean({ shallowColor: e.target.value })} /></label>
              <label className="ctrl-row"><span className="ctrl-label">Foam</span>
                <input type="color" className="ctrl-color" value={settings.ocean.foamColor} onChange={(e) => setOcean({ foamColor: e.target.value })} /></label>

              <div className="layer-divider">Surface</div>
              <label className="ctrl-row" title="Wave animation speed"><span className="ctrl-label">Speed</span><span className="ctrl-value">{settings.ocean.rippleSpeed.toFixed(1)}</span></label>
              <input type="range" className="ctrl-slider" min={0.0} max={5.0} step={0.1} value={settings.ocean.rippleSpeed} onChange={(e) => setOcean({ rippleSpeed: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="Size of the wave pattern across the surface"><span className="ctrl-label">Scale</span><span className="ctrl-value">{settings.ocean.rippleScale.toFixed(1)}</span></label>
              <input type="range" className="ctrl-slider" min={0.1} max={3.0} step={0.1} value={settings.ocean.rippleScale} onChange={(e) => setOcean({ rippleScale: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="Vertical displacement of the waves"><span className="ctrl-label">Height</span><span className="ctrl-value">{settings.ocean.rippleHeight.toFixed(3)}</span></label>
              <input type="range" className="ctrl-slider" min={0.0} max={0.05} step={0.001} value={settings.ocean.rippleHeight} onChange={(e) => setOcean({ rippleHeight: parseFloat(e.target.value) })} />

              <div className="layer-divider">Coastline</div>
              <label className="ctrl-row"><span className="ctrl-label">Foam enabled</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.ocean.foamEnabled} onChange={(e) => setOcean({ foamEnabled: e.target.checked })} /></label>
              <label className="ctrl-row" title="Water depth over which the shore fades from shallow to deep color"><span className="ctrl-label">Depth</span><span className="ctrl-value">{settings.ocean.foamDepth.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0.01} max={0.5} step={0.01} value={settings.ocean.foamDepth} onChange={(e) => setOcean({ foamDepth: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="0 = crisp foam edge at the shoreline, 1 = wide soft fade"><span className="ctrl-label">Softness</span><span className="ctrl-value">{settings.ocean.foamSoftness.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0.0} max={1.0} step={0.05} value={settings.ocean.foamSoftness} onChange={(e) => setOcean({ foamSoftness: parseFloat(e.target.value) })} />

              <div className="layer-divider">Ripples</div>
              <label className="ctrl-row"><span className="ctrl-label">Enabled</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.ocean.rippleEnabled} onChange={(e) => setOcean({ rippleEnabled: e.target.checked })} /></label>
              <label className="ctrl-row" title="Spacing/thickness of each shore contour line"><span className="ctrl-label">Width</span><span className="ctrl-value">{settings.ocean.rippleWidth.toFixed(3)}</span></label>
              <input type="range" className="ctrl-slider" min={0.01} max={0.3} step={0.005} value={settings.ocean.rippleWidth} onChange={(e) => setOcean({ rippleWidth: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="How far from the shore the contour ripples reach"><span className="ctrl-label">Distance</span><span className="ctrl-value">{settings.ocean.rippleDistance.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0.02} max={0.5} step={0.01} value={settings.ocean.rippleDistance} onChange={(e) => setOcean({ rippleDistance: parseFloat(e.target.value) })} />
            </div>
          )}
        </section>

        {/* ── Erosion (2D map) ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('erosion')} aria-expanded={openSections.erosion}>
            <span className="section-hdr-label">Erosion (2D)</span>
            <span className={`section-chevron ${openSections.erosion ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.erosion && (
            <div className="section-body">
              <div className="ctrl-btn-group">
                <button type="button" className="ctrl-seg-btn" title="Sample the planet's terrain noise into the 2D map (discards any erosion)" onClick={() => onMapAction('load')}>load topo</button>
                <button type="button" className={`ctrl-seg-btn ${eroding ? 'active' : ''}`} title="Start/stop the erosion animation" onClick={() => onMapAction('erode')}>{eroding ? '■ stop' : '▶ erode'}</button>
                <button type="button" className="ctrl-seg-btn" title="Restore the map as it was when last loaded" onClick={() => onMapAction('reset')}>reset</button>
              </div>
              <div className="ctrl-btn-group" style={{ marginTop: 4 }}>
                <button type="button" className="ctrl-seg-btn" title="Use the current 2D map as the 3D planet's terrain" onClick={() => onMapAction('apply')}>apply to 3D</button>
                <button type="button" className="ctrl-seg-btn" title="Return the 3D planet to its noise-based terrain" onClick={() => onMapAction('clear')}>clear 3D</button>
              </div>

              <div className="layer-divider">Map</div>
              <label className="ctrl-row" title="Heightmap size in pixels — higher registers finer erosion detail but simulates slower">
                <span className="ctrl-label">Resolution</span><span className="ctrl-value">{settings.erosion.mapRes * 2}×{settings.erosion.mapRes}</span></label>
              <div className="ctrl-btn-group">
                {[64, 128, 256, 512, 1024].map((r) => (
                  <button key={r} type="button"
                    className={`ctrl-seg-btn ${settings.erosion.mapRes === r ? 'active' : ''}`}
                    onClick={() => setErosion({ mapRes: r })}>{r}</button>
                ))}
              </div>
              <label className="ctrl-row" title="Random seed for where raindrops fall — the same seed replays the same rain pattern">
                <span className="ctrl-label">Seed</span>
                <input type="number" className="ctrl-number" value={settings.erosion.seed} onChange={(e) => setErosion({ seed: parseInt(e.target.value, 10) || 0 })} />
              </label>
              <button type="button" className="ramp-add-btn" style={{ width: '100%' }} onClick={() => setErosion({ seed: Math.floor(Math.random() * 100000) })}>randomize seed</button>

              <div className="layer-divider">Rain</div>
              <label className="ctrl-row" title="Raindrops simulated per second while the animation runs"><span className="ctrl-label">Rate</span><span className="ctrl-value">{(settings.erosion.droplets / 1000).toFixed(0)}k/s</span></label>
              <input type="range" className="ctrl-slider" min={1000} max={200000} step={1000} value={settings.erosion.droplets} onChange={(e) => setErosion({ droplets: parseInt(e.target.value, 10) })} />
              <label className="ctrl-row" title="Maximum steps a droplet travels before it dies"><span className="ctrl-label">Lifetime</span><span className="ctrl-value">{settings.erosion.maxLifetime}</span></label>
              <input type="range" className="ctrl-slider" min={5} max={100} step={1} value={settings.erosion.maxLifetime} onChange={(e) => setErosion({ maxLifetime: parseInt(e.target.value, 10) })} />
              <label className="ctrl-row" title="How much a droplet keeps its momentum vs. turning to follow the slope downhill"><span className="ctrl-label">Inertia</span><span className="ctrl-value">{settings.erosion.inertia.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0} max={0.5} step={0.01} value={settings.erosion.inertia} onChange={(e) => setErosion({ inertia: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="Water lost each step — drier droplets carry less sediment and fade out"><span className="ctrl-label">Evaporation</span><span className="ctrl-value">{settings.erosion.evaporation.toFixed(3)}</span></label>
              <input type="range" className="ctrl-slider" min={0} max={0.1} step={0.005} value={settings.erosion.evaporation} onChange={(e) => setErosion({ evaporation: parseFloat(e.target.value) })} />

              <div className="layer-divider">Sediment</div>
              <label className="ctrl-row" title="How much sediment a droplet can carry, scaled by its speed and water"><span className="ctrl-label">Capacity</span><span className="ctrl-value">{settings.erosion.capacity.toFixed(1)}</span></label>
              <input type="range" className="ctrl-slider" min={0.5} max={10} step={0.5} value={settings.erosion.capacity} onChange={(e) => setErosion({ capacity: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="Fraction of spare carrying capacity a droplet erodes from the ground each step"><span className="ctrl-label">Erosion rate</span><span className="ctrl-value">{settings.erosion.erosion.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0.05} max={1} step={0.05} value={settings.erosion.erosion} onChange={(e) => setErosion({ erosion: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="Fraction of excess sediment dropped when a droplet is over capacity"><span className="ctrl-label">Deposition</span><span className="ctrl-value">{settings.erosion.deposition.toFixed(2)}</span></label>
              <input type="range" className="ctrl-slider" min={0.05} max={1} step={0.05} value={settings.erosion.deposition} onChange={(e) => setErosion({ deposition: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="How strongly droplets accelerate downhill"><span className="ctrl-label">Gravity</span><span className="ctrl-value">{settings.erosion.gravity.toFixed(1)}</span></label>
              <input type="range" className="ctrl-slider" min={1} max={10} step={0.5} value={settings.erosion.gravity} onChange={(e) => setErosion({ gravity: parseFloat(e.target.value) })} />
              <label className="ctrl-row" title="Footprint of each carve in map cells — larger digs broader, smoother valleys; smaller registers finer detail"><span className="ctrl-label">Brush radius</span><span className="ctrl-value">{settings.erosion.radius}</span></label>
              <input type="range" className="ctrl-slider" min={1} max={8} step={1} value={settings.erosion.radius} onChange={(e) => setErosion({ radius: parseInt(e.target.value, 10) })} />
            </div>
          )}
        </section>

        {/* ── Atmosphere ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('atmosphere')} aria-expanded={openSections.atmosphere}>
            <span className="section-hdr-label">Atmosphere</span>
            <span className={`section-chevron ${openSections.atmosphere ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.atmosphere && (
            <div className="section-body">
              <label className="ctrl-row"><span className="ctrl-label">Enabled</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.atmosphere.enabled} onChange={(e) => setAtmo({ enabled: e.target.checked })} /></label>
              <p className="ctrl-coming-soon">Scattering shader coming soon</p>
            </div>
          )}
        </section>

        {/* ── Biomes ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('biomes')} aria-expanded={openSections.biomes}>
            <span className="section-hdr-label">Biomes</span>
            <span className={`section-chevron ${openSections.biomes ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.biomes && (
            <div className="section-body">
              <label className="ctrl-row"><span className="ctrl-label">Enabled</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.biomes.enabled} onChange={(e) => setBiomes({ enabled: e.target.checked })} /></label>
              <p className="ctrl-coming-soon">Elevation-based coloring coming soon</p>
            </div>
          )}
        </section>

        {/* ── Shaders ── */}
        <section className="ctrl-section foldable">
          <button type="button" className="section-hdr-btn" onClick={() => toggle('shaders')} aria-expanded={openSections.shaders}>
            <span className="section-hdr-label">Shaders</span>
            <span className={`section-chevron ${openSections.shaders ? 'open' : ''}`}>▼</span>
          </button>
          {openSections.shaders && (
            <div className="section-body">
              <label className="ctrl-row" style={{ marginBottom: 4 }}><span className="ctrl-label">Style</span></label>
              <div className="ctrl-btn-group">
                {SHADER_STYLES.map((s) => (
                  <button key={s} type="button"
                    className={`ctrl-seg-btn ${settings.shaders.style === s ? 'active' : ''}`}
                    onClick={() => setShaders({ style: s })}>{s}</button>
                ))}
              </div>
              <label className="ctrl-row" style={{ marginTop: 10 }} title="Darken crevices and valleys with baked per-vertex ambient occlusion — works for both lit and unlit styles">
                <span className="ctrl-label">Ambient occlusion</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.shaders.ao} onChange={(e) => setShaders({ ao: e.target.checked })} /></label>
              {settings.shaders.ao && (
                <>
                  <label className="ctrl-row" title="How dark occluded crevices get"><span className="ctrl-label">Strength</span><span className="ctrl-value">{settings.shaders.aoStrength.toFixed(2)}</span></label>
                  <input type="range" className="ctrl-slider" min={0} max={1} step={0.05} value={settings.shaders.aoStrength} onChange={(e) => setShaders({ aoStrength: parseFloat(e.target.value) })} />
                  <label className="ctrl-row" title="Sampling distance in mesh cells — larger radius occludes broader features, smaller picks up fine crevices"><span className="ctrl-label">Radius</span><span className="ctrl-value">{settings.shaders.aoRadius}</span></label>
                  <input type="range" className="ctrl-slider" min={1} max={8} step={1} value={settings.shaders.aoRadius} onChange={(e) => setShaders({ aoRadius: parseInt(e.target.value, 10) })} />
                  <label className="ctrl-row" title="Distribution of the darkening: below 1 spreads shading widely, above 1 pools it in the deepest crevices"><span className="ctrl-label">Distribution</span><span className="ctrl-value">{settings.shaders.aoContrast.toFixed(2)}</span></label>
                  <input type="range" className="ctrl-slider" min={0.2} max={3} step={0.05} value={settings.shaders.aoContrast} onChange={(e) => setShaders({ aoContrast: parseFloat(e.target.value) })} />
                </>
              )}
              <div className="layer-divider">Terrain color</div>
              <label className="ctrl-row" title="Anchor the color ramp to the water height: stops below 0.50 shade underwater terrain, stops above shade land — moving sea level re-colors automatically">
                <span className="ctrl-label">Link to water</span>
                <input type="checkbox" className="ctrl-checkbox" checked={settings.shaders.linkToSea} onChange={(e) => setShaders({ linkToSea: e.target.checked })} /></label>
              <label className="ctrl-row" style={{ marginBottom: 4 }}><span className="ctrl-label">Mode</span></label>
              <div className="ctrl-btn-group">
                {COLOR_MODES.map((m) => (
                  <button key={m} type="button"
                    className={`ctrl-seg-btn ${settings.shaders.colorMode === m ? 'active' : ''}`}
                    onClick={() => setShaders({ colorMode: m })}>{m}</button>
                ))}
              </div>

              {settings.shaders.colorMode === 'solid' ? (
                <label className="ctrl-row" style={{ marginTop: 10 }}>
                  <span className="ctrl-label">Color</span>
                  <input type="color" className="ctrl-color" value={settings.shaders.terrainColor} onChange={(e) => setShaders({ terrainColor: e.target.value })} />
                </label>
              ) : (
                <div className="ramp-editor">
                  <div className="ramp-hint">low&nbsp;→&nbsp;high elevation</div>
                  {ramp.map((stop, i) => (
                    <div className="ramp-stop" key={i}>
                      <input type="color" className="ctrl-color" value={stop.color} onChange={(e) => updateStop(i, { color: e.target.value })} />
                      <input type="range" className="ctrl-slider ramp-stop-slider" min={0} max={1} step={0.01} value={stop.position} onChange={(e) => updateStop(i, { position: parseFloat(e.target.value) })} />
                      <span className="ctrl-value ramp-stop-pos">{stop.position.toFixed(2)}</span>
                      <button type="button" className="ramp-stop-del" disabled={ramp.length <= 2} onClick={() => removeStop(i)} title="Remove stop">×</button>
                    </div>
                  ))}
                  {ramp.length < MAX_STOPS && (
                    <button type="button" className="ramp-add-btn" onClick={addStop}>+ add stop</button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </aside>
  );
};

export default ControlPanel;
