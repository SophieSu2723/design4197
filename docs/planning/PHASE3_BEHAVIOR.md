# Phase 3 — spatial behavior

Placement → spatial condition → behavioral tendency → observed daily pattern. The player does not schedule Mina; the player changes where she lives and the state of the world, and those change the odds of what she does. There is still one optional resident (Mina), and no dialogue, LLM, quests, memory, relationships or narrative generation.

## Try the chain

1. Reach settlement as in Phase 2 (advance, harvest ripe plots, advance until Mina arrives, invite, click terrain).
2. Advance a day. POPULATION → **BEHAVIOR · MINA / BAKER** shows the decision she is walking: goal and day part, target, energy and social need at the moment she chose, and the odds of each goal. Below it: a 7-day tally of day-part goals and walking distances from home to farm, river and path.
3. Toggle **Behavior target** (viewport toolbar) to draw her remaining route and a ring on her target. Diagnostic only; off by default.
4. Advance 30 days, then compare the 7-day tally across placements (reset with the same seed and place elsewhere). TODAY lists her meaningful transitions, e.g. “Mina visited Su’s farm in the afternoon.”

Observed with seed 42 over 60 days (240 day-part decisions):

| Home | Walk to farm / river / path | Farm | River | Walk | Outings per day, dry / rainy (>3 mm) |
| --- | --- | --- | --- | --- | --- |
| (−4, 4) beside the farm | 8 / 6 / 2 m | 38 | 21 | 39 | 1.83 / 0.83 |
| (8, 0) by the river, east bank | 32 / 1 / 11 m | 11 | 34 | 31 | 1.46 / 0.50 |
| (10, −12) remote south-east | 44 / 7 / 44 m | 10 | 39 | 6 | 1.06 / 0.33 |

The valley is narrow, so every valid site is within ~7 m walk of a riverbank; river differences are smaller than farm differences.

## Rules

All behavior rules are in `src/experiments/03-living-village/behavior.ts` (`behaviorRules`).

- **Day parts.** Each ecological day has four decisions, morning, midday, afternoon and evening, aligned with the four six-hour ecology intervals. Each decision picks one goal: `REST`, `WORK`, `VISIT_FARM`, `VISIT_RIVER`, `WALK`, `RETURN_HOME`. If the evening goal does not end at her door, a final “Night · return home” walk is appended.
- **Weight** = base × time × needs × space × environment, then a weighted draw:
  - *Time:* a table per day part (work favored in the morning, outings in the afternoon, rest and home in the evening). Every goal stays possible; there is no timetable.
  - *Needs:* low energy raises `REST`/`RETURN_HOME` and lowers outings; social need raises `VISIT_FARM` (0.5 + 1.5 × need).
  - *Space:* outing weights are multiplied by `0.15 + 1.35 × proximity`, with `proximity = 1 − clamp(walk / 30 m)`, using the actual routed walking distance from her door. No route → weight 0. `RETURN_HOME` is 0 while she is already home.
  - *Environment:* rain (`wet = clamp(rainfall / 10 mm)`) multiplies outings by `1 − 0.6 wet` and home goals by `1 + 0.4 wet`; fair, comfortable weather (near 18 °C, dry) raises `WALK` and slightly `VISIT_FARM`; river level above 0.8 m lowers `VISIT_RIVER` (to 20% at 1.4 m); ready crops and recent harvest raise `VISIT_FARM`.
- **Needs** are 0–1. Each activity spends energy (work 0.15, outings 0.08–0.1 plus 0.004 per metre of walk); rest restores 0.25, sleep restores 0.45 overnight. Social need rises 0.08 per day part apart from Su and falls 0.45 when she visits Su’s farm. Living far from the farm can therefore leave social need high: the need pushes toward the farm, distance pushes back.
- **Determinism.** Each draw uses `behaviorRandom(seed, day, villagerId, decisionIndex)`, a hash independent of weather and arrival random streams. Same seed and actions → same decisions and events; behavior never changes weather.

## State, movement and rendering

- `SpatialContext` (computed at placement) adds `routeLengthToRiver` and `routeLengthToPath` beside the existing `routeLengthToFarm`. `settlement.locations` stores the five destinations (`home` door, `bakery`, `farm` gate, nearest reachable `river` bank, nearest reachable `path` point). Environmental fields in the context remain a placement-time snapshot.
- `VillagerState` adds, for Mina only, `socialNeed`, `activity` (the decision currently being walked, with its needs and weights) and `recentGoals` (last 7 days). `energy` now carries over between days.
- Decisions are made in the simulation at the day boundary (`advanceDay` → `populationDay` → `behaviorDay`) and stored as an itinerary. `movePopulation` walks it and sets `activity` as each step starts. FarmView only reads `position`, `route` and `activity.targetPosition`. Fast-forward makes the same decisions as watched playback, because it doesn't depend on movement ticks.

## Events

Behavior events use `WorldEvent` with `type: 'behavior'` plus structured fields: `action` (`VISITED_FARM`, `VISITED_RIVER`, `WALKED`, `WORKED`, `RESTED`, `RETURNED_HOME`, `STAYED_HOME`), `actorId`, optional `targetId` (`su` for farm visits), `location`, and `context` (day part, rainfall, river level, energy, social need). One event per outing or transition, never per tick: consecutive parts at the same place merge; a day without outings is a single `STAYED_HOME`. These are raw facts for Phase 4 to interpret; there is no importance, emotion or memory yet.

## Verification

`CI=true npm test -- --watchAll=false --runInBand` and `npm run build`. `behavior.test.ts` covers spatial context and destinations, proximity → farm/river weight, low energy → rest/return home, social need → farm, rain and high river, time-of-day shifts, deterministic seeded decisions, day plan/needs/events with untouched weather RNG, the three placement scenarios over 60 days, and fewer outings on rainy days. The Phase 2 routine test now checks the weighted itinerary instead of the removed fixed labels.
