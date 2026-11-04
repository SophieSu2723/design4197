import * as THREE from 'three';
import type { WorldState } from '../simulation';
import { developmentOf, bridgeOpen, shopOpen, shopPosition, plantKey } from '../development';
import { terrainHeight, riverX } from '../landscape';
import { walkingHeight } from '../population';

function sign(root: THREE.Group, title: string, subtitle: string, x: number, y: number, z: number, warning = false) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 128;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = warning ? '#44251fee' : '#18332aee'; ctx.fillRect(0, 0, 640, 128);
  ctx.textAlign = 'center'; ctx.fillStyle = warning ? '#ffd1a6' : '#e2d4a8'; ctx.font = '600 36px sans-serif'; ctx.fillText(title, 320, 50);
  ctx.fillStyle = '#e1e4d9'; ctx.font = '26px sans-serif'; ctx.fillText(subtitle, 320, 94);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.position.set(x, y, z); sprite.scale.set(8, 1.6, 1); sprite.renderOrder = 16; root.add(sprite);
}
export function drawDevelopment(root: THREE.Group, world: WorldState) {
  const d = developmentOf(world);
  const box = (w: number, h: number, depth: number, x: number, y: number, z: number, color: string) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  if (!bridgeOpen(world)) {
    for (const side of [-1, 1]) {
      const x = riverX(9.5) + side * 4.7, y = walkingHeight({ x, z: 9.5 });
      box(0.15, 1, 1.7, x, y + 0.55, 9.5, '#ae6046');
      for (const z of [8.9, 10.1]) box(0.18, 1.2, 0.18, x, y + 0.6, z, '#e2c09a');
    }
    sign(root, 'BRIDGE CLOSED', d.bridgeIntegrity < 0.55 ? 'Storm damage · waiting for repairs' : 'High water · waiting to recede', riverX(9.5), 4, 9.5, true);
  }
  if (d.shop.requested) {
    const { x, z } = shopPosition, y = terrainHeight(x, z), built = d.shop.work >= 2;
    box(4, 0.3, 4, x, y + 0.15, z, '#8c8166');
    for (const dx of [-1.65, 1.65]) for (const dz of [-1.65, 1.65]) box(0.16, d.shop.work ? 2.5 : 0.8, 0.16, x + dx, y + (d.shop.work ? 1.4 : 0.5), z + dz, '#a08a65');
    if (d.shop.work >= 1) {
      box(3.5, 0.18, 0.2, x, y + 2.65, z - 1.65, '#a08a65');
      box(3.5, 0.18, 0.2, x, y + 2.65, z + 1.65, '#a08a65');
    }
    if (built) {
      box(3.4, 2.3, 0.18, x, y + 1.4, z - 1.65, '#c5b48c');
      for (const dx of [-1.65, 1.65]) box(0.18, 2.3, 3.4, x + dx, y + 1.4, z, '#c5b48c');
      const roof = box(4.2, 0.25, 4.4, x, y + 2.8, z, d.shop.integrity < 0.55 ? '#705945' : '#66837c');
      roof.rotation.z = (1 - d.shop.integrity) * 0.22;
      box(3, 1, 0.6, x, y + 0.8, z + 1.1, '#967652');
      for (let i = 0; i < Math.ceil(d.shop.stock / 2); i++) box(0.35, 0.3, 0.35, x - 1 + (i % 4) * 0.6, y + 1.45 + Math.floor(i / 4) * 0.32, z + 1, '#b88e4e');
      if (d.shop.integrity < 0.55) for (let i = 0; i < 4; i++) { const debris = box(1.1, 0.1, 0.2, x + 2.2, terrainHeight(x + 2.2, z + i * 0.4) + 0.2, z + i * 0.4, '#80634b'); debris.rotation.y = i; }
    }
    const title = !built ? 'SHOP · UNDER CONSTRUCTION' : shopOpen(world) ? 'COMMUNITY SHOP · OPEN' : 'COMMUNITY SHOP · CLOSED';
    const subtitle = d.shop.integrity < 1 ? `${Math.round(d.shop.integrity * 100)}% integrity · repairs needed` : !built ? `${d.shop.work}/2 completed work visits` : `${d.shop.stock.toFixed(0)} food in stock · ${d.shop.served} meals served`;
    sign(root, title, subtitle, x, y + 4.4, z, d.shop.integrity < 0.55);
  } else if (d.expanded) {
    sign(root, 'COMMUNITY SHOP SITE', 'Commission in the sidebar', shopPosition.x, terrainHeight(shopPosition.x, shopPosition.z) + 1.5, shopPosition.z);
  }
  for (const site of world.landscape.sites) {
    const damage = d.plantDamage[plantKey(site)];
    if (!damage?.fallen || damage.recovery <= 0.05) continue;
    const x = site.x - 0.5, z = site.z + 0.5, y = terrainHeight(x, z), scale = 0.3 + damage.recovery * 0.6;
    box(0.08, scale, 0.08, x, y + scale / 2, z, '#7e7350');
    const crown = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.4, scale, 6), new THREE.MeshStandardMaterial({ color: '#82a26c' }));
    crown.position.set(x, y + scale, z); root.add(crown);
  }
}
