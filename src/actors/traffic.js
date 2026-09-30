// AI air traffic that makes the sky feel alive: an airliner on a wide
// holding pattern with contrails, a pair of jets in formation, a coastal
// patrol helicopter and a touring Skylark.

import * as THREE from 'three';
import { buildAirliner, buildFighter, buildHelicopter, buildProp } from '../vehicles/models.js';
import { Trail } from '../fx/particles.js';
import { PLACES } from '../world/terrain.js';
import { buildCar, CAR_COLORS, animateCarParts } from '../vehicles/cars.js';

const up = new THREE.Vector3(0, 1, 0);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), side = new THREE.Vector3();

class Flyer {
  constructor(scene, model, path, speed, { trails = [], trailOpts = {}, phase = 0, heli = false } = {}) {
    this.model = model;
    this.group = model.group;
    scene.add(this.group);
    this.path = path;      // s in [0,1) -> Vector3
    this.speed = speed;
    this.s = phase;
    this.heli = heli;
    // Approximate the loop length.
    let L = 0; const a = new THREE.Vector3(), b = new THREE.Vector3();
    path(0, a);
    for (let i = 1; i <= 200; i++) { path(i / 200, b); L += a.distanceTo(b); a.copy(b); }
    this.length = L;
    this.bank = 0;
    this.trails = trails.map((off) => ({ off, trail: new Trail(scene, trailOpts) }));
    this.prevDir = new THREE.Vector3();
    this.pos = this.group.position;
  }

  update(dt, t, night) {
    this.s = (this.s + (this.speed * dt) / this.length) % 1;
    this.path(this.s, tA);
    this.path((this.s + 0.002) % 1, tB);
    const dir = tC.subVectors(tB, tA).normalize();
    // Bank from the change in heading.
    const turn = this.prevDir.lengthSq() > 0 ? this.prevDir.clone().cross(dir).y / Math.max(dt, 1e-3) : 0;
    this.prevDir.copy(dir);
    const targetBank = this.heli ? Math.max(-0.3, Math.min(0.3, -turn * 3)) : Math.max(-0.8, Math.min(0.8, Math.atan(-turn * this.speed / 9.8)));
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 1.5);
    this.group.position.copy(tA);
    this.group.lookAt(tB);
    this.group.rotateZ(this.bank);
    if (this.heli) this.group.rotateX(0.12);
    const P = this.model.parts;
    if (P.rotor) { P.rotor.rotation.y += dt * 28; P.tailRotor.rotation.x += dt * 60; P.rDisc.material.opacity = 0.28; }
    if (P.prop) { P.prop.rotation.z += dt * 50; P.disc.material.opacity = 0.3; }
    if (P.gear) P.gear.visible = false;
    if (P.flame) { P.flame.scale.set(0.8, 0.8, 0.6); P.flame.material.opacity = 0.4; }
    if (P.pilot) P.pilot.root.visible = true;
    if (P.nav) { P.nav.strobe.material.opacity = (t % 1.1) < 0.07 ? 1 : 0; }
    if (P.beacon) P.beacon.material.opacity = (t % 1.5) < 0.1 ? 1 : 0.1;
    if (P.winMat) P.winMat.emissiveIntensity = 1.4 * night;
    side.set(1, 0, 0).applyQuaternion(this.group.quaternion);
    for (const tr of this.trails) {
      tA.copy(tr.off).applyQuaternion(this.group.quaternion).add(this.group.position);
      tr.trail.push(tA, side);
      tr.trail.update(1);
    }
  }
}

// A car that drives a road back and forth on the right-hand side: it follows a
// smoothed centre line, slows for the ends, yields to anything in front of it,
// stays on the terrain (pitch and roll from its wheels) and switches its
// lights on at dusk.
class RoadCar {
  constructor(scene, world, road, type, color, speed, phase) {
    this.world = world;
    this.model = buildCar(type, { color });
    this.model.parts.pilot.root.visible = true;
    this.group = this.model.group;
    scene.add(this.group);
    const curve = new THREE.CatmullRomCurve3(road.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const len = curve.getLength();
    this.pts = curve.getSpacedPoints(Math.max(8, Math.round(len / 6)));
    this.len = len / (this.pts.length - 1);          // spacing between points
    this.total = len;
    this.s = phase * len;
    this.dir = 1;
    this.speed = speed;
    this.v = 0;
    this.heading = 0;
    this.steer = 0;
    this.pos = this.group.position;
    this.tilt = { x: 0, z: 0 };
    this.lane = 2.1;
    this.braking = false;
    this._sample(this.s, this.dir, true);
  }

  _sample(s, dir, snap = false) {
    const f = s / this.len, i = Math.max(0, Math.min(this.pts.length - 2, Math.floor(f))), t = f - i;
    const a = this.pts[i], b = this.pts[i + 1];
    const tx = (b.x - a.x) * dir, tz = (b.z - a.z) * dir, l = Math.hypot(tx, tz) || 1;
    const hx = tx / l, hz = tz / l;
    // Right of travel: (-hz, hx).
    this.x = a.x + (b.x - a.x) * t - hz * this.lane;
    this.z = a.z + (b.z - a.z) * t + hx * this.lane;
    const h = Math.atan2(hx, hz);
    if (snap) this.heading = h;
    return h;
  }

  update(dt, night, focus, others) {
    const d = this.pos.distanceTo(focus);
    this.group.visible = d < 700;
    if (d > 700) return;
    // Yield to anything ahead in our lane.
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    let clear = 1;
    const check = (ox, oz, r = 1) => {
      const dx = ox - this.x, dz = oz - this.z, ahead = dx * hx + dz * hz, side = dx * hz - dz * hx;
      if (ahead > 0.5 && ahead < 16 && Math.abs(side) < 2.4 + r) clear = Math.min(clear, Math.max(0, (ahead - 5) / 11));
    };
    check(focus.x, focus.z);
    for (const o of others) check(o.x, o.z);
    const endDist = this.dir > 0 ? this.total - this.s : this.s;
    const want = this.speed * clear * Math.min(1, 0.25 + endDist / 30) * Math.min(1, 0.3 + (this.dir > 0 ? this.s : this.total - this.s) / 25);
    const before = this.v;
    this.v += Math.max(-9 * dt, Math.min(3 * dt, want - this.v));
    this.braking = this.v < before - 0.02 && want < before - 0.2;
    this.s += this.v * this.dir * dt;
    if (this.s > this.total) { this.s = this.total; this.dir = -1; this.v = 0; }
    if (this.s < 0) { this.s = 0; this.dir = 1; this.v = 0; }
    const h = this._sample(this.s, this.dir);
    let dh = h - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 6);
    this.steer += (Math.max(-0.5, Math.min(0.5, -dh * 2.2)) - this.steer) * Math.min(1, dt * 8);
    // Ground contact.
    const W = this.world, hx2 = Math.sin(this.heading), hz2 = Math.cos(this.heading), wb = this.model.wb / 2, tk = this.model.track / 2;
    const g = (fx, fz) => W.groundAt(this.x + hx2 * fx + hz2 * fz, this.z + hz2 * fx - hx2 * fz);
    const fl = g(wb, tk), fr = g(wb, -tk), rl = g(-wb, tk), rr = g(-wb, -tk);
    this.pos.set(this.x, (fl + fr + rl + rr) / 4 + this.model.ground, this.z);
    const k = Math.min(1, dt * 8);
    this.tilt.x += (-Math.atan2((fl + fr) / 2 - (rl + rr) / 2, wb * 2) - this.tilt.x) * k;
    this.tilt.z += (Math.atan2((fl + rl) / 2 - (fr + rr) / 2, tk * 2) - this.tilt.z) * k;
    this.group.rotation.set(this.tilt.x, this.heading, this.tilt.z, 'YXZ');
    animateCarParts(this.model.parts, this.model.ground, dt, { vf: this.v, steer: this.steer, lit: night > 0.3, braking: this.braking, night });
  }
}

export class Traffic {
  constructor(scene, world) {
    this.flyers = [];
    this.cars = [];
    this.world = world;
    // Ambient road traffic on every road of the island.
    const types = ['sedan', 'pickup', 'jeep', 'gt', 'sedan', 'pickup', 'sedan'];
    world.structures.roads.forEach((road, i) => {
      if (road.pts.length < 2) return;
      if (this.cars.length >= 8) return;
      for (let k = 0; k < (i === 0 ? 2 : 1); k++) {
        const n = this.cars.length;
        this.cars.push(new RoadCar(scene, world, road, types[n % types.length], CAR_COLORS[(n * 3 + 1) % CAR_COLORS.length], 11 + (n % 4) * 2.5, (k * 0.5 + 0.13 * n) % 1));
      }
    });
    const g = (x, z) => world.groundAt(x, z);
    // Airliner: wide oval at cruise altitude with long contrails.
    const air = buildAirliner();
    air.group.scale.setScalar(1);
    this.flyers.push(new Flyer(scene, air, (s, o) => o.set(Math.cos(s * Math.PI * 2) * 3600, 1650 + Math.sin(s * Math.PI * 4) * 40, Math.sin(s * Math.PI * 2) * 2700), 125,
      { trails: [new THREE.Vector3(5.6, -2.2, -3), new THREE.Vector3(-5.6, -2.2, -3)], trailOpts: { length: 90, width: 1.4, color: 0xffffff, opacity: 0.55, minStep: 12 } }));
    // Two jets in loose formation over the island.
    const jetPath = (off) => (s, o) => {
      const a = s * Math.PI * 2;
      o.set(Math.sin(a) * 1500 + off, 620 + Math.sin(a * 3) * 120, Math.sin(a * 2) * 1100 + off * 0.5);
    };
    for (let i = 0; i < 2; i++) {
      const j = buildFighter({ color: i ? 0x6e7a70 : 0x7c868e });
      this.flyers.push(new Flyer(scene, j, jetPath(i * 40), 170, { phase: i * 0.004, trails: [new THREE.Vector3(5, 0, -2), new THREE.Vector3(-5, 0, -2)], trailOpts: { length: 40, width: 0.18, color: 0xffffff, opacity: 0.35, minStep: 6 } }));
    }
    // Coastal patrol helicopter.
    const heli = buildHelicopter({ color: 0x2a4a6a, trim: 0xe8e8e8 });
    this.flyers.push(new Flyer(scene, heli, (s, o) => {
      const a = s * Math.PI * 2;
      const r = 2250 + Math.sin(a * 5) * 150;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      o.set(x, Math.max(g(x, z), 0) + 140, z);
    }, 48, { heli: true }));
    // Skylark touring between the village and the farm.
    const prop = buildProp({ color: 0xf6f3e8, stripe: 0x2a6ab2 });
    const V = PLACES.village, F = PLACES.farm;
    this.flyers.push(new Flyer(scene, prop, (s, o) => {
      const a = s * Math.PI * 2;
      o.set((V.x + F.x) / 2 + Math.cos(a) * 700, 380 + Math.sin(a * 2) * 40, (V.z + F.z) / 2 + Math.sin(a) * 520);
    }, 52, { phase: 0.3 }));
  }

  update(dt, t, night, focus, vehicles = []) {
    for (const f of this.flyers) f.update(dt, t, night);
    if (!focus) return;
    // Parked vehicles and other traffic count as obstacles.
    const others = [];
    for (const v of vehicles) if (v.onGround && !v.destroyed && v.group.visible) others.push({ x: v.pos.x, z: v.pos.z, r: v.kind === 'car' ? 0.9 : v.radius * 0.4 });
    for (const c of this.cars) { c.update(dt, night, focus, others.concat(this.cars.filter((o) => o !== c).map((o) => ({ x: o.x, z: o.z })))); }
  }

  positions() { return this.flyers.map((f) => f.pos); }
}
