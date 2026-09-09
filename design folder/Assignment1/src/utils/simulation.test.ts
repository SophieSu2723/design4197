import { erodeStep, terrainColor } from './simulation';
import { buildHeightField, gridHeight, initialGrid, sampledOctaves } from './gridNoise';

test('erosion lowers a peak, conserves material, and does not mutate the source', () => {
  const field = new Float32Array(25); field[12] = 1;
  const result = erodeStep(field, 4, 0.1, 4, 20, 1);
  expect(result[12]).toBeLessThan(1);
  expect(result[11]).toBeGreaterThan(0);
  expect(result.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  expect(field[12]).toBe(1);
});
test('flat terrain and slopes below the stable angle remain unchanged', () => {
  const flat = new Float32Array(25).fill(0.5);
  expect(erodeStep(flat, 4, 1, 4, 30, 1)).toEqual(flat);
  const gentle = Float32Array.from({ length: 25 }, (_, i) => (i % 5) * 0.01);
  expect(erodeStep(gentle, 4, 1, 1, 30, 1)).toEqual(gentle);
  expect(erodeStep(gentle, 4, 1, 0, 0, 1)).toEqual(gentle);
  expect(erodeStep(gentle, 4, 1, 1, 0, 0)).toEqual(gentle);
});
test('repeated erosion remains bounded and conserves mass at closed edges', () => {
  let field = buildHeightField({ ...initialGrid, resolution: 16 });
  const sum = field.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 200; i++) field = erodeStep(field, 16, 0.1, 4, 0, 1);
  expect(Array.from(field).every(h => Number.isFinite(h) && h >= 0 && h <= 1)).toBe(true);
  expect(field.reduce((a, b) => a + b, 0)).toBeCloseTo(sum, 3);
});
test('world navigation preserves overlapping samples and returns exactly to the origin', () => {
  for (const equation of ['value', 'ridged', 'warp'] as const) {
    const settings = { ...initialGrid, layers: [{ ...initialGrid.layers[0], equation }] };
    const east = { ...settings, offsetX: settings.worldSize / 8 };
    expect(gridHeight(0.5, 0.3, east)).toBeCloseTo(gridHeight(0.625, 0.3, settings), 12);
    const south = { ...settings, offsetZ: settings.worldSize / 8 };
    expect(gridHeight(0.3, 0.5, south)).toBeCloseTo(gridHeight(0.3, 0.625, settings), 12);
    expect(buildHeightField({ ...east, offsetX: 0 })).toEqual(buildHeightField(settings));
  }
});
test('calibration limits unresolved octaves and island shaping remains world anchored', () => {
  const layer = { ...initialGrid.layers[0], frequency: 3, octaves: 8, lacunarity: 2 };
  expect(sampledOctaves(layer, { ...initialGrid, resolution: 16 })).toBe(1);
  expect(sampledOctaves(layer, { ...initialGrid, resolution: 128 })).toBe(4);
  const settings = { ...initialGrid, shape: 'island' as const };
  expect(gridHeight(0.25, 0.5, { ...settings, offsetX: 3 })).toBe(gridHeight(0.5, 0.5, settings));
});
test('elevation palette is bounded and distinguishes lowlands from peaks', () => {
  expect(terrainColor(-1)).toEqual(terrainColor(0));
  expect(terrainColor(2)).toEqual(terrainColor(1));
  expect(terrainColor(0.4)).not.toEqual(terrainColor(0.8));
});
