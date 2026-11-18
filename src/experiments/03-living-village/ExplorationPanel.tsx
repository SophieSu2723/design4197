import type { WorldState } from './simulation';
import { easternPlaces, placeNames } from './places';
import { explorationWeather } from './exploration';
import { wornTrailThreshold } from './trails';
import Slider from '../../components/LabSlider';

export default function ExplorationPanel({ world, onDrive, onTrailPreference }: {
  world: WorldState;
  onDrive: (value: number) => void;
  onTrailPreference: (enabled: boolean) => void;
}) {
  const { su, mina, discoveries, trails, explorationDrive, preferWalkedPaths } = world.population;
  const worn = Object.values(trails ?? {}).filter(t => t.wear >= wornTrailThreshold);
  return <section aria-label="Exploration and path preference">
    <Slider label="Curiosity / exploration" min={0} max={2} step={0.1} value={explorationDrive ?? 1} onChange={onDrive} />
    <label className="village-check">
      <input type="checkbox" checked={preferWalkedPaths !== false} onChange={event => onTrailPreference(event.target.checked)} />
      Prefer walked paths
    </label>
    <p className="village-panel-hint">{worn.length} worn segments · Preference applies to the next route.</p>
    <details className="village-fold">
      <summary>Trips & discoveries</summary>
      <p className="village-panel-hint">{explorationWeather(world).reason}</p>
      <dl className="village-facts">
        <div><dt>Crossings · Su / Mina</dt><dd>{su.bridgeCrossings ?? 0} / {mina?.bridgeCrossings ?? 0}</dd></div>
        {easternPlaces.filter(p => world.landscape.expanded || !p.extension).map(place => <div key={place.id}>
          <dt>{place.name} visits · Su / Mina</dt>
          <dd>{su.placeMemories?.[place.id]?.visits ?? 0} / {mina?.placeMemories?.[place.id]?.visits ?? 0}</dd>
        </div>)}
      </dl>
      {!!discoveries?.length && <ol className="village-event-list" aria-label="Discoveries">
        {discoveries.slice(-4).reverse().map(d => <li key={`${d.actor}-${d.place}`}>
          <time>Day {d.day}</time><span>{d.actor === 'su' ? 'Su' : 'Mina'} first reached {placeNames[d.place]}.</span>
        </li>)}
      </ol>}
    </details>
  </section>;
}
