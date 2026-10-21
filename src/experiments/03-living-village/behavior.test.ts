import { actOnPlot, advanceDay, advanceDays, createWorld, WorldState } from './simulation';
import { inspectPlacement, inviteMina, movePopulation, settleMina, SpatialContext } from './population';
import { behaviorDay, behaviorRandom, BehaviorInputs, chooseGoal, Goal, goalWeights } from './behavior';
let invitedWorld: WorldState | null = null;
function invited() {
  if (invitedWorld) return invitedWorld;
  let world = advanceDays(createWorld(), 20); for (let i = 0; i < 9; i++) world = actOnPlot(world, i, 'harvest');
  world = advanceDays(world, 7); for (let i = 0; i < 1000; i++) world = movePopulation(world, 0.1);
  return invitedWorld = inviteMina(world);
}
const context: SpatialContext = { distanceToFarm: 15, distanceToRiver: 10, distanceToPath: 8, distanceToFarmhouse: 12, fertility: 0.7, soilMoisture: 0.5, elevation: 1.5, slope: 0.1, routeLengthToFarm: 15, routeLengthToRiver: 15, routeLengthToPath: 15 };
const inputs = (o: Partial<BehaviorInputs> = {}): BehaviorInputs => ({ part: 'afternoon', energy: 0.7, socialNeed: 0.4, atHome: true, context, rainfallMm: 0, temperatureC: 18, riverLevel: 0.6, farmActivity: 0, ...o });
function counts(point: { x: number; z: number }, days = 60) {
  let world = advanceDay(settleMina(invited(), point)); const n: Record<string, number> = {};
  for (let d = 0; d < days; d++) { world = advanceDay(world); world.population.mina!.recentGoals!.slice(-1)[0].goals.forEach(g => { n[g] = (n[g] ?? 0) + 1; }); }
  return (g: Goal) => n[g] ?? 0;
}

test('spatial context records real walking distances to every destination', () => {
  const settled = settleMina(invited(), { x: -6, z: -16 }), { context: c, locations } = settled.population.settlement!;
  for (const v of [c.routeLengthToFarm, c.routeLengthToRiver!, c.routeLengthToPath!]) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThan(0); }
  expect(c.routeLengthToFarm).toBeGreaterThanOrEqual(c.distanceToFarm - 6);
  expect(locations.map(l => l.type)).toEqual(['home', 'bakery', 'farm', 'river', 'path']);
  expect(settled.population.mina!.spatialContext).toEqual(c);
  const nearFarm = inspectPlacement(invited(), { x: -4, z: 4 }).context!, farFromFarm = inspectPlacement(invited(), { x: 12, z: 4 }).context!;
  expect(nearFarm.routeLengthToFarm).toBeLessThan(farFromFarm.routeLengthToFarm);
});
test('proximity raises the matching outing weight', () => {
  const near = { ...context, routeLengthToFarm: 4, routeLengthToRiver: 3 }, far = { ...context, routeLengthToFarm: 28, routeLengthToRiver: 28 };
  expect(goalWeights(inputs({ context: near })).VISIT_FARM).toBeGreaterThan(goalWeights(inputs({ context: far })).VISIT_FARM);
  expect(goalWeights(inputs({ context: near })).VISIT_RIVER).toBeGreaterThan(goalWeights(inputs({ context: far })).VISIT_RIVER);
  expect(goalWeights(inputs({ context: { ...context, routeLengthToRiver: null } })).VISIT_RIVER).toBe(0);
});
test('needs: low energy favors rest and going home; high social need favors the farm', () => {
  const tired = goalWeights(inputs({ energy: 0.1, atHome: false })), fresh = goalWeights(inputs({ energy: 0.9, atHome: false }));
  expect(tired.REST).toBeGreaterThan(fresh.REST); expect(tired.RETURN_HOME).toBeGreaterThan(fresh.RETURN_HOME);
  expect(goalWeights(inputs({ energy: 0.1 })).RETURN_HOME).toBe(0);
  expect(goalWeights(inputs({ socialNeed: 0.9 })).VISIT_FARM).toBeGreaterThan(goalWeights(inputs({ socialNeed: 0.1 })).VISIT_FARM);
});
test('environment: rain lowers outdoor goals, raises home goals; a high river deters river visits', () => {
  const dry = goalWeights(inputs()), wet = goalWeights(inputs({ rainfallMm: 12 }));
  for (const g of ['VISIT_FARM', 'VISIT_RIVER', 'WALK'] as Goal[]) expect(wet[g]).toBeLessThan(dry[g]);
  expect(wet.WORK).toBeGreaterThan(dry.WORK); expect(wet.REST).toBeGreaterThan(dry.REST);
  expect(goalWeights(inputs({ riverLevel: 1.3 })).VISIT_RIVER).toBeLessThan(dry.VISIT_RIVER);
  expect(goalWeights(inputs({ farmActivity: 1 })).VISIT_FARM).toBeGreaterThan(dry.VISIT_FARM);
});
test('time of day shifts weights without a fixed timetable', () => {
  const morning = goalWeights(inputs({ part: 'morning' })), evening = goalWeights(inputs({ part: 'evening', atHome: false }));
  expect(morning.WORK).toBeGreaterThan(morning.VISIT_FARM);
  expect(evening.RETURN_HOME).toBeGreaterThan(evening.WORK);
  expect(Object.values(morning).filter(w => w > 0).length).toBeGreaterThan(2);
});
test('decisions are deterministic and seeded per world, day, villager and decision index', () => {
  expect(behaviorRandom(42, 30, 'mina', 2)).toBe(behaviorRandom(42, 30, 'mina', 2));
  expect(new Set([behaviorRandom(42, 30, 'mina', 2), behaviorRandom(43, 30, 'mina', 2), behaviorRandom(42, 31, 'mina', 2), behaviorRandom(42, 30, 'su', 2), behaviorRandom(42, 30, 'mina', 3)]).size).toBe(5);
  const w = goalWeights(inputs()); expect(chooseGoal(w, 0)).toBe('REST'); expect(chooseGoal(w, 0.999)).toBe('WALK');
  const run = () => advanceDays(advanceDay(settleMina(invited(), { x: -6, z: -16 })), 10);
  expect(run().population.mina).toEqual(run().population.mina);
  expect(run().today).toEqual(run().today);
});
test('a day plan sets needs, itinerary and structured events; weather RNG is untouched', () => {
  const settled = settleMina(invited(), { x: -6, z: -16 }), day = advanceDay(settled), mina = day.population.mina!;
  expect(day.weather).toEqual(advanceDay({ ...settled, population: { ...settled.population, mina: null, settlement: null } }).weather);
  expect(mina.itinerary.slice(0, 4).map(i => i.activity!.part)).toEqual(['morning', 'midday', 'afternoon', 'evening']);
  for (const v of [mina.energy, mina.socialNeed!]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  const behavior = day.today.filter(e => e.type === 'behavior');
  expect(behavior.length).toBeGreaterThan(0); expect(behavior.length).toBeLessThanOrEqual(5);
  behavior.forEach(e => { expect(e.actorId).toBe('mina'); expect(e.action).toBeTruthy(); expect(e.day).toBe(day.day); });
  expect(behaviorDay(advanceDay(createWorld()))).toEqual(advanceDay(createWorld()));
});
test('placement changes observed patterns: farm-side, riverside and remote homes', () => {
  const farmSide = counts({ x: -4, z: 4 }), riverside = counts({ x: 8, z: 0 }), remote = counts({ x: 10, z: -12 });
  expect(farmSide('VISIT_FARM')).toBeGreaterThan(riverside('VISIT_FARM') * 1.5);
  expect(riverside('VISIT_RIVER')).toBeGreaterThan(farmSide('VISIT_RIVER'));
  const outings = (c: typeof remote) => c('VISIT_FARM') + c('VISIT_RIVER') + c('WALK');
  expect(outings(remote)).toBeLessThan(outings(farmSide) * 0.8);
  expect(remote('WORK') + remote('REST')).toBeGreaterThan(farmSide('WORK') + farmSide('REST'));
});
test('rainy days reduce outdoor activity for the same home', () => {
  let world = advanceDay(settleMina(invited(), { x: -4, z: 4 })), wetOut = 0, dryOut = 0;
  for (let d = 0; d < 20; d++) {
    const rain = d % 2 === 0;
    world = advanceDay(world, { kind: rain ? 'Rain' : 'Clear', rainfallMm: rain ? 15 : 0, temperatureC: 18 });
    const out = world.population.mina!.recentGoals!.slice(-1)[0].goals.filter(g => g === 'VISIT_FARM' || g === 'VISIT_RIVER' || g === 'WALK').length;
    if (rain) wetOut += out; else dryOut += out;
  }
  expect(wetOut).toBeLessThan(dryOut);
});
