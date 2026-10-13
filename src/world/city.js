// Port Kestrel: a dense downtown district on the south-east plain. A 5×5
// avenue grid with 16 city blocks, stepped skyscrapers with lit windows and
// roof machinery, a podium of neon shopfronts, a glowing central tower, an
// atlas of neon billboards, working traffic lights, street lamps, painted
// crosswalks, palm-lined sidewalks and an elevated monorail loop with a
// moving train. Everything is merged into a few dozen draw calls (one mesh per
// facade style, roofs, furniture, lamps and signs) so it stays light on phones.

import * as THREE from 'three';
import { canvasTexture, glowSprite } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from './terrain.js';

export const CITY = { size: 540, street: 20, lines: [-240, -120, 0, 120, 240], block: 100 };

// ---- Tiny mesh batcher -------------------------------------------------------

class Batch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }

  quad(p0, p1, p2, p3, n, uvs, c) {
    const b = this.pos.length / 3;
    for (const p of [p0, p1, p2, p3]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); }
    for (const u of uvs) this.uv.push(u[0], u[1]);
    for (let i = 0; i < 4; i++) this.col.push(c[0], c[1], c[2]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // Axis-aligned box with flat colour (optionally skipping the underside).
  box(cx, cy, cz, sx, sy, sz, c, { bottom = false, yaw = 0 } = {}) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const N = (x, z) => [x * cs + z * sn, 0, -x * sn + z * cs];
    const z4 = [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), N(0, 1), z4, c);
    this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), N(0, -1), z4, c);
    this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), N(1, 0), z4, c);
    this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), N(-1, 0), z4, c);
    this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), [0, 1, 0], z4, c);
    if (bottom) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), [0, -1, 0], z4, c);
  }

  // Flat quad on the ground, rotated by yaw about its centre.
  flat(cx, y, cz, w, d, yaw, c) {
    const hw = w / 2, hd = d / 2, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (x, z) => [cx + x * cs + z * sn, y, cz - x * sn + z * cs];
    this.quad(P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd), [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], c);
  }

  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

// ---- Textures ---------------------------------------------------------------------

// One facade tile: 8 columns × 8 floors. The day map has dark reflective glass;
// the emissive map holds the lit windows (warm, cool and the odd neon strip).
const STYLES = [
  { name: 'glass', wall: '#6d8097', glass: '#35546f', glass2: '#9cc2e0', mullion: '#4f6378', lit: ['#ffd9a0', '#bfe3ff', '#fff2cf'], litRate: 0.34 },
  { name: 'concrete', wall: '#d2cabb', glass: '#46606e', glass2: '#9ec0d0', mullion: '#aaa394', lit: ['#ffc880', '#ffe6b8'], litRate: 0.3, accent: '#ff7a1a' },
  { name: 'teal', wall: '#3f7f88', glass: '#1d4a56', glass2: '#7cc4cf', mullion: '#2c5a63', lit: ['#7dffe6', '#d6fff4', '#ffd9a0'], litRate: 0.4, accent: '#27f0d0' },
  { name: 'brick', wall: '#a95e48', glass: '#3a3028', glass2: '#8a7a68', mullion: '#84483a', lit: ['#ffb060', '#ffd89a'], litRate: 0.28, balconies: true },
  { name: 'white', wall: '#e6e9ec', glass: '#47688a', glass2: '#a6cbe8', mullion: '#c4ccd2', lit: ['#fff4d8', '#cfe8ff'], litRate: 0.3 },
  { name: 'dark', wall: '#2f3544', glass: '#1a2234', glass2: '#4a5a80', mullion: '#20242f', lit: ['#ff3fa4', '#27d9ff', '#ff9a2a', '#b66bff'], litRate: 0.42, accent: '#ff3fa4' },
];

function facade(style, seed) {
  const rnd = mulberry32(seed);
  const W = 512, cols = 8, rows = 8, cw = W / cols, rh = W / rows;
  const lit = [];                                   // [col, row, color]
  const day = canvasTexture(W, W, (c) => {
    c.fillStyle = style.wall; c.fillRect(0, 0, W, W);
    // Concrete grain and streaks.
    for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${rnd() * 0.05})`; c.fillRect(rnd() * W, rnd() * W, 1 + rnd() * 3, 3 + rnd() * 18); }
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = k * cw, y = r * rh;
      const g = c.createLinearGradient(0, y, 0, y + rh);
      g.addColorStop(0, style.glass2); g.addColorStop(0.55, style.glass); g.addColorStop(1, style.glass);
      c.fillStyle = g; c.fillRect(x + 5, y + 8, cw - 10, rh - 18);
      c.fillStyle = style.mullion; c.fillRect(x + cw / 2 - 1, y + 8, 2, rh - 18);
      if (style.balconies) { c.fillStyle = '#3a2a24'; c.fillRect(x + 2, y + rh - 11, cw - 4, 4); c.fillStyle = '#222'; for (let b = 0; b < 4; b++) c.fillRect(x + 4 + b * 14, y + rh - 22, 1.5, 11); }
      if (rnd() < style.litRate) lit.push([k, r, style.lit[(rnd() * style.lit.length) | 0]]);
    }
    // Floor slabs.
    c.fillStyle = style.mullion; for (let r = 0; r < rows; r++) c.fillRect(0, r * rh, W, 4);
    if (style.accent) { c.fillStyle = style.accent; c.fillRect(0, 0, W, 3); c.fillRect(0, rh * 4, W, 2); }
    // Lit windows are faintly visible by day.
    for (const [k, r, col] of lit) { c.fillStyle = col; c.globalAlpha = 0.18; c.fillRect(k * cw + 5, r * rh + 8, cw - 10, rh - 18); c.globalAlpha = 1; }
  }, { repeat: true, anisotropy: 8 });
  const glow = canvasTexture(W, W, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
    for (const [k, r, col] of lit) { c.fillStyle = col; c.fillRect(k * cw + 5, r * rh + 8, cw - 10, rh - 18); }
    if (style.accent) { c.fillStyle = style.accent; c.fillRect(0, 0, W, 3); c.fillRect(0, rh * 4, W, 2); }
  }, { repeat: true });
  return { day, glow };
}

function asphaltTexture() {
  return canvasTexture(512, 512, (c, w, h) => {
    const rnd = mulberry32(77);
    c.fillStyle = '#4a4b4d'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i++) { const v = 56 + rnd() * 40; c.fillStyle = `rgba(${v},${v},${v + 2},0.4)`; c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
    // Patched repairs, cracks and oil stains like a lived-in street.
    for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(30,30,32,${0.18 + rnd() * 0.2})`; c.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 90, 20 + rnd() * 60); }
    c.strokeStyle = 'rgba(20,20,22,0.55)'; c.lineWidth = 1.2;
    for (let i = 0; i < 22; i++) { c.beginPath(); let x = rnd() * w, y = rnd() * h; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.2) * 26; c.lineTo(x, y); } c.stroke(); }
  }, { repeat: true, anisotropy: 8 });
}

function pavementTexture() {
  return canvasTexture(256, 256, (c, w, h) => {
    const rnd = mulberry32(12);
    c.fillStyle = '#9b9a95'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) { const v = 130 + rnd() * 40; c.fillStyle = `rgba(${v},${v},${v - 6},0.3)`; c.fillRect(rnd() * w, rnd() * h, 2, 2); }
    c.strokeStyle = 'rgba(60,60,58,0.5)'; c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  }, { repeat: true, anisotropy: 8 });
}

// ---- Neon billboards ------------------------------------------------------------

const ADS = [
  ['SUNDOWN RAMEN', '#ff5a1f', '#2a0a00', '#fff4d8'], ['NOVA ELECTRONICS', '#0b1a33', '#0b4a8a', '#7dd8ff'], ['TIDAL BANK', '#06323a', '#0e8a86', '#e8fffb'],
  ['HARROW BREWING', '#f0a21c', '#7a4a00', '#1a0f00'], ['AURORA SPACE', '#120a2a', '#4a1d9a', '#c9a8ff'], ['ISLAND FM 98', '#ff2a8a', '#6a0a3a', '#ffe0f0'],
  ['HELIX PHARMA', '#e8f2f0', '#9fd6c8', '#0b4a42'], ['KESTREL AIR', '#102a5a', '#1f5fb8', '#ffffff'], ['DRIFT ENERGY', '#0a0a0a', '#00c8ff', '#c8f4ff'],
  ['MOONRISE CAFE', '#1a1a2e', '#3a3a6a', '#ffe9a8'], ['POLAR OIL', '#d8e4ee', '#7aa6c8', '#12324a'], ['HOLO ARCADE', '#16002a', '#ff00c8', '#00f0ff'],
  ['MARS COLONY: JOIN US', '#6a1d08', '#c8501e', '#fff0e0'], ['LAGOON HOTEL', '#003a4a', '#00a8b8', '#fffbe8'], ['TURBO TYRES', '#1c1c1c', '#d8281a', '#ffffff'],
  ['ORBIT LOGISTICS', '#0a1a2a', '#1a4a6a', '#ffb347'], ['CASINO PACIFICA', '#2a0016', '#c8003a', '#ffe08a'], ['NEON NOODLES', '#0a0030', '#6a00ff', '#ff9aff'],
  ['SUMMIT GEAR', '#1e3a24', '#3a7a44', '#f4ffe8'], ['VOLT CYCLES', '#101820', '#00d68f', '#eafff6'], ['SPACEPORT EXPRESS', '#0a1a3a', '#e8a21c', '#ffffff'],
  ['CITY RADIO', '#2a2a2a', '#ff7a1a', '#fff'], ['BAZAAR 24H', '#3a0a3a', '#ff4a9a', '#ffe8f4'], ['SKYLINE TRAVEL', '#003a66', '#38a8ff', '#ffffff'],
];
const AD_COLS = 4, AD_ROWS = 6;

function adAtlas() {
  const CW = 512, CH = 171;
  return canvasTexture(CW * AD_COLS, CH * AD_ROWS, (c) => {
    ADS.forEach(([text, a, b, fg], i) => {
      const x = (i % AD_COLS) * CW, y = Math.floor(i / AD_COLS) * CH;
      const g = c.createLinearGradient(x, y, x + CW, y + CH); g.addColorStop(0, a); g.addColorStop(1, b);
      c.fillStyle = g; c.fillRect(x, y, CW, CH);
      // Glow bars and a simple pictogram for variety.
      c.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 6; k++) c.fillRect(x, y + 14 + k * 28, CW, 3);
      c.fillStyle = fg; c.globalAlpha = 0.9;
      const shape = i % 4;
      if (shape === 0) { c.beginPath(); c.arc(x + 62, y + CH / 2, 34, 0, 6.3); c.fill(); }
      else if (shape === 1) { c.fillRect(x + 28, y + 40, 68, 68); }
      else if (shape === 2) { c.beginPath(); c.moveTo(x + 28, y + 120); c.lineTo(x + 62, y + 40); c.lineTo(x + 96, y + 120); c.closePath(); c.fill(); }
      else { for (let k = 0; k < 4; k++) c.fillRect(x + 28 + k * 18, y + 120 - (k + 1) * 20, 12, (k + 1) * 20); }
      c.globalAlpha = 1;
      c.fillStyle = fg; c.shadowColor = fg; c.shadowBlur = 12;
      const fs = text.length > 15 ? 38 : 48;
      c.font = `800 ${fs}px 'Arial Black', Arial, sans-serif`; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(text, x + 118, y + CH / 2 + 2, CW - 134);
      c.shadowBlur = 0; c.strokeStyle = fg; c.lineWidth = 4; c.strokeRect(x + 5, y + 5, CW - 10, CH - 10);
    });
  }, { anisotropy: 8 });
}

// ---- Layout helpers --------------------------------------------------------------

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildCity(S) {
  const P = PLACES.city;
  const zone = S.terrain.zone('city');
  const y0 = zone.h;
  const rnd = mulberry32(2077);
  const group = new THREE.Group();
  group.name = 'city';
  S.group.add(group);
  const low = S.lowDetail;
  const G = CITY.lines, ST = CITY.street, HB = CITY.block / 2;
  const gx = (lx) => P.x + lx, gz = (lz) => P.z + lz;

  // Facade batches: one per style; roofs and furniture are vertex-coloured.
  const sides = STYLES.map(() => new Batch());
  const roofs = new Batch(), furn = new Batch(), marks = new Batch(), signsB = new Batch();
  const lampHeads = new Batch();
  const lamps = {};                       // traffic-light lamp batches by axis+colour
  for (const ax of ['ns', 'ew']) for (const col of ['r', 'a', 'g']) lamps[ax + col] = new Batch();
  const TW = 24, TH = 28;                  // world size of one facade tile

  // Facade wall quad between (x0,z0)-(x1,z1) from y to y+h, outward normal n.
  const wall = (b, x0, z0, x1, z1, y, h, n, style) => {
    const L = Math.hypot(x1 - x0, z1 - z0), u1 = L / TW, v0 = y / TH, v1 = (y + h) / TH;
    b.quad([x0, y, z0], [x1, y, z1], [x1, y + h, z1], [x0, y + h, z0], n, [[0, v0], [u1, v0], [u1, v1], [0, v1]], [1, 1, 1]);
    void style;
  };

  // A building tier: four facade walls and a roof.
  const tier = (styleIdx, cx, cz, w, d, y, h, roofColor = hex(0x4a4c50)) => {
    const b = sides[styleIdx], x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    wall(b, x0, z1, x1, z1, y, h, [0, 0, 1]); wall(b, x1, z0, x0, z0, y, h, [0, 0, -1]);
    wall(b, x1, z1, x1, z0, y, h, [1, 0, 0]); wall(b, x0, z0, x0, z1, y, h, [-1, 0, 0]);
    roofs.quad([x0, y + h, z1], [x1, y + h, z1], [x1, y + h, z0], [x0, y + h, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], roofColor);
    S.addBox(cx, cz, w / 2, d / 2, 0, y + h, y > y0 + 1 ? y : -50);
  };

  // ---- Ground: asphalt, sidewalk slabs, markings --------------------------------
  const asphalt = asphaltTexture(); asphalt.repeat.set(CITY.size / 48, CITY.size / 48);
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  S._flatSlab(P.x, P.z, CITY.size + 40, CITY.size + 40, asphaltMat, y0 + 0.06);
  const pave = pavementTexture();
  const paveMats = [];
  const blockCenters = [-180, -60, 60, 180];
  for (const bx of blockCenters) for (const bz of blockCenters) {
    const t = pave.clone(); t.needsUpdate = true; t.repeat.set(CITY.block / 6, CITY.block / 6);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    paveMats.push(m);
    S._flatSlab(gx(bx), gz(bz), CITY.block, CITY.block, m, y0 + 0.2);
  }

  // Lane markings and crosswalks.
  const YEL = hex(0xe8b830), WHT = hex(0xe8e8e2);
  const my = y0 + 0.095;
  for (const line of G) {
    for (let a = -270; a < 270; a += 7) {
      // Skip dashes inside intersections.
      if (G.some((g) => Math.abs(a + 1.5 - g) < ST / 2 + 4)) continue;
      marks.flat(gx(line), my, gz(a + 1.5), 0.35, 3.2, 0, YEL);       // along z at x = line
      marks.flat(gx(a + 1.5), my, gz(line), 3.2, 0.35, 0, YEL);       // along x at z = line
    }
  }
  for (const ix of G) for (const iz of G) {
    for (const [dx, dz, vertical] of [[0, -ST / 2 - 4, false], [0, ST / 2 + 4, false], [-ST / 2 - 4, 0, true], [ST / 2 + 4, 0, true]]) {
      for (let k = -4; k <= 4; k++) {
        if (vertical) marks.flat(gx(ix + dx), my, gz(iz + k * 2.1), 4, 0.9, 0, WHT);
        else marks.flat(gx(ix + k * 2.1), my, gz(iz + dz), 0.9, 4, 0, WHT);
      }
    }
    // Yellow box-junction hatching on every third intersection.
    if ((G.indexOf(ix) + G.indexOf(iz)) % 3 === 0) for (let k = -7; k <= 7; k++) marks.flat(gx(ix + k * 1.2), my, gz(iz + k * 1.2), 0.3, 9, 0.785, YEL);
  }

  // ---- Buildings ----------------------------------------------------------------
  const towers = [];
  const dist = (x, z) => Math.hypot(x, z);
  const lotStyle = () => (rnd() * STYLES.length) | 0;
  for (const bx of blockCenters) for (const bz of blockCenters) {
    const core = 1 - smooth(60, 280, dist(bx, bz));            // 1 downtown, 0 at the edge
    const pattern = core > 0.62 && rnd() < 0.7 ? 'tower' : rnd() < 0.55 ? 'quad' : 'strip';
    const lots = [];
    const m = 5;                                                // margin inside the block
    const inner = CITY.block - m * 2;
    if (pattern === 'tower') lots.push([bx, bz, inner - 14, inner - 14]);
    else if (pattern === 'quad') { const s = inner / 2 - 2; for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lots.push([bx + ox * (s / 2 + 2), bz + oz * (s / 2 + 2), s, s]); }
    else { const w = inner / 3 - 2; for (let k = -1; k <= 1; k++) lots.push([bx + k * (w + 2), bz, w, inner]); }
    for (const [lx, lz, w, d] of lots) {
      const f = core * (0.65 + rnd() * 0.5);
      const h = pattern === 'tower' ? 95 + f * 150 + rnd() * 30 : 14 + f * 105 * (0.5 + rnd() * 0.6) + rnd() * 18;
      const style = lotStyle();
      const px = gx(lx), pz = gz(lz);
      const podH = 5.5;
      // Podium of shopfronts (the shop style wraps the ground floor).
      tier(5 === style ? 0 : style, px, pz, w, d, y0 + 0.2, podH, hex(0x3a3c40));
      // Tower body in one to three setback tiers.
      let y = y0 + 0.2 + podH, cw = w - 2, cd = d - 2, remaining = h - podH;
      const tiers = h > 130 ? 3 : h > 55 ? 2 : 1;
      let top = y, lastW = cw, lastD = cd;
      for (let t = 0; t < tiers; t++) {
        const th = t === tiers - 1 ? remaining : remaining * (0.45 + rnd() * 0.15);
        tier(style, px, pz, cw, cd, y, th);
        y += th; remaining -= th; top = y; lastW = cw; lastD = cd;
        cw *= 0.72 + rnd() * 0.1; cd *= 0.72 + rnd() * 0.1;
      }
      towers.push({ x: px, z: pz, w, d, bw: w - 2, bd: d - 2, h, top, style, topW: lastW, topD: lastD });
    }
  }

  const ranked = [...towers].sort((a, b) => b.h - a.h);
  const tallest = ranked[0] && { x: ranked[0].x, z: ranked[0].z, h: ranked[0].h, top: ranked[0].top, w: ranked[0].topW, d: ranked[0].topD };
  const padTower = ranked.find((t) => t !== ranked[0] && t.topW > 16 && t.topD > 16);
  const padSpot = padTower && { x: padTower.x, z: padTower.z, top: padTower.top, w: padTower.topW, d: padTower.topD };
  // Roof machinery (the helipad tower and the crowned tower stay clear).
  for (const t of towers) {
    if (t === padTower || t === ranked[0]) continue;
    const rc = hex(0x707478), cw = t.topW, cd = t.topD, px = t.x, pz = t.z, top = t.top;
    for (let k = 0; k < 3 + (rnd() * 3 | 0); k++) furn.box(px + (rnd() - 0.5) * cw * 0.6, top + 0.9, pz + (rnd() - 0.5) * cd * 0.6, 2 + rnd() * 3, 1.8, 2 + rnd() * 3, rc);
    if (t.h > 90) {
      furn.box(px, top + 7, pz, 0.5, 14, 0.5, hex(0x888c90));                               // antenna mast
      const blink = glowSprite(0xff2a2a, 3.2); blink.position.set(px, top + 14.4, pz); group.add(blink);
      S.blinkers.push({ sprite: blink, period: 2, phase: rnd() * 2, night: true, max: 1 });
    }
  }

  // Billboards and neon signs: quads cut from the atlas, stuck on facades and roofs.
  const signs = [];
  const sign = (cx, cy, cz, w, h, yaw, cell) => {
    const col = cell % AD_COLS, row = Math.floor(cell / AD_COLS), u0 = col / AD_COLS, u1 = (col + 1) / AD_COLS, v1 = 1 - row / AD_ROWS, v0 = 1 - (row + 1) / AD_ROWS;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const Pt = (x, y) => [cx + x * cs, cy + y, cz - x * sn];
    const n = [sn, 0, cs];
    signsB.quad(Pt(-w / 2, -h / 2), Pt(w / 2, -h / 2), Pt(w / 2, h / 2), Pt(-w / 2, h / 2), n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [1, 1, 1]);
    // Dark frame behind it.
    furn.box(cx - n[0] * 0.25, cy, cz - n[2] * 0.25, Math.abs(cs) * (w + 0.6) + Math.abs(sn) * 0.3, h + 0.6, Math.abs(sn) * (w + 0.6) + Math.abs(cs) * 0.3, hex(0x15171b), { yaw: 0 });
    signs.push({ x: cx, z: cz });
  };
  let cellIdx = 0;
  for (const t of towers) {
    if (t.h < 40) continue;
    // Facade-mounted signs on two sides of the main tier: one low, one a third of the way up.
    const heights = [y0 + 8 + rnd() * 8, y0 + t.h * 0.3];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (let k = 0; k < (low ? 1 : 2); k++) {
      const [sx, sz] = dirs[(rnd() * 4) | 0];
      const yaw = sz > 0 ? 0 : sz < 0 ? Math.PI : sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      const along = sz ? t.bw : t.bd;
      sign(t.x + sx * (t.bw / 2 + 0.3), heights[k], t.z + sz * (t.bd / 2 + 0.3), Math.min(along * 0.7, 14 + rnd() * 10), 4.6 + rnd() * 2.2, yaw, (cellIdx++) % ADS.length);
    }
    // Big rooftop billboard on taller towers, held up by two legs.
    if (t.h > 100 && !low && t !== padTower && t !== ranked[0]) {
      const bz = t.z + t.topD / 2 - 2.5, bwid = Math.min(26, t.topW * 0.8);
      sign(t.x, t.top + 9, bz, bwid, bwid / 3, 0, (cellIdx++) % ADS.length);
      for (const lx of [-bwid / 2 + 1, bwid / 2 - 1]) furn.box(t.x + lx, t.top + 4, bz - 0.4, 0.5, 8, 0.5, hex(0x2a2d32));
    }
  }
  // Street-level neon on the podiums facing the avenues.
  if (!low) for (let i = 0; i < 26; i++) {
    const t = towers[(rnd() * towers.length) | 0];
    const sgn = rnd() < 0.5 ? 1 : -1, alongX = rnd() < 0.5;
    if (alongX) sign(t.x + (rnd() - 0.5) * t.w * 0.5, y0 + 3.9, t.z + sgn * (t.d / 2 + 0.3), 7 + rnd() * 3, 2.2, sgn > 0 ? 0 : Math.PI, (cellIdx++) % ADS.length);
    else sign(t.x + sgn * (t.w / 2 + 0.3), y0 + 3.9, t.z + (rnd() - 0.5) * t.d * 0.5, 7 + rnd() * 3, 2.2, sgn > 0 ? Math.PI / 2 : -Math.PI / 2, (cellIdx++) % ADS.length);
  }

  // Skybridges: glass tubes linking tall neighbouring towers across the avenues.
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.8, emissive: 0xffe0a0, emissiveIntensity: 0 });
  S.nightLights.push({ mat: bridgeMat, base: 1.2 });
  let nb = 0;
  for (let i = 0; i < towers.length && nb < (low ? 4 : 10); i++) for (let j = i + 1; j < towers.length; j++) {
    const A = towers[i], B = towers[j];
    if (A.h < 70 || B.h < 70) continue;
    const dx = B.x - A.x, dz = B.z - A.z;
    const alongX = Math.abs(dz) < 6 && Math.abs(dx) > 90 && Math.abs(dx) < 140, alongZ = Math.abs(dx) < 6 && Math.abs(dz) > 90 && Math.abs(dz) < 140;
    if (!alongX && !alongZ) continue;
    if (rnd() < 0.45) continue;
    const y = y0 + 26 + rnd() * Math.min(A.h, B.h) * 0.35;
    const L = (alongX ? Math.abs(dx) - (A.bw + B.bw) / 2 : Math.abs(dz) - (A.bd + B.bd) / 2) + 1.2;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const tube = new THREE.Mesh(new THREE.BoxGeometry(alongX ? L : 4.6, 3.8, alongX ? 4.6 : L), bridgeMat);
    tube.position.set(mx, y, mz); tube.castShadow = true; group.add(tube);
    furn.box(mx, y - 2.15, mz, alongX ? L : 5.2, 0.5, alongX ? 5.2 : L, hex(0x4a4f56));
    furn.box(mx, y + 2.1, mz, alongX ? L : 5.2, 0.3, alongX ? 5.2 : L, hex(0x4a4f56));
    S.addBox(mx, mz, alongX ? L / 2 : 2.6, alongX ? 2.6 : L / 2, 0, y + 2.3, y - 2.4);
    nb++;
  }

  // ---- Street furniture: lamps, traffic lights, palms ---------------------------------
  const pole = hex(0x3a3f45), orange = hex(0xe8742a);
  const palms = [];
  const pools = new Batch();
  const E = ST / 2 + 0.8;
  for (const line of G) {
    for (let a = -260; a <= 260; a += 36) {
      if (G.some((g) => Math.abs(a - g) < ST / 2 + 8)) continue;
      const alt = Math.round(a / 36) % 2 === 0;
      for (const side of [-1, 1]) {
        if (alt) {
          // Lamp post on the sidewalk edge with an arm reaching over the street; one along z and one along x.
          furn.box(gx(line + side * E), y0 + 4.3, gz(a), 0.28, 8.6, 0.28, pole);
          furn.box(gx(line + side * (E - 1)), y0 + 8.7, gz(a), 2.2, 0.18, 0.4, orange);
          lampHeads.box(gx(line + side * (E - 1.4)), y0 + 8.55, gz(a), 1.5, 0.1, 0.3, [1, 0.9, 0.7]);
          pools.flat(gx(line + side * (E - 3)), y0 + 0.11, gz(a), 12, 12, 0, [1, 0.82, 0.55]);
          furn.box(gx(a), y0 + 4.3, gz(line + side * E), 0.28, 8.6, 0.28, pole);
          furn.box(gx(a), y0 + 8.7, gz(line + side * (E - 1)), 0.4, 0.18, 2.2, orange);
          lampHeads.box(gx(a), y0 + 8.55, gz(line + side * (E - 1.4)), 0.3, 0.1, 1.5, [1, 0.9, 0.7]);
          pools.flat(gx(a), y0 + 0.11, gz(line + side * (E - 3)), 12, 12, 0, [1, 0.82, 0.55]);
        } else if (!low || Math.round(a / 36) % 4 === 1) {
          palms.push([gx(line + side * (ST / 2 + 2.5)), y0 + 0.2, gz(a)], [gx(a), y0 + 0.2, gz(line + side * (ST / 2 + 2.5))]);
        }
      }
    }
  }
  // Traffic lights at every intersection (heads show both axes on all faces).
  const lampSets = [['r', 0.52], ['a', 0.1], ['g', -0.34]];
  for (const ix of G) for (const iz of G) for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    const x = gx(ix + sx * (ST / 2 + 0.7)), z = gz(iz + sz * (ST / 2 + 0.7));
    furn.box(x, y0 + 2.8, z, 0.25, 5.6, 0.25, pole);
    furn.box(x, y0 + 5.3, z, 0.7, 1.7, 0.7, hex(0x15171b));
    for (const [nx, nz, ax] of [[0, 1, 'ns'], [0, -1, 'ns'], [1, 0, 'ew'], [-1, 0, 'ew']]) {
      for (const [c, oy] of lampSets) {
        const b = lamps[ax + c];
        const cx = x + nx * 0.37, cz = z + nz * 0.37, cy = y0 + 5.3 + oy;
        b.box(cx, cy, cz, nx ? 0.06 : 0.38, 0.38, nz ? 0.06 : 0.38, [1, 1, 1]);
      }
    }
  }
  // Roundabout plaza sculpture in the centre: a slim tower with a neon crown.
  furn.box(gx(0), y0 + 18, gz(0), 2.4, 36, 2.4, hex(0x2a2f36));
  for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; furn.box(gx(0) + Math.cos(a) * 7, y0 + 0.9, gz(0) + Math.sin(a) * 7, 1.6, 1.8, 1.6, hex(0x5a5e62)); }

  // ---- Materials and meshes ---------------------------------------------------------
  const mk = (geo, mat, { cast = true, receive = true } = {}) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; group.add(m); return m; };
  STYLES.forEach((st, i) => {
    const t = facade(st, 100 + i * 17);
    const mat = new THREE.MeshStandardMaterial({ map: t.day, emissiveMap: t.glow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.5, metalness: 0.06 });
    mk(sides[i].build(), mat);
    S.nightLights.push({ mat, base: 1.7 });
  });
  // Station canopy on the north side of the monorail loop.
  furn.box(gx(0), y0 + 24 + 4.6, gz(-120 - 3), 34, 0.4, 9, hex(0x30343a));
  mk(roofs.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mk(furn.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 }));
  const markMesh = mk(marks.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), { cast: false });
  void markMesh;
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe8c0, emissive: 0xffe0a0, emissiveIntensity: 0, roughness: 0.4 });
  mk(lampHeads.build(), lampMat, { cast: false });
  S.nightLights.push({ mat: lampMat, base: 3.4 });
  const lampColors = { r: 0xff2a1a, a: 0xffb020, g: 0x20ff6a };
  const lampMats = {};
  for (const [key, b] of Object.entries(lamps)) {
    lampMats[key] = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: lampColors[key[2]], emissiveIntensity: 0, roughness: 0.4 });
    mk(b.build(), lampMats[key], { cast: false });
  }
  // Pools of lamplight on the asphalt (additive, only visible after dark).
  const poolTex = canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
  mk(pools.build(), poolMat, { cast: false, receive: false });
  S.spinners.push(() => { poolMat.opacity = Math.min(0.85, (S.dusk || 0) * 0.9); });
  const adTex = adAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: adTex, emissiveMap: adTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
  mk(signsB.build(), signMat, { cast: false });
  S.nightLights.push({ mat: signMat, base: 1.4, floor: 0.55 });

  // Traffic-light state machine: north-south green, amber, all red, east-west green...
  const PHASES = [['g', 'r', 8], ['a', 'r', 2], ['r', 'r', 1.5], ['r', 'g', 8], ['r', 'a', 2], ['r', 'r', 1.5]];
  let pt = 0, pi = 0;
  const applyPhase = () => {
    const [ns, ew] = PHASES[pi];
    for (const [ax, c] of [['ns', ns], ['ew', ew]]) for (const k of ['r', 'a', 'g']) lampMats[ax + k].emissiveIntensity = k === c ? 3.2 : 0.04;
  };
  applyPhase();
  S.spinners.push((dt) => { pt += dt; if (pt > PHASES[pi][2]) { pt = 0; pi = (pi + 1) % PHASES.length; applyPhase(); } });
  S.cityPhase = () => PHASES[pi];

  // ---- Monorail: elevated chamfered loop with a moving three-car train -------------
  const RAIL_Y = y0 + 24, loopR = 120, c = 26;
  const loop = [[-loopR + c, -loopR], [loopR - c, -loopR], [loopR, -loopR + c], [loopR, loopR - c], [loopR - c, loopR], [-loopR + c, loopR], [-loopR, loopR - c], [-loopR, -loopR + c]];
  const rail = new Batch(), segLen = [];
  let total = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    segLen.push(L); total += L;
    rail.box(gx((a[0] + b[0]) / 2), RAIL_Y, gz((a[1] + b[1]) / 2), 3.6, 1.1, L + 0.4, hex(0x6a7078), { yaw, bottom: true });
    rail.box(gx((a[0] + b[0]) / 2), RAIL_Y + 0.65, gz((a[1] + b[1]) / 2), 0.25, 0.2, L, hex(0xe8742a), { yaw });
    for (let s = 0; s < L; s += 32) {
      const f = s / L, px = gx(a[0] + (b[0] - a[0]) * f), pz = gz(a[1] + (b[1] - a[1]) * f);
      rail.box(px, y0 + 11.8, pz, 1.6, 23.2, 1.6, hex(0x5a5f66));
      S.addBox(px, pz, 0.8, 0.8, 0, RAIL_Y, -50);
    }
  }
  mk(rail.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }));
  const trainMat = new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.35, metalness: 0.5 });
  const trainGlass = new THREE.MeshStandardMaterial({ color: 0x0a1218, emissive: 0xffe8b0, emissiveIntensity: 0, roughness: 0.15, metalness: 0.7 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xe8742a, roughness: 0.5 });
  S.nightLights.push({ mat: trainGlass, base: 1.8 });
  const train = new THREE.Group();
  const cars = [];
  for (let i = 0; i < 3; i++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.0, 15), trainMat); body.castShadow = true; car.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.45, 1.05, 12.5), trainGlass); win.position.y = 0.45; car.add(win);
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.46, 0.3, 14.8), stripe); band.position.y = -0.7; car.add(band);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 1.6), trainMat); nose.position.set(0, -0.2, i === 0 ? 8.2 : -8.2); if (i === 0 || i === 2) car.add(nose);
    car.userData.len = 16;
    train.add(car); cars.push(car);
  }
  group.add(train);
  let trainS = 40;
  const sample = (s) => {
    s = ((s % total) + total) % total;
    for (let i = 0; i < loop.length; i++) {
      if (s <= segLen[i]) {
        const a = loop[i], b = loop[(i + 1) % loop.length], f = s / segLen[i];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
      }
      s -= segLen[i];
    }
    return [loop[0][0], loop[0][1], 0];
  };
  const place = () => {
    cars.forEach((car, i) => { const [x, z, yaw] = sample(trainS - i * 16.5); car.position.set(gx(x), RAIL_Y + 2.1, gz(z)); car.rotation.y = yaw; });
  };
  place();
  S.spinners.push((dt) => { trainS += dt * 17; place(); });

  // ---- Roads, spawns, helipad, data for the game ------------------------------------
  // Avenues become traffic routes; highways link the city to the airbase and speedway.
  for (const line of G) {
    S.roads.push({ pts: [[gx(line), gz(-250)], [gx(line), gz(250)]], width: ST, city: true });
    S.roads.push({ pts: [[gx(-250), gz(line)], [gx(250), gz(line)]], width: ST, city: true });
  }
  S._road([[560, 706], [690, 820], [P.x - 130, P.z - 430], [P.x - 20, P.z - 300], [P.x, gz(-262) + 4]], 12);
  S._road([[gx(-262), P.z + 2], [P.x - 520, P.z - 10], [P.x - 800, P.z + 30], [PLACES.speedway.x + 430, PLACES.speedway.z - 20]], 12);

  S.cityPalms = low ? palms.filter((_, i) => i % 2 === 0) : palms;
  S.spawns.city = { x: gx(14), y: y0 + 0.2, z: gz(-30), heading: Math.PI };
  S.city = { x: P.x, z: P.z, towers, tallest, signs: signs.length, train: () => ({ s: trainS }) };
  if (tallest) {
    // Glowing crown on the tallest tower: two neon rings and a spire.
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x120a00, emissive: 0xff8a2a, emissiveIntensity: 0, roughness: 0.4 });
    for (const [dy, r] of [[2, 1], [7, 0.8]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(tallest.w, tallest.d) * 0.5 * r, 0.5, 8, 40), crownMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(tallest.x, tallest.top + dy, tallest.z); group.add(ring);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, 38, 8), new THREE.MeshStandardMaterial({ color: 0x8a8e94, metalness: 0.4, roughness: 0.4 }));
    spire.position.set(tallest.x, tallest.top + 19, tallest.z); group.add(spire);
    S.nightLights.push({ mat: crownMat, base: 3.2, floor: 0.4 });
  }
  if (padSpot) {
    // Helipad on the next-tallest roof: a platform and a painted H, with a helicopter spawn.
    const hy = padSpot.top + 0.1;
    const padSize = Math.min(padSpot.w, padSpot.d) * 0.8;
    S.platforms.push({ x: padSpot.x, z: padSpot.z, hw: padSize / 2, hd: padSize / 2, rot: 0, y: hy, c: 1, s: 0 });
    const hTex = canvasTexture(256, 256, (c2, w, h) => {
      c2.fillStyle = '#3a3f46'; c2.fillRect(0, 0, w, h); c2.strokeStyle = '#f2f2ee'; c2.lineWidth = 12; c2.beginPath(); c2.arc(w / 2, h / 2, 100, 0, 6.3); c2.stroke();
      c2.fillStyle = '#f2f2ee'; c2.font = 'bold 150px Arial'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText('H', w / 2, h / 2 + 8);
    });
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(padSize, padSize).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: hTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    pad.position.set(padSpot.x, hy + 0.02, padSpot.z); pad.receiveShadow = true; group.add(pad);
    S.spawns.cityHelipad = { x: padSpot.x, y: hy, z: padSpot.z, heading: 0 };
  }
}
