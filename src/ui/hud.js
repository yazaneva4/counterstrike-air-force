// Heads-up display. DOM for text panels (crisp at any DPI), canvas for the
// compass tape, the rotating minimap, the full map and the flight
// instruments (speed and altitude tapes, pitch ladder, throttle, warnings).

import * as THREE from 'three';
import { escapeHTML, clamp, lerp } from '../core/util.js';
import { MAP_SIZE, HALF, PLACES } from '../world/terrain.js';
import { MYSTERY_INFO } from '../world/mysteries.js';

const $ = (s) => document.querySelector(s);
const tv = new THREE.Vector3();

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('#hud');
    this.compass = $('#compass');
    this.cctx = this.compass.getContext('2d');
    this.mini = $('#minimap');
    this.mctx = this.mini.getContext('2d');
    this.flight = $('#flightHud');
    this.fctx = this.flight.getContext('2d');
    this.promptEl = $('#prompt');
    this.toastEl = $('#toast');
    this.dialogEl = $('#dialog');
    this.bannerEl = $('#discovery');
    this.labels = $('#labels');
    this.labelPool = new Map();
    this.toastTimer = 0;
    this.dialogTimer = 0;
    this.bannerTimer = 0;
    this.textTimer = 0;
    this.mapOpen = false;
    this.journalOpen = false;
    this.lastPrompt = '';
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    for (const c of [this.compass, this.mini]) {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    }
    this.flight.width = Math.round(innerWidth * dpr);
    this.flight.height = Math.round(innerHeight * dpr);
  }

  show(on) { this.el.style.display = on ? 'block' : 'none'; if (on) requestAnimationFrame(() => this.resize()); }

  prompt(p) {
    const key = p ? p.key + p.text : '';
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    if (!p) { this.promptEl.classList.remove('on'); return; }
    this.promptEl.innerHTML = `<kbd>${escapeHTML(p.key)}</kbd><span>${escapeHTML(p.text)}</span>`;
    this.promptEl.classList.add('on');
  }

  toast(msg, secs = 2.2) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('on');
    this.toastTimer = secs;
  }

  dialog(name, title, line) {
    this.dialogEl.innerHTML = `<div class="who"><b>${escapeHTML(name)}</b><span>${escapeHTML(title)}</span></div><p></p>`;
    this.dialogEl.classList.add('on');
    this.dialogText = line;
    this.dialogShown = 0;
    this.dialogTimer = 3 + line.length * 0.045;
  }

  discovery(info, count, total) {
    this.bannerEl.innerHTML = `<div class="kicker">Mystery discovered · ${count} / ${total}</div><h2>${escapeHTML(info.name)}</h2><div class="place">${escapeHTML(info.place)}</div><p>${escapeHTML(info.lore)}</p>`;
    this.bannerEl.classList.add('on');
    this.bannerTimer = 9;
  }

  // ---- Per-frame ----------------------------------------------------------------

  // Which set of touch buttons fits what the player is doing.
  _touchContext() {
    const G = this.game, p = G.player;
    let ctx = 'foot';
    if (G.space.active) ctx = 'space';
    else if (p.mode === 'vehicle' && p.vehicle) ctx = p.vehicle.kind;
    if (ctx === this._ctx) return;
    this._ctx = ctx;
    document.body.dataset.ctx = ctx;
    document.querySelectorAll('.tbtns [data-labels]').forEach((b) => {
      const l = JSON.parse(b.dataset.labels);
      if (!b.dataset.base) b.dataset.base = b.textContent;
      b.textContent = l[ctx] || b.dataset.base;
    });
  }

  update(dt) {
    const G = this.game;
    this._touchContext();
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.toastEl.classList.remove('on'); }
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogShown < this.dialogText.length) {
        this.dialogShown = Math.min(this.dialogText.length, this.dialogShown + dt * 60);
        this.dialogEl.querySelector('p').textContent = this.dialogText.slice(0, Math.floor(this.dialogShown));
      }
      if (this.dialogTimer <= 0) { this.dialogEl.classList.remove('on'); G.talkingTo = null; }
    }
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) this.bannerEl.classList.remove('on'); }

    const cam = G.camera;
    const dir = cam.getWorldDirection(tv);
    const heading = Math.atan2(dir.x, dir.z); // 0 = +Z (south)
    const bearing = ((Math.PI - heading) * 180 / Math.PI + 360) % 360; // 0 = north (-Z)
    this._compass(bearing);
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.2;
      const p = G.focusPos();
      $('#locName').textContent = G.locationName();
      $('#clock').textContent = G.sky.clockString() + (G.sky.real ? ' HST' : '');
      $('#dayIcon').textContent = G.sky.night > 0.5 ? '☾' : G.sky.golden > 0.4 ? '◐' : '☀';
      $('#mysteryCount').textContent = G.mysteries.count + ' / ' + MYSTERY_INFO.length;
      $('#score').textContent = String(G.score).padStart(5, '0');
      const peers = G.net.peerList();
      $('#peers').innerHTML = peers.length ? peers.map((p) => `<div><i style="background:${p.color}"></i>${escapeHTML(p.name)}</div>`).join('') : '';
      $('#peerBox').style.display = peers.length ? 'block' : 'none';
      $('#modeTag').textContent = G.modeLabel();
    }
    const viewButton = $('#viewToggle');
    viewButton.textContent = G.player.cockpit ? '1ST PERSON · V' : '3RD PERSON · V';
    viewButton.setAttribute('aria-label', G.player.cockpit ? 'Switch to third-person view' : 'Switch to first-person view');
    this._minimap(heading);
    this._flight(dt);
    this._labels();
  }

  _compass(bearing) {
    const c = this.cctx, w = this.compass.width, h = this.compass.height, d = this.dpr;
    c.clearRect(0, 0, w, h);
    if (w < 40) return;
    const pxPerDeg = w / 120;
    c.font = `${600} ${11 * d}px 'DM Mono', monospace`;
    c.textAlign = 'center';
    for (let deg = Math.floor(bearing - 70); deg <= bearing + 70; deg++) {
      const x = w / 2 + (deg - bearing) * pxPerDeg;
      const dd = ((deg % 360) + 360) % 360;
      const fade = 1 - Math.abs(deg - bearing) / 64;
      if (fade <= 0) continue;
      c.globalAlpha = fade;
      if (dd % 45 === 0) {
        const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[dd];
        c.fillStyle = dd === 0 ? '#ffb45a' : '#eaf6ff';
        c.fillText(lbl, x, h * 0.52);
        c.fillRect(x - d * 0.5, h * 0.66, d, h * 0.3);
      } else if (dd % 15 === 0) {
        c.fillStyle = '#9fc4d8';
        c.fillText(String(dd), x, h * 0.52);
        c.fillRect(x - d * 0.5, h * 0.72, d, h * 0.2);
      } else if (dd % 5 === 0) {
        c.fillStyle = '#9fc4d8';
        c.fillRect(x - d * 0.5, h * 0.8, d, h * 0.12);
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#7dffd6';
    c.beginPath(); c.moveTo(w / 2 - 5 * d, 0); c.lineTo(w / 2 + 5 * d, 0); c.lineTo(w / 2, 6 * d); c.fill();
    // Markers for tracked mysteries.
    const G = this.game, p = G.focusPos();
    const mark = (x, z, color, text) => {
      const b = ((Math.atan2(x - p.x, -(z - p.z)) * 180) / Math.PI + 360) % 360;
      let diff = ((b - bearing + 540) % 360) - 180;
      if (Math.abs(diff) > 60) return;
      const px = w / 2 + diff * pxPerDeg;
      c.fillStyle = color;
      c.fillText(text, px, h * 0.25);
    };
    if (G.waypoint) mark(G.waypoint.x, G.waypoint.z, '#ffd36a', '◆');
  }

  _minimap(heading) {
    const G = this.game, c = this.mctx, w = this.mini.width, h = this.mini.height, d = this.dpr;
    const img = G.world.terrain.mapCanvas;
    if (!img || w < 40) return;
    const p = G.focusPos();
    const v = G.player.vehicle;
    const onEarth = G.location === 'earth';
    const MS = G.world.terrain.mapSize || MAP_SIZE, HF = MS / 2;
    const range = G.space.active ? 3000 : v ? clamp(400 + v.speed * 6 + (v.pos.y - 100) * 0.5, 500, 2200) : 260;
    const scale = (w / 2) / range; // px per metre
    c.save();
    c.clearRect(0, 0, w, h);
    c.beginPath(); c.arc(w / 2, h / 2, w / 2 - d, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0c3a52'; c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    c.rotate(heading - Math.PI);
    const k = img.width / MS;
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.95;
    if (!G.space.active) c.drawImage(img, (p.x + HF - range * 1.5) * k, (p.z + HF - range * 1.5) * k, range * 3 * k, range * 3 * k, -range * 1.5 * scale, -range * 1.5 * scale, range * 3 * scale, range * 3 * scale);
    c.globalAlpha = 1;
    const dot = (x, z, r, color, ring = false) => {
      const mx = (x - p.x) * scale, mz = (z - p.z) * scale;
      if (mx * mx + mz * mz > (w / 2) * (w / 2)) return;
      c.fillStyle = color;
      c.beginPath(); c.arc(mx, mz, r * d, 0, Math.PI * 2);
      if (ring) { c.strokeStyle = color; c.lineWidth = 1.5 * d; c.stroke(); } else c.fill();
    };
    if (onEarth) {
      for (const n of G.npcs.list) if (Math.abs(n.pos.x - p.x) < range && Math.abs(n.pos.z - p.z) < range) dot(n.pos.x, n.pos.z, 1.6, '#f4efe0');
      for (const veh of G.vehicles) if (!veh.destroyed && veh !== v) dot(veh.pos.x, veh.pos.z, 3, veh.locked ? '#8a7aa8' : '#ffd36a');
      for (const s of G.aliens.saucers) if (G.sky.night > 0.4 && s.state !== 'high') dot(s.pos.x, s.pos.z, 3.2, '#c89aff');
    } else if (!G.space.active) {
      for (const veh of G.vehicles) if (!veh.destroyed && veh !== v) dot(veh.pos.x, veh.pos.z, 3.5, '#ffd36a');
    }
    for (const r of G.remotes.values()) if (r.here) dot(r.pos.x, r.pos.z, 3.5, r.color);
    const sites = onEarth ? G.mysteries.sites : G.surface && !G.space.active ? G.surface.sites : {};
    for (const [id, s] of Object.entries(sites)) {
      const found = G.mysteries.found.has(id);
      dot(s.pos.x, s.pos.z, found ? 3.5 : 5, found ? '#7dffd6' : 'rgba(255,211,106,0.8)', !found);
    }
    c.restore();
    // Player arrow (always points up; the map rotates underneath).
    c.save();
    c.translate(w / 2, h / 2);
    c.fillStyle = '#7dffd6';
    c.beginPath(); c.moveTo(0, -8 * d); c.lineTo(5.5 * d, 6 * d); c.lineTo(0, 3 * d); c.lineTo(-5.5 * d, 6 * d); c.closePath(); c.fill();
    c.restore();
    // North marker on the rim.
    const th = heading - Math.PI;
    c.fillStyle = '#ffb45a';
    c.font = `700 ${11 * d}px 'DM Mono', monospace`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const rr = w / 2 - 10 * d;
    c.fillText('N', w / 2 + Math.sin(th) * rr, h / 2 - Math.cos(th) * rr);
  }

  _flight(dt) {
    const G = this.game, c = this.fctx, v = G.player.vehicle;
    const W = this.flight.width, H = this.flight.height, d = this.dpr;
    c.clearRect(0, 0, W, H);
    const inSpace = G.space.active;
    if ((!v && !inSpace) || G.player.cockpit === undefined) { this.flight.style.opacity = 0; return; }
    this.flight.style.opacity = 1;
    const cx = W / 2, cy = H * 0.48;
    const col = 'rgba(170,255,225,0.95)', dim = 'rgba(170,255,225,0.6)';
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.4 * d;
    c.shadowColor = 'rgba(0,10,16,0.75)'; c.shadowBlur = 4 * d;
    c.font = `500 ${11 * d}px 'DM Mono', monospace`;
    c.textBaseline = 'middle';
    if (!inSpace && v.kind === 'car') { this._carHud(c, v, W, H, d, col, dim); return; }
    const speed = inSpace ? Math.min(G.space.speed, 5000) : v.speed;
    const onSurface = !inSpace && G.location !== 'earth';
    const alt = inSpace ? G.space.nearest.alt * 6.4 : onSurface || v.kind === 'rocket' ? v.pos.y - v.ground - G.world.groundAt(v.pos.x, v.pos.z) : v.pos.y;
    const unitsSpeed = inSpace ? 'KM/H×10' : v.kind === 'rocket' ? 'M/S' : 'KT';
    const spd = inSpace ? speed * 36 : v.kind === 'rocket' ? speed : speed * 1.944;
    // Speed tape (left) and altitude tape (right).
    const tape = (x, value, step, label, alignRight) => {
      const hgt = H * 0.36, top = cy - hgt / 2;
      c.save();
      c.beginPath(); c.rect(x - 40 * d, top, 80 * d, hgt); c.clip();
      c.textAlign = alignRight ? 'left' : 'right';
      const pxPer = hgt / (step * 8);
      const base = Math.floor(value / step) * step;
      for (let k = -6; k <= 6; k++) {
        const val = base + k * step;
        const y = cy - (val - value) * pxPer;
        c.fillStyle = dim;
        c.fillRect(alignRight ? x - 34 * d : x + 26 * d, y, 8 * d, 1 * d);
        if (val >= 0) { c.fillStyle = dim; c.fillText(String(Math.round(val)), alignRight ? x - 22 * d : x + 20 * d, y); }
      }
      c.restore();
      c.strokeStyle = col;
      c.strokeRect(x - 38 * d, cy - 11 * d, 76 * d, 22 * d);
      c.fillStyle = 'rgba(6,20,26,0.75)'; c.fillRect(x - 38 * d, cy - 11 * d, 76 * d, 22 * d);
      c.fillStyle = col; c.textAlign = 'center';
      c.font = `600 ${13 * d}px 'DM Mono', monospace`;
      c.fillText(String(Math.round(value)), x, cy);
      c.font = `500 ${10 * d}px 'DM Mono', monospace`;
      c.fillStyle = dim; c.fillText(label, x, cy - hgt / 2 - 12 * d);
      c.font = `500 ${11 * d}px 'DM Mono', monospace`;
    };
    tape(cx - Math.min(W * 0.28, 330 * d), spd, inSpace ? 500 : 20, unitsSpeed, false);
    tape(cx + Math.min(W * 0.28, 330 * d), alt, inSpace ? (alt > 20000 ? 5000 : 500) : alt > 1500 ? 200 : 50, inSpace ? 'ALT KM · ' + G.space.nearest.name.toUpperCase() : onSurface || v.kind === 'rocket' ? 'AGL M' : 'ALT M', true);

    if (!inSpace && v.kind === 'rocket') {
      this._rocketHud(c, v, cx, cy, W, H, d, col, dim);
    } else if (!inSpace && v.kind === 'plane') {
      // Pitch ladder + horizon, rotated by bank.
      const pitch = v.pitchAngle(), bank = v.bankAngle();
      c.save();
      c.translate(cx, cy);
      c.rotate(bank);
      const pxPerRad = H * 0.9;
      c.beginPath(); c.rect(-W * 0.2, -H * 0.2, W * 0.4, H * 0.4); c.clip();
      for (let deg = -60; deg <= 60; deg += 10) {
        const y = (pitch - deg * Math.PI / 180) * pxPerRad;
        const wLine = deg === 0 ? W * 0.16 : 50 * d;
        c.strokeStyle = deg === 0 ? col : dim;
        c.setLineDash(deg < 0 ? [6 * d, 5 * d] : []);
        c.beginPath(); c.moveTo(-wLine, y); c.lineTo(-18 * d, y); c.moveTo(18 * d, y); c.lineTo(wLine, y); c.stroke();
        if (deg !== 0) { c.fillStyle = dim; c.textAlign = 'right'; c.fillText(String(deg), -wLine - 6 * d, y); }
      }
      c.setLineDash([]);
      c.restore();
      // Flight path marker.
      c.strokeStyle = col;
      c.beginPath(); c.arc(cx, cy, 7 * d, 0, Math.PI * 2);
      c.moveTo(cx - 18 * d, cy); c.lineTo(cx - 7 * d, cy); c.moveTo(cx + 7 * d, cy); c.lineTo(cx + 18 * d, cy); c.moveTo(cx, cy - 7 * d); c.lineTo(cx, cy - 14 * d);
      c.stroke();
      // Throttle bar.
      const tx = cx - Math.min(W * 0.28, 330 * d), ty = cy + H * 0.23;
      c.strokeStyle = dim; c.strokeRect(tx - 38 * d, ty, 76 * d, 7 * d);
      c.fillStyle = v.boosting ? 'rgba(255,170,90,0.95)' : col; c.fillRect(tx - 38 * d, ty, 76 * d * v.throttle, 7 * d);
      c.fillStyle = dim; c.textAlign = 'center'; c.fillText('THR ' + Math.round(v.throttle * 100) + '%' + (v.boosting ? ' A/B' : ''), tx, ty + 18 * d);
      const warnings = [];
      if (v.stalling && !v.onGround) warnings.push('STALL');
      const agl = v.pos.y - v.ground - G.world.groundAt(v.pos.x, v.pos.z);
      if (!v.onGround && agl < 80 && v.vel.y < -12) warnings.push('PULL UP');
      if (!v.onGround && v.gearDown && v.type !== 'prop') warnings.push('GEAR DOWN');
      if (v.onGround) warnings.push(v.speed < 1 ? 'PARKED · W TO THROTTLE UP' : v.speed > v.def.takeoff * 0.85 ? 'ROTATE · PULL UP' : 'TAKEOFF ROLL');
      c.font = `700 ${13 * d}px 'DM Mono', monospace`;
      warnings.forEach((wn, i) => {
        c.fillStyle = wn === 'STALL' || wn === 'PULL UP' ? ((performance.now() / 250) % 2 < 1 ? '#ff6a5a' : '#ffb0a0') : col;
        c.fillText(wn, cx, cy + H * 0.2 + i * 18 * d);
      });
    } else if (!inSpace) {
      // Hover indicator for rotorcraft/saucer: crosshair + vertical speed.
      c.strokeStyle = dim;
      c.beginPath(); c.arc(cx, cy, 22 * d, 0, Math.PI * 2); c.stroke();
      c.fillStyle = col; c.textAlign = 'center';
      c.fillText('V/S ' + (v.vel.y >= 0 ? '+' : '') + v.vel.y.toFixed(1) + ' m/s', cx, cy + H * 0.23);
      if (v.kind === 'heli' && v.rpm < 0.95) c.fillText('ROTOR ' + Math.round(v.rpm * 100) + '%', cx, cy + H * 0.23 + 18 * d);
      if (v.kind === 'ufo' || v.kind === 'ship') {
        const agl = v.pos.y - G.world.groundAt(v.pos.x, v.pos.z);
        const need = onSurface ? 1500 : 3000;
        c.fillText(agl > need * 0.8 ? `HOLD SPACE ABOVE ${need.toLocaleString()} M TO REACH ORBIT` : v.kind === 'ufo' ? 'E TRACTOR BEAM · SHIFT BOOST' : 'SPACE CLIMB · SHIFT BOOST · ORBIT ABOVE ' + need.toLocaleString() + ' M', cx, cy + H * 0.23 + 18 * d);
      }
      if (v.onGround && v.kind === 'heli') c.fillText('HOLD SPACE TO LIFT OFF', cx, cy + H * 0.2);
    } else {
      c.textAlign = 'center';
      const S = G.space;
      if (S.warp) {
        c.font = `700 ${16 * d}px 'DM Mono', monospace`;
        c.fillText('WARP · ' + S.warp.id.toUpperCase(), cx, cy - H * 0.18);
        c.font = `500 ${11 * d}px 'DM Mono', monospace`;
      }
      // Navigation: distance to each world and the warp keys.
      const list = S.targets();
      list.forEach((tg, i) => {
        const y = H * 0.74 + i * 17 * d;
        const km = tg.dist * 6.4;
        c.fillStyle = tg.id === S.nearest.id ? col : dim;
        c.fillText(`[${tg.key}] ${tg.name.toUpperCase()}  ${km < 1000 ? Math.round(km) + ' KM' : (km / 1000).toFixed(1) + 'K KM'}`, cx, y);
      });
      c.fillStyle = dim;
      c.fillText('W THRUST · MOUSE/I/K PITCH · ←/→ YAW · ↑/↓ OR SPACE/C UP/DOWN · SHIFT BOOST · 1/2/3 WARP', cx, H * 0.74 + list.length * 17 * d + 6 * d);
    }
  }

  // Speedometer, gear, rev bar and status lamps for road vehicles.
  _carHud(c, v, W, H, d, col, dim) {
    const R = Math.min(W, H) * 0.115, cx = W * 0.5, cy = H - R * 1.25;
    const kmh = Math.abs(v.carVf) * 3.6, top = Math.ceil(v.def.maxSpeed * 3.6 * 1.12 / 20) * 20;
    const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
    c.save();
    c.fillStyle = 'rgba(6,20,26,0.55)'; c.beginPath(); c.arc(cx, cy, R * 1.12, 0, Math.PI * 2); c.fill();
    c.lineWidth = 3 * d; c.strokeStyle = dim; c.beginPath(); c.arc(cx, cy, R, A0, A0 + SW); c.stroke();
    // Redline arc for the last stretch, then ticks and labels.
    c.strokeStyle = 'rgba(255,106,90,0.85)'; c.beginPath(); c.arc(cx, cy, R, A0 + SW * 0.9, A0 + SW); c.stroke();
    const step = top > 240 ? 40 : 20;
    c.font = `500 ${10 * d}px 'DM Mono', monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = dim; c.lineWidth = 1.4 * d;
    for (let k = 0; k <= top; k += step / 2) {
      const a = A0 + (k / top) * SW, major = k % step === 0;
      c.strokeStyle = major ? col : dim;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * R * (major ? 0.86 : 0.92), cy + Math.sin(a) * R * (major ? 0.86 : 0.92)); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke();
      if (major) c.fillText(String(k), cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7);
    }
    const a = A0 + clamp(kmh / top, 0, 1) * SW;
    c.strokeStyle = '#ffb45a'; c.lineWidth = 2.6 * d; c.beginPath(); c.moveTo(cx - Math.cos(a) * R * 0.12, cy - Math.sin(a) * R * 0.12); c.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); c.stroke();
    c.fillStyle = col; c.font = `700 ${R * 0.34}px 'DM Mono', monospace`; c.fillText(String(Math.round(kmh)), cx, cy + R * 0.42);
    c.font = `500 ${9 * d}px 'DM Mono', monospace`; c.fillStyle = dim; c.fillText('KM/H', cx, cy + R * 0.62);
    // Gear, rev bar.
    c.font = `700 ${R * 0.3}px 'DM Mono', monospace`; c.fillStyle = col; c.fillText(v.gear === 0 ? 'R' : Math.abs(v.carVf) < 0.4 && !v.throttle ? 'N' : String(v.gear), cx, cy - R * 0.32);
    c.strokeStyle = dim; c.lineWidth = 1 * d; c.strokeRect(cx - R * 0.5, cy + R * 0.78, R, 6 * d);
    c.fillStyle = v.rpm > 0.9 ? '#ff6a5a' : col; c.fillRect(cx - R * 0.5, cy + R * 0.78, R * clamp(v.rpm, 0, 1), 6 * d);
    // Status lamps.
    const lamp = (x, txt, on, colr) => { c.font = `700 ${11 * d}px 'DM Mono', monospace`; c.fillStyle = on ? colr : 'rgba(170,255,225,0.25)'; c.fillText(txt, x, cy - R * 0.9); };
    lamp(cx - R * 0.5, 'LIGHTS', v.lights, '#ffe08a'); lamp(cx + R * 0.5, 'BRAKE', v.braking, '#ff6a5a');
    if (v.skid > 0.3) { c.fillStyle = '#ffb45a'; c.font = `700 ${11 * d}px 'DM Mono', monospace`; c.fillText('SLIDE', cx, cy - R * 1.25); }
    c.font = `500 ${11 * d}px 'DM Mono', monospace`; c.fillStyle = dim;
    c.fillText('W/S THROTTLE · A/D STEER · SPACE HANDBRAKE · L LIGHTS · B HORN', cx, cy + R * 1.42);
    c.restore();
  }

  _rocketHud(c, v, cx, cy, W, H, d, col, dim) {
    const G = this.game;
    // Attitude: where the nose points (a centred dot is straight up).
    const up = tv.set(0, 1, 0).applyQuaternion(v.quat);
    c.strokeStyle = dim;
    c.beginPath(); c.arc(cx, cy, 46 * d, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(cx - 52 * d, cy); c.lineTo(cx + 52 * d, cy); c.moveTo(cx, cy - 52 * d); c.lineTo(cx, cy + 52 * d); c.stroke();
    const cam = G.camera, right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    right.y = 0; fwd.y = 0; right.normalize(); fwd.normalize();
    const tilt = Math.acos(clamp(up.y, -1, 1));
    const px = up.dot(right), pz = up.dot(fwd);
    const k = 46 * d * Math.min(1, tilt / 0.7) / Math.max(1e-4, Math.hypot(px, pz));
    c.fillStyle = tilt > 0.32 ? '#ffb45a' : col;
    c.beginPath(); c.arc(cx + px * k, cy - pz * k, 5 * d, 0, Math.PI * 2); c.fill();
    c.textAlign = 'center';
    c.fillStyle = dim; c.fillText('TILT ' + Math.round(tilt * 57.3) + '°', cx, cy + 64 * d);
    // Stage, propellant and throttle.
    const tx = cx - Math.min(W * 0.28, 330 * d), ty = cy + H * 0.23;
    const bar = (y, label, f, colr) => {
      c.strokeStyle = dim; c.strokeRect(tx - 38 * d, y, 76 * d, 7 * d);
      c.fillStyle = colr; c.fillRect(tx - 38 * d, y, 76 * d * clamp(f, 0, 1), 7 * d);
      c.fillStyle = dim; c.textAlign = 'center'; c.fillText(label, tx, y + 18 * d);
    };
    bar(ty, 'THR ' + Math.round(v.throttle * 100) + '%', v.throttle, col);
    const fuel = v.stage === 2 ? v.fuel1 / v.def.burn1 : v.fuel2 / v.def.burn2;
    bar(ty + 34 * d, (v.stage === 2 ? 'BOOSTER' : 'UPPER STAGE') + ' FUEL ' + Math.round(fuel * 100) + '%', fuel, fuel < 0.15 ? '#ff6a5a' : 'rgba(255,211,106,0.95)');
    const ax = cx + Math.min(W * 0.28, 330 * d);
    c.textAlign = 'center'; c.fillStyle = col;
    c.fillText('V/S ' + (v.vel.y >= 0 ? '+' : '') + v.vel.y.toFixed(1) + ' m/s', ax, ty);
    c.fillText('G ' + ((v.thrustAcc || 0) / 9.81).toFixed(2), ax, ty + 18 * d);
    c.fillStyle = dim; c.fillText('LEGS ' + (v.legsOut ? 'DOWN' : 'UP'), ax, ty + 36 * d);
    // Guidance and warnings.
    const lines = [];
    const agl = v.pos.y - v.ground - G.world.groundAt(v.pos.x, v.pos.z);
    const g = 9.81 * (G.world.gravity ?? 1);
    if (v.countdown > 0) lines.push(['T-' + Math.ceil(v.countdown), col, 22]);
    else if (v.onGround && !v.launched) lines.push(['PRESS SPACE TO LAUNCH', col, 14]);
    else if (v.onGround) lines.push([v.stage === 1 ? 'LANDED · W TO LIFT OFF · F TO STEP OUT' : 'LANDED', col, 14]);
    else {
      if (v.stage === 2) lines.push(['SPACE · STAGE SEPARATION', dim, 12]);
      if (v.stage === 1 && G.location === 'earth') lines.push([v.pos.y < 3000 ? 'ORBIT AT 3,000 M · ' + Math.max(0, Math.round(3000 - v.pos.y)) + ' M TO GO' : 'ORBIT', dim, 12]);
      if (G.location !== 'earth') lines.push(['CLIMB 1,500 M TO RETURN TO ORBIT', dim, 12]);
      const maxDec = (v.stage === 2 ? v.def.twr1 : v.def.twr2) * 9.81 - g;
      const stop = v.vel.y < 0 ? (v.vel.y * v.vel.y) / (2 * Math.max(0.5, maxDec)) : 0;
      if (v.vel.y < -3 && agl < stop * 1.35 + 30) lines.push(['LANDING BURN · FULL THROTTLE', (performance.now() / 250) % 2 < 1 ? '#ff6a5a' : '#ffb0a0', 14]);
      else if (v.vel.y < -8 && agl < 600) lines.push(['R HOLD LEVEL · SLOW TO UNDER 8 M/S', dim, 12]);
      if (fuel < 0.15) lines.push(['LOW FUEL', '#ffb45a', 13]);
    }
    lines.forEach(([txt, colr, size], i) => {
      c.font = `700 ${size * d}px 'DM Mono', monospace`;
      c.fillStyle = colr; c.textAlign = 'center';
      c.fillText(txt, cx, cy - H * 0.2 - i * 20 * d);
    });
    c.font = `500 ${11 * d}px 'DM Mono', monospace`;
  }

  // Floating name tags for other players and the NPC you're talking to.
  _labels() {
    const G = this.game, cam = G.camera;
    const want = new Map();
    for (const [id, r] of G.remotes) if (r.here) want.set('r' + id, { pos: r.labelPos(), text: r.name, cls: 'player', color: r.color });
    if (G.talkingTo) want.set('talk', { pos: tv.copy(G.talkingTo.pos).setY(G.talkingTo.pos.y + 2.1).clone(), text: G.talkingTo.name, cls: 'npc' });
    for (const [key, el] of this.labelPool) if (!want.has(key)) { el.remove(); this.labelPool.delete(key); }
    const w = innerWidth, h = innerHeight;
    for (const [key, L] of want) {
      let el = this.labelPool.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'tag ' + L.cls; this.labels.appendChild(el); this.labelPool.set(key, el); }
      if (el.textContent !== L.text) el.textContent = L.text;
      if (L.color) el.style.setProperty('--c', L.color);
      const p = L.pos.clone().project(cam);
      const vis = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
      el.style.display = vis ? 'block' : 'none';
      if (vis) {
        const dist = L.pos.distanceTo(cam.position);
        el.style.transform = `translate(${(p.x * 0.5 + 0.5) * w}px, ${(-p.y * 0.5 + 0.5) * h}px) translate(-50%, -100%) scale(${clamp(40 / dist, 0.6, 1)})`;
      }
    }
  }

  // ---- Map & journal -------------------------------------------------------------

  toggleMap(on = !this.mapOpen) {
    this.mapOpen = on;
    $('#mapOverlay').classList.toggle('on', on);
    if (on) this.drawBigMap();
  }

  drawBigMap() {
    const G = this.game, cv = $('#bigMap'), ctx = cv.getContext('2d');
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    cv.width = r.width * d; cv.height = r.height * d;
    const S = Math.min(cv.width, cv.height);
    const ox = (cv.width - S) / 2, oy = (cv.height - S) / 2;
    const onEarth = G.location === 'earth';
    $('#mapOverlay h2').textContent = onEarth ? 'Kestrel Island' : G.location === 'space' ? 'In orbit' : G.surface.name;
    ctx.fillStyle = onEarth ? '#082a3c' : '#05080c'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (G.location === 'space') {
      ctx.fillStyle = '#9fc4d8'; ctx.font = `600 ${14 * d}px 'DM Mono', monospace`; ctx.textAlign = 'center';
      G.space.targets().forEach((t, i) => ctx.fillText(`[${t.key}] ${t.name}  ·  ${Math.round(t.dist * 6.4).toLocaleString()} km`, cv.width / 2, cv.height / 2 - 30 * d + i * 26 * d));
      ctx.fillText('Press 1, 2 or 3 to warp · dive towards a world to land', cv.width / 2, cv.height / 2 + 70 * d);
      return;
    }
    const MS = G.world.terrain.mapSize || MAP_SIZE, HF = MS / 2;
    ctx.drawImage(G.world.terrain.mapCanvas, ox, oy, S, S);
    const X = (x) => ox + ((x + HF) / MS) * S, Z = (z) => oy + ((z + HF) / MS) * S;
    ctx.font = `600 ${12 * d}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    const labels = onEarth
      ? [PLACES.airbase, PLACES.village, PLACES.farm, PLACES.lighthouse, PLACES.beach, PLACES.stones, PLACES.turbines, PLACES.spaceport, { name: 'Red Mesa', x: -1300, z: -60 }, { name: 'Mount Kestrel', x: PLACES.peak.x, z: PLACES.peak.z + 160 }]
      : G.location === 'moon' ? [{ name: 'Kestrel-1 site', x: 70, z: -70 }, { name: 'Mare Serenitatis', x: 900, z: -900 }] : [{ name: 'Ares Station', x: 160, z: 170 }, { name: 'Jezero Crater Rim', x: 0, z: 2300 }, { name: 'Ares Vallis', x: 1200, z: -1150 }];
    for (const l of labels) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(l.name, X(l.x) + d, Z(l.z) + d);
      ctx.fillStyle = '#f4efe0'; ctx.fillText(l.name, X(l.x), Z(l.z));
    }
    for (const [id, s] of Object.entries(onEarth ? G.mysteries.sites : G.surface.sites)) {
      const found = G.mysteries.found.has(id);
      if (found) {
        ctx.fillStyle = '#7dffd6'; ctx.font = `700 ${16 * d}px sans-serif`; ctx.fillText('✦', X(s.pos.x), Z(s.pos.z) + 5 * d);
      } else {
        // Search area offset from the true spot so it's a hint, not a pin.
        const off = (id.charCodeAt(0) * 37) % 360 * Math.PI / 180;
        const rr = 180;
        ctx.strokeStyle = 'rgba(255,211,106,0.8)'; ctx.setLineDash([5 * d, 4 * d]); ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.arc(X(s.pos.x + Math.cos(off) * rr * 0.5), Z(s.pos.z + Math.sin(off) * rr * 0.5), (rr / MS) * S * 1.6, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd36a'; ctx.font = `700 ${14 * d}px 'DM Mono', monospace`; ctx.fillText('?', X(s.pos.x + Math.cos(off) * rr * 0.5), Z(s.pos.z + Math.sin(off) * rr * 0.5) + 5 * d);
      }
    }
    for (const r of G.remotes.values()) { if (!r.here) continue; ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(X(r.pos.x), Z(r.pos.z), 5 * d, 0, Math.PI * 2); ctx.fill(); ctx.fillText(r.name, X(r.pos.x), Z(r.pos.z) - 10 * d); }
    const p = G.focusPos();
    ctx.fillStyle = '#7dffd6'; ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), 6 * d, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#06121c'; ctx.lineWidth = 2 * d; ctx.stroke();
    ctx.fillStyle = '#eaf6ff'; ctx.font = `600 ${12 * d}px 'DM Mono', monospace`; ctx.fillText('YOU', X(p.x), Z(p.z) + 20 * d);
  }

  toggleJournal(on = !this.journalOpen) {
    this.journalOpen = on;
    const el = $('#journal');
    el.classList.toggle('on', on);
    if (!on) return;
    const G = this.game;
    $('#journalList').innerHTML = MYSTERY_INFO.map((m, i) => {
      const f = G.mysteries.found.has(m.id);
      return `<li class="${f ? 'found' : ''}"><span class="num">${String(i + 1).padStart(2, '0')}</span><div><b>${f ? escapeHTML(m.name) : 'Unknown signal'}</b><small>${escapeHTML(f ? m.place : 'Hint: ' + m.hint)}</small>${f ? `<p>${escapeHTML(m.lore)}</p>` : ''}</div></li>`;
    }).join('');
    $('#journalStats').textContent = `${G.mysteries.count} of ${MYSTERY_INFO.length} found · ${G.stats.drones} drones cleared · ${G.animals.abducted} cows borrowed`;
  }
}
