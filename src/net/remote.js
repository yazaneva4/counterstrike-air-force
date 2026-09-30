// Other real players, drawn as people on foot or in whatever they are flying,
// smoothly interpolated between network updates.

import * as THREE from 'three';
import { Human, outfitFor } from '../actors/human.js';
import { buildFighter, buildProp, buildHelicopter, buildSaucer, buildNova } from '../vehicles/models.js';
import { buildRocket, buildShip, AURORA } from '../vehicles/spacecraft.js';
import { mulberry32 } from '../core/noise.js';
import { CHARACTERS } from '../player.js';

const builders = { jet: () => buildFighter({ color: 0x7a8a96 }), prop: () => buildProp({ stripe: 0x2a8a4a }), heli: () => buildHelicopter({ color: 0x2a6a4a }), ufo: () => buildSaucer({ glow: 0xffa86a }), nova: () => ({ group: buildNova().group, parts: {} }), rocket: () => buildRocket(), ship: () => buildShip() };
const ROCKET_SIDEWAYS = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

export class RemotePlayer {
  constructor(scene, id, name, color) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.color = color;
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.targetPos = new THREE.Vector3();
    this.targetQuat = new THREE.Quaternion();
    this.character = null;
    this.human = null;
    this.vehicleType = null;
    this.vehicle = null;
    this.has = false;
  }

  _ensureHuman(character, skin, suit = false) {
    const key = character + ':' + skin + ':' + suit;
    if (this.human && this._hkey === key) return;
    if (this.human) this.scene.remove(this.human.root);
    const ch = CHARACTERS.find((c) => c.id === character) || CHARACTERS[0];
    const outfit = suit ? outfitFor('astronaut', mulberry32(this.name.length * 131 + 7)) : Object.assign(outfitFor(ch.role, mulberry32(this.name.length * 131 + 7)), ch.extra);
    const skins = [0xf1c7a5, 0xe0ac86, 0xc68a62, 0xa66d47, 0x7c4c32, 0x5a3825];
    outfit.skin = skins[(skin | 0) % skins.length];
    this.human = new Human(outfit);
    this._hkey = key;
    this.scene.add(this.human.root);
  }

  _ensureVehicle(type) {
    if (this.vehicleType === type) return;
    if (this.vehicle) this.scene.remove(this.vehicle.group);
    this.vehicle = null;
    this.vehicleType = type;
    if (type && builders[type]) {
      this.vehicle = builders[type]();
      if (this.vehicle.parts?.pilot) this.vehicle.parts.pilot.root.visible = true;
      if (this.vehicle.parts?.gear) this.vehicle.parts.gear.visible = false;
      this.scene.add(this.vehicle.group);
    }
  }

  // Move our meshes into whichever scene we are drawn in (island, orbit, Moon, Mars).
  setScene(scene) {
    if (this.scene === scene) return;
    this.scene = scene;
    if (this.human) scene.add(this.human.root);
    if (this.vehicle) scene.add(this.vehicle.group);
  }

  setVisible(on) {
    this.here = on;
    if (!on) { if (this.human) this.human.root.visible = false; if (this.vehicle) this.vehicle.group.visible = false; }
    else if (this.vehicle) this.vehicle.group.visible = true;
  }

  apply(s) {
    if (!Array.isArray(s.p) || s.p.length !== 3 || !s.p.every(Number.isFinite)) return;
    if (!Array.isArray(s.q) || s.q.length !== 4 || !s.q.every(Number.isFinite)) return;
    this.state = s;
    if (s.n) this.name = String(s.n).slice(0, 18);
    this._ensureHuman(String(s.c || 'pilot'), s.k, s.L === 'moon' || s.L === 'mars');
    this._ensureVehicle(typeof s.v === 'string' && builders[s.v] ? s.v : null);
    this.targetPos.set(s.p[0], s.p[1], s.p[2]);
    this.targetQuat.set(s.q[0], s.q[1], s.q[2], s.q[3]).normalize();
    if (!this.has) { this.pos.copy(this.targetPos); this.quat.copy(this.targetQuat); this.has = true; }
  }

  update(dt) {
    if (!this.has) return;
    const k = 1 - Math.exp(-10 * dt);
    if (this.pos.distanceToSquared(this.targetPos) > 250000) this.pos.copy(this.targetPos);
    this.pos.lerp(this.targetPos, k);
    this.quat.slerp(this.targetQuat, k);
    const s = this.state || {};
    const inVehicle = !!this.vehicle;
    if (this.vehicle) {
      this.vehicle.group.position.copy(this.pos);
      this.vehicle.group.quaternion.copy(this.quat);
      const P = this.vehicle.parts;
      const th = Number(s.th) || 0;
      if (this.vehicleType === 'rocket') {
        if (s.L === 'space') this.vehicle.group.quaternion.multiply(ROCKET_SIDEWAYS);
        const upper = s.sg === 1;
        P.stage1.visible = !upper;
        P.model.position.y = upper ? -AURORA.UPPER_BASE : 0;
        P.plume1Mat.uniforms.uThrottle.value = upper ? 0 : th;
        P.plume2Mat.uniforms.uThrottle.value = upper ? th : 0;
        P.plume1Mat.uniforms.uTime.value += dt; P.plume2Mat.uniforms.uTime.value += dt;
      }
      if (this.vehicleType === 'ship') { P.liftMat.uniforms.uThrottle.value = th * 0.6; P.liftMat.uniforms.uTime.value += dt; }
      if (P.rotor) { P.rotor.rotation.y += dt * 28 * th; P.tailRotor.rotation.x += dt * 50 * th; P.rDisc.material.opacity = 0.28 * th; }
      if (P.prop) { P.prop.rotation.z += dt * 60 * th; P.disc.material.opacity = 0.3 * th; }
      if (P.flame) { P.flame.scale.set(0.8, 0.8, 0.2 + th); P.flame.material.opacity = 0.3 + th * 0.4; }
      if (P.beam) P.beam.visible = !!s.b;
    }
    if (this.human) {
      this.human.root.visible = !inVehicle;
      this.human.root.position.copy(this.pos);
      this.human.root.quaternion.copy(this.quat);
      this.human.speed = Number(s.s) || 0;
      this.human.state = ['idle', 'swim', 'air', 'chute', 'sit', 'lie'].includes(s.st) ? s.st : 'idle';
      this.human.gesture = ['wave', 'talk', 'point', 'dance', 'scan'].includes(s.g) ? s.g : null;
      this.human.animate(dt);
    }
  }

  labelPos() {
    const p = this.pos.clone();
    p.y += this.vehicle ? 7 : 2.2;
    return p;
  }

  dispose() {
    if (this.human) this.scene.remove(this.human.root);
    if (this.vehicle) this.scene.remove(this.vehicle.group);
  }
}
