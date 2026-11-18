import type { WorldState } from './simulation';
import { plantKey, shopPosition } from './development';
import { footprintKey, trailFootprint } from './trails';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
function germinationRoll(seed: number, day: number, siteIndex: number) {
  let n = (seed ^ Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(siteIndex + 1, 0x85ebca6b)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0xc2b2ae35);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

/** Establish and grow plants at latent seed-bank sites after the day's water budget.
 * Footsteps inhibit growth; all rolls use a separate seed/day/site stream. */
export function successionDay(world: WorldState): WorldState {
  const growthSites = { ...world.ecology.growthSites };
  const footprints = trailFootprint(world.population.trails ?? {});
  let newPatches = 0, lostPatches = 0;
  world.landscape.sites.forEach((site, index) => {
    if (!site.latent) return;
    const key = plantKey(site), previous = growthSites[key] ?? 0;
    const cell = world.ecology.cells[site.cell];
    const moisture = clamp((cell.soilMoisture - 0.2) / 0.2) * clamp((0.88 - cell.soilMoisture) / 0.18);
    const temperature = world.weather?.temperatureC ?? 18;
    const warmth = clamp((temperature - 2) / 12) * clamp((36 - temperature) / 12);
    const wear = footprints.get(footprintKey(site.x, site.z)) ?? 0;
    const occupied = (world.population.settlement && Math.abs(site.x - world.population.settlement.position.x) < 2.1 && Math.abs(site.z - world.population.settlement.position.z) < 2.1)
      || (world.development?.shop.requested && Math.abs(site.x - shopPosition.x) < 2.6 && Math.abs(site.z - shopPosition.z) < 2.6);
    const suitability = occupied ? 0 : moisture * warmth * cell.soilFertility * cell.vegetationHealth * (1 - wear);
    if (!previous) {
      if (germinationRoll(world.parameters.seed, world.day, index) < world.parameters.colonizationRate * suitability) {
        growthSites[key] = 0.18;
        newPatches++;
      }
    } else {
      const next = clamp(previous + suitability * 0.09 - (1 - suitability) * 0.035 - wear * 0.11);
      if (next < 0.04) { delete growthSites[key]; lostPatches++; }
      else growthSites[key] = next;
    }
  });
  const description = `Seed bank: ${newPatches} new grass/flower patches, ${lostPatches} lost; ${Object.keys(growthSites).length} living. Moist soil and mild weather help; walked ground suppresses growth.`;
  return { ...world, ecology: { ...world.ecology, growthSites, growthToday: { newPatches, lostPatches } },
    today: [...world.today, { day: world.day, time: '24:00', type: 'vegetation', description }] };
}
