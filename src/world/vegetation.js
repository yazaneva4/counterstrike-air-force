// Forests, palms, cacti, bushes and boulders. Trees are built from textured
// bark limbs and alpha-tested foliage cards (broadleaf leaf clusters, drooping
// pine branches, arched palm fronds) with crown-shaped normals for soft,
// volumetric lighting. Each species is drawn with GPU instancing, split into
// map chunks that swap to cheap silhouettes in the distance. Trees sway in the
// wind (shadows too), and trunks are registered in a spatial hash so people
// and aircraft collide.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise.js';
import { tint, smoothstep } from '../core/util.js';
import { barkTexture, leafCard, needleCard, frondCard } from '../core/textures.js';
import { HALF } from './terrain.js';

export const windUniforms = { uTime: { value: 0 }, uAmp: { value: 1 } };

function jitter(geo, amount, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const r = (h - Math.floor(h)) - 0.5;
    const h2 = Math.sin(x * 93.989 + y * 67.345 + z * 12.345 + seed) * 24634.6345;
    const r2 = (h2 - Math.floor(h2)) - 0.5;
    p.setXYZ(i, x + r * amount, y + r2 * amount * 0.6, z + (r2 - r) * amount * 0.7);
  }
  geo.computeVertexNormals();
  return geo;
}

const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const merge = (parts) => mergeGeometries(parts.map(ni));
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---- Building blocks ------------------------------------------------------------

// Bark-textured limb from a to b (UV v in metres / 2 so bark keeps its scale).
function limb(a, b, r0, r1, radial = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, Math.max(1, Math.round(len / 2)), true);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r0 * 8)), uv.getY(i) * len * 0.5);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, _v.subVectors(b, a).normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  return g;
}

// Foliage card (w x h) centred at `c`, oriented by euler; normals blended
// towards the direction from the crown centre for rounded, soft shading.
function card(c, w, h, euler, crown, blend = 0.75, uvRect = null) {
  const g = new THREE.PlaneGeometry(w, h);
  g.applyQuaternion(_q.setFromEuler(euler));
  g.translate(c.x, c.y, c.z);
  crownNormals(g, crown, blend);
  if (uvRect) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uvRect[0] + uv.getX(i) * uvRect[2], uvRect[1] + uv.getY(i) * uvRect[3]); }
  return g;
}

function crownNormals(g, crown, blend, axisOnly = false) {
  const p = g.attributes.position, n = g.attributes.normal, d = new THREE.Vector3(), cn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.set(p.getX(i) - crown.x, axisOnly ? 0.35 * Math.max(0, p.getY(i) - crown.y) + 0.25 : p.getY(i) - crown.y, p.getZ(i) - crown.z).normalize();
    cn.set(n.getX(i), n.getY(i), n.getZ(i));
    if (cn.dot(d) < 0) cn.negate();
    cn.lerp(d, blend).normalize();
    n.setXYZ(i, cn.x, cn.y, cn.z);
  }
}

// ---- Species -----------------------------------------------------------------------

function broadleafTree(seed) {
  const rnd = mulberry32(seed);
  const wood = [], leaf = [];
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.5, 0, (rnd() - 0.5) * 0.5);
  const base = new THREE.Vector3(0, -0.4, 0), fork = new THREE.Vector3(lean.x, 4.6, lean.z);
  wood.push(limb(base, fork, 0.46, 0.3, 9));
  // Root flare.
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + rnd();
    wood.push(limb(new THREE.Vector3(Math.cos(a) * 0.7, -0.3, Math.sin(a) * 0.7), new THREE.Vector3(Math.cos(a) * 0.1, 1.2, Math.sin(a) * 0.1), 0.2, 0.12, 5));
  }
  const crown = new THREE.Vector3(lean.x, 7.6, lean.z);
  const tips = [];
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.6;
    const up = 0.55 + rnd() * 0.5, len = 2.1 + rnd() * 1.1;
    const s0 = fork.clone().add(new THREE.Vector3(0, (rnd() - 0.3) * 0.8, 0));
    const tip = s0.clone().add(new THREE.Vector3(Math.cos(a) * len, up * len * 1.1 + 0.4, Math.sin(a) * len));
    wood.push(limb(s0, tip, 0.2, 0.08, 6));
    const mid = s0.clone().lerp(tip, 0.55);
    const sub = mid.clone().add(new THREE.Vector3(Math.cos(a + 1.2) * 1.3, 1.1, Math.sin(a + 1.2) * 1.3));
    wood.push(limb(mid, sub, 0.09, 0.04, 5));
    tips.push(tip, sub);
  }
  wood.push(limb(fork, new THREE.Vector3(lean.x * 1.4, 9.4, lean.z * 1.4), 0.24, 0.06, 6));
  tips.push(new THREE.Vector3(lean.x * 1.4, 9.6, lean.z * 1.4));
  // Leaf clusters: at branch ends plus fill across an ellipsoid crown.
  const centres = tips.slice();
  for (let k = 0; k < 26; k++) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.25) * 1.4, r = 0.45 + Math.sqrt(rnd()) * 0.55;
    centres.push(new THREE.Vector3(crown.x + Math.cos(a) * Math.cos(e) * 4.0 * r, crown.y + Math.sin(e) * 2.9 * r, crown.z + Math.sin(a) * Math.cos(e) * 4.0 * r));
  }
  for (const c of centres) {
    for (let j = 0; j < 3; j++) {
      const s = 2.6 + rnd() * 1.3;
      leaf.push(card(c, s, s, new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI), crown, 0.8));
    }
  }
  return { wood: merge(wood), leaf: merge(leaf), top: 10.5 };
}

function pineTree(seed) {
  const rnd = mulberry32(seed);
  const wood = [], leaf = [];
  const H = 14.5;
  wood.push(limb(new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, H, 0), 0.42, 0.05, 8));
  const axis = new THREE.Vector3(0, 0, 0);
  const whorls = 16;
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = 2.2 + t * (H - 2.8);
    const L = 3.9 * Math.pow(1 - t, 0.9) + 0.6;
    const per = Math.round(8 - t * 3);
    for (let k = 0; k < per; k++) {
      const a = (k / per) * Math.PI * 2 + w * 0.7 + rnd() * 0.5;
      const droop = 0.18 + rnd() * 0.18 + (1 - t) * 0.12;
      const dir = new THREE.Vector3(Math.cos(a), -droop * 0.6, Math.sin(a)).normalize();
      if (L > 2.2 && k % 2 === 0) wood.push(limb(new THREE.Vector3(0, y, 0), new THREE.Vector3(0, y, 0).addScaledVector(dir, L * 0.8), 0.07, 0.025, 3));
      for (const vertical of [false, true]) {
        const g = new THREE.PlaneGeometry(L, L * 0.8, 2, 1);
        g.translate(L / 2, 0, 0);
        if (!vertical) g.rotateX(-Math.PI / 2 + (rnd() - 0.5) * 0.3);
        else g.rotateX((rnd() - 0.5) * 0.8);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) / L; p.setY(i, p.getY(i) - x * x * droop * L * 0.9); }
        g.rotateY(-a);
        g.translate(0, y + (vertical ? 0.1 : 0), 0);
        g.computeVertexNormals();
        axis.set(0, y - 1.5, 0);
        crownNormals(g, axis, 0.7, true);
        leaf.push(g);
      }
    }
  }
  // Leader.
  for (let k = 0; k < 2; k++) leaf.push(card(new THREE.Vector3(0, H - 0.2, 0), 1.3, 1.7, new THREE.Euler(0, k * Math.PI / 2, Math.PI / 2), new THREE.Vector3(0, H - 1.5, 0), 0.5));
  return { wood: merge(wood), leaf: merge(leaf), top: 13.5 };
}

function palmTree(seed) {
  const rnd = mulberry32(seed);
  const wood = [], leaf = [];
  const segs = 9, height = 10, bend = 1.6 + rnd() * 0.8;
  let prev = new THREE.Vector3(0, -0.3, 0);
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const next = new THREE.Vector3(Math.pow(t, 2) * bend, t * height, 0);
    wood.push(limb(prev, next, 0.25 - t * 0.06 + (i === 0 ? 0.08 : 0), 0.21 - t * 0.06, 8));
    // Leaf-scar ring.
    const ring = new THREE.TorusGeometry(0.22 - t * 0.06, 0.035, 4, 10); ring.rotateX(Math.PI / 2); ring.translate(next.x, next.y - 0.05, next.z);
    wood.push(ring);
    prev = next;
  }
  const top = prev.clone();
  const crown = top.clone().add(new THREE.Vector3(0, -0.8, 0));
  const fronds = 13;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rnd() * 0.3;
    const len = 4.6 + rnd() * 1.4, rise = 0.6 + rnd() * 0.9 - (f % 3 === 0 ? 0.8 : 0);
    const g = new THREE.PlaneGeometry(2.8, len, 2, 12);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + len / 2) / len, x = p.getX(i);
      const fold = (1 - Math.abs(x) / 1.4) * 0.3;
      p.setXYZ(i, x * (0.4 + Math.sin(Math.min(1, t * 1.2) * Math.PI) * 0.7), Math.sin(t * Math.PI * 0.7) * rise - t * t * 2.4 + fold, t * len);
      uv.setY(i, 1 - uv.getY(i));
    }
    g.rotateY(a);
    g.translate(top.x, top.y - 0.1, top.z);
    g.computeVertexNormals();
    crownNormals(g, crown, 0.55);
    leaf.push(g);
  }
  // Coconuts.
  for (let c = 0; c < 4; c++) {
    const s = new THREE.SphereGeometry(0.2, 8, 6); s.translate(top.x + Math.cos(c * 1.7) * 0.3, top.y - 0.45, top.z + Math.sin(c * 1.7) * 0.3);
    wood.push(s);
  }
  return { wood: merge(wood), leaf: merge(leaf), top: 10 };
}

function bushGeo(seed = 5) {
  const rnd = mulberry32(seed), leaf = [];
  const crown = new THREE.Vector3(0, 0.3, 0);
  for (let k = 0; k < 18; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 1.5;
    const c = new THREE.Vector3(Math.cos(a) * r, 0.6 + rnd() * 1.0 * (1 - r / 2), Math.sin(a) * r);
    const s = 1.7 + rnd() * 1.0;
    leaf.push(card(c, s, s, new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI), crown, 0.85));
  }
  return merge(leaf);
}

// Boulder: displaced icosphere with darker crevices and lichen.
function rockGeo() {
  let g = new THREE.IcosahedronGeometry(1.4, 4);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  // Smooth 3D value noise so the surface stays continuous.
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), sx), L(c(0, 1, 0), c(1, 1, 0), sx), sy), L(L(c(0, 0, 1), c(1, 0, 1), sx), L(c(0, 1, 1), c(1, 1, 1), sx), sy), sz) - 0.5;
  };
  const fbm = (x, y, z) => { let s = 0, a = 1, f = 1; for (let o = 0; o < 5; o++) { s += a * vnoise(x * f, y * f, z * f); a *= 0.5; f *= 2.03; } return s; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = fbm(x * 0.9 + 3, y * 0.9, z * 0.9) * 0.7;
    // Flattened facets (fractured faces) from a few planes.
    const facet = Math.min(0, 1.15 - Math.abs(x * 0.8 + y * 0.5)) * 0.2 + Math.min(0, 1.2 - Math.abs(z * 0.9 - y * 0.3)) * 0.2;
    const k = 1 + d + facet;
    p.setXYZ(i, x * k * 1.3, y * k * 0.75 + 0.4, z * k * 1.1);
    const lichen = smoothstep(0.1, 0.25, vnoise(x * 3.1, y * 3.1, z * 3.1)) * (y > 0.2 ? 1 : 0);
    const v = 0.1 + (d + 0.35) * 0.1; // linear albedo
    col[i * 3] = v * (1 + lichen * 0.35); col[i * 3 + 1] = v * (0.97 + lichen * 0.45); col[i * 3 + 2] = v * (0.92 - lichen * 0.1);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Ribbed saguaro.
function cactusGeo() {
  const col = (x) => x;
  const ribbed = (r, h, segY = 10) => {
    const g = new THREE.CylinderGeometry(r, r, h, 24, segY);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const a = Math.atan2(z, x), rr = Math.hypot(x, z);
      const top = Math.max(0, (y - (h / 2 - r)) / r);
      const k = (1 + Math.cos(a * 12) * 0.06) * Math.sqrt(Math.max(0, 1 - top * top));
      if (rr > 0) p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    return col(g);
  };
  const parts = [tint(T(ribbed(0.42, 6.2), 0, 3.0, 0), 0x3f6b3a)];
  const arm = (side, y, h) => {
    const a = ribbed(0.28, 1.2, 4); a.rotateZ(Math.PI / 2); a.translate(side * 0.9, y, 0);
    const b = ribbed(0.28, h, 6); b.translate(side * 1.5, y + h / 2 + 0.1, 0);
    parts.push(tint(a, 0x3f6b3a), tint(b, 0x467640));
  };
  arm(1, 3.0, 1.8); arm(-1, 2.2, 1.4);
  return merge(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
}

// Cheap far-distance silhouettes (vertex coloured).
function pineLo() {
  const branches = [
    tint(T(new THREE.ConeGeometry(3.7, 6.2, 10, 2), 0, 4.5, 0), 0x203d20),
    tint(T(new THREE.ConeGeometry(3.0, 6.4, 10, 2), 0, 7.2, 0), 0x254723),
    tint(T(new THREE.ConeGeometry(2.0, 6.3, 10, 2), 0, 9.8, 0), 0x2c5128),
    tint(T(new THREE.CylinderGeometry(0.3, 0.4, 3, 8), 0, 1.5, 0), 0x3a2c22),
  ];
  return merge(branches.map((g) => { g.deleteAttribute('uv'); return g; }));
}
function broadLo() {
  const parts = [tint(T(new THREE.CylinderGeometry(0.3, 0.45, 5, 8), 0, 2.5, 0), 0x3f3024)];
  for (const [x, y, z, sx, sy, sz, color] of [
    [0, 7.3, 0, 3.2, 2.9, 3.1, 0x355a24],
    [-1.7, 6.6, 0.3, 2.2, 2.1, 2.3, 0x41672c],
    [1.5, 7.1, -0.5, 2.3, 2.2, 2.2, 0x3b6128],
    [0.2, 8.7, 0.6, 2.1, 1.8, 2.0, 0x456b30],
  ]) {
    const crown = new THREE.SphereGeometry(1, 12, 8);
    crown.scale(sx, sy, sz); crown.translate(x, y, z);
    parts.push(tint(jitter(crown, 0.16, Math.round((x + y + z) * 17)), color));
  }
  return merge(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
}

// ---- Materials ---------------------------------------------------------------------

function applySway(m, sway, { leaf = false } = {}) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uAmp = windUniforms.uAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sw = sin(uTime * 1.25 + ip.x * 0.05 + ip.z * 0.07) * 0.6 + sin(uTime * 2.9 + ip.x * 0.13) * 0.25;
        float bend = max(transformed.y - 2.0, 0.0);
        transformed.x += sw * uAmp * bend * bend * ${(0.0016 * sway).toFixed(5)};
        transformed.z += sw * uAmp * bend * bend * ${(0.0011 * sway).toFixed(5)};
        ${leaf ? `float flutter = sin(uTime * 7.0 + transformed.x * 3.1 + transformed.y * 2.3 + ip.z) * 0.04 * ${sway.toFixed(2)};
        transformed.y += flutter * step(3.0, transformed.y);` : ''}`);
    if (leaf && shader.fragmentShader.includes('#include <normal_fragment_begin>')) {
      // Keep crown-shaped normals on both faces of a card, and let sunlight
      // glow through the leaves a little.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.06;');
    }
  };
  m.customProgramCacheKey = () => 'sway' + sway + (leaf ? 'L' : '') + (m.isMeshDepthMaterial ? 'D' : '');
  return m;
}

function vegMaterial({ sway = 0, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side });
  return sway > 0 ? applySway(m, sway) : m;
}

function barkMaterial(sway, tintColor = 0xffffff) {
  const b = barkTexture();
  return applySway(new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normal, normalScale: new THREE.Vector2(1.4, 1.4), color: tintColor, roughness: 0.95 }), sway);
}

function leafMaterial(tex, sway, color = 0xffffff) {
  return applySway(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, color }), sway, { leaf: true });
}

function leafDepth(tex, sway) {
  return applySway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.42 }), sway);
}

function woodDepth(sway) {
  return applySway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), sway);
}

const CHUNKS = 6;

// Single specimens of each species (used by props elsewhere and dev previews).
export function treeSpecimen(kind = 'broad') {
  const g = new THREE.Group();
  const add = (geo, mat, depth) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; if (depth) m.customDepthMaterial = depth; g.add(m); };
  if (kind === 'bush') add(bushGeo(), leafMaterial(leafCard(), 0.5, 0xd0e0c0));
  else if (kind === 'rock') add(rockGeo(), vegMaterial());
  else if (kind === 'cactus') add(cactusGeo(), vegMaterial());
  else {
    const t = kind === 'pine' ? pineTree(11) : kind === 'palm' ? palmTree(13) : broadleafTree(7);
    const tex = kind === 'pine' ? needleCard() : kind === 'palm' ? frondCard() : leafCard();
    const sway = kind === 'palm' ? 2 : 1;
    add(t.wood, barkMaterial(sway, kind === 'pine' ? 0xb8a898 : kind === 'palm' ? 0xd8c8b0 : 0xffffff), woodDepth(sway));
    add(t.leaf, leafMaterial(tex, sway, kind === 'pine' ? 0xd8e8d0 : 0xffffff), leafDepth(tex, sway));
  }
  return g;
}

export class Vegetation {
  constructor(terrain, { density = 1, isBlocked = () => false } = {}) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.hash = new Map(); // "cx,cz" -> [{x,z,r,top}]
    this.cell = 24;

    const leafTex = leafCard(), needleTex = needleCard(), frondTex = frondCard();
    const broad = broadleafTree(7), pine = pineTree(11), palm = palmTree(13);
    const part = (geo, mat, depth, cast = true) => ({ geo, mat, depth, cast });
    const species = {
      pine: { parts: [part(pine.wood, barkMaterial(1, 0xb8a898), woodDepth(1)), part(pine.leaf, leafMaterial(needleTex, 1, 0xd8e8d0), leafDepth(needleTex, 1))], lo: pineLo(), loMat: vegMaterial(), items: [], r: 1.2, top: pine.top },
      broad: { parts: [part(broad.wood, barkMaterial(1), woodDepth(1)), part(broad.leaf, leafMaterial(leafTex, 1), leafDepth(leafTex, 1))], lo: broadLo(), loMat: vegMaterial(), items: [], r: 1.3, top: broad.top },
      palm: { parts: [part(palm.wood, barkMaterial(2, 0xd8c8b0), woodDepth(2)), part(palm.leaf, leafMaterial(frondTex, 2), leafDepth(frondTex, 2))], items: [], r: 0.8, top: palm.top },
      bush: { parts: [part(bushGeo(), leafMaterial(leafTex, 0.5, 0xd0e0c0), null, false)], items: [], r: 0 },
      rock: { parts: [part(rockGeo(), vegMaterial(), null)], items: [], r: 1.6, top: 1.6 },
      cactus: { parts: [part(cactusGeo(), vegMaterial(), null)], items: [], r: 0.6, top: 6 },
    };
    this.species = species;

    const rnd = mulberry32(4242);
    const N = terrain.noise;
    const step = 12.5 / Math.sqrt(density);
    const nrm = new THREE.Vector3();
    for (let z = -HALF + 40; z < HALF - 40; z += step) {
      for (let x = -HALF + 40; x < HALF - 40; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9;
        const roll = rnd();
        const h = terrain.heightAt(px, pz);
        if (h < 1.2) continue;
        const b = terrain.biomeAt(px, pz);
        if (b.coast > 2600) continue;
        let blockedZone = false;
        for (const zn of terrain.zones) {
          if (zn.id === 'turbines') continue;
          if (zn.id === 'lighthouse') { if (Math.hypot(px - zn.x, pz - zn.z) < 75) { blockedZone = true; break; } continue; }
          if (terrain.zoneWeight(zn, px, pz) > 0.05) { blockedZone = true; break; }
        }
        if (blockedZone || isBlocked(px, pz)) continue;
        terrain.normalAt(px, pz, nrm);
        const slope = nrm.y;
        const forest = N.n2(px * 0.0021 + 40, pz * 0.0021 - 12);
        const snowLine = 430 + N.n2(px * 0.004, pz * 0.004) * 45;

        if (b.desert > 0.55) {
          if (roll < 0.006 && slope > 0.85) species.cactus.items.push([px, h, pz]);
          else if (roll > 0.994) species.rock.items.push([px, h, pz]);
          continue;
        }
        if (h < 5.5 && b.coast < 420) {
          if (roll < 0.035 && slope > 0.9) species.palm.items.push([px, h, pz]);
          continue;
        }
        if (slope < 0.7) { if (roll < 0.03) species.rock.items.push([px, h, pz]); continue; }
        if (h > snowLine - 30) { if (roll < 0.01) species.rock.items.push([px, h, pz]); continue; }

        const treeChance = smoothstep(-0.05, 0.4, forest) * 0.72 + 0.025;
        if (roll < treeChance) {
          const alpine = smoothstep(120, 260, h) + b.mountain * 0.5;
          (rnd() < 0.35 + alpine * 0.6 ? species.pine : species.broad).items.push([px, h, pz]);
        } else if (roll < treeChance + 0.05) {
          species.bush.items.push([px, h, pz]);
        } else if (roll > 0.992) {
          species.rock.items.push([px, h, pz]);
        }
      }
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const color = new THREE.Color();
    const chunkSize = (HALF * 2) / CHUNKS;
    this.chunks = [];
    for (const [name, sp] of Object.entries(species)) {
      const buckets = Array.from({ length: CHUNKS * CHUNKS }, () => []);
      for (const it of sp.items) {
        const cx = Math.min(CHUNKS - 1, Math.max(0, Math.floor((it[0] + HALF) / chunkSize)));
        const cz = Math.min(CHUNKS - 1, Math.max(0, Math.floor((it[2] + HALF) / chunkSize)));
        buckets[cz * CHUNKS + cx].push(it);
      }
      buckets.forEach((list, bi) => {
        if (!list.length) return;
        const [first, ...rest] = sp.parts;
        const mk = (pt) => {
          const im = new THREE.InstancedMesh(pt.geo, pt.mat, list.length);
          im.castShadow = pt.cast && name !== 'bush';
          im.receiveShadow = true;
          if (pt.depth) im.customDepthMaterial = pt.depth;
          return im;
        };
        const im = mk(first);
        list.forEach((it, i) => {
          const sc = name === 'rock' ? 0.6 + rnd() * 1.9 : 0.72 + rnd() * 0.62;
          e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
          q.setFromEuler(e);
          s.set(sc, sc * (name === 'rock' ? 0.8 + rnd() * 0.5 : 0.9 + rnd() * 0.25), sc);
          p.set(it[0], it[1] - 0.3, it[2]);
          m4.compose(p, q, s);
          im.setMatrixAt(i, m4);
          // Foliage hue varies from tree to tree (a few turn autumn-gold).
          const v = 0.82 + rnd() * 0.3;
          const autumn = name === 'broad' && rnd() < 0.08 ? 1 : 0;
          color.setRGB(v * (0.92 + rnd() * 0.12 + autumn * 0.45), v * (1 - autumn * 0.1), v * (0.9 + rnd() * 0.1 - autumn * 0.3));
          im.setColorAt(i, color);
          if (sp.r > 0) this._addCollider(it[0], it[2], sp.r * sc, it[1] + (sp.top || 2) * s.y);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        // Bark stays untinted; leaves and rocks take the per-instance colour.
        const hi = [im];
        for (const pt of rest) {
          const m = mk(pt);
          m.instanceMatrix = im.instanceMatrix;
          m.instanceColor = im.instanceColor;
          m.boundingSphere = im.boundingSphere;
          hi.push(m);
        }
        if (sp.parts.length > 1) { im.instanceColor = null; }
        for (const m of hi) this.group.add(m);
        // Far-away chunks swap to a much cheaper silhouette of the same trees.
        let lo = null;
        if (sp.lo) {
          lo = new THREE.InstancedMesh(sp.lo, sp.loMat, list.length);
          lo.instanceMatrix = im.instanceMatrix;
          lo.instanceColor = hi[1]?.instanceColor || null;
          lo.receiveShadow = true;
          lo.boundingSphere = im.boundingSphere;
          lo.visible = false;
          this.group.add(lo);
        }
        const cx = -HALF + ((bi % CHUNKS) + 0.5) * chunkSize, cz = -HALF + (Math.floor(bi / CHUNKS) + 0.5) * chunkSize;
        this.chunks.push({ hi, lo, x: cx, z: cz, far: name === 'bush' ? 600 : name === 'rock' ? 1400 : 800 });
      });
    }
    this.counts = Object.fromEntries(Object.entries(species).map(([k, v]) => [k, v.items.length]));
  }

  _addCollider(x, z, r, top) {
    const key = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
    let list = this.hash.get(key);
    if (!list) { list = []; this.hash.set(key, list); }
    list.push({ x, z, r, top });
  }

  // Calls fn(collider) for every trunk/boulder near (x, z).
  near(x, z, fn) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = this.hash.get((cx + dx) + ',' + (cz + dz));
      if (list) for (const c of list) fn(c);
    }
  }

  update(dt, cam) {
    windUniforms.uTime.value += dt;
    if (!cam) return;
    const high = cam.y > 900;
    for (const c of this.chunks) {
      const d = Math.hypot(cam.x - c.x, cam.z - c.z);
      const near = d < c.far && !high;
      if (c.lo) { for (const m of c.hi) m.visible = near; c.lo.visible = !near; }
      else { const v = d < c.far * 2.2; for (const m of c.hi) m.visible = v; }
    }
  }
}
