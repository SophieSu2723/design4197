import type { WorldState } from './simulation';
import { routeBetween, routeLength, VillagerState, navigationFor } from './population';
import { developmentOf, bridgeOpen } from './development';
import { easternPlaces, EasternPlace } from './places';

export function explorationWeather(world: WorldState): { allowed: boolean; reason: string } {
  if (!world.weather) return { allowed: false, reason: 'Advance a day to observe travel conditions.' };
  if ((world.population.explorationDrive ?? 1) <= 0) return { allowed: false, reason: 'Exploration is switched off; daily life continues.' };
  if (developmentOf(world).windKph >= 55) return { allowed: false, reason: 'Dangerous wind: residents shelter and postpone expeditions.' };
  if (!bridgeOpen(world)) return { allowed: false, reason: 'Bridge closed by damage or high water. Repair and lower water restore access.' };
  if (world.weather.rainfallMm >= 8) return { allowed: false, reason: 'Heavy rain: residents postpone long trips.' };
  if (world.ecology.riverLevel > 1.2) return { allowed: false, reason: 'High river: residents avoid new cross-valley trips.' };
  if (world.weather.temperatureC < 5 || world.weather.temperatureC > 30) return { allowed: false, reason: 'Uncomfortable temperature: residents stay close to home.' };
  return { allowed: true, reason: 'Travel conditions are suitable. Curiosity, familiarity, energy and walking distance shape the next choice.' };
}
export function expeditionOptions(world: WorldState, person: VillagerState, start = person.position) {
  return easternPlaces.flatMap(place => {
    if (place.extension && !world.landscape.expanded) return [];
    const route = routeBetween(start, place.position, world.population.settlement?.position ?? null, navigationFor(world));
    if (!route.length) return [];
    const distance = routeLength(start, route), memory = person.placeMemories?.[place.id];
    const novelty = memory ? 1 : 2.4;
    const familiarity = person.memoryFeedback === false ? 1 : 1 + 0.35 * (memory?.familiarity ?? 0);
    return [{ ...place, distance, weight: novelty * familiarity / (1 + distance / 45) }];
  });
}
export function selectExpedition(options: ReturnType<typeof expeditionOptions>, roll: number) {
  let threshold = options.reduce((sum, p) => sum + p.weight, 0) * roll;
  for (const place of options) { threshold -= place.weight; if (threshold < 0) return place; }
  return options[options.length - 1];
}
/** Independent seeded stream: exploration never consumes the weather or arrival RNG. */
export function explorationRoll(seed: number, day: number, actor: string, index = 0) {
  let n = (seed ^ Math.imul(day + 1, 2654435761) ^ Math.imul(index + 3, 2246822519)) >>> 0;
  for (const char of actor) n = Math.imul(n ^ char.charCodeAt(0), 16777619) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
export function expeditionReason(target: EasternPlace, person: VillagerState) {
  return person.placeMemories?.[target] ? 'Returning to a place remembered from an earlier visit.' : 'Curiosity draws attention to an unvisited place across the river.';
}
