// Game: builds the island and everything in it, runs the frame loop, and
// connects the player, aircraft, spacecraft, residents, visitors, mysteries,
// orbit, the Moon and Mars, HUD, sound and multiplayer. `location` is where
// the player is: 'earth' (the island), 'space', 'moon' or 'mars'.

import * as THREE from 'three';
import { Terrain, PLACES } from './world/terrain.js';
import { Structures, RUNWAY } from './world/structures.js';
import { Vegetation } from './world/vegetation.js';
import { SkySystem } from './world/sky.js';
import { Ocean } from './world/water.js';
import { Clouds } from './world/clouds.js';
import { Weather } from './world/weather.js';
import { Mysteries, MYSTERY_INFO } from './world/mysteries.js';
import { NPCManager } from './actors/npc.js';
import { Animals } from './actors/animals.js';
import { Aliens } from './actors/aliens.js';
import { Traffic } from './actors/traffic.js';
import { Vehicle } from './vehicles/vehicles.js';
import { CAR_COLORS } from './vehicles/cars.js';
import { Player } from './player.js';
import { Particles, Trail } from './fx/particles.js';
import { PostFX } from './fx/postfx.js';
import { HUD } from './ui/hud.js';
import { Net } from './net/net.js';
import { RemotePlayer } from './net/remote.js';
import { Space, BODIES } from './space/space.js';
import { SurfaceWorld } from './space/surface.js';
import { clamp, damp, smoothstep, nextFrame, escapeHTML } from './core/util.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
const NO_NPCS = { list: [], nearest: () => null, update() {} };

export class Game {
  constructor({ renderer, input, audio, settings }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbcd3e6, 0.0002);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 30000);
    this.score = settings.saved?.score || 0;
    this.stats = { drones: settings.saved?.stats?.drones || 0, flights: settings.saved?.stats?.flights || 0 };
    this.remotes = new Map();
    this.bolts = [];
    this.talkingTo = null;
    this.running = false;
    this.paused = false;
    this.t = 0;
    this.envTimer = 0;
    this.sunVis = 0;
    this.flash = 0;
    this.photo = false;
    this.space = { active: false };
    this.location = 'earth';
    this.surfaces = {};
  }

  async build(onProgress = () => {}) {
    const q = this.settings.quality;
    const density = q === 'low' ? 0.45 : q === 'medium' ? 0.72 : 1;
    const step = async (f, label) => { onProgress(f, label); await nextFrame(); await nextFrame(); };

    await step(0.05, 'Raising the island');
    this.terrain = new Terrain();
    this.scene.add(this.terrain.build());

    await step(0.2, 'Laying runways and building Harrow');
    this.structures = new Structures(this.terrain);
    this.scene.add(this.structures.group);
    const W = this.world = {
      terrain: this.terrain, structures: this.structures, vegetation: null, mysteries: null,
      groundAt: (x, z) => this.structures.groundAt(x, z),
      night: 0,
      farFromPlayers: (p, d) => p.distanceTo(this.player.pos) > d,
      // Obstacles for road vehicles: other vehicles on the ground and the traffic.
      others: (self) => {
        const out = this._others; out.length = 0;
        for (const v of this.vehicles) if (v !== self && !v.destroyed && v.group.visible && v.onGround) out.push({ x: v.pos.x, z: v.pos.z, r: v.kind === 'car' ? 0.9 : v.radius * 0.4 });
        if (this.traffic) for (const c of this.traffic.cars) out.push({ x: c.pos.x, z: c.pos.z, r: 0.9 });
        return out;
      },
    };
    this._others = [];

    await step(0.32, 'Growing forests');
    this.vegetation = new Vegetation(this.terrain, { density, isBlocked: (x, z) => this.structures.isBlocked(x, z, 3) });
    W.vegetation = this.vegetation;
    this.scene.add(this.vegetation.group);

    await step(0.46, 'Lighting the sky');
    const shadows = q !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sky = new SkySystem(this.scene, { shadowSize: q === 'high' ? 2048 : 1024, shadows });
    this.ocean = new Ocean(this.terrain.heightTexture(512));
    this.scene.add(this.ocean.mesh);
    this.clouds = new Clouds({ count: q === 'low' ? 26 : 46 });
    this.scene.add(this.clouds.mesh);
    this.weather = new Weather(this.scene, { rain: q === 'low' ? 700 : 1600 });

    await step(0.58, 'Hiding mysteries');
    this.mysteries = new Mysteries(W, this.scene);
    W.mysteries = this.mysteries;
    this.terrain.paintMap(1024);
    this.structures.paintMap(this.terrain.mapCanvas);

    await step(0.68, 'Fuelling aircraft');
    const S = this.structures.spawns;
    this.vehicles = [
      new Vehicle('jet', S.hangars[0]),
      new Vehicle('nova', S.hangars[1]),
      new Vehicle('prop', S.hangars[2]),
      new Vehicle('heli', S.helipads[0]),
      new Vehicle('heli', S.helipads[1]),
      new Vehicle('prop', { x: RUNWAY.x0 + 90, y: this.structures.baseY, z: 626, heading: Math.PI / 2 }),
      new Vehicle('ufo', { x: PLACES.crash.x, y: this.terrain.heightAt(PLACES.crash.x, PLACES.crash.z), z: PLACES.crash.z, heading: 0.7 }),
      new Vehicle('rocket', { ...S.rocketPad, lz: S.lz }),
      new Vehicle('ship', S.shipPad),
      ...this._parkCars(),
    ];
    this.ufo = this.vehicles.find((v) => v.type === 'ufo');
    this.rocket = this.vehicles.find((v) => v.type === 'rocket');
    this._lockUfo(!this.mysteries.found.has('crash'));
    for (const v of this.vehicles) this.scene.add(v.group);

    await step(0.78, 'Waking the residents');
    this.npcs = new NPCManager(W, this.scene, { count: q === 'low' ? 0.6 : 1 });
    this.animals = new Animals(W, this.scene);
    this.aliens = new Aliens(W, this.scene);
    this.traffic = new Traffic(this.scene, W);

    await step(0.88, 'Preparing orbit');
    this.fx = { sparks: new Particles(3500), smoke: new Particles(3200, { additive: false }) };
    this.scene.add(this.fx.sparks.points, this.fx.smoke.points);
    this.space = new Space(this.renderer);
    this.space.active = false;
    this.boltGeo = new THREE.CapsuleGeometry(0.22, 5, 4, 8).rotateX(Math.PI / 2);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.wingTrails = [new Trail(this.scene, { length: 50, width: 0.12, color: 0xffffff, opacity: 0.4, minStep: 3 }), new Trail(this.scene, { length: 50, width: 0.12, color: 0xffffff, opacity: 0.4, minStep: 3 })];
    this.ufoTrail = new Trail(this.scene, { length: 70, width: 1.6, color: 0x7dffd6, opacity: 0.5, additive: true, minStep: 4 });

    await step(0.95, 'Final checks');
    this.post = new PostFX(this.renderer, this.scene, this.camera, { quality: q });
    this.hasEnv = this.post.enabled && q !== 'low';
    if (this.hasEnv) {
      // Reflection/ambient probe: the same sky without the blinding sun disk,
      // scaled down so image-based light complements (not floods) the sun.
      this.pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envScene = new THREE.Scene();
      const src = this.sky.sky.material;
      const envMat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ uEnvScale: { value: 0.35 } }, src.uniforms),
        vertexShader: src.vertexShader,
        fragmentShader: src.fragmentShader
          .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float uEnvScale;')
          .replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;', '')
          .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uEnvScale, 1.0 );'),
        side: THREE.BackSide, depthWrite: false,
      });
      this.envUniforms = envMat.uniforms;
      const skyCopy = new THREE.Mesh(this.sky.sky.geometry, envMat);
      skyCopy.scale.setScalar(80);
      this.envScene.add(skyCopy);
    }
    this.player = new Player(this, this.settings.profile);
    this.scene.add(this.player.root);
    this.islandWorld = W;
    this.islandVehicles = this.vehicles;
    this.islandNpcs = this.npcs;
    this.hud = new HUD(this);
    this._setupNet();
    onProgress(1, 'Ready');
  }

  // Cars parked around the island: [type, x, z, heading, colour]. Each is moved
  // to the nearest spot that is not inside a building.
  _parkCars() {
    const S = this.structures, sp = S.spawns, P = PLACES, C = P.spaceport;
    const list = [
      ['pickup', 60, 590, Math.PI / 2, 2], ['jeep', -262, 592, -Math.PI / 2, 5],
      ['sedan', sp.village.x + 30, sp.village.z + 8, 0.4, 0], ['gt', sp.village.x - 26, sp.village.z + 34, -0.6, 6],
      ['pickup', sp.farm.x + 12, sp.farm.z + 10, 1.2, 3], ['jeep', sp.beach.x + 20, sp.beach.z - 24, 2.5, 7],
      ['sedan', sp.lighthouse.x - 20, sp.lighthouse.z + 10, 1.0, 1], ['jeep', C.x - 32, C.z + 42, 0.2, 4], ['gt', C.x - 42, C.z + 56, -0.3, 2],
    ];
    return list.map(([type, x, z, h, ci]) => {
      let best = { x, z };
      search: for (let r = 0; r < 60; r += 4) for (let a = 0; a < 6.28; a += 0.8) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (!S.insideBuilding(px, pz, 3.2) && this.terrain.heightAt(px, pz) > 2) { best = { x: px, z: pz }; break search; }
      }
      return new Vehicle(type, { x: best.x, y: S.groundAt(best.x, best.z), z: best.z, heading: h }, { color: CAR_COLORS[ci % CAR_COLORS.length] });
    });
  }

  _lockUfo(locked) {
    const u = this.ufo;
    u.locked = locked;
    u.reset();
    if (locked) {
      u.quat.setFromEuler(new THREE.Euler(0.32, 0.7, 0.22));
      u.pos.y -= 1.4;
    }
  }

  _setupNet() {
    this.net = new Net({
      onStatus: (msg) => { document.querySelectorAll('#roomStatus, #pauseRoomStatus').forEach((el) => { el.textContent = msg; }); this.hud?.toast?.(msg, 2.5); },
      onRoom: (code, host) => this.onRoomChange?.(code, host),
      onJoin: (id, name) => { this.chatLine('', `${name} joined the island`, '#7dffd6'); this.audio.ping(); },
      onLeave: (id, p) => { const r = this.remotes.get(id); if (r) { r.dispose(); this.remotes.delete(id); } this.chatLine('', `${p.name} left`, '#9fb8c8'); },
      onState: (id, s, p) => {
        let r = this.remotes.get(id);
        if (!r) { r = new RemotePlayer(this.scene, id, p.name, p.color); this.remotes.set(id, r); }
        r.name = p.name;
        r.apply(s);
      },
      onChat: (name, text, color) => { this.chatLine(name, text, color); this.audio.ping(); },
      onTime: (v) => { if (!this.sky.real && Math.abs(v - this.sky.time) > 0.01) this.sky.setTime(v); },
      onNeedTime: (send) => send(this.sky.time),
      onFx: (m) => { if (m.k === 'crash' && Array.isArray(m.p) && (m.L || 'earth') === this.location) this._explode(tv.fromArray(m.p), false); },
    });
  }

  // ---- Lifecycle ---------------------------------------------------------------

  start({ spawn = 'airbase', time = 0.36 } = {}) {
    if (time === 'live') this.sky.setLive(true); else this.sky.setTime(time);
    const S = this.structures.spawns;
    const where = {
      airbase: { x: -150, z: 590, h: 0 }, village: { x: S.village.x, z: S.village.z, h: Math.PI },
      beach: { x: S.beach.x, z: S.beach.z, h: Math.PI }, farm: { x: S.farm.x, z: S.farm.z, h: 0 },
      spaceport: { x: S.spaceport.x, z: S.spaceport.z, h: S.spaceport.heading },
    }[spawn] || { x: -150, z: 590, h: 0 };
    this.player.spawnAt(where, where.h);
    this.player.camPos.set(where.x, this.world.groundAt(where.x, where.z) + 60, where.z - 40);
    this.running = true;
    this.hud.show(true);
    this.input.wantLock = true;
    this.intro = 2.5;
    setTimeout(() => { if (this.weather.live) this.hud.toast(this.weather.describe(), 5); }, 7000);
    setTimeout(() => this.hud.toast('Explore Kestrel Island · walk to an aircraft and press F · talk to people with E', 6), 900);
  }

  respawnPlayer() {
    if (this.location !== 'earth') { this._returnHome(); return; }
    this.player.spawnAt({ x: -150 + (Math.random() - 0.5) * 20, z: 590 }, 0);
    this.player.vehicle = null;
    this.hud.toast('Back at Kestrel Airbase', 3);
    this.fade(0.5);
  }

  fade(secs = 0.6, color = '#000') {
    const el = document.querySelector('#fade');
    el.style.background = color;
    el.style.transition = 'none';
    el.style.opacity = 1;
    requestAnimationFrame(() => { el.style.transition = `opacity ${secs}s ease`; el.style.opacity = 0; });
  }

  locationName() {
    if (this.location === 'space') { const n = this.space.nearest; return n.alt > n.r * 6 ? 'Deep Space' : { earth: 'Low Earth Orbit', moon: 'Lunar Orbit', mars: 'Mars Orbit' }[n.id]; }
    const p = this.focusPos();
    return this.world.terrain.regionName(p.x, p.z, p.y);
  }

  modeLabel() {
    const p = this.player;
    if (this.space.active) return this.space.warp ? 'WARP' : 'ORBIT';
    if (p.mode === 'vehicle' && p.vehicle) return p.vehicle.def.name.toUpperCase();
    if (p.mode === 'chute' || p.mode === 'fall') return 'PARACHUTE';
    if (p.swimming) return 'SWIMMING';
    return 'ON FOOT';
  }

  focusPos() {
    const p = this.player;
    if (this.space.active && this.space.craft) return this.space.craft.position;
    if (p.mode === 'vehicle' && p.vehicle) return p.vehicle.pos;
    if (p.mode === 'dead' && p.deathPos) return p.deathPos;
    return p.pos;
  }

  talk(npc) {
    this.talkingTo = npc;
    // Prefer hints for mysteries not yet found.
    this.hud.dialog(npc.name, npc.title, npc.nextLine());
    this.audio.talk();
  }

  chatLine(name, text, color = '#fff') {
    const log = document.querySelector('#chatLog');
    const div = document.createElement('div');
    div.innerHTML = name ? `<b style="color:${escapeHTML(color)}">${escapeHTML(name)}</b> ${escapeHTML(text)}` : `<i style="color:${escapeHTML(color)}">${escapeHTML(text)}</i>`;
    log.appendChild(div);
    while (log.children.length > 7) log.firstChild.remove();
    div.classList.add('fresh');
    setTimeout(() => div.classList.remove('fresh'), 9000);
  }

  // ---- Combat (energy bolts vs alien drones) ---------------------------------------

  fireBolt(v) {
    const fwd = tv.set(0, 0, 1).applyQuaternion(v.quat);
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(this.boltGeo, this.boltMat);
      m.position.copy(v.pos).addScaledVector(fwd, 8).add(tv2.set(side * 2.2, -0.3, 0).applyQuaternion(v.quat));
      m.quaternion.copy(v.quat);
      this.scene.add(m);
      this.bolts.push({ m, vel: fwd.clone().multiplyScalar(v.speed + 600), life: 2.2 });
    }
    this.audio.zap();
  }

  _updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const steps = 3;
      let dead = b.life <= 0;
      for (let s = 0; s < steps && !dead; s++) {
        b.m.position.addScaledVector(b.vel, dt / steps);
        const hit = this.aliens.hitDrone(b.m.position, 9);
        if (hit) {
          dead = true;
          this.fx.sparks.burst(hit.pos, { count: hit.dead ? 70 : 20, speed: hit.dead ? 40 : 18, color: hit.color, size: 3, life: 1, gravity: -5 });
          if (hit.dead) {
            this.score += 100; this.stats.drones++;
            this.hud.toast('DRONE CLEARED  +100');
            this.audio.pop();
          }
        } else if (b.m.position.y < this.world.groundAt(b.m.position.x, b.m.position.z)) {
          dead = true;
          this.fx.sparks.burst(b.m.position, { count: 10, speed: 10, color: 0x9ff4ff, size: 1.5, life: 0.5 });
        }
      }
      if (dead) { this.scene.remove(b.m); this.bolts.splice(i, 1); }
    }
  }

  _explode(p, local = true) {
    this.fx.sparks.burst(p, { count: 160, speed: 45, color: 0xffa24a, size: 4, life: 1.6, gravity: -9, intensity: 2.5 });
    this.fx.sparks.burst(p, { count: 60, speed: 25, color: 0xfff0c0, size: 6, life: 0.6, gravity: 0, intensity: 3 });
    this.fx.smoke.smoke(p, { count: 40, size: 9, life: 5, speed: 8, rise: 5, color: 0x3a3632 });
    if (local) { this.audio.crash(); this.flash = 0.6; }
    else if (p.distanceTo(this.focusPos()) < 800) this.audio.crash();
  }

  _vehicleEvent(v, result) {
    const p = this.player;
    if (result === 'bump') {
      if (v === p.vehicle) {
        p.shake = Math.max(p.shake, Math.min(0.9, v.bump * 0.05));
        this.audio.thump(v.bump);
        if (v.bump > 9) this.fx.sparks.burst(v.pos, { count: 14, speed: 9, color: 0xffd08a, size: 1.6, life: 0.5, gravity: -9 });
      }
      return;
    }
    if (result === 'landed') {
      if (v === p.vehicle) { this.hud.toast(v.kind === 'plane' ? 'Touchdown · nice landing' : 'Landed', 2); this.audio.land(); this.stats.flights++; }
      return;
    }
    // Crash (ground, water, building, tree).
    const where = v.pos.clone();
    const water = result === 'water';
    if (water) {
      this.fx.sparks.burst(where, { count: 120, speed: 25, color: 0xdff4ff, size: 3, life: 1.4, gravity: -12, up: 12, intensity: 1.2 });
      this.audio.splash();
    }
    this._explode(where, v === p.vehicle || where.distanceTo(this.focusPos()) < 600);
    v.crash();
    if (this.net.online) this.net.send({ t: 'fx', k: 'crash', p: where.toArray().map((x) => Math.round(x)), L: this.location });
    if (v === p.vehicle) {
      p.vehicle = null;
      p.die(where);
      this.hud.toast(water ? 'Ditched in the sea · returning to base' : 'Aircraft lost · returning to base', 3);
    }
  }

  // ---- Mysteries --------------------------------------------------------------

  discover(id) {
    if (!this.mysteries.discover(id)) return;
    const info = this.mysteries.info(id);
    this.hud.discovery(info, this.mysteries.count, MYSTERY_INFO.length);
    this.audio.discover();
    this.score += 1000;
    this.onProgress?.();
    if (id === 'crash') {
      this._lockUfo(false);
      this.fx.sparks.burst(this.ufo.pos, { count: 120, speed: 30, color: 0x7dffd6, size: 3, life: 1.5, gravity: 0 });
    }
    if (this.mysteries.count === MYSTERY_INFO.length) setTimeout(() => this.hud.toast('Every mystery solved. The Watcher dims its lights in greeting.', 6), 9500);
  }

  // ---- Space, the Moon and Mars ------------------------------------------------

  // Leave the atmosphere (from the island) or a moon's surface for orbit.
  enterSpace() {
    const v = this.player.vehicle;
    if (!v || this.location === 'space') return;
    const from = this.location;
    if (v.booster) v.booster.finish();
    this.fade(1.2, from === 'earth' ? '#fff' : '#000');
    v.group.parent?.remove(v.group);
    // In orbit every craft flies nose-first along +Z; the rocket is turned on its side.
    const wrap = new THREE.Group();
    v.group.position.set(0, 0, 0);
    v.group.quaternion.identity();
    if (v.kind === 'rocket') v.group.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    wrap.add(v.group);
    const cam = v.kind === 'rocket' ? { back: 42, up: 12, look: 12 } : v.kind === 'ship' ? { back: 42, up: 12, look: 4 } : {};
    this.space.enter(wrap, this.sky.time, from, cam, Math.sin(this.sky.decl));
    this.space.active = true;
    this.spaceVehicle = v;
    this.location = 'space';
    this.camera.near = 1; this.camera.far = 200000; this.camera.updateProjectionMatrix();
    this.post.setScene(this.space.scene, this.camera);
    this.hud.toast(from === 'earth' ? 'Orbit reached · press 1 Earth · 2 Moon · 3 Mars to warp · dive towards a world to land' : 'Back in orbit · 1 Earth · 2 Moon · 3 Mars', 5);
    if (v.parts.beam) v.parts.beam.visible = false;
    document.body.classList.add('in-space');
  }

  // Re-entry over the island.
  exitSpace() {
    const v = this.spaceVehicle;
    const wrap = this.space.leave();
    wrap?.remove(v.group);
    this.space.active = false;
    this.location = 'earth';
    document.body.classList.remove('in-space');
    this._setWorld('earth');
    this.fade(1.4, '#fff');
    this.scene.add(v.group);
    v.group.quaternion.identity();
    const sp = this.structures.spaceport;
    if (v.kind === 'ufo') { v.pos.set(0, 2700, 400); v.heading = Math.PI; v.vel.set(0, -60, -40); }
    else { v.pos.set(sp.lz.x + 250, 2700, sp.lz.z + 500); v.heading = Math.PI; v.vel.set(0, -60, -25); }
    if (v.kind === 'rocket') { v.prepareDescent(v.heading); v.vel.set(0, -70, 0); }
    else v.quat.setFromEuler(new THREE.Euler(0, v.heading, 0, 'YXZ'));
    v.onGround = false;
    this.camera.near = 0.3; this.camera.far = 30000; this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix();
    this.post.setScene(this.scene, this.camera);
    this.player.camPos.copy(v.pos).add(tv.set(0, 20, 60));
    this.reentry = 4;
    this.hud.toast(v.kind === 'rocket' ? 'Re-entry · relight the engine (W) and land on the pad · R holds you upright' : 'Re-entry · welcome home', 5);
  }

  // Descend to the Moon or Mars.
  enterSurface(body) {
    const v = this.spaceVehicle;
    let S = this.surfaces[body];
    if (!S) {
      const q = this.settings.quality;
      S = this.surfaces[body] = new SurfaceWorld(body, this.renderer, { shadows: this.renderer.shadowMap.enabled, shadowSize: q === 'high' ? 2048 : 1024 });
    }
    const wrap = this.space.leave();
    wrap?.remove(v.group);
    this.space.active = false;
    document.body.classList.remove('in-space');
    this.location = body;
    this.surface = S;
    this._setWorld(body);
    S.scene.add(v.group);
    v.group.quaternion.identity();
    v.heading = 0;
    v.pos.set(0, S.groundAt(0, 0) + 850, 160);
    v.onGround = false;
    if (v.kind === 'rocket') { v.prepareDescent(0); v.vel.set(0, -45, 0); }
    else { v.quat.setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ')); v.vel.set(0, -30, -10); }
    this.camera.near = 0.3; this.camera.far = 60000; this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix();
    this.post.setScene(S.scene, this.camera);
    this.player.camPos.copy(v.pos).add(tv.set(0, 25, 70));
    this.fade(1.4, '#000');
    const g = S.world.gravity;
    this.hud.toast(`Descending to ${S.name} · gravity ${(g * 9.81).toFixed(2)} m/s² (${Math.round(g * 100)}% of Earth)` + (v.kind === 'rocket' ? ' · land on your engine' : ''), 6);
  }

  // Swap the active world: the island, or a moon's surface.
  _setWorld(loc) {
    const p = this.player;
    if (loc === 'earth') {
      this.world = this.islandWorld;
      this.vehicles = this.islandVehicles;
      this.npcs = this.islandNpcs;
      this.scene.add(p.root, this.fx.sparks.points, this.fx.smoke.points);
      p.setSuit(false);
    } else {
      const S = this.surfaces[loc];
      this.world = S.world;
      this.vehicles = [this.spaceVehicle];
      this.npcs = NO_NPCS;
      S.scene.add(p.root, this.fx.sparks.points, this.fx.smoke.points);
      p.setSuit(true);
    }
  }

  // After losing a craft away from Earth: Mission Control brings you home.
  _returnHome() {
    const v = this.spaceVehicle;
    if (this.space.active) { this.space.leave(); this.space.active = false; document.body.classList.remove('in-space'); }
    this.location = 'earth';
    this._setWorld('earth');
    if (v) {
      v.group.parent?.remove(v.group);
      this.scene.add(v.group);
      v.group.quaternion.identity();
      v.occupied = false;
      v.reset();
      if (v === this.ufo) this._lockUfo(false);
    }
    this.camera.near = 0.3; this.camera.far = 30000; this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix();
    this.post.setScene(this.scene, this.camera);
    const S = this.structures.spawns.spaceport;
    this.player.spawnAt({ x: S.x, z: S.z }, S.heading);
    this.player.vehicle = null;
    this.fade(1.2);
    this.hud.toast('Mission lost · Kestrel Mission Control brought you home', 4);
  }

  _spaceControls() {
    const I = this.input, S = this.settings;
    const look = I.consumeLook();
    const mv = I.moveAxes(), ar = I.arrows();
    for (const [id, b] of Object.entries(BODIES)) {
      if (I.hit('Digit' + b.key) || I.hit('Numpad' + b.key)) {
        if (this.space.warp) continue;
        if (this.space.warpTo(id)) { this.hud.toast('Warp drive engaged · ' + b.name, 3); this.audio.teleport(); }
        else this.hud.toast(b.name + ' is right here', 2);
      }
    }
    return {
      moveY: mv.y,
      yaw: clamp(look.dx * 0.02 * S.sensitivity + mv.x + ar.x, -2, 2),
      pitch: clamp(-look.dy * 0.02 * S.sensitivity * (S.invertY ? -1 : 1) + (I.down('KeyI') ? 1 : 0) - (I.down('KeyK') ? 1 : 0), -2, 2),
      roll: (I.down('KeyE') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0),
      // Up and Down arrows climb and descend; Left and Right yaw; I and K pitch.
      up: I.down('Space') || I.down('ArrowUp') || I.tdown('up') ? 1 : 0,
      down: I.down('KeyC') || I.down('ArrowDown') || I.down('ControlLeft') || I.tdown('down') ? 1 : 0,
      boost: I.down('ShiftLeft') || I.tdown('boost'),
    };
  }

  // Rocket launch spectacle: countdown calls, ground clouds, exhaust sparks,
  // the service arm swinging away and a smoke trail in the atmosphere.
  _rocketFx(dt) {
    for (const v of this.vehicles) {
      if (v.kind !== 'rocket') continue;
      if (v.events?.length) {
        for (const e of v.events) {
          const mine = v === this.player.vehicle;
          if (e === 'countdown' && mine) { this.hud.toast('T-minus 3 · 2 · 1 …', 3); this.audio.ping(); }
          if (e === 'ignition' && mine) this.hud.toast('Ignition', 1.2);
          if (e === 'liftoff' && mine) this.hud.toast(this.location === 'earth' ? 'Liftoff! · steer with the mouse · Space to stage' : 'Liftoff', 3);
          if (e === 'staged') { if (mine) this.hud.toast('Stage separation · the booster is flying itself home', 3); this.audio.eject(); }
        }
        v.events.length = 0;
      }
      if (this.location === 'earth' && this.structures.spaceportArm) {
        const arm = this.structures.spaceportArm;
        arm.rotation.y = damp(arm.rotation.y, v.countdown > 0 || v.launched || v.throttle > 0.05 ? -1.5 : 0, 1.2, dt);
      }
      if (v.destroyed) continue;
      const th = v.thrustAcc > 0 ? v.throttle : 0;
      if (th < 0.05) continue;
      const up = tv.set(0, 1, 0).applyQuaternion(v.quat);
      const gh = this.world.groundAt(v.pos.x, v.pos.z);
      const agl = v.pos.y - gh;
      const air = this.world.air ?? 1;
      const n = Math.ceil(4 * th);
      for (let k = 0; k < n; k++) {
        const d = Math.random() * (v.stage === 2 ? 14 : 8);
        this.fx.sparks.emit(v.pos.x - up.x * d + (Math.random() - 0.5) * 2, v.pos.y - up.y * d, v.pos.z - up.z * d + (Math.random() - 0.5) * 2,
          -up.x * 90 + (Math.random() - 0.5) * 20, -up.y * 90, -up.z * 90 + (Math.random() - 0.5) * 20,
          { color: v.stage === 2 ? 0xffb060 : 0xc8d8ff, size: 3 + Math.random() * 3, life: 0.25 + Math.random() * 0.2, intensity: 2.2, drag: 2 });
      }
      // Billowing clouds where the plume hits the ground.
      if (agl < (v.stage === 2 ? 90 : 40)) {
        const k = 1 - agl / 90;
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10;
          this.fx.smoke.emit(v.pos.x + Math.cos(a) * r, gh + 1.5, v.pos.z + Math.sin(a) * r,
            Math.cos(a) * (18 + Math.random() * 22) * k, 1 + Math.random() * 4, Math.sin(a) * (18 + Math.random() * 22) * k,
            { color: air > 0.5 ? 0xf6f4f0 : 0x9a8a78, size: 10 + Math.random() * 10, life: air > 0.5 ? 6 + Math.random() * 5 : 2.5, grow: 14, drag: 0.35, intensity: air > 0.5 ? 0.95 : 0.5 });
        }
      }
      // Exhaust trail through the atmosphere.
      if (air > 0.5 && v.pos.y < 2800 && Math.random() < 0.6) {
        this.fx.smoke.emit(v.pos.x - up.x * 30, v.pos.y - up.y * 30, v.pos.z - up.z * 30, (Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3,
          { color: 0xf2f0ec, size: 8 + Math.random() * 6, life: 9 + Math.random() * 6, grow: 10, drag: 0.6, intensity: 0.85 });
      }
    }
  }

  // Remote players are drawn only when they share our location.
  _remotes(dt, scene) {
    for (const r of this.remotes.values()) {
      const here = ((r.state && r.state.L) || 'earth') === this.location;
      r.setScene(scene);
      r.setVisible(here);
      if (here) r.update(dt);
    }
  }

  _sunFlare(dt, sunDir, heightAt) {
    const cam = this.camera;
    let vis = 0;
    const ndc = tv2.copy(cam.position).addScaledVector(sunDir, 1000).project(cam);
    if (sunDir.y > -0.02 && ndc.z < 1 && Math.abs(ndc.x) < 1.3 && Math.abs(ndc.y) < 1.3) {
      vis = 1;
      for (let s = 30; s < 5000; s *= 1.35) {
        if (heightAt(cam.position.x + sunDir.x * s, cam.position.z + sunDir.z * s) > cam.position.y + sunDir.y * s) { vis = 0; break; }
      }
      vis *= 1 - smoothstep(1.0, 1.3, Math.max(Math.abs(ndc.x), Math.abs(ndc.y)));
    }
    this.sunVis = damp(this.sunVis, vis, 8, dt);
    return new THREE.Vector2(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
  }

  _surfaceFrame(dt, t) {
    const S = this.surface, p = this.player, I = this.input;
    p.update(dt);
    // The world clock keeps running on other worlds (and stays in step for multiplayer).
    this.sky.advance(dt);
    for (const v of this.vehicles) {
      const res = v.update(dt, v === p.vehicle ? p.ctl : null, this.world);
      if (res) this._vehicleEvent(v, res);
    }
    this._rocketFx(dt);
    if (p.mode === 'dead') p.deadCamera(dt, t);
    const cam = this.camera;
    cam.fov = p.fov; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    const focus = this.focusPos();
    S.update(dt, t, cam, focus);
    this.fx.sparks.update(dt); this.fx.smoke.update(dt);
    this.fx.sparks.setPixelScale(innerHeight * this.renderer.getPixelRatio());
    this.fx.smoke.setPixelScale(innerHeight * this.renderer.getPixelRatio());
    this.discoverTimer = (this.discoverTimer || 0) - dt;
    if (this.discoverTimer <= 0 && p.mode !== 'dead') {
      this.discoverTimer = 0.25;
      const id = S.checkSites(focus);
      if (id) this.discover(id);
    }
    // Climb high enough and you are back in orbit.
    const v = p.vehicle;
    if (v && !v.destroyed && v.kind === 'rocket' && v.launched && v.vel.y > 0 && v.pos.y - this.world.groundAt(v.pos.x, v.pos.z) > 1500) this.enterSpace();
    this._remotes(dt, S.scene);
    this.net.update(dt, p.netState(), this.sky.time);
    this.audio.update({ dt, vehicle: p.mode === 'vehicle' && v ? v.type : null, throttle: v?.throttle || 0, speed: v ? v.speed : 0, rpm: v?.rpm || 0, boosting: v?.boosting, night: 0, altitude: 0, coast: 0, space: true, vacuum: S.world.air < 0.01, menu: false, thrust: v?.thrustAcc > 0 });
    this.hud.update(dt);
    const sunScreen = this._sunFlare(dt, S.sunDir, (x, z) => S.heightAt(x, z));
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.post.update(dt, { sunScreen, sunVis: this.sunVis * 0.8, sunColor: S.sun.color, cloud: 0, night: 0, flash: this.flash });
    this.post.render();
    I.endFrame();
  }

  // ---- Frame -------------------------------------------------------------------

  frame(dt, t) {
    this.t = t;
    const I = this.input, p = this.player;
    this._hotkeys();
    if (this.paused) { this._render(dt); I.endFrame(); return; }
    this.world.night = this.sky.night;

    if (this.location === 'moon' || this.location === 'mars') { this._surfaceFrame(dt, t); return; }
    if (this.space.active) {
      if (this.sky.real) this.space.setTimeOfDay(this.sky.time, Math.sin(this.sky.decl));
      const res = this.space.update(dt, this._spaceControls(), this.camera);
      if (res === 'reentry') this.exitSpace();
      else if (res && res.startsWith('land:')) this.enterSurface(res.slice(5));
      const sv = this.spaceVehicle;
      if (sv && this.space.active) {
        const th = this.space.thrust || 0;
        if (sv.kind === 'rocket') { sv.parts.plume2Mat.uniforms.uThrottle.value = th; sv.parts.plume2Mat.uniforms.uTime.value = t; sv.parts.glow2.material.opacity = th; }
        if (sv.kind === 'ship') { sv.parts.plumeMat.uniforms.uThrottle.value = th; sv.parts.plumeMat.uniforms.uTime.value = t; sv.parts.liftMat.uniforms.uThrottle.value = 0; }
      }
      this.sky.update(dt, this.camera, this.camera.position, null, 5000);
      this.audio.update({ dt, vehicle: sv ? sv.type : 'ufo', speed: this.space.speed, rpm: 1, throttle: this.space.thrust || 0, space: true, vacuum: true, thrust: (this.space.thrust || 0) > 0, night: 1, altitude: 5000, coast: 0, boosting: I.down('ShiftLeft') });
      this._remotes(dt, this.space.scene);
      this.net.update(dt, this.player.netState(), this.sky.time);
      this.hud.update(dt);
      this.camera.fov = damp(this.camera.fov, 66 + (this.space.warpFov || 0), 3, dt); this.camera.updateProjectionMatrix();
      this.post.update(dt, { sunVis: 0, night: 0.6 });
      this.post.render();
      I.endFrame();
      return;
    }

    p.update(dt);
    // Vehicles (the player's gets the controls).
    for (const v of this.vehicles) {
      const res = v.update(dt, v === p.vehicle ? p.ctl : null, this.world);
      if (res) this._vehicleEvent(v, res);
    }
    this._rocketFx(dt);
    if (p.mode === 'dead') p.deadCamera(dt, t);
    if (this.debugCam) { this.camera.position.copy(this.debugCam.pos); this.camera.up.set(0, 1, 0); this.camera.lookAt(this.debugCam.look); }
    if (this.reentry > 0) {
      this.reentry -= dt;
      const u = this.spaceVehicle || this.ufo;
      for (let k = 0; k < 6; k++) this.fx.sparks.emit(u.pos.x + (Math.random() - 0.5) * 10, u.pos.y - 2, u.pos.z + (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 20 + Math.random() * 10, (Math.random() - 0.5) * 10, { color: 0xff8a3a, size: 5, life: 0.8, intensity: 2 });
    }

    // Camera projection tweaks.
    const cam = this.camera;
    cam.fov = p.fov;
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();

    const focus = this.focusPos();
    const alt = cam.position.y;
    this.sky.shadowRadius = p.mode === 'vehicle' ? 220 : 110;
    this.sky.update(dt, cam, focus, this.renderer, alt);
    this.weather.update(dt, cam, this.sky, this.clouds, this.scene.fog, this.ocean, alt);
    this.ocean.update(dt, this.sky, this.scene.fog);
    this.clouds.update(dt, this.sky, this.scene.fog);
    this.vegetation.update(dt, this.camera.position);
    this.structures.update(dt, t, this.sky);
    this.mysteries.update(dt, t, this.sky, this.fx);

    const onFoot = p.mode === 'foot';
    const flying = p.mode === 'vehicle' && p.vehicle && !p.vehicle.onGround;
    const ctx = {
      player: focus, playerOnFoot: onFoot, playerFlying: flying, night: this.sky.night, fx: this.fx,
      talkingTo: this.talkingTo,
      ufo: this.aliens.nearestSaucer(focus)?.pos || null,
      mothership: this.mysteries.sites.mothership.pos,
      armed: flying && p.vehicle.def.weapons,
      playerForward: flying ? tv.set(0, 0, 1).applyQuaternion(p.vehicle.quat).clone() : null,
      onSwarm: () => { this.hud.toast('Alien drone swarm ahead · fire with click / Space', 3.5); },
      onTeleport: () => this.audio.teleport(),
      onFlee: () => { if (flying) this.hud.toast('The saucer bolted into the clouds…', 2.5); },
    };
    this.npcs.update(dt, ctx, cam);
    this.aliens.update(dt, t, ctx);
    const beams = [];
    for (const s of this.aliens.saucers) if (s.beaming) beams.push({ pos: s.pos, radius: 11, owner: 'npc' });
    if (this.ufo.beamActive) beams.push({ pos: this.ufo.pos, radius: 12, owner: 'player' });
    this.animals.update(dt, t, beams, { onAbduct: () => { this.audio.moo(); this.hud.toast('A cow floats up into the saucer. It seems fine.'); } });
    this.traffic.update(dt, t, this.sky.night, this.focusPos(), this.vehicles);
    this._updateBolts(dt);
    this._trails(dt);
    this.fx.sparks.update(dt); this.fx.smoke.update(dt);
    this.fx.sparks.setPixelScale(innerHeight * this.renderer.getPixelRatio());
    this.fx.smoke.setPixelScale(innerHeight * this.renderer.getPixelRatio());

    // Mystery discovery.
    this.discoverTimer = (this.discoverTimer || 0) - dt;
    if (this.discoverTimer <= 0 && p.mode !== 'dead') {
      this.discoverTimer = 0.25;
      const fp = this.focusPos();
      const agl = fp.y - this.world.groundAt(fp.x, fp.z);
      const id = this.mysteries.check(fp, agl);
      if (id) this.discover(id);
    }

    // Remote players.
    this._remotes(dt, this.scene);
    this.net.update(dt, p.netState(), this.sky.time);

    // Environment reflections follow the sun.
    if (this.hasEnv) {
      this.envTimer -= dt;
      if (this.envTimer <= 0 || this.envNeedsUpdate) {
        this.envTimer = 6; this.envNeedsUpdate = false;
        const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
        if (this.envRT) this.envRT.dispose();
        this.envRT = rt;
        this.scene.environment = rt.texture;
      }
      this.sky.hemi.intensity *= 0.45;
    }

    this._audio(dt);
    this.hud.update(dt);
    this._render(dt);
    I.endFrame();
  }

  _trails(dt) {
    const v = this.player.vehicle;
    const pullG = v && v.kind === 'plane' && !v.onGround && (Math.abs(v.bankAngle()) > 0.5 || v.speed > 180);
    if (v && v.kind === 'plane') {
      const span = v.type === 'prop' ? 5.6 : 5;
      const side = tv2.set(1, 0, 0).applyQuaternion(v.quat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
      this.wingTrails.forEach((tr, i) => {
        const s = i ? -1 : 1;
        if (pullG) tr.push(tv.copy(v.pos).addScaledVector(side, s * span).addScaledVector(up, v.type === 'prop' ? 1.1 : 0), up);
        tr.update(pullG ? 1 : 0.6);
      });
    } else this.wingTrails.forEach((tr) => { tr.clear(); tr.update(0); });
    if (this.ufo.occupied && !this.ufo.onGround) {
      const up = new THREE.Vector3(0, 1, 0);
      this.ufoTrail.push(this.ufo.pos, up);
      this.ufoTrail.update(clamp(this.ufo.speed / 60, 0, 1));
    } else { this.ufoTrail.clear(); this.ufoTrail.update(0); }
  }

  _audio(dt) {
    const p = this.player, v = p.vehicle;
    const f = this.focusPos();
    const coastH = this.terrain.heightAt(f.x, f.z);
    const coast = f.y < 60 ? smoothstep(12, 1, Math.abs(coastH)) : 0;
    this.audio.horn(p.mode === 'vehicle' && !!v && !!v.horn);
    this.audio.update({
      dt, vehicle: p.mode === 'vehicle' && v ? (v.kind === 'car' ? 'car' : v.type) : null, skid: v?.skid || 0, throttle: v?.throttle || 0, speed: v ? v.speed : Math.hypot(p.vel.x, p.vel.z),
      rpm: v?.rpm || 0, boosting: v?.boosting, beam: v?.beamActive, night: this.sky.night, altitude: f.y, coast, space: false, menu: false,
    });
  }

  _render(dt) {
    // Sun flare visibility (above horizon, in front of the camera, not behind terrain).
    const cam = this.camera, sky = this.sky;
    let vis = 0;
    const sunPos = tv.copy(cam.position).addScaledVector(sky.sunDir, 1000);
    const ndc = sunPos.clone().project(cam);
    if (sky.sunDir.y > -0.02 && ndc.z < 1 && Math.abs(ndc.x) < 1.3 && Math.abs(ndc.y) < 1.3) {
      vis = 1;
      for (let s = 30; s < 5000; s *= 1.35) {
        const x = cam.position.x + sky.sunDir.x * s, y = cam.position.y + sky.sunDir.y * s, z = cam.position.z + sky.sunDir.z * s;
        if (this.terrain.heightAt(x, z) > y) { vis = 0; break; }
      }
      vis *= smoothstep(-0.02, 0.06, sky.sunDir.y) * (1 - smoothstep(1.0, 1.3, Math.max(Math.abs(ndc.x), Math.abs(ndc.y))));
    }
    this.sunVis = damp(this.sunVis, vis, 8, dt);
    const cloud = this.clouds.densityAt(cam.position.x, cam.position.y, cam.position.z);
    this.cloudFog = damp(this.cloudFog || 0, cloud, 4, dt);
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.post.update(dt, {
      sunScreen: new THREE.Vector2(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5),
      sunVis: this.sunVis * (1 - this.cloudFog) * 0.9, sunColor: sky.sunColor, cloud: this.cloudFog, night: sky.night, flash: this.flash,
    });
    this.post.render();
  }

  _hotkeys() {
    const I = this.input, H = this.hud;
    if (I.hit('KeyM')) H.toggleMap();
    if (I.hit('KeyJ')) H.toggleJournal();
    if (I.hit('KeyH')) document.querySelector('#help').classList.toggle('on');
    if (I.hit('KeyP')) { this.photo = !this.photo; document.body.classList.toggle('photo', this.photo); }
    this.sky.timeScale = I.down('KeyT') ? 60 : 1;
    if (I.hit('KeyY') && this.sky.real) { this.sky.offsetMs = 0; this.hud.toast('Back to real time', 1.6); }
    if (I.hit('KeyT')) this.hud.toast('Time-lapse · hold T', 1.2);
    if (H.mapOpen && this.t - (this._mapT || 0) > 0.5) { this._mapT = this.t; H.drawBigMap(); }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
    this.hud?.resize();
  }
}

