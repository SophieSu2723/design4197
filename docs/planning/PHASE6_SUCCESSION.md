# Phase 6 — seed-bank growth

## Question

Can the same rain → soil → daily movement chain change *where new vegetation appears* over time? The earlier ecology changed the health and color of plants placed at world creation, but no new patches could establish. That made long-term environmental change hard to see.

## Current rule

The seeded landscape now contains invisible potential grass and flower sites. They use a separate random stream, so adding them does not move the existing plants. On each simulated day, after soil and storm effects resolve, each potential site reads its own cell's moisture, fertility and vegetation health, the day's temperature, and wear from **completed footsteps**. Suitable unoccupied ground may germinate according to the live **Seed-bank germination chance** control. Established patches grow gradually; dry, saturated, cold or heavily walked ground can shrink and eventually lose them. Houses and the commissioned shop suppress establishment inside their footprints.

The scene draws each new patch at its accumulated size. The Land & water controls show the number of living new patches, while the cause-and-effect panel shows today's gains and losses and explains the conditions. The control affects the next day and preserves the current world, people and history. A setting of zero stops new germination while existing patches continue to respond to their environment.

Su spots mature wildflower patches within three metres of a walk. On a later suitable day, Su can choose a known, reachable patch, gather two food and return it to the farm reserve. A picked patch shrinks and can regrow under the daily soil rules. Su checks the patch on arrival because its health may have changed since the sighting.

Both residents can prefer well-worn parts of the navigation grid. The day's route costs use earlier footsteps, with up to a 30% discount for the most worn segments. Blocked cells still prevent travel. Inspect a walking resident to see worn portions of the remaining route in green. Toggle **Village → Prefer walked paths** to compare newly planned routes without the discount.

## Try it

For a controlled comparison, start a fresh world with the same seed. Set spring rain probability to about 1, maximum rain to 3–5 mm and seed-bank germination chance to 0.3, then advance or play 20–30 days. Compare the new-growth count and visible flowers against an otherwise identical run at germination chance 0. A long dry run makes established patches decline. Once residents have completed walks, their worn routes inhibit nearby new growth.

## Evidence and limits

Tests compare a zero-rate and high-rate run under the same weather, confirm deterministic results without changing the weather RNG, show that drought removes patches, verify a live control edit preserves history, and test suppression at a walked seed-bank site. The production build also compiles.

In a browser observation with seed 42 and the default climate, the day-30 panel showed **196 living new patches**, including **3 established that day**. Pale yellow flower patches are visible across the ground. This is one run's result; weather and changed controls alter the count.

![Seed-bank growth on day 30: new flowers across the valley and a panel reporting 196 patches](../images/05-seedbank-day30.png)

Potential sites are sampled once from the seed. Sightings use proximity, and plant patches can become destinations for Su. Soil water demand continues to use the existing vegetation budget. The daily simulation advances in steps.
