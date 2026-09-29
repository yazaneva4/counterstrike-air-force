// Game: builds the island and everything in it, runs the frame loop, and
// connects the player, aircraft, residents, visitors, mysteries, orbit,
// HUD, sound and multiplayer.

import * as THREE from 'three';
import { Terrain, PLACES } from './world/terrain.js';
import { Structures, RUNWAY } from './world/structures.js';
import { Vegetation } from './world/vegetation.js';
import { SkySystem } from './world/sky.js';
import { Ocean } from './world/water.js';
import { Clouds } from './world/clouds.js';
import { Mysteries, MYSTERY_INFO } from './world/mysteries.js';
import { NPCManager } from './actors/npc.js';
import { Animals } from './actors/animals.js';
import { Aliens } from './actors/aliens.js';
import { Traffic } from './actors/traffic.js';
import { Vehicle } from './vehicles/vehicles.js';
import { Player } from './player.js';
import { Particles, Trail } from './fx/particles.js';
import { PostFX } from './fx/postfx.js';
import { HUD } from './ui/hud.js';
import { Net } from './net/net.js';
import { RemotePlayer } from './net/remote.js';
import { Space } from './space/space.js';
import { clamp, damp, smoothstep, nextFrame, escapeHTML } from './core/util.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();

export class Game {
  constructor({ renderer, input, audio, settings }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbcd3e6, 0.0002);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 30000);
    this.score = 0;
    this.stats = { drones: 0, flights: 0 };
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
    };

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
    ];
    this.ufo = this.vehicles[this.vehicles.length - 1];
    this._lockUfo(!this.mysteries.found.has('crash'));
    for (const v of this.vehicles) this.scene.add(v.group);

    await step(0.78, 'Waking the residents');
    this.npcs = new NPCManager(W, this.scene, { count: q === 'low' ? 0.6 : 1 });
    this.animals = new Animals(W, this.scene);
    this.aliens = new Aliens(W, this.scene);
    this.traffic = new Traffic(this.scene, W);

    await step(0.88, 'Preparing orbit');
    this.fx = { sparks: new Particles(2500), smoke: new Particles(1200, { additive: false }) };
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
    this.hud = new HUD(this);
    this._setupNet();
    onProgress(1, 'Ready');
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
      onTime: (v) => { if (Math.abs(v - this.sky.time) > 0.01) this.sky.setTime(v); },
      onNeedTime: (send) => send(this.sky.time),
      onFx: (m) => { if (m.k === 'crash' && Array.isArray(m.p)) this._explode(tv.fromArray(m.p), false); },
    });
  }

  // ---- Lifecycle ---------------------------------------------------------------

  start({ spawn = 'airbase', time = 0.36 } = {}) {
    this.sky.setTime(time);
    const S = this.structures.spawns;
    const where = {
      airbase: { x: -150, z: 590, h: 0 }, village: { x: S.village.x, z: S.village.z, h: Math.PI },
      beach: { x: S.beach.x, z: S.beach.z, h: Math.PI }, farm: { x: S.farm.x, z: S.farm.z, h: 0 },
    }[spawn] || { x: -150, z: 590, h: 0 };
    this.player.spawnAt(where, where.h);
    this.player.camPos.set(where.x, this.world.groundAt(where.x, where.z) + 60, where.z - 40);
    this.running = true;
    this.hud.show(true);
    this.input.wantLock = true;
    this.intro = 2.5;
    setTimeout(() => this.hud.toast('Explore Kestrel Island · walk to an aircraft and press F · talk to people with E', 6), 900);
  }

  respawnPlayer() {
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

  modeLabel() {
    const p = this.player;
    if (this.space.active) return 'ORBIT';
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
    if (this.net.online) this.net.send({ t: 'fx', k: 'crash', p: where.toArray().map((x) => Math.round(x)) });
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
    if (id === 'crash') {
      this._lockUfo(false);
      this.fx.sparks.burst(this.ufo.pos, { count: 120, speed: 30, color: 0x7dffd6, size: 3, life: 1.5, gravity: 0 });
    }
    if (this.mysteries.count === MYSTERY_INFO.length) setTimeout(() => this.hud.toast('Every mystery solved. The Watcher dims its lights in greeting.', 6), 9500);
  }

  // ---- Space -----------------------------------------------------------------

  enterSpace() {
    if (this.space.active || this.player.vehicle !== this.ufo) return;
    this.fade(1.2, '#fff');
    this.scene.remove(this.ufo.group);
    this.space.enter(this.ufo.group, this.sky.time);
    this.space.active = true;
    this.camera.near = 1; this.camera.far = 200000; this.camera.updateProjectionMatrix();
    this.post.setScene(this.space.scene, this.camera);
    this.hud.toast('Leaving the atmosphere · Earth, the Sun and the Moon are ahead', 4);
    this.ufo.parts.beam.visible = false;
    document.body.classList.add('in-space');
  }

  exitSpace() {
    const craft = this.space.leave();
    this.space.active = false;
    document.body.classList.remove('in-space');
    this.fade(1.4, '#fff');
    this.scene.add(craft);
    const u = this.ufo;
    u.pos.set(0, 2700, 400);
    u.heading = Math.PI;
    u.vel.set(0, -60, -40);
    u.onGround = false;
    this.camera.near = 0.3; this.camera.far = 30000; this.camera.up.set(0, 1, 0); this.camera.updateProjectionMatrix();
    this.post.setScene(this.scene, this.camera);
    this.player.camPos.copy(u.pos).add(tv.set(0, 20, 60));
    this.reentry = 4;
    this.hud.toast('Re-entry · welcome home', 3);
  }

  _spaceControls() {
    const I = this.input, S = this.settings;
    const look = I.consumeLook();
    const mv = I.moveAxes(), ar = I.arrows();
    return {
      moveY: mv.y,
      yaw: clamp(look.dx * 0.02 * S.sensitivity + mv.x + ar.x, -2, 2),
      pitch: clamp(-look.dy * 0.02 * S.sensitivity * (S.invertY ? -1 : 1) + ar.y, -2, 2),
      roll: (I.down('KeyE') ? 1 : 0) - (I.down('KeyQ') ? 1 : 0),
      up: I.down('Space') || I.tdown('up') ? 1 : 0,
      down: I.down('KeyC') || I.tdown('down') ? 1 : 0,
      boost: I.down('ShiftLeft') || I.tdown('boost'),
    };
  }

  // ---- Frame -------------------------------------------------------------------

  frame(dt, t) {
    this.t = t;
    const I = this.input, p = this.player;
    this._hotkeys();
    if (this.paused) { this._render(dt); return; }
    this.world.night = this.sky.night;

    if (this.space.active) {
      const res = this.space.update(dt, this._spaceControls(), this.camera);
      if (this.space.nearMoonMonolith()) this.discover('moon');
      if (res === 'reentry') this.exitSpace();
      this.sky.update(dt, this.camera, this.camera.position, null, 5000);
      this.audio.update({ dt, vehicle: 'ufo', speed: this.space.speed, rpm: 1, space: true, night: 1, altitude: 5000, coast: 0, boosting: I.down('ShiftLeft') });
      this.hud.update(dt);
      this.camera.fov = damp(this.camera.fov, 66, 3, dt); this.camera.updateProjectionMatrix();
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
    if (p.mode === 'dead') p.deadCamera(dt, t);
    if (this.debugCam) { this.camera.position.copy(this.debugCam.pos); this.camera.up.set(0, 1, 0); this.camera.lookAt(this.debugCam.look); }
    if (this.reentry > 0) {
      this.reentry -= dt;
      const u = this.ufo;
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
    this.traffic.update(dt, t, this.sky.night);
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
    for (const r of this.remotes.values()) r.update(dt);
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
    this.audio.update({
      dt, vehicle: p.mode === 'vehicle' && v ? v.type : null, throttle: v?.throttle || 0, speed: v ? v.speed : Math.hypot(p.vel.x, p.vel.z),
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

