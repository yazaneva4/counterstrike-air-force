// Draws the rigid bodies of a PhysicsWorld: one InstancedMesh per prop kind
// (crates, barrels, cones, tyres, balls, boxes, debris), so hundreds of live
// objects cost a handful of draw calls. Only bodies that moved this frame
// have their matrices rewritten.

import * as THREE from 'three';
import { canvasTexture } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PhysicsWorld } from './world.js';

const CAP = { crate: 160, box: 140, barrel: 160, cone: 140, tyre: 160, ball: 40, debris: 160 };

function woodTexture() {
  return canvasTexture(128, 128, (c, w, h) => {
    const r = mulberry32(5);
    c.fillStyle = '#9a7648'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 21) { c.fillStyle = `rgba(60,40,20,${0.25 + r() * 0.2})`; c.fillRect(0, y, w, 2); }
    for (let i = 0; i < 700; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '70,48,24' : '200,170,120'},${r() * 0.18})`; c.fillRect(r() * w, r() * h, 1 + r() * 14, 1); }
    c.strokeStyle = '#6e5230'; c.lineWidth = 9; c.strokeRect(4, 4, w - 8, h - 8);
    c.beginPath(); c.moveTo(6, 6); c.lineTo(w - 6, h - 6); c.moveTo(w - 6, 6); c.lineTo(6, h - 6); c.stroke();
  });
}

function tint(geo, fn) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), i); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function geometries() {
  // Oil drum: ribbed lathe with a rim, white vertex colour so the instance colour sets the paint.
  const prof = [[0, -0.45], [0.27, -0.45], [0.3, -0.42], [0.3, -0.3], [0.285, -0.27], [0.3, -0.24], [0.3, -0.03], [0.285, 0], [0.3, 0.03], [0.3, 0.3], [0.285, 0.27], [0.3, 0.24], [0.3, 0.42], [0.27, 0.45], [0, 0.45]];
  const barrel = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  tint(barrel, (c, x, y) => c.setScalar(Math.abs(y) > 0.42 ? 0.55 : 1));
  // Traffic cone: orange body, white reflective band, black square base.
  const cone = new THREE.LatheGeometry([[0, -0.3], [0.2, -0.3], [0.2, -0.27], [0.1, -0.27], [0.1, -0.24], [0.085, -0.04], [0.05, 0.28], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  tint(cone, (c, x, y) => (y < -0.26 ? c.setRGB(0.06, 0.06, 0.06) : y > -0.08 && y < 0.1 ? c.setRGB(0.95, 0.95, 0.92) : c.setRGB(1, 0.36, 0.06)));
  const tyre = new THREE.TorusGeometry(0.25, 0.1, 10, 22); tyre.rotateX(Math.PI / 2);
  tint(tyre, (c) => c.setScalar(0.07));
  const ball = new THREE.SphereGeometry(0.24, 16, 12);
  tint(ball, (c, x, y, z) => { const s = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6); c.set([0xe23a2a, 0xf4f4ee, 0x2a62d8, 0xf4f4ee, 0xf2c230, 0xf4f4ee][s % 6]); });
  const crate = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const box = new THREE.BoxGeometry(0.6, 0.5, 0.6);
  const debris = new THREE.BoxGeometry(0.6, 0.24, 0.4);
  return { crate, box, barrel, cone, tyre, ball, debris };
}

export class Props {
  constructor(world, scene, opts = {}) {
    this.physics = new PhysicsWorld(world, opts);
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    const geo = geometries(), wood = woodTexture();
    const mats = {
      crate: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }),
      box: new THREE.MeshStandardMaterial({ map: wood, color: 0xd8c8a8, roughness: 0.9 }),
      barrel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.55 }),
      cone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      tyre: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      ball: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }),
      debris: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.6 }),
    };
    this.meshes = {};
    for (const k of Object.keys(geo)) {
      const m = new THREE.InstancedMesh(geo[k], mats[k], CAP[k]);
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP[k] * 3).fill(1), 3);
      this.meshes[k] = m; this.group.add(m);
    }
    this.slots = Object.fromEntries(Object.keys(CAP).map((k) => [k, []]));   // kind -> bodies by instance index
    this._m = new THREE.Matrix4(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  // Adds a body and an instance for it; returns null when the kind is full.
  add(kind, x, z, opts = {}) {
    const list = this.slots[kind];
    if (list.length >= CAP[kind]) {
      // Debris recycles its oldest piece; other kinds simply stop at capacity.
      if (kind !== 'debris') return null;
      this.physics.remove(list[0]); this._drop(kind, list[0]);
    }
    const b = this.physics.add(kind, x, z, opts);
    b.index = list.length; list.push(b);
    const mesh = this.meshes[kind];
    mesh.count = list.length;
    this._c.set(opts.color ?? 0xffffff);
    mesh.setColorAt(b.index, this._c);
    mesh.instanceColor.needsUpdate = true;
    this._write(b);
    mesh.instanceMatrix.needsUpdate = true;
    return b;
  }

  _drop(kind, b) {
    // Swap-remove keeps the instance range dense.
    const list = this.slots[kind], i = b.index;
    const last = list[list.length - 1];
    if (last !== b) {
      list[i] = last; last.index = i;
      const mesh = this.meshes[kind];
      mesh.setColorAt(i, this._c.set(last.color));   // the colour travels with its body
      last.dirty = true;
    }
    list.pop(); this.meshes[kind].count = list.length;
    this.meshes[kind].instanceMatrix.needsUpdate = true; this.meshes[kind].instanceColor.needsUpdate = true;
  }

  _write(b) {
    const mesh = this.meshes[b.kind];
    this._s.setScalar(b.scale);
    this._m.compose(b.p, b.q, this._s);
    mesh.setMatrixAt(b.index, this._m);
    b.dirty = false;
  }

  // Advance the simulation and refresh the matrices of bodies that moved.
  update(dt, ctx) {
    const P = this.physics;
    P.step(dt, ctx);
    // Reap debris that expired inside the physics step.
    for (const k of Object.keys(this.slots)) {
      const list = this.slots[k];
      for (let i = list.length - 1; i >= 0; i--) if (list[i].removed) this._drop(k, list[i]);
    }
    const touched = new Set();
    for (const b of P.bodies) {
      if (!b.dirty) continue;
      this._write(b); touched.add(b.kind);
    }
    for (const k of touched) this.meshes[k].instanceMatrix.needsUpdate = true;
  }

  explode(pos, opts) { this.physics.explode(pos, opts); }
  // Spray of crash fragments from a destroyed vehicle.
  debris(pos, vel, { count = 14, color = 0x888888 } = {}) {
    for (let i = 0; i < count; i++) {
      const b = this.add('debris', pos.x + (Math.random() - 0.5) * 3, pos.z + (Math.random() - 0.5) * 3, {
        y: pos.y + 0.5 + Math.random() * 1.5, sleep: false, color: i % 3 ? color : 0x222222, scale: 0.5 + Math.random() * 0.9, ttl: 40,
        yaw: Math.random() * 6.28, pitch: Math.random() * 6.28,
      });
      if (!b) continue;
      b.v.set((Math.random() - 0.5) * 22, 5 + Math.random() * 14, (Math.random() - 0.5) * 22).addScaledVector(vel, 0.4);
      b.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }
  }
}
