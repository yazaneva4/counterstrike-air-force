// Procedural people. Each person is an articulated rig of shared primitives
// with realistic adult proportions (about 1.6-1.9 m), individual skin, hair,
// clothing and headwear, and a small procedural animation system that blends
// walking, running, swimming, idling, waving, talking, pointing at the sky,
// dancing, sitting, parachuting and piloting. The same rig with different
// proportions makes the island's grey visitors.

import * as THREE from 'three';
import { stdMat, damp, clamp, smoothstep, lerp } from '../core/util.js';

const G = {}; // shared geometries
function geos() {
  if (G.ready) return G;
  G.torso = new THREE.CapsuleGeometry(0.15, 0.3, 6, 14); G.torso.scale(1.18, 1, 0.7);
  G.pelvis = new THREE.SphereGeometry(0.16, 14, 10); G.pelvis.scale(1.08, 0.72, 0.78);
  G.neck = new THREE.CylinderGeometry(0.048, 0.056, 0.12, 10);
  G.head = new THREE.SphereGeometry(0.104, 20, 16); G.head.scale(0.9, 1.12, 1.0);
  G.hairShort = new THREE.SphereGeometry(0.112, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); G.hairShort.scale(0.95, 1.1, 1.06);
  G.hairLong = new THREE.CapsuleGeometry(0.1, 0.16, 4, 12); G.hairLong.scale(1.05, 1, 0.55);
  G.bun = new THREE.SphereGeometry(0.05, 10, 8);
  G.beard = new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.35); G.beard.scale(0.88, 1.05, 1.02);
  G.eye = new THREE.SphereGeometry(0.013, 8, 6);
  G.nose = new THREE.ConeGeometry(0.016, 0.045, 6); G.nose.rotateX(Math.PI / 2);
  G.ear = new THREE.SphereGeometry(0.022, 8, 6); G.ear.scale(0.5, 1, 0.8);
  G.upperArm = new THREE.CapsuleGeometry(0.047, 0.22, 4, 10);
  G.forearm = new THREE.CapsuleGeometry(0.04, 0.2, 4, 10);
  G.hand = new THREE.CapsuleGeometry(0.035, 0.06, 4, 8); G.hand.scale(1, 1, 0.6);
  G.thigh = new THREE.CapsuleGeometry(0.072, 0.32, 4, 12);
  G.shin = new THREE.CapsuleGeometry(0.056, 0.32, 4, 10);
  G.foot = new THREE.BoxGeometry(0.1, 0.075, 0.25); G.foot.translate(0, 0, 0.05);
  G.cap = new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.brim = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI); G.brim.scale(1, 1, 1.4);
  G.hardhat = new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.hatRim = new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20);
  G.straw = new THREE.CylinderGeometry(0.24, 0.26, 0.018, 20);
  G.strawTop = new THREE.CylinderGeometry(0.1, 0.11, 0.1, 16);
  G.helmet = new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  G.visor = new THREE.SphereGeometry(0.137, 16, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.22);
  G.vest = new THREE.CapsuleGeometry(0.158, 0.26, 4, 12); G.vest.scale(1.2, 1, 0.74);
  G.stripe = new THREE.TorusGeometry(0.19, 0.012, 4, 20); G.stripe.scale(1, 0.7, 1); G.stripe.rotateX(Math.PI / 2);
  G.backpack = new THREE.BoxGeometry(0.28, 0.36, 0.14);
  G.coat = new THREE.CylinderGeometry(0.2, 0.25, 0.55, 14, 1, true);
  G.alienHead = new THREE.SphereGeometry(0.16, 22, 18); G.alienHead.scale(1, 1.25, 1.05);
  G.alienEye = new THREE.SphereGeometry(0.05, 14, 10); G.alienEye.scale(1.55, 0.8, 0.5);
  G.ready = true;
  return G;
}

export const SKIN_TONES = [0xf1c7a5, 0xe0ac86, 0xc68a62, 0xa66d47, 0x7c4c32, 0x5a3825, 0xf6d6bd, 0xd29c74];
export const HAIR_COLORS = [0x1b1511, 0x3a2618, 0x5a3b22, 0x8a6035, 0xc79a5b, 0xd8c7a4, 0x2d2d2d, 0x6b1f14, 0x9a9a9a];
const SHIRTS = [0x2e5c8a, 0xb23a3a, 0xf0f0ea, 0x3c7a4a, 0xe0b040, 0x5a4a8a, 0x2a2a2e, 0xd98a50, 0x6fa8c8, 0xc86a8a, 0x8a9a5a];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4a38, 0x6e7a8a, 0x2a2a2a, 0xa89a7a, 0x384a3a];

// Pick a believable outfit for a role using a seeded random source.
export function outfitFor(role, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const female = rnd() < 0.5;
  const o = {
    skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS), shirt: pick(SHIRTS), pants: pick(PANTS), shoes: pick([0x222222, 0x5a3a22, 0xe8e8e8, 0x3a3a50]),
    hairStyle: female ? pick(['long', 'long', 'bun', 'short']) : pick(['short', 'short', 'bald', 'short']),
    beard: !female && rnd() < 0.3, hat: null, vest: false, backpack: false, coat: false, longSleeves: rnd() < 0.4,
    height: (female ? 1.64 : 1.76) + (rnd() - 0.5) * 0.14, build: female ? 0.9 : 1 + (rnd() - 0.5) * 0.15, female,
  };
  switch (role) {
    case 'crew': o.shirt = 0x3a4a5a; o.pants = 0x2a3440; o.vest = true; o.hat = rnd() < 0.6 ? 'hardhat' : 'cap'; o.longSleeves = true; break;
    case 'pilot': o.shirt = 0x4a5a3a; o.pants = 0x4a5a3a; o.longSleeves = true; o.hat = rnd() < 0.5 ? 'helmet' : null; break;
    case 'farmer': o.shirt = pick([0x8a3a2a, 0x3a5a8a, 0xd8c8a8]); o.pants = 0x3a4a6a; o.hat = 'straw'; break;
    case 'beach': o.shirt = pick([0xf2d24a, 0xe8584a, 0x4ac2e8, 0xffffff, 0xf29ac2]); o.pants = pick([0x2a6ab2, 0xe8e0c8, 0x3a3a3a]); o.longSleeves = false; o.shoes = o.skin; o.hat = rnd() < 0.3 ? 'cap' : null; break;
    case 'scientist': o.coat = true; o.shirt = 0xf4f4f4; o.longSleeves = true; o.backpack = false; break;
    case 'hiker': o.backpack = true; o.hat = rnd() < 0.5 ? 'cap' : null; o.shirt = pick([0xd86a2a, 0x2a8a6a, 0x8a2a4a]); break;
    case 'keeper': o.shirt = 0x2a3a5a; o.pants = 0x2a2a2a; o.beard = true; o.hat = 'cap'; o.longSleeves = true; break;
    default: break;
  }
  return o;
}

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

const J = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

export class Human {
  constructor(outfit = {}, { alien = false, shadows = true } = {}) {
    geos();
    this.alien = alien;
    const o = this.outfit = Object.assign({ skin: 0xe0ac86, hair: 0x3a2618, shirt: 0x2e5c8a, pants: 0x2b3a55, shoes: 0x222222, hairStyle: 'short', height: 1.76, build: 1 }, outfit);
    const skin = alien ? stdMat(0x9aa89a, { rough: 0.35, metal: 0.1, emissive: 0x1c2a22, ei: 1 }) : stdMat(o.skin, { rough: 0.62 });
    const shirt = alien ? skin : stdMat(o.shirt, { rough: 0.85 });
    const pants = alien ? skin : stdMat(o.pants, { rough: 0.9 });
    const shoes = alien ? skin : stdMat(o.shoes, { rough: 0.7 });
    const hair = stdMat(o.hair, { rough: 0.9 });
    const dark = stdMat(0x0b0b0e, { rough: 0.15, metal: 0.2 });

    this.root = new THREE.Group();
    this.root.name = 'human';
    const body = this.body = J(this.root, 0, 0, 0);
    const s = alien ? 1 : o.height / 1.78;
    body.scale.set(s * (alien ? 0.82 : o.build), alien ? 0.95 : s, s * (alien ? 0.8 : lerp(1, o.build, 0.5)));

    const P = this.j = {};
    P.pelvis = J(body, 0, 0.98, 0);
    addMesh(P.pelvis, G.pelvis, pants, 0, 0, 0, shadows);
    P.spine = J(P.pelvis, 0, 0.07, 0);
    const torso = addMesh(P.spine, G.torso, shirt, 0, 0.2, 0, shadows);
    if (o.female && !alien) torso.scale.set(0.94, 1, 1.06);
    if (o.vest) {
      addMesh(P.spine, G.vest, stdMat(0xf2c21a, { rough: 0.7, emissive: 0x3a2a00, ei: 0.4 }), 0, 0.22, 0, false);
      const refl = stdMat(0xdadada, { rough: 0.2, metal: 0.8, emissive: 0x777777, ei: 0.6 });
      addMesh(P.spine, G.stripe, refl, 0, 0.14, 0, false);
      addMesh(P.spine, G.stripe, refl, 0, 0.3, 0, false);
    }
    if (o.coat) {
      const coat = addMesh(P.spine, G.coat, stdMat(0xf5f5f2, { rough: 0.8, side: THREE.DoubleSide }), 0, -0.12, 0, shadows);
      coat.scale.set(1.05, 1, 0.8);
    }
    if (o.backpack) addMesh(P.spine, G.backpack, stdMat(0x3a4a3a, { rough: 0.9 }), 0, 0.26, -0.16, shadows);

    P.neck = J(P.spine, 0, 0.43, 0);
    addMesh(P.neck, G.neck, skin, 0, 0.05, 0, false);
    P.head = J(P.neck, 0, 0.1, 0);
    if (alien) {
      addMesh(P.head, G.alienHead, skin, 0, 0.12, 0.01, shadows);
      for (const sx of [-1, 1]) {
        const e = addMesh(P.head, G.alienEye, dark, sx * 0.062, 0.1, 0.13, false);
        e.rotation.set(0, sx * 0.35, sx * -0.35);
      }
    } else {
      addMesh(P.head, G.head, skin, 0, 0.1, 0, shadows);
      for (const sx of [-1, 1]) {
        addMesh(P.head, G.eye, dark, sx * 0.034, 0.115, 0.092, false);
        addMesh(P.head, G.ear, skin, sx * 0.094, 0.1, -0.005, false);
      }
      addMesh(P.head, G.nose, skin, 0, 0.085, 0.108, false);
      if (o.hairStyle !== 'bald') addMesh(P.head, G.hairShort, hair, 0, 0.115, -0.008, false);
      if (o.hairStyle === 'long') addMesh(P.head, G.hairLong, hair, 0, 0.03, -0.06, false);
      if (o.hairStyle === 'bun') addMesh(P.head, G.bun, hair, 0, 0.2, -0.08, false);
      if (o.beard) addMesh(P.head, G.beard, hair, 0, 0.1, 0.012, false);
      const hat = o.hat;
      if (hat === 'cap') {
        addMesh(P.head, G.cap, stdMat(o.capColor ?? 0x2a3a5a, { rough: 0.8 }), 0, 0.14, 0, false);
        addMesh(P.head, G.brim, stdMat(o.capColor ?? 0x2a3a5a, { rough: 0.8 }), 0, 0.15, 0.1, false);
      } else if (hat === 'hardhat') {
        addMesh(P.head, G.hardhat, stdMat(0xf2c21a, { rough: 0.4 }), 0, 0.14, 0, false);
        addMesh(P.head, G.hatRim, stdMat(0xf2c21a, { rough: 0.4 }), 0, 0.145, 0.01, false);
      } else if (hat === 'straw') {
        addMesh(P.head, G.straw, stdMat(0xd8c07a, { rough: 1 }), 0, 0.17, 0, false);
        addMesh(P.head, G.strawTop, stdMat(0xd8c07a, { rough: 1 }), 0, 0.22, 0, false);
      } else if (hat === 'helmet') {
        addMesh(P.head, G.helmet, stdMat(0xe8ecef, { rough: 0.3, metal: 0.2 }), 0, 0.1, 0, false);
        addMesh(P.head, G.visor, stdMat(0x1a2a3a, { rough: 0.05, metal: 0.9, emissive: 0x223344, ei: 0.3 }), 0, 0.1, 0, false);
      }
    }

    const armMat = o.longSleeves || alien ? shirt : skin;
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = P['shoulder' + side] = J(P.spine, sx * (alien ? 0.15 : o.female ? 0.17 : 0.19), 0.39, 0);
      addMesh(sh, G.upperArm, shirt, 0, -0.14, 0, shadows);
      const el = P['elbow' + side] = J(sh, 0, -0.29, 0);
      addMesh(el, G.forearm, armMat, 0, -0.13, 0, shadows);
      const hd = J(el, 0, -0.26, 0);
      addMesh(hd, G.hand, skin, 0, -0.02, 0, false);
      const hip = P['hip' + side] = J(P.pelvis, sx * 0.095, -0.03, 0);
      addMesh(hip, G.thigh, pants, 0, -0.22, 0, shadows);
      const kn = P['knee' + side] = J(hip, 0, -0.45, 0);
      addMesh(kn, G.shin, pants, 0, -0.21, 0, shadows);
      const an = P['ankle' + side] = J(kn, 0, -0.43, 0);
      addMesh(an, G.foot, shoes, 0, -0.035, 0, shadows);
    }
    if (alien) {
      for (const side of ['L', 'R']) {
        P['elbow' + side].children[0].scale.set(0.7, 1.25, 0.7);
        P['shoulder' + side].children[0].scale.set(0.7, 1.15, 0.7);
      }
      P.head.scale.setScalar(1.25);
    }

    // Parachute canopy (only shown while descending under it).
    this.chute = new THREE.Group();
    const canopyG = new THREE.SphereGeometry(3.4, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32);
    canopyG.scale(1.25, 0.8, 1);
    const canopy = new THREE.Mesh(canopyG, new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8, side: THREE.DoubleSide }));
    canopy.position.y = 3.4; canopy.castShadow = true;
    this.chute.add(canopy);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x333333 });
    const pts = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pts.push(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(Math.cos(a) * 3.2 * 1.25 * 0.85, 4.3 + 0.2, Math.sin(a) * 3.2 * 0.85)); }
    this.chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    this.chute.position.y = 1.2;
    this.chute.visible = false;
    this.root.add(this.chute);

    this.phase = Math.random() * 10;
    this.t = Math.random() * 100;
    this.state = 'idle';
    this.speed = 0;
    this.gesture = null;       // 'wave' | 'talk' | 'point' | 'dance' | null
    this.pointElev = 0.8;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.pose = {};
  }

  get position() { return this.root.position; }

  // Animate. state: idle|walk|swim|air|chute|sit|lie|pilot|dead
  animate(dt) {
    this.t += dt;
    const t = this.t, sp = this.speed, J2 = this.j;
    const st = this.state;
    const walk = clamp(sp / 1.4, 0, 1), run = smoothstep(2.4, 5.2, sp);
    const freq = Math.min(sp / 1.5, 0.9 + sp * 0.09);
    if (st === 'swim') this.phase += dt * 2.2 * Math.PI * 0.6;
    else this.phase += dt * Math.PI * 2 * freq;
    const ph = this.phase;
    const T = {}; // target rotations: joint -> [x, y, z]
    const set = (k, x = 0, y = 0, z = 0) => { T[k] = [x, y, z]; };
    let pelvisY = 0.98, rootTiltX = 0;

    // Base locomotion.
    const legA = 0.42 * walk + 0.38 * run;
    const armA = 0.38 * walk + 0.55 * run;
    const kneeA = 0.55 * walk + 0.9 * run;
    const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
    const kL = Math.max(0, Math.cos(ph + 0.75)), kR = Math.max(0, Math.cos(ph + Math.PI + 0.75));
    set('hipL', -sL * legA); set('hipR', -sR * legA);
    set('kneeL', kL * kneeA + 0.04); set('kneeR', kR * kneeA + 0.04);
    set('ankleL', sL * legA * 0.35 - kL * kneeA * 0.25); set('ankleR', sR * legA * 0.35 - kR * kneeA * 0.25);
    set('shoulderL', sL * armA, 0, 0.07 + run * 0.05); set('shoulderR', sR * armA, 0, -0.07 - run * 0.05);
    set('elbowL', -0.12 - run * 1.1 - walk * 0.15); set('elbowR', -0.12 - run * 1.1 - walk * 0.15);
    set('spine', 0.03 * walk + 0.16 * run + Math.sin(t * 1.7) * 0.012 * (1 - walk), Math.sin(ph) * 0.06 * walk);
    set('pelvis', 0, -Math.sin(ph) * 0.07 * walk);
    set('neck', -0.02 * run, 0);
    set('head', this.lookPitch, this.lookYaw);
    pelvisY = 0.98 - (Math.abs(Math.cos(ph)) * 0.035 * walk + run * 0.04) + Math.abs(Math.sin(ph)) * 0.05 * run;

    if (sp < 0.15 && st === 'idle') {
      // Idle: breathing, weight shift, glancing around.
      set('spine', Math.sin(t * 1.6) * 0.015, Math.sin(t * 0.3) * 0.05);
      set('hipL', 0.02, 0, 0.03 + Math.sin(t * 0.4) * 0.02); set('hipR', -0.02, 0, -0.03 + Math.sin(t * 0.4) * 0.02);
      set('kneeL', 0.05 + Math.max(0, Math.sin(t * 0.4)) * 0.08); set('kneeR', 0.05 + Math.max(0, -Math.sin(t * 0.4)) * 0.08);
      set('shoulderL', 0.05 + Math.sin(t * 1.6) * 0.02, 0, 0.1); set('shoulderR', 0.05 + Math.sin(t * 1.6 + 1) * 0.02, 0, -0.1);
      if (!this.lookLocked) set('head', Math.sin(t * 0.23) * 0.1, Math.sin(t * 0.37) * 0.5);
    }

    if (st === 'air') {
      set('hipL', -0.6); set('hipR', -0.25); set('kneeL', 0.9); set('kneeR', 0.5);
      set('shoulderL', -0.4, 0, 0.5); set('shoulderR', -0.4, 0, -0.5); set('elbowL', -0.4); set('elbowR', -0.4);
    } else if (st === 'chute') {
      const sway = Math.sin(t * 1.3) * 0.1;
      set('shoulderL', 0, 0, 2.75); set('shoulderR', 0, 0, -2.75); set('elbowL', -0.3); set('elbowR', -0.3);
      set('hipL', -0.15 + sway); set('hipR', -0.05 - sway); set('kneeL', 0.25); set('kneeR', 0.15);
      set('head', -0.2, 0);
    } else if (st === 'swim') {
      rootTiltX = 1.25;
      pelvisY = 0.98;
      set('shoulderL', -Math.PI - Math.sin(ph) * 1.4, 0, 0.2); set('shoulderR', -Math.PI - Math.sin(ph + Math.PI) * 1.4, 0, -0.2);
      set('elbowL', -0.3); set('elbowR', -0.3);
      set('hipL', Math.sin(t * 7) * 0.25); set('hipR', -Math.sin(t * 7) * 0.25); set('kneeL', 0.2); set('kneeR', 0.2);
      set('head', -0.9, 0); set('spine', -0.1);
    } else if (st === 'sit') {
      pelvisY = 0.16;
      set('hipL', -1.45, 0, 0.1); set('hipR', -1.45, 0, -0.1); set('kneeL', 0.35); set('kneeR', 0.5);
      set('ankleL', -0.2); set('ankleR', -0.2);
      set('shoulderL', 0.55, 0, 0.25); set('shoulderR', 0.55, 0, -0.25); set('elbowL', 0); set('elbowR', 0);
      set('spine', -0.18);
    } else if (st === 'lie') {
      rootTiltX = -Math.PI / 2 + 0.05;
      pelvisY = 0.98;
      set('shoulderL', 0.1, 0, 0.35); set('shoulderR', 0.1, 0, -0.35); set('hipL', 0, 0, 0.06); set('hipR', 0, 0, -0.06);
      set('head', 0.15, Math.sin(t * 0.2) * 0.3);
    } else if (st === 'pilot') {
      pelvisY = 0.52;
      set('hipL', -1.45, 0, 0.06); set('hipR', -1.45, 0, -0.06); set('kneeL', 1.35); set('kneeR', 1.35); set('ankleL', -0.1); set('ankleR', -0.1);
      set('shoulderL', -0.55, 0, 0.18); set('shoulderR', -0.6, 0, -0.12); set('elbowL', -0.7); set('elbowR', -0.8);
      set('spine', -0.08);
    }

    // Upper-body gestures layered on top.
    const g = this.gesture;
    if (g === 'wave') {
      set('shoulderR', -0.2, 0, -2.55 + Math.sin(t * 9) * 0.18); set('elbowR', -0.35 - Math.sin(t * 9) * 0.2);
      set('head', 0.05, this.lookYaw);
    } else if (g === 'talk') {
      set('shoulderL', -0.35 + Math.sin(t * 2.1) * 0.15, 0, 0.18); set('elbowL', -1.1 + Math.sin(t * 3.3) * 0.3);
      set('shoulderR', -0.25 + Math.sin(t * 1.7 + 1) * 0.2, 0, -0.18); set('elbowR', -0.9 + Math.sin(t * 2.7) * 0.35);
      set('head', Math.sin(t * 1.9) * 0.08, this.lookYaw + Math.sin(t * 0.9) * 0.1);
    } else if (g === 'point') {
      set('shoulderR', -Math.PI / 2 - this.pointElev, 0, -0.1); set('elbowR', -0.05);
      set('shoulderL', 0.1, 0, 0.35); set('elbowL', -0.2);
      set('head', -this.pointElev * 0.8, 0);
    } else if (g === 'dance') {
      const b = Math.sin(t * 7.5);
      pelvisY = 0.98 - Math.abs(b) * 0.07;
      set('shoulderL', -2.4 + Math.sin(t * 3.7) * 0.4, 0, 0.5); set('shoulderR', -2.4 + Math.cos(t * 3.7) * 0.4, 0, -0.5);
      set('elbowL', -0.6); set('elbowR', -0.6);
      set('hipL', -0.15 + b * 0.15); set('hipR', -0.15 - b * 0.15); set('kneeL', 0.3 + Math.abs(b) * 0.3); set('kneeR', 0.3 + Math.abs(b) * 0.3);
      set('spine', 0.05, Math.sin(t * 3.75) * 0.3);
      set('head', Math.sin(t * 7.5) * 0.12, 0);
    } else if (g === 'scan') {
      set('shoulderR', -1.35, 0, -0.1); set('elbowR', -0.5); set('shoulderL', -1.2, 0, 0.1); set('elbowL', -0.7);
      set('head', -0.15, 0);
    }

    // Blend current joint rotations toward the targets.
    const rate = 12;
    for (const k in T) {
      const jn = J2[k];
      if (!jn) continue;
      const [x, y, z] = T[k];
      jn.rotation.x = damp(jn.rotation.x, x, rate, dt);
      jn.rotation.y = damp(jn.rotation.y, y, rate, dt);
      jn.rotation.z = damp(jn.rotation.z, z, rate, dt);
    }
    J2.pelvis.position.y = damp(J2.pelvis.position.y, pelvisY, rate, dt);
    this.body.rotation.x = damp(this.body.rotation.x, rootTiltX, 6, dt);
    this.body.position.y = damp(this.body.position.y, st === 'lie' ? 0.14 : 0, 6, dt);
    this.chute.visible = st === 'chute';
  }
}
