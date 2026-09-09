import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { PlanetSettings, AppliedTopography } from '../types/planet';
import { stackElevation, effectiveLayers } from '../utils/terrain';
import { erodeHeightmap, mulberry32 } from '../utils/erosion';
import './MapCanvas2D.css';

// Equirectangular projection: x = longitude (wraps), y = latitude (N pole at
// top). Each pixel maps to a unit-sphere direction, so sampling the same
// terrain noise here reproduces the 3D planet's topography exactly — and an
// eroded map can be applied back to the sphere by the inverse mapping.
// ponytail: pixels near the poles cover less real surface area — fine for
// viewing and erosion v1; weight by cos(lat) if pole distortion starts to show.

export interface MapViewHandle {
  loadTopography(): void;
  reset(): void;
  snapshot(): AppliedTopography;   // current map, for applying to the 3D planet
}

interface Props {
  settings: PlanetSettings;
  eroding: boolean;   // erosion animation running — owned by App
}

const MapCanvas2D = forwardRef<MapViewHandle, Props>(({ settings, eroding }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heightsRef = useRef<Float32Array | null>(null); // working map, ~[0,1]
  const loadedRef = useRef<Float32Array | null>(null);  // pristine copy for reset
  const rawRangeRef = useRef({ min: 0, max: 1 });        // pre-normalization elevation range
  const sizeRef = useRef({ w: 512, h: 256 });            // dims the current map was built at
  const rngRef = useRef<() => number>(Math.random);      // seeded per erosion run

  const draw = () => {
    const canvas = canvasRef.current, map = heightsRef.current;
    if (!canvas || !map) return;
    const { w, h } = sizeRef.current;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d')!;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < map.length; i++) { if (map[i] < min) min = map[i]; if (map[i] > max) max = map[i]; }
    const range = Math.max(max - min, 1e-6);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < map.length; i++) {
      const g = Math.round(((map[i] - min) / range) * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };

  const loadTopography = () => {
    const h = settings.erosion.mapRes, w = h * 2;
    // Samples the terrain layer stack (respecting the layer manager's solo) —
    // including any already-applied map layer, so erosion can be iterated:
    // erode → apply → load → erode.
    const layers = effectiveLayers(settings.terrain);
    const map = new Float32Array(w * h);
    for (let py = 0; py < h; py++) {
      const lat = Math.PI * (0.5 - (py + 0.5) / h);
      for (let px = 0; px < w; px++) {
        const lon = 2 * Math.PI * ((px + 0.5) / w);
        const nx = Math.cos(lat) * Math.cos(lon);
        const ny = Math.sin(lat);
        const nz = Math.cos(lat) * Math.sin(lon);
        map[py * w + px] = stackElevation(layers, nx, ny, nz);
      }
    }
    // Normalize to [0,1] so the erosion constants behave the same regardless
    // of noise strength / elevation scale.
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < map.length; i++) { if (map[i] < min) min = map[i]; if (map[i] > max) max = map[i]; }
    const range = Math.max(max - min, 1e-6);
    for (let i = 0; i < map.length; i++) map[i] = (map[i] - min) / range;
    rawRangeRef.current = { min, max };
    sizeRef.current = { w, h };
    heightsRef.current = map;
    loadedRef.current = Float32Array.from(map);
    draw();
  };

  useImperativeHandle(ref, () => ({
    loadTopography,
    reset: () => {
      if (!loadedRef.current) return;
      heightsRef.current = Float32Array.from(loadedRef.current);
      draw();
    },
    snapshot: () => {
      if (!heightsRef.current) loadTopography();
      return {
        map: Float32Array.from(heightsRef.current!),
        width: sizeRef.current.w,
        height: sizeRef.current.h,
        elevMin: rawRangeRef.current.min,
        elevMax: rawRangeRef.current.max,
      };
    },
  }));

  // Load on mount and whenever the map resolution changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTopography(); }, [settings.erosion.mapRes]);

  // Each start of the animation reseeds, so a run is reproducible from its seed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (eroding) rngRef.current = mulberry32(settings.erosion.seed); }, [eroding]);

  // Erosion animation: a chunk of droplets per frame so carving is visible live.
  // Slider changes restart this effect but the RNG ref keeps the run's sequence.
  useEffect(() => {
    if (!eroding) return;
    if (!heightsRef.current) loadTopography();
    let id = 0;
    const step = () => {
      const e = settings.erosion;
      const { w, h } = sizeRef.current;
      // ponytail: assumes ~60fps, so droplets/60 per frame ≈ droplets per second
      erodeHeightmap(heightsRef.current!, w, h,
        { ...e, droplets: Math.max(1, Math.round(e.droplets / 60)) }, rngRef.current);
      draw();
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eroding, settings.erosion]);

  return (
    <div className="map-canvas-mount">
      <canvas ref={canvasRef} className="map-canvas" />
      <div className="map-caption">equirectangular — lon 0–360° · lat 90°N–90°S</div>
    </div>
  );
});

MapCanvas2D.displayName = 'MapCanvas2D';

export default MapCanvas2D;
