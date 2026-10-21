import { CsgOperation, VoxelSettings, chunkSignature, combineDensity, densityAt, initialVoxel, listChunks, meshChunk, shapeDensity } from './voxel';

const sphere: VoxelSettings = { ...initialVoxel, base: 'sphere', resolution: 16, chunkSize: 8, operations: [] };
const op = (mode: CsgOperation['mode'], size: number): CsgOperation => ({ id: 2, shape: 'sphere', mode, size, center: [0, 0, 0], enabled: true });

test('primitive density signs and surface locations are correct', () => {
  expect(shapeDensity('sphere', [0, 0, 0], 2)).toBe(-2);
  expect(shapeDensity('sphere', [2, 0, 0], 2)).toBe(0);
  expect(shapeDensity('box', [2, 2, 0], 2)).toBe(0);
  expect(shapeDensity('box', [3, 3, 2], 2)).toBeCloseTo(Math.sqrt(2));
  expect(shapeDensity('torus', [0, 0, 0], 2)).toBeGreaterThan(0);
  expect(shapeDensity('torus', [2, 0, 0], 2)).toBeLessThan(0);
  expect(shapeDensity('capsule', [0, 4, 0], 2)).toBe(0);
});
test('CSG applies negative-inside rules in order and ignores disabled steps', () => {
  expect(combineDensity(-2, 1, 'union')).toBe(-2);
  expect(combineDensity(-2, -1, 'subtract')).toBe(1);
  expect(combineDensity(-2, 1, 'intersect')).toBe(1);
  const carve = op('subtract', 3), fill = op('union', 1);
  expect(densityAt([0, 0, 0], { ...sphere, operations: [carve, fill] })).toBeLessThan(0);
  expect(densityAt([0, 0, 0], { ...sphere, operations: [fill, carve] })).toBeGreaterThan(0);
  expect(densityAt([0, 0, 0], { ...sphere, operations: [{ ...carve, enabled: false }] })).toBeLessThan(0);
});
test('partial chunks partition the volume exactly once', () => {
  const chunks = listChunks({ ...sphere, resolution: 18 });
  expect(chunks).toHaveLength(27);
  expect(chunks.reduce((n, c) => n + c.cells[0] * c.cells[1] * c.cells[2], 0)).toBe(18 ** 3);
});

function triangleSet(settings: VoxelSettings) {
  const triangles: string[] = [];
  for (const chunk of listChunks(settings)) {
    const mesh = meshChunk(chunk, settings);
    for (let i = 0; i < mesh.indices.length; i += 3) {
      triangles.push(Array.from(mesh.indices.slice(i, i + 3)).map(index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3)).map(n => n.toFixed(5)).join(',')).sort().join('|'));
    }
  }
  return triangles.sort();
}
test.each(['marching', 'blocks'] as const)('%s chunking preserves monolithic surface without extra border faces', mesher => {
  expect(triangleSet({ ...sphere, mesher })).toEqual(triangleSet({ ...sphere, mesher, chunkSize: 16 }));
});
test('marching cubes creates finite, indexed, outward-facing sphere triangles and normals', () => {
  const mesh = meshChunk(listChunks({ ...sphere, chunkSize: 16 })[0], sphere);
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(mesh.positions.length / 3).toBeLessThan(mesh.indices.length);
  expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = Array.from(mesh.indices.slice(i, i + 3)).map(index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3)));
    const u = b.map((v, j) => v - a[j]), v = c.map((value, j) => value - a[j]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    expect(cross.reduce((dot, n, j) => dot + n * a[j], 0)).toBeGreaterThan(0);
  }
  for (let i = 0; i < mesh.positions.length; i += 3) {
    expect(Math.hypot(...Array.from(mesh.normals.slice(i, i + 3)))).toBeCloseTo(1, 5);
    expect(mesh.positions[i] * mesh.normals[i] + mesh.positions[i + 1] * mesh.normals[i + 1] + mesh.positions[i + 2] * mesh.normals[i + 2]).toBeGreaterThan(0);
  }
});
test('shared chunk boundary vertices have identical normals', () => {
  const samples = new Map<string, number[]>(); let shared = 0;
  for (const chunk of listChunks(sphere)) {
    const mesh = meshChunk(chunk, sphere);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const key = Array.from(mesh.positions.slice(i, i + 3)).join(',');
      const normal = Array.from(mesh.normals.slice(i, i + 3));
      if (samples.has(key)) { expect(normal).toEqual(samples.get(key)); shared++; }
      else samples.set(key, normal);
    }
  }
  expect(shared).toBeGreaterThan(0);
});
test('local edits reuse distant chunks while intersection invalidates the world', () => {
  const settings = { ...sphere, resolution: 32, chunkSize: 8 };
  const chunks = listChunks(settings), operation = { ...op('union', 0.5), center: [-5, -5, -5] as [number, number, number] };
  const edited = { ...settings, operations: [operation] };
  let reused = 0, rebuilt = 0;
  for (const chunk of chunks) {
    if (chunkSignature(chunk, settings) === chunkSignature(chunk, edited)) {
      reused++;
      const before = meshChunk(chunk, settings), after = meshChunk(chunk, edited);
      expect(after.positions).toEqual(before.positions); expect(after.normals).toEqual(before.normals); expect(after.indices).toEqual(before.indices);
    } else rebuilt++;
    expect(chunkSignature(chunk, settings)).not.toBe(chunkSignature(chunk, { ...settings, operations: [{ ...operation, mode: 'intersect' }] }));
  }
  expect(reused).toBeGreaterThan(0); expect(rebuilt).toBeGreaterThan(0);
});
test('subtracting a larger sphere produces an empty mesh', () => {
  const settings = { ...sphere, operations: [op('subtract', 7)] };
  expect(listChunks(settings).every(chunk => meshChunk(chunk, settings).indices.length === 0)).toBe(true);
});
