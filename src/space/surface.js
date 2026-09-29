// Landable worlds: a 6 km patch of the Moon (cratered highlands and a dark
// mare, harsh sunlight with pitch-black shadows, the Earth hanging in a black
// star-filled sky, a lunar module with its flag, and a monolith in a crater)
// and of Mars (inside the rim of Jezero crater: dunes, layered buttes, a dry
// river canyon, butterscotch sky with a blue-white sun halo, the Ares Station
// habitat, a working rover and the Ares Beacon). Each exposes the same world
// API as the island (terrain, structures, vegetation, groundAt, gravity), so
// people and spacecraft simply walk and fly there with local gravity.

import * as THREE from 'three';
import { Noise, mulberry32 } from '../core/noise.js';
import { groundDetail } from '../core/textures.js';
import { createEarth } from './globe.js';
import { createStarDome } from './bodies.js';
import { glowSprite, canvasTexture, stdMat, smoothstep, clamp, lerp } from '../core/util.js';

const SIZE = 6000, GRID = 192, HALF = SIZE / 2, CELL = SIZE / GRID;
const V = GRID + 1;

const CFG = {
  moon: {
    name: 'The Moon', gravity: 0.165, air: 0, seed: 71, rockiness: 0.15, detail: 0.55,
    sun: new THREE.Vector3(0.62, 0.3, 0.42).normalize(), sunColor: 0xffffff, sunI: 4.2,
    region: 'Mare Serenitatis',
  },
  mars: {
    name: 'Mars', gravity: 0.38, air: 0.02, seed: 97, rockiness: 0.5, detail: 1,
    sun: new THREE.Vector3(-0.45, 0.52, 0.5).normalize(), sunColor: 0xfff0dc, sunI: 2.8,
    region: 'Jezero Crater',
  },
};

// ---- Helpers --------------------------------------------------------------------

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent; m.receiveShadow = true;
  parent.add(m);
  return m;
}

function foilTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry32(5);
    ctx.fillStyle = '#b8862e'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h, s = 4 + rnd() * 18;
      const v = rnd();
      ctx.fillStyle = v < 0.5 ? `rgba(255,220,130,${rnd() * 0.5})` : `rgba(90,55,10,${rnd() * 0.5})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + rnd() * s * 0.5); ctx.lineTo(x + rnd() * s * 0.5, y + s); ctx.fill();
    }
  }, { repeat: true });
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const n = new Noise(seed);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    let k = map.get(key);
    if (k === undefined) { k = 1 + n.n2(x * 1.7 + z, y * 1.7 - z) * 0.28 + n.n2(x * 4 + 3, z * 4 - y) * 0.08; map.set(key, k); }
    p.setXYZ(i, x * k * 1.2, Math.max(y * k * 0.7, -0.25), z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---- Surface world ------------------------------------------------------------------

export class SurfaceWorld {
  constructor(body, renderer, { shadows = true, shadowSize = 2048 } = {}) {
    this.body = body;
    const cfg = this.cfg = CFG[body];
    this.name = cfg.name;
    this.scene = new THREE.Scene();
    this.noise = new Noise(cfg.seed);
    this.rnd = mulberry32(cfg.seed * 3);
    this.heights = new Float32Array(V * V);
    this.colliders = [];
    this.platforms = [];
    this.sites = {};
    this.anim = [];
    this.sunDir = cfg.sun.clone();
    this.landing = new THREE.Vector3(0, 0, 0);
    this._features();
    this._buildTerrain();
    this._sky(renderer);
    this._lights(shadows, shadowSize);
    if (body === 'moon') this._moonProps(); else this._marsProps();
    this._rocks();
    this._env(renderer);
    const self = this;
    this.world = {
      terrain: {
        heightAt: (x, z) => self.heightAt(x, z), normalAt: (x, z, o) => self.normalAt(x, z, o),
        biomeAt: () => ({ desert: 0, mountain: 0, coast: 9999 }), regionName: (x, z) => self.regionName(x, z),
        mapCanvas: null, mapSize: SIZE, zones: [],
      },
      structures: {
        platformAt: (x, z) => self.platformAt(x, z), collide: (p, r, y) => self.collide(p, r, y),
        isBlocked: () => false, groundAt: (x, z) => self.groundAt(x, z), addBox: () => {},
      },
      vegetation: { near() {} },
      groundAt: (x, z) => self.groundAt(x, z),
      night: 0,
      farFromPlayers: () => false,
      gravity: cfg.gravity, air: cfg.air, limit: HALF - 150,
    };
    this.world.terrain.mapCanvas = this._paintMap(512);
  }

  // ---- Height model -------------------------------------------------------------

  _features() {
    const rnd = this.rnd;
    this.craters = [];
    const moon = this.body === 'moon';
    const n = moon ? 170 : 45;
    for (let i = 0; i < n; i++) {
      const r = moon ? 6 + Math.pow(rnd(), 3.2) * 420 : 5 + Math.pow(rnd(), 3) * 160;
      const x = (rnd() - 0.5) * SIZE * 1.05, z = (rnd() - 0.5) * SIZE * 1.05;
      if (Math.hypot(x, z) < r * 1.6 + 140) continue; // keep the landing site clear
      this.craters.push({ x, z, r, fresh: rnd() });
    }
    if (moon) {
      this.monolithAt = new THREE.Vector3(-300, 0, -420);
      this.craters.push({ x: this.monolithAt.x, z: this.monolithAt.z, r: 75, fresh: 0.9 });
    } else {
      // Dry river canyon winding in from the crater rim to the beacon.
      this.canyon = [[2400, -2000], [1500, -1400], [900, -950], [520, -600], [300, -420], [-100, -300], [-900, -500]];
      this.beaconAt = new THREE.Vector3(470, 0, -640);
    }
  }

  raw(x, z) {
    const N = this.noise;
    const moon = this.body === 'moon';
    let h;
    if (moon) {
      h = 40 + N.fbm(x * 0.0005, z * 0.0005, 5) * 55 + N.fbm(x * 0.004 + 9, z * 0.004, 3) * 3.5;
      // A dark, smoother mare plain to the north-east.
      const mare = smoothstep(0.05, 0.35, N.fbm(x * 0.00025 + 4, z * 0.00025 - 2, 3));
      h = lerp(h, 22 + N.fbm(x * 0.002, z * 0.002, 2) * 3, mare * 0.8);
    } else {
      h = 60 + N.fbm(x * 0.00045, z * 0.00045, 5) * 45 + N.fbm(x * 0.003 + 3, z * 0.003, 3) * 5;
      // Jezero's rim mountains all around the horizon.
      const rr = Math.hypot(x, z);
      h += smoothstep(1700, 2900, rr) * (140 + N.ridged(x * 0.0012, z * 0.0012, 5) * 260);
      // Layered buttes.
      const m = N.fbm(x * 0.0014 + 7, z * 0.0014 - 5, 3) * 0.5 + 0.5;
      h += smoothstep(0.64, 0.68, m) * 35 + smoothstep(0.74, 0.77, m) * 20;
      // Dunes.
      h += Math.sin(x * 0.03 + z * 0.012 + N.n2(x * 0.004, z * 0.004) * 3) * 1.2 * smoothstep(0.1, 0.5, N.n2(x * 0.0008, z * 0.0008 + 3));
      // Canyon.
      let dmin = 1e9;
      const c = this.canyon;
      for (let i = 1; i < c.length; i++) {
        const [ax, az] = c[i - 1], [bx, bz] = c[i];
        const vx = bx - ax, vz = bz - az;
        const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
        dmin = Math.min(dmin, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
      }
      h -= (1 - smoothstep(18, 70, dmin + N.n2(x * 0.01, z * 0.01) * 12)) * 26;
    }
    // Craters: bowl, raised rim, ejecta blanket, central peak in the big ones.
    for (const c of this.craters) {
      const dx = x - c.x, dz = z - c.z;
      if (Math.abs(dx) > c.r * 2.4 || Math.abs(dz) > c.r * 2.4) continue;
      const d = Math.hypot(dx, dz) / c.r;
      if (d > 2.4) continue;
      const depth = c.r * (c.r < 60 ? 0.2 : 0.12);
      const rim = depth * 0.38;
      if (d < 1) h -= depth * (1 - d * d);
      h += rim * Math.exp(-(((d - 1) / 0.22) ** 2));
      if (d > 1) h += rim * 0.35 * Math.exp(-(d - 1) * 2.4);
      if (c.r > 250) h += depth * 0.45 * Math.exp(-((d / 0.16) ** 2));
    }
    return h;
  }

  _buildTerrain() {
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    const H = this.heights;
    // The landing site is levelled; the edges settle to a common height for the horizon skirt.
    const siteH = this.raw(0, 0);
    this.edgeH = this.body === 'moon' ? 35 : 150;
    for (let iz = 0; iz < V; iz++) for (let ix = 0; ix < V; ix++) {
      const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
      let h = this.raw(x, z);
      h = lerp(h, siteH, 1 - smoothstep(60, 190, Math.hypot(x, z)));
      h = lerp(h, this.edgeH, smoothstep(HALF - 500, HALF - 30, Math.max(Math.abs(x), Math.abs(z))));
      const i = iz * V + ix;
      H[i] = h;
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
    }
    const idx = new Uint32Array(GRID * GRID * 6);
    let k = 0;
    for (let iz = 0; iz < GRID; iz++) for (let ix = 0; ix < GRID; ix++) {
      const a = iz * V + ix, b = (iz + 1) * V + ix, c = (iz + 1) * V + ix + 1, d = iz * V + ix + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = d; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal.array;
    const N = this.noise, moon = this.body === 'moon';
    const c = new THREE.Color();
    for (let i = 0; i < V * V; i++) {
      const x = pos[i * 3], h = pos[i * 3 + 1], z = pos[i * 3 + 2], ny = nrm[i * 3 + 1];
      const n1 = N.n2(x * 0.003, z * 0.003), n2 = N.n2(x * 0.02 + 5, z * 0.02);
      if (moon) {
        const mare = smoothstep(0.05, 0.35, N.fbm(x * 0.00025 + 4, z * 0.00025 - 2, 3));
        let a = lerp(0.15, 0.075, mare * 0.9) * (0.9 + n1 * 0.08 + n2 * 0.05);
        // Bright ejecta around fresh craters.
        for (const cr of this.craters) {
          if (cr.fresh < 0.7) continue;
          const d = Math.hypot(x - cr.x, z - cr.z) / cr.r;
          if (d < 3) a += 0.05 * Math.exp(-Math.max(0, d - 0.9) * 1.6) * (cr.fresh - 0.7) * 3;
        }
        a *= lerp(1, 0.85, smoothstep(0.9, 0.7, ny));
        c.setRGB(a * 1.02, a, a * 0.96);
      } else {
        const dust = smoothstep(-0.2, 0.5, n1);
        c.setRGB(0.36, 0.12, 0.045).lerp(new THREE.Color(0.5, 0.22, 0.1), dust * 0.6);
        c.lerp(new THREE.Color(0.14, 0.07, 0.04), smoothstep(0.2, 0.6, n2) * 0.35);          // basalt sand
        const band = Math.sin(h * 0.45 + n1 * 2) * 0.5 + 0.5;                                   // layered rock
        c.lerp(band > 0.5 ? new THREE.Color(0.48, 0.24, 0.13) : new THREE.Color(0.3, 0.13, 0.07), smoothstep(0.9, 0.65, ny) * 0.8);
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const G = groundDetail();
    const rockiness = this.cfg.rockiness;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: moon ? 1 : 0.95, metalness: 0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: G.detail };
      shader.uniforms.uDetailN = { value: G.normal };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform sampler2D uDetail, uDetailN;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float camD = length(vWPos - cameraPosition);
          float nearF = 1.0 - smoothstep(50.0, 520.0, camD);
          vec3 d1 = texture2D(uDetail, vWPos.xz * 0.13).rgb;
          vec3 d2 = texture2D(uDetail, vWPos.xz * 0.019).rgb;
          vec3 d3 = texture2D(uDetail, vWPos.xz * 0.0031).rgb;
          float det = mix(0.5, mix(d1.b, d1.g, ${rockiness.toFixed(2)}), nearF) * 0.5 + mix(d2.b, d2.g, ${rockiness.toFixed(2)}) * 0.3 + d3.g * 0.2;
          diffuseColor.rgb *= 1.0 + (det - 0.5) * ${this.cfg.detail.toFixed(2)};`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 dn = texture2D(uDetailN, vWPos.xz * 0.13).xyz * 2.0 - 1.0;
            vec3 dm = texture2D(uDetailN, vWPos.xz * 0.019).xyz * 2.0 - 1.0;
            vec3 nw = normalize(vWNrm + (vec3(dn.x, 0.0, -dn.y) * 0.6 * nearF + vec3(dm.x, 0.0, -dm.y) * 0.35));
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          }`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);
    // Horizon skirt: a vast ring that curves away below the horizon.
    const ring = new THREE.RingGeometry(HALF * 0.97, 42000, 96, 12);
    ring.rotateX(-Math.PI / 2);
    const rp = ring.attributes.position;
    const rc = new Float32Array(rp.count * 3);
    for (let i = 0; i < rp.count; i++) {
      const r = Math.hypot(rp.getX(i), rp.getZ(i));
      rp.setY(i, this.edgeH - 2 - Math.pow(Math.max(0, r - HALF), 2) / 90000 + this.noise.fbm(rp.getX(i) * 0.0004, rp.getZ(i) * 0.0004, 3) * smoothstep(HALF * 1.6, HALF * 3.5, r) * 220);
      rc[i * 3] = col[0]; rc[i * 3 + 1] = col[1]; rc[i * 3 + 2] = col[2];
    }
    ring.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    ring.computeVertexNormals();
    const skirt = new THREE.Mesh(ring, mat);
    skirt.receiveShadow = true;
    this.scene.add(skirt);
  }

  heightAt(x, z) {
    const gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return this.edgeH;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const H = this.heights;
    const ha = H[iz * V + ix], hb = H[(iz + 1) * V + ix], hc = H[(iz + 1) * V + ix + 1], hd = H[iz * V + ix + 1];
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 2;
    return out.set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e)).normalize();
  }

  platformAt(x, z) {
    let best = -Infinity;
    for (const p of this.platforms) if (Math.abs(x - p.x) <= p.hw && Math.abs(z - p.z) <= p.hd && p.y > best) best = p.y;
    return best;
  }

  groundAt(x, z) { return Math.max(this.heightAt(x, z), this.platformAt(x, z)); }

  addBox(x, z, hw, hd, top) { this.colliders.push({ x, z, hw, hd, top }); }

  collide(pos, r, y = -Infinity) {
    let hit = false;
    for (const b of this.colliders) {
      if (y > b.top) continue;
      const dx = pos.x - b.x, dz = pos.z - b.z;
      const ox = b.hw + r - Math.abs(dx), oz = b.hd + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        hit = true;
        if (ox < oz) pos.x = b.x + Math.sign(dx || 1) * (b.hw + r); else pos.z = b.z + Math.sign(dz || 1) * (b.hd + r);
      }
    }
    return hit;
  }

  regionName(x, z) {
    if (this.body === 'moon') {
      if (Math.hypot(x - this.monolithAt.x, z - this.monolithAt.z) < 220) return 'Monolith Crater';
      if (Math.hypot(x - 70, z + 40) < 120) return 'Kestrel-1 Landing Site';
      return this.cfg.region;
    }
    if (Math.hypot(x - this.beaconAt.x, z - this.beaconAt.z) < 260) return 'Ares Vallis';
    if (Math.hypot(x - 160, z - 130) < 160) return 'Ares Station';
    if (Math.hypot(x, z) > 1800) return 'Jezero Crater Rim';
    return this.cfg.region;
  }

  // ---- Sky and light --------------------------------------------------------------

  _sky(renderer) {
    const S = this.scene;
    if (this.body === 'moon') {
      S.background = new THREE.Color(0x000000);
      this.stars = createStarDome(38000, 2.6);
      S.add(this.stars);
      // The Earth, lit by the same sun: it shows a phase.
      this.earth = createEarth(520, renderer, { segments: 64 });
      this.earthDir = new THREE.Vector3(-0.3, 0.42, -0.86).normalize();
      this.earth.group.position.copy(this.earthDir).multiplyScalar(16000);
      this.earth.group.rotation.y = 2.4;
      this.earth.setSun(this.sunDir);
      S.add(this.earth.group);
    } else {
      S.background = new THREE.Color(0xb88a64);
      S.fog = new THREE.FogExp2(0xb48866, 0.00016);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uSun: { value: this.sunDir } },
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */`
          uniform vec3 uSun; varying vec3 vDir;
          void main(){
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 zen = vec3(0.16, 0.1, 0.07), hor = vec3(0.72, 0.5, 0.34);
            vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
            col = mix(col, vec3(0.5, 0.34, 0.24), smoothstep(0.0, -0.2, h));
            float s = max(dot(d, normalize(uSun)), 0.0);
            // Fine dust scatters red, but forward-scatters blue around the sun.
            col += vec3(0.45, 0.6, 0.85) * pow(s, 18.0) * 0.55 + vec3(1.0, 0.97, 0.92) * pow(s, 1200.0) * 30.0;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      this.stars = new THREE.Mesh(new THREE.SphereGeometry(38000, 32, 16), mat);
      this.stars.renderOrder = -10;
      S.add(this.stars);
      // Phobos crossing the sky.
      this.phobos = glowSprite(0x9a8a7a, 180, 0.8);
      this.phobos.material.blending = THREE.NormalBlending;
      S.add(this.phobos);
    }
    this.sunSprite = glowSprite(this.body === 'moon' ? 0xffffff : 0xe8f0ff, this.body === 'moon' ? 1400 : 900, 1);
    this.sunSprite.material.fog = false;
    this.sunSprite.position.copy(this.sunDir).multiplyScalar(30000);
    S.add(this.sunSprite);
  }

  _lights(shadows, size) {
    const L = this.sun = new THREE.DirectionalLight(this.cfg.sunColor, this.cfg.sunI);
    L.castShadow = shadows;
    L.shadow.mapSize.set(size, size);
    const sc = L.shadow.camera;
    sc.left = sc.bottom = -150; sc.right = sc.top = 150; sc.near = 1; sc.far = 1600;
    L.shadow.bias = -0.0004; L.shadow.normalBias = 0.04;
    this.scene.add(L, L.target);
    if (this.body === 'moon') this.scene.add(new THREE.AmbientLight(0x8fa8d8, 0.05));
    else this.scene.add(new THREE.HemisphereLight(0xd8a57c, 0x6a3a22, 0.55));
  }

  _env(renderer) {
    // Reflections for metal and foil: a simple sky/ground gradient.
    const env = new THREE.Scene();
    const moon = this.body === 'moon';
    const g = new THREE.SphereGeometry(10, 32, 16);
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i) / 10;
      const col = moon ? (y > 0 ? [0.01, 0.01, 0.015] : [0.25, 0.25, 0.24]) : (y > 0 ? [0.7, 0.48, 0.33] : [0.45, 0.2, 0.1]);
      c.set(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    env.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(env, 0, 0.1, 100).texture;
    pm.dispose();
  }

  // ---- Props ------------------------------------------------------------------------

  _place(obj, x, z, lift = 0) {
    obj.position.set(x, this.heightAt(x, z) + lift, z);
    this.scene.add(obj);
    return obj;
  }

  _moonProps() {
    // Kestrel-1 lunar module.
    const lm = new THREE.Group();
    const foil = new THREE.MeshStandardMaterial({ map: foilTexture(), color: 0xffd27a, metalness: 1, roughness: 0.32 });
    const silver = stdMat(0xc9ccd0, { rough: 0.35, metal: 0.8 });
    const grey = stdMat(0x8e9094, { rough: 0.6, metal: 0.3 });
    const dark = stdMat(0x1c1d20, { rough: 0.5, metal: 0.4 });
    add(lm, new THREE.CylinderGeometry(2.1, 2.1, 1.7, 8), foil, 0, 1.9, 0, 0, Math.PI / 8, 0);
    const bell = new THREE.CylinderGeometry(0.35, 0.75, 0.9, 16, 1, true);
    add(lm, bell, dark, 0, 0.75, 0);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const top = new THREE.Vector3(Math.cos(a) * 1.9, 2.4, Math.sin(a) * 1.9), foot = new THREE.Vector3(Math.cos(a) * 3.6, 0.12, Math.sin(a) * 3.6);
      const len = top.distanceTo(foot);
      const strut = new THREE.CylinderGeometry(0.09, 0.09, len, 8);
      const m = add(lm, strut, foil, (top.x + foot.x) / 2, (top.y + foot.y) / 2, (top.z + foot.z) / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      add(lm, new THREE.CylinderGeometry(0.45, 0.5, 0.12, 16), silver, foot.x, 0.06, foot.z);
      if (k === 0) for (let r = 0; r < 7; r++) add(lm, new THREE.BoxGeometry(0.7, 0.05, 0.08), silver, top.x * 0.8 + (foot.x - top.x) * (r / 7) * 0.8, 2.2 - r * 0.3, top.z * 0.8 + (foot.z - top.z) * (r / 7) * 0.8, 0, -a, 0);
    }
    // Ascent stage: faceted cabin, windows, antennas, RCS quads.
    add(lm, new THREE.CylinderGeometry(1.5, 1.7, 2.2, 6), grey, 0, 3.9, 0);
    add(lm, new THREE.BoxGeometry(1.6, 1.1, 1.2), silver, 0, 4.0, 1.25);
    add(lm, new THREE.BoxGeometry(0.4, 0.5, 0.05), stdMat(0x0a0f14, { rough: 0.05, metal: 0.9 }), 0.4, 4.2, 1.86, 0, 0, 0.2);
    add(lm, new THREE.BoxGeometry(0.4, 0.5, 0.05), stdMat(0x0a0f14, { rough: 0.05, metal: 0.9 }), -0.4, 4.2, 1.86, 0, 0, -0.2);
    const dish = new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, 0.9); dish.rotateX(-0.6);
    add(lm, dish, silver, -1.2, 5.6, -0.6);
    add(lm, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), silver, -1.2, 5.0, -0.6);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; add(lm, new THREE.BoxGeometry(0.3, 0.3, 0.3), dark, Math.cos(a) * 1.8, 4.6, Math.sin(a) * 1.8); }
    lm.rotation.y = 0.5;
    this._place(lm, 70, -40);
    this.addBox(70, -40, 2.4, 2.4, lm.position.y + 5.5);
    // Flag on a pole with a horizontal rod.
    const flagTex = canvasTexture(256, 160, (ctx, w, h) => {
      ctx.fillStyle = '#1d3e7a'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0, h * 0.38, w, h * 0.24);
      ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.2, 0, Math.PI * 2); ctx.fill();
    });
    const flag = new THREE.Group();
    add(flag, new THREE.CylinderGeometry(0.03, 0.03, 2.6, 8), silver, 0, 1.3, 0);
    add(flag, new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), silver, 0.7, 2.55, 0, 0, 0, Math.PI / 2);
    const fg = new THREE.PlaneGeometry(1.4, 0.9, 12, 4);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 5) * 0.04 + fp.getY(i) * 0.02);
    fg.computeVertexNormals();
    add(flag, fg, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }), 0.7, 2.1, 0);
    flag.rotation.y = -0.4;
    this._place(flag, 58, -26);
    // Science package: seismometer and a laser retro-reflector.
    const sci = new THREE.Group();
    add(sci, new THREE.BoxGeometry(0.6, 0.4, 0.6), foil, 0, 0.2, 0);
    add(sci, new THREE.BoxGeometry(1.8, 0.03, 0.7), stdMat(0x1a2a4a, { rough: 0.3, metal: 0.6 }), 1.3, 0.35, 0);
    add(sci, new THREE.BoxGeometry(0.7, 0.05, 0.5), dark, -1.2, 0.4, 0.4, -0.5, 0, 0);
    this._place(sci, 88, -12);
    // The monolith in its crater: TMA proportions 1:4:9.
    const M = this.monolithAt;
    const mono = new THREE.Group();
    add(mono, new THREE.BoxGeometry(5.4, 12.15, 1.35), new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.04, metalness: 0.75 }), 0, 6.07, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 7, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.y = 0.3; mono.add(ring);
    mono.rotation.y = 0.7;
    this._place(mono, M.x, M.z, -0.5);
    M.y = mono.position.y;
    this.addBox(M.x, M.z, 3, 3, M.y + 12);
    this.sites.moon = { pos: M.clone().setY(M.y + 5), radius: 45 };
    this.anim.push((dt, t) => { ring.material.opacity = 0.15 + 0.25 * (Math.sin(t * 2.2) * 0.5 + 0.5); ring.scale.setScalar(1 + (t * 0.3 % 1) * 0.8); });
  }

  _marsProps() {
    const white = stdMat(0xe9e6e0, { rough: 0.55, metal: 0.1 });
    const metal = stdMat(0x8a8d90, { rough: 0.35, metal: 0.85 });
    const dark = stdMat(0x1c1d20, { rough: 0.5, metal: 0.4 });
    const panel = new THREE.MeshStandardMaterial({ color: 0x1b2d4c, metalness: 0.6, roughness: 0.3 });
    // ---- Ares Station habitat ----
    const S = new THREE.Group();
    const winTex = canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#e9e6e0'; ctx.fillRect(0, 0, w, h);
      for (let x = 10; x < w; x += 42) { ctx.fillStyle = '#1b2530'; ctx.fillRect(x, 50, 26, 26); ctx.fillStyle = '#ffd89a'; ctx.globalAlpha = 0.25; ctx.fillRect(x + 2, 52, 22, 22); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#c8302a'; ctx.fillRect(0, 100, w, 6);
    }, { repeat: true });
    winTex.repeat.set(3, 1);
    const domeMat = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.5, metalness: 0.1, emissive: 0xffd89a, emissiveMap: winTex, emissiveIntensity: 0.2 });
    const domes = [[0, 0, 9], [22, 6, 6.5], [-18, 10, 6.5], [4, -20, 5.5]];
    const gy = this.heightAt(160, 130);
    for (const [x, z, r] of domes) {
      add(S, new THREE.CylinderGeometry(r, r, 2.4, 32, 1, true), domeMat, x, 1.2, z);
      add(S, new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, x, 2.4, z);
      this.addBox(160 + x, 130 + z, r * 0.75, r * 0.75, gy + r + 3);
    }
    const green = new THREE.MeshStandardMaterial({ color: 0x9fd8a8, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2, emissive: 0x3aa050, emissiveIntensity: 0.25 });
    add(S, new THREE.SphereGeometry(5.5, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), green, 4, 0.2, -20);
    for (const [a, b] of [[0, 1], [0, 2], [0, 3]]) {
      const [x1, z1] = domes[a], [x2, z2] = domes[b];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const tube = add(S, new THREE.CylinderGeometry(1.4, 1.4, len, 16).rotateZ(Math.PI / 2), white, (x1 + x2) / 2, 1.4, (z1 + z2) / 2);
      tube.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    }
    // Solar field and an antenna mast.
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const px = -40 + c * 8, pz = 30 + r * 7;
      add(S, new THREE.BoxGeometry(6.5, 0.08, 4), panel, px, 1.6, pz, -0.5, 0, 0);
      add(S, new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), metal, px, 0.8, pz);
    }
    add(S, new THREE.CylinderGeometry(0.2, 0.3, 18, 8), metal, 30, 9, -12);
    const dsh = new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, 0.9); dsh.rotateX(-0.9);
    add(S, dsh, white, 30, 17, -12);
    const beacon = glowSprite(0xff3a2a, 3, 0); beacon.position.set(30, 18.5, -12); S.add(beacon);
    this.anim.push((dt, t) => { beacon.material.opacity = (t % 1.6) < 0.12 ? 1 : 0.08; });
    const sign = canvasTexture(512, 128, (ctx, w, h) => { ctx.fillStyle = '#16202a'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#f4f4f4'; ctx.font = 'bold 60px Arial'; ctx.textAlign = 'center'; ctx.fillText('ARES STATION', w / 2, 84); });
    add(S, new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: sign }), 0, 4.2, 9.2);
    this._place(S, 160, 130, -0.3);

    // ---- Rover: rocker-bogie, six wheels, mast camera; drives a slow loop ----
    const rover = new THREE.Group();
    add(rover, new THREE.BoxGeometry(2.2, 0.8, 3), white, 0, 1.4, 0);
    add(rover, new THREE.BoxGeometry(2.3, 0.1, 3.1), stdMat(0xc49a44, { rough: 0.4, metal: 0.8 }), 0, 1.85, 0);
    add(rover, new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12).rotateX(Math.PI / 2.8), dark, 0, 1.6, -1.8);
    for (let k = 0; k < 6; k++) add(rover, new THREE.BoxGeometry(0.05, 0.6, 0.4), dark, 0, 1.7, -1.9 - k * 0.05);
    const mast = new THREE.Group(); mast.position.set(0.7, 1.9, 1.1); rover.add(mast);
    add(mast, new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), white, 0, 0.9, 0);
    const head = new THREE.Group(); head.position.y = 1.9; mast.add(head);
    add(head, new THREE.BoxGeometry(0.7, 0.3, 0.35), white);
    add(head, new THREE.BoxGeometry(0.16, 0.16, 0.05), dark, 0.18, 0, 0.19);
    add(head, new THREE.BoxGeometry(0.16, 0.16, 0.05), dark, -0.18, 0, 0.19);
    const wheels = [];
    const tyre = new THREE.CylinderGeometry(0.42, 0.42, 0.4, 16); tyre.rotateZ(Math.PI / 2);
    for (const s of [1, -1]) {
      add(rover, new THREE.BoxGeometry(0.1, 0.1, 2.8), metal, s * 1.2, 0.95, 0, 0.15, 0, 0);
      for (const z of [1.25, 0, -1.25]) wheels.push(add(rover, tyre, stdMat(0x8a8d90, { rough: 0.5, metal: 0.6 }), s * 1.35, 0.42, z));
    }
    // Robotic arm folded at the front.
    add(rover, new THREE.BoxGeometry(0.12, 0.12, 1.4), white, -0.6, 1.2, 1.7);
    add(rover, new THREE.BoxGeometry(0.3, 0.3, 0.3), metal, -0.6, 1.1, 2.4);
    this.scene.add(rover);
    const rc = new THREE.Vector3(-60, 0, 90);
    let ra = 0;
    this.anim.push((dt, t) => {
      ra += dt * 0.012;
      const x = rc.x + Math.cos(ra) * 45, z = rc.z + Math.sin(ra) * 45;
      const nx = rc.x + Math.cos(ra + 0.01) * 45, nz = rc.z + Math.sin(ra + 0.01) * 45;
      rover.position.set(x, this.heightAt(x, z), z);
      rover.rotation.y = Math.atan2(nx - x, nz - z);
      for (const w of wheels) w.rotation.x += dt * 1.3;
      head.rotation.y = Math.sin(t * 0.3) * 0.8;
    });
    this.rover = rover;

    // ---- The Ares Beacon ----
    const B = this.beaconAt;
    const beaconG = new THREE.Group();
    const glyphs = canvasTexture(256, 1024, (ctx, w, h) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      const rnd = mulberry32(9);
      ctx.strokeStyle = '#7dfff0'; ctx.lineWidth = 5;
      for (let y = 40; y < h - 40; y += 70) {
        ctx.beginPath();
        let x = 30 + rnd() * 40; ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += 30 + rnd() * 30; ctx.lineTo(x, y + (rnd() - 0.5) * 40); }
        ctx.stroke();
        ctx.beginPath(); ctx.arc(w / 2 + (rnd() - 0.5) * 80, y + 30, 8 + rnd() * 8, 0, Math.PI * 2); ctx.stroke();
      }
    });
    const obMat = new THREE.MeshStandardMaterial({ color: 0x141214, roughness: 0.25, metalness: 0.6, emissive: 0xffffff, emissiveMap: glyphs, emissiveIntensity: 1.2 });
    add(beaconG, new THREE.CylinderGeometry(0.4, 2.6, 16, 3, 1), obMat, 0, 6, 0, 0.12, 0, 0.18);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1400, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dfff0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    beam.position.y = 700; beaconG.add(beam);
    const halo = glowSprite(0x7dfff0, 26, 0.6); halo.position.y = 14; beaconG.add(halo);
    const bring = new THREE.Mesh(new THREE.RingGeometry(8, 9.5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dfff0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    bring.position.y = 0.5; beaconG.add(bring);
    this._place(beaconG, B.x, B.z, -3);
    B.y = beaconG.position.y;
    this.addBox(B.x, B.z, 2.4, 2.4, B.y + 16);
    this.sites.ares = { pos: B.clone().setY(B.y + 4), radius: 50 };
    this.anim.push((dt, t) => {
      const k = Math.sin(t * 1.7) * 0.5 + 0.5;
      obMat.emissiveIntensity = 0.6 + k * 1.2;
      beam.material.opacity = 0.12 + k * 0.2;
      halo.material.opacity = 0.35 + k * 0.4;
      bring.scale.setScalar(1 + (t * 0.25 % 1) * 1.4);
      bring.material.opacity = 0.35 * (1 - (t * 0.25 % 1));
    });

    // A dust devil wandering far out on the plain.
    const devTex = canvasTexture(128, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(200,150,110,${Math.random() * 0.12})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 1 + Math.random() * 3); }
    }, { repeat: true });
    const devil = new THREE.Mesh(new THREE.CylinderGeometry(22, 6, 260, 24, 1, true), new THREE.MeshBasicMaterial({ map: devTex, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(devil);
    this.anim.push((dt, t) => {
      const x = -900 + Math.sin(t * 0.01) * 600, z = 700 + Math.cos(t * 0.013) * 500;
      devil.position.set(x, this.heightAt(x, z) + 130, z);
      devil.rotation.y += dt * 1.8;
      devTex.offset.y -= dt * 0.2;
    });
  }

  _rocks() {
    const moon = this.body === 'moon';
    const geo = rockGeometry(this.cfg.seed);
    const mat = new THREE.MeshStandardMaterial({ color: moon ? 0x6d6b68 : 0x6a3a24, roughness: 0.95 });
    const count = moon ? 900 : 700;
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = true; im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const rnd = mulberry32(this.cfg.seed + 5);
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      // Cluster rocks around crater rims and near the landing area.
      let x, z;
      if (rnd() < 0.55 && this.craters.length) {
        const c = this.craters[Math.floor(rnd() * this.craters.length)];
        const a = rnd() * Math.PI * 2, r = c.r * (0.9 + rnd() * 0.9);
        x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
      } else { x = (rnd() - 0.5) * 2400; z = (rnd() - 0.5) * 2400; }
      if (Math.abs(x) > HALF - 50 || Math.abs(z) > HALF - 50) continue;
      if (Math.hypot(x, z) < 40) continue;
      const sc = 0.25 + Math.pow(rnd(), 4) * 3.5;
      e.set(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4);
      q.setFromEuler(e);
      s.set(sc * (0.8 + rnd() * 0.5), sc * (0.6 + rnd() * 0.5), sc * (0.8 + rnd() * 0.5));
      p.set(x, this.heightAt(x, z) - sc * 0.15, z);
      m4.compose(p, q, s);
      im.setMatrixAt(n++, m4);
      if (sc > 1.6) this.addBox(x, z, sc * 0.8, sc * 0.8, p.y + sc * 0.9);
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    this.scene.add(im);
  }

  _paintMap(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const col = this.mesh.geometry.attributes.color.array;
    const light = new THREE.Vector3(-0.6, 0.7, -0.4).normalize();
    const n = new THREE.Vector3();
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = -HALF + (px + 0.5) / size * SIZE, z = -HALF + (py + 0.5) / size * SIZE;
      const gx = clamp(Math.round((x + HALF) / CELL), 0, GRID), gz = clamp(Math.round((z + HALF) / CELL), 0, GRID);
      const vi = gz * V + gx;
      this.normalAt(x, z, n);
      const shade = 0.45 + 0.9 * Math.max(0, n.dot(light));
      const i = (py * size + px) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = clamp(Math.pow(col[vi * 3 + k] * 1.3, 1 / 2.2) * 255 * shade, 0, 255);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---- Runtime --------------------------------------------------------------------------

  update(dt, t, camera, focus) {
    for (const f of this.anim) f(dt, t);
    this.stars.position.copy(camera.position);
    this.sunSprite.position.copy(camera.position).addScaledVector(this.sunDir, 30000);
    if (this.earth) {
      this.earth.update(dt);
      this.earth.group.position.copy(camera.position).addScaledVector(this.earthDir, 16000);
    }
    if (this.phobos) {
      const a = t * 0.004 + 1.2;
      this.phobos.position.copy(camera.position).add(new THREE.Vector3(Math.cos(a) * 20000, 9000 + Math.sin(a) * 3000, Math.sin(a) * 20000 - 8000));
    }
    const L = this.sun;
    L.target.position.copy(focus);
    L.position.copy(focus).addScaledVector(this.sunDir, 800);
  }

  checkSites(p) {
    for (const [id, s] of Object.entries(this.sites)) if (p.distanceTo(s.pos) < s.radius) return id;
    return null;
  }
}
