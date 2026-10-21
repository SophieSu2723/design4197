# Phase 2 — population emergence

The FIELD / LAB interface and existing environmental simulation are retained. Su is the persistent farm owner and initial resident; Mina is the only possible visitor. There are no dialogue, relationship, memory, quest, LLM, or narrative-generation systems.

## Try the chain

1. Open **03 / Living Village** with default parameters and advance 20–30 days.
2. In FARM, click **Harvest ripe plots**, or harvest individual Ready plots. Growing crops and expected yield do not count as food reserves.
3. Advance days. When reserve > 20, harvested food in the last seven days > 12, and resident count < 2, an arrival roll can succeed. The exact arrival is seed- and state-dependent, never attached to a fixed day.
4. Fast-forward and playback stop when Mina arrives. TODAY reports “A traveler was seen near the eastern path.” Watch her walk from the eastern map edge over the footbridge to Su’s farmhouse. Walking continues while ecological time is paused.
5. On reaching the farmhouse, **INVITE TO STAY** appears in POPULATION; the contextual visitor notice also offers an invitation. Invitation enables terrain placement, not instant settlement.
6. Click gently sloping dry ground clear of the farm, existing house, river and paths. Invalid clicks explain why they failed and keep placement active. The footprint and entrance must fit inside the map and have a walkable route. A valid click places the combined home/bakery, clears its vegetation footprint, and changes Mina to resident. For the current terrain, (-6, -16) is one valid example; placement has no prescribed required spot.
7. Advance a day to schedule Mina’s simple routine. Watch morning home → bakery work → occasional farm visit → evening home. Playback waits for her routine to finish before advancing another ecological day. Instant fast-forward skips the intermediate walking previews and leaves the final day’s itinerary to play.

Su and Mina are labeled in the 3D view. Population diagnostics report residents, visitors, food reserves, recent harvest, food capacity (resident-weeks), maximum residents, settlement status and spatial measurements. WORLD STATE retains its ecological diagnostics and TODAY event log.

## State and rules

`src/village/population.ts` contains `populationRules`, villager/resource state, arrival rules, route search, movement, invitation, placement validation and settlement. Defaults:

- Maximum residents: 2, including Su.
- Eligible reserve: strictly greater than 20 food units.
- Eligible recent harvest: strictly greater than 12 units in a rolling seven-day window.
- Arrival chance per eligible day: min(0.8, 0.35 + 0.005 × (reserve − 20)).
- Residents consume 0.5 food units each per ecological day, without reserve going below zero. Visitors do not consume village reserves in this slice. This is resource accounting, not a hunger/needs system.
- Seed-derived arrival RNG is separate from weather RNG. One check per ecological day; an existing Mina prevents another arrival. Ineligible days consume no arrival random draw. Eligibility is evaluated after daily resident consumption.
- Mina remains a visitor until invited and placed. No visitor expiry or automatic invitation is implemented.

`WorldState.population` contains Su, nullable Mina, reserve, harvest ledger, arrival RNG/check information, placement mode and settlement. Lifetime `harvested` remains a separate statistic. Harvest validates maturity, adds its actual yield once to the ledger/reserve, and removes the crop. Every plot explicitly belongs to Su.

`VillagerState` stores stable identity, name, profession, status, position, home position, current goal, energy, arrival day, spatial context, route and itinerary. Energy is reserved state, not a new needs system. Minimal routines use a deterministic day/seed decision for an afternoon visit. Bakery work has no production economy in this phase.

## Movement and placement boundaries

Movement is a pure `movePopulation(world, seconds)` transition, invoked by fixed 0.1-second UI ticks, at 2 world units per second. Three.js only reads actor positions; its render loop makes no movement, probability, placement or scheduling decisions. Reproducing exact walking positions requires the same movement-tick/action sequence, while arrival and weather outcomes depend on ecological days, seed and harvest actions. Background-tab throttling can slow the walking preview without consuming ecological days.

The bounded cardinal grid route avoids water (using a conservative high-water threshold), excessive slopes, farm beds and building footprints. The eastern path continues over a small footbridge. It is intentionally not a full navigation/avoidance system: small rocks and individual tree trunks are not dynamic collision obstacles. Character bodies are simple visual markers.

Raycast terrain clicks become world X/Z coordinates. Pure validation checks bounds, footprint slope/height spread, dry land, farm/house/path overlap, and connected access. Settlement stores:

- home/bakery position and entrance;
- distance to farm center, river centerline (horizontal X offset at the same Z), nearest modeled path segment, and Su’s farmhouse;
- local fertility, soil moisture, elevation and slope at placement;
- routed walking distance to the farm.

The stored environmental context is a placement-time snapshot; current ecology remains in WorldState. Different placement produces different actual walking routes and travel durations. Other spatial values are available for future behavior but do not imply unimplemented productivity or relationship bonuses.

## Rendering and persistence

`FarmView.tsx` adds actors and the placed bakery without rebuilding terrain/ecology meshes on every walking tick. The current typography, sidebar, diagnostics and camera controls remain unchanged. `App.tsx` owns the village world, so Su, Mina, resources and settlement survive tab switches. Explicit reset/new parameters start a fresh world. Refreshing the browser still resets the in-memory session; durable save/load is not implemented.

## Verification

Run `CI=true npm test -- --watchAll=false --runInBand` and `npm run build`. Population tests cover resource-only eligibility, depleted/stale reserves, deterministic arrival, weather RNG independence, one check per day, fast-forward arrival stop, actual walking, explicit invitation/cancel, invalid placement, unique settlement, saved spatial context and route-dependent distances, and the resident routine returning home. The browser flow was exercised through harvesting, walking arrival, invitation, terrain-placement callback and settled routine; manual terrain raycast wiring shares that callback.
