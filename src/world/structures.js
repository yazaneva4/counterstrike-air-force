// Man-made places: Kestrel Airbase (runway, taxiway, hangars, tower with a
// turning radar, helipads, runway lights), Harrow Village (houses around a
// plaza, church, market, street lamps), Aldren Farms (barn, silo, fences),
// the Gull Point lighthouse, a harbour pier with boats, a row of wind
// turbines and Kestrel Spaceport (see spaceport.js). Everything registers colliders and paints itself onto the map.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/noise.js';
import { canvasTexture, stdMat, mesh, glowSprite, glowTexture, tint, lerp, clamp } from '../core/util.js';
import { PLACES, HALF, MAP_SIZE } from './terrain.js';
import { buildSpaceport } from './spaceport.js';
import { plaster, roofTiles } from '../core/textures.js';
import { treeSpecimen } from './vegetation.js';

export const RUNWAY = { x0: -720, x1: 560, z: 700, width: 42 };

function runwayTexture() {
  return canvasTexture(4096, 128, (ctx, w, h) => {
    ctx.fillStyle = '#3a3d40'; ctx.fillRect(0, 0, w, h);
    // Asphalt grain.
    const rnd = mulberry32(3);
    for (let i = 0; i < 9000; i++) {
      const v = 45 + rnd() * 30;
      ctx.fillStyle = `rgba(${v},${v},${v + 3},0.35)`;
      ctx.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 1 + rnd() * 2);
    }
    // Tyre marks near both touchdown zones.
    ctx.fillStyle = 'rgba(15,15,15,0.35)';
    for (let i = 0; i < 60; i++) {
      const x = (i % 2 ? w * 0.12 : w * 0.8) + rnd() * w * 0.08;
      ctx.fillRect(x, h * 0.36 + rnd() * h * 0.28, 60 + rnd() * 160, 2 + rnd() * 3);
    }
    ctx.fillStyle = '#e9ecef';
    // Edge lines.
    ctx.fillRect(0, 4, w, 3); ctx.fillRect(0, h - 7, w, 3);
    // Threshold piano keys.
    for (const x0 of [14, w - 74]) for (let i = 0; i < 8; i++) ctx.fillRect(x0, 14 + i * 13, 58, 7);
    // Centre line dashes.
    for (let x = 200; x < w - 200; x += 110) ctx.fillRect(x, h / 2 - 1.5, 60, 3);
    // Touchdown zone markings.
    for (const x0 of [230, w - 330]) for (const y of [h * 0.28, h * 0.66]) ctx.fillRect(x0, y, 100, 8);
    // Runway numbers.
    ctx.save(); ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(150, h / 2); ctx.rotate(Math.PI / 2); ctx.fillText('09', 0, 0); ctx.restore();
    ctx.save(); ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(w - 150, h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('27', 0, 0); ctx.restore();
  }, { anisotropy: 8 });
}

function concreteTexture(tiles = 8) {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#8a8c88'; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(9);
    for (let i = 0; i < 2500; i++) {
      const v = 120 + rnd() * 40;
      ctx.fillStyle = `rgba(${v},${v},${v - 4},0.25)`;
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: true });
  t.repeat.set(tiles, tiles);
  return t;
}

// Framed panes and recessed wooden doors share small textures across the town.
function windowTextures() {
  const map = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#c9c4b7'; ctx.fillRect(0, 0, w, h);
    const pane = ctx.createLinearGradient(0, 0, w, h);
    pane.addColorStop(0, '#85969b'); pane.addColorStop(0.45, '#455b63'); pane.addColorStop(1, '#1d2d35');
    ctx.fillStyle = pane; ctx.fillRect(9, 9, w - 18, h - 18);
    ctx.fillStyle = 'rgba(211,207,194,0.18)';
    for (let x = 15; x < w - 12; x += 7) ctx.fillRect(x, 12, 2, h - 25);
    ctx.fillStyle = '#c9c4b7'; ctx.fillRect(w / 2 - 3, 5, 6, h - 10); ctx.fillRect(5, h / 2 - 3, w - 10, 6);
    ctx.strokeStyle = '#706a5f'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
  });
  const emissive = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d5c29d'; ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#000'; ctx.fillRect(w / 2 - 4, 0, 8, h); ctx.fillRect(0, h / 2 - 4, w, 8);
  }, { srgb: false });
  return { map, emissive };
}
function doorTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#765540'; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(32);
    for (let k = 0; k < 180; k++) {
      ctx.strokeStyle = `rgba(35,23,16,${0.05 + rnd() * 0.12})`;
      const x = rnd() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rnd() * 4, h); ctx.stroke();
    }
    ctx.strokeStyle = '#443326'; ctx.lineWidth = 5;
    for (const yy of [20, 135]) for (const xx of [14, 68]) ctx.strokeRect(xx, yy, 44, 92);
    ctx.fillStyle = '#b8a47a'; ctx.fillRect(w - 24, h * 0.51, 13, 4);
    ctx.fillStyle = '#c7c0ad'; ctx.fillRect(0, 0, 6, h); ctx.fillRect(w - 6, 0, 6, h); ctx.fillRect(0, 0, w, 6);
  });
}

function roadTexture() {
  const t = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#44464a'; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(11);
    for (let i = 0; i < 600; i++) { const v = 55 + rnd() * 30; ctx.fillStyle = `rgba(${v},${v},${v},0.4)`; ctx.fillRect(rnd() * w, rnd() * h, 2, 2); }
    ctx.fillStyle = '#d9c26a'; ctx.fillRect(w / 2 - 1.5, 0, 3, h * 0.55);
    ctx.fillStyle = '#d8dadc'; ctx.fillRect(3, 0, 2, h); ctx.fillRect(w - 5, 0, 2, h);
  }, { repeat: true });
  return t;
}

export class Structures {
  constructor(terrain, { lowDetail = false } = {}) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'structures';
    this.colliders = [];      // oriented boxes {x,z,hw,hd,rot,top,bottom}
    this.platforms = [];      // walkable tops {x,z,hw,hd,rot,y}
    this.roads = [];          // polylines [[x,z],...] with width
    this.nightLights = [];    // {obj, mat, base} glow when dark
    this.spinners = [];       // (dt,t)=>void animations
    this.blinkers = [];       // {sprite, period, phase}
    this.spawns = {};
    this.lowDetail = lowDetail;
    this.rnd = mulberry32(2024);

    this._roads();
    this._airbase();
    this._village();
    this._farm();
    this._lighthouse();
    this._harbour();
    this._turbines();
    buildSpaceport(this);
  }

  h(x, z) { return this.terrain.heightAt(x, z); }

  addBox(x, z, hw, hd, rot, top, bottom = -50) { this.colliders.push({ x, z, hw, hd, rot, top, bottom, c: Math.cos(rot), s: Math.sin(rot) }); }

  // Is (x, z) on a road, runway or building footprint? Used by vegetation.
  isBlocked(x, z, pad = 4) {
    for (const b of this.colliders) {
      const dx = x - b.x, dz = z - b.z;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true;
    }
    for (const r of this.roads) {
      const pts = r.pts;
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const vx = bx - ax, vz = bz - az;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
        if (Math.hypot(x - (ax + vx * t), z - (az + vz * t)) < r.width / 2 + pad) return true;
      }
    }
    return false;
  }

  // Tarmac under (x, z): a road, the runway, an apron or any paved slab.
  roadAt(x, z) {
    if (this.platformAt(x, z) > -Infinity) return true;
    for (const r of this.roads) {
      const pts = r.pts, hw = r.width / 2 + 0.6;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1], vx = pts[i][0] - ax, vz = pts[i][1] - az;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
        if (Math.hypot(x - (ax + vx * t), z - (az + vz * t)) < hw) return true;
      }
    }
    return false;
  }

  insideBuilding(x, z, pad = 0.5) {
    for (const b of this.colliders) {
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) > b.hw + b.hd + pad + 1 || Math.abs(dz) > b.hw + b.hd + pad + 1) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad) return true;
    }
    return false;
  }

  // Ribbon road draped on the terrain.
  _road(pts, width = 8) {
    // Resample the polyline every 6 m.
    const dense = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 6));
      for (let k = 0; k < n; k++) dense.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    dense.push(pts[pts.length - 1]);
    const pos = [], uv = [], idx = [];
    let v = 0;
    for (let i = 0; i < dense.length; i++) {
      const [x, z] = dense[i];
      const [px, pz] = dense[Math.max(0, i - 1)], [nx, nz] = dense[Math.min(dense.length - 1, i + 1)];
      let tx = nx - px, tz = nz - pz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const ox = -tz * width / 2, oz = tx * width / 2;
      const y1 = Math.max(this.h(x + ox, z + oz), this.h(x, z)) + 0.28, y2 = Math.max(this.h(x - ox, z - oz), this.h(x, z)) + 0.28;
      pos.push(x + ox, y1, z + oz, x - ox, y2, z - oz);
      if (i > 0) v += Math.hypot(x - dense[i - 1][0], z - dense[i - 1][1]) / 24;
      uv.push(0, v, 1, v);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (!this.roadMat) this.roadMat = new THREE.MeshStandardMaterial({ map: roadTexture(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(geo, this.roadMat);
    m.receiveShadow = true;
    this.group.add(m);
    this.roads.push({ pts, width });
  }

  _roads() {
    const V = PLACES.village, F = PLACES.farm, B = PLACES.beach, L = PLACES.lighthouse;
    this._road([[RUNWAY.x1 - 40, 610], [640, 560], [780, 360], [V.x - 60, V.z + 40], [V.x, V.z]]);
    this._road([[V.x, V.z], [V.x + 150, V.z + 140], [F.x - 180, F.z - 30], [F.x - 60, F.z]]);
    this._road([[V.x, V.z], [V.x - 40, V.z + 400], [(V.x + B.x) / 2, (V.z + B.z) / 2 + 200], [B.x + 40, B.z - 90]]);
    this._road([[V.x, V.z], [V.x + 120, V.z - 180], [V.x + 260, V.z - 330]]);
    this._road([[V.x + 150, V.z + 140], [(V.x + L.x) / 2 + 80, (V.z + L.z) / 2], [L.x - 50, L.z - 60]]);
  }

  // ---- Airbase ------------------------------------------------------------

  _flatSlab(x, z, w, d, mat, y, rot = 0) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.receiveShadow = true;
    this.group.add(m);
    this.platforms.push({ x, z, hw: w / 2, hd: d / 2, rot, y, c: Math.cos(rot), s: Math.sin(rot) });
    return m;
  }

  _airbase() {
    const zone = this.terrain.zone('airbase');
    const y = zone.h + 0.06;
    this.baseY = zone.h;
    const R = RUNWAY;
    const rwMat = new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const len = R.x1 - R.x0;
    this._flatSlab((R.x0 + R.x1) / 2, R.z, len, R.width, rwMat, y + 0.05);
    const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(10), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const taxi = new THREE.MeshStandardMaterial({ color: 0x55585b, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // Taxiway + connectors and the main apron in front of the hangars.
    this._flatSlab((R.x0 + R.x1) / 2, 626, len - 80, 20, taxi, y + 0.03);
    this._flatSlab(R.x0 + 60, 663, 20, 60, taxi, y + 0.035);
    this._flatSlab(R.x1 - 60, 663, 20, 60, taxi, y + 0.035);
    this._flatSlab(-120, 575, 560, 82, concrete, y + 0.04);
    this._flatSlab(250, 575, 150, 82, concrete, y + 0.04);
    // Taxiway centre line (yellow).
    const yellow = new THREE.MeshBasicMaterial({ color: 0xd9b440 });
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(len - 80, 0.4).rotateX(-Math.PI / 2), yellow);
    tl.position.set((R.x0 + R.x1) / 2, y + 0.07, 626); this.group.add(tl);

    // Hangars: arched roofs, open doors facing the apron.
    const hangarDark = stdMat(0x2b3034, { rough: 0.8 });
    const hangarX = [-340, -200, -60];
    hangarX.forEach((hx, i) => {
      const g = new THREE.Group();
      const arch = new THREE.CylinderGeometry(24, 24, 44, 24, 1, true, -Math.PI / 2, Math.PI);
      arch.rotateX(-Math.PI / 2);
      const roof = mesh(arch, stdMat(0x9aa3a8, { rough: 0.5, metal: 0.6, side: THREE.DoubleSide }), { y: 0, sy: 0.75 });
      g.add(roof);
      const back = mesh(new THREE.CircleGeometry(24, 24, 0, Math.PI), stdMat(0x8d969c, { rough: 0.55, metal: 0.55, side: THREE.DoubleSide }), { z: -22, sy: 0.75 });
      g.add(back);
      // Arched door frame following the roofline.
      const frame = new THREE.TorusGeometry(24, 0.7, 6, 32, Math.PI);
      g.add(mesh(frame, hangarDark, { z: 22, sy: 0.75 }));
      const sign = canvasTexture(256, 64, (ctx, w, h) => { ctx.fillStyle = '#1b2a33'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f0c14b'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.fillText('HANGAR ' + (i + 1), w / 2, 46); });
      g.add(mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: sign }), { y: 14.2, z: 22.2, cast: false }));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 1), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1d0, emissiveIntensity: 0 }));
      lamp.position.set(0, 16, 0); g.add(lamp);
      this.nightLights.push({ mat: lamp.material, base: 3 });
      g.position.set(hx, y, 510);
      this.group.add(g);
      this.addBox(hx, 510 - 22, 24, 1, 0, y + 18);
      this.addBox(hx - 23.5, 510, 1, 22, 0, y + 18);
      this.addBox(hx + 23.5, 510, 1, 22, 0, y + 18);
      this.platforms.push({ x: hx, z: 510, hw: 24, hd: 22, rot: 0, y: y + 0.05, c: 1, s: 0 });
    });
    this.spawns.hangars = hangarX.map((hx) => ({ x: hx, y, z: 548, heading: 0 }));

    // Control tower with a glass cab and a turning radar.
    const tx = 120, tz = 500;
    const tower = new THREE.Group();
    tower.add(mesh(new THREE.BoxGeometry(12, 8, 12), stdMat(0xc9c3b8, { rough: 0.8 }), { y: 4 }));
    tower.add(mesh(new THREE.CylinderGeometry(3.2, 3.6, 26, 12), stdMat(0xd8d2c6, { rough: 0.75 }), { y: 21 }));
    tower.add(mesh(new THREE.CylinderGeometry(6.8, 5.2, 1.2, 8), stdMat(0x3a3f44), { y: 34.6 }));
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x1d3a4a, roughness: 0.08, metalness: 0.9, emissive: 0x7fd8ff, emissiveIntensity: 0.05 });
    tower.add(mesh(new THREE.CylinderGeometry(6.4, 6.8, 5, 8), cabMat, { y: 37.8 }));
    this.nightLights.push({ mat: cabMat, base: 0.7 });
    tower.add(mesh(new THREE.CylinderGeometry(7, 6.4, 1, 8), stdMat(0x3a3f44), { y: 40.8 }));
    const radar = new THREE.Group();
    radar.add(mesh(new THREE.BoxGeometry(7, 1.6, 0.4), stdMat(0xe8e8e8, { rough: 0.4, metal: 0.4 }), { y: 1.2 }));
    radar.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 6), stdMat(0x555555), { y: 0.3 }));
    radar.position.y = 41.3;
    tower.add(radar);
    const beacon = glowSprite(0xff3322, 3); beacon.position.y = 44; tower.add(beacon);
    this.blinkers.push({ sprite: beacon, period: 1.4, phase: 0, night: true });
    tower.position.set(tx, y, tz);
    this.group.add(tower);
    this.spinners.push((dt) => { radar.rotation.y += dt * 1.6; });
    this.addBox(tx, tz, 6, 6, 0, y + 42);
    this.towerPos = new THREE.Vector3(tx, y, tz);

    // Helipads.
    const padTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#4b4f52'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f2f2f2'; ctx.font = 'bold 150px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', w / 2, h / 2 + 8);
    });
    const padMat = new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    this.spawns.helipads = [];
    [[220, 560], [280, 560]].forEach(([px, pz]) => {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(13, 32).rotateX(-Math.PI / 2), padMat);
      pad.position.set(px, y + 0.09, pz); pad.receiveShadow = true; this.group.add(pad);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const g = glowSprite(0x57ff8a, 1.4);
        g.position.set(px + Math.cos(a) * 13.5, y + 0.4, pz + Math.sin(a) * 13.5);
        this.group.add(g);
        this.blinkers.push({ sprite: g, period: 0, night: true });
      }
      this.spawns.helipads.push({ x: px, y, z: pz, heading: Math.PI });
    });

    // Fuel tanks, windsock, crates, parked service trucks.
    const tankMat = stdMat(0xe6e2d6, { rough: 0.5, metal: 0.3 });
    [[330, 480], [352, 480], [374, 480]].forEach(([fx, fz]) => {
      this.group.add(mesh(new THREE.CylinderGeometry(8, 8, 10, 20), tankMat, { x: fx, y: y + 5, z: fz }));
      this.addBox(fx, fz, 8, 8, 0, y + 10);
    });
    const sockPole = mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 6), stdMat(0xdddddd), { x: 420, y: y + 4, z: 660 });
    const sock = mesh(new THREE.ConeGeometry(0.8, 4, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide, roughness: 0.8 }), { x: 422, y: y + 7.6, z: 660, rz: Math.PI / 2 });
    this.group.add(sockPole, sock);
    this.spinners.push((dt, t) => { sock.rotation.y = Math.sin(t * 0.4) * 0.5 + 0.3; sock.rotation.x = Math.sin(t * 2.3) * 0.06; });
    const truckMat = stdMat(0xe0b020, { rough: 0.5, metal: 0.2 });
    [[40, 590, 0.3], [-260, 600, -0.2], [180, 470, 1.4]].forEach(([vx, vz, r]) => {
      const tr = new THREE.Group();
      tr.add(mesh(new THREE.BoxGeometry(2.4, 1.8, 5.5), truckMat, { y: 1.5 }));
      tr.add(mesh(new THREE.BoxGeometry(2.3, 1.2, 1.8), stdMat(0x1f2a33, { rough: 0.2, metal: 0.6 }), { y: 2.2, z: -1.8 }));
      for (const sx of [-1.1, 1.1]) for (const sz of [-1.8, 1.8]) tr.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12).rotateZ(Math.PI / 2), stdMat(0x111111), { x: sx, y: 0.5, z: sz }));
      tr.position.set(vx, y, vz); tr.rotation.y = r; this.group.add(tr);
      this.addBox(vx, vz, 1.5, 3, r, y + 3);
    });

    // Runway edge + threshold lights (instanced glows).
    const lightPos = [];
    for (let x = R.x0; x <= R.x1; x += 40) for (const s of [-1, 1]) lightPos.push([x, R.z + s * (R.width / 2 + 1)]);
    for (let k = 0; k < 12; k++) lightPos.push([R.x0 - 40 - k * 16, R.z]);
    const lamp = glowTexture();
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos.flatMap(([lx, lz]) => [lx, this.h(lx, lz) + 0.6, lz]), 3));
    const lm = new THREE.PointsMaterial({ map: lamp, size: 3.2, sizeAttenuation: true, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const lp = new THREE.Points(lg, lm);
    this.group.add(lp);
    this.nightPoints = [lm];
    this.airbaseCenter = new THREE.Vector3(PLACES.airbase.x, y, 560);
  }

  // ---- Village ------------------------------------------------------------

  _village() {
    const V = PLACES.village;
    const zone = this.terrain.zone('village');
    const y = zone.h;
    const rnd = this.rnd;
    const wallCols = [0xe8dcc4, 0xd9c7a6, 0xf1e7d6, 0xc9b69a, 0xe3d3c1, 0xb8c4c9, 0xe6c9a8];
    const roofCols = [0x9a4a32, 0x7d3b2a, 0x5a4d49, 0x8e5a3a, 0x6b3a2c];

    // Plaza with fountain.
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(34, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: concreteTexture(6), color: 0xd8cbb4, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    plaza.position.set(V.x, y + 0.12, V.z); plaza.receiveShadow = true; this.group.add(plaza);
    this.platforms.push({ x: V.x, z: V.z, hw: 30, hd: 30, rot: 0, y: y + 0.12, c: 1, s: 0 });
    const stone = stdMat(0xcfc6b5, { rough: 0.85 });
    this.group.add(mesh(new THREE.CylinderGeometry(6, 6.4, 1, 28), stone, { x: V.x, y: y + 0.5, z: V.z }));
    const water = new THREE.Mesh(new THREE.CircleGeometry(5.5, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8ea6, roughness: 0.05, metalness: 0.2 }));
    water.position.set(V.x, y + 0.95, V.z); this.group.add(water);
    this.group.add(mesh(new THREE.CylinderGeometry(0.6, 0.9, 3.4, 12), stone, { x: V.x, y: y + 2.2, z: V.z }));
    this.group.add(mesh(new THREE.SphereGeometry(1.2, 16, 10), stone, { x: V.x, y: y + 4.2, z: V.z }));
    this.addBox(V.x, V.z, 6, 6, 0, y + 1.5);

    // Church on the north side of the plaza.
    const church = new THREE.Group();
    church.add(mesh(new THREE.BoxGeometry(14, 10, 26), stdMat(0xe9e1d0, { rough: 0.85 }), { y: 5 }));
    const roofG = new THREE.CylinderGeometry(0.01, 10.5, 7, 4, 1); roofG.rotateY(Math.PI / 4); roofG.scale(1, 1, 1.9);
    church.add(mesh(roofG, stdMat(0x5a4640, { rough: 0.7 }), { y: 13.4 }));
    church.add(mesh(new THREE.BoxGeometry(6, 26, 6), stdMat(0xe2d8c4, { rough: 0.85 }), { y: 13, z: 14 }));
    church.add(mesh(new THREE.ConeGeometry(4.6, 10, 4), stdMat(0x4a3a36), { y: 31, z: 14, ry: Math.PI / 4 }));
    const clock = canvasTexture(128, 128, (ctx, w, h) => { ctx.fillStyle = '#f6f0dc'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64, 20); ctx.moveTo(64, 64); ctx.lineTo(96, 70); ctx.stroke(); });
    const clockMat = new THREE.MeshStandardMaterial({ map: clock, emissive: 0xffe9b0, emissiveIntensity: 0 });
    church.add(mesh(new THREE.CircleGeometry(2, 24), clockMat, { y: 21, z: 17.05 }));
    this.nightLights.push({ mat: clockMat, base: 0.8 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, emissive: 0xffc47a, emissiveIntensity: 0, roughness: 0.3 });
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) church.add(mesh(new THREE.PlaneGeometry(1.6, 4.5), windowMat, { x: s * 7.02, y: 5.5, z: -8 + k * 5, ry: s * Math.PI / 2, cast: false }));
    this.nightLights.push({ mat: windowMat, base: 1.6 });
    church.position.set(V.x, y, V.z - 62);
    church.rotation.y = Math.PI;
    this.group.add(church);
    this.addBox(V.x, V.z - 62, 7.5, 13.5, 0, y + 12);
    this.addBox(V.x, V.z - 76, 3.2, 3.2, 0, y + 36);

    // Houses along streets radiating from the plaza. Walls, roofs, doors
    // and window panes are instanced per part (5 draw calls for the town).
    const houses = [];
    const streets = [0.35, 1.2, 2.2, 3.1, 4.2, 5.25];
    for (const ang of streets) {
      const dx = Math.cos(ang), dz = Math.sin(ang);
      for (let d = 52; d < 215; d += 20 + rnd() * 8) {
        for (const side of [-1, 1]) {
          if (rnd() < 0.18) continue;
          const off = 14 + rnd() * 3;
          const hx = V.x + dx * d - dz * off * side, hz = V.z + dz * d + dx * off * side;
          const w = 8 + rnd() * 5, dd = 7 + rnd() * 4, hh = 5 + rnd() * 3.5 * (rnd() < 0.3 ? 2 : 1);
          // Local +z (the front door) faces back toward the street.
          const rot = Math.atan2(side * dz, -side * dx);
          const gy = this.h(hx, hz);
          if (Math.abs(gy - y) > 5) continue;
          if (this.isBlocked(hx, hz, 2)) continue;
          houses.push({ x: hx, z: hz, w, d: dd, h: hh, rot, y: Math.min(gy, y) - 0.3, wall: wallCols[Math.floor(rnd() * wallCols.length)], roof: roofCols[Math.floor(rnd() * roofCols.length)], lit: rnd() < 0.7 });
          this.addBox(hx, hz, w / 2, dd / 2, rot, y + hh + 3);
        }
      }
      // Street itself.
      this._road([[V.x + dx * 30, V.z + dz * 30], [V.x + dx * 225, V.z + dz * 225]], 7);
    }
    const n = houses.length;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
    const roofGeo = new THREE.CylinderGeometry(0.02, 0.72, 0.62, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.31, 0);
    const winGeo = new THREE.PlaneGeometry(1, 1);
    const wallMaps = plaster(), roofMaps = roofTiles(), winMaps = windowTextures();
    const wallMap = wallMaps.map.clone(), wallNormal = wallMaps.normal.clone();
    wallMap.repeat.set(2, 2); wallNormal.repeat.set(2, 2);
    const tileMap = roofMaps.map.clone(), tileNormal = roofMaps.normal.clone();
    tileMap.repeat.set(2, 2); tileNormal.repeat.set(2, 2);
    const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ map: wallMap, normalMap: wallNormal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.94 }), n);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ map: tileMap, normalMap: tileNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.86, flatShading: true }), n);
    const winMat = new THREE.MeshStandardMaterial({ map: winMaps.map, emissiveMap: winMaps.emissive, emissive: 0xffd49b, emissiveIntensity: 0, roughness: 0.3, metalness: 0.08 });
    const darkWinMat = new THREE.MeshStandardMaterial({ map: winMaps.map, roughness: 0.3, metalness: 0.08 });
    const perHouse = 10;
    const lit = houses.filter((hh) => hh.lit).length;
    const wins = new THREE.InstancedMesh(winGeo, winMat, lit * perHouse);
    const dwins = new THREE.InstancedMesh(winGeo, darkWinMat, (n - lit) * perHouse);
    const doors = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 2.3), new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.83 }), n);
    const trimMat = stdMat(0xc4bcaa, { rough: 0.9 });
    const foundations = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8c867a, map: wallMap, normalMap: wallNormal, roughness: 0.95 }), n);
    const eaves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), trimMat, n);
    const sills = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.12, 0.24), trimMat, n * perHouse);
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.22, 0.65), trimMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let wi = 0, dwi = 0, di = 0, si = 0;
    const local = new THREE.Vector3(), qq = new THREE.Quaternion();
    houses.forEach((hs, i) => {
      q.setFromEuler(e.set(0, hs.rot, 0));
      m4.compose(p.set(hs.x, hs.y, hs.z), q, s.set(hs.w, hs.h + 0.3, hs.d)); walls.setMatrixAt(i, m4); walls.setColorAt(i, c.set(hs.wall));
      m4.compose(p.set(hs.x, hs.y + hs.h + 0.3, hs.z), q, s.set(hs.w * 1.02, hs.w * 0.55, hs.d * 1.02)); roofs.setMatrixAt(i, m4); roofs.setColorAt(i, c.set(hs.roof));
      m4.compose(p.set(hs.x, hs.y + 0.18, hs.z), q, s.set(hs.w + 0.16, 0.36, hs.d + 0.16)); foundations.setMatrixAt(i, m4);
      m4.compose(p.set(hs.x, hs.y + hs.h + 0.31, hs.z), q, s.set(hs.w * 1.04, 0.16, hs.d * 1.04)); eaves.setMatrixAt(i, m4);
      // Doors and windows on every facade, with projecting stone sills.
      const place = (lx, ly, lz, ry, sx, sy, target, idx) => {
        local.set(lx, ly, lz).applyQuaternion(q);
        qq.setFromEuler(e.set(0, hs.rot + ry, 0));
        m4.compose(p.set(hs.x + local.x, hs.y + local.y, hs.z + local.z), qq, s.set(sx, sy, 1));
        target.setMatrixAt(idx, m4);
      };
      place(0, 1.45, hs.d / 2 + 0.04, 0, 1, 1, doors, di++);
      place(0, 0.24, hs.d / 2 + 0.3, 0, 1, 1, steps, i);
      const slots = [[-hs.w * 0.3, 0], [hs.w * 0.3, 0], [-hs.w * 0.3, Math.PI], [hs.w * 0.3, Math.PI], [0, Math.PI], [0, 0]];
      slots.forEach(([lx, ry], k) => {
        const ly = k >= 4 ? Math.min(hs.h - 1.2, 4.6) : 2.2;
        const lz = ry === 0 ? hs.d / 2 + 0.03 : -hs.d / 2 - 0.03;
        if (hs.lit) place(lx, ly, lz, ry, 1.3, 1.2, wins, wi++);
        else place(lx, ly, lz, ry, 1.3, 1.2, dwins, dwi++);
        place(lx, ly - 0.66, lz, ry, 1, 1, sills, si++);
      });
      for (const side of [-1, 1]) for (const zz of [-0.22, 0.22]) {
        const lx = side * (hs.w / 2 + 0.04), lz = zz * hs.d, ry = side * Math.PI / 2, ly = 2.3;
        if (hs.lit) place(lx, ly, lz, ry, 1.3, 1.2, wins, wi++);
        else place(lx, ly, lz, ry, 1.3, 1.2, dwins, dwi++);
        place(lx, ly - 0.66, lz, ry, 1, 1, sills, si++);
      }
    });
    for (const im of [walls, roofs, wins, dwins, doors, foundations, eaves, sills, steps]) {
      im.castShadow = im !== wins && im !== dwins && im !== doors;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.nightLights.push({ mat: winMat, base: 2.2 });
    this.houses = houses;

    // Street lamps around the plaza and along streets.
    const lampPost = stdMat(0x2d3034, { rough: 0.5, metal: 0.6 });
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd28a, emissiveIntensity: 0 });
    this.nightLights.push({ mat: bulbMat, base: 5 });
    const lampSpots = [];
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; lampSpots.push([V.x + Math.cos(a) * 36, V.z + Math.sin(a) * 36]); }
    for (const ang of streets) for (let d = 70; d < 215; d += 45) lampSpots.push([V.x + Math.cos(ang) * d + Math.sin(ang) * 5, V.z + Math.sin(ang) * d - Math.cos(ang) * 5]);
    const pool = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb35a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
    this.lightPoolMat = pool;
    for (const [lx, lz] of lampSpots) {
      const gy = this.h(lx, lz);
      this.group.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), lampPost, { x: lx, y: gy + 2.5, z: lz }));
      this.group.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), bulbMat, { x: lx, y: gy + 5.1, z: lz, cast: false }));
      const g = glowSprite(0xffc070, 5, 0); g.position.set(lx, gy + 5.1, lz); this.group.add(g);
      this.blinkers.push({ sprite: g, period: 0, night: true, max: 0.8 });
      const poolM = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), pool);
      poolM.position.set(lx, gy + 0.35, lz); this.group.add(poolM);
    }

    // Market stalls with striped canopies.
    const canopyCols = [0xd9483b, 0x2f7fc1, 0xe6b43a, 0x3f9a5a];
    for (let k = 0; k < 6; k++) {
      const a = 0.4 + k * 0.42;
      const sx = V.x + Math.cos(a + 1.6) * 24, sz = V.z + Math.sin(a + 1.6) * 24;
      const st = new THREE.Group();
      st.add(mesh(new THREE.BoxGeometry(3.4, 1, 2), stdMat(0x7a5a3a), { y: 0.5 }));
      for (const px of [-1.6, 1.6]) for (const pz of [-0.9, 0.9]) st.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), stdMat(0x333333), { x: px, y: 1.3, z: pz }));
      st.add(mesh(new THREE.BoxGeometry(3.8, 0.15, 2.4), stdMat(canopyCols[k % 4], { rough: 0.9 }), { y: 2.65, rx: 0.12 }));
      // Produce on the counter.
      for (let f = 0; f < 5; f++) st.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), stdMat([0xd33b2c, 0xf2a531, 0x6dab3a][f % 3]), { x: -1.2 + f * 0.6, y: 1.15, z: 0.2 }));
      st.position.set(sx, y, sz); st.rotation.y = -a;
      this.group.add(st);
      this.addBox(sx, sz, 1.8, 1.1, -a, y + 2.7);
    }
    // Benches + decorative trees around the plaza.
    const plantedTree = treeSpecimen('broad');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      const tx = V.x + Math.cos(a) * 44, tz = V.z + Math.sin(a) * 44;
      const gy = this.h(tx, tz);
      const tree = plantedTree.clone();
      tree.position.set(tx, gy - 0.05, tz); tree.rotation.y = a + k * 0.6;
      tree.scale.setScalar(0.65 + (k % 3) * 0.05);
      this.group.add(tree);
      this.addBox(tx, tz, 0.32, 0.32, 0, gy + 7.5);
    }
    this.spawns.village = { x: V.x + 20, y, z: V.z + 30 };
  }

  // ---- Farm ---------------------------------------------------------------

  _farm() {
    const F = PLACES.farm;
    const zone = this.terrain.zone('farm');
    const y = zone.h;
    const bx = F.x - 190, bz = F.z + 120;
    const barn = new THREE.Group();
    barn.add(mesh(new THREE.BoxGeometry(18, 9, 26), stdMat(0x9e2f25, { rough: 0.85 }), { y: 4.5 }));
    const roof = new THREE.CylinderGeometry(0.01, 11.5, 6, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1, 1, 1.75);
    barn.add(mesh(roof, stdMat(0x3a3a3c, { rough: 0.6, metal: 0.4 }), { y: 12 }));
    barn.add(mesh(new THREE.PlaneGeometry(6, 6.5), stdMat(0xf1ece2), { y: 3.3, z: 13.02, cast: false }));
    barn.add(mesh(new THREE.PlaneGeometry(5, 5.8), stdMat(0x6d2019), { y: 3.2, z: 13.04, cast: false }));
    barn.position.set(bx, y, bz); this.group.add(barn);
    this.addBox(bx, bz, 9, 13, 0, y + 14);
    const silo = new THREE.Group();
    silo.add(mesh(new THREE.CylinderGeometry(4, 4, 20, 20), stdMat(0xb9c0c3, { rough: 0.4, metal: 0.6 }), { y: 10 }));
    silo.add(mesh(new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), stdMat(0x8e979b, { rough: 0.4, metal: 0.6 }), { y: 20 }));
    silo.position.set(bx + 18, y, bz - 6); this.group.add(silo);
    this.addBox(bx + 18, bz - 6, 4, 4, 0, y + 24);
    // Farmhouse.
    const fh = new THREE.Group();
    fh.add(mesh(new THREE.BoxGeometry(11, 6, 9), stdMat(0xefe6d2), { y: 3 }));
    const fr = new THREE.CylinderGeometry(0.01, 8, 4, 4, 1); fr.rotateY(Math.PI / 4); fr.scale(1, 1, 0.85);
    fh.add(mesh(fr, stdMat(0x5b3b2e, { flat: true }), { y: 8 }));
    const fw = new THREE.MeshStandardMaterial({ color: 0x28303a, emissive: 0xffbe6e, emissiveIntensity: 0 });
    for (const sx of [-3, 3]) fh.add(mesh(new THREE.PlaneGeometry(1.4, 1.3), fw, { x: sx, y: 3.2, z: 4.52, cast: false }));
    this.nightLights.push({ mat: fw, base: 2 });
    fh.position.set(bx - 30, y, bz + 10); this.group.add(fh);
    this.addBox(bx - 30, bz + 10, 5.5, 4.5, 0, y + 9);
    // Pasture fence.
    const fenceMat = stdMat(0x8a6f4d, { rough: 0.9 });
    const px0 = F.x - 250, pz0 = F.z - 180, pw = 150, pd = 110;
    const posts = [];
    for (let i = 0; i <= pw; i += 6) posts.push([px0 + i, pz0], [px0 + i, pz0 + pd]);
    for (let i = 6; i < pd; i += 6) posts.push([px0, pz0 + i], [px0 + pw, pz0 + i]);
    const postGeo = new THREE.BoxGeometry(0.18, 1.4, 0.18);
    const im = new THREE.InstancedMesh(postGeo, fenceMat, posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([fx, fz], i) => { m4.makeTranslation(fx, this.h(fx, fz) + 0.7, fz); im.setMatrixAt(i, m4); });
    im.castShadow = true; this.group.add(im);
    const railGeo = new THREE.BoxGeometry(1, 0.1, 0.08);
    const rails = [];
    const addRail = (ax, az, bx2, bz2) => { for (const hgt of [0.55, 1.1]) rails.push([ax, az, bx2, bz2, hgt]); };
    for (let i = 0; i < pw; i += 6) { addRail(px0 + i, pz0, px0 + i + 6, pz0); addRail(px0 + i, pz0 + pd, px0 + i + 6, pz0 + pd); }
    for (let i = 0; i < pd; i += 6) { addRail(px0, pz0 + i, px0, pz0 + i + 6); addRail(px0 + pw, pz0 + i, px0 + pw, pz0 + i + 6); }
    const rim = new THREE.InstancedMesh(railGeo, fenceMat, rails.length);
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    rails.forEach(([ax, az, bx2, bz2, hgt], i) => {
      const len = Math.hypot(bx2 - ax, bz2 - az), mx = (ax + bx2) / 2, mz = (az + bz2) / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(bz2 - az, bx2 - ax));
      m4.compose(p.set(mx, this.h(mx, mz) + hgt, mz), q, s.set(len, 1, 1)); rim.setMatrixAt(i, m4);
    });
    this.group.add(rim);
    this.pasture = { x: px0 + pw / 2, z: pz0 + pd / 2, hw: pw / 2 - 6, hd: pd / 2 - 6 };
    // Hay bales.
    const hay = stdMat(0xd8b85a, { rough: 1 });
    for (let k = 0; k < 14; k++) {
      const hx = F.x - 60 + (this.rnd() - 0.5) * 300, hz = F.z + (this.rnd() - 0.5) * 260;
      if (Math.hypot(hx - (F.x + 60), hz - (F.z - 20)) < 110) continue;
      this.group.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 14).rotateZ(Math.PI / 2), hay, { x: hx, y: this.h(hx, hz) + 0.9, z: hz, ry: this.rnd() * 3 }));
    }
    this.spawns.farm = { x: bx - 30, y, z: bz + 30 };
  }

  // ---- Coast --------------------------------------------------------------

  _lighthouse() {
    const L = PLACES.lighthouse;
    const y = this.h(L.x, L.z);
    const g = new THREE.Group();
    const white = stdMat(0xf2f0ea, { rough: 0.6 }), red = stdMat(0xc0302a, { rough: 0.6 });
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(2.8 - i * 0.22 - 0.22, 2.8 - i * 0.22, 5, 20), i % 2 ? red : white, { y: 2.5 + i * 5 }));
    g.add(mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 16), stdMat(0x222222), { y: 30.3 }));
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff0b0, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 });
    g.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 12), lampMat, { y: 32, cast: false }));
    this.nightLights.push({ mat: lampMat, base: 6 });
    g.add(mesh(new THREE.ConeGeometry(2.1, 2.2, 12), red, { y: 34.6 }));
    // Keeper's cottage.
    g.add(mesh(new THREE.BoxGeometry(7, 4, 6), white, { x: 8, y: 2 }));
    g.add(mesh(new THREE.ConeGeometry(5.4, 3, 4), red, { x: 8, y: 5.5, ry: Math.PI / 4 }));
    // Rotating beams.
    const beam = new THREE.Group();
    const beamGeo = new THREE.ConeGeometry(9, 220, 20, 1, true); beamGeo.translate(0, -110, 0); beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    beam.add(new THREE.Mesh(beamGeo, beamMat));
    const b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI; beam.add(b2);
    beam.position.y = 32;
    g.add(beam);
    const lampGlow = glowSprite(0xfff0c0, 14, 0); lampGlow.position.y = 32; g.add(lampGlow);
    this.blinkers.push({ sprite: lampGlow, period: 0, night: true, max: 1 });
    this.beamMat = beamMat;
    this.spinners.push((dt) => { beam.rotation.y += dt * 0.9; });
    g.position.set(L.x, y - 0.2, L.z);
    this.group.add(g);
    this.addBox(L.x, L.z, 2.8, 2.8, 0, y + 36);
    this.addBox(L.x + 8, L.z, 3.5, 3, 0, y + 7);
    this.spawns.lighthouse = { x: L.x - 6, y, z: L.z + 6 };
  }

  _harbour() {
    const B = PLACES.beach;
    const out = new THREE.Vector2(Math.cos(B.angle), Math.sin(B.angle));
    const side = new THREE.Vector2(-out.y, out.x);
    const sx = B.x + side.x * 90, sz = B.z + side.y * 90;
    const rot = Math.atan2(out.x, out.y);
    const wood = stdMat(0x7a5b3c, { rough: 0.9 });
    const pier = new THREE.Group();
    const L = 120;
    pier.add(mesh(new THREE.BoxGeometry(5, 0.5, L), wood, { y: 1.6, z: L / 2 - 10 }));
    for (let i = 0; i < L; i += 8) for (const s of [-2.2, 2.2]) pier.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 6), stdMat(0x4a3a2a), { x: s, y: -2, z: i - 10 }));
    pier.position.set(sx, 0, sz);
    pier.rotation.y = rot;
    this.group.add(pier);
    const cx = sx + out.x * (L / 2 - 10), cz = sz + out.y * (L / 2 - 10);
    this.platforms.push({ x: cx, z: cz, hw: 2.5, hd: L / 2, rot, y: 1.85, c: Math.cos(rot), s: Math.sin(rot) });
    // Moored boats bob on the swell.
    this.boats = [];
    const hullCols = [0xf2f2f2, 0x2f5f8a, 0xc8412f];
    for (let k = 0; k < 3; k++) {
      const boat = new THREE.Group();
      const hull = new THREE.CylinderGeometry(1.6, 1.1, 9, 10, 1); hull.rotateX(Math.PI / 2); hull.scale(1, 0.6, 1);
      boat.add(mesh(hull, stdMat(hullCols[k], { rough: 0.5 }), { y: 0.3 }));
      boat.add(mesh(new THREE.BoxGeometry(2, 1.4, 3), stdMat(0xe8e8e8), { y: 1.4, z: 0.8 }));
      boat.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 5), stdMat(0xdddddd), { y: 4.2, z: -0.8 }));
      const d = 30 + k * 30;
      boat.position.set(sx + out.x * d + side.x * 8, 0, sz + out.y * d + side.y * 8);
      boat.rotation.y = rot + 0.1 * k;
      this.group.add(boat);
      this.boats.push({ boat, phase: k * 1.7 });
    }
    this.spinners.push((dt, t) => { for (const b of this.boats) { b.boat.position.y = Math.sin(t * 1.1 + b.phase) * 0.25; b.boat.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.06; } });
    // Beach umbrellas and towels.
    const umb = [0xe94f37, 0x2f9ad8, 0xf2c14e, 0xffffff];
    this.beachSpots = [];
    for (let k = 0; k < 10; k++) {
      const along = (k - 5) * 16 + (this.rnd() - 0.5) * 6;
      const inland = 18 + this.rnd() * 14;
      const ux = B.x + side.x * along - out.x * inland, uz = B.z + side.y * along - out.y * inland;
      const gy = this.h(ux, uz);
      if (gy < 0.6) continue;
      const u = new THREE.Group();
      u.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), stdMat(0xdddddd), { y: 1.3 }));
      u.add(mesh(new THREE.ConeGeometry(1.7, 0.7, 10), stdMat(umb[k % 4], { rough: 0.8 }), { y: 2.6 }));
      u.add(mesh(new THREE.PlaneGeometry(1, 2).rotateX(-Math.PI / 2), stdMat(umb[(k + 1) % 4], { rough: 0.9 }), { x: 1.2, y: 0.05, cast: false }));
      u.position.set(ux, gy, uz); u.rotation.y = this.rnd() * 3;
      this.group.add(u);
      this.beachSpots.push({ x: ux + 1.2, z: uz, y: gy });
    }
    this.spawns.beach = { x: B.x - out.x * 30, y: this.h(B.x - out.x * 30, B.z - out.y * 30), z: B.z - out.y * 30 };
  }

  _turbines() {
    const T0 = PLACES.turbines;
    const white = stdMat(0xf1f3f4, { rough: 0.45, metal: 0.2 });
    this.turbineBlinks = [];
    for (let k = 0; k < 6; k++) {
      const tx = T0.x + (k % 2 ? 22 : -22), tz = T0.z - 290 + k * 110;
      const gy = this.h(tx, tz);
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(1.1, 2.1, 78, 14), white, { y: 39 }));
      g.add(mesh(new THREE.BoxGeometry(3, 3, 9), white, { y: 79.5, z: -1.5 }));
      const hub = new THREE.Group();
      hub.position.set(0, 79.5, 3.4);
      hub.add(mesh(new THREE.SphereGeometry(1.3, 12, 10), white));
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.BoxGeometry(1.8, 38, 0.35); blade.translate(0, 19.5, 0);
        const bm = mesh(blade, white); bm.rotation.z = (b / 3) * Math.PI * 2; hub.add(bm);
      }
      g.add(hub);
      const blink = glowSprite(0xff2211, 4, 0); blink.position.y = 82; g.add(blink);
      this.blinkers.push({ sprite: blink, period: 2, phase: k * 0.1, night: true, max: 1 });
      g.position.set(tx, gy - 0.5, tz);
      g.rotation.y = -0.5;
      this.group.add(g);
      const speed = 0.7 + k * 0.05;
      this.spinners.push((dt) => { hub.rotation.z -= dt * speed; });
      this.addBox(tx, tz, 2, 2, 0, gy + 80);
    }
  }

  // ---- Runtime ------------------------------------------------------------

  update(dt, t, sky) {
    for (const fn of this.spinners) fn(dt, t);
    const night = sky.night;
    const dusk = Math.max(night, sky.golden * 0.35);
    for (const l of this.nightLights) l.mat.emissiveIntensity = l.base * dusk;
    for (const pm of this.nightPoints) pm.opacity = 0.25 + dusk * 0.75;
    for (const b of this.blinkers) {
      const max = b.max ?? 1;
      let o = b.night ? max * Math.max(dusk, 0.15) : max;
      if (b.period > 0) o *= ((t + b.phase) % b.period) < b.period * 0.18 ? 1 : 0.05;
      b.sprite.material.opacity = o;
    }
    if (this.beamMat) this.beamMat.opacity = 0.16 * night;
    if (this.lightPoolMat) this.lightPoolMat.opacity = 0.35 * night;
  }

  // Resolve a circle (x, z, r) at height y against building boxes; returns true on hit.
  collide(pos, r, y = -Infinity) {
    let hit = false;
    for (const b of this.colliders) {
      if (y > b.top || y < b.bottom) continue;
      const dx = pos.x - b.x, dz = pos.z - b.z;
      if (Math.abs(dx) > b.hw + b.hd + r + 2 || Math.abs(dz) > b.hw + b.hd + r + 2) continue;
      let lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      const ox = b.hw + r - Math.abs(lx), oz = b.hd + r - Math.abs(lz);
      if (ox > 0 && oz > 0) {
        hit = true;
        if (ox < oz) lx = Math.sign(lx) * (b.hw + r); else lz = Math.sign(lz) * (b.hd + r);
        pos.x = b.x + lx * b.c + lz * b.s;
        pos.z = b.z - lx * b.s + lz * b.c;
      }
    }
    return hit;
  }

  // Height of any walkable slab under (x, z), or -Infinity.
  platformAt(x, z) {
    let best = -Infinity;
    for (const p of this.platforms) {
      const dx = x - p.x, dz = z - p.z;
      const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd && p.y > best) best = p.y;
    }
    return best;
  }

  groundAt(x, z) { return Math.max(this.terrain.heightAt(x, z), this.platformAt(x, z)); }

  // Paint runway, roads and roofs onto the minimap canvas.
  paintMap(canvas) {
    const ctx = canvas.getContext('2d');
    const S = canvas.width / MAP_SIZE;
    const X = (x) => (x + HALF) * S, Z = (z) => (z + HALF) * S;
    ctx.lineCap = 'round';
    for (const r of this.roads) {
      ctx.strokeStyle = 'rgba(70,70,74,0.95)'; ctx.lineWidth = Math.max(1.4, r.width * S);
      ctx.beginPath(); r.pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke();
    }
    ctx.fillStyle = '#3a3d40';
    ctx.fillRect(X(RUNWAY.x0), Z(RUNWAY.z - RUNWAY.width / 2), (RUNWAY.x1 - RUNWAY.x0) * S, Math.max(2, RUNWAY.width * S));
    ctx.fillStyle = '#c8c3b8';
    for (const b of this.colliders) {
      ctx.save(); ctx.translate(X(b.x), Z(b.z)); ctx.rotate(-b.rot);
      ctx.fillRect(-b.hw * S, -b.hd * S, Math.max(1, b.hw * 2 * S), Math.max(1, b.hd * 2 * S));
      ctx.restore();
    }
  }
}
