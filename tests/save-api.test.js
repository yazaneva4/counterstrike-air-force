import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const fake = `export class BlobPreconditionFailedError extends Error {};
export const get = (...args) => globalThis.blobTest.get(...args);
export const put = (...args) => globalThis.blobTest.put(...args);`;
registerHooks({ resolve(name, context, next) {
  if (name === '@vercel/blob') return { url: 'data:text/javascript,' + encodeURIComponent(fake), shortCircuit: true };
  return next(name, context);
} });
const { default: handler } = await import('../api/save.js');
const { BlobPreconditionFailedError } = await import('@vercel/blob');
const req = { method: 'PUT', headers: {}, query: { id: '1234567890abcdef1234567890abcdef' }, body: { mysteries: ['moon'], score: 100 } };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const stored = (save, etag) => ({ statusCode: 200, stream: new Response(JSON.stringify(save)).body, blob: { etag } });

test('failed storage reads cannot be mistaken for a new player save', async () => {
  let writes = 0;
  globalThis.blobTest = { get: async () => { throw new Error('storage outage'); }, put: async () => { writes++; } };
  const res = response(); await handler(req, res);
  assert.equal(res.code, 500); assert.equal(writes, 0);
});

test('corrupt saves are preserved rather than overwritten', async () => {
  let writes = 0;
  globalThis.blobTest = { get: async () => ({ statusCode: 200, stream: new Response('broken JSON').body, blob: { etag: 'old' } }), put: async () => { writes++; } };
  const res = response(); await handler(req, res);
  assert.equal(res.code, 500); assert.equal(writes, 0);
});

test('new saves prohibit overwrites; conflicting writes merge the latest progress', async () => {
  let reads = 0, writes = 0;
  globalThis.blobTest = {
    get: async () => ++reads === 1 ? null : stored({ mysteries: ['ares'], score: 200 }, 'latest'),
    put: async (_path, body, options) => {
      if (++writes === 1) { assert.equal(options.allowOverwrite, false); throw new BlobPreconditionFailedError('conflict'); }
      assert.equal(options.ifMatch, 'latest');
      assert.equal(options.allowOverwrite, true);
      const save = JSON.parse(body);
      assert.equal(save.score, 200); assert.deepEqual(save.mysteries.sort(), ['ares', 'moon']);
    },
  };
  const res = response(); await handler(req, res);
  assert.equal(res.code, 200); assert.equal(writes, 2);
});
