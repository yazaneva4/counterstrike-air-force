// Cows grazing in the Aldren pasture (and occasionally floating up into a
// tractor beam, returning unharmed later) and flocks of gulls wheeling over
// the coast.

import * as THREE from 'three';
import { stdMat, clamp, dampAngle, TAU } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from '../world/terrain.js';

function cowModel(rnd) {
  const g = new THREE.Group();
  const white = stdMat(0xf2efe8, { rough: 0.85 });
  const black = stdMat(0x1f1c1a, { rough: 0.85 });
  const pink = stdMat(0xe8b0a8, { rough: 0.7 });
  const bodyMat = rnd() < 0.5 ? white : stdMat(0x7a4a2a, { rough: 0.85 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.5, 1.2, 4, 12), bodyMat, 0, 1.2, 0, 1, 1, 1).rotation.x = Math.PI / 2;
  if (bodyMat === white) for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.3, 8, 6), black, (rnd() - 0.5) * 0.7, 1.3 + rnd() * 0.3, (rnd() - 0.5) * 1.2, 1, 0.6, 1.2);
  const head = new THREE.Group(); head.position.set(0, 1.45, 1.05); g.add(head);
  const hm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.6), bodyMat); hm.position.z = 0.2; hm.castShadow = true; head.add(hm);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.2), pink); snout.position.set(0, -0.1, 0.52); head.add(snout);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), stdMat(0xe8e0c8)); horn.position.set(s * 0.18, 0.28, 0.05); horn.rotation.z = -s * 0.6; head.add(horn);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), bodyMat); ear.position.set(s * 0.28, 0.12, 0.05); head.add(ear);
  }
  const legs = [];
  for (const [x, z] of [[0.28, 0.6], [-0.28, 0.6], [0.28, -0.6], [-0.28, -0.6]]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.85, z); g.add(leg);
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.85, 6), bodyMat); lm.position.y = -0.42; lm.castShadow = true; leg.add(lm);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.1, 6), black); hoof.position.y = -0.84; leg.add(hoof);
    legs.push(leg);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4), bodyMat); tail.position.set(0, 1.2, -1.1); tail.rotation.x = 0.3; g.add(tail);
  return { group: g, head, legs, tail };
}

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
    this.flocks = [];
    const P = PLACES;
    const centers = [[P.beach.x, P.beach.z, 40], [P.lighthouse.x, P.lighthouse.z, 55], [P.village.x, P.village.z, 70], [P.airbase.x + 600, P.airbase.z + 300, 60]];
    for (const [cx, cz, alt] of centers) {
      const n = 14;
      const im = new THREE.InstancedMesh(wing, mat, n);
      im.frustumCulled = false;
      const birds = [];
      for (let i = 0; i < n; i++) birds.push({ r: 30 + rnd() * 60, a: rnd() * TAU, h: alt + rnd() * 30, sp: 0.25 + rnd() * 0.2, flap: rnd() * 10 });
      this.scene.add(im);
      this.flocks.push({ im, birds, cx, cz, base: this.world.groundAt(cx, cz) });
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
      });
      f.im.instanceMatrix.needsUpdate = true;
    }
  }
}
