// Kestrel Speedway: a 2.4 km closed road-racing circuit south of the airbase.
// A smooth spline of asphalt with painted edge lines, red and white corner
// kerbs, tyre walls, a start/finish gantry with lights, a pit lane with a
// garage block and race-control tower, two grandstands, advertising boards and
// floodlight masts. Also exports the lap timer used by the game.

import * as THREE from 'three';
import { canvasTexture, stdMat } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from './terrain.js';

export const TRACK_WIDTH = 15;

// Circuit centre-line in local metres (+x east, +z south), run clockwise.
// Front straight along the north side, then a fast right, a hairpin, an
// esses complex, a long sweeper and a final-corner chicane.
const LOCAL = [
  [-300, -170], [-120, -172], [90, -172], [250, -170], [345, -150], [395, -105], [405, -40], [380, 20],
  [320, 60], [330, 110], [290, 150], [210, 160], [140, 130], [90, 95], [30, 110], [-30, 160],
  [-110, 175], [-200, 165], [-290, 140], [-370, 90], [-405, 20], [-395, -60], [-355, -130],
];

const rnd = mulberry32(31);

function asphaltTexture() {
  return canvasTexture(256, 512, (c, w, h) => {
    c.fillStyle = '#2d2e30'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 34 + rnd() * 44; c.fillStyle = `rgba(${v},${v},${v + 2},0.35)`; c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
    // Rubbered-in racing line: two darker bands with a lighter strip between.
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.24, 'rgba(0,0,0,0.0)'); g.addColorStop(0.32, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.42, 'rgba(0,0,0,0.0)'); g.addColorStop(0.58, 'rgba(0,0,0,0.0)'); g.addColorStop(0.68, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.76, 'rgba(0,0,0,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Edge lines.
    c.fillStyle = 'rgba(240,240,236,0.92)';
    c.fillRect(w * 0.012, 0, w * 0.022, h); c.fillRect(w * 0.966, 0, w * 0.022, h);
    // Patch repairs and skid streaks.
    for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(14,14,16,${0.15 + rnd() * 0.2})`; c.fillRect(rnd() * w * 0.8 + w * 0.1, rnd() * h, 6 + rnd() * 30, 14 + rnd() * 60); }
  }, { repeat: true, anisotropy: 8 });
}

function kerbTexture() {
  return canvasTexture(32, 64, (c, w, h) => {
    c.fillStyle = '#c4262a'; c.fillRect(0, 0, w, h / 2);
    c.fillStyle = '#f1f1ee'; c.fillRect(0, h / 2, w, h / 2);
  }, { repeat: true });
}

function checkerTexture() {
  return canvasTexture(128, 32, (c, w, h) => {
    const n = 16;
    for (let x = 0; x < n; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#f6f6f2' : '#141416'; c.fillRect(x * w / n, y * h / 4, w / n, h / 4); }
  });
}

function signTexture(text, bg, fg, w = 1024, h = 160) {
  return canvasTexture(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.font = `800 ${h * 0.56}px 'Arial Black', Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 4);
    c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
  });
}

function garageTexture() {
  return canvasTexture(1024, 256, (c, w, h) => {
    c.fillStyle = '#dcdcd6'; c.fillRect(0, 0, w, h);
    const teams = ['#c4262a', '#1f4fa0', '#e0a21c', '#2a8a4a', '#e8e8e4', '#7a3aa8', '#e05a1c', '#17a2b8'];
    const bays = 8, bw = w / bays;
    for (let i = 0; i < bays; i++) {
      c.fillStyle = '#16181b'; c.fillRect(i * bw + bw * 0.1, h * 0.34, bw * 0.8, h * 0.58);   // open bay
      c.fillStyle = teams[i]; c.fillRect(i * bw + bw * 0.1, h * 0.24, bw * 0.8, h * 0.1);     // team lintel
      c.fillStyle = '#9a9a96'; for (let k = 0; k < 6; k++) c.fillRect(i * bw + bw * 0.1, h * 0.34 + k * 6, bw * 0.8, 1.5);
      c.fillStyle = '#f4f4ee'; c.font = `700 ${h * 0.12}px Arial`; c.textAlign = 'center'; c.fillText(String(i + 1), i * bw + bw / 2, h * 0.2);
    }
    c.fillStyle = '#3a3c40'; c.fillRect(0, h * 0.92, w, h * 0.08);
  });
}

function seatTexture() {
  return canvasTexture(128, 64, (c, w, h) => {
    c.fillStyle = '#1b2a44'; c.fillRect(0, 0, w, h);
    const cols = ['#c4262a', '#f1f1ee', '#1f4fa0', '#e0a21c'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) {
      c.fillStyle = rnd() < 0.55 ? '#2a3b5c' : cols[(rnd() * cols.length) | 0];   // empty seats vs spectators
      c.fillRect(x * 4 + 0.5, y * 8 + 1, 3, 5);
    }
  }, { repeat: true });
}

// Closed Catmull-Rom spline resampled about every `step` metres.
function sampleLoop(step = 4) {
  const curve = new THREE.CatmullRomCurve3(LOCAL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const len = curve.getLength();
  return { pts: curve.getSpacedPoints(Math.round(len / step)).slice(0, -1), length: len };
}

// Strip between lateral offsets a and b (positive = right of travel) along a polyline.
function strip(pts, closed, a, b, y, vScale, flags) {
  const pos = [], uv = [], idx = [];
  const n = pts.length;
  let v = 0;
  for (let i = 0; i <= (closed ? n : n - 1); i++) {
    const p = pts[i % n], q = pts[(i + 1) % n], o = pts[(i - 1 + n) % n];
    let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    pos.push(p.x + nx * a, y, p.z + nz * a, p.x + nx * b, y, p.z + nz * b);
    if (i > 0) v += Math.hypot(p.x - pts[(i - 1) % n].x, p.z - pts[(i - 1) % n].z) / vScale;
    uv.push(0, v, 1, v);
    if (i > 0) { const k = (i - 1) * 2; if (!flags || flags[(i - 1) % n] || flags[i % n]) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildRaceTrack(S) {
  const P = PLACES.speedway;
  const zone = S.terrain.zone('speedway');
  const y0 = zone.h;
  const group = new THREE.Group();
  group.name = 'speedway';
  S.group.add(group);
  const poly = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 };

  const { pts: local, length } = sampleLoop(4);
  const pts = local.map((p) => new THREE.Vector3(P.x + p.x, y0, P.z + p.z));
  const n = pts.length;
  const W = TRACK_WIDTH, hw = W / 2;

  // Heading, signed curvature and corner flags for kerbs and tyre walls.
  const tang = [], turn = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    tang.push([tx / l, tz / l]);
  }
  for (let i = 0; i < n; i++) {
    const a = tang[(i - 2 + n) % n], b = tang[(i + 2) % n];
    turn.push(a[0] * b[1] - a[1] * b[0]);   // + = turning toward +x rotated... sign picks inside/outside below
  }
  const corner = turn.map((t) => Math.abs(t) > 0.075);
  // Smooth the flags so single stray samples do not make flickering kerbs.
  const cornerS = corner.map((c, i) => c || corner[(i + 1) % n] || corner[(i + n - 1) % n]);

  // Asphalt.
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.88, ...poly });
  roadMat.map.repeat.set(1, 1);
  const road = new THREE.Mesh(strip(pts, true, -hw, hw, y0 + 0.12, 24), roadMat);
  road.receiveShadow = true;
  group.add(road);
  S.tracks.push({ pts: pts.map((p) => [p.x, p.z]), width: W, closed: true, cx: P.x, cz: P.z, r: 520 });

  // Kerbs on both edges through the corners.
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.7, ...poly, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  for (const [a, b] of [[hw - 0.2, hw + 1.3], [-hw - 1.3, -hw + 0.2]]) {
    const k = new THREE.Mesh(strip(pts, true, a, b, y0 + 0.16, 3.2, cornerS), kerbMat);
    k.receiveShadow = true;
    group.add(k);
  }

  // Start / finish line at the first straight.
  let si = 0, best = 1e9;
  for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i].x - (P.x - 70), pts[i].z - (P.z - 172)); if (d < best) { best = d; si = i; } }
  const sp = pts[si], st = tang[si];
  const heading = Math.atan2(st[0], st[1]);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  line.position.set(sp.x, y0 + 0.18, sp.z); line.rotation.y = heading;
  group.add(line);

  // Starting grid boxes behind the line, two abreast.
  const gridMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 });
  const grid = [];
  const rx = -st[1], rz = st[0];   // right of travel
  for (let k = 0; k < 8; k++) {
    const back = 9 + Math.floor(k / 2) * 9 + (k % 2) * 4.5, side = (k % 2 ? 1 : -1) * 3.4;
    const gx = sp.x - st[0] * back + rx * side, gz = sp.z - st[1] * back + rz * side;
    grid.push({ x: gx, y: y0 + 0.14, z: gz, heading });
    const box = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 4.6).rotateX(-Math.PI / 2), gridMat); box.position.set(gx, y0 + 0.19, gz); box.rotation.y = heading; group.add(box);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.2).rotateX(-Math.PI / 2), gridMat); bar.position.set(gx - st[0] * 2.3, y0 + 0.19, gz - st[1] * 2.3); bar.rotation.y = heading; group.add(bar);
  }

  // Tyre walls on the outside of the corners.
  const tyreGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 14);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const tyrePos = [];
  for (let i = 0; i < n; i += 2) {
    if (!cornerS[i]) continue;
    const off = (turn[i] > 0 ? -1 : 1) * (hw + 5.2);   // outside of the bend (right turn = +turn, right = +offset)
    tyrePos.push([pts[i].x - tang[i][1] * off, pts[i].z + tang[i][0] * off]);
  }
  const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, tyrePos.length * 3);
  const dummy = new THREE.Object3D(), pal = [0xdddddd, 0xb82a2a, 0x1f3f8a, 0x161616].map((c) => new THREE.Color(c));
  let ti = 0;
  for (const [x, z] of tyrePos) for (let row = 0; row < 3; row++) {
    dummy.position.set(x, y0 + 0.21 + row * 0.42, z); dummy.updateMatrix();
    tyres.setMatrixAt(ti, dummy.matrix); tyres.setColorAt(ti, pal[(Math.floor(ti / 3) + row) % 4]); ti++;
  }
  tyres.castShadow = true; tyres.receiveShadow = true;
  group.add(tyres);

  // ---- Pit lane and garages (south side of the front straight) -----------
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8c8e8c, roughness: 0.92, ...poly });
  const pitZ = P.z - 146, pitX = P.x - 40;
  S._flatSlab(pitX, pitZ, 430, 30, concrete, y0 + 0.1);
  const yellow = new THREE.Mesh(new THREE.PlaneGeometry(420, 0.35).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe3b832, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
  yellow.position.set(pitX, y0 + 0.16, pitZ - 5); group.add(yellow);
  // Garage block with eight team bays.
  const gz = P.z - 118, gx = P.x - 40;
  const garageMat = new THREE.MeshStandardMaterial({ map: garageTexture(), roughness: 0.8 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.85 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(260, 6.4, 14), [wallMat, wallMat, wallMat, wallMat, wallMat, wallMat]);
  block.position.set(gx, y0 + 3.2, gz); block.castShadow = true; block.receiveShadow = true; group.add(block);
  const bays = new THREE.Mesh(new THREE.PlaneGeometry(260, 6.4), garageMat);
  bays.position.set(gx, y0 + 3.2, gz - 7.02); bays.rotation.y = Math.PI; group.add(bays);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(262, 0.5, 16), stdMat(0x4a4e52, { rough: 0.7 }));
  roof.position.set(gx, y0 + 6.7, gz); group.add(roof);
  S.addBox(gx, gz, 130, 7, 0, y0 + 7, -5);
  // Race-control tower above the middle of the garages.
  const tw = 30, tz = gz, tx = gx + 20;
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.6 });
  const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, 7, 12), towerMat); tower.position.set(tx, y0 + 10.6, tz); tower.castShadow = true; group.add(tower);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x142634, roughness: 0.08, metalness: 0.7, emissive: 0x08141c, emissiveIntensity: 0.3 });
  const towerGlass = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.2, 3.2, 12.2), glassMat); towerGlass.position.set(tx, y0 + 11.4, tz); group.add(towerGlass);
  const towerRoof = new THREE.Mesh(new THREE.BoxGeometry(tw + 3, 0.5, 15), stdMat(0x2e3236, { rough: 0.6 })); towerRoof.position.set(tx, y0 + 14.4, tz - 1); group.add(towerRoof);
  S.addBox(tx, tz, tw / 2, 6, 0, y0 + 14.7, -5);
  S.nightLights.push({ mat: glassMat, base: 1.2 });

  // ---- Start/finish gantry with lights ------------------------------------
  const gantry = new THREE.Group();
  gantry.position.set(sp.x, y0, sp.z); gantry.rotation.y = heading;
  const steel = stdMat(0x8a9096, { rough: 0.5, metal: 0.2 });
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.4, 0.9), steel); post.position.set(s * (hw + 1.6), 4.2, 0); post.castShadow = true; gantry.add(post);
    S.addBox(sp.x + Math.cos(heading) * s * (hw + 1.6), sp.z - Math.sin(heading) * s * (hw + 1.6), 0.5, 0.5, 0, y0 + 8.4, -5);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 4.4, 1.6, 1.1), steel); beam.position.set(0, 8.4, 0); beam.castShadow = true; gantry.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.4, 1.7), new THREE.MeshStandardMaterial({ map: signTexture('KESTREL SPEEDWAY', '#14181c', '#f4f4ee', 1024, 112), roughness: 0.5 }));
  sign.position.set(0, 8.4, 0.6); gantry.add(sign);
  const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = -0.6; gantry.add(sign2);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  for (let k = 0; k < 5; k++) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), lampMat); lamp.position.set(-3 + k * 1.5, 7.55, 0.57); gantry.add(lamp);
    const lamp2 = lamp.clone(); lamp2.rotation.y = Math.PI; lamp2.position.z = -0.57; gantry.add(lamp2);
  }
  group.add(gantry);

  // ---- Grandstands opposite the pits ---------------------------------------
  const seats = seatTexture();
  const standMat = (len) => { const t = seats.clone(); t.needsUpdate = true; t.repeat.set(len / 10, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); };
  const concreteStep = stdMat(0x9a9c9a, { rough: 0.9 });
  const standZ = P.z - 198;
  for (const [sx, len] of [[P.x - 150, 150], [P.x + 120, 110]]) {
    const rows = 12;
    for (let r = 0; r < rows; r++) {
      const depth = 1.0, h = 0.55 + r * 0.55;
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, h, depth), [concreteStep, concreteStep, standMat(len), concreteStep, concreteStep, concreteStep]);
      step.position.set(sx, y0 + h / 2, standZ - 2 - r * depth); step.castShadow = true; step.receiveShadow = true; group.add(step);
    }
    const roofS = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.35, 15), stdMat(0xe9ebec, { rough: 0.5 }));
    roofS.position.set(sx, y0 + 12.4, standZ - 8); roofS.rotation.x = -0.12; group.add(roofS);
    for (const e of [-1, 1]) for (const bz of [-1.5, -13]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 12, 8), steel); pole.position.set(sx + e * (len / 2 - 1.5), y0 + 6, standZ + bz); group.add(pole);
    }
    S.addBox(sx, standZ - 8, len / 2, 7, 0, y0 + 13, -5);
    // Spectators: instanced bodies and heads filling most of the seats.
    const fans = [];
    for (let r = 0; r < rows; r++) for (let x = -len / 2 + 1; x < len / 2 - 0.5; x += 1.05) {
      if (rnd() > (S.lowDetail ? 0.35 : 0.68)) continue;
      fans.push([sx + x + (rnd() - 0.5) * 0.3, y0 + 0.55 + r * 0.55, standZ - 2 - r * 1.0 + 0.1]);
    }
    const shirts = [0xc4262a, 0xf1f1ee, 0x1f4fa0, 0xe0a21c, 0x2a8a4a, 0x14181c, 0xe05a1c].map((c) => new THREE.Color(c));
    const skins = [0xf1c8a0, 0xd9a577, 0xa8714a, 0x7a4a2c, 0x4e2e1c].map((c) => new THREE.Color(c));
    const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.42, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), fans.length);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), fans.length);
    const dm = new THREE.Object3D();
    fans.forEach(([fx, fy, fz], i) => {
      dm.position.set(fx, fy + 0.45, fz); dm.updateMatrix(); bodies.setMatrixAt(i, dm.matrix); bodies.setColorAt(i, shirts[(rnd() * shirts.length) | 0]);
      dm.position.set(fx, fy + 0.98, fz); dm.updateMatrix(); heads.setMatrixAt(i, dm.matrix); heads.setColorAt(i, skins[(rnd() * skins.length) | 0]);
    });
    bodies.castShadow = true;
    group.add(bodies, heads);
  }

  // ---- Advertising boards along the front straight ------------------------
  const ads = [['KESTREL OIL', '#c4262a', '#f6f6f2'], ['AURORA', '#14181c', '#7dffd6'], ['HARROW BREWING', '#e0a21c', '#14181c'], ['WINDWARD POWER', '#1f4fa0', '#f6f6f2'], ['KAF AIR SHOWS', '#e8e8e4', '#c4262a'], ['ISLAND BANK', '#2a8a4a', '#f6f6f2']];
  const boardTex = ads.map(([t, bg, fg]) => signTexture(t, bg, fg, 1024, 128));
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 1.5), new THREE.MeshStandardMaterial({ map: boardTex[i % ads.length], roughness: 0.6 }));
    m.position.set(P.x - 300 + i * 14.4, y0 + 1.1, P.z - 181); group.add(m);
    const post = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.2, 0.3), steel); post.position.set(m.position.x, y0 + 0.35, m.position.z + 0.1); group.add(post);
  }

  // ---- Floodlight masts -----------------------------------------------------
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xfff2cc, emissiveIntensity: 0, roughness: 0.5 });
  S.nightLights.push({ mat: headMat, base: 3.2 });
  for (let i = 0; i < n; i += Math.round(n / 9)) {
    const off = (turn[i] >= 0 ? -1 : 1) * (hw + 16);
    const x = pts[i].x - tang[i][1] * off, z = pts[i].z + tang[i][0] * off;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 24, 8), steel); pole.position.set(x, y0 + 12, z); pole.castShadow = true; group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.9, 1.3), headMat); head.position.set(x, y0 + 24.3, z); head.rotation.y = Math.atan2(tang[i][0], tang[i][1]); group.add(head);
    S.addBox(x, z, 0.5, 0.5, 0, y0 + 24, -5);
  }

  // Course data for lap timing, the minimap and AI.
  const cp = [0.25, 0.5, 0.75].map((f) => pts[(si + Math.floor(n * f)) % n]);
  S.race = {
    pts: pts.map((p) => [p.x, p.z]), width: W, length, heading,
    start: { x: sp.x, z: sp.z, dx: st[0], dz: st[1] },
    checkpoints: cp.map((p) => ({ x: p.x, z: p.z })),
    grid,
  };
  S.spawns.speedway = { x: pitX + 26, y: y0 + 0.14, z: pitZ + 4, heading: Math.PI };
  S.spawns.speedwayGrid = grid;
}

// ---------------------------------------------------------------------------
// Lap timing: cross the start line, pass the three checkpoints in order, cross
// again to set a lap. Works for any vehicle position stream.

export class LapTimer {
  constructor(race) {
    this.race = race;
    this.reset();
    try { this.best = Number(localStorage.getItem('csaf.bestLap')) || 0; } catch (e) { this.best = 0; }
  }

  reset() {
    this.running = false; this.time = 0; this.lap = 0; this.last = 0; this.next = 0; this.prevAlong = null; this.splitFlash = 0;
  }

  // Signed distance along the start line direction, and lateral offset.
  _local(x, z) {
    const s = this.race.start;
    const dx = x - s.x, dz = z - s.z;
    return { along: dx * s.dx + dz * s.dz, across: dx * s.dz - dz * s.dx };
  }

  // Returns { type: 'lap', time, best } on a completed lap, or { type: 'start' } on the first crossing.
  update(x, z, dt, driving) {
    const R = this.race;
    if (!driving) { this.prevAlong = null; return null; }
    if (this.running) { this.time += dt; this.splitFlash = Math.max(0, this.splitFlash - dt); }
    const { along, across } = this._local(x, z);
    let event = null;
    const onLine = Math.abs(across) < R.width / 2 + 2;
    if (this.prevAlong !== null && onLine && this.prevAlong < 0 && along >= 0) {
      if (!this.running) { this.running = true; this.time = 0; this.next = 0; this.lap = 1; event = { type: 'start' }; }
      else if (this.next >= R.checkpoints.length) {
        this.last = this.time;
        const isBest = !this.best || this.time < this.best;
        if (isBest) { this.best = this.time; try { localStorage.setItem('csaf.bestLap', String(this.best)); } catch (e) { /* ignore */ } }
        event = { type: 'lap', time: this.time, best: this.best, isBest, lap: this.lap };
        this.lap++; this.time = 0; this.next = 0;
      }
    }
    // Only trust the previous sample while close to the line, so a lap far away never counts as a crossing.
    this.prevAlong = onLine && Math.abs(along) < 40 ? along : null;
    if (this.running && this.next < R.checkpoints.length) {
      const c = R.checkpoints[this.next];
      if (Math.hypot(x - c.x, z - c.z) < 26) { this.next++; this.splitFlash = 1.2; }
    }
    return event;
  }
}

export const fmtLap = (t) => {
  if (!t) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};
