// Procedural weapon models. Every model is built along +Z (the barrel or blade
// points forward) with its origin at the right-hand grip, and exposes:
//   userData.muzzle  Vector3 in model space (where tracers and flashes start)
//   userData.flash   Mesh toggled for a frame on firing (guns)
//   userData.mount   [rotX, rotZ] applied when mounting in a hand joint
//   userData.parts   named sub-groups the animation can move (slide, pump, mag)

import * as THREE from 'three';
import { stdMat } from '../core/util.js';

const M = {
  gun: () => stdMat(0x4d535b, { rough: 0.42, metal: 0.35 }),
  dark: () => stdMat(0x2b2e33, { rough: 0.55, metal: 0.25 }),
  poly: () => stdMat(0x34373c, { rough: 0.7, metal: 0.05 }),
  steel: () => stdMat(0xcdd3da, { rough: 0.3, metal: 0.45 }),
  blade: () => stdMat(0xdfe5ea, { rough: 0.2, metal: 0.4, emissive: 0x20262c, ei: 0.6 }),
  wood: () => stdMat(0x6a4425, { rough: 0.62 }),
  woodDark: () => stdMat(0x3d2615, { rough: 0.7 }),
  brass: () => stdMat(0xd2a84c, { rough: 0.35, metal: 0.4 }),
  rubber: () => stdMat(0x0d0d0e, { rough: 0.95 }),
  wrap: () => stdMat(0x1d2a3e, { rough: 0.9 }),
  red: () => stdMat(0xb3261e, { rough: 0.5 }),
  olive: () => stdMat(0x66724a, { rough: 0.6, metal: 0.15 }),
  white: () => stdMat(0xe9eef2, { rough: 0.3, metal: 0.2 }),
  plasmaGlow: () => stdMat(0x2cf0ff, { rough: 0.2, emissive: 0x2cf0ff, ei: 2.2 }),
  glass: () => stdMat(0x2a4a6a, { rough: 0.05, metal: 0.6, emissive: 0x0a2236, ei: 0.5 }),
  redDot: () => stdMat(0xff2a1a, { rough: 0.3, emissive: 0xff2a1a, ei: 2 }),
};

function add(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = false; m.receiveShadow = false;
  g.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Cylinder along Z.
const cylZ = (r1, r2, len, seg = 14) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg); g.rotateX(Math.PI / 2); return g; };

// A bladed profile in the (z, y) plane extruded along x; points are [z, y].
function bladeGeo(points, thickness) {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][1] * 0 + points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) sh.lineTo(points[i][0], points[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thickness, bevelEnabled: false });
  // Shape x -> model z, shape y -> model y, extrusion -> model x.
  g.rotateY(-Math.PI / 2);
  g.translate(thickness / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function flashMesh(z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd37a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8, 1, true), mat);
  cone.rotation.x = -Math.PI / 2; cone.position.z = 0.11;
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), mat);
  cross.position.z = 0.02;
  const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 4;
  g.add(cone, cross, cross2);
  g.position.z = z;
  g.visible = false;
  return g;
}

// ---- Melee ----------------------------------------------------------------

function knife() {
  const g = new THREE.Group();
  add(g, bladeGeo([[0.04, -0.012], [0.2, -0.016], [0.255, 0.0], [0.2, 0.014], [0.04, 0.016]], 0.004), M.blade());
  add(g, box(0.012, 0.045, 0.012), M.dark(), 0, 0, 0.035);                 // guard
  add(g, cylZ(0.0135, 0.0125, 0.105, 10), M.rubber(), 0, 0, -0.025);        // grip
  for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.0138, 0.0018, 4, 10).rotateY(Math.PI / 2), M.dark(), 0, 0, -0.06 + i * 0.026);
  add(g, new THREE.SphereGeometry(0.016, 8, 6), M.dark(), 0, 0, -0.082);
  g.userData = { mount: [-0.55, 0], reach: 1.9, tip: new THREE.Vector3(0, 0, 0.25) };
  return g;
}

function katana() {
  const g = new THREE.Group();
  // Curved single-edged blade with a hardened edge line (lighter strip) and a pointed kissaki.
  const pts = [], top = [], bottom = [];
  const L = 0.72, N = 12;
  for (let i = 0; i <= N; i++) {
    const z = 0.05 + (i / N) * L, u = i / N, sori = 0.032 * u * u;
    top.push([z, 0.016 * (1 - u * 0.28) + sori]);
    bottom.push([z, -0.016 * (1 - u * 0.5) + sori]);
  }
  pts.push(...bottom, [L + 0.095, 0.03 + 0.012 * 0], ...top.reverse());
  add(g, bladeGeo(pts, 0.0065), M.blade());
  const edge = bottom.map(([z, y]) => [z, y]).concat(bottom.map(([z, y]) => [z, y + 0.008]).reverse());
  add(g, bladeGeo(edge, 0.0072), stdMat(0xffffff, { rough: 0.1, metal: 0.4, emissive: 0x303840, ei: 0.8 }));
  add(g, cylZ(0.04, 0.04, 0.008, 24), M.brass(), 0, 0, 0.045);               // tsuba
  g.children[g.children.length - 1].scale.set(1, 0.82, 1);
  add(g, cylZ(0.0165, 0.0165, 0.012, 12), M.brass(), 0, 0, 0.058);          // seppa/habaki
  add(g, cylZ(0.0165, 0.0185, 0.24, 12), M.wrap(), 0, 0, -0.085);           // tsuka
  for (let i = 0; i < 8; i++) add(g, new THREE.TorusGeometry(0.0182, 0.0022, 4, 12).rotateY(Math.PI / 2), M.white(), 0, 0, -0.18 + i * 0.027);
  add(g, new THREE.SphereGeometry(0.02, 10, 8), M.brass(), 0, 0, -0.215);   // kashira
  g.userData = { mount: [-0.45, 0], reach: 2.6, tip: new THREE.Vector3(0, 0.02, 0.8) };
  return g;
}

function axe() {
  const g = new THREE.Group();
  add(g, cylZ(0.019, 0.016, 1.0, 10), M.wood(), 0, 0, 0.18);                 // haft
  // Double-bit head: two crescent blades (edges facing up and down) on a steel poll.
  add(g, box(0.034, 0.09, 0.13), M.steel(), 0, 0, 0.6);
  for (const s of [-1, 1]) {
    const pts = [[0.55, 0.04], [0.49, 0.13], [0.48, 0.2], [0.6, 0.225], [0.72, 0.2], [0.71, 0.13], [0.65, 0.04]].map(([z, y]) => [z, y * s]);
    if (s < 0) pts.reverse();
    add(g, bladeGeo(pts, 0.014), M.blade());
  }
  add(g, new THREE.SphereGeometry(0.024, 8, 6), M.dark(), 0, 0, -0.33);
  add(g, cylZ(0.021, 0.021, 0.2, 10), M.rubber(), 0, 0, -0.18);
  g.userData = { mount: [-0.4, 0], reach: 2.5, tip: new THREE.Vector3(0, 0, 0.65) };
  return g;
}

// ---- Firearms -------------------------------------------------------------

function pistol() {
  const g = new THREE.Group();
  const slide = new THREE.Group(); g.add(slide);
  add(slide, box(0.03, 0.036, 0.2), M.gun(), 0, 0.036, 0.09);
  add(slide, box(0.006, 0.01, 0.02), M.dark(), 0, 0.058, 0.185);                // front sight
  add(slide, box(0.016, 0.01, 0.014), M.dark(), 0, 0.058, -0.0);                // rear sight
  for (let i = 0; i < 4; i++) add(slide, box(0.032, 0.03, 0.004), M.dark(), 0, 0.036, -0.0 + i * 0.01 - 0.02);
  add(g, box(0.028, 0.03, 0.15), M.poly(), 0, 0.006, 0.07);                      // frame
  add(g, box(0.03, 0.095, 0.045), M.poly(), 0, -0.05, 0.0, -0.18, 0, 0);          // grip
  add(g, box(0.0, 0.0, 0.0), M.poly());
  add(g, new THREE.TorusGeometry(0.02, 0.004, 5, 12, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2), M.poly(), 0, -0.012, 0.065); // trigger guard
  add(g, box(0.006, 0.018, 0.008), M.dark(), 0, -0.012, 0.055);                   // trigger
  add(g, cylZ(0.008, 0.008, 0.04, 8), M.dark(), 0, 0.036, 0.205);                // barrel tip
  const mag = add(g, box(0.024, 0.02, 0.04), M.dark(), 0, -0.105, -0.01, -0.18, 0, 0);
  g.add(flashMesh(0.24));
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.036, 0.215), flash: g.children[g.children.length - 1], parts: { slide, mag }, slideTravel: 0.04, scope: false };
  return g;
}

function smg() {
  const g = new THREE.Group();
  add(g, box(0.05, 0.062, 0.3), M.gun(), 0, 0.03, 0.12);                         // receiver
  add(g, box(0.046, 0.016, 0.3), M.dark(), 0, 0.07, 0.12);                       // top rail
  add(g, box(0.06, 0.045, 0.2), M.poly(), 0, 0.02, 0.2);                         // handguard
  add(g, cylZ(0.016, 0.016, 0.16, 12), M.dark(), 0, 0.034, 0.37);               // barrel
  add(g, cylZ(0.026, 0.026, 0.2, 14), M.dark(), 0, 0.034, 0.44);                // suppressor
  add(g, box(0.034, 0.1, 0.05), M.poly(), 0, -0.06, -0.01, -0.22, 0, 0);          // grip
  const mag = add(g, box(0.034, 0.17, 0.05), M.dark(), 0, -0.1, 0.13, 0.08, 0, 0);
  add(g, box(0.04, 0.045, 0.2), M.poly(), 0, 0.03, -0.14);                       // stock
  add(g, box(0.03, 0.07, 0.03), M.rubber(), 0, 0.02, -0.255);
  add(g, box(0.02, 0.025, 0.05), M.redDot(), 0, 0.095, 0.1);                     // sight
  add(g, box(0.034, 0.04, 0.06), M.dark(), 0, 0.085, 0.1);
  g.add(flashMesh(0.55));
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.034, 0.55), flash: g.children[g.children.length - 1], parts: { mag }, scope: false };
  return g;
}

function rifle() {
  const g = new THREE.Group();
  add(g, box(0.052, 0.07, 0.32), M.gun(), 0, 0.03, 0.1);                         // receiver
  add(g, box(0.05, 0.018, 0.34), M.dark(), 0, 0.075, 0.1);                       // rail
  add(g, cylZ(0.024, 0.024, 0.3, 12), M.poly(), 0, 0.02, 0.42);                 // handguard
  add(g, cylZ(0.011, 0.011, 0.26, 10), M.dark(), 0, 0.03, 0.66);                // barrel
  add(g, cylZ(0.018, 0.018, 0.07, 10), M.dark(), 0, 0.03, 0.8);                 // flash hider
  add(g, box(0.008, 0.05, 0.008), M.dark(), 0, 0.065, 0.78);                     // front sight post
  add(g, box(0.034, 0.09, 0.05), M.poly(), 0, -0.065, -0.02, -0.25, 0, 0);       // grip
  const mag = add(g, box(0.036, 0.15, 0.06), M.dark(), 0, -0.09, 0.15, 0.22, 0, 0);
  add(g, box(0.046, 0.07, 0.26), M.poly(), 0, 0.012, -0.18);                     // stock
  add(g, box(0.04, 0.1, 0.03), M.rubber(), 0, 0.0, -0.32);
  // Holographic optic.
  add(g, box(0.04, 0.05, 0.1), M.dark(), 0, 0.12, 0.1);
  add(g, box(0.03, 0.04, 0.004), M.glass(), 0, 0.125, 0.152);
  add(g, box(0.004, 0.004, 0.004), M.redDot(), 0, 0.125, 0.15);
  add(g, box(0.02, 0.07, 0.03), M.gun(), 0.0, 0.0, 0.34);                        // gas block
  g.add(flashMesh(0.84));
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.03, 0.84), flash: g.children[g.children.length - 1], parts: { mag }, scope: false };
  return g;
}

function shotgun() {
  const g = new THREE.Group();
  add(g, box(0.05, 0.065, 0.25), M.gun(), 0, 0.03, 0.04);                        // receiver
  add(g, cylZ(0.017, 0.017, 0.62, 12), M.gun(), 0, 0.045, 0.52);                // barrel
  add(g, cylZ(0.015, 0.015, 0.5, 12), M.dark(), 0, 0.0, 0.46);                  // magazine tube
  const pump = new THREE.Group(); g.add(pump);
  add(pump, cylZ(0.028, 0.028, 0.17, 12), M.woodDark(), 0, 0.0, 0.4);           // pump forend
  add(g, box(0.034, 0.09, 0.05), M.wood(), 0, -0.06, -0.04, -0.3, 0, 0);          // pistol grip
  add(g, box(0.046, 0.085, 0.3), M.wood(), 0, -0.005, -0.19, 0.1, 0, 0);        // stock
  add(g, box(0.048, 0.09, 0.02), M.rubber(), 0, -0.02, -0.35, 0.1, 0, 0);        // butt pad
  add(g, new THREE.SphereGeometry(0.012, 8, 6), M.brass(), 0, 0.068, 0.82);       // bead sight
  g.add(flashMesh(0.84));
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.045, 0.84), flash: g.children[g.children.length - 1], parts: { pump }, pumpTravel: 0.12, scope: false };
  return g;
}

function sniper() {
  const g = new THREE.Group();
  add(g, box(0.05, 0.07, 0.4), M.olive(), 0, 0.03, 0.12);                        // action
  add(g, cylZ(0.015, 0.012, 0.75, 12), M.gun(), 0, 0.042, 0.7);                 // barrel
  add(g, cylZ(0.02, 0.02, 0.12, 12), M.dark(), 0, 0.042, 1.12);                 // muzzle brake
  add(g, box(0.045, 0.08, 0.34), M.olive(), 0, 0.0, 0.34);                       // forend
  add(g, box(0.05, 0.1, 0.4), M.olive(), 0, -0.01, -0.2, 0.05, 0, 0);            // stock
  add(g, box(0.052, 0.04, 0.12), M.rubber(), 0, 0.075, -0.2);                    // cheek rest
  add(g, box(0.034, 0.09, 0.04), M.poly(), 0, -0.06, -0.03, -0.25, 0, 0);
  add(g, box(0.034, 0.07, 0.07), M.dark(), 0, -0.065, 0.2);                      // magazine
  const bolt = new THREE.Group(); g.add(bolt);
  add(bolt, cylZ(0.006, 0.006, 0.08, 6), M.steel(), 0.04, 0.05, 0.0, 0, 0, 0);
  add(bolt, new THREE.SphereGeometry(0.014, 8, 6), M.steel(), 0.07, 0.05, 0.0);
  // Scope with objective and ocular lenses.
  add(g, cylZ(0.022, 0.022, 0.3, 16), M.dark(), 0, 0.12, 0.14);
  add(g, cylZ(0.034, 0.034, 0.07, 16), M.dark(), 0, 0.12, 0.3);
  add(g, cylZ(0.03, 0.03, 0.004, 16), M.glass(), 0, 0.12, 0.337);
  add(g, cylZ(0.028, 0.028, 0.055, 16), M.dark(), 0, 0.12, -0.04);
  add(g, cylZ(0.024, 0.024, 0.004, 16), M.glass(), 0, 0.12, -0.07);
  add(g, box(0.012, 0.05, 0.02), M.dark(), 0, 0.085, 0.06); add(g, box(0.012, 0.05, 0.02), M.dark(), 0, 0.085, 0.22);
  // Bipod folded under the forend.
  for (const s of [-1, 1]) add(g, cylZ(0.006, 0.006, 0.2, 6), M.dark(), s * 0.025, -0.07, 0.62, 0, s * 0.08, 0);
  g.add(flashMesh(1.18));
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.042, 1.18), flash: g.children[g.children.length - 1], parts: { bolt }, scope: true };
  return g;
}

function launcher() {
  const g = new THREE.Group();
  add(g, cylZ(0.065, 0.065, 1.0, 20), M.olive(), 0, 0.03, 0.2);                  // tube
  add(g, cylZ(0.09, 0.07, 0.14, 20), M.olive(), 0, 0.03, 0.74);                  // front flare
  add(g, cylZ(0.082, 0.1, 0.16, 20), M.dark(), 0, 0.03, -0.35);                  // rear blast cone
  add(g, cylZ(0.04, 0.04, 0.02, 14), M.red(), 0, 0.03, 0.78);                    // rocket nose peeking out
  add(g, box(0.05, 0.1, 0.06), M.poly(), 0, -0.07, 0.08, -0.15, 0, 0);            // grip
  add(g, box(0.04, 0.1, 0.05), M.poly(), 0, -0.07, 0.32, 0.1, 0, 0);              // forward grip
  add(g, box(0.04, 0.04, 0.16), M.dark(), 0, 0.115, 0.15);                        // sight base
  add(g, box(0.034, 0.05, 0.004), M.glass(), 0, 0.145, 0.22);
  add(g, box(0.16, 0.012, 0.06), M.dark(), 0, 0.03, 0.4);                         // band
  for (const z of [-0.05, 0.45]) add(g, new THREE.TorusGeometry(0.067, 0.008, 6, 20).rotateY(0), M.dark(), 0, 0.03, z);
  g.add(flashMesh(0.82));
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.03, 0.84), flash: g.children[g.children.length - 1], scope: false, shoulder: true, back: 0.3 };
  return g;
}

function plasma() {
  const g = new THREE.Group();
  add(g, box(0.06, 0.07, 0.34), M.white(), 0, 0.03, 0.1);
  add(g, box(0.052, 0.05, 0.22), M.gun(), 0, 0.04, 0.34);
  for (let i = 0; i < 5; i++) add(g, new THREE.TorusGeometry(0.036, 0.007, 6, 18), M.plasmaGlow(), 0, 0.04, 0.26 + i * 0.065);
  add(g, cylZ(0.014, 0.014, 0.3, 10), M.plasmaGlow(), 0, 0.04, 0.4);            // glowing core
  add(g, cylZ(0.024, 0.014, 0.08, 12), M.gun(), 0, 0.04, 0.6);                  // emitter
  add(g, new THREE.SphereGeometry(0.02, 12, 8), M.plasmaGlow(), 0, 0.04, 0.64);
  add(g, box(0.034, 0.09, 0.05), M.dark(), 0, -0.06, 0.0, -0.25, 0, 0);
  add(g, box(0.05, 0.075, 0.24), M.white(), 0, 0.02, -0.2, 0.05, 0, 0);
  add(g, box(0.02, 0.03, 0.12), M.plasmaGlow(), 0, 0.075, 0.1);                   // energy gauge
  const fl = flashMesh(0.68);
  fl.children.forEach((c) => { c.material = new THREE.MeshBasicMaterial({ color: 0x4af0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); });
  g.add(fl);
  g.userData = { mount: [Math.PI / 2, 0], muzzle: new THREE.Vector3(0, 0.04, 0.68), flash: fl, scope: false, glow: true };
  return g;
}

export function grenadeModel() {
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(0.036, 14, 10); body.scale(1, 1.2, 1);
  add(g, body, M.olive());
  add(g, new THREE.CylinderGeometry(0.014, 0.016, 0.02, 10), M.steel(), 0, 0.046, 0);
  add(g, new THREE.TorusGeometry(0.014, 0.003, 4, 10), M.steel(), 0.016, 0.062, 0);
  add(g, box(0.006, 0.03, 0.012), M.steel(), 0.014, 0.05, 0);
  g.userData = { mount: [Math.PI / 2, 0] };
  return g;
}

export function rocketModel() {
  const g = new THREE.Group();
  add(g, cylZ(0.04, 0.04, 0.5, 12), M.olive(), 0, 0, 0);
  add(g, new THREE.ConeGeometry(0.04, 0.14, 12).rotateX(Math.PI / 2), M.red(), 0, 0, 0.32);
  for (let i = 0; i < 4; i++) { const f = add(g, box(0.004, 0.1, 0.1), M.dark(), 0, 0, -0.2); f.rotation.z = i * Math.PI / 2; f.position.set(Math.cos(i * Math.PI / 2) * 0.06, Math.sin(i * Math.PI / 2) * 0.06, -0.2); f.rotation.z = i * Math.PI / 2 + Math.PI / 2; }
  return g;
}

const BUILDERS = { knife, katana, axe, pistol, smg, rifle, shotgun, sniper, launcher, plasma };
export function buildWeaponModel(id) { return BUILDERS[id]?.() ?? null; }
