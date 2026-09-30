// Day/night cycle: physically based sky (Preetham), a moving sun that is the
// single shadow-casting light by day and hands over to moonlight at night,
// twinkling stars, a moon, fog and exposure that follow the time of day.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep, canvasTexture, glowTexture } from '../core/util.js';
import { skyAt, horizontalToWorld } from '../core/astro.js';

// Kestrel Island sits at 20.5°N 158.5°W; islanders keep UTC-10.
const LAT = 20.5, LON = -158.5, ISLAND_UTC = -10;
const POLE = new THREE.Vector3(0, Math.sin(LAT * Math.PI / 180), -Math.cos(LAT * Math.PI / 180));
const hv = {};

const tmpC = new THREE.Color();

function mixColors(out, stops, t) {
  // stops: [[t, Color], ...] sorted by t
  if (t <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      return out.copy(a[1]).lerp(b[1], (t - a[0]) / (b[0] - a[0]));
    }
  }
  return out.copy(stops[stops.length - 1][1]);
}

const col = (h) => new THREE.Color(h);
// Indexed by sun elevation (sunDir.y).
const HORIZON = [[-0.35, col(0x070b16)], [-0.12, col(0x1a2238)], [-0.02, col(0x6b4a5a)], [0.06, col(0xe29a6a)], [0.2, col(0xc9d6e2)], [0.6, col(0xb8d0e6)]];
const HEMI_SKY = [[-0.3, col(0x2a3866)], [-0.05, col(0x3a3f66)], [0.05, col(0xffb48a)], [0.25, col(0xcfe3ff)], [1, col(0xd8eaff)]];
const HEMI_GROUND = [[-0.3, col(0x0b0d12)], [0.05, col(0x4a3a30)], [0.3, col(0x5a5a44)], [1, col(0x62604a)]];
const SUN_COL = [[-0.05, col(0xff6a2a)], [0.05, col(0xff9a55)], [0.18, col(0xffd9a8)], [0.45, col(0xfff4e4)], [1, col(0xffffff)]];

export class SkySystem {
  constructor(scene, { shadowSize = 2048, shadows = true } = {}) {
    this.scene = scene;
    this.time = 0.36;          // fraction of a day, 0.25 = sunrise, 0.5 = noon
    this.dayLength = 900;      // seconds per full day
    this.timeScale = 1;
    this.real = false;         // live sky: real Sun, Moon and stars for the real date and time
    this.offsetMs = 0;         // time-lapse drift away from real time
    this.phase = 0.5; this.illumination = 1; this.decl = 0.2;
    this._moonPhaseDrawn = -1;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.horizon = new THREE.Color();
    this.zenith = new THREE.Color();
    this.sunColor = new THREE.Color();
    this.night = 0; this.day = 1; this.golden = 0;
    this.shadowRadius = 90;

    const sky = new Sky();
    sky.scale.setScalar(18000);
    const u = sky.material.uniforms;
    u.turbidity.value = 5.5;
    u.rayleigh.value = 1.35;
    u.mieCoefficient.value = 0.0045;
    u.mieDirectionalG.value = 0.86;
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);
    this.sky = sky;

    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.castShadow = shadows;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.bias = -0.00025;
    light.shadow.normalBias = 0.9;
    const sc = light.shadow.camera;
    sc.near = 10; sc.far = 3000;
    scene.add(light, light.target);
    this.light = light;

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5a44, 1.0);
    scene.add(this.hemi);

    this._buildStars();
    this._buildMoon();
  }

  _buildStars() {
    const n = 3200;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n), tint = new Float32Array(n * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      // Concentrate some stars along a tilted band for a Milky Way feel.
      let v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      if (i % 3 === 0) v.set(r() * 2 - 1, (r() - 0.5) * 0.28, r() * 2 - 1).applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), 1.0);
      v.normalize();
      if (v.y < -0.15) v.y = -v.y;
      v.multiplyScalar(9000);
      pos.set([v.x, v.y, v.z], i * 3);
      size[i] = Math.pow(r(), 6) * 7 + 1.2;
      seed[i] = r() * 100;
      const warm = r();
      tint.set(warm < 0.2 ? [1, 0.8, 0.62] : warm > 0.85 ? [0.7, 0.82, 1] : [1, 1, 1], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uPixel: { value: 1 } },
      vertexShader: /* glsl */`
        attribute float size; attribute float seed; attribute vec3 tint;
        uniform float uTime; uniform float uPixel;
        varying float vA; varying vec3 vTint;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.99999;
          float tw = 0.65 + 0.35 * sin(uTime * (1.3 + fract(seed) * 2.7) + seed);
          vA = tw; vTint = tint;
          gl_PointSize = size * uPixel;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity; varying float vA; varying vec3 vTint;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a;
          gl_FragColor = vec4(vTint * (1.4 * vA), a * uOpacity);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  _drawMoon(phase) {
    const c = this.moonCanvas, ctx = c.getContext('2d'), w = c.width, h = c.height, R = w / 2 - 2;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.moonBase, 0, 0);
    if (phase == null) return;
    // Shade the unlit part: waxing lights the right side (northern sky), waning the left.
    const k = Math.cos(phase * Math.PI * 2), waxing = phase < 0.5;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (!waxing) ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.arc(0, 0, R, Math.PI / 2, Math.PI * 1.5, false);
    for (let i = 0; i <= 40; i++) { const t = -Math.PI / 2 + (i / 40) * Math.PI; ctx.lineTo(R * k * Math.cos(t), R * Math.sin(t)); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,8,16,0.93)';
    ctx.fill();
    ctx.restore();
    this.moonTex.needsUpdate = true;
  }

  _buildMoon() {
    this.moonBase = document.createElement('canvas'); this.moonBase.width = this.moonBase.height = 256;
    {
      const ctx = this.moonBase.getContext('2d'), w = 256, h = 256;
      const g = ctx.createRadialGradient(w * 0.45, h * 0.42, 5, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#fbfaf2'); g.addColorStop(0.85, '#d9d6cb'); g.addColorStop(1, '#bdb9ae');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
      // Maria and craters.
      const spots = [[0.35, 0.35, 0.16, 0.18], [0.6, 0.3, 0.1, 0.14], [0.55, 0.58, 0.14, 0.12], [0.3, 0.62, 0.07, 0.15], [0.7, 0.7, 0.05, 0.2], [0.44, 0.8, 0.04, 0.2]];
      for (const [x, y, r, a] of spots) {
        ctx.fillStyle = `rgba(120,118,112,${a})`;
        ctx.beginPath(); ctx.arc(x * w, y * h, r * w, 0, Math.PI * 2); ctx.fill();
      }
    }
    this.moonCanvas = document.createElement('canvas'); this.moonCanvas.width = this.moonCanvas.height = 256;
    this.moonTex = new THREE.CanvasTexture(this.moonCanvas);
    this.moonTex.colorSpace = THREE.SRGBColorSpace;
    this._drawMoon(null);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.moonTex, color: 0xffffff, transparent: true, depthWrite: false, fog: false }));
    this.moon.scale.setScalar(420);
    this.moon.renderOrder = -8;
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x8fb0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.moonGlow.scale.setScalar(2200);
    this.moonGlow.renderOrder = -8;
    this.scene.add(this.moon, this.moonGlow);
  }

  setTime(frac) { this.real = false; this.time = ((frac % 1) + 1) % 1; }

  // Follow the real Sun, Moon and stars for the real date and time.
  setLive(on = true) {
    this.real = on;
    if (on) { this.offsetMs = 0; this._moonPhaseDrawn = -1; } else this._drawMoon(null);
  }

  // Advance the clock only (used on other worlds and in orbit, where the sky is not drawn).
  advance(dt) {
    if (this.real) {
      if (this.timeScale !== 1) this.offsetMs += dt * 1000 * (this.timeScale - 1);
      const date = this.now();
      this.time = ((date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + LON / 15) / 24 % 1 + 1) % 1;
      this.decl = skyAt(date, LAT, LON).sun.dec;
    } else this.time = (this.time + (dt * this.timeScale) / this.dayLength) % 1;
  }

  // The moment being shown (real time plus any time-lapse drift).
  now() { return new Date(Date.now() + this.offsetMs); }

  clockString() {
    let mins = Math.floor(this.time * 24 * 60);
    if (this.real) { const d = new Date(this.now().valueOf() + ISLAND_UTC * 3600000); mins = d.getUTCHours() * 60 + d.getUTCMinutes(); }
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  update(dt, camera, focus, renderer, altitude = 0) {
    let astro = null;
    if (this.real) {
      // Live mode: the sky is a pure function of the real clock (holding T drifts away from it).
      if (this.timeScale !== 1) this.offsetMs += dt * 1000 * (this.timeScale - 1);
      const date = this.now();
      astro = skyAt(date, LAT, LON);
      this.time = ((date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + LON / 15) / 24 % 1 + 1) % 1;
      const su = horizontalToWorld(astro.sun.alt, astro.sun.az, hv);
      this.sunDir.set(su.x, su.y, su.z);
      const mo = horizontalToWorld(astro.moon.alt, astro.moon.az, hv);
      this.moonDir.set(mo.x, mo.y, mo.z);
      this.phase = astro.phase; this.illumination = astro.illumination; this.decl = astro.sun.dec;
      if (Math.abs(this.phase - this._moonPhaseDrawn) > 0.004) { this._moonPhaseDrawn = this.phase; this._drawMoon(this.phase); }
    } else {
      this.time = (this.time + (dt * this.timeScale) / this.dayLength) % 1;
      const a = (this.time - 0.25) * Math.PI * 2;
      this.sunDir.set(Math.cos(a), Math.sin(a) * 0.92, Math.sin(a) * 0.38 + 0.08).normalize();
      this.moonDir.set(-this.sunDir.x * 0.9, Math.max(-this.sunDir.y * 0.8 + 0.12, -0.3), -this.sunDir.z * 0.4 - 0.35).normalize();
      this.illumination = 1;
    }
    const sy = this.sunDir.y;

    this.night = smoothstep(0.02, -0.2, sy);
    this.day = smoothstep(-0.06, 0.22, sy);
    this.golden = (1 - smoothstep(0.02, 0.32, Math.abs(sy - 0.04))) * (1 - this.night);

    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.position.copy(camera.position);

    mixColors(this.horizon, HORIZON, sy);
    mixColors(this.sunColor, SUN_COL, sy);
    this.zenith.copy(this.horizon).lerp(tmpC.set(0x2d5c9a), this.day * 0.6).lerp(tmpC.set(0x03050b), this.night * 0.8);

    // Directional light: sun by day, moon by night, a dim gap at twilight.
    const sunI = smoothstep(-0.04, 0.2, sy);
    const moonI = smoothstep(-0.02, -0.16, sy);
    const L = this.light;
    if (sunI > 0.001 || moonI < 0.001) {
      this.lightDir.copy(this.sunDir);
      L.color.copy(this.sunColor);
      L.intensity = 3.4 * sunI;
    } else {
      this.lightDir.copy(this.moonDir);
      L.color.set(0xa8bcff);
      L.intensity = 0.9 * moonI * (0.15 + 0.85 * this.illumination) * smoothstep(-0.06, 0.14, this.moonDir.y);
    }
    if (this.lightDir.y < 0.08) this.lightDir.y = 0.08;
    this.lightDir.normalize();

    const R = this.shadowRadius;
    const sc = L.shadow.camera;
    if (sc.right !== R) {
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R;
      sc.updateProjectionMatrix();
    }
    // Snap the shadow frustum to texel increments so shadows don't shimmer.
    const texel = (2 * R) / L.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    L.target.position.set(fx, focus.y, fz);
    L.position.set(fx, focus.y, fz).addScaledVector(this.lightDir, 1200);
    L.target.updateMatrixWorld();

    mixColors(this.hemi.color, HEMI_SKY, sy);
    mixColors(this.hemi.groundColor, HEMI_GROUND, sy);
    this.hemi.intensity = lerp(0.55, 1.25, this.day);

    // Fog thins with altitude so high-flying pilots see the whole island.
    const fog = this.scene.fog;
    if (fog) {
      fog.color.copy(this.horizon);
      fog.density = lerp(0.00022, 0.00006, smoothstep(0, 2500, altitude)) * lerp(1, 1.35, this.golden);
    }

    // Stars and moon ride with the camera, fading in at dusk.
    this.stars.position.copy(camera.position);
    if (astro) this.stars.quaternion.setFromAxisAngle(POLE, -astro.siderealTime);
    else this.stars.rotation.y = this.time * Math.PI * 2 * 0.25;
    this.starMat.uniforms.uTime.value += dt;
    this.starMat.uniforms.uOpacity.value = smoothstep(-0.02, -0.2, sy) * (altitude > 3000 ? 1 : 0.95);
    this.starMat.uniforms.uPixel.value = renderer ? renderer.getPixelRatio() : 1;
    this.moon.position.copy(camera.position).addScaledVector(this.moonDir, 8000);
    this.moonGlow.position.copy(this.moon.position);
    const moonVis = smoothstep(-0.05, 0.1, this.moonDir.y);
    this.moon.material.opacity = moonVis * lerp(0.35, 1, this.night);
    this.moonGlow.material.opacity = moonVis * 0.3 * this.night * (0.1 + 0.9 * this.illumination);

    if (renderer) renderer.toneMappingExposure = lerp(0.62, 0.95, this.night);
  }
}
