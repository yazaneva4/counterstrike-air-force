import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Input } from '../src/core/input.js';
import { Player } from '../src/player.js';
import { Game } from '../src/game.js';
import { Vehicle, VEHICLE_DEFS } from '../src/vehicles/vehicles.js';
import { coordinatedTurnRate, bankedStallSpeed } from '../src/vehicles/flight.js';

const flatWorld = {
  groundAt: () => 0,
  terrain: { heightAt: () => 0, normalAt: () => new THREE.Vector3(0, 1, 0) },
  structures: { collide: () => false, platformAt: () => -Infinity },
  vegetation: { near: () => {} },
};
const neutral = { throttle: 0, pitch: 0, roll: 0, yaw: 0, boost: false };
function plane(speed = 100, type = 'jet') {
  const v = Object.create(Vehicle.prototype);
  Object.assign(v, { def: VEHICLE_DEFS[type], type, pos: new THREE.Vector3(0, 1000, 0), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), heading: 0, pitch: 0, onGround: false, speed, throttle: 0, ground: 2, radius: 6, gearDown: false });
  return v;
}
const FIXED_WING_TYPES = ['jet', 'prop', 'nova'];
function inputFixture() {
  globalThis.addEventListener = () => {};
  globalThis.document = { getElementById: () => null, addEventListener: () => {} };
  let pad = null;
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pad ? [pad] : [] }, configurable: true });
  const input = new Input({ addEventListener: () => {}, requestPointerLock: () => Promise.resolve() });
  return { input, setPad: p => { pad = p; } };
}

test('banked turns widen with speed and raise stall speed', () => {
  assert.equal(coordinatedTurnRate(100, 0), 0);
  assert.ok(Math.abs(coordinatedTurnRate(100, Math.PI / 4) - 0.0981) < 1e-6);
  assert.equal(coordinatedTurnRate(200, 0.5), coordinatedTurnRate(100, 0.5) / 2);
  assert.ok(bankedStallSpeed(58, Math.PI / 3) > 81);
  assert.ok(Number.isFinite(coordinatedTurnRate(0, Math.PI / 2)));
});
test('right input banks and turns right in every fixed-wing aircraft', () => {
  for (const type of FIXED_WING_TYPES) {
    const v = plane(Math.max(100, VEHICLE_DEFS[type].stall * 1.5), type);
    v._plane(0.1, { ...neutral, roll: 1 }, flatWorld);
    assert.ok(v.bankAngle() < 0, `${type}: right input should lower the right wing`);
    v._plane(0.1, neutral, flatWorld);
    assert.ok(v.headingAngle() > 0, `${type}: right bank should turn right`);
  }
});
test('right rudder and taxi input turn right in every fixed-wing aircraft', () => {
  for (const type of FIXED_WING_TYPES) {
    const airborne = plane(100, type);
    airborne._plane(0.1, { ...neutral, yaw: 1 }, flatWorld);
    assert.ok(airborne.headingAngle() > 0, `${type}: right rudder should turn right`);
    const taxiing = plane(20, type);
    taxiing.onGround = true;
    taxiing._plane(0.1, { ...neutral, roll: 1 }, flatWorld);
    assert.ok(taxiing.heading > 0, `${type}: right taxi input should turn right`);
  }
});
test('automatic bank recovery levels all fixed-wing aircraft', () => {
  for (const type of FIXED_WING_TYPES) {
    const v = plane(Math.max(100, VEHICLE_DEFS[type].stall * 1.5), type);
    v.quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.35);
    const before = Math.abs(v.bankAngle());
    for (let i = 0; i < 12; i++) v._plane(0.05, neutral, flatWorld);
    assert.ok(Math.abs(v.bankAngle()) < before, `${type}: neutral controls should reduce bank`);
    assert.ok([v.pos.x, v.pos.y, v.pos.z, v.speed].every(Number.isFinite), `${type}: flight state must stay finite`);
  }
});
test('flight controls animate the visible control surfaces on every fixed-wing aircraft', () => {
  for (const type of FIXED_WING_TYPES) {
    const left = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.5)); left.position.x = 1;
    const right = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.5)); right.position.x = -1;
    const elevator = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.5));
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.5));
    const v = plane(100, type);
    v.parts = { flightSurfaces: { ailerons: [left, right], elevators: [elevator], rudder } };
    v.flightControls = { roll: 1, pitch: 1, yaw: 1 };
    v._animate(0.5, { night: 0 });
    assert.ok(left.rotation.x < 0 && right.rotation.x > 0, `${type}: ailerons should oppose each other`);
    assert.ok(elevator.rotation.x > 0, `${type}: elevator should respond to pitch`);
    assert.ok(rudder.rotation.y > 0, `${type}: rudder should respond to yaw`);
  }
});
test('airborne wind drifts the aircraft without changing indicated airspeed', () => {
  const calm = plane(), windy = plane();
  calm._plane(0.05, neutral, flatWorld);
  windy._plane(0.05, neutral, { ...flatWorld, wind: { x: 8, z: -3 } });
  assert.ok(Math.abs(windy.pos.x - calm.pos.x - 0.4) < 1e-8);
  assert.ok(Math.abs(windy.pos.z - calm.pos.z + 0.15) < 1e-8);
  assert.equal(windy.speed, calm.speed);
});
test('takeoff from a cliff retains height instead of snapping onto the valley floor', () => {
  const v = plane(100); v.onGround = true; v.pos.set(0, 102, 0); v.heading = v.pitch = 0;
  const world = { ...flatWorld, groundAt: (x, z) => z < 1 ? 100 : 0 };
  v._plane(0.05, neutral, world);
  assert.equal(v.onGround, false); assert.equal(v.pos.y, 102);
});
test('slow taxi into ocean also ditches the plane', () => {
  const v = plane(1); v.onGround = true; v.heading = v.pitch = 0;
  assert.equal(v._plane(0.05, neutral, { ...flatWorld, terrain: { ...flatWorld.terrain, heightAt: () => -10 } }), 'water');
});
test('pad release and disconnect cannot release a physically held keyboard key', () => {
  const { input, setPad } = inputFixture();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { connected: true, axes: [0, -1, 0, 0], buttons };
  input.held.add('KeyW'); setPad(pad); input.poll(1 / 60);
  pad.axes[1] = 0; input.poll(1 / 60); assert.equal(input.down('KeyW'), true);
  pad.axes[1] = -1; input.poll(1 / 60); setPad(null); input.poll(1 / 60); assert.equal(input.down('KeyW'), true);
});
test('disabled controls block touch, analog movement and look; clear releases everything', () => {
  const { input } = inputFixture(); input.touch.active = true; input.touch.x = 1; input.touchButtons.add('up'); input.mouseDX = 60; input.enabled = false;
  assert.deepEqual(input.moveAxes(), { x: 0, y: 0 }); assert.equal(input.tdown('up'), false); assert.deepEqual(input.consumeLook(), { dx: 0, dy: 0 });
  input.mouseLeft = input.dragging = true; input.held.add('Space'); input.clear();
  assert.equal(input.mouseLeft, false); assert.equal(input.dragging, false); assert.equal(input.held.size, 0); assert.equal(input.touch.active, false);
});
test('requesting pointer lock does not fire or drag', () => {
  const { input } = inputFixture(); input.requestLock(); assert.equal(input.mouseLeft, false); assert.equal(input.dragging, false); assert.equal(input.hit('Mouse0'), false);
});
test('first person follows the eyes and forward direction, third person restores the body', () => {
  const p = Object.create(Player.prototype);
  Object.assign(p, { root: new THREE.Group(), mode: 'foot', cockpit: true, swimming: false, camDist: 5.2, camYaw: 0, camPitch: 0, camPos: new THREE.Vector3(), fov: 62, shake: 0, game: { camera: new THREE.PerspectiveCamera(), world: flatWorld } });
  p._footCamera(1 / 60);
  assert.equal(p.root.visible, false); assert.equal(p.game.camera.position.y, 1.65);
  assert.ok(p.game.camera.getWorldDirection(new THREE.Vector3()).z > 0.99);
  p.cockpit = false; p._footCamera(1); assert.equal(p.root.visible, true); assert.ok(p.game.camera.position.z < -5);
});
test('vehicle exit completes without running the vehicle camera on null', () => {
  const { input } = inputFixture(); input.pressed.add('KeyF');
  const p = Object.create(Player.prototype);
  let footCamera = false;
  Object.assign(p, { vehicle: { kind: 'heli', destroyed: false }, stick: { x: 0, y: 0 }, lookYaw: 0, lookPitch: 0, game: { input, settings: { sensitivity: 1 }, space: { active: false } }, exitVehicle() { this.vehicle = null; }, _footCamera() { footCamera = true; }, _vehicleCamera() { throw new Error('camera after exit'); } });
  p._drive(0.016); assert.equal(footCamera, true);
});
test('orbit transitions end the terrestrial frame before moving any craft', () => {
  const g = Object.create(Game.prototype); let ended = false;
  Object.assign(g, { location: 'earth', world: {}, sky: { night: 0 }, space: { active: false }, input: { endFrame() { ended = true; } }, _hotkeys() {}, player: { update() { g.location = 'space'; } }, vehicles: [{ update() { throw new Error('Earth physics ran in orbit'); } }] });
  g.frame(0.016, 1); assert.equal(ended, true);
});
test('surface transitions also end before the old surface updates', () => {
  const g = Object.create(Game.prototype); let ended = false;
  Object.assign(g, { location: 'moon', surface: { body: 'moon' }, space: { active: false }, input: { endFrame() { ended = true; } }, player: { update() { g.space.active = true; } }, sky: { advance() { throw new Error('surface continued'); } } });
  g._surfaceFrame(0.016, 1); assert.equal(ended, true);
});
test('cockpit animation keeps the local pilot hidden', () => {
  const v = plane(); v.parts = { pilot: { root: { visible: true } } }; v.occupied = true; v.hidePilot = true;
  v._animate(0.016, { night: 0 }); assert.equal(v.parts.pilot.root.visible, false);
  v.hidePilot = false; v._animate(0.016, { night: 0 }); assert.equal(v.parts.pilot.root.visible, true);
});
test('a cliff departure over the sea stays airborne instead of ditching at altitude', () => {
  const v = plane(100); v.onGround = true; v.pos.set(0, 102, 0); v.heading = v.pitch = 0;
  const world = { ...flatWorld, groundAt: (x, z) => z < 1 ? 100 : -40, terrain: { ...flatWorld.terrain, heightAt: () => -40 } };
  assert.equal(v._plane(0.05, neutral, world), null); assert.equal(v.onGround, false); assert.equal(v.pos.y, 102);
});
test('third-person camera shortens at a wall', () => {
  const p = Object.create(Player.prototype);
  const world = { ...flatWorld, structures: { ...flatWorld.structures, collide: (pos) => pos.z < -2 } };
  Object.assign(p, { root: new THREE.Group(), mode: 'foot', cockpit: false, swimming: false, camDist: 5.2, camYaw: 0, camPitch: 0, camPos: new THREE.Vector3(), fov: 62, shake: 0, game: { camera: new THREE.PerspectiveCamera(), world } });
  p._footCamera(1); assert.ok(p.game.camera.position.z > -2); assert.ok(p.game.camera.position.z < -1);
});
test('bank raises actual stall onset at the same airspeed', () => {
  const level = plane(70), banked = plane(70);
  banked.quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3);
  level._plane(0.05, neutral, flatWorld); banked._plane(0.05, neutral, flatWorld);
  assert.equal(level.stalling, false); assert.equal(banked.stalling, true); assert.ok(banked.vel.y < level.vel.y);
});
test('orbit camera switches between forward first-person and an external chase view', async () => {
  const { Space } = await import('../src/space/space.js');
  const s = Object.create(Space.prototype);
  const group = new THREE.Group(); group.position.set(0, 1400, 0);
  Object.assign(s, { t: 0, earth: { update() {}, group: new THREE.Group() }, mars: { update() {} }, craft: group, station: new THREE.Group(), sats: [], _traffic() {}, marker: { material: {} }, warp: null, vel: new THREE.Vector3(), cam: { back: 34, up: 11, look: 3 }, starDome: new THREE.Group(), stars: new THREE.Group(), tunnel: new THREE.Group() });
  s.station.userData.blink = { material: {} };
  const cam = new THREE.PerspectiveCamera();
  s.update(0.016, { ...neutral, moveY: 0, up: 0, down: 0, firstPerson: true }, cam);
  assert.ok(cam.position.z > 0); assert.ok(cam.getWorldDirection(new THREE.Vector3()).z > 0.99);
  s.update(1, { ...neutral, moveY: 0, up: 0, down: 0, firstPerson: false }, cam);
  assert.ok(cam.position.z < -30);
});
test('pause renders the current scene without running Earth-specific effects', () => {
  const g = Object.create(Game.prototype); let rendered = false, ended = false;
  Object.assign(g, { paused: true, _hotkeys() {}, post: { render() { rendered = true; } }, input: { endFrame() { ended = true; } }, _render() { throw new Error('Earth render path used in space'); } });
  g.frame(0.016, 1); assert.equal(rendered, true); assert.equal(ended, true);
});
test('rain wets pavement without progressively multiplying its color and roughness', async () => {
  const { Weather } = await import('../src/world/weather.js');
  const w = Object.create(Weather.prototype);
  const material = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 });
  Object.assign(w, { timer: 600, target: { cloud: 1, wind: 8, rain: 1, fog: 0, dir: 90 }, now: { cloud: 1, wind: 8, rain: 1, fog: 0, wet: 1 }, pavedMaterials: [{ material, color: material.color.clone(), roughness: 0.9 }], rain: { visible: false } });
  const sky = { light: { intensity: 1 }, hemi: { intensity: 1 }, baseLightIntensity: 1, baseHemiIntensity: 1, baseFogDensity: 0.001 }, clouds = { uniforms: { uCover: {}, uDark: {} } };
  const fog = { density: 0.001 };
  w.update(0.016, new THREE.PerspectiveCamera(), sky, clouds, fog, null, 2000);
  const color = material.color.r, roughness = material.roughness, light = sky.light.intensity, hemi = sky.hemi.intensity, density = fog.density;
  assert.ok(roughness < 0.4); assert.ok(color < w.pavedMaterials[0].color.r);
  w.update(0.016, new THREE.PerspectiveCamera(), sky, clouds, fog, null, 2000);
  assert.equal(material.roughness, roughness); assert.equal(material.color.r, color);
  assert.equal(sky.light.intensity, light); assert.equal(sky.hemi.intensity, hemi); assert.equal(fog.density, density);
});
test('rain streaks fall down through the camera volume', async () => {
  const { Weather } = await import('../src/world/weather.js');
  const w = Object.create(Weather.prototype);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  Object.assign(w, { count: 1, rnd: new Float32Array([0.5, 0.5, 0.5]), t: 0, rain: new THREE.LineSegments(geometry, new THREE.LineBasicMaterial()) });
  w._rain(0.016, new THREE.PerspectiveCamera(), 1, 4, 0);
  const p = geometry.attributes.position.array;
  assert.ok(p[4] < p[1]);
});
test('analog gamepad movement remains analog past the digital throttle threshold', () => {
  const { input, setPad } = inputFixture();
  setPad({ connected: true, axes: [0, -0.7, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) });
  input.poll(0.016);
  assert.equal(input.down('KeyW'), true);
  assert.ok(Math.abs(input.moveAxes().y - (0.7 - 0.16) / 0.84) < 1e-8);
});
