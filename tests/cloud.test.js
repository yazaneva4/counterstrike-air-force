import test from 'node:test';
import assert from 'node:assert/strict';

test('failed HTTP cloud saves can retry; older failures cannot invalidate a newer save', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const { cloud } = await import('../src/net/cloud.js');
  cloud.online = true; cloud.sent = null;
  const settings = { profile: { name: 'Test' }, spawn: 'airbase', time: 'day' };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false }; };
  cloud.save(settings, null); await new Promise(resolve => setImmediate(resolve));
  assert.equal(cloud.sent, null);
  cloud.save(settings, null); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
  let failOld;
  globalThis.fetch = () => new Promise(resolve => { failOld = resolve; });
  cloud.save(settings, null);
  globalThis.fetch = async () => ({ ok: true });
  cloud.save({ ...settings, time: 'night' }, null);
  const latest = cloud.sent; failOld({ ok: false }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(cloud.sent, latest);
});
