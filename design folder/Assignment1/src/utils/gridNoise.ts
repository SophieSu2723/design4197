import { sampleNoise } from './noise';

export type Equation = 'value' | 'ridged' | 'warp';
export type Shape = 'none' | 'power' | 'terrace' | 'island';
export interface NoiseLayer {
  id: number; enabled: boolean; equation: Equation; frequency: number;
  octaves: number; persistence: number; lacunarity: number; weight: number; seed: number;
}
export interface GridSettings {
  resolution: number; height: number; shape: Shape; strength: number; layers: NoiseLayer[];
}
export const initialGrid: GridSettings = {
  resolution: 80, height: 4, shape: 'none', strength: 0.5,
  layers: [{ id: 1, enabled: true, equation: 'value', frequency: 3, octaves: 4, persistence: 0.5, lacunarity: 2, weight: 1, seed: 12 }],
};
export function gridHeight(u: number, v: number, settings: GridSettings): number {
  let sum = 0, weights = 0;
  for (const layer of settings.layers) {
    if (!layer.enabled || layer.weight === 0) continue;
    const n = sampleNoise(u * layer.frequency + layer.seed * 1.73, v * layer.frequency + layer.seed * 0.91,
      layer.seed * 0.37, layer.equation,
      layer.octaves, layer.persistence, layer.lacunarity);
    sum += ((n + 1) / 2) * layer.weight;
    weights += layer.weight;
  }
  if (!weights) return 0;
  let h = Math.max(0, Math.min(1, sum / weights));
  const s = settings.strength;
  if (settings.shape === 'power') h = Math.pow(h, 1 + s * 5);
  if (settings.shape === 'terrace') {
    const steps = 6;
    h = h * (1 - s) + (Math.round(h * steps) / steps) * s;
  }
  if (settings.shape === 'island') {
    const distance = Math.min(1, Math.hypot(u * 2 - 1, v * 2 - 1));
    h *= 1 - s * distance * distance;
  }
  return h;
}
export function buildHeightField(settings: GridSettings): Float32Array {
  const side = settings.resolution + 1;
  const values = new Float32Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    values[y * side + x] = gridHeight(x / settings.resolution, y / settings.resolution, settings);
  }
  return values;
}
