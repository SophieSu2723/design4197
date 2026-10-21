import * as THREE from 'three';
import { riverBed, riverX, terrainHeight } from '../landscape';

export function createWaterMesh() {
  const water = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#497a7c', roughness: 0.28, metalness: 0.25, transparent: true, opacity: 0.84, side: THREE.DoubleSide }));
  water.castShadow = false;
  water.receiveShadow = true;
  return water;
}

export function updateRiverSurface(water: THREE.Mesh, riverLevel: number) {
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 100; i++) {
    const z = i * 0.4 - 20, center = riverX(z), y = riverBed(z) + riverLevel;
    for (const sign of [-1, 1]) {
      let width = 0.1;
      while (width < 5 && terrainHeight(center + sign * width, z) < y) width += 0.05;
      vertices.push(center + sign * width, y + 0.01, z);
    }
    if (i < 100) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  water.geometry.dispose();
  water.geometry = geometry;
}
