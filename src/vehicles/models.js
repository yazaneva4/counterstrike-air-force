// Procedural aircraft. Every model faces +Z (nose forward), +Y up, and its
// origin sits at the centre of mass. `ground` is the distance from the origin
// down to the wheels/skids so vehicles park exactly on the tarmac.

import * as THREE from 'three';
import { stdMat, glowSprite, canvasTexture } from '../core/util.js';
import { Human, outfitFor } from '../actors/human.js';
import { mulberry32 } from '../core/noise.js';
import { buildNova } from './nova.js';

const glass = () => new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.04, metalness: 0.95, emissive: 0x0a1822, emissiveIntensity: 0.4, transparent: true, opacity: 0.88 });
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Lathe a profile [[radius, z], ...] into a body of revolution along +Z.
function fuselage(profile, segs = 20, squashY = 1) {
  // Lathe profiles must run bottom-to-top for outward-facing normals.
  if (profile[0][1] > profile[profile.length - 1][1]) profile = [...profile].reverse();
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.001), z));
  const g = new THREE.LatheGeometry(pts, segs);
  g.rotateX(Math.PI / 2); // lathe axis +Y -> +Z
  g.scale(1, squashY, 1);
  return g;
}

// Flat planform [[x, z], ...] extruded to a thin wing in the XZ plane.
function planform(points, thick = 0.2) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.25, bevelSize: thick * 0.25, bevelSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return g;
}

// Vertical profile [[z, y], ...] extruded across X.
function fin(points, thick = 0.16) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(thick / 2, 0, 0);
  return g;
}

function roundel(size = 256) {
  return canvasTexture(size, size, (ctx, w) => {
    const c = w / 2;
    ctx.clearRect(0, 0, w, w);
    [['#1d3e7a', 0.48], ['#f4f4f4', 0.34], ['#c8302a', 0.2]].forEach(([col, r]) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c, c, w * r, 0, Math.PI * 2); ctx.fill(); });
  });
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

function gearLeg(group, x, z, len, wheelR = 0.38, mat) {
  const leg = new THREE.Group();
  add(leg, new THREE.CylinderGeometry(0.07, 0.07, len, 6), mat, 0, -len / 2, 0);
  add(leg, new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 14), stdMat(0x141414, { rough: 0.8 }), 0, -len, 0, 0, 0, Math.PI / 2);
  leg.position.set(x, 0, z);
  group.add(leg);
  return leg;
}

// ---------------------------------------------------------------------------

export function buildFighter({ color = 0x8a949c, accent = 0x5c666e } = {}) {
  const g = new THREE.Group();
  const skin = stdMat(color, { rough: 0.42, metal: 0.55 });
  const dark = stdMat(accent, { rough: 0.5, metal: 0.5 });
  const metal = stdMat(0x3a3d40, { rough: 0.35, metal: 0.9 });
  const body = fuselage([[0, 7.6], [0.18, 7.2], [0.42, 6.4], [0.7, 5.2], [0.92, 3.8], [1.02, 2.2], [1.06, 0], [1.02, -2.5], [0.92, -4.8], [0.78, -6.6], [0.66, -7.4]], 22, 0.86);
  add(g, body, skin);
  // Canopy and pilot.
  const canopy = new THREE.SphereGeometry(0.6, 20, 12); canopy.scale(0.95, 0.85, 2.5);
  add(g, canopy, glass(), 0, 0.72, 3.4);
  const p = pilot('pilot', 11);
  p.root.scale.setScalar(0.92); p.root.position.set(0, -0.15, 3.1);
  g.add(p.root);
  // Belly intake.
  add(g, new THREE.BoxGeometry(1.25, 0.8, 3.4), dark, 0, -0.78, 1.4);
  add(g, new THREE.BoxGeometry(1.1, 0.62, 0.1), stdMat(0x08090a), 0, -0.78, 3.12);
  // Wings, stabilisers, fin.
  const wing = planform([[0.8, 2.4], [4.9, -1.6], [4.9, -2.5], [0.8, -3.4]], 0.2);
  for (const s of [1, -1]) {
    const w = add(g, wing, skin, 0, -0.18, 0); w.scale.x = s;
    const st = add(g, planform([[0.5, -5.2], [3.1, -6.9], [3.1, -7.5], [0.5, -7.6]], 0.14), skin, 0, -0.05, 0); st.scale.x = s;
    // Wingtip pod.
    add(g, new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), dark, s * 4.95, -0.08, -1.4, Math.PI / 2);
    // Roundel decal on the upper wing.
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: roundel(), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    dec.rotation.x = -Math.PI / 2; dec.position.set(s * 3.2, 0.1, -1.6); g.add(dec);
  }
  add(g, fin([[-4.3, 0.7], [-7.0, 4.1], [-7.8, 4.1], [-7.7, 0.7]], 0.16), skin, 0, 0, 0);
  add(g, new THREE.BoxGeometry(0.02, 0.5, 0.9), dark, 0, 3.4, -7.3);
  // Nozzle and afterburner.
  add(g, new THREE.CylinderGeometry(0.62, 0.74, 1.3, 18, 1, true), metal, 0, 0, -7.9, Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.55, 4.5, 18, 1, true); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -2.25);
  const flame = add(g, flameGeo, additive(0xff8a3a, 0.8), 0, 0, -8.4);
  const flameCore = add(g, flameGeo.clone().scale(0.55, 0.55, 0.6), additive(0x9ad0ff, 0.9), 0, 0, -8.3);
  const nozzleGlow = add(g, new THREE.CircleGeometry(0.6, 20), additive(0xffb070, 0.9), 0, 0, -8.5, 0, Math.PI, 0);
  // Gear.
  const gear = new THREE.Group();
  gearLeg(gear, 0, 4.6, 1.67, 0.3, metal);
  gearLeg(gear, 1.25, -0.8, 1.55, 0.42, metal);
  gearLeg(gear, -1.25, -0.8, 1.55, 0.42, metal);
  gear.position.y = -0.55;
  g.add(gear);
  const nav = navLights(g, new THREE.Vector3(5, -0.08, -1.6), new THREE.Vector3(-5, -0.08, -1.6), new THREE.Vector3(0, 4.2, -7.6));
  return { group: g, parts: { flame, flameCore, nozzleGlow, gear, nav, pilot: p }, ground: 2.5, radius: 7, length: 15.5, camDist: 24, camHeight: 6 };
}

export function buildProp({ color = 0xf2f2ee, stripe = 0xc8302a } = {}) {
  const g = new THREE.Group();
  const white = stdMat(color, { rough: 0.45, metal: 0.15 });
  const red = stdMat(stripe, { rough: 0.5 });
  const metal = stdMat(0x444444, { rough: 0.4, metal: 0.8 });
  add(g, fuselage([[0.35, 3.3], [0.62, 3.0], [0.72, 2.4], [0.78, 1.0], [0.78, -0.4], [0.6, -2.2], [0.32, -4.2], [0.14, -4.9]], 18, 1.12), white);
  add(g, new THREE.CylinderGeometry(0.5, 0.64, 0.8, 16), red, 0, 0, 3.0, Math.PI / 2);
  add(g, new THREE.ConeGeometry(0.2, 0.5, 12), metal, 0, 0, 3.65, Math.PI / 2);
  // Stripe along the side.
  for (const s of [1, -1]) add(g, new THREE.BoxGeometry(0.02, 0.16, 5.4), red, s * 0.74, 0.05, -0.3);
  // Cabin glass.
  add(g, new THREE.BoxGeometry(1.46, 0.62, 1.9), glass(), 0, 0.62, 0.95);
  const p = pilot('pilot', 23); p.root.scale.setScalar(0.9); p.root.position.set(0.3, -0.45, 0.8); g.add(p.root);
  // High wing with struts.
  add(g, new THREE.BoxGeometry(11.2, 0.16, 1.55), white, 0, 1.08, 0.7);
  for (const s of [1, -1]) {
    add(g, new THREE.BoxGeometry(1.2, 0.17, 1.56), red, s * 5.1, 1.08, 0.7);
    const strut = add(g, new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), metal, s * 1.7, 0.1, 0.9);
    strut.rotation.z = s * 1.0;
  }
  // Tail.
  add(g, new THREE.BoxGeometry(3.6, 0.1, 1.0), white, 0, 0.1, -4.3);
  add(g, fin([[-3.1, 0.4], [-4.5, 1.9], [-5.0, 1.9], [-4.9, 0.2]], 0.1), white);
  add(g, new THREE.BoxGeometry(0.12, 0.45, 0.7), red, 0, 1.6, -4.7);
  // Propeller.
  const prop = new THREE.Group(); prop.position.set(0, 0, 3.72);
  for (const s of [1, -1]) add(prop, new THREE.BoxGeometry(0.16, 1.0, 0.05), stdMat(0x1a1a1a, { rough: 0.6 }), 0, s * 0.8, 0, 0, s * 0.3, 0);
  const disc = add(prop, new THREE.CircleGeometry(1.85, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  g.add(prop);
  // Fixed gear.
  const gear = new THREE.Group();
  gearLeg(gear, 0, 2.5, 1.0, 0.24, metal);
  gearLeg(gear, 1.1, 0.1, 1.05, 0.3, metal);
  gearLeg(gear, -1.1, 0.1, 1.05, 0.3, metal);
  gear.position.y = -0.4;
  g.add(gear);
  const nav = navLights(g, new THREE.Vector3(5.6, 1.08, 0.7), new THREE.Vector3(-5.6, 1.08, 0.7), new THREE.Vector3(0, 1.95, -5));
  return { group: g, parts: { prop, disc, gear, nav, pilot: p }, ground: 1.7, radius: 6, length: 8.4, camDist: 15, camHeight: 4 };
}

export function buildHelicopter({ color = 0xc8302a, trim = 0xf0f0f0 } = {}) {
  const g = new THREE.Group();
  const paint = stdMat(color, { rough: 0.4, metal: 0.35 });
  const light = stdMat(trim, { rough: 0.45, metal: 0.2 });
  const metal = stdMat(0x2e3134, { rough: 0.35, metal: 0.85 });
  const cabin = new THREE.SphereGeometry(1, 24, 16); cabin.scale(1.35, 1.25, 2.7);
  add(g, cabin, paint, 0, 0, 0.4);
  const nose = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateX(Math.PI / 2); nose.scale(1.2, 1.05, 1.5);
  add(g, nose, glass(), 0, 0.15, 1.7);
  add(g, new THREE.BoxGeometry(2.6, 0.5, 3.4), light, 0, -0.95, 0.2);
  // Side windows + door.
  for (const s of [1, -1]) add(g, new THREE.BoxGeometry(0.05, 0.75, 1.6), glass(), s * 1.28, 0.25, 0.2);
  const p = pilot('pilot', 31); p.root.scale.setScalar(0.92); p.root.position.set(-0.45, -0.75, 1.35); g.add(p.root);
  // Tail boom, fin, stabiliser.
  const boom = new THREE.CylinderGeometry(0.22, 0.5, 6.6, 12); boom.rotateX(Math.PI / 2);
  add(g, boom, paint, 0, 0.35, -4.7);
  add(g, fin([[-7.4, 0.3], [-8.4, 2.3], [-8.9, 2.3], [-8.3, 0.1]], 0.12), paint);
  add(g, new THREE.BoxGeometry(2.4, 0.08, 0.6), paint, 0, 0.45, -7.2);
  // Engine housing and mast.
  add(g, new THREE.BoxGeometry(1.4, 0.7, 2.6), light, 0, 1.25, -0.3);
  add(g, new THREE.CylinderGeometry(0.12, 0.16, 0.8, 10), metal, 0, 1.9, 0.1);
  // Main rotor.
  const rotor = new THREE.Group(); rotor.position.set(0, 2.25, 0.1);
  add(rotor, new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12), metal);
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.BoxGeometry(0.42, 0.06, 6.6); blade.translate(0, 0, 3.4);
    add(rotor, blade, stdMat(0x1c1c1e, { rough: 0.5 }), 0, 0, 0, 0, (b / 4) * Math.PI * 2, 0);
  }
  const rDisc = add(rotor, new THREE.CircleGeometry(6.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  g.add(rotor);
  // Tail rotor.
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.25, 1.55, -8.55);
  for (let b = 0; b < 2; b++) add(tailRotor, new THREE.BoxGeometry(0.05, 1.5, 0.16), stdMat(0x1c1c1e), 0, 0, 0, b * Math.PI / 2, 0, 0);
  g.add(tailRotor);
  // Skids.
  for (const s of [1, -1]) {
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8), metal, s * 1.25, -1.9, 0.3, Math.PI / 2);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), metal, s * 1.1, -1.5, 1.3, 0, 0, s * 0.3);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), metal, s * 1.1, -1.5, -0.9, 0, 0, s * 0.3);
  }
  // Searchlight beam (visible at night).
  const beamGeo = new THREE.ConeGeometry(5, 42, 20, 1, true); beamGeo.translate(0, -21, 0);
  const beam = add(g, beamGeo, additive(0xfff4d8, 0), 0, -1.1, 2.2, -0.55, 0, 0);
  const nav = navLights(g, new THREE.Vector3(1.4, -0.5, 0.5), new THREE.Vector3(-1.4, -0.5, 0.5), new THREE.Vector3(0, 2.4, -8.8));
  return { group: g, parts: { rotor, rDisc, tailRotor, beam, nav, pilot: p }, ground: 1.97, radius: 7, length: 12, camDist: 20, camHeight: 6 };
}

export function buildSaucer({ hull = 0xb8c2cc, glow = 0x5dffc8, beamColor = 0x9dffd8 } = {}) {
  const g = new THREE.Group();
  const prof = [[0.01, -0.95], [2.4, -0.85], [5.2, -0.42], [7.2, -0.05], [7.35, 0.05], [5.6, 0.42], [3.2, 0.78], [0.01, 0.88]].map(([r, y]) => new THREE.Vector2(r, y));
  const disc = new THREE.LatheGeometry(prof, 48);
  const hullMat = new THREE.MeshStandardMaterial({ color: hull, metalness: 0.92, roughness: 0.22, emissive: 0x10161c, emissiveIntensity: 0.6 });
  add(g, disc, hullMat);
  const ring = new THREE.TorusGeometry(6.2, 0.12, 8, 64); ring.rotateX(Math.PI / 2);
  add(g, ring, stdMat(0x5a6470, { rough: 0.3, metal: 0.9 }), 0, 0.3, 0);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x0b2a2a, emissive: glow, emissiveIntensity: 0.55, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.82 });
  add(g, new THREE.SphereGeometry(2.6, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, 0, 0.7, 0);
  // Rim lights that chase around the edge.
  const lights = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const m = new THREE.MeshBasicMaterial({ color: glow });
    const b = add(g, new THREE.SphereGeometry(0.2, 8, 6), m, Math.cos(a) * 7.0, 0.02, Math.sin(a) * 7.0);
    b.castShadow = false;
    lights.push(m);
  }
  const under = add(g, new THREE.CircleGeometry(2.4, 32), additive(glow, 0.9), 0, -0.97, 0, Math.PI / 2, 0, 0);
  const halo = glowSprite(glow, 26, 0.35); halo.position.y = -0.6; g.add(halo);
  // Tractor beam: soft cone fading toward the ground.
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

export function buildAirliner({ livery = 0x1d4f91 } = {}) {
  const g = new THREE.Group();
  const white = stdMat(0xf4f5f6, { rough: 0.35, metal: 0.25 });
  const blue = stdMat(livery, { rough: 0.4, metal: 0.25 });
  const grey = stdMat(0x9aa2a8, { rough: 0.3, metal: 0.7 });
  add(g, fuselage([[0, 18.5], [0.8, 17.9], [1.6, 16.6], [2.0, 14.5], [2.05, 0], [2.0, -10], [1.6, -14.5], [0.8, -17], [0.35, -18]], 24, 1.0), white);
  add(g, new THREE.BoxGeometry(0.02, 1.0, 32).translate(2.03, -0.6, -1), blue);
  add(g, new THREE.BoxGeometry(0.02, 1.0, 32).translate(-2.03, -0.6, -1), blue);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0xffd9a0, emissiveIntensity: 0 });
  for (const s of [1, -1]) add(g, new THREE.BoxGeometry(0.02, 0.28, 26).translate(s * 2.05, 0.55, 0), winMat);
  add(g, new THREE.BoxGeometry(2.2, 0.5, 0.8), glass(), 0, 0.75, 16.4);
  const wing = planform([[1.6, 3], [16.5, -6.5], [16.5, -8.2], [1.6, -5.5]], 0.45);
  for (const s of [1, -1]) {
    const w = add(g, wing, white, 0, -1.1, 0); w.scale.x = s;
    const eng = new THREE.CylinderGeometry(0.95, 0.85, 3.8, 18); eng.rotateX(Math.PI / 2);
    add(g, eng, grey, s * 5.6, -2.2, 1.2);
    add(g, new THREE.CylinderGeometry(0.7, 0.7, 0.1, 16), stdMat(0x111111), s * 5.6, -2.2, 3.1, Math.PI / 2);
    const st = add(g, planform([[0.5, -14], [6.4, -17.6], [6.4, -18.6], [0.5, -17.8]], 0.25), white, 0, 0.5, 0); st.scale.x = s;
  }
  add(g, fin([[-11.5, 1.6], [-17.2, 9.5], [-19.2, 9.5], [-18.4, 1.2]], 0.3), blue);
  const nav = navLights(g, new THREE.Vector3(16.6, -1, -7.2), new THREE.Vector3(-16.6, -1, -7.2), new THREE.Vector3(0, 9.6, -19));
  const beacon = glowSprite(0xff2020, 2.5); beacon.position.set(0, 2.2, 0); g.add(beacon);
  return { group: g, parts: { nav, winMat, beacon, engines: [new THREE.Vector3(5.6, -2.2, -1), new THREE.Vector3(-5.6, -2.2, -1)] }, ground: 3.5, radius: 18, length: 37 };
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
