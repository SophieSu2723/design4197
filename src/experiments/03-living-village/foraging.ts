import { developmentOf, plantKey, shopPosition } from './development';
import type { Landscape, VegetationSite } from './landscape';
import { navigationFor, routeBetween, routeLength } from './population';
import type { Point } from './population';
import type { WorldState } from './simulation';

export const foragingRules = { senseRadius: 3, matureGrowth: 0.55, pickedGrowth: 0.24, foodPerPatch: 2, restDays: 2, maxRoute: 45 };
export interface Foraging {
  known: Record<string, number>;
  lastDiscoveryDay?: number;
  lastHarvestDay?: number;
  gathered: number;
}

const sitesByLandscape = new WeakMap<Landscape, Map<string, VegetationSite>>();
function potentialSites(landscape: Landscape) {
  let sites = sitesByLandscape.get(landscape);
  if (!sites) {
    sites = new Map(landscape.sites.filter(site => site.latent && site.kind === 'flower').map(site => [plantKey(site), site]));
    sitesByLandscape.set(landscape, sites);
  }
  return sites;
}

function siteAvailable(world: WorldState, site: VegetationSite) {
  const home = world.population.settlement?.position;
  const atHomeSite = home && Math.abs(site.x - home.x) < 2.1 && Math.abs(site.z - home.z) < 2.1;
  const atShopSite = developmentOf(world).shop.requested && Math.abs(site.x - shopPosition.x) < 2.6 && Math.abs(site.z - shopPosition.z) < 2.6;
  return !atHomeSite && !atShopSite;
}

export function isMaturePatch(world: WorldState, key: string) {
  const site = potentialSites(world.landscape).get(key);
  return !!site && siteAvailable(world, site) && (world.ecology.growthSites[key] ?? 0) >= foragingRules.matureGrowth;
}

/** Only the segment just walked grants knowledge, regardless of playback step size. */
export function sensePatches(world: WorldState, a: Point, b: Point): string[] {
  const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return [];
  const found: string[] = [];
  const radius = foragingRules.senseRadius;
  potentialSites(world.landscape).forEach((site, key) => {
    if (world.population.foraging?.known[key] !== undefined || (world.ecology.growthSites[key] ?? 0) < foragingRules.matureGrowth) return;
    if (site.x < Math.min(a.x, b.x) - radius || site.x > Math.max(a.x, b.x) + radius || site.z < Math.min(a.z, b.z) - radius || site.z > Math.max(a.z, b.z) + radius) return;
    const t = Math.max(0, Math.min(1, ((site.x - a.x) * dx + (site.z - a.z) * dz) / lengthSquared));
    if (Math.hypot(site.x - (a.x + dx * t), site.z - (a.z + dz * t)) <= radius && siteAvailable(world, site)) found.push(key);
  });
  return found;
}

export function chooseForagingPatch(world: WorldState, from: Point) {
  const memory = world.population.foraging;
  if (!memory || (memory.lastHarvestDay !== undefined && world.day - memory.lastHarvestDay < foragingRules.restDays)) return null;
  const sites = potentialSites(world.landscape);
  const building = world.population.settlement?.position ?? null;
  const nav = navigationFor(world);
  const nearest = Object.keys(memory.known).flatMap(key => {
    const site = sites.get(key);
    return site && siteAvailable(world, site) ? [{ key, site, distance: Math.hypot(site.x - from.x, site.z - from.z) }] : [];
  }).filter(candidate => candidate.distance <= foragingRules.maxRoute).sort((a, b) => a.distance - b.distance);
  for (const { key, site } of nearest) {
    const destination = { x: site.x, z: site.z };
    const route = routeBetween(from, destination, building, nav);
    if (route.length && routeLength(from, route) <= foragingRules.maxRoute) return { key, destination };
  }
  return null;
}
