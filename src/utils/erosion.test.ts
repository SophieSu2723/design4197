import { erodeHeightmap, sampleEquirect, mulberry32 } from './erosion';
import { defaultPlanetSettings } from '../types/planet';

test('droplet erosion carves the map without exploding', () => {
  const w = 64, h = 32;
  const map = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      map[y * w + x] = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2) * Math.sin((y / h) * Math.PI);
  const before = Float32Array.from(map);
  const meanBefore = map.reduce((a, b) => a + b, 0) / map.length;

  erodeHeightmap(map, w, h, { ...defaultPlanetSettings.erosion, droplets: 2000 });

  const meanAfter = map.reduce((a, b) => a + b, 0) / map.length;
  expect(map.every((v) => Number.isFinite(v))).toBe(true);
  expect(map.some((v, i) => v !== before[i])).toBe(true);
  // Sediment only ever leaves (dead droplets carry it off) — never appears
  expect(meanAfter).toBeLessThanOrEqual(meanBefore + 1e-4);
});

test('same seed replays the same erosion, different seed diverges', () => {
  const w = 64, h = 32;
  const mk = () => {
    const m = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        m[y * w + x] = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2) * Math.sin((y / h) * Math.PI);
    return m;
  };
  const e = { ...defaultPlanetSettings.erosion, droplets: 500 };
  const a = mk(), b = mk(), c = mk();
  erodeHeightmap(a, w, h, e, mulberry32(42));
  erodeHeightmap(b, w, h, e, mulberry32(42));
  erodeHeightmap(c, w, h, e, mulberry32(43));
  expect(a).toEqual(b);
  expect(c).not.toEqual(a);
});

test('equirect sampling maps sphere directions back onto the map', () => {
  const w = 64, h = 32;
  const flat = new Float32Array(w * h).fill(0.7);
  // Constant map reads the same constant from any direction (incl. poles/seam)
  for (const [nx, ny, nz] of [[1, 0, 0], [0, 1, 0], [0, -1, 0], [-1, 0, 0], [0.001, 0, -1]]) {
    expect(sampleEquirect(flat, w, h, nx, ny, nz)).toBeCloseTo(0.7, 5);
  }
  // Latitude ramp: north pole ≈ 0, equator ≈ 0.5, south pole ≈ 1
  const ramp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp[y * w + x] = y / (h - 1);
  expect(sampleEquirect(ramp, w, h, 0, 1, 0)).toBeLessThan(0.05);
  expect(sampleEquirect(ramp, w, h, 1, 0, 0)).toBeCloseTo(0.5, 1);
  expect(sampleEquirect(ramp, w, h, 0, -1, 0)).toBeGreaterThan(0.95);
});
