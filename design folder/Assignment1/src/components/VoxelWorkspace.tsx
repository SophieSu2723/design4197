import { useEffect, useRef, useState } from 'react';
import { ChunkMesh, CsgMode, CsgOperation, DensityShape, VoxelSettings, chunkSignature, initialVoxel, listChunks, meshChunk } from '../utils/voxel';
import VoxelView from './VoxelView';
import './NoiseWorkspace.css';
import './VoxelWorkspace.css';

function Slider({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="noise-slider"><span>{label}<output>{Number(value.toFixed(2))}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}
const shapeOptions = <><option value="sphere">Sphere</option><option value="box">Box</option><option value="torus">Torus</option><option value="capsule">Capsule</option></>;
const bytes = (n: number) => n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`;
interface BuildResult { meshes: ChunkMesh[]; rebuilt: number; reused: number; milliseconds: number; resolution: number }
export default function VoxelWorkspace() {
  const [settings, setSettings] = useState<VoxelSettings>(initialVoxel);
  const [wireframe, setWireframe] = useState(false), [showChunks, setShowChunks] = useState(false), [resetKey, setResetKey] = useState(0);
  const [metricsOpen, setMetricsOpen] = useState(() => window.innerWidth > 540);
  const [result, setResult] = useState<BuildResult>({ meshes: [], rebuilt: 0, reused: 0, milliseconds: 0, resolution: initialVoxel.resolution });
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const nextId = useRef(2), cache = useRef(new Map<string, { signature: string; mesh: ChunkMesh }>());
  const [buildError, setBuildError] = useState('');
  useEffect(() => {
    let compact = window.innerWidth <= 540;
    const resize = () => {
      const next = window.innerWidth <= 540;
      if (next !== compact) { setMetricsOpen(!next); compact = next; }
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const chunks = listChunks(settings), meshes: ChunkMesh[] = [];
    const nextCache = new Map<string, { signature: string; mesh: ChunkMesh }>();
    let cancelled = false, timer = 0, cursor = 0, rebuilt = 0, reused = 0, milliseconds = 0;
    setProgress({ done: 0, total: chunks.length }); setBuildError('');
    const tick = () => {
      if (cancelled) return;
      try {
        const start = performance.now(), chunk = chunks[cursor], signature = chunkSignature(chunk, settings);
        const existing = cache.current.get(chunk.key);
        let mesh: ChunkMesh;
        if (existing?.signature === signature) { mesh = existing.mesh; reused++; }
        else { mesh = meshChunk(chunk, settings); rebuilt++; }
        meshes.push(mesh); nextCache.set(chunk.key, { signature, mesh });
        milliseconds += performance.now() - start; cursor++;
        setProgress({ done: cursor, total: chunks.length });
        if (cursor < chunks.length) timer = window.setTimeout(tick, 0);
        else {
          cache.current = nextCache;
          setResult({ meshes, rebuilt, reused, milliseconds, resolution: settings.resolution });
        }
      } catch (error) { setBuildError(error instanceof Error ? error.message : 'Could not build the mesh. Try a lower resolution.'); }
    };
    // Debounce sliders, then yield between chunks so edits can cancel obsolete work.
    timer = window.setTimeout(tick, 100);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [settings]);
  const update = (patch: Partial<VoxelSettings>) => setSettings(previous => ({ ...previous, ...patch }));
  const updateOperation = (id: number, patch: Partial<CsgOperation>) => setSettings(previous => ({ ...previous, operations: previous.operations.map(op => op.id === id ? { ...op, ...patch } : op) }));
  const reorder = (index: number, delta: number) => {
    const operations = [...settings.operations];
    [operations[index], operations[index + delta]] = [operations[index + delta], operations[index]];
    update({ operations });
  };
  const triangles = result.meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0);
  const vertices = result.meshes.reduce((total, mesh) => total + mesh.positions.length / 3, 0);
  const meshBytes = result.meshes.reduce((total, mesh) => total + mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength, 0);
  const peakSamples = result.meshes.reduce((max, mesh) => Math.max(max, mesh.sampleBytes), 0);
  const active = result.meshes.filter(mesh => mesh.indices.length > 0).length;
  const busy = progress.done < progress.total;
  const preset = (base: VoxelSettings['base'], operations: CsgOperation[] = []) => update({ base, operations });
  return <div className="noise-app voxel-app"><div className="noise-layout">
    <aside className="noise-controls" aria-label="Voxel terrain controls">
      <div className="noise-intro"><span className="noise-eyebrow">■ VOLUME / LAB</span><h1>Voxel terrain<span>02</span></h1><p>DENSITY → SURFACE</p></div>
      <p className="noise-hint">Build a solid, carve a passage, then inspect the surface. Every point has a density; zero is the boundary.</p>
      <section><h2><span>01</span> Density field</h2>
        <div className="voxel-presets"><button onClick={() => preset('terrain', [{ ...initialVoxel.operations[0], id: nextId.current++ }])}>Carved terrain</button><button onClick={() => preset('caves')}>Cave network</button><button onClick={() => preset('torus')}>Torus study</button></div>
        <label className="noise-select">Base density<select value={settings.base} onChange={e => update({ base: e.target.value as VoxelSettings['base'] })}><option value="terrain">Noise terrain</option><option value="caves">3D noise caves</option>{shapeOptions}</select></label>
        {(settings.base === 'terrain' || settings.base === 'caves') && <><Slider label="Terrain relief" value={settings.amplitude} min={0} max={5} step={0.1} onChange={amplitude => update({ amplitude })} /><Slider label="Terrain seed" value={settings.seed} min={0} max={40} onChange={seed => update({ seed })} /></>}
        <p className="noise-hint">Negative = solid · Positive = air<br />Volume: 16 × 16 × 16 world units.</p>
      </section>
      <section><h2><span>02</span> Sequential CSG <span className="noise-count">{settings.operations.length}/8</span></h2>
        <p className="noise-hint">Operations run from top to bottom. Reorder subtraction and union to see why sequence matters.</p>
        {settings.operations.map((op, index) => <div className="noise-layer" key={op.id}>
          <div className="noise-layer-heading"><label><input type="checkbox" aria-label={`Enable operation ${index + 1}`} checked={op.enabled} onChange={e => updateOperation(op.id, { enabled: e.target.checked })} />{String(index + 1).padStart(2, '0')} / {op.mode}</label><div className="voxel-operation-actions"><button aria-label={`Move operation ${index + 1} up`} disabled={index === 0} onClick={() => reorder(index, -1)}>↑</button><button aria-label={`Move operation ${index + 1} down`} disabled={index === settings.operations.length - 1} onClick={() => reorder(index, 1)}>↓</button><button aria-label={`Remove operation ${index + 1}`} onClick={() => update({ operations: settings.operations.filter(item => item.id !== op.id) })}>×</button></div></div>
          <label className="noise-select">Operation {index + 1} mode<select value={op.mode} onChange={e => updateOperation(op.id, { mode: e.target.value as CsgMode })}><option value="union">Union · add solid</option><option value="subtract">Subtract · carve away</option><option value="intersect">Intersect · keep overlap</option></select></label>
          <label className="noise-select">Operation {index + 1} shape<select value={op.shape} onChange={e => updateOperation(op.id, { shape: e.target.value as DensityShape })}>{shapeOptions}</select></label>
          <Slider label={`Operation ${index + 1} size`} value={op.size} min={0.5} max={6} step={0.1} onChange={size => updateOperation(op.id, { size })} />
          {(['X', 'Y', 'Z'] as const).map((axis, a) => <Slider key={axis} label={`Operation ${index + 1} ${axis}`} value={op.center[a]} min={-8} max={8} step={0.25} onChange={value => { const center: CsgOperation['center'] = [...op.center]; center[a] = value; updateOperation(op.id, { center }); }} />)}
        </div>)}
        <button className="noise-add" disabled={settings.operations.length >= 8} onClick={() => update({ operations: [...settings.operations, { id: nextId.current++, shape: 'sphere', mode: 'union', center: [0, 1, 0], size: 2, enabled: true }] })}>＋ Add operation</button>
        <p className="noise-hint">Sphere: radius · Box: half extent · Torus: ring radius (tube 35%) · Capsule: cap radius and half segment.</p>
      </section>
      <section><h2><span>03</span> Mesh & chunks</h2>
        <label className="noise-select">Meshing method<select value={settings.mesher} onChange={e => update({ mesher: e.target.value as VoxelSettings['mesher'] })}><option value="marching">Marching cubes · smooth surface</option><option value="blocks">Exposed voxel faces · block surface</option></select></label>
        <label className="noise-select">Volume resolution<select value={settings.resolution} onChange={e => update({ resolution: Number(e.target.value) })}>{[16, 32, 48, 64].map(n => <option key={n} value={n}>{n}³ · {(n ** 3).toLocaleString()} cells</option>)}</select></label>
        <label className="noise-select">Chunk edge length<select value={settings.chunkSize} onChange={e => update({ chunkSize: Number(e.target.value) })}>{[8, 16, 32, 64].map(n => <option key={n} value={n}>{n} cells{n >= settings.resolution ? ' · single chunk' : ''}</option>)}</select></label>
        <label className="simulation-toggle"><input type="checkbox" checked={showChunks} onChange={e => setShowChunks(e.target.checked)} />Show chunk boundaries</label>
        <p className="noise-hint">Cell width: {(settings.worldSize / settings.resolution).toFixed(3)} units. Increasing resolution sharpens detail; doubling it creates 8× as many cells.</p>
      </section>
      <section className="voxel-notes"><h2><span>04</span> Field notes</h2>
        <details><summary>How the density becomes a mesh</summary><p>Marching cubes reads eight corner densities, finds zero crossings on edges, then joins them with a triangle lookup table. A shared edge reuses its vertex within each chunk. Normals come from the field gradient.</p><p>The block mode samples cell centers and emits only solid-to-air faces. The two methods interpret samples differently, so thin features can differ.</p></details>
        <details><summary>Why chunking?</summary><p>A dense 256³-cell volume needs about 64.8 MiB for corner densities alone. Here each chunk is sampled and released in turn. Small local edits rebuild nearby chunks; unchanged CPU and GPU meshes are reused.</p><p>Smaller chunks limit rebuild work and allow independent view culling, but add draw calls and repeated border samples. Chunking does not reduce the total cell count. Intersection and global settings can invalidate the entire volume.</p></details>
        <details><summary>CSG equations & order</summary><p>With negative density inside: union = min(A, B), intersection = max(A, B), subtraction = max(A, −B).</p><p>Try subtracting a sphere and then adding a smaller sphere at the same center. Move the addition above the subtraction: the carved void removes the added solid too.</p></details>
        <details><summary>Alternative meshing techniques</summary><p>Greedy meshing merges coplanar voxel faces into larger rectangles: fewer triangles, with a block appearance. Marching tetrahedra splits each cell into tetrahedra: simpler cases, often more triangles. Dual contouring uses edge intersections and normals to preserve sharp features, with more complex vertex placement and topology.</p><p>Classic marching cubes can have ambiguous cases; this demo does not implement an ambiguity resolver or mixed-resolution seams.</p></details>
        <details><summary>Optimization & experiment</summary><p>Compare 16³, 32³ and 64³ at the same chunk size. Record triangles, mesh bytes and CPU build time. Then use 8-cell chunks and move a small sphere: compare rebuilt versus reused chunks. Toggle wireframe to inspect tessellation.</p><p>Implemented: indexed marching-cubes vertices, typed arrays, halo sampling, empty-mesh skipping, chunk cache, view culling and cancellable builds yielding between chunks. Next steps: workers, sparse storage, level of detail, and streaming. Timings exclude GPU upload and rendering; a large chunk can still pause the UI.</p></details>
        <a href="https://paulbourke.net/geometry/polygonise/" target="_blank" rel="noreferrer">Marching cubes reference ↗</a>
        <a href="https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/" target="_blank" rel="noreferrer">Voxel meshing comparison ↗</a>
        <a href="https://www.cs.rice.edu/~jwarren/papers/dualcontour.pdf" target="_blank" rel="noreferrer">Dual contouring paper ↗</a>
      </section>
      <button className="noise-reset" onClick={() => { setSettings({ ...initialVoxel }); setWireframe(false); setShowChunks(false); setResetKey(k => k + 1); }}>Reset voxel settings</button>
    </aside>
    <main className="noise-main" aria-label="3D voxel terrain viewport">
      <div className="noise-main-title"><span className="noise-eyebrow">VOLUMETRIC TERRAIN / PERSPECTIVE</span><h2>A surface from a solid.</h2><p>Carve beyond the height field.</p></div>
      <div className="noise-scene"><div className="noise-scene-toolbar"><div><button className={wireframe ? 'selected' : ''} aria-pressed={wireframe} onClick={() => setWireframe(value => !value)}>Wireframe</button><button onClick={() => setResetKey(k => k + 1)}>Reset view</button></div></div>
        <VoxelView meshes={result.meshes} worldSize={settings.worldSize} resolution={result.resolution} wireframe={wireframe} showChunks={showChunks} resetKey={resetKey} />
        <div className="noise-scene-footer"><span>Drag to orbit · Scroll to zoom · Right-drag to pan</span><span>{triangles.toLocaleString()} triangles</span></div>
      </div>
      <div className="voxel-status" role="status" aria-label="Voxel build status" aria-live="polite">{buildError ? `Build failed: ${buildError}` : busy ? `Building chunks ${progress.done} / ${progress.total} · previous surface shown` : triangles ? '● Surface ready' : '○ Empty surface · adjust the density or CSG stack'}</div>
      <details className="noise-map-dock voxel-metrics" open={metricsOpen} onToggle={event => setMetricsOpen(event.currentTarget.open)}><summary>VOLUME METRICS <span>− / +</span></summary><div className="noise-map-content">
        <p>{busy ? 'Last completed build' : 'Last build · CPU sampling + meshing'}</p>
        <dl><div><dt>Build time</dt><dd>{result.milliseconds.toFixed(1)} ms</dd></div><div><dt>Rebuilt / reused</dt><dd>{result.rebuilt} / {result.reused}</dd></div><div><dt>Surface / total chunks</dt><dd>{active} / {result.meshes.length}</dd></div><div><dt>Vertices</dt><dd>{vertices.toLocaleString()}</dd></div><div><dt>Mesh arrays</dt><dd>{bytes(meshBytes)}</dd></div><div><dt>Peak density buffer</dt><dd>{bytes(peakSamples)}</dd></div><div><dt>Dense corner equivalent</dt><dd>{bytes((result.resolution + 1) ** 3 * 4)}</dd></div></dl>
        <p className="voxel-memory-note">Array bytes exclude colors, GPU copies, cache overlap and temporary JS storage.</p>
      </div></details>
    </main>
  </div></div>;
}
