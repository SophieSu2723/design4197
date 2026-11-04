import { WorldState } from './simulation';
import { easternPlaces } from './places';
import { explorationWeather } from './exploration';
import Slider from '../../components/LabSlider';

export default function ExplorationPanel({ world, onStart, onDrive, onView }: { world: WorldState; onStart: () => void; onDrive: (value: number) => void; onView: () => void }) {
  const { su, mina } = world.population;
  const conditions = explorationWeather(world);
  const worn = Object.values(world.population.trails ?? {}).filter(t => t.wear >= 0.3);
  return <section className="exploration-panel" aria-labelledby="exploration-title">
    <p className="memory-eyebrow">BECOMING HOME / BEYOND THE BRIDGE</p><h2 id="exploration-title">A wider everyday world.</h2>
    <p>{world.landscape.expanded ? 'Four places across the river and ridge.' : 'Two places across the river; opening the ridge adds two more.'} First journeys become memories; repeated footsteps slowly become paths.</p>
    <div className="exploration-actions"><button onClick={onStart}>Start exploration study</button><button onClick={onView}>View east bank</button></div>
    <small>The study starts a new settled world with dry spring weather and playback at 8×. It replaces this run.</small>
    <p className={`travel-conditions ${conditions.allowed ? 'is-open' : ''}`}>{conditions.reason}</p>
    {(su.explorationReason || mina?.explorationReason) && <div className="exploration-reasons"><small>Today’s planned choices · recorded when the day began</small>{[su, mina].map(p => p?.explorationReason && <p key={p.id}><b>{p.name}</b> · {p.explorationReason}</p>)}</div>}
    <Slider label="Curiosity / exploration" min={0} max={2} step={0.1} value={world.population.explorationDrive ?? 1} onChange={onDrive} />
    <small>Next day’s plan · 0 keeps daily activities local; higher values favor expeditions. Rain, high water and low energy still limit travel.</small>
    <div className="exploration-places">{easternPlaces.filter(p => world.landscape.expanded || !p.extension).map(place => <article key={place.id}><h3>{place.name}</h3><p>{place.description}</p>{[su, mina].map((p, index) => { const memory = p?.placeMemories?.[place.id]; return <div key={index}><span>{index === 0 ? 'Su' : 'Mina'}</span><strong>{memory ? `${memory.visits} visits · first day ${memory.firstDay ?? memory.lastDay}` : p?.status === 'resident' ? 'Not visited' : 'Not settled'}</strong></div>; })}</article>)}</div>
    <p className="exploration-tally">Bridge crossings · Su {su.bridgeCrossings ?? 0} / Mina {mina?.bridgeCrossings ?? 0}<br />{worn.length} repeatedly walked segments</p>
    <small>Only completed footsteps expose a trail. Unused trails fade over subsequent days; grass along them gradually recovers. High water or bridge damage closes crossings until conditions recover.</small>
    {!!world.population.discoveries?.length && <ol className="discovery-log" aria-label="Discoveries">{world.population.discoveries.slice(-4).reverse().map(d => <li key={`${d.actor}-${d.place}`}><b>Day {d.day}</b> · {d.actor === 'su' ? 'Su' : 'Mina'} first reached {easternPlaces.find(p => p.id === d.place)?.name}.</li>)}</ol>}
  </section>;
}
