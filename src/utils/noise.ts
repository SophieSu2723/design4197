import { NoiseType } from '../types/planet';

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

function hash3(ix: number, iy: number, iz: number): number {
  return hash(ix + iy * 57.0 + iz * 113.0);
}

// Returns [0, 1]
function valueNoise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fade(fx);
  const uy = fade(fy);
  const uz = fade(fz);

  const v000 = hash3(ix,     iy,     iz    );
  const v100 = hash3(ix + 1, iy,     iz    );
  const v010 = hash3(ix,     iy + 1, iz    );
  const v110 = hash3(ix + 1, iy + 1, iz    );
  const v001 = hash3(ix,     iy,     iz + 1);
  const v101 = hash3(ix + 1, iy,     iz + 1);
  const v011 = hash3(ix,     iy + 1, iz + 1);
  const v111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = lerp(v000, v100, ux);
  const x10 = lerp(v010, v110, ux);
  const x01 = lerp(v001, v101, ux);
  const x11 = lerp(v011, v111, ux);
  const y0  = lerp(x00,  x10,  uy);
  const y1  = lerp(x01,  x11,  uy);
  return lerp(y0, y1, uz);
}

function fbm(
  x: number, y: number, z: number,
  octaves: number, persistence: number, lacunarity: number
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 2 * valueNoise3D(x * frequency, y * frequency, z * frequency) - 1;
    value += amplitude * n;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / maxAmp; // [-1, 1]
}

function ridgedFbm(
  x: number, y: number, z: number,
  octaves: number, persistence: number, lacunarity: number
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 2 * valueNoise3D(x * frequency, y * frequency, z * frequency) - 1;
    value += amplitude * (1 - Math.abs(n));
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return 2 * (value / maxAmp) - 1; // [-1, 1], ridges are peaks
}

function warpedFbm(
  x: number, y: number, z: number,
  octaves: number, persistence: number, lacunarity: number
): number {
  const warp = 0.8;
  const wx = fbm(x + 1.7, y + 9.2, z + 3.4, octaves, persistence, lacunarity);
  const wy = fbm(x + 8.3, y + 2.8, z + 5.1, octaves, persistence, lacunarity);
  const wz = fbm(x + 4.5, y + 7.1, z + 1.9, octaves, persistence, lacunarity);
  return fbm(
    x + warp * wx,
    y + warp * wy,
    z + warp * wz,
    octaves, persistence, lacunarity
  );
}

// Returns [-1, 1]. Input coords should already be scaled by layer.scale.
export function sampleNoise(
  x: number, y: number, z: number,
  noiseType: NoiseType,
  octaves: number,
  persistence: number,
  lacunarity: number
): number {
  switch (noiseType) {
    case 'ridged': return ridgedFbm(x, y, z, octaves, persistence, lacunarity);
    case 'warp':   return warpedFbm(x, y, z, octaves, persistence, lacunarity);
    default:       return fbm(x, y, z, octaves, persistence, lacunarity);
  }
}
