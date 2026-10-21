import { sampleNoise } from '../utils/noise';
export const WORLD_SIZE = 40, CELL_COUNT = 32, CELL_WIDTH = WORLD_SIZE / CELL_COUNT;
export const riverX = (z: number) => 2 + Math.sin(z * 0.15) * 3;
export const riverBed = (z: number) => -0.7 + (z + 20) * 0.018;
export const farmPosition = (id: number) => ({ x: -10 + (id % 3) * 2.1, z: -4 + Math.floor(id / 3) * 2.1 });
export const housePosition = { x: -9, z: 7 };
export function terrainHeight(x: number, z: number): number {
  const distance = Math.abs(x - riverX(z));
  const noise = sampleNoise(x * 0.12 + 8, z * 0.12 + 4, 2.3, 'value', 3, 0.45, 2);
  const rolling = 0.7 + Math.pow(distance / 12, 1.6) * 2.5 + noise * 1.4;
  const bank = Math.min(1, Math.max(0, (distance - 0.8) / 2.5));
  let height = riverBed(z) + bank * (rolling - riverBed(z));
  const terraceDistance = Math.max(Math.abs(x + 8) / 5.4, Math.abs(z - 1.5) / 8.5);
  const terrace = Math.max(0, Math.min(1, (1.2 - terraceDistance) / 0.3));
  height = height * (1 - terrace) + 1.45 * terrace;
  return height;
}
export function cellIndex(x: number, z: number) {
  const clamp = (v: number) => Math.max(0, Math.min(CELL_COUNT - 1, Math.floor(v)));
  return clamp((z + 20) / CELL_WIDTH) * CELL_COUNT + clamp((x + 20) / CELL_WIDTH);
}
export function excluded(x: number, z: number) {
  return (x > -12 && x < -3.5 && z > -6 && z < 3) || (Math.abs(x + 9) < 3.4 && Math.abs(z - 7) < 3.2) || (Math.abs(x + 5) < 0.65 && z > 1 && z < 10) || (Math.abs(z - 9.5) < 0.65 && x > -10 && x < riverX(z));
}
export interface TerrainCell { x: number; z: number; elevation: number; slope: number; waterDistance: number; drainage: number; fertility: number }
export interface VegetationSite { x: number; z: number; cell: number; kind: 'grass' | 'flower' | 'shrub' | 'tree' | 'rock'; scale: number; rotation: number }
const habitatNoise = (x: number, z: number, seed: number) => sampleNoise(x * 0.075 + seed * 0.013, z * 0.075 - seed * 0.017, 1.7, 'value', 2, 0.55, 2);
export interface Landscape { cells: TerrainCell[]; sites: VegetationSite[] }
export function createLandscape(seed: number): Landscape {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const cells = Array.from({ length: CELL_COUNT ** 2 }, (_, id) => {
    const x = (id % CELL_COUNT + 0.5) * CELL_WIDTH - 20, z = (Math.floor(id / CELL_COUNT) + 0.5) * CELL_WIDTH - 20;
    const slope = Math.atan(Math.hypot((terrainHeight(x + 0.2, z) - terrainHeight(x - 0.2, z)) / 0.4, (terrainHeight(x, z + 0.2) - terrainHeight(x, z - 0.2)) / 0.4));
    const waterDistance = Math.abs(x - riverX(z));
    return { x, z, elevation: terrainHeight(x, z), slope, waterDistance, drainage: 0.6 + slope * 1.5,
      fertility: Math.max(0.3, Math.min(1, 0.95 - slope * 0.3 - waterDistance * 0.012)) };
  });
  const sites: VegetationSite[] = [];
  const trees: { x: number; z: number }[] = [];
  // Vegetation is sampled from habitat rules rather than uniform decoration.
  // Moist river margins favor grasses/shrubs; fertile flats favor flowers;
  // wooded patches form on stable, moderately moist ground; steep slopes expose rock.
  for (let i = 0; i < 10500; i++) {
    const x = random() * 39 - 19.5, z = random() * 39 - 19.5, cell = cellIndex(x, z), c = cells[cell];
    if (excluded(x, z) || c.waterDistance < 1.35) continue;
    const moisture = Math.max(0.12, Math.min(1, 0.96 - c.waterDistance * 0.032 - c.slope * 0.18));
    const patch = Math.max(0, Math.min(1, habitatNoise(x, z, seed) * 0.65 + 0.38));
    const flatness = Math.max(0, 1 - c.slope / 0.82);
    const vigor = Math.max(0, Math.min(1, c.fertility * 0.48 + moisture * 0.34 + flatness * 0.18));

    let kind: VegetationSite['kind'] = 'grass';
    const roll = random();
    const rocky = c.slope > 0.34 && (1 - flatness) * (0.35 + patch) > random();
    const woodland = c.waterDistance > 2.4 && c.waterDistance < 15 && c.slope < 0.52 && patch > 0.56 && vigor > 0.48;
    const riparian = c.waterDistance < 4.3 && moisture > 0.62;
    const meadow = c.slope < 0.3 && c.fertility > 0.67 && patch > 0.38;

    if (rocky && roll < 0.18) kind = 'rock';
    else if (woodland && roll < 0.075 && trees.every(t => Math.hypot(t.x - x, t.z - z) > 2.05)) {
      kind = 'tree'; trees.push({ x, z });
    } else if ((riparian || woodland) && roll < 0.22) kind = 'shrub';
    else if (meadow && roll < 0.34) kind = 'flower';

    const density = kind === 'rock' ? 0.72 : kind === 'tree' ? vigor * patch : kind === 'shrub' ? vigor * (0.65 + patch * 0.35) : vigor * (0.72 + patch * 0.42);
    if (random() > Math.min(0.94, density)) continue;
    const scaleBase = kind === 'tree' ? 0.82 : kind === 'rock' ? 0.72 : 0.62;
    sites.push({ x, z, cell, kind, scale: scaleBase + random() * (kind === 'tree' ? 0.62 : 0.58), rotation: random() * Math.PI * 2 });
  }
  return { cells, sites };
}
