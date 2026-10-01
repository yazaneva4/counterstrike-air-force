// Procedural texture library. Everything is generated once at load on a
// canvas: tileable ground detail (grass, rock, sand), tree bark, leaf and
// pine-needle cards with alpha, roof tiles, corrugated metal, fabric weave,
// and normal maps derived from height. No image files needed.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// Tileable value noise on a size x size torus.
export function tileNoise(size, freq, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, f = freq;
  const rnd = mulberry32(seed);
  for (let o = 0; o < octaves; o++) {
    const n = Math.max(2, Math.round(f));
    const grid = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) grid[i] = rnd();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * n, iy = Math.floor(gy), fy = gy - iy, sy = fy * fy * (3 - 2 * fy);
      const y0 = iy % n, y1 = (iy + 1) % n;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * n, ix = Math.floor(gx), fx = gx - ix, sx = fx * fx * (3 - 2 * fx);
        const x0 = ix % n, x1 = (ix + 1) % n;
        const a = grid[y0 * n + x0], b = grid[y0 * n + x1], c = grid[y1 * n + x0], d = grid[y1 * n + x1];
        out[y * size + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
      }
    }
    norm += amp; amp *= gain; f *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function canvasOf(size, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Grayscale height array -> tangent-space normal map canvas (tileable).
export function normalCanvas(h, size, strength = 2) {
  const c = canvasOf(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(h, size, map = (v) => v) {
  const c = canvasOf(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, map(h[i]) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---- Ground detail (grayscale, ~0.5 average; multiplied onto vertex colour) ----

export function groundDetail() {
  return once('ground', () => {
    const S = 512;
    // Grass: dense short blades + clumps.
    const grass = tileNoise(S, 6, 5, 11);
    const rnd = mulberry32(12);
    const g = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) g[i] = 0.42 + (grass[i] - 0.5) * 0.35;
    for (let k = 0; k < 26000; k++) {
      const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), len = 3 + rnd() * 6, lean = (rnd() - 0.5) * 0.8, v = 0.25 + rnd() * 0.5;
      for (let j = 0; j < len; j++) {
        const px = (x + Math.round(j * lean) + S) % S, py = (y - j + S) % S;
        g[py * S + px] = g[py * S + px] * 0.3 + v * 0.7 + j / len * 0.12;
      }
    }
    // Rock: cracked, layered.
    const r1 = tileNoise(S, 4, 6, 21), r2 = tileNoise(S, 16, 4, 22);
    const rock = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) {
      const crack = Math.abs(r2[i] - 0.5) < 0.025 ? -0.25 : 0;
      rock[i] = 0.35 + r1[i] * 0.35 + (r2[i] - 0.5) * 0.25 + crack;
    }
    // Sand: fine grain + wind ripples.
    const s1 = tileNoise(S, 64, 2, 31), s2 = tileNoise(S, 5, 3, 32);
    const sand = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ripple = Math.sin((y / S) * Math.PI * 2 * 18 + s2[i] * 9) * 0.06;
      sand[i] = 0.48 + (s1[i] - 0.5) * 0.25 + ripple;
    }
    // Pack grass/rock/sand into RGB of one texture.
    const c = canvasOf(S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      img.data[i * 4] = Math.max(0, Math.min(255, g[i] * 255));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, rock[i] * 255));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, sand[i] * 255));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = toTexture(c, { srgb: false });
    tex.generateMipmaps = true;
    // Combined bump for all three (average) -> normal map.
    const hmix = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) hmix[i] = (g[i] * 0.6 + rock[i] * 1.4 + sand[i] * 0.4) / 2.4;
    const normal = toTexture(normalCanvas(hmix, S, 3.2), { srgb: false });
    return { detail: tex, normal };
  });
}

// ---- Vegetation ----------------------------------------------------------------

export function barkTexture() {
  return once('bark', () => {
    const S = 256;
    const n1 = tileNoise(S, 3, 4, 41), n2 = tileNoise(S, 24, 3, 42);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      // Vertical furrows.
      const fur = Math.abs(Math.sin((x / S) * Math.PI * 14 + n1[i] * 6));
      h[i] = 0.3 + fur * 0.45 + (n2[i] - 0.5) * 0.3;
    }
    const c = canvasOf(S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = h[i];
      img.data[i * 4] = 70 + v * 90; img.data[i * 4 + 1] = 55 + v * 70; img.data[i * 4 + 2] = 42 + v * 50; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normal: toTexture(normalCanvas(h, S, 4), { srgb: false }) };
  });
}

// Broadleaf foliage card: clusters of individual leaves with alpha.
export function leafCard() {
  return once('leaf', () => {
    const S = 256, c = canvasOf(S), ctx = c.getContext('2d');
    const rnd = mulberry32(51);
    ctx.clearRect(0, 0, S, S);
    // Twigs.
    ctx.strokeStyle = 'rgba(70,52,34,1)'; ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      ctx.beginPath(); ctx.moveTo(S / 2, S); let x = S / 2, y = S;
      for (let s = 0; s < 6; s++) { x += (rnd() - 0.5) * 50; y -= 30 + rnd() * 10; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let k = 0; k < 420; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * S * 0.46;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r * 0.9;
      const len = 7 + rnd() * 9, wid = len * (0.38 + rnd() * 0.15), rot = rnd() * Math.PI * 2;
      const lightness = 0.55 + rnd() * 0.5 - (r / (S * 0.46)) * 0.15;
      const gcol = [Math.round((52 + rnd() * 30) * lightness), Math.round((96 + rnd() * 50) * lightness), Math.round((34 + rnd() * 20) * lightness)];
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = `rgb(${gcol[0]},${gcol[1]},${gcol[2]})`;
      ctx.beginPath(); ctx.ellipse(0, 0, len / 2, wid / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${gcol[0] + 25},${gcol[1] + 30},${gcol[2] + 15},0.7)`; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
      ctx.restore();
    }
    const t = toTexture(c, { repeat: false });
    return t;
  });
}

// Pine branch card: a central twig with needles, drooping.
export function needleCard() {
  return once('needle', () => {
    const W = 256, H = 128, c = canvasOf(W, H), ctx = c.getContext('2d');
    const rnd = mulberry32(61);
    ctx.clearRect(0, 0, W, H);
    for (let b = 0; b < 5; b++) {
      const y0 = H * (0.14 + b * 0.18);
      ctx.strokeStyle = 'rgb(74,56,38)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.quadraticCurveTo(W * 0.45, y0, W * (0.9 + rnd() * 0.1), y0 + (rnd() - 0.5) * 12); ctx.stroke();
      for (let k = 0; k < 420; k++) {
        const t = Math.sqrt(rnd());
        const x = t * W * 0.95, y = H / 2 + (y0 - H / 2) * Math.min(1, t * 1.25) + (rnd() - 0.5) * 5;
        const len = (1 - t * 0.45) * (9 + rnd() * 10), a = (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.8) - 0.25;
        const l = 0.5 + rnd() * 0.5;
        ctx.strokeStyle = `rgb(${Math.round(34 * l)},${Math.round((72 + rnd() * 34) * l)},${Math.round(40 * l)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len * 0.45, y + Math.sin(a) * len * 0.8); ctx.stroke();
      }
    }
    return toTexture(c, { repeat: false });
  });
}

// Palm frond: long leaflets both sides of a rib.
export function frondCard() {
  return once('frond', () => {
    const W = 128, H = 512, c = canvasOf(W, H), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const rnd = mulberry32(71);
    // Individual tapering leaflets with gaps, drooping towards the tip; a few torn.
    for (let y = 10; y < H - 6; y += 6 + rnd() * 3) {
      const t = y / H, len = Math.sin(Math.min(1, t * 1.15) * Math.PI) * (W / 2 - 3) * (0.8 + rnd() * 0.2);
      for (const s of [-1, 1]) {
        if (rnd() < 0.06) continue;
        const l = 0.62 + rnd() * 0.45, dry = t < 0.12 || rnd() < 0.05 ? 1 : 0;
        ctx.fillStyle = dry ? `rgb(${Math.round(130 * l)},${Math.round(118 * l)},${Math.round(60 * l)})` : `rgb(${Math.round(58 * l)},${Math.round(112 * l)},${Math.round(42 * l)})`;
        const ex = W / 2 + s * len, ey = y + len * 0.55;
        ctx.beginPath(); ctx.moveTo(W / 2, y - 1.6); ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y + len * 0.12 - 2.2, ex, ey);
        ctx.quadraticCurveTo(W / 2 + s * len * 0.5, y + len * 0.2 + 1.6, W / 2, y + 2.2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgb(128,116,66)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2, H); ctx.lineTo(W / 2, 0); ctx.stroke();
    return toTexture(c, { repeat: false });
  });
}

// ---- Architecture ----------------------------------------------------------------

export function roofTiles() {
  return once('roof', () => {
    const S = 256, h = new Float32Array(S * S), n = tileNoise(S, 16, 3, 81);
    const rows = 12, cols = 10;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ry = (y / S) * rows, fy = ry - Math.floor(ry);
      const off = (Math.floor(ry) % 2) * 0.5;
      const rx = (x / S) * cols + off, fx = rx - Math.floor(rx);
      const curve = Math.sin(fx * Math.PI);
      h[y * S + x] = curve * 0.6 * (0.4 + fy * 0.6) + (fy < 0.08 ? -0.3 : 0) + (n[y * S + x] - 0.5) * 0.15;
    }
    const c = grayCanvas(h, S, (v) => 0.55 + v * 0.5);
    return { map: toTexture(c, { srgb: false }), normal: toTexture(normalCanvas(h, S, 5), { srgb: false }) };
  });
}

export function plaster() {
  return once('plaster', () => {
    const S = 256, n = tileNoise(S, 8, 5, 91), f = tileNoise(S, 64, 2, 92);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = n[i] * 0.6 + f[i] * 0.4;
    return { map: toTexture(grayCanvas(h, S, (v) => 0.82 + (v - 0.5) * 0.3), { srgb: false }), normal: toTexture(normalCanvas(h, S, 1.6), { srgb: false }) };
  });
}

export function corrugated() {
  return once('corr', () => {
    const S = 256, n = tileNoise(S, 6, 4, 101);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = Math.sin((x / S) * Math.PI * 2 * 24) * 0.5 + (n[y * S + x] - 0.5) * 0.1;
    const rough = grayCanvas(n, S, (v) => 0.35 + v * 0.4);
    return { normal: toTexture(normalCanvas(h, S, 2.4), { srgb: false }), rough: toTexture(rough, { srgb: false }) };
  });
}

export function fabric() {
  return once('fabric', () => {
    const S = 128, h = new Float32Array(S * S), n = tileNoise(S, 32, 2, 111);
    const c = canvasOf(S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const weave = Math.sin((x / S) * Math.PI * 2 * 32) * Math.sin((y / S) * Math.PI * 2 * 32) * 0.5;
      h[i] = weave * 0.6 + (n[i] - 0.5) * 0.4;
      const tone = 234 + Math.round((n[i] - 0.5) * 22 + weave * 5);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = tone; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { map: toTexture(c), normal: toTexture(normalCanvas(h, S, 1.4), { srgb: false }) };
  });
}

// Generic brushed/weathered metal roughness + subtle normal.
export function metalWear() {
  return once('metal', () => {
    const S = 256, n = tileNoise(S, 12, 5, 121), s = tileNoise(S, 128, 1, 122);
    const h = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) h[i] = n[i] * 0.7 + s[i] * 0.3;
    return { rough: toTexture(grayCanvas(h, S, (v) => 0.3 + v * 0.45), { srgb: false }), normal: toTexture(normalCanvas(h, S, 0.8), { srgb: false }) };
  });
}

// Livery helper: paints a canvas (u around the body, v along its length,
// v = 1 at the nose) and derives panel-line normals from dark lines.
export function livery(w, h, draw, { lineStrength = 2.5 } = {}) {
  const c = canvasOf(w, h), ctx = c.getContext('2d');
  const panels = canvasOf(w, h), pctx = panels.getContext('2d');
  pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, w, h);
  draw(ctx, pctx, w, h);
  // Panel lines -> height -> normal map.
  const pd = pctx.getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = pd[i * 4] / 255;
  const nc = canvasOf(w, h), nctx = nc.getContext('2d');
  const img = nctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = H[y * w + Math.max(0, x - 1)], r = H[y * w + Math.min(w - 1, x + 1)];
    const u = H[Math.max(0, y - 1) * w + x], d = H[Math.min(h - 1, y + 1) * w + x];
    let nx = (l - r) * lineStrength, ny = (d - u) * lineStrength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * w + x) * 4;
    img.data[i] = (nx / len * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  // Darken the colour map along panel lines too.
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(panels, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const normal = new THREE.CanvasTexture(nc); normal.anisotropy = 8;
  return { map, normal };
}

// Draw rotated text on a livery canvas along the body (side = 'left'|'right').
export function sideText(ctx, text, u, v, w, h, side, font, color) {
  ctx.save();
  ctx.translate(u * w, (1 - v) * h);
  ctx.rotate(side === 'left' ? Math.PI / 2 : -Math.PI / 2);
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Remap a lathe/cylinder geometry's V coordinate to true length along +Z so
// livery textures are not stretched by uneven profile spacing.
export function lengthwiseUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setY(i, (p.getZ(i) - b.min.z) / (b.max.z - b.min.z));
  uv.needsUpdate = true;
  return geo;
}
