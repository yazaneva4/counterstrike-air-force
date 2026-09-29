// Ocean: a single large plane shaded entirely in the fragment shader.
// Layered scrolling wave normals, Fresnel sky reflection, a sharp sun glint,
// turquoise shallows and breaking foam driven by a baked terrain height
// texture, and an exponential-squared fog that matches the scene fog.

import * as THREE from 'three';
import { MAP_SIZE } from './terrain.js';

// Photographic ripple normals (Cesium waterNormals, Apache-2.0), loaded once.
let normalsTex = null;
function waterNormals() {
  if (normalsTex) return normalsTex;
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flat.needsUpdate = true;
  normalsTex = { value: flat };
  new THREE.TextureLoader().load('assets/textures/water_normals.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    normalsTex.value = t;
  });
  return normalsTex;
}

export class Ocean {
  constructor(heightTex) {
    this.uniforms = {
      uNormals: waterNormals(),
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uZenith: { value: new THREE.Color(0.2, 0.4, 0.7) },
      uDay: { value: 1 },
      uNight: { value: 0 },
      uHeight: { value: heightTex },
      uMapSize: { value: MAP_SIZE },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.0002 },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: true,
      vertexShader: /* glsl */`
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uDay, uNight, uMapSize, uFogDensity;
        uniform vec3 uSunDir, uSunColor, uHorizon, uZenith, uFogColor, uMoonDir;
        uniform sampler2D uHeight, uNormals;
        varying vec3 vW;
        vec2 rip(vec2 uv){ return texture2D(uNormals, uv).xy * 2.0 - 1.0; }

        float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }

        // Sum of directional waves -> surface gradient.
        vec2 waves(vec2 p, float t, float fade){
          vec2 g = vec2(0.0);
          const int N = 6;
          for (int i = 0; i < N; i++){
            float fi = float(i);
            float ang = fi * 1.7 + 0.4;
            vec2 d = vec2(cos(ang), sin(ang));
            float freq = 0.035 * pow(1.72, fi);
            float amp = 0.55 / pow(1.9, fi);
            float speed = sqrt(9.8 / freq) * 0.12;
            float ph = dot(d, p) * freq + t * speed * freq * 8.0;
            g += d * cos(ph) * amp * freq * mix(1.0, 0.25, fade * step(2.0, fi));
          }
          // Fine chop: three scrolling layers of photographic ripple normals.
          vec2 r = rip(p * 0.0125 + t * vec2(0.006, 0.004)) * 0.55
                 + rip(p * 0.031 - t * vec2(0.009, -0.012)) * 0.35
                 + rip(p * 0.083 + t * vec2(0.021, 0.017)) * 0.22 * (1.0 - fade);
          g += r * 0.055 * (1.0 - fade * 0.7);
          return g;
        }

        void main(){
          vec3 toCam = cameraPosition - vW;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          float fade = smoothstep(150.0, 2600.0, dist);

          vec2 g = waves(vW.xz, uTime, fade);
          vec3 N = normalize(vec3(-g.x * 6.0, 1.0, -g.y * 6.0));
          N = normalize(mix(N, vec3(0.0, 1.0, 0.0), fade * 0.65));

          // Depth from the baked terrain height map.
          vec2 huv = (vW.xz + uMapSize * 0.5) / uMapSize;
          float h = texture2D(uHeight, huv).r * 30.0 - 24.0;
          float inMap = step(0.0, huv.x) * step(huv.x, 1.0) * step(0.0, huv.y) * step(huv.y, 1.0);
          h = mix(-40.0, h, inMap);
          float depth = max(0.0, -h);

          float ndv = max(dot(N, V), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));

          vec3 deep = mix(vec3(0.004, 0.02, 0.04), vec3(0.01, 0.075, 0.12), uDay);
          vec3 shallow = mix(vec3(0.01, 0.05, 0.07), vec3(0.05, 0.42, 0.42), uDay);
          vec3 body = mix(shallow, deep, smoothstep(0.5, 16.0, depth));
          // Light scattering through wave crests facing the sun.
          float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * max(g.x + g.y, 0.0) * 3.0;
          body += vec3(0.0, 0.25, 0.22) * sss * uDay;
          float sunUp = smoothstep(-0.05, 0.08, uSunDir.y);
          body *= 0.35 + 0.65 * max(uSunDir.y, 0.0) * sunUp + 0.08;

          vec3 col = mix(body, sky, fres);
          float spec = pow(max(dot(R, uSunDir), 0.0), mix(900.0, 220.0, fade));
          float sheen = pow(max(dot(R, uSunDir), 0.0), 18.0) * 0.12;
          col += uSunColor * (spec * 14.0 + sheen) * sunUp;
          float mspec = pow(max(dot(R, uMoonDir), 0.0), 400.0);
          col += vec3(0.55, 0.65, 0.9) * mspec * 2.5 * uNight;

          // Breaking foam along the shoreline.
          float foamBand = smoothstep(1.6, 0.15, depth) * inMap;
          float foamN = vnoise(vW.xz * 0.45 + vec2(uTime * 0.6, -uTime * 0.4)) * vnoise(vW.xz * 1.3 - uTime * 0.3);
          float surf = 0.5 + 0.5 * sin(depth * 5.0 - uTime * 1.6);
          float foam = foamBand * smoothstep(0.12, 0.55, foamN + surf * 0.35);
          col = mix(col, vec3(0.85, 0.9, 0.92) * (0.3 + 0.7 * max(uSunDir.y, 0.05)), foam * 0.85);

          float alpha = mix(0.6, 1.0, smoothstep(0.0, 5.0, depth));
          alpha = max(alpha, foam);
          alpha = mix(alpha, 1.0, fade);

          float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          col = mix(col, uFogColor, f);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'ocean';
  }

  update(dt, sky, fog) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uSunDir.value.copy(sky.sunDir);
    u.uMoonDir.value.copy(sky.moonDir);
    u.uSunColor.value.copy(sky.sunColor);
    u.uHorizon.value.copy(sky.horizon);
    u.uZenith.value.copy(sky.zenith);
    u.uDay.value = sky.day;
    u.uNight.value = sky.night;
    if (fog) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = fog.density; }
  }
}
