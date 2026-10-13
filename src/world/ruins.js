// The Overgrown Observatory: a colonial star-gazing dome swallowed by ivy on a
// high shoulder of the northern range, ringed by fallen houses. Its rooftop
// terrace has an iron railing and a view across the island. Everything is
// vine-draped and the roofs are open to the sky, in the spirit of a lost city.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from './terrain.js';
import { plaster } from '../core/textures.js';

// Glass ribs between sheets of ivy: the dome's skin.
function domeTexture() {
  return canvasTexture(1024, 512, (c, w, h) => {
    const rnd = mulberry32(61);
    c.fillStyle = '#4c5a50'; c.fillRect(0, 0, w, h);
    // Glass panels between stone ribs.
    const ribs = 12;
    for (let i = 0; i < ribs; i++) {
      const x = (i / ribs) * w, pw = w / ribs;
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7fa8b8'); g.addColorStop(1, '#46707e');
      c.fillStyle = g; c.fillRect(x + 8, 24, pw - 16, h - 60);
      c.fillStyle = '#8a8c84'; c.fillRect(x - 3, 0, 6, h);
      for (let k = 1; k < 7; k++) { c.fillStyle = 'rgba(40,50,48,0.7)'; c.fillRect(x + 8, 24 + k * (h - 60) / 7, pw - 16, 2); }
    }
    // Ivy: thousands of overlapping leaves, thickest low on the dome.
    for (let i = 0; i < 9000; i++) {
      const y = h * Math.pow(rnd(), 0.8), x = rnd() * w;
      const cover = 0.35 + 0.65 * (y / h);
      if (rnd() > cover) continue;
      const gr = 70 + rnd() * 110, rr = 30 + rnd() * 50 - (gr > 140 ? 0 : 0), bb = 20 + rnd() * 40;
      c.save(); c.translate(x, y); c.rotate(rnd() * 6.28); c.fillStyle = `rgb(${rr},${gr},${bb})`;
      c.beginPath(); c.ellipse(0, 0, 4 + rnd() * 9, 2.5 + rnd() * 5, 0, 0, 6.3); c.fill(); c.restore();
    }
    // Purple blossoms.
    for (let i = 0; i < 160; i++) { c.fillStyle = rnd() < 0.7 ? '#9a62d8' : '#f2e8ff'; c.beginPath(); c.arc(rnd() * w, h * (0.35 + rnd() * 0.65), 2 + rnd() * 2.6, 0, 6.3); c.fill(); }
  }, { anisotropy: 8, repeat: true });
}

// Hanging ivy for walls (alpha-tested cards).
function ivyTexture() {
  return canvasTexture(256, 256, (c, w, h) => {
    const rnd = mulberry32(23);
    c.clearRect(0, 0, w, h);
    for (let strand = 0; strand < 16; strand++) {
      let x = rnd() * w;
      for (let y = 0; y < h * (0.45 + rnd() * 0.55); y += 5) {
        x += (rnd() - 0.5) * 6;
        const gr = 80 + rnd() * 90;
        c.fillStyle = `rgb(${34 + rnd() * 40},${gr},${24 + rnd() * 30})`;
        c.save(); c.translate(x, y); c.rotate(rnd() * 6.28); c.beginPath(); c.ellipse(0, 0, 6 + rnd() * 6, 3.5 + rnd() * 3, 0, 0, 6.3); c.fill(); c.restore();
      }
    }
  }, { anisotropy: 4 });
}

const hexColor = (h) => new THREE.Color(h);

export function buildObservatory(S) {
  const P = PLACES.observatory;
  const zone = S.terrain.zone('observatory');
  const y0 = zone.h;
  const rnd = mulberry32(1888);
  const group = new THREE.Group();
  group.name = 'observatory';
  S.group.add(group);
  const stone = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.92 });
  const pl = plaster();
  const wallMat = new THREE.MeshStandardMaterial({ map: pl.map, normalMap: pl.normal, color: 0xd8cdb4, roughness: 0.95 });
  const beam = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.9 });
  const tex = ivyTexture();
  const ivyMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 });
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };

  // ---- The dome ---------------------------------------------------------------
  const R = 13, drumH = 8, domeTop = 18;
  const drum = add(new THREE.CylinderGeometry(R + 0.5, R + 1.2, drumH, 28, 1, true), stone, P.x, y0 + drumH / 2, P.z);
  void drum;
  // Dome profile: a squashed hemisphere cut flat at the top for the terrace.
  const prof = [];
  const topR = 6.4;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, a = t * Math.acos(topR / R) * 1.0;
    prof.push(new THREE.Vector2(R * Math.cos(a), drumH + Math.sin(a) * (domeTop - drumH) / Math.sin(Math.acos(topR / R))));
  }
  const domeGeo = new THREE.LatheGeometry(prof, 36);
  const domeTex = domeTexture(); domeTex.repeat.set(1, 1);
  const dome = add(domeGeo, new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }), P.x, y0, P.z);
  dome.userData.dome = true;
  // The drum is also ivy-skinned stone.
  add(new THREE.CylinderGeometry(R + 0.55, R + 1.25, drumH, 28, 4, true), new THREE.MeshStandardMaterial({ map: domeTex, color: 0xb8c8a8, roughness: 0.95, side: THREE.DoubleSide }), P.x, y0 + drumH / 2, P.z);
  // Top terrace: mossy slab with a ring of iron railing.
  const termat = new THREE.MeshStandardMaterial({ color: 0x5d7a3a, roughness: 1 });
  add(new THREE.CircleGeometry(topR + 0.3, 36).rotateX(-Math.PI / 2), termat, P.x, y0 + domeTop + 0.05, P.z);
  const posts = [];
  const N = 44;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; const g = new THREE.CylinderGeometry(0.04, 0.05, 1.15, 5); g.translate(Math.cos(a) * (topR + 0.1), 0.58, Math.sin(a) * (topR + 0.1)); posts.push(g); }
  for (const hy of [0.25, 0.65, 1.12]) { const g = new THREE.TorusGeometry(topR + 0.1, 0.03, 4, 64); g.rotateX(Math.PI / 2); g.translate(0, hy, 0); posts.push(g); }
  const fence = new THREE.Mesh(mergeGeometries(posts.map((g) => (g.index ? g.toNonIndexed() : g))), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.6 }));
  fence.position.set(P.x, y0 + domeTop + 0.05, P.z); fence.castShadow = true; group.add(fence);
  // Octagon of colliders (circles are not available) and a walkable terrace.
  for (const rot of [0, Math.PI / 4]) S.addBox(P.x, P.z, R * 0.92, R * 0.92, rot, y0 + domeTop, -50);
  S.platforms.push({ x: P.x, z: P.z, hw: topR * 0.7, hd: topR * 0.7, rot: 0, y: y0 + domeTop + 0.08, c: 1, s: 0 });
  // Stone stairs up to the terrace door on the south face.
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(5 - i * 0.2, 0.5, 1.2), stone, P.x, y0 + 0.25 + i * 0.5, P.z + R + 1.4 + (5 - i) * 1.1);
  // A dark doorway in the drum.
  add(new THREE.PlaneGeometry(2.4, 3.6), new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 1 }), P.x, y0 + 1.9, P.z + R + 1.31);

  // ---- Fallen colonial houses around the dome -----------------------------------
  const ruins = [];
  const ring = [[0.4, 34], [1.5, 40], [2.3, 36], [3.2, 42], [4.0, 33], [5.0, 39]];
  ring.forEach(([ang, r], k) => {
    const x = P.x + Math.cos(ang) * r, z = P.z + Math.sin(ang) * r;
    const w = 9 + rnd() * 6, d = 8 + rnd() * 5, h = 5 + rnd() * 3;
    const yaw = ang + Math.PI / 2 + (rnd() - 0.5) * 0.5;
    const g = new THREE.Group(); g.position.set(x, S.terrain.heightAt(x, z) - 0.2, z); g.rotation.y = yaw; group.add(g);
    const wall = (ww, hh, px, pz, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.5), wallMat); m.position.set(px, hh / 2, pz); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // Four walls, some collapsed to a stump, one with a gap.
    wall(w, h, 0, d / 2, 0); wall(w, h * (0.35 + rnd() * 0.5), 0, -d / 2, 0);
    wall(d * 0.55, h, w / 2, d * 0.22, Math.PI / 2); wall(d, h * (0.5 + rnd() * 0.4), -w / 2, 0, Math.PI / 2);
    // Half a roof: tiles over rafters, open to the sky.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.18, d + 1.4), new THREE.MeshStandardMaterial({ color: 0x9a5a3e, roughness: 0.95 }));
    roof.position.set(-w * 0.2, h + 0.9, 0); roof.rotation.z = 0.32; roof.castShadow = true; g.add(roof);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, d + 1.2), beam); b.position.set(-w * 0.48 + i * 0.9, h + 0.45 + i * 0.25, 0); b.rotation.z = 0.32; g.add(b); }
    // Ivy curtains over the walls.
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(2.6 + rnd() * 2.4, 3 + rnd() * 3), ivyMat);
      const side = (rnd() * 4) | 0;
      c.position.set(side % 2 ? (side === 1 ? w / 2 + 0.28 : -w / 2 - 0.28) : (rnd() - 0.5) * w * 0.7, h * 0.55, side % 2 ? (rnd() - 0.5) * d * 0.6 : (side === 0 ? d / 2 + 0.28 : -d / 2 - 0.28));
      c.rotation.y = side % 2 ? Math.PI / 2 : 0;
      g.add(c);
    }
    S.addBox(x, z, w / 2, d / 2, yaw, S.terrain.heightAt(x, z) + h, -50);
    ruins.push({ x, z, w, d });
  });
  // Broken columns and fallen blocks on the approach.
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 6.28, r = 20 + rnd() * 26, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    const hh = 1 + rnd() * 3.5;
    add(new THREE.CylinderGeometry(0.5, 0.58, hh, 9), stone, x, S.terrain.heightAt(x, z) + hh / 2 - 0.1, z);
  }
  S.observatory = { x: P.x, z: P.z, y: y0, top: y0 + domeTop, ruins };
  // Hand-placed plants for the vegetation layer: palms, ferns and flowers swallow the ruins.
  S.observatoryPlants = { palm: [], fern: [], flower: [], bush: [] };
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, r = 16 + rnd() * 48, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, h = S.terrain.heightAt(x, z);
    if (S.insideBuilding(x, z, 2)) continue;
    const roll = rnd();
    (roll < 0.12 ? S.observatoryPlants.palm : roll < 0.55 ? S.observatoryPlants.fern : roll < 0.8 ? S.observatoryPlants.bush : S.observatoryPlants.flower).push([x, h, z]);
  }
  void hexColor;
}
