// Forests, palms, cacti, bushes and boulders. Each species is one merged,
// vertex-coloured mesh drawn with GPU instancing, split into map chunks so
// off-screen and out-of-shadow chunks are culled. Trees sway in the wind, and
// trunks are registered in a spatial hash so people and aircraft collide.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise.js';
import { tint, smoothstep } from '../core/util.js';
import { HALF } from './terrain.js';

export const windUniforms = { uTime: { value: 0 } };

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

function pineGeo(lod = 0) {
  if (lod) return merge([tint(T(new THREE.CylinderGeometry(0.3, 0.4, 3, 4), 0, 1.5, 0), 0x4a3526), tint(T(new THREE.ConeGeometry(2.8, 11.5, 6, 1), 0, 7.6, 0), 0x264b28)]);
  const parts = [tint(T(new THREE.CylinderGeometry(0.22, 0.42, 4.4, 6), 0, 2.2, 0), 0x4a3526)];
  const tiers = [[2.9, 5.2, 4.6], [2.3, 4.6, 7.2], [1.7, 3.9, 9.6], [1.05, 3.1, 11.7], [0.5, 2.0, 13.3]];
  const greens = [0x1f3d22, 0x244726, 0x28502a, 0x2d5a2e, 0x31602f];
  tiers.forEach(([r, h, y], i) => parts.push(tint(jitter(T(new THREE.ConeGeometry(r, h, 8, 1), 0, y, 0), 0.35, i), greens[i])));
  return merge(parts);
}

function broadleafGeo(lod = 0) {
  if (lod) return merge([tint(T(new THREE.CylinderGeometry(0.3, 0.45, 5, 4), 0, 2.5, 0), 0x4f3a2a), tint(jitter(T(new THREE.IcosahedronGeometry(3.6, 0), 0, 7.4, 0), 0.6, 2), 0x416f2c)]);
  const parts = [tint(T(new THREE.CylinderGeometry(0.3, 0.5, 5.2, 6), 0, 2.6, 0), 0x4f3a2a)];
  const b1 = new THREE.CylinderGeometry(0.12, 0.2, 3, 5); b1.rotateZ(0.8); b1.translate(1.1, 5.2, 0);
  parts.push(tint(b1, 0x4f3a2a));
  const blobs = [[0, 7.6, 0, 3.1, 0x3d6a2a], [2.0, 6.6, 0.6, 2.3, 0x467630], [-1.7, 6.8, -0.8, 2.4, 0x3a6428], [0.3, 9.1, 0.2, 2.0, 0x508437]];
  blobs.forEach(([x, y, z, r, c], i) => parts.push(tint(jitter(T(new THREE.IcosahedronGeometry(r, 1), x, y, z), 0.55, i), c)));
  return merge(parts);
}

function palmGeo() {
  const parts = [];
  const segs = 8, height = 10;
  let px = 0, py = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const nx = Math.pow((i + 1) / segs, 2) * 1.8;
    const ny = ((i + 1) / segs) * height;
    const len = Math.hypot(nx - px, ny - py);
    const g = new THREE.CylinderGeometry(0.2 - t * 0.05, 0.24 - t * 0.05, len * 1.05, 6);
    g.rotateZ(-Math.atan2(nx - px, ny - py));
    g.translate((px + nx) / 2, (py + ny) / 2, 0);
    parts.push(tint(g, i % 2 ? 0x7a6448 : 0x6a563d));
    px = nx; py = ny;
  }
  for (let f = 0; f < 9; f++) {
    const leaf = new THREE.PlaneGeometry(1.1, 5.2, 1, 6);
    const p = leaf.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = (p.getY(i) + 2.6) / 5.2;
      p.setX(i, p.getX(i) * Math.sin(v * Math.PI) * 1.2);
      p.setZ(i, -v * v * 2.4);
      p.setY(i, v * 5.2);
    }
    leaf.computeVertexNormals();
    leaf.rotateX(-Math.PI / 2 + 0.5);
    leaf.rotateY((f / 9) * Math.PI * 2);
    leaf.translate(px, py, 0);
    parts.push(tint(leaf, f % 2 ? 0x3f7a2c : 0x4c8a33));
  }
  for (let c = 0; c < 3; c++) parts.push(tint(T(new THREE.SphereGeometry(0.28, 6, 5), px + Math.cos(c * 2) * 0.35, py - 0.4, Math.sin(c * 2) * 0.35), 0x5b4a2a));
  return mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return ni(g); }));
}

function bushGeo() {
  const parts = [];
  [[0, 0.8, 0, 1.2, 0x3e6b2c], [0.9, 0.6, 0.3, 0.9, 0x4a7a33], [-0.7, 0.6, -0.4, 0.95, 0x35602a]].forEach(([x, y, z, r, c], i) =>
    parts.push(tint(jitter(T(new THREE.IcosahedronGeometry(r, 1), x, y, z), 0.3, i), c)));
  return merge(parts);
}

function rockGeo() {
  const g = jitter(new THREE.IcosahedronGeometry(1.4, 1), 0.9, 3);
  g.scale(1.3, 0.75, 1.1);
  g.translate(0, 0.4, 0);
  return tint(ni(g), 0x7a746c);
}

function cactusGeo() {
  const parts = [tint(T(new THREE.CapsuleGeometry(0.42, 5.2, 4, 8), 0, 3.0, 0), 0x3f6b3a)];
  const arm = (side, y, h) => {
    const a = new THREE.CapsuleGeometry(0.28, 1.2, 3, 6); a.rotateZ(Math.PI / 2); a.translate(side * 0.9, y, 0);
    const b = new THREE.CapsuleGeometry(0.28, h, 3, 6); b.translate(side * 1.5, y + h / 2 + 0.1, 0);
    parts.push(tint(a, 0x3f6b3a), tint(b, 0x467640));
  };
  arm(1, 3.0, 1.8); arm(-1, 2.2, 1.4);
  return merge(parts);
}

function vegMaterial({ sway = 0, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side, flatShading: false });
  if (sway > 0) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sw = sin(uTime * 1.25 + ip.x * 0.05 + ip.z * 0.07) * 0.6 + sin(uTime * 2.9 + ip.x * 0.13) * 0.25;
          float bend = max(transformed.y - 2.0, 0.0);
          transformed.x += sw * bend * bend * ${(0.0016 * sway).toFixed(5)};
          transformed.z += sw * bend * bend * ${(0.0011 * sway).toFixed(5)};`);
    };
  }
  return m;
}

const CHUNKS = 6;

export class Vegetation {
  constructor(terrain, { density = 1, isBlocked = () => false } = {}) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.hash = new Map(); // "cx,cz" -> [{x,z,r,top}]
    this.cell = 24;

    const species = {
      pine: { geo: pineGeo(), lo: pineGeo(1), mat: vegMaterial({ sway: 1 }), items: [], r: 1.2, top: 13.5 },
      broad: { geo: broadleafGeo(), lo: broadleafGeo(1), mat: vegMaterial({ sway: 1 }), items: [], r: 1.3, top: 10.5 },
      palm: { geo: palmGeo(), mat: vegMaterial({ sway: 2, side: THREE.DoubleSide }), items: [], r: 0.8, top: 10 },
      bush: { geo: bushGeo(), mat: vegMaterial({ sway: 0.5 }), items: [], r: 0 },
      rock: { geo: rockGeo(), mat: vegMaterial(), items: [], r: 1.6, top: 1.6 },
      cactus: { geo: cactusGeo(), mat: vegMaterial(), items: [], r: 0.6, top: 6 },
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
        const im = new THREE.InstancedMesh(sp.geo, sp.mat, list.length);
        im.castShadow = name !== 'bush';
        im.receiveShadow = true;
        list.forEach((it, i) => {
          const sc = name === 'rock' ? 0.6 + rnd() * 1.9 : 0.72 + rnd() * 0.62;
          e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08);
          q.setFromEuler(e);
          s.set(sc, sc * (name === 'rock' ? 0.8 + rnd() * 0.5 : 0.9 + rnd() * 0.25), sc);
          p.set(it[0], it[1] - 0.3, it[2]);
          m4.compose(p, q, s);
          im.setMatrixAt(i, m4);
          const v = 0.82 + rnd() * 0.3;
          color.setRGB(v * (0.92 + rnd() * 0.12), v, v * (0.9 + rnd() * 0.1));
          im.setColorAt(i, color);
          if (sp.r > 0) this._addCollider(it[0], it[2], sp.r * sc, it[1] + (sp.top || 2) * s.y);
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        this.group.add(im);
        // Far-away chunks swap to a much cheaper silhouette of the same trees.
        let lo = null;
        if (sp.lo) {
          lo = new THREE.InstancedMesh(sp.lo, sp.mat, list.length);
          lo.instanceMatrix.copy(im.instanceMatrix);
          if (im.instanceColor) lo.instanceColor = im.instanceColor;
          lo.receiveShadow = true;
          lo.boundingSphere = im.boundingSphere;
          lo.visible = false;
          this.group.add(lo);
        }
        const cx = -HALF + ((bi % CHUNKS) + 0.5) * chunkSize, cz = -HALF + (Math.floor(bi / CHUNKS) + 0.5) * chunkSize;
        this.chunks.push({ hi: im, lo, x: cx, z: cz, far: name === 'bush' ? 700 : name === 'rock' ? 1400 : 1100 });
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
      if (c.lo) { c.hi.visible = near; c.lo.visible = !near; }
      else c.hi.visible = d < c.far * 2.2;
    }
  }
}
