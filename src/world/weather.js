// Live weather. Every few minutes the game asks Open-Meteo (free, no key) for
// the real conditions at Kestrel Island's coordinates and applies them: cloud
// cover thins or thickens the cumulus field, the real wind speed and direction
// drift the clouds, sway the trees and roughen the sea, overcast dims the sun
// and thickens the haze, and rain draws falling streaks. If the request fails
// (offline, blocked) the island keeps a mild default: light cloud and breeze.

import * as THREE from 'three';
import { clamp, smoothstep, damp } from '../core/util.js';
import { windUniforms } from './vegetation.js';

const LAT = 20.5, LON = -158.5;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,cloud_cover,precipitation,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
const CODES = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 80: 'rain showers', 81: 'rain showers', 82: 'violent showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };

export class Weather {
  constructor(scene, { rain = 1400 } = {}) {
    this.target = { cloud: 0.3, wind: 4, dir: 70, rain: 0, fog: 0, temp: 27, label: 'default' };
    this.now = { cloud: 0.3, wind: 4, rain: 0, fog: 0 };
    this.live = false;
    this.timer = 0;
    this.loaded = null;
    // Rain: short streaks in a box that follows the camera.
    this.count = rain;
    const pos = new Float32Array(rain * 6), seed = new Float32Array(rain * 3);
    this.rnd = new Float32Array(rain * 3);
    for (let i = 0; i < rain; i++) { this.rnd[i * 3] = Math.random(); this.rnd[i * 3 + 1] = Math.random(); this.rnd[i * 3 + 2] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbfd0e0, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 8;
    scene.add(this.rain);
    this.t = 0;
  }

  async refresh() {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(URL, { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) return;
      const c = (await r.json()).current;
      if (!c) return;
      const code = c.weather_code | 0;
      const wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || c.precipitation > 0.05;
      this.target = {
        cloud: clamp((c.cloud_cover ?? 30) / 100, 0, 1), wind: clamp(c.wind_speed_10m ?? 4, 0, 40), dir: c.wind_direction_10m ?? 70,
        rain: wet ? clamp(0.35 + (c.precipitation || 0) / 4 + (code >= 63 ? 0.25 : 0), 0.3, 1) : 0, fog: code === 45 || code === 48 ? 1 : 0,
        temp: c.temperature_2m, label: CODES[code] || (wet ? 'rain' : 'fair'),
      };
      this.live = true;
      this.loaded = this.target;
    } catch (e) { /* offline: keep the default */ }
  }

  describe() {
    const t = this.target;
    return `${this.live ? 'Live weather' : 'Weather'}: ${t.label}, ${Math.round(t.temp)}°C, wind ${t.wind.toFixed(0)} m/s, cloud ${Math.round(t.cloud * 100)}%`;
  }

  update(dt, camera, sky, clouds, fog, ocean, altitude = 0) {
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 600; this.refresh(); }
    const T = this.target, N = this.now, k = 0.25;
    N.cloud = damp(N.cloud, T.cloud, k, dt); N.wind = damp(N.wind, T.wind, k, dt); N.rain = damp(N.rain, T.rain, 0.4, dt); N.fog = damp(N.fog, T.fog, 0.3, dt);
    const over = smoothstep(0.5, 1, N.cloud);
    // Clouds: coverage, drift with the real wind (it blows towards dir + 180°).
    const to = (T.dir + 180) * Math.PI / 180;
    clouds.wind = { x: Math.sin(to) * N.wind, z: -Math.cos(to) * N.wind };
    clouds.uniforms.uCover.value = clamp(0.1 + N.cloud * 0.95, 0.1, 1);
    clouds.uniforms.uDark.value = over * 0.45 + N.rain * 0.25;
    // Sun and haze under overcast or rain.
    sky.light.intensity *= 1 - 0.5 * over - 0.25 * N.rain;
    sky.hemi.intensity *= 1 - 0.2 * over;
    if (fog) fog.density *= 1 + over * 0.5 + N.rain * 1.2 + N.fog * 6 * (1 - smoothstep(0, 800, altitude));
    // Trees and sea respond to wind.
    windUniforms.uAmp.value = clamp(0.35 + N.wind / 5, 0.3, 2.4);
    if (this.pavedMaterials) for (const m of this.pavedMaterials) { m.material.roughness = m.roughness * (1 - N.rain * 0.6); m.material.color.copy(m.color).multiplyScalar(1 - N.rain * 0.22); }
    if (ocean) ocean.uniforms.uChop.value = clamp(0.55 + N.wind / 8, 0.5, 2);
    // Rain streaks.
    const inten = N.rain * (altitude < 1500 ? 1 : 0);
    this.rain.visible = inten > 0.02;
    if (this.rain.visible) this._rain(dt, camera, inten, N.wind, to);
  }

  _rain(dt, camera, inten, wind, to) {
    this.t += dt;
    const p = this.rain.geometry.attributes.position.array, n = Math.floor(this.count * inten);
    const B = 26, H = 22, fall = 14 + inten * 6;
    const sx = Math.sin(to) * wind * 0.25, sz = -Math.cos(to) * wind * 0.25;
    for (let i = 0; i < n; i++) {
      const r0 = this.rnd[i * 3], r1 = this.rnd[i * 3 + 1], r2 = this.rnd[i * 3 + 2];
      const y = ((r1 * H * 2 - this.t * fall * (0.8 + r2 * 0.4)) % (H * 2) + H * 2) % (H * 2) - H;
      const x = ((r0 * B * 2 + y * -sx / fall * 0 + sx * (1 - (y + H) / (H * 2)) * 2) % (B * 2) + B * 2) % (B * 2) - B;
      const z = ((r2 * B * 2 + sz * (1 - (y + H) / (H * 2)) * 2) % (B * 2) + B * 2) % (B * 2) - B;
      const X = camera.position.x + x, Y = camera.position.y + y, Z = camera.position.z + z;
      p[i * 6] = X; p[i * 6 + 1] = Y; p[i * 6 + 2] = Z;
      p[i * 6 + 3] = X + sx * 0.04; p[i * 6 + 4] = Y + 0.7; p[i * 6 + 5] = Z + sz * 0.04;
    }
    this.rain.geometry.setDrawRange(0, n * 2);
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.material.opacity = 0.35 * inten;
  }
}
