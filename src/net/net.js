// Peer-to-peer rooms for real players (WebRTC via PeerJS). The host's peer id
// is derived from a 5-character room code; guests connect to the host, which
// relays everyone's state and chat and keeps the day/night clock in sync.
// No game server is needed, so the whole game deploys as static files.

const PREFIX = 'csaf-world-';
const COLORS = ['#ffd36a', '#ff8a7a', '#8ad0ff', '#c89aff', '#9dffb0', '#ffa8e0', '#7dffd6', '#ffc28a'];
const MAX_GUESTS = 7;

function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export class Net {
  constructor(handlers = {}) {
    this.h = handlers;
    this.peer = null;
    this.isHost = false;
    this.room = '';
    this.conns = new Map();   // peerId -> DataConnection
    this.peers = new Map();   // playerId -> { name, color, seen }
    this.sendTimer = 0;
    this.timeTimer = 0;
    this.status = 'Offline';
  }

  get online() { return !!this.peer && (this.isHost || this.conns.size > 0); }
  get id() { return this.peer?.id || 'local'; }

  _status(msg) { this.status = msg; this.h.onStatus?.(msg); }

  static makeCode() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  host(name) { return this._connect(true, Net.makeCode(), name); }
  join(code, name) { return this._connect(false, code, name); }

  _connect(host, code, name) {
    if (!window.Peer) { this._status('Multiplayer library could not load (offline?)'); return false; }
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { this._status('Room codes are 5 letters or numbers'); return false; }
    this.leave(true);
    this.isHost = host;
    this.room = code;
    this.name = name;
    this._status(host ? `Opening room ${code}…` : `Connecting to ${code}…`);
    const peer = host ? new window.Peer(PREFIX + code.toLowerCase(), { debug: 0 }) : new window.Peer({ debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (host) { this._status(`Room ${code} is open · share the code`); this.h.onRoom?.(code, true); }
      else {
        const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, metadata: { name } });
        this._track(conn);
      }
    });
    if (host) peer.on('connection', (conn) => {
      if (this.conns.size >= MAX_GUESTS) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this._track(conn);
    });
    peer.on('error', (err) => {
      const t = err && err.type;
      this._status(t === 'unavailable-id' ? 'That room code is taken · try again' : t === 'peer-unavailable' ? 'Room not found · check the code' : t === 'network' || t === 'server-error' ? 'Cannot reach the matchmaking server' : 'Connection problem · try again');
      if (!host) setTimeout(() => { if (this.conns.size === 0) this.leave(true); }, 1200);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    return true;
  }

  _track(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      conn.send({ t: 'hello', id: this.id, n: this.name });
      if (!this.isHost) { this._status(`In room ${this.room}`); this.h.onRoom?.(this.room, false); }
      else this._status(`Room ${this.room} · ${this.conns.size} guest${this.conns.size === 1 ? '' : 's'}`);
    });
    conn.on('data', (msg) => this._receive(conn, msg));
    const gone = () => {
      this.conns.delete(conn.peer);
      if (this.isHost) {
        this._dropPlayer(conn.peer);
        this._broadcast({ t: 'leave', id: conn.peer });
        this._status(`Room ${this.room} · ${this.conns.size} guest${this.conns.size === 1 ? '' : 's'}`);
      } else {
        for (const id of [...this.peers.keys()]) this._dropPlayer(id);
        this._status('Disconnected from the room');
      }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  _dropPlayer(id) {
    if (!this.peers.has(id)) return;
    const p = this.peers.get(id);
    this.peers.delete(id);
    this.h.onLeave?.(id, p);
  }

  _receive(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const from = String(msg.id || conn.peer).slice(0, 64);
    switch (msg.t) {
      case 'full': this._status('That room is full'); this.leave(true); return;
      case 'hello': {
        const name = String(msg.n || 'Pilot').slice(0, 18);
        if (!this.peers.has(from)) { this.peers.set(from, { name, color: colorFor(from), seen: performance.now() }); this.h.onJoin?.(from, name); }
        if (this.isHost) {
          this._broadcast(msg, conn.peer);
          // Tell the newcomer who is already here.
          conn.send({ t: 'hello', id: this.id, n: this.name });
          for (const [pid, p] of this.peers) if (pid !== from) conn.send({ t: 'hello', id: pid, n: p.name });
          this.h.onNeedTime?.((v) => conn.send({ t: 'time', v }));
        }
        return;
      }
      case 's': {
        let p = this.peers.get(from);
        if (!p) { p = { name: String(msg.n || 'Pilot').slice(0, 18), color: colorFor(from), seen: 0 }; this.peers.set(from, p); this.h.onJoin?.(from, p.name); }
        p.seen = performance.now();
        if (msg.n) p.name = String(msg.n).slice(0, 18);
        this.h.onState?.(from, msg, p);
        if (this.isHost) this._broadcast(msg, conn.peer);
        return;
      }
      case 'chat': {
        const text = String(msg.x || '').slice(0, 160);
        const p = this.peers.get(from);
        this.h.onChat?.(p ? p.name : String(msg.n || 'Pilot').slice(0, 18), text, p ? p.color : '#fff');
        if (this.isHost) this._broadcast(msg, conn.peer);
        return;
      }
      case 'fx': this.h.onFx?.(msg); if (this.isHost) this._broadcast(msg, conn.peer); return;
      case 'leave': this._dropPlayer(String(msg.id)); return;
      case 'time': if (!this.isHost && Number.isFinite(msg.v)) this.h.onTime?.(msg.v); return;
      default: break;
    }
  }

  _broadcast(msg, except) {
    for (const [id, c] of this.conns) if (id !== except && c.open) { try { c.send(msg); } catch (e) { /* ignore */ } }
  }

  send(msg) { msg.id = this.id; this._broadcast(msg); }

  chat(text) {
    text = String(text).trim().slice(0, 160);
    if (!text || !this.online) return false;
    this.send({ t: 'chat', x: text, n: this.name });
    return true;
  }

  update(dt, state, timeOfDay) {
    if (!this.peer) return;
    this.sendTimer -= dt;
    if (this.sendTimer <= 0 && this.conns.size) {
      this.sendTimer = 0.1;
      this.send(Object.assign({ t: 's' }, state));
    }
    if (this.isHost) {
      this.timeTimer -= dt;
      if (this.timeTimer <= 0) { this.timeTimer = 5; this._broadcast({ t: 'time', v: timeOfDay }); }
    }
    // Drop silent players.
    const now = performance.now();
    for (const [id, p] of this.peers) if (p.seen && now - p.seen > 10000) this._dropPlayer(id);
  }

  peerList() { return [...this.peers.entries()].map(([id, p]) => ({ id, name: p.name, color: p.color })); }

  leave(silent = false) {
    if (this.peer) {
      try { this._broadcast({ t: 'leave', id: this.id }); } catch (e) { /* ignore */ }
      try { this.peer.destroy(); } catch (e) { /* ignore */ }
    }
    this.peer = null;
    this.conns.clear();
    for (const id of [...this.peers.keys()]) this._dropPlayer(id);
    this.room = '';
    this.isHost = false;
    if (!silent) this._status('Offline');
    this.h.onRoom?.('', false);
  }
}
