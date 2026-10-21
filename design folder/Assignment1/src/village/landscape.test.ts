import { createLandscape, excluded, farmPosition, terrainHeight, cellIndex, riverX } from './landscape';
import { actOnPlot, advanceDay, createWorld } from './simulation';
test('sites are deterministic, suit terrain, and avoid built features and the stream', () => {
  const landscape = createLandscape(42);
  expect(landscape).toEqual(createLandscape(42));
  expect(new Set(landscape.sites.map(s => s.kind)).size).toBe(5);
  landscape.sites.forEach(site => {
    expect(excluded(site.x, site.z)).toBe(false);
    expect(Math.abs(site.x - riverX(site.z))).toBeGreaterThanOrEqual(1.65);
    expect(Number.isFinite(terrainHeight(site.x, site.z))).toBe(true);
    if (site.kind === 'tree') expect(landscape.cells[site.cell].slope).toBeLessThan(0.65);
  });
});
test('farm soil and ecological cell water stay synchronized through daily updates and watering', () => {
  const world = actOnPlot(advanceDay(createWorld()), 4, 'water');
  for (const w of [world, advanceDay(world)]) w.plots.forEach(plot => {
    const p = farmPosition(plot.id); expect(w.ecology.cells[cellIndex(p.x, p.z)].waterMm).toBe(plot.waterMm);
  });
});
