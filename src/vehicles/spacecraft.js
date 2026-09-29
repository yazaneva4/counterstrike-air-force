// Spacecraft of Kestrel Space. The Aurora is a two-stage orbital rocket
// (Falcon-style reusable booster with nine engines, grid fins and landing
// legs; an upper stage with its own lander legs; a crew capsule on top). The
// Odyssey is a lifting-body spaceplane that takes off vertically on four
// thrusters and flies all the way to orbit. Both carry painted liveries with
// panel lines, soot and heat-shield tiles, and animated exhaust plumes.

import * as THREE from 'three';
import { stdMat, glowSprite, canvasTexture } from '../core/util.js';
import { mulberry32 } from '../core/noise.js';
import { loft, smoothSections, planform, fin, paintLivery, LV, panelSurface } from './shapes.js';

const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---- Shared materials and textures ------------------------------------------------

// Lattice (tower, grid fins): a frame with X bracing, alpha-tested.
export function latticeTexture(cells = 1) {
  return once('lattice' + cells, () => {
    const t = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    }, { repeat: true, srgb: false });
    t.repeat.set(cells, cells);
    return t;
  });
}

function gridFinTexture() {
  return once('gridfin', () => canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.lineWidth = 3;
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
    for (let k = -w; k <= w; k += 16) { ctx.beginPath(); ctx.moveTo(k, -w); ctx.lineTo(k, w); ctx.moveTo(-w, k); ctx.lineTo(w, k); ctx.stroke(); }
    ctx.restore();
  }, { srgb: false }));
}

// Exhaust plume: a cone opening downwards from the nozzle (y = 0) with a hot
// white core, orange tail, turbulent flicker and faint shock diamonds.
export function plumeMaterial(color = [1.0, 0.55, 0.18], { diamonds = 0.25 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uThrottle: { value: 0 }, uColor: { value: new THREE.Vector3(...color) }, uDiamonds: { value: diamonds } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uThrottle, uDiamonds; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float t = 1.0 - vUv.y;                 // 0 at the nozzle, 1 at the tail
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(facing, 1.6);
        float n = noise(vec2(vUv.x * 10.0, t * 7.0 - uTime * 26.0)) * 0.6 + noise(vec2(vUv.x * 23.0, t * 15.0 - uTime * 41.0)) * 0.4;
        float len = mix(0.35, 1.0, uThrottle);
        float fade = 1.0 - smoothstep(0.05 * len, len, t + (n - 0.5) * 0.25);
        float diamonds = 1.0 + uDiamonds * smoothstep(0.6, 1.0, sin(t * 38.0 - 1.2)) * (1.0 - smoothstep(0.1, 0.45, t));
        vec3 hot = vec3(1.0, 0.96, 0.9);
        vec3 col = mix(hot, uColor, smoothstep(0.02, 0.35, t));
        col = mix(col, uColor * 0.5, smoothstep(0.4, 0.9, t));
        float a = core * fade * (0.65 + 0.5 * n) * diamonds * uThrottle;
        gl_FragColor = vec4(col * a * 1.8, a);
      }`,
  });
}

function plume(parent, y, r0, r1, len, mat) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 28, 12, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.frustumCulled = false;
  m.renderOrder = 5;
  parent.add(m);
  return m;
}

function bell(r0, r1, h, seg = 24) {
  // Nozzle bell: a curved lathe profile, open at the exit.
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(r1 + (r0 - r1) * Math.pow(t, 0.55), h * (1 - t))); }
  return new THREE.LatheGeometry(pts, seg);
}

function nozzleMaterial() {
  return once('nozzle', () => {
    const tex = canvasTexture(64, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3a3632'); g.addColorStop(0.55, '#6a5a4a'); g.addColorStop(0.85, '#8a6a4a'); g.addColorStop(1, '#2a2826');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
    });
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.85, side: THREE.DoubleSide });
  });
}

// ---- Aurora rocket -----------------------------------------------------------------

// Leg deploy angles: stage-1 feet reach 5.6 m below the engines, upper-stage
// feet 0.4 m below its nozzle.
export const AURORA = { R: 1.85, UPPER_BASE: 39.3, HEIGHT: 60.2, S1_TOP: 38.0, INTER_TOP: 42.3, LEG1: 2.5, LEG2: 2.6, FOOT1: 5.55, FOOT2: 0.4 };

function boosterLivery() {
  return paintLivery(1024, 4096, (c, p, r, w, h) => {
    const rnd = mulberry32(501);
    c.fillStyle = '#eef0f1'; c.fillRect(0, 0, w, h);
    // Flight-proven soot: dark at the base, streaks running up the body.
    const g = c.createLinearGradient(0, h, 0, h * 0.55);
    g.addColorStop(0, 'rgba(30,26,22,0.75)'); g.addColorStop(0.35, 'rgba(40,36,30,0.25)'); g.addColorStop(1, 'rgba(40,36,30,0)');
    c.fillStyle = g; c.fillRect(0, h * 0.55, w, h * 0.45);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, len = h * (0.05 + rnd() * 0.35);
      c.fillStyle = `rgba(35,30,25,${0.03 + rnd() * 0.08})`; c.fillRect(x, h - len, 2 + rnd() * 10, len);
    }
    for (let i = 0; i < 1200; i++) { c.fillStyle = `rgba(90,90,90,${rnd() * 0.035})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 6 + rnd() * 40); }
    // Tank domes / weld rings and stringers.
    LV.panelGrid(p, w, h, [0.05, 0.18, 0.31, 0.44, 0.57, 0.62, 0.75, 0.88, 0.97], [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875], '#000', 1.2);
    LV.rivets(p, w, h, 3000, rnd);
    // Raceway (cable tray) on one side.
    c.fillStyle = '#d7dadd'; c.fillRect(w * 0.49, 0, w * 0.02, h);
    p.strokeStyle = '#000'; p.lineWidth = 2; p.strokeRect(w * 0.49, 0, w * 0.02, h);
    // Name reading bottom-to-top on both sides, with the flag.
    for (const u of [0.25, 0.75]) {
      c.save(); c.translate(u * w, h * 0.38); c.rotate(-Math.PI / 2);
      c.font = 'bold 150px Arial'; c.fillStyle = '#16202a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('KESTREL', 0, 0); c.restore();
      const fx = u * w - 60, fy = h * 0.14;
      c.fillStyle = '#1d3e7a'; c.fillRect(fx, fy, 120, 80);
      c.fillStyle = '#f4f4f4'; c.fillRect(fx, fy + 30, 120, 20);
      c.fillStyle = '#c8302a'; c.beginPath(); c.arc(fx + 60, fy + 40, 16, 0, Math.PI * 2); c.fill();
    }
    r.fillStyle = '#9a9a9a'; r.fillRect(0, 0, w, h);
  });
}

function upperLivery() {
  return paintLivery(1024, 1024, (c, p, r, w, h) => {
    const rnd = mulberry32(502);
    c.fillStyle = '#f0f2f3'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(90,90,90,${rnd() * 0.03})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 6 + rnd() * 30); }
    LV.panelGrid(p, w, h, [0.1, 0.4, 0.7, 0.95], [0, 0.25, 0.5, 0.75], '#000', 1.3);
    LV.rivets(p, w, h, 1500, rnd);
    for (const u of [0.25, 0.75]) {
      c.save(); c.translate(u * w, h * 0.55); c.rotate(-Math.PI / 2);
      c.font = 'bold 120px Arial'; c.fillStyle = '#16202a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('AURORA', 0, 0); c.restore();
    }
    r.fillStyle = '#8f8f8f'; r.fillRect(0, 0, w, h);
  });
}

function capsuleLivery() {
  return paintLivery(1024, 512, (c, p, r, w, h) => {
    const rnd = mulberry32(503);
    c.fillStyle = '#f2f3f4'; c.fillRect(0, 0, w, h);
    // Heat shield edge (bottom) and soot.
    c.fillStyle = '#2b2a28'; c.fillRect(0, h * 0.9, w, h * 0.1);
    const g = c.createLinearGradient(0, h * 0.9, 0, h * 0.5); g.addColorStop(0, 'rgba(60,50,40,0.5)'); g.addColorStop(1, 'rgba(60,50,40,0)');
    c.fillStyle = g; c.fillRect(0, h * 0.5, w, h * 0.4);
    // Windows (four around), hatch, name.
    r.fillStyle = '#a0a0a0'; r.fillRect(0, 0, w, h);
    for (let k = 0; k < 4; k++) {
      const u = 0.125 + k * 0.25;
      c.fillStyle = '#0f1820'; c.beginPath(); c.ellipse(u * w, h * 0.42, 34, 44, 0, 0, Math.PI * 2); c.fill();
      r.fillStyle = '#0a0a0a'; r.beginPath(); r.ellipse(u * w, h * 0.42, 34, 44, 0, 0, Math.PI * 2); r.fill();
      p.strokeStyle = '#000'; p.lineWidth = 3; p.beginPath(); p.ellipse(u * w, h * 0.42, 38, 48, 0, 0, Math.PI * 2); p.stroke();
    }
    p.strokeStyle = '#000'; p.lineWidth = 3; p.strokeRect(w * 0.44, h * 0.2, w * 0.12, h * 0.45);
    c.fillStyle = '#16202a'; c.font = 'bold 44px Arial'; c.textAlign = 'center';
    c.fillText('KESTREL', w * 0.25, h * 0.78); c.fillText('KESTREL', w * 0.75, h * 0.78);
    LV.panelGrid(p, w, h, [0.3, 0.6, 0.88], [0.0, 0.25, 0.5, 0.75], '#000', 1.4);
    LV.rivets(p, w, h, 800, rnd);
  });
}

function solarTexture() {
  return once('trunkSolar', () => canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0c1422'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3a4c6a'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#d8dadc'; ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6);
  }));
}

// A cylinder section with livery UVs (u around from +X side at 0.25, v up).
function tube(r0, r1, y0, y1, seg = 48, open = true) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, Math.max(1, Math.round((y1 - y0) / 3)), open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g; // u = 0 faces +Z, u = 0.25 faces +X
}

function landingLeg(len, width, thick, mat, footR, deploy) {
  const g = new THREE.Group();
  const leg = new THREE.BoxGeometry(width, len, thick);
  // Taper towards the foot.
  const p = leg.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + len / 2) / len; p.setX(i, p.getX(i) * (1 - t * 0.45)); }
  leg.computeVertexNormals();
  leg.translate(0, len / 2, thick / 2 + 0.05);
  add(g, leg, mat);
  const foot = new THREE.CylinderGeometry(footR, footR * 1.15, 0.18, 14);
  add(g, foot, stdMat(0x2a2c2e, { rough: 0.6, metal: 0.6 }), 0, len, thick / 2 + 0.05, -deploy, 0, 0);
  return g;
}

export function buildRocket() {
  const { R, UPPER_BASE, S1_TOP, INTER_TOP } = AURORA;
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  const stage1 = new THREE.Group(), upper = new THREE.Group();
  model.add(stage1, upper);

  const lv1 = once('boosterLiv', boosterLivery);
  const skin1 = new THREE.MeshStandardMaterial({ map: lv1.map, normalMap: lv1.normalMap, roughnessMap: lv1.roughnessMap, roughness: 1, metalness: 0.15 });
  const carbon = stdMat(0x17181a, { rough: 0.55, metal: 0.3 });
  const dark = stdMat(0x2a2b2d, { rough: 0.7, metal: 0.4 });
  const metal = stdMat(0x8d9296, { rough: 0.35, metal: 0.9 });

  // ---- Stage 1 ----
  const octa = tube(R - 0.08, R - 0.02, 1.0, 1.9, 32, false);
  add(stage1, octa, dark);
  const tank1 = tube(R, R, 1.9, S1_TOP, 48, true);
  add(stage1, tank1, skin1);
  const inter = tube(R + 0.01, R + 0.01, S1_TOP, INTER_TOP, 48, true);
  add(stage1, inter, carbon);
  add(stage1, new THREE.TorusGeometry(R + 0.02, 0.05, 6, 48).rotateX(Math.PI / 2), metal, 0, S1_TOP, 0);
  // Nine engines: eight around, one in the centre, under a heat shield.
  const nz = nozzleMaterial();
  const engPos = [[0, 0]];
  for (let k = 0; k < 8; k++) engPos.push([Math.cos(k / 8 * Math.PI * 2) * 1.2, Math.sin(k / 8 * Math.PI * 2) * 1.2]);
  for (const [x, z] of engPos) add(stage1, bell(0.42, 0.2, 1.15), nz, x, -0.05, z);
  add(stage1, new THREE.CircleGeometry(R - 0.05, 32).rotateX(Math.PI / 2), dark, 0, 1.0, 0);
  // Landing legs (stowed flat against the base) and grid fins (stowed).
  const legs1 = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * (R - 0.02), 2.0, Math.cos(a) * (R - 0.02));
    pivot.rotation.y = a;
    const hinge = new THREE.Group(); pivot.add(hinge);
    hinge.add(landingLeg(9.4, 0.95, 0.28, carbon, 0.55, AURORA.LEG1));
    stage1.add(pivot);
    legs1.push(hinge);
  }
  const fins = [];
  const finMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea2, metalness: 0.9, roughness: 0.4, map: gridFinTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * (R + 0.05), INTER_TOP - 1.4, Math.cos(a) * (R + 0.05));
    pivot.rotation.y = a;
    const hinge = new THREE.Group(); pivot.add(hinge);
    add(hinge, new THREE.BoxGeometry(1.5, 1.2, 0.12), finMat, 0, 0.6, 0.08);
    add(hinge, new THREE.BoxGeometry(0.18, 0.18, 0.4), metal, 0, 0.1, 0);
    stage1.add(pivot);
    fins.push(hinge);
  }
  // Cold-gas thruster pods near the top.
  for (const s of [1, -1]) add(stage1, new THREE.BoxGeometry(0.35, 0.6, 0.3), dark, s * (R + 0.1), INTER_TOP - 0.6, 0);
  const plume1Mat = plumeMaterial([1.0, 0.52, 0.16], { diamonds: 0.35 });
  const plume1 = plume(stage1, -0.05, 2.1, 5.5, 46, plume1Mat);
  const plume1b = plume(stage1, -0.05, 1.2, 2.2, 12, plume1Mat);
  const glow1 = glowSprite(0xffc890, 16, 0); glow1.position.y = -1.5; stage1.add(glow1);

  // ---- Upper stage ----
  const lv2 = once('upperLiv', upperLivery);
  const skin2 = new THREE.MeshStandardMaterial({ map: lv2.map, normalMap: lv2.normalMap, roughnessMap: lv2.roughnessMap, roughness: 1, metalness: 0.15 });
  add(upper, bell(1.15, 0.45, INTER_TOP - UPPER_BASE - 0.2, 32), nz, 0, UPPER_BASE, 0);
  add(upper, new THREE.CylinderGeometry(0.5, 0.7, 0.6, 16), dark, 0, INTER_TOP - 0.1, 0);
  const tank2 = tube(R, R, INTER_TOP, 51.4, 48, true);
  add(upper, tank2, skin2);
  add(upper, new THREE.CircleGeometry(R, 32).rotateX(Math.PI / 2), dark, 0, INTER_TOP + 0.01, 0);
  const trunk = tube(R, R, 51.4, 53.4, 48, true);
  add(upper, trunk, new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.25, metalness: 0.6 }));
  // Capsule: truncated cone with windows, heat shield rim and a nose cap.
  const lvc = once('capsuleLiv', capsuleLivery);
  const capMat = new THREE.MeshStandardMaterial({ map: lvc.map, normalMap: lvc.normalMap, roughnessMap: lvc.roughnessMap, roughness: 1, metalness: 0.1 });
  const cap = tube(R, 1.15, 53.4, 58.2, 48, true);
  add(upper, cap, capMat);
  const nose = new THREE.SphereGeometry(1.15, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2); nose.scale(1, 1.55, 1);
  add(upper, nose, stdMat(0xf0f1f2, { rough: 0.45, metal: 0.1 }), 0, 58.2, 0);
  // Draco-style thruster ports.
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; add(upper, new THREE.BoxGeometry(0.25, 0.2, 0.08), dark, Math.sin(a) * 1.62, 55, Math.cos(a) * 1.62, 0, a, 0); }
  // Upper-stage lander legs (stowed along the tank).
  const legs2 = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * (R - 0.02), INTER_TOP + 0.3, Math.cos(a) * (R - 0.02));
    pivot.rotation.y = a;
    const hinge = new THREE.Group(); pivot.add(hinge);
    hinge.add(landingLeg(4.2, 0.42, 0.16, carbon, 0.36, AURORA.LEG2));
    upper.add(pivot);
    legs2.push(hinge);
  }
  const plume2Mat = plumeMaterial([0.55, 0.62, 1.0], { diamonds: 0.15 });
  const plume2 = plume(upper, UPPER_BASE, 1.1, 5.0, 26, plume2Mat);
  const glow2 = glowSprite(0xcfdcff, 9, 0); glow2.position.y = UPPER_BASE - 0.8; upper.add(glow2);
  // RCS puffs.
  const rcs = [];
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const s = glowSprite(0xffffff, 1.6, 0); s.position.set(Math.sin(a) * 2.0, 55, Math.cos(a) * 2.0); upper.add(s); rcs.push(s); }
  // Strobe on the nose.
  const strobe = glowSprite(0xffffff, 2.2, 0); strobe.position.y = 60.4; upper.add(strobe);

  return {
    group, parts: { model, stage1, upper, legs1, legs2, fins, plume1: [plume1, plume1b], plume1Mat, plume2, plume2Mat, glow1, glow2, rcs, strobe },
    ground: 0, radius: 4.4, length: 60, camDist: 70, camHeight: 22,
  };
}

// ---- Odyssey spaceplane ---------------------------------------------------------

function odysseyLivery() {
  return paintLivery(1024, 2048, (c, p, r, w, h) => {
    const rnd = mulberry32(601);
    c.fillStyle = '#eef0f1'; c.fillRect(0, 0, w, h);
    // Black heat-tile belly with a tile grid, feathered edge.
    const belly = (u0, u1) => { c.fillStyle = '#1b1c1e'; LV.rect(c, u0, 0, u1, 1, w, h); };
    belly(0, 0.2); belly(0.8, 1);
    c.fillStyle = '#1b1c1e'; LV.rect(c, 0.2, 0.9, 0.8, 1, w, h);
    for (let y = 0; y < h; y += 12) for (let x = 0; x < w; x += 12) {
      const u = x / w;
      if (u < 0.2 || u > 0.8 || y < h * 0.1) {
        c.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.08})`; c.fillRect(x, y, 11, 11);
        p.strokeStyle = 'rgba(0,0,0,0.6)'; p.lineWidth = 1; p.strokeRect(x, y, 12, 12);
      }
    }
    // Top panel lines, rivets and weathering.
    LV.panelGrid(p, w, h, [0.12, 0.25, 0.38, 0.5, 0.62, 0.74, 0.85], [0.3, 0.4, 0.5, 0.6, 0.7], '#000', 1.3);
    LV.rivets(p, w, h, 3000, rnd);
    for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(80,80,80,${rnd() * 0.04})`; c.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 8 + rnd() * 40); }
    // Cockpit windows.
    r.fillStyle = '#909090'; r.fillRect(0, 0, w, h);
    c.fillStyle = '#0d151c'; r.fillStyle = '#080808';
    for (const [a, b] of [[0.41, 0.47], [0.475, 0.525], [0.53, 0.59]]) { LV.rect(c, a, 0.83, b, 0.875, w, h); LV.rect(r, a, 0.83, b, 0.875, w, h); }
    for (const [a, b] of [[0.37, 0.4], [0.6, 0.63]]) { LV.rect(c, a, 0.8, b, 0.84, w, h); LV.rect(r, a, 0.8, b, 0.84, w, h); }
    // Name, flag and stripe.
    c.fillStyle = '#c8302a'; LV.rect(c, 0.2, 0.2, 0.215, 0.8, w, h); LV.rect(c, 0.785, 0.2, 0.8, 0.8, w, h);
    LV.text(c, 'ODYSSEY', 0.3, 0.55, w, h, 'left', 'bold 64px Arial', '#16202a');
    LV.text(c, 'ODYSSEY', 0.7, 0.55, w, h, 'right', 'bold 64px Arial', '#16202a');
    LV.text(c, 'KESTREL SPACE', 0.27, 0.3, w, h, 'left', 'bold 26px Arial', '#3a4a58');
    LV.text(c, 'KESTREL SPACE', 0.73, 0.3, w, h, 'right', 'bold 26px Arial', '#3a4a58');
  });
}

export function buildShip() {
  const g = new THREE.Group();
  const lv = once('odysseyLiv', odysseyLivery);
  const skin = new THREE.MeshStandardMaterial({ map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, roughness: 1, metalness: 0.12 });
  const white = once('odSurf', () => panelSurface('#e6e9eb', { rough: 0.5, metal: 0.15, repeat: 0.2 }));
  const black = stdMat(0x1c1d1f, { rough: 0.8 });
  const metal = stdMat(0x3a3d40, { rough: 0.35, metal: 0.85 });
  const body = loft(smoothSections([
    { z: -11.2, w: 1.5, h: 1.1, y: 0.3, n: 3 }, { z: -9, w: 2.1, h: 1.55, y: 0.25, n: 3.2 }, { z: -3, w: 2.45, h: 1.8, y: 0.2, n: 3.2 },
    { z: 3, w: 2.3, h: 1.7, y: 0.1, n: 3 }, { z: 7.5, w: 1.7, h: 1.35, y: 0.0, n: 2.6 }, { z: 10.3, w: 0.95, h: 0.85, y: -0.15 },
    { z: 11.9, w: 0.25, h: 0.25, y: -0.3 }, { z: 12.2, w: 0.02, h: 0.02, y: -0.32 },
  ], 4), { segs: 48 });
  add(g, body, skin);
  // Delta wings with a black leading edge, winglet fins, body flap.
  for (const s of [1, -1]) {
    const w = add(g, planform([[1.9, 3.8], [7.2, -8.0], [7.4, -10.4], [1.9, -10.6]], 0.34), white, 0, -0.9, 0); w.scale.x = s; w.rotation.z = s * 0.06;
    const le = add(g, planform([[1.9, 3.9], [7.25, -7.9], [6.9, -8.0], [1.9, 3.0]], 0.36), black, 0, -0.9, 0); le.scale.x = s; le.rotation.z = s * 0.06;
    const tail = add(g, fin([[-7.2, 0.1], [-9.6, 3.4], [-10.9, 3.4], [-10.6, 0.0]], 0.16), white, s * 7.2, -0.55, 0);
    tail.rotation.z = -s * 0.28;
  }
  add(g, new THREE.BoxGeometry(3.6, 0.25, 1.4), black, 0, -1.1, -11.1);
  // Main engines with glowing throats and plumes.
  const plumeMat = plumeMaterial([0.6, 0.7, 1.0], { diamonds: 0.3 });
  const liftMat = plumeMaterial([0.7, 0.75, 1.0], { diamonds: 0.1 });
  const mains = [];
  for (const [x, y] of [[0, 0.55], [0.95, -0.3], [-0.95, -0.3]]) {
    const b = add(g, bell(0.55, 0.28, 1.4), nozzleMaterial(), x, y, -12.5, Math.PI / 2, 0, 0);
    const pl = plume(b, 0, 0.5, 1.8, 14, plumeMat);
    const glow = glowSprite(0xbfd0ff, 3.5, 0); glow.position.set(x, y, -12.9); g.add(glow);
    mains.push({ bell: b, plume: pl, glow });
  }
  // VTOL lift thrusters under the belly.
  const lifts = [];
  for (const [x, z] of [[1.5, 5.5], [-1.5, 5.5], [1.6, -6.5], [-1.6, -6.5]]) {
    add(g, new THREE.CylinderGeometry(0.5, 0.55, 0.2, 18), metal, x, -1.45, z);
    const pl = plume(g, -1.5, 0.45, 1.6, 7, liftMat); pl.position.set(x, -1.5, z);
    const glow = glowSprite(0xbfd0ff, 2.6, 0); glow.position.set(x, -1.8, z); g.add(glow);
    lifts.push({ plume: pl, glow });
  }
  // Landing gear.
  const gear = new THREE.Group();
  const strut = stdMat(0x3a3e42, { rough: 0.45, metal: 0.8 });
  for (const [x, z] of [[0, 8.2], [2.0, -4.5], [-2.0, -4.5]]) {
    add(gear, new THREE.CylinderGeometry(0.1, 0.1, 1.5, 10), strut, x, -2.1, z);
    const tyre = new THREE.TorusGeometry(0.34, 0.16, 10, 20); tyre.rotateY(Math.PI / 2);
    add(gear, tyre, stdMat(0x121212, { rough: 0.85 }), x, -2.75, z);
    add(gear, new THREE.CylinderGeometry(0.22, 0.22, 0.24, 14).rotateZ(Math.PI / 2), stdMat(0x9aa0a6, { rough: 0.35, metal: 0.8 }), x, -2.75, z);
  }
  g.add(gear);
  const red = glowSprite(0xff2a2a, 1.6); red.position.set(7.4, -0.8, -9.8);
  const green = glowSprite(0x2aff5a, 1.6); green.position.set(-7.4, -0.8, -9.8);
  const strobe = glowSprite(0xffffff, 2.4); strobe.position.set(0, 1.4, -8);
  g.add(red, green, strobe);
  return { group: g, parts: { mains, lifts, plumeMat, liftMat, gear, nav: { red, green, strobe } }, ground: 3.25, radius: 9, length: 24, camDist: 36, camHeight: 9 };
}
