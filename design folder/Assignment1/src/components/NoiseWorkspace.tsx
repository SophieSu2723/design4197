import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { buildHeightField, Equation, GridSettings, initialGrid, NoiseLayer, Shape } from '../utils/gridNoise';
import './NoiseWorkspace.css';

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void;
}) {
  return <label className="noise-slider"><span>{label}<output>{Number(value.toFixed(2))}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
function HeightMap({ field, resolution }: { field: Float32Array; resolution: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const side = resolution + 1;
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixels = ctx.createImageData(side, side);
    field.forEach((height, i) => {
      pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = Math.round(height * 255);
      pixels.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(pixels, 0, 0);
  }, [field, resolution]);
  return <canvas ref={ref} aria-label="2D grayscale noise heightmap: black is low, white is high" />;
}
function GridView({ field, resolution, height, wireframe, resetKey }: {
  field: Float32Array; resolution: number; height: number; wireframe: boolean; resetKey: number;
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
    scene.background = new THREE.Color('#101c22');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(15, 14, 17);
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
      const color = low.clone().lerp(high, h);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    });
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeVertexNormals();
    state.mesh.geometry.dispose(); state.mesh.geometry = geometry;
  }, [field, resolution, height]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.mesh.material.wireframe = wireframe; }, [wireframe]);
  useEffect(() => {
    const state = sceneRef.current; if (!state) return;
    state.camera.position.set(15, 14, 17); state.controls.target.set(0, 1, 0); state.controls.update();
  }, [resetKey]);
  return <div className="noise-viewport" ref={host}>{error && <p className="noise-webgl-error">WebGL is unavailable. Enable hardware acceleration to view the 3D grid. The 2D map and controls still work.</p>}</div>;
}
export default function NoiseWorkspace() {
  const [settings, setSettings] = useState<GridSettings>(initialGrid);
  const [wireframe, setWireframe] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const nextId = useRef(2);
  const field = useMemo(() => buildHeightField(settings), [settings]);
  const update = (patch: Partial<GridSettings>) => setSettings(s => ({ ...s, ...patch }));
  const updateLayer = (id: number, patch: Partial<NoiseLayer>) => setSettings(s => ({ ...s, layers: s.layers.map(l => l.id === id ? { ...l, ...patch } : l) }));
  return <div className="noise-app">
    <header className="noise-header"><div className="noise-brand"><span className="noise-logo">▧</span><strong>FIELD / LAB</strong><span className="noise-divider" /><span>Procedural terrain studio</span></div><span className="noise-eyebrow">ASSIGNMENT 01</span></header>
    <div className="noise-layout"><aside className="noise-controls">
      <div className="noise-intro"><span className="noise-eyebrow">ASSIGNMENT 01</span><h1>A world from noise.</h1><p>Shape a field of numbers into a landscape.</p></div>
      <section><h2><span>01</span> Grid & displacement</h2>
        <Slider label="Grid resolution" value={settings.resolution} min={16} max={160} step={8} onChange={resolution => update({ resolution })} />
        <Slider label="Height scale" value={settings.height} min={0} max={10} step={0.1} onChange={height => update({ height })} />
        <p className="noise-hint">{(settings.resolution + 1).toLocaleString()} × {(settings.resolution + 1).toLocaleString()} vertices · 12 × 12 world units</p>
      </section>
      <section><h2><span>02</span> Noise layers <span className="noise-count">{settings.layers.length}</span></h2>
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
      <section><h2><span>03</span> Shape the terrain</h2><label className="noise-select">Shaping operation<select value={settings.shape} onChange={e => update({ shape: e.target.value as Shape })}><option value="none">None · original field</option><option value="power">Power curve · sharpen peaks</option><option value="terrace">Terrace · stepped elevations</option><option value="island">Island · radial falloff</option></select></label>
        {settings.shape !== 'none' && <Slider label="Shaping strength" value={settings.strength} min={0} max={1} step={0.01} onChange={strength => update({ strength })} />}
      </section><button className="noise-reset" onClick={() => { setSettings(initialGrid); setWireframe(true); setResetKey(k => k + 1); }}>Reset all settings</button>
    </aside>
    <main className="noise-main"><div className="noise-main-title"><div><span className="noise-eyebrow">LIVE WORKSPACE</span><h2>Explore the surface</h2></div><span className="noise-live">● Synchronized views</span></div>
      <div className="noise-scene"><div className="noise-scene-toolbar"><span><b>3D</b> Displaced grid</span><div><button className={wireframe ? 'selected' : ''} aria-pressed={wireframe} onClick={() => setWireframe(w => !w)}>Wireframe</button><button onClick={() => setResetKey(k => k + 1)}>Reset view</button></div></div>
        <GridView field={field} resolution={settings.resolution} height={settings.height} wireframe={wireframe} resetKey={resetKey} />
        <div className="noise-scene-footer"><span>Drag to orbit · Scroll to zoom · Right-drag to pan</span><span>{(settings.resolution ** 2 * 2).toLocaleString()} triangles</span></div>
      </div>
      <div className="noise-bottom"><section className="noise-map-card"><div><span className="noise-eyebrow">2D / HEIGHT FIELD</span><h3>The same noise, from above.</h3><p>Each pixel maps to a grid vertex. Brighter values become higher points on the surface.</p><div className="noise-legend" /><div className="noise-legend-labels"><span>0 · Low</span><span>1 · High</span></div></div><HeightMap field={field} resolution={settings.resolution} /></section>
      <section className="noise-equation-card"><span className="noise-eyebrow">HOW IT CONNECTS</span><h3>Noise → blend → shape → height</h3><code>y = shape(Σ wᵢ · noiseᵢ / Σ wᵢ) × height</code><p>Change a parameter to see both views update. Set height to zero to reveal the original flat grid.</p></section></div>
      <footer className="noise-footer"><span>PROCEDURAL WORLD BUILDING</span><span>01 / Noise & terrain</span></footer>
    </main></div>
  </div>;
}
