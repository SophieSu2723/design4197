/** Conservative thermal relaxation: steep slopes shed material into lower neighbours. */
export function erodeStep(field: Float32Array, resolution: number, cellSize: number, heightScale: number, talusDegrees: number, rate: number): Float32Array {
  const result = new Float32Array(field);
  if (heightScale <= 0 || rate <= 0) return result;
  const side = resolution + 1;
  const threshold = Math.tan(talusDegrees * Math.PI / 180) * cellSize / heightScale;
  const delta = new Float64Array(field.length);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const i = y * side + x;
    const neighbours = [x > 0 ? i - 1 : -1, x < resolution ? i + 1 : -1, y > 0 ? i - side : -1, y < resolution ? i + side : -1];
    const excess = neighbours.map(j => j < 0 ? 0 : Math.max(0, field[i] - field[j] - threshold));
    const total = excess.reduce((a, b) => a + b, 0);
    if (!total) continue;
    // Limit movement to a quarter of the largest excess to avoid overshooting.
    const amount = Math.max(...excess) * Math.min(1, rate) * 0.25;
    delta[i] -= amount;
    neighbours.forEach((j, k) => { if (j >= 0) delta[j] += amount * excess[k] / total; });
  }
  for (let i = 0; i < field.length; i++) result[i] += delta[i];
  return result;
}

/** Shared elevation palette for the simulation map and 3D vertex material. */
export function terrainColor(h: number): [number, number, number] {
  const stops = [
    { h: 0, c: [29, 64, 80] }, { h: 0.28, c: [58, 105, 116] },
    { h: 0.34, c: [191, 177, 126] }, { h: 0.43, c: [92, 130, 77] },
    { h: 0.60, c: [72, 101, 69] }, { h: 0.74, c: [139, 133, 117] },
    { h: 0.9, c: [221, 224, 212] }, { h: 1, c: [248, 250, 246] },
  ];
  const value = Math.max(0, Math.min(1, h));
  const upper = stops.findIndex(s => s.h >= value);
  if (upper <= 0) return stops[0].c as [number, number, number];
  const a = stops[upper - 1], b = stops[upper], t = (value - a.h) / (b.h - a.h);
  return a.c.map((c, i) => Math.round(c + (b.c[i] - c) * t)) as [number, number, number];
}
