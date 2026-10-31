import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const fake = [
  'export class BlobPreconditionFailedError extends Error {};',
  'export const get = (...args) => globalThis.blobTest.get(...args);',
  'export const put = (...args) => globalThis.blobTest.put(...args);',
].join('\n');
registerHooks({ resolve(name, context, next) {
  if (name === '@vercel/blob') return { url: 'data:text/javascript,' + encodeURIComponent(fake), shortCircuit: true };
  return next(name, context);
} });

const SECRET = 'test-secret-test-secret-test-secret-123';
process.env.AUTH_SECRET = SECRET;
const { default: handler } = await import('../api/auth.js');

// In-memory stand-in for the private Blob store.
const files = new Map();
globalThis.blobTest = {
  get: async (path) => (files.has(path)
    ? { statusCode: 200, stream: new Response(files.get(path)).body, blob: { etag: 'e' } }
    : null),
  put: async (path, body, options) => {
    if (files.has(path) && !options.allowOverwrite) throw new Error('This blob already exists');
    files.set(path, body);
  },
};

let caller = 0; // a fresh client address per call keeps the guess limiter out of the way
const response = () => ({
  headers: {},
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  end() { this.ended = true; },
});
async function call(action, { method = 'POST', body, cookie = '' } = {}) {
  const res = response();
  await handler({ method, url: '/api/auth?action=' + action, headers: { cookie, 'x-forwarded-for': '10.0.0.' + (++caller) }, body }, res);
  return res;
}
const sessionCookie = (res) => String([].concat(res.headers['Set-Cookie'] || [])[0] || '').split(';')[0];

test('sign up stores a hashed password and starts a session', async () => {
  files.clear();
  const adoptId = 'a'.repeat(32);
  const res = await call('register', { body: { username: 'Pilot_One', password: 'correct horse', adoptId } });
  assert.equal(res.code, 201);
  assert.equal(res.body.user.name, 'pilot_one');
  assert.equal(res.body.user.saveId, adoptId);
  assert.ok(sessionCookie(res).startsWith('csaf_session='));
  assert.match(String(res.headers['Set-Cookie']), /HttpOnly/);
  const stored = files.get('users/u-pilot_one.json');
  assert.ok(stored && !stored.includes('correct horse'));
  assert.match(JSON.parse(stored).hash, /^[a-f0-9]+:[a-f0-9]+$/);
});

test('a malformed guest save id is replaced with a fresh one', async () => {
  files.clear();
  const res = await call('register', { body: { username: 'second_pilot', password: 'long enough pw', adoptId: 'nope' } });
  assert.equal(res.code, 201);
  assert.match(res.body.user.saveId, /^[a-f0-9]{32}$/);
});

test('usernames are unique regardless of case', async () => {
  files.clear();
  await call('register', { body: { username: 'dupe_name', password: 'password one' } });
  const res = await call('register', { body: { username: 'DUPE_NAME', password: 'password two' } });
  assert.equal(res.code, 409);
});

test('log in works with the right password and gives the same save id', async () => {
  files.clear();
  const made = await call('register', { body: { username: 'login_user', password: 'right password' } });
  const ok = await call('login', { body: { username: 'Login_User', password: 'right password' } });
  assert.equal(ok.code, 200);
  assert.equal(ok.body.user.saveId, made.body.user.saveId);
  const bad = await call('login', { body: { username: 'login_user', password: 'wrong password' } });
  const unknown = await call('login', { body: { username: 'nobody_here', password: 'whatever pw' } });
  assert.equal(bad.code, 401); assert.equal(unknown.code, 401);
  assert.deepEqual(bad.body, unknown.body); // does not reveal which usernames exist
});

test('invalid usernames and short passwords are rejected', async () => {
  files.clear();
  assert.equal((await call('register', { body: { username: 'no spaces', password: 'long enough pw' } })).code, 400);
  assert.equal((await call('register', { body: { username: 'ab', password: 'long enough pw' } })).code, 400);
  assert.equal((await call('register', { body: { username: 'good_name', password: 'short' } })).code, 400);
  assert.equal(files.size, 0);
});

test('me reports the signed-in account and ignores tampered cookies', async () => {
  files.clear();
  const made = await call('register', { body: { username: 'me_user', password: 'right password' } });
  const cookie = sessionCookie(made);
  const mine = await call('me', { method: 'GET', cookie });
  assert.equal(mine.body.configured, true);
  assert.equal(mine.body.user.name, 'me_user');
  const forged = await call('me', { method: 'GET', cookie: cookie.slice(0, -3) + 'xyz' });
  assert.equal(forged.body.user, null);
  const anonymous = await call('me', { method: 'GET' });
  assert.equal(anonymous.body.user, null);
});

test('log out clears the session cookie', async () => {
  const res = await call('logout');
  assert.equal(res.code, 200);
  assert.match(String(res.headers['Set-Cookie']), /Max-Age=0/);
});

test('without AUTH_SECRET the accounts API reports it is not set up', async () => {
  delete process.env.AUTH_SECRET;
  try {
    const me = await call('me', { method: 'GET' });
    assert.deepEqual(me.body, { configured: false });
    assert.equal((await call('register', { body: { username: 'someone', password: 'long enough pw' } })).code, 503);
  } finally { process.env.AUTH_SECRET = SECRET; }
});
