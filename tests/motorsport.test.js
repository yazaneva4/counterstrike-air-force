import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { renderPlan } from '../src/core/resolution.js';
import { PostFX } from '../src/fx/postfx.js';
import { Vehicle, VEHICLE_DEFS } from '../src/vehicles/vehicles.js';
import { Player } from '../src/player.js';
import { SkidMarks } from '../src/fx/skidmarks.js';
import { RemotePlayer } from '../src/net/remote.js';

const world = {
  groundAt: () => 0, terrain: { normalAt: () => new THREE.Vector3(0, 1, 0), heightAt: () => 0 },
  structures: { roadAt: () => true, collide: () => false, platformAt: () => -Infinity },
  vegetation: { near() {} },
};
function car(type = 'drift', speed = 20) {
  const v = Object.create(Vehicle.prototype);
  Object.assign(v, {
    id: 'test-car', kind: 'car', def: VEHICLE_DEFS[type], pos: new THREE.Vector3(0, 0.345, 0),
    vel: new THREE.Vector3(0, 0, speed), quat: new THREE.Quaternion(), heading: 0, wb: 2.68, track: 1.76,
    ground: 0.345, airborne: false, steer: 0, vy: 0, susp: 0, suspV: 0, tilt: { x: 0, z: 0 },
    model: { group: new THREE.Group(), spec: { tyreW: 0.265, eye: [0.42, 0.83, -0.34] } },
    gear: 1, shift: 0, rpm: 0, camDist: 8.5, camHeight: 2.4, parts: { pilot: { root: new THREE.Group() } },
  });
  return v;
}
function driver(v) {
  const p = Object.create(Player.prototype);
  const input = { consumeLook: () => ({ dx: 200, dy: -50 }), moveAxes: () => ({ x: 0, y: 0 }), arrows: () => ({ x: 0, y: 0 }), down: () => false, hit: () => false, tdown: () => false, thit: () => false, mouseRight: false };
  Object.assign(p, { root: new THREE.Group(), vehicle: v, mode: 'vehicle', cockpit: true, lookYaw: 0, lookPitch: 0, stick: { x: 0, y: 0 }, fov: 70, shake: 0, camPos: new THREE.Vector3(), game: { input, settings: { sensitivity: 1, invertY: false }, space: { active: false }, world, camera: new THREE.PerspectiveCamera(), hud: { toast() {} } } });
  return p;
}

test('4K stays at 3840×2160 across device DPR and adaptive scale', () => {
  for (const dpr of [1, 2, 3]) for (const scale of [0.55, 1]) {
    const p = renderPlan(1920, 1080, { quality: '4k', dpr, scale });
    assert.equal(p.width, 3840); assert.equal(p.height, 2160); assert.equal(p.locked, true);
  }
  assert.deepEqual([renderPlan(1080, 1920, { quality: '4k' }).width, renderPlan(1080, 1920, { quality: '4k' }).height], [2160, 3840]);
  const limited = renderPlan(1920, 1080, { quality: '4k', maxDimension: 2048 });
  assert.equal(limited.width, 2048); assert.equal(limited.limited, true);
  assert.ok(renderPlan(1920, 1080, { quality: 'high', scale: 0.55 }).width < 1920);
});

test('post-processing follows resolution changes instead of retaining its old DPR', () => {
  const post = Object.create(PostFX.prototype); const sizes = [], ratios = [];
  Object.assign(post, { enabled: true, pixelRatio: 1, renderer: { getPixelRatio: () => 2 }, composer: { setPixelRatio: p => ratios.push(p), setSize: (w, h) => sizes.push([w, h]) }, grade: { uniforms: { uRes: { value: new THREE.Vector2() } } } });
  post.setSize(1920, 1080);
  assert.deepEqual(ratios, [2]); assert.deepEqual(sizes, [[1920, 1080]]);
  assert.equal(post.grade.uniforms.uRes.value.x, 3840); assert.equal(post.grade.uniforms.uRes.value.y, 2160);
});

test('handbrake initiates a drift and countersteering recovers the car', () => {
  const v = car();
  for (let i = 0; i < 90; i++) v._car(1 / 120, { throttle: 1, steer: 1, handbrake: i < 45, boost: true }, world);
  const peak = Math.abs(v.driftAngle);
  assert.ok(peak > 0.3 && peak < 1.2); assert.equal(v.drifting, true); assert.ok(v.speed > 10);
  for (let i = 0; i < 240; i++) v._car(1 / 120, { throttle: 0.35, steer: -Math.sign(v.driftAngle) * Math.min(1, Math.abs(v.driftAngle) * 2), handbrake: false }, world);
  assert.ok(Math.abs(v.driftAngle) < peak * 0.4); assert.ok(v.speed > 5);
});
test('race car has higher grip, settles straight and reversing does not spin it', () => {
  assert.ok(VEHICLE_DEFS.gtr.mu > VEHICLE_DEFS.drift.mu);
  assert.ok(VEHICLE_DEFS.gtr.maxSpeed > VEHICLE_DEFS.gt.maxSpeed);
  for (const speed of [0, 20, -5]) {
    const v = car('gtr', speed);
    for (let i = 0; i < 300; i++) v._car(1 / 120, { throttle: speed < 0 ? -0.5 : 0.5, steer: 0, handbrake: false }, world);
    assert.ok(Math.abs(v.heading) < 1e-10); assert.ok(Math.abs(v.driftAngle) < 1e-10);
    assert.ok(Number.isFinite(v.pos.y)); assert.equal(v.drifting, false);
  }
});
test('car cockpit looks with the mouse, respects invert and follows the updated chassis', () => {
  const v = car(), p = driver(v);
  p._drive(1 / 60);
  assert.ok(p.lookYaw < 0); assert.ok(p.lookPitch > 0);
  p.lookPitch = 0; p.game.settings.invertY = true; p._drive(1 / 60); assert.ok(p.lookPitch < 0);
  p.lookYaw = p.lookPitch = 0; v.pos.set(12, 3, 40); v.model.group.position.y = 0.08;
  p._vehicleCamera(1 / 60);
  assert.ok(p.game.camera.position.distanceTo(new THREE.Vector3(12.42, 3.91, 39.66)) < 1e-8);
  assert.ok(p.game.camera.getWorldDirection(new THREE.Vector3()).z > 0.99);
  assert.equal(v.parts.pilot.root.visible, false); assert.equal(p.game.camera.near, 0.05); assert.equal(p.fov, 70);
  p.toggleView(); assert.equal(v.parts.pilot.root.visible, true); assert.equal(p.game.camera.near, 0.3);
  p.toggleView(); assert.equal(p.lookPitch, 0.07); assert.ok(p.game.camera.getWorldDirection(new THREE.Vector3()).y > 0);
});
test('invalid car inputs stay finite instead of poisoning vehicle telemetry', () => {
  const v = car('gtr');
  v._car(1 / 60, { throttle: NaN, steer: NaN, handbrake: false, boost: false }, world);
  assert.ok([v.speed, v.carVf, v.heading, v.steer, v.rpm, v.driftAngle, v.pos.x, v.pos.z].every(Number.isFinite));
  const before = v.pos.clone();
  v._car(NaN, { throttle: 1, steer: 1 }, world);
  assert.ok(v.pos.distanceTo(before) < 1e-12);
});

test('third-person camera recovers from invalid speed and FOV telemetry', () => {
  const v = car('gtr'); v.speed = NaN;
  const p = driver(v); p.cockpit = false; p.fov = NaN; p.game.camera.fov = NaN;
  p._vehicleCamera(1 / 60);
  assert.ok(Number.isFinite(p.fov));
  assert.ok([p.game.camera.position.x, p.game.camera.position.y, p.game.camera.position.z].every(Number.isFinite));
});

test('boarding clears the nearby-vehicle prompt immediately', () => {
  const v = { pos: new THREE.Vector3(0, 0, 0), radius: 2.4, def: { name: 'Test car', role: 'Car' }, destroyed: false, occupied: false, locked: false };
  const prompts = [];
  const p = Object.create(Player.prototype);
  Object.assign(p, { root: new THREE.Group(), game: {
    vehicles: [v], input: { hit: key => key === 'KeyF', thit: () => false },
    npcs: { nearest: () => null }, hud: { prompt: value => prompts.push(value) },
  } });
  p.enter = car => { car.occupied = true; };
  p._interactions();
  assert.equal(v.occupied, true);
  assert.equal(prompts.at(-1), null);
});

test('skid ribbons break at grip recovery, expire and cannot grow without bound', () => {
  const marks = new SkidMarks(new THREE.Scene(), { capacity: 8, lifetime: 1 }), v = car();
  v.onGround = true; v.skid = 1; v.speed = 20;
  marks.update(0.01, v, world);
  for (let i = 0; i < 12; i++) { v.pos.z += 0.2; marks.update(0.01, v, world); }
  assert.ok(marks.alpha.some(a => a > 0)); assert.equal(marks.positions.length, 8 * 18);
  v.skid = 0; marks.update(0.01, v, world); assert.equal(marks.last, null);
  marks.update(1.1, null, world); assert.ok(marks.alpha.every(a => a === 0));
  marks.update(0.01, v, { ...world, structures: { ...world.structures, roadAt: () => false } }); assert.equal(marks.last, null);
});

test('race-car network snapshots preserve livery and visible steering state', () => {
  const v = car('gtr'), p = driver(v);
  v.type = 'gtr'; v.color = 0xd8d8d4; v.throttle = 0.8; v.steer = 0.2; v.carVf = 20;
  p.human = { speed: 0, state: 'pilot' }; p.name = 'Racer'; p.character = 'pilot'; p.skinIndex = 1; p.game.location = 'earth';
  const state = p.netState();
  assert.equal(state.v, 'gtr'); assert.equal(state.cc, 0xd8d8d4); assert.deepEqual(state.cv, [20, 0.2, 0, 0]);
  const remote = new RemotePlayer(new THREE.Scene(), 'racer', 'Racer', 0xffffff);
  const types = []; remote._ensureHuman = () => {}; remote._ensureVehicle = type => types.push(type);
  remote.apply(state); assert.deepEqual(types, ['gtr']);
});
