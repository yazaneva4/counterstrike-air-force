import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { Vehicle, VEHICLE_DEFS } from '../src/vehicles/vehicles.js';
import { Weather } from '../src/world/weather.js';
import { animateCarParts } from '../src/vehicles/cars.js';
import { FEMALE_SHARE, outfitFor } from '../src/actors/human.js';
import { mulberry32 } from '../src/core/noise.js';

const flatWorld = {
  groundAt: () => 0,
  terrain: { heightAt: () => 0, normalAt: () => new THREE.Vector3(0, 1, 0) },
  structures: { collide: () => false, platformAt: () => -Infinity, roadAt: () => true },
  vegetation: { near() {} },
};

function walker(world = flatWorld) {
  const p = Object.create(Player.prototype);
  const input = { moveAxes: () => ({ x: 0, y: 0 }), consumeWheel: () => 0, down: () => false, hit: () => false, thit: () => false, tdown: () => false };
  Object.assign(p, {
    root: new THREE.Group(), vel: new THREE.Vector3(), human: { phase: 0, speed: 0 },
    camDist: 5.2, camYaw: 0, camPitch: 0, yaw: 0, cockpit: false, onGround: true, mode: 'foot',
    game: { input, world, vehicles: [], hud: { toast() {} } }, _look() {}, _interactions() {}, _footCamera() {},
  });
  return p;
}
function jumpPeak(gravity) {
  const p = walker({ ...flatWorld, gravity });
  p.game.input.hit = key => key === 'Space';
  p._foot(0.01);
  p.game.input.hit = () => false;
  let peak = p.pos.y;
  for (let i = 0; i < 450; i++) { p._foot(0.01); peak = Math.max(peak, p.pos.y); }
  assert.equal(p.onGround, true);
  assert.equal(p.pos.y, 0);
  return peak;
}
test('generated islanders have a mixed, varied population', () => {
  assert.equal(FEMALE_SHARE, 0.5);
  let women = 0;
  for (let i = 0; i < 200; i++) women += outfitFor('crew', mulberry32(i + 1)).female ? 1 : 0;
  assert.ok(women > 70 && women < 130);
});

test('walking falls with Earth gravity and jumping responds to lunar gravity', () => {
  const p = walker(); p.pos.y = 10; p.onGround = false;
  p._foot(0.05); assert.ok(Math.abs(p.vel.y + 0.4905) < 1e-10);
  const earth = jumpPeak(1), moon = jumpPeak(1.62 / 9.81);
  assert.ok(earth > 0.48 && earth < 0.56);
  assert.ok(moon > 2.9 && moon < 3.3);
});
test('walking cannot snap up a steep cliff but can move on level ground', () => {
  const p = walker({ ...flatWorld, groundAt: (x, z) => z * 2, terrain: { heightAt: (x, z) => z * 2, normalAt: () => new THREE.Vector3(0, 0.447, -0.894) } });
  p.game.input.moveAxes = () => ({ x: 0, y: 1 }); p._foot(1 / 120);
  assert.equal(p.pos.z, 0); assert.equal(p.vel.z, 0);
  const q = walker(); q.game.input.moveAxes = () => ({ x: 0, y: 1 }); q._foot(1 / 120);
  assert.ok(q.pos.z > 0);
});
test('first-person camera uses the selected character eye height', () => {
  const p = walker(); delete p._footCamera;
  Object.assign(p, { eyeHeight: 1.74, cockpit: true, camPos: new THREE.Vector3(), fov: 62, shake: 0, onGround: false });
  p.game.camera = new THREE.PerspectiveCamera();
  p._footCamera(0.016); assert.equal(p.game.camera.position.y, 1.74);
});

function car() {
  const v = Object.create(Vehicle.prototype);
  Object.assign(v, {
    def: VEHICLE_DEFS.sedan, pos: new THREE.Vector3(0, 0.34, 0), vel: new THREE.Vector3(0, 0, 20), quat: new THREE.Quaternion(),
    heading: 0, ground: 0.34, wb: 2.8, track: 1.62, airborne: false, steer: 0, vy: 0, susp: 0, suspV: 0,
    tilt: { x: 0, z: 0 }, model: { group: new THREE.Group() }, gear: 1, shift: 0, rpm: 0,
  });
  return v;
}
test('wet pavement increases braking distance and reduces lateral tyre grip', () => {
  const dry = car(), wet = car();
  const brake = { throttle: -1, steer: 0, handbrake: false, boost: false };
  dry._car(0.05, brake, flatWorld); wet._car(0.05, brake, { ...flatWorld, wetness: 1 });
  assert.ok(wet.carVf > dry.carVf);
  const drySlide = car(), wetSlide = car(); drySlide.vel.x = wetSlide.vel.x = 8;
  const coast = { throttle: 0, steer: 0, handbrake: false, boost: false };
  drySlide._car(0.05, coast, flatWorld); wetSlide._car(0.05, coast, { ...flatWorld, wetness: 1 });
  assert.ok(wetSlide.vel.x > drySlide.vel.x);
});
test('inner front wheel steers farther and both wheels straighten at neutral', () => {
  const left = new THREE.Group(), right = new THREE.Group(); left.position.x = 0.81; right.position.x = -0.81;
  const P = { wheelbase: 2.8, track: 1.62, wheels: [], pivots: [left, right], steerWheel: new THREE.Group(), headMat: {}, tailMat: {}, headGlow: [], tailGlow: [], beam: { material: {} }, pool: { material: {} } };
  animateCarParts(P, 0.34, 0.016, { steer: 0.4 });
  assert.ok(Math.abs(right.rotation.y) > Math.abs(left.rotation.y));
  animateCarParts(P, 0.34, 0.016, { steer: 0 });
  assert.ok(Math.abs(left.rotation.y) < 1e-10); assert.ok(Math.abs(right.rotation.y) < 1e-10);
});
test('wet pavement dries slowly after the rain stops', () => {
  const w = Object.create(Weather.prototype);
  Object.assign(w, { timer: 600, target: { cloud: 0.3, wind: 4, rain: 0, fog: 0, dir: 70 }, now: { cloud: 0.3, wind: 4, rain: 0, fog: 0, wet: 1 }, rain: { visible: false } });
  const sky = { light: { intensity: 1 }, hemi: { intensity: 1 }, baseLightIntensity: 1, baseHemiIntensity: 1 };
  const clouds = { uniforms: { uCover: {}, uDark: {} } };
  for (let i = 0; i < 200; i++) w.update(0.05, new THREE.PerspectiveCamera(), sky, clouds, null, null);
  assert.ok(w.now.wet > 0.95 && w.now.wet < 1);
});
