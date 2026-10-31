// Accounts for cloud saves (Vercel Blob, private store). Players sign up or log
// in with a username and password, or with Google. The account stores the
// player's save id, so the same progress loads on every device. Everything is
// one function, selected with ?action=me|register|login|logout|google|google-callback.
//
// Needs AUTH_SECRET (32+ random characters) to sign session cookies. Google
// sign-in is only offered when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.

import crypto from 'node:crypto';
import { put, get } from '@vercel/blob';

const NAME = /^[a-z0-9_]{3,20}$/;
const SAVE_ID = /^[a-f0-9]{32}$/;
const SESSION = 'csaf_session';
const OAUTH = 'csaf_oauth';
const SESSION_DAYS = 30;

const secret = () => process.env.AUTH_SECRET || '';
const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const randomId = () => crypto.randomBytes(16).toString('hex');

// ---- signed tokens (session and OAuth state cookies) -------------------------
function sign(payload, seconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + seconds * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data && data.exp > Date.now() ? data : null;
  } catch (e) { return null; }
}
function readCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const cookie = (name, value, seconds) =>
  name + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + seconds;

// ---- passwords ---------------------------------------------------------------
const scrypt = (password, salt) => new Promise((resolve, reject) =>
  crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return salt.toString('hex') + ':' + (await scrypt(password, salt)).toString('hex');
}
async function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const key = await scrypt(password, Buffer.from(salt, 'hex'));
  const want = Buffer.from(hash, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(key, want);
}
let dummyHash = null; // spent on unknown usernames so timing does not reveal them

// ---- user records in Vercel Blob --------------------------------------------
const userPath = (key) => 'users/' + key + '.json';
async function readUser(key) {
  const r = await get(userPath(key), { access: 'private', useCache: false });
  if (!r) return null;
  if (r.statusCode !== 200 || !r.stream) throw new Error('user read failed');
  return JSON.parse(await new Response(r.stream).text());
}
// Fails with "already exists" when the key is taken, so two sign-ups cannot both win.
async function createUser(key, user) {
  await put(userPath(key), JSON.stringify(user), {
    access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json',
  });
}
const taken = (e) => /already exists/i.test((e && e.message) || '');

// ---- best-effort per-instance limit on guessing --------------------------------
const hits = new Map();
function limited(key, max = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
  h.push(now); hits.set(key, h);
  if (hits.size > 5000) hits.clear();
  return h.length > max;
}

function send(res, status, body, cookies) {
  if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
  return res.status(status).json(body);
}
function redirect(res, location, cookies) {
  if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}
const publicUser = (user) => ({ name: user.name, saveId: user.saveId });
const startSession = (key) => cookie(SESSION, sign({ k: key }, SESSION_DAYS * 86400), SESSION_DAYS * 86400);
const endSession = () => cookie(SESSION, '', 0);

function parseBody(req) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad body');
  if (JSON.stringify(body).length > 2048) throw new Error('too large');
  return body;
}

// ---- Google sign-in ---------------------------------------------------------
function redirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return proto + '://' + host + '/api/auth?action=google-callback';
}
function idTokenClaims(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')); } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url || '/', 'http://localhost');
  const action = url.searchParams.get('action') || '';

  if (secret().length < 32) {
    if (action === 'me') return res.status(200).json({ configured: false });
    return res.status(503).json({ error: 'Accounts are not set up yet' });
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    if (action === 'me' && req.method === 'GET') {
      const session = verify(readCookies(req)[SESSION]);
      const user = session ? await readUser(session.k) : null;
      return send(res, 200, { configured: true, google: googleConfigured(), user: user ? publicUser(user) : null },
        session && !user ? [endSession()] : undefined);
    }

    if (action === 'logout' && req.method === 'POST') return send(res, 200, { ok: true }, [endSession()]);

    if ((action === 'register' || action === 'login') && req.method === 'POST') {
      if (limited('ip:' + action + ':' + ip)) return send(res, 429, { error: 'Too many attempts, try again later' });
      let body;
      try { body = parseBody(req); } catch (e) { return send(res, e.message === 'too large' ? 413 : 400, { error: 'Bad request' }); }
      const name = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!NAME.test(name)) return send(res, 400, { error: 'Username must be 3-20 letters, numbers or underscores' });
      if (password.length < 8 || password.length > 128) return send(res, 400, { error: 'Password must be 8-128 characters' });
      const key = 'u-' + name;

      if (action === 'register') {
        const adopt = typeof body.adoptId === 'string' && SAVE_ID.test(body.adoptId) ? body.adoptId : randomId();
        const user = { v: 1, name, hash: await hashPassword(password), saveId: adopt, created: new Date().toISOString() };
        try { await createUser(key, user); } catch (e) {
          if (taken(e)) return send(res, 409, { error: 'That username is taken' });
          throw e;
        }
        return send(res, 201, { user: publicUser(user) }, [startSession(key)]);
      }

      if (limited('user:' + name)) return send(res, 429, { error: 'Too many attempts, try again later' });
      const user = await readUser(key);
      if (!dummyHash) dummyHash = await hashPassword('not-a-real-password');
      const ok = await checkPassword(password, user && user.hash ? user.hash : dummyHash);
      if (!user || !user.hash || !ok) return send(res, 401, { error: 'Wrong username or password' });
      return send(res, 200, { user: publicUser(user) }, [startSession(key)]);
    }

    if (action === 'google' && req.method === 'GET') {
      if (!googleConfigured()) return send(res, 503, { error: 'Google sign-in is not set up' });
      const state = randomId();
      const adopt = url.searchParams.get('adopt') || '';
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code',
        scope: 'openid email', state, prompt: 'select_account',
      });
      return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString(),
        [cookie(OAUTH, sign({ s: state, a: SAVE_ID.test(adopt) ? adopt : '' }, 600), 600)]);
    }

    if (action === 'google-callback' && req.method === 'GET') {
      if (!googleConfigured()) return send(res, 503, { error: 'Google sign-in is not set up' });
      const pending = verify(readCookies(req)[OAUTH]);
      const fail = (why) => redirect(res, '/?signin=' + why, [cookie(OAUTH, '', 0)]);
      if (!pending || !url.searchParams.get('code') || url.searchParams.get('state') !== pending.s) return fail('failed');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: url.searchParams.get('code'), client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(req), grant_type: 'authorization_code',
        }).toString(),
      });
      if (!tokenRes.ok) return fail('failed');
      // The token comes straight from Google over TLS, so its claims can be trusted after these checks.
      const claims = idTokenClaims((await tokenRes.json()).id_token);
      const issuerOk = claims && (claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com');
      if (!claims || !issuerOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || !(claims.exp * 1000 > Date.now())
        || !claims.sub || claims.email_verified !== true) return fail('failed');
      const key = 'g-' + String(claims.sub).replace(/[^0-9a-zA-Z]/g, '');
      let user = await readUser(key);
      if (!user) {
        user = { v: 1, name: String(claims.email || 'Google player').slice(0, 80), google: true,
          saveId: pending.a || randomId(), created: new Date().toISOString() };
        try { await createUser(key, user); } catch (e) {
          if (!taken(e)) throw e;
          user = await readUser(key);
        }
      }
      return redirect(res, '/', [startSession(key), cookie(OAUTH, '', 0)]);
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: 'Account service error' });
  }
}
