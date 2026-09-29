// Post-processing. The high path renders into a multisampled half-float
// target, adds bloom, then a cinematic grade (sun flare with ghosts and an
// anamorphic streak, gentle chromatic aberration, vignette, contrast and
// film grain) before tone mapping. Some GPUs claim float render targets but
// render them black, so we probe first and fall back to direct rendering
// (tone mapped by the renderer) with a CSS vignette.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uVignette: { value: 0.55 },
    uChroma: { value: 0.0012 },
    uFlash: { value: 0 },
    uCloud: { value: 0 },
    uNight: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uSunVis, uVignette, uChroma, uFlash, uCloud, uNight;
    uniform vec2 uRes, uSun; uniform vec3 uSunColor;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 dc = uv - 0.5;
      float d = length(dc);
      vec2 off = dc * uChroma * (0.5 + d * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);

      // Sun flare: halo, anamorphic streak and ghosts mirrored through centre.
      if (uSunVis > 0.001){
        float aspect = uRes.x / uRes.y;
        vec2 sp = uSun;
        vec2 dv = (uv - sp) * vec2(aspect, 1.0);
        float r = length(dv);
        vec3 fl = vec3(0.0);
        fl += uSunColor * exp(-r * 9.0) * 0.55;
        fl += uSunColor * vec3(0.8, 0.85, 1.0) * exp(-abs(dv.y) * 160.0) * exp(-abs(dv.x) * 2.2) * 0.35;
        vec2 axis = vec2(0.5) - sp;
        for (int i = 0; i < 5; i++){
          float fi = float(i);
          float k = 0.35 + fi * 0.38;
          vec2 gp = sp + axis * k * 2.0;
          float gr = length((uv - gp) * vec2(aspect, 1.0));
          float size = 0.02 + fract(fi * 0.37) * 0.06;
          vec3 tint = mix(vec3(0.4, 0.8, 1.0), vec3(1.0, 0.6, 0.3), fract(fi * 0.61));
          fl += tint * smoothstep(size, size * 0.6, gr) * 0.05;
        }
        float ringR = length((uv - (sp + axis * 1.6)) * vec2(aspect, 1.0));
        fl += vec3(0.5, 0.7, 1.0) * smoothstep(0.012, 0.0, abs(ringR - 0.22)) * 0.04;
        col += fl * uSunVis;
      }

      // Inside a cloud: soft white-out.
      col = mix(col, vec3(0.85, 0.88, 0.92) * (1.0 - uNight * 0.85), uCloud * 0.85);
      // Grade: a touch of contrast and warmth in the highlights.
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.06);
      col = col * (1.0 + 0.04 * vec3(0.4, 0.1, -0.3) * smoothstep(0.4, 1.6, l));
      // Vignette.
      col *= mix(1.0, smoothstep(0.95, 0.3, d), uVignette);
      col += vec3(uFlash);
      // Grain.
      float g = hash(uv * uRes + fract(uTime) * 100.0) - 0.5;
      col += g * 0.018 * (0.4 + l);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// Render a white quad into a half-float target, copy it into an 8-bit target
// and read that back: some drivers advertise float targets but render black.
function floatTargetWorks(renderer) {
  let ok = false, rtF, rt8;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  try {
    rtF = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    rt8 = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false });
    const cam = new THREE.Camera();
    const plane = new THREE.PlaneGeometry(2, 2);
    const bright = new THREE.Scene();
    const brightMat = new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }' });
    bright.add(new THREE.Mesh(plane, brightMat));
    const copy = new THREE.Scene();
    const copyMat = new THREE.ShaderMaterial({ uniforms: { t: { value: rtF.texture } }, vertexShader: 'varying vec2 v; void main(){ v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 v; void main(){ gl_FragColor = texture2D(t, v); }' });
    copy.add(new THREE.Mesh(plane, copyMat));
    renderer.setRenderTarget(rtF); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(bright, cam);
    renderer.setRenderTarget(rt8); renderer.clear(); renderer.render(copy, cam);
    const buf = new Uint8Array(4 * 16);
    renderer.readRenderTargetPixels(rt8, 0, 0, 4, 4, buf);
    ok = buf[0] > 40 || buf[1] > 40 || buf[2] > 40;
    brightMat.dispose(); copyMat.dispose(); plane.dispose();
  } catch (e) {
    ok = false;
  } finally {
    if (rtF) rtF.dispose();
    if (rt8) rt8.dispose();
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
  }
  return ok;
}

export class PostFX {
  constructor(renderer, scene, camera, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const params = new URLSearchParams(location.search);
    this.enabled = quality !== 'low' && !params.has('safe') && (params.has('hd') || floatTargetWorks(renderer));
    document.body.classList.toggle('css-vignette', !this.enabled);
    if (!this.enabled) return;
    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 && quality === 'high' ? 4 : 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    if (this.renderPass) { this.renderPass.scene = scene; this.renderPass.camera = camera; }
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }

  update(dt, { sunScreen, sunVis = 0, sunColor, cloud = 0, night = 0, flash = 0 } = {}) {
    if (!this.enabled) return;
    const u = this.grade.uniforms;
    u.uTime.value += dt;
    if (sunScreen) u.uSun.value.copy(sunScreen);
    u.uSunVis.value = sunVis;
    if (sunColor) u.uSunColor.value.copy(sunColor);
    u.uCloud.value = cloud;
    u.uNight.value = night;
    u.uFlash.value = flash;
    // Subtle by day (the HDR sky would veil everything), rich at night for lamps.
    this.bloom.strength = 0.16 + night * 0.5;
    this.bloom.threshold = 2.4 - night * 1.75;
    this.bloom.radius = 0.4 + night * 0.25;
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
