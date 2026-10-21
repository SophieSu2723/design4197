import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { WorldState } from './simulation';

export default function FarmView({ world, selected, onSelect }: { world: WorldState; selected: number; onSelect: (id: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Group | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#172126');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.set(9, 10, 11);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(0, 0, 0); controls.update();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(5, 10, 6); scene.add(light);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(10, 0.15, 10), new THREE.MeshStandardMaterial({ color: '#465b3c' })); ground.position.y = -0.3; scene.add(ground);
    const plots = new THREE.Group(); scene.add(plots); sceneRef.current = plots;
    const resize = () => { const { width, height } = container.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObjects(plots.children, true)[0];
      if (hit && typeof hit.object.userData.plotId === 'number') selectRef.current(hit.object.userData.plotId);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pointerUp);
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
      renderer.dispose(); container.removeChild(renderer.domElement); sceneRef.current = null;
    };
  }, []);
  useEffect(() => {
    const group = sceneRef.current; if (!group) return;
    for (const object of [...group.children]) { const mesh = object as THREE.Mesh; mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); group.remove(mesh); }
    world.plots.forEach(plot => {
      const x = (plot.id % 3 - 1) * 2.3, z = (Math.floor(plot.id / 3) - 1) * 2.3;
      const moisture = plot.waterMm / world.parameters.soilCapacityMm;
      const soil = new THREE.Color('#b79569').lerp(new THREE.Color('#382c23'), moisture);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.22, 2), new THREE.MeshStandardMaterial({ color: soil, emissive: plot.id === selected ? '#164a47' : '#000000' }));
      bed.position.set(x, 0, z); bed.userData.plotId = plot.id; group.add(bed);
      if (plot.crop) {
        const h = 0.12 + plot.crop.growth * 1.2;
        const crop = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), new THREE.MeshStandardMaterial({ color: plot.crop.health <= 0 ? '#6c4e38' : plot.crop.growth >= 1 ? '#d86563' : new THREE.Color('#a38a38').lerp(new THREE.Color('#4ca65d'), plot.crop.health) }));
        crop.position.set(x, 0.12 + h / 2, z); crop.userData.plotId = plot.id; group.add(crop);
      }
    });
  }, [world, selected]);
  return <div className="farm-view" ref={host} aria-label="Placeholder 3D farm">{error && <p>WebGL is unavailable. Use the plot selector and daily table to inspect the simulation.</p>}</div>;
}
