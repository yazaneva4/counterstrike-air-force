// Planet Earth from NASA Blue Marble / Black Marble imagery (public domain):
// lit day side, city lights on the night side, ocean sun glint, a drifting
// cloud layer that casts soft shadows, and a scattering atmosphere rim.

import * as THREE from 'three';

let textures = null;
export function loadEarthTextures(renderer) {
  if (textures) return textures;
  const loader = new THREE.TextureLoader();
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const load = (url, srgb) => {
    const t = loader.load(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  };
  textures = {
    day: load('assets/earth/earth_day.jpg', true),
    night: load('assets/earth/earth_night.jpg', true),
    clouds: load('assets/earth/earth_clouds.jpg', false),
    water: load('assets/earth/earth_water.jpg', false),
  };
  return textures;
}

export function createEarth(radius, renderer, { segments = 96 } = {}) {
  const tex = loadEarthTextures(renderer);
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(1, 0.2, 0.3).normalize();
  const uniforms = {
    uDay: { value: tex.day }, uNight: { value: tex.night }, uClouds: { value: tex.clouds }, uWater: { value: tex.water },
    uSun: { value: sunDir }, uTime: { value: 0 }, uCloudShift: { value: 0 },
  };
  const earthMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uDay, uNight, uClouds, uWater; uniform vec3 uSun; uniform float uCloudShift;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 N = normalize(vN), L = normalize(uSun), V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        float day = smoothstep(-0.12, 0.22, ndl);
        vec3 dayCol = texture2D(uDay, vUv).rgb;
        float water = texture2D(uWater, vUv).r;
        float cloud = texture2D(uClouds, vUv + vec2(uCloudShift - 0.0025, 0.0015)).r;
        dayCol *= 1.0 - cloud * 0.45;
        vec3 lit = dayCol * (max(ndl, 0.0) * 1.9 + 0.03);
        // Ocean glint.
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 160.0) * water * (1.0 - cloud);
        lit += vec3(1.0, 0.86, 0.66) * spec * 0.7 * day;
        // City lights where it is dark.
        vec3 lights = texture2D(uNight, vUv).rgb;
        lights = pow(lights, vec3(1.4)) * vec3(1.4, 1.05, 0.7) * 2.6;
        vec3 col = mix(lights * (1.0 - cloud * 0.8), lit, day);
        // Terminator warmth and atmospheric rim.
        float term = smoothstep(0.25, 0.0, abs(ndl));
        col += vec3(0.9, 0.35, 0.1) * term * 0.05;
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += vec3(0.25, 0.5, 1.0) * fres * smoothstep(-0.3, 0.4, ndl) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments / 2), earthMat);
  group.add(earth);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uClouds; uniform vec3 uSun; uniform float uCloudShift;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        float c = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
        vec3 N = normalize(vN);
        float ndl = dot(N, normalize(uSun));
        float lightAmt = smoothstep(-0.2, 0.35, ndl);
        vec3 col = mix(vec3(0.02, 0.025, 0.04), vec3(1.0), lightAmt);
        col = mix(col, vec3(1.0, 0.6, 0.4), smoothstep(0.22, 0.0, abs(ndl)) * 0.35 * lightAmt);
        gl_FragColor = vec4(col, smoothstep(0.08, 0.85, c) * 0.95);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.008, segments, segments / 2), cloudMat);
  group.add(clouds);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: uniforms.uSun, uR: { value: radius }, uRA: { value: radius * 1.07 } },
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vC; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform float uR, uRA; varying vec3 vW; varying vec3 vC;
      void main(){
        vec3 c = vC;
        vec3 ro = cameraPosition - c;
        vec3 rd = normalize(vW - cameraPosition);
        // Closest approach of the view ray to the planet centre.
        float tca = -dot(ro, rd);
        float d = length(ro + rd * tca);
        float h = clamp((d - uR) / (uRA - uR), 0.0, 1.0);
        float glow = pow(1.0 - h, 3.0);
        if (d < uR) glow = 0.0;
        vec3 p = normalize(ro + rd * tca);
        float sun = smoothstep(-0.35, 0.5, dot(p, normalize(uSun)));
        vec3 col = mix(vec3(0.3, 0.55, 1.0), vec3(1.0, 0.55, 0.3), smoothstep(0.35, 0.0, abs(dot(p, normalize(uSun)))) * 0.5);
        gl_FragColor = vec4(col * glow * sun * 1.6, glow * sun);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.07, 64, 32), atmoMat);
  group.add(atmo);

  return {
    group, earth, clouds, atmo, uniforms,
    update(dt) {
      uniforms.uTime.value += dt;
      uniforms.uCloudShift.value = (uniforms.uCloudShift.value + dt * 0.0012) % 1;
    },
    setSun(dir) { uniforms.uSun.value.copy(dir).normalize(); },
  };
}

// Procedural moon with craters (no texture needed).
export function createMoon(radius) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix)*normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uSun; varying vec3 vN; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 p = normalize(vP);
        float maria = smoothstep(0.45, 0.62, n3(p * 2.2 + 3.0));
        float crater = 0.0;
        for (int i = 0; i < 3; i++){ float s = pow(2.4, float(i)) * 5.0; float c = n3(p * s); crater += smoothstep(0.78, 0.9, c) * 0.25 / float(i + 1); }
        vec3 base = mix(vec3(0.72, 0.71, 0.68), vec3(0.42, 0.42, 0.44), maria * 0.8);
        base *= 0.85 + n3(p * 30.0) * 0.2 - crater;
        float l = max(dot(normalize(vN), normalize(uSun)), 0.0);
        gl_FragColor = vec4(base * (l * 1.6 + 0.02), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  return { mesh: m, setSun: (d) => mat.uniforms.uSun.value.copy(d) };
}

// Latitude/longitude (degrees) to a point on a sphere matching the texture mapping.
export function latLonToVector(lat, lon, r, out = new THREE.Vector3()) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return out.set(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}
