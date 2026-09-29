// Vehicle physics. Fixed-wing aircraft fly on an arcade flight model with
// throttle, stall, banked turns, takeoff rolls and landings; the helicopter
// hovers on a collective with rotor spin-up; the saucer floats on
// anti-gravity and can climb out of the atmosphere. All of them crash on
// hard contact with terrain, water, buildings or trees.

import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../core/util.js';
import { buildFighter, buildProp, buildHelicopter, buildSaucer, buildNova } from './models.js';

export const VEHICLE_DEFS = {
  jet: { name: 'F-7 Falcon', role: 'Air-superiority jet', kind: 'plane', maxSpeed: 280, stall: 58, takeoff: 70, thrust: 15, pitchRate: 1.15, rollRate: 2.6, yawRate: 0.45, turn: 0.8, boost: 1.35, weapons: true },
  prop: { name: 'C-2 Skylark', role: 'Light touring plane', kind: 'plane', maxSpeed: 74, stall: 21, takeoff: 27, thrust: 4.2, pitchRate: 0.85, rollRate: 1.6, yawRate: 0.55, turn: 0.6, boost: 1 },
  nova: { name: 'Nova X-1', role: 'Experimental prototype', kind: 'plane', maxSpeed: 330, stall: 42, takeoff: 52, thrust: 20, pitchRate: 1.5, rollRate: 3.4, yawRate: 0.7, turn: 1.05, boost: 1.45, weapons: true },
  heli: { name: 'H-60 Kite', role: 'Rescue helicopter', kind: 'heli', maxSpeed: 72, climb: 14 },
  ufo: { name: 'Visitor Craft', role: 'Anti-gravity saucer', kind: 'ufo', maxSpeed: 170, climb: 48, boost: 2.6 },
};

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const tq = new THREE.Quaternion();
const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
const e3 = new THREE.Euler(0, 0, 0, 'YXZ');

function buildFor(type) {
  switch (type) {
    case 'jet': return buildFighter();
    case 'prop': return buildProp();
    case 'heli': return buildHelicopter();
    case 'ufo': return buildSaucer();
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
  constructor(type, home) {
    this.id = 'v' + nextId++;
    this.type = type;
    this.def = VEHICLE_DEFS[type];
    this.kind = this.def.kind;
    const m = buildFor(type);
    this.model = m;
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
    if (this.destroyed) {
      this.respawn -= dt;
      if (this.respawn <= 0 && !this.occupied) this.reset();
      return null;
    }
    let result = null;
    if (this.kind === 'plane') result = this._plane(dt, ctl, world);
    else if (this.kind === 'heli') result = this._heli(dt, ctl, world);
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
    const pitchIn = clamp(ctl.pitch, -1, 1);
    tq.setFromAxisAngle(X, -pitchIn * d.pitchRate * auth * dt); this.quat.multiply(tq);
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
      P.beam.material.opacity = night > 0.3 && this.occupied ? 0.1 * night : 0;
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
    if (P.pilot) P.pilot.root.visible = this.occupied;
  }

  // Where a pilot steps out: beside the cockpit on the left.
  exitPoint(out = new THREE.Vector3()) {
    const side = tv.copy(X).applyQuaternion(this.quat);
    side.y = 0; side.normalize();
    return out.copy(this.pos).addScaledVector(side, this.radius * 0.7 + 1.5);
  }
}
