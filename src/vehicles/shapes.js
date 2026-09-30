// Geometry helpers for vehicles: lofted fuselages from superellipse
// cross-sections (u runs bottom -> left(+X) -> top -> right, v runs tail ->
// nose along +Z, matching the livery painter), wing planforms, fins, and a
// livery painter with colour, panel-line normal and roughness maps.

import * as THREE from 'three';

// sections: [{ z, w, h, y = 0, n = 2 }] sorted by z. n = 2 ellipse, n > 2 boxier.
export function loft(sections, { segs = 32, capStart = true, capEnd = true } = {}) {
  const S = sections.length, R = segs + 1;
  const pos = [], uv = [], idx = [];
  const z0 = sections[0].z, z1 = sections[S - 1].z;
  for (let i = 0; i < S; i++) {
    const s = sections[i], n = s.n ?? 2, e = 2 / n;
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      const x = s.w * Math.sign(sa) * Math.pow(Math.abs(sa), e);
      const y = (s.y ?? 0) - s.h * Math.sign(ca) * Math.pow(Math.abs(ca), e);
      pos.push(x, y, s.z);
      uv.push(j / segs, (s.z - z0) / (z1 - z0));
    }
  }
  for (let i = 0; i < S - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * R + j, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  // Caps get their own ring of vertices so their normals point straight along the axis.
  const addCap = (i, flip) => {
    const s = sections[i];
    const center = pos.length / 3;
    const cv = i === 0 ? 0.08 : 0.92; // sample the body colour just inside the end
    pos.push(0, s.y ?? 0, s.z); uv.push(0.5, cv);
    const ring = pos.length / 3;
    for (let j = 0; j <= segs; j++) { const a = i * R + j; pos.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]); uv.push(j / segs, cv); }
    for (let j = 0; j < segs; j++) {
      const a = ring + j, b = a + 1;
      if (flip) idx.push(center, b, a); else idx.push(center, a, b);
    }
  };
  if (capStart && sections[0].w > 0.001) addCap(0, true);
  if (capEnd && sections[S - 1].w > 0.001) addCap(S - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Weld the seam normals so the underside has no shading crease.
  const nrm = g.attributes.normal;
  for (let i = 0; i < S; i++) {
    const a = i * R, b = i * R + segs;
    const nx = nrm.getX(a) + nrm.getX(b), ny = nrm.getY(a) + nrm.getY(b), nz = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l); nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return g;
}

// Smoothly interpolate a list of control sections into a denser loft.
export function smoothSections(ctrl, steps = 4) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const lin = (key) => p1[key] + (p2[key] - p1[key]) * t;
      out.push({ z: lin('z'), w: Math.max(0.0005, cr(p0.w, p1.w, p2.w, p3.w)), h: Math.max(0.0005, cr(p0.h, p1.h, p2.h, p3.h)), y: cr(p0.y ?? 0, p1.y ?? 0, p2.y ?? 0, p3.y ?? 0), n: lin('n') || 2 });
    }
  }
  out.push({ ...ctrl[ctrl.length - 1], n: ctrl[ctrl.length - 1].n ?? 2 });
  return out;
}

// Wing planform [[x (span), z (chord)], ...] extruded to a thin aerofoil slab.
export function planform(points, thick = 0.2, bevel = 0.3) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * bevel, bevelSize: thick * bevel * 0.9, bevelSegments: 2 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return g;
}

// Vertical profile [[z, y], ...] extruded across X.
export function fin(points, thick = 0.16) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.25, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(thick / 2, 0, 0);
  return g;
}

// Livery painter. draw(ctx, panels, rough, w, h): paint colour; draw dark
// lines on `panels` for recessed panel seams; paint `rough` (white = matte,
// black = glossy, e.g. windows). Returns { map, normalMap, roughnessMap }.
export function paintLivery(w, h, draw, { seam = 2.2 } = {}) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const color = mk(), panels = mk(), rough = mk();
  const cx = color.getContext('2d'), px = panels.getContext('2d'), rx = rough.getContext('2d');
  px.fillStyle = '#fff'; px.fillRect(0, 0, w, h);
  rx.fillStyle = '#9a9a9a'; rx.fillRect(0, 0, w, h);
  draw(cx, px, rx, w, h);
  const pd = px.getImageData(0, 0, w, h).data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = pd[i * 4] / 255;
  const nc = mk(), nx = nc.getContext('2d'), img = nx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
    const u = H[Math.max(0, y - 1) * w + x], d = H[Math.min(h - 1, y + 1) * w + x];
    let ax = (l - r) * seam, ay = (d - u) * seam, az = 1;
    const len = Math.hypot(ax, ay, az), i = (y * w + x) * 4;
    img.data[i] = (ax / len * 0.5 + 0.5) * 255; img.data[i + 1] = (ay / len * 0.5 + 0.5) * 255; img.data[i + 2] = (az / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  nx.putImageData(img, 0, 0);
  cx.globalCompositeOperation = 'multiply'; cx.globalAlpha = 0.28; cx.drawImage(panels, 0, 0);
  cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: tex(color, true), normalMap: tex(nc, false), roughnessMap: tex(rough, false) };
}

// Painting helpers in livery space: u = around (0 bottom, .25 left, .5 top,
// .75 right), v = along (1 = nose). Canvas y is flipped (top = nose).
export const LV = {
  X: (u, w) => u * w,
  Y: (v, h) => (1 - v) * h,
  // Text reading along the body on the left (+X) or right side.
  text(ctx, str, u, v, w, h, side, font, color, align = 'center') {
    ctx.save();
    ctx.translate(u * w, (1 - v) * h);
    ctx.rotate(side === 'left' ? Math.PI / 2 : -Math.PI / 2);
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(str, 0, 0);
    ctx.restore();
  },
  // Rectangle in (u, v) space.
  rect(ctx, u0, v0, u1, v1, w, h) { ctx.fillRect(u0 * w, (1 - v1) * h, (u1 - u0) * w, (v1 - v0) * h); },
  // Panel grid lines along and around the body.
  panelGrid(px, w, h, rings, stringers, color = '#000', width = 1.4) {
    px.strokeStyle = color; px.lineWidth = width;
    for (const v of rings) { px.beginPath(); px.moveTo(0, (1 - v) * h); px.lineTo(w, (1 - v) * h); px.stroke(); }
    for (const u of stringers) { px.beginPath(); px.moveTo(u * w, 0); px.lineTo(u * w, h); px.stroke(); }
  },
  rivets(px, w, h, count, rnd) {
    px.fillStyle = 'rgba(0,0,0,0.55)';
    for (let i = 0; i < count; i++) px.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1.2, 1.2);
  },
};

// Tileable panel texture for flat surfaces (wings, tails) with UVs in metres.
export function panelSurface(color, { size = 512, cell = 96, seam = 2, rough = 0.5, metal = 0.1, grime = 0.12, repeat = 0.25 } = {}) {
  const lv = paintLivery(size, size, (c, p, r, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * grime * 0.3})`; c.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 40, 2 + Math.random() * 6); }
    p.strokeStyle = '#000'; p.lineWidth = 1.5;
    for (let x = 0; x <= w; x += cell) { p.beginPath(); p.moveTo(x, 0); p.lineTo(x, h); p.stroke(); }
    for (let y = 0; y <= h; y += cell * 0.7) { p.beginPath(); p.moveTo(0, y); p.lineTo(w, y); p.stroke(); }
    p.fillStyle = 'rgba(0,0,0,0.5)';
    for (let x = 0; x <= w; x += cell) for (let y = 0; y < h; y += 8) p.fillRect(x + 4, y, 1, 1);
    r.fillStyle = `rgb(${rough * 255},${rough * 255},${rough * 255})`; r.fillRect(0, 0, w, h);
  }, { seam });
  for (const t of [lv.map, lv.normalMap, lv.roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return new THREE.MeshStandardMaterial({ map: lv.map, normalMap: lv.normalMap, roughnessMap: lv.roughnessMap, roughness: 1, metalness: metal });
}
