// Ares Rover: a six-wheeled pressurised exploration rover for the Moon and
// Mars. A tall hazard-striped chassis, a windowed cab with a seated
// astronaut, big treaded tyres, a water tank, a folded science arm, a mast
// with camera and dish, and light bars. It exposes the same parts as the
// road cars (wheels, steering pivots, lamp materials) so it drives with the
// car physics, only in the local gravity of the world it is on.

import * as THREE from 'three';
import { stdMat, glowSprite, canvasTexture } from '../core/util.js';
import { Human, outfitFor } from '../actors/human.js';
import { mulberry32 } from '../core/noise.js';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent; m.receiveShadow = true;
  parent.add(m);
  return m;
}

function hazardTexture() {
  return canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#e8e4da'; c.fillRect(0, 0, w, h);
    // Panel seams, rivets and wear.
    const rnd = mulberry32(14);
    for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(${rnd() < 0.5 ? '80,60,40' : '255,255,255'},${rnd() * 0.12})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 8, 1 + rnd() * 3); }
    c.fillStyle = '#c9a23a'; c.fillRect(0, h - 18, w, 18);
    c.fillStyle = '#16181a'; for (let x = -h; x < w + h; x += 24) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 12, h - 18); c.lineTo(x + 24, h - 18); c.lineTo(x + 12, h); c.fill(); }
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h - 18); c.stroke(); }
    c.fillStyle = '#2a2d31'; c.font = 'bold 26px Arial'; c.fillText('ARES  R-6', 80, 38);
  }, { repeat: true });
}

function treadTexture() {
  return canvasTexture(128, 64, (c, w, h) => {
    c.fillStyle = '#1b1c1e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#34363a'; for (let x = 0; x < w; x += 16) c.fillRect(x, 4, 9, h - 8);
    c.fillStyle = '#26282b'; for (let x = 8; x < w; x += 16) c.fillRect(x, 10, 4, h - 20);
  }, { repeat: true });
}

export function buildRover({ color = 0xe8e4da } = {}) {
  const g = new THREE.Group();
  const hz = once('roverHazard', hazardTexture);
  const body = new THREE.MeshStandardMaterial({ map: hz, color, roughness: 0.55, metalness: 0.25 });
  const grey = stdMat(0x7b7f84, { rough: 0.5, metal: 0.55 });
  const dark = stdMat(0x1a1b1e, { rough: 0.55, metal: 0.4 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b2d4c, metalness: 0.7, roughness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b141c, roughness: 0.04, metalness: 0.9, emissive: 0x05090d, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 });
  const orange = stdMat(0xe8742a, { rough: 0.5, metal: 0.2 });
  const WR = 0.62, TRACK = 2.55, WB = 3.5;

  // Chassis deck and cab.
  add(g, new THREE.BoxGeometry(2.7, 0.75, 6.0), body, 0, 0.85, 0);
  add(g, new THREE.BoxGeometry(2.8, 0.12, 6.1), dark, 0, 0.45, 0);
  const cab = new THREE.Group(); g.add(cab);
  add(cab, new THREE.BoxGeometry(2.4, 1.35, 2.4), body, 0, 1.9, 1.35);
  add(cab, new THREE.BoxGeometry(2.0, 0.85, 0.06), glass, 0, 2.05, 2.56, -0.18, 0, 0);          // windscreen
  for (const s of [-1, 1]) add(cab, new THREE.BoxGeometry(0.06, 0.8, 1.5), glass, s * 1.22, 2.05, 1.5);   // side windows
  add(cab, new THREE.BoxGeometry(2.5, 0.12, 2.5), orange, 0, 2.62, 1.35);
  for (const s of [-1, 1]) add(cab, new THREE.BoxGeometry(0.12, 1.4, 0.12), dark, s * 1.0, 1.95, 2.52);
  // Roof gear: light bar, beacon, dish and camera mast.
  add(cab, new THREE.BoxGeometry(1.7, 0.14, 0.2), dark, 0, 2.78, 2.35);
  const barLamps = [];
  for (let i = 0; i < 5; i++) barLamps.push(add(cab, new THREE.BoxGeometry(0.26, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6b0, emissiveIntensity: 0.05 }), -0.7 + i * 0.35, 2.78, 2.46));
  add(g, new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), grey, 0.8, 3.7, 0.6);
  const camHead = new THREE.Group(); camHead.position.set(0.8, 4.9, 0.6); g.add(camHead);
  add(camHead, new THREE.BoxGeometry(0.7, 0.28, 0.32), body);
  add(camHead, new THREE.BoxGeometry(0.16, 0.16, 0.05), dark, 0.18, 0, 0.18);
  add(camHead, new THREE.BoxGeometry(0.16, 0.16, 0.05), dark, -0.18, 0, 0.18);
  const dishGeo = new THREE.SphereGeometry(0.62, 18, 8, 0, Math.PI * 2, 0, 0.85); dishGeo.rotateX(-0.9);
  const dish = add(g, dishGeo, body, -0.9, 3.55, -0.4);
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), grey, -0.9, 3.0, -0.4);
  const beacon = glowSprite(0xff7a2a, 1.4, 0); beacon.position.set(0, 3.0, 1.35); g.add(beacon);

  // Water tank, solar wing, equipment crates and the folded arm on the rear deck.
  const tank = add(g, new THREE.CylinderGeometry(0.78, 0.78, 2.3, 20).rotateX(Math.PI / 2), body, 0, 1.75, -1.6);
  tank.scale.set(1.1, 1, 1);
  for (const z of [-0.7, -2.5]) add(g, new THREE.TorusGeometry(0.8, 0.05, 8, 24), grey, 0, 1.75, z).scale.set(1.1, 1, 1);
  add(g, new THREE.BoxGeometry(2.4, 0.06, 1.7), panel, 0, 2.62, -1.6);
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.1, 0.62, 1.2), grey, s * 1.0, 2.3, -1.6);
  add(g, new THREE.BoxGeometry(0.12, 0.12, 1.5), body, -0.8, 1.4, 3.2);
  add(g, new THREE.BoxGeometry(0.34, 0.3, 0.34), grey, -0.8, 1.3, 3.95);
  add(g, new THREE.BoxGeometry(1.6, 0.25, 0.5), dark, 0, 0.62, 3.15);                                // bumper
  // Steps and handrails.
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.4, 0.06, 0.8), grey, s * 1.5, 0.82, 1.0);
    add(g, new THREE.BoxGeometry(0.05, 0.7, 0.05), grey, s * 1.38, 1.3, 1.45);
  }

  // Wheels: three per side, the front pair steers.
  const tex = once('roverTread', treadTexture);
  const tyreMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const rimMat = stdMat(0x9a9ea3, { rough: 0.4, metal: 0.8 });
  const wheels = [], pivots = [];
  for (const [zi, front] of [[WB / 2, true], [0, false], [-WB / 2, false]]) for (const sd of [1, -1]) {
    const outer = new THREE.Group(), spin = new THREE.Group();
    outer.add(spin);
    const tyre = new THREE.CylinderGeometry(WR, WR, 0.62, 28); tyre.rotateZ(Math.PI / 2);
    const t = add(spin, tyre, tyreMat);
    t.material.map.repeat.set(3, 1);
    const hub = new THREE.CylinderGeometry(WR * 0.55, WR * 0.55, 0.66, 18); hub.rotateZ(Math.PI / 2);
    add(spin, hub, rimMat);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(spin, new THREE.BoxGeometry(0.7, 0.07, 0.1), dark, 0, Math.sin(a) * WR * 0.35, Math.cos(a) * WR * 0.35, a, 0, 0); }
    const pivot = new THREE.Group();
    pivot.position.set(sd * TRACK / 2, 0, zi);
    pivot.add(outer); outer.position.x = sd * 0.0;
    g.add(pivot);
    // Suspension arm up to the chassis.
    add(g, new THREE.BoxGeometry(0.7, 0.14, 0.14), grey, sd * (TRACK / 2 - 0.35), 0.5, zi, 0, 0, sd * 0.4);
    wheels.push({ spin, side: sd, front });
    if (front) pivots.push(pivot);
  }

  // Lights: forward flood lamps and rear tail lamps.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.05, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff2010, emissiveIntensity: 0.12, roughness: 0.4 });
  const headGlow = [], tailGlow = [];
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.42, 0.22, 0.12), headMat, s * 0.95, 0.95, 3.04);
    const hg = glowSprite(0xfff0c8, 1.6, 0); hg.position.set(s * 0.95, 0.95, 3.2); g.add(hg); headGlow.push(hg);
    add(g, new THREE.BoxGeometry(0.34, 0.18, 0.1), tailMat, s * 1.05, 1.0, -3.03);
    const tg = glowSprite(0xff3018, 1.1, 0); tg.position.set(s * 1.05, 1.0, -3.15); g.add(tg); tailGlow.push(tg);
  }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 7.5), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(0, 0.95, 3.2); g.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.set(0, -WR + 0.06, 8.8); g.add(pool);

  // Cab interior: seats, a wheel-less joystick console and the astronaut.
  const seatMat = stdMat(0x24262a, { rough: 0.9 });
  const stick = new THREE.Group(); stick.position.set(0.45, 1.75, 2.05); cab.add(stick);
  add(stick, new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), dark, 0, 0.15, 0);
  add(cab, new THREE.BoxGeometry(2.0, 0.4, 0.5), dark, 0, 1.55, 2.2);
  for (const s of [-1, 1]) { add(cab, new THREE.BoxGeometry(0.5, 0.16, 0.55), seatMat, s * 0.5, 1.35, 1.25); add(cab, new THREE.BoxGeometry(0.5, 0.6, 0.14), seatMat, s * 0.5, 1.7, 0.95); }
  const pilot = new Human(outfitFor('astronaut', mulberry32(31)), { shadows: false });
  pilot.state = 'pilot';
  for (let i = 0; i < 40; i++) pilot.animate(0.05);
  pilot.root.scale.setScalar(0.92);
  pilot.root.position.set(0.5, 1.02, 1.1);
  g.add(pilot.root);

  const spec = { eye: [0.45, 2.15, 1.45], wheelR: WR, track: TRACK, wb: WB, length: 6.2, tyreW: 0.62, cab: { camDist: 12, camHeight: 3.6 } };
  return {
    group: g,
    parts: { wheels, pivots, wheelbase: WB, track: TRACK, headMat, tailMat, headGlow, tailGlow, beam, pool, steerWheel: stick, pilot, body: g, dish, camHead, beacon, barLamps },
    ground: WR, radius: 3.4, length: 6.2, camDist: 12, camHeight: 3.6, wb: WB, track: TRACK, spec,
  };
}
