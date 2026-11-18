import type { WorldState } from './simulation';
import { bridgeOpen, deliveryBlock, developmentOf, farmLoad, shopOpen, shopSupply } from './development';

export default function DevelopmentPanel({ world, onExpand, onBuild, onClimate, onFarm }: {
  world: WorldState;
  onExpand: () => void;
  onBuild: () => void;
  onClimate: () => void;
  onFarm: () => void;
}) {
  const d = developmentOf(world);
  const damage = Object.values(d.plantDamage);
  const { su, foodReserve } = world.population;
  const cargo = su.cargoFood ?? 0;
  const shopBuilt = d.shop.work >= 2;
  const crossingOpen = bridgeOpen(world);
  const shopStatus = !d.shop.requested ? 'Not commissioned'
    : shopBuilt ? (shopOpen(world) ? 'Open' : 'Closed') : `Building · ${d.shop.work}/2 work visits`;
  const deliveryStatus = su.routeIssue && su.deliveryLeg ? 'Delivery route blocked'
    : deliveryBlock(world) ?? (su.deliveryLeg === 'dropoff' && cargo > 0 ? 'Su is delivering food.'
      : su.deliveryLeg === 'pickup' && cargo === 0 ? 'Su is collecting food.'
        : cargo > 0 ? 'Su has food for the next delivery.'
          : d.shop.stock >= shopSupply.capacity ? 'Shelves full.'
            : farmLoad(world) > 0 ? 'Surplus ready for delivery.' : 'Harvest ripe crops to build a surplus.');
  return <section aria-labelledby="village-build-title">
    <h2 id="village-build-title">Build</h2>
    <div className="village-card">
      <h3>Eastern ridge</h3>
      {d.expanded ? <p className="village-panel-hint">Open · 60 × 40 m valley</p> : <button onClick={onExpand}>Open eastern ridge</button>}
    </div>
    <div className="village-card">
      <div className="village-panel-heading"><h3>Community shop</h3><span className="village-state-label">{shopStatus}</span></div>
      {!d.shop.requested && <button title={!d.expanded ? 'Open the eastern ridge first' : undefined} disabled={!d.expanded} onClick={onBuild}>Commission shop</button>}
      {d.shop.requested && !shopBuilt && <>
        <progress aria-label="Shop construction" max={2} value={d.shop.work} />
        <p className="village-panel-hint">Su builds in two dry-weather visits.</p>
      </>}
      {shopBuilt && <>
        <dl className="village-supply">
          <div><dt>At farm</dt><dd>{foodReserve.toFixed(1)}</dd></div>
          <div><dt>With Su</dt><dd>{cargo.toFixed(1)}</dd></div>
          <div><dt>On shelves</dt><dd>{d.shop.stock.toFixed(1)}</dd></div>
        </dl>
        <p className="village-panel-hint">{deliveryStatus}</p>
      </>}
      <button className="village-text-button" onClick={onFarm}>Farm harvest ↗</button>
    </div>
    <div className="village-card">
      <div className="village-panel-heading"><h3>Storm & recovery</h3><span className={crossingOpen ? 'village-state-label' : 'village-state-label warning'}>
        Bridge {crossingOpen ? 'open' : 'closed'}
      </span></div>
      <p className="village-panel-hint">Bridge integrity {Math.round(d.bridgeIntegrity * 100)}% · {damage.filter(p => p.fallen).length} fallen trees</p>
      {su.destinationTarget === 'bridge' && <p className="village-panel-hint">{su.currentGoal}</p>}
      <button className="village-text-button" onClick={onClimate}>Storm settings ↗</button>
    </div>
    <details className="village-fold">
      <summary>Storm, repairs & supplies</summary>
      <dl className="village-facts">
        <div><dt>Wind today</dt><dd>{d.windKph.toFixed(0)} km/h</dd></div>
        {d.shop.requested && <div><dt>Shop integrity</dt><dd>{Math.round(d.shop.integrity * 100)}%</dd></div>}
        <div><dt>Damaged plant sites</dt><dd>{damage.filter(p => p.damage > 0).length}</dd></div>
        <div><dt>Fallen trees / saplings</dt><dd>{damage.filter(p => p.fallen).length} / {damage.filter(p => p.fallen && p.recovery > 0.05).length}</dd></div>
        {shopBuilt && <>
          <div><dt>Shelf capacity</dt><dd>{shopSupply.capacity}</dd></div>
          <div><dt>Visits / meals</dt><dd>{d.shop.visits} / {d.shop.served}</dd></div>
        </>}
        {d.shop.lastDelivery && <div><dt>Last delivery</dt><dd>Day {d.shop.lastDelivery.day} · {d.shop.lastDelivery.amount.toFixed(1)} food</dd></div>}
      </dl>
      <p className="village-panel-hint">High water or damage can close the bridge. Su repairs it on calm, dry days with low water.</p>
      {!!d.journal.length && <ol className="village-event-list" aria-label="Building and storm history">
        {d.journal.slice(-6).reverse().map((entry, i) => <li key={i}><time>Day {entry.day}</time><span>{entry.text}</span></li>)}
      </ol>}
    </details>
  </section>;
}
