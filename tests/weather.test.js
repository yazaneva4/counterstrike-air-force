import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Weather } from '../src/world/weather.js';

function sampleCurrent() {
  return {
    temperature_2m: 25,
    cloud_cover: 60,
    precipitation: 0,
    weather_code: 2,
    wind_speed_10m: 6,
    wind_direction_10m: 135,
  };
}

function makeWeather(t) {
  const weather = new Weather(new THREE.Scene(), { rain: 0 });
  t.after(() => {
    weather.rain.geometry.dispose();
    weather.rain.material.dispose();
  });
  return weather;
}

test('live weather refreshes cache-free data and schedules the next update', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (_url, options) => {
    request = options;
    return { ok: true, json: async () => ({ current: sampleCurrent() }) };
  };

  const weather = makeWeather(t);
  assert.equal(await weather.refresh(), true);
  assert.equal(request.cache, 'no-store');
  assert.equal(weather.live, true);
  assert.equal(weather.target.wind, 6);
  assert.equal(weather.timer, 300);
  assert.ok(weather.updatedAt > 0);
});

test('failed live weather requests retry quickly and recover on the next poll', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error('offline'); };

  const weather = makeWeather(t);
  assert.equal(await weather.refresh(), false);
  assert.equal(weather.live, false);
  assert.equal(weather.timer, 30);

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ current: sampleCurrent() }) });
  assert.equal(await weather.refresh(), true);
  assert.equal(weather.live, true);
  assert.equal(weather.timer, 300);
});
