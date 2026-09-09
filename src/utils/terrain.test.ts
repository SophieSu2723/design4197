import { stackElevation, effectiveLayers } from './terrain';
import { TerrainLayer, TerrainSettings } from '../types/planet';

const noiseLayer = (intensity: number, enabled = true): TerrainLayer => ({
  id: 1, name: 'n', type: 'noise', enabled, intensity,
  noise: { noiseType: 'perlin', scale: 1.5, octaves: 3, persistence: 0.5, lacunarity: 2 },
});

test('stack sums layers scaled by intensity; disabled layers contribute nothing', () => {
  const base = stackElevation([noiseLayer(1)], 0.3, 0.6, 0.74);
  expect(base).not.toBe(0);
  // Same layer twice at half intensity ≡ 1.5× the single layer
  expect(stackElevation([noiseLayer(1), noiseLayer(0.5)], 0.3, 0.6, 0.74)).toBeCloseTo(base * 1.5, 6);
  expect(stackElevation([noiseLayer(1), noiseLayer(0.5, false)], 0.3, 0.6, 0.74)).toBeCloseTo(base, 6);
});

test('solo isolates one layer and un-mutes it', () => {
  const a = { ...noiseLayer(1), id: 1 };
  const b = { ...noiseLayer(1, false), id: 2 };   // muted
  const t: TerrainSettings = { enabled: true, elevationScale: 1, layers: [a, b], soloLayerId: 2 };
  const solo = effectiveLayers(t);
  expect(solo).toHaveLength(1);
  expect(solo[0].id).toBe(2);
  expect(solo[0].enabled).toBe(true);             // solo overrides mute
  expect(effectiveLayers({ ...t, soloLayerId: null })).toHaveLength(2);
});

test('map layers denormalize to their raw elevation range', () => {
  const w = 8, h = 4;
  const mapLayer: TerrainLayer = {
    id: 2, name: 'm', type: 'map', enabled: true, intensity: 2,
    map: { map: new Float32Array(w * h).fill(0.5), width: w, height: h, elevMin: -0.2, elevMax: 0.6 },
  };
  // normalized 0.5 → -0.2 + 0.5×0.8 = 0.2, times intensity 2
  expect(stackElevation([mapLayer], 1, 0, 0)).toBeCloseTo(0.4, 6);
});
