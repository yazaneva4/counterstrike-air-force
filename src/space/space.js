// Space. Climb out of the atmosphere in the Visitor Craft, the Odyssey
// spaceplane or the Aurora rocket and the island falls away: the whole Earth
// hangs below, lit by the same sun as your time of day, with an orbiting
// station, satellites and Kestrel Space traffic. Warp to the Moon or Mars (1,
// 2, 3), dive towards their surfaces to land, or dive back into Earth's
// atmosphere to return home.

import * as THREE from 'three';
import { createEarth, latLonToVector } from './globe.js';
import { createMoonBody, createMarsBody, createStarDome } from './bodies.js';
import { buildShip } from '../vehicles/spacecraft.js';
import { glowSprite, glowTexture, canvasTexture, clamp, smoothstep } from '../core/util.js';

export const EARTH_R = 1000;
export const ISLAND_LATLON = [20.5, -158.5];
export const BODIES = {
  earth: { id: 'earth', name: 'Earth', pos: new THREE.Vector3(0, 0, 0), r: EARTH_R, key: '1' },
  moon: { id: 'moon', name: 'The Moon', pos: new THREE.Vector3(-6200, 1400, -5400), r: 270, key: '2' },
  mars: { id: 'mars', name: 'Mars', pos: new THREE.Vector3(16000, -2500, -15000), r: 560, key: '3' },
};

const tv = new THREE.Vector3(), tq = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function makeStars(n = 2500, r = 60000) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(r);
    pos.set([v.x, v.y, v.z], i * 3);
    const w = Math.random();
    const b = 0.35 + Math.pow(Math.random(), 5) * 2.2;
    col.set(w < 0.15 ? [b, b * 0.8, b * 0.6] : w > 0.85 ? [b * 0.7, b * 0.85, b] : [b, b, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

function makeStation() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 1, roughness: 0.3 });
  const panelTex = canvasTexture(64, 256, (x) => {
    x.fillStyle = '#132a4a'; x.fillRect(0, 0, 64, 256);
    x.strokeStyle = '#6a8ab8'; x.lineWidth = 1;
    for (let i = 0; i < 256; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
    x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 256); x.stroke();
  });
  const panel = new THREE.MeshStandardMaterial({ map: panelTex, metalness: 0.7, roughness: 0.25, emissive: 0x0a1830, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(60, 1.6, 1.6), white));
  for (const x of [-26, -18, 18, 26]) for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 22), panel); p.position.set(x, 0, s * 13); g.add(p);
  }
  const mod = new THREE.CylinderGeometry(2, 2, 14, 16); mod.rotateX(Math.PI / 2);
  const m1 = new THREE.Mesh(mod, white); m1.position.set(0, -3, 0); g.add(m1);
  const m2 = new THREE.Mesh(mod, gold); m2.position.set(0, -3, 12); m2.scale.set(0.8, 0.8, 0.6); g.add(m2);
  const m3 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), white); m3.position.set(0, -3, -8); g.add(m3);
  const blink = glowSprite(0xff4040, 6); blink.position.set(30, 1, 0); g.add(blink);
  g.userData.blink = blink;
  g.scale.setScalar(0.5);
  return g;
}

// Streaks that rush past the camera during a warp jump.
function makeWarpTunnel() {
  const tex = canvasTexture(256, 1024, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w, y = Math.random() * h, len = 40 + Math.random() * 260;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      const c = Math.random() < 0.2 ? '170,200,255' : '255,255,255';
      g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},${0.3 + Math.random() * 0.6})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(x, y, 1 + Math.random() * 2, len);
    }
  }, { repeat: true, srgb: false });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  const geo = new THREE.CylinderGeometry(26, 26, 900, 32, 1, true);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  m.renderOrder = 20;
  return m;
}

export class Space {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.starDome = createStarDome();
    this.scene.add(this.starDome);
    this.stars = makeStars();
    this.scene.add(this.stars);
    this.earth = createEarth(EARTH_R, renderer, { segments: 128 });
    this.scene.add(this.earth.group);
    const B = BODIES;
    this.moon = createMoonBody(B.moon.r);
    this.moonPos = B.moon.pos;
    this.moon.mesh.position.copy(this.moonPos);
    this.moon.mesh.rotation.y = 2.2;
    this.scene.add(this.moon.mesh);
    this.mars = createMarsBody(B.mars.r);
    this.mars.group.position.copy(B.mars.pos);
    this.scene.add(this.mars.group);
    // A black monolith on the lunar surface: a hint visible from orbit (you must land to study it).
    const lm = new THREE.Mesh(new THREE.BoxGeometry(3, 27, 12), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.7 }));
    const onMoon = new THREE.Vector3(0.6, 0.55, 0.58).normalize();
    lm.position.copy(this.moonPos).addScaledVector(onMoon, B.moon.r + 12);
    lm.lookAt(this.moonPos); lm.rotateX(Math.PI / 2);
    this.scene.add(lm);
    this.lunarMonolith = lm.position.clone();
    this.sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
    this.scene.add(this.sunLight, this.sunLight.target);
    this.scene.add(new THREE.AmbientLight(0x223344, 0.25));
    this.sunGlow = glowSprite(0xfff2d8, 9000, 1);
    this.sunGlow.material.fog = false;
    this.sunCore = glowSprite(0xffffff, 2200, 1);
    this.scene.add(this.sunGlow, this.sunCore);
    this.station = makeStation();
    this.scene.add(this.station);
    this.sats = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Group();
      s.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 3), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 })));
      s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 2.4), new THREE.MeshStandardMaterial({ color: 0x1a3a6a, metalness: 0.6, roughness: 0.3 })));
      s.userData = { r: EARTH_R * (1.12 + i * 0.05), inc: 0.3 + i * 0.4, ph: i * 1.3, sp: 0.03 - i * 0.003 };
      this.scene.add(s);
      this.sats.push(s);
    }
    // Kestrel Space traffic: a shuttle in low orbit and a lunar ferry.
    this.traffic = [0, 1].map((i) => {
      const m = buildShip();
      m.parts.plumeMat.uniforms.uThrottle.value = 0.7;
      m.parts.gear.visible = false;
      this.scene.add(m.group);
      return { m, i };
    });
    this.sunDir = new THREE.Vector3(1, 0.2, 0.3).normalize();
    this.islandPoint = latLonToVector(ISLAND_LATLON[0], ISLAND_LATLON[1], EARTH_R);
    const marker = glowSprite(0x7dffd6, 60, 0.9);
    marker.position.copy(this.islandPoint).multiplyScalar(1.004);
    this.earth.group.add(marker);
    this.marker = marker;
    this.tunnel = makeWarpTunnel();
    this.scene.add(this.tunnel);
    this.craft = null;
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.warp = null;
    this.nearest = { id: 'earth', name: 'Earth', dist: 0, alt: 0 };
    this.cam = { back: 34, up: 11, look: 3 };
  }

  // Sun direction consistent with the island's local time of day.
  setTimeOfDay(frac, tilt = 0.15) {
    const n = this.islandPoint.clone().normalize();
    const d = n.clone().applyAxisAngle(Y, -(frac - 0.5) * Math.PI * 2);
    d.y += tilt; d.normalize();
    this.sunDir.copy(d);
    this.earth.setSun(d);
    this.mars.setSun(d);
    this.sunLight.position.copy(d).multiplyScalar(5000);
    this.sunGlow.position.copy(d).multiplyScalar(52000);
    this.sunCore.position.copy(d).multiplyScalar(52000);
  }

  // Place the craft leaving `from` (earth | moon | mars).
  enter(craftGroup, timeFrac, from = 'earth', cam = {}, tilt = 0.15) {
    this.setTimeOfDay(timeFrac, tilt);
    this.craft = craftGroup;
    this.scene.add(craftGroup);
    Object.assign(this.cam, { back: 34, up: 11, look: 3 }, cam);
    const B = BODIES[from] || BODIES.earth;
    let n;
    if (from === 'earth') n = this.islandPoint.clone().normalize();
    else n = tv.copy(BODIES.earth.pos).sub(B.pos).normalize().lerp(this.sunDir, 0.5).normalize().clone();
    craftGroup.position.copy(B.pos).addScaledVector(n, B.r * (from === 'earth' ? 1.2 : 1.35));
    // Fly away from the surface, belly to the planet.
    const side = Math.abs(n.y) > 0.95 ? X : Y;
    const tangent = side.clone().sub(n.clone().multiplyScalar(n.dot(side))).normalize();
    const fwd = from === 'earth' ? tangent : n.clone().lerp(tangent, 0.5).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd.clone().negate(), n);
    craftGroup.quaternion.setFromRotationMatrix(m);
    this.vel.copy(n).multiplyScalar(from === 'earth' ? 20 : 35);
    this.warp = null;
    this.update(0.001, { moveY: 0, yaw: 0, pitch: 0, roll: 0, up: 0, down: 0, boost: false }, null);
  }

  leave() {
    if (this.craft) this.scene.remove(this.craft);
    const c = this.craft;
    this.craft = null;
    this.warp = null;
    this.tunnel.material.opacity = 0;
    return c;
  }

  // Jump to a body; arrive on its sunlit side, facing it.
  warpTo(id) {
    const B = BODIES[id];
    if (!B || !this.craft || this.warp) return false;
    const c = this.craft.position;
    if (c.distanceTo(B.pos) < B.r * 3) return false;
    const dir = tv.copy(c).sub(B.pos).normalize().lerp(this.sunDir, 0.55).normalize();
    const to = B.pos.clone().addScaledVector(dir, B.r * (id === 'earth' ? 1.7 : 2.4));
    const look = new THREE.Matrix4().lookAt(to, B.pos, Y);
    const q1 = new THREE.Quaternion().setFromRotationMatrix(look);
    // lookAt aims -Z at the target; craft fly along +Z, so turn around.
    q1.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
    this.warp = { id, from: c.clone(), to, q0: this.craft.quaternion.clone(), q1, t: 0, dur: 4.2 };
    this.vel.set(0, 0, 0);
    return true;
  }

  targets() {
    const c = this.craft ? this.craft.position : BODIES.earth.pos;
    return Object.values(BODIES).map((b) => ({ id: b.id, name: b.name, key: b.key, dist: Math.max(0, c.distanceTo(b.pos) - b.r) }));
  }

  // Returns 'reentry' | 'land:moon' | 'land:mars' | null.
  update(dt, ctl, camera) {
    this.t += dt;
    this.earth.update(dt);
    this.earth.group.rotation.y += dt * 0.002;
    this.mars.update(dt);
    const c = this.craft;
    const st = this.station;
    const a = this.t * 0.02;
    st.position.set(Math.cos(a) * EARTH_R * 1.09, Math.sin(a) * EARTH_R * 0.35, Math.sin(a) * EARTH_R * 1.02);
    st.lookAt(0, 0, 0);
    st.userData.blink.material.opacity = (this.t % 1.5) < 0.1 ? 1 : 0.1;
    for (const s of this.sats) {
      const u = s.userData, ang = this.t * u.sp + u.ph;
      s.position.set(Math.cos(ang) * u.r, Math.sin(ang) * Math.sin(u.inc) * u.r, Math.sin(ang) * Math.cos(u.inc) * u.r);
      s.rotation.y += dt * 0.2;
    }
    this._traffic(dt);
    this.marker.material.opacity = 0.5 + 0.4 * Math.sin(this.t * 3);
    if (!c || !camera) return null;

    if (this.warp) {
      const w = this.warp;
      w.t += dt / w.dur;
      const k = smoothstep(0, 1, w.t);
      c.position.lerpVectors(w.from, w.to, k * k * (3 - 2 * k));
      c.quaternion.slerpQuaternions(w.q0, w.q1, clamp(w.t * 3, 0, 1));
      this.tunnel.material.opacity = Math.sin(clamp(w.t, 0, 1) * Math.PI) * 0.85;
      this.tunnel.material.map.offset.y -= dt * 3.5;
      this.warpFov = Math.sin(clamp(w.t, 0, 1) * Math.PI) * 38;
      if (w.t >= 1) { this.warp = null; this.tunnel.material.opacity = 0; this.warpFov = 0; this.vel.set(0, 0, 0); }
    } else {
      // Six-degree-of-freedom drift flight.
      const boost = ctl.boost ? 4 : 1;
      tq.setFromAxisAngle(Y, -ctl.yaw * 1.4 * dt); c.quaternion.multiply(tq);
      tq.setFromAxisAngle(X, -ctl.pitch * 1.2 * dt); c.quaternion.multiply(tq);
      tq.setFromAxisAngle(Z, ctl.roll * 1.5 * dt); c.quaternion.multiply(tq);
      const fwd = tv.copy(Z).applyQuaternion(c.quaternion);
      this.vel.addScaledVector(fwd, ctl.moveY * 160 * boost * dt);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
      this.vel.addScaledVector(upv, (ctl.up - ctl.down) * 90 * dt);
      this.vel.multiplyScalar(Math.exp(-0.35 * dt));
      const max = 900 * boost;
      if (this.vel.length() > max) this.vel.setLength(max);
      c.position.addScaledVector(this.vel, dt);
      this.thrust = Math.max(0, ctl.moveY) * (ctl.boost ? 1 : 0.7);
      this.warpFov = 0;
    }

    // Chase camera.
    const upc = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
    const back = tv.copy(Z).applyQuaternion(c.quaternion).multiplyScalar(-this.cam.back);
    const want = c.position.clone().add(back).addScaledVector(upc, this.cam.up);
    camera.position.lerp(want, this.warp ? 1 : 1 - Math.exp(-5 * dt));
    camera.up.copy(upc);
    const fwd2 = new THREE.Vector3(0, 0, 1).applyQuaternion(c.quaternion);
    camera.lookAt(c.position.clone().addScaledVector(upc, 3).addScaledVector(fwd2, this.cam.look));
    this.starDome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.tunnel.position.copy(camera.position);
    this.tunnel.quaternion.copy(camera.quaternion);

    // Nearest body, altitude, arrival.
    let best = null;
    for (const b of Object.values(BODIES)) {
      const dist = c.position.distanceTo(b.pos);
      const alt = dist - b.r;
      if (!best || alt / b.r < best.alt / best.r) best = { id: b.id, name: b.name, dist, alt, r: b.r };
    }
    this.nearest = best;
    this.altitude = c.position.length() - EARTH_R;
    this.speed = this.warp ? 99999 : this.vel.length();
    if (this.warp) return null;
    if (best.id === 'earth' && best.alt < EARTH_R * 0.035) return 'reentry';
    if (best.id !== 'earth' && best.alt < best.r * 0.07) return 'land:' + best.id;
    return null;
  }

  _traffic(dt) {
    for (const s of this.traffic) {
      const g = s.m.group;
      s.m.parts.plumeMat.uniforms.uTime.value = this.t;
      let p, ahead;
      if (s.i === 0) {
        const f = (t) => new THREE.Vector3(Math.cos(t) * EARTH_R * 1.18, Math.sin(t) * EARTH_R * 0.5, Math.sin(t) * EARTH_R * 1.05);
        p = f(this.t * 0.03 + 1.5); ahead = f(this.t * 0.03 + 1.52);
      } else {
        // Ferry: out to the Moon and back on a slow loop.
        const f = (t) => {
          const k = (1 - Math.cos(t)) / 2;
          const e = new THREE.Vector3(Math.cos(t * 3) * EARTH_R * 1.3, 200, Math.sin(t * 3) * EARTH_R * 1.3);
          const m = BODIES.moon.pos.clone().add(new THREE.Vector3(Math.cos(t * 4) * 420, 80, Math.sin(t * 4) * 420));
          return e.lerp(m, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 900, 0));
        };
        p = f(this.t * 0.012); ahead = f(this.t * 0.012 + 0.003);
      }
      g.position.copy(p);
      g.lookAt(ahead);
    }
  }

}
