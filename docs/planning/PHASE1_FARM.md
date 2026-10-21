# Phase 1: Weather → Soil → Crop → Harvest

Historical notes for the initial placeholder prototype. The current renderer and ecology are described in [ECOLOGICAL_VALLEY.md](ECOLOGICAL_VALLEY.md).

Implemented as **03 / Living Village**, the default workspace. Noise and voxel tabs remain available. The existing React toolchain is retained; no Vite migration is needed to try this prototype.

## Run an experiment

1. Run `npm start` from `Assignment1`, then open http://localhost:3000.
2. Choose **Advance 30 days** to generate the complete daily table instantly, or **Play 30 days** for 500 ms/day playback. Pause allows inspecting or managing crops. Starting playback again runs 30 additional days from the current state.
3. Choose any of nine plots using the selector or by clicking its soil/crop geometry. The daily table switches to that plot.
4. Inspect rainfall, temperature, soil moisture, crop health, growth, expected yield, and maturity for each day. Export CSV includes every plot, not just the selected one.
5. Harvest when Ready. Harvest removes that crop and increases the shared strawberry total. Plant again on empty beds. Dead crops must be cleared first. Harvest is never automatic.
6. Change parameters and choose **Apply parameters & reset** to create a fresh experiment. Reset simulation reuses the active parameters and seed. Restore defaults restores the original experiment.

Nine beds begin planted, with 55% soil moisture and full health. Soil drainage multipliers differ by column (0.7, 1.0, 1.3); otherwise plots begin identically. Watering adds up to 10 mm, capped at capacity. Water and planting are free in this prototype. There is no inventory, character, building, visitor, memory, or narrative system.

## Rules and customization

Edit `src/village/simulation.ts`:

- `defaultParameters`: seed, rain probability/intensity, baseline temperature, storage, evaporation, drainage, crop water uptake, growing duration, nominal yield, stress damage, health recovery, and fertility. All are also editable in the UI.
- `seasonRules`: four 28-day seasons, seasonal rain multipliers and temperature offsets. Days 1–28 are spring; days 29–56 are summer.
- `soilStep`: water budget in millimeters, including rainfall, overflow, evaporation, drainage, and uptake. Fertility is a fixed experiment parameter for Phase 1.
- `advanceDay`: weather generation, soil update, crop stress/growth, and immutable daily snapshots. Soil moisture of 35–80% is suitable; drought and saturation are stressful. Temperature suitability peaks at 19°C. Strawberries prefer spring.
- `expectedYield`: nominal yield × current health × average historical suitability × fertility, rounded down. This estimates mature yield under current conditions, not guaranteed eventual output. Only mature, living crops can be harvested; mature crops still experience stress while waiting.
- `actOnPlot`: validates water, plant, harvest, and clear actions. Actions do not advance time.

Same seed, parameters, and actions reproduce the same results. Camera movement and render frame rate do not affect the simulation. Daily observations are end-of-day snapshots; actions between days appear in the next snapshot. The current harvested total updates immediately in the sidebar.

## Rendering and limits

The farm deliberately uses a flat placeholder ground, nine soil boxes, and crop blocks. Darker soil means wetter; taller blocks mean more growth; red blocks are mature and brown blocks are dead. This phase does not connect plots to voxel density or live erosion. Topographic soil/drainage coupling can be added separately after validating this loop.

State and all daily records are kept in memory only. Refreshing or switching away from Living Village resets this prototype; export CSV before doing so if you want to retain observations. Expected yield is a simple educational model, not a scientifically calibrated crop forecast.

## Verification

`CI=true npm test -- --watchAll=false --runInBand` and `npm run build`.

Phase 1 tests cover deterministic 30-day runs, season rollover, bounded state, water conservation, drought and saturation stress, healthy maturation, conditional yield, invalid/duplicate harvests, immutable history, parameter validation, complete daily UI records, playback, pause, and reset. Existing noise and voxel tests remain in the suite.
