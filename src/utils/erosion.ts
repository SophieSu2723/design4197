import { ErosionSettings } from '../types/planet';

// Particle-based hydraulic erosion (Beyer-style droplets) on an
// equirectangular heightmap with values in ~[0,1]. Each droplet rolls
// downhill, picks up sediment while accelerating and deposits it as it
// slows, carving basins and drainage channels. x wraps (longitude);
// droplets die when they cross the top/bottom rows (poles).

const MIN_SLOPE = 0.01; // capacity floor so droplets keep carving on near-flats

// Tiny seeded PRNG — deterministic droplet spawns for a given seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Inverse of the map's pixel→sphere projection: a unit-sphere direction is
// converted to lat/lon and the equirectangular map is sampled bilinearly.
// x wraps (longitude); y clamps at the pole rows. Pole vertices at different
// longitudes read slightly different row-0 texels — negligible, since those
// texels come from nearly the same sphere point and droplets die at poles.
export function sampleEquirect(
  map: Float32Array, w: number, h: number,
  nx: number, ny: number, nz: number
): number {
  const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
  const lon = Math.atan2(nz, nx);                 // [-π, π]
  let x = (lon / (2 * Math.PI)) * w - 0.5;        // inverse of (px + 0.5) / w
  let y = (0.5 - lat / Math.PI) * h - 0.5;
  x = ((x % w) + w) % w;
  y = Math.max(0, Math.min(h - 1.001, y));
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = x - xi, v = y - yi;
  const x1 = (xi + 1) % w;
  const i00 = yi * w + xi, i10 = yi * w + x1;
  return map[i00] * (1 - u) * (1 - v) + map[i10] * u * (1 - v) +
         map[i00 + w] * (1 - u) * v + map[i10 + w] * u * v;
}

export function erodeHeightmap(
  map: Float32Array, w: number, h: number, e: ErosionSettings,
  rand: () => number = Math.random
): void {
  const idx = (xi: number, yi: number) => yi * w + (((xi % w) + w) % w);
  const brushR = Math.max(1, Math.round(e.radius));

  for (let d = 0; d < e.droplets; d++) {
    let x = rand() * w;
    let y = rand() * (h - 1);
    let dirX = 0, dirY = 0, speed = 1, water = 1, sediment = 0;

    for (let step = 0; step < e.maxLifetime; step++) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const u = x - xi, v = y - yi;
      const i00 = idx(xi, yi),     i10 = idx(xi + 1, yi);
      const i01 = idx(xi, yi + 1), i11 = idx(xi + 1, yi + 1);
      const h00 = map[i00], h10 = map[i10], h01 = map[i01], h11 = map[i11];

      // Bilinear height + gradient at the droplet position
      const gradX = (h10 - h00) * (1 - v) + (h11 - h01) * v;
      const gradY = (h01 - h00) * (1 - u) + (h11 - h10) * u;
      const height =
        h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) +
        h01 * (1 - u) * v + h11 * u * v;

      dirX = dirX * e.inertia - gradX * (1 - e.inertia);
      dirY = dirY * e.inertia - gradY * (1 - e.inertia);
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len < 1e-10) break;              // flat ground — droplet stalls
      dirX /= len; dirY /= len;

      x += dirX; y += dirY;
      x = ((x % w) + w) % w;               // longitude wraps
      if (y < 0 || y >= h - 1) break;      // fell off a pole

      const nxi = Math.floor(x), nyi = Math.floor(y);
      const nu = x - nxi, nv = y - nyi;
      const newHeight =
        map[idx(nxi, nyi)]     * (1 - nu) * (1 - nv) +
        map[idx(nxi + 1, nyi)] * nu * (1 - nv) +
        map[idx(nxi, nyi + 1)] * (1 - nu) * nv +
        map[idx(nxi + 1, nyi + 1)] * nu * nv;
      const dh = newHeight - height;

      const cap = Math.max(-dh, MIN_SLOPE) * speed * water * e.capacity;

      if (sediment > cap || dh > 0) {
        // Over capacity or moving uphill: drop sediment at the old cell
        const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * e.deposition;
        sediment -= amount;
        map[i00] += amount * (1 - u) * (1 - v);
        map[i10] += amount * u * (1 - v);
        map[i01] += amount * (1 - u) * v;
        map[i11] += amount * u * v;
      } else {
        // Carve, never deeper than the actual drop (avoids spike artifacts)
        const amount = Math.min((cap - sediment) * e.erosion, -dh);
        sediment += amount;
        if (brushR <= 1) {
          map[i00] -= amount * (1 - u) * (1 - v);
          map[i10] -= amount * u * (1 - v);
          map[i01] -= amount * (1 - u) * v;
          map[i11] -= amount * u * v;
        } else {
          // Spread the carve over a weighted brush window — bigger radius
          // erodes broader, smoother features (less fine detail registered).
          // ponytail: two passes over the window per step; fine at radius ≤ 8
          let wSum = 0;
          for (let by = -brushR; by <= brushR; by++) {
            if (yi + by < 0 || yi + by >= h) continue;
            for (let bx = -brushR; bx <= brushR; bx++) {
              const dist = Math.sqrt(bx * bx + by * by);
              if (dist <= brushR) wSum += brushR - dist;
            }
          }
          for (let by = -brushR; by <= brushR; by++) {
            const cy = yi + by;
            if (cy < 0 || cy >= h) continue;
            for (let bx = -brushR; bx <= brushR; bx++) {
              const dist = Math.sqrt(bx * bx + by * by);
              if (dist <= brushR) map[idx(xi + bx, cy)] -= amount * (brushR - dist) / wSum;
            }
          }
        }
      }

      speed = Math.sqrt(Math.max(0, speed * speed + dh * e.gravity));
      water *= 1 - e.evaporation;
    }
  }
}
