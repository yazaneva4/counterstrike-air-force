// The island. A seeded height function sculpts a coastline, rolling farmland,
// a northern mountain range with a snow-capped peak, and a red-rock desert of
// mesas in the west. Flat "zones" are carved in for the airbase, village,
// farm and the mystery sites. Gameplay height queries interpolate the exact
// same triangles the GPU draws, so feet and wheels sit on the visible ground.

import * as THREE from 'three';
import { Noise } from '../core/noise.js';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { groundDetail } from '../core/textures.js';

export const SEED = 1947;
export const MAP_SIZE = 5600;
export const GRID = 320;
export const HALF = MAP_SIZE / 2;
export const CELL = MAP_SIZE / GRID;
export const SEA_FLOOR = -40;

// Named anchors. A few are resolved at build time (coast / peak search).
export const PLACES = {
  airbase: { name: 'Kestrel Airbase', x: -80, z: 640 },
  village: { name: 'Harrow Village', x: 950, z: 90 },
  farm: { name: 'Aldren Farms', x: 1330, z: 540 },
  turbines: { name: 'Windward Ridge', x: 1480, z: -260 },
  stones: { name: 'Hollow Hill', x: 330, z: -560 },
  pyramid: { name: 'Red Mesa', x: -1380, z: 260 },
  crash: { name: 'Red Mesa Crash Site', x: -1120, z: -390 },
  peak: { name: 'Mount Kestrel', x: -120, z: -1380 },
  beach: { name: 'Sunset Beach', x: 0, z: 0 },      // resolved from coast
  lighthouse: { name: 'Gull Point', x: 0, z: 0 },   // resolved from coast
  vortex: { name: 'The Western Reef', x: 0, z: 0 }, // resolved offshore
  spaceport: { name: 'Kestrel Spaceport', x: 1780, z: 110 },
  speedway: { name: 'Kestrel Speedway', x: -250, z: 1290 },
};

const COL = (hex) => new THREE.Color(hex);
const C = {
  seabed: COL(0x8c7a55), sand: COL(0xd8c79a), wetSand: COL(0xa99468),
  grassA: COL(0x3f6a26), grassB: COL(0x6f8e35), dry: COL(0x9b9a52), forest: COL(0x2f4f1f),
  alpine: COL(0x6c7458), rock: COL(0x6b645c), rockDark: COL(0x4b4640), snow: COL(0xf4f7fb),
  desert: COL(0xc98a55), desertLight: COL(0xdcae78), strataA: COL(0xa4583a), strataB: COL(0xc47a4c), strataC: COL(0x8e4a33),
  airfield: COL(0x7f8a4c), scorched: COL(0x2c2622), village: COL(0x6a8a3a),
  wheat: COL(0xd6b75a), crop: COL(0x5f8f2e), plowed: COL(0x6e5236), lavender: COL(0x8c7bb8),
};

export class Terrain {
  constructor() {
    this.noise = new Noise(SEED);
    this.zones = [];
    this.heights = new Float32Array((GRID + 1) * (GRID + 1));
    this._tmp = { d: 0, dW: 0, mN: 0 };
    this._resolvePlaces();
    this._defineZones();
  }

  // ---- Height model -------------------------------------------------------

  raw(x, z, out = this._tmp) {
    const N = this.noise;
    const r = Math.hypot(x, z * 1.12);
    const warp = N.fbm(x * 0.00075 + 3.1, z * 0.00075 - 1.7, 4) * 470 + N.fbm(x * 0.0026 - 5, z * 0.0026 + 2, 3) * 110;
    const d = 2150 + warp - r; // metres inland from the nominal coast

    const hills = N.fbm(x * 0.0011 + 11, z * 0.0011 + 7, 5) * 0.5 + 0.5;
    let h = 10 + hills * hills * 70 + N.fbm(x * 0.005, z * 0.005, 3) * 5;

    const mN = smoothstep(-250, -1150, z);
    if (mN > 0) {
      // Broad eroded ridges rather than tall, tightly spaced noise spikes.
      const rg = N.ridged(x * 0.00065 + 2, z * 0.00065 - 4, 3);
      const shoulder = N.fbm(x * 0.0008 - 3, z * 0.0008 + 8, 3) * 0.5 + 0.5;
      h += mN * (rg * 240 + shoulder * 170 + 45 + N.fbm(x * 0.003, z * 0.003, 3) * 15);
    }
    const pk = Math.exp(-((x + 120) ** 2 + (z + 1380) ** 2) / (2 * 430 * 430));
    h += pk * 430;

    const dW = smoothstep(-560, -1080, x) * (1 - mN);
    if (dW > 0) {
      const m = N.fbm(x * 0.0024 + 7, z * 0.0024 - 3, 4) * 0.5 + 0.5;
      const mesa = smoothstep(0.55, 0.6, m) * 85 + smoothstep(0.68, 0.72, m) * 40;
      const dunes = Math.sin(x * 0.018 + z * 0.006 + N.n2(x * 0.003, z * 0.003) * 3) * 2.5;
      h = lerp(h, 16 + m * 14 + mesa + dunes, dW);
    }

    const inland = smoothstep(20, 380, d);
    h = lerp(2.4 + N.n2(x * 0.01, z * 0.01) * 1.1, h, inland);
    const land = smoothstep(-260, 60, d);
    const sea = SEA_FLOOR + 2 + N.fbm(x * 0.002, z * 0.002, 3) * 10;
    out.d = d; out.dW = dW; out.mN = mN;
    return lerp(sea, h, land);
  }

  zoneWeight(zone, x, z) {
    let dist;
    if (zone.shape === 'rect') {
      const dx = Math.abs(x - zone.x) - zone.hw, dz = Math.abs(z - zone.z) - zone.hd;
      dist = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
    } else {
      dist = Math.hypot(x - zone.x, z - zone.z) - zone.r;
    }
    if (dist <= 0) return 1;
    return 1 - smoothstep(0, zone.blend, dist);
  }

  heightFn(x, z, out = this._tmp) {
    let h = this.raw(x, z, out);
    for (const zone of this.zones) {
      const w = this.zoneWeight(zone, x, z);
      if (w <= 0) continue;
      h = zone.mode === 'add' ? h + zone.amount * w : lerp(h, zone.h, w);
    }
    return h;
  }

  // Find where the land meets the sea walking out from the centre on a bearing.
  _coast(angle, inland = 0) {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    let last = 0;
    for (let s = 200; s < 2700; s += 4) {
      if (this.raw(dx * s, dz * s) < 0.6) { last = s; break; }
    }
    const s = last - inland;
    return { x: dx * s, z: dz * s, angle };
  }

  _resolvePlaces() {
    const beach = this._coast(Math.atan2(1, 0.15), 38);
    PLACES.beach.x = beach.x; PLACES.beach.z = beach.z; PLACES.beach.angle = beach.angle;
    const light = this._coast(Math.atan2(0.85, 0.75), 30);
    PLACES.lighthouse.x = light.x; PLACES.lighthouse.z = light.z; PLACES.lighthouse.angle = light.angle;
    const reef = this._coast(Math.atan2(0.55, -0.85), -520);
    PLACES.vortex.x = reef.x; PLACES.vortex.z = reef.z;

    // Monolith: the highest point near the mountain's heart.
    let best = -1e9, bx = PLACES.peak.x, bz = PLACES.peak.z;
    for (let z = -1800; z <= -950; z += 20) for (let x = -560; x <= 320; x += 20) {
      const h = this.raw(x, z);
      if (h > best) { best = h; bx = x; bz = z; }
    }
    PLACES.peak.x = bx; PLACES.peak.z = bz; PLACES.peak.h = best;
  }

  _avgRaw(x, z, rad) {
    let s = 0, n = 0;
    for (let a = 0; a < 8; a++) { s += this.raw(x + Math.cos(a) * rad, z + Math.sin(a) * rad); n++; }
    return (s + this.raw(x, z) * 4) / (n + 4);
  }

  _defineZones() {
    const P = PLACES;
    const zones = this.zones;
    zones.push({ id: 'airbase', shape: 'rect', x: P.airbase.x, z: P.airbase.z, hw: 830, hd: 175, blend: 170, h: Math.max(8, this._avgRaw(P.airbase.x, P.airbase.z, 300)) });
    zones.push({ id: 'village', shape: 'circle', x: P.village.x, z: P.village.z, r: 235, blend: 170, h: Math.max(9, this._avgRaw(P.village.x, P.village.z, 150)) });
    zones.push({ id: 'farm', shape: 'rect', x: P.farm.x, z: P.farm.z, hw: 270, hd: 200, blend: 130, h: Math.max(8, this._avgRaw(P.farm.x, P.farm.z, 180)) });
    zones.push({ id: 'stones', shape: 'circle', x: P.stones.x, z: P.stones.z, r: 48, blend: 95, h: this._avgRaw(P.stones.x, P.stones.z, 40) + 16 });
    zones.push({ id: 'pyramid', shape: 'circle', x: P.pyramid.x, z: P.pyramid.z, r: 135, blend: 85, h: this._avgRaw(P.pyramid.x, P.pyramid.z, 100) });
    zones.push({ id: 'crash', shape: 'circle', x: P.crash.x, z: P.crash.z, r: 34, blend: 45, h: this._avgRaw(P.crash.x, P.crash.z, 30) - 2.5 });
    zones.push({ id: 'peak', shape: 'circle', x: P.peak.x, z: P.peak.z, r: 14, blend: 22, h: P.peak.h - 3 });
    zones.push({ id: 'lighthouse', shape: 'circle', x: P.lighthouse.x, z: P.lighthouse.z, r: 16, blend: 40, mode: 'add', amount: 9 });
    zones.push({ id: 'spaceport', shape: 'circle', x: P.spaceport.x, z: P.spaceport.z, r: 180, blend: 110, h: Math.max(9, this._avgRaw(P.spaceport.x, P.spaceport.z, 150)) });
    zones.push({ id: 'speedway', shape: 'rect', x: P.speedway.x, z: P.speedway.z, hw: 480, hd: 270, blend: 150, h: Math.max(9, this._avgRaw(P.speedway.x, P.speedway.z, 220)) });
    zones.push({ id: 'turbines', shape: 'rect', x: P.turbines.x, z: P.turbines.z, hw: 60, hd: 330, blend: 150, mode: 'add', amount: 28 });
    for (const z of zones) if (z.mode === 'add') z.h = 0;
  }

  zone(id) { return this.zones.find((z) => z.id === id); }

  // ---- Build --------------------------------------------------------------

  build() {
    const V = GRID + 1;
    const pos = new Float32Array(V * V * 3);
    const col = new Float32Array(V * V * 3);
    const H = this.heights;
    const extra = new Float32Array(V * V * 3); // d, dW, mN per vertex
    const o = { d: 0, dW: 0, mN: 0 };
    for (let iz = 0; iz < V; iz++) {
      for (let ix = 0; ix < V; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        const h = this.heightFn(x, z, o);
        const i = iz * V + ix;
        H[i] = h;
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        extra[i * 3] = o.d; extra[i * 3 + 1] = o.dW; extra[i * 3 + 2] = o.mN;
      }
    }
    this.extra = extra;

    const idx = new Uint32Array(GRID * GRID * 6);
    let k = 0;
    for (let iz = 0; iz < GRID; iz++) {
      for (let ix = 0; ix < GRID; ix++) {
        const a = iz * V + ix, b = (iz + 1) * V + ix, c = (iz + 1) * V + ix + 1, d = iz * V + ix + 1;
        idx[k++] = a; idx[k++] = b; idx[k++] = d;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const nrm = geo.attributes.normal.array;
    const splat = new Float32Array(V * V * 3);
    const N = this.noise;
    const c = new THREE.Color();
    const t = new THREE.Color();
    const farm = this.zone('farm'), airbase = this.zone('airbase'), village = this.zone('village');
    const crash = this.zone('crash'), pyramid = this.zone('pyramid'), spaceport = this.zone('spaceport');
    for (let i = 0; i < V * V; i++) {
      const x = pos[i * 3], h = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const ny = nrm[i * 3 + 1];
      const d = extra[i * 3], dW = extra[i * 3 + 1], mN = extra[i * 3 + 2];
      const n1 = N.n2(x * 0.004, z * 0.004), n2 = N.n2(x * 0.03 + 9, z * 0.03 - 4);

      // Lowland grass with drier patches.
      c.copy(C.grassA).lerp(C.grassB, 0.5 + 0.5 * n1);
      c.lerp(C.dry, smoothstep(0.15, 0.8, n2 * 0.5 + 0.5) * 0.35);
      const forestish = smoothstep(0.1, 0.45, N.n2(x * 0.0021 + 40, z * 0.0021 - 12));
      c.lerp(C.forest, forestish * 0.45);
      // Alpine meadow into rock with height.
      c.lerp(C.alpine, smoothstep(180, 360, h) * 0.8);
      // Desert with striped mesa walls.
      if (dW > 0.01) {
        t.copy(C.desert).lerp(C.desertLight, 0.5 + 0.5 * n2);
        const strata = Math.sin(h * 0.33 + n1 * 2) * 0.5 + 0.5;
        const wall = smoothstep(0.93, 0.7, ny);
        const band = strata < 0.33 ? C.strataA : strata < 0.66 ? C.strataB : C.strataC;
        t.lerp(band, wall);
        c.lerp(t, dW);
      }
      // Zones.
      c.lerp(C.airfield, this.zoneWeight(airbase, x, z) * 0.85);
      c.lerp(C.village, this.zoneWeight(village, x, z) * 0.5);
      c.lerp(C.dry, this.zoneWeight(spaceport, x, z) * 0.55);
      const wf = this.zoneWeight(farm, x, z);
      if (wf > 0) {
        const fx = Math.floor((x - farm.x + 400) / 78), fz = Math.floor((z - farm.z + 400) / 58);
        const f = Math.abs(Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453) % 1;
        const fieldCol = f < 0.4 ? C.wheat : f < 0.68 ? C.crop : f < 0.86 ? C.plowed : C.lavender;
        c.lerp(fieldCol, smoothstep(0.35, 0.9, wf) * 0.92);
      }
      c.lerp(C.scorched, this.zoneWeight(crash, x, z) * 0.75);
      c.lerp(C.desertLight, this.zoneWeight(pyramid, x, z) * 0.6);
      // Rock on steep ground.
      const steep = smoothstep(0.86, 0.66, ny);
      t.copy(C.rock).lerp(C.rockDark, 0.5 + 0.5 * n2);
      c.lerp(t, steep * (dW > 0.5 ? 0.25 : 0.9));
      // Snow on high, gentle slopes.
      const snowLine = 470 + n1 * 45;
      c.lerp(C.snow, smoothstep(snowLine, snowLine + 60, h) * smoothstep(0.55, 0.75, ny) * mN);
      // Beaches and sea bed.
      const beach = 1 - smoothstep(2.6 + n2 * 0.8, 5.5 + n2, h);
      if (beach > 0 && d < 520) c.lerp(dW > 0.4 ? C.desertLight : C.sand, beach);
      if (h < 0.4) c.copy(C.wetSand).lerp(C.seabed, smoothstep(0.4, -10, h));

      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      // Surface type weights for the detail textures: grass, rock, sand.
      const sRock = Math.max(steep, smoothstep(300, 460, h) * mN * 0.8, dW > 0.01 ? smoothstep(0.93, 0.7, ny) * dW : 0);
      const sSand = Math.max(dW * 0.9, (beach > 0 && d < 520) ? beach : 0, h < 0.4 ? 1 : 0, this.zoneWeight(pyramid, x, z) * 0.8) * (1 - sRock * 0.6);
      splat[i * 3] = Math.max(0, 1 - sRock - sSand); splat[i * 3 + 1] = sRock; splat[i * 3 + 2] = sSand;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 3));
    geo.computeBoundingSphere();

    const G = groundDetail();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: G.detail };
      shader.uniforms.uDetailN = { value: G.normal };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying vec3 vSplat;\nattribute vec3 splat;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);\nvSplat = splat;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos;
          varying vec3 vWNrm;
          varying vec3 vSplat;
          uniform sampler2D uDetail, uDetailN;
          float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float camD = length(vWPos - cameraPosition);
          float near = 1.0 - smoothstep(60.0, 420.0, camD);
          // Tri-planar-ish sampling: ground plane for grass/sand, the steeper
          // wall projection for rock so cliffs are not smeared.
          vec3 an = abs(normalize(vWNrm));
          vec2 wallUV = an.x > an.z ? vWPos.zy : vWPos.xy;
          vec3 dFlat = texture2D(uDetail, vWPos.xz * 0.16).rgb;
          vec3 dFar = texture2D(uDetail, vWPos.xz * 0.019).rgb;
          float rockT = mix(texture2D(uDetail, vWPos.xz * 0.08).g, texture2D(uDetail, wallUV * 0.08).g, smoothstep(0.75, 0.45, an.y));
          vec3 w = vSplat / max(vSplat.r + vSplat.g + vSplat.b, 0.001);
          float dNear = dot(w, vec3(dFlat.r, rockT, dFlat.b));
          float dMid = dot(w, dFar);
          float detail = mix(0.5, dNear, near) * 0.65 + dMid * 0.35;
          float mid = tn(vWPos.xz * 0.11);
          float broad = tn(vWPos.xz * 0.013);
          diffuseColor.rgb *= 0.55 + detail * 0.9 + 0.1 * mid + 0.08 * broad - 0.09;
          // Grass blades pick up a little yellow-green variation up close.
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.06, 0.8), w.r * near * smoothstep(0.45, 0.7, dFlat.r) * 0.6);
          // Wet darkening at the waterline.
          diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(-0.2, 1.4, vWPos.y));`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 dn = texture2D(uDetailN, vWPos.xz * 0.16).xyz * 2.0 - 1.0;
            vec3 dr = texture2D(uDetailN, wallUV * 0.08).xyz * 2.0 - 1.0;
            vec3 pert = vec3(dn.x, 0.0, -dn.y) * (0.55 * w.r + 0.3 * w.b) + vec3(dr.x, dr.y, dr.x) * 0.6 * w.g;
            vec3 nw = normalize(vWNrm + pert * near);
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.55, (1.0 - smoothstep(-0.2, 0.9, vWPos.y)) * 0.8);`);
    };
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    return this.mesh;
  }

  // ---- Queries --------------------------------------------------------------

  heightAt(x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return SEA_FLOOR;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const V = GRID + 1, H = this.heights;
    const ha = H[iz * V + ix], hb = H[(iz + 1) * V + ix], hc = H[(iz + 1) * V + ix + 1], hd = H[iz * V + ix + 1];
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }

  // Classify a point for vegetation and HUD labels.
  biomeAt(x, z) {
    const o = this._tmp;
    this.raw(x, z, o);
    return { desert: o.dW, mountain: o.mN, coast: o.d };
  }

  regionName(x, z, y = 0) {
    if (y > 3000) return 'Upper Atmosphere';
    const P = PLACES;
    const near = (p, r) => Math.hypot(x - p.x, z - p.z) < r;
    if (near(P.airbase, 0) || (Math.abs(x - P.airbase.x) < 900 && Math.abs(z - P.airbase.z) < 240)) return P.airbase.name;
    if (near(P.village, 330)) return P.village.name;
    if (near(P.spaceport, 300)) return P.spaceport.name;
    if (Math.abs(x - P.speedway.x) < 520 && Math.abs(z - P.speedway.z) < 290) return P.speedway.name;
    if (near(P.farm, 380)) return P.farm.name;
    if (near(P.stones, 160)) return P.stones.name;
    if (near(P.crash, 220)) return P.crash.name;
    if (near(P.lighthouse, 240)) return P.lighthouse.name;
    if (near(P.beach, 320)) return P.beach.name;
    if (near(P.vortex, 600)) return P.vortex.name;
    if (near(P.turbines, 420)) return P.turbines.name;
    const h = this.heightAt(x, z);
    if (h < -0.5) return 'Open Ocean';
    const b = this.biomeAt(x, z);
    if (b.desert > 0.5) return 'Red Mesa Desert';
    if (b.mountain > 0.5) return h > 380 ? 'Mount Kestrel' : 'Northern Range';
    return 'Kestrel Island';
  }

  // Top-down painted map for the minimap and the full map screen.
  paintMap(size = 512) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const V = GRID + 1;
    const col = this.mesh.geometry.attributes.color.array;
    const light = new THREE.Vector3(-0.6, 0.7, -0.4).normalize();
    const n = new THREE.Vector3();
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -HALF + (px + 0.5) / size * MAP_SIZE, z = -HALF + (py + 0.5) / size * MAP_SIZE;
        const h = this.heightAt(x, z);
        const i = (py * size + px) * 4;
        if (h < 0) {
          const deep = smoothstep(0, -30, h);
          img.data[i] = lerp(64, 14, deep); img.data[i + 1] = lerp(170, 50, deep); img.data[i + 2] = lerp(190, 92, deep);
        } else {
          const gx = clamp(Math.round((x + HALF) / CELL), 0, GRID), gz = clamp(Math.round((z + HALF) / CELL), 0, GRID);
          const vi = gz * V + gx;
          this.normalAt(x, z, n);
          const shade = 0.55 + 0.75 * Math.max(0, n.dot(light));
          const lin = (v) => Math.pow(v, 1 / 2.2) * 255;
          img.data[i] = clamp(lin(col[vi * 3]) * shade, 0, 255);
          img.data[i + 1] = clamp(lin(col[vi * 3 + 1]) * shade, 0, 255);
          img.data[i + 2] = clamp(lin(col[vi * 3 + 2]) * shade, 0, 255);
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapCanvas = c;
    return c;
  }

  // Height texture for the ocean shader (shallows, foam). R8: h in [-24, 6].
  heightTexture(size = 512) {
    const data = new Uint8Array(size * size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = -HALF + (px + 0.5) / size * MAP_SIZE, z = -HALF + (py + 0.5) / size * MAP_SIZE;
      const h = this.heightAt(x, z);
      data[py * size + px] = clamp(Math.round((h + 24) / 30 * 255), 0, 255);
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }
}
