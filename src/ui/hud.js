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

  update(dt) {
    const G = this.game;
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
      $('#locName').textContent = G.space.active ? 'Low Earth Orbit' : G.world.terrain.regionName(p.x, p.z, p.y);
      $('#clock').textContent = G.sky.clockString();
      $('#dayIcon').textContent = G.sky.night > 0.5 ? '☾' : G.sky.golden > 0.4 ? '◐' : '☀';
      $('#mysteryCount').textContent = G.mysteries.count + ' / ' + MYSTERY_INFO.length;
      $('#score').textContent = String(G.score).padStart(5, '0');
      const peers = G.net.peerList();
      $('#peers').innerHTML = peers.length ? peers.map((p) => `<div><i style="background:${p.color}"></i>${escapeHTML(p.name)}</div>`).join('') : '';
      $('#peerBox').style.display = peers.length ? 'block' : 'none';
      $('#modeTag').textContent = G.modeLabel();
    }
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
    const range = G.space.active ? 3000 : v ? clamp(400 + v.speed * 6 + (v.pos.y - 100) * 0.5, 500, 2200) : 260;
    const scale = (w / 2) / range; // px per metre
    c.save();
    c.clearRect(0, 0, w, h);
    c.beginPath(); c.arc(w / 2, h / 2, w / 2 - d, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0c3a52'; c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    c.rotate(heading - Math.PI);
    const k = img.width / MAP_SIZE;
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.95;
    c.drawImage(img, (p.x + HALF - range * 1.5) * k, (p.z + HALF - range * 1.5) * k, range * 3 * k, range * 3 * k, -range * 1.5 * scale, -range * 1.5 * scale, range * 3 * scale, range * 3 * scale);
    c.globalAlpha = 1;
    const dot = (x, z, r, color, ring = false) => {
      const mx = (x - p.x) * scale, mz = (z - p.z) * scale;
      if (mx * mx + mz * mz > (w / 2) * (w / 2)) return;
      c.fillStyle = color;
      c.beginPath(); c.arc(mx, mz, r * d, 0, Math.PI * 2);
      if (ring) { c.strokeStyle = color; c.lineWidth = 1.5 * d; c.stroke(); } else c.fill();
    };
    for (const n of G.npcs.list) if (Math.abs(n.pos.x - p.x) < range && Math.abs(n.pos.z - p.z) < range) dot(n.pos.x, n.pos.z, 1.6, '#f4efe0');
    for (const veh of G.vehicles) if (!veh.destroyed && veh !== v) dot(veh.pos.x, veh.pos.z, 3, veh.locked ? '#8a7aa8' : '#ffd36a');
    for (const s of G.aliens.saucers) if (G.sky.night > 0.4 && s.state !== 'high') dot(s.pos.x, s.pos.z, 3.2, '#c89aff');
    for (const r of G.remotes.values()) dot(r.pos.x, r.pos.z, 3.5, r.color);
    for (const [id, s] of Object.entries(G.mysteries.sites)) {
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
    const speed = inSpace ? G.space.speed : v.speed;
    const alt = inSpace ? G.space.altitude * 1000 : v.pos.y;
    const unitsSpeed = inSpace ? 'KM/H×10' : 'KT';
    const spd = inSpace ? speed * 36 : speed * 1.944;
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
    tape(cx + Math.min(W * 0.28, 330 * d), alt, inSpace ? 5000 : alt > 1500 ? 200 : 50, inSpace ? 'ALT M' : 'ALT M', true);

    if (!inSpace && v.kind === 'plane') {
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
      if (v.kind === 'ufo') {
        c.fillText(v.pos.y > 2400 ? 'HOLD SPACE ABOVE 3,000 M TO LEAVE THE ATMOSPHERE' : 'E TRACTOR BEAM · SHIFT BOOST', cx, cy + H * 0.23 + 18 * d);
      }
      if (v.onGround && v.kind === 'heli') c.fillText('HOLD SPACE TO LIFT OFF', cx, cy + H * 0.2);
    } else {
      c.textAlign = 'center';
      c.fillText('W THRUST · MOUSE STEER · SPACE/C UP/DOWN · SHIFT BOOST · DIVE INTO THE ATMOSPHERE TO RETURN', cx, H * 0.86);
    }
  }

  // Floating name tags for other players and the NPC you're talking to.
  _labels() {
    const G = this.game, cam = G.camera;
    const want = new Map();
    for (const [id, r] of G.remotes) want.set('r' + id, { pos: r.labelPos(), text: r.name, cls: 'player', color: r.color });
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
    ctx.fillStyle = '#082a3c'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(G.world.terrain.mapCanvas, ox, oy, S, S);
    const X = (x) => ox + ((x + HALF) / MAP_SIZE) * S, Z = (z) => oy + ((z + HALF) / MAP_SIZE) * S;
    ctx.font = `600 ${12 * d}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    const labels = [PLACES.airbase, PLACES.village, PLACES.farm, PLACES.lighthouse, PLACES.beach, PLACES.stones, PLACES.turbines, { name: 'Red Mesa', x: -1300, z: -60 }, { name: 'Mount Kestrel', x: PLACES.peak.x, z: PLACES.peak.z + 160 }];
    for (const l of labels) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(l.name, X(l.x) + d, Z(l.z) + d);
      ctx.fillStyle = '#f4efe0'; ctx.fillText(l.name, X(l.x), Z(l.z));
    }
    for (const [id, s] of Object.entries(G.mysteries.sites)) {
      const found = G.mysteries.found.has(id);
      if (found) {
        ctx.fillStyle = '#7dffd6'; ctx.font = `700 ${16 * d}px sans-serif`; ctx.fillText('✦', X(s.pos.x), Z(s.pos.z) + 5 * d);
      } else {
        // Search area offset from the true spot so it's a hint, not a pin.
        const off = (id.charCodeAt(0) * 37) % 360 * Math.PI / 180;
        const rr = 180;
        ctx.strokeStyle = 'rgba(255,211,106,0.8)'; ctx.setLineDash([5 * d, 4 * d]); ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.arc(X(s.pos.x + Math.cos(off) * rr * 0.5), Z(s.pos.z + Math.sin(off) * rr * 0.5), (rr / MAP_SIZE) * S * 1.6, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd36a'; ctx.font = `700 ${14 * d}px 'DM Mono', monospace`; ctx.fillText('?', X(s.pos.x + Math.cos(off) * rr * 0.5), Z(s.pos.z + Math.sin(off) * rr * 0.5) + 5 * d);
      }
    }
    for (const r of G.remotes.values()) { ctx.fillStyle = r.color; ctx.beginPath(); ctx.arc(X(r.pos.x), Z(r.pos.z), 5 * d, 0, Math.PI * 2); ctx.fill(); ctx.fillText(r.name, X(r.pos.x), Z(r.pos.z) - 10 * d); }
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
