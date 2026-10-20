// Weapons: ten hand weapons (three blades, pistol, SMG, rifle, shotgun, sniper,
// rocket launcher, plasma rifle) plus frag grenades, usable on foot on Earth and
// on the Moon/Mars. Guns are hitscan from the crosshair (with spread, recoil and
// tracers); the launcher, plasma rifle and grenades are real projectiles; blades
// sweep a short cone. Everything pushes the physics props, knocks islanders down
// (harmlessly, like a car hit does), blinks the grey visitors away and shoots
// down alien drones. A small range at the airbase has steel plates and an ammo
// crate. Controls: 1-9/0 select (press again to holster), X holster, Mouse0 / FIRE
// attack, Mouse2 aim, R reload, G grenade.

import * as THREE from 'three';
import { stdMat, clamp, damp, lerp, smoothstep } from '../core/util.js';
import { PLACES } from '../world/terrain.js';
import { buildWeaponModel, grenadeModel, rocketModel } from './models.js';
import {
  WEAPON_DEFS, GRENADES, newAmmo, reloadFill, spreadDir, raySphere, rayCylinder, rayOrientedBox, blastFalloff,
} from './ballistics.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tq = new THREE.Quaternion();
const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
// First-person placement per gun: rest offset (camera space), scale and sight height for aiming.
const VM = {
  pistol: { x: 0.11, y: -0.15, z: -0.4, s: 1.0, sight: 0.06 },
  smg: { x: 0.15, y: -0.18, z: -0.42, s: 0.8, sight: 0.1 },
  rifle: { x: 0.16, y: -0.2, z: -0.44, s: 0.72, sight: 0.125 },
  shotgun: { x: 0.15, y: -0.17, z: -0.42, s: 0.8, sight: 0.07 },
  sniper: { x: 0.14, y: -0.18, z: -0.4, s: 0.62, sight: 0.12 },
  launcher: { x: 0.12, y: -0.19, z: -0.38, s: 0.62, sight: 0.145 },
  plasma: { x: 0.15, y: -0.19, z: -0.42, s: 0.8, sight: 0.075 },
};
const SLOT_LABEL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const CSS = `
#wpnHud{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);display:none;gap:6px;align-items:flex-end;pointer-events:none;z-index:6}
#wpnHud.on{display:flex}
#wpnHud .slot{min-width:46px;padding:5px 6px 4px;border-radius:9px;background:rgba(8,14,22,.55);border:1px solid rgba(255,255,255,.14);color:#cfe3f2;font:600 10px/1.15 system-ui,sans-serif;text-align:center;pointer-events:auto;cursor:pointer;backdrop-filter:blur(4px)}
#wpnHud .slot b{display:block;font-size:15px;line-height:1.05}
#wpnHud .slot.cur{border-color:#7fe3ff;background:rgba(20,60,84,.75);color:#fff;transform:translateY(-6px)}
#wpnHud .slot.empty{opacity:.45}
#ammo{position:absolute;right:22px;bottom:96px;display:none;color:#fff;text-align:right;font:700 13px system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 4px #000a;z-index:6}
#ammo.on{display:block}
#ammo .n{font-size:34px;line-height:1;letter-spacing:.5px}
#ammo .n small{font-size:16px;opacity:.7}
#ammo .nm{opacity:.85;font-weight:600;letter-spacing:.5px}
#ammo .g{margin-top:4px;opacity:.85;font-weight:600}
#xhair{position:absolute;left:50%;top:50%;width:0;height:0;display:none;pointer-events:none;z-index:6}
#xhair.on{display:block}
#xhair i{position:absolute;background:#fff;box-shadow:0 0 3px #000a;opacity:.9}
#xhair i:nth-child(1){width:2px;height:8px;left:-1px;top:calc(-14px - var(--s,0px))}
#xhair i:nth-child(2){width:2px;height:8px;left:-1px;top:calc(6px + var(--s,0px))}
#xhair i:nth-child(3){width:8px;height:2px;top:-1px;left:calc(-14px - var(--s,0px))}
#xhair i:nth-child(4){width:8px;height:2px;top:-1px;left:calc(6px + var(--s,0px))}
#xhair u{position:absolute;left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%;background:#ff5a3c}
#xhair.hit i{background:#ff4a3a}
#xhair.melee i:nth-child(n){opacity:.0}
#xhair.melee u{width:10px;height:10px;left:-5px;top:-5px;background:none;border:2px solid #fff9}
#scope{position:absolute;inset:0;display:none;pointer-events:none;z-index:5;background:radial-gradient(circle at 50% 50%,transparent 0,transparent 31vmin,#000 31.4vmin)}
#scope.on{display:block}
#scope::before,#scope::after{content:"";position:absolute;background:#000c}
#scope::before{left:50%;top:calc(50% - 31vmin);width:1px;height:62vmin}
#scope::after{top:50%;left:calc(50% - 31vmin);height:1px;width:62vmin}
#hitX{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;pointer-events:none;opacity:0;z-index:7;transition:opacity .25s}
#hitX::before,#hitX::after{content:"";position:absolute;left:12px;top:-2px;width:2px;height:30px;background:#fff;transform:rotate(45deg);box-shadow:0 0 4px #000}
#hitX::after{transform:rotate(-45deg)}
#hitX.on{opacity:1;transition:none}
`;

export class Weapons {
  constructor(game) {
    this.game = game;
    this.defs = WEAPON_DEFS;
    this.ammo = this.defs.map(newAmmo);
    this.grenades = GRENADES;
    this.cur = -1;
    this.armed = false;
    this.cd = 0;            // time until the next shot / swing may start
    this.drawT = 0;         // draw animation time left
    this.reloadT = 0;       // reload time left
    this.swingT = -1;       // melee / throw progress in seconds, -1 when idle
    this.swingHit = false;
    this.aimT = 0;          // 0..1 aim-down-sights blend
    this.kick = 0;
    this.vmKick = 0;
    this.flashT = 0;
    this.bobT = 0;
    this.models = new Map();
    this.vms = new Map();
    this.shown = null;      // third-person model currently in the hand
    this.group = new THREE.Group();
    this.group.name = 'combat';
    game.scene.add(this.group);
    this.tracers = []; this.tracerPool = [];
    this.holes = []; this.holeCursor = 0;
    this.projectiles = [];
    this.nades = [];
    this.targets = [];
    this.range = null;
    this.hintShown = false;
    this._rnd = Math.random;
    this._buildAssets();
    this._buildHud();
    this._buildRange();
  }

  // ---- Assets ---------------------------------------------------------------

  _buildAssets() {
    const tg = new THREE.BoxGeometry(0.012, 0.012, 1); tg.translate(0, 0, 0.5);
    this.tracerGeo = tg;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.plasmaMat = new THREE.MeshBasicMaterial({ color: 0x55f4ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const hole = new THREE.CircleGeometry(0.06, 10);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (let i = 0; i < 64; i++) { const m = new THREE.Mesh(hole, holeMat); m.visible = false; this.group.add(m); this.holes.push(m); }
    const scorch = new THREE.CircleGeometry(1, 20);
    this.scorchMat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.scorchGeo = scorch;
    this.scorches = []; this.scorchCursor = 0;
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(scorch, this.scorchMat); m.visible = false; this.group.add(m); this.scorches.push(m); }
    this.rocketMesh = rocketModel();
    this.nadeMesh = grenadeModel();
    this.boltGeo = new THREE.SphereGeometry(0.12, 10, 8); this.boltGeo.scale(1, 1, 3);
  }

  // The physics props of the world the player is in (island or a moon's surface).
  _props() { const G = this.game; return G.location === 'earth' ? G.props : (G.surface?.props ?? null); }

  _model(id) {
    let m = this.models.get(id);
    if (!m) { m = buildWeaponModel(id); this.models.set(id, m); }
    return m;
  }

  // First-person copy of a weapon plus gloved hands, built on demand.
  _vm(i) {
    let vm = this.vms.get(i);
    if (vm) return vm;
    const def = this.defs[i];
    vm = new THREE.Group();
    const model = buildWeaponModel(def.id);
    model.rotation.set(0, 0, 0);
    // Sight-line offsets so aiming lines the optic / front sight up with the crosshair.
    vm.add(model);
    const sleeve = stdMat(0x2c3a4a, { rough: 0.85 }), glove = stdMat(0x1a1b1d, { rough: 0.8 });
    const arm = (x, y, z, rx, ry, len) => {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, len, 10), sleeve);
      a.position.set(x, y, z); a.rotation.set(rx, ry, 0); vm.add(a);
      return a;
    };
    const hand = (x, y, z) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glove); h.scale.set(1, 0.85, 1.25); h.position.set(x, y, z); vm.add(h); return h; };
    if (def.type === 'melee') {
      hand(0, -0.01, -0.02); arm(0.0, -0.17, -0.2, -1.1, 0, 0.45);
    } else {
      hand(0, -0.03, 0.0); arm(0.02, -0.17, -0.2, -1.2, 0, 0.45);
      if (def.id !== 'pistol') { const fz = def.id === 'launcher' ? 0.34 : def.id === 'sniper' ? 0.42 : def.id === 'shotgun' ? 0.4 : def.id === 'smg' ? 0.2 : 0.32; hand(-0.0, -0.045, fz); arm(-0.1, -0.2, fz - 0.15, -1.2, -0.25, 0.45); }
      else { hand(-0.03, -0.065, 0.0); }
    }
    vm.userData.model = model;
    vm.visible = false;
    this.group.add(vm);
    this.vms.set(i, vm);
    return vm;
  }

  _buildHud() {
    if (document.getElementById('wpnHud')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const hud = document.getElementById('hud') || document.body;
    const bar = document.createElement('div'); bar.id = 'wpnHud';
    this.slotEls = this.defs.map((d, i) => {
      const el = document.createElement('div'); el.className = 'slot';
      el.innerHTML = `<b>${d.icon}</b>${SLOT_LABEL[i]}`;
      el.title = d.name;
      el.addEventListener('click', () => this.select(i));
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.select(i); }, { passive: false });
      bar.appendChild(el); return el;
    });
    const ammo = document.createElement('div'); ammo.id = 'ammo';
    ammo.innerHTML = '<div class="nm"></div><div class="n"></div><div class="g"></div>';
    const xh = document.createElement('div'); xh.id = 'xhair'; xh.innerHTML = '<i></i><i></i><i></i><i></i><u></u>';
    const scope = document.createElement('div'); scope.id = 'scope';
    const hx = document.createElement('div'); hx.id = 'hitX';
    hud.append(bar, ammo, xh, scope, hx);
    this.el = { bar, ammo, nm: ammo.querySelector('.nm'), n: ammo.querySelector('.n'), g: ammo.querySelector('.g'), xh, scope, hx };
    this._hudKey = '';
  }

  _updateHud(dt) {
    const E = this.el;
    if (!E) return;
    const on = this.canUse() && !this.game.photo;
    E.bar.classList.toggle('on', on);
    E.ammo.classList.toggle('on', on && this.cur >= 0 || (on && this.grenades >= 0 && this.cur < 0 && false));
    const d = this.cur >= 0 ? this.defs[this.cur] : null;
    const a = d ? this.ammo[this.cur] : null;
    const key = [on, this.cur, a?.mag, a?.reserve, this.grenades, this.reloadT > 0].join('|');
    if (key !== this._hudKey) {
      this._hudKey = key;
      this.slotEls.forEach((el, i) => { el.classList.toggle('cur', i === this.cur); el.classList.toggle('empty', this.defs[i].type !== 'melee' && this.ammo[i].mag + this.ammo[i].reserve <= 0); });
      if (d) {
        E.nm.textContent = d.name + (this.reloadT > 0 ? ' · reloading' : '');
        E.n.innerHTML = d.type === 'melee' ? '<small>MELEE</small>' : `${a.mag}<small> / ${a.reserve}</small>`;
        E.g.textContent = `G · grenades ${this.grenades}`;
      }
    }
    const firstPerson = this.game.player.cockpit;
    const showX = on && d && (d.type !== 'melee' || true);
    E.xh.classList.toggle('on', !!showX && !(d?.scope && this.aimT > 0.85));
    E.xh.classList.toggle('melee', !!d && d.type === 'melee');
    const sp = d && d.type !== 'melee' ? (d.spread || 0) * 300 + (this.moveSpread || 0) * 14 + this.vmKick * 10 - this.aimT * 3 : 0;
    E.xh.style.setProperty('--s', Math.max(0, sp).toFixed(1) + 'px');
    E.scope.classList.toggle('on', on && !!d?.scope && this.aimT > 0.85);
    if (this.hitFlash > 0) { this.hitFlash -= dt; if (this.hitFlash <= 0) E.hx.classList.remove('on'); }
    void firstPerson;
  }

  _marker() { if (this.el) { this.el.hx.classList.add('on'); this.hitFlash = 0.18; } }

  // ---- Range -------------------------------------------------------------------

  _buildRange() {
    const G = this.game, W = G.world;
    // Find clear, level ground near the airbase for a firing line facing east.
    const ab = PLACES.airbase;
    let best = null;
    for (let r = 70; r <= 260 && !best; r += 20) {
      for (let a = 0; a < 16 && !best; a++) {
        const x = ab.x + Math.cos(a * 0.7) * r, z = ab.z + Math.sin(a * 0.7) * r;
        let ok = true, base = W.groundAt(x, z);
        for (let k = 0; k <= 10 && ok; k++) {
          for (const sz of [-8, 0, 8]) {
            const px = x + k * 9, pz = z + sz;
            if (W.structures.insideBuilding(px, pz, 4) || Math.abs(W.groundAt(px, pz) - base) > 0.9 || W.groundAt(px, pz) < 1.2) { ok = false; break; }
          }
        }
        if (ok) best = { x, z };
      }
    }
    if (!best) return;
    const g = new THREE.Group(); g.name = 'range';
    const steel = stdMat(0xc9d0d6, { rough: 0.35, metal: 0.8 }), red = stdMat(0xd4352a, { rough: 0.5 }), white = stdMat(0xf2f2f2, { rough: 0.5 }), post = stdMat(0x5a4a38, { rough: 0.8 });
    this.range = { x: best.x, z: best.z, g };
    const plateGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.035, 24); plateGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.12, 0.2, 24);
    const dists = [14, 24, 36, 50, 66, 84];
    dists.forEach((d, i) => {
      const x = best.x + d, z = best.z + (i % 2 ? 3 : -3), y = W.groundAt(x, z);
      const holder = new THREE.Group(); holder.position.set(x, y, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.3, 8), post); pole.position.y = 0.65; pole.castShadow = true; holder.add(pole);
      const plate = new THREE.Group(); plate.position.set(0, 1.5, 0);
      const disc = new THREE.Mesh(plateGeo, steel); disc.castShadow = true; plate.add(disc);
      const ring = new THREE.Mesh(ringGeo, i % 2 ? red : white); ring.position.z = -0.019; ring.rotation.y = Math.PI; plate.add(ring);
      const ring2 = new THREE.Mesh(ringGeo, i % 2 ? red : white); ring2.position.z = 0.019; plate.add(ring2);
      plate.rotation.y = Math.PI / 2; // faces west, towards the firing line
      const tilt = new THREE.Group(); tilt.position.set(0, 1.5, 0); tilt.add(plate); plate.position.set(0, 0, 0); holder.add(tilt);
      // Distance marker.
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const x2 = c.getContext('2d'); x2.fillStyle = '#f2efe6'; x2.fillRect(0, 0, 128, 64); x2.fillStyle = '#222'; x2.font = 'bold 40px sans-serif'; x2.textAlign = 'center'; x2.fillText(d + ' m', 64, 46);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      sign.position.set(-0.05, 0.55, 0); sign.rotation.y = -Math.PI / 2; holder.add(sign);
      g.add(holder);
      this.targets.push({ holder, tilt, pos: new THREE.Vector3(x, y + 1.5, z), r: 0.32, down: 0, t: 0, dist: d });
    });
    // Firing line bench and the ammo crate.
    const crate = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), stdMat(0x66724a, { rough: 0.7 })); box.position.y = 0.25; box.castShadow = true; crate.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.06, 0.64), stdMat(0x4f5a38, { rough: 0.7 })); lid.position.y = 0.53; crate.add(lid);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.52, 0.62), stdMat(0xe0b040, { rough: 0.6 })); stripe.position.y = 0.26; crate.add(stripe);
    crate.position.set(best.x - 3, W.groundAt(best.x - 3, best.z + 3), best.z + 3);
    crate.rotation.y = 0.4;
    g.add(crate);
    this.range.crate = crate.position.clone();
    const sg = document.createElement('canvas'); sg.width = 256; sg.height = 128;
    const sx = sg.getContext('2d'); sx.fillStyle = '#1d2a3a'; sx.fillRect(0, 0, 256, 128); sx.fillStyle = '#ffd24a'; sx.font = 'bold 30px sans-serif'; sx.textAlign = 'center'; sx.fillText('FIRING RANGE', 128, 52); sx.fillStyle = '#fff'; sx.font = '20px sans-serif'; sx.fillText('hit the steel plates · ammo crate', 128, 88);
    const stex = new THREE.CanvasTexture(sg); stex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: stex, roughness: 0.7 }));
    const sgz = best.z - 9, sgy = W.groundAt(best.x - 6, sgz);
    sign.position.set(best.x - 6, sgy + 1.9, sgz); sign.rotation.y = Math.PI / 2; sign.castShadow = true;
    const sp1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), post); sp1.position.set(best.x - 6.05, sgy + 1.1, sgz - 0.9);
    const sp2 = sp1.clone(); sp2.position.z = sgz + 0.9;
    g.add(sign, sp1, sp2);
    G.scene.add(g);
    // Register for the minimap/journal-free world: expose the range for spawn / debugging.
    this.range.spawn = { x: best.x - 8, z: best.z };
  }

  _updateRange(dt, p) {
    const R = this.range;
    if (!R) return;
    for (const t of this.targets) {
      if (t.down > 0) { t.down -= dt; t.t = Math.min(1, t.t + dt * 8); if (t.down <= 0) t.t = 1; }
      else t.t = Math.max(0, t.t - dt * 3);
      t.tilt.rotation.x = -t.t * 1.45 + Math.sin(performance.now() * 0.02) * 0.0;
      if (t.swing) { t.swing = Math.max(0, t.swing - dt); t.tilt.rotation.z = Math.sin((1 - t.swing) * 18) * 0.15 * t.swing; }
    }
    if (p.mode === 'foot' && this.game.location === 'earth') {
      const dx = p.pos.x - R.crate.x, dz = p.pos.z - R.crate.z;
      if (dx * dx + dz * dz < 6.5 && (this.restockCD || 0) <= 0) {
        if (this.restock()) this.game.hud.toast('Ammo crate · weapons restocked', 2.2);
        this.restockCD = 3;
      }
    }
    this.restockCD = (this.restockCD || 0) - dt;
  }

  // ---- State ----------------------------------------------------------------------

  canUse() {
    const p = this.game.player;
    return p.mode === 'foot' && !this.game.paused && !this.game.space?.active;
  }

  restock() {
    let changed = false;
    this.defs.forEach((d, i) => {
      if (d.type === 'melee') return;
      if (this.ammo[i].mag !== d.mag || this.ammo[i].reserve !== d.reserve) changed = true;
      this.ammo[i] = newAmmo(d);
    });
    if (this.grenades !== GRENADES) changed = true;
    this.grenades = GRENADES;
    this._hudKey = '';
    return changed;
  }

  reset() { this.restock(); this.holster(true); }

  select(i) {
    if (!this.canUse() || i < 0 || i >= this.defs.length) return;
    if (this.cur === i) { this.holster(); return; }
    this.cur = i; this.armed = true;
    this.reloadT = 0; this.swingT = -1; this.cd = 0.1; this.drawT = 0.38; this.aimT = 0;
    this.game.audio?.weapon('draw');
    this.game.hud.toast(this.defs[i].name, 1.4);
    this._hudKey = '';
  }

  holster(silent = false) {
    if (this.cur < 0) return;
    this.cur = -1; this.armed = false; this.reloadT = 0; this.swingT = -1; this.aimT = 0;
    if (!silent) this.game.audio?.weapon('draw');
    this._hudKey = '';
  }

  cycle(dir = 1) {
    const n = this.defs.length;
    this.select(((this.cur < 0 ? (dir > 0 ? -1 : 0) : this.cur) + dir + n) % n);
  }

  // ---- Ray casting ---------------------------------------------------------------

  // Nearest thing along the ray, or null. Kinds: terrain, water, building, tree, npc, grey, drone, vehicle, prop, cow, target.
  castRay(o, d, maxDist, { skipActors = false } = {}) {
    const G = this.game, W = G.world;
    let best = { t: maxDist, kind: null };
    const consider = (t, kind, obj, nx, ny, nz) => {
      if (t >= 0 && t < best.t) best = { t, kind, obj, nx, ny, nz };
    };
    // Terrain and sea: march with an adaptive step, refine the crossing by bisection.
    const earth = G.location === 'earth';
    let prevT = 0;
    let prevAbove = o.y - W.groundAt(o.x, o.z) > 0;
    for (let t = 0.6; t <= best.t + 1; ) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const gh = W.groundAt(x, z);
      if (y < gh && prevAbove) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 7; k++) {
          const m = (lo + hi) / 2;
          if (o.y + d.y * m < W.groundAt(o.x + d.x * m, o.z + d.z * m)) hi = m; else lo = m;
        }
        const th = (lo + hi) / 2;
        const px = o.x + d.x * th, pz = o.z + d.z * th;
        const n = W.terrain?.normalAt?.(px, pz);
        const sea = earth && W.terrain && W.terrain.heightAt(px, pz) < 0 && W.structures.platformAt(px, pz) === -Infinity;
        consider(th, sea ? 'water' : 'terrain', null, n ? n.x : 0, n ? n.y : 1, n ? n.z : 0);
        break;
      }
      if (earth && y < 0 && o.y > 0 && d.y < 0 && W.terrain && W.terrain.heightAt(x, z) < -0.3) {
        consider(Math.max(0, -o.y / d.y), 'water', null, 0, 1, 0);
        break;
      }
      prevT = t; prevAbove = y >= gh;
      t += clamp(0.5 + t * 0.012, 0.5, 4);
      if (t > best.t + 4) break;
    }
    // Buildings (oriented boxes).
    for (const b of W.structures?.colliders ?? []) {
      const r = rayOrientedBox(o.x, o.y, o.z, d.x, d.y, d.z, b);
      if (r && r.t < best.t) consider(r.t, 'building', b, r.nx, r.ny, r.nz);
    }
    // Trunks.
    if (W.vegetation?.near) {
      const seen = new Set();
      const lim = Math.min(best.t, 320);
      for (let t = 0; t <= lim; t += 12) {
        W.vegetation.near(o.x + d.x * t, o.z + d.z * t, (c) => {
          if (seen.has(c)) return; seen.add(c);
          const g0 = W.groundAt(c.x, c.z);
          const th = rayCylinder(o.x, o.y, o.z, d.x, d.y, d.z, c.x, c.z, Math.max(0.2, c.r * 0.55), g0, c.top ?? g0 + 8);
          if (th < best.t) consider(th, 'tree', c, -d.x, 0, -d.z);
        });
      }
    }
    if (!skipActors) {
      for (const n of earth ? (G.npcs?.list ?? []) : []) {
        if (!n.root.visible) continue;
        const p = n.root.position, dx = p.x - o.x, dz = p.z - o.z;
        if (dx * dx + dz * dz > (best.t + 3) ** 2) continue;
        const lying = n.tumble && !n.tumble.air;
        for (const [h, r] of lying ? [[0.25, 0.5]] : [[0.4, 0.32], [1.0, 0.3], [1.55, 0.2]]) {
          const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y + h, p.z, r);
          if (th < best.t) consider(th, 'npc', n, -d.x, 0, -d.z);
        }
      }
      for (const gr of earth ? (G.aliens?.greys ?? []) : []) {
        if (!gr.root.visible) continue;
        const p = gr.root.position;
        for (const [h, r] of [[0.5, 0.3], [1.2, 0.3], [1.65, 0.25]]) {
          const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y + h, p.z, r);
          if (th < best.t) consider(th, 'grey', gr, -d.x, 0, -d.z);
        }
      }
      for (const dr of earth ? (G.aliens?.drones ?? []) : []) {
        const p = dr.group.position;
        const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y, p.z, 3.4);
        if (th < best.t) consider(th, 'drone', dr, -d.x, 0, -d.z);
      }
      for (const v of G.vehicles ?? []) {
        if (v.destroyed || !v.group.visible || v.occupied) continue;
        const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, v.pos.x, v.pos.y + 0.8, v.pos.z, Math.max(1.4, v.radius * 0.5));
        if (th < best.t) consider(th, 'vehicle', v, -d.x, 0, -d.z);
      }
      for (const b of this._props()?.physics?.bodies ?? []) {
        const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, b.p.x, b.p.y, b.p.z, Math.max(0.3, b.radius * 0.85));
        if (th < best.t) consider(th, 'prop', b, -d.x, 0, -d.z);
      }
      for (const c of earth ? (G.animals?.cows ?? []) : []) {
        if (!c.group.visible) continue;
        const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, c.x, c.group.position.y + 1.1, c.z, 1.0);
        if (th < best.t) consider(th, 'cow', c, -d.x, 0, -d.z);
      }
    }
    for (const t of this.targets) {
      if (t.t > 0.5) continue;
      const th = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, t.pos.x, t.pos.y, t.pos.z, t.r);
      if (th < best.t) consider(th, 'target', t, -1, 0, 0);
    }
    if (!best.kind) return null;
    best.point = new THREE.Vector3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
    return best;
  }

  // Camera ray adjusted so rays start at the shooter's chest in third person.
  _aimRay() {
    const p = this.game.player, cam = this.game.camera;
    cam.getWorldDirection(tv2);
    const dir = tv2.clone();
    const origin = cam.position.clone();
    if (!p.cockpit) {
      // Project the chest point onto the view axis so walls behind the shooter never block a shot.
      const chest = tv3.copy(p.pos); chest.y += (p.eyeHeight ?? 1.6) - 0.15;
      const s = Math.max(0, chest.sub(origin).dot(dir));
      origin.addScaledVector(dir, s);
    }
    return { origin, dir };
  }

  _muzzle(out) {
    const p = this.game.player, def = this.defs[this.cur];
    if (p.cockpit) {
      const vm = this.vms.get(this.cur);
      const mz = vm?.userData.model.userData.muzzle;
      if (vm && mz) { vm.updateWorldMatrix(true, true); return out.copy(mz).applyMatrix4(vm.userData.model.matrixWorld); }
    } else if (this.shown) {
      const mz = this.shown.userData.muzzle;
      if (mz) { this.shown.updateWorldMatrix(true, false); return out.copy(mz).applyMatrix4(this.shown.matrixWorld); }
    }
    void def;
    const { origin, dir } = this._aimRay();
    return out.copy(origin).addScaledVector(dir, 0.8);
  }

  // ---- Effects ---------------------------------------------------------------------

  _tracer(from, to, plasma = false) {
    let m = this.tracerPool.pop();
    if (!m) { m = new THREE.Mesh(this.tracerGeo, this.tracerMat); m.frustumCulled = false; this.group.add(m); }
    m.material = plasma ? this.plasmaMat : this.tracerMat;
    m.position.copy(from);
    const len = from.distanceTo(to);
    m.scale.set(1, 1, Math.max(0.1, Math.min(len, plasma ? len : 90)));
    m.lookAt(to);
    // Long shots show a streak segment near the muzzle and not the whole line.
    if (!plasma && len > 90) m.position.lerp(to, 0.0);
    m.visible = true;
    this.tracers.push({ m, life: 0.07 });
  }

  _impact(hit, def, dir) {
    const G = this.game, fx = G.fx, p = hit.point;
    const up = tv.set(hit.nx ?? 0, hit.ny ?? 1, hit.nz ?? 0);
    switch (hit.kind) {
      case 'terrain': fx.sparks.burst(p, { count: 7, speed: 2.4, color: 0xb9a27a, size: 0.14, life: 0.55, gravity: -7, up: 1.5 }); fx.smoke.smoke?.(p, { count: 2, size: 0.8, life: 1.1, speed: 0.6, rise: 0.5, color: 0x8a7b62 }); this._hole(p, up); break;
      case 'building': fx.sparks.burst(p, { count: 9, speed: 3.2, color: 0xffd9a0, size: 0.1, life: 0.4, gravity: -8, up: 1 }); this._hole(p, up); break;
      case 'tree': fx.sparks.burst(p, { count: 6, speed: 2, color: 0xa07a48, size: 0.12, life: 0.5, gravity: -6 }); break;
      case 'water': fx.sparks.burst(p, { count: 10, speed: 3.2, color: 0xcfe9ff, size: 0.28, life: 0.7, gravity: -9, up: 2.4 }); G.audio?.splash && Math.random() < 0.3 && G.audio.splash(); break;
      case 'vehicle': fx.sparks.burst(p, { count: 10, speed: 4, color: 0xffe0a0, size: 0.1, life: 0.4, gravity: -8 }); G.audio?.weapon('ricochet'); break;
      case 'target': fx.sparks.burst(p, { count: 8, speed: 3, color: 0xfff0c0, size: 0.1, life: 0.35, gravity: -8 }); break;
      default: fx.sparks.burst(p, { count: 5, speed: 2, color: 0xffd9a0, size: 0.1, life: 0.3, gravity: -7 });
    }
    void def; void dir;
  }

  _hole(p, n) {
    const m = this.holes[this.holeCursor++ % this.holes.length];
    m.position.copy(p).addScaledVector(n, 0.012);
    m.lookAt(tv2.copy(p).add(n));
    m.scale.setScalar(0.7 + Math.random() * 0.6);
    m.visible = true;
  }

  _scorch(p, n, r) {
    const m = this.scorches[this.scorchCursor++ % this.scorches.length];
    m.position.copy(p).addScaledVector(n, 0.02);
    m.lookAt(tv2.copy(p).add(n));
    m.scale.setScalar(r);
    m.visible = true;
  }

  // ---- Damage ------------------------------------------------------------------------

  _hitThing(hit, def, dir, { melee = false, power = 1 } = {}) {
    const G = this.game, kind = hit.kind;
    const force = (def.force ?? 5) * power;
    if (kind === 'npc') {
      hit.obj.knock?.(dir.x * (3 + force * 0.25), dir.z * (3 + force * 0.25), 2.6 + force * 0.08);
      G.audio?.thump(3);
      this._marker();
      if (!this.hintShown) { this.hintShown = true; G.hud.toast(hit.obj.name + ' tumbles over, startled but unhurt. Islanders are tougher than they look.', 3.2); }
    } else if (kind === 'grey') {
      const gr = hit.obj;
      G.fx.sparks.burst(tv.copy(gr.root.position).setY(gr.root.position.y + 1), { count: 40, speed: 12, color: 0x7dffd6, size: 0.5, life: 0.8, gravity: 0 });
      gr.hidden = 3 + Math.random() * 4; gr.root.visible = false;
      G.audio?.teleport();
      this._marker();
    } else if (kind === 'drone') {
      const r = G.aliens.hitDrone(hit.obj.group.position, 4);
      if (r) {
        G.fx.sparks.burst(r.pos, { count: r.dead ? 70 : 18, speed: r.dead ? 40 : 14, color: r.color, size: 2.4, life: 1, gravity: -5 });
        if (r.dead) { G.score += 100; G.stats.drones++; G.hud.toast('DRONE CLEARED  +100'); G.audio.pop(); }
      }
      this._marker();
    } else if (kind === 'prop') {
      const b = hit.obj;
      this._props()?.physics.applyImpulse(b, tv.copy(dir).multiplyScalar(force * (melee ? 1.4 : 0.8) * Math.min(6, 1 / (b.invM * 12) + 0.5)), hit.point);
      G.audio?.weapon(melee ? 'hit' : 'ricochet');
    } else if (kind === 'cow') {
      G.audio?.moo();
      G.fx.sparks.burst(hit.point, { count: 6, speed: 2, color: 0xe0d8c0, size: 0.2, life: 0.5, gravity: -3 });
    } else if (kind === 'target') {
      const t = hit.obj;
      if (t.down <= 0) {
        t.down = 4; t.t = 0.01; t.swing = 0.5;
        G.score += 10;
        G.hud.toast(`Target down · ${t.dist} m  +10`, 1.4);
      }
      G.audio?.weapon('ding'); this._marker();
    } else if (kind === 'vehicle') {
      G.audio?.weapon(melee ? 'clang' : 'ricochet');
    } else if (melee && (kind === 'building' || kind === 'terrain' || kind === 'tree')) {
      G.audio?.weapon('clang');
    }
  }

  _explode(p, def, normal) {
    const G = this.game, fx = G.fx;
    const R = def.blast ?? 9, F = def.force ?? 20;
    fx.sparks.burst(p, { count: 90, speed: 26, color: 0xffa030, size: 1.2, life: 0.9, gravity: -8, intensity: 2.4 });
    fx.sparks.burst(p, { count: 30, speed: 10, color: 0xfff0c0, size: 2.2, life: 0.35, gravity: 0, intensity: 3 });
    fx.smoke.smoke(p, { count: 10, size: 4, life: 2.6, speed: 4, rise: 3, color: 0x6a645a });
    this._props()?.explode(p, { radius: R * 1.5, strength: F });
    if (this._props()?.debris) this._props().debris(p, tv.set(0, 6, 0), { count: 8, color: 0x6a5a48 });
    for (const n of G.npcs?.list ?? []) {
      const dx = n.root.position.x - p.x, dz = n.root.position.z - p.z, dy = n.root.position.y - p.y, d = Math.hypot(dx, dy, dz);
      if (d < R * 1.4) { const k = blastFalloff(d, R * 1.4); n.knock?.(dx / (Math.hypot(dx, dz) || 1) * (4 + k * 12), dz / (Math.hypot(dx, dz) || 1) * (4 + k * 12), 3 + k * 6); }
    }
    for (const gr of G.aliens?.greys ?? []) if (gr.root.visible && gr.root.position.distanceTo(p) < R) { gr.hidden = 4; gr.root.visible = false; }
    for (const dr of [...(G.aliens?.drones ?? [])]) {
      if (dr.group.position.distanceTo(p) < R + 3) {
        for (let k = 0; k < 4; k++) { const r = G.aliens.hitDrone(dr.group.position, 4); if (!r || r.dead) { if (r?.dead) { G.score += 100; G.stats.drones++; G.hud.toast('DRONE CLEARED  +100'); G.audio.pop(); fx.sparks.burst(r.pos, { count: 70, speed: 40, color: r.color, size: 2.4, life: 1, gravity: -5 }); } break; } }
      }
    }
    for (const t of this.targets) if (t.pos.distanceTo(p) < R * 0.6 && t.down <= 0) { t.down = 4; t.t = 0.01; G.score += 10; }
    const dist = p.distanceTo(G.camera.position);
    G.audio?.weapon('boom');
    G.player.shake = Math.max(G.player.shake, clamp(1 - dist / 60, 0, 1) * 0.9);
    if (normal) this._scorch(p, normal, R * 0.35);
  }

  // ---- Firing ------------------------------------------------------------------------

  _fireGun(def, i) {
    const G = this.game, p = G.player;
    const ammo = this.ammo[i];
    const { origin, dir } = this._aimRay();
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1 ? 1 : 0;
    const air = p.onGround ? 0 : 1;
    const spread = ((this.aimT > 0.5 ? (def.spread ?? 0.01) : (def.hip ?? def.spread ?? 0.01)) * (1 + moving * 1.2 + air * 2)) * (1 + this.vmKick * 0.6);
    const mz = this._muzzle(tv3.set(0, 0, 0)).clone();
    const pellets = def.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      const d = spreadDir(dir, spread, this._rnd);
      const rdir = tv.set(d.x, d.y, d.z);
      const hit = this.castRay(origin, rdir, def.range);
      const end = hit ? hit.point : origin.clone().addScaledVector(rdir, Math.min(def.range, 400));
      this._tracer(mz, end);
      if (hit) { this._impact(hit, def, rdir); this._hitThing(hit, def, rdir, { power: pellets > 1 ? 0.5 : 1 }); }
    }
    ammo.mag--;
    this.cd = def.rate;
    this.kick = 1; this.vmKick = Math.min(1.6, this.vmKick + def.recoil * 0.5);
    this.flashT = 0.045;
    G.audio?.weapon(def.sound);
    // Camera recoil.
    p.camPitch = clamp(p.camPitch + def.recoil * 0.011 * (this.aimT > 0.5 ? 0.7 : 1), -1.25, 0.95);
    p.camYaw += (Math.random() - 0.5) * def.recoil * 0.008;
    p.shake = Math.max(p.shake, Math.min(0.35, def.recoil * 0.12));
    this._hudKey = '';
    if (def.pump) this.pumpT = 0.55;
    if (def.bolt) this.boltT = 0.9;
    if (ammo.mag <= 0 && ammo.reserve > 0) this._startReload(true);
  }

  _fireProjectile(def, i) {
    const G = this.game, p = G.player;
    const ammo = this.ammo[i];
    const { origin, dir } = this._aimRay();
    const mz = this._muzzle(tv3.set(0, 0, 0)).clone();
    // Aim at what the crosshair is on so the shot lands where you look.
    const hit = this.castRay(origin, dir, 500, { skipActors: false });
    const target = hit ? hit.point : origin.clone().addScaledVector(dir, 500);
    const d = tv.copy(target).sub(mz).normalize();
    const sd = spreadDir(d, (def.spread ?? 0.01) * (this.aimT > 0.5 ? 0.6 : 1), this._rnd);
    const vel = new THREE.Vector3(sd.x, sd.y, sd.z).multiplyScalar(def.speed);
    let mesh;
    if (def.plasma) { mesh = new THREE.Mesh(this.boltGeo, this.plasmaMat); mesh.scale.set(1, 1, 1); }
    else { mesh = this.rocketMesh.clone(); mesh.scale.setScalar(1.3); }
    mesh.position.copy(mz);
    mesh.lookAt(tv2.copy(mz).add(vel));
    this.group.add(mesh);
    this.projectiles.push({ mesh, vel, def, life: def.plasma ? 3 : 8, pos: mz.clone() });
    ammo.mag--;
    this.cd = def.rate;
    this.kick = 1; this.vmKick = Math.min(1.8, this.vmKick + def.recoil * 0.5);
    this.flashT = 0.06;
    G.audio?.weapon(def.sound);
    p.camPitch = clamp(p.camPitch + def.recoil * 0.011, -1.25, 0.95);
    p.shake = Math.max(p.shake, Math.min(0.5, def.recoil * 0.16));
    if (!def.plasma) G.fx.smoke.smoke(mz, { count: 4, size: 1.1, life: 1.2, speed: 2, rise: 0.8 });
    this._hudKey = '';
    if (ammo.mag <= 0 && ammo.reserve > 0) this._startReload(true);
  }

  _startReload(auto = false) {
    const def = this.defs[this.cur];
    if (!def || def.type === 'melee' || this.reloadT > 0) return;
    const a = this.ammo[this.cur];
    if (a.mag >= def.mag || a.reserve <= 0) return;
    this.reloadT = def.reload;
    this.reloadTotal = def.reload;
    this.game.audio?.weapon(def.shell ? 'pump' : 'reload');
    this._hudKey = '';
    void auto;
  }

  _melee(def) {
    const G = this.game, p = G.player;
    const { origin, dir } = this._aimRay();
    // Sweep three rays across the swing so near-misses connect.
    const reach = def.reach + (p.cockpit ? 0 : 0.8);
    const base = tv.copy(dir);
    const right = tv2.set(-dir.z, 0, dir.x).normalize();
    const from = tv3.copy(p.pos); from.y += 1.2;
    const seen = new Set();
    let any = false;
    for (const off of [0, -0.55, 0.55, -0.28, 0.28]) {
      const d = base.clone().addScaledVector(right, off).normalize();
      const hit = this.castRay(from, d, reach);
      if (!hit || (hit.obj && seen.has(hit.obj))) continue;
      if (hit.obj) seen.add(hit.obj);
      any = true;
      this._impact(hit, def, d);
      this._hitThing(hit, def, d, { melee: true });
    }
    void origin;
    if (!any) G.audio?.weapon('swing');
    else G.player.shake = Math.max(G.player.shake, 0.18);
  }

  throwGrenade() {
    if (!this.canUse() || this.grenades <= 0 || this.swingT >= 0 || this.cd > 0) return;
    this.grenades--;
    this._throwing = true;
    this.swingT = 0; this.swingHit = false; this.swingDur = 0.55; this.cd = 0.8; this.reloadT = 0;
    this.game.audio?.weapon('draw');
    this._hudKey = '';
  }

  _releaseGrenade() {
    const G = this.game, p = G.player;
    const { origin, dir } = this._aimRay();
    const from = tv3.copy(p.pos); from.y += 1.45;
    const hit = this.castRay(from, dir, 1.2);
    const pos = hit ? hit.point.clone().addScaledVector(dir, -0.3) : from.clone().addScaledVector(dir, 0.6);
    const vel = dir.clone().multiplyScalar(19).add(new THREE.Vector3(0, 3.2, 0)).add(tv2.set(p.vel.x, 0, p.vel.z).multiplyScalar(0.6));
    const mesh = this.nadeMesh.clone(); mesh.scale.setScalar(1.5);
    this.group.add(mesh);
    this.nades.push({ mesh, pos, vel, fuse: 2.4, spin: new THREE.Vector3(6, 3, 4) });
    G.audio?.weapon('swing');
    void origin;
  }

  _updateNades(dt) {
    const G = this.game, W = G.world, grav = (W.gravity ?? 1) * 9.81;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.fuse -= dt;
      n.vel.y -= grav * dt;
      const step = tv.copy(n.vel).multiplyScalar(dt), len = step.length();
      if (len > 1e-6) {
        const dir = step.clone().divideScalar(len);
        const hit = this.castRay(n.pos, dir, len + 0.05, { skipActors: true });
        if (hit && hit.kind !== 'water') {
          const nrm = tv2.set(hit.nx, hit.ny, hit.nz).normalize();
          n.pos.copy(hit.point).addScaledVector(nrm, 0.05);
          const vn = n.vel.dot(nrm);
          n.vel.addScaledVector(nrm, -1.5 * vn).multiplyScalar(0.62);
          if (Math.abs(vn) > 3) G.audio?.weapon('hit');
          if (nrm.y > 0.5 && n.vel.length() < 1.2) n.vel.set(0, 0, 0);
        } else if (hit && hit.kind === 'water') { n.pos.copy(hit.point); n.vel.set(0, 0, 0); n.pos.y = -0.3; }
        else n.pos.add(step);
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += n.spin.x * dt * Math.min(1, n.vel.length() / 4); n.mesh.rotation.z += n.spin.z * dt * Math.min(1, n.vel.length() / 4);
      if (n.fuse <= 0) {
        this._explode(n.pos.clone(), { blast: 9.5, force: 20 }, new THREE.Vector3(0, 1, 0));
        this.group.remove(n.mesh); this.nades.splice(i, 1);
      }
    }
  }

  _updateProjectiles(dt) {
    const G = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      const step = tv.copy(pr.vel).multiplyScalar(dt), len = step.length();
      const dir = step.clone().divideScalar(len || 1);
      const hit = this.castRay(pr.pos, dir, len + 0.1);
      let dead = pr.life <= 0;
      if (hit) {
        dead = true;
        const nrm = tv2.set(hit.nx, hit.ny, hit.nz).normalize();
        if (pr.def.plasma) {
          G.fx.sparks.burst(hit.point, { count: 26, speed: 9, color: 0x55f4ff, size: 0.5, life: 0.6, gravity: -2, intensity: 2.4 });
          G.fx.sparks.burst(hit.point, { count: 8, speed: 3, color: 0xffffff, size: 1.0, life: 0.2, gravity: 0, intensity: 3 });
          this._hitThing(hit, pr.def, dir, { power: 1.4 });
          this._props()?.explode(hit.point, { radius: 4, strength: 3 });
          G.audio?.weapon('hit');
          if (hit.kind !== 'water') this._scorch(hit.point, nrm.clone(), 0.6);
        } else this._explode(hit.point.clone(), pr.def, nrm.clone());
      } else {
        pr.pos.add(step);
        pr.mesh.position.copy(pr.pos);
        if (!pr.def.plasma) {
          G.fx.smoke.smoke(pr.pos, { count: 1, size: 1.6, life: 1.4, speed: 0.6, rise: 0.4 });
          G.fx.sparks.emit(pr.pos.x, pr.pos.y, pr.pos.z, -pr.vel.x * 0.1, -pr.vel.y * 0.1, -pr.vel.z * 0.1, { color: 0xffa040, size: 0.6, life: 0.25, intensity: 2.5 });
        } else {
          G.fx.sparks.emit(pr.pos.x, pr.pos.y, pr.pos.z, 0, 0, 0, { color: 0x55f4ff, size: 0.35, life: 0.18, intensity: 2 });
        }
      }
      if (dead) { this.group.remove(pr.mesh); this.projectiles.splice(i, 1); }
    }
  }

  // ---- Frame -------------------------------------------------------------------------

  // FOV the camera should use (called by the player's foot camera).
  fovFor(base) {
    if (!this.armed || this.cur < 0) return base;
    const d = this.defs[this.cur];
    const z = d.zoom ?? 1.25;
    return base / lerp(1, z, this.aimT) ;
  }

  update(dt) {
    const G = this.game, p = G.player, I = G.input;
    // Keep the scene graph in the world the player is in.
    const sc = p.root.parent;
    if (sc && this.group.parent !== sc) sc.add(this.group);
    this.restockCD = this.restockCD;
    this._updateRange(dt, p);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt;
      t.m.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) { t.m.visible = false; this.tracerPool.push(t.m); this.tracers.splice(i, 1); }
    }
    this._updateProjectiles(dt);
    this._updateNades(dt);

    const usable = this.canUse();
    const H = p.human;
    if (!usable) {
      if (this.cur >= 0 && p.mode !== 'foot') this.holster(true);
      this._visual(null, false);
      if (H) { H.stance = null; H.swing = -1; }
      this._updateHud(dt);
      return;
    }

    // ---- Input
    if (I.enabled) {
      for (let i = 0; i < KEYS.length; i++) if (I.hit(KEYS[i])) this.select(i);
      if (I.hit('KeyX')) this.holster();
      if (I.thit?.('wpn')) this.cycle(1);
      if (I.hit('KeyR') || I.thit?.('rld')) this._startReload();
      if (I.hit('KeyG') || I.thit?.('gren')) this.throwGrenade();
    }
    const def = this.cur >= 0 ? this.defs[this.cur] : null;
    const aimHeld = (I.mouseRight && I.locked) || I.tdown?.('aim');
    this.aimT = damp(this.aimT, def && aimHeld && this.drawT <= 0 && this.reloadT <= 0 && def.type !== 'melee' ? 1 : 0, 12, dt);
    this.cd -= dt; this.drawT -= dt;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.vmKick = Math.max(0, this.vmKick - dt * 6);
    this.flashT -= dt;
    this.pumpT = Math.max(0, (this.pumpT || 0) - dt);
    this.boltT = Math.max(0, (this.boltT || 0) - dt);
    this.moveSpread = clamp(Math.hypot(p.vel.x, p.vel.z) / 5.5, 0, 1);

    const wantFire = ((I.mouseLeft && I.locked) || I.tdown?.('fire') || false) && I.enabled;
    const firePressed = (I.hit('Mouse0') && I.locked) || I.thit?.('fire');
    if (def) {
      const ammo = this.ammo[this.cur];
      // Reload progress.
      if (this.reloadT > 0) {
        // A loaded shotgun can be fired mid-reload.
        if (def.shell && wantFire && ammo.mag > 0) { this.reloadT = 0; }
        else {
          this.reloadT -= dt;
          if (this.reloadT <= 0) {
            const r = reloadFill(def, ammo);
            ammo.mag = r.mag; ammo.reserve = r.reserve;
            this._hudKey = '';
            if (def.shell && ammo.mag < def.mag && ammo.reserve > 0) { this.reloadT = def.reload; this.game.audio?.weapon('pump'); }
            else this.reloadT = 0;
          }
        }
      }
      if (def.type === 'melee') {
        if (this.swingT < 0 && this.cd <= 0 && this.drawT <= 0 && (def.id === 'knife' ? wantFire : firePressed || wantFire)) {
          this.swingT = 0; this.swingHit = false; this.swingDur = def.swing; this._throwing = false; this.cd = def.swing * 1.05;
        }
      } else if (this.swingT < 0 || this._throwing) {
        if (wantFire && this.cd <= 0 && this.drawT <= 0 && this.reloadT <= 0 && !this._throwing) {
          if (ammo.mag > 0) {
            if (def.auto || firePressed) { if (def.type === 'proj') this._fireProjectile(def, this.cur); else this._fireGun(def, this.cur); }
          } else if (firePressed) {
            if (ammo.reserve > 0) this._startReload(); else { this.game.audio?.weapon('dry'); this.cd = 0.25; }
          }
        }
      }
    }
    // Swing (melee or grenade throw).
    if (this.swingT >= 0) {
      this.swingT += dt;
      const dur = this.swingDur || 0.5, u = this.swingT / dur;
      if (!this.swingHit && u >= (this._throwing ? 0.55 : (def?.hitAt ?? 0.5))) {
        this.swingHit = true;
        if (this._throwing) this._releaseGrenade(); else this._melee(def);
      }
      if (u >= 1) { this.swingT = -1; this._throwing = false; }
      else if (!this._throwing && u < 0.15 && this.swingT - dt <= 0) this.game.audio?.weapon('swing');
    }

    // ---- Body pose and visuals
    this.armed = this.cur >= 0 || this.swingT >= 0;
    if (H) {
      H.stance = this._throwing ? 'throw' : def ? def.stance : null;
      H.aim = clamp(p.camPitch, -1, 1);
      H.swing = this.swingT >= 0 ? clamp(this.swingT / (this.swingDur || 0.5), 0, 1) : -1;
      H.kick = this.kick;
      if (!H.stance && this.armed) H.stance = 'throw';
    }
    this._visual(def, true, dt);
    this._updateHud(dt);
  }

  // Place the right model: held in the hand (third person) or as a camera-space view model (first person).
  _visual(def, on, dt = 0) {
    const G = this.game, p = G.player, H = p.human, cam = G.camera;
    const i = def ? this.cur : -1;
    // Third-person hand model.
    const wantHand = on && def && !p.cockpit && !this._throwing;
    const model = wantHand ? this._model(def.id) : null;
    if (model !== this.shown) {
      if (H) H.hold(model, model?.userData.mount);
      this.shown = model;
    }
    if (model) {
      const f = model.userData.flash;
      if (f) f.visible = this.flashT > 0;
      if (def.id === 'pistol') model.userData.parts.slide.position.z = -Math.min(1, this.vmKick) * 0.03;
      if (def.pump) model.userData.parts.pump.position.z = -Math.sin(Math.PI * clamp(1 - (this.pumpT || 0) / 0.55, 0, 1)) * 0.11 * (this.pumpT > 0 ? 1 : 0);
    }
    // First-person view model.
    for (const [k, vm] of this.vms) if (k !== i || !on || !p.cockpit) vm.visible = false;
    if (on && def && p.cockpit && this.cur >= 0) {
      const vm = this._vm(this.cur);
      const m = vm.userData.model;
      const aim = this.aimT;
      const sp = Math.hypot(p.vel.x, p.vel.z);
      this.bobT += dt * (3 + sp * 1.8);
      const bob = clamp(sp / 5, 0, 1) * (1 - aim * 0.9);
      const draw = smoothstep(0, 1, 1 - clamp(this.drawT / 0.38, 0, 1));
      const rel = this.reloadT > 0 ? Math.sin(Math.PI * clamp(1 - this.reloadT / (this.reloadTotal || 1), 0, 1)) : 0;
      const swing = this.swingT >= 0 ? clamp(this.swingT / (this.swingDur || 0.5), 0, 1) : -1;
      const scoped = def.scope && aim > 0.85;
      vm.visible = !scoped;
      // Rest pose in camera space (camera looks down -Z, the weapon's +Z is its barrel).
      const cfg = VM[def.id] || VM.rifle;
      vm.scale.setScalar(cfg.s);
      let x = lerp(cfg.x, 0, aim), y = lerp(cfg.y, -cfg.sight * cfg.s, aim), z = lerp(cfg.z, -0.3, aim);
      let rx = 0, ry = 0, rz = 0;
      if (def.type === 'melee') {
        x = 0.24; y = -0.22; z = -0.5; rx = -0.15; ry = Math.PI;
        if (swing >= 0) {
          // Arc across the view.
          const e = (v) => v * v * (3 - 2 * v);
          const a = swing < 0.3 ? e(swing / 0.3) * -1 : swing < 0.62 ? lerp(-1, 1.2, e((swing - 0.3) / 0.32)) : lerp(1.2, 0, e((swing - 0.62) / 0.38));
          x += a * -0.28; y += Math.abs(a) * 0.05 + (swing < 0.3 ? 0.1 * swing / 0.3 : 0); rz = a * 0.9; ry += a * 0.5; rx = -0.15 + (swing > 0.3 && swing < 0.62 ? -0.5 : 0.2 * (swing < 0.3 ? swing / 0.3 : 0));
        }
        // Blades are held with the tip up and forward.
        vm.position.set(x, y, z);
        vm.quaternion.set(0, 0, 0, 1);
        const q = tq.setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
        vm.quaternion.copy(q);
        m.rotation.set(-0.9 + 0.0, 0, 0);
        vm.userData.mode = 'melee';
      } else {
        const kick = this.vmKick;
        z += kick * 0.05; y += kick * 0.012; rx += kick * 0.06;
        y += -0.3 * (1 - draw) - rel * 0.14; rx += rel * 0.5; rz += rel * 0.25 - (1 - draw) * 0.5;
        x += Math.cos(this.bobT) * 0.012 * bob; y += Math.abs(Math.sin(this.bobT)) * 0.014 * bob;
        vm.position.set(x, y, z);
        vm.quaternion.copy(tq.setFromEuler(new THREE.Euler(rx, Math.PI + ry, rz, 'YXZ')));
        m.rotation.set(0, 0, 0);
        if (def.pump) m.userData.parts.pump.position.z = -Math.sin(Math.PI * clamp(1 - (this.pumpT || 0) / 0.55, 0, 1)) * 0.11 * (this.pumpT > 0 ? 1 : 0);
        if (def.id === 'pistol') m.userData.parts.slide.position.z = -Math.min(1, kick) * 0.035;
        vm.userData.mode = 'gun';
      }
      // Attach to the camera.
      vm.position.applyQuaternion(cam.quaternion).add(cam.position);
      vm.quaternion.premultiply(cam.quaternion);
      const f = m.userData.flash; if (f) f.visible = this.flashT > 0 && !scoped;
    }
  }
}
