import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_DEFS, GRENADES, newAmmo, reloadFill, spreadDir, raySphere, rayCylinder, rayOrientedBox, blastFalloff } from '../src/combat/ballistics.js';
import { mulberry32 } from '../src/core/noise.js';

test('arsenal has blades, firearms and heavy weapons with sane stats', () => {
  const ids = WEAPON_DEFS.map((d) => d.id);
  for (const id of ['knife', 'katana', 'axe', 'pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'launcher', 'plasma']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(WEAPON_DEFS.length <= 10, 'one number key each');
  for (const d of WEAPON_DEFS) {
    if (d.type === 'melee') assert.ok(d.reach > 1 && d.swing > 0.1);
    else { assert.ok(d.mag > 0 && d.reserve >= d.mag && d.rate > 0.03 && d.reload > 0); }
  }
  assert.ok(GRENADES > 0);
});

test('reload moves rounds from reserve, one at a time for shell weapons', () => {
  const rifle = WEAPON_DEFS.find((d) => d.id === 'rifle'), shotgun = WEAPON_DEFS.find((d) => d.id === 'shotgun');
  const a = { mag: 7, reserve: 100 };
  const r = reloadFill(rifle, a);
  assert.deepEqual([r.mag, r.reserve], [30, 77]);
  const low = reloadFill(rifle, { mag: 0, reserve: 12 });
  assert.deepEqual([low.mag, low.reserve], [12, 0]);
  const s = reloadFill(shotgun, { mag: 2, reserve: 10 });
  assert.deepEqual([s.mag, s.reserve, s.loaded], [3, 9, 1]);
  assert.deepEqual(reloadFill(shotgun, { mag: 2, reserve: 0 }), { mag: 2, reserve: 0, loaded: 0 });
  assert.equal(newAmmo(rifle).mag, 30);
  assert.equal(newAmmo(WEAPON_DEFS[0]).reserve, Infinity);
});

test('spread stays inside its cone and zero spread is exact', () => {
  const rnd = mulberry32(5), dir = { x: 0.6, y: 0.3, z: 0.7416198 };
  const l = Math.hypot(dir.x, dir.y, dir.z); dir.x /= l; dir.y /= l; dir.z /= l;
  const exact = spreadDir(dir, 0, rnd);
  assert.deepEqual([exact.x, exact.y, exact.z], [dir.x, dir.y, dir.z]);
  let widest = 0;
  for (let i = 0; i < 500; i++) {
    const d = spreadDir(dir, 0.05, rnd);
    assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9);
    widest = Math.max(widest, Math.acos(Math.min(1, d.x * dir.x + d.y * dir.y + d.z * dir.z)));
  }
  assert.ok(widest <= 0.0501 && widest > 0.03);
  // A vertical aim direction must not break the basis.
  const up = spreadDir({ x: 0, y: 1, z: 0 }, 0.1, rnd);
  assert.ok(Math.abs(Math.hypot(up.x, up.y, up.z) - 1) < 1e-9 && up.y > 0.99);
});

test('ray vs sphere, cylinder and oriented box', () => {
  assert.ok(Math.abs(raySphere(0, 0, 0, 0, 0, 1, 0, 0, 10, 1) - 9) < 1e-9);
  assert.equal(raySphere(0, 0, 0, 0, 0, 1, 3, 0, 10, 1), Infinity);
  assert.equal(raySphere(0, 0, 0, 0, 0, -1, 0, 0, 10, 1), Infinity);
  assert.ok(Math.abs(rayCylinder(-10, 1, 0, 1, 0, 0, 0, 0, 0.5, 0, 6) - 9.5) < 1e-9);
  assert.equal(rayCylinder(-10, 8, 0, 1, 0, 0, 0, 0, 0.5, 0, 6), Infinity);
  const box = { x: 0, z: 10, hw: 2, hd: 1, c: 1, s: 0, bottom: 0, top: 5 };
  const h = rayOrientedBox(0, 1, 0, 0, 0, 1, box);
  assert.ok(h && Math.abs(h.t - 9) < 1e-9 && h.nz === -1 && h.nx === 0);
  assert.equal(rayOrientedBox(0, 6, 0, 0, 0, 1, box), null);        // passes over the roof
  assert.equal(rayOrientedBox(5, 1, 0, 0, 0, 1, box), null);        // beside it
  assert.equal(rayOrientedBox(0, 1, 10, 0, 0, 1, box), null);       // started inside
  // Rotated 90 degrees: the long side now faces along z.
  const rot = { x: 0, z: 10, hw: 4, hd: 1, c: 0, s: 1, bottom: 0, top: 5 };
  const hr = rayOrientedBox(0, 1, 0, 0, 0, 1, rot);
  assert.ok(hr && Math.abs(hr.t - 6) < 1e-9, JSON.stringify(hr));
  assert.ok(Math.abs(hr.nz + 1) < 1e-9 || Math.abs(hr.nx) === 1, 'normal faces the shooter side');
  const top = rayOrientedBox(0, 10, 10, 0, -1, 0, box);
  assert.ok(top && top.t === 5 && top.ny === 1);
});

test('blast falloff is strongest at the centre and zero at the edge', () => {
  assert.equal(blastFalloff(0, 10), 1);
  assert.equal(blastFalloff(10, 10), 0);
  assert.ok(blastFalloff(3, 10) > blastFalloff(6, 10));
});
