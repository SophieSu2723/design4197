import type { Point } from './population';

export interface TrailSegment { a: Point; b: Point; wear: number; passes: number; lastDay: number; su: number; mina: number }
export type Trails = Record<string, TrailSegment>;
export const wornTrailThreshold = 0.3;
const trailCosts = new WeakMap<Trails, Map<number, number>>();

// Use the full 60 m width so original-valley edges keep their IDs when the ridge opens.
function gridNode(x: number, z: number) {
  const column = x + 19.5, row = z + 19.5;
  return Number.isInteger(column) && Number.isInteger(row) && column >= 0 && column < 60 && row >= 0 && row < 40
    ? row * 60 + column : -1;
}

export function gridEdgeKey(a: number, b: number) {
  return Math.min(a, b) * 2400 + Math.max(a, b);
}

export function wornTrailCosts(trails: Trails) {
  const cached = trailCosts.get(trails);
  if (cached) return cached;
  const costs = new Map<number, number>();
  for (const { a, b, wear } of Object.values(trails)) {
    if (wear < wornTrailThreshold || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) !== 1) continue;
    const start = gridNode(a.x, a.z), end = gridNode(b.x, b.z);
    if (start < 0 || end < 0) continue;
    costs.set(gridEdgeKey(start, end), 100 - Math.round(30 * wear));
  }
  trailCosts.set(trails, costs);
  return costs;
}

export function followsWornTrail(trails: Trails, a: Point, b: Point) {
  const start = gridNode(a.x, a.z), end = gridNode(b.x, b.z);
  return start >= 0 && end >= 0 && wornTrailCosts(trails).has(gridEdgeKey(start, end));
}

const pointKey = (p: Point) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
export function addFootstep(trails: Trails, a: Point, b: Point, actor: 'su' | 'mina', day: number): Trails {
  if (Math.hypot(a.x - b.x, a.z - b.z) < 0.02) return trails;
  const keys = [pointKey(a), pointKey(b)].sort(), key = keys.join('|');
  const old = trails[key];
  return { ...trails, [key]: { a: { ...a }, b: { ...b }, wear: Math.min(1, (old?.wear ?? 0) + 0.18), passes: (old?.passes ?? 0) + 1,
    lastDay: day, su: (old?.su ?? 0) + (actor === 'su' ? 1 : 0), mina: (old?.mina ?? 0) + (actor === 'mina' ? 1 : 0) } };
}
/** Only past walked segments exist. Unused paths recover gradually, once per day. */
export function recoverTrails(trails: Trails, day: number): Trails {
  const next: Trails = {};
  Object.entries(trails).forEach(([key, segment]) => {
    const wear = segment.lastDay < day - 1 ? segment.wear * 0.92 : segment.wear;
    if (wear >= 0.025) next[key] = { ...segment, wear };
  });
  return next;
}
export const footprintKey = (x: number, z: number) => `${Math.floor(x * 2)},${Math.floor(z * 2)}`;
export function trailFootprint(trails: Trails): Map<string, number> {
  const footprint = new Map<string, number>();
  Object.values(trails).forEach(({ a, b, wear }) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) * 5));
    for (let i = 0; i <= steps; i++) {
      const key = footprintKey(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps);
      footprint.set(key, Math.max(footprint.get(key) ?? 0, wear));
    }
  });
  return footprint;
}
