import { useEffect, useState } from 'react';
import FarmView from './FarmView';
import { actOnPlot, advanceDay, advanceDays, createWorld, cropStatus, defaultParameters, expectedYield, Parameters, validateParameters } from './simulation';
import '../components/NoiseWorkspace.css';
import Slider from '../components/LabSlider';
import './village.css';

const fields: Array<[keyof Parameters, string, number, number, number]> = [
  ['seed', 'Weather seed', 0, 4294967295, 1], ['rainChance', 'Spring rain probability', 0, 1, 0.05],
  ['rainMaxMm', 'Maximum daily rain (mm)', 0, 100, 1], ['temperatureC', 'Spring temperature (°C)', -30, 50, 1],
  ['soilCapacityMm', 'Soil capacity (mm)', 1, 200, 1], ['evaporationMm', 'Base evaporation (mm/day)', 0, 30, 0.1],
  ['drainageRate', 'Drainage fraction', 0, 1, 0.05], ['uptakeMm', 'Crop uptake (mm/day)', 0, 20, 0.1],
  ['idealGrowingDays', 'Ideal growing days', 1, 100, 1], ['baseYield', 'Nominal yield per plot', 0, 100, 1],
  ['stressDamage', 'Daily stress damage', 0, 1, 0.01], ['recovery', 'Daily health recovery', 0, 1, 0.005], ['fertility', 'Soil fertility', 0, 1, 0.05],
];
const percent = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(1)}%`;
export default function VillageWorkspace() {
  const [world, setWorld] = useState(() => createWorld());
  const [draft, setDraft] = useState<Parameters>({ ...defaultParameters });
  const [selected, setSelected] = useState(4);
  const [remaining, setRemaining] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [error, setError] = useState('');
  const running = remaining > 0;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { setWorld(w => advanceDay(w)); setRemaining(n => Math.max(0, n - 1)); }, 500);
    return () => window.clearInterval(timer);
  }, [running]);
  const plot = world.plots[selected], crop = plot.crop;
  const latest = world.history[world.history.length - 1];
  const reset = (p: Parameters) => {
    const message = validateParameters(p); if (message) { setError(message); return; }
    setRemaining(0); setWorld(createWorld(p)); setError('');
  };
  const exportCsv = () => {
    const rows = ['day,season,weather,rainfall_mm,temperature_c,plot,moisture,health,growth,expected_yield,status,harvested_total'];
    world.history.forEach(day => day.plots.forEach(p => rows.push([day.day, day.season, day.kind, day.rainfallMm, day.temperatureC, p.id + 1, p.moisture, p.health ?? '', p.growth ?? '', p.expectedYield, p.status, day.harvested].join(','))));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const link = document.createElement('a'); link.href = url; link.download = 'living-village-daily.csv'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const average = (key: 'soilMoisture' | 'vegetationHealth' | 'soilFertility') => world.ecology.cells.reduce((sum, cell) => sum + cell[key], 0) / world.ecology.cells.length;
  const farmHealth = world.plots.reduce((sum, p) => sum + (p.crop?.health ?? 0), 0) / Math.max(1, world.plots.filter(p => p.crop).length);
  const harvest = world.plots.reduce((sum, p) => sum + expectedYield(p.crop, world.parameters), 0);
  const controls = (keys: Array<keyof Parameters>) => fields.filter(([key]) => keys.includes(key)).map(([key, label, min, max, step]) => key === 'seed' ? <label key={key} className="noise-select">{label}<input aria-label={label} type="number" min={min} max={max} value={draft.seed} onChange={e => setDraft(d => ({ ...d, seed: Number(e.target.value) }))} /></label> : <Slider key={key} label={label} value={draft[key]} min={min} max={max} step={step} onChange={value => setDraft(d => ({ ...d, [key]: value }))} />);
  return <div className="noise-app village-app"><div className="noise-layout">
    <aside className="noise-controls" aria-label="Living village controls">
      <div className="noise-intro"><span className="noise-eyebrow">■ FIELD / LAB</span><h1>Living village<span>03</span></h1><p>CLIMATE → ECOLOGY → GROWTH</p></div>
      <section><h2><span>01</span> Time & climate</h2><p className="noise-hint">A day advances four six-hour intervals. Same seed and actions, same experiment.</p>
        <div className="village-actions"><button disabled={running} onClick={() => setWorld(w => advanceDay(w))}>Advance 1 day</button><button disabled={running} onClick={() => { setWorld(w => advanceDays(w, 30)); setRecordsOpen(true); }}>Advance 30 days</button><button className="simulation-start" onClick={() => setRemaining(running ? 0 : 30)}>{running ? 'Pause playback' : 'Play 30 days'}</button><button onClick={() => reset(world.parameters)}>Reset simulation</button></div>
        <p className="noise-hint" role="status" aria-label="Farm simulation status">{running ? `Running · ${remaining} days remaining` : 'Paused'} · Day {world.day}</p>
        {controls(['seed', 'rainChance', 'rainMaxMm', 'temperatureC'])}
      </section>
      <section><h2><span>02</span> Ecology</h2><p className="noise-hint">Slope and distance to the stream shape drainage, fertility, and plant suitability. Rain changes soil, river storage, and vegetation.</p>{controls(['soilCapacityMm', 'evaporationMm', 'drainageRate', 'fertility'])}
        <div className="village-mini-metrics"><span>Vegetation sites <b>{world.landscape.sites.filter(s => s.kind !== 'rock').length}</b></span><span>Soil fertility <b>{percent(average('soilFertility'))}</b></span></div>
      </section>
      <section><h2><span>03</span> Farm</h2><label className="noise-select">Plot<select value={selected} onChange={e => setSelected(Number(e.target.value))}>{world.plots.map(p => <option key={p.id} value={p.id}>Plot {p.id + 1}</option>)}</select></label>
        <p className="noise-hint">{cropStatus(crop)} · growth {percent(crop?.growth ?? null)} · health {percent(crop?.health ?? null)}<br />Moisture {percent(plot.waterMm / world.parameters.soilCapacityMm)} · expected yield {expectedYield(crop, world.parameters)}<br />Harvested total: {world.harvested}</p>
        <div className="village-actions">{(['water', 'plant', 'harvest', 'clear'] as const).map(action => <button key={action} disabled={running || (action === 'plant' && !!crop) || (action === 'harvest' && cropStatus(crop) !== 'Ready') || (action === 'clear' && cropStatus(crop) !== 'Dead')} onClick={() => setWorld(w => actOnPlot(w, selected, action))}>{action === 'water' ? 'Water +10 mm' : action === 'clear' ? 'Clear dead crop' : action === 'plant' ? 'Plant strawberries' : 'Harvest'}</button>)}</div>
        {controls(['uptakeMm', 'idealGrowingDays', 'baseYield', 'stressDamage', 'recovery'])}
        <p className="noise-hint">Expected harvest reflects current health and stress history; future conditions can change it. Harvest mature crops manually.</p>
      </section>
      <section><h2><span>04</span> Population <span className="noise-count">0</span></h2><button disabled className="noise-add">Residents · not enabled</button><p className="noise-hint">This experiment models ecology and farming only.</p></section>
      {error && <p role="alert">{error}</p>}<button className="noise-add" onClick={() => reset(draft)}>Apply parameters & reset</button><button className="noise-reset" onClick={() => { setDraft({ ...defaultParameters }); reset(defaultParameters); }}>Restore defaults</button><p className="noise-hint">Parameter edits apply on reset. Export observations before leaving this workspace; state is currently held in memory.</p>
    </aside>
    <main className="noise-main" aria-label="Living valley viewport"><div className="noise-main-title"><span className="noise-eyebrow">LIVING SYSTEM / PERSPECTIVE</span><h2>Su’s living valley.</h2><p>Weather shapes what grows here.</p></div>
      <div className="noise-scene"><div className="noise-scene-toolbar"><div><button aria-pressed={wireframe} className={wireframe ? 'selected' : ''} onClick={() => setWireframe(v => !v)}>Wireframe</button><button onClick={() => setResetKey(k => k + 1)}>Reset view</button><button aria-expanded={recordsOpen} onClick={() => setRecordsOpen(v => !v)}>Daily records</button></div></div>
        <FarmView world={world} selected={selected} onSelect={setSelected} wireframe={wireframe} resetKey={resetKey} />
        <div className="noise-scene-footer"><span>Drag to orbit · Scroll to zoom · Right-drag to pan · Click a farm plot</span><span>40 × 40 m · 6-hour steps</span></div>
      </div>
      <details className="noise-map-dock village-diagnostics" open><summary>WORLD STATE <span>− / +</span></summary><div className="noise-map-content">
        <dl>{[['Season / Day', `${world.season} / ${world.day}`], ['Weather', latest?.kind ?? 'Awaiting first day'], ['Temperature', latest ? `${latest.temperatureC.toFixed(1)} °C` : '—'], ['Rainfall today', latest ? `${latest.rainfallMm.toFixed(1)} mm` : '—'], ['Soil moisture', percent(average('soilMoisture'))], ['River level', `${world.ecology.riverLevel.toFixed(2)} m above bed`], ['Vegetation health', percent(average('vegetationHealth'))], ['Farm health', percent(farmHealth)], ['Expected harvest', `${harvest} strawberries`]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        <div className="village-today"><h3>TODAY</h3>{world.today.length ? world.today.map((event, i) => <p key={i}><time>{event.time}</time><span>{event.description}</span></p>) : <p>Advance a day to observe environmental changes.</p>}<small>Interval-end observations · 24:00 = end of day</small></div>
      </div></details>
      {recordsOpen && <section className="village-records" aria-label="Daily observations"><div className="village-record-heading"><h2>Daily observations · Plot {selected + 1}</h2><button disabled={!world.history.length} onClick={exportCsv}>Export all plots CSV</button><button onClick={() => setRecordsOpen(false)}>Close</button></div><p className="noise-hint">End-of-day snapshots. Actions between days appear in the next record.</p><div className="village-table-scroll"><table><thead><tr>{['Day', 'Season', 'Weather', 'Rain mm', 'Temp °C', 'Moisture', 'Health', 'Growth', 'Expected yield', 'Status', 'Harvest total'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{world.history.map(day => { const p = day.plots[selected]; return <tr key={day.day}><td>{day.day}</td><td>{day.season}</td><td>{day.kind}</td><td>{day.rainfallMm.toFixed(1)}</td><td>{day.temperatureC.toFixed(1)}</td><td>{percent(p.moisture)}</td><td>{percent(p.health)}</td><td>{percent(p.growth)}</td><td>{p.expectedYield}</td><td>{p.status}</td><td>{day.harvested}</td></tr>; })}</tbody></table>{!world.history.length && <p className="noise-hint">No days simulated yet.</p>}</div></section>}
    </main>
  </div></div>;
}
