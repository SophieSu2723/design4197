# Living Village — ecological valley

Phase 2 now adds Su, Mina, surplus-driven arrivals, invitation and bakery placement. See [PHASE2_POPULATION.md](PHASE2_POPULATION.md) for current population rules and tab-switch persistence. The ecology details below remain applicable.

Experiment 03 now uses the same `.noise-app` design tokens, sidebar, typography, controls, viewport, camera interaction, and floating diagnostics as experiments 01 and 02. The identical slider component has been extracted into `src/components/LabSlider.tsx`; their procedural algorithms remain unchanged.

## Try it

Run `npm start` from the repository root and open http://localhost:3000. Choose 03 / Living Village. Advance one day, play 30 days, or advance 30 days instantly. Open Daily records for the full observation table and CSV export. Click a farm bed or use the plot selector to water, harvest, clear, or replant. Parameter edits apply when selecting Apply parameters & reset.

WORLD STATE reports the current season/day, weather, temperature, rainfall, mean ecological soil moisture, channel depth, mean vegetation health, planted-crop health, and expected harvest. TODAY contains measured changes from that day's update, not generated story text. 00:00 marks the daily weather schedule; 06:00 is the first completed interval; 24:00 is the end of that day. Rainfall is distributed evenly across four six-hour intervals. Actions between days are recorded at the day boundary.

## Files and editable rules

- `src/experiments/03-living-village/landscape.ts`: fixed 40 m valley, shared value-noise utility, carved graded stream, farm terrace, farmhouse/path exclusion zones, 32×32 ecological cells, terrain slope/drainage/fertility, suitability-filtered seeded vegetation sites. The valley shape is fixed for this study; the experiment seed changes site variation and weather. No daily re-scattering occurs.
- `src/experiments/03-living-village/simulation.ts`: authoritative WorldState, seasonal weather, four six-hour water/plant updates per day, crop actions, runoff reservoir, and structured observations. Contains all editable defaults. Renderer imports no rule decisions.
- `src/experiments/03-living-village/rendering/FarmView.tsx`: terrain, channel water ribbon, procedural leaf canopies/branches, grass, flowers, shrubs, rocks, farmhouse, paths, and farm visuals. Updates material colors, instance transforms, water surface, and crop meshes from world state. Static scene geometry persists between daily updates.
- `src/experiments/03-living-village/VillageWorkspace.tsx`: original lab shell and controls grouped into Time & Climate, Ecology, Farm, and active Population controls for Su and Mina. Existing per-plot daily records and CSV are retained as an optional overlay.

## Explicit causal rules

Terrain slope controls drainage; slope, elevation, estimated initial moisture, water distance, fertility, and spacing/exclusion tests determine initial vegetation sites. Candidate randomness only varies suitable placements. Actual simulated moisture, temperature, and local fertility determine vegetation health; health changes biomass gradually. Daily weather does not regenerate site locations.

Each six-hour interval updates non-farm ecological cells and farm cells, then routes overflow/drainage into the stream. Farm plots and their ecological cells share the same resulting water values, including manual watering. Soil storage remains in mm. Runoff conversion is `mm × cell area / 1000` to m³. Stream storage follows `previous + runoff − discharge`. Discharge removes 2.5% of available storage per interval, plus overflow above 140 m³. Water depth is storage / 100 m², capped by downstream overflow at 1.4 m. This is a deliberately simplified reservoir/channel relationship, not a hydraulic fluid solver or exact mesh-volume calculation. River level is depth above the local graded bed, not one flat global elevation. Direct rainfall is included in the catchment soil water accounting rather than an additional duplicate rainfall input to the river.

Soil moisture darkens ground colors. Vegetation health affects leaf/grass color and biomass affects instance size. Water geometry uses the simulated level and clips its banks against terrain. Crop growth uses local fertility, soil moisture, temperature, health, and season. Expected yield remains an estimate from nominal yield, overall experiment fertility, health and stress history; it is not a guaranteed reward. Mature crops must be harvested manually.

No river-to-soil groundwater transfer, lateral soil flow, erosion under buildings, full flooding model, succession or tree relocation is implemented. The fixed farm terrace is authored into the terrain-generation function. Spatial simulation covers the whole valley, while the farm uses nine selected cells. Vegetation is visualized with instanced geometry, not individual agent entities.

## Scope and limitations

Su and Mina are present, with Mina arrival, invitation, placement, and a simple daily routine. There is no building management, relationship system, memory, dialogue, quests, LLM agent, or narrative generation. The TODAY log is numerical event output only. State is in memory: refreshing the page resets the village; switching experiments preserves it for the session; export CSV first to keep observations. Existing noise and voxel workspaces remain available.

## Verification

Run `CI=true npm test -- --watchAll=false --runInBand` and `npm run build`. Tests cover original experiments, 30-day reproduction, weather effects on soil/river/vegetation, river mass balance and overflow limits, bounded ecological state, suitable stable vegetation placement, plot/cell water consistency, crop stress and harvest, playback and daily records.
