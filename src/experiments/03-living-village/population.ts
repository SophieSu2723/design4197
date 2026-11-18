import type { WorldState } from './simulation';
import type { Activity, Goal } from './behavior';
import { cellIndex, farmPosition, housePosition, riverBed, riverX, terrainHeight } from './landscape';
import { easternPlaces, isMemoryPlace, isEasternPlace, placeNames, EasternPlace } from './places';
import { expeditionOptions, explorationWeather, explorationRoll, selectExpedition, expeditionReason } from './exploration';
import { addFootstep, gridEdgeKey, recoverTrails, Trails, wornTrailCosts } from './trails';
import { bridgeOpen, deliveryBlock, developmentOf, developmentArrival, farmLoad, shopPosition, shopDoor, shopOpen, shopSupply, workDestination } from './development';
import { chooseForagingPatch, foragingRules, isMaturePatch, sensePatches } from './foraging';
import type { Foraging } from './foraging';
export interface Point { x: number; z: number }
export interface SpatialContext { distanceToFarm: number; distanceToRiver: number; distanceToPath: number; distanceToFarmhouse: number; fertility: number; soilMoisture: number; elevation: number; slope: number; routeLengthToFarm: number; routeLengthToRiver: number | null; routeLengthToPath: number | null }
// Destinations Mina's behavior can choose. Positions are simulation data, fixed at settlement.
export type LocationType = 'home' | 'bakery' | 'farm' | 'river' | 'path' | 'shop' | 'bridge' | 'forage' | EasternPlace;
export interface VillageLocation { type: LocationType; position: Point }
export type MemoryPlace = 'farm' | 'river' | 'path' | 'shop' | EasternPlace;
export interface PlaceMemory { visits: number; familiarity: number; lastDay: number; firstDay?: number }
type DeliveryLeg = 'pickup' | 'dropoff';
export interface VillagerState {
  id: 'su' | 'mina'; name: string; profession: 'farmer' | 'baker'; status: 'resident' | 'arriving' | 'visiting' | 'invited';
  position: Point; homePosition: Point | null; currentGoal: string; energy: number; arrivalDay: number;
  spatialContext: SpatialContext | null; dwellSeconds?: number; route: Point[]; itinerary: Array<{ goal: string; destination: Point; activity?: Activity; target?: LocationType; reason?: string; deliveryLeg?: DeliveryLeg; forageSite?: string }>;
  destination?: Point; destinationTarget?: LocationType; trailAnchor?: Point; lastPlace?: LocationType; navigationStamp?: string;
  taskReason?: string; routeIssue?: 'interrupted' | 'unreachable';
  cargoFood?: number; deliveryLeg?: DeliveryLeg;
  wildFood?: number; forageSite?: string;
  bridgeCrossings?: number; explorationReason?: string;
  // Phase 3 behavior (Mina only): social need 0–1, the decision being walked, and the last 7 days of day-part goals.
  placeMemories?: Partial<Record<MemoryPlace, PlaceMemory>>; memoryFeedback?: boolean;
  lastArrival?: { place: MemoryPlace; day: number };
  socialNeed?: number; activity?: Activity; recentGoals?: Array<{ day: number; goals: Goal[] }>;
}
export interface PopulationState {
  su: VillagerState; mina: VillagerState | null; randomState: number; lastArrivalCheck: number;
  placementMode: boolean; settlement: { position: Point; door: Point; context: SpatialContext; locations: VillageLocation[] } | null;
  foodReserve: number; harvests: Array<{ day: number; amount: number }>; lastProbability: number;
  explorationDrive?: number; trails?: Trails;
  preferWalkedPaths?: boolean; routingTrails?: Trails;
  foraging?: Foraging;
  discoveries?: Array<{ actor: 'su' | 'mina'; place: EasternPlace; day: number }>;
}
export const populationRules = { capacity: 2, reserveThreshold: 20, recentHarvestThreshold: 12, recentDays: 7, dailyFoodPerResident: 0.5, baseArrivalChance: 0.35, maxArrivalChance: 0.8, walkingSpeed: 2, buildingHalfSize: 1.35, maxSlope: 0.38 };
export const farmGate = { x: -4, z: 1 }, suDoor = { x: housePosition.x, z: housePosition.z + 2.4 };
export const easternEntry = { x: 19, z: 9.5 }, bridgeZ = 9.5;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function pathDistance(p: Point) {
  const segment = (a: Point, b: Point) => { const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz))); return distance(p, { x: a.x + t * dx, z: a.z + t * dz }); };
  return Math.min(segment({ x: -10, z: 9.5 }, easternEntry), segment({ x: -5, z: 1 }, { x: -5, z: 9.5 }));
}
export function walkingHeight(p: Point) { return Math.abs(p.z - bridgeZ) < 0.8 && Math.abs(p.x - riverX(bridgeZ)) < 5 ? Math.max(terrainHeight(p.x, p.z), riverBed(bridgeZ) + 1.65) : terrainHeight(p.x, p.z); }
function slope(p: Point) { return Math.atan(Math.hypot((terrainHeight(p.x + 0.2, p.z) - terrainHeight(p.x - 0.2, p.z)) / 0.4, (terrainHeight(p.x, p.z + 0.2) - terrainHeight(p.x, p.z - 0.2)) / 0.4)); }
export interface Navigation { expanded?: boolean; bridgeClosed?: boolean; shopBuilt?: boolean; trails?: Trails }
const navigationStamp = (nav: Navigation) => `${!!nav.expanded}:${!!nav.bridgeClosed}:${!!nav.shopBuilt}`;
export const navigationFor = (world: WorldState): Navigation => ({
  expanded: !!world.landscape.expanded, bridgeClosed: !bridgeOpen(world), shopBuilt: developmentOf(world).shop.requested,
  trails: world.population.preferWalkedPaths === false ? undefined : world.population.routingTrails ?? world.population.trails,
});
export function walkable(p: Point, building: Point | null = null, nav: Navigation = {}) {
  if (p.x < -19.5 || p.x > (nav.expanded ? 39.5 : 19.5) || Math.abs(p.z) > 19.5) return false;
  if (Math.abs(p.x - housePosition.x) < 2.25 && Math.abs(p.z - housePosition.z) < 1.9) return false;
  if (p.x > -11.1 && p.x < -4.7 && p.z > -5.1 && p.z < 1.3) return false;
  if (building && Math.abs(p.x - building.x) < 1.5 && Math.abs(p.z - building.z) < 1.5) return false;
  if (nav.shopBuilt && Math.abs(p.x - shopPosition.x) < 1.8 && Math.abs(p.z - shopPosition.z) < 1.8) return false;
  const bridge = Math.abs(p.z - bridgeZ) < 0.8 && Math.abs(p.x - riverX(bridgeZ)) < 5;
  if (bridge && nav.bridgeClosed) return false;
  return bridge || (terrainHeight(p.x, p.z) > riverBed(p.z) + 1.45 && slope(p) < 0.65);
}
// A bounded grid route avoids the river, steep ground, farm beds and buildings.
// Cache keys include region, bridge closure and construction, so topology changes invalidate routes.
const navigationGrids = new Map<string, Uint8Array>();
export function routeBetween(start: Point, end: Point, building: Point | null = null, nav: Navigation = {}): Point[] {
  const width = nav.expanded ? 60 : 40, size = width * 40;
  const point = (i: number) => ({ x: i % width - 19.5, z: Math.floor(i / width) - 19.5 });
  const key = `${building ? `${building.x},${building.z}` : 'no-building'}:${width}:${!!nav.bridgeClosed}:${!!nav.shopBuilt}`;
  let grid = navigationGrids.get(key);
  if (!grid) {
    grid = Uint8Array.from({ length: size }, (_, i) => walkable(point(i), building, nav) ? 1 : 0);
    if (navigationGrids.size >= 16) navigationGrids.delete(navigationGrids.keys().next().value!);
    navigationGrids.set(key, grid);
  }
  const nearest = (p: Point) => {
    let best = -1, score = Infinity;
    for (let i = 0; i < size; i++) { const q = point(i), d = distance(p, q); if (d < score && grid![i]) { score = d; best = i; } }
    return score <= 2 ? best : -1;
  };
  if (!walkable(end, building, nav)) return [];
  const a = nearest(start), b = nearest(end); if (a < 0 || b < 0) return [];
  const costs = nav.trails && wornTrailCosts(nav.trails);
  const weighted = !!costs?.size;
  const fullGridIndex = (i: number) => Math.floor(i / width) * 60 + i % width;
  const heuristic = (i: number) => weighted ? 70 * (Math.abs(i % width - b % width) + Math.abs(Math.floor(i / width) - Math.floor(b / width))) : 0;
  const parents = new Int32Array(size).fill(-2), distances = new Int32Array(size).fill(0x7fffffff);
  // Integer cost buckets order A* by cost so far plus an admissible lower bound.
  // With no worn edges this reduces to the original breadth-first ordering.
  const buckets: number[][] = [];
  buckets[heuristic(a)] = [a]; distances[a] = 0; parents[a] = -1;
  let reached = false;
  search: for (let priority = heuristic(a); priority < buckets.length; priority++) {
    for (const i of buckets[priority] ?? []) {
      if (distances[i] + heuristic(i) !== priority) continue;
      if (i === b) { reached = true; break search; }
      for (const n of [i % width > 0 ? i - 1 : -1, i % width < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i < size - width ? i + width : -1]) {
        if (n < 0 || !grid[n]) continue;
        const step = weighted ? costs?.get(gridEdgeKey(fullGridIndex(i), fullGridIndex(n))) ?? 100 : 1;
        const next = distances[i] + step;
        if (next >= distances[n]) continue;
        distances[n] = next;
        parents[n] = i;
        (buckets[next + heuristic(n)] ??= []).push(n);
      }
    }
  }
  if (!reached) return [];
  const route: Point[] = []; for (let i = b; i !== -1; i = parents[i]) route.push(point(i));
  return [...route.reverse(), { ...end }];
}
export function initialPopulation(seed: number): PopulationState {
  return { su: { id: 'su', name: 'Su', profession: 'farmer', status: 'resident', position: { ...suDoor }, homePosition: { ...housePosition }, currentGoal: 'Tend the farm', energy: 1, arrivalDay: 0, spatialContext: null, route: [], itinerary: [] }, mina: null, randomState: (seed ^ 0x9e3779b9) >>> 0, lastArrivalCheck: -1, placementMode: false, settlement: null, foodReserve: 0, harvests: [], lastProbability: 0 };
}
export function recentHarvest(world: WorldState) { return world.population.harvests.filter(h => world.day - h.day < populationRules.recentDays).reduce((sum, h) => sum + h.amount, 0); }
export function residentCount(world: WorldState) { return 1 + (world.population.mina?.status === 'resident' ? 1 : 0); }
export function arrivalEligibility(world: WorldState) {
  return !world.population.mina && world.population.foodReserve > populationRules.reserveThreshold && recentHarvest(world) > populationRules.recentHarvestThreshold && residentCount(world) < populationRules.capacity;
}
function withRoute(person: VillagerState, destination: Point, goal: string, building: Point | null, nav: Navigation = {}): VillagerState {
  const route = routeBetween(person.position, destination, building, nav);
  return { ...person, currentGoal: goal, destination, destinationTarget: undefined, activity: undefined, taskReason: undefined, deliveryLeg: undefined, forageSite: undefined,
    routeIssue: !route.length && distance(person.position, destination) >= 0.05 ? 'unreachable' : undefined,
    trailAnchor: person.position, navigationStamp: navigationStamp(nav), route };
}
export function populationDay(world: WorldState): WorldState {
  const old = world.population;
  if (old.lastArrivalCheck === world.day) return world;
  const trails = recoverTrails(old.trails ?? {}, world.day);
  // The day's routes use past footsteps. Playback speed only changes when today's footsteps appear.
  const population = { ...old, trails, routingTrails: trails, lastArrivalCheck: world.day, foodReserve: Math.max(0, old.foodReserve - residentCount(world) * populationRules.dailyFoodPerResident), harvests: old.harvests.filter(h => world.day - h.day < populationRules.recentDays), lastProbability: 0 };
  let result = { ...world, population };
  const windy = developmentOf(world).windKph >= 55;
  const raining = (world.weather?.rainfallMm ?? 0) >= 5 || windy;
  const nav = navigationFor(result), work = workDestination(world);
  const options = expeditionOptions(result, population.su, farmGate);
  const place = selectExpedition(options, explorationRoll(world.parameters.seed, world.day, 'su', 1));
  const farmBusy = world.plots.filter(p => p.crop && p.crop.growth >= 1 && p.crop.health > 0).length >= 5;
  const chance = Math.min(0.9, 0.65 * (population.explorationDrive ?? 1) * (farmBusy ? 0.35 : 1));
  const exploring = !raining && explorationWeather(world).allowed && !!place && explorationRoll(world.parameters.seed, world.day, 'su') < chance;
  const shelterReason = windy ? 'Su shelters when wind reaches 55 km/h.' : 'Su shelters when daily rainfall reaches 5 mm.';
  const explorationReason = exploring ? expeditionReason(place.id, population.su)
    : raining ? shelterReason
    : !explorationWeather(world).allowed ? explorationWeather(world).reason
    : !place ? 'No reachable eastern destination.'
    : farmBusy ? 'Ripe crops lowered the chance of exploring, and today’s draw kept Su near the farm.'
    : 'Today’s seeded choice keeps Su on the farm and village path.';
  const returnHome = { goal: 'Return to farmhouse', destination: suDoor, target: 'home' as const, reason: 'Su returns home at the end of the daily routine.' };
  population.su = {
    ...withRoute(population.su, raining ? suDoor : farmGate, raining ? windy ? 'Shelter at home from strong wind' : 'Shelter at home from rain' : 'Tend the farm', population.settlement?.position ?? null, nav),
    destinationTarget: raining ? 'home' : 'farm',
    taskReason: raining ? shelterReason : 'Su starts the daily routine at the farm when rain and wind are below shelter thresholds.',
    dwellSeconds: 0,
    explorationReason,
    itinerary: raining ? [] : [{ goal: exploring ? `Explore · ${place.name}` : 'Rest on the village path', destination: exploring ? place.position : { x: -5, z: 8.5 }, target: exploring ? place.id : 'path', reason: explorationReason }, returnHome],
  };
  if (!raining && work) {
    population.su.explorationReason = `${work.goal} takes priority over exploration today. Progress requires reaching the work site.`;
    population.su.itinerary = [{ goal: work.goal, destination: work.position, target: work.target, reason: population.su.explorationReason }, returnHome];
  } else if (!deliveryBlock(result) && developmentOf(result).shop.stock < shopSupply.capacity) {
    const su = population.su;
    const carrying = (su.cargoFood ?? 0) > 0;
    const pickup = carrying || (farmLoad(result) > 0 && !su.routeIssue);
    const startingPoint = carrying ? su.position : farmGate;
    if (pickup && routeBetween(startingPoint, shopDoor, population.settlement?.position ?? null, nav).length) {
      const dropoff = {
        goal: 'Deliver food to the shop', destination: shopDoor, target: 'shop' as const, deliveryLeg: 'dropoff' as const,
        reason: 'The shop has room for this harvest. Su unloads it on arrival.',
      };
      if (carrying) {
        population.su = { ...withRoute(su, shopDoor, dropoff.goal, population.settlement?.position ?? null, nav),
          destinationTarget: dropoff.target, deliveryLeg: dropoff.deliveryLeg, taskReason: dropoff.reason,
          explorationReason: 'Su is finishing a delivery before exploring.', itinerary: [returnHome] };
      } else {
        population.su = { ...su, currentGoal: 'Collect food at the farm', deliveryLeg: 'pickup',
          taskReason: 'The shop has room and the farm has food to spare.',
          explorationReason: 'Su is collecting and delivering food today.', itinerary: [dropoff, returnHome] };
      }
    }
  }
  // Ordinary shop visits remain an option on days without construction or deliveries.
  if (!raining && !work && !population.su.deliveryLeg && shopOpen(world) && world.day % 3 === 0 && routeBetween(farmGate, shopDoor, population.settlement?.position ?? null, nav).length) {
    population.su.explorationReason = 'Su visits the shop after the farm on every third open day.';
    population.su.itinerary = [{ goal: 'Visit the community shop', destination: shopDoor, target: 'shop', reason: population.su.explorationReason }, returnHome];
  } else if (!raining && !work && !population.su.deliveryLeg && !population.su.routeIssue) {
    const patch = chooseForagingPatch(result, farmGate);
    if (patch) {
      const reason = `Su spotted this patch on day ${population.foraging!.known[patch.key]} and can reach it from the farm.`;
      population.su.explorationReason = reason;
      population.su.itinerary = [
        { goal: 'Gather wild food', destination: patch.destination, target: 'forage', forageSite: patch.key, reason },
        { goal: 'Bring wild food back to the farm', destination: farmGate, target: 'farm', reason: 'Su brings gathered food back to replenish the village reserve.' },
        returnHome,
      ];
    }
  }
  if (!arrivalEligibility(result)) return result;
  population.lastProbability = Math.min(populationRules.maxArrivalChance, populationRules.baseArrivalChance + (population.foodReserve - populationRules.reserveThreshold) * 0.005);
  population.randomState = (Math.imul(population.randomState, 1664525) + 1013904223) >>> 0;
  if (population.randomState / 4294967296 >= population.lastProbability) return result;
  const route = routeBetween(easternEntry, suDoor, null, nav);
  if (!route.length) return result;
  population.mina = { id: 'mina', name: 'Mina', profession: 'baker', status: 'arriving', position: { ...easternEntry }, homePosition: null, currentGoal: 'Walk to Su’s farmhouse', taskReason: 'The harvest reserve and recent harvest made the village eligible for a visitor, and today’s seeded arrival check succeeded.', destination: suDoor, energy: 1, arrivalDay: world.day, spatialContext: null, route, itinerary: [] };
  return { ...result, today: [...world.today, { day: world.day, time: '24:00', type: 'population', description: 'A traveler was seen near the eastern path.' }] };
}
export function movePopulation(world: WorldState, seconds: number): WorldState {
  if (!Number.isFinite(seconds) || seconds <= 0) return world;
  const building = world.population.settlement?.position ?? null;
  let trails = world.population.trails ?? {}, discoveries = world.population.discoveries ?? [];
  let development = developmentOf(world);
  let foodReserve = world.population.foodReserve;
  let foraging = world.population.foraging;
  let growthSites = world.ecology.growthSites;
  const arrivalEvents: WorldState['today'] = [];
  const currentWorld = (): WorldState => ({ ...world, development, ecology: { ...world.ecology, growthSites }, population: { ...world.population, foodReserve, foraging, trails } });
  const logForaging = (time: string, description: string) => {
    arrivalEvents.push({ day: world.day, time, type: 'action', actorId: 'su', location: 'forage', description });
  };
  const noticePlants = (a: Point, b: Point) => {
    const found = sensePatches(currentWorld(), a, b);
    if (!found.length) return;
    if (foraging?.lastDiscoveryDay !== world.day) logForaging('On the path', 'Su spotted mature wild plants nearby.');
    const known = { ...foraging?.known };
    for (const key of found) known[key] = world.day;
    foraging = { ...foraging, known, lastDiscoveryDay: world.day, gathered: foraging?.gathered ?? 0 };
  };
  const arrivedAtPlace = (person: VillagerState): VillagerState => {
    const target = person.destinationTarget ?? person.activity?.target;
    const destination = person.destination ?? person.activity?.targetPosition;
    if (!destination || distance(person.position, destination) > 0.05 || person.status !== 'resident') return person;
    if (person.id === 'su' && target === 'forage' && person.forageSite && foraging) {
      const key = person.forageSite;
      const known = { ...foraging.known };
      delete known[key];
      foraging = { ...foraging, known };
      if (isMaturePatch(currentWorld(), key)) {
        growthSites = { ...growthSites, [key]: foragingRules.pickedGrowth };
        foraging = { ...foraging, lastHarvestDay: world.day, gathered: foraging.gathered + foragingRules.foodPerPatch };
        person = { ...person, wildFood: (person.wildFood ?? 0) + foragingRules.foodPerPatch, taskReason: 'Su gathered 2 wild food. This patch needs time to regrow.' };
        logForaging('Arrival', 'Su gathered 2 wild food. The picked patch can regrow in suitable soil.');
      } else {
        person = { ...person, itinerary: person.itinerary.filter(task => task.target !== 'farm'), taskReason: 'The patch had declined since Su last saw it.' };
        logForaging('Arrival', 'Su checked a known patch, but it had declined.');
      }
    }
    if (person.id === 'su' && target === 'farm' && (person.wildFood ?? 0) > 0) {
      foodReserve += person.wildFood!;
      logForaging('Arrival', `Su brought ${person.wildFood} wild food back to the farm reserve.`);
      person = { ...person, wildFood: 0 };
    }
    if (person.deliveryLeg || (person.lastPlace !== target && (target === 'shop' || target === 'bridge'))) {
      const result = developmentArrival(currentWorld(), person, target);
      development = result.development; person = result.actor; foodReserve = result.foodReserve;
      arrivalEvents.push(...result.events);
    }
    if (!isMemoryPlace(target) || person.lastPlace === target) return { ...person, lastPlace: target };
    const old = person.placeMemories?.[target];
    if (!old && isEasternPlace(target)) discoveries = [...discoveries, { actor: person.id, place: target, day: world.day }].slice(-20);
    return { ...person, lastPlace: target, lastArrival: { place: target, day: world.day },
      placeMemories: { ...person.placeMemories, [target]: { visits: (old?.visits ?? 0) + 1, familiarity: Math.min(1, (old?.familiarity ?? 0) + 0.1), firstDay: old?.firstDay ?? world.day, lastDay: world.day } } };
  };
  const move = (person: VillagerState): VillagerState => {
    const nav = navigationFor({ ...world, development, population: { ...world.population, trails } });
    if (person.route.length && person.navigationStamp !== undefined && person.navigationStamp !== navigationStamp(nav)) {
      const destination = person.destination ?? person.route[person.route.length - 1];
      const rerouted = withRoute(person, destination, person.currentGoal, building, nav);
      return { ...rerouted, destinationTarget: person.destinationTarget, activity: person.activity, taskReason: person.taskReason, deliveryLeg: person.deliveryLeg, forageSite: person.forageSite, routeIssue: rerouted.route.length ? undefined : 'interrupted', currentGoal: rerouted.route.length ? person.currentGoal : `Route interrupted · ${person.currentGoal}` };
    }
    if (!person.route.length) {
      if ((person.dwellSeconds ?? 0) > 0) return { ...person, dwellSeconds: Math.max(0, person.dwellSeconds! - seconds) };
      if (!person.itinerary.length) return person;
      const [next, ...rest] = person.itinerary;
      if (next.deliveryLeg === 'dropoff') {
        const reason = deliveryBlock({ ...world, development }) ?? ((person.cargoFood ?? 0) <= 0 ? 'Su has no food to deliver.' : null);
        if (reason) return { ...person, itinerary: rest, deliveryLeg: undefined, currentGoal: 'Delivery postponed', taskReason: reason, dwellSeconds: 4 };
      }
      const alreadyThere = distance(person.position, next.destination) < 0.05;
      const routed = { ...withRoute(person, next.destination, next.goal, building, nav), itinerary: rest, destinationTarget: next.target ?? next.activity?.target, activity: next.activity, taskReason: next.reason, deliveryLeg: next.deliveryLeg, forageSite: next.forageSite };
      if (alreadyThere) return arrivedAtPlace({ ...routed, route: [], dwellSeconds: 4 });
      if (!routed.route.length) return { ...routed, currentGoal: `No walkable route · ${next.goal}`, dwellSeconds: 4 };
      return routed;
    }
    let budget = Math.max(0, Math.min(seconds, 1)) * populationRules.walkingSpeed, position = { ...person.position }, route = [...person.route];
    let anchor = person.trailAnchor ?? person.position, bridgeCrossings = person.bridgeCrossings ?? 0;
    while (budget > 0 && route.length) {
      const previous = position;
      const d = distance(position, route[0]);
      if (d <= budget) {
        position = route.shift()!; budget -= d;
        if (person.status === 'resident') trails = addFootstep(trails, anchor, position, person.id, world.day);
        const a = anchor.x - riverX(bridgeZ), b = position.x - riverX(bridgeZ);
        if (Math.abs(anchor.z - bridgeZ) < 0.8 && Math.abs(position.z - bridgeZ) < 0.8 && ((a < 0 && b >= 0) || (a >= 0 && b < 0))) bridgeCrossings++;
        anchor = position;
      }
      else { const t = budget / d; position = { x: position.x + (route[0].x - position.x) * t, z: position.z + (route[0].z - position.z) * t }; budget = 0; }
      if (person.id === 'su' && person.status === 'resident') noticePlants(previous, position);
    }
    const arrived = !route.length && person.status === 'arriving';
    const next: VillagerState = { ...person, trailAnchor: anchor, bridgeCrossings, position, route, dwellSeconds: route.length ? 0 : 4, status: arrived ? 'visiting' : person.status, currentGoal: arrived ? 'Visiting Su’s farmhouse' : person.currentGoal };
    return route.length ? next : arrivedAtPlace(next);
  };
  const su = move(world.population.su), mina = world.population.mina ? move(world.population.mina) : null;
  if (su === world.population.su && mina === world.population.mina) return world;
  const newDiscoveries = discoveries.slice((world.population.discoveries ?? []).length);
  return { ...world, development, ecology: growthSites === world.ecology.growthSites ? world.ecology : { ...world.ecology, growthSites }, population: { ...world.population, su, mina, foodReserve, foraging, trails, discoveries }, today: [...world.today, ...arrivalEvents, ...newDiscoveries.map(d => ({ day: d.day, time: 'Arrival', type: 'population' as const, actorId: d.actor, location: d.place, description: `${d.actor === 'su' ? 'Su' : 'Mina'} reached ${placeNames[d.place]} for the first time.` }))] };
}
export const hasUnfinishedRoutine = (person: VillagerState) => !!(person.route.length || person.itinerary.length || (person.dwellSeconds ?? 0) > 0);
export function inviteMina(world: WorldState): WorldState {
  if (world.population.mina?.status !== 'visiting' || residentCount(world) >= populationRules.capacity) return world;
  return { ...world, population: { ...world.population, placementMode: true, mina: { ...world.population.mina, status: 'invited', currentGoal: 'Waiting for a home / bakery site' } } };
}
export function cancelInvitation(world: WorldState): WorldState {
  if (!world.population.placementMode || !world.population.mina) return world;
  return { ...world, population: { ...world.population, placementMode: false, mina: { ...world.population.mina, status: 'visiting', currentGoal: 'Visiting Su’s farmhouse' } } };
}
export const routeLength = (start: Point, route: Point[]) => route.reduce((sum, q, i) => sum + distance(i ? route[i - 1] : start, q), 0);
const riverBank = Array.from({ length: 39 }, (_, i) => i - 19).flatMap(z => [-1, 1].flatMap(side => [2.5, 3, 3.5, 4, 4.5].map(offset => ({ x: riverX(z) + side * offset, z }))));
const pathPoints = [...Array.from({ length: 59 }, (_, i) => ({ x: -10 + i * 0.5, z: 9.5 })), ...Array.from({ length: 17 }, (_, i) => ({ x: -5, z: 1.5 + i * 0.5 }))];
// Nearest walkable candidate (straight-line order) that the entrance can actually walk to.
function access(door: Point, building: Point, candidates: Point[], nav: Navigation = {}) {
  for (const point of candidates.filter(q => walkable(q, building, nav)).sort((a, b) => distance(door, a) - distance(door, b)).slice(0, 5)) {
    const route = routeBetween(door, point, building, nav); if (route.length) return { point, length: routeLength(door, route) };
  }
  return null;
}
export function inspectPlacement(world: WorldState, p: Point): { error: string; context?: SpatialContext; door?: Point; locations?: VillageLocation[] } {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 17 || Math.abs(p.z) > 17) return { error: 'Keep the whole bakery inside the valley.' };
  if (easternPlaces.some(place => distance(place.position, p) < 4)) return { error: 'Keep the eastern landmarks and their approaches open.' };
  for (const dx of [-1.7, 0, 1.7]) for (const dz of [-1.7, 0, 1.7]) {
    const q = { x: p.x + dx, z: p.z + dz };
    if (!walkable(q) || slope(q) > populationRules.maxSlope || pathDistance(q) < 0.65) return { error: 'Choose gently sloping dry ground clear of the farm, farmhouse, and paths.' };
  }
  const elevations = [-1.35, 1.35].flatMap(dx => [-1.35, 1.35].map(dz => terrainHeight(p.x + dx, p.z + dz)));
  if (Math.max(...elevations) - Math.min(...elevations) > 0.65) return { error: 'This footprint is too uneven for a bakery.' };
  const door = { x: p.x, z: p.z + 2 };
  const nav = navigationFor(world);
  const route = routeBetween(door, farmGate, p, nav), visitorRoute = routeBetween(world.population.mina?.position ?? suDoor, door, p, nav);
  if (!route.length || !visitorRoute.length) return { error: 'The bakery entrance needs a walkable route to the farm and visitor.' };
  const local = world.ecology.cells[cellIndex(p.x, p.z)];
  const river = access(door, p, riverBank, nav), path = access(door, p, pathPoints, nav);
  const locations: VillageLocation[] = [{ type: 'home', position: door }, { type: 'bakery', position: { x: door.x + 1, z: door.z } }, { type: 'farm', position: { ...farmGate } }, ...(river ? [{ type: 'river' as const, position: river.point }] : []), ...(path ? [{ type: 'path' as const, position: path.point }] : [])];
  return { error: '', door, locations, context: { distanceToFarm: distance(p, farmPosition(4)), distanceToRiver: Math.abs(p.x - riverX(p.z)), distanceToPath: pathDistance(p), distanceToFarmhouse: distance(p, housePosition), fertility: local.soilFertility, soilMoisture: local.soilMoisture, elevation: terrainHeight(p.x, p.z), slope: slope(p), routeLengthToFarm: routeLength(door, route), routeLengthToRiver: river?.length ?? null, routeLengthToPath: path?.length ?? null } };
}
export function settleMina(world: WorldState, p: Point): WorldState {
  const mina = world.population.mina;
  if (!world.population.placementMode || mina?.status !== 'invited' || residentCount(world) >= populationRules.capacity) return world;
  const checked = inspectPlacement(world, p); if (checked.error || !checked.context || !checked.door || !checked.locations) return world;
  const resident = { ...withRoute(mina, checked.door, 'Move into home / bakery', p, navigationFor(world)), status: 'resident' as const, destinationTarget: 'home' as const, taskReason: 'The chosen home site passed the placement and route checks.', homePosition: { ...p }, spatialContext: checked.context, socialNeed: 0.3, recentGoals: [] };
  return { ...world, population: { ...world.population, mina: resident, placementMode: false, settlement: { position: { ...p }, door: checked.door, context: checked.context, locations: checked.locations } }, today: [...world.today, { day: world.day, time: '24:00', type: 'population', description: 'Mina settled in the village as a baker.' }] };
}
