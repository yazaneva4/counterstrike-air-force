// Procedural people. Each person is an articulated rig with realistic adult
// proportions (about 1.6-1.9 m): anatomically shaped torso and limbs, a
// sculpted head with a painted face (eyes, brows, lips, stubble), hair
// styles with strand normals, fabric-textured clothing with collars, belts
// and sleeves, articulated hands and shoes. A small procedural animation
// system blends walking, running, swimming, idling, waving, talking,
// pointing at the sky, dancing, sitting, parachuting and piloting. The same
// rig makes astronauts in pressure suits and the island's grey visitors.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stdMat, damp, clamp, smoothstep, lerp } from '../core/util.js';
import { fabric, tileNoise, normalCanvas } from '../core/textures.js';
import { mulberry32 } from '../core/noise.js';

// Body of revolution around +Y from [[radius, y], ...] (ascending y),
// squashed to an ellipse (sx, sz) for anatomical cross-sections.
function lathe(profile, segs = 16, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), segs);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

const ni = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (parts) => mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return ni(p); }));

const G = {}; // shared geometries
function geos() {
  if (G.ready) return G;
  // Torso: waist, ribcage, chest and shoulders, neck opening.
  G.torsoM = lathe([[0.05, -0.04], [0.13, -0.02], [0.135, 0.06], [0.15, 0.16], [0.165, 0.26], [0.168, 0.33], [0.155, 0.39], [0.12, 0.435], [0.06, 0.46], [0.045, 0.47]], 24, 1.22, 0.66);
  G.torsoF = lathe([[0.05, -0.04], [0.125, -0.02], [0.12, 0.07], [0.135, 0.17], [0.15, 0.26], [0.15, 0.33], [0.14, 0.39], [0.11, 0.43], [0.055, 0.455], [0.042, 0.465]], 24, 1.12, 0.68);
  G.hips = lathe([[0.05, -0.135], [0.12, -0.11], [0.158, -0.07], [0.165, -0.02], [0.155, 0.04], [0.135, 0.085]], 22, 1.06, 0.74);
  G.hipsF = lathe([[0.05, -0.135], [0.13, -0.11], [0.17, -0.07], [0.178, -0.02], [0.16, 0.04], [0.13, 0.085]], 22, 1.1, 0.76);
  G.belt = new THREE.TorusGeometry(0.152, 0.014, 6, 28); G.belt.rotateX(Math.PI / 2); G.belt.scale(1.06, 1, 0.74);
  G.buckle = new THREE.BoxGeometry(0.045, 0.03, 0.01);
  G.pockets = mergeGeometries([-1, 1].map(side => new THREE.BoxGeometry(0.078, 0.095, 0.008).translate(side * 0.078, 0.28, 0.106)));
  G.zipper = new THREE.BoxGeometry(0.004, 0.29, 0.004);
  G.collar = new THREE.TorusGeometry(0.058, 0.014, 6, 20); G.collar.rotateX(Math.PI / 2);
  G.neck = lathe([[0.056, -0.01], [0.05, 0.05], [0.048, 0.1], [0.052, 0.13]], 14);
  // Head: a sphere sculpted into a skull with jaw, chin and flatter face.
  const head = new THREE.SphereGeometry(0.105, 36, 28);
  const p = head.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 0.86; y *= 1.16; z *= 1.02;
    if (y < 0) { const k = clamp(-y / 0.12, 0, 1); x *= 1 - k * 0.32; z *= 1 - k * 0.12 * (z < 0 ? 1.4 : 0.3); }
    if (y < -0.07 && z > 0.02) z += (-0.07 - y) * 0.35;      // chin
    if (z > 0.06 && Math.abs(y) < 0.05) z *= 0.97;            // flatter face plane
    if (z < -0.02 && y > 0) z *= 1.06;                        // occiput
    if (Math.abs(x) > 0.07 && Math.abs(y - 0.01) < 0.03 && z > 0.02) x *= 1.03; // cheekbones
    p.setXYZ(i, x, y, z);
  }
  head.computeVertexNormals();
  G.head = head;
  G.nose = new THREE.SphereGeometry(0.017, 12, 8); G.nose.scale(0.6, 1.45, 0.85);
  G.ear = new THREE.SphereGeometry(0.024, 10, 8); G.ear.scale(0.38, 1, 0.7);
  // Hair: a shell grown from the skull above a natural hairline.
  G.hairShort = hairShell(head, (x, y, z) => y > 0.028 + 0.03 * Math.max(z / 0.1, 0) - 0.085 * Math.max(-z / 0.1, 0) - (Math.abs(x) > 0.07 && z < 0.03 ? 0.015 : 0), 0.0075);
  G.hairLong = lathe([[0.03, -0.24], [0.085, -0.2], [0.105, -0.1], [0.112, 0.0], [0.108, 0.06], [0.07, 0.1]], 24, 0.98, 0.66);
  G.hairLong.translate(0, 0, -0.012);
  G.bun = new THREE.SphereGeometry(0.048, 14, 10);
  G.beard = hairShell(head, (x, y, z) => y < 0.004 && z > -0.015 && !(Math.abs(x) < 0.024 && y < -0.035 && y > -0.058 && z > 0.07), 0.006);
  // Limbs (shaped with muscle bulges).
  G.deltoid = new THREE.SphereGeometry(0.05, 14, 10); G.deltoid.scale(0.95, 0.85, 0.9);
  G.upperArm = lathe([[0.036, -0.3], [0.04, -0.24], [0.047, -0.13], [0.05, -0.05], [0.048, 0], [0.025, 0.03]], 14, 1, 0.92);
  G.sleeve = lathe([[0.056, -0.15], [0.058, -0.13], [0.058, -0.03], [0.05, 0.03], [0.02, 0.05]], 16, 1, 0.95);
  G.forearm = lathe([[0.027, -0.27], [0.031, -0.21], [0.041, -0.1], [0.041, -0.03], [0.032, 0.02]], 14, 1.08, 0.85);
  G.hand = buildHand();
  G.thigh = lathe([[0.055, -0.46], [0.06, -0.41], [0.074, -0.26], [0.085, -0.1], [0.084, 0], [0.06, 0.04]], 16, 1, 1);
  G.shin = lathe([[0.034, -0.44], [0.038, -0.39], [0.053, -0.25], [0.058, -0.15], [0.05, -0.03], [0.046, 0.02]], 16, 1, 0.95);
  G.shoe = buildShoe();
  G.sole = new THREE.BoxGeometry(0.1, 0.02, 0.27); G.sole.translate(0, -0.066, 0.045);
  // Headwear and gear.
  G.cap = new THREE.SphereGeometry(0.12, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.brim = new THREE.CylinderGeometry(0.1, 0.1, 0.01, 18, 1, false, -Math.PI / 2, Math.PI); G.brim.scale(1, 1, 1.45);
  G.hardhat = new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.hatRim = new THREE.CylinderGeometry(0.152, 0.152, 0.012, 24);
  G.straw = new THREE.CylinderGeometry(0.24, 0.27, 0.018, 28);
  G.strawTop = new THREE.CylinderGeometry(0.1, 0.112, 0.1, 20);
  G.helmet = new THREE.SphereGeometry(0.135, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  G.visor = new THREE.SphereGeometry(0.137, 20, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.34, Math.PI * 0.2);
  G.vest = lathe([[0.14, 0.02], [0.16, 0.16], [0.172, 0.28], [0.165, 0.36], [0.13, 0.41]], 22, 1.24, 0.7);
  G.stripe = new THREE.TorusGeometry(0.2, 0.011, 4, 26); G.stripe.scale(1.2, 1, 0.72); G.stripe.rotateX(Math.PI / 2);
  G.backpack = new THREE.BoxGeometry(0.28, 0.38, 0.14, 2, 2, 2);
  G.coat = lathe([[0.25, -0.62], [0.225, -0.3], [0.175, 0.02], [0.18, 0.2], [0.176, 0.34], [0.16, 0.4], [0.12, 0.44]], 24, 1.18, 0.74);
  // Astronaut pressure suit pieces.
  G.suitTorso = lathe([[0.06, -0.06], [0.17, -0.03], [0.18, 0.1], [0.195, 0.26], [0.2, 0.36], [0.17, 0.43], [0.09, 0.48]], 24, 1.2, 0.8);
  G.suitLimb = lathe([[0.06, -0.3], [0.066, -0.2], [0.07, -0.08], [0.068, 0.02]], 14);
  G.suitLeg = lathe([[0.07, -0.46], [0.076, -0.3], [0.09, -0.12], [0.092, 0.03]], 16);
  G.pack = new THREE.BoxGeometry(0.4, 0.5, 0.2, 2, 2, 2);
  G.bubble = new THREE.SphereGeometry(0.17, 28, 20);
  G.goldVisor = new THREE.SphereGeometry(0.172, 26, 16, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.24, Math.PI * 0.4);
  G.ring = new THREE.TorusGeometry(0.12, 0.03, 8, 24); G.ring.rotateX(Math.PI / 2);
  G.glove = new THREE.SphereGeometry(0.05, 12, 10); G.glove.scale(1, 1.3, 0.8);
  G.boot = new THREE.BoxGeometry(0.13, 0.12, 0.3, 2, 2, 2); G.boot.translate(0, -0.04, 0.04);
  G.alienHead = new THREE.SphereGeometry(0.16, 28, 22); G.alienHead.scale(1, 1.25, 1.05);
  G.alienEye = new THREE.SphereGeometry(0.05, 16, 12); G.alienEye.scale(1.55, 0.8, 0.5);
  G.ready = true;
  return G;
}

// Keep the skull triangles where every vertex is inside the hair region and
// push them out along the normal (with a little tufting).
function hairShell(head, inside, offset) {
  const src = head.index ? head.toNonIndexed() : head;
  const p = src.attributes.position, n = src.attributes.normal;
  const pos = [];
  for (let t = 0; t < p.count; t += 3) {
    let ok = true;
    for (let k = 0; k < 3; k++) if (!inside(p.getX(t + k), p.getY(t + k), p.getZ(t + k))) ok = false;
    if (!ok) continue;
    for (let k = 0; k < 3; k++) {
      const i = t + k, x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const tuft = offset * (1 + 0.35 * Math.sin(x * 260) * Math.sin(y * 210 + z * 170)) + (y > 0.08 ? 0.004 : 0);
      pos.push(x + n.getX(i) * tuft, y + n.getY(i) * tuft, z + n.getZ(i) * tuft);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = Math.atan2(pos[i * 3], pos[i * 3 + 2]) * 0.5; uv[i * 2 + 1] = pos[i * 3 + 1] * 8; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function buildHand() {
  const parts = [];
  const palm = new THREE.BoxGeometry(0.075, 0.085, 0.028); palm.translate(0, -0.045, 0);
  parts.push(palm);
  for (let f = 0; f < 4; f++) {
    const len = [0.062, 0.07, 0.066, 0.052][f];
    const fg = new THREE.CapsuleGeometry(0.0085, len, 3, 6);
    fg.rotateX(0.35); fg.translate(-0.027 + f * 0.018, -0.09 - len * 0.45, 0.008);
    parts.push(fg);
  }
  const th = new THREE.CapsuleGeometry(0.01, 0.045, 3, 6); th.rotateZ(0.7); th.rotateX(0.3); th.translate(0.045, -0.04, 0.012);
  parts.push(th);
  const g = merge(parts); g.computeVertexNormals();
  return g;
}

function buildShoe() {
  const upper = new THREE.SphereGeometry(0.06, 16, 10); upper.scale(0.8, 0.62, 2.1); upper.translate(0, -0.03, 0.05);
  const heel = new THREE.CylinderGeometry(0.045, 0.047, 0.07, 14); heel.translate(0, -0.03, -0.05);
  const g = merge([upper, heel]); g.computeVertexNormals();
  return g;
}

export const SKIN_TONES = [0xf1c7a5, 0xe0ac86, 0xc68a62, 0xa66d47, 0x7c4c32, 0x5a3825, 0xf6d6bd, 0xd29c74];
export const HAIR_COLORS = [0x1b1511, 0x3a2618, 0x5a3b22, 0x8a6035, 0xc79a5b, 0xd8c7a4, 0x2d2d2d, 0x6b1f14, 0x9a9a9a];
const EYE_COLORS = ['#3b2414', '#5a3a1e', '#2f6a8a', '#4a7a4a', '#6b5a30', '#2a1a10'];
const SHIRTS = [0x2e5c8a, 0xb23a3a, 0xf0f0ea, 0x3c7a4a, 0xe0b040, 0x5a4a8a, 0x2a2a2e, 0xd98a50, 0x6fa8c8, 0xc86a8a, 0x8a9a5a];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4a38, 0x6e7a8a, 0x2a2a2a, 0xa89a7a, 0x384a3a];

// A mixed island population makes the same roles feel like a lived-in place.
export const FEMALE_SHARE = 0.5;

// Pick a believable outfit for a role using a seeded random source.
export function outfitFor(role, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const female = rnd() < FEMALE_SHARE;
  const o = {
    skin: pick(SKIN_TONES), hair: pick(HAIR_COLORS), eye: pick(EYE_COLORS), shirt: pick(SHIRTS), pants: pick(PANTS), shoes: pick([0x222222, 0x5a3a22, 0xe8e8e8, 0x3a3a50]),
    hairStyle: female ? pick(['long', 'long', 'bun', 'short']) : pick(['short', 'short', 'bald', 'short']),
    beard: !female && rnd() < 0.3, stubble: !female && rnd() < 0.4, hat: null, vest: false, backpack: false, coat: false, longSleeves: rnd() < 0.4,
    shorts: false, belt: rnd() < 0.7, collar: rnd() < 0.5,
    height: (female ? 1.64 : 1.76) + (rnd() - 0.5) * 0.14, build: female ? 0.92 : 1 + (rnd() - 0.5) * 0.15, female, seed: Math.floor(rnd() * 1e6),
  };
  switch (role) {
    case 'crew': o.shirt = 0x3a4a5a; o.pants = 0x2a3440; o.vest = true; o.hat = rnd() < 0.6 ? 'hardhat' : 'cap'; o.longSleeves = true; break;
    case 'pilot': o.shirt = 0x4a5a3a; o.pants = 0x4a5a3a; o.longSleeves = true; o.collar = true; o.hat = rnd() < 0.5 ? 'helmet' : null; break;
    case 'farmer': o.shirt = pick([0x8a3a2a, 0x3a5a8a, 0xd8c8a8]); o.pants = 0x3a4a6a; o.hat = 'straw'; break;
    case 'beach': o.shirt = pick([0xf2d24a, 0xe8584a, 0x4ac2e8, 0xffffff, 0xf29ac2]); o.pants = pick([0x2a6ab2, 0xe8e0c8, 0x3a3a3a]); o.longSleeves = false; o.shorts = true; o.belt = false; o.shoes = o.skin; o.hat = rnd() < 0.3 ? 'cap' : null; break;
    case 'scientist': o.coat = true; o.shirt = 0xf4f4f4; o.longSleeves = true; o.collar = true; break;
    case 'hiker': o.backpack = true; o.shorts = rnd() < 0.5; o.hat = rnd() < 0.5 ? 'cap' : null; o.shirt = pick([0xd86a2a, 0x2a8a6a, 0x8a2a4a]); break;
    case 'keeper': o.female = false; o.hairStyle = 'short'; o.shirt = 0x2a3a5a; o.pants = 0x2a2a2a; o.beard = true; o.hat = 'cap'; o.longSleeves = true; break;
    case 'astronaut': o.suit = true; o.hat = null; break;
    default: if (rnd() < 0.25) o.shorts = true; break;
  }
  return o;
}

// ---- Face and skin textures -------------------------------------------------------

const hex = (c) => '#' + new THREE.Color(c).getHexString();
function shade(c, k) { const col = new THREE.Color(c); col.multiplyScalar(k); return '#' + col.getHexString(); }

const faceCache = new Map();
function faceTexture(o) {
  const key = [o.skin, o.hair, o.eye, o.female, o.stubble, o.beard].join('|');
  if (faceCache.has(key)) return faceCache.get(key);
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rnd = mulberry32(o.seed || 7);
  x.fillStyle = hex(o.skin); x.fillRect(0, 0, W, H);
  // Skin variation.
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${rnd() < 0.5 ? '120,60,40' : '255,230,210'},${0.03 + rnd() * 0.03})`;
    x.beginPath(); x.arc(rnd() * W, rnd() * H, 1 + rnd() * 3, 0, Math.PI * 2); x.fill();
  }
  const cx = 128; // face centre (u = 0.25 is the +Z front of a SphereGeometry)
  const eyeY = 117, browY = 101, mouthY = 161, noseY = 141;
  // Cheek warmth and under-eye / temple shading.
  const blush = (px, py, r, col, a) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); };
  blush(cx - 34, 140, 22, '200,80,70', o.female ? 0.22 : 0.12);
  blush(cx + 34, 140, 22, '200,80,70', o.female ? 0.22 : 0.12);
  blush(cx, 132, 60, '90,40,30', 0.06);
  blush(cx - 56, 120, 26, '60,30,20', 0.1);
  blush(cx + 56, 120, 26, '60,30,20', 0.1);
  // Stubble / beard shadow.
  if (o.stubble || o.beard) {
    for (let i = 0; i < 2200; i++) {
      const a = rnd() * Math.PI, r = 30 + rnd() * 22;
      const px = cx + Math.cos(a) * r * 1.05, py = 150 + Math.sin(a) * r * 0.9;
      if (py < 150 && Math.abs(px - cx) < 18) continue;
      x.fillStyle = `rgba(30,20,15,${0.08 + rnd() * 0.12})`;
      x.fillRect(px, py, 1, 1.4);
    }
  }
  // Eyes.
  for (const s of [-1, 1]) {
    const ex = cx + s * 30;
    x.fillStyle = shade(o.skin, 0.7); x.beginPath(); x.ellipse(ex, eyeY - 2, 15, 8.5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#efe9e2'; x.beginPath(); x.ellipse(ex, eyeY, 12.5, 5.8, 0, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.ellipse(ex, eyeY, 12.5, 5.8, 0, 0, Math.PI * 2); x.clip();
    x.fillStyle = o.eye; x.beginPath(); x.arc(ex, eyeY, 5.6, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#0a0806'; x.beginPath(); x.arc(ex, eyeY, 2.4, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(ex - 1.8, eyeY - 1.8, 1.2, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(ex - 13, eyeY - 6, 26, 3);
    x.restore();
    // Upper lid + lashes, lower lid.
    x.strokeStyle = 'rgba(25,15,10,0.9)'; x.lineWidth = o.female ? 2.2 : 1.6;
    x.beginPath(); x.ellipse(ex, eyeY + 0.5, 13, 6.4, 0, Math.PI * 1.06, Math.PI * 1.94); x.stroke();
    x.strokeStyle = shade(o.skin, 0.6); x.lineWidth = 1;
    x.beginPath(); x.ellipse(ex, eyeY - 0.5, 12.5, 6.2, 0, Math.PI * 0.12, Math.PI * 0.88); x.stroke();
    // Brows.
    x.strokeStyle = hex(o.hair === 0x9a9a9a ? 0x6a6a6a : o.hair); x.lineWidth = o.female ? 2.6 : 3.8; x.lineCap = 'round';
    x.beginPath(); x.moveTo(ex - s * 13, browY + 2); x.quadraticCurveTo(ex, browY - 4, ex + s * 15, browY + 1); x.stroke();
  }
  // Nose shading.
  x.fillStyle = shade(o.skin, 0.8);
  x.beginPath(); x.ellipse(cx - 6, noseY, 3, 2.2, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(cx + 6, noseY, 3, 2.2, 0, 0, Math.PI * 2); x.fill();
  blush(cx, 128, 9, '255,240,230', 0.15);
  // Lips.
  const lip = new THREE.Color(o.skin).lerp(new THREE.Color(o.female ? 0xb04a4a : 0x9a5a50), o.female ? 0.55 : 0.4);
  x.fillStyle = '#' + lip.getHexString();
  x.beginPath(); x.moveTo(cx - 14, mouthY); x.quadraticCurveTo(cx - 5, mouthY - 5, cx, mouthY - 3); x.quadraticCurveTo(cx + 5, mouthY - 5, cx + 14, mouthY);
  x.quadraticCurveTo(cx, mouthY + 7, cx - 14, mouthY); x.fill();
  x.strokeStyle = 'rgba(60,20,20,0.6)'; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(cx - 13, mouthY); x.quadraticCurveTo(cx, mouthY + 1.5, cx + 13, mouthY); x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faceCache.set(key, tex);
  return tex;
}

let hairNormalTex = null;
function hairNormal() {
  if (hairNormalTex) return hairNormalTex;
  const S = 128, n = tileNoise(S, 64, 1, 5), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) h[y * S + xx] = Math.sin(xx * 0.9 + n[y * S + xx] * 4) * 0.5;
  hairNormalTex = new THREE.CanvasTexture(normalCanvas(h, S, 2.2));
  hairNormalTex.wrapS = hairNormalTex.wrapT = THREE.RepeatWrapping;
  hairNormalTex.repeat.set(3, 3);
  return hairNormalTex;
}

let skinNormalTex;
function skinNormal() {
  if (!skinNormalTex) {
    skinNormalTex = new THREE.CanvasTexture(normalCanvas(tileNoise(128, 64, 2, 164), 128, 0.4));
    skinNormalTex.wrapS = skinNormalTex.wrapT = THREE.RepeatWrapping;
    skinNormalTex.repeat.set(3, 3);
  }
  return skinNormalTex;
}
const matCache = new Map();
function cloth(color, rough = 0.88) {
  const key = 'cloth' + color + rough;
  if (!matCache.has(key)) {
    const f = fabric();
    f.map.repeat.set(6, 6); f.normal.repeat.set(6, 6);
    matCache.set(key, new THREE.MeshStandardMaterial({ color, map: f.map, roughness: rough, metalness: 0, normalMap: f.normal, normalScale: new THREE.Vector2(0.24, 0.24) }));
  }
  return matCache.get(key);
}
function skinMat(color) {
  const key = 'skin' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, normalMap: skinNormal(), normalScale: new THREE.Vector2(0.12, 0.12) }));
  return matCache.get(key);
}
function hairMat(color) {
  const key = 'hair' + color;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.83, metalness: 0, normalMap: hairNormal(), normalScale: new THREE.Vector2(0.9, 0.9) }));
  return matCache.get(key);
}

function addMesh(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const J = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

export class Human {
  constructor(outfit = {}, { alien = false, shadows = true } = {}) {
    geos();
    this.alien = alien;
    const o = this.outfit = Object.assign({ skin: 0xe0ac86, hair: 0x3a2618, eye: '#3b2414', shirt: 0x2e5c8a, pants: 0x2b3a55, shoes: 0x222222, hairStyle: 'short', height: 1.76, build: 1, seed: 1 }, outfit);
    const suit = !!o.suit && !alien;
    const alienSkin = stdMat(0x9aa89a, { rough: 0.35, metal: 0.1, emissive: 0x1c2a22, ei: 1 });
    const skin = alien ? alienSkin : skinMat(o.skin);
    const suitWhite = stdMat(0xeceae4, { rough: 0.78 });
    const suitGrey = stdMat(0x8c8f93, { rough: 0.6, metal: 0.3 });
    const shirt = alien ? alienSkin : suit ? suitWhite : cloth(o.shirt);
    const pants = alien ? alienSkin : suit ? suitWhite : cloth(o.pants, 0.92);
    const shoes = alien ? alienSkin : suit ? suitGrey : stdMat(o.shoes, { rough: 0.6 });
    const hair = hairMat(o.hair);
    const dark = stdMat(0x0b0b0e, { rough: 0.15, metal: 0.2 });

    this.root = new THREE.Group();
    this.root.name = 'human';
    const body = this.body = J(this.root, 0, 0, 0);
    const s = alien ? 1 : o.height / 1.78;
    body.scale.set(s * (alien ? 0.82 : o.build), alien ? 0.95 : s, s * (alien ? 0.8 : lerp(1, o.build, 0.5)));

    const P = this.j = {};
    P.pelvis = J(body, 0, 0.98, 0);
    addMesh(P.pelvis, suit ? G.hips : o.female ? G.hipsF : G.hips, pants, 0, 0, 0, shadows);
    if (o.belt && !suit && !alien && !o.coat) {
      addMesh(P.pelvis, G.belt, stdMat(0x2a1d14, { rough: 0.5 }), 0, 0.075, 0, false);
      addMesh(P.pelvis, G.buckle, stdMat(0xb8b0a0, { rough: 0.25, metal: 0.9 }), 0, 0.075, 0.118, false);
    }
    P.spine = J(P.pelvis, 0, 0.07, 0);
    addMesh(P.spine, suit ? G.suitTorso : o.female && !alien ? G.torsoF : G.torsoM, shirt, 0, 0, 0, shadows);
    if (o.collar && !alien && !suit) addMesh(P.spine, G.collar, shirt, 0, 0.44, 0.005, false);
    if (o.collar && o.longSleeves && !o.coat && !o.vest && !alien && !suit) {
      addMesh(P.spine, G.pockets, shirt, 0, 0, 0, false);
      addMesh(P.spine, G.zipper, stdMat(0x697069, { rough: 0.55, metal: 0.2 }), 0, 0.265, 0.116, false);
    }
    if (o.vest) {
      addMesh(P.spine, G.vest, stdMat(0xf2c21a, { rough: 0.7, emissive: 0x3a2a00, ei: 0.4 }), 0, 0, 0, false);
      const refl = stdMat(0xdadada, { rough: 0.2, metal: 0.8, emissive: 0x777777, ei: 0.6 });
      addMesh(P.spine, G.stripe, refl, 0, 0.14, 0, false);
      addMesh(P.spine, G.stripe, refl, 0, 0.3, 0, false);
    }
    if (o.coat) addMesh(P.spine, G.coat, cloth(0xf5f5f2, 0.8), 0, 0, 0, shadows);
    if (o.backpack) addMesh(P.spine, G.backpack, cloth(0x3a4a3a, 0.9), 0, 0.26, -0.17, shadows);
    if (suit) {
      addMesh(P.spine, G.pack, suitWhite, 0, 0.24, -0.23, shadows);
      addMesh(P.spine, G.ring, suitGrey, 0, 0.47, 0, false);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), stdMat(0x2a4a8a, { rough: 0.6 }));
      patch.position.set(0.12, 0.3, 0.155); patch.rotation.y = 0.35; P.spine.add(patch);
    }

    P.neck = J(P.spine, 0, 0.43, 0);
    addMesh(P.neck, G.neck, skin, 0, 0, 0, false);
    P.head = J(P.neck, 0, 0.1, 0);
    if (alien) {
      addMesh(P.head, G.alienHead, skin, 0, 0.12, 0.01, shadows);
      for (const sx of [-1, 1]) {
        const e = addMesh(P.head, G.alienEye, dark, sx * 0.062, 0.1, 0.13, false);
        e.rotation.set(0, sx * 0.35, sx * -0.35);
      }
    } else {
      const face = new THREE.MeshStandardMaterial({ map: faceTexture(o), roughness: 0.72, normalMap: skinNormal(), normalScale: new THREE.Vector2(0.1, 0.1) });
      addMesh(P.head, G.head, face, 0, 0.1, 0, shadows);
      addMesh(P.head, G.nose, skin, 0, 0.087, 0.1, false).rotation.x = -0.3;
      for (const sx of [-1, 1]) addMesh(P.head, G.ear, skin, sx * 0.09, 0.1, -0.008, false);
      if (!suit) {
        if (o.hairStyle !== 'bald') addMesh(P.head, G.hairShort, hair, 0, 0.1, 0, false);
        if (o.hairStyle === 'long') addMesh(P.head, G.hairLong, hair, 0, 0.08, -0.03, false);
        if (o.hairStyle === 'bun') addMesh(P.head, G.bun, hair, 0, 0.2, -0.085, false);
      }
      if (o.beard) addMesh(P.head, G.beard, hair, 0, 0.1, 0.012, false);
      const hat = o.hat;
      if (suit) {
        addMesh(P.head, G.bubble, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.1, 0.01, false);
        addMesh(P.head, G.goldVisor, new THREE.MeshStandardMaterial({ color: 0xd8a84a, roughness: 0.08, metalness: 1, transparent: true, opacity: 0.92 }), 0, 0.1, 0.012, false);
      } else if (hat === 'cap') {
        addMesh(P.head, G.cap, cloth(o.capColor ?? 0x2a3a5a, 0.8), 0, 0.14, 0, false);
        addMesh(P.head, G.brim, cloth(o.capColor ?? 0x2a3a5a, 0.8), 0, 0.15, 0.1, false);
      } else if (hat === 'hardhat') {
        addMesh(P.head, G.hardhat, stdMat(0xf2c21a, { rough: 0.35 }), 0, 0.14, 0, false);
        addMesh(P.head, G.hatRim, stdMat(0xf2c21a, { rough: 0.35 }), 0, 0.145, 0.01, false);
      } else if (hat === 'straw') {
        addMesh(P.head, G.straw, stdMat(0xd8c07a, { rough: 1 }), 0, 0.17, 0, false);
        addMesh(P.head, G.strawTop, stdMat(0xd8c07a, { rough: 1 }), 0, 0.22, 0, false);
      } else if (hat === 'helmet') {
        addMesh(P.head, G.helmet, stdMat(0xe8ecef, { rough: 0.3, metal: 0.2 }), 0, 0.1, 0, false);
        addMesh(P.head, G.visor, stdMat(0x1a2a3a, { rough: 0.13, metal: 0.08 }), 0, 0.1, 0, false);
      }
    }

    const longSleeve = o.longSleeves || alien || suit;
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = P['shoulder' + side] = J(P.spine, sx * (alien ? 0.15 : o.female ? 0.168 : 0.19), 0.385, 0);
      addMesh(sh, G.deltoid, shirt, -Math.sign(sx) * 0.004, -0.02, 0, shadows);
      addMesh(sh, suit ? G.suitLimb : G.upperArm, longSleeve ? shirt : skin, 0, 0, 0, shadows);
      if (!longSleeve) addMesh(sh, G.sleeve, shirt, 0, 0, 0, false);
      const el = P['elbow' + side] = J(sh, 0, -0.29, 0);
      addMesh(el, suit ? G.suitLimb : G.forearm, longSleeve ? shirt : skin, 0, 0, 0, shadows);
      const hd = J(el, 0, -0.26, 0);
      if (suit) addMesh(hd, G.glove, suitGrey, 0, -0.04, 0, false);
      else addMesh(hd, G.hand, skin, 0, 0, 0, false);
      const hip = P['hip' + side] = J(P.pelvis, sx * 0.095, -0.03, 0);
      addMesh(hip, suit ? G.suitLeg : G.thigh, pants, 0, 0, 0, shadows);
      const kn = P['knee' + side] = J(hip, 0, -0.45, 0);
      addMesh(kn, suit ? G.suitLeg : G.shin, o.shorts && !suit ? skin : pants, 0, suit ? 0.02 : 0, 0, shadows);
      const an = P['ankle' + side] = J(kn, 0, -0.43, 0);
      if (suit) addMesh(an, G.boot, suitGrey, 0, 0, 0, shadows);
      else {
        addMesh(an, G.shoe, shoes, 0, 0, 0, shadows);
        addMesh(an, G.sole, stdMat(o.shoes === o.skin ? o.skin : 0x1a1a1a, { rough: 0.9 }), 0, 0, 0, false);
      }
    }
    if (alien) {
      for (const side of ['L', 'R']) {
        P['elbow' + side].children[0].scale.set(0.7, 1.25, 0.7);
        P['shoulder' + side].children[1].scale.set(0.7, 1.15, 0.7);
      }
      P.head.scale.setScalar(1.25);
    }

    // Parachute canopy (only shown while descending under it).
    this.chute = new THREE.Group();
    const canopyG = new THREE.SphereGeometry(3.4, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.32);
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

    const animRnd = mulberry32(o.seed);
    this.phase = animRnd() * Math.PI * 2;
    this.t = animRnd() * 100;
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
    const freq = lerp(sp / 1.4, sp / 2.5, run);
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
