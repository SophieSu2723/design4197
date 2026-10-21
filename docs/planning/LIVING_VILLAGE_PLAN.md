# Su’s Living Village — architecture and implementation plan

Status: proposal only. No village systems have been implemented by this document.

## Design boundary

A living village whose stories emerge from causal rules: Weather → Environment → Resources → Population → Behavior → Memory → Narrative → World Change. Player decisions intervene in that chain. No quests, combat, complex inventory, dialogue trees, crafting, or LLM agents in the initial work.

The first playable slice ends at Harvest. It contains no villagers, arrival logic, social memory, or narrative generation. A small daily observation log explains numerical changes; it is not the future narrative system.

Same terrain + different simulation seeds or player decisions can produce different histories. Same terrain, simulation seed, rules, and ordered actions must produce the same result. Reproducibility is essential for understanding and testing emergent behavior.

## Fit with the existing assignment

- Keep Noise field and Voxel terrain as working assignment workspaces. Add Living Village as a third workspace later.
- Reuse `utils/gridNoise.ts` and `utils/noise.ts` to generate the first farm landscape. Reuse Three.js orbit controls and the dark sidebar/full-height viewport layout.
- The existing `utils/simulation.ts` implements thermal erosion, not weather or farming. Treat it as a terrain preparation tool. Do not run erosion beneath occupied farm plots in this prototype.
- Freeze a terrain snapshot when a village is created. A changed terrain recipe requires an explicit new village/reset, avoiding silent relocation or loss of crops.
- Existing noise sampling depends on resolution through octave limits. Fix the sampling resolution in the terrain snapshot; changing display resolution must not regenerate simulation terrain.
- Voxel CSG, caves, and marching cubes remain available in the voxel assignment. Integrating crops with arbitrary overhangs needs a walkable-surface adapter and is deferred. Do not make soil a property of every voxel.
- The current app uses Create React App (`react-scripts`), not Vite. Migrate to Vite as a separately verified tooling phase before adding the village UI. Existing logic tests need an explicit test-runner decision; a Vite migration does not automatically migrate Jest. Avoid combining toolchain migration with simulation changes.

## Proposed architecture

Keep React and TypeScript. Systems are pure TypeScript and never import React, Three.js, DOM APIs, timers, or wall-clock time. A single reducer owns authoritative state. Renderers read state and maintain disposable visual objects outside it.

```text
src/
  village/
    simulation/
      WorldState.ts           # Serializable runtime state and action types
      rules.ts                # Versioned seasons, weather, soil, crop constants
      random.ts               # Explicit seeded random stream
      createWorld.ts          # Terrain snapshot and initial plots
      advanceDay.ts           # Ordered daily transition
      applyAction.ts          # Plant, water, harvest; validates before changing state
      WeatherSystem.ts
      EnvironmentSystem.ts
      FarmSystem.ts
      simulation.test.ts
    terrain/
      terrainAdapter.ts       # Noise snapshot -> elevations, slope, plot properties
    rendering/
      VillageView.tsx         # Three.js lifetime, camera, render loop
      TerrainRenderer.ts
      FarmRenderer.ts
    ui/
      VillageWorkspace.tsx    # State owner and command dispatch
      SimulationPanel.tsx
      PlotPanel.tsx
      DailyLog.tsx
```

Prefer plain data interfaces over entity classes initially. Crop definitions live in `rules.ts`; crop instances live in plots. Su is the player identity for this slice, without an avatar movement or pathfinding system. Add PopulationSystem, BehaviorSystem, MemorySystem, and NarrativeSystem only in their later phases.

## Minimum viable data model

Illustrative types, not implementation:

```ts
type Season = 'spring' | 'summer' | 'fall' | 'winter';
type WeatherKind = 'clear' | 'cloudy' | 'rain';
type CropId = 'strawberry';

interface CropState {
  type: CropId;
  plantedOnDay: number;
  growth: number;             // 0..1; mature at 1
  health: number;             // 0..1; dead at 0
  stressTotal: number;        // Sum of daily stress, for cumulative harvest quality
  daysGrown: number;
}

interface FarmPlot {
  id: string;
  x: number; z: number;       // Stable world coordinates
  elevation: number;
  slopeDegrees: number;
  drainage: number;           // 0..1, derived once from terrain and bounded rules
  capacityMm: number;         // Water storage capacity for the modeled soil layer
  waterMm: number;            // 0..capacityMm; UI moisture = waterMm / capacityMm
  fertility: number;          // 0..1
  crop: CropState | null;
}

interface WorldState {
  schemaVersion: 1;
  rulesVersion: string;
  id: string;
  terrain: {
    seed: number;
    recipe: GridSettings;     // Existing noise layer and shaping settings
    resolution: number;       // Fixed authoritative sampling resolution
    heights: number[];        // Frozen, row-major snapshot in world-height units
  };
  random: { seed: number; state: number };
  clock: { elapsedDays: number }; // 0 = start of spring, year 1
  weather: {
    day: number;              // Day this observation describes
    kind: WeatherKind;
    temperatureC: number;
    rainfallMm: number;
  } | null;                   // No weather before the first daily advance
  farm: { plots: FarmPlot[] };
  resources: { strawberries: number }; // One shared harvest counter, not an inventory UI
  observations: Array<{
    day: number;
    kind: 'weather' | 'soil' | 'crop' | 'harvest';
    plotId?: string;
    message: string;
    amount?: number;
  }>;
}
```

`GridSettings` is imported from the existing utility. Store snapshot arrays as ordinary numbers for straightforward JSON serialization at this scale; the renderer may construct typed arrays separately.

Derive season, day-of-season, and year from `elapsedDays` using 28-day seasons and 112-day years. Do not store independently mutable copies. Label the weather as belonging to its recorded day, rather than displaying yesterday’s weather as tomorrow’s forecast.

Running/paused, playback speed, selected plot, camera, and comparison overlays are UI state, not world state. Bound the observation log (for example, last 100 entries). Save/load is optional after the first slice; version fields prepare for it without implementing it now.

## Rules and ownership

| System | Reads | Writes | Key rule |
| --- | --- | --- | --- |
| Terrain adapter (creation only) | Frozen noise heights and coordinates | Plot elevation, slope, drainage, capacity, initial fertility | Choose a suitable contiguous farm patch; reject steep cells. Report when no patch fits instead of silently flattening terrain. |
| Weather | Calendar, previous weather, seasonal rules, RNG state | Weather, RNG state, weather observations | One seeded daily draw from season-weighted outcomes; temperature and rain have bounded seasonal ranges. |
| Environment | Today's rain/temperature, plot water/capacity/drainage, previous crop state | Plot water and fertility, soil observations | Rain adds water; evaporation, drainage, and plant uptake remove it. Account for overflow. |
| Farm | Updated soil, today's temperature, season, crop rules | Crop growth, health, cumulative stress, crop observations | Daily suitability controls growth and stress. Health and growth stay bounded. |
| Player action reducer | Requested plot, crop state, rule constraints | Planted crop, added water, harvest total, fertility cost, observations | Only valid actions mutate state. One harvest removes one mature crop, preventing duplicate harvest. |
| Daily coordinator | Current world and rules | A new world with elapsedDays + 1 | Runs each phase exactly once in a documented order. |
| Three.js / React | Resulting state | Visual objects and UI only | Never changes soil, growth, or resources during rendering. |

Fertility is a bounded simplified soil-quality parameter, not a claimed nutrient-conservation model. Use a small configurable harvest depletion initially; detailed soil chemistry is deferred.

### Water rule

Use millimeters consistently, rather than adding rainfall directly to a normalized moisture value:

1. `available = previousWater + rainfall` (watering actions have already modified previousWater).
2. Overflow is water above capacity; cap stored water.
3. Evaporation depends on temperature and weather, capped by remaining water.
4. Drainage removes a bounded fraction of water above a field-capacity threshold.
5. Crop uptake is capped by remaining water.
6. Clamp residual storage to `[0, capacityMm]`.

Test `previousWater + rainfall = nextWater + overflow + evaporation + drainage + uptake` within floating-point tolerance. Overflow exits this first model; it does not become a simulated river yet. Watering applies a fixed dose immediately, capped at capacity, and records actual added water.

### Growth and harvest rules

All numbers are editable starting assumptions, not agronomic claims. Begin with one spring crop: strawberries, roughly 8 ideal growing days, configurable moisture/temperature bands, and a nominal yield of 10 units per plot.

Define suitability factors in `[0,1]` for water (penalize drought AND saturation), temperature, season, and fertility. An out-of-season crop has a growth penalty and stress, not a scripted event.

`dailyGrowth = waterSuitability * temperatureSuitability * seasonSuitability * fertilitySuitability * health / idealGrowingDays`

Healthy conditions allow modest recovery; poor conditions accumulate stress and reduce health. Dead crops cannot grow or be harvested and can be cleared for replanting. Mature living crops remain subject to environmental stress until harvested.

At harvest, compute yield from nominal yield, current health, and average accumulated stress; round to a nonnegative integer. Weather influences yield through the crop’s actual history. Do not roll a fresh random harvest reward or preassign final yield at planting. Remove the crop after harvesting, even if its resulting yield is zero.

## Daily update contract

Use an explicit **Advance day** button initially. Optional run/pause calls the exact same reducer; rendering frame rate never sets simulation speed.

1. Player actions between daily ticks are validated and applied immediately in input order. Planting creates age-zero crops; watering changes soil; harvesting only accepts mature living crops.
2. On Advance day, take the current state and derive that day's calendar/season.
3. Generate and record weather for that day, consuming the explicit RNG stream.
4. Update plot water and soil state using that weather.
5. Update crops using the resulting soil and weather; record growth, stress, maturity, or death transitions.
6. Append meaningful daily observations once; do not emit a narrative or NPC memory.
7. Increment elapsedDays, publish the next state atomically, and render it.

Do not auto-harvest on maturity: harvest remains a player decision. Prevent overlapping automatic ticks. Identical seeds and action sequences must replay identically at every playback speed. Pause freezes daily transitions, not orbit controls. Pure reducer updates avoid duplicate effects under React development Strict Mode.

## Smallest playable prototype

One small frozen noise terrain, a 3 × 3 farm patch, strawberries, and the four-season calendar. The first useful demo is a single spring crop cycle.

Player can select a plot, plant, water, clear a dead crop, harvest a mature crop, and advance a day. No seed purchasing or consumable watering inventory yet. Label these as prototype simplifications.

Display current calendar, last simulated weather, soil moisture/fertility, crop growth/health, harvest count, and a compact daily explanation. Render a few growth stages and soil darkening; rain particles, avatars, buildings, rivers, and visitors are unnecessary to prove the loop.

Demonstration: plant two plots on the same day, water one during dry weather, and leave the other alone. Their moisture, growth/health history, and harvest outcomes diverge. A separate rainy scenario should demonstrate both beneficial moisture and damage from persistent saturation. Use controlled weather fixtures in tests; ordinary play remains seeded seasonal weather.

## Phased implementation plan

| Phase | State and rules | Logic and tests before visuals | Completion criterion |
| --- | --- | --- | --- |
| 0. Preserve baseline and prepare tooling | Keep both assignment workspaces; decide Vite/test migration boundaries | Record existing build/tests, migrate tooling separately, rerun checks | Noise and voxel workspaces still work; dev/build/test commands documented |
| 1. Headless world | Types, versioned rules, seeded RNG, terrain snapshot, calendar | Reproducibility, season/year rollover, fixed terrain sampling, valid/invalid patch selection | Create and advance deterministic world state without Three.js |
| 2. Weather and soil | Seasonal weather, mm water budget, drainage and fertility bounds | Rain raises storage when capacity permits, drought dries soil, drainage differs by terrain, conservation checks | Weather produces explainable daily soil changes |
| 3. Crops and actions | One crop, growth/health/stress, plant/water/clear/harvest commands | Ideal maturity, drought/saturation damage, dead-crop behavior, environment-dependent yield, repeated harvest rejection | Weather → Soil → Crop Growth → Harvest works entirely in logic tests |
| 4. Playable village tab | Bind selection and controls to validated actions | UI action tests, one day per click, paused/automatic stepping equivalence if playback is added | 3D farm and daily inspector let a player complete and compare harvests |
| 5. Persistence and broader ecology (later) | Versioned saves, additional crops, river/resource/biodiversity state | Save/replay round trip and causal resource tests | Longer-lived reproducible ecological scenarios |
| 6. Population and placement (later) | Temporary visitors, explicit invitations, buildings, traversable routes | Resource thresholds influence arrivals; placement affects travel cost and access | One invited profession has a measurable location-dependent contribution |
| 7. Behavior and memory (later) | Needs, energy, goals, relationships, bounded memories | Weighted utility rules; meaningful memories change decisions; deterministic tie-breaking | A resident’s prior experience can influence a later help decision |
| 8. Emergent village history (later) | Structured events with actor/target/cause links | Summaries reference actual events; no invented harvests, arrivals, or causes | Named seasons and village stories emerge from recorded interactions |

Later systems extend the daily coordinator after Farm: resource accounting → arrivals → behavior → memory → history. Use previous-day social state where needed to prevent order-dependent feedback loops. Render narrative from actual structured events with simple templates before considering any language model.

## Acceptance checks for the first slice

- Same seed, rules, frozen terrain, and actions reproduce the same world.
- Different simulation seeds change weather while leaving terrain unchanged.
- Soil storage, fertility, growth, and health never leave their declared ranges.
- Wet, dry, and waterlogged fixtures produce meaningfully different growth/harvest outcomes.
- Invalid or repeated actions do not grant resources or silently advance time.
- Pausing or changing camera/render quality does not change simulation outcomes.
- Both original assignment tabs remain functional.
- No NPC, memory, narrative, quest, or full inventory implementation is required for this milestone.
