// Where the loose, physical props of the island sit: crates and drums by the
// hangars and market, cones and tyre stacks around the speedway, balls on the
// beach and barrels bobbing offshore. Every item is a live rigid body.

import { PLACES } from '../world/terrain.js';
import { mulberry32 } from '../core/noise.js';

const BARREL_COLORS = [0xc83a2a, 0x2a62b8, 0xe0a21c, 0x2c8a4a, 0x7a7e84];

export function placeIslandProps(game) {
  const { props, structures: S, terrain } = game;
  const rnd = mulberry32(4242);
  const free = (x, z, tries = 18) => {
    for (let i = 0; i < tries; i++) {
      const a = rnd() * 6.283, r = i === 0 ? 0 : 1.5 + i * 0.7;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!S.insideBuilding(px, pz, 1.0) && terrain.heightAt(px, pz) > 0.3) return [px, pz];
    }
    return null;
  };
  const put = (kind, x, z, opts = {}) => { const s = free(x, z); if (s) return props.add(kind, s[0], s[1], { yaw: rnd() * 6.283, ...opts }); return null; };
  const cluster = (x, z, { crates = 3, barrels = 3, boxes = 2, spread = 5 } = {}) => {
    for (let i = 0; i < crates; i++) put('crate', x + (rnd() - 0.5) * spread, z + (rnd() - 0.5) * spread);
    for (let i = 0; i < barrels; i++) put('barrel', x + (rnd() - 0.5) * spread, z + (rnd() - 0.5) * spread, { color: BARREL_COLORS[(rnd() * BARREL_COLORS.length) | 0] });
    for (let i = 0; i < boxes; i++) put('box', x + (rnd() - 0.5) * spread, z + (rnd() - 0.5) * spread);
    // A small stack: a crate with a box on top.
    const s = free(x, z + spread);
    if (s) { props.add('crate', s[0], s[1], { yaw: 0 }); props.add('box', s[0], s[1], { y: terrain.heightAt(s[0], s[1]) + 1.2, yaw: 0.4, sleep: false }); }
  };

  // Airbase apron and hangars.
  for (const x of [-300, -190, -40, 110, 260]) cluster(x, 598, { spread: 7 });
  for (const h of S.spawns.hangars || []) cluster(h.x + 16, h.z - 4, { crates: 2, barrels: 2, boxes: 1, spread: 4 });

  // Village market, farm and lighthouse yard.
  const V = S.spawns.village; if (V) cluster(V.x - 6, V.z + 4, { crates: 5, barrels: 3, boxes: 3, spread: 9 });
  const F = S.spawns.farm; if (F) cluster(F.x + 6, F.z - 3, { crates: 4, barrels: 5, boxes: 2, spread: 8 });
  const L = S.spawns.lighthouse; if (L) cluster(L.x - 6, L.z + 8, { crates: 2, barrels: 2, boxes: 2, spread: 5 });
  const C = PLACES.spaceport; cluster(C.x - 20, C.z + 38, { crates: 4, barrels: 4, boxes: 3, spread: 8 });

  // Speedway: cone chicanes, tyre stacks in the paddock, drums behind the garages.
  const R = S.race;
  if (R) {
    const n = R.pts.length, s0 = R.pts.findIndex(([x, z]) => Math.hypot(x - R.start.x, z - R.start.z) < 3);
    for (const [at, side] of [[28, 1], [40, -1], [52, 1], [64, -1], [76, 1]]) {
      const i = (s0 + at) % n, [x, z] = R.pts[i], [nx, nz] = R.pts[(i + 1) % n];
      const tx = nx - x, tz = nz - z, tl = Math.hypot(tx, tz) || 1;
      props.add('cone', x - tz / tl * side * 4.2, z + tx / tl * side * 4.2, { yaw: rnd() * 6.283 });
    }
    for (let k = 0; k < 14; k++) {
      const i = (s0 + 130 + k * 4) % n, [x, z] = R.pts[i], [nx, nz] = R.pts[(i + 1) % n];
      const tx = nx - x, tz = nz - z, tl = Math.hypot(tx, tz) || 1;
      props.add('cone', x - tz / tl * 7.8, z + tx / tl * 7.8, { yaw: rnd() * 6.283 });
    }
    const P = PLACES.speedway;
    for (let k = 0; k < 5; k++) for (let h = 0; h < 4; h++) props.add('tyre', P.x - 190 + k * 2.4, P.z - 160 + (rnd() - 0.5) * 0.2, { y: S.groundAt(P.x, P.z - 160) + 0.14 + h * 0.28, sleep: true });
    cluster(P.x + 40, P.z - 100, { crates: 3, barrels: 5, boxes: 3, spread: 7 });
    for (let k = 0; k < 6; k++) props.add('ball', R.start.x + 6 + k * 0.7, R.start.z - 9 + (rnd() - 0.5), { sleep: false });
  }

  // Beach: balls and crates on the sand, barrels and crates adrift offshore.
  const B = S.spawns.beach;
  if (B) {
    for (let i = 0; i < 4; i++) put('ball', B.x + (rnd() - 0.5) * 10, B.z + (rnd() - 0.5) * 10);
    cluster(B.x + 6, B.z + 4, { crates: 2, barrels: 1, boxes: 1, spread: 4 });
    const bb = PLACES.beach, dx = bb.x - B.x, dz = bb.z - B.z, dl = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 14; i++) {
      const d = 28 + rnd() * 90, a = (rnd() - 0.5) * 1.0;
      const ux = (dx * Math.cos(a) - dz * Math.sin(a)) / dl, uz = (dx * Math.sin(a) + dz * Math.cos(a)) / dl;
      const x = bb.x + ux * d, z = bb.z + uz * d;
      if (terrain.heightAt(x, z) > -1.2) continue;
      props.add(i % 3 === 0 ? 'crate' : 'barrel', x, z, { y: 0.1, sleep: false, color: BARREL_COLORS[i % BARREL_COLORS.length] });
    }
  }
}
