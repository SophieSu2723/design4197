# Assignment 1 — Noise Studio

An interactive React, TypeScript, and Three.js assignment exploring procedural noise and terrain.

## Run locally

```bash
cd "design folder/Assignment1"
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
- Orbit, zoom, pan, wireframe, and reset controls.

Enabled layers blend by relative weight. Shaping is applied after blending, then the result is multiplied by the height scale. An empty or zero-weight stack produces a flat surface. The top of the 2D map corresponds to negative Z in the 3D grid.

The grid contains `(resolution + 1)²` vertices and `2 × resolution²` triangles.

## Checks

Run these commands from the app directory:

```bash
npm run build
CI=true npm test -- --watchAll=false --runInBand
```

## Credits

Adapted from [Procedural World Building](https://github.com/jomasan/Procedural-World-Building). The noise utility is based on that project's value-noise implementation. This version contains only the Assignment 1 noise studio.
