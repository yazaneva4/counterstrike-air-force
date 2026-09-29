// The island's mysteries. Each site has its own set piece (a black monolith
// on the summit, crop circles, a crashed saucer, a sun temple that beams
// light at the sky, floating standing stones, a glowing whirlpool and a
// cloaked mothership above the clouds). Finding them is saved per device.

import * as THREE from 'three';
import { canvasTexture, stdMat, glowSprite, glowTexture, smoothstep, clamp } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { PLACES } from './terrain.js';

export const MYSTERY_INFO = [
  { id: 'monolith', name: 'The Monolith', place: 'Summit of Mount Kestrel', hint: 'The highest point on the island. A helicopter helps.',
    lore: 'A slab of perfect black stone stands on the summit in proportions of exactly 1:4:9. It is warm in the snow and hums at 440 hertz.' },
  { id: 'crop', name: 'The Circles', place: 'Aldren Farms', hint: 'East of Harrow, in the wheat. Best seen from the air.',
    lore: 'From above, the flattened wheat is a precise diagram of the solar system, with one planet too many.' },
  { id: 'crash', name: 'The Crash at Red Mesa', place: 'Red Mesa desert', hint: 'West, in the desert. Look for smoke.',
    lore: 'A saucer lies half-buried in the sand, still humming. As you approach, its lights wake up as if it recognises you. The Visitor Craft is yours to fly: press F beside it.' },
  { id: 'pyramid', name: 'Temple of the Sun', place: 'Deep Red Mesa', hint: 'Deep in the desert. At night, look for a light pointing straight up.',
    lore: 'Older than any record on the island. The capstone lines up with the solstice sunrise, and each night it sends a beam to something waiting above the clouds.' },
  { id: 'stones', name: 'Hollow Hill Stones', place: 'Hollow Hill', hint: 'On the hill north of the airbase.',
    lore: 'Twelve standing stones, and three that refuse to touch the ground. Compasses spin here and birds will not fly over it.' },
  { id: 'vortex', name: 'The Western Vortex', place: 'Off the south-west coast', hint: 'Past the reef, off the south-west coast.',
    lore: 'A whirlpool that never stops turning and glows at night. A fishing trawler circles it endlessly and never sinks.' },
  { id: 'mothership', name: 'The Watcher', place: 'Above the clouds', hint: 'Climb above 1,800 metres over the island.',
    lore: 'A vessel hundreds of metres across hangs silently above the clouds, hidden by daylight. It has been watching the island for a very long time.' },
  { id: 'moon', name: 'Lunar Echo', place: 'Monolith Crater, the Moon', hint: 'Beyond the sky. Fly a rocket or the Odyssey to orbit, warp to the Moon (2) and land.',
    lore: 'On the Moon: a second monolith, identical to the one on Mount Kestrel. The echo was never a signal. It was a reply.' },
  { id: 'ares', name: 'The Ares Beacon', place: 'Ares Vallis, Mars', hint: 'On Mars, down the dry canyon south-east of the landing site. Warp there with 3.',
    lore: 'A glyph-covered obelisk older than the canyon it stands in, beaming a pulse into the sky every 1.7 seconds. The pulse is aimed at Kestrel Island.' },
];

const STORE = 'csaf-mysteries-v1';

export class Mysteries {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'mysteries';
    scene.add(this.group);
    this.found = new Set();
    try { JSON.parse(localStorage.getItem(STORE) || '[]').forEach((id) => this.found.add(id)); } catch (e) { /* storage blocked */ }
    this.sites = {};
    this.anim = [];
    this._monolith();
    this._crop();
    this._crash();
    this._pyramid();
    this._stones();
    this._vortex();
    this._mothership();
  }

  info(id) { return MYSTERY_INFO.find((m) => m.id === id); }
  get count() { return this.found.size; }

  discover(id) {
    if (this.found.has(id)) return false;
    this.found.add(id);
    try { localStorage.setItem(STORE, JSON.stringify([...this.found])); } catch (e) { /* ignore */ }
    return true;
  }

  // ---- Set pieces -----------------------------------------------------------

  _monolith() {
    const P = PLACES.peak;
    const y = this.world.terrain.heightAt(P.x, P.z);
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 9.9, 4.4), new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.06, metalness: 0.7 }));
    slab.position.y = 4.9; slab.castShadow = true; g.add(slab);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.5, 4.2, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.y = 0.2; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 900, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 460; g.add(beam);
    g.position.set(P.x, y, P.z);
    g.rotation.y = 0.6;
    this.group.add(g);
    this.world.structures.addBox(P.x, P.z, 2.4, 2.4, 0, y + 10);
    this.sites.monolith = { pos: new THREE.Vector3(P.x, y + 5, P.z), radius: 55 };
    this.anim.push((t, night) => {
      ring.material.opacity = 0.15 + 0.25 * (Math.sin(t * 2.2) * 0.5 + 0.5);
      ring.scale.setScalar(1 + (t * 0.3 % 1) * 0.6);
      beam.material.opacity = 0.18 * night;
    });
  }

  _crop() {
    const F = PLACES.farm;
    const cx = F.x + 70, cz = F.z - 30;
    const y = this.world.terrain.heightAt(cx, cz);
    const size = 150;
    const draw = (glow) => (ctx, w) => {
      const c = w / 2, s = w / size;
      ctx.clearRect(0, 0, w, w);
      ctx.strokeStyle = glow ? 'rgba(160,255,220,0.95)' : 'rgba(250,236,180,0.9)';
      ctx.fillStyle = glow ? 'rgba(120,255,210,0.55)' : 'rgba(236,218,150,0.88)';
      ctx.lineWidth = 2.2 * s;
      // Sun + orbits + planets (with one extra).
      ctx.beginPath(); ctx.arc(c, c, 9 * s, 0, Math.PI * 2); ctx.fill();
      const rings = [16, 23, 30, 38, 47, 55, 62, 68];
      rings.forEach((r, i) => {
        ctx.beginPath(); ctx.arc(c, c, r * s, 0, Math.PI * 2); ctx.stroke();
        const a = i * 2.39 + 0.5;
        ctx.beginPath(); ctx.arc(c + Math.cos(a) * r * s, c + Math.sin(a) * r * s, (2.2 + (i % 3)) * s, 0, Math.PI * 2); ctx.fill();
      });
      ctx.beginPath(); ctx.arc(c + 71 * s * 0.7, c - 71 * s * 0.7, 3.5 * s, 0, Math.PI * 2); ctx.fill();
    };
    const day = canvasTexture(1024, 1024, draw(false));
    const glow = canvasTexture(1024, 1024, draw(true));
    const mat = new THREE.MeshStandardMaterial({ map: day, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 0, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat);
    m.position.set(cx, y + 0.35, cz);
    m.receiveShadow = true;
    this.group.add(m);
    this.sites.crop = { pos: new THREE.Vector3(cx, y, cz), radius: 90, air: 200 };
    this.cropCenter = new THREE.Vector3(cx, y, cz);
    this.anim.push((t, night) => { mat.emissiveIntensity = night * (0.7 + 0.3 * Math.sin(t * 1.5)); });
  }

  _crash() {
    const C = PLACES.crash;
    const y = this.world.terrain.heightAt(C.x, C.z);
    this.crashPos = new THREE.Vector3(C.x, y, C.z);
    // Debris field and a scorched trench leading to the saucer.
    const rnd = mulberry32(51);
    const metal = stdMat(0x8e979f, { rough: 0.35, metal: 0.85 });
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 45;
      const x = C.x + Math.cos(a) * r - 18, z = C.z + Math.sin(a) * r * 0.5;
      const s = 0.4 + rnd() * 1.4;
      const d = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), metal);
      d.position.set(x, this.world.terrain.heightAt(x, z) + s * 0.3, z);
      d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      d.castShadow = true;
      this.group.add(d);
    }
    const trench = new THREE.Mesh(new THREE.PlaneGeometry(70, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    trench.position.set(C.x - 36, y + 0.3, C.z); this.group.add(trench);
    this.sites.crash = { pos: new THREE.Vector3(C.x, y, C.z), radius: 65 };
    this.smokeTimer = 0;
  }

  _pyramid() {
    const P = PLACES.pyramid;
    const y = this.world.terrain.zone('pyramid').h;
    const g = new THREE.Group();
    const stone = stdMat(0xc9a36d, { rough: 0.95, flat: true });
    // Stepped pyramid built from shrinking slabs.
    const steps = 14, base = 92, height = 62;
    for (let i = 0; i < steps; i++) {
      const w = base * (1 - i / steps), h = height / steps;
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), stone);
      s.position.y = h * (i + 0.5);
      s.castShadow = true; s.receiveShadow = true;
      g.add(s);
    }
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, metalness: 1, roughness: 0.15, emissive: 0xffb040, emissiveIntensity: 0.4 });
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(5, 0), capMat);
    cap.position.y = height + 5; cap.castShadow = true; g.add(cap);
    // Stairway.
    const stair = new THREE.Mesh(new THREE.BoxGeometry(10, height * 0.98, 60), stdMat(0xb38e5c, { rough: 0.95 }));
    stair.position.set(0, height * 0.45, base / 2 - 12); stair.rotation.x = -0.72; g.add(stair);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 2400, 12, 1, true), beamMat);
    beam.position.y = height + 1200; g.add(beam);
    const glow = glowSprite(0xffd080, 40, 0); glow.position.y = height + 5; g.add(glow);
    g.position.set(P.x, y - 0.5, P.z);
    this.group.add(g);
    this.world.structures.addBox(P.x, P.z, base / 2, base / 2, 0, y + height * 0.5);
    this.world.structures.addBox(P.x, P.z, base / 4, base / 4, 0, y + height + 8);
    this.sites.pyramid = { pos: new THREE.Vector3(P.x, y + 30, P.z), radius: 160 };
    this.anim.push((t, night, golden) => {
      cap.rotation.y = t * 0.4;
      beamMat.opacity = 0.35 * night;
      glow.material.opacity = 0.2 + 0.7 * Math.max(night, golden);
      capMat.emissiveIntensity = 0.4 + 2.5 * Math.max(night, golden * 0.6);
    });
  }

  _stones() {
    const S = PLACES.stones;
    const y = this.world.terrain.zone('stones').h;
    const g = new THREE.Group();
    const stone = stdMat(0x8a8780, { rough: 0.95, flat: true });
    const rnd = mulberry32(8);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = 4.5 + rnd() * 1.6;
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, h, 1.1, 2, 3, 1), stone);
      const p = s.geometry.attributes.position;
      for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + (rnd() - 0.5) * 0.25);
      s.geometry.computeVertexNormals();
      s.position.set(Math.cos(a) * 16, h / 2 - 0.3, Math.sin(a) * 16);
      s.rotation.y = -a + (rnd() - 0.5) * 0.2;
      s.castShadow = true;
      g.add(s);
      this.world.structures.addBox(S.x + Math.cos(a) * 16, S.z + Math.sin(a) * 16, 0.9, 0.6, -a, y + h);
      if (i % 2 === 0) {
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 8.6), stone);
        const a2 = a + Math.PI / 12;
        lintel.position.set(Math.cos(a2) * 16, h + 0.2, Math.sin(a2) * 16);
        lintel.rotation.y = -a2;
        lintel.castShadow = true;
        g.add(lintel);
      }
    }
    const floaters = [];
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.9, emissive: 0x66ccff, emissiveIntensity: 0 });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.8, 1.0), glowMat);
      f.castShadow = true;
      g.add(f);
      floaters.push(f);
    }
    const halo = glowSprite(0x77ccff, 24, 0); halo.position.y = 6; g.add(halo);
    g.position.set(S.x, y, S.z);
    this.group.add(g);
    this.sites.stones = { pos: new THREE.Vector3(S.x, y, S.z), radius: 60 };
    this.anim.push((t, night) => {
      floaters.forEach((f, i) => {
        const a = t * 0.25 + (i / 3) * Math.PI * 2;
        f.position.set(Math.cos(a) * 5, 6 + Math.sin(t * 0.8 + i) * 1.2, Math.sin(a) * 5);
        f.rotation.set(Math.sin(t * 0.3 + i) * 0.4, t * 0.4 + i, Math.cos(t * 0.35 + i) * 0.3);
      });
      glowMat.emissiveIntensity = 0.15 + night * 1.2;
      halo.material.opacity = night * 0.5;
    });
  }

  _vortex() {
    const V = PLACES.vortex;
    const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime, uNight; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p), a = atan(p.y, p.x);
          float spiral = sin(a * 3.0 + log(r + 0.02) * 9.0 + uTime * 2.2);
          float band = smoothstep(0.2, 1.0, spiral) * smoothstep(1.0, 0.25, r) * smoothstep(0.02, 0.18, r);
          vec3 day = vec3(0.75, 0.9, 0.95);
          vec3 glow = vec3(0.2, 1.0, 0.85);
          vec3 col = mix(day, glow * 1.6, uNight);
          float eye = smoothstep(0.2, 0.0, r);
          float alpha = band * 0.55 + eye * 0.85;
          col = mix(col, vec3(0.0, 0.05, 0.08), eye * (1.0 - uNight));
          gl_FragColor = vec4(col, alpha * smoothstep(1.0, 0.8, r));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(130, 64).rotateX(-Math.PI / 2), mat);
    disc.position.set(V.x, 0.25, V.z);
    disc.renderOrder = 2;
    this.group.add(disc);
    // The trawler that circles forever.
    const boat = new THREE.Group();
    const hull = new THREE.CylinderGeometry(2.2, 1.4, 14, 10); hull.rotateX(Math.PI / 2); hull.scale(1, 0.6, 1);
    const hm = new THREE.Mesh(hull, stdMat(0x4a5a64, { rough: 0.7 })); hm.position.y = 0.4; boat.add(hm);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3.6), stdMat(0xd8d2c0)); cab.position.set(0, 2, -2); boat.add(cab);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 6), stdMat(0x333333)); mast.position.set(0, 5, 2); boat.add(mast);
    const lamp = glowSprite(0x77ffdd, 6, 0.8); lamp.position.set(0, 9.6, 2); boat.add(lamp);
    boat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(boat);
    this.sites.vortex = { pos: new THREE.Vector3(V.x, 0, V.z), radius: 260 };
    this.anim.push((t, night, golden, dt) => {
      uniforms.uTime.value = t;
      uniforms.uNight.value = night;
      const a = -t * 0.12;
      boat.position.set(V.x + Math.cos(a) * 70, Math.sin(t * 1.3) * 0.3, V.z + Math.sin(a) * 70);
      boat.rotation.set(Math.sin(t * 0.9) * 0.05, -a, 0.12 + Math.sin(t) * 0.04);
    });
  }

  _mothership() {
    const pos = new THREE.Vector3(250, 1880, -380);
    const g = new THREE.Group();
    const R = 150;
    const prof = [[0.01, -26], [40, -24], [110, -12], [R, -2], [R + 4, 2], [115, 10], [60, 22], [0.01, 26]].map(([r, y]) => new THREE.Vector2(r, y));
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, metalness: 0.9, roughness: 0.35, emissive: 0x05080c, transparent: true, opacity: 1 });
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), hullMat);
    g.add(hull);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x66ffd0, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 4, 1.8, 8, 128).rotateX(Math.PI / 2), ringMat);
    g.add(ring);
    const lights = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const s = glowSprite(0x7dffd6, 22, 0.8);
      s.position.set(Math.cos(a) * (R - 20), -14, Math.sin(a) * (R - 20));
      g.add(s); lights.push(s);
    }
    const core = glowSprite(0xa0fff0, 160, 0.6); core.position.y = -30; g.add(core);
    g.position.copy(pos);
    this.group.add(g);
    this.mothership = g;
    this.sites.mothership = { pos: pos.clone(), radius: 520, minY: 1300 };
    this.anim.push((t, night) => {
      g.rotation.y = t * 0.02;
      g.position.x = pos.x + Math.sin(t * 0.01) * 200;
      g.position.z = pos.z + Math.cos(t * 0.013) * 200;
      this.sites.mothership.pos.copy(g.position);
      const vis = 0.12 + 0.88 * night;
      hullMat.opacity = vis;
      hullMat.transparent = vis < 0.99;
      hullMat.depthWrite = vis > 0.5;
      ringMat.opacity = 0.2 + 0.7 * night;
      lights.forEach((l, i) => { l.material.opacity = (0.15 + 0.85 * night) * (0.5 + 0.5 * Math.sin(t * 3 + i * 0.6)); });
      core.material.opacity = 0.15 + 0.5 * night;
    });
  }

  // ---- Runtime --------------------------------------------------------------

  update(dt, t, sky, particles) {
    for (const fn of this.anim) fn(t, sky.night, sky.golden, dt);
    // Smoke still curling from the crash.
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0 && particles) {
      this.smokeTimer = 0.35;
      const c = this.crashPos;
      particles.smoke.emit(c.x + (Math.random() - 0.5) * 6, c.y + 2, c.z + (Math.random() - 0.5) * 4, (Math.random() - 0.5), 3 + Math.random() * 2, 0.8,
        { color: 0x3c3834, size: 7, life: 6, grow: 5, drag: 0.3, intensity: 0.5 });
      if (Math.random() < 0.2) particles.sparks.burst(new THREE.Vector3(c.x, c.y + 2, c.z), { count: 6, speed: 6, color: 0x7dffd6, size: 1, life: 0.6, gravity: -4 });
    }
  }

  // Returns the id of a newly found mystery near the observer, or null.
  check(pos, agl) {
    for (const [id, s] of Object.entries(this.sites)) {
      if (this.found.has(id)) continue;
      const dx = pos.x - s.pos.x, dz = pos.z - s.pos.z;
      const hd = Math.hypot(dx, dz);
      if (s.minY !== undefined) {
        if (pos.y > s.minY && Math.hypot(hd, pos.y - s.pos.y) < s.radius) return id;
        continue;
      }
      const r = s.air && agl > 25 ? s.air : s.radius;
      if (hd < r && Math.abs(pos.y - s.pos.y) < r + 120) return id;
    }
    return null;
  }
}
