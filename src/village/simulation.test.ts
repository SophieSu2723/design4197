import { actOnPlot, advanceDay, advanceDays, createWorld, defaultParameters, expectedYield, soilStep, validateParameters } from './simulation';

test('30 days are deterministic, recorded individually, and cross the season boundary', () => {
  const initial = createWorld(); const result = advanceDays(initial, 30);
  expect(result).toEqual(advanceDays(createWorld(), 30));
  expect(initial.day).toBe(0); expect(initial.history).toHaveLength(0);
  expect(result.history).toHaveLength(30); expect(result.history[27].season).toBe('Spring'); expect(result.history[28].season).toBe('Summer');
  expect(advanceDays(createWorld({ ...defaultParameters, seed: 43 }), 30).history).not.toEqual(result.history);
  result.history.forEach(day => day.plots.forEach(plot => {
    for (const value of [plot.moisture, plot.health!, plot.growth!]) { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1); }
    expect(Number.isFinite(plot.expectedYield)).toBe(true);
  }));
});
test('soil accounts for all incoming water and caps uptake at available storage', () => {
  const p = defaultParameters, weather = { kind: 'Rain' as const, rainfallMm: 30, temperatureC: 24 };
  const soil = soilStep(35, 1, true, weather, p);
  expect(soil.waterMm + soil.overflow + soil.evaporation + soil.drained + soil.uptake).toBeCloseTo(65);
  expect(soilStep(0, 1, true, { ...weather, rainfallMm: 0 }, p).waterMm).toBe(0);
});
test('healthy conditions mature crops while drought and saturation hurt crops and expected yield', () => {
  let healthy = createWorld({ ...defaultParameters, evaporationMm: 1, uptakeMm: 1 });
  let dry = createWorld(); let wet = createWorld({ ...defaultParameters, drainageRate: 0, evaporationMm: 0, uptakeMm: 0 });
  for (let i = 0; i < 16; i++) {
    healthy = advanceDay(healthy, { kind: 'Rain', rainfallMm: 2, temperatureC: 19 });
    dry = advanceDay(dry, { kind: 'Clear', rainfallMm: 0, temperatureC: 30 });
    wet = advanceDay(wet, { kind: 'Rain', rainfallMm: 40, temperatureC: 19 });
  }
  expect(healthy.plots[0].crop!.growth).toBe(1);
  expect(expectedYield(healthy.plots[0].crop, healthy.parameters)).toBeGreaterThan(expectedYield(dry.plots[0].crop, dry.parameters));
  expect(healthy.plots[0].crop!.health).toBeGreaterThan(wet.plots[0].crop!.health);
});
test('harvest requires maturity and cannot be duplicated; clearing and planting are validated', () => {
  const initial = createWorld(); expect(actOnPlot(initial, 0, 'harvest')).toBe(initial);
  const ready = { ...initial, plots: initial.plots.map(p => ({ ...p, crop: { ...p.crop!, growth: 1 } })) };
  const harvested = actOnPlot(ready, 0, 'harvest');
  expect(harvested.harvested).toBe(expectedYield(ready.plots[0].crop, ready.parameters));
  expect(actOnPlot(harvested, 0, 'harvest')).toBe(harvested);
  expect(actOnPlot(ready, 0, 'clear')).toBe(ready);
  expect(actOnPlot(harvested, 0, 'plant').plots[0].crop!.growth).toBe(0);
  expect(actOnPlot(initial, 99, 'water')).toBe(initial);
});
test('watering clamps to capacity and historical snapshots do not change after actions', () => {
  const w = advanceDay(createWorld()); const before = JSON.stringify(w.history);
  let watered = w; for (let i = 0; i < 10; i++) watered = actOnPlot(watered, 0, 'water');
  expect(watered.plots[0].waterMm).toBe(w.parameters.soilCapacityMm);
  expect(JSON.stringify(watered.history)).toBe(before);
  expect(validateParameters({ ...defaultParameters, rainChance: NaN })).not.toBeNull();
});

test('river conserves storage plus runoff minus discharge and ecology remains bounded for 30 days', () => {
  let world = createWorld();
  for (let day = 0; day < 30; day++) {
    const next = advanceDay(world);
    expect(next.ecology.riverStorageM3).toBeCloseTo(world.ecology.riverStorageM3 + next.ecology.runoffM3 - next.ecology.dischargeM3, 8);
    expect(next.ecology.riverLevel).toBe(next.ecology.riverStorageM3 / 100);
    next.ecology.cells.forEach(cell => {
      expect(cell.waterMm).toBeGreaterThanOrEqual(0); expect(cell.waterMm).toBeLessThanOrEqual(next.parameters.soilCapacityMm);
      for (const v of [cell.soilMoisture, cell.soilFertility, cell.vegetationHealth, cell.biomass]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    });
    expect(next.landscape).toBe(world.landscape);
    expect(next.today.every(event => event.day === next.day)).toBe(true);
    world = next;
  }
});
test('rain and drought change actual soil, river and vegetation state', () => {
  let wet = createWorld(), dry = createWorld();
  for (let i = 0; i < 12; i++) {
    wet = advanceDay(wet, { kind: 'Rain', rainfallMm: 5, temperatureC: 19 });
    dry = advanceDay(dry, { kind: 'Clear', rainfallMm: 0, temperatureC: 30 });
  }
  const mean = (w: typeof wet, key: 'soilMoisture' | 'vegetationHealth') => w.ecology.cells.reduce((a, c) => a + c[key], 0) / w.ecology.cells.length;
  expect(mean(wet, 'soilMoisture')).toBeGreaterThan(mean(dry, 'soilMoisture'));
  expect(mean(wet, 'vegetationHealth')).toBeGreaterThan(mean(dry, 'vegetationHealth'));
  expect(wet.ecology.riverLevel).toBeGreaterThan(dry.ecology.riverLevel);
});
test('extreme rain exits through downstream overflow instead of unbounded river rise', () => {
  let world = createWorld();
  for (let i = 0; i < 30; i++) world = advanceDay(world, { kind: 'Rain', rainfallMm: 100, temperatureC: 19 });
  expect(world.ecology.riverLevel).toBeLessThanOrEqual(1.4);
  expect(world.ecology.dischargeM3).toBeGreaterThan(0);
});
