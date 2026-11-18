import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
import type { Ecology, WorldState } from '../simulation';
import { Landscape, terrainHeight, VegetationSite } from '../landscape';
import { footprintKey } from '../trails';
import { Development, plantKey, shopPosition } from '../development';

export interface VegetationRenderEntry {
  mesh: THREE.InstancedMesh;
  sites: VegetationSite[];
  dynamic: boolean;
  windBases?: THREE.Matrix4[];
  fallen?: boolean[];
}

const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });

function merge(parts: THREE.BufferGeometry[]) {
  const expanded = parts.map(part => part.index ? part.toNonIndexed() : part);
  const geometry = mergeGeometries(expanded);
  new Set([...parts, ...expanded]).forEach(part => part.dispose());
  return geometry!;
}

function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const d = b.clone().sub(a), geometry = new THREE.CylinderGeometry(radius * 0.45, radius, d.length(), 7);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
  return geometry;
}

export function grassGeometry() {
  const positions: number[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4, x = Math.cos(angle) * 0.12, z = Math.sin(angle) * 0.12, h = 0.22 + (i % 3) * 0.1;
    positions.push(x - 0.025, 0, z, x + 0.025, 0, z, x + 0.07, h * 0.6, z + 0.02, x - 0.025, 0, z, x + 0.07, h * 0.6, z + 0.02, x + 0.11, h, z + 0.05);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
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

export function createVegetation(landscape: Landscape, root: THREE.Group): VegetationRenderEntry[] {
  const vegetation: VegetationRenderEntry[] = [];
  const instance = (sites: VegetationSite[], geometry: THREE.BufferGeometry, color: string, dynamic: boolean) => {
    const surface = material(color); surface.side = THREE.DoubleSide;
    const mesh = new THREE.InstancedMesh(geometry, surface, sites.length);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    vegetation.push({ mesh, sites, dynamic });
  };
  const treeSites = landscape.sites.filter(site => site.kind === 'tree');
  const branches = [branch(new THREE.Vector3(), new THREE.Vector3(0.1, 2.9, 0), 0.14)];
  for (let i = 0; i < 8; i++) { const angle = i * 2.4; branches.push(branch(new THREE.Vector3(0, 1 + i * 0.18, 0), new THREE.Vector3(Math.cos(angle) * 0.9, 2.1 + i * 0.15, Math.sin(angle) * 0.9), 0.06)); }
  instance(treeSites, merge(branches), '#665b46', false);
  instance(treeSites, crownGeometry(), '#607154', true);
  instance(landscape.sites.filter(site => site.kind === 'grass'), grassGeometry(), '#788361', true);
  const shrub = crownGeometry(); shrub.scale(0.37, 0.25, 0.37); shrub.translate(0, -0.35, 0);
  instance(landscape.sites.filter(site => site.kind === 'shrub'), shrub, '#66795a', true);
  const flowers: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.012, 0.02, 0.35, 4).translate(0, 0.18, 0)];
  for (let i = 0; i < 5; i++) flowers.push(new THREE.SphereGeometry(0.045, 5, 3).scale(1, 0.4, 1).translate(Math.cos(i * 1.257) * 0.06, 0.36, Math.sin(i * 1.257) * 0.06));
  instance(landscape.sites.filter(site => site.kind === 'flower'), merge(flowers), '#c7bc92', true);
  const rock = new THREE.IcosahedronGeometry(0.45, 1); rock.scale(1.4, 0.65, 0.9);
  instance(landscape.sites.filter(site => site.kind === 'rock'), rock, '#8a8d7e', false);
  return vegetation;
}

export function updateVegetation(vegetation: VegetationRenderEntry[], ecology: Ecology, settlement: WorldState['population']['settlement'], footprint = new Map<string, number>(), development?: Development) {
  const transform = new THREE.Object3D(), color = new THREE.Color();
  vegetation.forEach(entry => {
    const { mesh, sites, dynamic } = entry;
    const trees = sites[0]?.kind === 'tree';
    if (trees) { entry.windBases = []; entry.fallen = []; }
    sites.forEach((site, i) => {
      const cell = ecology.cells[site.cell];
      transform.position.set(site.x, terrainHeight(site.x, site.z), site.z);
      transform.rotation.set(0, site.rotation, 0);
      const damage = development?.plantDamage[plantKey(site)];
      if (damage?.fallen) transform.rotation.z = 1.25;
      const vigor = dynamic ? 0.7 + cell.biomass * 0.3 : 1;
      const newGrowth = site.latent ? ecology.growthSites[plantKey(site)] ?? 0 : 1;
      const occupied = (settlement && Math.abs(site.x - settlement.position.x) < 2.1 && Math.abs(site.z - settlement.position.z) < 2.1) || (development?.shop.requested && Math.abs(site.x - shopPosition.x) < 2.6 && Math.abs(site.z - shopPosition.z) < 2.6);
      const wear = site.kind === 'grass' || site.kind === 'flower' ? footprint.get(footprintKey(site.x, site.z)) ?? 0 : 0;
      // New patches begin as small shoots, then become fuller than the scattered background.
      const growthScale = site.latent ? (newGrowth > 0 ? 0.35 + newGrowth * 1.65 : 0) : 1;
      transform.scale.setScalar(occupied ? 0 : site.scale * vigor * growthScale);
      transform.scale.y *= 1 - wear * 0.8;
      if (dynamic && damage && !damage.fallen) transform.scale.y *= 1 - damage.damage * 0.25;
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
      if (trees) { entry.windBases!.push(transform.matrix.clone()); entry.fallen!.push(!!damage?.fallen); }
      color.set(dynamic ? '#8c805a' : '#ffffff');
      if (dynamic) color.lerp(new THREE.Color('#c0cfab'), cell.vegetationHealth);
      if (wear > 0) color.lerp(new THREE.Color('#9c8560'), wear * 0.65);
      if (damage) color.lerp(new THREE.Color('#806247'), damage.fallen ? 0.85 : damage.damage * 0.8);
      if (site.latent && newGrowth > 0) color.set(site.kind === 'flower' ? '#e8d38e' : '#a8d17b');
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
}

const windRotation = new THREE.Matrix4(), windMatrix = new THREE.Matrix4();
export function animateVegetation(vegetation: VegetationRenderEntry[], windKph: number, time: number) {
  vegetation.forEach(entry => {
    if (!entry.windBases) return;
    entry.windBases.forEach((base, i) => {
      const bend = entry.fallen?.[i] ? 0 : (windKph / 120) * (0.08 + Math.sin(time * 3 + entry.sites[i].x) * 0.045);
      windRotation.makeRotationZ(-bend); windMatrix.multiplyMatrices(base, windRotation); entry.mesh.setMatrixAt(i, windMatrix);
    });
    entry.mesh.instanceMatrix.needsUpdate = true;
  });
}
