// Living scenery: flocks of seagulls that wheel along the coast and over the
// lagoons (one instanced mesh, wings flapped in the vertex shader), and
// fireflies that drift through the undergrowth after dark.

import * as THREE from 'three';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from '../world/terrain.js';
import { canvasTexture } from '../core/util.js';

function gullGeometry() {
  // Body: a tapered cone along +Z. Wings: swept triangles with dark tips.
  const body = new THREE.ConeGeometry(0.11, 0.62, 6).rotateX(Math.PI / 2).translate(0, 0, 0.05);
  const wings = [];
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.22, s * 1.25, 0, -0.08, 0, 0, -0.3], 3));
    g.setIndex(s > 0 ? [0, 1, 2] : [0, 2, 1]);
    wings.push(g);
  }
  const parts = [body, ...wings].map((g) => { const n = g.toNonIndexed ? g.toNonIndexed() : g; return n; });
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos[o * 3] = p.getX(i); pos[o * 3 + 1] = p.getY(i); pos[o * 3 + 2] = p.getZ(i);
      const tip = Math.abs(p.getX(i)) > 1.0;
      const c = tip ? 0.18 : 0.96;
      col[o * 3] = c; col[o * 3 + 1] = c; col[o * 3 + 2] = c * 0.98; o++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export class Seabirds {
  constructor(scene, terrain, { count = 48 } = {}) {
    this.time = 0;
    const geo = gullGeometry();
    this.uTime = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.23;
          float flap = sin(uTime * 7.0 + ph) * abs(position.x);
          transformed.y += flap * 0.55;
          transformed.z -= abs(flap) * 0.08;`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    scene.add(this.mesh);
    // Flock centres around the coast and lagoons.
    const rnd = mulberry32(2718), centres = [];
    const sites = [PLACES.beach, PLACES.lighthouse, PLACES.spaceport, PLACES.vortex, { x: -1400, z: 800 }, { x: 600, z: 1750 }];
    for (const s of sites) if (s && Number.isFinite(s.x)) centres.push({ x: s.x, z: s.z });
    for (let i = 0; i < 4; i++) { // plus random coast points
      for (let t = 0; t < 200; t++) {
        const a = rnd() * 6.28, r = 1500 + rnd() * 1200, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
        const h = terrain.heightAt(x, z);
        if (h < 0 && terrain.heightAt(x * 0.9, z * 0.9) > 0) { centres.push({ x, z }); break; }
      }
    }
    this.birds = Array.from({ length: count }, (_, i) => {
      const c = centres[i % centres.length];
      return { c, r: 50 + rnd() * 200, a: rnd() * 6.28, w: (0.04 + rnd() * 0.05) * (rnd() < 0.5 ? -1 : 1), alt: 22 + rnd() * 70, bob: rnd() * 6.28, s: 0.85 + rnd() * 0.5 };
    });
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.p = new THREE.Vector3(); this.sc = new THREE.Vector3();
  }

  update(dt, camera) {
    this.time += dt; this.uTime.value = this.time;
    const c = camera.position;
    this.birds.forEach((b, i) => {
      b.a += b.w * dt;
      const ex = Math.cos(b.a) * b.r, ez = Math.sin(b.a * 1.3) * b.r * 0.7;
      const x = b.c.x + ex, z = b.c.z + ez;
      const y = Math.max(8, b.alt + Math.sin(this.time * 0.5 + b.bob) * 4);
      // Heading from the path derivative; bank into the turn.
      const dx = -Math.sin(b.a) * b.r * b.w, dz = Math.cos(b.a * 1.3) * 1.3 * b.r * 0.7 * b.w;
      this.e.set(Math.sin(this.time * 0.9 + b.bob) * 0.06, Math.atan2(dx, dz), -Math.sign(b.w) * 0.35, 'YXZ');
      this.q.setFromEuler(this.e);
      this.p.set(x, y, z); this.sc.setScalar(b.s);
      this.m.compose(this.p, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = c.y < 1500;
  }
}

export class Fireflies {
  constructor(scene, { count = 90 } = {}) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.seed = Float32Array.from({ length: count }, (_, i) => (i * 0.61803) % 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const tex = canvasTexture(32, 32, (c, w, h) => { const r = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(220,255,140,1)'); r.addColorStop(0.35, 'rgba(180,255,90,0.5)'); r.addColorStop(1, 'rgba(160,255,80,0)'); c.fillStyle = r; c.fillRect(0, 0, w, h); }, { srgb: false });
    this.mat = new THREE.PointsMaterial({ map: tex, size: 0.7, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: true });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.t = 0;
  }

  update(dt, camera, night, groundAt, wet = 0) {
    this.t += dt;
    const on = night > 0.45 && camera.position.y < 80 && wet < 0.5;
    this.points.visible = on;
    if (!on) return;
    this.mat.opacity = Math.min(1, (night - 0.45) * 3) * (0.55 + 0.45 * Math.sin(this.t * 3));
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i];
      const a = s * 62.8 + this.t * (0.1 + s * 0.2), r = 3 + s * 28;
      const x = cx + Math.cos(a) * r * (0.6 + Math.sin(this.t * 0.3 + s * 9) * 0.4), z = cz + Math.sin(a * 1.2) * r;
      this.pos[i * 3] = x; this.pos[i * 3 + 2] = z;
      this.pos[i * 3 + 1] = groundAt(x, z) + 0.6 + (Math.sin(this.t * 0.8 + s * 40) * 0.5 + 0.5) * 2.4;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
