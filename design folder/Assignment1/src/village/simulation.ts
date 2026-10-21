import { CELL_WIDTH, Landscape, createLandscape, cellIndex, farmPosition } from './landscape';
// Phase 1 rules: edit these defaults or use the parameter panel. Units are explicit.
export interface Parameters {
  seed: number; rainChance: number; rainMaxMm: number; temperatureC: number;
  soilCapacityMm: number; evaporationMm: number; drainageRate: number;
  uptakeMm: number; idealGrowingDays: number; baseYield: number;
  stressDamage: number; recovery: number; fertility: number;
}
export const defaultParameters: Parameters = {
  seed: 42, rainChance: 0.4, rainMaxMm: 18, temperatureC: 19,
  soilCapacityMm: 40, evaporationMm: 2, drainageRate: 0.15,
  uptakeMm: 1, idealGrowingDays: 8, baseYield: 12,
  stressDamage: 0.12, recovery: 0.025, fertility: 0.85,
};
export const seasonRules = [
  { name: 'Spring', temperatureOffset: 0, rainMultiplier: 1 },
  { name: 'Summer', temperatureOffset: 7, rainMultiplier: 0.6 },
  { name: 'Fall', temperatureOffset: -3, rainMultiplier: 1.2 },
  { name: 'Winter', temperatureOffset: -15, rainMultiplier: 0.5 },
];
export interface Crop { growth: number; health: number; stress: number; age: number }
export interface Plot { id: number; waterMm: number; drainage: number; crop: Crop | null }
export interface Weather { kind: 'Rain' | 'Cloudy' | 'Clear'; rainfallMm: number; temperatureC: number }
export interface PlotObservation { id: number; moisture: number; health: number | null; growth: number | null; expectedYield: number; status: string }
export interface DailyRecord extends Weather { day: number; season: string; plots: PlotObservation[]; harvested: number }
export interface EcologyCell { waterMm: number; soilMoisture: number; soilFertility: number; vegetationHealth: number; biomass: number }
export interface WorldEvent { day: number; time: string; type: 'weather' | 'soil' | 'river' | 'crop' | 'action'; description: string }
export interface Ecology { cells: EcologyCell[]; riverStorageM3: number; riverLevel: number; runoffM3: number; dischargeM3: number }
export interface WorldState {
  landscape: Landscape; ecology: Ecology; today: WorldEvent[]; weather: Weather | null; season: string;
  day: number; randomState: number; parameters: Parameters; plots: Plot[];
  harvested: number; history: DailyRecord[];
}
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export function calendar(day: number) { return seasonRules[Math.floor(Math.max(0, day - 1) / 28) % 4]; }
export function validateParameters(p: Parameters): string | null {
  if (Object.values(p).some(v => !Number.isFinite(v))) return 'Every parameter must be a finite number.';
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295) return 'Seed must be an integer from 0 to 4294967295.';
  for (const k of ['rainChance', 'drainageRate', 'stressDamage', 'recovery', 'fertility'] as const) if (p[k] < 0 || p[k] > 1) return `${k} must be between 0 and 1.`;
  if (p.soilCapacityMm < 1 || p.soilCapacityMm > 200 || p.idealGrowingDays < 1 || p.idealGrowingDays > 100) return 'Soil capacity must be 1–200 mm and growing days 1–100.';
  if (p.rainMaxMm < 0 || p.rainMaxMm > 100 || p.evaporationMm < 0 || p.evaporationMm > 30 || p.uptakeMm < 0 || p.uptakeMm > 20 || p.baseYield < 0 || p.baseYield > 100 || p.temperatureC < -30 || p.temperatureC > 50) return 'A weather, water, temperature, or yield parameter is outside its allowed range.';
  return null;
}
export function createWorld(parameters: Parameters = defaultParameters): WorldState {
  const error = validateParameters(parameters); if (error) throw new Error(error);
  const landscape = createLandscape(parameters.seed);
  const ecology: Ecology = { cells: landscape.cells.map(c => ({ waterMm: parameters.soilCapacityMm * 0.55, soilMoisture: 0.55, soilFertility: parameters.fertility * c.fertility, vegetationHealth: 0.8, biomass: 0.8 })), riverStorageM3: 65, riverLevel: 0.65, runoffM3: 0, dischargeM3: 0 };
  return { landscape, ecology, today: [], weather: null, season: 'Spring', day: 0, randomState: parameters.seed >>> 0, parameters: { ...parameters }, harvested: 0, history: [],
    plots: Array.from({ length: 9 }, (_, id) => ({ id, waterMm: parameters.soilCapacityMm * 0.55,
      drainage: landscape.cells[cellIndex(farmPosition(id).x, farmPosition(id).z)].drainage, crop: { growth: 0, health: 1, stress: 0, age: 0 } })) };
}
export function expectedYield(crop: Crop | null, p: Parameters): number {
  if (!crop || crop.health <= 0) return 0;
  return Math.floor(p.baseYield * crop.health * (1 - (crop.age ? crop.stress / crop.age : 0)) * p.fertility);
}
export function cropStatus(crop: Crop | null): string {
  return !crop ? 'Empty' : crop.health <= 0 ? 'Dead' : crop.growth >= 1 ? 'Ready' : 'Growing';
}
export function soilStep(water: number, drainage: number, hasCrop: boolean, weather: Weather, p: Parameters) {
  const available = water + weather.rainfallMm;
  const overflow = Math.max(0, available - p.soilCapacityMm);
  let stored = Math.min(available, p.soilCapacityMm);
  const evaporation = Math.min(stored, p.evaporationMm * clamp((weather.temperatureC + 5) / 24, 0, 2));
  stored -= evaporation;
  const drained = Math.min(stored, Math.max(0, stored - p.soilCapacityMm * 0.6) * p.drainageRate * drainage);
  stored -= drained;
  const uptake = hasCrop ? Math.min(stored, p.uptakeMm) : 0;
  return { waterMm: stored - uptake, overflow, evaporation, drained, uptake };
}
export function advanceDay(world: WorldState, fixture?: Weather): WorldState {
  const p = world.parameters, day = world.day + 1, season = calendar(day);
  let randomState = world.randomState;
  const random = () => { randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0; return randomState / 4294967296; };
  const wet = random() < clamp(p.rainChance * season.rainMultiplier);
  const rainfallMm = wet ? random() * p.rainMaxMm : 0;
  const weather: Weather = fixture ?? { kind: wet ? 'Rain' : random() < 0.4 ? 'Cloudy' : 'Clear', rainfallMm,
    temperatureC: p.temperatureC + season.temperatureOffset + (random() - 0.5) * 8 };
  let plots = world.plots, cells = world.ecology.cells.map(c => ({ ...c }));
  let storage = world.ecology.riverStorageM3, runoffTotal = 0, dischargeTotal = 0;
  const today: WorldEvent[] = [{ day, time: '00:00', type: 'weather', description: `${weather.kind}: ${weather.rainfallMm.toFixed(1)} mm rain scheduled today, ${weather.temperatureC.toFixed(1)} °C.` }];
  const plotCells = new Set(plots.map(plot => { const p = farmPosition(plot.id); return cellIndex(p.x, p.z); }));
  // Four deterministic six-hour intervals. Rainfall, water losses and growth are apportioned.
  for (let interval = 0; interval < 4; interval++) {
    const intervalWeather = { ...weather, rainfallMm: weather.rainfallMm / 4 };
    const intervalParameters = { ...p, evaporationMm: p.evaporationMm / 4, uptakeMm: p.uptakeMm / 4, drainageRate: 1 - Math.pow(1 - p.drainageRate, 0.25) };
    let runoff = 0;
    cells = cells.map((cell, index) => {
      if (plotCells.has(index)) return cell;
      const terrain = world.landscape.cells[index];
      const budget = soilStep(cell.waterMm, terrain.drainage, true, intervalWeather, { ...intervalParameters, uptakeMm: intervalParameters.uptakeMm * cell.biomass * 0.4 });
      runoff += (budget.overflow + budget.drained) * CELL_WIDTH ** 2 / 1000;
      const moisture = budget.waterMm / p.soilCapacityMm;
      const suitability = clamp(Math.min(moisture / 0.35, (1 - moisture) / 0.15, 1)) * clamp(1 - Math.abs(weather.temperatureC - 18) / 28) * (0.7 + cell.soilFertility * 0.3);
      const health = clamp(cell.vegetationHealth + (0.07 * suitability - 0.1 * (1 - suitability)) / 4);
      const biomass = clamp(cell.biomass + (health - 0.5) * 0.025 / 4, 0.12, 1);
      return { ...cell, waterMm: budget.waterMm, soilMoisture: moisture, vegetationHealth: health, biomass };
    });
    const updatedCells = cells;
    plots = plots.map(plot => {
    const location = farmPosition(plot.id), soilIndex = cellIndex(location.x, location.z);
    const waterMm = soilStep(plot.waterMm, plot.drainage, !!plot.crop && plot.crop.health > 0, intervalWeather, intervalParameters).waterMm;
    let crop = plot.crop ? { ...plot.crop } : null;
    if (crop && crop.health > 0) {
      const moisture = waterMm / p.soilCapacityMm;
      const waterSuitability = moisture < 0.35 ? moisture / 0.35 : moisture > 0.8 ? (1 - moisture) / 0.2 : 1;
      const temperatureSuitability = clamp(1 - Math.abs(weather.temperatureC - 19) / 18);
      const seasonSuitability = season.name === 'Spring' ? 1 : season.name === 'Winter' ? 0.1 : 0.65;
      const suitability = clamp(waterSuitability * temperatureSuitability * seasonSuitability);
      const stress = 1 - suitability;
      crop.health = clamp(crop.health + (p.recovery * suitability - p.stressDamage * stress) / 4);
      if (crop.health > 0) crop.growth = clamp(crop.growth + suitability * updatedCells[soilIndex].soilFertility * crop.health / p.idealGrowingDays / 4);
      crop.age += 0.25; crop.stress += stress / 4;
    }
    const position = farmPosition(plot.id), index = cellIndex(position.x, position.z);
    const budget = soilStep(plot.waterMm, plot.drainage, !!plot.crop && plot.crop.health > 0, intervalWeather, intervalParameters);
    runoff += (budget.overflow + budget.drained) * CELL_WIDTH ** 2 / 1000;
    updatedCells[index] = { ...updatedCells[index], waterMm, soilMoisture: waterMm / p.soilCapacityMm };
    return { ...plot, waterMm, crop };
  });

    // Runoff [mm × m² / 1000] enters one channel reservoir; discharge leaves the world.
    const availableStorage = storage + runoff;
    const discharge = availableStorage * 0.025 + Math.max(0, availableStorage * 0.975 - 140);
    storage += runoff - discharge; runoffTotal += runoff; dischargeTotal += discharge;
    const previousMean = interval === 0 ? world.ecology.cells.reduce((s, c) => s + c.soilMoisture, 0) / cells.length : null;
    if (previousMean !== null) {
      const mean = cells.reduce((s, c) => s + c.soilMoisture, 0) / cells.length;
      today.push({ day, time: '06:00', type: 'soil', description: `Soil moisture ${mean >= previousMean ? 'rose' : 'fell'} by ${(Math.abs(mean - previousMean) * 100).toFixed(1)} percentage points after first interval.` });
    }
  }
  const riverLevel = storage / 100;
  const growth = plots.reduce((sum, plot, i) => sum + (plot.crop?.growth ?? 0) - (world.plots[i].crop?.growth ?? 0), 0) / plots.length;
  today.push({ day, time: '24:00', type: 'river', description: `River ${riverLevel >= world.ecology.riverLevel ? 'rose' : 'fell'} ${Math.abs(riverLevel - world.ecology.riverLevel).toFixed(3)} m; runoff ${runoffTotal.toFixed(2)} m³.` });
  today.push({ day, time: '24:00', type: 'crop', description: `Mean crop growth +${(growth * 100).toFixed(1)} percentage points.` });
  const ecology: Ecology = { cells, riverStorageM3: storage, riverLevel, runoffM3: runoffTotal, dischargeM3: dischargeTotal };
  const record: DailyRecord = { day, season: season.name, ...weather, harvested: world.harvested,
    plots: plots.map(plot => ({ id: plot.id, moisture: plot.waterMm / p.soilCapacityMm,
      health: plot.crop?.health ?? null, growth: plot.crop?.growth ?? null,
      expectedYield: expectedYield(plot.crop, p), status: cropStatus(plot.crop) })) };
  return { ...world, day, season: season.name, weather, today, ecology, randomState, plots, history: [...world.history, record] };
}
export function advanceDays(world: WorldState, count: number): WorldState {
  let next = world; for (let i = 0; i < count; i++) next = advanceDay(next); return next;
}
export function actOnPlot(world: WorldState, id: number, action: 'water' | 'plant' | 'harvest' | 'clear'): WorldState {
  const plot = world.plots.find(p => p.id === id); if (!plot) return world;
  let next = { ...plot }, harvested = world.harvested;
  if (action === 'water') next.waterMm = Math.min(world.parameters.soilCapacityMm, plot.waterMm + 10);
  if (action === 'plant') { if (plot.crop) return world; next.crop = { growth: 0, health: 1, stress: 0, age: 0 }; }
  if (action === 'clear') { if (!plot.crop || plot.crop.health > 0) return world; next.crop = null; }
  if (action === 'harvest') {
    if (!plot.crop || plot.crop.health <= 0 || plot.crop.growth < 1) return world;
    harvested += expectedYield(plot.crop, world.parameters); next.crop = null;
  }
  const position = farmPosition(id), index = cellIndex(position.x, position.z);
  const cells = world.ecology.cells.map((c, i) => i === index ? { ...c, waterMm: next.waterMm, soilMoisture: next.waterMm / world.parameters.soilCapacityMm } : c);
  return { ...world, harvested, ecology: { ...world.ecology, cells }, today: [...world.today, { day: world.day, time: '24:00', type: 'action' as const, description: `${action} · plot ${id + 1}${action === 'harvest' ? ` · ${harvested - world.harvested} strawberries` : ''}` }].slice(-20), plots: world.plots.map(p => p.id === id ? next : p) };
}
