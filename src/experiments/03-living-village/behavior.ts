import type { WorldEvent, WorldState } from './simulation';
import { LocationType, Point, recentHarvest, SpatialContext } from './population';
// Phase 3: a resident's day is four seeded, weighted decisions, one per six-hour day part.
// Placement, weather, farm state and needs change the weights; there is no fixed timetable.
export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening';
export type Goal = 'REST' | 'WORK' | 'VISIT_FARM' | 'VISIT_RIVER' | 'WALK' | 'RETURN_HOME';
export type BehaviorEventType = 'VISITED_FARM' | 'VISITED_RIVER' | 'WALKED' | 'WORKED' | 'RESTED' | 'RETURNED_HOME' | 'STAYED_HOME';
/** One decision: what was chosen, where it leads, and the needs and weights it was chosen with. */
export interface Activity { part: DayPart; goal: Goal; target: LocationType; targetPosition: Point; energy: number; socialNeed: number; weights: Record<Goal, number> | null }
export interface BehaviorInputs { part: DayPart; energy: number; socialNeed: number; atHome: boolean; context: SpatialContext; rainfallMm: number; temperatureC: number; riverLevel: number; farmActivity: number }

export const dayParts: DayPart[] = ['morning', 'midday', 'afternoon', 'evening'];
export const goals: Goal[] = ['REST', 'WORK', 'VISIT_FARM', 'VISIT_RIVER', 'WALK', 'RETURN_HOME'];
export const goalTargets: Record<Goal, LocationType> = { REST: 'home', WORK: 'bakery', VISIT_FARM: 'farm', VISIT_RIVER: 'river', WALK: 'path', RETURN_HOME: 'home' };
export const goalNames: Record<Goal, string> = { REST: 'Rest at home', WORK: 'Bakery work', VISIT_FARM: 'Visit Su’s farm', VISIT_RIVER: 'Visit the river', WALK: 'Walk the path', RETURN_HOME: 'Return home' };
export const behaviorRules = {
  base: { REST: 1, WORK: 1.3, VISIT_FARM: 0.9, VISIT_RIVER: 0.7, WALK: 0.7, RETURN_HOME: 1 } as Record<Goal, number>,
  time: {
    morning: { REST: 1.1, WORK: 1.6, VISIT_FARM: 0.5, VISIT_RIVER: 0.4, WALK: 0.5, RETURN_HOME: 0.5 },
    midday: { REST: 0.5, WORK: 1.4, VISIT_FARM: 1.1, VISIT_RIVER: 0.8, WALK: 1, RETURN_HOME: 0.6 },
    afternoon: { REST: 0.6, WORK: 0.9, VISIT_FARM: 1.3, VISIT_RIVER: 1.3, WALK: 1.2, RETURN_HOME: 0.8 },
    evening: { REST: 1.6, WORK: 0.4, VISIT_FARM: 0.4, VISIT_RIVER: 0.5, WALK: 0.6, RETURN_HOME: 2 },
  } as Record<DayPart, Record<Goal, number>>,
  maxTravelM: 30,                 // walking distance at which proximity reaches 0
  // Energy spent per day part (negative restores). Travel adds a per-metre cost.
  activityEnergy: { REST: -0.25, WORK: 0.15, VISIT_FARM: 0.1, VISIT_RIVER: 0.08, WALK: 0.1, RETURN_HOME: -0.05 } as Record<Goal, number>,
  travelEnergyPerM: 0.004, overnightEnergy: 0.45,
  socialPerPart: 0.08, farmSocialRelief: 0.45, // time apart raises social need; visiting Su lowers it
  rainFullMm: 10, comfortableC: 18, comfortRangeC: 12, highRiverM: 0.8, floodRangeM: 0.6,
};
const outdoor: Goal[] = ['VISIT_FARM', 'VISIT_RIVER', 'WALK'];
const partTimes: Record<DayPart, string> = { morning: '08:00', midday: '12:00', afternoon: '15:00', evening: '19:00' };
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const proximity = (distance: number) => 1 - clamp(distance / behaviorRules.maxTravelM);
export function travelDistance(goal: Goal, c: SpatialContext): number | null {
  return goal === 'VISIT_FARM' ? c.routeLengthToFarm : goal === 'VISIT_RIVER' ? c.routeLengthToRiver : goal === 'WALK' ? c.routeLengthToPath : 0;
}
// weight = base × time × needs × space × environment
export function goalWeights(i: BehaviorInputs): Record<Goal, number> {
  const r = behaviorRules, wet = clamp(i.rainfallMm / r.rainFullMm);
  const fair = clamp(1 - Math.abs(i.temperatureC - r.comfortableC) / r.comfortRangeC) * (1 - wet);
  const flood = clamp((i.riverLevel - r.highRiverM) / r.floodRangeM);
  const weights = {} as Record<Goal, number>;
  for (const goal of goals) {
    let w = r.base[goal] * r.time[i.part][goal];
    if (goal === 'REST' || goal === 'RETURN_HOME') w *= 0.4 + 2 * (1 - i.energy);
    else if (goal === 'WORK') w *= 0.6 + 0.4 * i.energy;
    else w *= 0.3 + 0.7 * i.energy;
    if (goal === 'VISIT_FARM') w *= 0.5 + 1.5 * i.socialNeed;
    if (outdoor.includes(goal)) {
      const d = travelDistance(goal, i.context);
      w *= d === null ? 0 : 0.15 + 1.35 * proximity(d);
      w *= 1 - 0.6 * wet;
    } else w *= 1 + 0.4 * wet;
    if (goal === 'WALK') w *= 1 + 0.5 * fair;
    if (goal === 'VISIT_FARM') w *= (1 + 0.2 * fair) * (1 + 0.5 * i.farmActivity);
    if (goal === 'VISIT_RIVER') w *= 1 - 0.8 * flood;
    if (goal === 'RETURN_HOME' && i.atHome) w = 0;
    weights[goal] = w;
  }
  return weights;
}
const mix = (n: number) => { n = Math.imul(n ^ (n >>> 16), 0x85ebca6b); n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35); return (n ^ (n >>> 16)) >>> 0; };
const idHash = (id: string) => Array.from(id).reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
/** Uniform [0, 1) from seed + day + villager + decision index; consumes no weather or arrival randomness. */
export function behaviorRandom(seed: number, day: number, villagerId: string, decision: number) {
  return mix(mix(mix(seed ^ idHash(villagerId)) + day) + decision) / 4294967296;
}
export function chooseGoal(weights: Record<Goal, number>, roll: number): Goal {
  const total = goals.reduce((sum, g) => sum + weights[g], 0);
  let threshold = roll * total;
  for (const goal of goals) { if (weights[goal] > 0 && threshold < weights[goal]) return goal; threshold -= weights[goal]; }
  return 'REST';
}
const list = (parts: DayPart[]) => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
const label = (a: Activity) => `${a.part[0].toUpperCase()}${a.part.slice(1)} · ${goalNames[a.goal].toLowerCase()}`;
export function behaviorDay(world: WorldState): WorldState {
  const { mina, settlement } = world.population;
  if (mina?.status !== 'resident' || !settlement || !mina.spatialContext || !world.weather) return world;
  const r = behaviorRules, context = mina.spatialContext, weather = world.weather, riverLevel = world.ecology.riverLevel;
  const place = (type: LocationType) => settlement.locations.find(l => l.type === type)?.position ?? settlement.door;
  const ready = world.plots.filter(p => p.crop && p.crop.health > 0 && p.crop.growth >= 1).length;
  const farmActivity = clamp(ready / world.plots.length + recentHarvest(world) / 50);
  let energy = clamp(mina.energy + r.overnightEnergy), socialNeed = mina.socialNeed ?? 0.3, atHome = true;
  const plan: Activity[] = dayParts.map((part, index) => {
    const weights = goalWeights({ part, energy, socialNeed, atHome, context, rainfallMm: weather.rainfallMm, temperatureC: weather.temperatureC, riverLevel, farmActivity });
    const goal = chooseGoal(weights, behaviorRandom(world.parameters.seed, world.day, mina.id, index)), target = goalTargets[goal];
    const activity: Activity = { part, goal, target, targetPosition: place(target), energy, socialNeed, weights };
    energy = clamp(energy - r.activityEnergy[goal] - (travelDistance(goal, context) ?? 0) * r.travelEnergyPerM);
    socialNeed = goal === 'VISIT_FARM' ? clamp(socialNeed - r.farmSocialRelief) : clamp(socialNeed + r.socialPerPart);
    atHome = target === 'home' || target === 'bakery';
    return activity;
  });
  const itinerary = plan.map(a => ({ goal: label(a), destination: a.targetPosition, activity: a }));
  // Night is spent at home: an outing or late bakery work ends with a walk to the door.
  if (plan[3].target !== 'home') itinerary.push({ goal: 'Night · return home', destination: settlement.door, activity: { part: 'evening', goal: 'RETURN_HOME', target: 'home', targetPosition: settlement.door, energy, socialNeed, weights: null } });
  const events = behaviorEvents(world, plan);
  const nextMina = { ...mina, route: [], dwellSeconds: 0, itinerary, energy, socialNeed, recentGoals: [...(mina.recentGoals ?? []), { day: world.day, goals: plan.map(a => a.goal) }].slice(-7) };
  // Stable sort keeps same-time events in insertion order.
  return { ...world, population: { ...world.population, mina: nextMina }, today: [...world.today, ...events].sort((a, b) => a.time.localeCompare(b.time)) };
}
// Raw, structured behavior events: one per meaningful transition, never per tick. Phase 4 can interpret them.
function behaviorEvents(world: WorldState, plan: Activity[]): WorldEvent[] {
  const rainfallMm = world.weather?.rainfallMm ?? 0, rain = rainfallMm > 0;
  const event = (a: Activity, time: string, action: BehaviorEventType, description: string, targetId?: string): WorldEvent => ({
    day: world.day, time, type: 'behavior', description, action, actorId: 'mina', ...(targetId ? { targetId } : {}), location: a.target,
    context: { part: a.part, rainfallMm, riverLevel: world.ecology.riverLevel, energy: a.energy, socialNeed: a.socialNeed },
  });
  const events: WorldEvent[] = [];
  if (!plan.some(a => outdoor.includes(a.goal))) return [event(plan[0], '24:00', 'STAYED_HOME', `Mina stayed near home today${rain ? ' while it rained' : ''}.`)];
  const work = plan.filter(a => a.goal === 'WORK');
  if (work.length) events.push(event(work[0], partTimes[work[0].part], 'WORKED', `Mina worked at the bakery in the ${list(work.map(a => a.part))}.`));
  plan.forEach((a, i) => {
    const previous = plan[i - 1];
    if (previous?.goal === a.goal && outdoor.includes(a.goal)) return; // an outing spanning several parts is one event
    const run: DayPart[] = []; for (let j = i; j < plan.length && plan[j].goal === a.goal; j++) run.push(plan[j].part);
    const time = partTimes[a.part];
    if (a.goal === 'VISIT_FARM') events.push(event(a, time, 'VISITED_FARM', `Mina visited Su’s farm in the ${list(run)}.`, 'su'));
    if (a.goal === 'VISIT_RIVER') events.push(event(a, time, 'VISITED_RIVER', `Mina spent the ${list(run)} near the river.`));
    if (a.goal === 'WALK') events.push(event(a, time, 'WALKED', `Mina walked along the village path in the ${list(run)}.`));
    if (a.goal === 'RETURN_HOME') events.push(event(a, time, 'RETURNED_HOME', `Mina returned home from the ${previous.target} ${rain ? 'in the rain' : `in the ${a.part}`}.`));
    if (a.goal === 'REST' && a.part !== 'evening' && a.energy < 0.35) events.push(event(a, time, 'RESTED', `Mina rested at home in the ${a.part}, tired.`));
  });
  return events;
}
