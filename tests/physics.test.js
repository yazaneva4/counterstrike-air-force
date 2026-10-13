import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/world.js';

const flat = (y = 0.5, extra = {}) => ({
  groundAt: () => y,
  terrain: { heightAt: () => y, normalAt: (x, z, o = new THREE.Vector3()) => o.set(0, 1, 0) },
  structures: { colliders: [], platformAt: () => -Infinity },
  vegetation: { near() {} },
  ...extra,
});
const run = (P, secs, ctx = {}) => { for (let i = 0; i < secs * 60; i++) P.step(1 / 60, ctx); };

test('a dropped crate falls, comes to rest on the ground and sleeps', () => {
  const P = new PhysicsWorld(flat(2), { seaPhysics: false });
  const b = P.add('crate', 0, 0, { y: 6, sleep: false });
  run(P, 4);
  assert.ok(Math.abs(b.p.y - (2 + 0.45)) < 0.06, 'rests half a crate above the ground, got ' + b.p.y);
  assert.equal(b.sleeping, true);
  assert.ok(b.v.length() < 1e-3);
});

test('a ball bounces with restitution and loses energy', () => {
  const P = new PhysicsWorld(flat(0), { seaPhysics: false });
  const b = P.add('ball', 0, 0, { y: 4, sleep: false });
  let peak1 = 0, hit = false, peak2 = 0;
  for (let i = 0; i < 60 * 5; i++) {
    P.step(1 / 60);
    if (!hit && b.v.y > 0.5) hit = true;
    if (hit) { if (b.v.y > 0) { peak1 = Math.max(peak1, b.p.y); } }
  }
  assert.ok(hit, 'ball bounced');
  assert.ok(peak1 < 4 && peak1 > 0.8, 'first rebound lower than drop height: ' + peak1);
  void peak2;
});

test('a barrel set on a steep slope rolls downhill', () => {
  const slope = { groundAt: (x) => -x * 0.6, terrain: { heightAt: (x) => -x * 0.6, normalAt: (x, z, o = new THREE.Vector3()) => o.set(0.6, 1, 0).normalize() }, structures: { colliders: [], platformAt: () => -Infinity }, vegetation: { near() {} } };
  const P = new PhysicsWorld(slope, { seaPhysics: false });
  const barrel = P.add('barrel', 0, 0, { sleep: false, roll: Math.PI / 2 });
  run(P, 3);
  assert.ok(barrel.p.x > 0.4, 'barrel travelled downhill: ' + barrel.p.x);
  assert.ok(Number.isFinite(barrel.p.y) && Number.isFinite(barrel.q.w));
});

test('floating props bob at the surface instead of sinking', () => {
  const sea = { groundAt: () => -20, terrain: { heightAt: () => -20, normalAt: (x, z, o = new THREE.Vector3()) => o.set(0, 1, 0) }, structures: { colliders: [], platformAt: () => -Infinity }, vegetation: { near() {} } };
  const P = new PhysicsWorld(sea);
  const b = P.add('barrel', 0, 0, { y: 2, sleep: false });
  run(P, 8);
  assert.ok(b.p.y > -0.7 && b.p.y < 0.7, 'floats near the surface: ' + b.p.y);
  assert.equal(b.sleeping, false, 'floating bodies never sleep');
});

test('a moving car shoves a crate away and tumbles it', () => {
  const P = new PhysicsWorld(flat(0), { seaPhysics: false });
  const crate = P.add('crate', 0, 6, { sleep: true });
  const car = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, half: [1, 0.7, 2.2], vel: new THREE.Vector3(0, 0, 18) };
  for (let i = 0; i < 90; i++) { car.pos.z += 18 / 60; P.step(1 / 60, { kinematics: [car] }); }
  assert.ok(crate.p.z > 4, 'crate was pushed ahead of the car: ' + crate.p.z);
  assert.ok(crate.v.length() > 1 || crate.p.z > 8);
});

test('an explosion launches nearby bodies and leaves distant ones asleep', () => {
  const P = new PhysicsWorld(flat(0), { seaPhysics: false });
  const near = P.add('barrel', 3, 0), far = P.add('barrel', 90, 0);
  P.explode(new THREE.Vector3(0, 0, 0), { radius: 30, strength: 16 });
  assert.equal(near.sleeping, false); assert.ok(near.v.length() > 3);
  assert.equal(far.sleeping, true);
});

test('bodies are stopped by static building colliders', () => {
  const w = flat(0, { structures: { colliders: [{ x: 5, z: 0, hw: 1, hd: 4, rot: 0, c: 1, s: 0, top: 10, bottom: -5 }], platformAt: () => -Infinity } });
  const P = new PhysicsWorld(w, { seaPhysics: false });
  const b = P.add('crate', 0, 0, { sleep: false });
  b.v.set(12, 0, 0);
  run(P, 3);
  assert.ok(b.p.x < 4.1, 'did not tunnel through the wall: ' + b.p.x);
});

test('debris is temporary and the body list stays bounded', () => {
  const P = new PhysicsWorld(flat(0), { seaPhysics: false });
  P.debris(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 0, 10), { count: 12 });
  assert.equal(P.bodies.length, 12);
  run(P, 45);
  assert.equal(P.bodies.length, 0, 'debris expired');
});

test('low gravity makes the same drop slower (Moon)', () => {
  const earth = new PhysicsWorld(flat(0), { seaPhysics: false });
  const moon = new PhysicsWorld(flat(0, { gravity: 0.165 }), { seaPhysics: false });
  const a = earth.add('ball', 0, 0, { y: 10, sleep: false }), m = moon.add('ball', 0, 0, { y: 10, sleep: false });
  for (let i = 0; i < 60; i++) { earth.step(1 / 60); moon.step(1 / 60); }
  assert.ok(m.p.y > a.p.y + 3, 'lunar ball has fallen less: ' + m.p.y + ' vs ' + a.p.y);
});

test('an awake body knocks into a sleeping body with a lower id and moves it', () => {
  const P = new PhysicsWorld(flat(0), { seaPhysics: false });
  const resting = P.add('crate', 3, 0, { sleep: true });              // lower id, asleep
  const ball = P.add('crate', 0, 0, { sleep: false });
  ball.v.set(9, 0, 0);
  run(P, 2);
  assert.ok(resting.p.x > 3.2, 'the sleeper was woken and shoved: ' + resting.p.x);
  assert.ok(ball.p.x < resting.p.x + 0.2, 'the mover did not pass through it');
});

test('ground friction brings a sliding crate to rest at a plausible distance', () => {
  const P = new PhysicsWorld(flat(0), { seaPhysics: false });
  const b = P.add('crate', 0, 0, { sleep: false });
  b.v.set(4, 0, 0);
  run(P, 5);
  const d = b.p.x;
  // mu 0.65: v^2 / (2 mu g) is about 1.3 m; allow for tumbling and the discrete contacts.
  assert.ok(d > 0.6 && d < 4, 'slid a plausible distance: ' + d);
  assert.ok(b.v.length() < 0.05, 'and stopped');
});

test('props do not feel wind in a vacuum', () => {
  const P = new PhysicsWorld(flat(0, { air: 0, gravity: 0.165 }), { seaPhysics: false });
  P.wind.set(20, 0, 0);
  const ball = P.add('ball', 0, 0, { sleep: false, y: 0.3 });
  run(P, 3);
  assert.ok(Math.abs(ball.p.x) < 0.5, 'ball stayed put: ' + ball.p.x);
});
