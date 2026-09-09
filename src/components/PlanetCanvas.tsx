import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PlanetSettings, TerrainSettings, ShaderSettings } from '../types/planet';
import { stackElevation, effectiveLayers } from '../utils/terrain';
import './PlanetCanvas.css';

const MAX_STOPS = 5;

// GLSL injected into the standard terrain material to recolor it by elevation.
// vElev is the vertex's radial distance above the base sphere (length(pos) - radius),
// so coloring follows the *spherical* surface rather than a flat Y height.
const TERRAIN_RAMP_GLSL = `
varying float vElev;
uniform float uElevMin;
uniform float uElevMax;
uniform int   uRampMode;        // 1 = gradient, 2 = stepped
uniform int   uRampCount;
uniform vec3  uRampColors[${MAX_STOPS}];
uniform float uRampPositions[${MAX_STOPS}];
uniform int   uSeaLink;         // 1 = anchor ramp to the water height
uniform float uSeaLevel;        // water elevation above the base sphere

vec3 terrainRamp() {
  float t;
  if (uSeaLink == 1) {
    // Ramp position 0.5 sits exactly at the waterline: stops below 0.5 shade
    // underwater terrain, stops above 0.5 shade land. Moving the sea level
    // re-anchors the coloring automatically.
    t = vElev < uSeaLevel
      ? 0.5 * clamp((vElev - uElevMin) / max(uSeaLevel - uElevMin, 1e-4), 0.0, 1.0)
      : 0.5 + 0.5 * clamp((vElev - uSeaLevel) / max(uElevMax - uSeaLevel, 1e-4), 0.0, 1.0);
  } else {
    float range = max(uElevMax - uElevMin, 1e-4);
    t = clamp((vElev - uElevMin) / range, 0.0, 1.0);
  }
  vec3 col = uRampColors[0];
  for (int i = 1; i < ${MAX_STOPS}; i++) {
    if (i >= uRampCount) break;
    float seg;
    if (uRampMode == 2) {
      seg = step(uRampPositions[i], t);                 // hard band edge
    } else {
      float d = max(uRampPositions[i] - uRampPositions[i - 1], 1e-4);
      seg = clamp((t - uRampPositions[i - 1]) / d, 0.0, 1.0);  // linear blend
    }
    col = mix(col, uRampColors[i], seg);
  }
  return col;
}
`;

// ─── Shaders ──────────────────────────────────────────────────────────────────

const OCEAN_VERT = `
varying vec3  vNormal;
varying vec3  vViewPosition;
varying vec3  vSunDir;
varying float vWave;

uniform float uTime;
uniform float uRippleHeight;
uniform float uRippleScale;
uniform float uRippleSpeed;
uniform vec3  uSunDir;

void main() {
  vec3 n = normalize(normal);

  float w1 = sin(dot(n, normalize(vec3( 1.0,  0.3,  0.0))) * uRippleScale * 8.0  + uTime * uRippleSpeed);
  float w2 = sin(dot(n, normalize(vec3( 0.0,  0.8,  0.6))) * uRippleScale * 11.0 + uTime * uRippleSpeed * 0.7);
  float w3 = sin(dot(n, normalize(vec3(-0.6,  0.2,  0.8))) * uRippleScale * 6.5  + uTime * uRippleSpeed * 1.3);
  vWave = w1 * 0.5 + w2 * 0.3 + w3 * 0.2; // [-1, 1]

  vec3 displaced = position + n * vWave * uRippleHeight;

  vNormal       = normalize(normalMatrix * normal);
  vSunDir       = normalize(mat3(viewMatrix) * uSunDir);
  vec4 mvPos    = modelViewMatrix * vec4(displaced, 1.0);
  vViewPosition = -mvPos.xyz;
  gl_Position   = projectionMatrix * mvPos;
}
`;

const OCEAN_FRAG = `
varying vec3  vNormal;
varying vec3  vViewPosition;
varying vec3  vSunDir;
varying float vWave;

uniform vec3  uDeepColor;
uniform vec3  uShallowColor;
uniform vec3  uFoamColor;
uniform float uLit;
uniform float uTime;
uniform float uRippleSpeed;

// Depth / coastline
uniform sampler2D tDepth;
uniform vec2      uResolution;
uniform float     uNear;
uniform float     uFar;
uniform float     uFoamEnabled;
uniform float     uFoamDepth;
uniform float     uFoamSoftness;
uniform float     uRippleEnabled;
uniform float     uRippleWidth;
uniform float     uRippleDistance;

float linearizeDepth(float raw) {
  float ndc = 2.0 * raw - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
}

void main() {
  float wave  = vWave;                          // [-1, 1]
  float waveN = wave * 0.5 + 0.5;              // [0, 1]
  vec3  color = uDeepColor;

  // ── Depth diff: view-space distance from this ocean pixel to the land
  //    behind it. ~0 right at the shoreline, grows out into open water. ──
  float depthDiff = 1000.0;   // large default = open ocean, far from coast
  if (uFoamEnabled > 0.5 || uRippleEnabled > 0.5) {
    vec2  uv          = gl_FragCoord.xy / uResolution;
    float rawScene    = texture2D(tDepth, uv).r;
    float linearScene = linearizeDepth(rawScene);
    float linearFrag  = linearizeDepth(gl_FragCoord.z);
    depthDiff = linearScene - linearFrag;   // >0 means terrain is behind ocean
  }

  // ── Depth-based coastline foam ────────────────────────────────────────
  if (uFoamEnabled > 0.5) {
    // Shallow → deep gradient over 4× the foam depth
    float shallowT = 1.0 - smoothstep(0.0, uFoamDepth * 4.0, depthDiff);
    color = mix(uDeepColor, uShallowColor, shallowT);

    // Hard or soft foam band right at the intersection
    float edgeWidth = mix(uFoamDepth * 0.04, uFoamDepth, uFoamSoftness);
    float foamBase  = 1.0 - smoothstep(0.0, max(edgeWidth, 0.001), depthDiff);

    // Animate the foam edge: wave crests push the boundary outward slightly
    float foamAnim  = foamBase + (waveN * 0.5) * foamBase;
    color = mix(color, uFoamColor, clamp(foamAnim, 0.0, 1.0));
  }

  // ── Coastline ripples: animated contour lines parallel to the shore ──
  //    Banding on depthDiff (not the surface wave pattern) keeps the lines
  //    locked to the coast; phase scroll over uTime animates them inward.
  // ponytail: view-space depthDiff is the standard toon-water approximation;
  //   swap for a coastline SDF if the view-dependence becomes objectionable.
  if (uRippleEnabled > 0.5) {
    float shore    = max(depthDiff, 0.0);
    float bandMask = 1.0 - smoothstep(0.0, uRippleDistance, shore);
    float phase    = shore / max(uRippleWidth, 0.001) - uTime * uRippleSpeed;
    float tri      = abs(fract(phase) - 0.5) * 2.0;   // 1 at a line centre
    float line     = smoothstep(0.55, 1.0, tri);       // thin bright contour
    color = mix(color, uFoamColor, line * bandMask * 0.6);
  }

  // ── Lighting ─────────────────────────────────────────────────────────
  if (uLit > 0.5) {
    vec3  N   = normalize(vNormal);
    vec3  sun = normalize(vSunDir);
    float d   = max(dot(N, sun), 0.0);

    // Two-step toon diffuse: unlit 0.1 / mid 0.5 / full 0.95
    float toon = 0.1 + step(0.3, d) * 0.4 + step(0.7, d) * 0.45;
    color = color * toon;

    // Toon specular blob
    vec3  viewDir = normalize(vViewPosition);
    vec3  H       = normalize(sun + viewDir);
    float spec    = pow(max(dot(N, H), 0.0), 64.0);
    color += step(0.78, spec) * vec3(0.85, 0.95, 1.0) * 0.65;
  }

  gl_FragColor = vec4(color, 0.88);
}
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createDepthTarget(w: number, h: number): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  t.depthTexture = new THREE.DepthTexture(w, h);
  return t;
}

// Build the elevation-ramp uniform set from settings. Stops are sorted by
// position and padded to MAX_STOPS so the GLSL array is always fully defined.
function rampToUniforms(settings: PlanetSettings, elevMin: number, elevMax: number) {
  const sorted = [...settings.shaders.ramp]
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_STOPS);
  const colors: THREE.Color[] = [];
  const positions: number[] = [];
  for (let i = 0; i < MAX_STOPS; i++) {
    const stop = sorted[Math.min(i, sorted.length - 1)];
    colors.push(new THREE.Color(stop.color));
    positions.push(stop.position);
  }
  return {
    uRadius:        { value: settings.shape.radius },
    uElevMin:       { value: elevMin },
    uElevMax:       { value: elevMax },
    uRampMode:      { value: settings.shaders.colorMode === 'stepped' ? 2 : 1 },
    uRampCount:     { value: sorted.length },
    uRampColors:    { value: colors },
    uRampPositions: { value: positions },
    uSeaLink:       { value: settings.shaders.linkToSea ? 1 : 0 },
    uSeaLevel:      { value: settings.ocean.seaLevel },
  };
}

function createTerrainMaterial(
  settings: PlanetSettings, elevMin: number, elevMax: number
): THREE.Material {
  const { style, colorMode, terrainColor, ao } = settings.shaders;

  // AO is baked into a vertex color attribute; vertexColors multiplies it in
  // for every material path (lit or unlit, solid or ramp).
  // Solid: plain material, no shader injection.
  if (colorMode === 'solid') {
    const c = new THREE.Color(terrainColor);
    return style === 'standard-lit'
      ? new THREE.MeshPhongMaterial({ color: c, shininess: 20, specular: new THREE.Color(0x224422), vertexColors: ao })
      : new THREE.MeshBasicMaterial({ color: c, vertexColors: ao });
  }

  // Gradient / stepped: keep the standard material's lighting (or flat unlit)
  // and override the diffuse color with an elevation ramp via onBeforeCompile.
  const mat: THREE.Material = style === 'standard-lit'
    ? new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 20, specular: new THREE.Color(0x224422), vertexColors: ao })
    : new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: ao });

  const elevUniforms = rampToUniforms(settings, elevMin, elevMax);
  mat.userData.elevUniforms = elevUniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, elevUniforms);
    shader.vertexShader =
      'varying float vElev;\nuniform float uRadius;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vElev = length(position) - uRadius;'
      );
    // Set the ramp color *before* <color_fragment> so the AO vertex-color
    // multiply (inside that include) applies on top of it.
    shader.fragmentShader =
      TERRAIN_RAMP_GLSL +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        'diffuseColor.rgb = terrainRamp();\n#include <color_fragment>'
      );
  };
  return mat;
}

function createOceanMaterial(settings: PlanetSettings): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:         { value: 0 },
      uDeepColor:    { value: new THREE.Color(settings.ocean.deepColor) },
      uShallowColor: { value: new THREE.Color(settings.ocean.shallowColor) },
      uFoamColor:    { value: new THREE.Color(settings.ocean.foamColor) },
      uLit:          { value: settings.shaders.style === 'standard-lit' ? 1.0 : 0.0 },
      uSunDir:       { value: new THREE.Vector3(5, 3, 5).normalize() },
      uRippleHeight: { value: settings.ocean.rippleHeight },
      uRippleScale:  { value: settings.ocean.rippleScale },
      uRippleSpeed:  { value: settings.ocean.rippleSpeed },
      tDepth:        { value: null },
      uResolution:   { value: new THREE.Vector2(1, 1) },
      uNear:         { value: 0.1 },
      uFar:          { value: 1000 },
      uFoamEnabled:    { value: settings.ocean.foamEnabled ? 1.0 : 0.0 },
      uFoamDepth:      { value: settings.ocean.foamDepth },
      uFoamSoftness:   { value: settings.ocean.foamSoftness },
      uRippleEnabled:  { value: settings.ocean.rippleEnabled ? 1.0 : 0.0 },
      uRippleWidth:    { value: settings.ocean.rippleWidth },
      uRippleDistance: { value: settings.ocean.rippleDistance },
    },
    vertexShader:   OCEAN_VERT,
    fragmentShader: OCEAN_FRAG,
    transparent:    true,
    depthWrite:     false,
    side:           THREE.FrontSide,
  });
}

interface BuiltGeometry {
  geometry: THREE.BufferGeometry;
  elevMin: number;   // min radial displacement (matches length(pos) - radius in shader)
  elevMax: number;
}

// Crevice AO baked into a vertex color attribute: a vertex sitting lower than
// its neighbours (sampled `radius` grid cells away, 8 directions) is occluded.
// Self-normalizing against the mean occlusion so it stays visible at any
// elevation scale or resolution; `contrast` is a gamma on that distribution.
// ponytail: swap for a screen-space SSAOPass if baked AO ever looks too coarse.
function bakeVertexAO(
  geo: THREE.BufferGeometry, elevs: Float32Array, resolution: number,
  strength: number, radius: number, contrast: number
): void {
  const cols = resolution + 1;
  const rows = elevs.length / cols;
  const period = cols - 1;                       // seam column is duplicated
  const r = Math.max(1, Math.round(radius));
  const wrapX = (ix: number) => ((ix % period) + period) % period;
  const clampY = (iy: number) => Math.max(0, Math.min(rows - 1, iy));
  const occ = new Float32Array(elevs.length);
  let sum = 0;
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const i = iy * cols + ix;
      let n = 0;
      for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r, -r], [r, -r], [-r, r], [r, r]]) {
        n += elevs[clampY(iy + dy) * cols + wrapX(ix + dx)];
      }
      const o = Math.max(0, n / 8 - elevs[i]);
      occ[i] = o;
      sum += o;
    }
  }
  const k = 3 * (sum / elevs.length) + 1e-9;
  const colors = new Float32Array(elevs.length * 3);
  for (let i = 0; i < elevs.length; i++) {
    const a = 1 - strength * Math.pow(Math.min(occ[i] / k, 1), contrast);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function buildPlanetGeometry(
  radius: number, resolution: number, terrain: TerrainSettings, shaders: ShaderSettings
): BuiltGeometry {
  const geo = new THREE.SphereGeometry(radius, resolution, resolution);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  if (!terrain.enabled) {
    // Materials with vertexColors need the attribute even on a smooth sphere
    if (shaders.ao) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
    return { geometry: geo, elevMin: 0, elevMax: 0 };
  }
  const layers = effectiveLayers(terrain);
  const elevs = new Float32Array(pos.count);
  let elevMin = Infinity, elevMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r === 0) continue;
    const nx = x / r, ny = y / r, nz = z / r;
    const elev = stackElevation(layers, nx, ny, nz) * terrain.elevationScale;
    elevs[i] = elev;
    if (elev < elevMin) elevMin = elev;
    if (elev > elevMax) elevMax = elev;
    pos.setXYZ(i, x + nx * elev, y + ny * elev, z + nz * elev);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  if (shaders.ao) bakeVertexAO(geo, elevs, resolution, shaders.aoStrength, shaders.aoRadius, shaders.aoContrast);
  return { geometry: geo, elevMin, elevMax };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { settings: PlanetSettings; }

interface SceneRefs {
  renderer:    THREE.WebGLRenderer;
  scene:       THREE.Scene;
  camera:      THREE.PerspectiveCamera;
  controls:    OrbitControls;
  planet:      THREE.Mesh;
  wire:        THREE.Mesh;   // wireframe overlay, shares the planet's geometry
  ocean:       THREE.Mesh;
  depthTarget: THREE.WebGLRenderTarget;
  animId:      number;
  startTime:   number;
  elevMin:     number;
  elevMax:     number;
}

const PlanetCanvas: React.FC<Props> = ({ settings }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);

  // ── Scene setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080810);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.set(0, 0, 3.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);

    // Physical pixel dimensions (may differ from CSS px on HiDPI displays)
    const PW = renderer.domElement.width;
    const PH = renderer.domElement.height;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 10;

    // Planet
    const built = buildPlanetGeometry(settings.shape.radius, settings.shape.resolution, settings.terrain, settings.shaders);
    const planetMat = createTerrainMaterial(settings, built.elevMin, built.elevMax);
    const planet = new THREE.Mesh(built.geometry, planetMat);
    scene.add(planet);

    // Wireframe overlay — same geometry, scaled a hair outward so lines sit
    // on top of the shading; depthWrite off keeps it out of the ocean's
    // coastline depth pre-pass.
    const wire = new THREE.Mesh(built.geometry, new THREE.MeshBasicMaterial({
      color: 0x6666cc, wireframe: true, transparent: true, opacity: 0.35, depthWrite: false,
    }));
    wire.scale.setScalar(1.001);
    wire.visible = settings.shape.wireframe;
    scene.add(wire);

    // Depth target + ocean — sized to physical pixels so gl_FragCoord.xy / uResolution is correct
    const depthTarget = createDepthTarget(PW, PH);
    const oceanGeo = new THREE.SphereGeometry(
      Math.max(0.01, settings.shape.radius + settings.ocean.seaLevel),
      settings.ocean.resolution, settings.ocean.resolution
    );
    const oceanMat = createOceanMaterial(settings);
    oceanMat.uniforms.tDepth.value    = depthTarget.depthTexture;
    oceanMat.uniforms.uResolution.value.set(PW, PH);
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.visible = settings.ocean.enabled;
    ocean.renderOrder = 1;
    scene.add(ocean);

    // Lights
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
    sun.position.set(5, 3, 5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x1a1a3a, 0.3);
    fill.position.set(-5, -2, -5);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x0d0d1a, 1.0));

    // Stars
    const sp = new Float32Array(9000).map(() => (Math.random() - 0.5) * 300);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, sizeAttenuation: true })));

    const startTime = performance.now();

    const animate = () => {
      if (!sceneRef.current) return;
      sceneRef.current.animId = requestAnimationFrame(animate);
      const refs = sceneRef.current;
      const t = (performance.now() - startTime) * 0.001;
      controls.update();

      if (refs.ocean.visible) {
        // Depth pre-pass: render scene without ocean to capture terrain depth
        (refs.ocean.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
        refs.ocean.visible = false;
        renderer.setRenderTarget(refs.depthTarget);
        renderer.render(scene, camera);
        refs.ocean.visible = true;
        renderer.setRenderTarget(null);
      }

      renderer.render(scene, camera);
    };

    sceneRef.current = {
      renderer, scene, camera, controls, planet, wire, ocean, depthTarget,
      animId: 0, startTime, elevMin: built.elevMin, elevMax: built.elevMax,
    };
    animate();

    const observer = new ResizeObserver(() => {
      if (!sceneRef.current) return;
      const refs = sceneRef.current;
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w === 0 || h === 0) return; // hidden behind the 2D map tab
      refs.camera.aspect = w / h;
      refs.camera.updateProjectionMatrix();
      refs.renderer.setSize(w, h);
      const pw = refs.renderer.domElement.width;
      const ph = refs.renderer.domElement.height;
      refs.depthTarget.setSize(pw, ph);
      (refs.ocean.material as THREE.ShaderMaterial).uniforms.uResolution.value.set(pw, ph);
    });
    observer.observe(mount);

    return () => {
      cancelAnimationFrame(sceneRef.current?.animId ?? 0);
      observer.disconnect();
      controls.dispose();
      if (sceneRef.current) {
        const refs = sceneRef.current;
        (refs.planet.material as THREE.Material).dispose();
        (refs.wire.material as THREE.Material).dispose();
        refs.planet.geometry.dispose();   // shared with wire — dispose once
        (refs.ocean.material as THREE.Material).dispose();
        refs.ocean.geometry.dispose();
        refs.depthTarget.depthTexture?.dispose();
        refs.depthTarget.dispose();
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Terrain geometry ────────────────────────────────────────────────────
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const old = refs.planet.geometry;
    const built = buildPlanetGeometry(settings.shape.radius, settings.shape.resolution, settings.terrain, settings.shaders);
    refs.planet.geometry = built.geometry;
    refs.wire.geometry = built.geometry;
    refs.elevMin = built.elevMin;
    refs.elevMax = built.elevMax;
    // Push the new elevation range to the ramp shader (if active).
    const eu = (refs.planet.material as THREE.Material).userData.elevUniforms;
    if (eu) {
      eu.uElevMin.value = built.elevMin;
      eu.uElevMax.value = built.elevMax;
      eu.uRadius.value  = settings.shape.radius;
    }
    old.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.shape.radius, settings.shape.resolution, settings.terrain,
      settings.shaders.ao, settings.shaders.aoStrength, settings.shaders.aoRadius, settings.shaders.aoContrast]);

  // ── Wireframe overlay visibility ─────────────────────────────────────────
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.wire.visible = settings.shape.wireframe;
  }, [settings.shape.wireframe]);

  // ── Terrain material — recreate only on structural changes (lit/flat,
  //    or crossing the solid ↔ ramp boundary) to avoid GLSL recompiles on drag.
  const isRampMode = settings.shaders.colorMode !== 'solid';
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const old = refs.planet.material as THREE.Material;
    refs.planet.material = createTerrainMaterial(settings, refs.elevMin, refs.elevMax);
    old.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.shaders.style, isRampMode, settings.shaders.ao]);

  // ── Solid terrain color ──────────────────────────────────────────────────
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const mat = refs.planet.material as THREE.MeshPhongMaterial;
    if (settings.shaders.colorMode === 'solid' && mat.color) {
      mat.color.set(settings.shaders.terrainColor);
    }
  }, [settings.shaders.terrainColor, settings.shaders.colorMode]);

  // ── Elevation ramp uniforms (gradient/stepped tweaks, no recompile) ───────
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const eu = (refs.planet.material as THREE.Material).userData.elevUniforms;
    if (!eu) return;
    const fresh = rampToUniforms(settings, refs.elevMin, refs.elevMax);
    eu.uRampMode.value      = fresh.uRampMode.value;
    eu.uRampCount.value     = fresh.uRampCount.value;
    eu.uRampColors.value    = fresh.uRampColors.value;
    eu.uRampPositions.value = fresh.uRampPositions.value;
    eu.uSeaLink.value       = fresh.uSeaLink.value;
    eu.uSeaLevel.value      = fresh.uSeaLevel.value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.shaders.ramp, settings.shaders.colorMode, settings.shaders.linkToSea, settings.ocean.seaLevel]);

  // ── Ocean geometry + visibility ──────────────────────────────────────────
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    refs.ocean.visible = settings.ocean.enabled;
    const old = refs.ocean.geometry;
    const r = Math.max(0.01, settings.shape.radius + settings.ocean.seaLevel);
    refs.ocean.geometry = new THREE.SphereGeometry(r, settings.ocean.resolution, settings.ocean.resolution);
    old.dispose();
  }, [settings.ocean.enabled, settings.shape.radius, settings.ocean.seaLevel, settings.ocean.resolution]);

  // ── Ocean ripple uniforms ────────────────────────────────────────────────
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const u = (refs.ocean.material as THREE.ShaderMaterial).uniforms;
    u.uDeepColor.value.set(settings.ocean.deepColor);
    u.uLit.value          = settings.shaders.style === 'standard-lit' ? 1.0 : 0.0;
    u.uRippleSpeed.value  = settings.ocean.rippleSpeed;
    u.uRippleScale.value  = settings.ocean.rippleScale;
    u.uRippleHeight.value = settings.ocean.rippleHeight;
  }, [
    settings.shaders.style,
    settings.ocean.deepColor,
    settings.ocean.rippleSpeed,
    settings.ocean.rippleScale,
    settings.ocean.rippleHeight,
  ]);

  // ── Ocean foam / coastline uniforms ──────────────────────────────────────
  useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    const u = (refs.ocean.material as THREE.ShaderMaterial).uniforms;
    u.uShallowColor.value.set(settings.ocean.shallowColor);
    u.uFoamColor.value.set(settings.ocean.foamColor);
    u.uFoamEnabled.value     = settings.ocean.foamEnabled ? 1.0 : 0.0;
    u.uFoamDepth.value       = settings.ocean.foamDepth;
    u.uFoamSoftness.value    = settings.ocean.foamSoftness;
    u.uRippleEnabled.value   = settings.ocean.rippleEnabled ? 1.0 : 0.0;
    u.uRippleWidth.value     = settings.ocean.rippleWidth;
    u.uRippleDistance.value  = settings.ocean.rippleDistance;
  }, [
    settings.ocean.shallowColor,
    settings.ocean.foamColor,
    settings.ocean.foamEnabled,
    settings.ocean.foamDepth,
    settings.ocean.foamSoftness,
    settings.ocean.rippleEnabled,
    settings.ocean.rippleWidth,
    settings.ocean.rippleDistance,
  ]);

  return <div ref={mountRef} className="planet-canvas-mount" />;
};

export default PlanetCanvas;
