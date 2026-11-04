import * as THREE from 'three';
import { easternPlaces } from '../places';
import { terrainHeight, riverX } from '../landscape';
import { walkingHeight, bridgeZ } from '../population';
import { Trails } from '../trails';

export function createLandmarks(root: THREE.Group, expanded = false) {
  const entries = easternPlaces.filter(p => expanded || !p.extension).map(place => {
    const group = new THREE.Group(); group.position.set(place.position.x, terrainHeight(place.position.x, place.position.z), place.position.z);
    const stone = new THREE.MeshStandardMaterial({ color: place.id === 'ruins' ? '#b6a58a' : '#889979', roughness: 1 });
    // An open ring keeps the destination accessible; no enclosed collision geometry.
    for (let i = 0; i < (place.id === 'ruins' ? 9 : 5); i++) {
      const angle = i * 2.4, radius = place.id === 'ruins' ? 1.5 : 1.3;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, place.id === 'ruins' ? 0.35 + (i % 3) * 0.2 : 0.16, 0.35), stone);
      mesh.position.set(x, terrainHeight(place.position.x + x, place.position.z + z) - group.position.y + 0.16, z); mesh.rotation.y = angle; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 32), new THREE.MeshBasicMaterial({ color: place.color, side: THREE.DoubleSide, transparent: true, opacity: 0.35 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; group.add(ring);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    label.position.y = 2.9; label.scale.set(6.4, 1.4, 1); label.renderOrder = 15; group.add(label); root.add(group);
    return { place, canvas, texture, ring, previous: '' };
  });
  return entries;
}
export type LandmarkEntries = ReturnType<typeof createLandmarks>;
export function updateLandmarks(entries: LandmarkEntries, su: boolean[], mina: boolean[]) {
  entries.forEach((entry, i) => {
    const subtitle = su[i] && mina[i] ? 'Remembered by Su & Mina' : su[i] ? 'Discovered by Su' : mina[i] ? 'Discovered by Mina' : 'Not visited yet';
    if (entry.previous === subtitle) return;
    const ctx = entry.canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, 512, 112); ctx.fillStyle = '#12221ded'; ctx.fillRect(0, 0, 512, 112);
    ctx.textAlign = 'center'; ctx.fillStyle = entry.place.color; ctx.font = '500 32px sans-serif'; ctx.fillText(entry.place.name, 256, 43);
    ctx.fillStyle = '#d5ddd6'; ctx.font = '24px sans-serif'; ctx.fillText(subtitle, 256, 84);
    entry.texture.needsUpdate = true; entry.previous = subtitle;
    (entry.ring.material as THREE.MeshBasicMaterial).opacity = su[i] || mina[i] ? 0.9 : 0.35;
  });
}

export function updateWalkedPaths(mesh: THREE.Mesh, trails: Trails) {
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  Object.values(trails).forEach(({ a, b, wear }) => {
    // Footsteps on the timber bridge are counted, but do not expose soil.
    if (Math.abs((a.z + b.z) / 2 - bridgeZ) < 0.8 && Math.abs((a.x + b.x) / 2 - riverX(bridgeZ)) < 5) return;
    const length = Math.hypot(b.x - a.x, b.z - a.z); if (length < 0.02) return;
    const half = 0.08 + wear * 0.24, px = -(b.z - a.z) / length * half, pz = (b.x - a.x) / length * half;
    const color = new THREE.Color('#657253').lerp(new THREE.Color('#c4a476'), wear), start = vertices.length / 3;
    for (let j = 0; j <= 4; j++) {
      const x = a.x + (b.x - a.x) * j / 4, z = a.z + (b.z - a.z) * j / 4;
      for (const side of [-1, 1]) { const q = { x: x + side * px, z: z + side * pz }; vertices.push(q.x, walkingHeight(q) + 0.055, q.z); colors.push(color.r, color.g, color.b); }
      if (j < 4) { const k = start + j * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  mesh.geometry.dispose(); mesh.geometry = geometry;
}
