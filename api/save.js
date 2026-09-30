// Cloud saves on Vercel Blob (private store). Each player has a random
// 128-bit save id kept in their browser; the id is the key to their save
// file. GET /api/save?id=... loads it, PUT saves it (merged with what is
// already stored, so progress from two devices is never lost).

import { put, get } from '@vercel/blob';

const ID = /^[a-f0-9]{32}$/;
const MYSTERIES = ['monolith', 'crop', 'crash', 'pyramid', 'stones', 'vortex', 'mothership', 'moon', 'ares'];
const CHARACTERS = ['pilot', 'explorer', 'scientist', 'crew'];
const SPAWNS = ['airbase', 'spaceport', 'village', 'beach', 'farm'];
const TIMES = ['dawn', 'day', 'sunset', 'night'];
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

function clean(b, old = {}) {
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
    time: TIMES.includes(b.time) ? b.time : old.time || 'day',
    updated: Date.now(),
  };
}

async function read(id) {
  const r = await get(`saves/${id}.json`, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return JSON.parse(await new Response(r.stream).text());
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.query?.id || '');
  if (!ID.test(id)) return res.status(400).json({ error: 'bad id' });
  try {
    if (req.method === 'GET') {
      const save = await read(id);
      return save ? res.status(200).json(save) : res.status(404).json({ error: 'no save' });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (JSON.stringify(body).length > 4096) return res.status(413).json({ error: 'too large' });
      let old = {};
      try { old = (await read(id)) || {}; } catch (e) { /* first save */ }
      const save = clean(body, old);
      await put(`saves/${id}.json`, JSON.stringify(save), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
      return res.status(200).json(save);
    }
    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'storage unavailable' });
  }
}
