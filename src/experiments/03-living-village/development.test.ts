import { advanceDay, createWorld, defaultParameters, WorldState } from './simulation';
import { bridgeOpen, developmentDay, developmentOf, expandValley, requestShop, shopDoor, shopOpen, tuneStorm } from './development';
import { hasUnfinishedRoutine, inviteMina, movePopulation, navigationFor, routeBetween, settleMina, suDoor } from './population';
import { easternPlaces } from './places';
import { cellIndex } from './landscape';

const clear = { kind: 'Clear' as const, rainfallMm: 0, temperatureC: 18 };
function finish(w: WorldState, step = 1) {
  let count = 0;
  while ([w.population.su, ...(w.population.mina ? [w.population.mina] : [])].some(hasUnfinishedRoutine) && count++ < 3000) w = movePopulation(w, step);
  expect(count).toBeLessThan(3000); return w;
}
function setup() {
  const w = createWorld({ ...defaultParameters, rainChance: 0 });
  const visitor = { ...w.population.su, id: 'mina' as const, name: 'Mina', profession: 'baker' as const, status: 'visiting' as const, homePosition: null };
  return finish(settleMina(inviteMina({ ...w, population: { ...w.population, mina: visitor } }), { x: -4, z: 4 }));
}
test('expansion appends real ecological land without replacing inhabited state, and adds reachable destinations', () => {
  const old = finish(advanceDay(setup(), clear)), expanded = expandValley(old);
  expect(expanded.day).toBe(old.day); expect(expanded.randomState).toBe(old.randomState);
  expect(expanded.population).toBe(old.population); expect(expanded.history).toBe(old.history); expect(expanded.plots).toBe(old.plots);
  expect(expanded.ecology.cells.slice(0, 1024)).toEqual(old.ecology.cells);
  expect(expanded.landscape.sites.slice(0, old.landscape.sites.length)).toEqual(old.landscape.sites);
  expect(expanded.ecology.cells).toHaveLength(1536);
  expect(expanded.landscape.cells[cellIndex(34, -6)].x).toBeGreaterThan(20);
  expect(expandValley(expanded)).toBe(expanded);
  for (const p of easternPlaces.filter(p => p.extension)) {
    expect(routeBetween(suDoor, p.position)).toHaveLength(0);
    expect(routeBetween(suDoor, p.position, expanded.population.settlement!.position, navigationFor(expanded)).length).toBeGreaterThan(0);
  }
});
test('shop builds only from two real work visits; opening transfers food and customers consume stock', () => {
  let w = requestShop(expandValley(setup()));
  expect(w.development!.shop.work).toBe(0);
  w = advanceDay(w, clear); expect(w.development!.shop.work).toBe(0);
  expect(w.population.su.itinerary.some(p => p.target === 'shop')).toBe(true);
  w = finish(w); expect(w.development!.shop.work).toBe(1);
  w = finish(advanceDay(w, clear)); expect(shopOpen(w)).toBe(true);
  const stocked = developmentDay({ ...w, population: { ...w.population, foodReserve: 20 } }, 0);
  expect(stocked.population.foodReserve).toBe(16); expect(stocked.development!.shop.stock).toBe(4);
  const mina = { ...stocked.population.mina!, position: shopDoor, route: [], itinerary: [{ goal: 'Shop', destination: shopDoor, target: 'shop' as const }], dwellSeconds: 0, lastPlace: 'home' as const, energy: 0.4, socialNeed: 0.5 };
  const served = finish({ ...stocked, population: { ...stocked.population, mina } });
  expect(served.development!.shop.served).toBe(1); expect(served.development!.shop.stock).toBe(3);
  expect(served.population.mina!.energy).toBeCloseTo(0.58);
  expect(served.population.mina!.placeMemories?.shop?.visits).toBe(1);
});
test('queued storm leaves damage, blocks bridge routes, closes shop and shelters residents; real repairs reopen them', () => {
  let w = requestShop(expandValley(setup()));
  w = finish(advanceDay(w, clear)); w = finish(advanceDay(w, clear));
  const before = w;
  w = advanceDay(tuneStorm(w, { queuedStorm: true, windMaxKph: 90 }), clear);
  expect(w.weather!.rainfallMm).toBe(45); expect(w.development!.windKph).toBe(90);
  expect(w.development!.queuedStorm).toBe(false); expect(bridgeOpen(w)).toBe(false); expect(shopOpen(w)).toBe(false);
  expect(Object.values(w.development!.plantDamage).some(d => d.fallen)).toBe(true);
  expect(routeBetween(suDoor, shopDoor, w.population.settlement!.position, navigationFor(w))).toHaveLength(0);
  expect(w.population.mina!.itinerary.every(p => ['home', 'bakery'].includes(p.activity!.target))).toBe(true);
  expect(w.history[w.history.length - 1].plots[0].health).toBe(w.plots[0].crop!.health);
  expect(before.development!.bridgeIntegrity).toBe(1);
  const damaged = w.development!.bridgeIntegrity;
  w = finish(w); w = advanceDay(w, clear);
  expect(w.development!.bridgeIntegrity).toBe(damaged); // scheduling a repair does nothing yet
  w = finish(w); expect(w.development!.bridgeIntegrity).toBeGreaterThan(damaged);
  for (let i = 0; i < 6; i++) w = finish(advanceDay(w, clear));
  expect(bridgeOpen(w)).toBe(true); expect(shopOpen(w)).toBe(true);
  expect(w.development!.shop.integrity).toBe(1);
  expect(routeBetween(suDoor, shopDoor, w.population.settlement!.position, navigationFor(w)).length).toBeGreaterThan(0);
});
test('same seed and actions reproduce damage and recovery, while tuning preserves world history', () => {
  const original = expandValley(setup());
  const queued = tuneStorm(original, { queuedStorm: true, windMaxKph: 100 });
  expect(queued.population).toBe(original.population); expect(queued.history).toBe(original.history);
  const first = advanceDay(queued, clear), second = advanceDay(queued, clear);
  expect(first).toEqual(second);
  let recovered = finish(first);
  for (let day = 0; day < 8; day++) recovered = finish(advanceDay(recovered, { ...clear, rainfallMm: 4 }));
  expect(Object.values(developmentOf(recovered).plantDamage).some(p => p.fallen && p.recovery > 0.05)).toBe(true);
  expect(tuneStorm(original, { windMaxKph: NaN })).toBe(original);
});

test('a topology change interrupts a previously valid crossing without granting arrival or construction', () => {
  let w = advanceDay(requestShop(expandValley(setup())), clear);
  for (let i = 0; i < 1000 && w.population.su.destinationTarget !== 'shop'; i++) w = movePopulation(w, 0.2);
  expect(w.population.su.route.length).toBeGreaterThan(0);
  const closed = { ...w, development: { ...developmentOf(w), bridgeIntegrity: 0 } };
  const stopped = movePopulation(closed, 0.2);
  expect(stopped.population.su.route).toHaveLength(0);
  expect(stopped.population.su.currentGoal).toContain('Route interrupted');
  expect(stopped.development!.shop.work).toBe(0);
});
