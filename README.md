# FIELD / LAB

FIELD / LAB is a procedural world-building project made with React, TypeScript, and Three.js. Its experiments explore how terrain and a small living environment can emerge from rules.

## Experiments

### 01 / Noise Field — A world from noise

Builds a height field from layered value, ridged, or domain-warped noise. Adjust layer parameters and shaping, compare the 3D terrain with its 2D map, and run a thermal erosion simulation. The map and terrain share the evolving samples. The sampler limits frequency and octave detail relative to grid resolution; the 3D view keeps horizontal and vertical scale consistent.

### 02 / Voxel Terrain — A surface from a solid

Explores 3D density fields using procedural terrain and cave fields, sphere, box, torus, and capsule shapes. An ordered CSG stack supports union, subtraction, and intersection. Compare marching-cubes surfaces with exposed-face block meshing, inspect chunks and wireframes, and read build statistics. See [Voxel Terrain notes](docs/VOXEL_NOTES.md) for equations, tradeoffs, measurements, and limitations.

### 03 / Living Village — A world that grows and remembers

The current prototype connects seeded weather, soil moisture, river level, vegetation health, crops, harvest, and food reserves. Advance one day at a time or run a 30-day simulation, tend Su’s farm, and export daily plot observations as CSV.

Mina’s arrival is driven by resource conditions and a seeded daily probability, rather than a fixed arrival day. The player can invite her to stay and choose a suitable home and bakery location; the placement records its environmental and spatial context. Su and Mina have simple movement and daily routines. Richer behavior, relationships, memory, and narrative generation are future work.

The simulation rules and world state live separately from the Three.js renderer. World state is held in memory: switching experiments preserves the village during the session, while refreshing the page starts a new world. For the current system design and phase notes, see [Living Village planning](docs/planning/LIVING_VILLAGE_PLAN.md), [Phase 1](docs/planning/PHASE1_FARM.md), [ecological valley](docs/planning/ECOLOGICAL_VALLEY.md), and [Phase 2](docs/planning/PHASE2_POPULATION.md).

## Run locally

From the repository root:

```bash
npm install
npm start
```

Open http://localhost:3000 and use the top navigation to switch experiments. Keep the terminal running while using the app. No account or environment variables are required.

## Checks

```bash
npm run build
CI=true npm test -- --watchAll=false --runInBand
```

The tests cover noise sampling and erosion, voxel density and meshing, and Living Village simulation, population, and workspace interactions.
