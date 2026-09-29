// Celestial bodies for the orbital view: the Moon (Apache-2.0 Cesium/NASA
// lunar map with a baked normal map), Mars (baked colour and relief maps) with
// its potato-shaped moons Phobos and Deimos and a thin dusty atmosphere rim,
// and the Tycho star catalogue skybox.

import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const tex = (url, srgb) => { const t = loader.load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

let stars = null;
export function starCube() {
  if (!stars) {
    stars = new THREE.CubeTextureLoader().setPath('assets/space/stars/').load(['px.jpg', 'mx.jpg', 'py.jpg', 'my.jpg', 'pz.jpg', 'mz.jpg']);
    stars.colorSpace = THREE.SRGBColorSpace;
  }
  return stars;
}

// Star sphere drawn from the Tycho cube map with a contrast curve (the source
// images are dim), so the Milky Way reads without a grey floor. Keep it
// centred on the camera.
export function createStarDome(radius = 90000, gain = 2.4) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCube: { value: starCube() }, uGain: { value: gain } },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform samplerCube uCube; uniform float uGain; varying vec3 vDir;
      void main(){
        vec3 c = textureCube(uCube, normalize(vDir)).rgb;
        c = max(c - 0.018, 0.0);
        c = pow(c, vec3(1.35)) * uGain;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

function atmosphereShell(radius, color, strength = 1) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uColor: { value: new THREE.Color(color) }, uK: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform vec3 uSun, uColor; uniform float uK; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        float lit = smoothstep(-0.25, 0.4, dot(N, normalize(uSun)));
        float a = rim * lit * uK;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  }));
}

export function createMoonBody(radius) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex('assets/space/moon_color.jpg', true), normalMap: tex('assets/space/moon_normal.jpg', false),
    normalScale: new THREE.Vector2(1.4, 1.4), roughness: 1, metalness: 0,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  return { mesh, radius, setSun() {} };
}

function potato(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 4);
  const p = g.attributes.position;
  const h = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let d = 1 + Math.sin(v.x * 2.1 + seed) * 0.16 + Math.sin(v.y * 3.3 - seed) * 0.12 + Math.sin(v.z * 5.1 + seed * 2) * 0.06;
    // A few craters.
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Vector3(h(k, 1, seed) - 0.5, h(k, 2, seed) - 0.5, h(k, 3, seed) - 0.5).normalize();
      const dd = v.distanceTo(c);
      if (dd < 0.45) d -= Math.cos(dd / 0.45 * Math.PI / 2) * 0.08;
    }
    v.multiplyScalar(r * d);
    p.setXYZ(i, v.x * 1.25, v.y * 0.9, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createMarsBody(radius) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map: tex('assets/space/mars_color.jpg', true), normalMap: tex('assets/space/mars_normal.jpg', false),
    normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.95, metalness: 0,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), mat);
  group.add(mesh);
  const atmo = atmosphereShell(radius * 1.02, 0xff9a6a, 1.1);
  group.add(atmo);
  const rock = new THREE.MeshStandardMaterial({ color: 0x6b5d52, roughness: 1 });
  const phobos = new THREE.Mesh(potato(radius * 0.045, 3), rock);
  const deimos = new THREE.Mesh(potato(radius * 0.028, 7), rock);
  group.add(phobos, deimos);
  let t = 0;
  return {
    group, mesh, radius, moons: [phobos, deimos],
    setSun(d) { atmo.material.uniforms.uSun.value.copy(d); },
    update(dt) {
      t += dt;
      const a = t * 0.05, b = t * 0.018;
      phobos.position.set(Math.cos(a) * radius * 1.6, Math.sin(a) * radius * 0.12, Math.sin(a) * radius * 1.6);
      phobos.rotation.y = a;
      deimos.position.set(Math.cos(b + 2) * radius * 2.7, Math.sin(b + 2) * radius * 0.2, Math.sin(b + 2) * radius * 2.7);
      deimos.rotation.y = b;
      mesh.rotation.y += dt * 0.004;
    },
  };
}
