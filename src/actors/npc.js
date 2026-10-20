// The island's residents. Each NPC lives in a home area, walks between
// reachable spots, pairs up for conversations, greets the player with a wave,
// sunbathes on the beach, dances in the plaza at night and stops to point
// when a saucer drifts overhead. Talking to them (E) gives lore and hints.

import * as THREE from 'three';
import { Human, outfitFor } from './human.js';
import { mulberry32 } from '../core/noise.js';
import { clamp, dampAngle, TAU } from '../core/util.js';
import { PLACES } from '../world/terrain.js';

const FIRST = ['Mara', 'Jonah', 'Aiko', 'Mateo', 'Priya', 'Tomas', 'Leila', 'Omar', 'Hana', 'Kofi', 'Elena', 'Yusuf', 'Ines', 'Ravi', 'Sofia', 'Dmitri', 'Amara', 'Lucas', 'Noor', 'Felix', 'Zara', 'Kenji', 'Ada', 'Samir', 'Greta', 'Tariq', 'Lina', 'Hugo', 'Maya', 'Ibrahim', 'Nia', 'Oskar', 'Rosa', 'Idris', 'Yara', 'Emil', 'Fatima', 'Leo', 'Chiara', 'Bruno', 'Salma', 'Theo'];

export const LINES = {
  crew: [
    'The Kite helicopter is fuelled on the pads east of the tower. Walk up to it and press F.',
    'Runway 09 is clear. The Falcon in front of hangar one carries training bolts for drone swarms.',
    'Tower logged three unidentified contacts over the Red Mesa last night. Nobody here says the word "saucer".',
    'Keep your gear down below sixty metres and your descent gentle. The runway forgives. The ocean doesn\'t.',
  ],
  pilot: [
    'The Talon in front of hangar two isn\'t ours. It turned up one morning with no paperwork. Flies like a dream.',
    'Above eighteen hundred metres something blots out the stars. I\'ve seen it twice. Never on radar.',
    'Bank to turn, don\'t just use the rudder. The Skylark is the gentlest plane on the island.',
  ],
  villager: [
    'My grandmother swore the stones on Hollow Hill float when nobody is watching.',
    'The lights over Aldren Farms come back every night after sunset. Silent. Always silent.',
    'Welcome to Harrow! The market is open until dark. After that we keep the curtains closed.',
    'Have you seen the old temple out in the Red Mesa? At night a light shoots straight up from its tip.',
    'There is a festival in the plaza every night. Come and dance if you are brave enough to stay out.',
  ],
  farmer: [
    'Something drew circles in my wheat. Perfect circles. From the air they would look like a message.',
    'My cows keep vanishing at night and coming back in the morning. Calm as anything.',
  ],
  beach: [
    'Fishermen won\'t sail past the western reef. There is a whirlpool out there that glows at night.',
    'Best sunsets on the island, right here. Stay for the stars. Some of them move.',
    'The water is warm. Just don\'t swim toward the western reef.',
  ],
  scientist: [
    'The monolith on the summit of Mount Kestrel hums at exactly 440 hertz. Every hour, on the hour.',
    'Radiation readings spike near the crash site in the Red Mesa. Whatever came down is still warm.',
    'If you ever get past the atmosphere, go to the Moon. Our instruments picked up an echo from a crater near the old landing site.',
  ],
  spaceport: [
    'Aurora is on the pad at LC-1. Walk up to the launch mount, press F, then Space to start the countdown.',
    'Watch the booster after staging. It flips around and flies itself back to the landing zone. Every time.',
    'Keep the throttle up until the booster runs dry, or press Space to stage early. Orbit starts at three thousand metres.',
    'The service arm swings away at ignition. Don\'t steer into the tower on the way up.',
  ],
  mission: [
    'From orbit, press 1, 2 or 3 to warp to Earth, the Moon or Mars. Then point at the surface and dive.',
    'Landing on the Moon: gravity is a sixth of ours. Kill your speed early, hold R to stay upright and touch down under eight metres a second.',
    'Our lander left a flag at the Kestrel-1 site. The crater to the south-west has something in it that we did not put there.',
    'Ares Station keeps reporting a pulse from the canyon south-east of their landing site. Every 1.7 seconds.',
  ],
  astronaut: [
    'The Odyssey on the O-pad takes off like a helicopter and keeps climbing. Hold Space past three thousand metres for orbit.',
    'On Mars you weigh about a third of what you do here. Jumping is the fun part.',
    'The Earth from the Moon looks four times bigger than the Moon does from here. You never get used to it.',
  ],
  keeper: [
    'My light points out to sea. Theirs points at the sky. Look above the clouds, past eighteen hundred metres.',
    'Forty years on this rock. The ships stopped coming when the reef started glowing.',
  ],
  hiker: [
    'The trail goes all the way up Mount Kestrel. Snow at the top, and something black and very, very straight.',
    'Hollow Hill has a ring of standing stones. My compass spins in circles there.',
  ],
};

const ROLE_TITLE = { crew: 'Ground crew', pilot: 'Pilot', villager: 'Villager', farmer: 'Farmer', beach: 'Beachgoer', scientist: 'Researcher', keeper: 'Lighthouse keeper', hiker: 'Hiker' };

const TUMBLE_C = new THREE.Vector3(), TUMBLE_V = new THREE.Vector3(), TUMBLE_Q = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);

export class NPC {
  constructor(role, home, rnd, world) {
    this.role = role;
    this.home = home; // { x, z, r, mode }
    this.rnd = rnd;
    this.world = world;
    this.name = FIRST[Math.floor(rnd() * FIRST.length)];
    this.title = home.title || ROLE_TITLE[role] || 'Resident';
    this.human = new Human(outfitFor(role, rnd));
    this.root = this.human.root;
    this.heading = rnd() * TAU;
    this.target = null;
    this.timer = rnd() * 4;
    this.mode = home.mode || 'wander';
    this.greetCD = 0;
    this.lineIndex = Math.floor(rnd() * 10);
    this.partner = null;
    this.speedBase = role === 'beach' && rnd() < 0.3 ? 3.0 : 1.15 + rnd() * 0.35;
    this.dancer = role === 'villager' && rnd() < 0.45;
    const p = this._randomSpot(false) || { x: home.x, z: home.z };
    this.root.position.set(p.x, world.groundAt(p.x, p.z), p.z);
    if (this.mode === 'lie' || this.mode === 'sit') {
      this.root.position.set(home.x, world.groundAt(home.x, home.z), home.z);
      this.human.state = this.mode;
    }
  }

  get pos() { return this.root.position; }

  // Knocked off their feet (bullet, blade or blast): the same harmless tumble a car hit causes.
  knock(vx, vz, up = 3.5) {
    const pos = this.root.position, kl = Math.hypot(vx, vz) || 1;
    this.tumble = { t: 0, air: true, y: 0.2, vy: up, vx, vz, px: pos.x, pz: pos.z, axis: new THREE.Vector3(vz / kl, 0, -vx / kl) };
    this.target = null; this.partner = null; this.waveTime = 0;
  }

  _randomSpot(checkPath = true) {
    const W = this.world;
    for (let i = 0; i < 12; i++) {
      const a = this.rnd() * TAU, r = Math.sqrt(this.rnd()) * this.home.r;
      const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      const h = W.terrain.heightAt(x, z);
      if (h < 0.4 && W.structures.platformAt(x, z) === -Infinity) continue;
      if (W.structures.insideBuilding(x, z, 1.2)) continue;
      if (checkPath && !this._pathClear(this.root.position.x, this.root.position.z, x, z)) continue;
      return { x, z };
    }
    return null;
  }

  _pathClear(ax, az, bx, bz) {
    const W = this.world;
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 3);
    let prev = W.groundAt(ax, az);
    for (let i = 1; i <= n; i++) {
      const x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n);
      if (W.structures.insideBuilding(x, z, 0.8)) return false;
      const h = W.groundAt(x, z);
      if (h < 0.3 || Math.abs(h - prev) > 2.2) return false;
      prev = h;
    }
    return true;
  }

  nextLine() {
    const lines = LINES[this.home.lines || this.role] || LINES.villager;
    const line = lines[this.lineIndex % lines.length];
    this.lineIndex++;
    return line;
  }

  update(dt, ctx) {
    const H = this.human;
    const pos = this.root.position;
    this.greetCD -= dt;
    this.timer -= dt;
    let speed = 0;
    H.gesture = null;
    H.lookLocked = false;

    // Knocked down by a vehicle: a short ballistic tumble about the body's centre (around the axis
    // perpendicular to the knock, head leading), then lying still until they get back up.
    if (this.tumble) {
      const tb = this.tumble;
      tb.t += dt;
      if (tb.air) {
        tb.vy -= 9.81 * dt;
        const ax = tb.px + tb.vx * dt, az = tb.pz + tb.vz * dt;
        // Stop sliding at walls and the shoreline instead of ending up embedded in them.
        if (!this.world.structures.insideBuilding(ax, az, 0.5) && this.world.groundAt(ax, az) > 0.3) { tb.px = ax; tb.pz = az; } else { tb.vx = 0; tb.vz = 0; }
        tb.y += tb.vy * dt;
        const g = this.world.groundAt(tb.px, tb.pz);
        H.state = 'air';
        this.root.quaternion.setFromAxisAngle(tb.axis, Math.min(tb.t * 5.5, Math.PI * 0.5)).multiply(TUMBLE_Q.setFromAxisAngle(UPV, this.heading));
        const centre = TUMBLE_C.set(0, 0.9, 0), moved = TUMBLE_V.copy(centre).applyQuaternion(this.root.quaternion);
        this.root.position.set(tb.px + centre.x - moved.x, g + Math.max(0, tb.y) + centre.y - moved.y, tb.pz + centre.z - moved.z);
        if (tb.y <= 0 && tb.vy < 0) { tb.air = false; tb.y = 0; tb.vx *= 0.25; tb.vz *= 0.25; this.root.rotation.set(0, this.heading, 0); ctx.onHit?.(this, 0.4); }
      } else {
        tb.vx *= Math.exp(-4 * dt); tb.vz *= Math.exp(-4 * dt);
        const nx = tb.px + tb.vx * dt, nz = tb.pz + tb.vz * dt;
        if (!this.world.structures.insideBuilding(nx, nz, 0.5) && this.world.groundAt(nx, nz) > 0.3) { tb.px = nx; tb.pz = nz; }
        this.root.position.set(tb.px, this.world.groundAt(tb.px, tb.pz), tb.pz);
        H.state = 'lie';
        this.root.rotation.set(0, this.heading, 0);
        if (tb.t > 6.5) { this.tumble = null; this.root.rotation.set(0, this.heading, 0); H.state = 'idle'; this.timer = 1; }
      }
      H.speed = 0;
      if (ctx.animate) H.animate(dt);
      return;
    }
    // Hazards: moving vehicles. Get out of the way, and go down if one connects.
    if (ctx.hazards && this.mode !== 'lie' && this.mode !== 'sit') for (const hz of ctx.hazards) {
      const dx = pos.x - hz.x, dz = pos.z - hz.z, d = Math.hypot(dx, dz);
      if (d > 14 || hz.speed < 4) continue;
      const vx = hz.vx / hz.speed, vz = hz.vz / hz.speed;
      const ahead = dx * vx + dz * vz;                       // how far in front of the vehicle we are
      if (ahead < -1.5) continue;                            // already behind it
      const side = dx * -vz + dz * vx;                       // + = to the vehicle's left
      if (Math.abs(side) < 1.5 && ahead < hz.r + 0.6 && ahead > -1.5 && hz.speed > 5.5) {
        const kvx = hz.vx * 0.55 + (side > 0 ? -vz : vz) * 2, kvz = hz.vz * 0.55 + (side > 0 ? vx : -vx) * 2, kl = Math.hypot(kvx, kvz) || 1;
        this.tumble = { t: 0, air: true, y: 0.2, vy: 3.5 + hz.speed * 0.15, vx: kvx, vz: kvz, px: pos.x, pz: pos.z, axis: new THREE.Vector3(kvz / kl, 0, -kvx / kl) };
        this.target = null; this.partner = null; this.waveTime = 0;
        ctx.onHit?.(this, hz.speed);
        return;
      }
      if (Math.abs(side) < 3.2 && ahead < 14 && ahead > 0 && (ctx.talkingTo !== this || ahead < 9)) {
        // Sidestep sharply away from the vehicle's path (never into a wall or the sea); if that side is
        // blocked, try the other one.
        let sgn = side >= 0 ? 1 : -1, clear = false;
        const run = 4.4, ok = (nx, nz) => !this.world.structures.insideBuilding(nx, nz, 0.8) && this.world.groundAt(nx, nz) > 0.3 && Math.abs(this.world.groundAt(nx, nz) - pos.y) < 1.2;
        for (let tries = 0; tries < 2 && !clear; tries++, sgn = -sgn) {
          const hd = Math.atan2(-vz * sgn, vx * sgn);
          if (ok(pos.x + Math.sin(hd) * run * dt * 3, pos.z + Math.cos(hd) * run * dt * 3)) { clear = true; this.heading = dampAngle(this.heading, hd, 9, dt); }
        }
        if (clear) { pos.x += Math.sin(this.heading) * run * dt; pos.z += Math.cos(this.heading) * run * dt; }
        this.target = null;
        H.state = 'idle'; H.speed = clear ? run : 0; H.gesture = null;
        pos.y = this.world.groundAt(pos.x, pos.z); this.root.rotation.y = this.heading;
        if (ctx.animate) H.animate(dt);
        return;
      }
    }

    const toPlayerX = ctx.player.x - pos.x, toPlayerZ = ctx.player.z - pos.z;
    const pd = Math.hypot(toPlayerX, toPlayerZ);
    const nearPlayer = ctx.playerOnFoot && pd < 6;

    if (this.mode === 'lie' || this.mode === 'sit') {
      H.state = this.mode;
      if (nearPlayer && this.mode === 'sit') { H.lookYaw = clamp(Math.atan2(toPlayerX, toPlayerZ) - this.heading, -1, 1); H.lookLocked = true; }
    } else if (ctx.talkingTo === this) {
      H.state = 'idle';
      H.gesture = 'talk';
      this.heading = dampAngle(this.heading, Math.atan2(toPlayerX, toPlayerZ), 6, dt);
    } else if (nearPlayer && this.greetCD <= 0) {
      this.greetCD = 18 + this.rnd() * 10;
      this.waveTime = 2.2;
    } else if (this.waveTime > 0) {
      this.waveTime -= dt;
      H.state = 'idle';
      H.gesture = 'wave';
      this.heading = dampAngle(this.heading, Math.atan2(toPlayerX, toPlayerZ), 5, dt);
    } else if (ctx.ufo && ctx.night > 0.5 && Math.hypot(ctx.ufo.x - pos.x, ctx.ufo.z - pos.z) < 420) {
      // Stop and point at the saucer.
      const dx = ctx.ufo.x - pos.x, dz = ctx.ufo.z - pos.z;
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 4, dt);
      H.pointElev = clamp(Math.atan2(ctx.ufo.y - pos.y, Math.hypot(dx, dz)), 0.1, 1.3);
      H.gesture = 'point';
      H.state = 'idle';
    } else if (this.dancer && ctx.night > 0.55 && Math.hypot(pos.x - PLACES.village.x, pos.z - PLACES.village.z) < 60) {
      H.gesture = 'dance';
      H.state = 'idle';
      this.heading += dt * 0.4;
    } else if (this.partner && this.talkTime > 0) {
      this.talkTime -= dt;
      const pp = this.partner.pos;
      this.heading = dampAngle(this.heading, Math.atan2(pp.x - pos.x, pp.z - pos.z), 5, dt);
      H.gesture = (Math.floor(this.talkTime / 2.5) + (this.id || 0)) % 2 ? 'talk' : null;
      H.state = 'idle';
      if (this.talkTime <= 0) { this.partner = null; this.timer = 1; }
    } else if (this.target) {
      const dx = this.target.x - pos.x, dz = this.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.6) {
        this.target = null;
        this.timer = 3 + this.rnd() * 8;
      } else {
        this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 5, dt);
        speed = this.speedBase;
        if (ctx.night > 0.5 && !this.dancer) speed *= 0.85;
        const step = Math.min(d, speed * dt);
        pos.x += Math.sin(this.heading) * step;
        pos.z += Math.cos(this.heading) * step;
      }
      H.state = 'idle';
    } else {
      H.state = 'idle';
      if (this.timer <= 0) {
        // Head to the plaza at night if a dancer; otherwise wander or chat.
        if (this.dancer && ctx.night > 0.55) {
          const a = this.rnd() * TAU, r = 10 + this.rnd() * 20;
          this.target = { x: PLACES.village.x + Math.cos(a) * r, z: PLACES.village.z + Math.sin(a) * r };
        } else if (this.rnd() < 0.3 && ctx.findPartner) {
          const other = ctx.findPartner(this);
          if (other) {
            this.partner = other; other.partner = this;
            this.talkTime = other.talkTime = 8 + this.rnd() * 10;
            other.target = null; this.target = null;
          }
        }
        if (!this.partner && !this.target) this.target = this._randomSpot();
        this.timer = 2 + this.rnd() * 4;
      }
    }

    // Keep out of the player's way.
    if (ctx.playerOnFoot && pd < 0.8 && pd > 0.001) {
      pos.x -= (toPlayerX / pd) * (0.8 - pd);
      pos.z -= (toPlayerZ / pd) * (0.8 - pd);
    }
    pos.y = this.world.groundAt(pos.x, pos.z);
    this.root.rotation.y = this.heading;
    H.speed = speed;
    if (ctx.animate) H.animate(dt);
  }
}

export class NPCManager {
  constructor(world, scene, { count = 1 } = {}) {
    this.world = world;
    this.list = [];
    this.range = 600;            // people beyond this are hidden (scaled by quality)
    this.group = new THREE.Group();
    this.group.name = 'npcs';
    scene.add(this.group);
    const rnd = mulberry32(1300);
    const S = world.structures;
    const P = PLACES;
    const add = (role, home, n = 1) => {
      for (let i = 0; i < Math.max(1, Math.round(n * count)); i++) {
        const npc = new NPC(role, home, rnd, world);
        npc.id = this.list.length;
        this.list.push(npc);
        this.group.add(npc.root);
      }
    };
    add('crew', { x: -150, z: 580, r: 150 }, 6);
    add('pilot', { x: -200, z: 555, r: 90 }, 3);
    add('scientist', { x: -60, z: 560, r: 30 }, 1);
    add('villager', { x: P.village.x, z: P.village.z, r: 190 }, 18);
    add('villager', { x: P.village.x, z: P.village.z, r: 40 }, 6);
    add('farmer', { x: P.farm.x - 150, z: P.farm.z + 80, r: 110 }, 4);
    add('keeper', { x: P.lighthouse.x - 8, z: P.lighthouse.z + 8, r: 18 }, 1);
    add('scientist', { x: P.stones.x + 30, z: P.stones.z + 30, r: 25 }, 2);
    add('hiker', { x: P.stones.x - 60, z: P.stones.z + 90, r: 90 }, 3);
    const C = P.spaceport;
    add('crew', { x: C.x - 40, z: C.z + 40, r: 55, lines: 'spaceport', title: 'Launch engineer' }, 3);
    add('scientist', { x: C.x - 70, z: C.z + 92, r: 14, lines: 'mission', title: 'Flight director' }, 2);
    add('astronaut', { x: C.x - 12, z: C.z + 62, r: 22, lines: 'astronaut', title: 'Astronaut' }, 2);
    const out = new THREE.Vector2(Math.cos(P.beach.angle), Math.sin(P.beach.angle));
    add('villager', { x: P.city.x, z: P.city.z, r: 200, title: 'City resident' }, 16);
    add('beach', { x: P.beach.x - out.x * 25, z: P.beach.z - out.y * 25, r: 90 }, 5);
    (S.beachSpots || []).slice(0, 7).forEach((b, i) => add('beach', { x: b.x, z: b.z, r: 1, mode: i % 3 === 0 ? 'sit' : 'lie' }, 1));
  }

  findPartner(npc) {
    let best = null, bd = 9;
    for (const o of this.list) {
      if (o === npc || o.partner || o.mode !== 'wander' || o.target) continue;
      const d = o.pos.distanceTo(npc.pos);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  update(dt, ctx, camera) {
    ctx.findPartner = (n) => this.findPartner(n);
    const cam = camera.position;
    for (const n of this.list) {
      const d = n.pos.distanceTo(cam);
      n.root.visible = d < this.range;
      if (d > this.range * 1.5) continue;
      ctx.animate = d < 220;
      n.update(dt, ctx);
    }
  }

  // Closest NPC to (x, z) within range.
  nearest(x, z, range = 3.5) {
    let best = null, bd = range;
    for (const n of this.list) {
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
}
