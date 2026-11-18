import type { MemoryPlace, VillagerState } from './population';
import { placeNames } from './places';

const places: MemoryPlace[] = ['farm', 'river', 'path', 'clearing', 'ruins', 'shop', 'ridge', 'lookout'];
export default function PlaceMemoryPanel({ mina, onToggle }: {
  mina: VillagerState | null;
  onToggle: () => void;
}) {
  if (mina?.status !== 'resident') return null;
  const enabled = mina.memoryFeedback !== false;
  const visits = places.reduce((sum, key) => sum + (mina.placeMemories?.[key]?.visits ?? 0), 0);
  return <details className="village-fold">
    <summary>Mina’s place memory</summary>
    <label className="village-check">
      <input type="checkbox" checked={enabled} onChange={onToggle} /> Let familiarity influence future choices
    </label>
    <p className="village-panel-hint">{visits} completed {visits === 1 ? 'arrival' : 'arrivals'}</p>
    {mina.lastArrival && <p className="village-panel-hint">Latest · {placeNames[mina.lastArrival.place]} · Day {mina.lastArrival.day}</p>}
    <dl className="village-facts">
      {places.map(key => {
        const memory = mina.placeMemories?.[key];
        const familiarity = memory?.familiarity ?? 0;
        return <div key={key}>
          <dt>{placeNames[key]}</dt>
          <dd>{Math.round(familiarity * 100)}% · {memory?.visits ?? 0} visits</dd>
        </div>;
      })}
    </dl>
    <p className="village-panel-hint">Each completed arrival adds 10 familiarity points. Familiarity can raise a destination’s next-plan weight by up to 35%.</p>
  </details>;
}
