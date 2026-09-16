import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ChunkMesh } from '../utils/voxel';

interface ViewState {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
  surface: THREE.Group; bounds: THREE.Group; material: THREE.MeshStandardMaterial;
}
function clearGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    const object = child as THREE.Mesh;
    object.geometry.dispose();
    if (object instanceof THREE.LineSegments) (object.material as THREE.Material).dispose();
    group.remove(child);
  }
}
export default function VoxelView({ meshes, worldSize, resolution, wireframe, showChunks, resetKey }: {
  meshes: ChunkMesh[]; worldSize: number; resolution: number; wireframe: boolean; showChunks: boolean; resetKey: number;
}) {
  const host = useRef<HTMLDivElement>(null), state = useRef<ViewState | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D voxel terrain; drag to orbit and scroll to zoom');
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#10191d');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(24, 18, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.minDistance = 3; controls.maxDistance = 85;
    scene.add(new THREE.HemisphereLight(0xe3fff9, 0x26363f, 2.7));
    const light = new THREE.DirectionalLight(0xfff1d6, 3); light.position.set(-10, 18, 10); scene.add(light);
    const fill = new THREE.DirectionalLight(0x81b8dd, 1); fill.position.set(8, -3, -8); scene.add(fill);
    const surface = new THREE.Group(), bounds = new THREE.Group(); scene.add(surface, bounds);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const grid = new THREE.GridHelper(32, 32, 0x37545c, 0x23383f); grid.position.y = -8.1; scene.add(grid);
    state.current = { scene, camera, controls, surface, bounds, material };
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); clearGroup(surface); clearGroup(bounds);
      material.dispose(); grid.geometry.dispose(); (grid.material as THREE.Material).dispose();
      renderer.dispose(); container.removeChild(renderer.domElement); state.current = null;
    };
  }, []);
  useEffect(() => {
    const view = state.current; if (!view) return;
    // Retain GPU geometry for chunks whose CPU mesh object was reused.
    const previous = new Map(view.surface.children.map(child => [child.userData.source as ChunkMesh, child]));
    const retained = new Set(meshes);
    for (const [source, child] of Array.from(previous.entries())) {
      if (!retained.has(source)) { (child as THREE.Mesh).geometry.dispose(); view.surface.remove(child); }
    }
    const low = new THREE.Color('#245b61'), high = new THREE.Color('#b7d8a8');
    for (const data of meshes) {
      if (!data.indices.length || previous.has(data)) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const colors = new Float32Array(data.positions.length), color = new THREE.Color();
      for (let i = 0; i < data.positions.length; i += 3) {
        const t = THREE.MathUtils.clamp((data.positions[i + 1] + worldSize * 0.4) / (worldSize * 0.65), 0, 1);
        color.copy(low).lerp(high, t); colors.set([color.r, color.g, color.b], i);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, view.material); mesh.userData.source = data; view.surface.add(mesh);
    }
    clearGroup(view.bounds);
    const step = worldSize / resolution;
    for (const { chunk } of meshes) {
      const min = new THREE.Vector3(...chunk.origin.map(v => v * step - worldSize / 2) as [number, number, number]);
      const max = min.clone().add(new THREE.Vector3(...chunk.cells).multiplyScalar(step));
      const box = new THREE.Box3Helper(new THREE.Box3(min, max), 0x62bbac);
      (box.material as THREE.LineBasicMaterial).transparent = true; (box.material as THREE.LineBasicMaterial).opacity = 0.24;
      view.bounds.add(box);
    }
  }, [meshes, worldSize, resolution]);
  useEffect(() => { if (state.current) state.current.material.wireframe = wireframe; }, [wireframe]);
  useEffect(() => { if (state.current) state.current.bounds.visible = showChunks; }, [showChunks]);
  useEffect(() => {
    if (!state.current) return;
    state.current.camera.position.set(24, 18, 26); state.current.controls.target.set(0, 0, 0); state.current.controls.update();
  }, [resetKey]);
  return <div className="noise-viewport" ref={host}>{error && <p className="noise-webgl-error">WebGL is unavailable. Enable hardware acceleration for the 3D view. Density controls and mesh statistics still work.</p>}</div>;
}
