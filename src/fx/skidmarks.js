// Bounded, fading tyre ribbons: two rear contact patches leave distinct
// marks on tarmac. Tracks break when grip returns or the car leaves the road.
import * as THREE from 'three';

export class SkidMarks {
  constructor(scene, { capacity = 1200, lifetime = 45 } = {}) {
    this.capacity = capacity; this.lifetime = lifetime; this.cursor = 0; this.time = 0;
    this.birth = new Float32Array(capacity).fill(-1e6);
    this.positions = new Float32Array(capacity * 18);
    this.alpha = new Float32Array(capacity * 6);
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `attribute float alpha; varying float vAlpha;
        #include <fog_pars_vertex>
        void main() { vAlpha = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float vAlpha;
        #include <fog_pars_fragment>
        void main() { if (vAlpha < 0.003) discard; gl_FragColor = vec4(vec3(0.055), vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.last = null; this.vehicleId = null;
  }

  segment(a, b, width, world) {
    const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
    if (distance < 0.12 || distance > 5) return;
    const sx = dz / distance * width * 0.5, sz = -dx / distance * width * 0.5;
    const corners = [[a.x + sx, a.z + sz], [a.x - sx, a.z - sz], [b.x + sx, b.z + sz], [b.x - sx, b.z - sz]];
    const base = this.cursor * 18;
    [0, 1, 2, 1, 3, 2].forEach((index, k) => {
      const [x, z] = corners[index];
      this.positions[base + k * 3] = x;
      this.positions[base + k * 3 + 1] = world.groundAt(x, z) + 0.025;
      this.positions[base + k * 3 + 2] = z;
    });
    this.birth[this.cursor] = this.time;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  update(dt, v, world) {
    this.time += dt;
    const active = v?.kind === 'car' && v.onGround && !v.destroyed && v.skid > 0.2 && v.speed > 5 && world.structures.roadAt(v.pos.x, v.pos.z);
    if (active) {
      const hx = Math.sin(v.heading), hz = Math.cos(v.heading);
      const contacts = [-1, 1].map(side => ({
        x: v.pos.x - hx * v.wb / 2 + hz * side * v.track / 2,
        z: v.pos.z - hz * v.wb / 2 - hx * side * v.track / 2,
      }));
      if (this.last && this.vehicleId === v.id) {
        for (let i = 0; i < 2; i++) {
          const a = this.last[i], b = contacts[i];
          if (Math.hypot(b.x - a.x, b.z - a.z) >= 0.12) {
            this.segment(a, b, v.model.spec.tyreW, world); this.last[i] = b;
          }
        }
      } else this.last = contacts;
      this.vehicleId = v.id;
    } else { this.last = null; this.vehicleId = null; }
    for (let i = 0; i < this.capacity; i++) {
      const opacity = 0.5 * Math.max(0, 1 - (this.time - this.birth[i]) / this.lifetime);
      this.alpha.fill(opacity, i * 6, i * 6 + 6);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  }
}
