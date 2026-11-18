import { advanceDay, createWorld, defaultParameters, updateEcologyParameters } from './simulation';
import { plantKey } from './development';
import { addFootstep } from './trails';
import { successionDay } from './succession';

const mild = { kind: 'Rain' as const, rainfallMm: 3, temperatureC: 18 };
const dry = { kind: 'Clear' as const, rainfallMm: 0, temperatureC: 32 };
const run = (rate: number, days: number) => {
  let world = createWorld({ ...defaultParameters, colonizationRate: rate });
  for (let day = 0; day < days; day++) world = advanceDay(world, mild);
  return world;
};

test('new patches establish only when enabled and remain reproducible under the same conditions', () => {
  const disabled = run(0, 20), first = run(0.3, 20), second = run(0.3, 20);
  expect(Object.keys(disabled.ecology.growthSites)).toHaveLength(0);
  expect(Object.keys(first.ecology.growthSites).length).toBeGreaterThan(10);
  expect(first.ecology.growthSites).toEqual(second.ecology.growthSites);
  expect(first.randomState).toBe(disabled.randomState); // germination uses an independent seeded stream
  expect(first.today.some(e => e.type === 'vegetation' && e.description.includes('Seed bank'))).toBe(true);
});

test('drought removes new growth, while a live germination edit preserves existing state', () => {
  const established = run(0.3, 12);
  const changed = updateEcologyParameters(established, { colonizationRate: 0 });
  expect(changed.ecology).toBe(established.ecology);
  expect(changed.history).toBe(established.history);
  let stressed = changed;
  for (let day = 0; day < 28; day++) stressed = advanceDay(stressed, dry);
  expect(Object.keys(stressed.ecology.growthSites).length).toBeLessThan(Object.keys(established.ecology.growthSites).length);
  expect(stressed.ecology.growthToday.lostPatches).toBeGreaterThanOrEqual(0);
});

test('completed footsteps suppress a patch at the same seed-bank site', () => {
  const world = createWorld({ ...defaultParameters, colonizationRate: 0 });
  const site = world.landscape.sites.find(s => s.latent)!;
  const key = plantKey(site);
  const growing = { ...world, weather: mild, day: 1, ecology: { ...world.ecology, growthSites: { [key]: 0.7 } } };
  const quiet = successionDay(growing);
  let trails = world.population.trails ?? {};
  const a = { x: site.x - 0.01, z: site.z }, b = { x: site.x + 0.01, z: site.z + 0.03 };
  for (let i = 0; i < 6; i++) trails = addFootstep(trails, a, b, 'mina', 1);
  const walked = successionDay({ ...growing, population: { ...world.population, trails } });
  expect(walked.ecology.growthSites[key]).toBeLessThan(quiet.ecology.growthSites[key]);
});
