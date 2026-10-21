import * as THREE from 'three';
import type { Ecology } from '../simulation';
import type { Landscape } from '../landscape';
import { cellIndex, riverX, terrainHeight } from '../landscape';

export function createTerrainMesh() {
  const geometry = new THREE.PlaneGeometry(40, 40, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setY(i, terrainHeight(position.getX(i), position.getZ(i)));
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(position.count * 3), 3));
  const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  return terrain;
}

export function updateTerrainColors(terrain: THREE.Mesh, ecology: Ecology, landscape: Landscape) {
  const positions = terrain.geometry.attributes.position;
  const colors = terrain.geometry.attributes.color;
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), cell = ecology.cells[cellIndex(x, z)];
    color.set('#8c916b').lerp(new THREE.Color('#455b43'), cell.soilMoisture);
    const slope = landscape.cells[cellIndex(x, z)].slope;
    if (slope > 0.45) color.lerp(new THREE.Color('#858575'), Math.min(0.8, slope));
    if (Math.abs(x - riverX(z)) < 2) color.lerp(new THREE.Color('#727465'), 0.7);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
}
