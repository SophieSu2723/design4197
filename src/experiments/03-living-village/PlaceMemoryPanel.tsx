import { MemoryPlace, VillagerState } from './population';

const places: Array<[MemoryPlace, string]> = [['farm', 'Su’s farm'], ['river', 'River bank'], ['path', 'Village path'], ['clearing', 'Fern clearing'], ['ruins', 'Old stone garden'], ['shop', 'Community shop'], ['ridge', 'Meadow ridge'], ['lookout', 'Wind lookout']];
export default function PlaceMemoryPanel({ mina, onStart, onToggle }: { mina: VillagerState | null; onStart: () => void; onToggle: () => void }) {
  const resident = mina?.status === 'resident';
  const enabled = mina?.memoryFeedback !== false;
  const visits = places.reduce((sum, [key]) => sum + (mina?.placeMemories?.[key]?.visits ?? 0), 0);
  const destination = places.find(([key]) => key === mina?.activity?.target)?.[1];
  return <section className="place-memory" aria-labelledby="place-memory-title">
    <p className="memory-eyebrow">BECOMING HOME / MINA</p>
    <h2 id="place-memory-title">A place becomes familiar.</h2>
    <p>Each arrival leaves a memory. Familiar places gently draw Mina back.</p>
    {!resident || !mina ? <><p>Start a prepared settlement to observe this process, or invite Mina through the farm experiment below.</p><button onClick={onStart}>Start settled-life study</button><small>Starts a new day-zero scenario with Mina’s home beside the farm. Replaces this run.</small></> : <>
      <ol className="memory-process">
        <li><span>01 / EXPERIENCE</span><strong>{destination && mina.route.length ? `Walking to ${destination}` : 'Daily life in the valley'}</strong><p>{mina.activity?.reason ?? (destination && mina.route.length ? 'On the way — this visit is not recorded yet.' : 'Advance a day to plan a routine. Watch the walks finish.')}</p></li>
        <li><span>02 / REMEMBER</span><strong>{visits} completed {visits === 1 ? 'arrival' : 'arrivals'}</strong><p>{mina.lastArrival ? `Latest: ${places.find(([key]) => key === mina.lastArrival!.place)?.[1]} · day ${mina.lastArrival.day}` : 'No outdoor destinations reached yet.'}</p></li>
        <li><span>03 / RETURN</span><strong>{enabled ? 'Memory influences the next plan' : 'Memory influence paused'}</strong><p>Weather, needs and distance still matter. Familiarity increases a place’s choice weight by at most 35%, not its probability by 35 points.</p></li>
      </ol>
      <div className="memory-places">{places.map(([key, name]) => {
        const m = mina.placeMemories?.[key], f = m?.familiarity ?? 0;
        return <article key={key}><header><h3>{name}</h3><b>{Math.round(f * 100)}%</b></header><progress aria-label={`${name} familiarity`} value={f} max={1} /><p>{m?.visits ?? 0} arrivals · {m ? `last day ${m.lastDay}` : 'not visited'}</p><strong>Next-plan weight ×{(enabled ? 1 + 0.35 * f : 1).toFixed(2)}</strong></article>;
      })}</div>
      <label className="memory-toggle"><input type="checkbox" checked={enabled} onChange={onToggle} /> Let familiarity influence future choices</label>
      <small>Each completed destination adds 10 familiarity points, up to 100. Switching off keeps memories and removes their influence from the next day’s plan. This models familiarity, not emotion.</small>
    </>}
  </section>;
}
