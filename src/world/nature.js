// Tropical scenery that makes the island feel wild: waterfalls that tumble
// down the cliffs of the northern range (animated foam, plunge-pool mist),
// sea stacks rising from the lagoons, and valley mist that clings to the
// ridges. Waterfalls are found automatically by following the steepest
// descent from high ground and keeping the ones with a real drop.

import * as THREE from 'three';
import { canvasTexture } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { HALF } from './terrain.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Walk downhill from (x, z); returns the path if it is a clean, steep fall.
function descend(terrain, x, z, max = 260) {
  const pts = [[x, terrain.heightAt(x, z), z]];
  const n = new THREE.Vector3();
  let flat = 0;
  for (let i = 0; i < max / 5; i++) {
    terrain.normalAt(x, z, n);
    const hl = Math.hypot(n.x, n.z);
    if (hl < 1e-4) break;
    x += (n.x / hl) * 5; z += (n.z / hl) * 5;
    const h = terrain.heightAt(x, z);
    pts.push([x, h, z]);
    if (h < 1.5) break;
    if (n.y > 0.88) { if (++flat >= 3) break; } else flat = 0;
  }
  return pts;
}

// A fall is the steepest ~70 m stretch of a descent path; cascades like this
// read well from a distance and keep the drop believable.
export function findFalls(terrain, { count = 8, window = 14, minDrop = 38, spacing = 320 } = {}) {
  const found = [];
  const traced = new Set();            // 40 m cells already covered by a traced path
  const cellKey = (x, z) => Math.floor(x / 40) * 4099 + Math.floor(z / 40);
  const rnd = mulberry32(81);
  const n = new THREE.Vector3();
  for (let z = -HALF + 120; z < HALF - 120; z += 36) for (let x = -HALF + 120; x < HALF - 120; x += 36) {
    const h = terrain.heightAt(x + rnd() * 8, z + rnd() * 8);
    if (h < 60 || h > 380) continue;
    if (traced.has(cellKey(x, z))) continue;
    terrain.normalAt(x, z, n);
    if (n.y > 0.75 || n.y < 0.25) continue;
    if (terrain.zones.some((zn) => zn.mode !== 'add' && terrain.zoneWeight(zn, x, z) > 0.02)) continue;
    const path = descend(terrain, x, z, 420);
    if (path.length < window + 2) continue;
    // Best moderate cascade (38-120 m) and best grand fall on this path.
    let mod = -1, modDrop = 0, grand = -1, grandDrop = 0;
    for (let i = 0; i + window < path.length; i++) {
      const drop = path[i][1] - path[i + window][1];
      if (drop <= 120 && drop > modDrop) { modDrop = drop; mod = i; }
      if (drop > grandDrop) { grandDrop = drop; grand = i; }
    }
    const push = (i0, drop, kind, bonus) => {
      if (i0 < 0 || path[i0 + window][1] < 3) return;
      const seg = path.slice(i0, i0 + window + 1);
      const dist = Math.hypot(seg[0][0] - 200, seg[0][2] + 300);
      for (const q of path) traced.add(cellKey(q[0], q[2]));      // only accepted falls claim their drainage
      found.push({ x: seg[0][0], z: seg[0][2], drop, len: window * 5, path: seg, kind, score: Math.min(drop, 120) + bonus - dist * 0.06 });
    };
    if (modDrop >= minDrop) push(mod, modDrop, 'cascade', 40);
    if (grandDrop >= 150) push(grand, grandDrop, 'grand', -60);
  }
  found.sort((a, b) => b.score - a.score);
  const out = [];
  let grandLeft = 2;
  for (const f of found) {
    if (out.length >= count) break;
    if (f.kind === 'grand' && grandLeft <= 0) continue;
    if (out.some((o) => Math.hypot(o.x - f.x, o.z - f.z) < spacing)) continue;
    if (f.kind === 'grand') grandLeft--;
    out.push(f);
  }
  return out;
}

function streakTexture() {
  return canvasTexture(128, 256, (c, w, h) => {
    const rnd = mulberry32(9);
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, len = 40 + rnd() * 160, y = rnd() * h, wd = 1 + rnd() * 4;
      const g = c.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.4, `rgba(255,255,255,${0.6 + rnd() * 0.4})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x, y, wd, len);
      if (y + len > h) c.fillRect(x, y - h, wd, len);        // wrap seamlessly
    }
    // Soft body so the sheet reads as water, not just lines.
    c.fillStyle = 'rgba(214,238,246,0.5)'; c.fillRect(0, 0, w, h);
    // Fade to nothing at the sides.
    const m = c.createLinearGradient(0, 0, w, 0);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.18, 'rgba(0,0,0,0)'); m.addColorStop(0.82, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = m; c.fillRect(0, 0, w, h);
  }, { repeat: true, srgb: true, anisotropy: 4 });
}

function mistTexture() {
  return canvasTexture(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.5, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false });
}

export class Waterfalls {
  constructor(terrain, scene, { count = 8, lowDetail = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'waterfalls';
    scene.add(this.group);
    this.falls = findFalls(terrain, { count });
    this.tex = streakTexture();
    this.mats = [];
    const sheet = (tex, speed) => {
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      m.userData.speed = speed; this.mats.push(m);
      return m;
    };
    const tex2 = this.tex.clone(); tex2.needsUpdate = true; tex2.repeat.set(1.3, 1.6);
    const matA = sheet(this.tex, 1.15), matB = sheet(tex2, 0.8);
    this.pools = [];
    for (const f of this.falls) {
      const pts = f.path, N = pts.length;
      const pos = [], uv = [], idx = [];
      let dist = 0;
      for (let i = 0; i < N; i++) {
        const p = pts[i], q = pts[Math.min(N - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        let tx = q[0] - o[0], tz = q[2] - o[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const w = (5 + (i / (N - 1)) * 4.5) * (lowDetail ? 0.9 : 1);
        const lift = 0.75;
        pos.push(p[0] - tz * w, Math.max(p[1], terrain.heightAt(p[0] - tz * w, p[2] + tx * w)) + lift, p[2] + tx * w,
          p[0] + tz * w, Math.max(p[1], terrain.heightAt(p[0] + tz * w, p[2] - tx * w)) + lift, p[2] - tx * w);
        if (i) dist += Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2], p[1] - pts[i - 1][1]);
        uv.push(0, dist / 18, 1, dist / 18);
        if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, matA); mesh.renderOrder = 3; mesh.frustumCulled = false;
      const mesh2 = new THREE.Mesh(geo, matB); mesh2.renderOrder = 4; mesh2.position.y = 0.12; mesh2.frustumCulled = false;
      this.group.add(mesh, mesh2);
      const base = pts[N - 1];
      f.base = new THREE.Vector3(base[0], base[1], base[2]);
      f.top = new THREE.Vector3(pts[0][0], pts[0][1], pts[0][2]);
    }
    // Plunge pools, flanking boulders and wet-loving plants around each fall.
    const prnd = mulberry32(17);
    this.rocks = []; this.ferns = []; this.flowers = [];
    this.poolMat = new THREE.MeshBasicMaterial({ color: 0x1fb8b4, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    for (const f of this.falls) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), this.poolMat);
      pool.scale.set(11, 1, 8); pool.position.set(f.base.x, f.base.y + 0.5, f.base.z); pool.renderOrder = 2;
      this.group.add(pool);
      f.pts = f.path;
      f.path.forEach((p, i) => {
        if (i % 2) return;
        for (const side of [-1, 1]) if (prnd() < 0.55) {
          const q = f.path[Math.min(f.path.length - 1, i + 1)], o = f.path[Math.max(0, i - 1)];
          let tx = q[0] - o[0], tz = q[2] - o[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          const off = (6 + (i / f.path.length) * 4.5) + 1.5 + prnd() * 3.5;
          const x = p[0] - tz * off * side, z = p[2] + tx * off * side;
          this.rocks.push([x, terrain.heightAt(x, z), z]);
        }
      });
      for (let k = 0; k < (lowDetail ? 14 : 30); k++) {
        const a = prnd() * 6.283, r = 7 + prnd() * 14, x = f.base.x + Math.cos(a) * r, z = f.base.z + Math.sin(a) * r;
        const h = terrain.heightAt(x, z);
        if (h < 1) continue;
        (k % 3 ? this.ferns : this.flowers).push([x, h, z]);
      }
    }
    // Mist: soft puffs boiling up from each plunge pool.
    const per = lowDetail ? 14 : 26;
    this.per = per;
    const total = this.falls.length * per;
    this.pos = new Float32Array(total * 3);
    this.alpha = new Float32Array(total);
    this.size = new Float32Array(total);
    this.seed = Float32Array.from({ length: total }, (_, i) => ((i * 0.6180339) % 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mistMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: mistTexture() }, uTint: { value: new THREE.Color(0.92, 0.96, 1) }, uScale: { value: 600 } },
      transparent: true, depthWrite: false,
      vertexShader: 'attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vA = aAlpha * (1.0 - smoothstep(500.0, 2200.0, -mv.z)); gl_PointSize = aSize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform sampler2D uMap; uniform vec3 uTint; varying float vA; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uTint, t.a * vA); }',
    });
    this.points = new THREE.Points(g, this.mistMat);
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    this.group.add(this.points);
    this.time = 0;
  }

  // True when (x, z) lies on a fall's channel, so trees are not planted in the water.
  blocks(x, z) {
    for (const f of this.falls) for (const p of f.path) if ((p[0] - x) ** 2 + (p[2] - z) ** 2 < 100) return true;
    return false;
  }

  update(dt, { day = 1, night = 0, height = 720, pixelRatio = 1, camera = null } = {}) {
    this.time += dt;
    this.poolMat.color.setRGB(0.08 + 0.04 * day, 0.18 + 0.52 * day, 0.2 + 0.5 * day);
    for (const m of this.mats) {
      if (m.map) m.map.offset.y -= dt * m.userData.speed;
      const k = 0.35 + 0.65 * day;
      m.color.setRGB(k, k, Math.min(1, k * 1.05));
    }
    this.mistMat.uniforms.uScale.value = height * pixelRatio * 0.9;
    this.mistMat.uniforms.uTint.value.setRGB(0.35 + 0.65 * day, 0.38 + 0.62 * day, Math.min(1, 0.42 + 0.6 * day));
    const per = this.per;
    this.falls.forEach((f, k) => {
      const near = !camera || camera.position.distanceToSquared(f.base) < 2400 * 2400;
      for (let i = 0; i < per; i++) {
        const j = k * per + i, sd = this.seed[j];
        const life = (this.time * 0.22 + sd * 7.3) % 1;
        const a = sd * 62.8 + j;
        const r = 2 + life * 9 + Math.sin(a) * 4;
        this.pos[j * 3] = f.base.x + Math.cos(a) * r;
        this.pos[j * 3 + 1] = f.base.y + 1.5 + life * 16 + sd * 3;
        this.pos[j * 3 + 2] = f.base.z + Math.sin(a * 1.3) * r;
        this.size[j] = 9 + life * 24;
        this.alpha[j] = near ? Math.sin(Math.min(1, life) * Math.PI) * 0.5 : 0;
      }
    });
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    void night;
  }

  // Nearest fall to a point, for ambient audio and the map.
  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const f of this.falls) { const d = Math.hypot(f.base.x - x, f.base.z - z); if (d < bd) { bd = d; best = f; } }
    return best ? { fall: best, dist: bd } : null;
  }
}

// ---- Sea stacks ----------------------------------------------------------------

function stackGeometry(seed) {
  const rnd = mulberry32(seed);
  const g = new THREE.CylinderGeometry(0.55, 1, 1, 12, 8, false);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5;                                // 0 bottom .. 1 top
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const rad = Math.hypot(pos.getX(i), pos.getZ(i));
    const wob = 1 + Math.sin(a * 3 + seed) * 0.18 + Math.sin(a * 7 + y * 6) * 0.08 + (rnd() - 0.5) * 0.12 + Math.sin(y * 9 + seed) * 0.08;
    const taper = 1 - smooth(0.7, 1, y) * 0.55;
    pos.setX(i, pos.getX(i) / Math.max(rad, 1e-4) * rad * wob * taper);
    pos.setZ(i, pos.getZ(i) / Math.max(rad, 1e-4) * rad * wob * taper);
    pos.setY(i, pos.getY(i) + Math.sin(a * 4 + seed) * 0.03 * smooth(0.6, 1, y));
    // Dark wet rock below, grey cliff above, green moss and shrubs on the crown.
    if (y < 0.12) c.setRGB(0.18, 0.2, 0.2); else if (y > 0.86) c.setRGB(0.18 + rnd() * 0.05, 0.38 + rnd() * 0.08, 0.14); else c.setRGB(0.36 + rnd() * 0.06, 0.34 + rnd() * 0.05, 0.31);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Tall rock columns standing in the shallows around the coast.
export function buildSeaStacks(terrain, vegetation, { count = 46 } = {}) {
  const group = new THREE.Group();
  group.name = 'seastacks';
  const rnd = mulberry32(555);
  const geos = [stackGeometry(1), stackGeometry(2), stackGeometry(3)];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
  const lists = [[], [], []];
  // Walk the coastline: sample around the island centre and push outward to the shore.
  let tries = 0;
  while (lists[0].length + lists[1].length + lists[2].length < count && tries++ < 6000) {
    const a = rnd() * Math.PI * 2, r = 800 + rnd() * 2000;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.95;
    const h = terrain.heightAt(x, z);
    if (h > -2.5 || h < -16) continue;                          // standing in 2–16 m of water
    // Needs land within a few hundred metres so the stacks hug the coast.
    let coast = false;
    for (let k = 1; k <= 6 && !coast; k++) if (terrain.heightAt(x - Math.cos(a) * k * 55, z - Math.sin(a) * k * 55) > 0.5) coast = true;
    if (!coast) continue;
    const i = (rnd() * 3) | 0;
    const rad = 5 + rnd() * 12, height = 14 + rnd() * 34 + rad * 0.6;
    lists[i].push({ x, z, rad, height, rot: rnd() * 6.28 });
    // A few smaller rocks around the big one.
    for (let k = 0; k < 2; k++) lists[(i + k + 1) % 3].push({ x: x + (rnd() - 0.5) * rad * 4, z: z + (rnd() - 0.5) * rad * 4, rad: rad * (0.3 + rnd() * 0.3), height: height * (0.25 + rnd() * 0.3), rot: rnd() * 6.28 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  geos.forEach((geo, gi) => {
    const list = lists[gi];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      const hh = terrain.heightAt(it.x, it.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      s.set(it.rad, it.height + 6, it.rad);
      p.set(it.x, Math.min(hh, 0) - 6 + (it.height + 6) / 2, it.z);
      m4.compose(p, q, s); im.setMatrixAt(i, m4);
      if (vegetation && vegetation._addCollider) vegetation._addCollider(it.x, it.z, it.rad * 0.85, it.height);
    });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    group.add(im);
  });
  group.userData.count = lists.reduce((n, l) => n + l.length, 0);
  return group;
}
