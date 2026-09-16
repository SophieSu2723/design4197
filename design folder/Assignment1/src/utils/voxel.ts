import { sampleNoise } from './noise';
import { triTable } from './marchingTables';

export type Vec3 = [number, number, number];
export type DensityShape = 'sphere' | 'box' | 'torus' | 'capsule';
export type CsgMode = 'union' | 'subtract' | 'intersect';
export interface CsgOperation { id: number; shape: DensityShape; mode: CsgMode; center: Vec3; size: number; enabled: boolean }
export interface VoxelSettings {
  resolution: number; chunkSize: number; worldSize: number;
  base: 'terrain' | 'caves' | DensityShape; seed: number; amplitude: number;
  mesher: 'marching' | 'blocks'; operations: CsgOperation[];
}
export const initialVoxel: VoxelSettings = {
  resolution: 32, chunkSize: 16, worldSize: 16, base: 'terrain', seed: 7, amplitude: 2.5, mesher: 'marching',
  operations: [{ id: 1, shape: 'sphere', mode: 'subtract', center: [0, -1, 4], size: 3.2, enabled: true }],
};

// Negative is solid. Primitive sizes are radius (sphere), half extent (box),
// major radius (torus, tube = 0.35r), or cap radius (capsule, half segment = r).
export function shapeDensity(shape: DensityShape, p: Vec3, size: number): number {
  const [x, y, z] = p;
  switch (shape) {
    case 'sphere': return Math.hypot(x, y, z) - size;
    case 'box': {
      const q = p.map(v => Math.abs(v) - size);
      return Math.hypot(...q.map(v => Math.max(v, 0))) + Math.min(Math.max(...q), 0);
    }
    case 'torus': return Math.hypot(Math.hypot(x, z) - size, y) - size * 0.35;
    case 'capsule': return Math.hypot(x, y - Math.max(-size, Math.min(size, y)), z) - size;
  }
}
export function combineDensity(a: number, b: number, mode: CsgMode): number {
  return mode === 'union' ? Math.min(a, b) : mode === 'subtract' ? Math.max(a, -b) : Math.max(a, b);
}
export function densityAt(p: Vec3, settings: VoxelSettings): number {
  const [x, y, z] = p;
  let d: number;
  if (settings.base === 'terrain' || settings.base === 'caves') {
    const seed = settings.seed * 13.17;
    const h = sampleNoise(x * 0.16 + seed, 0, z * 0.16 - seed, 'value', 3, 0.5, 2) * settings.amplitude;
    d = y - h;
    if (settings.base === 'caves') {
      const cave = Math.abs(sampleNoise(x * 0.3 + seed, y * 0.3, z * 0.3, 'value', 2, 0.5, 2)) - 0.12;
      d = Math.max(d, -cave * 4);
    }
  } else d = shapeDensity(settings.base, p, settings.worldSize * (settings.base === 'capsule' ? 0.2 : 0.27));
  // A two-cell narrow band bounds the influence of union/subtraction on both
  // interpolation and normals, making spatial cache invalidation conservative.
  const band = 2 * settings.worldSize / settings.resolution;
  const clamp = (value: number) => Math.max(-band, Math.min(band, value));
  d = clamp(d);
  for (const op of settings.operations) {
    if (op.enabled) d = combineDensity(d, clamp(shapeDensity(op.shape, [x - op.center[0], y - op.center[1], z - op.center[2]], op.size)), op.mode);
  }
  // A small air margin closes the finite sample volume, including terrain sides.
  return Math.max(d, shapeDensity('box', p, settings.worldSize / 2 - settings.worldSize / settings.resolution));
}

export interface Chunk { key: string; origin: Vec3; cells: Vec3 }
export interface ChunkMesh {
  chunk: Chunk; positions: Float32Array; normals: Float32Array; indices: Uint32Array;
  sampleBytes: number; // temporary density allocation, released after this chunk
}
export function listChunks(settings: VoxelSettings): Chunk[] {
  const result: Chunk[] = [], n = settings.resolution, c = settings.chunkSize;
  for (let z = 0; z < n; z += c) for (let y = 0; y < n; y += c) for (let x = 0; x < n; x += c) {
    result.push({ key: `${x},${y},${z}`, origin: [x, y, z], cells: [Math.min(c, n - x), Math.min(c, n - y), Math.min(c, n - z)] });
  }
  return result;
}
// Conservatively include the primitive plus the gradient/neighbor halo. An
// intersection affects the entire world, including chunks outside its bounds.
export function chunkSignature(chunk: Chunk, settings: VoxelSettings): string {
  const step = settings.worldSize / settings.resolution;
  const operations = settings.operations.filter(op => {
    if (!op.enabled) return false;
    if (op.mode === 'intersect') return true;
    const radius = op.size * (op.shape === 'capsule' ? 2 : op.shape === 'torus' ? 1.35 : 1);
    return op.center.every((v, axis) => v + radius >= (chunk.origin[axis] - 4) * step - settings.worldSize / 2 &&
      v - radius <= (chunk.origin[axis] + chunk.cells[axis] + 4) * step - settings.worldSize / 2);
  });
  return JSON.stringify({ ...settings, operations, chunk });
}

const corners: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export function meshChunk(chunk: Chunk, settings: VoxelSettings): ChunkMesh {
  const [nx, ny, nz] = chunk.cells, sx = nx + 3, sy = ny + 3;
  const step = settings.worldSize / settings.resolution, half = settings.worldSize / 2;
  const sample = new Float32Array(sx * sy * (nz + 3));
  const idx = (x: number, y: number, z: number) => (x + 1) + sx * ((y + 1) + sy * (z + 1));
  const offset = settings.mesher === 'blocks' ? 0.5 : 0;
  for (let z = -1; z <= nz + 1; z++) for (let y = -1; y <= ny + 1; y++) for (let x = -1; x <= nx + 1; x++) {
    sample[idx(x, y, z)] = densityAt([(chunk.origin[0] + x + offset) * step - half,
      (chunk.origin[1] + y + offset) * step - half, (chunk.origin[2] + z + offset) * step - half], settings);
  }
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const world = (p: Vec3): Vec3 => p.map((v, a) => (v + chunk.origin[a]) * step - half) as Vec3;
  if (settings.mesher === 'blocks') {
    // Each face's u × v is its outward normal; no internal or chunk-border faces.
    const faces: { n: Vec3; u: Vec3; v: Vec3; o: Vec3 }[] = [
      { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], o: [1, 0, 0] },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0] },
      { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], o: [0, 1, 0] },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1] },
      { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], o: [0, 0, 0] },
    ];
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      if (sample[idx(x, y, z)] >= 0) continue;
      for (const { n, u, v, o } of faces) {
        if (sample[idx(x + n[0], y + n[1], z + n[2])] < 0) continue;
        const base = positions.length / 3;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          positions.push(...world([x + o[0] + a * u[0] + b * v[0], y + o[1] + a * u[1] + b * v[1], z + o[2] + a * u[2] + b * v[2]]));
          normals.push(...n);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  } else {
    const vertices = new Map<string, number>();
    const gradient = (p: Vec3): Vec3 => [sample[idx(p[0] + 1, p[1], p[2])] - sample[idx(p[0] - 1, p[1], p[2])],
      sample[idx(p[0], p[1] + 1, p[2])] - sample[idx(p[0], p[1] - 1, p[2])],
      sample[idx(p[0], p[1], p[2] + 1)] - sample[idx(p[0], p[1], p[2] - 1)]];
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const points: Vec3[] = corners.map(p => [x + p[0], y + p[1], z + p[2]]);
      const values = points.map(p => sample[idx(...p)]);
      let mask = 0;
      values.forEach((d, i) => { if (d < 0) mask |= 1 << i; });
      if (mask === 0 || mask === 255) continue;
      const vertex = (edge: number) => {
        const [a, b] = edges[edge], ia = idx(...points[a]), ib = idx(...points[b]);
        const key = `${Math.min(ia, ib)}:${Math.max(ia, ib)}`;
        const existing = vertices.get(key); if (existing !== undefined) return existing;
        const t = values[a] / (values[a] - values[b]);
        positions.push(...world(points[a].map((v, axis) => v + t * (points[b][axis] - v)) as Vec3));
        const ga = gradient(points[a]), gb = gradient(points[b]);
        const normal = ga.map((v, axis) => v + t * (gb[axis] - v));
        const length = Math.hypot(...normal) || 1;
        normals.push(...normal.map(v => v / length));
        const result = positions.length / 3 - 1; vertices.set(key, result); return result;
      };
      for (let i = mask * 16; triTable[i] !== -1; i += 3) {
        // Table winding faces negative density; reverse for outward-facing solids.
        const a = vertex(triTable[i]), b = vertex(triTable[i + 2]), c = vertex(triTable[i + 1]);
        const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
        const vx = positions[c * 3] - positions[a * 3], vy = positions[c * 3 + 1] - positions[a * 3 + 1], vz = positions[c * 3 + 2] - positions[a * 3 + 2];
        if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-10) indices.push(a, b, c);
      }
    }
  }
  return { chunk, positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), sampleBytes: sample.byteLength };
}
