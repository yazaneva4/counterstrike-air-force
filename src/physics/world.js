// Real-time rigid-body physics for the loose objects of the world: crates,
// barrels, traffic cones, tyres, balls and crash debris. Each body has a
// position, orientation, linear and angular velocity and an inertia tensor.
// Contacts are resolved with point impulses (restitution plus Coulomb
// friction) against the terrain, static colliders, trees, other bodies and
// the moving vehicles and player, which act as kinematic boxes. Resting
// bodies fall asleep and cost nothing until something disturbs them. Floating
// objects feel buoyancy and drag in the sea; wind pushes light ones.
//
// The simulation is pure maths (no rendering) so it runs in unit tests; see
// props.js for the instanced meshes that draw the bodies.

import * as THREE from 'three';

export const SHAPES = {
  crate: { half: [0.45, 0.45, 0.45], mass: 16, e: 0.18, mu: 0.65, density: 0.55 },
  box: { half: [0.3, 0.25, 0.3], mass: 4, e: 0.2, mu: 0.6, density: 0.4 },
  barrel: { half: [0.3, 0.45, 0.3], mass: 14, e: 0.3, mu: 0.45, density: 0.5, cyl: true },
  cone: { half: [0.2, 0.3, 0.2], mass: 1.6, e: 0.3, mu: 0.6, density: 0.2, cone: true },
  tyre: { half: [0.34, 0.14, 0.34], mass: 9, e: 0.45, mu: 0.8, density: 0.7, cyl: true },
  ball: { half: [0.24, 0.24, 0.24], mass: 0.5, e: 0.72, mu: 0.4, density: 0.08, sphere: true },
  debris: { half: [0.3, 0.12, 0.2], mass: 5, e: 0.3, mu: 0.6, density: 1.4 },
};

// Contact points in body space plus their radius.
function contactPoints(shape) {
  const [hx, hy, hz] = shape.half, pts = [];
  if (shape.sphere) return { pts: [[0, 0, 0]], pr: hx };
  if (shape.cyl) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, x = Math.cos(a) * hx, z = Math.sin(a) * hz; pts.push([x, -hy, z], [x, hy, z]); }
    return { pts, pr: 0.015 };
  }
  if (shape.cone) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pts.push([Math.cos(a) * hx, -hy, Math.sin(a) * hz]); }
    pts.push([0, hy, 0]);
    return { pts, pr: 0.02 };
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * hx, sy * hy, sz * hz]);
  return { pts, pr: 0.02 };
}

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const STEP = 1 / 90;

let nextId = 1;

export class PhysicsWorld {
  // world: { groundAt, terrain, structures?, vegetation?, gravity? (multiplier), air? }
  constructor(world, { waterLevel = 0, seaPhysics = true } = {}) {
    this.world = world;
    this.g = 9.81 * (world.gravity ?? 1);
    this.bodies = [];
    this.waterLevel = waterLevel;
    this.sea = seaPhysics;
    this.wind = new THREE.Vector3(6, 0, 2.5);
    this.time = 0;
    this.acc = 0;
    this.grid = new Map();
    this.cell = 2.5;
    this.statics = new Map();
    this.onImpact = null;      // (kind, speed, position) -> void
    this.awakeCount = 0;
    this._buildStaticIndex();
  }

  // Spatial hash of the oriented static colliders (buildings, walls, masts).
  _buildStaticIndex() {
    const cols = this.world.colliders || this.world.structures?.colliders || [];
    const C = 24;
    this.staticCell = C;
    for (const b of cols) {
      const R = b.hw + b.hd + 1;
      for (let cx = Math.floor((b.x - R) / C); cx <= Math.floor((b.x + R) / C); cx++) for (let cz = Math.floor((b.z - R) / C); cz <= Math.floor((b.z + R) / C); cz++) {
        const k = cx + ',' + cz;
        let l = this.statics.get(k); if (!l) this.statics.set(k, l = []);
        l.push(b);
      }
    }
  }

  // Re-index after structures were added (cities build late).
  reindexStatics() { this.statics.clear(); this._buildStaticIndex(); }

  add(kind, x, z, { y = null, yaw = 0, pitch = 0, roll = 0, sleep = true, color = 0xffffff, scale = 1, ttl = 0 } = {}) {
    const base = SHAPES[kind];
    if (!base) throw new Error('unknown prop ' + kind);
    const shape = scale === 1 ? base : { ...base, half: base.half.map((h) => h * scale), mass: base.mass * scale ** 3 };
    const cp = contactPoints(shape);
    const [hx, hy, hz] = shape.half;
    const m = shape.mass;
    const b = {
      id: nextId++, kind, shape, pts: cp.pts.map((p) => new THREE.Vector3(...p)), pr: cp.pr, scale, color,
      p: new THREE.Vector3(x, 0, z), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')),
      v: new THREE.Vector3(), w: new THREE.Vector3(), invM: 1 / m,
      // Box inertia from the half extents (a fair stand-in for cylinders and cones).
      invI: new THREE.Vector3(3 / (m * (hy * hy + hz * hz)), 3 / (m * (hx * hx + hz * hz)), 3 / (m * (hx * hx + hy * hy))),
      radius: Math.hypot(hx, hy, hz), sleeping: sleep, still: 0, dirty: true, ttl, age: 0, wet: 0, vol: 8 * hx * hy * hz,
      index: -1,
    };
    const g = this.world.groundAt(x, z);
    b.p.y = y ?? g + (b.pts.reduce((mn, p) => Math.min(mn, this._lowest(b, p)), 0) * -1) + 0.01;
    this.bodies.push(b);
    return b;
  }

  _lowest(b, p) { return v1.copy(p).applyQuaternion(b.q).y - b.pr; }

  remove(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    b.removed = true;
  }

  wake(b) { b.sleeping = false; b.still = 0; }

  // Impulse applied at a world point (used by explosions and projectiles).
  applyImpulse(b, imp, at) {
    this.wake(b);
    b.v.addScaledVector(imp, b.invM);
    if (at) { v1.copy(at).sub(b.p).cross(imp); this._invI(b, v1); b.w.add(v1); }
  }

  explode(pos, { radius = 30, strength = 14 } = {}) {
    for (const b of this.bodies) {
      const d = v1.copy(b.p).sub(pos);
      const dist = d.length();
      if (dist > radius) continue;
      const k = (1 - dist / radius) ** 1.4 * strength;
      d.normalize(); d.y = Math.abs(d.y) * 0.6 + 0.55; d.normalize();
      this.wake(b);
      b.v.addScaledVector(d, k);
      b.w.add(v2.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(k * 0.6));
    }
  }

  // Spray of crash fragments from a destroyed vehicle.
  debris(pos, vel, { count = 14, color = 0x888888 } = {}) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const b = this.add('debris', pos.x + (Math.random() - 0.5) * 3, pos.z + (Math.random() - 0.5) * 3, {
        y: pos.y + 0.5 + Math.random() * 1.5, sleep: false, color: i % 3 ? color : 0x222222, scale: 0.5 + Math.random() * 0.9, ttl: 40,
        yaw: Math.random() * 6.28, pitch: Math.random() * 6.28,
      });
      b.v.set((Math.random() - 0.5) * 22, 5 + Math.random() * 14, (Math.random() - 0.5) * 22).addScaledVector(vel, 0.4);
      b.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      out.push(b);
    }
    return out;
  }

  _invI(b, vec) {
    q1.copy(b.q).invert();
    vec.applyQuaternion(q1);
    vec.set(vec.x * b.invI.x, vec.y * b.invI.y, vec.z * b.invI.z);
    return vec.applyQuaternion(b.q);
  }

  // Impulse resolution at world point `pt` with surface normal `n` against a
  // surface moving with velocity `vs`. Returns the normal impulse magnitude.
  _contact(b, pt, n, vs, e, mu) {
    v1.copy(pt).sub(b.p);                       // r
    v2.copy(b.w).cross(v1).add(b.v).sub(vs);    // relative point velocity
    const vn = v2.dot(n);
    if (vn >= 0) return 0;
    v3.copy(v1).cross(n); this._invI(b, v3);
    const kn = b.invM + v3.cross(v1).dot(n);
    const j = -(1 + (vn < -1.2 ? e : 0)) * vn / kn;
    v4.copy(n).multiplyScalar(j);
    b.v.addScaledVector(v4, b.invM);
    v3.copy(v1).cross(v4); this._invI(b, v3); b.w.add(v3);
    // Coulomb friction along the sliding direction.
    v2.copy(b.w).cross(v1).add(b.v).sub(vs);
    v2.addScaledVector(n, -v2.dot(n));
    const vt = v2.length();
    if (vt > 1e-4) {
      v2.multiplyScalar(1 / vt);
      v3.copy(v1).cross(v2); this._invI(b, v3);
      const kt = b.invM + v3.cross(v1).dot(v2);
      const jt = Math.min(vt / kt, mu * j);
      v4.copy(v2).multiplyScalar(-jt);
      b.v.addScaledVector(v4, b.invM);
      v3.copy(v1).cross(v4); this._invI(b, v3); b.w.add(v3);
    }
    return j;
  }

  _hash(b) {
    const k = Math.floor(b.p.x / this.cell) * 73856093 ^ Math.floor(b.p.z / this.cell) * 19349663;
    let l = this.grid.get(k); if (!l) this.grid.set(k, l = []);
    l.push(b);
  }

  _near(x, z, r, fn) {
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const l = this.grid.get(cx * 73856093 ^ cz * 19349663);
      if (l) for (const b of l) fn(b);
    }
  }

  // ctx: { focus: Vector3, kinematics: [{ pos, yaw, half:[x,y,z], vel }], range }
  step(dt, ctx = {}) {
    this.acc = Math.min(this.acc + dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 4) { this._substep(STEP, ctx); this.acc -= STEP; n++; }
    // Fixed-step catch-up is capped; drop the remainder rather than spiral.
    if (n === 4) this.acc = 0;
    this.time += dt;
  }

  _substep(h, ctx) {
    const focus = ctx.focus, range2 = (ctx.range ?? 420) ** 2;
    const bodies = this.bodies;
    this.grid.clear();
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.ttl) { b.age += h; if (b.age > b.ttl) { this.remove(b); continue; } }
      this._hash(b);
    }
    // Kinematic bodies (vehicles, player) push and wake what they touch.
    for (const k of ctx.kinematics || []) this._kinematic(k, h);
    let awake = 0;
    const g = this.g;
    for (const b of bodies) {
      if (b.sleeping) continue;
      if (focus) { const dx = b.p.x - focus.x, dz = b.p.z - focus.z; if (dx * dx + dz * dz > range2) continue; }
      awake++;
      // Forces: gravity, then water and wind.
      b.v.y -= g * h;
      this._environment(b, h);
      // Integrate.
      b.p.addScaledVector(b.v, h);
      const wl = b.w.length();
      if (wl > 1e-5) { q2.setFromAxisAngle(v1.copy(b.w).multiplyScalar(1 / wl), wl * h); b.q.premultiply(q2).normalize(); }
      // Contacts (two passes settle resting stacks and corners).
      this._ground(b, 2);
      this._statics(b);
      this._pairs(b);
      b.dirty = true;
      // Sleep when nearly motionless.
      if (b.v.lengthSq() < 0.012 && b.w.lengthSq() < 0.04 && !b.wet) { b.still += h; if (b.still > 0.5) { b.sleeping = true; b.v.set(0, 0, 0); b.w.set(0, 0, 0); } }
      else b.still = 0;
    }
    this.awakeCount = awake;
  }

  _environment(b, h) {
    const w = this.world;
    const ty = w.terrain ? w.terrain.heightAt(b.p.x, b.p.z) : 1;
    b.wet = 0;
    if (this.sea && ty < this.waterLevel - 0.05) {
      // Waves: a couple of travelling sines so floating objects bob and drift.
      const surf = this.waterLevel + Math.sin(b.p.x * 0.08 + this.time * 1.3) * 0.22 + Math.sin(b.p.z * 0.11 - this.time * 0.9) * 0.16;
      // Effective displaced volume tuned so objects float about 40% submerged.
      const rho = 1000, vol = b.shape.mass * 5 / rho;
      const n = b.pts.length;
      let sub = 0;
      for (const p of b.pts) {
        v1.copy(p).applyQuaternion(b.q).add(b.p);
        const depth = surf - (v1.y - b.pr);
        if (depth <= 0) continue;
        sub++;
        const Fp = (rho * this.g * vol / n) * Math.min(1, depth / (b.shape.half[1] * 2 + 0.05));
        b.v.y += Fp * b.invM * h;
        // Off-centre buoyancy torque rights a tilted floating body.
        v2.copy(v1).sub(b.p).cross(v3.set(0, Fp * h, 0)); this._invI(b, v2); b.w.add(v2);
      }
      if (sub) {
        b.wet = 1;
        const drag = Math.exp(-1.8 * h);
        b.v.multiplyScalar(drag); b.w.multiplyScalar(Math.exp(-1.2 * h));
        // Drift with the wave motion and wind.
        b.v.x += this.wind.x * 0.05 * h; b.v.z += this.wind.z * 0.05 * h;
      }
    } else if (b.shape.density < 0.3) {
      // Light objects (cones, balls) feel the wind.
      const k = (b.shape.density < 0.1 ? 0.9 : 0.25) * h;
      b.v.x += (this.wind.x - b.v.x) * k * 0.15; b.v.z += (this.wind.z - b.v.z) * k * 0.15;
    }
    // Air drag.
    const ad = Math.exp(-0.05 * h);
    b.v.multiplyScalar(ad);
  }

  _ground(b, iters) {
    const w = this.world;
    const gy = w.groundAt(b.p.x, b.p.z);
    const n = this._n || (this._n = new THREE.Vector3());
    const th = w.terrain ? w.terrain.heightAt(b.p.x, b.p.z) : gy;
    if (w.terrain && gy <= th + 0.01) w.terrain.normalAt(b.p.x, b.p.z, n); else n.set(0, 1, 0);
    // Plane through (p.x, gy, p.z) with normal n.
    for (let it = 0; it < iters; it++) {
      let maxDepth = 0;
      for (const p of b.pts) {
        v1.copy(p).applyQuaternion(b.q).add(b.p);
        const planeY = gy - ((v1.x - b.p.x) * n.x + (v1.z - b.p.z) * n.z) / n.y;
        const depth = planeY - (v1.y - b.pr);
        if (depth <= 0) continue;
        const speed = this._contact(b, v1, n, v3.set(0, 0, 0), b.shape.e, b.shape.mu);
        if (speed > 0 && it === 0 && this.onImpact) { const s = speed * b.invM; if (s > 2.2) this.onImpact(b.kind, s, b.p); }
        if (depth > maxDepth) maxDepth = depth;
      }
      if (maxDepth > 0) b.p.addScaledVector(n, maxDepth * 0.9);
    }
    // Rolling resistance and angular damping when touching down.
    if (b.w.lengthSq() > 0) b.w.multiplyScalar(Math.exp(-0.35 * STEP));
  }

  _statics(b) {
    const C = this.staticCell;
    const list = this.statics.get(Math.floor(b.p.x / C) + ',' + Math.floor(b.p.z / C));
    if (list) for (const c of list) {
      if (b.p.y - b.radius > c.top || b.p.y + b.radius < (c.bottom ?? -Infinity)) continue;
      const cc = c.c ?? 1, ss = c.s ?? 0;
      const dx = b.p.x - c.x, dz = b.p.z - c.z;
      const lx = dx * cc - dz * ss, lz = dx * ss + dz * cc;
      const r = b.radius * 0.75;
      const ox = c.hw + r - Math.abs(lx), oz = c.hd + r - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      // Push out along the shallower axis and reflect the velocity component.
      let nx, nz;
      if (ox < oz) { nx = Math.sign(lx); nz = 0; b.p.x += (nx * ox) * cc; b.p.z -= (nx * ox) * ss; }
      else { nx = 0; nz = Math.sign(lz); b.p.x += (nz * oz) * ss; b.p.z += (nz * oz) * cc; }
      const wx = nx * cc + nz * ss, wz = -nx * ss + nz * cc;
      const vn = b.v.x * wx + b.v.z * wz;
      if (vn < 0) {
        b.v.x -= (1 + 0.3) * vn * wx; b.v.z -= (1 + 0.3) * vn * wz;
        if (this.onImpact && -vn > 2.5) this.onImpact(b.kind, -vn, b.p);
      }
    }
    // Tree trunks and boulders.
    const veg = this.world.vegetation;
    if (veg && veg.near) veg.near(b.p.x, b.p.z, (t) => {
      if (b.p.y > t.top) return;
      const dx = b.p.x - t.x, dz = b.p.z - t.z, d = Math.hypot(dx, dz), R = t.r + b.radius * 0.6;
      if (d >= R || d < 1e-4) return;
      const nx = dx / d, nz = dz / d;
      b.p.x = t.x + nx * R; b.p.z = t.z + nz * R;
      const vn = b.v.x * nx + b.v.z * nz;
      if (vn < 0) { b.v.x -= 1.3 * vn * nx; b.v.z -= 1.3 * vn * nz; }
    });
  }

  _pairs(b) {
    this._near(b.p.x, b.p.z, b.radius + 1.6, (o) => {
      if (o === b || o.id < b.id) return;       // each pair once
      v1.copy(b.p).sub(o.p);
      const d = v1.length(), R = (b.radius + o.radius) * 0.8;
      if (d >= R || d < 1e-5) return;
      v1.multiplyScalar(1 / d);
      const depth = R - d, tot = b.invM + o.invM;
      b.p.addScaledVector(v1, depth * (b.invM / tot)); o.p.addScaledVector(v1, -depth * (o.invM / tot));
      v2.copy(b.v).sub(o.v);
      const vn = v2.dot(v1);
      if (vn < 0) {
        const j = -(1.25) * vn / tot;
        b.v.addScaledVector(v1, j * b.invM); o.v.addScaledVector(v1, -j * o.invM);
        if (this.onImpact && -vn > 2.5) this.onImpact(b.kind, -vn, b.p);
      }
      if (o.sleeping && (-vn > 0.4 || d < R * 0.7)) this.wake(o);
      o.dirty = true;
    });
  }

  // A moving box (car, aircraft on the ground, the player) shoves bodies aside.
  _kinematic(k, h) {
    const hx = k.half[0], hy = k.half[1], hz = k.half[2];
    const cy = Math.cos(k.yaw), sy = Math.sin(k.yaw);
    const reach = Math.hypot(hx, hz) + 1.4;
    this._near(k.pos.x, k.pos.z, reach, (b) => {
      const dx = b.p.x - k.pos.x, dz = b.p.z - k.pos.z;
      if (dx * dx + dz * dz > (reach + b.radius) ** 2) return;
      if (b.p.y - b.radius > k.pos.y + hy * 2 || b.p.y + b.radius < k.pos.y - hy) return;
      // Body points in the kinematic box's frame (yaw only).
      let hit = false, best = 1e9, nx = 0, nz = 0, ny = 0;
      for (const p of b.pts) {
        v1.copy(p).applyQuaternion(b.q).add(b.p);
        const px = v1.x - k.pos.x, pz = v1.z - k.pos.z, py = v1.y - k.pos.y;
        const lx = px * cy - pz * sy, lz = px * sy + pz * cy;
        const ox = hx + b.pr - Math.abs(lx), oz = hz + b.pr - Math.abs(lz), oy = hy + b.pr - Math.abs(py - hy);
        if (ox <= 0 || oz <= 0 || oy <= 0) continue;
        hit = true;
        // Minimum translation axis (the roof counts for things landing on it; the underside never does).
        if (py > hy && oy < ox && oy < oz && oy < best) { best = oy; nx = 0; nz = 0; ny = 1; }
        else if (ox < oz && ox < best) { best = ox; ny = 0; const sx = Math.sign(lx) || 1; nx = sx * cy; nz = -sx * sy; }
        else if (oz < best) { best = oz; ny = 0; const sz = Math.sign(lz) || 1; nx = sz * sy; nz = sz * cy; }
      }
      if (!hit) return;
      this.wake(b);
      v3.set(nx, ny, nz).normalize();
      b.p.addScaledVector(v3, best + 0.01);
      // Relative velocity along the normal gets a bouncy inelastic response.
      v2.copy(b.v).sub(k.vel || v4.set(0, 0, 0));
      const vn = v2.dot(v3);
      if (vn < 0) {
        b.v.addScaledVector(v3, -(1 + 0.35) * vn);
        // Tumble: spin follows the offset between contact and centre of mass.
        b.w.add(v1.copy(v3).cross(UP).multiplyScalar(vn * 0.7));
        b.w.y += (Math.random() - 0.5) * Math.abs(vn) * 0.8;
        if (this.onImpact && -vn > 2) this.onImpact(b.kind, -vn, b.p);
      }
      b.dirty = true;
    });
  }
}
