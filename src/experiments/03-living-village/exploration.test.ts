import { createWorld, advanceDay, WorldState } from './simulation';
import { inviteMina, settleMina, movePopulation, routeBetween, suDoor, bridgeZ, hasUnfinishedRoutine } from './population';
import { easternPlaces } from './places';
import { explorationWeather } from './exploration';
import { recoverTrails } from './trails';

function settled() {
  const world = createWorld();
  return settleMina(inviteMina({ ...world, population: { ...world.population, mina: { ...world.population.su, id: 'mina', name: 'Mina', profession: 'baker', homePosition: null, status: 'visiting' } } }), { x: -4, z: 4 });
}
function finish(world: WorldState, step = 0.8) {
  let next = world, count = 0;
  while ([next.population.su, ...(next.population.mina ? [next.population.mina] : [])].some(hasUnfinishedRoutine) && count++ < 10000) next = movePopulation(next, step);
  expect(count).toBeLessThan(10000);
  return next;
}
test('both landmarks are reachable from the west only through the bridge', () => {
  for (const place of easternPlaces.filter(p => !p.extension)) {
    const route = routeBetween(suDoor, place.position, { x: -4, z: 4 });
    expect(route.length).toBeGreaterThan(0);
    expect(route.some(p => p.x > 4 && p.x < 6 && Math.abs(p.z - bridgeZ) < 0.8)).toBe(true);
    expect(route[route.length - 1]).toEqual(place.position);
  }
});
test('dry days yield actual independent discoveries, completed crossings and trails; rain defers expeditions', () => {
  let world = finish(settled());
  for (let day = 0; day < 16; day++) world = finish(advanceDay(world, { kind: 'Clear', rainfallMm: 0, temperatureC: 18 }));
  for (const person of [world.population.su, world.population.mina!]) {
    expect(person.bridgeCrossings).toBeGreaterThan(0);
    expect(easternPlaces.some(p => person.placeMemories?.[p.id])).toBe(true);
  }
  expect(Object.keys(world.population.trails ?? {}).length).toBeGreaterThan(20);
  expect(world.population.discoveries?.length).toBeGreaterThanOrEqual(2);
  const storm = advanceDay(world, { kind: 'Rain', rainfallMm: 40, temperatureC: 18 });
  expect(explorationWeather(storm).allowed).toBe(false);
  expect(storm.population.mina!.itinerary.some(p => p.activity?.goal === 'EXPLORE')).toBe(false);
  expect(storm.population.su.itinerary).toHaveLength(0);
});
test('unwalked plans leave no trail or discovery, and an unreachable trip does not count as a visit', () => {
  const world = settled(), target = easternPlaces[0];
  const queued = { ...world, population: { ...world.population, su: { ...world.population.su, route: [], itinerary: [{ goal: 'Explore', destination: { x: 99, z: 99 }, target: target.id }] } } };
  expect(queued.population.su.placeMemories).toBeUndefined();
  const after = movePopulation(queued, 0.1);
  expect(after.population.su.placeMemories).toBeUndefined();
  expect(after.population.su.currentGoal).toContain('No walkable route');
  expect(after.population.discoveries ?? []).toHaveLength(0);
});
test('footsteps and discoveries are independent of movement speed and unused trails recover', () => {
  const world = settled(), destination = easternPlaces[0].position;
  const traveling = { ...world, population: { ...world.population, mina: null, su: { ...world.population.su, route: routeBetween(suDoor, destination), destination, destinationTarget: 'clearing' as const, itinerary: [] } } };
  const slow = finish(traveling, 0.1), fast = finish(traveling, 0.8);
  expect(fast.population.trails).toEqual(slow.population.trails);
  expect(fast.population.su.placeMemories).toEqual(slow.population.su.placeMemories);
  expect(fast.population.discoveries).toEqual(slow.population.discoveries);
  const old = fast.population.trails!, recovered = recoverTrails(old, world.day + 4);
  const key = Object.keys(old)[0];
  expect(recovered[key].wear).toBeLessThan(old[key].wear);
  expect(recovered[key].passes).toBe(old[key].passes);
});
test('repeated decisions to stay at one place are a single visit', () => {
  const world = createWorld(), destination = easternPlaces[0].position;
  const atPlace = { ...world, population: { ...world.population, su: { ...world.population.su, position: destination, itinerary: [{ goal: 'Explore', destination, target: 'clearing' as const }, { goal: 'Stay', destination, target: 'clearing' as const }] } } };
  const next = finish(atPlace);
  expect(next.population.su.placeMemories?.clearing?.visits).toBe(1);
  expect(next.population.discoveries).toHaveLength(1);
  expect(Object.keys(next.population.trails ?? {})).toHaveLength(0);
});
