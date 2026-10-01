// Procedural aircraft modelled on real types: an F-16-style fighter, a
// Cessna-172-style light plane, an H145-style rescue helicopter and an
// A320-style airliner. Fuselages are lofted from superellipse sections and
// carry painted liveries with panel-line normal maps, rivets, markings,
// glossy windows and weathering. Every model faces +Z, +Y is up and the
// origin is the centre of mass. `ground` is the drop from the origin to the
// wheels or skids so vehicles park exactly on the tarmac.

import * as THREE from 'three';
import { stdMat, glowSprite, canvasTexture } from '../core/util.js';
import { Human, outfitFor } from '../actors/human.js';
import { mulberry32 } from '../core/noise.js';
import { buildNova } from './nova.js';
import { loft, smoothSections, planform, fin, paintLivery, LV, panelSurface } from './shapes.js';

const glass = () => new THREE.MeshStandardMaterial({ color: 0x0c1720, roughness: 0.03, metalness: 0.9, emissive: 0x08121a, emissiveIntensity: 0.4, transparent: true, opacity: 0.86 });
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function navLights(group, left, right, tail) {
  const red = glowSprite(0xff2a2a, 1.6); red.position.copy(left);
  const green = glowSprite(0x2aff5a, 1.6); green.position.copy(right);
  const strobe = glowSprite(0xffffff, 2.4); strobe.position.copy(tail);
  group.add(red, green, strobe);
  return { red, green, strobe };
}

function pilot(role = 'pilot', seed = 5) {
  const h = new Human(outfitFor(role, mulberry32(seed)), { shadows: false });
  h.state = 'pilot';
  for (let i = 0; i < 40; i++) h.animate(0.05);
  return h;
}

// Oleo strut + wheel with hub.
function gearLeg(group, x, z, len, wheelR = 0.38, { width = 0.24, twin = false } = {}) {
  const leg = new THREE.Group();
  const chrome = stdMat(0xc8ccd0, { rough: 0.2, metal: 1 });
  const strut = stdMat(0x3a3e42, { rough: 0.45, metal: 0.8 });
  add(leg, new THREE.CylinderGeometry(0.075, 0.075, len * 0.6, 10), strut, 0, -len * 0.3, 0);
  add(leg, new THREE.CylinderGeometry(0.05, 0.05, len * 0.45, 10), chrome, 0, -len * 0.75, 0);
  const tyre = new THREE.TorusGeometry(wheelR * 0.72, wheelR * 0.3, 10, 22); tyre.rotateY(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, width * 0.8, 16); hub.rotateZ(Math.PI / 2);
  for (const off of twin ? [-width * 0.6, width * 0.6] : [0]) {
    add(leg, tyre, stdMat(0x131313, { rough: 0.85 }), off, -len, 0);
    add(leg, hub, stdMat(0x9aa0a6, { rough: 0.35, metal: 0.8 }), off, -len, 0);
  }
  leg.position.set(x, 0, z);
  group.add(leg);
  return leg;
}

// A flat decal (roundel, tail number) lying just off a surface.
function decal(parent, tex, w, h, pos, rot) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
  m.position.copy(pos); m.rotation.copy(rot);
  parent.add(m);
  return m;
}

function roundel() {
  return once('roundel', () => canvasTexture(256, 256, (ctx, w) => {
    const c = w / 2;
    ctx.clearRect(0, 0, w, w);
    [['#1d3e7a', 0.48], ['#f4f4f4', 0.34], ['#c8302a', 0.2]].forEach(([col, r]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c, c, w * r, 0, Math.PI * 2); ctx.fill(); });
  }));
}

function textDecal(text, { w = 512, h = 128, color = '#1f262c', font = 'bold 84px Arial', bg = null } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = color; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

function aim9(parent, x, y, z) {
  const g = new THREE.Group();
  const white = stdMat(0xe6e6e0, { rough: 0.5 });
  const grey = stdMat(0x7f878d, { rough: 0.45, metal: 0.3 });
  const body = new THREE.CylinderGeometry(0.064, 0.064, 2.6, 12); body.rotateX(Math.PI / 2);
  add(g, body, white);
  const nose = new THREE.ConeGeometry(0.064, 0.3, 12); nose.rotateX(Math.PI / 2); add(g, nose, grey, 0, 0, 1.45);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    add(g, new THREE.BoxGeometry(0.01, 0.22, 0.18), grey, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 1.0, 0, 0, a);
    add(g, new THREE.BoxGeometry(0.01, 0.3, 0.32), grey, Math.cos(a) * 0.14, Math.sin(a) * 0.14, -1.1, 0, 0, a);
  }
  add(g, new THREE.BoxGeometry(0.06, 0.1, 0.25), stdMat(0xb8a040), 0, 0, 0.55);
  g.position.set(x, y, z);
  parent.add(g);
}

// ---------------------------------------------------------------------------
// F-7 Falcon: single-engine multirole fighter in two-tone air-superiority grey.

function fighterLivery(tailNo) {
  return paintLivery(1024, 2048, (c, p, r, w, h) => {
    const rnd = mulberry32(88);
    // Two-tone counter-shading: darker upper surfaces, lighter belly.
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#a9b3ba'); g.addColorStop(0.22, '#99a3aa'); g.addColorStop(0.36, '#6e7982');
    g.addColorStop(0.64, '#6e7982'); g.addColorStop(0.78, '#99a3aa'); g.addColorStop(1, '#a9b3ba');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Weathering streaks.
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '40,45,50' : '200,205,210'},${rnd() * 0.05})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 10 + rnd() * 60); }
    // Radome.
    c.fillStyle = '#4e5860'; LV.rect(c, 0, 0.945, 1, 1, w, h);
    // Anti-glare panel ahead of the canopy.
    c.fillStyle = '#2f363c'; LV.rect(c, 0.44, 0.83, 0.56, 0.945, w, h);
    // Panels and rivets.
    LV.panelGrid(p, w, h, [0.1, 0.16, 0.24, 0.31, 0.38, 0.46, 0.53, 0.6, 0.67, 0.74, 0.8, 0.945], [0.06, 0.16, 0.27, 0.38, 0.62, 0.73, 0.84, 0.94]);
    p.strokeStyle = '#000'; p.lineWidth = 1.4;
    for (const [u0, v0, u1, v1] of [[0.4, 0.5, 0.6, 0.58], [0.24, 0.32, 0.3, 0.4], [0.7, 0.32, 0.76, 0.4], [0.45, 0.2, 0.55, 0.28], [0.03, 0.62, 0.1, 0.7]]) p.strokeRect(u0 * w, (1 - v1) * h, (u1 - u0) * w, (v1 - v0) * h);
    LV.rivets(p, w, h, 5000, rnd);
    // National insignia and markings on both sides.
    for (const [u, side] of [[0.3, 'left'], [0.7, 'right']]) {
      const cx = u * w, cy = (1 - 0.34) * h;
      [['#1d3e7a', 56], ['#f1f1ee', 40], ['#c8302a', 23]].forEach(([col, rr]) => { c.fillStyle = col; c.beginPath(); c.ellipse(cx, cy, rr, rr * 0.83, 0, 0, Math.PI * 2); c.fill(); });
      LV.text(c, 'KESTREL AIR FORCE', u + (side === 'left' ? 0.02 : -0.02), 0.56, w, h, side, 'bold 26px Arial', '#2a3238');
      LV.text(c, tailNo, u + (side === 'left' ? 0.035 : -0.035), 0.2, w, h, side, 'bold 30px Arial', '#2a3238');
      LV.text(c, 'RESCUE', u + (side === 'left' ? 0.09 : -0.09), 0.79, w, h, side, 'bold 16px Arial', '#c8302a');
    }
    LV.text(c, 'NO STEP', 0.46, 0.44, w, h, 'left', '12px Arial', '#2a3238');
    LV.text(c, 'NO STEP', 0.54, 0.44, w, h, 'right', '12px Arial', '#2a3238');
    // Roughness: paint is fairly matte, radome slightly glossier.
    r.fillStyle = '#b8b8b8'; r.fillRect(0, 0, w, h);
    r.fillStyle = '#8a8a8a'; LV.rect(r, 0, 0.945, 1, 1, w, h);
  });
}

export function buildFighter({ tailNo = '88-0412' } = {}) {
  const g = new THREE.Group();
  const lv = once('fighterLivery' + tailNo, () => fighterLivery(tailNo));
  const skin = new THREE.MeshPhysicalMaterial({ map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, roughness: 1, metalness: 0.15, clearcoat: 0.24, clearcoatRoughness: 0.42 });
  const surf = once('fighterSurf', () => panelSurface('#78838c', { rough: 0.62, metal: 0.12, repeat: 0.3 }));
  const dark = stdMat(0x3a4146, { rough: 0.55, metal: 0.3 });
  const metal = stdMat(0x5a5550, { rough: 0.35, metal: 1 });
  const hot = stdMat(0x3a2e28, { rough: 0.45, metal: 1 });
  const body = loft(smoothSections([
    { z: -7.45, w: 0.66, h: 0.66, y: 0.02 }, { z: -6.9, w: 0.74, h: 0.72, y: 0.02 }, { z: -5.5, w: 0.86, h: 0.82, y: 0.02 },
    { z: -3.5, w: 1.0, h: 0.92, y: 0.0, n: 2.4 }, { z: -1.5, w: 1.08, h: 0.98, y: -0.03, n: 2.6 }, { z: 0.5, w: 1.08, h: 1.0, y: -0.03, n: 2.6 },
    { z: 2.0, w: 1.0, h: 0.95, y: 0.0, n: 2.3 }, { z: 3.2, w: 0.9, h: 0.85, y: 0.07 }, { z: 4.4, w: 0.78, h: 0.74, y: 0.08 },
    { z: 5.5, w: 0.6, h: 0.58, y: 0.04 }, { z: 6.5, w: 0.4, h: 0.39, y: 0.01 }, { z: 7.3, w: 0.18, h: 0.18, y: 0 }, { z: 7.72, w: 0.015, h: 0.015, y: 0 },
  ], 4), { segs: 40 });
  add(g, body, skin);
  // Dorsal spine blending the canopy into the fin.
  const spine = loft(smoothSections([
    { z: -5.8, w: 0.06, h: 0.04, y: 0.72 }, { z: -4.6, w: 0.3, h: 0.2, y: 0.8 }, { z: -2.0, w: 0.44, h: 0.3, y: 0.87 },
    { z: 1.6, w: 0.44, h: 0.32, y: 0.88 }, { z: 2.6, w: 0.3, h: 0.22, y: 0.82 }, { z: 3.0, w: 0.05, h: 0.05, y: 0.76 },
  ], 3), { segs: 24 });
  add(g, spine, skin);
  // Bubble canopy with frame and ejection seat.
  const canopyG = new THREE.SphereGeometry(0.58, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.55); canopyG.scale(0.92, 0.95, 2.35);
  add(g, canopyG, glass(), 0, 0.72, 3.75);
  const bow = new THREE.TorusGeometry(0.53, 0.035, 6, 24, Math.PI); bow.scale(1, 0.95, 1);
  add(g, bow, dark, 0, 0.74, 2.55);
  const p = pilot('pilot', 11);
  p.root.scale.setScalar(0.92); p.root.position.set(0, -0.15, 3.3);
  g.add(p.root);
  add(g, new THREE.BoxGeometry(0.5, 0.9, 0.2), dark, 0, 0.72, 2.95, -0.25);
  // Chin intake.
  const intake = loft([
    { z: -0.6, w: 0.5, h: 0.3, y: -0.8, n: 3 }, { z: 1.0, w: 0.58, h: 0.4, y: -0.9, n: 3 },
    { z: 2.4, w: 0.62, h: 0.45, y: -0.95, n: 3 }, { z: 3.1, w: 0.62, h: 0.42, y: -0.95, n: 3 },
  ], { segs: 28, capEnd: false });
  add(g, intake, skin);
  add(g, new THREE.CircleGeometry(0.5, 24), stdMat(0x07080a, { rough: 0.9 }), 0, -0.95, 3.02).scale.set(1.15, 0.78, 1);
  // Leading-edge extensions, wings, tailplanes.
  for (const s of [1, -1]) {
    const lerx = add(g, planform([[0.6, 4.1], [1.3, 1.4], [1.3, -0.5], [0.6, -0.5]], 0.07), surf, 0, -0.08, 0); lerx.scale.x = s;
    const w = add(g, planform([[0.95, 1.35], [4.72, -2.25], [4.72, -3.2], [0.95, -3.55]], 0.16), surf, 0, -0.16, 0); w.scale.x = s;
    const st = add(g, planform([[0.55, -5.4], [3.05, -6.95], [3.1, -7.55], [0.55, -7.7]], 0.1), surf, 0, -0.05, 0); st.scale.x = s; st.rotation.z = -s * 0.06;
    // Wingtip rail + missile, underwing pylon + drop tank.
    add(g, new THREE.BoxGeometry(0.12, 0.12, 2.9), dark, s * 4.8, -0.12, -1.8);
    aim9(g, s * 4.8, -0.26, -1.7);
    add(g, new THREE.BoxGeometry(0.08, 0.3, 1.4), dark, s * 2.6, -0.4, -1.2);
    const tank = new THREE.SphereGeometry(0.33, 20, 14); tank.scale(1, 1, 6.6);
    add(g, tank, stdMat(0x8e979d, { rough: 0.55, metal: 0.2 }), s * 2.6, -0.75, -1.0);
    decal(g, roundel(), 0.95, 0.95, new THREE.Vector3(s * 3.3, 0.02, -2.2), new THREE.Euler(-Math.PI / 2, 0, 0));
    // Ventral fins.
    const vf = add(g, fin([[-4.6, -0.55], [-5.2, -1.15], [-5.8, -1.15], [-5.6, -0.55]], 0.06), surf, s * 0.55, 0, 0); vf.rotation.z = s * 0.35;
  }
  add(g, fin([[-4.05, 0.85], [-6.72, 4.3], [-7.75, 4.3], [-7.62, 0.85]], 0.18), surf, 0, 0, 0);
  add(g, new THREE.CylinderGeometry(0.1, 0.12, 1.2, 10).rotateX(Math.PI / 2), dark, 0, 4.25, -7.2);
  const tailTex = textDecal(tailNo.replace('-', ''), { font: 'bold 90px Arial', color: '#1f262c' });
  for (const s of [1, -1]) {
    decal(g, tailTex, 1.3, 0.34, new THREE.Vector3(s * 0.11, 2.3, -6.6), new THREE.Euler(0, s * Math.PI / 2, 0));
    decal(g, textDecal('KAF', { font: 'bold 96px Arial', color: '#2a3238' }), 0.9, 0.24, new THREE.Vector3(s * 0.11, 3.0, -6.95), new THREE.Euler(0, s * Math.PI / 2, 0));
  }
  // Engine nozzle: outer petals, hot inner liner, afterburner.
  const noz = new THREE.CylinderGeometry(0.6, 0.7, 1.15, 28, 1, true); noz.rotateX(Math.PI / 2);
  add(g, noz, metal, 0, 0.02, -7.95);
  const liner = new THREE.CylinderGeometry(0.5, 0.52, 1.0, 24, 1, true); liner.rotateX(Math.PI / 2);
  const linerMesh = add(g, liner, hot, 0, 0.02, -7.9); linerMesh.material.side = THREE.DoubleSide;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    add(g, new THREE.BoxGeometry(0.2, 0.02, 0.5), metal, Math.cos(a) * 0.64, 0.02 + Math.sin(a) * 0.64, -8.45, 0, 0, a + Math.PI / 2);
  }
  const flameGeo = new THREE.ConeGeometry(0.5, 4.5, 20, 1, true); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -2.25);
  const flame = add(g, flameGeo, additive(0xff8a3a, 0.8), 0, 0.02, -8.4);
  const flameCore = add(g, flameGeo.clone().scale(0.55, 0.55, 0.6), additive(0x9ad0ff, 0.9), 0, 0.02, -8.3);
  const nozzleGlow = add(g, new THREE.CircleGeometry(0.5, 24), additive(0xffb070, 0.9), 0, 0.02, -8.4, 0, Math.PI, 0);
  // Landing gear (wheel bottoms sit 2.5 m below the origin).
  const gear = new THREE.Group();
  gearLeg(gear, 0, 4.4, 1.62, 0.3, { width: 0.18 });
  gearLeg(gear, 1.2, -0.8, 1.5, 0.45, { width: 0.26 });
  gearLeg(gear, -1.2, -0.8, 1.5, 0.45, { width: 0.26 });
  gear.position.y = -0.55;
  const taxiLight = glowSprite(0xfff4d8, 0.8, 0.9); taxiLight.position.set(0, -1.2, 4.55); gear.add(taxiLight);
  g.add(gear);
  const nav = navLights(g, new THREE.Vector3(4.9, -0.12, -1.8), new THREE.Vector3(-4.9, -0.12, -1.8), new THREE.Vector3(0, 4.3, -7.8));
  return { group: g, parts: { flame, flameCore, nozzleGlow, gear, nav, pilot: p }, ground: 2.5, radius: 7, length: 15.5, camDist: 24, camHeight: 6 };
}

// ---------------------------------------------------------------------------
// C-2 Skylark: four-seat high-wing touring plane.

function propLivery(reg, stripe) {
  return paintLivery(1024, 1024, (c, p, r, w, h) => {
    const rnd = mulberry32(172);
    c.fillStyle = '#f3f2ec'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(90,80,60,${rnd() * 0.04})`; c.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 10, 6 + rnd() * 30); }
    // Cheatlines sweeping up toward the tail on both sides.
    for (const s of [1, -1]) {
      const u = s > 0 ? 0.2 : 0.8;
      c.fillStyle = stripe;
      c.beginPath();
      c.moveTo(u * w, 0.06 * h); c.lineTo((u + s * 0.03) * w, 0.06 * h);
      c.lineTo((u + s * 0.1) * w, 0.9 * h); c.lineTo((u + s * 0.05) * w, 0.9 * h); c.closePath(); c.fill();
      c.fillStyle = '#20364f';
      c.fillRect(Math.min(u, u + s * 0.018) * w, 0.9 * h, 0.018 * w, -0.8 * h);
    }
    // Windows: windscreen, side windows, rear windows.
    c.fillStyle = '#1b2632'; r.fillStyle = '#101010';
    const win = (u0, v0, u1, v1) => { LV.rect(c, u0, v0, u1, v1, w, h); LV.rect(r, u0, v0, u1, v1, w, h); p.strokeStyle = '#000'; p.lineWidth = 2; p.strokeRect(u0 * w, (1 - v1) * h, (u1 - u0) * w, (v1 - v0) * h); };
    win(0.36, 0.6, 0.64, 0.7);
    for (const [a, b] of [[0.22, 0.34], [0.66, 0.78]]) { win(a, 0.49, b, 0.6); win(a + 0.01, 0.4, b - 0.01, 0.475); }
    // Doors and cowling panels.
    p.strokeStyle = '#000'; p.lineWidth = 2;
    for (const [a, b] of [[0.14, 0.36], [0.64, 0.86]]) p.strokeRect(a * w, (1 - 0.62) * h, (b - a) * w, 0.2 * h);
    LV.panelGrid(p, w, h, [0.14, 0.26, 0.37, 0.72, 0.8, 0.9], [0.5], '#000', 1.2);
    LV.rivets(p, w, h, 1800, rnd);
    // Cowling air inlets.
    c.fillStyle = '#111';
    for (const u of [0.42, 0.58]) { c.beginPath(); c.ellipse(u * w, 0.02 * h, 20, 12, 0, 0, Math.PI * 2); c.fill(); }
    LV.text(c, reg, 0.24, 0.24, w, h, 'left', 'bold 46px Arial', '#20364f');
    LV.text(c, reg, 0.76, 0.24, w, h, 'right', 'bold 46px Arial', '#20364f');
    r.fillStyle = '#707070'; r.fillRect(0, 0, w, h);
    r.fillStyle = '#101010';
    LV.rect(r, 0.36, 0.6, 0.64, 0.7, w, h);
    for (const [a, b] of [[0.22, 0.34], [0.66, 0.78]]) { LV.rect(r, a, 0.49, b, 0.6, w, h); LV.rect(r, a + 0.01, 0.4, b - 0.01, 0.475, w, h); }
  });
}

export function buildProp({ stripe = 0xc8302a, reg = 'N172KI' } = {}) {
  const g = new THREE.Group();
  const stripeHex = '#' + new THREE.Color(stripe).getHexString();
  const lv = once('prop' + reg + stripeHex, () => propLivery(reg, stripeHex));
  const skin = new THREE.MeshPhysicalMaterial({ map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, roughness: 1, metalness: 0.05, clearcoat: 0.32, clearcoatRoughness: 0.34 });
  const white = once('propSurf', () => panelSurface('#f1f0ea', { rough: 0.5, metal: 0.05, repeat: 0.35, cell: 120 }));
  const red = stdMat(stripe, { rough: 0.45 });
  const metal = stdMat(0x5a5e62, { rough: 0.35, metal: 0.9 });
  const body = loft(smoothSections([
    { z: -5.0, w: 0.03, h: 0.05, y: 0.5 }, { z: -4.8, w: 0.1, h: 0.16, y: 0.5 }, { z: -3.8, w: 0.24, h: 0.3, y: 0.45, n: 2.6 },
    { z: -2.6, w: 0.38, h: 0.45, y: 0.4, n: 2.8 }, { z: -1.4, w: 0.55, h: 0.62, y: 0.35, n: 3 }, { z: -0.4, w: 0.62, h: 0.78, y: 0.3, n: 3.4 },
    { z: 1.0, w: 0.62, h: 0.78, y: 0.3, n: 3.4 }, { z: 1.7, w: 0.6, h: 0.68, y: 0.18, n: 3.2 }, { z: 2.6, w: 0.55, h: 0.58, y: 0.08, n: 3 },
    { z: 3.4, w: 0.48, h: 0.45, y: 0.0, n: 2.5 }, { z: 3.55, w: 0.22, h: 0.22, y: 0.0 },
  ], 4), { segs: 36 });
  add(g, body, skin);
  const p = pilot('pilot', 23); p.root.scale.setScalar(0.9); p.root.position.set(0.3, -0.42, 0.75); g.add(p.root);
  // High wing: constant-chord inner panel, tapered outer panel, rounded tips.
  for (const s of [1, -1]) {
    const w = add(g, planform([[0.55, 1.35], [2.6, 1.35], [5.5, 1.05], [5.62, 0.85], [5.62, 0.05], [5.5, -0.15], [2.6, -0.25], [0.55, -0.25]], 0.2), white, 0, 1.12, 0);
    w.scale.x = s; w.rotation.z = s * 0.03;
    add(g, new THREE.BoxGeometry(0.4, 0.21, 1.25), red, s * 5.45, 1.12 + 0.15 * 1, 0.55, 0, 0, s * 0.03);
    const strut = new THREE.CylinderGeometry(0.045, 0.05, 2.75, 8);
    const sm = add(g, strut, metal, s * 1.6, 0.42, 0.75); sm.rotation.z = s * 0.98;
    // Wheel fairings.
    const pant = new THREE.SphereGeometry(0.22, 16, 10); pant.scale(0.7, 1, 2.2);
    add(g, pant, white, s * 1.1, -1.42, 0.08);
  }
  add(g, new THREE.SphereGeometry(0.2, 16, 10).scale(0.7, 1, 2.2), white, 0, -1.34, 2.5);
  // Tail.
  for (const s of [1, -1]) {
    const hs = add(g, planform([[0.2, -3.75], [1.75, -4.15], [1.8, -4.75], [0.2, -4.9]], 0.1), white, 0, 0.45, 0); hs.scale.x = s;
  }
  add(g, fin([[-2.4, 0.9], [-3.8, 1.25], [-4.55, 2.25], [-5.0, 2.25], [-4.95, 0.5]], 0.1), white);
  decal(g, textDecal('▲', { font: 'bold 110px Arial', color: '#' + new THREE.Color(stripe).getHexString() }), 0.6, 0.3, new THREE.Vector3(0.07, 1.8, -4.6), new THREE.Euler(0, Math.PI / 2, 0));
  // Spinner, two-blade propeller with twist, exhaust stubs.
  const prop = new THREE.Group(); prop.position.set(0, 0, 3.72);
  const spinner = new THREE.ConeGeometry(0.22, 0.5, 20); spinner.rotateX(Math.PI / 2);
  add(prop, spinner, red, 0, 0, 0.05);
  for (const s of [1, -1]) {
    const blade = new THREE.BoxGeometry(0.15, 0.95, 0.04, 1, 6, 1);
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) { const y = bp.getY(i); const tw = 0.5 - (y + 0.475) * 0.35; const x = bp.getX(i), z = bp.getZ(i); bp.setX(i, x * Math.cos(tw) - z * Math.sin(tw)); bp.setZ(i, x * Math.sin(tw) + z * Math.cos(tw)); bp.setX(i, bp.getX(i) * (1.1 - (y + 0.475) * 0.5)); }
    blade.computeVertexNormals();
    const b = add(prop, blade, stdMat(0x1a1a1a, { rough: 0.55 }), 0, s * 0.62, 0); b.rotation.z = s > 0 ? 0 : Math.PI;
    add(prop, new THREE.BoxGeometry(0.155, 0.12, 0.045), stdMat(0xe8c020, { rough: 0.5 }), 0, s * 1.05, 0);
  }
  const disc = add(prop, new THREE.CircleGeometry(1.2, 40), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  g.add(prop);
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), metal, 0.25, -0.55, 2.7, Math.PI / 2 + 0.3);
  // Fixed tricycle gear (wheel bottoms 1.7 m below origin).
  const gear = new THREE.Group();
  gearLeg(gear, 0, 2.5, 0.95, 0.24, { width: 0.14 });
  gearLeg(gear, 1.1, 0.08, 1.0, 0.3, { width: 0.16 });
  gearLeg(gear, -1.1, 0.08, 1.0, 0.3, { width: 0.16 });
  gear.position.y = -0.4;
  g.add(gear);
  const nav = navLights(g, new THREE.Vector3(5.65, 1.12, 0.6), new THREE.Vector3(-5.65, 1.12, 0.6), new THREE.Vector3(0, 2.3, -5));
  return { group: g, parts: { prop, disc, gear, nav, pilot: p }, ground: 1.7, radius: 6, length: 8.4, camDist: 15, camHeight: 4 };
}

// ---------------------------------------------------------------------------
// H-60 Kite: twin-engine rescue helicopter.

function heliLivery(main, trim) {
  return paintLivery(1024, 2048, (c, p, r, w, h) => {
    const rnd = mulberry32(145);
    c.fillStyle = trim; c.fillRect(0, 0, w, h);
    // Colour upper body, white belly, yellow separation stripe.
    c.fillStyle = main; LV.rect(c, 0.3, 0, 0.7, 1, w, h);
    c.fillStyle = '#f2c21a'; LV.rect(c, 0.28, 0, 0.3, 1, w, h); LV.rect(c, 0.7, 0, 0.72, 1, w, h);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(30,30,30,${rnd() * 0.04})`; c.fillRect(rnd() * w, rnd() * h, 3, 20 + rnd() * 50); }
    const win = (u0, v0, u1, v1) => { c.fillStyle = '#16222c'; LV.rect(c, u0, v0, u1, v1, w, h); r.fillStyle = '#0c0c0c'; LV.rect(r, u0, v0, u1, v1, w, h); p.strokeStyle = '#000'; p.lineWidth = 3; p.strokeRect(u0 * w, (1 - v1) * h, (u1 - u0) * w, (v1 - v0) * h); };
    r.fillStyle = '#808080'; r.fillRect(0, 0, w, h);
    // Big windscreen, chin windows, cockpit doors, cabin windows.
    win(0.3, 0.9, 0.7, 0.975);
    win(0.04, 0.9, 0.18, 0.95); win(0.82, 0.9, 0.96, 0.95);
    for (const [a, b] of [[0.2, 0.3], [0.7, 0.8]]) { win(a, 0.84, b, 0.9); win(a, 0.72, b + 0.005, 0.8); win(a + 0.005, 0.62, b, 0.69); }
    // Sliding door rails and panels.
    p.strokeStyle = '#000'; p.lineWidth = 2;
    for (const [a, b] of [[0.13, 0.32], [0.68, 0.87]]) { p.strokeRect(a * w, (1 - 0.81) * h, (b - a) * w, 0.2 * h); p.strokeRect(a * w, (1 - 0.91) * h, (b - a) * w, 0.09 * h); }
    LV.panelGrid(p, w, h, [0.4, 0.5, 0.58], [0.5], '#000', 1.5);
    LV.rivets(p, w, h, 2400, rnd);
    for (const [u, side] of [[0.24, 'left'], [0.76, 'right']]) {
      LV.text(c, 'RESCUE', u, 0.3, w, h, side, 'bold 56px Arial', '#ffffff');
      LV.text(c, 'D-HKIT', u + (side === 'left' ? 0.06 : -0.06), 0.52, w, h, side, 'bold 34px Arial', '#1f262c');
    }
  });
}

export function buildHelicopter({ color = 0xc8302a, trim = 0xf0f0f0 } = {}) {
  const g = new THREE.Group();
  const mainHex = '#' + new THREE.Color(color).getHexString(), trimHex = '#' + new THREE.Color(trim).getHexString();
  const lv = once('heli' + mainHex + trimHex, () => heliLivery(mainHex, trimHex));
  const skin = new THREE.MeshPhysicalMaterial({ map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, roughness: 1, metalness: 0.1, clearcoat: 0.28, clearcoatRoughness: 0.4 });
  const paint = stdMat(color, { rough: 0.42, metal: 0.1 });
  const light = stdMat(trim, { rough: 0.45, metal: 0.1 });
  const metal = stdMat(0x2e3134, { rough: 0.35, metal: 0.85 });
  const body = loft(smoothSections([
    { z: -8.55, w: 0.05, h: 0.08, y: 0.65 }, { z: -8.2, w: 0.16, h: 0.18, y: 0.65 }, { z: -6.5, w: 0.2, h: 0.22, y: 0.6 },
    { z: -3.2, w: 0.32, h: 0.36, y: 0.55 }, { z: -2.5, w: 0.55, h: 0.6, y: 0.45 }, { z: -1.8, w: 0.9, h: 0.9, y: 0.25, n: 2.8 },
    { z: -0.8, w: 1.1, h: 1.05, y: 0.15, n: 3 }, { z: 0.5, w: 1.12, h: 1.08, y: 0.12, n: 3 }, { z: 1.6, w: 1.0, h: 1.0, y: 0.1, n: 2.6 },
    { z: 2.4, w: 0.75, h: 0.75, y: 0.0 }, { z: 2.9, w: 0.28, h: 0.35, y: -0.15 }, { z: 3.0, w: 0.02, h: 0.05, y: -0.2 },
  ], 4), { segs: 40 });
  add(g, body, skin);
  const p = pilot('pilot', 31); p.root.scale.setScalar(0.92); p.root.position.set(-0.45, -0.75, 1.35); g.add(p.root);
  // Engine cowling, exhausts, intake grilles.
  const cowl = loft(smoothSections([
    { z: -2.2, w: 0.1, h: 0.08, y: 1.2 }, { z: -1.6, w: 0.62, h: 0.34, y: 1.28, n: 3 }, { z: 0.4, w: 0.7, h: 0.4, y: 1.3, n: 3 }, { z: 1.0, w: 0.3, h: 0.2, y: 1.18 },
  ], 3), { segs: 28 });
  add(g, cowl, paint);
  for (const s of [1, -1]) {
    add(g, new THREE.CylinderGeometry(0.16, 0.2, 0.5, 14).rotateX(Math.PI / 2 - 0.4), metal, s * 0.45, 1.45, -1.9);
    add(g, new THREE.BoxGeometry(0.05, 0.25, 0.6), stdMat(0x111111, { rough: 0.9 }), s * 0.71, 1.35, -0.2);
  }
  add(g, new THREE.CylinderGeometry(0.12, 0.16, 0.8, 12), metal, 0, 1.9, 0.1);
  // Main rotor: hub with pitch links, four tapered blades with tip stripes.
  const rotor = new THREE.Group(); rotor.position.set(0, 2.25, 0.1);
  add(rotor, new THREE.CylinderGeometry(0.3, 0.34, 0.28, 16), metal);
  add(rotor, new THREE.ConeGeometry(0.22, 0.3, 14), metal, 0, 0.28, 0);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.BoxGeometry(0.4, 0.06, 6.6, 1, 1, 8); blade.translate(0, 0, 3.4);
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) { const z = bp.getZ(i); bp.setX(i, bp.getX(i) * (1 - Math.max(0, z - 5.5) * 0.25)); bp.setY(i, bp.getY(i) * (1 - z / 16)); }
    blade.computeVertexNormals();
    const bm = add(rotor, blade, stdMat(0x1c1c1e, { rough: 0.5 }), 0, 0, 0, 0, (b / 4) * Math.PI * 2, 0);
    add(bm, new THREE.BoxGeometry(0.36, 0.065, 0.3), stdMat(0xf2f2f2, { rough: 0.5 }), 0, 0, 6.3);
    add(bm, new THREE.BoxGeometry(0.36, 0.065, 0.2), stdMat(0xc8302a, { rough: 0.5 }), 0, 0, 6.05);
    add(bm, new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), metal, 0.18, -0.14, 0.35);
  }
  const rDisc = add(rotor, new THREE.CircleGeometry(6.8, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  g.add(rotor);
  // Tail: fin, stabiliser with endplates, tail rotor.
  add(g, fin([[-7.4, 0.3], [-8.4, 2.3], [-8.95, 2.3], [-8.4, 0.1]], 0.14), paint);
  add(g, new THREE.BoxGeometry(2.4, 0.08, 0.6), paint, 0, 0.62, -7.2);
  for (const s of [1, -1]) add(g, fin([[-7.0, 0.35], [-7.25, 1.0], [-7.6, 1.0], [-7.5, 0.2]], 0.06), paint, s * 1.2, 0, 0);
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.28, 1.55, -8.55);
  add(tailRotor, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10).rotateZ(Math.PI / 2), metal);
  for (let b = 0; b < 4; b++) add(tailRotor, new THREE.BoxGeometry(0.04, 1.5, 0.16), stdMat(0x1c1c1e), 0.02, 0, 0, b * Math.PI / 4, 0, 0);
  g.add(tailRotor);
  // Skids with cross tubes and steps.
  for (const s of [1, -1]) {
    const skid = new THREE.CylinderGeometry(0.07, 0.07, 4.4, 10); skid.rotateX(Math.PI / 2);
    add(g, skid, metal, s * 1.25, -1.9, 0.3);
    const tip = new THREE.TorusGeometry(0.25, 0.07, 8, 12, Math.PI / 2); tip.rotateZ(-Math.PI / 2); tip.rotateY(-Math.PI / 2);
    add(g, tip, metal, s * 1.25, -1.65, 2.5);
    add(g, new THREE.BoxGeometry(0.3, 0.04, 0.5), metal, s * 1.08, -1.32, 0.3);
  }
  for (const z of [1.3, -0.9]) {
    const tube = new THREE.TorusGeometry(1.19, 0.055, 8, 20, Math.PI); tube.scale(1.05, 0.82, 1);
    add(g, tube, metal, 0, -1.9, z);
  }
  // Searchlight and its beam (visible at night).
  add(g, new THREE.CylinderGeometry(0.14, 0.16, 0.2, 12), metal, 0.3, -1.05, 2.2);
  const beamGeo = new THREE.ConeGeometry(5, 42, 20, 1, true); beamGeo.translate(0, -21, 0);
  const beam = add(g, beamGeo, additive(0xfff4d8, 0), 0, -1.1, 2.2, -0.55, 0, 0);
  const nav = navLights(g, new THREE.Vector3(1.4, -0.5, 0.5), new THREE.Vector3(-1.4, -0.5, 0.5), new THREE.Vector3(0, 2.4, -8.8));
  return { group: g, parts: { rotor, rDisc, tailRotor, beam, nav, pilot: p }, ground: 1.97, radius: 7, length: 12, camDist: 20, camHeight: 6 };
}

// ---------------------------------------------------------------------------
// Visitor saucer: brushed alien alloy, glowing dome and chasing rim lights.

export function buildSaucer({ hull = 0xb8c2cc, glow = 0x5dffc8, beamColor = 0x9dffd8 } = {}) {
  const g = new THREE.Group();
  const prof = [[0.01, -0.95], [2.4, -0.85], [5.2, -0.42], [7.2, -0.05], [7.35, 0.05], [5.6, 0.42], [3.2, 0.78], [0.01, 0.88]].map(([r, y]) => new THREE.Vector2(r, y));
  const disc = new THREE.LatheGeometry(prof, 64);
  const lv = once('saucerSkin', () => paintLivery(1024, 256, (c, p, r, w, h) => {
    c.fillStyle = '#b9c2ca'; c.fillRect(0, 0, w, h);
    const rnd = mulberry32(5);
    for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,50,60'},0.05)`; c.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 80, 1); }
    p.strokeStyle = '#000'; p.lineWidth = 2;
    for (let k = 0; k < 24; k++) { p.beginPath(); p.moveTo((k / 24) * w, 0); p.lineTo((k / 24) * w, h); p.stroke(); }
    for (const v of [0.18, 0.4, 0.62, 0.8]) { p.beginPath(); p.moveTo(0, v * h); p.lineTo(w, v * h); p.stroke(); }
    r.fillStyle = '#404040'; r.fillRect(0, 0, w, h);
  }));
  const hullMat = new THREE.MeshStandardMaterial({ color: hull, map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, metalness: 0.95, roughness: 1, emissive: 0x10161c, emissiveIntensity: 0.6 });
  add(g, disc, hullMat);
  const ring = new THREE.TorusGeometry(6.2, 0.12, 8, 64); ring.rotateX(Math.PI / 2);
  add(g, ring, stdMat(0x5a6470, { rough: 0.3, metal: 0.9 }), 0, 0.3, 0);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x0b2a2a, emissive: glow, emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.82 });
  add(g, new THREE.SphereGeometry(2.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0.7, 0);
  const lights = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const m = new THREE.MeshBasicMaterial({ color: glow });
    const b = add(g, new THREE.SphereGeometry(0.2, 8, 6), m, Math.cos(a) * 7.0, 0.02, Math.sin(a) * 7.0);
    b.castShadow = false;
    lights.push(m);
  }
  // Three landing pads.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    add(g, new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), stdMat(0x5a6470, { rough: 0.3, metal: 0.9 }), Math.cos(a) * 3, -0.95, Math.sin(a) * 3);
  }
  const under = add(g, new THREE.CircleGeometry(2.4, 32), additive(glow, 0.9), 0, -0.97, 0, Math.PI / 2, 0, 0);
  const halo = glowSprite(glow, 26, 0.35); halo.position.y = -0.6; g.add(halo);
  const beamTex = canvasTexture(8, 128, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
  const beamGeo = new THREE.CylinderGeometry(2.2, 9, 60, 32, 1, true); beamGeo.translate(0, -30, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: beamColor, map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = add(g, beamGeo, beamMat, 0, -0.9, 0);
  beam.visible = false;
  return { group: g, parts: { lights, under, halo, beam, beamMat, domeMat }, ground: 1.0, radius: 7.4, length: 14, camDist: 26, camHeight: 8 };
}

// ---------------------------------------------------------------------------
// Kestrel Air narrow-body airliner.

function airlinerLivery(livery) {
  const windows = document.createElement('canvas'); windows.width = 1024; windows.height = 4096;
  const wctx = windows.getContext('2d'); wctx.fillStyle = '#000'; wctx.fillRect(0, 0, 1024, 4096);
  const lv = paintLivery(1024, 4096, (c, p, r, w, h) => {
    const rnd = mulberry32(320);
    c.fillStyle = '#f5f6f7'; c.fillRect(0, 0, w, h);
    // Belly and cheatline.
    c.fillStyle = livery; LV.rect(c, 0, 0, 0.16, 1, w, h); LV.rect(c, 0.84, 0, 1, 1, w, h);
    c.fillStyle = '#8fb4e0'; LV.rect(c, 0.16, 0, 0.175, 0.92, w, h); LV.rect(c, 0.825, 0, 0.84, 0.92, w, h);
    for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(80,80,80,${rnd() * 0.03})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 20 + rnd() * 80); }
    r.fillStyle = '#6a6a6a'; r.fillRect(0, 0, w, h);
    // Passenger windows (lit at night via the emissive mask).
    for (const u of [0.277, 0.723]) {
      for (let v = 0.2; v < 0.84; v += 0.0136) {
        if (Math.abs(v - 0.5) < 0.02 || Math.abs(v - 0.46) < 0.01) continue;
        const x = u * w, y = (1 - v) * h;
        c.fillStyle = '#1c2632'; c.beginPath(); c.ellipse(x, y, 9, 14, 0, 0, Math.PI * 2); c.fill();
        wctx.fillStyle = '#ffffff'; wctx.beginPath(); wctx.ellipse(x, y, 9, 14, 0, 0, Math.PI * 2); wctx.fill();
        r.fillStyle = '#101010'; r.beginPath(); r.ellipse(x, y, 9, 14, 0, 0, Math.PI * 2); r.fill();
      }
    }
    // Doors: L1/R1, overwing exits, rear doors.
    p.strokeStyle = '#000'; p.lineWidth = 2.5;
    for (const u of [0.24, 0.72]) for (const [v, len] of [[0.87, 0.028], [0.49, 0.014], [0.45, 0.014], [0.18, 0.028]]) p.strokeRect(u * w, (1 - v) * h, 0.045 * w, len * h);
    // Cockpit windows.
    c.fillStyle = '#141c24'; r.fillStyle = '#080808';
    for (const [a, b] of [[0.34, 0.42], [0.43, 0.49], [0.51, 0.57], [0.58, 0.66]]) { LV.rect(c, a, 0.953, b, 0.967, w, h); LV.rect(r, a, 0.953, b, 0.967, w, h); }
    LV.panelGrid(p, w, h, [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9, 0.94], [0.5], '#000', 1.1);
    LV.rivets(p, w, h, 5000, rnd);
    LV.text(c, 'KESTREL AIR', 0.33, 0.66, w, h, 'left', 'bold 60px Arial', livery);
    LV.text(c, 'KESTREL AIR', 0.67, 0.66, w, h, 'right', 'bold 60px Arial', livery);
    LV.text(c, 'K-ISLE', 0.25, 0.12, w, h, 'left', 'bold 28px Arial', '#333');
    LV.text(c, 'K-ISLE', 0.75, 0.12, w, h, 'right', 'bold 28px Arial', '#333');
  });
  const em = new THREE.CanvasTexture(windows); em.anisotropy = 8;
  return { ...lv, emissiveMap: em };
}

export function buildAirliner({ livery = 0x1d4f91 } = {}) {
  const g = new THREE.Group();
  const liveryHex = '#' + new THREE.Color(livery).getHexString();
  const lv = once('airliner' + liveryHex, () => airlinerLivery(liveryHex));
  const winMat = new THREE.MeshPhysicalMaterial({ map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, roughness: 1, metalness: 0.15, clearcoat: 0.2, clearcoatRoughness: 0.38, emissive: 0xffd9a0, emissiveMap: lv.emissiveMap, emissiveIntensity: 0 });
  const white = once('airSurf', () => panelSurface('#e9ecef', { rough: 0.45, metal: 0.2, repeat: 0.18, cell: 110 }));
  const blue = stdMat(livery, { rough: 0.4, metal: 0.1 });
  const grey = stdMat(0xb4bac0, { rough: 0.3, metal: 0.8 });
  const body = loft(smoothSections([
    { z: -18.7, w: 0.25, h: 0.3, y: 0.95 }, { z: -17.5, w: 0.6, h: 0.65, y: 0.8 }, { z: -15.5, w: 1.2, h: 1.3, y: 0.55 },
    { z: -13, w: 1.75, h: 1.85, y: 0.25 }, { z: -10, w: 2.0, h: 2.05, y: 0 }, { z: 13, w: 2.0, h: 2.05, y: 0 },
    { z: 15.8, w: 1.9, h: 1.95, y: 0 }, { z: 17.2, w: 1.45, h: 1.5, y: -0.05 }, { z: 18.2, w: 0.7, h: 0.7, y: -0.2 }, { z: 18.65, w: 0.02, h: 0.02, y: -0.3 },
  ], 4), { segs: 48 });
  add(g, body, winMat);
  // Swept wings with dihedral, sharklets, flap-track fairings, engines on pylons.
  for (const s of [1, -1]) {
    const w = add(g, planform([[1.9, 3.4], [16.4, -5.9], [16.5, -7.3], [1.9, -5.1]], 0.42), white, 0, -1.2, 0); w.scale.x = s; w.rotation.z = s * 0.1;
    const sharklet = add(g, planform([[0, 0], [0.9, 0], [0.5, -1.3], [0, -1.4]], 0.08), white, s * 16.45, 0.45, -6.0);
    sharklet.rotation.set(0, 0, s > 0 ? Math.PI / 2 - 0.2 : -Math.PI / 2 + 0.2); sharklet.scale.x = s;
    for (const x of [5.5, 9, 12.5]) {
      const f = new THREE.SphereGeometry(0.25, 10, 8); f.scale(1, 0.8, 5);
      add(g, f, white, s * x, -1.2 + x * 0.1 - 0.3, -4.9 - (x - 1.9) * 0.15);
    }
    const nac = loft(smoothSections([
      { z: -1.8, w: 0.55, h: 0.55 }, { z: -1.2, w: 0.78, h: 0.78 }, { z: 0.5, w: 1.0, h: 1.0 }, { z: 1.6, w: 1.02, h: 1.02 }, { z: 2.05, w: 0.95, h: 0.95 },
    ], 3), { segs: 32, capEnd: false, capStart: false });
    add(g, nac, grey, s * 5.6, -2.4, 1.0);
    add(g, new THREE.CylinderGeometry(0.48, 0.3, 0.8, 16).rotateX(Math.PI / 2), stdMat(0x3a3a3a, { rough: 0.4, metal: 0.8 }), s * 5.6, -2.4, -1.1);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.93, 32), new THREE.MeshStandardMaterial({ map: fanTexture(), roughness: 0.35, metalness: 0.8 }));
    fan.position.set(s * 5.6, -2.4, 2.8); g.add(fan);
    add(g, new THREE.BoxGeometry(0.3, 1.35, 3.0), white, s * 5.6, -1.45, 0.4);
    const st = add(g, planform([[0.5, -14.1], [6.3, -17.5], [6.4, -18.5], [0.5, -17.9]], 0.24), white, 0, 0.55, 0); st.scale.x = s; st.rotation.z = s * 0.08;
  }
  // Vertical tail with the airline logo on both sides.
  add(g, fin([[-11.6, 1.6], [-17.2, 9.5], [-19.2, 9.5], [-18.4, 1.2]], 0.32), blue);
  const logo = canvasTexture(256, 256, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = liveryHex; ctx.beginPath(); ctx.moveTo(w * 0.28, w * 0.62); ctx.quadraticCurveTo(w * 0.5, w * 0.2, w * 0.74, w * 0.36); ctx.quadraticCurveTo(w * 0.52, w * 0.4, w * 0.28, w * 0.62); ctx.fill();
  });
  for (const s of [1, -1]) decal(g, logo, 3.4, 3.4, new THREE.Vector3(s * 0.18, 5.6, -16.4), new THREE.Euler(0, s * Math.PI / 2, 0));
  const nav = navLights(g, new THREE.Vector3(16.6, -0.5, -7.2), new THREE.Vector3(-16.6, -0.5, -7.2), new THREE.Vector3(0, 9.6, -19));
  const beacon = glowSprite(0xff2020, 2.5); beacon.position.set(0, 2.2, 0); g.add(beacon);
  return { group: g, parts: { nav, winMat, beacon, engines: [new THREE.Vector3(5.6, -2.4, -1), new THREE.Vector3(-5.6, -2.4, -1)] }, ground: 3.5, radius: 18, length: 37 };
}

function fanTexture() {
  return once('fan', () => canvasTexture(256, 256, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#1a1c1f'; ctx.fillRect(0, 0, w, w);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      ctx.fillStyle = k % 2 ? '#5a6068' : '#4a5058';
      ctx.beginPath(); ctx.moveTo(c, c);
      ctx.arc(c, c, w * 0.5, a, a + 0.18); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(c, c, 0, c, c, w * 0.16);
    g.addColorStop(0, '#dfe3e6'); g.addColorStop(1, '#6a7076');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, w * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c, c - w * 0.05); ctx.lineTo(c + w * 0.12, c); ctx.stroke();
  }));
}

// The glowing alien drones from the original arcade game.
export function buildDrone(type = 0) {
  const kinds = [[0xffcf78, 0x699ab0], [0x65eaff, 0x398299], [0xc79aff, 0x613d88]];
  const [c0, c1] = kinds[type % 3];
  const g = new THREE.Group();
  const shell = stdMat(c1, { metal: 0.78, rough: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: c0, emissive: c0, emissiveIntensity: 1.6, metalness: 0.55, roughness: 0.28 });
  const gl = new THREE.MeshStandardMaterial({ color: 0x162b38, metalness: 0.5, roughness: 0.12, emissive: c0, emissiveIntensity: 0.3 });
  const a = (geo, m, pos, sc, rot) => { const x = add(g, geo, m, ...pos); if (sc) x.scale.set(...sc); if (rot) x.rotation.set(...rot); return x; };
  let orbit = null;
  if (type === 0) {
    a(new THREE.ConeGeometry(0.58, 3.8, 7), shell, [0, 0, 0], null, [-Math.PI / 2, 0, 0]);
    a(new THREE.BoxGeometry(0.42, 0.12, 1.05), gl, [0, 0.38, 0.15]);
    for (const s of [-1, 1]) {
      a(new THREE.BoxGeometry(1.35, 0.12, 1.35), shell, [s * 0.92, -0.08, -0.25], null, [0, s * 0.42, 0]);
      a(new THREE.BoxGeometry(0.18, 0.2, 0.62), trim, [s * 0.78, 0.02, -0.45], null, [0, s * 0.42, 0]);
    }
  } else if (type === 1) {
    a(new THREE.OctahedronGeometry(0.9, 1), shell, [0, 0, 0], [1.2, 0.68, 1]);
    a(new THREE.SphereGeometry(0.31, 16, 10), gl, [0, 0.22, 0.18], [1, 0.72, 0.5]);
    for (const s of [-1, 1]) for (const z of [-1, 1]) {
      a(new THREE.BoxGeometry(0.17, 0.13, 1.15), shell, [s * 0.9, 0, z * 0.8], null, [0, s * 0.28, 0]);
      a(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 16), trim, [s * 1.34, 0.03, z * 1.12]);
    }
    orbit = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.055, 8, 48), trim); orbit.rotation.x = 0.55; g.add(orbit);
  } else {
    a(new THREE.IcosahedronGeometry(0.66, 1), shell, [0, 0, 0], [1.2, 0.6, 1.25]);
    a(new THREE.SphereGeometry(0.34, 16, 12), trim, [0, 0.2, 0.08], [1, 0.55, 0.8]);
    for (const s of [-1, 1]) {
      a(new THREE.ConeGeometry(0.36, 2.5, 5), shell, [s * 1.12, 0, 0], null, [0, 0, s * Math.PI / 2]);
      a(new THREE.BoxGeometry(1.35, 0.12, 0.7), trim, [s * 1.1, -0.12, -0.18], null, [0, s * 0.34, 0]);
    }
    orbit = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.07, 8, 36), trim); orbit.rotation.x = Math.PI / 2; g.add(orbit);
  }
  const halo = glowSprite(c0, 7, 0.55); g.add(halo);
  g.scale.setScalar(1.8);
  return { group: g, orbit, color: c0 };
}

export { buildNova };
