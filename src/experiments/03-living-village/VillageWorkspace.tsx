import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import FarmView, { CameraView, DragMode } from './rendering/FarmView';
import {
  actOnPlot, advanceDay, advanceDays, createWorld, cropStatus, defaultParameters,
  expectedYield, validateParameters, updateEcologyParameters,
} from './simulation';
import type { Parameters, WorldState } from './simulation';
import {
  arrivalEligibility, cancelInvitation, inspectPlacement, inviteMina, movePopulation,
  populationRules, recentHarvest, residentCount, settleMina, hasUnfinishedRoutine,
} from './population';
import type { Point, VillagerState } from './population';
import '../../components/NoiseWorkspace.css';
import './village.css';
import Slider from '../../components/LabSlider';
import PlaceMemoryPanel from './PlaceMemoryPanel';
import ExplorationPanel from './ExplorationPanel';
import DevelopmentPanel from './DevelopmentPanel';
import ResidentInspector from './ResidentInspector';
import VillageRecords from './VillageRecords';
import { bridgeOpen, expandValley, requestShop, tuneStorm, developmentOf } from './development';

type Panel = 'village' | 'development' | 'climate' | 'farm' | 'records';
const playbackDays = 30;
const panels = [['village', 'Village'], ['development', 'Build'], ['climate', 'Climate']] as const;
const fields: Array<[keyof Parameters, string, number, number, number]> = [
  ['rainChance', 'Spring rain probability', 0, 1, 0.05],
  ['rainMaxMm', 'Maximum daily rain (mm)', 0, 100, 1],
  ['colonizationRate', 'Seed-bank germination chance', 0, 0.3, 0.01],
  ['temperatureC', 'Spring temperature (°C)', -30, 50, 1],
  ['soilCapacityMm', 'Soil capacity (mm)', 1, 200, 1],
  ['evaporationMm', 'Base evaporation (mm/day)', 0, 30, 0.1],
  ['drainageRate', 'Drainage fraction', 0, 1, 0.05],
  ['fertility', 'Soil fertility', 0, 1, 0.05],
  ['uptakeMm', 'Crop uptake (mm/day)', 0, 20, 0.1],
  ['idealGrowingDays', 'Ideal growing days', 1, 100, 1],
  ['baseYield', 'Nominal yield per plot', 0, 100, 1],
  ['stressDamage', 'Daily stress damage', 0, 1, 0.01],
  ['recovery', 'Daily health recovery', 0, 1, 0.005],
];
const percent = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(1)}%`;

function latestChange(world: WorldState) {
  const { queuedStorm, bridgeIntegrity, shop } = developmentOf(world);
  if (queuedStorm) return 'Storm queued for next day';
  if (!bridgeOpen(world)) return bridgeIntegrity < 0.55 ? 'Bridge closed · Storm damage' : 'Bridge closed · High water';
  const latest = [...world.today].reverse().find(event =>
    event.type === 'population' || (event.type === 'action' && !!event.actorId)
  );
  if (latest) return latest.description;
  if (shop.lastDelivery?.day === world.day) return `Su delivered ${shop.lastDelivery.amount.toFixed(1)} food to the shop`;
  const { newPatches, lostPatches } = world.ecology.growthToday;
  if (newPatches || lostPatches) return `New growth · +${newPatches} / −${lostPatches} patches`;
  if (world.day === 0) return 'Start simulation to see the valley change';
  return null;
}

export default function VillageWorkspace({ world: sharedWorld, setWorld: sharedSetWorld }: {
  world?: WorldState;
  setWorld?: Dispatch<SetStateAction<WorldState>>;
} = {}) {
  const [localWorld, localSetWorld] = useState(() => sharedWorld ?? createWorld());
  const world = sharedWorld ?? localWorld, setWorld = sharedSetWorld ?? localSetWorld;
  const worldRef = useRef(world); worldRef.current = world;
  const sidebarRef = useRef<HTMLElement>(null);
  const [draftSeed, setDraftSeed] = useState(String(world.parameters.seed));
  const [selected, setSelected] = useState(4);
  const [inspectedId, setInspectedId] = useState<VillagerState['id'] | null>(null);
  const [sidebarSection, setSidebarSection] = useState<Panel>('village');
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [wireframe, setWireframe] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [showSoil, setShowSoil] = useState(false);
  const [showTrails, setShowTrails] = useState(true);
  const [cameraView, setCameraView] = useState<CameraView>('overview');
  const [dragMode, setDragMode] = useState<DragMode>('move');
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState('');
  const [placementError, setPlacementError] = useState('');
  const running = playing && remaining > 0;
  const { su, mina } = world.population;
  const development = developmentOf(world);
  const inspectedResident = inspectedId ? world.population[inspectedId] : null;
  const moving = hasUnfinishedRoutine(su) || !!(mina && hasUnfinishedRoutine(mina));
  const arrivalBlocked = mina?.status === 'arriving' || world.population.placementMode;
  const residentWalking = hasUnfinishedRoutine(su) || !!(mina?.status === 'resident' && hasUnfinishedRoutine(mina));
  const quickAdvanceBlocked = running || arrivalBlocked || residentWalking
    || mina?.status === 'resident' || world.landscape.expanded || development.queuedStorm;
  const selectedPlot = world.plots.find(plot => plot.id === selected) ?? world.plots[0];
  const maturePlots = world.plots.filter(plot => cropStatus(plot.crop) === 'Ready').length;
  const change = latestChange(world);

  const openPanel = (panel: Panel) => {
    setSidebarSection(panel);
    setSidebarHidden(false);
    if (sidebarRef.current) sidebarRef.current.scrollTop = 0;
    if (window.matchMedia?.('(max-width: 720px)').matches) {
      window.requestAnimationFrame(() => sidebarRef.current?.scrollIntoView({ block: 'start' }));
    }
  };
  const inspectResident = (id: VillagerState['id']) => {
    setInspectedId(id);
    setShowTarget(true);
    openPanel('village');
  };
  const closeInspector = () => { setInspectedId(null); setShowTarget(false); };
  const selectCamera = (view: CameraView) => {
    setCameraView(view);
    if (view !== 'free') setResetKey(key => key + 1);
  };
  const togglePlayback = () => {
    if (running) {
      setPlaying(false);
    } else {
      if (!remaining) setRemaining(playbackDays);
      setPlaying(true);
    }
  };

  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setWorld(w => movePopulation(w, 0.1 * speed)), 100);
    return () => window.clearInterval(timer);
  }, [moving, setWorld, speed]);
  useEffect(() => { if (arrivalBlocked) setPlaying(false); }, [arrivalBlocked]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const current = worldRef.current, person = current.population.mina;
      if (current.population.placementMode || person?.status === 'arriving') return;
      if (hasUnfinishedRoutine(current.population.su) || (person?.status === 'resident' && hasUnfinishedRoutine(person))) return;
      const next = advanceDay(current);
      worldRef.current = next;
      setWorld(next);
      setRemaining(left => Math.max(0, left - 1));
    }, 500);
    return () => window.clearInterval(timer);
  }, [running, setWorld]);

  const invite = () => {
    setPlaying(false);
    setPlacementError('');
    setWorld(w => inviteMina(w));
    openPanel('village');
  };
  const place = (point: Point) => {
    const checked = inspectPlacement(world, point);
    setPlacementError(checked.error);
    if (!checked.error) setWorld(w => settleMina(w, point));
  };
  const replaceWorld = (next: WorldState) => {
    worldRef.current = next;
    setWorld(next);
    setPlaying(false);
    setRemaining(0);
    setError('');
    setPlacementError('');
    closeInspector();
    selectCamera('overview');
  };
  const newRun = (parameters: Parameters) => {
    const message = validateParameters(parameters);
    if (message) { setError(message); return; }
    replaceWorld(createWorld(parameters));
    setDraftSeed(String(parameters.seed));
  };
  const startStudy = (explore: boolean) => {
    const initial = createWorld(explore ? { ...world.parameters, rainChance: 0, temperatureC: 18 } : world.parameters);
    const visitor: VillagerState = { ...initial.population.su, id: 'mina', name: 'Mina', profession: 'baker', status: 'visiting', homePosition: null };
    replaceWorld(settleMina(inviteMina({ ...initial, population: { ...initial.population, mina: visitor } }), { x: -4, z: 4 }));
    openPanel('village');
    if (explore) {
      setRemaining(playbackDays);
      setPlaying(true);
      setSpeed(8);
      setShowTrails(true);
    }
  };
  const controls = (keys: Array<keyof Parameters>) => fields.filter(([key]) => keys.includes(key)).map(([key, label, min, max, step]) => (
    <Slider key={key} label={label} value={world.parameters[key]} min={min} max={max} step={step}
      onChange={value => setWorld(w => updateEcologyParameters(w, { [key]: value }))} />
  ));

  return <div className="noise-app village-app">
    <div className={`village-layout${sidebarHidden ? ' village-layout-wide' : ''}`}>
      <aside id="village-controls" ref={sidebarRef} className="village-sidebar" hidden={sidebarHidden} aria-label="Living village controls">
        <nav className="village-panel-tabs" aria-label="Living village sections">
          {panels.map(([panel, label]) => <button key={panel} type="button" aria-pressed={sidebarSection === panel}
            onClick={() => openPanel(panel)}>{label}</button>)}
        </nav>
        <div className="village-panel-body">
          {sidebarSection === 'village' && <>
            <div className="village-resident-picker" aria-label="Residents">
              <button aria-pressed={inspectedId === 'su'} onClick={() => inspectResident('su')}>Su <small>Farmer</small></button>
              <button aria-pressed={inspectedId === 'mina'} disabled={!mina} onClick={() => inspectResident('mina')}>
                Mina <small>{mina ? 'Baker' : 'Not here yet'}</small>
              </button>
            </div>
            {mina?.status === 'visiting' && <div className="village-notice"><p>Mina is visiting the farmhouse.</p><button onClick={invite}>Invite Mina</button></div>}
            {world.population.placementMode && <div className="village-notice">
              <p>Click dry, gently sloping terrain to place Mina’s home.</p>
              <button onClick={() => { setWorld(w => cancelInvitation(w)); setPlacementError(''); }}>Cancel placement</button>
            </div>}
            {placementError && <p className="village-inline-error" role="alert">{placementError}</p>}
            {inspectedResident ? <ResidentInspector resident={inspectedResident} world={world} onClose={closeInspector} />
              : <p className="village-panel-hint">Select a resident to see their task and why they chose it.</p>}
            <details className="village-fold">
              <summary>Memory & routes</summary>
              <ExplorationPanel world={world} onDrive={value => setWorld(w => ({ ...w, population: { ...w.population, explorationDrive: value } }))}
                onTrailPreference={preferWalkedPaths => setWorld(w => ({ ...w, population: { ...w.population, preferWalkedPaths } }))} />
              <PlaceMemoryPanel mina={mina} onToggle={() => setWorld(w => !w.population.mina ? w : ({
                ...w, population: { ...w.population, mina: { ...w.population.mina, memoryFeedback: w.population.mina.memoryFeedback === false } },
              }))} />
            </details>
            <details className="village-fold">
              <summary>Population & settlement</summary>
              <dl className="village-facts">
                <div><dt>Residents / visitors</dt><dd>{residentCount(world)} / {mina && mina.status !== 'resident' ? 1 : 0}</dd></div>
                <div><dt>Food reserve</dt><dd>{world.population.foodReserve.toFixed(1)}</dd></div>
                <div><dt>Harvest · last 7 days</dt><dd>{recentHarvest(world)}</dd></div>
                <div><dt>Resident capacity</dt><dd>{populationRules.capacity}</dd></div>
                {mina && <div><dt>Mina first arrived</dt><dd>Day {mina.arrivalDay}</dd></div>}
              </dl>
              {!mina && <p className="village-panel-hint">{arrivalEligibility(world) ? 'The village has enough food for a visitor to arrive.' :
                `Arrival needs over ${populationRules.reserveThreshold} food in reserve and over ${populationRules.recentHarvestThreshold} harvested in 7 days.`}</p>}
              {mina?.spatialContext && <dl className="village-facts">
                <div><dt>Home → farm (walk)</dt><dd>{mina.spatialContext.routeLengthToFarm.toFixed(1)} m</dd></div>
                <div><dt>Home → river (walk)</dt><dd>{mina.spatialContext.routeLengthToRiver === null ? '—' : `${mina.spatialContext.routeLengthToRiver.toFixed(1)} m`}</dd></div>
                <div><dt>Home → path (walk)</dt><dd>{mina.spatialContext.routeLengthToPath === null ? '—' : `${mina.spatialContext.routeLengthToPath.toFixed(1)} m`}</dd></div>
                <div><dt>Site fertility</dt><dd>{percent(mina.spatialContext.fertility)}</dd></div>
                <div><dt>Site moisture at placement</dt><dd>{percent(mina.spatialContext.soilMoisture)}</dd></div>
              </dl>}
            </details>
          </>}
          {sidebarSection === 'development' && <DevelopmentPanel world={world}
            onExpand={() => { setWorld(w => expandValley(w)); selectCamera('ridge'); }}
            onBuild={() => setWorld(w => requestShop(w))} onClimate={() => openPanel('climate')}
            onFarm={() => openPanel('farm')} />}
          {sidebarSection === 'climate' && <>
            <h2>Climate</h2>
            <p className="village-panel-hint">Changes apply from the next simulated day.</p>
            <div className="village-card">
              <h3>Rain & growth</h3>
              {controls(['rainChance', 'rainMaxMm'])}
              <p className="village-panel-hint">Rain wets the ground, raises the river and can change where residents go.</p>
              {controls(['colonizationRate'])}
              <p className="village-panel-hint">More germination gives suitable ground more chances to grow new plants.</p>
              <dl className="village-facts">
                <div><dt>Rain today</dt><dd>{world.weather?.rainfallMm.toFixed(1) ?? '—'} mm</dd></div>
                <div><dt>River level</dt><dd>{world.ecology.riverLevel.toFixed(2)} m</dd></div>
              </dl>
            </div>
            <div className="village-card">
              <h3>Storms</h3>
              <Slider label="Peak storm wind (km/h)" min={0} max={120} step={5} value={development.windMaxKph}
                onChange={windMaxKph => setWorld(w => tuneStorm(w, { windMaxKph }))} />
              <button aria-pressed={development.queuedStorm} onClick={() => setWorld(w => tuneStorm(w, { queuedStorm: !developmentOf(w).queuedStorm }))}>
                {development.queuedStorm ? 'Cancel queued storm' : 'Queue one storm'}
              </button>
              <p className="village-panel-hint">{development.queuedStorm ? 'Storm queued for the next simulated day.' : 'Storm winds can damage trees, the bridge and the shop.'}</p>
            </div>
            <details className="village-fold">
              <summary>Land & water settings</summary>
              {controls(['temperatureC', 'soilCapacityMm', 'evaporationMm', 'drainageRate', 'fertility'])}
            </details>
            <details className="village-fold">
              <summary>Storm frequency</summary>
              <Slider label="Daily storm probability" min={0} max={1} step={0.05} value={development.stormChance}
                onChange={stormChance => setWorld(w => tuneStorm(w, { stormChance }))} />
            </details>
            <details className="village-fold">
              <summary>New run & studies</summary>
              <p className="village-panel-hint">Starting a new run replaces the current valley and history.</p>
              <label className="village-seed">Weather seed
                <input type="number" min="0" max="4294967295" step="1" value={draftSeed} onChange={e => setDraftSeed(e.target.value)} />
              </label>
              <div className="village-action-grid">
                <button onClick={() => newRun({ ...world.parameters, seed: draftSeed.trim() ? Number(draftSeed) : NaN })}>Generate world</button>
                <button onClick={() => newRun(world.parameters)}>Reset simulation</button>
                <button onClick={() => newRun(defaultParameters)}>Restore defaults</button>
                <button onClick={() => startStudy(false)}>Start settled-life study</button>
                <button onClick={() => startStudy(true)}>Start exploration study</button>
              </div>
              {error && <p role="alert" className="village-inline-error">{error}</p>}
            </details>
            <details className="village-fold">
              <summary>Quick ecology run</summary>
              <p className="village-panel-hint">Skips walks. Available before Mina settles or the ridge opens, with no storm queued.</p>
              <button disabled={quickAdvanceBlocked} onClick={() => { setPlaying(false); setRemaining(0); setWorld(w => advanceDays(w, 30)); openPanel('records'); }}>Advance 30 days</button>
            </details>
          </>}
          {sidebarSection === 'farm' && <>
            <div className="village-panel-heading"><h2>Farm</h2><button onClick={() => openPanel('development')}>Back to Build</button></div>
            <p className="village-panel-hint">{maturePlots} of {world.plots.length} plots ready to harvest</p>
            <div className="village-action-grid">
              <button disabled={running || !maturePlots} onClick={() => setWorld(w => w.plots.reduce((next, plot) => actOnPlot(next, plot.id, 'harvest'), w))}>Harvest ripe plots</button>
              <button disabled={running || !world.plots.some(plot => !plot.crop || plot.crop.health <= 0)}
                onClick={() => setWorld(w => w.plots.reduce((next, plot) => !plot.crop || plot.crop.health <= 0
                  ? actOnPlot(actOnPlot(next, plot.id, 'clear'), plot.id, 'plant') : next, w))}>Replant empty or lost crops</button>
            </div>
            <section className="village-card" aria-label="Selected plot">
              <h3>Plot {selectedPlot.id + 1} · {cropStatus(selectedPlot.crop)}</h3>
              <label htmlFor="selected-plot-moisture">Soil moisture {percent(selectedPlot.waterMm / world.parameters.soilCapacityMm)}</label>
              <progress id="selected-plot-moisture" aria-label="Selected plot soil moisture" value={selectedPlot.waterMm / world.parameters.soilCapacityMm} max={1} />
              <div className="village-action-grid">
                <button disabled={running || selectedPlot.waterMm >= world.parameters.soilCapacityMm} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'water'))}>Water +10 mm</button>
                {!selectedPlot.crop && <button disabled={running} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'plant'))}>Plant</button>}
                {cropStatus(selectedPlot.crop) === 'Ready' && <button disabled={running} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'harvest'))}>Harvest</button>}
                {cropStatus(selectedPlot.crop) === 'Dead' && <button disabled={running} onClick={() => setWorld(w => actOnPlot(w, selectedPlot.id, 'clear'))}>Clear dead crop</button>}
              </div>
            </section>
            <details className="village-fold">
              <summary>Crop details & rules</summary>
              <dl className="village-facts">
                <div><dt>Plot water</dt><dd>{selectedPlot.waterMm.toFixed(1)} / {world.parameters.soilCapacityMm} mm</dd></div>
                <div><dt>Crop health</dt><dd>{percent(selectedPlot.crop?.health ?? null)}</dd></div>
                <div><dt>Crop growth</dt><dd>{percent(selectedPlot.crop?.growth ?? null)}</dd></div>
                <div><dt>Expected plot yield</dt><dd>{expectedYield(selectedPlot.crop, world.parameters)}</dd></div>
                <div><dt>Total farm harvest</dt><dd>{world.harvested}</dd></div>
              </dl>
              {controls(['uptakeMm', 'idealGrowingDays', 'baseYield', 'stressDamage', 'recovery'])}
            </details>
          </>}
          {sidebarSection === 'records' && <VillageRecords world={world} plot={selected} />}
        </div>
      </aside>

      <main className="village-map-main" aria-label="Living valley viewport">
        <header className="village-map-header">
          <h1>Living Village</h1>
          <div className="village-play-controls" aria-label="Simulation controls">
            <button className="village-play-button" disabled={arrivalBlocked} onClick={togglePlayback}
              title={running ? 'Pause day advance. Current walks can finish.' : 'Play up to 30 days, waiting for walks to finish.'}>
              {running ? 'Pause' : remaining > 0 ? 'Resume' : 'Start Simulation'}
            </button>
            <button aria-label="Advance 1 day" title="Advance one day after residents finish walking" disabled={running || arrivalBlocked || residentWalking}
              onClick={() => setWorld(w => advanceDay(w))}>+1 Day</button>
            <label className="village-toolbar-field">Speed
              <select aria-label="Playback speed" title="Resident walking speed during the simulation" value={speed} onChange={e => setSpeed(Number(e.target.value))}>
                <option value={1}>1×</option><option value={4}>4×</option><option value={8}>8×</option>
              </select>
            </label>
          </div>
        </header>
        <div className="village-map-tools" aria-label="Map controls">
          <label className="village-toolbar-field"><span>Camera</span>
            <select aria-label="Camera view" value={cameraView} onChange={e => selectCamera(e.target.value as CameraView)}>
              {cameraView === 'free' && <option value="free">Free view</option>}
              <option value="overview">Whole valley</option><option value="east">East bank</option>
              <option value="ridge" disabled={!world.landscape.expanded}>Ridge & shop</option>
              <option value="su">Follow Su</option><option value="mina" disabled={!mina}>Follow Mina</option>
            </select>
          </label>
          <button onClick={() => selectCamera('overview')} title="Reset camera to the whole valley">Reset view</button>
          <label className="village-toolbar-field"><span>Inspect</span>
            <select aria-label="Inspect resident" value={inspectedResident?.id ?? ''} onChange={e => {
              const id = e.target.value;
              if (id === 'su' || id === 'mina') inspectResident(id);
              else closeInspector();
            }}>
              <option value="">Resident</option><option value="su">Su</option><option value="mina" disabled={!mina}>Mina</option>
            </select>
          </label>
          <div className="village-drag-controls" role="group" aria-label="Map drag mode">
            <button aria-pressed={dragMode === 'move'} onClick={() => setDragMode('move')}>Move</button>
            <button aria-pressed={dragMode === 'orbit'} onClick={() => setDragMode('orbit')}>Orbit</button>
          </div>
          <details className="village-overlay-menu">
            <summary>Overlays</summary>
            <div>
              <label><input type="checkbox" checked={showTrails} onChange={e => setShowTrails(e.target.checked)} /> Walked paths</label>
              <label><input type="checkbox" checked={showTarget} onChange={e => setShowTarget(e.target.checked)} /> Routes & sensing</label>
              <label><input type="checkbox" checked={showSoil} onChange={e => setShowSoil(e.target.checked)} /> Soil moisture</label>
              <label><input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)} /> Wireframe</label>
            </div>
          </details>
          <button className="village-side-toggle" aria-controls="village-controls" aria-expanded={!sidebarHidden}
            onClick={() => sidebarHidden ? openPanel(sidebarSection) : setSidebarHidden(true)}>{sidebarHidden ? 'Show controls' : 'Hide controls'}</button>
        </div>
        <div className="village-map-stage">
          <FarmView world={world} selected={sidebarSection === 'farm' && !sidebarHidden ? selected : -1}
            onSelect={id => { setSelected(id); openPanel('farm'); }} selectedResident={inspectedResident?.id}
            onSelectResident={inspectResident} wireframe={wireframe} showTarget={showTarget} showSoil={showSoil}
            showTrails={showTrails} cameraView={cameraView} dragMode={dragMode}
            onManualCamera={() => setCameraView('free')} resetKey={resetKey} onPlace={place} />
          <div id="village-map-caption" className="village-map-caption">{world.population.placementMode
            ? 'Click dry ground to place Mina’s home'
            : <>
              <span className="village-pointer-hint">{dragMode === 'move'
                ? 'Drag to move · Shift-drag to orbit · Scroll to zoom'
                : 'Drag to orbit · Shift-drag to move · Scroll to zoom'}</span>
              <span className="village-touch-hint">{dragMode === 'move' ? 'Drag to move' : 'Drag to orbit'} · Pinch to zoom</span>
            </>}</div>
          {showSoil && <div className="village-map-key">Soil moisture · Ochre dry · Blue wet</div>}
        </div>
        <footer className="village-map-status">
          <span role="status" aria-label="Simulation status">
            {running ? 'Running' : 'Paused'} · Day {world.day}{world.weather && ` · ${world.weather.kind}`}
          </span>
          {mina?.status === 'arriving' ? <span className="village-latest">Mina is arriving</span>
            : world.population.placementMode ? <span className="village-latest">Choose a site for Mina</span>
              : change && <span className="village-latest" title={change}>{change}</span>}
          {mina?.status === 'visiting' && <button className="village-invite-shortcut" onClick={() => openPanel('village')}>Mina is visiting</button>}
          <button className="village-records-button" aria-pressed={!sidebarHidden && sidebarSection === 'records'}
            onClick={() => openPanel('records')}>Records</button>
        </footer>
      </main>
    </div>
  </div>;
}
