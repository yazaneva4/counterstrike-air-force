// Cows grazing in the Aldren pasture (and occasionally floating up into a
// tractor beam, returning unharmed later) and flocks of gulls wheeling over
// the coast.

import * as THREE from 'three';
import { stdMat, clamp, dampAngle, TAU } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from '../world/terrain.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Smooth body of revolution (spline-smoothed profile) used for the torso and limbs.
function lathe(profile, segs = 24, sx = 1, sz = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector3(Math.max(r, 0.001), y, 0));
  const sm = new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints((pts.length - 1) * 3);
  const g = new THREE.LatheGeometry(sm.map((v) => new THREE.Vector2(Math.max(v.x, 0.001), v.y)), segs);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

// Hide texture: soft colour mottling, short-hair streaks and (for Holsteins) irregular black patches.
const hideCache = new Map();
function hideTexture(base, patchy, seed) {
  const key = base + patchy + seed;
  if (hideCache.has(key)) return hideCache.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  const rnd = mulberry32(seed);
  x.fillStyle = '#' + new THREE.Color(base).getHexString(); x.fillRect(0, 0, 256, 256);
  if (patchy) {
    x.fillStyle = '#1d1a18';
    for (let i = 0; i < 7; i++) {
      const px = rnd() * 256, py = 40 + rnd() * 170, r = 18 + rnd() * 30;
      x.beginPath();
      for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI * 2, rr = r * (0.65 + rnd() * 0.6); x.lineTo(px + Math.cos(a) * rr * 1.4, py + Math.sin(a) * rr); }
      x.fill();
    }
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.015 + rnd() * 0.025})`;
    x.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 6 + rnd() * 14);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  hideCache.set(key, t);
  return t;
}

function cowModel(rnd) {
  const g = new THREE.Group();
  const holstein = rnd() < 0.5;
  const seed = Math.floor(rnd() * 1e6);
  const baseColor = holstein ? 0xf1ede4 : [0x7a4a2a, 0x5c3a24, 0x9a6a3a][Math.floor(rnd() * 3)];
  const hide = new THREE.MeshStandardMaterial({ map: hideTexture(baseColor, holstein, seed), roughness: 0.88, metalness: 0 });
  const pink = stdMat(0xc98f86, { rough: 0.6 });
  const dark = stdMat(0x2a2220, { rough: 0.7 });
  const horn = stdMat(0xe6dcc0, { rough: 0.5 });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  // Barrel torso: deep chest, slightly sloped back, tapering rump.
  const body = lathe([[0.1, -1.18], [0.38, -1.08], [0.5, -0.85], [0.52, -0.5], [0.5, -0.1], [0.52, 0.4], [0.55, 0.7], [0.46, 0.95], [0.26, 1.1]], 28, 0.82, 1.1);
  body.rotateX(Math.PI / 2);
  add(g, body, hide, 0, 1.22, 0);
  // Udder and teats.
  const udder = new THREE.SphereGeometry(0.2, 14, 10); udder.scale(1, 0.75, 1.1);
  add(g, udder, pink, 0, 0.7, -0.72);
  for (const [x, z] of [[-0.07, -0.65], [0.07, -0.65], [-0.07, -0.8], [0.07, -0.8]]) add(g, new THREE.CylinderGeometry(0.018, 0.012, 0.07, 8), pink, x, 0.58, z);
  // Neck and head (smooth, unmarked).
  const neck = lathe([[0.2, -0.25], [0.24, -0.1], [0.27, 0.1], [0.3, 0.3]], 20);
  neck.rotateX(Math.PI / 2 - 0.35);
  add(g, neck, hide, 0, 1.36, 1.05);
  const dewlap = new THREE.SphereGeometry(0.2, 12, 8); dewlap.scale(0.55, 0.9, 1.3);
  add(g, dewlap, hide, 0, 1.0, 1.1);
  const head = new THREE.Group(); head.position.set(0, 1.28, 1.42); g.add(head);
  const skull = new THREE.SphereGeometry(0.22, 20, 16); skull.scale(0.9, 1.0, 1.25);
  add(head, skull, hide, 0, 0, 0.12);
  const muzzle = lathe([[0.13, -0.18], [0.125, -0.05], [0.1, 0.1], [0.06, 0.16]], 16);
  muzzle.rotateX(Math.PI / 2 + 0.35);
  add(head, muzzle, pink, 0, -0.14, 0.4);
  for (const sd of [-1, 1]) {
    const hn = new THREE.ConeGeometry(0.04, 0.22, 10); hn.translate(0, 0.11, 0);
    const h = add(head, hn, horn, sd * 0.15, 0.2, 0.0); h.rotation.z = -sd * 0.9; h.rotation.x = -0.1;
    const ear = new THREE.SphereGeometry(0.09, 10, 8); ear.scale(1.5, 0.4, 0.85);
    const e = add(head, ear, hide, sd * 0.27, 0.1, 0.02); e.rotation.z = sd * -0.25;
  }
  // Legs: thigh / cannon / hoof with a knee joint for the walk cycle.
  const legs = [];
  for (const [x, z, hind] of [[0.26, 0.62, false], [-0.26, 0.62, false], [0.27, -0.78, true], [-0.27, -0.78, true]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.92, z); g.add(leg);
    const upper = lathe([[0.085, -0.42], [0.105, -0.3], [0.145, -0.1], [0.15, 0.05]], 14, 1, hind ? 1.15 : 1);
    add(leg, upper, hide, 0, 0, 0);
    const lower = lathe([[0.06, -0.46], [0.066, -0.3], [0.078, -0.1], [0.085, 0.02]], 12);
    add(leg, lower, hide, 0, -0.4, hind ? -0.04 : 0);
    const hoof = lathe([[0.09, -0.05], [0.1, -0.02], [0.08, 0.0], [0.06, 0.02]], 12); hoof.scale(1, 1, 1.15);
    add(leg, hoof, dark, 0, -0.84, hind ? -0.04 : 0.01);
    legs.push(leg);
  }
  // Tail with a tuft.
  const tail = new THREE.Group(); tail.position.set(0, 1.45, -1.15); g.add(tail);
  const cord = lathe([[0.03, -0.75], [0.03, -0.4], [0.04, 0]], 8); add(tail, cord, hide, 0, -0.38, 0);
  add(tail, new THREE.SphereGeometry(0.07, 10, 8), dark, 0, -0.82, 0).scale.set(1, 2.2, 1);
  tail.rotation.x = 0.15;
  return { group: g, head, legs, tail };
}

export { cowModel };

export class Animals {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    const rnd = mulberry32(99);
    this.cows = [];
    const P = world.structures.pasture;
    for (let i = 0; i < 12; i++) {
      const m = cowModel(rnd);
      const c = { ...m, x: P.x + (rnd() - 0.5) * P.hw * 2, z: P.z + (rnd() - 0.5) * P.hd * 2, heading: rnd() * TAU, target: null, timer: rnd() * 5, graze: 0, lift: 0, away: 0, phase: rnd() * 10 };
      m.group.position.set(c.x, world.groundAt(c.x, c.z), c.z);
      scene.add(m.group);
      this.cows.push(c);
    }
    this.abducted = 0;
    this._birds(rnd);
  }

  _birds(rnd) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -0.9, 0.35, -0.1, 0, 0, -0.25, 0, 0, 0.3, 0.9, 0.35, -0.1, 0, 0, -0.25], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide, roughness: 0.8 });
    // Body, tail, head and beak (wings flap separately so the body never squashes).
    const parts = [];
    const bd = new THREE.SphereGeometry(0.12, 12, 8); bd.scale(0.9, 0.85, 2.6); parts.push(bd);
    const hd = new THREE.SphereGeometry(0.075, 10, 8); hd.translate(0, 0.03, 0.34); parts.push(hd);
    const tl = new THREE.ConeGeometry(0.1, 0.3, 6); tl.rotateX(-Math.PI / 2); tl.scale(1, 0.25, 1); tl.translate(0, 0, -0.42); parts.push(tl);
    for (const g of parts) { g.deleteAttribute('uv'); }
    const bodyGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    const beakGeo = new THREE.ConeGeometry(0.025, 0.12, 6); beakGeo.rotateX(Math.PI / 2); beakGeo.translate(0, 0.02, 0.46); beakGeo.deleteAttribute('uv');
    const bodyMesh = (n) => new THREE.InstancedMesh(mergeGeometries([bodyGeo, beakGeo.toNonIndexed ? beakGeo.toNonIndexed() : beakGeo]), mat, n);
    this.flocks = [];
    const P = PLACES;
    const centers = [[P.beach.x, P.beach.z, 40], [P.lighthouse.x, P.lighthouse.z, 55], [P.village.x, P.village.z, 70], [P.airbase.x + 600, P.airbase.z + 300, 60]];
    for (const [cx, cz, alt] of centers) {
      const n = 14;
      const im = new THREE.InstancedMesh(wing, mat, n);
      im.frustumCulled = false;
      const bodies = bodyMesh(n); bodies.frustumCulled = false; bodies.castShadow = false;
      this.scene.add(bodies);
      const birds = [];
      for (let i = 0; i < n; i++) birds.push({ r: 30 + rnd() * 60, a: rnd() * TAU, h: alt + rnd() * 30, sp: 0.25 + rnd() * 0.2, flap: rnd() * 10 });
      this.scene.add(im);
      this.flocks.push({ im, bodies, birds, cx, cz, base: this.world.groundAt(cx, cz) });
    }
  }

  // beams: [{ pos: Vector3, groundY: number, radius: number, owner }]
  update(dt, t, beams, ctx) {
    const W = this.world, P = W.structures.pasture;
    for (const c of this.cows) {
      if (c.away > 0) {
        c.away -= dt;
        if (c.away <= 0) {
          c.x = P.x + (Math.random() - 0.5) * P.hw * 2; c.z = P.z + (Math.random() - 0.5) * P.hd * 2;
          c.group.visible = true; c.lift = 0;
        }
        continue;
      }
      // Tractor beam?
      let beam = null;
      for (const b of beams) if (Math.hypot(b.pos.x - c.x, b.pos.z - c.z) < b.radius) beam = b;
      const gy = W.groundAt(c.x, c.z);
      if (beam) {
        c.lift += dt * 6;
        c.x += (beam.pos.x - c.x) * dt * 0.8; c.z += (beam.pos.z - c.z) * dt * 0.8;
        c.group.rotation.z = Math.sin(t * 2 + c.phase) * 0.4;
        c.group.rotation.x = Math.cos(t * 1.7 + c.phase) * 0.3;
        if (gy + c.lift > beam.pos.y - 4) {
          c.group.visible = false; c.away = 45 + Math.random() * 40;
          this.abducted++;
          if (beam.owner === 'player') ctx.onAbduct?.();
        }
      } else {
        c.lift = Math.max(0, c.lift - dt * 12);
        c.group.rotation.z *= 0.9; c.group.rotation.x *= 0.9;
        c.timer -= dt;
        if (c.target) {
          const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
          if (d < 0.5) { c.target = null; c.timer = 5 + Math.random() * 10; }
          else {
            c.heading = dampAngle(c.heading, Math.atan2(dx, dz), 2, dt);
            c.x += Math.sin(c.heading) * 0.6 * dt; c.z += Math.cos(c.heading) * 0.6 * dt;
            c.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 5 + i * Math.PI * 0.5) * 0.35; });
          }
          c.head.rotation.x = 0;
        } else {
          c.head.rotation.x = 0.6 + Math.sin(t * 0.7 + c.phase) * 0.1;
          if (c.timer <= 0) c.target = { x: P.x + (Math.random() - 0.5) * P.hw * 2, z: P.z + (Math.random() - 0.5) * P.hd * 2 };
        }
        c.x = clamp(c.x, P.x - P.hw - 20, P.x + P.hw + 20); c.z = clamp(c.z, P.z - P.hd - 20, P.z + P.hd + 20);
      }
      c.tail.rotation.z = Math.sin(t * 3 + c.phase) * 0.3;
      c.group.position.set(c.x, gy + c.lift, c.z);
      c.group.rotation.y = c.heading;
    }
    // Gulls.
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    for (const f of this.flocks) {
      f.birds.forEach((b, i) => {
        b.a += b.sp * dt;
        b.flap += dt * 9;
        const x = f.cx + Math.cos(b.a) * b.r, z = f.cz + Math.sin(b.a) * b.r;
        p.set(x, f.base + b.h + Math.sin(b.a * 3) * 3, z);
        e.set(0, -b.a, -0.35);
        q.setFromEuler(e);
        s.set(1, Math.sin(b.flap), 1);
        m4.compose(p, q, s);
        f.im.setMatrixAt(i, m4);
        m4.compose(p, q, s.set(1, 1, 1));
        f.bodies.setMatrixAt(i, m4);
      });
      f.im.instanceMatrix.needsUpdate = true;
      f.bodies.instanceMatrix.needsUpdate = true;
    }
  }
}
