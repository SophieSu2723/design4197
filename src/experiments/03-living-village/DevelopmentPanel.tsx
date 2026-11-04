import type { WorldState } from './simulation';
import Slider from '../../components/LabSlider';
import { bridgeOpen, developmentOf, shopOpen, Development } from './development';

export default function DevelopmentPanel({ world, onExpand, onBuild, onTune, onView }: { world: WorldState; onExpand: () => void; onBuild: () => void; onTune: (patch: Partial<Pick<Development, 'stormChance' | 'windMaxKph' | 'queuedStorm'>>) => void; onView: () => void }) {
  const d = developmentOf(world), damaged = Object.values(d.plantDamage), fallen = damaged.filter(p => p.fallen).length;
  const recovering = damaged.filter(p => p.fallen && p.recovery > 0.05).length;
  const shopStatus = !d.shop.requested ? 'Not commissioned' : d.shop.work < 2 ? `Building · ${d.shop.work}/2 work visits` : shopOpen(world) ? 'Open' : 'Closed · weather or damage';
  return <section className="development-panel" aria-labelledby="development-title">
    <p className="memory-eyebrow">LIVING TOGETHER / CHANGE & REPAIR</p><h2 id="development-title">Build. Weather. Recover.</h2>
    <p>New land makes room for a shared shop. Storms interrupt those connections; repair makes them usable again.</p>
    <article><h3>01 · Eastern ridge</h3><strong>{d.expanded ? '60 × 40 m · connected valley' : '40 × 40 m · original valley'}</strong>
      <button disabled={d.expanded} onClick={onExpand}>{d.expanded ? 'Eastern ridge is open' : 'Open eastern ridge'}</button>
      <small>Immediately · adds 20 × 40 m, meadow and lookout. Keeps existing soil, buildings, residents and memories.</small>
      {d.expanded && <button onClick={onView}>View ridge & shop</button>}
    </article>
    <article><h3>02 · Community shop</h3><strong>{shopStatus}</strong><progress aria-label="Shop construction" max={2} value={d.shop.work} />
      <button disabled={!d.expanded || d.shop.requested} onClick={onBuild}>{d.shop.requested ? 'Shop commissioned' : 'Commission shop'}</button>
      <small>Next dry days · Su builds on two completed work visits. No progress from a plan alone. Open the ridge first, then use Run world.</small>
      <dl><div><dt>Building integrity</dt><dd>{Math.round(d.shop.integrity * 100)}%</dd></div><div><dt>Food on shelves</dt><dd>{d.shop.stock.toFixed(1)} / 12</dd></div><div><dt>Completed visits / meals</dt><dd>{d.shop.visits} / {d.shop.served}</dd></div></dl>
      <small>Daily restock moves up to 4 food from harvest reserves, leaving 4 in the village. A completed customer visit consumes 1 food and restores energy. Empty shelves still allow a social visit.</small>
    </article>
    <article><h3>03 · Storms & recovery</h3>
      <Slider label="Daily storm probability" min={0} max={1} step={0.05} value={d.stormChance} onChange={stormChance => onTune({ stormChance })} />
      <small>Next day · seeded storm chance. A storm brings at least 45 mm of rain; its wind depends on the control below.</small>
      <Slider label="Peak storm wind (km/h)" min={0} max={120} step={5} value={d.windMaxKph} onChange={windMaxKph => onTune({ windMaxKph })} />
      <small>Next storm · wind above 40 km/h damages exposed plants and structures; at 55 km/h residents shelter.</small>
      <button className={d.queuedStorm ? 'storm-queued' : ''} onClick={() => onTune({ queuedStorm: !d.queuedStorm })}>{d.queuedStorm ? 'Cancel queued storm' : 'Queue one storm'}</button>
      <small>{d.queuedStorm ? `Next day will bring at least 45 mm rain and ${d.windMaxKph} km/h wind. Current walks finish first.` : 'Next day only · queues a storm using the selected peak wind, without resetting this world.'}</small>
      <dl><div><dt>Wind today</dt><dd>{d.windKph.toFixed(0)} km/h</dd></div><div><dt>Bridge</dt><dd>{bridgeOpen(world) ? 'Open' : 'Closed'} · {Math.round(d.bridgeIntegrity * 100)}%</dd></div><div><dt>Damaged plant sites</dt><dd>{damaged.filter(p => p.damage > 0).length}</dd></div><div><dt>Fallen trees / new saplings</dt><dd>{fallen} / {recovering}</dd></div></dl>
      <small>Following days · Su prioritizes bridge repairs, then shop repairs, in calm weather and low water. Fallen trunks remain; new saplings appear after suitable moist days. These are simplified rules, not an engineering damage forecast.</small>
    </article>
    {!!d.journal.length && <div className="development-journal"><h3>What changed, and why</h3><ol aria-label="Building and storm history">{d.journal.slice(-6).reverse().map((entry, i) => <li key={`${entry.day}-${i}`}><b>Day {entry.day}</b> · {entry.text}</li>)}</ol></div>}
  </section>;
}
