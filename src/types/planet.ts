export type NoiseType = 'perlin' | 'ridged' | 'warp';
export type ShaderStyle = 'standard-lit' | 'unlit';
export type TerrainColorMode = 'solid' | 'gradient' | 'stepped';

/** One stop in an elevation color ramp. position is 0 (lowest) → 1 (highest). */
export interface ColorStop {
  color: string;
  position: number;
}

export interface NoiseLayer {
  noiseType: NoiseType;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
}

export interface ShapeSettings {
  radius: number;
  resolution: number;
  wireframe: boolean;   // overlay the triangle mesh on top of the shading
}

export type TerrainLayerType = 'noise' | 'map';   // future: 'paint' | 'image'

/** One additive layer in the terrain stack. Contributions simply sum. */
export interface TerrainLayer {
  id: number;              // stable React key
  name: string;
  type: TerrainLayerType;
  enabled: boolean;
  intensity: number;       // contribution multiplier for this layer
  noise?: NoiseLayer;      // type 'noise'
  map?: AppliedTopography; // type 'map' — e.g. the eroded 2D heightmap
}

export interface TerrainSettings {
  enabled: boolean;
  elevationScale: number;  // overall height of the accumulated stack
  layers: TerrainLayer[];
  soloLayerId: number | null;  // layer manager "solo": show only this layer's effect
}

export interface OceanSettings {
  enabled: boolean;
  seaLevel: number;
  resolution: number;
  // Animation
  rippleSpeed: number;
  rippleScale: number;
  rippleHeight: number;
  // Colors
  deepColor: string;
  shallowColor: string;
  foamColor: string;
  // Coastline foam
  foamEnabled: boolean;
  foamDepth: number;      // view-space depth threshold for coastline band
  foamSoftness: number;   // 0 = sharp edge, 1 = wide soft fade
  // Coastline ripples — animated contour lines parallel to the shore
  rippleEnabled: boolean;
  rippleWidth: number;    // spacing/thickness of each contour line
  rippleDistance: number; // how far from the shore the ripples reach
}

export interface ShaderSettings {
  style: ShaderStyle;
  terrainColor: string;          // used when colorMode === 'solid'
  colorMode: TerrainColorMode;
  ramp: ColorStop[];             // elevation ramp, max 5 stops (gradient/stepped)
  linkToSea: boolean;            // anchor ramp to sea level: stops <0.5 = underwater, >0.5 = land
  ao: boolean;                   // baked vertex ambient occlusion (lit and unlit)
  aoStrength: number;            // 0–1 how dark occluded crevices get
  aoRadius: number;              // neighbor distance in grid cells — size of occluded features
  aoContrast: number;            // gamma on the occlusion distribution: <1 spreads wide, >1 pools in deep crevices
}

/** Snapshot of the 2D map used as the 3D planet's elevation source. */
export interface AppliedTopography {
  map: Float32Array;   // normalized [0,1], equirectangular
  width: number;
  height: number;
  elevMin: number;     // raw (pre-elevationScale) range captured at load time,
  elevMax: number;     // used to denormalize back to planet elevations
}

/** Particle (droplet) hydraulic erosion run on the 2D equirectangular map. */
export interface ErosionSettings {
  droplets: number;      // droplets simulated per second while animating
  maxLifetime: number;   // steps before a droplet dies
  inertia: number;       // 0 = follow gradient exactly, 1 = never turn
  capacity: number;      // sediment capacity multiplier
  erosion: number;       // fraction of free capacity eroded per step
  deposition: number;    // fraction of excess sediment dropped per step
  evaporation: number;   // water lost per step
  gravity: number;       // downslope acceleration
  seed: number;          // PRNG seed for droplet spawns — same seed replays the same rain
  radius: number;        // erosion brush radius in map cells — bigger = broader, smoother carving
  mapRes: number;        // heightmap height in px (width is 2×) — the detail the sim registers
}

export interface AtmosphereSettings {
  enabled: boolean;
}

export interface BiomeSettings {
  enabled: boolean;
}

export interface PlanetSettings {
  shape: ShapeSettings;
  terrain: TerrainSettings;
  ocean: OceanSettings;
  shaders: ShaderSettings;
  erosion: ErosionSettings;
  atmosphere: AtmosphereSettings;
  biomes: BiomeSettings;
}

export const defaultPlanetSettings: PlanetSettings = {
  shape: {
    radius: 1,
    resolution: 64,
    wireframe: false,
  },
  terrain: {
    enabled: false,
    elevationScale: 0.25,
    layers: [
      {
        id: 1, name: 'Macro noise', type: 'noise', enabled: true, intensity: 1.0,
        noise: { noiseType: 'perlin', scale: 1.2, octaves: 4, persistence: 0.5, lacunarity: 2.0 },
      },
      {
        id: 2, name: 'Micro ridges', type: 'noise', enabled: true, intensity: 0.25,
        noise: { noiseType: 'ridged', scale: 5.0, octaves: 3, persistence: 0.45, lacunarity: 2.2 },
      },
    ],
    soloLayerId: null,
  },
  ocean: {
    enabled: false,
    seaLevel: 0.02,
    resolution: 64,
    rippleSpeed: 0.8,
    rippleScale: 1.0,
    rippleHeight: 0.003,
    deepColor: '#1a4a8c',
    shallowColor: '#3a9ad9',
    foamColor: '#cce8ff',
    foamEnabled: true,
    foamDepth: 0.15,
    foamSoftness: 0.5,
    rippleEnabled: true,
    rippleWidth: 0.05,
    rippleDistance: 0.12,
  },
  shaders: {
    style: 'standard-lit',
    terrainColor: '#2e6b3e',
    colorMode: 'gradient',
    ramp: [
      { color: '#1f4e2e', position: 0.0 },   // low ground — deep green
      { color: '#3e7d3e', position: 0.3 },   // plains
      { color: '#8a7a4a', position: 0.55 },  // foothills — earthy
      { color: '#7a6a5a', position: 0.75 },  // mountain rock
      { color: '#ffffff', position: 1.0 },   // snow caps
    ],
    linkToSea: false,
    ao: false,
    aoStrength: 0.7,
    aoRadius: 1,
    aoContrast: 1.0,
  },
  erosion: {
    droplets: 30000,
    maxLifetime: 30,
    inertia: 0.05,
    capacity: 4,
    erosion: 0.3,
    deposition: 0.3,
    evaporation: 0.02,
    gravity: 4,
    seed: 1337,
    radius: 2,
    mapRes: 256,
  },
  atmosphere: {
    enabled: false,
  },
  biomes: {
    enabled: false,
  },
};
