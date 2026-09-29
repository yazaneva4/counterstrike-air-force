// Pooled GPU particles (one draw call) for sparks, smoke, dust, splashes and
// teleport flashes, plus ribbon trails for contrails, wingtip vortices and
// saucer light streaks.

import * as THREE from 'three';
import { glowTexture } from '../core/util.js';

export class Particles {
  constructor(max = 3000, { additive = true } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uScale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale; varying float vA; varying vec3 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * uScale / max(1.0, -mv.z);
          vA = alpha; vC = color;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; varying float vA; varying vec3 vC;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).r * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vC, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.geo = geo;
  }

  emit(x, y, z, vx, vy, vz, { color = 0xffffff, size = 1, life = 1, grow = 0, drag = 0.5, gravity = 0, intensity = 1 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = typeof color === 'number' ? tmpColor.set(color) : color;
    this.col[i * 3] = c.r * intensity; this.col[i * 3 + 1] = c.g * intensity; this.col[i * 3 + 2] = c.b * intensity;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = gravity;
    this.alpha[i] = 1;
  }

  burst(p, { count = 40, speed = 20, color = 0xffc070, size = 2, life = 1.2, gravity = -6, spread = 1, up = 0, intensity = 2 } = {}) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit(p.x, p.y, p.z, Math.cos(a) * r * s * spread, u * s + up, Math.sin(a) * r * s * spread,
        { color, size: size * (0.6 + Math.random() * 0.8), life: life * (0.5 + Math.random() * 0.7), gravity, drag: 1.2, intensity });
    }
  }

  smoke(p, { count = 20, color = 0x5a5550, size = 6, life = 3, speed = 3, rise = 2 } = {}) {
    for (let k = 0; k < count; k++) {
      this.emit(p.x + (Math.random() - 0.5) * 3, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * speed, rise + Math.random() * rise, (Math.random() - 0.5) * speed,
        { color, size, life: life * (0.6 + Math.random() * 0.6), grow: size * 0.8, drag: 0.8, intensity: 0.35 });
    }
  }

  update(dt) {
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      V[i * 3] *= k; V[i * 3 + 1] = V[i * 3 + 1] * k + this.grav[i] * dt; V[i * 3 + 2] *= k;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t * t;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.size.needsUpdate = true; a.alpha.needsUpdate = true; a.color.needsUpdate = true;
  }

  setPixelScale(h) { this.mat.uniforms.uScale.value = h * 0.5; }
}
const tmpColor = new THREE.Color();

// A camera-independent ribbon that follows a moving point (contrails etc).
export class Trail {
  constructor(scene, { length = 60, width = 1.2, color = 0xffffff, opacity = 0.5, additive = false, minStep = 2 } = {}) {
    this.n = length;
    this.width = width;
    this.minStep = minStep;
    this.points = [];
    const pos = new Float32Array(length * 2 * 3);
    const alpha = new Float32Array(length * 2);
    const idx = [];
    for (let i = 0; i < length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uOpacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.geo = g;
    scene.add(this.mesh);
    this.active = true;
  }

  push(p, side) {
    const last = this.points[0];
    if (last && last.p.distanceToSquared(p) < this.minStep * this.minStep) { last.p.copy(p); last.s.copy(side); return; }
    this.points.unshift({ p: p.clone(), s: side.clone() });
    if (this.points.length > this.n) this.points.pop();
  }

  clear() { this.points.length = 0; }

  update(fade = 1) {
    const pos = this.geo.attributes.position.array, alpha = this.geo.attributes.alpha.array;
    const n = this.points.length;
    for (let i = 0; i < this.n; i++) {
      const pt = this.points[Math.min(i, n - 1)];
      if (!pt) { alpha[i * 2] = alpha[i * 2 + 1] = 0; continue; }
      const w = this.width * (1 + i / this.n * 2);
      pos[i * 6] = pt.p.x + pt.s.x * w; pos[i * 6 + 1] = pt.p.y + pt.s.y * w; pos[i * 6 + 2] = pt.p.z + pt.s.z * w;
      pos[i * 6 + 3] = pt.p.x - pt.s.x * w; pos[i * 6 + 4] = pt.p.y - pt.s.y * w; pos[i * 6 + 5] = pt.p.z - pt.s.z * w;
      const a = i < n ? (1 - i / this.n) * fade : 0;
      alpha[i * 2] = alpha[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
