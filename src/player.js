// The player: a person who walks, sprints, jumps and swims around the island,
// talks to people, climbs into any aircraft, bails out under a parachute, and
// respawns at the airbase after a crash. Also owns the cameras (orbit on
// foot, chase or cockpit in vehicles).

import * as THREE from 'three';
import { Human, outfitFor } from './actors/human.js';
import { mulberry32 } from './core/noise.js';
import { clamp, damp, dampAngle, lerp, smoothstep } from './core/util.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tq = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export const CHARACTERS = [
  { id: 'pilot', label: 'Pilot', role: 'pilot', extra: { hat: 'helmet' } },
  { id: 'explorer', label: 'Explorer', role: 'hiker', extra: {} },
  { id: 'scientist', label: 'Scientist', role: 'scientist', extra: {} },
  { id: 'crew', label: 'Ground crew', role: 'crew', extra: {} },
];

export class Player {
  constructor(game, { name = 'Pilot', character = 'pilot', skin = 0 } = {}) {
    this.game = game;
    this.name = name;
    this.character = character;
    this.skinIndex = skin;
    this.buildBody();
    this.vel = new THREE.Vector3();
    this.mode = 'foot';
    this.yaw = 0;
    this.camYaw = 0; this.camPitch = -0.18; this.camDist = 5.2;
    this.lookYaw = 0; this.lookPitch = 0;
    this.onGround = true;
    this.swimming = false;
    this.vehicle = null;
    this.ctl = null;
    this.chuteTime = 0;
    this.deadTimer = 0;
    this.cockpit = false;
    this.fireCD = 0;
    this.fov = 62;
    this.shake = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.stick = { x: 0, y: 0 };
    this.kb = { roll: 0, pitch: 0 };   // keyboard deflection, ramped like a real stick
  }

  buildBody() {
    const ch = CHARACTERS.find((c) => c.id === this.character) || CHARACTERS[0];
    const outfit = outfitFor(this.suit ? 'astronaut' : ch.role, mulberry32(this.name.length * 131 + 7));
    if (!this.suit) Object.assign(outfit, ch.extra);
    const skins = [0xf1c7a5, 0xe0ac86, 0xc68a62, 0xa66d47, 0x7c4c32, 0x5a3825];
    outfit.skin = skins[this.skinIndex % skins.length];
    const old = this.human;
    this.human = new Human(outfit);
    this.root = this.human.root;
    if (old) {
      this.root.position.copy(old.root.position);
      old.root.parent?.add(this.root);
      old.root.parent?.remove(old.root);
    }
  }

  get pos() { return this.root.position; }

  // Space suit on the Moon and Mars, normal clothes on Earth.
  setSuit(on) {
    if (!!this.suit === !!on) return;
    this.suit = on;
    const visible = this.root.visible, rot = this.root.rotation.y;
    this.buildBody();
    this.root.visible = visible;
    this.root.rotation.y = rot;
  }

  spawnAt(p, heading = 0) {
    this.root.position.set(p.x, this.game.world.groundAt(p.x, p.z), p.z);
    this.yaw = heading; this.camYaw = heading;
    this.vel.set(0, 0, 0);
    this.mode = 'foot';
    this.root.visible = true;
    this.human.state = 'idle';
  }

  // ---- Per-frame --------------------------------------------------------------

  update(dt) {
    const G = this.game, I = G.input;
    this.fireCD -= dt;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (I.hit('KeyV')) this.cockpit = !this.cockpit;
    if (this.mode === 'foot') this._foot(dt);
    else if (this.mode === 'vehicle') this._drive(dt);
    else if (this.mode === 'chute' || this.mode === 'fall') this._chute(dt);
    else if (this.mode === 'dead') {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) G.respawnPlayer();
    }
    this.human.animate(dt);
  }

  _look(dt, scale = 1) {
    const I = this.game.input, S = this.game.settings;
    const look = I.consumeLook();
    const sens = 0.0024 * S.sensitivity * scale;
    this.camYaw -= look.dx * sens;
    this.camPitch = clamp(this.camPitch - look.dy * sens * (S.invertY ? -1 : 1), -1.25, 0.95);
    return look;
  }

  _foot(dt) {
    const G = this.game, I = G.input, W = G.world;
    this._look(dt);
    const wheel = I.consumeWheel();
    this.camDist = clamp(this.camDist + wheel * 0.7, 2.4, 16);
    const mv = I.moveAxes();
    const sprint = I.down('ShiftLeft') || I.down('ShiftRight') || I.tdown('boost');
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const wx = fx * mv.y - fz * mv.x, wz = fz * mv.y + fx * mv.x;
    const pos = this.pos;
    const terrainH = W.terrain.heightAt(pos.x, pos.z);
    const plat = W.structures.platformAt(pos.x, pos.z);
    this.swimming = terrainH < -1.25 && plat === -Infinity && pos.y < 0.2;
    const grav = W.gravity ?? 1;
    const speed = (this.swimming ? 1.9 : sprint ? 6.4 : 2.6) * (grav < 1 ? 0.8 : 1);
    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
    if (this.swimming) {
      this.vel.y = 0;
      pos.y = damp(pos.y, -0.95, 4, dt);
      if (I.hit('Space') || I.thit('up')) G.audio?.splash();
    } else {
      this.vel.y -= 22 * grav * dt;
      if ((I.hit('Space') || I.thit('up')) && this.onGround) { this.vel.y = 7.2 * (grav < 1 ? 0.62 : 1); this.onGround = false; G.audio?.jump(); }
    }
    pos.x += this.vel.x * dt; pos.z += this.vel.z * dt;
    if (!this.swimming) pos.y += this.vel.y * dt;
    // Collisions: buildings, trunks, parked vehicles.
    W.structures.collide(pos, 0.35, pos.y + 0.9);
    W.vegetation.near(pos.x, pos.z, (c) => {
      if (pos.y > c.top) return;
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), r = c.r * 0.55 + 0.3;
      if (d < r && d > 1e-4) { pos.x = c.x + dx / d * r; pos.z = c.z + dz / d * r; }
    });
    for (const v of G.vehicles) {
      if (v.destroyed || !v.group.visible) continue;
      const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z, d = Math.hypot(dx, dz), r = v.radius * 0.42;
      if (d < r && d > 1e-4 && pos.y < v.pos.y + 2) { pos.x = v.pos.x + dx / d * r; pos.z = v.pos.z + dz / d * r; }
    }
    const lim = W.limit ?? 2700;
    pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
    const g = W.groundAt(pos.x, pos.z);
    if (!this.swimming && pos.y <= g) {
      if (this.vel.y < -16 * Math.sqrt(grav)) G.hud.toast('Ouch! Hard landing');
      pos.y = g; this.vel.y = 0; this.onGround = true;
    } else if (!this.swimming && pos.y > g + 0.25) this.onGround = false;
    if (this.swimming && terrainH > -1.0) { pos.y = g; }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
    this.root.rotation.y = this.yaw;
    const H = this.human;
    H.speed = hs;
    H.state = this.swimming ? 'swim' : this.onGround ? 'idle' : 'air';
    H.gesture = G.talkingTo ? 'talk' : null;
    // Head follows the camera a little.
    H.lookYaw = clamp(((this.camYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.9, 0.9) * 0.6;
    H.lookPitch = clamp(-this.camPitch * 0.4, -0.3, 0.4);
    H.lookLocked = true;
    this._interactions();
    this._footCamera(dt);
  }

  _interactions() {
    const G = this.game, I = G.input, p = this.pos;
    let vehicle = null, vd = Infinity;
    for (const v of G.vehicles) {
      if (v.destroyed || v.occupied) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.radius * 0.55;
      if (d < 4.5 && d < vd && Math.abs(v.pos.y - p.y) < 8) { vd = d; vehicle = v; }
    }
    const npc = G.npcs.nearest(p.x, p.z, 3.4);
    let prompt = null;
    if (vehicle) {
      if (vehicle.locked) prompt = { key: 'F', text: 'The saucer is dormant. Something here is still undiscovered.' };
      else prompt = { key: 'F', text: 'Board ' + vehicle.def.name + ' · ' + vehicle.def.role };
      if ((I.hit('KeyF') || I.thit('veh')) && !vehicle.locked) this.enter(vehicle);
    } else if (npc) {
      prompt = { key: 'E', text: 'Talk to ' + npc.name + ' · ' + npc.title };
      if (I.hit('KeyE') || I.thit('act')) G.talk(npc);
    }
    G.hud.prompt(prompt);
  }

  enter(v) {
    const G = this.game;
    this.vehicle = v;
    v.occupied = true;
    this.mode = 'vehicle';
    this.root.visible = false;
    this.stick.x = this.stick.y = 0;
    this.kb.roll = this.kb.pitch = 0;
    this.camYaw = v.headingAngle();
    if (v.kind === 'plane') v.throttle = Math.max(v.throttle, 0);
    G.hud.prompt(null);
    const help = { plane: 'W/S throttle · mouse or ↑↓ pitch · A/D roll · Q/E rudder · Shift afterburner · F exit', heli: 'Space up, C down, WASD fly, mouse turn', ufo: 'Space/C altitude, WASD fly, E tractor beam', ship: 'Space/C altitude, WASD fly, Shift boost · climb past 3,000 m for orbit', car: 'W/S throttle and brake · A/D steer · Space handbrake · Shift boost · L lights · B horn · V cockpit', rocket: v.onGround && !v.launched ? 'Space to launch · W/S throttle · mouse steer · G legs · R level' : 'W/S throttle · mouse steer · Q/E roll · G legs · R hold level' };
    G.hud.toast(v.def.name + ' · ' + help[v.kind], 5);
    G.audio?.enter(v.type);
    G.onEnterVehicle?.(v);
  }

  exitVehicle(force = false) {
    const G = this.game, v = this.vehicle, W = G.world;
    if (!v) return;
    const agl = v.pos.y - v.ground - W.groundAt(v.pos.x, v.pos.z);
    if (!force && !v.onGround && agl < 20 && v.speed > 4) { G.hud.toast('Too low to bail out. Land first.'); return; }
    v.occupied = false;
    this.vehicle = null;
    this.root.visible = true;
    if (v.onGround || agl < 3) {
      const ex = v.exitPoint(tv);
      this.root.position.set(ex.x, W.groundAt(ex.x, ex.z), ex.z);
      this.mode = 'foot';
      this.vel.set(0, 0, 0);
    } else {
      // Eject.
      this.root.position.copy(v.pos).add(tv.set(0, 3, 0));
      this.vel.copy(v.vel).multiplyScalar(0.35);
      this.vel.y = 12;
      this.mode = 'fall';
      this.chuteTime = 0;
      G.hud.toast('Ejected! Parachute deploying · WASD steer · hold C to drop faster', 3);
      G.audio?.eject();
    }
    this.yaw = v.headingAngle();
    this.camYaw = this.yaw;
    G.onExitVehicle?.(v);
  }

  _drive(dt) {
    const G = this.game, I = G.input, v = this.vehicle;
    if (!v || v.destroyed) return;
    const look = I.consumeLook();
    const S = G.settings;
    const mv = I.moveAxes(), ar = I.arrows();
    const lift = v.kind === 'heli' || v.kind === 'ufo' || v.kind === 'ship'; // arrows climb and descend here
    const up = (I.down('Space') || (lift && I.down('ArrowUp')) || I.tdown('up')) ? 1 : 0;
    const down = (I.down('KeyC') || (lift && I.down('ArrowDown')) || I.down('ControlLeft') || I.tdown('down')) ? 1 : 0;
    const boost = I.down('ShiftLeft') || I.down('ShiftRight') || I.tdown('boost');
    const freeLook = I.mouseRight;
    if (freeLook) {
      this.lookYaw -= look.dx * 0.004; this.lookPitch = clamp(this.lookPitch - look.dy * 0.004, -1, 0.6);
    } else {
      this.lookYaw = damp(this.lookYaw, 0, 3, dt); this.lookPitch = damp(this.lookPitch, 0, 3, dt);
    }
    if (I.hit('KeyL') && (v.kind === 'car' || v.kind === 'heli')) { v.lights = !v.lights; G.hud.toast(v.lights ? 'Lights on' : 'Lights off', 1.2); G.audio?.click(); }
    if (v.kind === 'car') {
      this.ctl = {
        steer: clamp(mv.x + ar.x, -1, 1), throttle: clamp(mv.y + ar.y, -1, 1),
        handbrake: I.down('Space') || I.tdown('fire'), boost, horn: I.down('KeyB') || I.tdown('act'),
      };
    } else if (v.kind === 'rocket') {
      if (!freeLook) {
        this.stick.x = clamp(this.stick.x + look.dx * 0.004 * S.sensitivity, -1, 1);
        this.stick.y = clamp(this.stick.y - look.dy * 0.004 * S.sensitivity * (S.invertY ? -1 : 1), -1, 1);
      }
      this.stick.x = damp(this.stick.x, 0, 2.5, dt); this.stick.y = damp(this.stick.y, 0, 2.5, dt);
      const touch = I.touch.active;
      this.ctl = {
        throttle: clamp((I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0) + (I.tdown('up') ? 1 : 0) - (I.tdown('down') ? 1 : 0), -1, 1),
        full: boost,
        pitch: clamp(this.stick.y + ar.y + (touch ? I.touch.y : 0), -1, 1),
        yaw: clamp(this.stick.x + ar.x + (touch ? I.touch.x : ((I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0))), -1, 1),
        roll: (I.down('KeyE') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0),
        launch: I.hit('Space') || I.thit('fire'),
        stage: I.hit('Space') || I.thit('fire'),
        legs: I.hit('KeyG'),
        level: I.down('KeyR'),
      };
      if (v.stage === 1 && v.pos.y > 3000 && G.location === 'earth') G.enterSpace();
    } else if (v.kind === 'plane') {
      // Mouse acts as a spring-centred control stick.
      if (!freeLook) {
        this.stick.x = clamp(this.stick.x + look.dx * 0.0045 * S.sensitivity, -1, 1);
        this.stick.y = clamp(this.stick.y - look.dy * 0.0045 * S.sensitivity * (S.invertY ? -1 : 1), -1, 1);
      }
      this.stick.x = damp(this.stick.x, 0, 2.2, dt); this.stick.y = damp(this.stick.y, 0, 2.2, dt);
      const touchPlane = I.touch.active, pad = I.pad.active;
      // Keys deflect the controls gradually (and recentre quickly) instead of snapping to full stick.
      const ramp = (cur, target) => {
        const rate = target === 0 || Math.sign(target) !== Math.sign(cur) ? 7 : 3;
        return Math.abs(target - cur) <= rate * dt ? target : cur + Math.sign(target - cur) * rate * dt;
      };
      this.kb.roll = ramp(this.kb.roll, touchPlane ? 0 : clamp((I.down('KeyD') ? 1 : 0) - (I.down('KeyA') ? 1 : 0) + ar.x, -1, 1));
      this.kb.pitch = ramp(this.kb.pitch, clamp(ar.y, -1, 1));
      // Throttle: analog on a gamepad, otherwise held keys; the stick's X is the rudder.
      const thr = pad && Math.abs(I.pad.ly) > 0.05 ? I.pad.ly : clamp((I.down('KeyW') ? 1 : 0) - (I.down('KeyS') ? 1 : 0) + (I.tdown('up') ? 1 : 0) - (I.tdown('down') ? 1 : 0), -1, 1);
      this.ctl = {
        throttle: thr,
        pitch: clamp(this.stick.y + this.kb.pitch + (touchPlane ? I.touch.y : 0), -1, 1),
        roll: clamp(this.stick.x + this.kb.roll + (touchPlane ? I.touch.x : 0), -1, 1),
        yaw: clamp((I.down('KeyE') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0) + (pad ? I.pad.lx : 0), -1, 1),
        boost,
      };
      const firing = (I.mouseLeft && I.locked) || I.down('Space') || I.tdown('fire');
      if (v.def.weapons && firing && this.fireCD <= 0) { this.fireCD = 0.11; G.fireBolt(v); }
    } else {
      const yawMouse = freeLook ? 0 : look.dx * 0.03 * S.sensitivity;
      this.ctl = {
        moveX: mv.x, moveY: mv.y, up, down, boost,
        yaw: clamp(((I.down('KeyE') && v.kind !== 'ufo') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0) + yawMouse + ar.x, -2.5, 2.5),
        beam: v.kind === 'ufo' && (I.down('KeyE') || I.tdown('act')),
      };
      if ((v.kind === 'ufo' || v.kind === 'ship') && up && v.pos.y - G.world.groundAt(v.pos.x, v.pos.z) > (G.location === 'earth' ? 3000 : 1500)) G.enterSpace();
    }
    if (I.hit('KeyF') || I.thit('veh')) this.exitVehicle();
    this._vehicleCamera(dt);
  }

  _chute(dt) {
    const G = this.game, I = G.input, W = G.world, pos = this.pos;
    this._look(dt);
    this.chuteTime += dt;
    if (this.mode === 'fall' && this.chuteTime > 0.9) { this.mode = 'chute'; G.audio?.chute(); }
    const mv = I.moveAxes();
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const wx = fx * mv.y - fz * mv.x, wz = fz * mv.y + fx * mv.x;
    if (this.mode === 'chute') {
      this.vel.x = damp(this.vel.x, wx * 9, 1.2, dt);
      this.vel.z = damp(this.vel.z, wz * 9, 1.2, dt);
      // Hold C (or ▼) to spill air and drop faster.
      const spill = I.down('KeyC') || I.tdown('down');
      this.vel.y = damp(this.vel.y, spill ? -17 : -6.5, 2.5, dt);
      this.human.state = 'chute';
    } else {
      this.vel.y -= 9.8 * dt;
      this.vel.multiplyScalar(Math.exp(-0.3 * dt));
      this.human.state = 'air';
    }
    pos.addScaledVector(this.vel, dt);
    if (Math.hypot(this.vel.x, this.vel.z) > 0.5) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 3, dt);
    this.root.rotation.y = this.yaw;
    W.structures.collide(pos, 0.4, pos.y + 1);
    const g = W.groundAt(pos.x, pos.z);
    const water = W.terrain.heightAt(pos.x, pos.z) < -1.25 && W.structures.platformAt(pos.x, pos.z) === -Infinity;
    if (water && pos.y < 0) { pos.y = -0.95; this.mode = 'foot'; this.vel.set(0, 0, 0); G.audio?.splash(); G.hud.toast('Splashdown!'); }
    else if (pos.y <= g) { pos.y = g; this.mode = 'foot'; this.vel.set(0, 0, 0); this.onGround = true; G.hud.toast('Touchdown'); }
    this.human.speed = 0;
    this._footCamera(dt, 9);
  }

  die(where) {
    this.mode = 'dead';
    this.deadTimer = 3.2;
    this.root.visible = false;
    this.deathPos = where.clone();
    this.shake = 1.2;
  }

  // ---- Cameras -----------------------------------------------------------------

  _footCamera(dt, extra = 0) {
    const G = this.game, cam = G.camera, W = G.world;
    const pivot = tv.copy(this.pos);
    pivot.y += this.swimming ? 0.6 : 1.55;
    const dist = this.camDist + extra;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dx = Math.sin(this.camYaw) * cp, dz = Math.cos(this.camYaw) * cp;
    const rightX = -Math.cos(this.camYaw), rightZ = Math.sin(this.camYaw);
    const shoulder = 0.5 * smoothstep(2, 8, dist) * (extra ? 0 : 1);
    tv2.set(pivot.x - dx * dist + rightX * shoulder, pivot.y - sp * dist, pivot.z - dz * dist + rightZ * shoulder);
    const gh = W.groundAt(tv2.x, tv2.z);
    if (tv2.y < gh + 0.5) tv2.y = gh + 0.5;
    if (tv2.y < -0.5 && W.terrain.heightAt(tv2.x, tv2.z) < 0) tv2.y = Math.max(tv2.y, 0.4);
    this.camPos.lerp(tv2, 1 - Math.exp(-18 * dt));
    if (this.camPos.distanceToSquared(tv2) > 400) this.camPos.copy(tv2);
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(pivot.x + rightX * shoulder, pivot.y, pivot.z + rightZ * shoulder);
    this.fov = damp(this.fov, 62, 3, dt);
    this._applyShake(cam);
  }

  _vehicleCamera(dt) {
    const G = this.game, cam = G.camera, v = this.vehicle, W = G.world;
    const fwd = tv.copy(Z).applyQuaternion(v.quat);
    if (this.cockpit) {
      const seat = v.kind === 'car' ? v.model.spec.eye : { jet: [0, 0.95, 3.4], nova: [0, 1.05, 0.2], prop: [0.3, 0.55, 0.8], heli: [-0.45, 0.4, 1.5], ufo: [0, 2.2, 0], ship: [0, 0.9, 9.4], rocket: [0, 57 + (v.parts.model?.position.y || 0), -1.3] }[v.type] || [0, 1, 0];
      tv2.set(seat[0], seat[1], seat[2]).applyQuaternion(v.quat).add(v.pos);
      cam.position.copy(tv2);
      tq.copy(v.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, Math.PI + this.lookYaw, 0, 'YXZ')));
      cam.quaternion.copy(tq);
      if (v.parts.pilot) v.parts.pilot.root.visible = false;
      this.camPos.copy(cam.position);
    } else if (v.kind === 'rocket') {
      // Chase from below and behind, looking up the stack; drag with the right mouse to orbit.
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
      const len = v.stage === 2 ? 60 : 21;
      const centre = tv2.copy(v.pos).addScaledVector(up, len * 0.45);
      const yaw = v.headingAngle() + Math.PI * 0.75 + this.lookYaw;
      const dist = v.stage === 2 ? 95 : 48;
      const want = new THREE.Vector3(Math.sin(yaw) * dist, (v.onGround ? 8 : -dist * 0.18) - this.lookPitch * dist, Math.cos(yaw) * dist).add(centre);
      const gh = W.groundAt(want.x, want.z);
      if (want.y < gh + 2) want.y = gh + 2;
      this.camPos.lerp(want, 1 - Math.exp(-4 * dt));
      if (this.camPos.distanceToSquared(want) > 250000) this.camPos.copy(want);
      cam.position.copy(this.camPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(centre);
      this.shake = Math.max(this.shake, v.onGround || v.pos.y < 600 ? v.throttle * 0.55 * (v.thrustAcc > 0 ? 1 : 0) : 0);
    } else {
      const flat = v.kind !== 'plane';
      const heading = flat ? v.heading : Math.atan2(fwd.x, fwd.z);
      let dir;
      if (flat) dir = tv2.set(Math.sin(heading + this.lookYaw), 0, Math.cos(heading + this.lookYaw));
      else dir = tv2.copy(fwd).applyAxisAngle(UP, this.lookYaw);
      const speedK = clamp(v.speed / 150, 0, 1);
      const dist = v.camDist * (1 + speedK * 0.25);
      const want = new THREE.Vector3().copy(v.pos).addScaledVector(dir, -dist);
      want.y += v.camHeight + (flat ? 0 : 0) - this.lookPitch * dist * 0.8;
      if (!flat) want.y = Math.max(want.y, v.pos.y - dist * 0.6 + v.camHeight);
      const gh = W.groundAt(want.x, want.z);
      if (want.y < gh + 1.5) want.y = gh + 1.5;
      if (want.y < 1.2) want.y = 1.2;
      const rate = v.kind === 'plane' ? 7 : v.kind === 'car' ? 9 : 5;
      this.camPos.lerp(want, 1 - Math.exp(-rate * dt));
      if (this.camPos.distanceToSquared(want) > 90000) this.camPos.copy(want);
      cam.position.copy(this.camPos);
      const planeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
      cam.up.set(0, 1, 0).lerp(planeUp, v.kind === 'plane' ? 0.35 : 0).normalize();
      const look = new THREE.Vector3().copy(v.pos).addScaledVector(v.kind === 'plane' ? fwd : dir, v.camDist * 0.8);
      look.y += v.camHeight * 0.3;
      cam.lookAt(look);
    }
    const speedFov = clamp(v.speed / (v.kind === 'car' ? v.def.maxSpeed * 1.5 : 280), 0, 1) * (v.kind === 'car' ? 12 : 14) + (v.boosting ? 6 : 0);
    this.fov = damp(this.fov, (this.cockpit ? 70 : 62) + speedFov, 2.5, dt);
    this._applyShake(cam);
  }

  deadCamera(dt, t) {
    const cam = this.game.camera, c = this.deathPos;
    if (!c) return;
    const a = t * 0.25;
    cam.position.lerp(tv.set(c.x + Math.cos(a) * 60, c.y + 30, c.z + Math.sin(a) * 60), 1 - Math.exp(-2 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(c);
    this._applyShake(cam);
  }

  _applyShake(cam) {
    if (this.shake <= 0) return;
    const s = this.shake * this.shake * 0.6;
    cam.position.x += (Math.random() - 0.5) * s;
    cam.position.y += (Math.random() - 0.5) * s;
    cam.position.z += (Math.random() - 0.5) * s;
  }

  // Snapshot for the network.
  netState() {
    const v = this.vehicle;
    const craft = this.game.location === 'space' ? this.game.space.craft : null;
    const q = craft ? craft.quaternion : v ? v.quat : this.root.quaternion;
    const p = craft ? craft.position : v ? v.pos : this.pos;
    return {
      n: this.name.slice(0, 18), c: this.character, k: this.skinIndex,
      m: this.mode, v: v ? v.type : null,
      p: [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100],
      q: [q.x, q.y, q.z, q.w].map((x) => Math.round(x * 1000) / 1000),
      s: Math.round(this.human.speed * 10) / 10, st: this.human.state, g: this.human.gesture,
      th: v ? Math.round((v.throttle || v.rpm || 0) * 100) / 100 : 0, b: v ? !!v.beamActive : false,
      cc: v && v.kind === 'car' ? v.color : 0, cv: v && v.kind === 'car' ? [Math.round(v.carVf * 10) / 10, Math.round(v.steer * 100) / 100, v.lights ? 1 : 0, v.braking ? 1 : 0] : 0,
      L: this.game.location || 'earth', sg: v && v.kind === 'rocket' ? v.stage : 0,
    };
  }
}
