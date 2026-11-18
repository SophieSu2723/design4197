import { plantKey } from './development';
import { foragingRules, sensePatches } from './foraging';
import { farmGate, movePopulation, populationDay, routeBetween, suDoor, walkable } from './population';
import type { WorldState } from './simulation';
import { createWorld } from './simulation';

function until(world: WorldState, condition: (world: WorldState) => boolean) {
  for (let tick = 0; tick < 250 && !condition(world); tick++) world = movePopulation(world, 1);
  expect(condition(world)).toBe(true);
  return world;
}

function observedPatch() {
  const fresh = createWorld();
  const candidates = fresh.landscape.sites.filter(site => site.latent && site.kind === 'flower' && walkable(site));
  const mature = Object.fromEntries(candidates.map(site => [plantKey(site), 0.8]));
  const toFarm = [suDoor, ...routeBetween(suDoor, farmGate)];
  const survey = { ...fresh, ecology: { ...fresh.ecology, growthSites: mature } };
  const near = new Set(toFarm.slice(1).flatMap((point, i) => sensePatches(survey, toFarm[i], point)));
  const patch = candidates.find(site => near.has(plantKey(site)) && routeBetween(farmGate, site).length)!;
  const distant = candidates.find(site => !near.has(plantKey(site)))!;
  const key = plantKey(patch), distantKey = plantKey(distant);
  const world = { ...fresh, day: 1, ecology: { ...fresh.ecology, growthSites: { [key]: 0.8, [distantKey]: 0.8 } } };
  const plan = populationDay(world);
  expect(plan.population.su.itinerary.some(task => task.forageSite)).toBe(false);
  const walked = until(plan, w => !w.population.su.route.length);
  expect(walked.population.foraging?.known).toEqual({ [key]: 1 });
  return { walked, key };
}

test('Su learns about nearby mature plants by walking and brings food back after two real arrivals', () => {
  const { walked, key } = observedPatch();
  const next = populationDay({ ...walked, day: 2 });
  expect(next.population.su.itinerary[0].forageSite).toBe(key);
  expect(next.ecology.growthSites[key]).toBe(0.8);
  const picked = until(next, w => !!w.population.su.wildFood);
  expect(picked.ecology.growthSites[key]).toBe(foragingRules.pickedGrowth);
  expect(picked.population.foodReserve).toBe(0);
  expect(picked.population.foraging?.known[key]).toBeUndefined();
  const returned = until(picked, w => w.population.foodReserve > 0);
  expect(returned.population.su.position).toEqual(farmGate);
  expect(returned.population.su.wildFood).toBe(0);
  expect(returned.population.foodReserve).toBe(foragingRules.foodPerPatch);
});

test('a patch remembered from an earlier walk yields nothing if it declined before arrival', () => {
  const { walked, key } = observedPatch();
  const declined = { ...walked, day: 2, ecology: { ...walked.ecology, growthSites: { ...walked.ecology.growthSites, [key]: 0.1 } } };
  const next = populationDay(declined);
  expect(next.population.su.itinerary[0].forageSite).toBe(key);
  const checked = until(next, world => world.today.some(event => event.description.includes('it had declined')));
  expect(checked.population.su.wildFood ?? 0).toBe(0);
  expect(checked.population.foraging?.known[key]).toBeUndefined();
  expect(checked.ecology.growthSites[key]).toBe(0.1);
});
