import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { WorldState } from './simulation';
import { cellIndex, farmPosition, housePosition, riverBed, riverX, terrainHeight, VegetationSite } from './landscape';

const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
function merge(parts: THREE.BufferGeometry[]) { const expanded = parts.map(p => p.index ? p.toNonIndexed() : p); const geometry = mergeGeometries(expanded); new Set([...parts, ...expanded]).forEach(p => p.dispose()); return geometry!; }
function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(radius * 0.45, radius, d.length(), 7);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray()); return g;
}
function grassGeometry() {
  const positions: number[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4, x = Math.cos(angle) * 0.12, z = Math.sin(angle) * 0.12, h = 0.22 + (i % 3) * 0.1;
    positions.push(x - 0.025, 0, z, x + 0.025, 0, z, x + 0.07, h * 0.6, z + 0.02, x - 0.025, 0, z, x + 0.07, h * 0.6, z + 0.02, x + 0.11, h, z + 0.05);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.computeVertexNormals(); return g;
}
function crownGeometry() {
  // Many small leaf surfaces produce an irregular, open canopy rather than spherical crowns.
  const parts: THREE.BufferGeometry[] = [];
  let seed = 837;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 420; i++) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * 1.1;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const y = 2.1 + random() * 1.35 * Math.sqrt(Math.max(0.05, 1 - radius * radius / 1.3));
    const leaf = new THREE.CircleGeometry(0.15 + random() * 0.08, 5);
    leaf.scale(1.25, 0.6, 1); leaf.rotateX(random() * 2); leaf.rotateY(random() * 6.28); leaf.rotateZ(random() * 6.28);
    leaf.translate(x, y, z); parts.push(leaf);
  }
  return merge(parts);
}

interface SceneState {
  root: THREE.Group; terrain: THREE.Mesh; water: THREE.Mesh; crops: THREE.Group;
  vegetation: { mesh: THREE.InstancedMesh; sites: VegetationSite[]; dynamic: boolean }[];
  camera: THREE.PerspectiveCamera; controls: OrbitControls;
}
function dispose(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
export default function FarmView({ world, selected, onSelect, wireframe = false, resetKey = 0 }: { world: WorldState; selected: number; onSelect: (id: number) => void; wireframe?: boolean; resetKey?: number }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<SceneState | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const [error, setError] = useState(false);
  const landscape = world.landscape;
  useEffect(() => {
    const container = host.current!; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-label', 'Living valley: drag to orbit, scroll to zoom, right-drag to pan, click farm plots to select'); container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#10191d'); scene.fog = new THREE.Fog('#10191d', 48, 105);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200); camera.position.set(32, 31, 40);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(-2, 1, 0); controls.minDistance = 8; controls.maxDistance = 80; controls.maxPolarAngle = Math.PI * 0.48; controls.update();
    scene.add(new THREE.HemisphereLight(0xe3fff9, 0x34464b, 1.7));
    const light = new THREE.DirectionalLight(0xffefd3, 2.4); light.position.set(-18, 30, 12); light.castShadow = true; light.shadow.mapSize.set(2048, 2048); Object.assign(light.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, far: 90 }); light.shadow.bias = -0.001; scene.add(light);
    const root = new THREE.Group(); scene.add(root);
    const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
    const geometry = new THREE.PlaneGeometry(40, 40, 128, 128); geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) position.setY(i, terrainHeight(position.getX(i), position.getZ(i)));
    geometry.computeVertexNormals(); geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
    const terrain = addMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
    const water = addMesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({ color: '#557f7d', roughness: 0.18, metalness: 0.02, transmission: 0.08, transparent: true, opacity: 0.82, side: THREE.DoubleSide })); water.castShadow = false;
    const crops = new THREE.Group(); root.add(crops);
    // Paths follow terrain, excluding plants during world generation.
    const pathMaterial = material('#9b9075');
    const path = (ax: number, az: number, bx: number, bz: number) => {
      const vertices: number[] = [], indices: number[] = [], dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), px = -dz / length * 0.5, pz = dx / length * 0.5;
      for (let i = 0; i <= 40; i++) { const x = ax + dx * i / 40, z = az + dz * i / 40; for (const side of [-1, 1]) vertices.push(x + side * px, terrainHeight(x + side * px, z + side * pz) + 0.035, z + side * pz); if (i < 40) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); addMesh(g, pathMaterial);
    };
    path(-5, 1, -5, 9.5); path(-10, 9.5, riverX(9.5) - 1.8, 9.5);
    // Farmhouse: foundation, plaster walls, pitched roof, rafters, chimney, windows, porch.
    const hx = housePosition.x, hz = housePosition.z, hy = terrainHeight(hx, hz);
    addMesh(new THREE.BoxGeometry(4.4, 0.35, 3.4), material('#77796c'), hx, hy + 0.16, hz);
    addMesh(new THREE.BoxGeometry(4, 2.2, 3), material('#c0b8a0'), hx, hy + 1.35, hz);
    const roofMat = material('#585a50');
    for (const side of [-1, 1]) { const roof = addMesh(new THREE.BoxGeometry(4.65, 0.14, 2.12), roofMat, hx, hy + 2.85, hz + side * 0.85); roof.rotation.x = side * Math.PI / 5; }
    addMesh(new THREE.BoxGeometry(0.55, 2.1, 0.6), material('#807769'), hx + 1.2, hy + 2.8, hz + 0.5);
    const wood = material('#635a46'), glass = material('#455c60');
    addMesh(new THREE.BoxGeometry(0.75, 1.5, 0.06), wood, hx, hy + 1.05, hz + 1.53);
    for (const side of [-1, 1]) { addMesh(new THREE.BoxGeometry(0.85, 0.9, 0.08), wood, hx + side * 1.15, hy + 1.5, hz + 1.54); addMesh(new THREE.BoxGeometry(0.63, 0.69, 0.09), glass, hx + side * 1.15, hy + 1.5, hz + 1.57); }
    addMesh(new THREE.BoxGeometry(3.6, 0.12, 0.9), wood, hx, hy + 0.3, hz + 1.9);
    for (const side of [-1, 1]) addMesh(new THREE.CylinderGeometry(0.065, 0.065, 1.9, 6), wood, hx + side * 1.65, hy + 1.25, hz + 2.2);
    const vegetation: SceneState['vegetation'] = [];
    const instance = (sites: VegetationSite[], g: THREE.BufferGeometry, color: string, dynamic: boolean) => {
      const m = material(color); m.side = THREE.DoubleSide;
      const mesh = new THREE.InstancedMesh(g, m, sites.length); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); vegetation.push({ mesh, sites, dynamic });
    };
    const treeSites = landscape.sites.filter(s => s.kind === 'tree');
    const branches = [branch(new THREE.Vector3(), new THREE.Vector3(0.1, 2.9, 0), 0.14)];
    for (let i = 0; i < 8; i++) { const a = i * 2.4; branches.push(branch(new THREE.Vector3(0, 1 + i * 0.18, 0), new THREE.Vector3(Math.cos(a) * 0.9, 2.1 + i * 0.15, Math.sin(a) * 0.9), 0.06)); }
    instance(treeSites, merge(branches), '#665b46', false); instance(treeSites, crownGeometry(), '#607154', true);
    instance(landscape.sites.filter(s => s.kind === 'grass'), grassGeometry(), '#788361', true);
    const shrub = crownGeometry(); shrub.scale(0.37, 0.25, 0.37); shrub.translate(0, -0.35, 0);
    instance(landscape.sites.filter(s => s.kind === 'shrub'), shrub, '#66795a', true);
    const flowers: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.012, 0.02, 0.35, 4).translate(0, 0.18, 0)];
    for (let i = 0; i < 5; i++) flowers.push(new THREE.SphereGeometry(0.045, 5, 3).scale(1, 0.4, 1).translate(Math.cos(i * 1.257) * 0.06, 0.36, Math.sin(i * 1.257) * 0.06));
    instance(landscape.sites.filter(s => s.kind === 'flower'), merge(flowers), '#c7bc92', true);
    const rock = new THREE.IcosahedronGeometry(0.45, 1); rock.scale(1.4, 0.65, 0.9);
    instance(landscape.sites.filter(s => s.kind === 'rock'), rock, '#8a8d7e', false);
    view.current = { root, terrain, water, crops, vegetation, camera, controls };
    const resize = () => { const r = container.getBoundingClientRect(); renderer.setSize(r.width, r.height); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const raycaster = new THREE.Raycaster(); let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; const r = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); const hit = raycaster.intersectObjects(crops.children, true)[0]; if (hit && typeof hit.object.userData.plotId === 'number') selectRef.current(hit.object.userData.plotId); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => { observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); dispose(root); renderer.dispose(); container.removeChild(renderer.domElement); view.current = null; };
  }, [landscape]);
  useEffect(() => {
    const state = view.current; if (!state) return;
    const positions = state.terrain.geometry.attributes.position, colors = state.terrain.geometry.attributes.color;
    const color = new THREE.Color(), dryGrass = new THREE.Color('#8f916b'), wetGrass = new THREE.Color('#53694b'), richGround = new THREE.Color('#4b523c'), rockColor = new THREE.Color('#77796e'), bankColor = new THREE.Color('#696b58');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), eco = world.ecology.cells[cellIndex(x, z)], land = world.landscape.cells[cellIndex(x, z)];
      const moisture = THREE.MathUtils.clamp(eco.soilMoisture, 0, 1), fertility = THREE.MathUtils.clamp(land.fertility, 0, 1);
      color.copy(dryGrass).lerp(wetGrass, moisture * 0.78).lerp(richGround, fertility * moisture * 0.28);
      const rockBlend = THREE.MathUtils.smoothstep(land.slope, 0.34, 0.72);
      color.lerp(rockColor, rockBlend * 0.78);
      const bankBlend = 1 - THREE.MathUtils.smoothstep(Math.abs(x - riverX(z)), 1.25, 3.1);
      color.lerp(bankColor, bankBlend * (0.38 + moisture * 0.25));
      colors.setXYZ(i, color.r, color.g, color.b);
    } colors.needsUpdate = true;
    const vertices: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 100; i++) {
      const z = i * 0.4 - 20, center = riverX(z), y = riverBed(z) + world.ecology.riverLevel;
      for (const sign of [-1, 1]) { let width = 0.1; while (width < 5 && terrainHeight(center + sign * width, z) < y) width += 0.05; vertices.push(center + sign * width, y + 0.01, z); }
      if (i < 100) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const water = new THREE.BufferGeometry(); water.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); water.setIndex(indices); water.computeVertexNormals(); state.water.geometry.dispose(); state.water.geometry = water;
    const transform = new THREE.Object3D();
    state.vegetation.forEach(({ mesh, sites, dynamic }) => {
      sites.forEach((site, i) => { const c = world.ecology.cells[site.cell]; transform.position.set(site.x, terrainHeight(site.x, site.z), site.z); transform.rotation.set(0, site.rotation, 0); const vigor = dynamic ? 0.7 + c.biomass * 0.3 : 1; transform.scale.setScalar(site.scale * vigor); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); color.set(dynamic ? '#8c805a' : '#ffffff'); if (dynamic) color.lerp(new THREE.Color('#c0cfab'), c.vegetationHealth); mesh.setColorAt(i, color); }); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere();
    });
    dispose(state.crops); state.crops.clear();
    world.plots.forEach(plot => {
      const p = farmPosition(plot.id), height = terrainHeight(p.x, p.z), moisture = plot.waterMm / world.parameters.soilCapacityMm;
      const soil = material('#88704f'); soil.color.lerp(new THREE.Color('#3e3427'), moisture); if (plot.id === selected) soil.emissive.set('#12312d');
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 1.85), soil); bed.position.set(p.x, height + 0.03, p.z); bed.userData.plotId = plot.id; bed.receiveShadow = true; state.crops.add(bed);
      if (!plot.crop) return;
      const leaf = grassGeometry(), leafMat = material(plot.crop.health > 0 ? '#547948' : '#80704b'); leafMat.side = THREE.DoubleSide;
      for (let n = 0; n < 9; n++) { const x = p.x + (n % 3 - 1) * 0.48, z = p.z + (Math.floor(n / 3) - 1) * 0.48; const mesh = new THREE.Mesh(leaf, leafMat); mesh.position.set(x, height + 0.09, z); mesh.scale.setScalar(0.4 + plot.crop.growth * 1.3); mesh.rotation.y = n * 2.4; mesh.userData.plotId = plot.id; mesh.castShadow = true; state.crops.add(mesh); if (plot.crop.growth >= 1 && plot.crop.health > 0) { const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 5), material('#a34e42')); fruit.position.set(x + 0.08, height + 0.22, z); fruit.userData.plotId = plot.id; state.crops.add(fruit); } }
    });
  }, [world, selected]);
  useEffect(() => { if (view.current) (view.current.terrain.material as THREE.MeshStandardMaterial).wireframe = wireframe; }, [wireframe, landscape]);
  useEffect(() => { if (view.current) { view.current.camera.position.set(32, 31, 40); view.current.controls.target.set(-2, 1, 0); view.current.controls.update(); } }, [resetKey]);
  return <div className="noise-viewport" ref={host}>{error && <p className="noise-webgl-error">WebGL is unavailable. World-state diagnostics and daily controls remain available.</p>}</div>;
}
