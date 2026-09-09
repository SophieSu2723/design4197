import { buildHeightField, gridHeight, initialGrid } from './gridNoise';

test('field samples match the equation at grid vertices', () => {
  const settings = { ...initialGrid, resolution: 16 };
  const field = buildHeightField(settings);
  expect(field).toHaveLength(17 * 17);
  expect(field[5 * 17 + 3]).toBeCloseTo(gridHeight(3 / 16, 5 / 16, settings));
  expect(Array.from(field).every(h => h >= 0 && h <= 1)).toBe(true);
});
test('relative weights blend layers and disabled layers do not contribute', () => {
  const a = initialGrid.layers[0], b = { ...a, id: 2, seed: 45, weight: 0.5 };
  const first = gridHeight(0.2, 0.7, initialGrid);
  const second = gridHeight(0.2, 0.7, { ...initialGrid, layers: [b] });
  expect(gridHeight(0.2, 0.7, { ...initialGrid, layers: [a, b] })).toBeCloseTo((first + second * 0.5) / 1.5);
  expect(gridHeight(0.2, 0.7, { ...initialGrid, layers: [a, { ...b, enabled: false }] })).toBe(first);
  expect(gridHeight(0.2, 0.7, { ...initialGrid, layers: [] })).toBe(0);
  expect(gridHeight(0.2, 0.7, { ...initialGrid, layers: [{ ...a, weight: 0 }] })).toBe(0);
});
test('shaping strength zero preserves the field and island shaping lowers edges', () => {
  for (const shape of ['power', 'terrace', 'island'] as const) {
    expect(gridHeight(0.2, 0.7, { ...initialGrid, shape, strength: 0 })).toBe(gridHeight(0.2, 0.7, initialGrid));
  }
  expect(gridHeight(0, 0, { ...initialGrid, shape: 'island', strength: 1 })).toBe(0);
  const h = gridHeight(0.2, 0.7, { ...initialGrid, shape: 'terrace', strength: 1 });
  expect(h * 6).toBeCloseTo(Math.round(h * 6));
});
test('noise variants are deterministic, distinct, and bounded', () => {
  const fields = (['value', 'ridged', 'warp'] as const).map(equation => {
    const settings = { ...initialGrid, resolution: 16, layers: [{ ...initialGrid.layers[0], equation }] };
    const field = buildHeightField(settings);
    expect(field).toEqual(buildHeightField(settings));
    expect(Array.from(field).every(h => Number.isFinite(h) && h >= 0 && h <= 1)).toBe(true);
    return field;
  });
  expect(fields[0]).not.toEqual(fields[1]);
  expect(fields[0]).not.toEqual(fields[2]);
});
