// AI air traffic that makes the sky feel alive: an airliner on a wide
// holding pattern with contrails, a pair of jets in formation, a coastal
// patrol helicopter and a touring Skylark.

import * as THREE from 'three';
import { buildAirliner, buildFighter, buildHelicopter, buildProp } from '../vehicles/models.js';
import { Trail } from '../fx/particles.js';
import { PLACES } from '../world/terrain.js';

const up = new THREE.Vector3(0, 1, 0);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), side = new THREE.Vector3();

class Flyer {
  constructor(scene, model, path, speed, { trails = [], trailOpts = {}, phase = 0, heli = false } = {}) {
    this.model = model;
    this.group = model.group;
    scene.add(this.group);
    this.path = path;      // s in [0,1) -> Vector3
    this.speed = speed;
    this.s = phase;
    this.heli = heli;
    // Approximate the loop length.
    let L = 0; const a = new THREE.Vector3(), b = new THREE.Vector3();
    path(0, a);
    for (let i = 1; i <= 200; i++) { path(i / 200, b); L += a.distanceTo(b); a.copy(b); }
    this.length = L;
    this.bank = 0;
    this.trails = trails.map((off) => ({ off, trail: new Trail(scene, trailOpts) }));
    this.prevDir = new THREE.Vector3();
    this.pos = this.group.position;
  }

  update(dt, t, night) {
    this.s = (this.s + (this.speed * dt) / this.length) % 1;
    this.path(this.s, tA);
    this.path((this.s + 0.002) % 1, tB);
    const dir = tC.subVectors(tB, tA).normalize();
    // Bank from the change in heading.
    const turn = this.prevDir.lengthSq() > 0 ? this.prevDir.clone().cross(dir).y / Math.max(dt, 1e-3) : 0;
    this.prevDir.copy(dir);
    const targetBank = this.heli ? Math.max(-0.3, Math.min(0.3, -turn * 3)) : Math.max(-0.8, Math.min(0.8, Math.atan(-turn * this.speed / 9.8)));
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 1.5);
    this.group.position.copy(tA);
    this.group.lookAt(tB);
    this.group.rotateZ(this.bank);
    if (this.heli) this.group.rotateX(0.12);
    const P = this.model.parts;
    if (P.rotor) { P.rotor.rotation.y += dt * 28; P.tailRotor.rotation.x += dt * 60; P.rDisc.material.opacity = 0.28; }
    if (P.prop) { P.prop.rotation.z += dt * 50; P.disc.material.opacity = 0.3; }
    if (P.gear) P.gear.visible = false;
    if (P.flame) { P.flame.scale.set(0.8, 0.8, 0.6); P.flame.material.opacity = 0.4; }
    if (P.pilot) P.pilot.root.visible = true;
    if (P.nav) { P.nav.strobe.material.opacity = (t % 1.1) < 0.07 ? 1 : 0; }
    if (P.beacon) P.beacon.material.opacity = (t % 1.5) < 0.1 ? 1 : 0.1;
    if (P.winMat) P.winMat.emissiveIntensity = 1.4 * night;
    side.set(1, 0, 0).applyQuaternion(this.group.quaternion);
    for (const tr of this.trails) {
      tA.copy(tr.off).applyQuaternion(this.group.quaternion).add(this.group.position);
      tr.trail.push(tA, side);
      tr.trail.update(1);
    }
  }
}

export class Traffic {
  constructor(scene, world) {
    this.flyers = [];
    const g = (x, z) => world.groundAt(x, z);
    // Airliner: wide oval at cruise altitude with long contrails.
    const air = buildAirliner();
    air.group.scale.setScalar(1);
    this.flyers.push(new Flyer(scene, air, (s, o) => o.set(Math.cos(s * Math.PI * 2) * 3600, 1650 + Math.sin(s * Math.PI * 4) * 40, Math.sin(s * Math.PI * 2) * 2700), 125,
      { trails: [new THREE.Vector3(5.6, -2.2, -3), new THREE.Vector3(-5.6, -2.2, -3)], trailOpts: { length: 90, width: 1.4, color: 0xffffff, opacity: 0.55, minStep: 12 } }));
    // Two jets in loose formation over the island.
    const jetPath = (off) => (s, o) => {
      const a = s * Math.PI * 2;
      o.set(Math.sin(a) * 1500 + off, 620 + Math.sin(a * 3) * 120, Math.sin(a * 2) * 1100 + off * 0.5);
    };
    for (let i = 0; i < 2; i++) {
      const j = buildFighter({ color: i ? 0x6e7a70 : 0x7c868e });
      this.flyers.push(new Flyer(scene, j, jetPath(i * 40), 170, { phase: i * 0.004, trails: [new THREE.Vector3(5, 0, -2), new THREE.Vector3(-5, 0, -2)], trailOpts: { length: 40, width: 0.18, color: 0xffffff, opacity: 0.35, minStep: 6 } }));
    }
    // Coastal patrol helicopter.
    const heli = buildHelicopter({ color: 0x2a4a6a, trim: 0xe8e8e8 });
    this.flyers.push(new Flyer(scene, heli, (s, o) => {
      const a = s * Math.PI * 2;
      const r = 2250 + Math.sin(a * 5) * 150;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
      o.set(x, Math.max(g(x, z), 0) + 140, z);
    }, 48, { heli: true }));
    // Skylark touring between the village and the farm.
    const prop = buildProp({ color: 0xf6f3e8, stripe: 0x2a6ab2 });
    const V = PLACES.village, F = PLACES.farm;
    this.flyers.push(new Flyer(scene, prop, (s, o) => {
      const a = s * Math.PI * 2;
      o.set((V.x + F.x) / 2 + Math.cos(a) * 700, 380 + Math.sin(a * 2) * 40, (V.z + F.z) / 2 + Math.sin(a) * 520);
    }, 52, { phase: 0.3 }));
  }

  update(dt, t, night) { for (const f of this.flyers) f.update(dt, t, night); }

  positions() { return this.flyers.map((f) => f.pos); }
}
