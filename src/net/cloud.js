// Cloud saves (Vercel Blob through /api/save). Every browser gets a random
// save id; progress (mysteries, score, stats, profile, start options) is
// loaded before the title screen and saved after discoveries, on a timer and
// when the tab is closed. Offline or on a host without the API, the game
// keeps working from local storage.

const KEY = 'csaf-cloud-id';
const MYST = 'csaf-mysteries-v1';
const API = 'api/save';
let id = null;
try { id = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
if (!id || !/^[a-f0-9]{32}$/.test(id)) {
  id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
}

export const cloud = {
  id, online: false, last: null,

  // Fetch the save and fold it into local state. Never throws.
  async load(settings, timeout = 2500) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(`${API}?id=${id}`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      // Only the real API answers with JSON; a plain 404 means this host has no API.
      const isApi = (r.headers.get('content-type') || '').includes('application/json');
      if (!isApi) return null;
      if (r.status === 404) { this.online = true; return null; }
      if (!r.ok) return null;
      const s = await r.json();
      this.online = true; this.last = s;
      try {
        const found = new Set(JSON.parse(localStorage.getItem(MYST) || '[]'));
        (s.mysteries || []).forEach((m) => found.add(m));
        localStorage.setItem(MYST, JSON.stringify([...found]));
      } catch (e) { /* ignore */ }
      if (s.profile) Object.assign(settings.profile, s.profile);
      if (s.spawn) settings.spawn = s.spawn;
      if (s.time) settings.time = s.time;
      return s;
    } catch (e) { return null; }
  },

  snapshot(settings, game) {
    let found = [];
    try { found = JSON.parse(localStorage.getItem(MYST) || '[]'); } catch (e) { /* ignore */ }
    return {
      mysteries: game?.mysteries ? [...game.mysteries.found] : found,
      score: game?.mysteries ? game.score : this.last?.score || 0,
      stats: game?.mysteries ? { drones: game.stats.drones, flights: game.stats.flights } : this.last?.stats || {},
      profile: settings.profile, spawn: settings.spawn, time: settings.time,
    };
  },

  save(settings, game, { keepalive = false } = {}) {
    if (!this.online) return;
    try {
      const body = JSON.stringify(this.snapshot(settings, game));
      if (body === this.sent) return; // nothing new to store
      this.sent = body;
      fetch(`${API}?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive })
        .then((r) => { if (!r.ok && this.sent === body) this.sent = null; })
        .catch(() => { if (this.sent === body) this.sent = null; });
    } catch (e) { /* ignore */ }
  },
};
