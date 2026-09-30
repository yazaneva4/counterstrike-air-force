// Cloud saves on Vercel Blob (private store). Each player has a random
// 128-bit save id kept in their browser; the id is the key to their save
// file. GET /api/save?id=... loads it, PUT saves it (merged with what is
// already stored, so progress from two devices is never lost).

import { put, get, BlobPreconditionFailedError } from '@vercel/blob';

const ID = /^[a-f0-9]{32}$/;
const MYSTERIES = ['monolith', 'crop', 'crash', 'pyramid', 'stones', 'vortex', 'mothership', 'moon', 'ares'];
const CHARACTERS = ['pilot', 'explorer', 'scientist', 'crew'];
const SPAWNS = ['airbase', 'spaceport', 'village', 'beach', 'farm'];
const TIMES = ['live', 'dawn', 'day', 'sunset', 'night'];
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

function clean(b, old = {}) {
  b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const found = new Set([...(old.mysteries || []), ...(Array.isArray(b.mysteries) ? b.mysteries : [])].filter((m) => MYSTERIES.includes(m)));
  const p = b.profile || {};
  return {
    v: 1,
    mysteries: [...found],
    score: Math.max(int(b.score, 1e7), int(old.score, 1e7)),
    stats: { drones: Math.max(int(b.stats?.drones, 1e6), int(old.stats?.drones, 1e6)), flights: Math.max(int(b.stats?.flights, 1e6), int(old.stats?.flights, 1e6)) },
    profile: {
      name: String(p.name ?? old.profile?.name ?? 'Pilot').replace(/[<>&"'`]/g, '').slice(0, 18) || 'Pilot',
      character: CHARACTERS.includes(p.character) ? p.character : old.profile?.character || 'pilot',
      skin: int(p.skin ?? old.profile?.skin, 5),
    },
    spawn: SPAWNS.includes(b.spawn) ? b.spawn : old.spawn || 'airbase',
    time: TIMES.includes(b.time) ? b.time : old.time || 'live',
    updated: Date.now(),
  };
}

async function read(id) {
  const r = await get(`saves/${id}.json`, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return { save: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
}

// Best-effort per-instance limit so one client cannot hammer the store.
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 30;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.query?.id || '');
  if (!ID.test(id)) return res.status(400).json({ error: 'bad id' });
  try {
    if (req.method === 'GET') {
      const cur = await read(id);
      return cur ? res.status(200).json(cur.save) : res.status(404).json({ error: 'no save' });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
      if (limited(ip)) return res.status(429).json({ error: 'slow down' });
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body; } catch (e) { return res.status(400).json({ error: 'bad json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'bad body' });
      if (JSON.stringify(body).length > 4096) return res.status(413).json({ error: 'too large' });
      // Merge with the stored save; retry if another device wrote in between.
      for (let attempt = 0; attempt < 4; attempt++) {
        let cur = null;
        try { cur = await read(id); } catch (e) { /* first save */ }
        const save = clean(body, cur?.save || {});
        try {
          await put(`saves/${id}.json`, JSON.stringify(save), { access: 'private', allowOverwrite: !!cur, ifMatch: cur?.etag, addRandomSuffix: false, contentType: 'application/json' });
          return res.status(200).json(save);
        } catch (e) {
          if (attempt === 3 || !(e instanceof BlobPreconditionFailedError || /already exists/i.test(e?.message || ''))) throw e;
        }
      }
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'storage unavailable' });
  }
}
