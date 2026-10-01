// Road vehicles of Kestrel Island: the Meridian family sedan, the Vanguard GT
// sports coupe, the Ranger pickup and the Trail 4x4. Bodies are lofted from
// superellipse sections and wrapped in a clear-coated metallic paint map with
// panel gaps, door handles, plastic sills and weathering; glasshouses are one
// glossy glass map with body-coloured roof and pillars; wheels have profiled
// tyres with tread normals, alloy rims with brake discs and callipers, wheel
// arches, plates, lamps, mirrors and exhausts. Every model faces +Z, +X is the
// driver's left, and the origin is the axle height so `ground` = wheel radius.

import * as THREE from 'three';
import { stdMat, glowSprite, canvasTexture } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { Human, outfitFor } from '../actors/human.js';
import { loft, smoothSections, paintLivery, LV } from './shapes.js';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
const hex = (c) => '#' + new THREE.Color(c).getHexString();

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent; m.receiveShadow = true;
  parent.add(m);
  return m;
}

export const CAR_COLORS = [0x9a1f22, 0x1f3f7a, 0xd8d8d4, 0x22262a, 0x6c7378, 0x2e5a3c, 0xe0b022, 0xd8661e, 0x7a2a5a, 0x1d6a8a];

// ---- Specs ----------------------------------------------------------------------
// Sections are [z, halfWidth, halfHeight, centreY, squareness]; y is measured
// from the axle. Lower body runs sill-to-beltline, the cabin is the glasshouse.

const SPECS = {
  sedan: {
    name: 'Meridian S', wb: 2.8, track: 1.62, wheelR: 0.34, tyreW: 0.225, clearance: 0.16, length: 4.84, tag: 'KSTL-0142',
    lower: [
      [-2.42, 0.62, 0.2, 0.2, 2.6], [-2.34, 0.8, 0.27, 0.18, 2.8], [-2.1, 0.9, 0.31, 0.15, 3.2], [-1.2, 0.93, 0.32, 0.13, 3.6],
      [0.4, 0.93, 0.31, 0.13, 3.6], [1.5, 0.92, 0.3, 0.14, 3.4], [2.05, 0.89, 0.27, 0.12, 3.1], [2.32, 0.8, 0.22, 0.06, 2.7], [2.42, 0.6, 0.16, 0.02, 2.3],
    ],
    cabin: [
      [-1.55, 0.6, 0.06, 0.5, 2.6], [-1.3, 0.7, 0.2, 0.6, 3], [-0.9, 0.73, 0.31, 0.75, 3.1], [-0.2, 0.735, 0.335, 0.775, 3.1],
      [0.5, 0.73, 0.3, 0.74, 3.1], [1.0, 0.7, 0.16, 0.6, 3], [1.28, 0.66, 0.05, 0.49, 2.8],
    ],
    roofV: [0.24, 0.74], win: [[0.18, 0.44], [0.495, 0.81]], doors: [[-0.15, 0.95], [-1.2, -0.2]], hood: [1.15, 2.2], trunk: [-2.22, -1.55],
    lamps: { head: [0.66, 0.1, 2.3, 0.2], tail: [0.7, 0.2, -2.36, 0.22] }, grille: { w: 0.5, y: 0.02, z: 2.4 }, exhaust: 1, mirrors: [0.9, 0.55, 0.95], seat: [0.4, -0.12, -0.35], eye: [0.4, 0.78, -0.02],
    cab: { camDist: 9, camHeight: 2.8 },
  },
  gt: {
    name: 'Vanguard GT', wb: 2.68, track: 1.66, wheelR: 0.345, tyreW: 0.28, clearance: 0.11, length: 4.6, tag: 'KSTL-GT77',
    lower: [
      [-2.3, 0.7, 0.2, 0.14, 2.5], [-2.22, 0.86, 0.26, 0.15, 2.8], [-1.9, 0.96, 0.3, 0.14, 3.2], [-1.0, 0.98, 0.3, 0.12, 3.5],
      [0.5, 0.97, 0.29, 0.12, 3.4], [1.5, 0.94, 0.24, 0.08, 3], [2.05, 0.86, 0.17, 0.01, 2.7], [2.28, 0.7, 0.11, -0.05, 2.4], [2.3, 0.5, 0.07, -0.08, 2.2],
    ],
    cabin: [
      [-1.3, 0.6, 0.05, 0.45, 2.4], [-0.95, 0.72, 0.16, 0.55, 2.8], [-0.4, 0.74, 0.25, 0.64, 3], [0.2, 0.72, 0.23, 0.62, 3],
      [0.75, 0.66, 0.14, 0.52, 2.8], [1.15, 0.6, 0.04, 0.4, 2.5],
    ],
    roofV: [0.3, 0.72], win: [[0.245, 0.83]], doors: [[-0.6, 0.85]], hood: [1.25, 2.1], trunk: [-2.1, -1.5],
    lamps: { head: [0.72, 0.03, 2.08, 0.12], tail: [0.78, 0.2, -2.24, 0.16] }, grille: { w: 0.55, y: -0.03, z: 2.3 }, exhaust: 2, mirrors: [0.96, 0.46, 0.6], seat: [0.42, -0.34, -0.2], eye: [0.42, 0.64, 0.02],
    wing: true, cab: { camDist: 8.5, camHeight: 2.4 },
  },
  pickup: {
    name: 'Ranger', wb: 3.2, track: 1.72, wheelR: 0.41, tyreW: 0.27, clearance: 0.24, length: 5.4, tag: 'KSTL-4X4R',
    lower: [
      [-2.7, 0.9, 0.3, 0.32, 4], [-2.65, 0.95, 0.35, 0.32, 4], [-1.0, 0.96, 0.36, 0.3, 4.5], [0.6, 0.96, 0.36, 0.3, 4.5],
      [1.9, 0.95, 0.35, 0.3, 4], [2.5, 0.92, 0.3, 0.26, 3.4], [2.7, 0.8, 0.24, 0.2, 2.8], [2.72, 0.6, 0.16, 0.16, 2.4],
    ],
    cabin: [
      [-0.1, 0.8, 0.1, 0.78, 3.4], [0.05, 0.9, 0.34, 0.92, 4], [0.5, 0.9, 0.42, 1.0, 4], [1.15, 0.88, 0.42, 1.0, 4],
      [1.5, 0.84, 0.25, 0.84, 3.4], [1.75, 0.8, 0.06, 0.66, 3],
    ],
    roofV: [0.1, 0.72], win: [[0.16, 0.35], [0.405, 0.78]], doors: [[0.15, 0.85], [-0.45, 0.14]], hood: [1.85, 2.5], trunk: null,
    lamps: { head: [0.7, 0.22, 2.68, 0.2], tail: [0.86, 0.5, -2.68, 0.2] }, grille: { w: 0.55, y: 0.2, z: 2.72 }, exhaust: 1, mirrors: [1.0, 0.98, 1.5], seat: [0.42, -0.02, 0.5], eye: [0.42, 1.14, 0.62],
    bed: true, cab: { camDist: 10.5, camHeight: 3.3 },
  },
  jeep: {
    name: 'Trail 4x4', wb: 2.45, track: 1.62, wheelR: 0.42, tyreW: 0.29, clearance: 0.3, length: 4.2, tag: 'KSTL-TRL5',
    lower: [
      [-2.1, 0.84, 0.36, 0.36, 5], [-2.07, 0.9, 0.42, 0.38, 5], [-0.6, 0.93, 0.43, 0.38, 5.4], [0.9, 0.93, 0.42, 0.38, 5.4],
      [1.6, 0.92, 0.32, 0.32, 5], [2.05, 0.9, 0.27, 0.28, 4.4], [2.1, 0.78, 0.22, 0.26, 3.4],
    ],
    cabin: [
      [-2.0, 0.86, 0.06, 0.82, 5], [-1.98, 0.88, 0.5, 1.28, 5.2], [-0.3, 0.9, 0.52, 1.3, 5.4], [0.85, 0.88, 0.48, 1.26, 5.2],
      [1.05, 0.86, 0.3, 1.05, 4.4], [1.15, 0.85, 0.05, 0.8, 3.5],
    ],
    roofV: [0.02, 0.88], win: [[0.095, 0.46], [0.52, 0.87]], doors: [[0.05, 0.9], [-0.9, 0.0]], hood: [1.15, 2.0], trunk: null,
    lamps: { head: [0.62, 0.36, 2.07, 0.2, 'round'], tail: [0.85, 0.3, -2.1, 0.13] }, grille: { w: 0.5, y: 0.3, z: 2.1, slots: true }, exhaust: 0, mirrors: [1.03, 0.92, 1.0], seat: [0.4, 0.03, -0.1], eye: [0.4, 1.32, 0.1],
    spare: true, rack: true, cab: { camDist: 9, camHeight: 3.3 },
  },
};

export const CAR_TYPES = Object.keys(SPECS);
export const CAR_NAMES = Object.fromEntries(CAR_TYPES.map((k) => [k, SPECS[k].name]));

// ---- Textures ---------------------------------------------------------------------

function paintMaps(type, color) {
  const S = SPECS[type], hx = hex(color);
  const z0 = S.lower[0][0], z1 = S.lower[S.lower.length - 1][0];
  const zv = (z) => (z - z0) / (z1 - z0);
  const body = paintLivery(1024, 2048, (c, p, r, w, h) => {
    const rnd = mulberry32(type.length * 91 + 7);
    c.fillStyle = hx; c.fillRect(0, 0, w, h);
    // Metallic flake and a soft top-light gradient.
    for (let i = 0; i < 5000; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * 0.06})`; c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.1)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Plastic sills and bumper skirts.
    c.fillStyle = '#1a1b1d'; LV.rect(c, 0, 0, 0.13, 1, w, h); LV.rect(c, 0.87, 0, 1, 1, w, h);
    LV.rect(c, 0, 0, 1, 0.012, w, h); LV.rect(c, 0, 0.988, 1, 1, w, h);
    // Panel gaps: doors, hood, boot lid, fuel flap.
    p.strokeStyle = '#000'; p.lineWidth = 3;
    for (const [a, b] of S.doors) for (const [u0, u1] of [[0.2, 0.33], [0.67, 0.8]]) p.strokeRect(u0 * w, (1 - zv(b)) * h, (u1 - u0) * w, (zv(b) - zv(a)) * h);
    p.strokeRect(0.42 * w, (1 - zv(S.hood[1])) * h, 0.16 * w, (zv(S.hood[1]) - zv(S.hood[0])) * h);
    if (S.trunk) p.strokeRect(0.42 * w, (1 - zv(S.trunk[1])) * h, 0.16 * w, (zv(S.trunk[1]) - zv(S.trunk[0])) * h);
    p.lineWidth = 2; p.strokeRect(0.7 * w, (1 - zv(-1.75)) * h, 0.03 * w, 0.03 * h);
    // Door handles, side repeaters, badge.
    c.fillStyle = '#c9ccd0';
    for (const u of [0.315, 0.685]) for (const [a, b] of S.doors) c.fillRect(u * w - 4, (1 - zv(a + (b - a) * 0.2)) * h - 14, 8, 28);
    for (const u of [0.27, 0.73]) { c.fillStyle = '#ffb040'; c.fillRect(u * w - 4, (1 - zv(1.7)) * h, 8, 14); }
    LV.text(c, 'KESTREL', 0.5, zv(S.trunk ? -2.2 : -2.0), w, h, 'left', 'bold 26px Arial', '#d0d3d6');
    LV.rivets(p, w, h, 500, rnd);
    for (let i = 0; i < 250; i++) { c.fillStyle = `rgba(60,55,50,${rnd() * 0.05})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 6 + rnd() * 30); }
    r.fillStyle = '#4a4a4a'; r.fillRect(0, 0, w, h);
    r.fillStyle = '#c0c0c0'; LV.rect(r, 0, 0, 0.13, 1, w, h); LV.rect(r, 0.87, 0, 1, 1, w, h);
  }, { seam: 2.6 });
  const cabin = paintLivery(512, 1024, (c, p, r, w, h) => {
    c.fillStyle = '#0a1016'; c.fillRect(0, 0, w, h);
    r.fillStyle = '#141414'; r.fillRect(0, 0, w, h);
    // Body-coloured sides with window openings, roof rails and a roof panel.
    const solid = (u0, v0, u1, v1) => { c.fillStyle = hx; LV.rect(c, u0, v0, u1, v1, w, h); r.fillStyle = '#4a4a4a'; LV.rect(r, u0, v0, u1, v1, w, h); };
    const glassRect = (u0, v0, u1, v1) => { c.fillStyle = '#0a1016'; LV.rect(c, u0, v0, u1, v1, w, h); r.fillStyle = '#141414'; LV.rect(r, u0, v0, u1, v1, w, h); };
    for (const [a0, a1] of [[0.0, 0.4], [0.6, 1.0]]) {
      solid(a0, 0, a1, 1);
      for (const [v0, v1] of S.win) glassRect(a0 === 0 ? 0.2 : 0.62, v0, a0 === 0 ? 0.36 : 0.78, v1);
    }
    solid(0.4, S.roofV[0], 0.6, S.roofV[1]);                       // roof panel
    p.strokeStyle = '#000'; p.lineWidth = 2;
    LV.panelGrid(p, w, h, [S.roofV[0], S.roofV[1]], [0.4, 0.6]);
    for (const [v0, v1] of S.win) for (const u of [0.2, 0.36, 0.62, 0.78]) p.strokeRect(u * w - 1, (1 - v1) * h, 2, (v1 - v0) * h);
  });
  // Separate the opaque roof/pillars from the window glass. The former
  // all-opaque glasshouse hid the interior and blocked the driver's view.
  const mask = (glass) => canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = glass ? '#fff' : '#000'; ctx.fillRect(0, 0, w, h);
    const rect = (u0, v0, u1, v1, solid) => {
      ctx.fillStyle = (solid !== glass) ? '#fff' : '#000'; LV.rect(ctx, u0, v0, u1, v1, w, h);
    };
    for (const [a0, a1] of [[0, 0.4], [0.6, 1]]) {
      rect(a0, 0, a1, 1, true);
      for (const [v0, v1] of S.win) rect(a0 === 0 ? 0.2 : 0.62, v0, a0 === 0 ? 0.36 : 0.78, v1, false);
    }
    rect(0.4, S.roofV[0], 0.6, S.roofV[1], true);
  }, { srgb: false });
  return { body, cabin, solidMask: mask(false), glassMask: mask(true) };
}

function tyreNormal() {
  return once('tyreN', () => {
    const t = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, w, h);
      // Tread blocks in the middle 40 % of the profile, sipes across them.
      for (let x = 0; x < w; x += 16) {
        ctx.fillStyle = '#b070ff'; ctx.fillRect(x, h * 0.3, 2, h * 0.4);
        ctx.fillStyle = '#5090ff'; ctx.fillRect(x + 8, h * 0.3, 2, h * 0.4);
      }
      ctx.fillStyle = '#8080ff'; ctx.fillRect(0, h * 0.48, w, 3);
      ctx.fillStyle = '#7070ff'; ctx.fillRect(0, h * 0.5, w, 6);
    }, { repeat: true, srgb: false });
    t.repeat.set(3, 1);
    return t;
  });
}

function rimFace(style) {
  return once('rim' + style, () => canvasTexture(256, 256, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#15161a'; ctx.fillRect(0, 0, w, w);
    const spokes = style === 'gt' ? 10 : style === 'off' ? 6 : 5;
    ctx.fillStyle = style === 'off' ? '#4a4d52' : '#c9ccd0';
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      ctx.save(); ctx.translate(c, c); ctx.rotate(a);
      if (style === 'gt') { ctx.fillRect(-4, 24, 8, 92); ctx.rotate(0.1); ctx.fillRect(-4, 24, 8, 92); }
      else if (style === 'off') { ctx.fillRect(-11, 18, 22, 100); }
      else { ctx.beginPath(); ctx.moveTo(-6, 20); ctx.lineTo(-12, 118); ctx.lineTo(12, 118); ctx.lineTo(6, 20); ctx.fill(); ctx.fillRect(-16, 96, 32, 22); }
      ctx.restore();
    }
    ctx.strokeStyle = style === 'off' ? '#6a6d72' : '#e8ebef'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(c, c, 118, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2a2c30'; ctx.beginPath(); ctx.arc(c, c, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8dade'; ctx.beginPath(); ctx.arc(c, c, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8d92';
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(c + Math.cos(a) * 30, c + Math.sin(a) * 30, 4, 0, Math.PI * 2); ctx.fill(); }
  }));
}

function plateTexture(text) {
  return once('plate' + text, () => canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f2f2ee'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1d3e7a'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#1d3e7a'; ctx.fillRect(4, 4, 26, h - 8);
    ctx.fillStyle = '#16202a'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2 + 12, h / 2 + 2);
  }));
}

function grilleTexture(slots) {
  return once('grille' + slots, () => canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#0e0f11'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a2c30';
    if (slots) for (let x = 20; x < w - 10; x += 30) ctx.fillRect(x, 8, 16, h - 16);
    else for (let y = 8; y < h; y += 10) ctx.fillRect(6, y, w - 12, 4);
    ctx.strokeStyle = '#8a8d92'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
  }));
}

// ---- Wheels ---------------------------------------------------------------------

function tyreGeometry(R, W) {
  const r = R * 0.68;
  const pts = [[r + 0.005, -W * 0.44], [r + 0.03, -W * 0.5], [R * 0.86, -W * 0.52], [R * 0.965, -W * 0.44], [R, -W * 0.28], [R, W * 0.28], [R * 0.965, W * 0.44], [R * 0.86, W * 0.52], [r + 0.03, W * 0.5], [r + 0.005, W * 0.44]];
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 36);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function buildWheel(S, style, side) {
  const R = S.wheelR, W = S.tyreW, r = R * 0.68;
  const outer = new THREE.Group();          // mirrored for the right side
  const spin = new THREE.Group();
  outer.add(spin);
  const rubber = once('rubber' + style, () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92, normalMap: tyreNormal(), normalScale: new THREE.Vector2(1.6, 1.6) }));
  add(spin, once(`tyreG${R}_${W}`, () => tyreGeometry(R, W)), rubber);
  const alloy = once('alloy' + style, () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: rimFace(style), metalness: 0.85, roughness: 0.28 }));
  const face = once(`faceG${r}`, () => new THREE.CircleGeometry(r * 1.02, 40).rotateY(Math.PI / 2));
  add(spin, face, alloy, W * 0.42, 0, 0);
  const barrel = once(`barrelG${r}_${W}`, () => new THREE.CylinderGeometry(r, r, W * 0.9, 32, 1, true).rotateZ(Math.PI / 2));
  add(spin, barrel, stdMat(0x7a7d82, { rough: 0.35, metal: 0.9, side: THREE.DoubleSide }));
  // Brake disc turns with the wheel; the calliper is fixed to the hub.
  const disc = once(`discG${r}`, () => new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.03, 32).rotateZ(Math.PI / 2));
  add(spin, disc, once('disc', () => new THREE.MeshStandardMaterial({ color: 0x55575b, metalness: 0.9, roughness: 0.45 })), W * 0.12, 0, 0);
  const cal = new THREE.Mesh(once(`calG${r}`, () => new THREE.BoxGeometry(0.07, r * 0.6, r * 0.5)), once('cal', () => stdMat(0xc8302a, { rough: 0.4, metal: 0.4 })));
  cal.position.set(W * 0.2, r * 0.45, r * 0.3);
  outer.add(cal);
  if (side < 0) outer.rotation.y = Math.PI;
  return { outer, spin };
}

// ---- The car --------------------------------------------------------------------

function pilot(seed = 9) {
  const h = new Human(outfitFor('crew', mulberry32(seed)), { shadows: false });
  h.state = 'pilot';
  for (let i = 0; i < 40; i++) h.animate(0.05);
  return h;
}

export function buildCar(type = 'sedan', { color = CAR_COLORS[0] } = {}) {
  const S = SPECS[type];
  const g = new THREE.Group();
  const style = type === 'gt' ? 'gt' : type === 'jeep' || type === 'pickup' ? 'off' : 'std';
  const maps = once(`paint:${type}:${color}`, () => paintMaps(type, color));
  const mats = once(`mats:${type}:${color}`, () => ({
    paint: new THREE.MeshPhysicalMaterial({ map: maps.body.map, normalMap: maps.body.normalMap, roughnessMap: maps.body.roughnessMap, roughness: 1, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 1 }),
    cabin: new THREE.MeshPhysicalMaterial({ map: maps.cabin.map, normalMap: maps.cabin.normalMap, roughnessMap: maps.cabin.roughnessMap, alphaMap: maps.solidMask, alphaTest: 0.5, roughness: 1, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.14 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x92aab2, alphaMap: maps.glassMask, alphaTest: 0.01, roughness: 0.09, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.1 }),
  }));
  const { paint, cabin, glass } = mats;
  const dark = stdMat(0x17181a, { rough: 0.7 });
  const chrome = stdMat(0xc8ccd0, { rough: 0.2, metal: 1 });
  const body = once(`bodyG:${type}`, () => loft(smoothSections(S.lower.map(([z, w, h, y, n]) => ({ z, w, h, y, n })), 3), { segs: 44 }));
  add(g, body, paint);
  const cab = once(`cabG:${type}`, () => loft(smoothSections(S.cabin.map(([z, w, h, y, n]) => ({ z, w, h, y, n })), 3), { segs: 40 }));
  add(g, cab, cabin);
  add(g, cab, glass).castShadow = false;

  const zMin = S.lower[0][0], zMax = S.lower[S.lower.length - 1][0];
  add(g, new THREE.BoxGeometry(S.track * 0.92, 0.05, S.length * 0.7), dark, 0, -S.wheelR + S.clearance - 0.005, 0);

  // Grille, plates, lamps.
  const gr = S.grille;
  add(g, new THREE.PlaneGeometry(gr.w * 2, 0.26), new THREE.MeshStandardMaterial({ map: grilleTexture(!!gr.slots), roughness: 0.6, metalness: 0.4 }), 0, gr.y, gr.z + 0.005, 0, 0, 0).castShadow = false;
  add(g, new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshStandardMaterial({ map: plateTexture(S.tag), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }), 0, gr.y - 0.2, gr.z + 0.006);
  const backZ = zMin - 0.005;
  add(g, new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshStandardMaterial({ map: plateTexture(S.tag), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }), 0, S.lamps.tail[1] - 0.02, backZ, 0, Math.PI, 0);

  const headMat = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, emissive: 0xfff0d0, emissiveIntensity: 0.05, roughness: 0.14, metalness: 0 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0d10, emissive: 0xff1a12, emissiveIntensity: 0.15, roughness: 0.2 });
  const [hx, hy, hz, hs, hShape] = S.lamps.head, [tx, ty, tz, ts] = S.lamps.tail;
  const headGlow = [], tailGlow = [];
  for (const sd of [1, -1]) {
    const lens = once('lensG', () => new THREE.SphereGeometry(1, 20, 12));
    const hm = add(g, lens, headMat, sd * hx, hy, hz - 0.03);
    hm.scale.set(hShape === 'round' ? hs * 0.55 : hs * 1.1, hs * (hShape === 'round' ? 0.55 : 0.42), 0.08);
    add(g, new THREE.TorusGeometry(hs * 0.55, 0.012, 6, 24), chrome, sd * hx, hy, hz - 0.01).visible = hShape === 'round';
    const tm = add(g, new THREE.SphereGeometry(1, 16, 10), tailMat, sd * tx, ty, tz + 0.035);
    tm.scale.set(ts * 1.05, ts * 0.3, 0.06);
    const hg = glowSprite(0xfff2d8, 1.6, 0); hg.position.set(sd * hx, hy, hz + 0.25); g.add(hg); headGlow.push(hg);
    const tg = glowSprite(0xff2a1a, 1.2, 0); tg.position.set(sd * tx, ty, tz - 0.2); g.add(tg); tailGlow.push(tg);
  }
  // Head-light beams and a light pool on the road.
  const beamGeo = new THREE.ConeGeometry(2.6, 22, 20, 1, true); beamGeo.translate(0, -11, 0); beamGeo.rotateX(-Math.PI / 2 - 0.08);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(0, hy, hz); beam.frustumCulled = false; g.add(beam);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 14), new THREE.MeshBasicMaterial({ map: once('pool', () => canvasTexture(64, 128, (ctx, w, h) => { const gr2 = ctx.createRadialGradient(w / 2, h * 0.7, 2, w / 2, h * 0.7, h * 0.7); gr2.addColorStop(0, 'rgba(255,240,200,0.55)'); gr2.addColorStop(1, 'rgba(255,240,200,0)'); ctx.fillStyle = gr2; ctx.fillRect(0, 0, w, h); }, { srgb: false })), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.rotation.z = Math.PI; pool.position.set(0, -S.wheelR + 0.06, hz + 8); g.add(pool);

  // Mirrors.
  for (const sd of [1, -1]) {
    const [mx, my, mz] = S.mirrors;
    add(g, new THREE.BoxGeometry(0.18, 0.11, 0.07), paint, sd * mx, my, mz);
    add(g, new THREE.BoxGeometry(0.06, 0.05, 0.16), dark, sd * (mx - 0.1), my - 0.04, mz - 0.03);
  }
  // Exhausts.
  for (let k = 0; k < S.exhaust; k++) {
    const x = S.exhaust === 2 ? (k ? -0.55 : 0.55) : 0.62;
    add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.16, 14), chrome, x, -S.wheelR + S.clearance + 0.07, zMin + 0.05, Math.PI / 2, 0, 0);
  }
  // Wheel arches: dark half-discs on the flanks around the tyres.
  const wallW = S.lower[Math.floor(S.lower.length / 2)][1];
  const arch = once(`archG:${type}`, () => new THREE.CircleGeometry(S.wheelR * 1.14, 32, 0, Math.PI));
  for (const z of [S.wb / 2, -S.wb / 2]) for (const sd of [1, -1]) {
    const a = add(g, arch, new THREE.MeshBasicMaterial({ color: 0x050506 }), sd * (wallW + 0.006), 0, z, 0, sd * Math.PI / 2, 0);
    a.rotation.order = 'YXZ'; a.rotation.set(0, sd * Math.PI / 2, 0);
    a.castShadow = false;
  }
  // Wheels.
  const wheels = [], pivots = [];
  for (const [zi, front] of [[S.wb / 2, true], [-S.wb / 2, false]]) for (const sd of [1, -1]) {
    const wl = buildWheel(S, style, sd);
    const pivot = new THREE.Group();
    pivot.position.set(sd * (S.lower[Math.floor(S.lower.length / 2)][1] - 0.07), 0, zi);
    pivot.add(wl.outer);
    g.add(pivot);
    wheels.push({ spin: wl.spin, side: sd, front });
    if (front) pivots.push(pivot);
  }

  // Type-specific parts.
  if (S.wing) {
    add(g, new THREE.BoxGeometry(1.7, 0.035, 0.32), stdMat(0x111214, { rough: 0.4 }), 0, 0.62, zMin + 0.32);
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.05, 0.2, 0.28), stdMat(0x111214, { rough: 0.4 }), sd * 0.55, 0.5, zMin + 0.32);
    add(g, new THREE.BoxGeometry(1.5, 0.09, 0.5), dark, 0, -S.wheelR + S.clearance + 0.05, zMin + 0.25);      // diffuser
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.02, 0.1, 0.5), dark, sd * 0.98, 0.16, 0.95);        // side intakes
  }
  if (S.bed) {
    const bz0 = -2.6, bz1 = -0.35, bw = 0.94, wallH = 0.42, floorY = 0.3;
    add(g, new THREE.BoxGeometry(bw * 2, 0.06, bz1 - bz0), dark, 0, floorY + 0.08, (bz0 + bz1) / 2);
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.07, wallH, bz1 - bz0), paint, sd * (bw - 0.02), floorY + 0.08 + wallH / 2, (bz0 + bz1) / 2);
    add(g, new THREE.BoxGeometry(bw * 2, wallH, 0.07), paint, 0, floorY + 0.08 + wallH / 2, bz1);
    add(g, new THREE.BoxGeometry(bw * 2, wallH, 0.07), paint, 0, floorY + 0.08 + wallH / 2, bz0);
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.05, 0.07, bz1 - bz0), chrome, sd * (bw - 0.02), floorY + 0.08 + wallH, (bz0 + bz1) / 2);
    // Roll-bar hoop behind the cab.
    add(g, new THREE.BoxGeometry(bw * 1.6, 0.05, 0.05), stdMat(0x2a2c2e, { rough: 0.5, metal: 0.6 }), 0, floorY + 0.7, bz1 - 0.05);
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.05, 0.6, 0.05), stdMat(0x2a2c2e, { rough: 0.5, metal: 0.6 }), sd * bw * 0.8, floorY + 0.4, bz1 - 0.05);
  }
  if (S.spare) {
    const sp = buildWheel(S, style, 1); sp.outer.rotation.set(0, 0, 0);
    sp.outer.rotation.z = Math.PI / 2; sp.outer.position.set(0, 0.62, zMin - 0.14); g.add(sp.outer);
    sp.outer.rotation.set(Math.PI / 2, 0, Math.PI / 2 + Math.PI);
  }
  if (S.rack) {
    const bar = stdMat(0x1a1b1d, { rough: 0.5, metal: 0.6 });
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.04, 0.04, 1.9), bar, sd * 0.78, 1.83, -0.35);
    for (let k = 0; k < 5; k++) add(g, new THREE.BoxGeometry(1.58, 0.035, 0.04), bar, 0, 1.83, -1.25 + k * 0.45);
    add(g, new THREE.BoxGeometry(0.1, 0.6, 0.06), bar, 0.9, 1.5, 1.0);
    // Roll-over front bull-bar.
    add(g, new THREE.BoxGeometry(1.5, 0.05, 0.05), chrome, 0, 0.05, zMax + 0.12);
    for (const sd of [1, -1]) add(g, new THREE.BoxGeometry(0.05, 0.4, 0.05), chrome, sd * 0.7, 0.2, zMax + 0.1);
  }
  // Interior: seats, dash and a steering wheel so the cabin reads through glass.
  const [sx, sy, sz] = S.seat;
  const seatMat = stdMat(0x24262a, { rough: 0.9 });
  for (const sd of [1, -1]) {
    add(g, new THREE.BoxGeometry(0.42, 0.14, 0.5), seatMat, sd * sx, sy + 0.2, sz - 0.05);
    add(g, new THREE.BoxGeometry(0.42, 0.55, 0.12), seatMat, sd * sx, sy + 0.5, sz - 0.32, -0.2, 0, 0);
  }
  add(g, new THREE.BoxGeometry(1.5, 0.22, 0.4), seatMat, 0, sy + 0.34, sz + 0.75);
  const wheel = add(g, new THREE.TorusGeometry(0.17, 0.02, 8, 24), dark, sx, sy + 0.5, sz + 0.52, -0.6, 0, 0);
  const drv = pilot(type.length * 13);
  drv.root.scale.setScalar(0.94);
  drv.root.position.set(sx, sy - 0.05, sz - 0.25);
  g.add(drv.root);

  return {
    group: g,
    parts: { wheels, pivots, wheelbase: S.wb, track: S.track, headMat, tailMat, headGlow, tailGlow, beam, pool, steerWheel: wheel, pilot: drv, body: g },
    ground: S.wheelR, radius: 2.4, length: S.length, camDist: S.cab.camDist, camHeight: S.cab.camHeight, wb: S.wb, track: S.track, spec: S,
  };
}

// Drive the visible parts of a car: wheel spin, steering, lamps and brake lights.
// vf = forward speed (m/s), steer = road-wheel angle (positive = right).
export function animateCarParts(P, wheelR, dt, { vf = 0, steer = 0, lit = false, braking = false, night = 0 } = {}) {
  const ang = (vf / wheelR) * dt;
  for (const w of P.wheels) w.spin.rotation.x += ang * w.side;
  for (const pv of P.pivots) {
    // Inner wheel turns farther than the outer wheel at low speed.
    const radius = Math.abs(steer) > 1e-4 ? P.wheelbase / Math.tan(Math.abs(steer)) : Infinity;
    const side = Math.sign(pv.position.x);
    const offset = side * Math.sign(steer) * P.track / 2;
    pv.rotation.y = -Math.sign(steer) * Math.atan(P.wheelbase / Math.max(0.2, radius + offset));
  }
  P.steerWheel.rotation.z = -steer * 3.2;
  P.headMat.emissiveIntensity = lit ? 3 : 0.05;
  for (const g of P.headGlow) g.material.opacity = lit ? 0.35 + 0.65 * night : 0;
  P.beam.material.opacity = lit ? 0.02 + 0.06 * night : 0;
  P.pool.material.opacity = lit ? night * 0.7 : 0;
  P.tailMat.emissiveIntensity = braking ? 2.8 : lit ? 1.1 : 0.12;
  for (const g of P.tailGlow) g.material.opacity = braking ? 1 : lit ? 0.45 : 0;
}
