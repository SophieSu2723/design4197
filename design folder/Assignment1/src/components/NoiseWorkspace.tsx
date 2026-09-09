import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { buildHeightField, Equation, GridSettings, initialGrid, NoiseLayer, sampledFrequency, sampledOctaves, Shape } from '../utils/gridNoise';
import { erodeStep, terrainColor } from '../utils/simulation';
import './NoiseWorkspace.css';

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void;
}) {
  return <label className="noise-slider"><span>{label}<output>{Number(value.toFixed(2))}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function HeightMap({ field, resolution, colored = false }: { field: Float32Array; resolution: number; colored?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const side = resolution + 1;
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixels = ctx.createImageData(side, side);
    field.forEach((height, i) => {
      const rgb = colored ? terrainColor(height) : [height * 255, height * 255, height * 255];
      pixels.data[i * 4] = rgb[0]; pixels.data[i * 4 + 1] = rgb[1]; pixels.data[i * 4 + 2] = rgb[2];
      pixels.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(pixels, 0, 0);
  }, [field, resolution, colored]);
  return <canvas ref={ref} aria-label={colored ? "Simulation topography map colored by elevation" : "2D grayscale noise heightmap: black is low, white is high"} />;
}
function GridView({ field, resolution, height, wireframe, resetKey, colored }: {
  field: Float32Array; resolution: number; height: number; wireframe: boolean; resetKey: number; colored: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10191d');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(12, 11, 14);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 55;
    controls.maxPolarAngle = Math.PI * 0.49;
    scene.add(new THREE.HemisphereLight(0xe3fff9, 0x34464b, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(-5, 15, 8); scene.add(light);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    scene.add(mesh);
    const grid = new THREE.GridHelper(24, 24, 0x37545c, 0x23383f);
    grid.position.y = -0.04; scene.add(grid);
    sceneRef.current = { mesh, renderer, scene, camera, controls };
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose();
      mesh.geometry.dispose(); mesh.material.dispose(); grid.geometry.dispose();
      (grid.material as THREE.Material).dispose(); renderer.dispose(); container.removeChild(renderer.domElement); sceneRef.current = null;
    };
  }, []);
  useEffect(() => {
    const state = sceneRef.current; if (!state) return;
    const geometry = new THREE.PlaneGeometry(12, 12, resolution, resolution);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(field.length * 3);
    const low = new THREE.Color('#245965'), high = new THREE.Color('#d4eec0');
    field.forEach((h, i) => {
      positions.setY(i, h * height);
      const rgb = terrainColor(h);
      const color = colored ? new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace) : low.clone().lerp(high, h);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    });
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    state.mesh.geometry.dispose(); state.mesh.geometry = geometry;
  }, [field, resolution, height, colored]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.mesh.material.wireframe = wireframe; }, [wireframe]);
  useEffect(() => {
    const state = sceneRef.current; if (!state) return;
    state.camera.position.set(12, 11, 14); state.controls.target.set(0, 1, 0); state.controls.update();
  }, [resetKey]);
  return <div className="noise-viewport" ref={host}>{error && <p className="noise-webgl-error">WebGL is unavailable. Enable hardware acceleration to view the 3D grid. The 2D map and controls still work.</p>}</div>;
}
export default function NoiseWorkspace() {
  const [settings, setSettings] = useState<GridSettings>(initialGrid);
  const [wireframe, setWireframe] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const nextId = useRef(2);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(0.8);
  const [talus, setTalus] = useState(10);
  const [speed, setSpeed] = useState(8);
  const [showOriginal, setShowOriginal] = useState(false);
  const [colored, setColored] = useState(true);
  const baseField = useMemo(() => buildHeightField(settings), [settings]);
  const [simulation, setSimulation] = useState<{ source: Float32Array; field: Float32Array; steps: number } | null>(null);
  const current = simulation?.source === baseField ? simulation : null;
  const evolvedField = current?.field ?? baseField;
  const field = showOriginal ? baseField : evolvedField;
  const change = useMemo(() => {
    let total = 0, max = 0;
    evolvedField.forEach((h, i) => {
      const difference = Math.abs(h - baseField[i]) * settings.height;
      total += difference; max = Math.max(max, difference);
    });
    return { mean: total / baseField.length, max };
  }, [evolvedField, baseField, settings.height]);
  const steps = current?.steps ?? 0;
  const range = useMemo(() => {
    let min = Infinity, max = -Infinity;
    field.forEach(h => { min = Math.min(min, h); max = Math.max(max, h); });
    return { min: min * settings.height, max: max * settings.height };
  }, [field, settings.height]);
  const limitedLayers = settings.layers.filter(l => l.enabled && l.weight > 0 && (sampledOctaves(l, settings) < l.octaves || sampledFrequency(l, settings) < l.frequency)).length;
  const update = (patch: Partial<GridSettings>) => { setRunning(false); setSettings(s => ({ ...s, ...patch })); };
  const updateLayer = (id: number, patch: Partial<NoiseLayer>) => {
    setRunning(false); setSettings(s => ({ ...s, layers: s.layers.map(l => l.id === id ? { ...l, ...patch } : l) }));
  };
  const move = (x: number, z: number) => {
    setRunning(false);
    setSettings(s => ({ ...s, offsetX: s.offsetX + x * s.worldSize / 8, offsetZ: s.offsetZ + z * s.worldSize / 8 }));
  };
  const resetSimulation = () => { setRunning(false); setSimulation(null); setShowOriginal(false); };
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSimulation(previous => {
      const active = previous?.source === baseField ? previous : null;
      let next = active?.field ?? baseField;
      for (let i = 0; i < speed; i++) next = erodeStep(next, settings.resolution, settings.worldSize / settings.resolution, settings.height, talus, rate);
      return { source: baseField, steps: (active?.steps ?? 0) + speed, field: next };
    }), 100);
    return () => window.clearInterval(timer);
  }, [running, baseField, settings.resolution, settings.worldSize, settings.height, talus, rate, speed]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, [contenteditable="true"]'))) return;
      const key = event.key.toLowerCase();
      const directions: Record<string, [number, number]> = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
      if (directions[key]) {
        event.preventDefault(); setRunning(false);
        const [x, z] = directions[key];
        setSettings(s => ({ ...s, offsetX: s.offsetX + x * s.worldSize / 8, offsetZ: s.offsetZ + z * s.worldSize / 8 }));
      } else if (key === 'f' && !event.repeat) { event.preventDefault(); setWireframe(w => !w); }
      else if (key === ' ' && !event.repeat) { event.preventDefault(); setShowOriginal(false); setRunning(r => !r); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return <div className="noise-app">
    <div className="noise-layout"><aside className="noise-controls" aria-label="Terrain controls">
      <div className="noise-intro"><span className="noise-eyebrow">■ FIELD / LAB</span><h1>Noise field<span>01</span></h1><p>PROCEDURAL TERRAIN STUDIO</p></div>
      <section className="simulation-card" aria-label="Simulation map">
        <div className="simulation-heading"><div><span className="noise-eyebrow">01 / SIMULATION</span><h3>Simulation</h3></div><span className={running ? 'simulation-status active' : 'simulation-status'} role="status" aria-label="Simulation status" aria-live="off">{running ? '● Running' : '○ Stopped'} · {steps} steps</span></div>
        <div className="simulation-body">
        <div className="simulation-controls"><p>Thermal erosion smooths steep slopes; it does not animate the whole surface.</p>
          <div className="simulation-actions"><button className="simulation-start" onClick={() => { setShowOriginal(false); setRunning(r => !r); }}>{running ? '■ Stop simulation' : '▶ Start simulation'}</button><button onClick={resetSimulation}>Reset terrain</button></div>
          <button className="simulation-compare" aria-pressed={showOriginal} disabled={!steps} onClick={() => { setRunning(false); setShowOriginal(value => !value); }}>{showOriginal ? 'Show simulated result' : 'Compare: show original'}</button>
          <p className="simulation-feedback" aria-label="Terrain change">{showOriginal ? 'Viewing original terrain.' : `Height change · mean ${change.mean.toFixed(3)} / max ${change.max.toFixed(3)} units.`}</p>
          {steps > 0 && change.max < 0.00001 && <p className="noise-hint">No material moved. Lower the stable slope, or increase terrain height if the grid is flat.</p>}
          <Slider label="Steps per update" value={speed} min={1} max={16} onChange={setSpeed} />
          <Slider label="Erosion rate" value={rate} min={0.05} max={1} step={0.05} onChange={setRate} />
          <Slider label="Stable slope (degrees)" value={talus} min={0} max={60} onChange={setTalus} />
          <label className="simulation-toggle"><input type="checkbox" checked={colored} onChange={e => setColored(e.target.checked)} /> Elevation material · lowlands, grass, rock, snow</label>
          <div className="simulation-stats"><span>Elevation <b>{range.min.toFixed(2)}–{range.max.toFixed(2)}</b></span><span>Cell width <b>{(settings.worldSize / settings.resolution).toFixed(3)}</b></span><span>Map size <b>{settings.resolution + 1}²</b></span></div>
        </div></div>
        <div className="simulation-navigation"><div><strong>Explore beyond the frame</strong><p>WASD / arrows to travel · F for wireframe · Space to start / stop</p><p>Moving or editing the noise resets erosion. Returning regenerates the original field.</p></div><div className="simulation-directions"><button aria-label="Move north" onClick={() => move(0, -1)}>↑</button><button aria-label="Move west" onClick={() => move(-1, 0)}>←</button><button onClick={() => update({ offsetX: 0, offsetZ: 0 })}>Home</button><button aria-label="Move east" onClick={() => move(1, 0)}>→</button><button aria-label="Move south" onClick={() => move(0, 1)}>↓</button></div></div>
        <div className="simulation-location">World origin: X {settings.offsetX.toFixed(2)} / Z {settings.offsetZ.toFixed(2)} · Span {settings.worldSize} units · {settings.shape === 'island' ? 'Island falloff stays anchored at world (6, 6).' : 'Continuous world coordinates; no repeating tile boundary.'}</div>
      </section>
      <section><h2><span>02</span> Grid & calibration</h2>
        <Slider label="Grid resolution" value={settings.resolution} min={16} max={160} step={8} onChange={resolution => update({ resolution })} />
        <Slider label="Height scale" value={settings.height} min={0} max={10} step={0.1} onChange={height => update({ height })} />
        <Slider label="World span" value={settings.worldSize} min={6} max={48} step={1} onChange={worldSize => update({ worldSize })} />
        <p className="noise-hint">{settings.resolution + 1} × {settings.resolution + 1} samples in both maps · {(settings.worldSize / settings.resolution).toFixed(3)} units per cell.</p>
        <p className="noise-hint">{limitedLayers ? `${limitedLayers} layer(s) use limited frequency or octaves to keep detail resolvable at this grid spacing.` : 'Noise detail fits the current grid spacing.'}</p>
        <button className="noise-add" onClick={() => { setRunning(false); setSettings(s => ({ ...s, resolution: 128, worldSize: 12, height: 3, shape: 'none', layers: [{ ...initialGrid.layers[0], frequency: 2, octaves: 4, persistence: 0.45 }] })); }}>Calibrate rolling hills</button>
      </section>
      <section><h2><span>03</span> Noise layers <span className="noise-count">{settings.layers.length}</span></h2>
        <p className="noise-hint">Enabled layers blend by relative weight.</p>
        {settings.layers.map((layer, index) => <div className="noise-layer" key={layer.id}>
          <div className="noise-layer-heading"><label><input type="checkbox" checked={layer.enabled} onChange={e => updateLayer(layer.id, { enabled: e.target.checked })} /> Layer {index + 1}</label><button aria-label={`Remove layer ${index + 1}`} onClick={() => update({ layers: settings.layers.filter(l => l.id !== layer.id) })}>×</button></div>
          <label className="noise-select">Noise equation<select value={layer.equation} onChange={e => updateLayer(layer.id, { equation: e.target.value as Equation })}><option value="value">Value noise · fBm</option><option value="ridged">Ridged noise</option><option value="warp">Domain-warped noise</option></select></label>
          <Slider label="Frequency" value={layer.frequency} min={0.5} max={12} step={0.1} onChange={frequency => updateLayer(layer.id, { frequency })} />
          <Slider label="Octaves" value={layer.octaves} min={1} max={8} onChange={octaves => updateLayer(layer.id, { octaves })} />
          <Slider label="Persistence" value={layer.persistence} min={0} max={1} step={0.01} onChange={persistence => updateLayer(layer.id, { persistence })} />
          <Slider label="Lacunarity" value={layer.lacunarity} min={1} max={4} step={0.1} onChange={lacunarity => updateLayer(layer.id, { lacunarity })} />
          <Slider label="Blend weight" value={layer.weight} min={0} max={1} step={0.01} onChange={weight => updateLayer(layer.id, { weight })} />
          <Slider label="Seed" value={layer.seed} min={0} max={100} onChange={seed => updateLayer(layer.id, { seed })} />
        </div>)}
        <button className="noise-add" disabled={settings.layers.length >= 4} onClick={() => update({ layers: [...settings.layers, { ...initialGrid.layers[0], id: nextId.current++, seed: settings.layers.length * 19 + 7, weight: 0.5 }] })}>＋ Add noise layer <span>{settings.layers.length}/4</span></button>
      </section>
      <section><h2><span>04</span> Shape the terrain</h2><label className="noise-select">Shaping operation<select value={settings.shape} onChange={e => update({ shape: e.target.value as Shape })}><option value="none">None · original field</option><option value="power">Power curve · sharpen peaks</option><option value="terrace">Terrace · stepped elevations</option><option value="island">Island · radial falloff</option></select></label>
        {settings.shape !== 'none' && <Slider label="Shaping strength" value={settings.strength} min={0} max={1} step={0.01} onChange={strength => update({ strength })} />}
      </section><button className="noise-reset" onClick={() => { setSettings(initialGrid); resetSimulation(); setRate(0.8); setTalus(10); setSpeed(8); setColored(true); setWireframe(false); setResetKey(k => k + 1); }}>Reset all settings</button>
    </aside>
    <main className="noise-main" aria-label="3D terrain viewport"><div className="noise-main-title"><span className="noise-eyebrow">LIVE TERRAIN / PERSPECTIVE</span><h2>A world from noise.</h2><p>Drag to orbit · Scroll to zoom</p></div>
      <div className="noise-scene"><div className="noise-scene-toolbar"><span><b>3D</b> Displaced grid</span><div><button className={wireframe ? 'selected' : ''} aria-pressed={wireframe} onClick={() => setWireframe(w => !w)}>Wireframe · F</button><button onClick={() => setResetKey(k => k + 1)}>Reset view</button></div></div>
        <GridView field={field} resolution={settings.resolution} height={settings.height * 12 / settings.worldSize} wireframe={wireframe} resetKey={resetKey} colored={colored} />
        <div className="noise-scene-footer"><span>Drag to orbit · Scroll to zoom · Right-drag to pan</span><span>{(settings.resolution ** 2 * 2).toLocaleString()} triangles</span></div>
      </div>
      <details className="noise-map-dock" open><summary>SIMULATION MAP <span>− / +</span></summary>
        <div className="noise-map-content"><p>One height field. Two ways to read it.</p><div className="noise-map-pair">
          <figure><HeightMap field={field} resolution={settings.resolution} /><figcaption>HEIGHT FIELD</figcaption></figure>
          <figure><HeightMap field={field} resolution={settings.resolution} colored /><figcaption>ELEVATION</figcaption></figure>
        </div><div className="noise-map-meta"><span>{settings.resolution + 1} × {settings.resolution + 1} samples</span><span>N ↑</span></div></div>
      </details>
      <div className="noise-world-hud"><span className={running ? 'hud-dot running' : 'hud-dot'} />{showOriginal ? 'ORIGINAL' : running ? 'SIMULATING' : 'READY'}<span>X {settings.offsetX.toFixed(1)} / Z {settings.offsetZ.toFixed(1)}</span></div>
    </main></div>
  </div>;
}
