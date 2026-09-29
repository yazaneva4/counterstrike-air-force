// Kestrel Spaceport on the east coast: launch complex LC-1 (concrete
// hardstand, launch mount over the flame trench, a 70 m lattice service tower
// with crew access arm, lightning masts with catenary wires, propellant
// spheres and a deluge water tower), the Vehicle Assembly Building, Mission
// Control with a tracking dish, the Odyssey spaceplane pad and the booster
// landing zone. Rockets launch east over the ocean.

import * as THREE from 'three';
import { canvasTexture, stdMat, mesh, glowSprite } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { latticeTexture } from '../vehicles/spacecraft.js';
import { PLACES } from './terrain.js';

export const MOUNT_H = 3.0; // launch mount height: the booster's engines sit this high above the pad deck

function padMarking(kind) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6d6f6c'; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(kind.length * 17);
    for (let i = 0; i < 4000; i++) { const v = 90 + rnd() * 40; ctx.fillStyle = `rgba(${v},${v},${v - 3},0.3)`; ctx.fillRect(rnd() * w, rnd() * h, 2, 2); }
    // Scorch marks from previous landings.
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.4);
    g.addColorStop(0, 'rgba(20,18,16,0.7)'); g.addColorStop(1, 'rgba(20,18,16,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2f2ee'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f2f2ee';
    if (kind === 'X') {
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-w * 0.3, -18, w * 0.6, 36); ctx.fillRect(-18, -w * 0.3, 36, w * 0.6); ctx.restore();
    } else {
      ctx.font = 'bold 200px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kind, w / 2, h / 2 + 10);
    }
  }, { anisotropy: 8 });
}

function vabFacade() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#d9d8d2'; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(77);
    // Vertical ribbing and panel rows.
    for (let x = 0; x < w; x += 16) { ctx.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.04})`; ctx.fillRect(x, 0, 3, h); }
    for (let y = 0; y < h; y += 64) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, y, w, 2); }
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(90,80,70,${rnd() * 0.06})`; ctx.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 10, 20 + rnd() * 120); }
    // Dark window bands.
    ctx.fillStyle = 'rgba(40,50,60,0.55)';
    for (let x = 40; x < w - 40; x += 120) ctx.fillRect(x, 60, 60, h - 120);
  }, { repeat: true });
}

function vabLogo() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Flag.
    ctx.fillStyle = '#1d3e7a'; ctx.fillRect(w * 0.1, h * 0.05, w * 0.8, h * 0.42);
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.12);
    ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.26, h * 0.1, 0, Math.PI * 2); ctx.fill();
    // Agency roundel and name.
    ctx.fillStyle = '#1d3e7a'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.72, h * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.72, h * 0.26, h * 0.07, -0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f4f4f4'; ctx.font = 'bold 64px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('KESTREL', w * 0.5, h * 0.7); ctx.font = 'bold 40px Arial'; ctx.fillText('SPACE', w * 0.5, h * 0.78);
  });
}

function officeFacade() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e4e1da'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 2; row++) for (let x = 12; x < w - 20; x += 36) {
      ctx.fillStyle = '#23303a'; ctx.fillRect(x, 26 + row * 118, 26, 70);
      ctx.fillStyle = 'rgba(160,200,230,0.35)'; ctx.fillRect(x + 2, 28 + row * 118, 10, 66);
    }
  });
}

export function buildSpaceport(S) {
  const C = PLACES.spaceport;
  const zone = S.terrain.zone('spaceport');
  const y = zone.h;
  const g = new THREE.Group();
  g.name = 'spaceport';
  S.group.add(g);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8b8d89, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const steel = stdMat(0x5c6166, { rough: 0.5, metal: 0.8 });
  const white = stdMat(0xe8e6e0, { rough: 0.6 });
  const red = stdMat(0xb8412e, { rough: 0.6 });

  // ---- LC-1 launch pad ----
  const P = { x: C.x + 55, z: C.z - 20 };
  S._flatSlab(P.x, P.z, 70, 70, concrete, y + 0.05);
  // Flame trench (dark steel grating) running east.
  const trench = new THREE.Mesh(new THREE.PlaneGeometry(40, 9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.8, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
  trench.position.set(P.x + 20, y + 0.08, P.z); g.add(trench);
  // Launch mount: four legs carrying a steel table with a hole for the engines, hold-down clamps.
  const mount = new THREE.Group();
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    mount.add(mesh(new THREE.BoxGeometry(1.4, MOUNT_H, 1.4), steel, { x: sx * 3.6, y: MOUNT_H / 2, z: sz * 3.6 }));
    mount.add(mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), stdMat(0x2b2d30, { rough: 0.4, metal: 0.8 }), { x: sx * 1.6, y: MOUNT_H + 0.4, z: sz * 1.6 }));
  }
  for (const s of [1, -1]) {
    mount.add(mesh(new THREE.BoxGeometry(8.6, 0.7, 2.2), steel, { y: MOUNT_H - 0.35, z: s * 3.2 }));
    mount.add(mesh(new THREE.BoxGeometry(2.2, 0.7, 4.2), steel, { x: s * 3.2, y: MOUNT_H - 0.35 }));
  }
  mount.position.set(P.x, y + 0.05, P.z);
  g.add(mount);
  S.platforms.push({ x: P.x, z: P.z, hw: 4.3, hd: 4.3, rot: 0, y: y + 0.05 + MOUNT_H, c: 1, s: 0, mount: true });

  // Service tower on the -Z side, facing the capsule hatch.
  const T = { x: P.x, z: P.z - 7.6 }, TH = 70;
  const tower = new THREE.Group();
  const lat = latticeTexture(1).clone(); lat.needsUpdate = true; lat.repeat.set(1, TH / 5.5);
  const latMat = new THREE.MeshStandardMaterial({ color: 0x9a3a2c, map: lat, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 });
  tower.add(mesh(new THREE.BoxGeometry(5.5, TH, 5.5), latMat, { y: TH / 2 }));
  tower.add(mesh(new THREE.BoxGeometry(1.6, TH, 1.6), stdMat(0x3a3c3e, { rough: 0.6, metal: 0.5 }), { y: TH / 2 }));
  // Platforms every 10 m.
  for (let h = 10; h < TH; h += 10) tower.add(mesh(new THREE.BoxGeometry(6.4, 0.25, 6.4), steel, { y: h }));
  // Crew access arm with the white room at the capsule hatch.
  const hatchY = MOUNT_H + 55.2;
  const arm = new THREE.Group();
  arm.add(mesh(new THREE.BoxGeometry(1.8, 2.4, 3.6), stdMat(0x7a7d80, { rough: 0.5, metal: 0.6 }), { z: 1.8 }));
  arm.add(mesh(new THREE.BoxGeometry(2.6, 2.8, 1.4), white, { z: 3.9 }));
  arm.position.set(0, hatchY, 2.75);
  tower.add(arm);
  // Hammerhead crane and lightning rod.
  tower.add(mesh(new THREE.BoxGeometry(2, 1.6, 14), steel, { y: TH + 0.8, z: -3 }));
  tower.add(mesh(new THREE.CylinderGeometry(0.08, 0.12, 12, 6), steel, { y: TH + 7 }));
  const beacon = glowSprite(0xff2a1a, 4, 0); beacon.position.y = TH + 13; tower.add(beacon);
  S.blinkers.push({ sprite: beacon, period: 1.5, phase: 0.3, night: true, max: 1 });
  tower.position.set(T.x, y, T.z);
  g.add(tower);
  S.addBox(T.x, T.z, 2.9, 2.9, 0, y + TH + 2);
  // Swing the arm back when the rocket leaves.
  S.spaceportArm = arm;

  // Lightning masts with catenary wires to the pad corners.
  const mastH = 95;
  const masts = [[P.x - 34, P.z - 34], [P.x + 34, P.z + 34]];
  const wirePts = [];
  for (const [mx, mz] of masts) {
    g.add(mesh(new THREE.CylinderGeometry(0.5, 1.2, mastH, 10), stdMat(0xd0d0cc, { rough: 0.5, metal: 0.4 }), { x: mx, y: y + mastH / 2, z: mz }));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 6), steel, { x: mx, y: y + mastH + 5, z: mz }));
    const b = glowSprite(0xff2a1a, 4, 0); b.position.set(mx, y + mastH + 10.5, mz); g.add(b);
    S.blinkers.push({ sprite: b, period: 1.5, phase: 0.9, night: true, max: 1 });
    S.addBox(mx, mz, 1.2, 1.2, 0, y + mastH + 10);
  }
  const corners = [[P.x - 34, P.z + 34], [P.x + 34, P.z - 34]];
  const top = new THREE.Vector3(), end = new THREE.Vector3();
  for (const [mx, mz] of masts) for (const [cx, cz] of corners.concat([[T.x, T.z]])) {
    top.set(mx, y + mastH, mz);
    end.set(cx, cx === T.x ? y + TH + 12 : y + 1, cz);
    for (let k = 0; k < 16; k++) {
      const a = k / 16, b = (k + 1) / 16;
      const sag = (t) => Math.sin(t * Math.PI) * 9;
      wirePts.push(top.x + (end.x - top.x) * a, top.y + (end.y - top.y) * a - sag(a), top.z + (end.z - top.z) * a);
      wirePts.push(top.x + (end.x - top.x) * b, top.y + (end.y - top.y) * b - sag(b), top.z + (end.z - top.z) * b);
    }
  }
  const wires = new THREE.BufferGeometry(); wires.setAttribute('position', new THREE.Float32BufferAttribute(wirePts, 3));
  g.add(new THREE.LineSegments(wires, new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.6 })));

  // Propellant spheres and the deluge water tower.
  for (const [sx, sz, col] of [[P.x - 30, P.z + 48, 0xf2f2f0], [P.x - 8, P.z + 48, 0xe8e4d8]]) {
    const r = 8;
    g.add(mesh(new THREE.SphereGeometry(r, 28, 20), stdMat(col, { rough: 0.4, metal: 0.3 }), { x: sx, y: y + r + 4, z: sz }));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, r + 4, 6), steel, { x: sx + Math.cos(a) * r * 0.8, y: y + (r + 4) / 2, z: sz + Math.sin(a) * r * 0.8 })); }
    S.addBox(sx, sz, r, r, 0, y + r * 2 + 4);
  }
  const wt = { x: P.x + 38, z: P.z + 44 };
  g.add(mesh(new THREE.CylinderGeometry(1.2, 1.6, 60, 12), white, { x: wt.x, y: y + 30, z: wt.z }));
  g.add(mesh(new THREE.SphereGeometry(7, 24, 16), stdMat(0xdad8d0, { rough: 0.5, metal: 0.3 }), { x: wt.x, y: y + 64, z: wt.z }));
  S.addBox(wt.x, wt.z, 2, 2, 0, y + 71);
  // Floodlight masts around the pad.
  for (const [fx, fz] of [[P.x + 32, P.z - 30], [P.x - 32, P.z + 30], [P.x - 32, P.z - 30]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.35, 22, 8), steel, { x: fx, y: y + 11, z: fz }));
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1d8, emissiveIntensity: 0 });
    g.add(mesh(new THREE.BoxGeometry(3, 1.2, 0.8), lampMat, { x: fx, y: y + 22, z: fz, ry: Math.atan2(P.x - fx, P.z - fz) }));
    S.nightLights.push({ mat: lampMat, base: 4 });
    const glow = glowSprite(0xfff1d8, 8, 0); glow.position.set(fx, y + 22, fz); g.add(glow);
    S.blinkers.push({ sprite: glow, period: 0, night: true, max: 0.8 });
  }

  // ---- Vehicle Assembly Building ----
  const V = { x: C.x - 95, z: C.z - 70 }, VW = 48, VH = 72, VD = 60;
  const fac = vabFacade(); fac.repeat.set(2, 3);
  const vabMat = new THREE.MeshStandardMaterial({ map: fac, roughness: 0.8 });
  const vab = mesh(new THREE.BoxGeometry(VW, VH, VD), vabMat, { x: V.x, y: y + VH / 2, z: V.z });
  g.add(vab);
  // High bay door (facing the pad) and the flag/logo on the south face.
  g.add(mesh(new THREE.PlaneGeometry(22, 64), stdMat(0x9ea3a6, { rough: 0.5, metal: 0.4 }), { x: V.x + VW / 2 + 0.05, y: y + 32, z: V.z, ry: Math.PI / 2, cast: false }));
  g.add(mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: vabLogo(), transparent: true, roughness: 0.7 }), { x: V.x, y: y + 42, z: V.z + VD / 2 + 0.06, cast: false }));
  g.add(mesh(new THREE.BoxGeometry(VW + 1, 1.5, VD + 1), stdMat(0x7a7c7a), { x: V.x, y: y + VH + 0.75, z: V.z }));
  S.addBox(V.x, V.z, VW / 2, VD / 2, 0, y + VH + 2);
  const vb = glowSprite(0xff2a1a, 4, 0); vb.position.set(V.x, y + VH + 3, V.z); g.add(vb);
  S.blinkers.push({ sprite: vb, period: 2, phase: 0.2, night: true, max: 1 });

  // ---- Mission Control with a tracking dish ----
  const M = { x: C.x - 70, z: C.z + 70 };
  const off = officeFacade(); off.wrapS = THREE.RepeatWrapping; off.repeat.set(2, 1);
  const offMat = new THREE.MeshStandardMaterial({ map: off, roughness: 0.75, emissive: 0xffe6b0, emissiveIntensity: 0, emissiveMap: off });
  S.nightLights.push({ mat: offMat, base: 0.25 });
  g.add(mesh(new THREE.BoxGeometry(40, 10, 18), offMat, { x: M.x, y: y + 5, z: M.z }));
  g.add(mesh(new THREE.BoxGeometry(41, 0.8, 19), stdMat(0x5a5c5e), { x: M.x, y: y + 10.4, z: M.z }));
  const sign = canvasTexture(512, 96, (ctx, w, h) => { ctx.fillStyle = '#16202a'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f4f4f4'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.fillText('MISSION CONTROL', w / 2, 62); });
  g.add(mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: sign }), { x: M.x, y: y + 8.2, z: M.z + 9.05, cast: false }));
  S.addBox(M.x, M.z, 20, 9, 0, y + 11);
  S.platforms.push({ x: M.x, z: M.z, hw: 20, hd: 9, rot: 0, y: y + 10.8, c: 1, s: 0 });
  const dish = new THREE.Group();
  const D = { x: C.x - 10, z: C.z + 125 };
  dish.add(mesh(new THREE.CylinderGeometry(1.4, 2.2, 12, 12), white, { y: 6 }));
  const head = new THREE.Group(); head.position.y = 13;
  const bowl = new THREE.SphereGeometry(10, 32, 12, 0, Math.PI * 2, 0, 0.62); bowl.rotateX(Math.PI / 2 + 0.6);
  head.add(mesh(bowl, stdMat(0xf0f0ec, { rough: 0.4, metal: 0.2, side: THREE.DoubleSide })));
  head.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6).rotateX(Math.PI / 2 + 0.6), steel, { y: 1.8, z: 2.4 }));
  dish.add(head);
  dish.position.set(D.x, y, D.z);
  g.add(dish);
  S.addBox(D.x, D.z, 2.4, 2.4, 0, y + 22);
  S.spinners.push((dt, t) => { head.rotation.y = Math.sin(t * 0.05) * 1.2 + 0.4; });

  // ---- Odyssey pad and the booster landing zone ----
  const O = { x: C.x + 30, z: C.z + 95 };
  const oMat = new THREE.MeshStandardMaterial({ map: padMarking('O'), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  S._flatSlab(O.x, O.z, 44, 44, oMat, y + 0.06);
  const L = { x: C.x - 25, z: C.z - 125 };
  const lMat = new THREE.MeshStandardMaterial({ map: padMarking('X'), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  S._flatSlab(L.x, L.z, 50, 50, lMat, y + 0.06);
  // Apron linking everything, and a road in from Harrow.
  const apron = new THREE.MeshStandardMaterial({ color: 0x7c7e7a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  S._flatSlab(C.x - 30, C.z + 10, 60, 150, apron, y + 0.04);
  const Vi = PLACES.village;
  S._road([[Vi.x + 60, Vi.z + 10], [1330, 115], [C.x - 175, C.z + 25], [C.x - 60, C.z + 30]], 9);

  S.spawns.spaceport = { x: M.x + 6, y, z: M.z + 16, heading: Math.PI * 0.5 };
  S.spawns.rocketPad = { x: P.x, y: y + 0.05 + MOUNT_H, z: P.z, heading: 0 };
  S.spawns.shipPad = { x: O.x, y: y + 0.06, z: O.z, heading: -Math.PI / 2 };
  S.spawns.lz = { x: L.x, y: y + 0.06, z: L.z };
  S.spaceport = { pad: new THREE.Vector3(P.x, y + 0.05, P.z), tower: new THREE.Vector3(T.x, y, T.z), lz: new THREE.Vector3(L.x, y + 0.06, L.z), ship: new THREE.Vector3(O.x, y, O.z), center: new THREE.Vector3(C.x, y, C.z) };
}
