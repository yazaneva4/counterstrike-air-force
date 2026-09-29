// Cumulus clouds built from instanced camera-facing puffs. Each puff is shaded
// as a soft sphere lit by the sun (warm at sunset, moonlit at night), fades
// out as the camera flies through it, and the whole field drifts with the wind.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { canvasTexture } from '../core/util.js';

function puffTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const rnd = mulberry32(77);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (rnd() - 0.5) * w * 0.42, y = h / 2 + (rnd() - 0.5) * h * 0.42;
      const r = w * (0.16 + rnd() * 0.22);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }, { srgb: false });
}

const NIGHT_LIT = new THREE.Color(0.05, 0.065, 0.1), NIGHT_SHADE = new THREE.Color(0.012, 0.016, 0.026);

export class Clouds {
  constructor({ count = 46, seed = 5 } = {}) {
    const rnd = mulberry32(seed);
    const offsets = [], scales = [], seeds = [];
    this.centers = [];
    for (let c = 0; c < count; c++) {
      const cx = (rnd() - 0.5) * 11000, cz = (rnd() - 0.5) * 11000;
      const cy = 780 + rnd() * 420;
      const size = 140 + rnd() * 220;
      this.centers.push({ x: cx, y: cy, z: cz, r: size });
      const puffs = 10 + Math.floor(rnd() * 12);
      for (let p = 0; p < puffs; p++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * size;
        const x = cx + Math.cos(a) * rr * 1.25, z = cz + Math.sin(a) * rr * 0.8;
        const up = (1 - rr / size);
        const y = cy + up * size * 0.45 * rnd() + rnd() * 20;
        offsets.push(x, y, z);
        scales.push((0.55 + rnd() * 0.6) * size * (0.7 + up * 0.6));
        seeds.push(rnd());
      }
    }
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
    geo.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
    geo.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    geo.instanceCount = scales.length;

    this.uniforms = {
      uMap: { value: puffTexture() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.5, 0.55, 0.65) },
      uWind: { value: new THREE.Vector2() },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.0002 },
      uOpacity: { value: 0.92 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec3 offset; attribute float scale; attribute float seed;
        uniform vec2 uWind;
        varying vec2 vUv; varying float vSeed; varying float vDepth; varying vec3 vCenter;
        void main(){
          vec3 c = offset;
          c.xz += uWind;
          // Wrap the field around the origin so wind never empties the sky.
          c.xz = mod(c.xz + 5500.0, 11000.0) - 5500.0;
          vCenter = c;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float rot = seed * 6.2831;
          vec2 p = position.xy;
          p = vec2(p.x * cos(rot) - p.y * sin(rot), p.x * sin(rot) + p.y * cos(rot));
          mv.xy += p * scale;
          vDepth = -mv.z;
          vUv = uv; vSeed = seed;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uSunDir, uLit, uShade, uFogColor; uniform float uFogDensity, uOpacity;
        varying vec2 vUv; varying float vSeed; varying float vDepth; varying vec3 vCenter;
        void main(){
          float a = texture2D(uMap, vUv).r;
          if (a < 0.01) discard;
          // Treat the puff as a sphere: reconstruct a view-space normal.
          vec2 q = vUv * 2.0 - 1.0;
          vec3 nV = normalize(vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))) + 0.25));
          vec3 nW = normalize((vec4(nV, 0.0) * viewMatrix).xyz);
          float diff = dot(nW, uSunDir) * 0.5 + 0.5;
          float up = nW.y * 0.5 + 0.5;
          vec3 col = mix(uShade, uLit, smoothstep(0.1, 0.95, diff * 0.8 + up * 0.35));
          // Silver lining.
          col += uLit * pow(1.0 - a, 3.0) * 0.25;
          float near = smoothstep(18.0, 140.0, vDepth);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth * 0.45);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, a * uOpacity * near * (1.0 - fog * 0.6));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.windX = 0; this.windZ = 0;
  }

  update(dt, sky, fog) {
    const u = this.uniforms;
    this.windX += dt * 6; this.windZ += dt * 2.5;
    u.uWind.value.set(this.windX, this.windZ);
    u.uSunDir.value.copy(sky.lightDir);
    const night = sky.night;
    u.uLit.value.copy(sky.sunColor).multiplyScalar(1.6 * sky.day).lerp(NIGHT_LIT, night);
    u.uShade.value.copy(sky.horizon).multiplyScalar(0.75).lerp(NIGHT_SHADE, night);
    u.uOpacity.value = 0.92 - night * 0.3;
    if (fog) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = fog.density; }
  }

  // Density near a point (0..1) - used to fog the camera when inside a cloud.
  densityAt(x, y, z) {
    let best = 0;
    for (const c of this.centers) {
      let cx = c.x + this.windX, cz = c.z + this.windZ;
      cx = ((cx + 5500) % 11000 + 11000) % 11000 - 5500;
      cz = ((cz + 5500) % 11000 + 11000) % 11000 - 5500;
      const dx = (x - cx) / (c.r * 1.25), dy = (y - c.y - c.r * 0.15) / (c.r * 0.45), dz = (z - cz) / (c.r * 0.8);
      const d = dx * dx + dy * dy + dz * dz;
      if (d < 1) best = Math.max(best, 1 - d);
    }
    return best;
  }
}
