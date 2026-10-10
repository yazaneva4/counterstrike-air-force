// Vehicle physics. Fixed-wing aircraft fly on an arcade flight model with
// throttle, stall, banked turns, takeoff rolls and landings; the helicopter
// hovers on a collective with rotor spin-up; the saucer and the Odyssey
// spaceplane float on vertical thrust and can climb out of the atmosphere; the
// Aurora rocket flies on real thrust against gravity with fuel, staging,
// gimballed steering and propulsive landings on deployable legs. All of them
// crash on hard contact with terrain, water, buildings or trees.

import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';
import { buildFighter, buildProp, buildHelicopter, buildSaucer, buildNova } from './models.js';
import { buildRocket, buildShip, AURORA } from './spacecraft.js';
import { buildCar, CAR_NAMES, animateCarParts } from './cars.js';

export const VEHICLE_DEFS = {
  jet: { name: 'F-7 Falcon', role: 'Air-superiority jet', kind: 'plane', trim: 0.22, maxSpeed: 280, stall: 58, takeoff: 70, thrust: 15, pitchRate: 1.15, rollRate: 2.6, yawRate: 0.45, turn: 0.8, boost: 1.35, weapons: true },
  prop: { name: 'C-2 Skylark', role: 'Light touring plane', kind: 'plane', maxBank: 1.1, trim: 0.5, maxSpeed: 74, stall: 21, takeoff: 27, thrust: 4.2, pitchRate: 0.85, rollRate: 1.6, yawRate: 0.55, turn: 0.6, boost: 1 },
  nova: { name: 'Nova X-1', role: 'Experimental prototype', kind: 'plane', trim: 0.14, maxSpeed: 330, stall: 42, takeoff: 52, thrust: 20, pitchRate: 1.5, rollRate: 3.4, yawRate: 0.7, turn: 1.05, boost: 1.45, weapons: true },
  heli: { name: 'H-60 Kite', role: 'Rescue helicopter', kind: 'heli', maxSpeed: 72, climb: 14 },
  ufo: { name: 'Visitor Craft', role: 'Anti-gravity saucer', kind: 'ufo', maxSpeed: 170, climb: 48, boost: 2.6 },
  ship: { name: 'Odyssey', role: 'Spaceplane · vertical take-off to orbit', kind: 'ship', maxSpeed: 240, climb: 55, boost: 2.4 },
  rocket: { name: 'Aurora', role: 'Two-stage orbital rocket', kind: 'rocket', twr1: 1.75, twr2: 2.1, burn1: 26, burn2: 90 },
  // Road vehicles. Speeds in m/s, accel/brake in m/s², mu = tyre grip, off = grip factor off the tarmac.
  sedan: { name: CAR_NAMES.sedan, role: 'Family sedan', kind: 'car', maxSpeed: 52, accel: 6.2, brake: 12, steerMax: 0.58, mu: 1.15, off: 0.72 },
  gt: { name: CAR_NAMES.gt, role: 'Sports coupe', kind: 'car', maxSpeed: 78, accel: 10, brake: 15, steerMax: 0.5, mu: 1.4, off: 0.62 },
  pickup: { name: CAR_NAMES.pickup, role: 'Pickup truck', kind: 'car', maxSpeed: 44, accel: 5, brake: 11, steerMax: 0.55, mu: 1.05, off: 0.88 },
  jeep: { name: CAR_NAMES.jeep, role: 'Off-road 4x4', kind: 'car', maxSpeed: 38, accel: 5.6, brake: 11, steerMax: 0.62, mu: 1.1, off: 0.96 },
};

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const tq = new THREE.Quaternion();
const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
const e3 = new THREE.Euler(0, 0, 0, 'YXZ');

function buildFor(type, opts = {}) {
  switch (type) {
    case 'jet': return buildFighter();
    case 'prop': return buildProp();
    case 'heli': return buildHelicopter();
    case 'ufo': return buildSaucer();
    case 'ship': return buildShip();
    case 'rocket': return buildRocket();
    case 'sedan': case 'gt': case 'pickup': case 'jeep': return buildCar(type, { color: opts.color });
    case 'nova': {
      const n = buildNova();
      const gear = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.8, roughness: 0.3 });
      for (const [x, z] of [[0, 3.6], [1.4, -1], [-1.4, -1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 6), m); leg.position.set(x, -1.25, z);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(x, -1.9, z);
        gear.add(leg, wheel);
      }
      n.group.add(gear);
      return { group: n.group, parts: { engines: n.engines, gear, canopyMat: n.canopyMat }, ground: 2.2, radius: 7, length: 9, camDist: 20, camHeight: 5.5 };
    }
    default: throw new Error('unknown vehicle ' + type);
  }
}

let nextId = 1;

export class Vehicle {
  constructor(type, home, opts = {}) {
    this.id = 'v' + nextId++;
    this.type = type;
    this.def = VEHICLE_DEFS[type];
    this.kind = this.def.kind;
    this.color = opts.color;
    const m = buildFor(type, opts);
    this.model = m;
    this.wb = m.wb; this.track = m.track;
    this.parts = m.parts;
    this.ground = m.ground;
    this.radius = m.radius;
    this.camDist = m.camDist || 20;
    this.camHeight = m.camHeight || 5;
    this.group = new THREE.Group();
    this.group.add(m.group);
    this.group.name = 'vehicle-' + type;
    this.home = home;
    this.pos = this.group.position;
    this.quat = this.group.quaternion;
    this.vel = new THREE.Vector3();
    this.locked = false; // saucer starts locked until the crash site is discovered
    this.reset();
  }

  reset() {
    const h = this.home;
    this.pos.set(h.x, h.y + this.ground, h.z);
    this.heading = h.heading || 0;
    this.pitch = 0;
    this.quat.setFromEuler(e3.set(0, this.heading, 0));
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.throttle = 0;
    this.onGround = true;
    this.destroyed = false;
    this.respawn = 0;
    this.occupied = false;
    this.rpm = 0;
    this.gearDown = true;
    this.stick = { x: 0, y: 0 };
    this.tilt = { x: 0, z: 0 };
    this.boosting = false;
    this.beamActive = false;
    this.idleTime = 0;
    this.stalling = false;
    this.group.visible = true;
    if (this.kind === 'heli') this.lights = true;
    if (this.kind === 'rocket') this._rocketReset();
    if (this.kind === 'car') {
      this.steer = 0; this.vy = 0; this.airborne = false; this.gear = 1; this.lights = false; this.horn = false;
      this.skid = 0; this.bump = 0; this.susp = 0; this.suspV = 0; this.carVf = 0; this.braking = false; this.shift = 0;
      this.model.group.position.y = 0;
    }
  }

  get forward() { return tv.copy(Z).applyQuaternion(this.quat); }
  get altitude() { return this.pos.y; }

  bankAngle() {
    const l = tv2.copy(X).applyQuaternion(this.quat);
    return Math.asin(clamp(l.y, -1, 1));
  }

  pitchAngle() {
    const f = tv2.copy(Z).applyQuaternion(this.quat);
    return Math.asin(clamp(f.y, -1, 1));
  }

  headingAngle() {
    const f = tv2.copy(Z).applyQuaternion(this.quat);
    return Math.atan2(f.x, f.z);
  }

  // Returns 'crash' | null.
  update(dt, ctl, world) {
    if (this.booster) this.booster.update(dt, world);
    if (this.destroyed) {
      this.respawn -= dt;
      if (this.respawn <= 0 && !this.occupied) this.reset();
      return null;
    }
    let result = null;
    if (this.kind === 'plane') result = this._plane(dt, ctl, world);
    else if (this.kind === 'heli') result = this._heli(dt, ctl, world);
    else if (this.kind === 'rocket') result = this._rocket(dt, ctl, world);
    else if (this.kind === 'car') result = this._car(dt, ctl, world);
    else if (this.kind === 'ship') result = this._ship(dt, ctl, world);
    else result = this._ufo(dt, ctl, world);
    this._animate(dt, world);
    // Return abandoned vehicles to base after a while.
    if (!this.occupied && this.onGround) {
      this.idleTime += dt;
      if (this.idleTime > 240 && world.farFromPlayers(this.pos, 500)) this.reset();
    } else this.idleTime = 0;
    return result;
  }

  _crashCheck(world, speedMag) {
    const p = this.pos;
    const terrainH = world.terrain.heightAt(p.x, p.z);
    const plat = world.structures.platformAt(p.x, p.z);
    const g = Math.max(terrainH, plat);
    const bottom = p.y - this.ground;
    if (terrainH < -0.3 && plat === -Infinity && bottom < 0.2) return 'water';
    if (bottom < g - 0.4) return 'ground';
    // Buildings.
    tv.copy(p);
    if (world.structures.collide(tv, this.radius * 0.45, p.y)) return 'building';
    // Trees.
    let tree = false;
    if (bottom - g < 16) world.vegetation.near(p.x, p.z, (c) => {
      if (!tree && p.y < c.top && Math.hypot(p.x - c.x, p.z - c.z) < c.r + this.radius * 0.35) tree = true;
    });
    if (tree && speedMag > 6) return 'tree';
    return null;
  }

  crash() {
    this.destroyed = true;
    this.respawn = 14;
    this.group.visible = false;
    this.vel.set(0, 0, 0);
    this.speed = 0;
  }

  // ---- Fixed wing -------------------------------------------------------------

  _plane(dt, ctl, world) {
    const d = this.def;
    const p = this.pos;
    const occupied = !!ctl;
    ctl = ctl || { throttle: 0, pitch: 0, roll: 0, yaw: 0, boost: false };
    this.throttle = clamp(this.throttle + ctl.throttle * dt * 0.55, 0, 1);
    if (!occupied) this.throttle = Math.max(0, this.throttle - dt * 0.1);
    this.boosting = ctl.boost && this.throttle > 0.6 && d.boost > 1;
    // Thrust against quadratic drag: full throttle settles at maxSpeed.
    const f = tv.copy(Z).applyQuaternion(this.quat);
    const thrust = this.throttle * d.thrust * (this.boosting ? d.boost * d.boost : 1);
    const drag = (d.thrust / (d.maxSpeed * d.maxSpeed)) * this.speed * this.speed;
    this.speed += (thrust - drag) * dt;
    if (!this.onGround) this.speed -= f.y * 9.81 * dt * 0.85;
    this.speed = Math.max(0, this.speed);

    const ground = world.groundAt(p.x, p.z);
    if (this.onGround) {
      // Taxi, take-off roll.
      const steer = clamp(ctl.roll + ctl.yaw, -1, 1);
      const steerRate = lerp(0.9, 0.25, clamp(this.speed / d.takeoff, 0, 1));
      this.heading -= steer * steerRate * dt;
      if (ctl.throttle < 0 && this.throttle < 0.05) this.speed = Math.max(0, this.speed - 12 * dt);
      else this.speed = Math.max(0, this.speed - 0.6 * dt);
      const canRotate = this.speed > d.takeoff * 0.85;
      const wantPitch = canRotate ? clamp(ctl.pitch, 0, 1) * 0.26 : 0;
      this.pitch = damp(this.pitch, wantPitch, 3, dt);
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      p.x += hx * this.speed * dt;
      p.z += hz * this.speed * dt;
      const ng = world.groundAt(p.x, p.z);
      p.y = ng + this.ground;
      this.quat.setFromEuler(e3.set(-this.pitch, this.heading, 0));
      this.vel.set(hx * this.speed, 0, hz * this.speed);
      if (this.pitch > 0.12 && this.speed > d.takeoff) {
        this.onGround = false;
        p.y += 0.4;
      }
      // Off a cliff edge at speed: become airborne.
      if (ng < ground - 1.5 && this.speed > d.stall) this.onGround = false;
      tv2.copy(p);
      if (this.speed > 8 && world.structures.collide(tv2, this.radius * 0.45, p.y)) return 'building';
      if (world.terrain.heightAt(p.x, p.z) < -0.3 && world.structures.platformAt(p.x, p.z) === -Infinity) return this.speed > 4 ? 'water' : null;
      return null;
    }

    // Airborne.
    const auth = clamp((this.speed - d.stall * 0.35) / d.stall, 0.12, 1);
    let rollIn = clamp(ctl.roll, -1, 1);
    const bank = this.bankAngle();
    if (Math.abs(ctl.roll) < 0.05 && Math.abs(bank) < 1.35) rollIn = clamp(-bank * 1.2, -0.6, 0.6);
    // Touring planes stay upright: no roll input pushes the bank past the limit.
    if (d.maxBank && Math.abs(bank) > d.maxBank && rollIn * bank > 0) rollIn = 0;
    const pitchIn = clamp(ctl.pitch, -1, 1);
    tq.setFromAxisAngle(X, -pitchIn * d.pitchRate * auth * dt); this.quat.multiply(tq);
    // Auto-trim: with the stick centred the nose eases back toward level flight
    // (not while inverted or in a steep bank, so loops and rolls stay possible).
    if (Math.abs(pitchIn) < 0.05 && Math.abs(bank) < 0.9 && d.trim) {
      const pa = this.pitchAngle();
      if (Math.abs(pa) < 1.0) { tq.setFromAxisAngle(X, pa * d.trim * auth * dt); this.quat.multiply(tq); }
    }
    tq.setFromAxisAngle(Z, rollIn * d.rollRate * auth * dt); this.quat.multiply(tq);
    tq.setFromAxisAngle(Y, -ctl.yaw * d.yawRate * dt); this.quat.multiply(tq);
    // Banked flight turns the aircraft (coordinated turn).
    tq.setFromAxisAngle(Y, -Math.sin(bank) * d.turn * auth * dt); this.quat.premultiply(tq);
    // An abandoned aircraft slowly noses over and goes down.
    if (!occupied) { const fwd0 = tv2.copy(Z).applyQuaternion(this.quat); if (fwd0.y > -0.7) { tq.setFromAxisAngle(X, 0.18 * dt); this.quat.multiply(tq); } }
    // Stall: the nose falls and the aircraft sinks.
    const lift = clamp(this.speed / d.stall, 0, 1);
    this.stalling = lift < 0.85;
    if (lift < 1) {
      const fwd = tv2.copy(Z).applyQuaternion(this.quat);
      if (fwd.y > -0.6) { tq.setFromAxisAngle(X, (1 - lift) * 0.9 * dt); this.quat.multiply(tq); }
    }
    this.quat.normalize();
    const fw = tv.copy(Z).applyQuaternion(this.quat);
    this.vel.copy(fw).multiplyScalar(this.speed);
    this.vel.y -= (1 - lift) * 22;
    p.addScaledVector(this.vel, dt);
    if (p.y > 9000) p.y = 9000;

    // Gear retracts after climb-out, drops for approach.
    const agl = p.y - this.ground - world.groundAt(p.x, p.z);
    if (this.type !== 'prop') this.gearDown = agl < 60 && this.speed < d.takeoff * 2.2;

    // Touchdown?
    const g = world.groundAt(p.x, p.z);
    if (p.y - this.ground <= g + 0.05) {
      const n = world.terrain.normalAt(p.x, p.z);
      const onPlat = world.structures.platformAt(p.x, p.z) > -Infinity;
      const pitch = this.pitchAngle();
      const water = world.terrain.heightAt(p.x, p.z) < -0.3 && !onPlat;
      const ok = !water && this.gearDown && this.vel.y > -9 && Math.abs(this.bankAngle()) < 0.5 && pitch > -0.22 && pitch < 0.5 && this.speed < d.takeoff * 2.1 && (onPlat || n.y > 0.93);
      if (!ok) return water ? 'water' : 'ground';
      this.onGround = true;
      this.heading = this.headingAngle();
      this.pitch = Math.max(0, pitch);
      p.y = g + this.ground;
      this.landedAt = performance.now();
      return 'landed';
    }
    return this._crashCheck(world, this.speed);
  }

  // ---- Helicopter -------------------------------------------------------------

  _heli(dt, ctl, world) {
    const d = this.def;
    const p = this.pos;
    const occupied = !!ctl;
    this.rpm = clamp(this.rpm + (occupied ? dt * 0.45 : -dt * 0.2), 0, 1);
    ctl = ctl || { moveX: 0, moveY: 0, up: 0, down: 0, yaw: 0, boost: false };
    const power = smoothstep(0.75, 1, this.rpm);
    this.heading -= ctl.yaw * 1.5 * dt * (this.onGround ? 0.3 : 1) * power;
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const g = world.groundAt(p.x, p.z);
    const lift = (ctl.up - ctl.down);
    if (this.onGround) {
      this.vel.set(0, 0, 0);
      p.y = g + this.ground;
      if (lift > 0.1 && power > 0.95) { this.onGround = false; this.vel.y = 3; }
    } else {
      const boost = ctl.boost ? 1.45 : 1;
      const ax = (hx * ctl.moveY - hz * ctl.moveX * 0.8) * 20 * boost * power;
      const az = (hz * ctl.moveY + hx * ctl.moveX * 0.8) * 20 * boost * power;
      this.vel.x += ax * dt; this.vel.z += az * dt;
      const drag = Math.exp(-0.5 * dt);
      this.vel.x *= drag; this.vel.z *= drag;
      const hs = Math.hypot(this.vel.x, this.vel.z), max = d.maxSpeed * boost;
      if (hs > max) { this.vel.x *= max / hs; this.vel.z *= max / hs; }
      let vyT = power > 0.5 ? lift * d.climb - (1 - power) * 10 : -12;
      // Auto-flare: sink rate eases off close to the ground.
      const aglH = p.y - this.ground - g;
      if (power > 0.5) vyT = Math.max(vyT, -(aglH * 0.55 + 2.2));
      this.vel.y += (vyT - this.vel.y) * 2.2 * dt;
      if (p.y > 5200) this.vel.y = Math.min(this.vel.y, 0);
      p.addScaledVector(this.vel, dt);
      const ng = world.groundAt(p.x, p.z);
      if (p.y - this.ground <= ng) {
        const hard = this.vel.y < -11 || Math.hypot(this.vel.x, this.vel.z) > 26;
        const water = world.terrain.heightAt(p.x, p.z) < -0.3 && world.structures.platformAt(p.x, p.z) === -Infinity;
        if (hard || water) return water ? 'water' : 'ground';
        p.y = ng + this.ground;
        this.onGround = true;
        this.vel.set(0, 0, 0);
        return 'landed';
      }
      const c = this._crashCheck(world, this.vel.length());
      if (c) return c;
    }
    // Visual tilt into motion.
    const fwdV = this.vel.x * hx + this.vel.z * hz;
    const sideV = -this.vel.x * hz + this.vel.z * hx;
    this.tilt.x = damp(this.tilt.x, this.onGround ? 0 : clamp(ctl.moveY * 0.22 + fwdV * 0.002, -0.4, 0.4), 3, dt);
    this.tilt.z = damp(this.tilt.z, this.onGround ? 0 : clamp(ctl.moveX * 0.25 + sideV * 0.004, -0.45, 0.45), 3, dt);
    this.quat.setFromEuler(e3.set(this.tilt.x, this.heading, this.tilt.z));
    this.speed = this.vel.length();
    return null;
  }

  // ---- Saucer ----------------------------------------------------------------

  _ufo(dt, ctl, world) {
    const d = this.def;
    const p = this.pos;
    const occupied = !!ctl;
    ctl = ctl || { moveX: 0, moveY: 0, up: 0, down: 0, yaw: 0, boost: false, beam: false };
    this.rpm = clamp(this.rpm + (occupied ? dt : -dt * 0.3), 0, 1);
    this.heading -= ctl.yaw * 1.9 * dt;
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    const g = world.groundAt(p.x, p.z);
    const boost = ctl.boost ? d.boost : 1;
    this.boosting = ctl.boost;
    const lift = ctl.up - ctl.down;
    if (this.onGround) {
      p.y = g + this.ground;
      this.vel.set(0, 0, 0);
      if (lift > 0.1 && this.rpm > 0.5) { this.onGround = false; this.vel.y = 6; }
    } else {
      const ax = (hx * ctl.moveY - hz * ctl.moveX) * 60 * boost;
      const az = (hz * ctl.moveY + hx * ctl.moveX) * 60 * boost;
      this.vel.x += ax * dt; this.vel.z += az * dt;
      const drag = Math.exp(-1.1 * dt);
      this.vel.x *= drag; this.vel.z *= drag;
      const hs = Math.hypot(this.vel.x, this.vel.z), max = d.maxSpeed * boost;
      if (hs > max) { this.vel.x *= max / hs; this.vel.z *= max / hs; }
      const vyT = lift * d.climb * (ctl.boost ? 3 : 1);
      this.vel.y += (vyT - this.vel.y) * 3 * dt;
      p.addScaledVector(this.vel, dt);
      // Gentle anti-gravity hover bob.
      p.y += Math.sin(performance.now() * 0.0021) * 0.02;
      const ng = world.groundAt(p.x, p.z);
      if (p.y - this.ground <= ng) {
        p.y = ng + this.ground;
        if (lift <= 0 && Math.hypot(this.vel.x, this.vel.z) < 30) { this.onGround = true; this.vel.set(0, 0, 0); }
        else this.vel.y = Math.max(this.vel.y, 0);
      }
      // Saucers skim over the ocean instead of sinking.
      if (p.y < 1.5) { p.y = 1.5; this.vel.y = Math.max(0, this.vel.y); }
      tv.copy(p);
      if (world.structures.collide(tv, this.radius * 0.6, p.y)) { p.x = tv.x; p.z = tv.z; }
    }
    this.beamActive = !!ctl.beam && !this.onGround;
    const fwdV = this.vel.x * hx + this.vel.z * hz, sideV = -this.vel.x * hz + this.vel.z * hx;
    this.tilt.x = damp(this.tilt.x, clamp(fwdV * 0.0022, -0.35, 0.35), 3, dt);
    this.tilt.z = damp(this.tilt.z, clamp(sideV * 0.003, -0.35, 0.35), 3, dt);
    this.quat.setFromEuler(e3.set(this.tilt.x, this.heading, this.tilt.z));
    this.speed = this.vel.length();
    return null;
  }

  // ---- Spaceplane ---------------------------------------------------------------

  _ship(dt, ctl, world) {
    const r = this._ufo(dt, ctl, world);
    const agl = this.pos.y - this.ground - world.groundAt(this.pos.x, this.pos.z);
    this.gearDown = this.onGround || agl < 35;
    this.lift = this.onGround ? 0 : clamp(1 - this.speed / 160, 0.25, 1) * this.rpm;
    this.mainThrust = this.onGround ? 0 : clamp(this.speed / 120, 0, 1) * (this.boosting ? 1 : 0.6);
    return r;
  }

  // ---- Rocket ------------------------------------------------------------------

  _rocketReset() {
    const P = this.parts;
    if (this.booster) { this.booster.dispose(); this.booster = null; }
    if (P.stage1.parent !== P.model) P.model.add(P.stage1);
    P.stage1.position.set(0, 0, 0); P.stage1.quaternion.identity();
    P.model.position.set(0, 0, 0);
    for (const l of P.legs1) l.rotation.x = 0;
    for (const l of P.legs2) l.rotation.x = 0;
    for (const f of P.fins) f.rotation.x = 0;
    this.stage = 2;
    this.fuel1 = this.def.burn1;
    this.fuel2 = this.def.burn2;
    this.legsOut = false;
    this.launched = false;
    this.countdown = 0;
    this.autoThrottle = false;
    this.rcsAmt = 0;
    this.thrustAcc = 0;
    this.ground = 0;
    this.pos.y = this.home.y;
  }

  // Detach the booster (it flies itself back to the landing zone) and carry
  // on with the upper stage, whose origin becomes the base of its nozzle.
  _separate() {
    const P = this.parts;
    const scene = this.group.parent;
    this.group.updateMatrixWorld(true);
    if (scene) {
      scene.attach(P.stage1);
      this.booster = new BoosterReturn(P, this.vel.clone(), this.home.lz);
    } else P.model.remove(P.stage1);
    const up = tv.copy(Y).applyQuaternion(this.quat);
    this.pos.addScaledVector(up, AURORA.UPPER_BASE);
    P.model.position.y = -AURORA.UPPER_BASE;
    this.vel.addScaledVector(up, 3);
    this.stage = 1;
    this.legsOut = false;
    this.events = (this.events || []).concat('staged');
  }

  // Prepare for a fresh descent (after re-entry or arriving above a moon):
  // upper stage only, full tanks, nose up.
  prepareDescent(heading = 0) {
    if (this.stage === 2) { const P = this.parts; P.model.remove(P.stage1); P.model.position.y = -AURORA.UPPER_BASE; this.stage = 1; }
    if (this.booster) this.booster.finish();
    this.fuel2 = this.def.burn2;
    this.legsOut = false;
    this.launched = true;
    this.throttle = 0;
    this.onGround = false;
    this.quat.setFromEuler(e3.set(0, heading, 0));
  }

  _rocket(dt, ctl, world) {
    const d = this.def, p = this.pos;
    const occupied = !!ctl;
    ctl = ctl || { throttle: 0, pitch: 0, yaw: 0, roll: 0, stage: false, legs: false, launch: false, level: false, full: false };
    const gE = 9.81, g = gE * (world.gravity ?? 1);
    // Launch sequence: a 3-second countdown, then throttle runs up to 100 %.
    if (ctl.launch && this.onGround && this.countdown <= 0 && this.throttle < 0.05 && !this.launched) { this.countdown = 3; this.events = (this.events || []).concat('countdown'); }
    if (this.countdown > 0) { this.countdown -= dt; if (this.countdown <= 0) { this.countdown = 0; this.autoThrottle = true; this.events = (this.events || []).concat('ignition'); } }
    if (this.autoThrottle) { this.throttle = Math.min(1, this.throttle + dt * 0.9); if (this.throttle >= 1 || ctl.throttle < 0) this.autoThrottle = false; }
    this.throttle = clamp(this.throttle + ctl.throttle * dt * 0.6 + (ctl.full ? dt * 2 : 0), 0, 1);
    if (!occupied) this.throttle = Math.max(0, this.throttle - dt * 0.5);
    // Fuel and thrust.
    const key = this.stage === 2 ? 'fuel1' : 'fuel2';
    this[key] = Math.max(0, this[key] - this.throttle * dt);
    const twr = this.stage === 2 ? d.twr1 : d.twr2;
    const acc = this[key] > 0 ? this.throttle * twr * gE : 0;
    this.thrustAcc = acc;
    // Staging: on command, when the booster runs dry, or before leaving the atmosphere.
    if (this.stage === 2 && !this.onGround && this.launched && (ctl.stage || this.fuel1 <= 0 || p.y > 2900)) this._separate();
    if (ctl.legs) this.legsOut = !this.legsOut;
    // Attitude: gimbal + RCS. Heavier full stack turns slowly.
    const up = tv2.copy(Y).applyQuaternion(this.quat);
    if (!this.onGround) {
      const rate = this.stage === 2 ? 0.32 : 0.75;
      tq.setFromAxisAngle(X, ctl.pitch * rate * dt); this.quat.multiply(tq);
      tq.setFromAxisAngle(Z, -ctl.yaw * rate * dt); this.quat.multiply(tq);
      tq.setFromAxisAngle(Y, -ctl.roll * 0.9 * dt); this.quat.multiply(tq);
      if (ctl.level) {
        const f = tv.copy(Z).applyQuaternion(this.quat);
        const target = new THREE.Quaternion().setFromEuler(e3.set(0, Math.atan2(f.x, f.z), 0));
        this.quat.slerp(target, 1 - Math.exp(-1.6 * dt));
      }
      this.quat.normalize();
      up.copy(Y).applyQuaternion(this.quat);
    }
    this.rcsAmt = damp(this.rcsAmt, Math.min(1, Math.abs(ctl.pitch) + Math.abs(ctl.yaw) + Math.abs(ctl.roll) + (ctl.level ? 0.5 : 0)), 8, dt);
    const groundH = world.groundAt(p.x, p.z);
    this.ground = this.legsOut ? (this.stage === 2 ? AURORA.FOOT1 : AURORA.FOOT2) : 0;
    if (this.onGround) {
      this.vel.set(0, 0, 0);
      p.y = groundH + this.ground;
      if (acc > g * 1.02) { this.onGround = false; this.launched = true; this.events = (this.events || []).concat('liftoff'); }
      this.speed = 0;
      return null;
    }
    // Thrust, gravity, and drag in an atmosphere that thins with height.
    this.vel.addScaledVector(up, acc * dt);
    this.vel.y -= g * dt;
    const rho = (world.air ?? 1) * Math.exp(-Math.max(0, p.y) / 2600);
    const sp = this.vel.length();
    this.vel.multiplyScalar(1 / (1 + 0.00022 * rho * sp * dt));
    p.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();
    // Legs deploy by themselves on a descent close to the ground.
    const agl = p.y - groundH;
    if (!this.legsOut && this.launched && this.vel.y < -2 && agl < 320) this.legsOut = true;
    this.ground = this.legsOut ? (this.stage === 2 ? AURORA.FOOT1 : AURORA.FOOT2) : 0;
    // Touchdown.
    if (p.y - this.ground <= groundH) {
      const tilt = Math.acos(clamp(up.y, -1, 1));
      const vs = -this.vel.y, hs = Math.hypot(this.vel.x, this.vel.z);
      const water = world.terrain.heightAt(p.x, p.z) < -0.3 && world.structures.platformAt(p.x, p.z) === -Infinity;
      const ok = !water && vs < 8 && hs < 6 && tilt < 0.32 && (this.legsOut || vs < 2.5);
      if (!ok) return water ? 'water' : 'ground';
      const f = tv.copy(Z).applyQuaternion(this.quat);
      this.quat.setFromEuler(e3.set(0, Math.atan2(f.x, f.z), 0));
      p.y = groundH + this.ground;
      this.vel.set(0, 0, 0);
      this.onGround = true;
      this.throttle = 0;
      this.autoThrottle = false;
      return 'landed';
    }
    tv.copy(p);
    if (world.structures.collide(tv, 2, p.y + 4)) return 'building';
    return null;
  }

  // ---- Cars ----------------------------------------------------------------------
  // A bicycle-model car: engine force with a torque fall-off and six gears,
  // braking, aerodynamic and rolling drag, tyre grip that caps lateral
  // acceleration (so fast corners slide and the handbrake drifts), road versus
  // off-road grip, slopes, load transfer, a spring-damper body, air time over
  // crests, and bumps against buildings, trees and other vehicles.

  _car(dt, ctl, world) {
    const d = this.def, p = this.pos, G = 9.81 * (world.gravity ?? 1);
    const occupied = !!ctl;
    ctl = ctl || { steer: 0, throttle: 0, handbrake: true, boost: false, horn: false };
    const hb = !!ctl.handbrake;
    const thr = clamp(ctl.throttle, -1, 1);
    const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    let vf = this.vel.x * hx + this.vel.z * hz, vl = this.vel.x * hz - this.vel.z * hx;
    const onRoad = world.structures.roadAt ? world.structures.roadAt(p.x, p.z) : true;
    const surf = onRoad ? 1 : d.off;
    const grounded = !this.airborne;
    const maxV = d.maxSpeed * (ctl.boost ? 1.12 : 1);

    // Longitudinal forces.
    let a = 0, brakingOnly = false;
    if (grounded) {
      if (thr > 0.02) {
        if (vf < -0.8) { a = d.brake * thr; brakingOnly = true; }
        else a = d.accel * thr * (ctl.boost ? 1.3 : 1) * surf * Math.max(0, 1 - Math.pow(Math.max(vf, 0) / maxV, 2.2));
      } else if (thr < -0.02) {
        if (vf > 0.8) { a = d.brake * thr; brakingOnly = true; }
        else a = d.accel * 0.55 * thr * surf * Math.max(0, 1 - Math.pow(Math.max(-vf, 0) / (maxV * 0.25), 2));
      }
      const drag = (0.45 + 0.0011 * vf * vf) * (onRoad ? 1 : 2.4);
      a -= Math.sign(vf) * drag;
      if (hb) { a -= Math.sign(vf) * 8.5 * surf; brakingOnly = true; }
    }
    const before = vf;
    vf += a * dt;
    if ((brakingOnly || thr === 0 || (thr > 0 && before < 0) || (thr < 0 && before > 0)) && Math.sign(vf) !== Math.sign(before) && Math.abs(before) > 0) vf = 0;
    if (Math.abs(vf) < 0.25 && Math.abs(thr) < 0.02) vf = 0;
    vf = clamp(vf, -maxV * 0.28, maxV);

    // Slopes.
    const n = world.terrain.normalAt(p.x, p.z);
    const slope = Math.hypot(n.x, n.z);
    const parked = (!occupied || hb || Math.abs(thr) < 0.02) && Math.hypot(vf, vl) < 0.7 && slope < 0.32;
    if (parked) { vf = 0; vl = 0; } else if (grounded) { vf += G * (n.x * hx + n.z * hz) * dt; vl += G * (n.x * hz - n.z * hx) * dt; }

    // Tyre grip caps how much sideways speed can be removed each step.
    if (grounded) {
      const mu = d.mu * surf * (hb ? 0.34 : 1) * (this.stallFromWater ? 0.5 : 1);
      const cap = mu * G * dt;
      vl = Math.abs(vl) <= cap ? 0 : vl - Math.sign(vl) * cap;
    }
    this.skid = grounded ? clamp((Math.abs(vl) - 1) / 4, 0, 1) * (Math.abs(vf) > 3 ? 1 : 0) : 0;

    // Steering (Ackermann bicycle model), softer at speed.
    const steerMax = d.steerMax / (1 + Math.pow(Math.abs(vf) / 15, 1.3));
    const target = clamp(ctl.steer, -1, 1) * steerMax;
    this.steer += (target - this.steer) * (1 - Math.exp(-(Math.abs(target) > Math.abs(this.steer) ? 7 : 11) * dt));
    // Tyres cannot turn the car faster than grip allows (understeer instead of spinning);
    // the handbrake unloads the rear axle so the tail can swing round.
    const gripYaw = (d.mu * surf * G * (hb ? 1.7 : 1.05)) / Math.max(Math.abs(vf), 4);
    const yawRate = grounded ? clamp(vf * Math.tan(this.steer) / this.wb * (hb && Math.abs(vf) > 6 ? 1.4 : 1), -Math.min(2.4, gripYaw), Math.min(2.4, gripYaw)) : 0;

    // Rebuild the velocity from the heading it had, then turn the car.
    this.vel.x = hx * vf + hz * vl;
    this.vel.z = hz * vf - hx * vl;
    this.heading -= yawRate * dt;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt;
    const lim = world.limit ?? 2650;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);

    // Collisions: buildings, tree trunks and other vehicles.
    let bump = 0;
    const push = (dx, dz) => {
      p.x += dx; p.z += dz;
      const l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) { bump = Math.max(bump, -vn); this.vel.x -= vn * nx * 1.35; this.vel.z -= vn * nz * 1.35; }
    };
    for (const off of [1.35, -1.35]) {
      tv.set(p.x + hx * off, p.y, p.z + hz * off);
      const ox = tv.x, oz = tv.z;
      if (world.structures.collide(tv, 1.0, p.y + 0.4)) push(tv.x - ox, tv.z - oz);
    }
    world.vegetation.near(p.x, p.z, (c) => {
      if (p.y - this.ground > c.top) return;
      const dx = p.x - c.x, dz = p.z - c.z, dist = Math.hypot(dx, dz), r = c.r * 0.5 + 1.05;
      if (dist < r && dist > 1e-4) push(dx / dist * (r - dist), dz / dist * (r - dist));
    });
    if (world.others) for (const o of world.others(this)) {
      const dx = p.x - o.x, dz = p.z - o.z, dist = Math.hypot(dx, dz), r = o.r + 1.7;
      if (dist < r && dist > 1e-4) push(dx / dist * (r - dist) * 0.6, dz / dist * (r - dist) * 0.6);
    }
    // Recompute forward speed after the push (used by everything below).
    const hx2 = Math.sin(this.heading), hz2 = Math.cos(this.heading);
    this.carVf = this.vel.x * hx2 + this.vel.z * hz2;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // Ground contact at the four wheels.
    const wbH = this.wb / 2, tk = this.track / 2;
    const gAt = (fx, fz) => world.groundAt(p.x + hx2 * fx + hz2 * fz, p.z + hz2 * fx - hx2 * fz);
    const fl = gAt(wbH, tk), fr = gAt(wbH, -tk), rl = gAt(-wbH, tk), rr = gAt(-wbH, -tk);
    const gC = (fl + fr + rl + rr) / 4;
    const th = world.terrain.heightAt(p.x, p.z);
    if (!this.airborne && th < -1.0 && world.structures.platformAt(p.x, p.z) === -Infinity) return 'water';
    const targetY = gC + this.ground;
    const yff = p.y + this.vy * dt - 0.5 * G * dt * dt;
    if (yff > targetY + 0.12) {
      p.y = yff; this.vy -= G * dt; this.airborne = true;
    } else {
      if (this.airborne) {
        const impact = -this.vy;
        if (impact > 3) { this.suspV -= impact * 0.5; if (impact > 9) bump = Math.max(bump, impact * 0.5); }
        this.airborne = false;
      }
      this.vy = clamp((targetY - p.y) / dt, -25, 25);
      p.y = targetY;
    }
    // Body attitude: terrain, plus squat/dive and body roll from load transfer.
    const aLat = this.carVf * yawRate;
    const pitchT = -Math.atan2((fl + fr) / 2 - (rl + rr) / 2, this.wb) - a * 0.005;
    const rollT = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, this.track * 2) - aLat * 0.008;
    const k = 1 - Math.exp(-9 * dt);
    this.tilt.x += (pitchT - this.tilt.x) * k;
    this.tilt.z += (rollT - this.tilt.z) * k;
    if (this.airborne) { this.tilt.x += (-clamp(this.vy * 0.02, -0.25, 0.25) - this.tilt.x) * 0.02; }
    this.quat.setFromEuler(e3.set(this.tilt.x, this.heading, this.tilt.z));
    // Suspension spring: settles after bumps and landings.
    this.suspV += (-70 * this.susp - 8 * this.suspV) * dt;
    this.susp += this.suspV * dt;
    this.model.group.position.y = clamp(this.susp, -0.14, 0.14);

    // Engine: gear from speed, rpm from position in the gear, a dip at each shift.
    const sp = Math.abs(this.carVf) / d.maxSpeed;
    const tops = [0.14, 0.27, 0.42, 0.58, 0.78, 1.02];
    let gi = 0; while (gi < 5 && sp > tops[gi]) gi++;
    const lo = gi ? tops[gi - 1] : 0;
    const gear = this.carVf < -0.6 ? 0 : gi + 1;
    if (gear !== this.gear && gear > 0 && this.gear > 0) this.shift = 0.22;
    this.gear = gear;
    this.shift = Math.max(0, this.shift - dt);
    let want = 0.18 + 0.82 * clamp((sp - lo) / (tops[gi] - lo), 0, 1);
    if (gear === 0) want = 0.2 + Math.min(0.5, Math.abs(this.carVf) / 6);
    want += Math.max(0, thr) * 0.05 - (this.shift > 0 ? 0.22 : 0);
    this.rpm = damp(this.rpm, clamp(want, 0.15, 1), 12, dt);
    this.throttle = Math.max(0, thr);
    this.braking = brakingOnly && Math.abs(before) > 0.5;
    this.horn = occupied && !!ctl.horn;
    this.boosting = occupied && !!ctl.boost && thr > 0.1;
    this.bump = bump;
    this.onGround = !this.airborne;
    return bump > 3.5 ? 'bump' : null;
  }

  // ---- Visuals ---------------------------------------------------------------

  _animate(dt, world) {
    const P = this.parts;
    const t = performance.now() / 1000;
    const night = world.night;
    if (P.nav) {
      const on = this.occupied || !this.onGround;
      P.nav.red.material.opacity = on ? 1 : 0.25;
      P.nav.green.material.opacity = on ? 1 : 0.25;
      P.nav.strobe.material.opacity = on && (t % 1.2) < 0.08 ? 1 : 0;
    }
    if (P.gear) P.gear.visible = this.gearDown || this.onGround;
    if (P.flame) {
      const th = this.throttle * (this.boosting ? 1.6 : 1);
      const flick = 0.85 + Math.random() * 0.15;
      P.flame.scale.set(0.6 + th * 0.5, 0.6 + th * 0.5, 0.15 + th * 1.1 * flick);
      P.flame.material.opacity = (this.boosting ? 0.9 : 0.25 + th * 0.35) * flick;
      P.flameCore.scale.set(0.8, 0.8, 0.2 + th * 0.8 * flick);
      P.flameCore.material.opacity = 0.3 + th * 0.5;
      P.nozzleGlow.material.opacity = 0.25 + th * 0.7;
    }
    if (P.engines) {
      const th = this.throttle * (this.boosting ? 1.5 : 1);
      for (const e of P.engines) {
        const flick = 0.85 + Math.random() * 0.15;
        e.disc.scale.setScalar(0.85 + th * 0.5 * flick);
        e.core.scale.setScalar(0.7 + th * 0.7 * flick);
        e.plume.scale.set(1, 1, 0.5 + th * 1.3 * flick);
        e.plume.material.opacity = 0.2 + th * 0.55 * flick;
      }
    }
    if (P.prop) {
      const spin = this.throttle * 60 + (this.occupied ? 8 : 0);
      P.prop.rotation.z += spin * dt;
      P.disc.material.opacity = clamp(spin / 60, 0, 0.35);
    }
    if (P.rotor) {
      P.rotor.rotation.y += this.rpm * 28 * dt;
      P.tailRotor.rotation.x += this.rpm * 60 * dt;
      P.rDisc.material.opacity = this.rpm * 0.28;
      P.beam.material.opacity = night > 0.3 && this.occupied && this.lights ? 0.1 * night : 0;
    }
    if (P.lights) {
      const on = this.occupied || !this.onGround ? 1 : 0.35;
      P.lights.forEach((m, i) => {
        const k = (Math.sin(t * 6 - i * 0.7) * 0.5 + 0.5);
        m.color.setHSL(0.42 + 0.12 * Math.sin(i + t), 1, 0.35 + 0.35 * k * on);
      });
      P.under.material.opacity = (0.4 + 0.4 * Math.sin(t * 3)) * (0.4 + this.rpm * 0.6);
      P.halo.material.opacity = 0.2 + this.rpm * 0.25;
      P.beam.visible = this.beamActive;
      if (this.beamActive) { P.beamMat.opacity = 0.45 + Math.sin(t * 8) * 0.08; P.beam.rotation.y += dt; }
    }
    if (this.kind === 'rocket') this._animRocket(dt, t);
    if (this.kind === 'ship') {
      for (const m of [P.plumeMat, P.liftMat]) m.uniforms.uTime.value = t;
      P.liftMat.uniforms.uThrottle.value = damp(P.liftMat.uniforms.uThrottle.value, this.lift || 0, 6, dt);
      P.plumeMat.uniforms.uThrottle.value = damp(P.plumeMat.uniforms.uThrottle.value, this.mainThrust || 0, 6, dt);
      for (const e of P.mains) e.glow.material.opacity = P.plumeMat.uniforms.uThrottle.value;
      for (const l of P.lifts) l.glow.material.opacity = P.liftMat.uniforms.uThrottle.value * 0.9;
    }
    if (this.kind === 'car') this._animCar(dt, world);
    if (P.pilot) P.pilot.root.visible = this.occupied;
  }

  _animCar(dt, world) {
    animateCarParts(this.parts, this.ground, dt, { vf: this.carVf, steer: this.steer, lit: this.occupied ? this.lights : !!this.aiLights, braking: this.braking, night: world.night || 0 });
  }

  _animRocket(dt, t) {
    const P = this.parts;
    const th = this.thrustAcc > 0 ? this.throttle : 0;
    const flick = 0.9 + Math.random() * 0.1;
    P.plume1Mat.uniforms.uTime.value = t;
    P.plume2Mat.uniforms.uTime.value = t;
    if (this.stage === 2) {
      P.plume1Mat.uniforms.uThrottle.value = th * flick;
      P.glow1.material.opacity = th * 0.9;
      // The plume widens as the air thins.
      const spread = 1 + clamp(this.pos.y / 2500, 0, 1.2);
      for (const m of P.plume1) m.scale.set(spread, 1 + th * 0.2, spread);
    }
    P.plume2Mat.uniforms.uThrottle.value = this.stage === 1 ? th * flick : 0;
    P.glow2.material.opacity = this.stage === 1 ? th * 0.9 : 0;
    const legs = this.stage === 2 ? P.legs1 : P.legs2, angle = this.stage === 2 ? AURORA.LEG1 : AURORA.LEG2;
    for (const l of legs) l.rotation.x = damp(l.rotation.x, this.legsOut ? angle : 0, 3, dt);
    for (const r of P.rcs) r.material.opacity = this.rcsAmt * (0.4 + Math.random() * 0.6) * 0.8;
    P.strobe.material.opacity = (this.occupied || !this.onGround) && (t % 1.4) < 0.08 ? 1 : 0;
  }

  // Where a pilot steps out: beside the cockpit on the left.
  exitPoint(out = new THREE.Vector3()) {
    const side = tv.copy(X).applyQuaternion(this.quat);
    side.y = 0; side.normalize();
    return out.copy(this.pos).addScaledVector(side, this.radius * 0.7 + 1.5);
  }
}

// The spent first stage flips, boosts back and lands itself on the landing
// zone on its own legs (a scripted guidance loop, not player controlled).
class BoosterReturn {
  constructor(parts, vel, lz) {
    this.P = parts;
    this.group = parts.stage1;
    this.vel = vel;
    this.lz = lz ? new THREE.Vector3(lz.x, lz.y, lz.z) : null;
    this.phase = 'coast';
    this.t = 0;
    this.thr = 0;
    this.landed = false;
  }

  update(dt, world) {
    if (this.landed || !this.group.parent) return;
    const g = 9.81 * (world.gravity ?? 1), p = this.group.position, q = this.group.quaternion;
    this.t += dt;
    const lz = this.lz || new THREE.Vector3(p.x, world.groundAt(p.x, p.z), p.z);
    const toLz = tv.set(lz.x - p.x, 0, lz.z - p.z);
    const agl = p.y - AURORA.FOOT1 - lz.y;
    let thrust = 0;
    // Guidance: aim horizontal velocity at the pad, then a suicide burn.
    if (this.phase === 'coast' && this.t > 2.5) this.phase = 'boostback';
    if (this.phase === 'boostback') {
      const want = toLz.clone().multiplyScalar(0.06).clampLength(0, 90);
      const dv = want.sub(tv2.set(this.vel.x, 0, this.vel.z));
      if (dv.length() > 4) { thrust = 22; this.vel.addScaledVector(dv.normalize(), thrust * dt); } else this.phase = 'fall';
    }
    if (this.phase === 'fall') {
      const stop = (this.vel.y * this.vel.y) / (2 * (2.6 * 9.81 - g));
      if (this.vel.y < 0 && agl < stop + 30) this.phase = 'landing';
      // Steer gently towards the pad during the fall.
      this.vel.x += (toLz.x * 0.02 - this.vel.x) * dt * 0.3;
      this.vel.z += (toLz.z * 0.02 - this.vel.z) * dt * 0.3;
    }
    if (this.phase === 'landing') {
      const wantVy = -Math.max(2.5, Math.sqrt(Math.max(0, 2 * (2.2 * 9.81 - g) * agl)));
      const ay = clamp((wantVy - this.vel.y) * 3 + g, 0, 2.8 * 9.81);
      this.vel.y += (ay - g) * dt + g * dt;
      thrust = ay;
      this.vel.x += (toLz.x * 0.5 - this.vel.x) * dt * 1.5;
      this.vel.z += (toLz.z * 0.5 - this.vel.z) * dt * 1.5;
      for (const l of this.P.legs1) l.rotation.x = damp(l.rotation.x, agl < 500 ? AURORA.LEG1 : 0, 2.5, dt);
    }
    this.vel.y -= g * dt;
    p.addScaledVector(this.vel, dt);
    // Orientation: engines into the direction of travel (retrograde), upright when landing.
    const up = this.phase === 'landing' ? new THREE.Vector3(0, 1, 0).lerp(tv.copy(this.vel).multiplyScalar(-1).normalize(), 0.3).normalize() : tv.copy(this.vel).multiplyScalar(-1).normalize();
    const target = new THREE.Quaternion().setFromUnitVectors(Y, up);
    q.slerp(target, 1 - Math.exp(-1.2 * dt));
    for (const f of this.P.fins) f.rotation.x = damp(f.rotation.x, Math.PI / 2, 2, dt);
    this.thr = damp(this.thr, thrust > 0 ? clamp(thrust / 25, 0.4, 1) : 0, 10, dt);
    this.P.plume1Mat.uniforms.uThrottle.value = this.thr * (0.9 + Math.random() * 0.1);
    this.P.glow1.material.opacity = this.thr * 0.9;
    if (agl <= 0.05) {
      if (Math.abs(this.vel.y) > 12 || world.terrain.heightAt(p.x, p.z) < -0.3) { this.dispose(); this.crashed = true; return; }
      this.finish(world);
    }
  }

  // Snap to a clean landing on the pad (used when the player leaves Earth).
  finish() {
    if (!this.group.parent) return;
    const p = this.group.position;
    if (this.lz) p.set(this.lz.x, this.lz.y + AURORA.FOOT1, this.lz.z);
    this.group.quaternion.identity();
    for (const l of this.P.legs1) l.rotation.x = AURORA.LEG1;
    for (const f of this.P.fins) f.rotation.x = Math.PI / 2;
    this.P.plume1Mat.uniforms.uThrottle.value = 0;
    this.P.glow1.material.opacity = 0;
    this.vel.set(0, 0, 0);
    this.landed = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.P.plume1Mat.uniforms.uThrottle.value = 0;
  }
}
