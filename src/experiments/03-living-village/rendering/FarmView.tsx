import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { WorldState } from '../simulation';
import { Point, walkingHeight, bridgeZ } from '../population';
import { farmPosition, housePosition, riverX, terrainHeight } from '../landscape';
import { createTerrainMesh, updateTerrainColors } from './terrain';
import { createWaterMesh, updateRiverSurface } from './water';
import { createVegetation, grassGeometry, updateVegetation, VegetationRenderEntry } from './vegetation';

const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
interface SceneState {
  root: THREE.Group; people: THREE.Group; bakery: THREE.Group; terrain: THREE.Mesh; water: THREE.Mesh; crops: THREE.Group;
  vegetation: VegetationRenderEntry[];
  camera: THREE.PerspectiveCamera; controls: OrbitControls;
}
function dispose(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => { if (object instanceof THREE.Sprite) { object.material.map?.dispose(); materials.add(object.material); } if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
export default function FarmView({ world, selected, onSelect, wireframe = false, resetKey = 0, onPlace }: { world: WorldState; selected: number; onSelect: (id: number) => void; wireframe?: boolean; resetKey?: number; onPlace?: (point: Point) => void }) {
  const host = useRef<HTMLDivElement>(null), view = useRef<SceneState | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const placementRef = useRef({ active: world.population.placementMode, onPlace }); placementRef.current = { active: world.population.placementMode, onPlace };
  const settlement = world.population.settlement;
  const [error, setError] = useState(false);
  const landscape = world.landscape;
  useEffect(() => {
    const container = host.current!; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', 'Living valley: drag to orbit, scroll to zoom, right-drag to pan, click farm plots to select'); container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#10191d'); scene.fog = new THREE.Fog('#10191d', 48, 105);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200); camera.position.set(32, 31, 40);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(-2, 1, 0); controls.minDistance = 8; controls.maxDistance = 80; controls.maxPolarAngle = Math.PI * 0.48; controls.update();
    scene.add(new THREE.HemisphereLight(0xe3fff9, 0x34464b, 1.7));
    const light = new THREE.DirectionalLight(0xffefd3, 2.4); light.position.set(-18, 30, 12); light.castShadow = true; light.shadow.mapSize.set(2048, 2048); Object.assign(light.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, far: 90 }); light.shadow.bias = -0.001; scene.add(light);
    const root = new THREE.Group(); scene.add(root);
    const addMesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
    const terrain = createTerrainMesh(); root.add(terrain);
    const water = createWaterMesh(); root.add(water);
    const crops = new THREE.Group(), people = new THREE.Group(), bakery = new THREE.Group(); root.add(crops, people, bakery);
    // Paths follow terrain, excluding plants during world generation.
    const pathMaterial = material('#9b9075');
    const path = (ax: number, az: number, bx: number, bz: number) => {
      const vertices: number[] = [], indices: number[] = [], dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz), px = -dz / length * 0.5, pz = dx / length * 0.5;
      for (let i = 0; i <= 40; i++) { const x = ax + dx * i / 40, z = az + dz * i / 40; for (const side of [-1, 1]) vertices.push(x + side * px, terrainHeight(x + side * px, z + side * pz) + 0.035, z + side * pz); if (i < 40) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals(); addMesh(g, pathMaterial);
    };
    path(-5, 1, -5, 9.5); path(-10, 9.5, riverX(9.5) - 5, 9.5); path(riverX(9.5) + 5, 9.5, 19.5, 9.5);
    const bridgeWood = material('#7d715b');
    for (let x = riverX(bridgeZ) - 5; x < riverX(bridgeZ) + 5; x += 0.35) {
      addMesh(new THREE.BoxGeometry(0.33, 0.16, 1.4), bridgeWood, x, walkingHeight({ x, z: bridgeZ }) - 0.08, bridgeZ);
    }
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
    const vegetation = createVegetation(landscape, root);
    view.current = { root, terrain, water, crops, people, bakery, vegetation, camera, controls };
    const resize = () => { const r = container.getBoundingClientRect(); renderer.setSize(r.width, r.height); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const raycaster = new THREE.Raycaster(); let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; const r = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); if (placementRef.current.active) { const ground = raycaster.intersectObject(terrain)[0]; if (ground) placementRef.current.onPlace?.({ x: ground.point.x, z: ground.point.z }); return; } const hit = raycaster.intersectObjects(crops.children, true)[0]; if (hit && typeof hit.object.userData.plotId === 'number') selectRef.current(hit.object.userData.plotId); };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => { observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp); dispose(root); renderer.dispose(); container.removeChild(renderer.domElement); view.current = null; };
  }, [landscape]);
  useEffect(() => {
    const state = view.current; if (!state) return;
    updateTerrainColors(state.terrain, world.ecology, world.landscape);
    updateRiverSurface(state.water, world.ecology.riverLevel);
    updateVegetation(state.vegetation, world.ecology, settlement);
    dispose(state.crops); state.crops.clear();
    world.plots.forEach(plot => {
      const p = farmPosition(plot.id), height = terrainHeight(p.x, p.z), moisture = plot.waterMm / world.parameters.soilCapacityMm;
      const soil = material('#88704f'); soil.color.lerp(new THREE.Color('#3e3427'), moisture); if (plot.id === selected) soil.emissive.set('#12312d');
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 1.85), soil); bed.position.set(p.x, height + 0.03, p.z); bed.userData.plotId = plot.id; bed.receiveShadow = true; state.crops.add(bed);
      if (!plot.crop) return;
      const leaf = grassGeometry(), leafMat = material(plot.crop.health > 0 ? '#547948' : '#80704b'); leafMat.side = THREE.DoubleSide;
      for (let n = 0; n < 9; n++) { const x = p.x + (n % 3 - 1) * 0.48, z = p.z + (Math.floor(n / 3) - 1) * 0.48; const mesh = new THREE.Mesh(leaf, leafMat); mesh.position.set(x, height + 0.09, z); mesh.scale.setScalar(0.4 + plot.crop.growth * 1.3); mesh.rotation.y = n * 2.4; mesh.userData.plotId = plot.id; mesh.castShadow = true; state.crops.add(mesh); if (plot.crop.growth >= 1 && plot.crop.health > 0) { const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.065, 7, 5), material('#a34e42')); fruit.position.set(x + 0.08, height + 0.22, z); fruit.userData.plotId = plot.id; state.crops.add(fruit); } }
    });
  }, [world.ecology, world.plots, world.parameters, world.landscape, selected, settlement]);
  useEffect(() => {
    const state = view.current; if (!state) return;
    const people = [world.population.su, ...(world.population.mina ? [world.population.mina] : [])];
    for (const old of [...state.people.children]) if (!people.some(p => p.id === old.name)) { dispose(old); state.people.remove(old); }
    people.forEach(person => {
      let actor = state.people.getObjectByName(person.id) as THREE.Group | undefined;
      if (!actor) {
        actor = new THREE.Group(); actor.name = person.id;
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 8), material(person.id === 'su' ? '#769d91' : '#b19b72')); body.position.y = 0.55; body.castShadow = true; actor.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), material('#c7ad91')); head.position.y = 1; actor.add(head);
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.07, 12), material(person.id === 'su' ? '#aa9c70' : '#d3cabb')); hat.position.y = 1.12; actor.add(hat);
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 48;
        const ctx = canvas.getContext('2d'); if (ctx) { ctx.fillStyle = '#0e171bdd'; ctx.fillRect(0, 0, 128, 48); ctx.font = '22px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#d8e1df'; ctx.fillText(person.name, 64, 32); }
        const texture = new THREE.CanvasTexture(canvas), label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })); label.position.y = 1.65; label.scale.set(1.25, 0.47, 1); actor.add(label); state.people.add(actor);
      }
      actor.position.set(person.position.x, walkingHeight(person.position), person.position.z);
      const next = person.route[0]; if (next) actor.rotation.y = Math.atan2(next.x - person.position.x, next.z - person.position.z);
    });
  }, [world.population, landscape]);
  useEffect(() => {
    const state = view.current; if (!state) return; dispose(state.bakery); state.bakery.clear();
    if (!settlement) return;
    const { x, z } = settlement.position, y = terrainHeight(x, z);
    const add = (g: THREE.BufferGeometry, color: string, dx: number, dy: number, dz: number) => { const mesh = new THREE.Mesh(g, material(color)); mesh.position.set(x + dx, y + dy, z + dz); mesh.castShadow = true; mesh.receiveShadow = true; state.bakery.add(mesh); return mesh; };
    add(new THREE.BoxGeometry(3, 0.6, 3), '#7a786d', 0, 0.1, 0);
    add(new THREE.BoxGeometry(2.7, 1.9, 2.7), '#c2b89c', 0, 1.2, 0);
    for (const sign of [-1, 1]) { const roof = add(new THREE.BoxGeometry(3.15, 0.15, 1.85), '#6d6655', 0, 2.5, sign * 0.72); roof.rotation.x = sign * Math.PI / 5; }
    add(new THREE.BoxGeometry(0.65, 1.3, 0.08), '#665542', 0, 0.95, 1.38);
    add(new THREE.BoxGeometry(0.7, 0.6, 0.1), '#627a78', 0.85, 1.3, 1.38);
    add(new THREE.BoxGeometry(0.5, 1.5, 0.5), '#80776a', -0.7, 2.5, -0.5);
    add(new THREE.BoxGeometry(2.2, 0.15, 0.75), '#8c7b5e', 0, 0.35, 1.7);
  }, [settlement, landscape]);
  useEffect(() => { if (view.current) (view.current.terrain.material as THREE.MeshStandardMaterial).wireframe = wireframe; }, [wireframe, landscape]);
  useEffect(() => { if (view.current) { view.current.camera.position.set(32, 31, 40); view.current.controls.target.set(-2, 1, 0); view.current.controls.update(); } }, [resetKey]);
  return <div className="noise-viewport" style={{ cursor: world.population.placementMode ? 'crosshair' : undefined }} ref={host}>{error && <p className="noise-webgl-error">WebGL is unavailable. World-state diagnostics and daily controls remain available.</p>}</div>;
}
