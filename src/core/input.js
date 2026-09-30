// Unified input: keyboard (by physical key code), mouse with pointer lock,
// wheel zoom, a gamepad (standard mapping: sticks, triggers, face buttons and
// d-pad are translated into the same key codes) and a touch layer (left
// thumb-stick, right-side look drag and on-screen action buttons). Everything funnels into one small state object
// that the player controller reads each frame.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this.mouseLeft = false; this.mouseRight = false;
    this.locked = false;
    this.enabled = true;       // false while typing in chat
    this.touch = { x: 0, y: 0, active: false };
    this.touchButtons = new Set();
    this.touchPressed = new Set();
    this.dragging = false;
    this.lookScale = 1;
    this.pad = { active: false, lx: 0, ly: 0, rx: 0, ry: 0, codes: new Set(), hits: new Set(), start: false };

    const ignoreTarget = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    addEventListener('keydown', (e) => {
      if (ignoreTarget(e) || !this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => { this.held.delete(e.code); });
    addEventListener('blur', () => { this.held.clear(); this.mouseLeft = this.mouseRight = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseLeft = true; this.pressed.add('Mouse0'); }
      if (e.button === 2) { this.mouseRight = true; this.pressed.add('Mouse2'); }
      if (this.wantLock && !this.locked && canvas.requestPointerLock) {
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ }
      }
      this.dragging = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
      this.dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || (this.dragging && e.target === canvas)) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });

    this._setupTouch();
  }

  _setupTouch() {
    const ui = document.getElementById('touchUI');
    if (!ui) return;
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stickKnob');
    let stickId = null, lookId = null, lx = 0, ly = 0, cx = 0, cy = 0;
    const R = 56;
    const moveKnob = (dx, dy) => {
      const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      this.touch.x = (dx * k) / R; this.touch.y = (-dy * k) / R;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      this.touch.active = true;
      moveKnob(t.clientX - cx, t.clientY - cy);
      e.preventDefault();
    }, { passive: false });
    const lookZone = document.getElementById('lookZone');
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) moveKnob(t.clientX - cx, t.clientY - cy);
        if (t.identifier === lookId) {
          this.mouseDX += (t.clientX - lx) * 1.6; this.mouseDY += (t.clientY - ly) * 1.6;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.touch.active = false; moveKnob(0, 0); this.touch.x = this.touch.y = 0; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    // Buttons that press a keyboard key (held while touched), so every keyboard control exists on touch.
    ui.querySelectorAll('[data-key]').forEach((b) => {
      const code = b.dataset.key;
      const down = (e) => { e.preventDefault(); if (!this.held.has(code)) this.pressed.add(code); this.held.add(code); b.classList.add('on'); };
      const up = (e) => { e.preventDefault(); this.held.delete(code); b.classList.remove('on'); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });
    ui.querySelectorAll('[data-btn]').forEach((b) => {
      const name = b.dataset.btn;
      const down = (e) => { e.preventDefault(); this.touchButtons.add(name); this.touchPressed.add(name); b.classList.add('on'); };
      const up = (e) => { e.preventDefault(); this.touchButtons.delete(name); b.classList.remove('on'); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', up);
    });
  }

  // Gamepad button -> key code. Everything the keyboard can do works on a pad.
  static PAD = { 0: 'Space', 1: 'KeyC', 2: 'KeyF', 3: 'KeyE', 4: 'KeyQ', 5: 'KeyR', 6: 'KeyG', 7: 'ShiftLeft', 8: 'KeyH', 10: 'KeyB', 11: 'KeyT', 12: 'KeyV', 13: 'KeyL', 14: 'KeyM', 15: 'KeyJ' };

  // Call once per frame before the game reads input.
  poll(dt) {
    const pad = this.pad;
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...list].find((g) => g && g.connected);
    if (!gp) {
      if (pad.active) { for (const c of pad.codes) this.held.delete(c); pad.codes.clear(); pad.active = false; pad.lx = pad.ly = pad.rx = pad.ry = 0; }
      return;
    }
    pad.active = true;
    const dz = (v) => { const a = Math.abs(v); return a < 0.16 ? 0 : Math.sign(v) * (a - 0.16) / 0.84; };
    pad.lx = dz(gp.axes[0] || 0); pad.ly = -dz(gp.axes[1] || 0);
    pad.rx = dz(gp.axes[2] || 0); pad.ry = dz(gp.axes[3] || 0);
    const want = new Set();
    gp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) { const c = Input.PAD[i]; if (c) want.add(c); if (i === 9) { if (!pad.start) pad.hits.add('start'); pad.start = true; } } else if (i === 9) pad.start = false; });
    // Digital copies of the left stick so throttle-style controls (W/S) work too.
    if (pad.ly > 0.55) want.add('KeyW'); if (pad.ly < -0.55) want.add('KeyS');
    for (const c of want) if (!pad.codes.has(c)) { pad.codes.add(c); this.held.add(c); this.pressed.add(c); }
    for (const c of [...pad.codes]) if (!want.has(c)) { pad.codes.delete(c); this.held.delete(c); }
    // Right stick looks around like a mouse (quadratic response for fine aim).
    const k = 900 * (dt || 1 / 60);
    this.mouseDX += Math.sign(pad.rx) * pad.rx * pad.rx * k;
    this.mouseDY += Math.sign(pad.ry) * pad.ry * pad.ry * k;
  }

  padHit(name) { return this.pad.hits.has(name); }

  down(code) { return this.enabled && this.held.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  tdown(name) { return this.touchButtons.has(name); }
  thit(name) { return this.touchPressed.has(name); }

  // Normalised movement axes (keyboard WASD or touch stick): x = right, y = forward.
  moveAxes() {
    let x = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    let y = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    if (this.touch.active) { x += this.touch.x; y += this.touch.y; }
    if (this.pad.active) { x += this.pad.lx; y += this.pad.ly; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  arrows() {
    return {
      x: (this.down('ArrowRight') ? 1 : 0) - (this.down('ArrowLeft') ? 1 : 0),
      y: (this.down('ArrowUp') ? 1 : 0) - (this.down('ArrowDown') ? 1 : 0),
    };
  }

  consumeLook() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx: dx * this.lookScale, dy: dy * this.lookScale };
  }

  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  endFrame() {
    this.pressed.clear();
    this.touchPressed.clear();
    this.pad.hits.clear();
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
