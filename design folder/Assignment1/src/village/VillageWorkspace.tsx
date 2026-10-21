import { useEffect, useState } from 'react';
import FarmView from './FarmView';
import { actOnPlot, advanceDay, advanceDays, calendar, createWorld, cropStatus, defaultParameters, expectedYield, Parameters, validateParameters } from './simulation';
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
  return <main className="village-workspace">
    <aside className="village-panel"><h1>Su’s Living Village</h1><p>Phase 1 · Weather → Soil → Crop → Harvest</p>
      <h2>Daily simulation</h2><div className="farm-actions">
        <button disabled={running} onClick={() => setWorld(w => advanceDay(w))}>Advance 1 day</button>
        <button disabled={running} onClick={() => setWorld(w => advanceDays(w, 30))}>Advance 30 days</button>
        <button onClick={() => setRemaining(running ? 0 : 30)}>{running ? 'Pause playback' : 'Play 30 days'}</button>
        <button onClick={() => reset(world.parameters)}>Reset simulation</button>
      </div><p role="status" aria-label="Farm simulation status">{running ? `Running · ${remaining} days remaining` : 'Paused'} · Day {world.day}</p>
      <h2>Selected plot</h2><label>Plot <select value={selected} onChange={e => setSelected(Number(e.target.value))}>{world.plots.map(p => <option key={p.id} value={p.id}>Plot {p.id + 1}</option>)}</select></label>
      <dl><dt>Soil moisture</dt><dd>{percent(plot.waterMm / world.parameters.soilCapacityMm)} ({plot.waterMm.toFixed(1)} mm)</dd><dt>Health / growth</dt><dd>{percent(crop?.health ?? null)} / {percent(crop?.growth ?? null)}</dd><dt>Crop status</dt><dd>{cropStatus(crop)}</dd><dt>Expected yield</dt><dd>{expectedYield(crop, world.parameters)} strawberries</dd><dt>Harvested total</dt><dd>{world.harvested}</dd></dl>
      <p>Expected yield is an estimate at maturity using current health and accumulated stress. Future weather can change it. Harvest only when Ready.</p>
      <div className="farm-actions">{(['water', 'plant', 'harvest', 'clear'] as const).map(action => <button key={action} disabled={running || (action === 'plant' && !!crop) || (action === 'harvest' && cropStatus(crop) !== 'Ready') || (action === 'clear' && cropStatus(crop) !== 'Dead')} onClick={() => setWorld(w => actOnPlot(w, selected, action))}>{action === 'water' ? 'Water +10 mm' : action === 'clear' ? 'Clear dead crop' : action === 'plant' ? 'Plant strawberries' : 'Harvest'}</button>)}</div>
      <h2>Editable parameters</h2><p>Apply starts a new seeded experiment. Nine plots begin planted; drainage varies slightly by column. Seasons last 28 days.</p>
      <form onSubmit={e => { e.preventDefault(); reset(draft); }}>{fields.map(([key, label, min, max, step]) => <label key={key}>{label}<input type="number" required min={min} max={max} step={step} value={Number.isNaN(draft[key]) ? '' : draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value === '' ? NaN : Number(e.target.value) }))} /></label>)}
      {error && <p role="alert">{error}</p>}<button type="submit">Apply parameters & reset</button><button type="button" onClick={() => { setDraft({ ...defaultParameters }); reset(defaultParameters); }}>Restore defaults</button></form>
      <p>Model rules: src/village/simulation.ts. Simple educational rules, not calibrated crop science. Switching workspace resets this prototype.</p>
    </aside>
    <section className="farm-main"><header><h2>Day {world.day} · {world.day ? calendar(world.day).name : 'Before first day'}</h2><p>{latest ? `${latest.kind} · ${latest.rainfallMm.toFixed(1)} mm rainfall · ${latest.temperatureC.toFixed(1)} °C` : 'Advance a day to generate weather.'}</p></header>
      <FarmView world={world} selected={selected} onSelect={setSelected} /><p className="farm-caption">Click a bed to select · Drag to orbit · Dark soil = wetter · Block height = growth · Red = mature · Brown = dead</p>
      <section className="farm-records"><div className="farm-record-heading"><h2>Daily observations · Plot {selected + 1}</h2><button disabled={!world.history.length} onClick={exportCsv}>Export all plots CSV</button></div><p>End-of-day snapshots. Manual watering and harvesting appear in the next daily record. Harvests are never automatic.</p>
      <div className="farm-table-scroll"><table><thead><tr>{['Day', 'Season', 'Weather', 'Rain mm', 'Temp °C', 'Moisture', 'Health', 'Growth', 'Expected yield', 'Status', 'Harvest total'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{world.history.map(day => { const p = day.plots[selected]; return <tr key={day.day}><td>{day.day}</td><td>{day.season}</td><td>{day.kind}</td><td>{day.rainfallMm.toFixed(1)}</td><td>{day.temperatureC.toFixed(1)}</td><td>{percent(p.moisture)}</td><td>{percent(p.health)}</td><td>{percent(p.growth)}</td><td>{p.expectedYield}</td><td>{p.status}</td><td>{day.harvested}</td></tr>; })}</tbody></table>{!world.history.length && <p>No days simulated yet. Use Advance 30 days to create a complete observation table.</p>}</div></section>
    </section>
  </main>;
}
