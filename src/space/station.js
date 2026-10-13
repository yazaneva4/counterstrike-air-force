// Ares Station: a research outpost on Mars. A tapered habitat tower with
// portholes, window bands, a stair to the airlock and a railed roof with a
// dish, corrugated research modules joined by pressurised tunnels, a
// greenhouse dome, fuel tanks, a water tower, a solar field, a rover bay and
// floodlights. Crew in orange suits walk between the buildings, and crates
// and drums lie around as live physics props that tumble in Mars gravity.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, stdMat, glowSprite } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { Human, outfitFor } from '../actors/human.js';
import { Props } from '../physics/props.js';

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent; m.receiveShadow = true;
  parent.add(m);
  return m;
}

function habTexture() {
  return canvasTexture(1024, 512, (c, w, h) => {
    const rnd = mulberry32(5);
    c.fillStyle = '#d8d3c8'; c.fillRect(0, 0, w, h);
    // Panels, rivets and dust streaks.
    c.strokeStyle = 'rgba(60,50,40,0.45)'; c.lineWidth = 2;
    for (let x = 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = 0; y <= h; y += 128) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = 'rgba(70,60,50,0.5)';
    for (let x = 8; x < w; x += 32) for (let y = 8; y < h; y += 128) { c.fillRect(x, y, 2, 2); c.fillRect(x, y + 112, 2, 2); }
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(${rnd() < 0.6 ? '150,80,50' : '90,60,40'},${rnd() * 0.07})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 6, 8 + rnd() * 50); }
    // Window band with frames and warm interiors.
    for (let x = 16; x < w; x += 85) {
      c.fillStyle = '#26323e'; c.fillRect(x, 190, 56, 44);
      c.fillStyle = '#ffd89a'; c.globalAlpha = 0.28; c.fillRect(x + 3, 193, 50, 38); c.globalAlpha = 1;
      c.strokeStyle = '#8a8a86'; c.lineWidth = 4; c.strokeRect(x, 190, 56, 44);
      c.fillStyle = '#1a2128'; c.fillRect(x + 26, 190, 4, 44);
    }
    for (let x = 60; x < w; x += 170) { c.fillStyle = '#26323e'; c.beginPath(); c.arc(x, 360, 22, 0, 6.3); c.fill(); c.strokeStyle = '#9a9a96'; c.lineWidth = 6; c.stroke(); c.fillStyle = 'rgba(255,230,180,0.2)'; c.beginPath(); c.arc(x, 360, 15, 0, 6.3); c.fill(); }
    // Stripe and lettering.
    c.fillStyle = '#c8501e'; c.fillRect(0, 100, w, 14); c.fillRect(0, 440, w, 10);
    c.fillStyle = '#2a2d31'; c.font = 'bold 48px Arial'; c.fillText('ARES-1', 360, 80);
  }, { repeat: true, anisotropy: 8 });
}

function corrugatedTexture() {
  return canvasTexture(256, 256, (c, w, h) => {
    const rnd = mulberry32(19);
    c.fillStyle = '#bda78a'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(70,50,30,0.5)'; c.fillRect(0, y, w, 3); c.fillStyle = 'rgba(255,240,210,0.18)'; c.fillRect(0, y + 4, w, 2); }
    for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(110,60,36,${rnd() * 0.12})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 20, 1 + rnd() * 3); }
  }, { repeat: true });
}

function stripeTexture(label) {
  return canvasTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#16202a'; c.fillRect(0, 0, w, h); c.fillStyle = '#f4f4f4'; c.font = 'bold 60px Arial'; c.textAlign = 'center'; c.fillText(label, w / 2, 84);
    c.fillStyle = '#e8742a'; c.fillRect(0, h - 10, w, 10);
  });
}

export function buildStation(surface, { cx = 160, cz = 130 } = {}) {
  const S = surface, scene = S.scene;
  const group = new THREE.Group();
  group.name = 'ares-station';
  const gy = S.heightAt(cx, cz) - 0.3;
  group.position.set(cx, gy, cz);
  scene.add(group);
  const white = stdMat(0xe9e6e0, { rough: 0.55, metal: 0.1 });
  const metal = stdMat(0x8a8d90, { rough: 0.35, metal: 0.85 });
  const dark = stdMat(0x1c1d20, { rough: 0.5, metal: 0.4 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b2d4c, metalness: 0.7, roughness: 0.25 });
  const rust = stdMat(0xb55a34, { rough: 0.8, metal: 0.2 });
  const wx = (x) => cx + x, wz = (z) => cz + z;
  const box = (x, z, hw, hd, top, rot = 0) => S.addBox(wx(x), wz(z), hw, hd, top + gy, rot);

  // ---- Habitat tower ------------------------------------------------------------
  const hab = habTexture(); hab.repeat.set(2, 1);
  const habMat = new THREE.MeshStandardMaterial({ map: hab, roughness: 0.6, metalness: 0.15, emissive: 0xffd89a, emissiveMap: hab, emissiveIntensity: 0.12 });
  const HH = 9.5, RB = 7.6, RT = 5.4;
  add(group, new THREE.CylinderGeometry(RT, RB, HH, 40, 1, true), habMat, 0, HH / 2 + 0.4, 0);
  add(group, new THREE.CylinderGeometry(RB + 0.4, RB + 0.8, 0.8, 40), dark, 0, 0.4, 0);             // plinth
  add(group, new THREE.CylinderGeometry(RT + 0.45, RT + 0.45, 0.4, 40), white, 0, HH + 0.6, 0);       // roof rim
  add(group, new THREE.CircleGeometry(RT + 0.4, 40).rotateX(-Math.PI / 2), stdMat(0x9a9a96, { rough: 0.85 }), 0, HH + 0.82, 0);
  // Roof railing, mast and dish.
  const rail = [];
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; const g = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5); g.translate(Math.cos(a) * (RT + 0.3), 0.55, Math.sin(a) * (RT + 0.3)); rail.push(g.toNonIndexed()); }
  for (const y of [0.5, 1.05]) { const g = new THREE.TorusGeometry(RT + 0.3, 0.03, 4, 56); g.rotateX(Math.PI / 2); g.translate(0, y, 0); rail.push(g.toNonIndexed()); }
  const railMesh = new THREE.Mesh(mergeGeometries(rail), metal); railMesh.position.y = HH + 0.82; railMesh.castShadow = true; group.add(railMesh);
  add(group, new THREE.CylinderGeometry(0.12, 0.2, 7, 8), metal, 0, HH + 4.3, 0);
  const dishG = new THREE.SphereGeometry(1.5, 18, 8, 0, Math.PI * 2, 0, 0.9); dishG.rotateX(-0.9);
  const dish = add(group, dishG, white, 1.2, HH + 7.2, 0);
  const beacon = glowSprite(0xff3a2a, 3, 0); beacon.position.set(0, HH + 8, 0); group.add(beacon);
  S.anim.push((dt, t) => { beacon.material.opacity = (t % 1.6) < 0.12 ? 1 : 0.08; dish.rotation.y = t * 0.1; });
  // Airlock door and a stair with handrails on the south face.
  const doorZ = RB - 0.45;
  add(group, new THREE.BoxGeometry(2, 3, 0.6), dark, 0, 2.4, doorZ + 0.5);
  add(group, new THREE.BoxGeometry(1.7, 2.7, 0.1), white, 0, 2.3, doorZ + 0.85);
  add(group, new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20).rotateX(Math.PI / 2), dark, 0, 2.6, doorZ + 0.95);
  for (let i = 0; i < 7; i++) add(group, new THREE.BoxGeometry(2.6, 0.22, 0.7), metal, 0, 0.1 + i * 0.28, doorZ + 3.6 - i * 0.62);
  for (const sx of [-1.4, 1.4]) { add(group, new THREE.BoxGeometry(0.06, 0.06, 4.4), metal, sx, 1.45, doorZ + 2.2, 0.38, 0, 0); for (const k of [0.4, 2.2, 4]) add(group, new THREE.BoxGeometry(0.05, 1.0, 0.05), metal, sx, 0.9 + (4 - k) * 0.22, doorZ + k - 0.3); }
  add(group, new THREE.PlaneGeometry(8, 1.6), new THREE.MeshBasicMaterial({ map: stripeTexture('ARES STATION') }), 0, 6.8, RB - 0.55 + 0.1);
  box(0, 0, RB * 0.9, RB * 0.9, HH + 1.5);

  // ---- Corrugated research modules and tunnels --------------------------------------
  const corr = corrugatedTexture();
  const modules = [[-17, 0, 16, 3.3, 0], [0, -17, 14, 3.1, Math.PI / 2]];
  for (const [x, z, len, r, rot] of modules) {
    const t = corr.clone(); t.needsUpdate = true; t.repeat.set(1, len / 3);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, metalness: 0.2 });
    const tube = add(group, new THREE.CylinderGeometry(r, r, len, 28), m, x, r + 0.4, z, 0, 0, Math.PI / 2);
    tube.rotation.y = rot; tube.rotation.set(0, rot, Math.PI / 2);
    // Reinforcing rings and hazard-striped end caps.
    for (let k = -2; k <= 2; k++) {
      const ring = add(group, new THREE.TorusGeometry(r + 0.05, 0.12, 6, 28), white, x, r + 0.4, z);
      ring.rotation.set(0, rot + Math.PI / 2, 0);
      ring.position.x += (Math.cos(rot) * k * len / 5.5); ring.position.z += (-Math.sin(rot) * k * len / 5.5);
    }
    box(x, z, rot ? r : len / 2, rot ? len / 2 : r, r * 2 + 0.6);
    add(group, new THREE.BoxGeometry(rot ? 2.4 : 0.1, 0.9, rot ? 0.1 : 2.4), new THREE.MeshStandardMaterial({ map: stripeTexture('LAB'), roughness: 0.6 }), x - (rot ? 0 : len / 2 + 0.06), r + 2.2, z - (rot ? len / 2 + 0.06 : 0), 0, rot ? 0 : Math.PI / 2, 0);
  }
  // Greenhouse dome with glowing plants, and a small airlock dome.
  const green = new THREE.MeshStandardMaterial({ color: 0x9fd8a8, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.2, emissive: 0x3aa050, emissiveIntensity: 0.3 });
  add(group, new THREE.SphereGeometry(5.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), green, 24, 0.4, 8);
  add(group, new THREE.CylinderGeometry(5.5, 5.6, 0.4, 28), stdMat(0x3a3028, { rough: 1 }), 24, 0.4, 8);
  const pl = stdMat(0x3f9a46, { rough: 0.8 });
  for (let i = 0; i < 9; i++) { const a = i * 0.9; add(group, new THREE.ConeGeometry(0.4, 1.3 + (i % 3) * 0.5, 7), pl, 24 + Math.cos(a) * (1 + i * 0.4), 1.2, 8 + Math.sin(a) * (1 + i * 0.4)); }
  box(24, 8, 4, 4, 6);
  add(group, new THREE.SphereGeometry(3, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2), white, -26, 0.4, 12);
  add(group, new THREE.CylinderGeometry(3, 3, 0.9, 20, 1, true), habMat, -26, 0.85, 12);
  box(-26, 12, 2.4, 2.4, 3.6);
  // Tunnels joining the habitat to the modules and domes.
  const tunnel = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const t = add(group, new THREE.CylinderGeometry(1.2, 1.2, len, 14).rotateZ(Math.PI / 2), white, (x1 + x2) / 2, 1.6, (z1 + z2) / 2);
    t.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  };
  tunnel(-RB + 0.5, 0, -9, 0); tunnel(0, -RB + 0.5, 0, -10.5); tunnel(RB - 0.5, 4, 20, 8); tunnel(-RB + 0.5, 6, -24, 12);

  // ---- Fuel tanks, water tower, solar field, rover bay ----------------------------
  for (let i = 0; i < 3; i++) {
    const x = 26 + i * 5.2, z = -16;
    add(group, new THREE.CylinderGeometry(1.8, 1.8, 5, 20), white, x, 3.4, z);
    add(group, new THREE.SphereGeometry(1.8, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, x, 5.9, z);
    for (const a of [0, 2.1, 4.2]) add(group, new THREE.BoxGeometry(0.2, 1.6, 0.2), dark, x + Math.cos(a) * 1.5, 0.8, z + Math.sin(a) * 1.5);
    add(group, new THREE.BoxGeometry(1.4, 0.35, 0.05), new THREE.MeshStandardMaterial({ map: stripeTexture('LOX'), roughness: 0.6 }), x, 3.4, z + 1.82);
    box(x, z, 1.8, 1.8, 7);
  }
  add(group, new THREE.CylinderGeometry(0.2, 0.2, 5.5, 8), metal, 36, 3, -4);
  const wt = add(group, new THREE.CylinderGeometry(2.4, 2.4, 3.4, 24), rust, -22, 7.8, -28);
  wt.userData.tank = true;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(group, new THREE.BoxGeometry(0.28, 6.4, 0.28), metal, -22 + sx * 1.9, 3.5, -28 + sz * 1.9);
  box(-22, -28, 2.6, 2.6, 10);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const px = -52 + c * 8, pz = 30 + r * 7;
    add(group, new THREE.BoxGeometry(6.5, 0.08, 4), panel, px, 1.6, pz, -0.5, 0, 0);
    add(group, new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), metal, px, 0.8, pz);
  }
  // Rover bay: a canopy on four posts, solar roof, charging post.
  const bay = new THREE.Group(); bay.position.set(20, 0, 26); group.add(bay);
  add(bay, new THREE.BoxGeometry(9, 0.2, 7), panel, 0, 4.4, 0, 0.1, 0, 0);
  for (const [sx, sz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) add(bay, new THREE.BoxGeometry(0.3, 4.4, 0.3), metal, sx, 2.2, sz);
  add(bay, new THREE.BoxGeometry(0.4, 1.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0x30d080, emissiveIntensity: 0.9 }), 3.4, 0.8, 0);
  // Floodlights on tall masts.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d0, emissiveIntensity: 0.9, roughness: 0.4 });
  for (const [x, z] of [[-14, 14], [14, -14], [16, 16], [-12, -22]]) {
    add(group, new THREE.CylinderGeometry(0.14, 0.2, 9, 8), metal, x, 4.5, z);
    add(group, new THREE.BoxGeometry(1.4, 0.4, 0.5), lampMat, x, 9.1, z);
  }

  // Station data for the game.
  S.station = { x: cx, z: cz, y: gy, bay: new THREE.Vector3(wx(20), 0, wz(26)) };

  // ---- Crew: astronauts in orange suits walking between the buildings ------------
  const rnd = mulberry32(404);
  const routes = [
    [[0, 11], [14, 16], [26, 22], [18, 28], [4, 20]],
    [[-12, 6], [-24, 18], [-34, 26], [-20, 36], [-8, 18]],
    [[10, -10], [24, -6], [30, -22], [14, -24], [2, -14]],
  ];
  const crew = routes.map((route, i) => {
    const h = new Human(outfitFor('astronaut', rnd), { shadows: true });
    const pts = route.map(([x, z]) => new THREE.Vector3(wx(x), 0, wz(z)));
    h.root.position.set(pts[0].x, S.groundAt(pts[0].x, pts[0].z), pts[0].z);
    scene.add(h.root);
    return { h, pts, i: 0, wait: i * 2, yaw: 0 };
  });
  S.anim.push((dt) => {
    for (const c of crew) {
      const p = c.h.root.position, to = c.pts[(c.i + 1) % c.pts.length];
      const dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
      if (c.wait > 0) { c.wait -= dt; c.h.speed = 0; c.h.state = 'idle'; c.h.gesture = c.wait < 1.4 && c.wait > 0.4 ? 'wave' : null; c.h.animate(dt); continue; }
      c.h.gesture = null;
      if (d < 1) { c.i = (c.i + 1) % c.pts.length; c.wait = 1.5 + rnd() * 4; continue; }
      // Slow, bounding gait in low gravity.
      c.h.speed = 1.3; c.h.state = 'idle';
      c.yaw = Math.atan2(dx, dz);
      c.h.root.rotation.y = c.yaw;
      p.x += dx / d * 1.3 * dt; p.z += dz / d * 1.3 * dt;
      p.y = S.groundAt(p.x, p.z);
      c.h.animate(dt);
    }
  });

  // ---- Supply props with live physics --------------------------------------------
  const props = new Props(S.world, scene, { seaPhysics: false });
  const cluster = (lx, lz, crates, barrels, boxes) => {
    for (let i = 0; i < crates; i++) props.add('crate', wx(lx) + (rnd() - 0.5) * 5, wz(lz) + (rnd() - 0.5) * 5, { yaw: rnd() * 6.28 });
    for (let i = 0; i < barrels; i++) props.add('barrel', wx(lx) + (rnd() - 0.5) * 5, wz(lz) + (rnd() - 0.5) * 5, { color: [0xe8742a, 0xd8d4c8, 0x2a62b8][i % 3] });
    for (let i = 0; i < boxes; i++) props.add('box', wx(lx) + (rnd() - 0.5) * 4, wz(lz) + (rnd() - 0.5) * 4, { yaw: rnd() * 6.28 });
  };
  cluster(6, 14, 5, 3, 3); cluster(-14, 8, 3, 4, 2); cluster(30, 8, 4, 2, 3); cluster(-6, -24, 2, 3, 2);
  for (let i = 0; i < 4; i++) props.add('ball', wx(10 + i * 0.6), wz(18), { sleep: false, color: 0xe8742a });
  S.props = props;
  S.world.colliders = S.colliders;
  props.physics.reindexStatics();
  return group;
}
