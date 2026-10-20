// Pure ray/shape and ammunition helpers for the weapons system (no scene access,
// so they can be unit-tested). Rays are (ox, oy, oz) + t * (dx, dy, dz) with a
// unit direction; every helper returns the entry distance t, or Infinity.

export const WEAPON_DEFS = [
  { id: 'knife', name: 'Combat Knife', type: 'melee', reach: 1.9, swing: 0.34, hitAt: 0.45, knock: 4, force: 8, stance: 'blade', icon: '🔪' },
  { id: 'katana', name: 'Katana', type: 'melee', reach: 2.6, swing: 0.52, hitAt: 0.5, knock: 7, force: 18, stance: 'blade', icon: '⚔️' },
  { id: 'axe', name: 'Battle Axe', type: 'melee', reach: 2.5, swing: 0.8, hitAt: 0.52, knock: 10, force: 34, stance: 'blade', icon: '🪓' },
  { id: 'pistol', name: 'M9 Pistol', type: 'gun', stance: 'pistol', auto: false, rate: 0.17, mag: 15, reserve: 105, reload: 1.3, spread: 0.008, range: 400, force: 5, recoil: 0.7, sound: 'pistol', icon: '🔫' },
  { id: 'smg', name: 'Vector SMG', type: 'gun', stance: 'rifle', auto: true, rate: 0.065, mag: 30, reserve: 210, reload: 1.6, spread: 0.022, range: 350, force: 3, recoil: 0.45, sound: 'smg', icon: '🔫' },
  { id: 'rifle', name: 'AR-7 Rifle', type: 'gun', stance: 'rifle', auto: true, rate: 0.095, mag: 30, reserve: 180, reload: 2.0, spread: 0.012, range: 700, force: 6, recoil: 0.7, sound: 'rifle', zoom: 1.6, icon: '🔫' },
  { id: 'shotgun', name: 'Pump Shotgun', type: 'gun', stance: 'rifle', auto: false, rate: 0.8, mag: 6, reserve: 42, reload: 0.5, shell: true, pellets: 9, spread: 0.065, range: 90, force: 4, recoil: 1.6, sound: 'shotgun', pump: true, icon: '🔫' },
  { id: 'sniper', name: 'Longbow Sniper', type: 'gun', stance: 'rifle', auto: false, rate: 1.2, mag: 5, reserve: 30, reload: 2.8, spread: 0.0015, hip: 0.05, range: 2000, force: 30, recoil: 2.2, sound: 'sniper', zoom: 4.5, scope: true, bolt: true, icon: '🎯' },
  { id: 'launcher', name: 'RPG Launcher', type: 'proj', stance: 'launcher', auto: false, rate: 1.1, mag: 1, reserve: 9, reload: 2.4, spread: 0.004, speed: 62, blast: 11, force: 24, recoil: 2.5, sound: 'launcher', icon: '🚀' },
  { id: 'plasma', name: 'Plasma Rifle', type: 'proj', stance: 'rifle', auto: true, rate: 0.13, mag: 40, reserve: 200, reload: 1.8, spread: 0.01, speed: 150, blast: 2.5, force: 7, recoil: 0.3, sound: 'plasma', plasma: true, zoom: 1.3, icon: '⚡' },
];
export const GRENADES = 6;

// Fresh ammunition state for a weapon.
export function newAmmo(def) {
  return def.type === 'melee' ? { mag: Infinity, reserve: Infinity } : { mag: def.mag, reserve: def.reserve };
}

// Rounds moved from reserve into the magazine by one reload. `shell` weapons load a single round.
export function reloadFill(def, ammo) {
  const need = def.mag - ammo.mag;
  const take = Math.max(0, Math.min(def.shell ? 1 : need, ammo.reserve));
  return { mag: ammo.mag + take, reserve: ammo.reserve - take, loaded: take };
}

// Cone-uniform random direction around `dir` (unit), half-angle `spread` radians.
export function spreadDir(dir, spread, rnd, out = { x: 0, y: 0, z: 0 }) {
  if (spread <= 0) { out.x = dir.x; out.y = dir.y; out.z = dir.z; return out; }
  // Two vectors orthogonal to dir.
  let ux = -dir.z, uy = 0, uz = dir.x;
  let ul = Math.hypot(ux, uz);
  if (ul < 1e-6) { ux = 1; uz = 0; ul = 1; }
  ux /= ul; uz /= ul;
  const vx = dir.y * uz - dir.z * uy, vy = dir.z * ux - dir.x * uz, vz = dir.x * uy - dir.y * ux;
  const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * Math.tan(spread);
  const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
  const x = dir.x + ux * cx + vx * cy, y = dir.y + cy * vy + uy * cx, z = dir.z + uz * cx + vz * cy;
  const l = Math.hypot(x, y, z) || 1;
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const thc = Math.sqrt(r * r - d2);
  const t0 = tca - thc, t1 = tca + thc;
  if (t0 >= 0) return t0;
  return t1 >= 0 ? 0 : Infinity;
}

// Vertical cylinder (axis +Y) from y0 to y1.
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  let t = Infinity;
  if (a > 1e-12) {
    const b = px * dx + pz * dz, c = px * px + pz * pz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const tt of [(-b - sq) / a, (-b + sq) / a]) {
        if (tt < 0) continue;
        const y = oy + dy * tt;
        if (y >= y0 && y <= y1) { t = Math.min(t, tt); }
      }
    }
  }
  // Top cap.
  if (Math.abs(dy) > 1e-9) {
    const tt = (y1 - oy) / dy;
    if (tt >= 0) { const x = px + dx * tt, z = pz + dz * tt; if (x * x + z * z <= r * r) t = Math.min(t, tt); }
  }
  return t;
}

// Oriented box: centre (bx, bz), half-extents hw (local x) and hd (local z), rotation (c = cos, s = sin) as
// used by the structure colliders (lx = dx*c - dz*s, lz = dx*s + dz*c), vertical extent [bottom, top].
// Returns { t, nx, ny, nz } (world-space normal) or null. Rays starting inside the box miss.
export function rayOrientedBox(ox, oy, oz, dx, dy, dz, b) {
  const px = ox - b.x, pz = oz - b.z;
  const lox = px * b.c - pz * b.s, loz = px * b.s + pz * b.c;
  const ldx = dx * b.c - dz * b.s, ldz = dx * b.s + dz * b.c;
  let tmin = 0, tmax = Infinity, axis = -1, sign = 0;
  const slab = (o, d, lo, hi, ax) => {
    if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
    let t1 = (lo - o) / d, t2 = (hi - o) / d, sg = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sg = 1; }
    if (t1 > tmin) { tmin = t1; axis = ax; sign = sg; }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };
  const bottom = Number.isFinite(b.bottom) ? b.bottom : -1e6, top = Number.isFinite(b.top) ? b.top : 1e6;
  if (!slab(lox, ldx, -b.hw, b.hw, 0)) return null;
  if (!slab(oy, dy, bottom, top, 1)) return null;
  if (!slab(loz, ldz, -b.hd, b.hd, 2)) return null;
  if (axis < 0 || tmin <= 0) return null;
  let nx = 0, ny = 0, nz = 0;
  if (axis === 0) { const lnx = sign; nx = lnx * b.c; nz = -lnx * b.s; }
  else if (axis === 1) ny = sign;
  else { const lnz = sign; nx = lnz * b.s; nz = lnz * b.c; }
  return { t: tmin, nx, ny, nz };
}

// Distance from the closest approach of a ray to a point, for t >= 0, plus the t of that approach.
export function rayPointDistance(ox, oy, oz, dx, dy, dz, px, py, pz) {
  const t = Math.max(0, (px - ox) * dx + (py - oy) * dy + (pz - oz) * dz);
  return { t, d: Math.hypot(ox + dx * t - px, oy + dy * t - py, oz + dz * t - pz) };
}

// Blast falloff: 1 at the centre, 0 at the radius.
export function blastFalloff(dist, radius) { return dist >= radius ? 0 : (1 - dist / radius) ** 1.4; }
