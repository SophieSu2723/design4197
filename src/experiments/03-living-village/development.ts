import type { WorldState, Weather, WorldEvent } from './simulation';
import type { LocationType, VillagerState } from './population';
import { extendLandscape, riverX, VegetationSite } from './landscape';

export const shopPosition = { x: 25, z: 6.5 };
export const shopDoor = { x: 25, z: 9 };
export const bridgeRepairPoint = { x: riverX(9.5) - 5.5, z: 9.5 };
export interface PlantDamage { fallen: boolean; damage: number; recovery: number; day: number }
export interface Development {
  expanded: boolean;
  shop: { requested: boolean; work: number; integrity: number; stock: number; visits: number; served: number; lastWorkDay: number };
  bridgeIntegrity: number;
  windMaxKph: number; stormChance: number; queuedStorm: boolean; windKph: number;
  plantDamage: Record<string, PlantDamage>;
  journal: Array<{ day: number; text: string }>;
}
export function initialDevelopment(): Development {
  return { expanded: false, shop: { requested: false, work: 0, integrity: 1, stock: 0, visits: 0, served: 0, lastWorkDay: -1 }, bridgeIntegrity: 1, windMaxKph: 90, stormChance: 0, queuedStorm: false, windKph: 0, plantDamage: {}, journal: [] };
}
export const developmentOf = (world: WorldState) => world.development ?? initialDevelopment();
export const plantKey = (site: Pick<VegetationSite, 'x' | 'z'>) => `${site.x.toFixed(3)},${site.z.toFixed(3)}`;
export const bridgeOpen = (world: WorldState) => developmentOf(world).bridgeIntegrity >= 0.55 && world.ecology.riverLevel <= 1.2;
export const shopOpen = (world: WorldState) => { const d = developmentOf(world); return d.shop.work >= 2 && d.shop.integrity >= 0.55 && d.windKph < 55; };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function roll(seed: number, day: number, salt: number) {
  let n = (seed ^ Math.imul(day + 1, 2654435761) ^ Math.imul(salt + 1, 2246822519)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b); return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
export function expandValley(world: WorldState): WorldState {
  const d = developmentOf(world); if (d.expanded) return world;
  const landscape = extendLandscape(world.landscape, world.parameters.seed);
  const cells = landscape.cells.slice(world.landscape.cells.length).map(c => ({ waterMm: world.parameters.soilCapacityMm * 0.55, soilMoisture: 0.55, soilFertility: world.parameters.fertility * c.fertility, vegetationHealth: 0.8, biomass: 0.8 }));
  return { ...world, landscape, ecology: { ...world.ecology, cells: [...world.ecology.cells, ...cells] }, development: { ...d, expanded: true, journal: [...d.journal, { day: world.day, text: 'Eastern ridge opened: 20 × 40 m of new land. Existing soil, homes and memories preserved.' }].slice(-12) } };
}
export function requestShop(world: WorldState): WorldState {
  const d = developmentOf(world); if (!d.expanded || d.shop.requested) return world;
  return { ...world, development: { ...d, shop: { ...d.shop, requested: true }, journal: [...d.journal, { day: world.day, text: 'Community shop commissioned. Su must complete two dry-day work visits.' }].slice(-12) } };
}
export function tuneStorm(world: WorldState, patch: Partial<Pick<Development, 'stormChance' | 'windMaxKph' | 'queuedStorm'>>): WorldState {
  if (patch.stormChance !== undefined && (!Number.isFinite(patch.stormChance) || patch.stormChance < 0 || patch.stormChance > 1)) return world;
  if (patch.windMaxKph !== undefined && (!Number.isFinite(patch.windMaxKph) || patch.windMaxKph < 0 || patch.windMaxKph > 120)) return world;
  return { ...world, development: { ...developmentOf(world), ...patch } };
}
/** Separate seeded storm stream: tuning wind never consumes the base weather RNG. */
export function stormWeather(world: WorldState, day: number, weather: Weather, fixture = false) {
  const d = developmentOf(world), storm = d.queuedStorm || (!fixture && roll(world.parameters.seed, day, 1) < d.stormChance);
  const windKph = fixture && !d.queuedStorm ? 0 : storm ? (d.queuedStorm ? d.windMaxKph : d.windMaxKph * (0.75 + 0.25 * roll(world.parameters.seed, day, 2))) : 12 * roll(world.parameters.seed, day, 3);
  return { weather: storm ? { ...weather, kind: 'Rain' as const, rainfallMm: Math.max(weather.rainfallMm, 45) } : weather, windKph };
}
/** Resolves lasting damage before that day's resident plans and budget record. */
export function developmentDay(world: WorldState, windKph: number): WorldState {
  const previous = developmentOf(world);
  let d: Development = { ...previous, windKph, queuedStorm: false, shop: { ...previous.shop }, plantDamage: { ...previous.plantDamage } };
  const notes: string[] = [];
  const severity = clamp((windKph - 40) / 55);
  let cells = world.ecology.cells.map(c => ({ ...c })), plots = world.plots;
  const sitesByKey = new Map(world.landscape.sites.map(site => [plantKey(site), site]));
  for (const [key, damage] of Object.entries(d.plantDamage)) {
    const site = sitesByKey.get(key);
    const moisture = site ? cells[site.cell].soilMoisture : 0;
    const recovery = windKph < 40 && moisture > 0.2 && moisture < 0.85 ? 0.035 : 0;
    d.plantDamage[key] = { ...damage, damage: Math.max(0, damage.damage - recovery), recovery: Math.min(1, damage.recovery + recovery) };
  }
  if (severity > 0) {
    let damaged = 0, fallen = 0;
    world.landscape.sites.forEach((site, i) => {
      if (site.kind !== 'tree' && site.kind !== 'shrub') return;
      const exposed = world.landscape.cells[site.cell].elevation > 3 ? 1 : 0.65;
      if (roll(world.parameters.seed, world.day, i + 100) >= severity * exposed) return;
      const key = plantKey(site), old = d.plantDamage[key];
      const fall = old?.fallen || (site.kind === 'tree' && severity > 0.7 && roll(world.parameters.seed, world.day, i + 9000) < severity * 0.55);
      d.plantDamage[key] = { fallen: !!fall, damage: Math.max(old?.damage ?? 0, severity), recovery: 0, day: world.day };
      const c = cells[site.cell]; cells[site.cell] = { ...c, vegetationHealth: Math.max(0, c.vegetationHealth - severity * 0.22), biomass: Math.max(0.12, c.biomass - severity * 0.18) };
      damaged++; if (fall && !old?.fallen) fallen++;
    });
    plots = plots.map(p => ({ ...p, crop: p.crop ? { ...p.crop, health: Math.max(0, p.crop.health - severity * 0.3), growth: Math.max(0, p.crop.growth - severity * 0.15) } : null }));
    d.bridgeIntegrity = Math.max(0, d.bridgeIntegrity - severity * 0.7);
    if (d.shop.requested) d.shop.integrity = Math.max(0, d.shop.integrity - severity * 0.65);
    notes.push(`${windKph.toFixed(0)} km/h wind damaged ${damaged} plant sites; ${fallen} trees fell. Crop growth and health were reduced.`);
    if (d.bridgeIntegrity < 0.55) notes.push('Bridge closed by damage. Su repairs it on subsequent calm, low-water days.');
    if (d.shop.requested && d.shop.integrity < 0.55) notes.push('Shop work and trade suspended until repairs are completed.');
  }
  // Restocking transfers existing food; no food is created by opening a shop.
  const supply = d.shop.work >= 2 && d.shop.integrity >= 0.55 && windKph < 55 ? Math.min(4, 12 - d.shop.stock, Math.max(0, world.population.foodReserve - 4)) : 0;
  d.shop.stock += supply;
  if (supply > 0) notes.push(`${supply.toFixed(1)} food moved from village reserve to the shop.`);
  d.journal = [...d.journal, ...notes.map(text => ({ day: world.day, text }))].slice(-12);
  return { ...world, development: d, plots, ecology: { ...world.ecology, cells }, population: { ...world.population, foodReserve: world.population.foodReserve - supply }, today: [...world.today, ...notes.map(description => ({ day: world.day, time: '24:00', type: 'action' as const, description }))] };
}
export function workDestination(world: WorldState): { target: LocationType; position: { x: number; z: number }; goal: string } | null {
  const d = developmentOf(world);
  if (d.windKph >= 40 || (world.weather?.rainfallMm ?? 0) >= 5) return null;
  if (d.bridgeIntegrity < 1 && world.ecology.riverLevel <= 1.2) return { target: 'bridge', position: bridgeRepairPoint, goal: 'Repair the bridge' };
  if (d.shop.requested && bridgeOpen(world) && (d.shop.work < 2 || d.shop.integrity < 1)) return { target: 'shop', position: shopDoor, goal: d.shop.integrity < 1 ? 'Repair the community shop' : 'Build the community shop' };
  return null;
}
/** Called only by a completed, distinct arrival. Construction cannot advance from a plan alone. */
export function developmentArrival(world: WorldState, person: VillagerState, target: LocationType | undefined) {
  let d = developmentOf(world), actor = person;
  const events: WorldEvent[] = [];
  const say = (description: string) => { events.push({ day: world.day, time: 'Arrival', type: 'action', actorId: person.id, description }); d = { ...d, journal: [...d.journal, { day: world.day, text: description }].slice(-12) }; };
  if (target === 'bridge' && person.id === 'su' && d.windKph < 40 && (world.weather?.rainfallMm ?? 0) < 5 && world.ecology.riverLevel <= 1.2) {
    d = { ...d, bridgeIntegrity: Math.min(1, d.bridgeIntegrity + 0.35) }; say(`Su repaired the bridge to ${Math.round(d.bridgeIntegrity * 100)}% integrity.`);
  }
  if (target === 'shop' && d.shop.requested) {
    d = { ...d, shop: { ...d.shop, visits: d.shop.visits + 1 } };
    if (person.id === 'su' && d.windKph < 40 && (world.weather?.rainfallMm ?? 0) < 5 && d.shop.lastWorkDay !== world.day && (d.shop.work < 2 || d.shop.integrity < 1)) {
      d.shop.lastWorkDay = world.day;
      if (d.shop.integrity < 1) { d.shop.integrity = Math.min(1, d.shop.integrity + 0.4); say(`Su repaired the shop to ${Math.round(d.shop.integrity * 100)}% integrity.`); }
      else { d.shop.work = Math.min(2, d.shop.work + 1); say(d.shop.work === 2 ? 'Su completed the shop. It opens for visits; harvest surplus supplies its shelves.' : 'Su completed the shop frame: 1 of 2 work visits.'); }
    } else if (shopOpen({ ...world, development: d })) {
      const served = d.shop.stock >= 1;
      d.shop.stock -= served ? 1 : 0; d.shop.served += served ? 1 : 0;
      actor = { ...actor, energy: Math.min(1, actor.energy + (served ? 0.18 : 0)), socialNeed: Math.max(0, (actor.socialNeed ?? 0) - 0.15) };
      say(served ? `${person.name} collected a meal at the shop: stock −1, energy +18 points (capped at 100).` : `${person.name} visited the shop; empty shelves offered company but no meal.`);
    }
  }
  return { development: d, actor, events };
}
