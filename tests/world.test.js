import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findFalls } from '../src/world/nature.js';
import { Weather } from '../src/world/weather.js';
import { LapTimer } from '../src/world/racetrack.js';

// A synthetic mountain: a flat summit shelf, a steady 1.6:1 slope, then flat ground.
const mountain = () => {
  const h = (x, z) => Math.min(300, Math.max(3, 300 - 1.6 * (z + 600)));
  return {
    zones: [], zoneWeight: () => 0,
    heightAt: h,
    normalAt: (x, z, o = new THREE.Vector3()) => o.set(h(x - 2, z) - h(x + 2, z), 4, h(x, z - 2) - h(x, z + 2)).normalize(),
  };
};

test('waterfalls are found on steep slopes with a believable drop', () => {
  const falls = findFalls(mountain(), { count: 4 });
  assert.ok(falls.length >= 1, 'found at least one fall');
  for (const f of falls) {
    assert.ok(f.drop >= 38 && f.drop <= 130, 'drop in range: ' + f.drop);
    assert.ok(f.path.length === 15, 'path has window+1 points');
    // The path runs downhill.
    assert.ok(f.path[0][1] > f.path[f.path.length - 1][1]);
  }
  // Falls are spaced apart.
  for (let i = 0; i < falls.length; i++) for (let j = i + 1; j < falls.length; j++) assert.ok(Math.hypot(falls[i].x - falls[j].x, falls[i].z - falls[j].z) >= 300);
});

test('a forced thunderstorm produces lightning with a flash and a bolt', () => {
  const scene = new THREE.Scene();
  const w = new Weather(scene, { rain: 50 });
  w.setOverride('storm');
  w.now.storm = 1; w.now.rain = 1;
  const strikes = [];
  w.onLightning = (e) => strikes.push(e);
  w.groundAt = () => 20;
  const sky = { light: { intensity: 1 }, hemi: { intensity: 1 }, baseFogDensity: 0.0002 };
  const clouds = { uniforms: { uCover: { value: 0 }, uDark: { value: 0 } } };
  const camera = { position: new THREE.Vector3(0, 30, 0) };
  const fog = { density: 0.0002 };
  let sawFlash = false;
  for (let i = 0; i < 60 * 40 && !strikes.length; i++) { w.update(1 / 60, camera, sky, clouds, fog, null, 30); if (w.flashK > 0.1) sawFlash = true; }
  assert.ok(strikes.length >= 1, 'a strike happened within 40 s');
  assert.ok(strikes[0].dist >= 350 && strikes[0].dist <= 2700);
  assert.ok(w.bolt.visible && w.boltLife > 0);
  assert.ok(w.flashK > 0 || sawFlash);
  // The override can be cleared to return to live weather.
  assert.equal(w.setOverride(null), null);
  // Clear skies never strike.
  const calm = new Weather(new THREE.Scene(), { rain: 10 });
  calm.setOverride('clear'); let n = 0; calm.onLightning = () => n++;
  for (let i = 0; i < 600; i++) calm.update(1 / 60, camera, sky, clouds, fog, null, 30);
  assert.equal(n, 0);
});

test('lap timer counts a lap only after all checkpoints and a second line crossing', () => {
  const race = { width: 15, start: { x: 0, z: 0, dx: 0, dz: 1 }, checkpoints: [{ x: 100, z: 100 }, { x: 0, z: 200 }, { x: -100, z: 100 }] };
  const T = new LapTimer(race); T.best = 0;
  const run = (pts) => { let ev = null; for (const [x, z] of pts) { const e = T.update(x, z, 0.5, true); if (e) ev = e; } return ev; };
  // Approach and cross the line (start).
  assert.equal(run([[0, -20], [0, -4], [0, 4]]).type, 'start');
  // Crossing again without checkpoints does nothing.
  assert.equal(run([[0, -10], [0, 5]]), null);
  // Visit the checkpoints then cross the line: one lap.
  run([[100, 100], [0, 200], [-100, 100], [0, -20]]);
  const lap = run([[0, -3], [0, 3]]);
  assert.equal(lap.type, 'lap'); assert.ok(lap.time > 0);
});
