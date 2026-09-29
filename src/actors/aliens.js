// Visitors. Two saucers roam the island at night (hovering over the crop
// circles with tractor beams, lifting cows, darting away from aircraft) and
// park near the mothership by day. Grey aliens stand watch at the crash site
// and the stone ring and blink away if you get too close. Drone swarms
// appear for pilots flying armed jets.

import * as THREE from 'three';
import { buildSaucer, buildDrone } from '../vehicles/models.js';
import { Human } from './human.js';
import { PLACES } from '../world/terrain.js';
import { clamp, damp, dampAngle, TAU } from '../core/util.js';

const tv = new THREE.Vector3();

class AlienSaucer {
  constructor(world, idx) {
    this.world = world;
    const m = buildSaucer({ hull: idx ? 0x9aa4b0 : 0xc8ccd4, glow: idx ? 0xb07dff : 0x5dffc8, beamColor: idx ? 0xd0b0ff : 0x9dffd8 });
    this.model = m;
    this.group = m.group;
    this.group.scale.setScalar(1.25);
    this.pos = this.group.position;
    this.vel = new THREE.Vector3();
    this.state = 'high';
    this.timer = 5 + idx * 20;
    this.idx = idx;
    this.target = new THREE.Vector3();
    this.pos.set(250 + idx * 300, 2200, -380 + idx * 200);
    this.cow = null;
  }

  pickTarget() {
    const W = this.world;
    const P = PLACES;
    const spots = [
      [W.mysteries.cropCenter.x, W.mysteries.cropCenter.z, 70],
      [W.structures.pasture.x, W.structures.pasture.z, 45],
      [P.stones.x, P.stones.z, 60], [P.pyramid.x, P.pyramid.z, 150], [P.crash.x, P.crash.z, 80],
      [P.vortex.x, P.vortex.z, 60], [P.village.x, P.village.z, 160], [P.lighthouse.x, P.lighthouse.z, 90],
    ];
    const s = spots[Math.floor(Math.random() * spots.length)];
    const g = W.groundAt(s[0], s[1]);
    this.target.set(s[0] + (Math.random() - 0.5) * 30, Math.max(g, 0) + s[2], s[1] + (Math.random() - 0.5) * 30);
  }

  update(dt, t, ctx) {
    const P = this.model.parts;
    const night = ctx.night;
    this.timer -= dt;
    const player = ctx.player;
    const pd = player ? this.pos.distanceTo(player) : 1e9;
    // Flee from aircraft that get close; hover over walkers.
    if (this.state !== 'flee' && this.state !== 'high' && ctx.playerFlying && pd < 320) { this.state = 'flee'; this.timer = 40; ctx.onFlee?.(this); }
    let beam = false;
    switch (this.state) {
      case 'high': {
        this.target.set(ctx.mothership.x + Math.cos(t * 0.1 + this.idx * 3) * 260, ctx.mothership.y - 120, ctx.mothership.z + Math.sin(t * 0.1 + this.idx * 3) * 260);
        if (night > 0.6 && this.timer <= 0) { this.state = 'cruise'; this.pickTarget(); }
        break;
      }
      case 'cruise': {
        if (this.pos.distanceTo(this.target) < 12) { this.state = 'hover'; this.timer = 14 + Math.random() * 16; }
        if (night < 0.3) { this.state = 'high'; this.timer = 30; }
        break;
      }
      case 'hover': {
        beam = true;
        if (this.timer <= 0) { this.state = night > 0.3 ? 'cruise' : 'high'; this.pickTarget(); this.timer = 30; }
        break;
      }
      case 'flee': {
        this.target.set(this.pos.x + this.vel.x, 2400, this.pos.z + this.vel.z);
        if (this.timer <= 0 || this.pos.y > 2300) { this.state = 'high'; this.timer = 50; }
        break;
      }
      default: break;
    }
    const max = this.state === 'flee' ? 320 : this.state === 'high' ? 120 : 75;
    tv.subVectors(this.target, this.pos);
    const d = tv.length();
    const desired = tv.normalize().multiplyScalar(Math.min(max, d * 0.8));
    this.vel.lerp(desired, 1 - Math.exp(-(this.state === 'flee' ? 3 : 1.2) * dt));
    this.pos.addScaledVector(this.vel, dt);
    const g = this.world.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < Math.max(g, 0) + 25) this.pos.y = Math.max(g, 0) + 25;
    this.pos.y += Math.sin(t * 1.7 + this.idx) * 0.03;
    this.group.rotation.set(clamp(this.vel.z * 0.004, -0.3, 0.3), t * 0.6, clamp(-this.vel.x * 0.004, -0.3, 0.3));
    // Lights and beam.
    P.lights.forEach((m, i) => m.color.setHSL((this.idx ? 0.75 : 0.42) + 0.08 * Math.sin(i + t * 2), 1, 0.35 + 0.35 * (Math.sin(t * 7 - i * 0.8) * 0.5 + 0.5)));
    P.under.material.opacity = 0.5 + 0.4 * Math.sin(t * 4);
    P.halo.material.opacity = 0.25 + 0.35 * night;
    P.beam.visible = beam;
    if (beam) { P.beamMat.opacity = 0.4 + 0.1 * Math.sin(t * 9); P.beam.scale.y = (this.pos.y - Math.max(g, 0)) / 60 / 1.25; }
    this.beaming = beam;
  }
}

class Grey {
  constructor(world, home, idx) {
    this.world = world;
    this.home = home;
    this.h = new Human({}, { alien: true });
    this.root = this.h.root;
    this.idx = idx;
    this.hidden = 0;
    this._place();
  }
  _place() {
    const a = Math.random() * TAU, r = 6 + Math.random() * this.home.r;
    const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
    this.root.position.set(x, this.world.groundAt(x, z), z);
    this.root.rotation.y = Math.random() * TAU;
  }
  update(dt, t, ctx) {
    const H = this.h;
    if (this.hidden > 0) {
      this.hidden -= dt;
      this.root.visible = false;
      if (this.hidden <= 0) { this._place(); this.root.visible = true; ctx.fx.sparks.burst(tv.copy(this.root.position).setY(this.root.position.y + 1), { count: 30, speed: 10, color: 0x7dffd6, size: 1.6, life: 0.7, gravity: 0 }); }
      return;
    }
    const onlyNight = this.home.night;
    const visible = !onlyNight || ctx.night > 0.4;
    this.root.visible = visible;
    if (!visible) return;
    const p = ctx.player;
    const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 40) {
      this.root.rotation.y = dampAngle(this.root.rotation.y, Math.atan2(dx, dz), 3, dt);
      H.lookPitch = -0.2; H.lookLocked = true;
    }
    H.state = 'idle';
    H.speed = 0;
    H.gesture = d < 25 ? 'wave' : null;
    if (d < 13 && ctx.playerOnFoot) {
      // Blink away.
      ctx.fx.sparks.burst(tv.copy(this.root.position).setY(this.root.position.y + 1), { count: 50, speed: 14, color: 0x7dffd6, size: 1.8, life: 0.8, gravity: 0 });
      ctx.onTeleport?.(this);
      this.hidden = 3 + Math.random() * 4;
    }
    if (d < 250) H.animate(dt);
  }
}

export class Aliens {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.saucers = [new AlienSaucer(world, 0), new AlienSaucer(world, 1)];
    for (const s of this.saucers) scene.add(s.group);
    const C = PLACES.crash, S = PLACES.stones;
    this.greys = [new Grey(world, { x: C.x, z: C.z, r: 26 }, 0), new Grey(world, { x: C.x, z: C.z, r: 30 }, 1), new Grey(world, { x: S.x, z: S.z, r: 8, night: true }, 2)];
    for (const g of this.greys) scene.add(g.root);
    this.drones = [];
    this.swarmTimer = 25;
  }

  // Nearest visible saucer (for NPCs to point at).
  nearestSaucer(pos) {
    let best = null, bd = Infinity;
    for (const s of this.saucers) {
      if (s.state === 'high') continue;
      const d = s.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  spawnSwarm(center, forward) {
    const type = Math.floor(Math.random() * 3);
    const base = tv.copy(center).addScaledVector(forward, 700);
    base.y = Math.max(base.y, this.world.groundAt(base.x, base.z) + 120);
    for (let i = 0; i < 6; i++) {
      const d = buildDrone(type);
      const off = new THREE.Vector3((i % 3 - 1) * 40, Math.floor(i / 3) * 30, Math.floor(i / 3) * 30);
      d.group.position.copy(base).add(off);
      this.scene.add(d.group);
      this.drones.push({ ...d, hp: 2, phase: Math.random() * 10, center: base.clone(), off, vel: new THREE.Vector3(), life: 90 });
    }
  }

  update(dt, t, ctx) {
    for (const s of this.saucers) s.update(dt, t, ctx);
    for (const g of this.greys) g.update(dt, t, ctx);
    // Drone swarms for armed pilots, plus a permanent escort near the mothership.
    if (ctx.armed) {
      this.swarmTimer -= dt;
      if (this.swarmTimer <= 0 && this.drones.length < 12) {
        this.swarmTimer = 45 + Math.random() * 25;
        this.spawnSwarm(ctx.player, ctx.playerForward);
        ctx.onSwarm?.();
      }
    }
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i];
      d.phase += dt;
      d.life -= dt;
      // Drift the formation around its centre while weaving.
      d.center.x += Math.sin(d.phase * 0.3) * 30 * dt;
      d.center.z += Math.cos(d.phase * 0.25) * 30 * dt;
      const g = d.group;
      g.position.set(d.center.x + d.off.x + Math.sin(d.phase * 1.3) * 12, d.center.y + d.off.y + Math.cos(d.phase) * 6, d.center.z + d.off.z + Math.cos(d.phase * 1.1) * 12);
      g.rotation.y += dt * 0.8;
      if (d.orbit) d.orbit.rotation.z += dt * 2;
      if (d.life <= 0) { this.scene.remove(g); this.drones.splice(i, 1); }
    }
  }

  // Energy bolt hit test. Returns the destroyed drone or null.
  hitDrone(p, radius = 6) {
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      if (d.group.position.distanceTo(p) < radius) {
        d.hp--;
        if (d.hp <= 0) { this.scene.remove(d.group); this.drones.splice(i, 1); return { dead: true, pos: d.group.position.clone(), color: d.color }; }
        return { dead: false, pos: d.group.position.clone(), color: d.color };
      }
    }
    return null;
  }
}
