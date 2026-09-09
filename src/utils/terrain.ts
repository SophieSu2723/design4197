import { TerrainLayer, TerrainSettings } from '../types/planet';
import { sampleNoise } from './noise';
import { sampleEquirect } from './erosion';

// Layers the stack should actually render: all of them, or — when the layer
// manager solos one — just that layer, un-muted so solo always shows something.
export function effectiveLayers(t: TerrainSettings): TerrainLayer[] {
  if (t.soloLayerId == null) return t.layers;
  return t.layers.filter((l) => l.id === t.soloLayerId).map((l) => ({ ...l, enabled: true }));
}

// Sum of all enabled terrain layers at a unit-sphere direction, before the
// global elevation (height) scale is applied. Layers are purely additive, so
// order never matters. Used by both the 3D sphere and the 2D map so the two
// views always agree.
export function stackElevation(
  layers: TerrainLayer[], nx: number, ny: number, nz: number
): number {
  let e = 0;
  for (const l of layers) {
    if (!l.enabled || l.intensity === 0) continue;
    if (l.type === 'noise' && l.noise) {
      const n = l.noise;
      e += l.intensity * sampleNoise(
        nx * n.scale, ny * n.scale, nz * n.scale,
        n.noiseType, n.octaves, n.persistence, n.lacunarity
      );
    } else if (l.type === 'map' && l.map) {
      const m = l.map;
      e += l.intensity *
        (m.elevMin + sampleEquirect(m.map, m.width, m.height, nx, ny, nz) * (m.elevMax - m.elevMin));
    }
  }
  return e;
}
