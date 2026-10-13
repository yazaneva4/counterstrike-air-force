// Forest-floor plants for the tropical look: arching ferns and clumps of wild
// flowers. Geometry and textures only; vegetation.js owns the materials and
// instancing so they sway, tint and fade with distance like the trees.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';

// One bipinnate fern frond: a rib with leaflets that shorten towards the tip.
export function fernTexture() {
  return canvasTexture(128, 256, (c, w, h) => {
    const rnd = mulberry32(33);
    c.clearRect(0, 0, w, h);
    for (let y = 6; y < h - 4; y += 5) {
      const t = y / h, len = Math.sin(Math.min(1, 0.12 + t * 0.9) * Math.PI) * (w / 2 - 3) * (0.75 + rnd() * 0.25);
      for (const s of [-1, 1]) {
        const l = 0.6 + rnd() * 0.5;
        c.fillStyle = `rgb(${Math.round(48 * l)},${Math.round(112 * l)},${Math.round(36 * l)})`;
        const ex = w / 2 + s * len, ey = y - len * 0.42;
        c.beginPath(); c.moveTo(w / 2, y + 1); c.quadraticCurveTo(w / 2 + s * len * 0.55, y - 5, ex, ey);
        c.quadraticCurveTo(w / 2 + s * len * 0.5, y + 1.5, w / 2, y + 3); c.fill();
      }
    }
    c.strokeStyle = 'rgb(86,120,52)'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 0); c.stroke();
  }, { srgb: true, anisotropy: 4 });
}

export function flowerTexture() {
  return canvasTexture(128, 128, (c, w, h) => {
    const rnd = mulberry32(8);
    c.clearRect(0, 0, w, h);
    const heads = [[30, 40], [64, 24], [98, 44], [46, 60], [82, 62], [64, 78]];
    c.strokeStyle = '#3f7a30'; c.lineWidth = 2.4;
    for (const [x, y] of heads) { c.beginPath(); c.moveTo(w / 2 + (x - w / 2) * 0.2, h); c.quadraticCurveTo(x, (y + h) / 2, x, y); c.stroke(); }
    // Leaves at the base.
    c.fillStyle = '#3a7a2c';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(w / 2, h); c.quadraticCurveTo(w / 2 + s * 40, h - 30, w / 2 + s * 46, h - 8); c.quadraticCurveTo(w / 2 + s * 20, h - 14, w / 2, h); c.fill(); }
    // Blossoms are white so the per-instance colour sets their hue.
    for (const [x, y] of heads) {
      const r = 8 + rnd() * 4;
      c.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55, 0, 6.3); c.fill(); }
      c.fillStyle = '#f2c230'; c.beginPath(); c.arc(x, y, r * 0.38, 0, 6.3); c.fill();
    }
  }, { srgb: true, anisotropy: 4 });
}

// A strip bent into an arc (fronds curve up then droop).
function arcStrip(length, width, arch, yaw, segs = 4) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, a = t * arch;                             // bend accumulates along the frond
    const y = Math.sin(a * 0.9) * length * t * 0.55 + t * length * 0.45, r = t * length * (0.78 - 0.4 * t * (arch / 2));
    const hw = width * 0.5 * (1 - t * 0.55);
    pos.push(-hw, y, r, hw, y, r);
    uv.push(0, t, 1, t);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.rotateY(yaw);
  g.computeVertexNormals();
  // Soft upward-biased normals so ferns light like foliage, not hard cards.
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { const v = new THREE.Vector3(n.getX(i), Math.abs(n.getY(i)) * 0.5 + 0.7, n.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

export function fernGeometry(seed = 3) {
  const rnd = mulberry32(seed), parts = [];
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const g = arcStrip(1.5 + rnd() * 0.9, 0.55 + rnd() * 0.2, 1.1 + rnd() * 0.8, (i / fronds) * Math.PI * 2 + rnd() * 0.5);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeometries(parts);
}

// Crossed cards of flower stems (three cards at 60°).
export function flowerGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.9, 0.9);
    g.translate(0, 0.45, 0);
    g.rotateY(i * Math.PI / 3);
    const n = g.attributes.normal;
    for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}
