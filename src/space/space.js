// Orbit. Fly the Visitor Craft past 3,000 m and the island falls away: the
// whole Earth hangs below, lit by the same sun as your time of day, with the
// Moon, an orbiting space station and satellites. Dive back into the
// atmosphere to return home.

import * as THREE from 'three';
import { createEarth, createMoon, latLonToVector } from './globe.js';
import { glowSprite, glowTexture, clamp, damp } from '../core/util.js';

export const EARTH_R = 1000;
export const ISLAND_LATLON = [20.5, -158.5];

const tv = new THREE.Vector3(), tq = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function makeStars(n = 6000, r = 60000) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(r);
    pos.set([v.x, v.y, v.z], i * 3);
    const w = Math.random();
    const b = 0.5 + Math.pow(Math.random(), 4) * 2.5;
    col.set(w < 0.15 ? [b, b * 0.8, b * 0.6] : w > 0.85 ? [b * 0.7, b * 0.85, b] : [b, b, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, m);
}

function makeStation() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a84a, metalness: 1, roughness: 0.3 });
  const panelTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const x = c.getContext('2d'); x.fillStyle = '#132a4a'; x.fillRect(0, 0, 64, 256);
    x.strokeStyle = '#6a8ab8'; x.lineWidth = 1;
    for (let i = 0; i < 256; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
    x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 256); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const panel = new THREE.MeshStandardMaterial({ map: panelTex, metalness: 0.7, roughness: 0.25, emissive: 0x0a1830, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const truss = new THREE.Mesh(new THREE.BoxGeometry(60, 1.6, 1.6), white); g.add(truss);
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

export class Space {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.earth = createEarth(EARTH_R, renderer, { segments: 128 });
    this.scene.add(this.earth.group);
    this.moon = createMoon(270);
    this.moonPos = new THREE.Vector3(-6200, 1400, -5400);
    this.moon.mesh.position.copy(this.moonPos);
    this.scene.add(this.moon.mesh);
    // A small black monolith on the lunar surface.
    const lm = new THREE.Mesh(new THREE.BoxGeometry(3, 27, 12), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.7 }));
    const onMoon = new THREE.Vector3(0.6, 0.55, 0.58).normalize();
    lm.position.copy(this.moonPos).addScaledVector(onMoon, 270 + 12);
    lm.lookAt(this.moonPos); lm.rotateX(Math.PI / 2);
    this.scene.add(lm);
    this.lunarMonolith = lm.position.clone();
    this.stars = makeStars();
    this.scene.add(this.stars);
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
      const p = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 2.4), new THREE.MeshStandardMaterial({ color: 0x1a3a6a, metalness: 0.6, roughness: 0.3 }));
      s.add(p);
      s.userData = { r: EARTH_R * (1.12 + i * 0.05), inc: 0.3 + i * 0.4, ph: i * 1.3, sp: 0.03 - i * 0.003 };
      this.scene.add(s);
      this.sats.push(s);
    }
    this.sunDir = new THREE.Vector3(1, 0.2, 0.3).normalize();
    this.islandPoint = latLonToVector(ISLAND_LATLON[0], ISLAND_LATLON[1], EARTH_R);
    const marker = glowSprite(0x7dffd6, 60, 0.9);
    marker.position.copy(this.islandPoint).multiplyScalar(1.004);
    this.earth.group.add(marker);
    this.marker = marker;
    this.craft = null;
    this.vel = new THREE.Vector3();
    this.t = 0;
  }

  // Sun direction consistent with the island's local time of day.
  setTimeOfDay(frac) {
    const n = this.islandPoint.clone().normalize();
    const d = n.clone().applyAxisAngle(Y, -(frac - 0.5) * Math.PI * 2);
    d.y += 0.15; d.normalize();
    this.sunDir.copy(d);
    this.earth.setSun(d);
    this.moon.setSun(d);
    this.sunLight.position.copy(d).multiplyScalar(5000);
    this.sunGlow.position.copy(d).multiplyScalar(52000);
    this.sunCore.position.copy(d).multiplyScalar(52000);
  }

  enter(craftGroup, timeFrac) {
    this.setTimeOfDay(timeFrac);
    this.craft = craftGroup;
    this.scene.add(craftGroup);
    const n = this.islandPoint.clone().normalize();
    craftGroup.position.copy(n).multiplyScalar(EARTH_R * 1.2);
    // Face along the surface (toward north), belly to Earth.
    const north = Y.clone().sub(n.clone().multiplyScalar(n.dot(Y))).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), north.clone().negate(), n);
    craftGroup.quaternion.setFromRotationMatrix(m);
    this.vel.copy(n).multiplyScalar(20);
    this.heading = 0;
  }

  leave() {
    if (this.craft) this.scene.remove(this.craft);
    const c = this.craft;
    this.craft = null;
    return c;
  }

  // Returns 'reentry' when the craft dives into the atmosphere.
  update(dt, ctl, camera) {
    this.t += dt;
    this.earth.update(dt);
    this.earth.group.rotation.y += dt * 0.002;
    const c = this.craft;
    // Station and satellites.
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
    this.marker.material.opacity = 0.5 + 0.4 * Math.sin(this.t * 3);
    if (!c) return null;

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
    // Keep out of the Moon.
    const md = c.position.distanceTo(this.moonPos);
    if (md < 285) c.position.sub(this.moonPos).setLength(285).add(this.moonPos);

    // Chase camera.
    const back = tv.copy(Z).applyQuaternion(c.quaternion).multiplyScalar(-34);
    const upc = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion);
    const want = c.position.clone().add(back).addScaledVector(upc, 11);
    camera.position.lerp(want, 1 - Math.exp(-5 * dt));
    camera.up.copy(upc);
    camera.lookAt(c.position.clone().addScaledVector(upc, 3));

    const alt = c.position.length() - EARTH_R;
    this.altitude = alt;
    this.speed = this.vel.length();
    if (alt < EARTH_R * 0.035) return 'reentry';
    return null;
  }

  nearMoonMonolith() { return this.craft && this.craft.position.distanceTo(this.lunarMonolith) < 520; }
}
