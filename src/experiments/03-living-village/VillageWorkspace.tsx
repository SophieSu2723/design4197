import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import FarmView, { CameraView } from './rendering/FarmView';
import { actOnPlot, advanceDay, advanceDays, createWorld, cropStatus, defaultParameters, expectedYield, Parameters, WorldState, validateParameters, updateEcologyParameters } from './simulation';
import '../../components/NoiseWorkspace.css';
import Slider from '../../components/LabSlider';
import './village.css';
import { arrivalEligibility, cancelInvitation, inspectPlacement, inviteMina, movePopulation, Point, populationRules, recentHarvest, residentCount, settleMina, VillagerState, hasUnfinishedRoutine } from './population';
import { Goal, goalNames, goals } from './behavior';
import PlaceMemoryPanel from './PlaceMemoryPanel';
import ExplorationPanel from './ExplorationPanel';
import { placeNames } from './places';
import DevelopmentPanel from './DevelopmentPanel';
import { expandValley, requestShop, tuneStorm, developmentOf } from './development';

const fields: Array<[keyof Parameters, string, number, number, number]> = [
  ['seed', 'Weather seed', 0, 4294967295, 1], ['rainChance', 'Spring rain probability', 0, 1, 0.05],
  ['rainMaxMm', 'Maximum daily rain (mm)', 0, 100, 1], ['temperatureC', 'Spring temperature (°C)', -30, 50, 1],
  ['soilCapacityMm', 'Soil capacity (mm)', 1, 200, 1], ['evaporationMm', 'Base evaporation (mm/day)', 0, 30, 0.1],
  ['drainageRate', 'Drainage fraction', 0, 1, 0.05], ['uptakeMm', 'Crop uptake (mm/day)', 0, 20, 0.1],
  ['idealGrowingDays', 'Ideal growing days', 1, 100, 1], ['baseYield', 'Nominal yield per plot', 0, 100, 1],
  ['stressDamage', 'Daily stress damage', 0, 1, 0.01], ['recovery', 'Daily health recovery', 0, 1, 0.005], ['fertility', 'Soil fertility', 0, 1, 0.05],
];
const percent = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(1)}%`;
const targetNames = placeNames;
const shortGoals: Record<Goal, string> = { REST: 'Rest', WORK: 'Work', VISIT_FARM: 'Farm', VISIT_RIVER: 'River', WALK: 'Walk', RETURN_HOME: 'Home', EXPLORE: 'Explore', SHOP: 'Shop' };
// Diagnostic readout of the decision Mina is currently walking: needs and weights at the moment she chose.
function Behavior({ mina }: { mina: VillagerState }) {
  const a = mina.activity, weights = a?.weights, total = weights ? goals.reduce((sum, g) => sum + weights[g], 0) : 0;
  const tally = (mina.recentGoals ?? []).flatMap(d => d.goals).reduce((n, g) => ({ ...n, [g]: (n[g] ?? 0) + 1 }), {} as Partial<Record<Goal, number>>);
  return <div aria-label="Mina behavior"><p className="noise-hint">BEHAVIOR · MINA / BAKER</p>
    <dl className="village-population-metrics">{[['Current goal', a ? `${goalNames[a.goal]} · ${a.part}` : 'Awaiting next day'], ['Target', a ? targetNames[a.target] : '—'], ['Energy', `${Math.round((a?.energy ?? mina.energy) * 100)}%`], ['Social need', `${Math.round((a?.socialNeed ?? mina.socialNeed ?? 0) * 100)}%`]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    <p className="noise-hint">{weights ? `Odds · ${goals.filter(g => weights[g] > 0).sort((x, y) => weights[y] - weights[x]).map(g => `${shortGoals[g]} ${Math.round(weights[g] / total * 100)}%`).join(' · ')}` : a ? 'Odds · end of day, walking home' : 'Odds appear once a day is planned.'}<br />Last {mina.recentGoals?.length ?? 0} {mina.recentGoals?.length === 1 ? 'day' : 'days'} (day parts) · {goals.filter(g => g !== 'RETURN_HOME').map(g => `${shortGoals[g]} ${tally[g] ?? 0}`).join(' · ')}</p></div>;
}
export default function VillageWorkspace({ world: sharedWorld, setWorld: sharedSetWorld }: { world?: WorldState; setWorld?: Dispatch<SetStateAction<WorldState>> } = {}) {
  const [localWorld, localSetWorld] = useState(() => sharedWorld ?? createWorld());
  const world = sharedWorld ?? localWorld, setWorld = sharedSetWorld ?? localSetWorld;
  const worldRef = useRef(world); worldRef.current = world;
  const [draft, setDraft] = useState<Parameters>({ ...defaultParameters });
  const [selected, setSelected] = useState(4);
  const [sidebarSection, setSidebarSection] = useState<'climate' | 'farm' | 'village' | 'development'>('climate');
  const [remaining, setRemaining] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [showSoil, setShowSoil] = useState(false);
  const [expandedWorld, setExpandedWorld] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [cameraView, setCameraView] = useState<CameraView>('overview');
  const [speed, setSpeed] = useState(4);
  const [resetKey, setResetKey] = useState(0);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [error, setError] = useState('');
  const [placementError, setPlacementError] = useState('');
  const running = remaining > 0;
  const mina = world.population.mina;
  const moving = [world.population.su, ...(mina ? [mina] : [])].some(p => p.route.length || p.itinerary.length || (p.dwellSeconds ?? 0) > 0);
  const arrivalBlocked = mina?.status === 'arriving' || world.population.placementMode;
  const residentWalking = [world.population.su, ...(mina?.status === 'resident' ? [mina] : [])].some(hasUnfinishedRoutine);
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setWorld(w => movePopulation(w, 0.1 * speed)), 100);
    return () => window.clearInterval(timer);
  }, [moving, setWorld, speed]);
  useEffect(() => { if (arrivalBlocked) { setRemaining(0); setRecordsOpen(false); } }, [arrivalBlocked]);
  const place = (point: Point) => {
    const checked = inspectPlacement(world, point);
    setPlacementError(checked.error);
    if (!checked.error) setWorld(w => settleMina(w, point));
  };
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const current = worldRef.current, person = current.population.mina;
      if ([current.population.su, ...(person?.status === 'resident' ? [person] : [])].some(hasUnfinishedRoutine)) return;
      const next = advanceDay(current); worldRef.current = next;
      setWorld(next); setRemaining(n => Math.max(0, n - 1));
    }, 500);
    return () => window.clearInterval(timer);
  }, [running, setWorld]);
  const latest = world.history[world.history.length - 1];
  const selectedPlot = world.plots.find(plot => plot.id === selected) ?? world.plots[0];
  const reset = (p: Parameters) => {
    const message = validateParameters(p); if (message) { setError(message); return; }
    setRemaining(0); setWorld(createWorld(p)); setError(''); setPlacementError('');
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
  const effects: Record<keyof Parameters, string> = {
    seed: 'New world only · changes seeded weather and vegetation placement.',
    rainChance: 'Next day · chance of rain; affects soil, runoff and outdoor activity.',
    rainMaxMm: 'Next rainy day · rain amount; affects saturation and river inflow.',
    temperatureC: 'Next day · seasonal baseline; affects evaporation, crops and walks.',
    soilCapacityMm: 'Next day · soil storage limit; excess water becomes runoff.',
    evaporationMm: 'Next day · water lost from soil; affects drought stress.',
    drainageRate: 'Next day · drainage to river; affects wet soil and river storage.',
    fertility: 'Next day · crop growth and vegetation suitability. Potential harvest estimate updates immediately.',
    uptakeMm: 'Next day · plant water demand; affects remaining soil water.',
    idealGrowingDays: 'Next day · growth speed under suitable conditions.',
    baseYield: 'Immediately · potential harvest estimate; does not grow crops.',
    stressDamage: 'Next day · crop health lost under unsuitable conditions.',
    recovery: 'Next day · crop health restored under suitable conditions.',
  };
  const controls = (keys: Array<keyof Parameters>) => fields.filter(([key]) => keys.includes(key)).map(([key, label, min, max, step]) => <div className="ecology-control" key={key}>{key === 'seed' ? <label className="noise-select">{label}<input aria-label={label} type="number" min={min} max={max} value={draft.seed} onChange={e => setDraft(d => ({ ...d, seed: Number(e.target.value) }))} /></label> : <Slider label={label} value={world.parameters[key]} min={min} max={max} step={step} onChange={value => setWorld(w => updateEcologyParameters(w, { [key]: value }))} />}<p className="control-effect">{effects[key]}</p></div>);
  const startExploration = () => {
    const initial = createWorld({ ...world.parameters, rainChance: 0, temperatureC: 18 });
    const visitor: VillagerState = { ...initial.population.su, id: 'mina', name: 'Mina', profession: 'baker', status: 'visiting', homePosition: null };
    const prepared = settleMina(inviteMina({ ...initial, population: { ...initial.population, mina: visitor } }), { x: -4, z: 4 });
    setWorld(prepared); worldRef.current = prepared; setRemaining(30); setSpeed(8); setRecordsOpen(false); setPlacementError(''); setShowTrails(true); setCameraView('overview');
  };
  return <div className={`noise-app village-app${expandedWorld ? ' world-expanded' : ''}`}><div className="noise-layout">
    <aside className="noise-controls" aria-label="Living village controls">
      <div className="noise-intro"><span className="noise-eyebrow">■ FIELD / LAB</span><h1>Living village<span>03</span></h1><p>CLICK A PLOT · CHANGE ITS ECOLOGY</p></div>
      <nav className="sidebar-sections" aria-label="Living village sections">
        {([['climate', 'Climate'], ['farm', 'Farm'], ['village', 'Village'], ['development', 'Build']] as const).map(([section, label]) => <button key={section} aria-pressed={sidebarSection === section} onClick={() => setSidebarSection(section)}>{label}</button>)}
      </nav>
      {sidebarSection === 'climate' && <>
      <section><h2><span>01</span> Time & climate</h2><p className="noise-hint">Advance time to see rain, soil, crops and daily life respond.</p>
        <div className="village-actions"><button disabled={running || arrivalBlocked || residentWalking} onClick={() => setWorld(w => advanceDay(w))}>Advance 1 day</button><button title="Instant ecology advance is unavailable with settled Mina, an expanded region or a queued storm; use playback to finish actual walks and repairs." disabled={running || arrivalBlocked || mina?.status === 'resident' || world.landscape.expanded || developmentOf(world).queuedStorm} onClick={() => { setWorld(w => advanceDays(w, 30)); setRecordsOpen(true); }}>Advance 30 days</button><button className="simulation-start" disabled={arrivalBlocked} onClick={() => setRemaining(running ? 0 : 30)}>{running ? 'Pause playback' : 'Play 30 days'}</button><button onClick={() => reset(world.parameters)}>Reset simulation</button></div>
        <p className="noise-hint" role="status" aria-label="Farm simulation status">{running ? `Running · ${remaining} days remaining` : 'Paused'} · Day {world.day}</p>
        {controls(['seed', 'rainChance', 'rainMaxMm', 'temperatureC'])}
        <label className="noise-select">Playback speed<select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1× · slow observation</option><option value={4}>4× · everyday life</option><option value={8}>8× · quicker comparison</option></select></label>
        <p className="control-effect">Immediately · speeds walks and pauses; ecological rules remain unchanged.</p>
      </section>
      <section><h2><span>02</span> Land & water</h2><p className="noise-hint">Adjust the rules, then advance a day. Existing soil water changes through simulation.</p>{controls(['soilCapacityMm', 'evaporationMm', 'drainageRate', 'fertility'])}
        <div className="village-mini-metrics"><span>Vegetation sites <b>{world.landscape.sites.filter(s => s.kind !== 'rock').length}</b></span><span>Soil fertility <b>{percent(average('soilFertility'))}</b></span></div>
      </section>
      {error && <p role="alert">{error}</p>}
      <button className="noise-add" onClick={() => reset({ ...world.parameters, seed: draft.seed })}>Generate new world with seed</button><button className="noise-reset" onClick={() => { setDraft({ ...defaultParameters }); reset(defaultParameters); }}>Restore defaults & new world</button>
      </>}
      {sidebarSection === 'farm' && <section className="farm-ecology" aria-label="Farm ecology">
        <h2><span>01</span> Selected plot <span className="noise-count">#{selectedPlot.id + 1}</span></h2>
        <p className="noise-hint">Click a farm bed in the scene to select it. Watering, planting and harvesting update that plot and its soil immediately.</p>
        <article className="selected-plot">
          <div className="selected-plot-heading"><strong>Plot {selectedPlot.id + 1}</strong><span>{cropStatus(selectedPlot.crop)}</span></div>
          <label htmlFor="selected-plot-moisture">Soil moisture <output>{percent(selectedPlot.waterMm / world.parameters.soilCapacityMm)}</output></label>
          <progress id="selected-plot-moisture" aria-label="Selected plot soil moisture" value={selectedPlot.waterMm / world.parameters.soilCapacityMm} max={1} />
          <div className="selected-plot-facts"><span>Water <b>{selectedPlot.waterMm.toFixed(1)} / {world.parameters.soilCapacityMm} mm</b></span><span>Crop health <b>{percent(selectedPlot.crop?.health ?? null)}</b></span><span>Growth <b>{percent(selectedPlot.crop?.growth ?? null)}</b></span><span>Expected harvest <b>{expectedYield(selectedPlot.crop, world.parameters)}</b></span></div>
          <div className="plot-actions">
            <button disabled={running || selectedPlot.waterMm >= world.parameters.soilCapacityMm} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'water'))}>Water +10 mm</button>
            <button disabled={running || !!selectedPlot.crop} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'plant'))}>Plant</button>
            <button disabled={running || cropStatus(selectedPlot.crop) !== 'Ready'} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'harvest'))}>Harvest</button>
            <button disabled={running || cropStatus(selectedPlot.crop) !== 'Dead'} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'clear'))}>Clear dead crop</button>
          </div>
        </article>
        <details className="farm-summary-details"><summary>Farm overview & bulk actions</summary>
          <dl className="village-population-metrics farm-summary">
            <div><dt>Farm soil moisture</dt><dd>{percent(world.plots.reduce((sum, p) => sum + p.waterMm / world.parameters.soilCapacityMm, 0) / world.plots.length)}</dd></div>
            <div><dt>Average crop growth</dt><dd>{percent(world.plots.reduce((sum, p) => sum + (p.crop?.growth ?? 0), 0) / Math.max(1, world.plots.filter(p => p.crop).length))}</dd></div>
            <div><dt>Crop health</dt><dd>{percent(farmHealth)}</dd></div>
            <div><dt>Ready · growing · stressed</dt><dd>{world.plots.filter(p => cropStatus(p.crop) === 'Ready').length} · {world.plots.filter(p => p.crop && p.crop.health > 0 && p.crop.growth < 1).length} · {world.plots.filter(p => p.crop && p.crop.health < 0.5).length}</dd></div>
            <div><dt>Expected food · harvested</dt><dd>{harvest} · {world.harvested}</dd></div>
          </dl>
          <div className="plot-actions bulk-plot-actions">
            <button disabled={running || !world.plots.some(p => cropStatus(p.crop) === 'Ready')} onClick={() => setWorld(w => w.plots.reduce((next, p) => actOnPlot(next, p.id, 'harvest'), w))}>Harvest ripe plots</button>
            <button disabled={running || !world.plots.some(p => !p.crop || p.crop.health <= 0)} onClick={() => setWorld(w => w.plots.reduce((next, p) => !p.crop || p.crop.health <= 0 ? actOnPlot(actOnPlot(next, p.id, 'clear'), p.id, 'plant') : next, w))}>Replant empty or lost crops</button>
          </div>
        </details>
        <details className="crop-rules"><summary>Crop response rules</summary>{controls(['uptakeMm', 'idealGrowingDays', 'baseYield', 'stressDamage', 'recovery'])}</details>
      </section>}
      {sidebarSection === 'village' && <>
      <section aria-label="Population"><h2><span>04</span> Population <span className="noise-count">{residentCount(world)}</span></h2>
        <dl className="village-population-metrics"><div><dt>Residents</dt><dd>{residentCount(world)}</dd></div><div><dt>Visitors</dt><dd>{mina && mina.status !== 'resident' ? 1 : 0}</dd></div><div><dt>Food reserve</dt><dd>{world.population.foodReserve.toFixed(1)}</dd></div><div><dt>Recent harvest · 7 days</dt><dd>{recentHarvest(world)}</dd></div><div><dt>Food capacity</dt><dd>{Math.floor(world.population.foodReserve / (7 * populationRules.dailyFoodPerResident))} resident-weeks</dd></div><div><dt>Resident capacity</dt><dd>{populationRules.capacity}</dd></div><div><dt>Settlement status</dt><dd>{mina?.status ?? 'No visitor yet'}</dd></div></dl>
        <p className="noise-hint">Su · farm owner · {world.population.su.currentGoal}</p>
        {!mina && <p className="noise-hint">Arrival requires food reserve &gt; {populationRules.reserveThreshold} and harvest in the last 7 days &gt; {populationRules.recentHarvestThreshold}. {arrivalEligibility(world) ? 'Eligible for a seeded arrival roll on the next day.' : 'Harvest ripe crops to create a surplus.'} Last eligible chance: {(world.population.lastProbability * 100).toFixed(0)}%.</p>}
        {mina && <p className="noise-hint">Mina · baker · {mina.currentGoal}<br />First seen on day {mina.arrivalDay}. Walkers move while ecology is paused; advance a day to schedule a resident’s next routine.</p>}
        {mina?.status === 'visiting' && <button className="noise-add simulation-start" onClick={() => { setRemaining(0); setPlacementError(''); setWorld(w => inviteMina(w)); }}>INVITE TO STAY</button>}
        {world.population.placementMode && <><p className="noise-hint">Click dry, gently sloping terrain for Mina’s home / bakery. Keep its footprint clear of paths, farms, and Su’s house.</p><button className="noise-add" onClick={() => { setWorld(w => cancelInvitation(w)); setPlacementError(''); }}>Cancel placement</button></>}
        {placementError && <p role="alert">{placementError}</p>}
        {mina?.status === 'resident' && <Behavior mina={mina} />}
        {mina?.spatialContext && <dl className="village-population-metrics">{[['To farm', mina.spatialContext.distanceToFarm], ['To river', mina.spatialContext.distanceToRiver], ['To path', mina.spatialContext.distanceToPath], ['To Su’s house', mina.spatialContext.distanceToFarmhouse], ['Home → farm (walk)', mina.spatialContext.routeLengthToFarm], ['Home → river (walk)', mina.spatialContext.routeLengthToRiver], ['Home → path (walk)', mina.spatialContext.routeLengthToPath]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null ? 'no route' : `${Number(value).toFixed(1)} m`}</dd></div>)}<div><dt>Site fertility</dt><dd>{percent(mina.spatialContext.fertility)}</dd></div><div><dt>Site moisture at placement</dt><dd>{percent(mina.spatialContext.soilMoisture)}</dd></div></dl>}
      </section>
      <PlaceMemoryPanel mina={mina} onStart={() => {
        const initial = createWorld(world.parameters);
        const visitor: VillagerState = { ...initial.population.su, id: 'mina', name: 'Mina', profession: 'baker', status: 'visiting', homePosition: null };
        const prepared = { ...initial, population: { ...initial.population, mina: visitor } };
        setRemaining(0); setRecordsOpen(false); setPlacementError('');
        setWorld(settleMina(inviteMina(prepared), { x: -4, z: 4 }));
      }} onToggle={() => setWorld(w => !w.population.mina ? w : ({ ...w, population: { ...w.population, mina: { ...w.population.mina, memoryFeedback: w.population.mina.memoryFeedback === false } } }))} />
      <ExplorationPanel world={world} onStart={startExploration} onDrive={value => setWorld(w => ({ ...w, population: { ...w.population, explorationDrive: value } }))} onView={() => setCameraView('east')} />
      </>}
      {sidebarSection === 'development' && <DevelopmentPanel world={world} onExpand={() => { setWorld(w => expandValley(w)); setCameraView('ridge'); }} onBuild={() => setWorld(w => requestShop(w))} onTune={patch => setWorld(w => tuneStorm(w, patch))} onView={() => { setCameraView('ridge'); setExpandedWorld(true); }} />}
      <p className="noise-hint sidebar-persistence-note">Climate and ecology edits preserve residents, memories and history. Only new-world actions reset the run. State survives tab switches, but not a page refresh.</p>
    </aside>
    <main className="noise-main" aria-label="Living valley viewport"><div className="noise-main-title"><span className="noise-eyebrow">LIVING SYSTEM / PERSPECTIVE</span><h2>Su’s living valley.</h2><p>Weather shapes what grows here.</p></div>
      <div className="noise-scene"><div className="noise-scene-toolbar"><div><button aria-pressed={expandedWorld} onClick={() => setExpandedWorld(v => !v)}>{expandedWorld ? 'Show sidebar' : 'Expand world'}</button><label className="camera-select">Camera<select aria-label="Camera view" value={cameraView} onChange={e => setCameraView(e.target.value as CameraView)}><option value="overview">Whole valley</option><option value="east">East bank</option><option value="ridge" disabled={!world.landscape.expanded}>Ridge & shop</option><option value="su">Follow Su</option><option value="mina" disabled={!mina}>Follow Mina</option></select></label><button aria-pressed={showTrails} className={showTrails ? 'selected' : ''} onClick={() => setShowTrails(v => !v)}>Walked paths</button><button aria-pressed={wireframe} className={wireframe ? 'selected' : ''} onClick={() => setWireframe(v => !v)}>Wireframe</button><button aria-pressed={showTarget} className={showTarget ? 'selected' : ''} disabled={mina?.status !== 'resident'} onClick={() => setShowTarget(v => !v)}>Behavior target</button><button onClick={() => { setCameraView('overview'); setResetKey(k => k + 1); }}>Reset view</button><button aria-expanded={recordsOpen} onClick={() => setRecordsOpen(v => !v)}>Daily records</button></div></div>
        <FarmView world={world} selected={selected} onSelect={id => { setSelected(id); setSidebarSection('farm'); }} wireframe={wireframe} showTarget={showTarget} showSoil={showSoil} showTrails={showTrails} cameraView={cameraView} resetKey={resetKey} onPlace={place} />
        <div className="noise-scene-footer"><span>Drag to orbit · Scroll to zoom · Right-drag to pan</span><span>{world.landscape.expanded ? '60' : '40'} × 40 m · 6-hour steps</span></div>
      </div>
      <section className="ecology-story" aria-label="Ecological cause and effect"><header><h2>Soil → river → farm → daily life</h2><button aria-label="Toggle soil moisture overlay" title="Color the landscape by soil moisture" aria-pressed={showSoil} onClick={() => setShowSoil(v => !v)}>{showSoil ? 'Moisture on' : 'Moisture off'}</button></header><p>Day {world.day} · {world.weather?.kind ?? 'Awaiting first day'} · {world.weather?.rainfallMm.toFixed(1) ?? '0.0'} mm rain · {world.weather?.temperatureC.toFixed(1) ?? '—'} °C</p><div className="ecology-chain"><article><b>Soil</b><strong>{percent(average('soilMoisture'))}</strong><span>{showSoil ? 'Ochre = dry · blue = wet' : 'Wet ground darkens; dry ground lightens.'}</span></article><article><b>River</b><strong>{world.ecology.riverLevel.toFixed(2)} m</strong><span>{world.ecology.runoffM3.toFixed(2)} m³ inflow · {world.ecology.dischargeM3.toFixed(2)} m³ discharge. Width follows water level.</span></article><article><b>Farm</b><strong>{percent(farmHealth)} health</strong><span>Leaves grow with crops and brown as health falls. Red fruit marks maturity.</span></article><article><b>Residents</b><strong>Su · {world.population.su.currentGoal}</strong><span>Mina · {mina?.currentGoal ?? 'not settled'}. Rain reduces outdoor choice weights; high water discourages river visits.</span></article></div><p className="ecology-explanation">{world.today.filter(e => e.type === 'soil' || e.type === 'river' || e.type === 'crop').map(e => e.description).join(' ') || 'Adjust climate, then advance a day. Rain is a probability: a higher chance does not change weather already recorded today.'}</p></section>
      {mina && mina.status !== 'resident' && <div className="village-visitor-notice" role="status" aria-label="Visitor status"><span>{world.population.placementMode ? 'Click terrain to place Mina’s home / bakery.' : mina.status === 'arriving' ? 'Mina is arriving from the eastern path.' : 'Mina, a baker, is visiting Su’s farmhouse.'}</span>{mina.status === 'visiting' && <button onClick={() => { setWorld(w => inviteMina(w)); setPlacementError(''); }}>Invite Mina</button>}</div>}
      <div className="world-playbar"><span>DAY {world.day} · {running ? 'Living world' : 'Daily clock paused'}{residentWalking ? ' · walks in progress' : ''}<br />Wind {developmentOf(world).windKph.toFixed(0)} km/h · {world.landscape.expanded ? '60 × 40 m' : '40 × 40 m'}{developmentOf(world).queuedStorm ? ' · Storm queued for next day' : ''}</span><button disabled={arrivalBlocked} onClick={() => setRemaining(running ? 0 : 30)}>{running ? 'Pause day advance' : 'Run world'}</button></div>
      <details className="noise-map-dock village-diagnostics"><summary>WORLD STATE <span>− / +</span></summary><div className="noise-map-content">
        <dl>{[['Season / Day', `${world.season} / ${world.day}`], ['Weather', latest?.kind ?? 'Awaiting first day'], ['Temperature', latest ? `${latest.temperatureC.toFixed(1)} °C` : '—'], ['Rainfall today', latest ? `${latest.rainfallMm.toFixed(1)} mm` : '—'], ['Soil moisture', percent(average('soilMoisture'))], ['River level', `${world.ecology.riverLevel.toFixed(2)} m above bed`], ['Vegetation health', percent(average('vegetationHealth'))], ['Farm health', percent(farmHealth)], ['Expected harvest', `${harvest} strawberries`], ['Residents / visitors', `${residentCount(world)} / ${mina && mina.status !== 'resident' ? 1 : 0}`], ...(mina?.activity ? [['Mina', goalNames[mina.activity.goal]]] : []), ['Food reserve', world.population.foodReserve.toFixed(1)]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        <div className="village-today"><h3>TODAY</h3>{world.today.length ? world.today.map((event, i) => <p key={i}><time>{event.time}</time><span>{event.description}</span></p>) : <p>Advance a day to observe environmental changes.</p>}<small>Interval-end observations · 24:00 = end of day</small></div>
      </div></details>
      {recordsOpen && <section className="village-records" aria-label="Daily observations"><div className="village-record-heading"><h2>Daily observations · Plot {selected + 1}</h2><button disabled={!world.history.length} onClick={exportCsv}>Export all plots CSV</button><button onClick={() => setRecordsOpen(false)}>Close</button></div><p className="noise-hint">End-of-day snapshots. Actions between days appear in the next record.</p><div className="village-table-scroll"><table><thead><tr>{['Day', 'Season', 'Weather', 'Rain mm', 'Temp °C', 'Moisture', 'Health', 'Growth', 'Expected yield', 'Status', 'Harvest total'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{world.history.map(day => { const p = day.plots[selected]; return <tr key={day.day}><td>{day.day}</td><td>{day.season}</td><td>{day.kind}</td><td>{day.rainfallMm.toFixed(1)}</td><td>{day.temperatureC.toFixed(1)}</td><td>{percent(p.moisture)}</td><td>{percent(p.health)}</td><td>{percent(p.growth)}</td><td>{p.expectedYield}</td><td>{p.status}</td><td>{day.harvested}</td></tr>; })}</tbody></table>{!world.history.length && <p className="noise-hint">No days simulated yet.</p>}</div></section>}
    </main>
  </div></div>;
}
