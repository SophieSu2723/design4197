# Assignment 1 — Noise & Voxel Studio

An interactive React, TypeScript, and Three.js assignment exploring procedural noise and terrain.

Use the top navigation to switch between **Noise field** and **Voxel terrain**. Each workspace starts fresh when opened; switching tabs releases its renderer and working data.

## Voxel terrain assignment

The separate Voxel terrain workspace implements a true 3D density field, six base fields (noise terrain, noise caves, sphere, box, torus, capsule), an ordered stack of up to eight CSG operations, marching cubes, and an exposed-face block mesher. You can enable, remove, move, resize and reorder operations, compare resolutions and chunk sizes, inspect wireframes and chunk bounds, and read measured build statistics.

Start with **Carved terrain**, add a union sphere, and move it into the carved area. Move the union above the subtraction to see the carving remove it. Try **Cave network** to explore multiple surfaces at the same X/Z coordinate. **Torus study** demonstrates a density shape with a hole.

The controls include field notes covering each assignment requirement. See [VOXEL_NOTES.md](VOXEL_NOTES.md) for equations, chunking tradeoffs, a measured experiment, meshing alternatives, implementation details and limitations.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000. Keep the terminal running. No Firebase account or environment variables are required.

## Features

- A 3D grid with adjustable resolution and height.
- A synchronized 2D grayscale noise map using the same samples as the grid.
- Value fBm, ridged, and domain-warped noise equations.
- Up to four layers with frequency, octaves, persistence, lacunarity, seed, and blend weight controls.
- Power, terrace, and island shaping with adjustable strength.
- A thermal erosion simulation map with start, stop/resume, reset, rate, and stable-slope controls.
- Shared elevation colors for the simulation map and 3D material.
- Continuous world navigation with WASD, arrow keys, and on-screen controls.
- World span, cell spacing, automatic noise-detail limits, and a rolling-hills calibration preset.
- Orbit, zoom, pan, wireframe, and reset controls.

Enabled layers blend by relative weight. Shaping is applied after blending, then the result is multiplied by the height scale. An empty or zero-weight stack produces a flat surface. The top of the 2D map corresponds to negative Z in the 3D grid.

The grid contains `(resolution + 1)²` vertices and `2 × resolution²` triangles.

## Simulation and navigation

Click **Start simulation** to evolve the noise-driven height field. Thermal erosion moves material from slopes above the chosen stable angle into lower neighbors. **Stop simulation** freezes the result; starting again resumes it. **Reset terrain** restores the original noise field. This is a simplified thermal relaxation model, not a hydraulic water simulation. Material stays inside the map boundaries.

Both 2D maps and the 3D grid share the same evolving samples. The colored map and material use a fixed elevation palette; colors suggest lowlands, vegetation, rock, and snow rather than simulating those ecosystems.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move across the continuous noise field |
| F | Toggle wireframe |
| Space | Start or stop erosion |
| Home button | Return to world origin |
| Mouse drag / scroll / right-drag | Orbit / zoom / pan |

Shortcuts do not intercept input while a form control or button has focus. On-screen buttons support touch navigation. Moving the map or editing terrain settings stops and resets erosion; returning to a location regenerates its original terrain. Simulated changes are not stored across locations. Island shaping is anchored at world coordinates (6, 6).

**Calibration:** world span determines the sampled area, and cell width is `world span / resolution`. The 3D viewport scales horizontal extent and elevation together, preserving the world slope. The noise sampler limits frequency and octaves to maintain at least four cells per nominal noise feature; nonlinear ridge/warp/shaping operations can still introduce finer detail. Increase resolution to retain more detail. The **Calibrate rolling hills** preset provides a moderate relief and detail starting point.

## Checks

Run these commands from the app directory:

```bash
npm run build
CI=true npm test -- --watchAll=false --runInBand
```

## Credits

Adapted from [Procedural World Building](https://github.com/jomasan/Procedural-World-Building). The noise utility is based on that project's value-noise implementation. The marching-cubes triangle lookup table comes from the installed Three.js distribution; its MIT notice is retained in `src/utils/marchingTables.ts`.
