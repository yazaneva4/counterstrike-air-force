// Entry point: the title screen (a live Earth with the sun, moon and a
// visiting saucer), pilot profile and world options, multiplayer rooms,
// loading, pause/settings, chat, and the main loop.

import * as THREE from 'three';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { createEarth } from './space/globe.js';
import { buildSaucer } from './vehicles/models.js';
import { CHARACTERS } from './player.js';
import { Game } from './game.js';
import { Net } from './net/net.js';
import { cloud } from './net/cloud.js';
import { glowSprite, isTouch, clamp } from './core/util.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');

// ---- Settings ------------------------------------------------------------------
const STORE = 'csaf-settings-v2';
const defaults = { sensitivity: 1, invertY: false, volume: 0.8, muted: false, quality: 'auto', profile: { name: '', character: 'pilot', skin: 1 }, spawn: 'airbase', time: 'live' };
let settings = defaults;
try { settings = Object.assign({}, defaults, JSON.parse(localStorage.getItem(STORE) || '{}')); settings.profile = Object.assign({}, defaults.profile, settings.profile); } catch (e) { /* ignore */ }
let saveTimer = 0;
const save = () => {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  clearTimeout(saveTimer); saveTimer = setTimeout(() => cloud.save(settings, game), 1500);
};
if (!settings.profile.name) settings.profile.name = 'Pilot ' + Math.floor(100 + Math.random() * 900);
// Cloud save: pull progress before the title screen is built.
// `saved` is hidden from JSON so it is not copied into local storage.
Object.defineProperty(settings, 'saved', { value: null, writable: true, enumerable: false });
const cloudReady = cloud.load(settings, 4000).then((s) => { settings.saved = s || cloud.last; return s; });

function resolveQuality() {
  if (settings.quality !== 'auto') return settings.quality;
  const mobile = isTouch() && Math.min(screen.width, screen.height) < 900;
  return mobile ? 'low' : (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
}

// ---- Renderer ------------------------------------------------------------------
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
} catch (err) {
  document.body.classList.add('no-webgl');
  $('#startBtn').disabled = true;
  $('#webglNote').textContent = 'This browser could not start 3D graphics. Please open the game in a browser with WebGL enabled.';
}
const pixelRatio = () => Math.min(devicePixelRatio || 1, { high: 1.75, medium: 1.35, low: 1 }[resolveQuality()] || 1.35);
if (renderer) { renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight); }

const input = new Input(canvas);
const audio = new AudioEngine();
audio.volume = settings.volume;
audio.muted = settings.muted;

// ---- Title scene -----------------------------------------------------------------
const menu = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 5000) };
let earth = null, saucer = null, moon = null, stars = null;
if (renderer) {
  menu.scene.background = new THREE.Color(0x01030a);
  earth = createEarth(1, renderer, { segments: 128 });
  earth.group.rotation.set(0.35, -2.1, 0.12);
  menu.scene.add(earth.group);
  const sunDir = new THREE.Vector3(-0.95, 0.22, 0.18).normalize();
  earth.setSun(sunDir);
  const sun = glowSprite(0xfff1d6, 26, 1); sun.position.copy(sunDir).multiplyScalar(60); menu.scene.add(sun);
  const sunCore = glowSprite(0xffffff, 6, 1); sunCore.position.copy(sun.position); menu.scene.add(sunCore);
  const moonMat = new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 1 });
  moon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 16), moonMat);
  menu.scene.add(moon);
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.copy(sunDir); menu.scene.add(light);
  menu.scene.add(new THREE.AmbientLight(0x223344, 0.4));
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) { const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(400 + Math.random() * 400); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
  menu.scene.add(stars);
  const s = buildSaucer();
  saucer = s.group;
  saucer.scale.setScalar(0.012);
  s.parts.halo.material.opacity = 0.6;
  menu.saucerParts = s.parts;
  menu.scene.add(saucer);
  layoutMenuCamera();
}

function layoutMenuCamera() {
  const wide = innerWidth / innerHeight > 1.05;
  menu.camera.aspect = innerWidth / innerHeight;
  menu.camera.position.set(wide ? -1.25 : 0, wide ? 0.05 : -0.7, wide ? 3.9 : 5.2);
  menu.camera.lookAt(wide ? -1.25 : 0, wide ? 0.05 : -0.7, 0);
  menu.camera.updateProjectionMatrix();
}

function renderMenu(dt, t) {
  if (!renderer || !earth) return;
  earth.update(dt);
  earth.group.rotation.y += dt * 0.035;
  const a = t * 0.32;
  saucer.position.set(Math.cos(a) * 1.45, Math.sin(a * 0.7) * 0.35 + 0.15, Math.sin(a) * 1.45);
  saucer.rotation.set(0.3, t * 2, 0.15);
  menu.saucerParts.lights.forEach((m, i) => m.color.setHSL(0.45 + 0.1 * Math.sin(i + t * 3), 1, 0.5 + 0.2 * Math.sin(t * 6 - i)));
  moon.position.set(Math.cos(t * 0.05 + 2) * 4.2, 0.9, Math.sin(t * 0.05 + 2) * 4.2 - 1);
  const px = (menu.mx || 0) * 0.08, py = (menu.my || 0) * 0.05;
  menu.camera.position.x += (layoutX() + px - menu.camera.position.x) * Math.min(1, dt * 2);
  menu.camera.position.y += (layoutY() - py - menu.camera.position.y) * Math.min(1, dt * 2);
  renderer.toneMappingExposure = 1.0;
  renderer.render(menu.scene, menu.camera);
}
const layoutX = () => (innerWidth / innerHeight > 1.05 ? -1.25 : 0);
const layoutY = () => (innerWidth / innerHeight > 1.05 ? 0.05 : -0.7);
addEventListener('pointermove', (e) => { menu.mx = e.clientX / innerWidth - 0.5; menu.my = e.clientY / innerHeight - 0.5; });

// ---- Menu UI ----------------------------------------------------------------------
function segmented(el, key, values) {
  el.innerHTML = values.map(([v, label]) => `<button type="button" data-v="${v}" class="${settings[key] === v ? 'on' : ''}">${label}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    settings[key] = b.dataset.v; save(); audio.init(); audio.click();
    el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
}

function buildMenu() {
  $('#pilotName').value = settings.profile.name;
  if (!buildMenu.bound) { buildMenu.bound = true; $('#pilotName').addEventListener('input', (e) => { settings.profile.name = e.target.value.slice(0, 18) || 'Pilot'; save(); }); }
  const chars = $('#characters');
  const icons = { pilot: '✈', explorer: '⛰', scientist: '⚗', crew: '⚙' };
  chars.innerHTML = CHARACTERS.map((c) => `<button type="button" data-c="${c.id}" class="${settings.profile.character === c.id ? 'on' : ''}"><span>${icons[c.id]}</span>${c.label}</button>`).join('');
  chars.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    settings.profile.character = b.dataset.c; save(); audio.init(); audio.click();
    chars.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const skins = ['#f1c7a5', '#e0ac86', '#c68a62', '#a66d47', '#7c4c32', '#5a3825'];
  const sk = $('#skins');
  sk.innerHTML = skins.map((c, i) => `<button type="button" aria-label="Skin tone ${i + 1}" data-i="${i}" style="--c:${c}" class="${settings.profile.skin === i ? 'on' : ''}"></button>`).join('');
  sk.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    settings.profile.skin = +b.dataset.i; save(); audio.init(); audio.click();
    sk.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  segmented($('#spawnSel'), 'spawn', [['airbase', 'Airbase'], ['spaceport', 'Spaceport'], ['village', 'Village'], ['beach', 'Beach'], ['farm', 'Farm']]);
  segmented($('#timeSel'), 'time', [['live', 'Real time'], ['dawn', 'Dawn'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']]);
  segmented($('#qualitySel'), 'quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]);
  $('#hostBtn').onclick = () => { audio.init(); pendingRoom = { host: true }; $('#roomStatus').textContent = 'A room will open when you enter the island'; $('#roomCode').value = ''; };
  $('#joinBtn').onclick = () => {
    audio.init();
    const code = $('#roomCode').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { $('#roomStatus').textContent = 'Enter a 5-character room code'; return; }
    pendingRoom = { host: false, code };
    $('#roomStatus').textContent = `You will join ${code} when you enter the island`;
  };
  $('#roomCode').onkeydown = (e) => { if (e.key === 'Enter') $('#joinBtn').click(); };
  const params = new URLSearchParams(location.search);
  if (params.get('room')) { $('#roomCode').value = params.get('room').toUpperCase().slice(0, 5); pendingRoom = { host: false, code: $('#roomCode').value }; $('#roomStatus').textContent = `Invited to room ${$('#roomCode').value}`; }
  $('#startBtn').onclick = startGame;
}
let pendingRoom = null;

// ---- Settings panel ----------------------------------------------------------------
function bindSettings() {
  const sens = $('#setSens'), inv = $('#setInvert'), vol = $('#setVol'), mute = $('#setMute');
  sens.value = settings.sensitivity; inv.checked = settings.invertY; vol.value = settings.volume; mute.checked = settings.muted;
  sens.addEventListener('input', () => { settings.sensitivity = +sens.value; save(); });
  inv.addEventListener('change', () => { settings.invertY = inv.checked; save(); });
  vol.addEventListener('input', () => { settings.volume = +vol.value; audio.volume = settings.volume; audio.setMuted(settings.muted); save(); });
  mute.addEventListener('change', () => { settings.muted = mute.checked; audio.setMuted(settings.muted); save(); });
}

// ---- Game start ---------------------------------------------------------------------
let game = null;
const TIMES = { dawn: 0.265, day: 0.4, sunset: 0.735, night: 0.9 };

// Full screen (and landscape where the browser allows it) for touch play.
function toggleFullscreen(force) {
  try {
    const el = document.documentElement;
    if (document.fullscreenElement) { if (force !== true) document.exitFullscreen?.(); return; }
    const p = el.requestFullscreen?.({ navigationUI: 'hide' }) || el.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } catch (e) { /* not supported (iPhone Safari): use Add to Home Screen */ }
}

let starting = false;
async function startGame() {
  if (!renderer || starting || game?.running) return;
  starting = true;
  if (isTouch()) toggleFullscreen(true);
  audio.init();
  audio.click();
  $('#menu').classList.add('out');
  $('#loading').classList.add('on');
  settings.quality = settings.quality || 'auto';
  const q = resolveQuality();
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  game = new Game({ renderer, input, audio, settings: { ...settings, saved: settings.saved, quality: q, get sensitivity() { return settings.sensitivity; }, get invertY() { return settings.invertY; } } });
  try {
    await game.build((f, label) => {
      $('#loadBar').style.width = Math.round(f * 100) + '%';
      $('#loadLabel').textContent = label;
    });
  } catch (err) {
    console.error(err);
    $('#loadLabel').textContent = 'Something went wrong while building the world: ' + err.message;
    return;
  }
  game.onProgress = () => save();
  game.onRoomChange = (code, host) => {
    $('#roomBadge').textContent = code ? `ROOM ${code}` : '';
    $('#roomBadge').style.display = code ? 'block' : 'none';
    $('#invite').style.display = code ? 'inline-block' : 'none';
    $('#invite').dataset.code = code || '';
  };
  $('#loading').classList.remove('on');
  $('#menu').style.display = 'none';
  document.body.classList.add('playing');
  if (isTouch()) document.body.classList.add('touch');
  game.start({ spawn: settings.spawn, time: settings.time === 'live' ? 'live' : TIMES[settings.time] ?? 0.4 });
  game.fade(1.4);
  if (pendingRoom) {
    if (pendingRoom.host) game.net.host(settings.profile.name);
    else game.net.join(pendingRoom.code, settings.profile.name);
  }
}

// ---- Pause / chat ------------------------------------------------------------------------
function setPaused(p) {
  if (!game) return;
  game.paused = p;
  $('#pause').classList.toggle('on', p);
  input.clear();
  input.enabled = !p && !$('#chat').classList.contains('typing');
  if (p) input.releaseLock();
}

addEventListener('keydown', (e) => {
  if (!game || !game.running) return;
  const chat = $('#chatInput');
  if (e.target === chat) {
    if (e.key === 'Enter') {
      const text = chat.value.trim();
      if (text) {
        if (game.net.online) { game.net.chat(text); game.chatLine(settings.profile.name, text, '#7dffd6'); }
        else game.chatLine('', 'You are playing solo · create or join a room from the pause menu to chat', '#ffb45a');
      }
      chat.value = ''; chat.blur(); $('#chat').classList.remove('typing'); input.enabled = true;
    } else if (e.key === 'Escape') { chat.value = ''; chat.blur(); $('#chat').classList.remove('typing'); input.enabled = true; }
    return;
  }
  if (e.key === 'Enter' && !game.paused) {
    e.preventDefault();
    $('#chat').classList.add('typing'); input.clear(); input.enabled = false; input.releaseLock();
    setTimeout(() => chat.focus(), 0);
  }
  if (e.key === 'Escape') {
    if (game.hud.mapOpen) { game.hud.toggleMap(false); return; }
    if (game.hud.journalOpen) { game.hud.toggleJournal(false); return; }
    setPaused(!game.paused);
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!game || !game.running) return;
  $('#lockHint').classList.toggle('on', !document.pointerLockElement && !game.paused && !isTouch() && !$('#chat').classList.contains('typing'));
});

function bindPause() {
  $('#resumeBtn').addEventListener('click', () => { setPaused(false); input.requestLock(); });
  $('#titleBtn').addEventListener('click', () => { game?.net?.leave(true); location.reload(); });
  $('#pauseHost').addEventListener('click', () => { game.net.host(settings.profile.name); });
  $('#pauseJoin').addEventListener('click', () => { game.net.join($('#pauseCode').value, settings.profile.name); });
  $('#pauseLeave').addEventListener('click', () => { game.net.leave(); });
  $('#invite').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?room=' + $('#invite').dataset.code;
    try { await navigator.clipboard.writeText(url); game.hud.toast('Invite link copied'); } catch (e) { game.hud.toast(url, 6); }
  });
  $('#journalClose').addEventListener('click', () => game.hud.toggleJournal(false));
  $('#mapClose').addEventListener('click', () => game.hud.toggleMap(false));
  $('#helpClose').addEventListener('click', () => $('#help').classList.remove('on'));
  $('#lockHint').addEventListener('click', () => input.requestLock());
  // Touch shortcuts.
  document.querySelectorAll('[data-hud]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.hud;
    if (k === 'map') game.hud.toggleMap();
    if (k === 'journal') game.hud.toggleJournal();
    if (k === 'pause') setPaused(!game.paused);
    if (k === 'view' && game.player && !game.paused) { game.player.toggleView(); b.blur(); }
    if (k === 'help') $('#help').classList.toggle('on');
    if (k === 'chat') { $('#chat').classList.add('typing'); input.clear(); input.enabled = false; setTimeout(() => $('#chatInput').focus(), 0); }
    if (k === 'full') toggleFullscreen();
  }));
}

// ---- Adaptive resolution: trade pixels for a steady frame rate. ----------------------------
const perf = { acc: 0, n: 0, scale: 1, cooldown: 4 };
function adaptResolution(rawDt) {
  perf.acc += rawDt; perf.n++;
  perf.cooldown -= rawDt;
  if (perf.acc < 2) return;
  const avg = perf.acc / perf.n;
  perf.acc = 0; perf.n = 0;
  if (perf.cooldown > 0 || document.hidden) return;
  let next = perf.scale;
  if (avg > 1 / 38 && perf.scale > 0.55) next = Math.max(0.55, perf.scale - 0.15);
  else if (avg < 1 / 58 && perf.scale < 1) next = Math.min(1, perf.scale + 0.1);
  if (next !== perf.scale) {
    perf.scale = next;
    perf.cooldown = 3;
    renderer.setPixelRatio(pixelRatio() * perf.scale);
    renderer.setSize(innerWidth, innerHeight);
    game?.resize(innerWidth, innerHeight);
  }
}

// ---- Loop ------------------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  const t = now / 1000;
  input.poll(dt);
  if (input.padHit('start') && game && game.running) setPaused(!game.paused);
  if (game && game.running && !game.paused) adaptResolution(Math.min(rawDt, 0.25));
  if (game && game.running) game.frame(dt, t);
  else {
    renderMenu(dt, t);
    audio.update({ dt, menu: true, night: 1, altitude: 0, coast: 0, speed: 0 });
    input.endFrame();
  }
  requestAnimationFrame(loop);
}

addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setPixelRatio(pixelRatio() * perf.scale);
  renderer.setSize(innerWidth, innerHeight);
  layoutMenuCamera();
  game?.resize(innerWidth, innerHeight);
});

buildMenu();
bindSettings();
setInterval(() => cloud.save(settings, game), 60000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cloud.save(settings, game, { keepalive: true });
  else if (game?.running) game.weather?.refresh();
});
// Cloud progress arrives after the title screen is up: refresh the pickers.
cloudReady.then((s) => { if (s && !game) buildMenu(); });
bindPause();
requestAnimationFrame(loop);
document.body.classList.add('ready');
window.__csaf = { get game() { return game; }, settings, Net };
