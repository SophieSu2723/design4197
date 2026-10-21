import { actOnPlot, advanceDay, advanceDays, createWorld } from './simulation';
import { arrivalEligibility, cancelInvitation, easternEntry, inspectPlacement, inviteMina, movePopulation, populationDay, populationRules, recentHarvest, residentCount, routeBetween, settleMina, suDoor, walkingHeight } from './population';
function surplus() { let world = advanceDays(createWorld(), 20); for (let i = 0; i < 9; i++) world = actOnPlot(world, i, 'harvest'); return world; }
function visitor() {
  let world = advanceDays(surplus(), 7);
  for (let i = 0; i < 1000 && world.population.mina?.status === 'arriving'; i++) world = movePopulation(world, 0.1);
  return world;
}
test('Su is the persistent resident and all plots belong to Su; no harvest means no Mina', () => {
  const world = advanceDays(createWorld(), 100);
  expect(world.population.su.id).toBe('su'); expect(residentCount(world)).toBe(1);
  expect(world.plots.every(plot => plot.ownerId === 'su')).toBe(true);
  expect(world.population.mina).toBeNull(); expect(world.population.foodReserve).toBe(0);
});
test('only actual harvest creates reserves, duplicate harvesting does not add food', () => {
  const world = surplus(); expect(world.population.foodReserve).toBe(world.harvested);
  expect(recentHarvest(world)).toBe(world.harvested);
  expect(actOnPlot(world, 0, 'harvest')).toBe(world);
  const noRecent = { ...world, day: world.day + populationRules.recentDays };
  expect(arrivalEligibility(noRecent)).toBe(false);
  expect(arrivalEligibility({ ...world, population: { ...world.population, foodReserve: populationRules.reserveThreshold } })).toBe(false);
});
test('seeded resource-driven arrival is reproducible, independent of weather RNG, and checked once per day', () => {
  const start = surplus(), arrived = advanceDays(start, 7);
  expect(arrived.population.mina?.status).toBe('arriving');
  expect(arrived.day).toBeLessThan(start.day + 7);
  expect(arrived.today.some(e => e.description === 'A traveler was seen near the eastern path.')).toBe(true);
  expect(advanceDays(surplus(), 7)).toEqual(arrived);
  expect(populationDay(arrived)).toBe(arrived);
  const noReserve = { ...start, population: { ...start.population, foodReserve: 0, harvests: [] } };
  expect(advanceDay(noReserve).weather).toEqual(advanceDay(start).weather);
  const delayed = { ...start, day: 40, population: { ...start.population, harvests: [{ day: 40, amount: start.harvested }] } };
  expect(advanceDays(delayed, 7).population.mina?.arrivalDay).toBeGreaterThan(40);
});
test('visitor walks from map edge to farmhouse in simulation data, not rendering', () => {
  let world = advanceDays(surplus(), 7);
  expect(world.population.mina!.position).toEqual(easternEntry);
  const first = world.population.mina!.position;
  world = movePopulation(world, 0.1);
  expect(world.population.mina!.position).not.toEqual(first);
  expect(routeBetween(easternEntry, suDoor).length).toBeGreaterThan(0);
  const completed = visitor(); expect(completed.population.mina!.status).toBe('visiting');
  expect(completed.population.mina!.position).toEqual(suDoor);
  expect(Number.isFinite(walkingHeight(completed.population.mina!.position))).toBe(true);
  expect(completed.day).toBe(world.day);
});
test('invitation is explicit, placement is validated, and settlement saves spatial context once', () => {
  const world = visitor(), point = { x: -6, z: -16 };
  expect(settleMina(world, point)).toBe(world);
  const invited = inviteMina(world); expect(invited.population.placementMode).toBe(true);
  expect(cancelInvitation(invited).population.mina?.status).toBe('visiting');
  for (const p of [{ x: 100, z: 0 }, { x: -9, z: 7 }, { x: -8, z: -2 }, { x: 2, z: 0 }, { x: -5, z: 9.5 }, { x: NaN, z: 0 }]) {
    expect(inspectPlacement(invited, p).error).not.toBe(''); expect(settleMina(invited, p)).toBe(invited);
  }
  const settled = settleMina(invited, point);
  expect(residentCount(settled)).toBe(2); expect(settled.population.mina?.homePosition).toEqual(point);
  expect(settled.population.mina?.spatialContext).toEqual(settled.population.settlement?.context);
  expect(settled.population.mina!.spatialContext!.distanceToRiver).toBeGreaterThan(0);
  expect(inviteMina(settled)).toBe(settled); expect(settleMina(settled, { x: -6, z: -14 })).toBe(settled);
  expect(inspectPlacement(invited, { x: -6, z: -14 }).context!.routeLengthToFarm).not.toBe(settled.population.settlement!.context.routeLengthToFarm);
});
test('settled Mina receives a minimal routine and eventually returns home', () => {
  let world = advanceDay(settleMina(inviteMina(visitor()), { x: -6, z: -16 }));
  expect(world.population.mina!.currentGoal).toBe('Morning · home');
  expect(world.population.mina!.itinerary[0].goal).toBe('Day · bakery work');
  expect(world.population.mina!.itinerary.slice(-1)[0].goal).toBe('Evening · return home');
  for (let i = 0; i < 2000; i++) world = movePopulation(world, 0.1);
  expect(world.population.mina!.position).toEqual(world.population.settlement!.door);
  expect(world.population.mina!.currentGoal).toBe('Evening · return home');
  expect(world.population.mina!.itinerary).toHaveLength(0);
});
