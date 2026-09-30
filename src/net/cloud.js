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
      mysteries: game ? [...game.mysteries.found] : found,
      score: game ? game.score : this.last?.score || 0,
      stats: game ? { drones: game.stats.drones, flights: game.stats.flights } : this.last?.stats || {},
      profile: settings.profile, spawn: settings.spawn, time: settings.time,
    };
  },

  save(settings, game, { keepalive = false } = {}) {
    if (!this.online) return;
    try {
      fetch(`${API}?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.snapshot(settings, game)), keepalive }).catch(() => {});
    } catch (e) { /* ignore */ }
  },
};
