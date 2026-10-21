import type { WorldState } from './simulation';
import { cellIndex, farmPosition, housePosition, riverBed, riverX, terrainHeight } from './landscape';
export interface Point { x: number; z: number }
export interface SpatialContext { distanceToFarm: number; distanceToRiver: number; distanceToPath: number; distanceToFarmhouse: number; fertility: number; soilMoisture: number; elevation: number; slope: number; routeLengthToFarm: number }
export interface VillagerState {
  id: 'su' | 'mina'; name: string; profession: 'farmer' | 'baker'; status: 'resident' | 'arriving' | 'visiting' | 'invited';
  position: Point; homePosition: Point | null; currentGoal: string; energy: number; arrivalDay: number;
  spatialContext: SpatialContext | null; dwellSeconds?: number; route: Point[]; itinerary: Array<{ goal: string; destination: Point }>;
}
export interface PopulationState {
  su: VillagerState; mina: VillagerState | null; randomState: number; lastArrivalCheck: number;
  placementMode: boolean; settlement: { position: Point; door: Point; context: SpatialContext } | null;
  foodReserve: number; harvests: Array<{ day: number; amount: number }>; lastProbability: number;
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
export function walkable(p: Point, building: Point | null = null) {
  if (Math.abs(p.x) > 19.5 || Math.abs(p.z) > 19.5) return false;
  if (Math.abs(p.x - housePosition.x) < 2.25 && Math.abs(p.z - housePosition.z) < 1.9) return false;
  if (p.x > -11.1 && p.x < -4.7 && p.z > -5.1 && p.z < 1.3) return false;
  if (building && Math.abs(p.x - building.x) < 1.5 && Math.abs(p.z - building.z) < 1.5) return false;
  const bridge = Math.abs(p.z - bridgeZ) < 0.8 && Math.abs(p.x - riverX(bridgeZ)) < 5;
  return bridge || (terrainHeight(p.x, p.z) > riverBed(p.z) + 1.45 && slope(p) < 0.65);
}
// A bounded grid route avoids the river, steep ground, farm beds and buildings.
export function routeBetween(start: Point, end: Point, building: Point | null = null): Point[] {
  const point = (i: number) => ({ x: i % 40 - 19.5, z: Math.floor(i / 40) - 19.5 });
  const nearest = (p: Point) => {
    let best = -1, score = Infinity;
    for (let i = 0; i < 1600; i++) { const q = point(i), d = distance(p, q); if (d < score && walkable(q, building)) { score = d; best = i; } }
    return score <= 2 ? best : -1;
  };
  if (!walkable(end, building)) return [];
  const a = nearest(start), b = nearest(end); if (a < 0 || b < 0) return [];
  const parents = new Int32Array(1600).fill(-2), queue = [a]; parents[a] = -1;
  for (let cursor = 0; cursor < queue.length && parents[b] === -2; cursor++) {
    const i = queue[cursor];
    for (const n of [i % 40 > 0 ? i - 1 : -1, i % 40 < 39 ? i + 1 : -1, i >= 40 ? i - 40 : -1, i < 1560 ? i + 40 : -1]) {
      if (n >= 0 && parents[n] === -2 && walkable(point(n), building)) { parents[n] = i; queue.push(n); }
    }
  }
  if (parents[b] === -2) return [];
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
function withRoute(person: VillagerState, destination: Point, goal: string, building: Point | null): VillagerState { return { ...person, currentGoal: goal, route: routeBetween(person.position, destination, building) }; }
export function populationDay(world: WorldState): WorldState {
  const old = world.population;
  if (old.lastArrivalCheck === world.day) return world;
  const population = { ...old, lastArrivalCheck: world.day, foodReserve: Math.max(0, old.foodReserve - residentCount(world) * populationRules.dailyFoodPerResident), harvests: old.harvests.filter(h => world.day - h.day < populationRules.recentDays), lastProbability: 0 };
  let result = { ...world, population };
  population.su = withRoute(population.su, farmGate, 'Operate the farm', population.settlement?.position ?? null);
  if (population.mina?.status === 'resident' && population.settlement) {
    const building = population.settlement.position, door = population.settlement.door;
    // Independent seed/day hash: the routine never consumes weather or arrival randomness.
    const visit = ((Math.imul(world.day + 1, 1103515245) ^ world.parameters.seed) >>> 0) / 4294967296 < 0.45;
    const itinerary = [{ goal: 'Day · bakery work', destination: { x: door.x + 1, z: door.z } }, ...(visit ? [{ goal: 'Afternoon · visit Su’s farm', destination: farmGate }] : []), { goal: 'Evening · return home', destination: door }];
    population.mina = { ...withRoute(population.mina, door, 'Morning · home', building), itinerary, energy: 1 };
  }
  if (!arrivalEligibility(result)) return result;
  population.lastProbability = Math.min(populationRules.maxArrivalChance, populationRules.baseArrivalChance + (population.foodReserve - populationRules.reserveThreshold) * 0.005);
  population.randomState = (Math.imul(population.randomState, 1664525) + 1013904223) >>> 0;
  if (population.randomState / 4294967296 >= population.lastProbability) return result;
  const route = routeBetween(easternEntry, suDoor);
  if (!route.length) return result;
  population.mina = { id: 'mina', name: 'Mina', profession: 'baker', status: 'arriving', position: { ...easternEntry }, homePosition: null, currentGoal: 'Walk to Su’s farmhouse', energy: 1, arrivalDay: world.day, spatialContext: null, route, itinerary: [] };
  return { ...result, today: [...world.today, { day: world.day, time: '24:00', type: 'population', description: 'A traveler was seen near the eastern path.' }] };
}
export function movePopulation(world: WorldState, seconds: number): WorldState {
  const building = world.population.settlement?.position ?? null;
  const move = (person: VillagerState): VillagerState => {
    if (!person.route.length) {
      if ((person.dwellSeconds ?? 0) > 0) return { ...person, dwellSeconds: Math.max(0, person.dwellSeconds! - seconds) };
      if (!person.itinerary.length) return person;
      const [next, ...rest] = person.itinerary;
      return { ...withRoute(person, next.destination, next.goal, building), itinerary: rest };
    }
    let budget = Math.max(0, Math.min(seconds, 1)) * populationRules.walkingSpeed, position = { ...person.position }, route = [...person.route];
    while (budget > 0 && route.length) {
      const d = distance(position, route[0]);
      if (d <= budget) { position = route.shift()!; budget -= d; }
      else { const t = budget / d; position = { x: position.x + (route[0].x - position.x) * t, z: position.z + (route[0].z - position.z) * t }; budget = 0; }
    }
    const arrived = !route.length && person.status === 'arriving';
    return { ...person, position, route, dwellSeconds: route.length ? 0 : 4, status: arrived ? 'visiting' : person.status, currentGoal: arrived ? 'Visiting Su’s farmhouse' : person.currentGoal };
  };
  const su = move(world.population.su), mina = world.population.mina ? move(world.population.mina) : null;
  if (su === world.population.su && mina === world.population.mina) return world;
  return { ...world, population: { ...world.population, su, mina } };
}
export function inviteMina(world: WorldState): WorldState {
  if (world.population.mina?.status !== 'visiting' || residentCount(world) >= populationRules.capacity) return world;
  return { ...world, population: { ...world.population, placementMode: true, mina: { ...world.population.mina, status: 'invited', currentGoal: 'Waiting for a home / bakery site' } } };
}
export function cancelInvitation(world: WorldState): WorldState {
  if (!world.population.placementMode || !world.population.mina) return world;
  return { ...world, population: { ...world.population, placementMode: false, mina: { ...world.population.mina, status: 'visiting', currentGoal: 'Visiting Su’s farmhouse' } } };
}
export function inspectPlacement(world: WorldState, p: Point): { error: string; context?: SpatialContext; door?: Point } {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 17 || Math.abs(p.z) > 17) return { error: 'Keep the whole bakery inside the valley.' };
  for (const dx of [-1.7, 0, 1.7]) for (const dz of [-1.7, 0, 1.7]) {
    const q = { x: p.x + dx, z: p.z + dz };
    if (!walkable(q) || slope(q) > populationRules.maxSlope || pathDistance(q) < 0.65) return { error: 'Choose gently sloping dry ground clear of the farm, farmhouse, and paths.' };
  }
  const elevations = [-1.35, 1.35].flatMap(dx => [-1.35, 1.35].map(dz => terrainHeight(p.x + dx, p.z + dz)));
  if (Math.max(...elevations) - Math.min(...elevations) > 0.65) return { error: 'This footprint is too uneven for a bakery.' };
  const door = { x: p.x, z: p.z + 2 };
  const route = routeBetween(door, farmGate, p), visitorRoute = routeBetween(world.population.mina?.position ?? suDoor, door, p);
  if (!route.length || !visitorRoute.length) return { error: 'The bakery entrance needs a walkable route to the farm and visitor.' };
  const local = world.ecology.cells[cellIndex(p.x, p.z)];
  let routeLengthToFarm = 0, last = door; route.forEach(q => { routeLengthToFarm += distance(last, q); last = q; });
  return { error: '', door, context: { distanceToFarm: distance(p, farmPosition(4)), distanceToRiver: Math.abs(p.x - riverX(p.z)), distanceToPath: pathDistance(p), distanceToFarmhouse: distance(p, housePosition), fertility: local.soilFertility, soilMoisture: local.soilMoisture, elevation: terrainHeight(p.x, p.z), slope: slope(p), routeLengthToFarm } };
}
export function settleMina(world: WorldState, p: Point): WorldState {
  const mina = world.population.mina;
  if (!world.population.placementMode || mina?.status !== 'invited' || residentCount(world) >= populationRules.capacity) return world;
  const checked = inspectPlacement(world, p); if (checked.error || !checked.context || !checked.door) return world;
  const resident = { ...withRoute(mina, checked.door, 'Move into home / bakery', p), status: 'resident' as const, homePosition: { ...p }, spatialContext: checked.context };
  return { ...world, population: { ...world.population, mina: resident, placementMode: false, settlement: { position: { ...p }, door: checked.door, context: checked.context } }, today: [...world.today, { day: world.day, time: '24:00', type: 'population', description: 'Mina settled in the village as a baker.' }] };
}
