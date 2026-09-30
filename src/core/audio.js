// Procedural sound via Web Audio - no audio files. Engine voices for each
// craft (jet turbine, propeller buzz, rotor chop, saucer hum, rocket roar), wind
// that rises with speed, surf near the coast, birds by day, crickets by night,
// a slow ambient pad, and one-shot effects. Silent until the first gesture.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.8;
    this.birdTimer = 1;
  }

  init() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3;
      this.master.connect(comp); comp.connect(ctx.destination);

      // Shared noise source.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; data[i] = w * 0.6 + b * 2.2; }
      this.noiseBuf = buf;
      const noise = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

      // Reverb for the pad and one-shots.
      this.reverb = ctx.createConvolver();
      const ir = ctx.createBuffer(2, ctx.sampleRate * 2.5, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
      this.reverb.buffer = ir;
      const revGain = ctx.createGain(); revGain.gain.value = 0.35;
      this.reverb.connect(revGain); revGain.connect(this.master);

      // Wind.
      this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.Q.value = 0.6; this.windFilter.frequency.value = 400;
      this.windGain = ctx.createGain(); this.windGain.gain.value = 0.02;
      noise().connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
      // Surf.
      this.surfFilter = ctx.createBiquadFilter(); this.surfFilter.type = 'lowpass'; this.surfFilter.frequency.value = 700;
      this.surfGain = ctx.createGain(); this.surfGain.gain.value = 0;
      noise().connect(this.surfFilter); this.surfFilter.connect(this.surfGain); this.surfGain.connect(this.master);

      // Engine voice bus.
      this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
      this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 900; this.engFilter.Q.value = 2;
      this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'; this.osc1.frequency.value = 70;
      this.osc2 = ctx.createOscillator(); this.osc2.type = 'square'; this.osc2.frequency.value = 35;
      this.osc1.connect(this.engFilter); this.osc2.connect(this.engFilter);
      this.osc1.start(); this.osc2.start();
      // Turbine whine / hiss.
      this.hissFilter = ctx.createBiquadFilter(); this.hissFilter.type = 'bandpass'; this.hissFilter.frequency.value = 2400; this.hissFilter.Q.value = 3;
      this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
      noise().connect(this.hissFilter); this.hissFilter.connect(this.hissGain); this.hissGain.connect(this.master);
      // Rotor chop: low noise amplitude-modulated by an LFO.
      this.chopFilter = ctx.createBiquadFilter(); this.chopFilter.type = 'lowpass'; this.chopFilter.frequency.value = 320;
      this.chopGain = ctx.createGain(); this.chopGain.gain.value = 0;
      this.chopLfo = ctx.createOscillator(); this.chopLfo.type = 'square'; this.chopLfo.frequency.value = 0;
      this.chopDepth = ctx.createGain(); this.chopDepth.gain.value = 0;
      this.chopLfo.connect(this.chopDepth); this.chopDepth.connect(this.chopGain.gain);
      noise().connect(this.chopFilter); this.chopFilter.connect(this.chopGain); this.chopGain.connect(this.master);
      this.chopLfo.start();
      // Saucer hum.
      this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
      this.hum1 = ctx.createOscillator(); this.hum1.type = 'sine'; this.hum1.frequency.value = 110;
      this.hum2 = ctx.createOscillator(); this.hum2.type = 'sine'; this.hum2.frequency.value = 113.5;
      this.hum3 = ctx.createOscillator(); this.hum3.type = 'triangle'; this.hum3.frequency.value = 660;
      const h3g = ctx.createGain(); h3g.gain.value = 0.12;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vibG = ctx.createGain(); vibG.gain.value = 14;
      vib.connect(vibG); vibG.connect(this.hum3.frequency);
      this.hum1.connect(this.humGain); this.hum2.connect(this.humGain); this.hum3.connect(h3g); h3g.connect(this.humGain);
      this.humGain.connect(this.master);
      this.humGain.connect(this.reverb);
      [this.hum1, this.hum2, this.hum3, vib].forEach((o) => o.start());

      // Rocket roar: deep filtered noise with a crackling top end.
      this.roarFilter = ctx.createBiquadFilter(); this.roarFilter.type = 'lowpass'; this.roarFilter.frequency.value = 160; this.roarFilter.Q.value = 0.7;
      this.roarGain = ctx.createGain(); this.roarGain.gain.value = 0;
      noise().connect(this.roarFilter); this.roarFilter.connect(this.roarGain); this.roarGain.connect(this.master);
      this.crackleFilter = ctx.createBiquadFilter(); this.crackleFilter.type = 'bandpass'; this.crackleFilter.frequency.value = 900; this.crackleFilter.Q.value = 0.8;
      this.crackleGain = ctx.createGain(); this.crackleGain.gain.value = 0;
      const crackLfo = ctx.createOscillator(); crackLfo.type = 'square'; crackLfo.frequency.value = 23;
      const crackDepth = ctx.createGain(); crackDepth.gain.value = 0.5;
      crackLfo.connect(crackDepth); crackDepth.connect(this.crackleGain.gain); crackLfo.start();
      noise().connect(this.crackleFilter); this.crackleFilter.connect(this.crackleGain); this.crackleGain.connect(this.master);

      // Car horn: a two-tone chord, silent until sounded.
      this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
      for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0.5; o.connect(og); og.connect(this.hornGain); o.start(); }
      const hornF = ctx.createBiquadFilter(); hornF.type = 'lowpass'; hornF.frequency.value = 1800;
      this.hornGain.connect(hornF); hornF.connect(this.master);

      // Night crickets.
      this.cricketGain = ctx.createGain(); this.cricketGain.gain.value = 0;
      const cr = ctx.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4400;
      const crAm = ctx.createGain(); crAm.gain.value = 0;
      const crLfo = ctx.createOscillator(); crLfo.type = 'square'; crLfo.frequency.value = 28;
      const crLfo2 = ctx.createOscillator(); crLfo2.type = 'square'; crLfo2.frequency.value = 0.9;
      const crLfoG = ctx.createGain(); crLfoG.gain.value = 0.5; const crLfo2G = ctx.createGain(); crLfo2G.gain.value = 0.5;
      crLfo.connect(crLfoG); crLfoG.connect(crAm.gain); crLfo2.connect(crLfo2G); crLfo2G.connect(crAm.gain);
      cr.connect(crAm); crAm.connect(this.cricketGain); this.cricketGain.connect(this.master);
      [cr, crLfo, crLfo2].forEach((o) => o.start());

      // Ambient pad (two slow detuned chords).
      this.padGain = ctx.createGain(); this.padGain.gain.value = 0;
      const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 700;
      padF.connect(this.padGain); this.padGain.connect(this.master); this.padGain.connect(this.reverb);
      for (const f of [110, 164.8, 220.5, 277.2, 329.6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12;
        const g = ctx.createGain(); g.gain.value = 0.018;
        const l = ctx.createOscillator(); l.frequency.value = 0.05 + Math.random() * 0.08; const lg = ctx.createGain(); lg.gain.value = 0.012;
        l.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(padF); o.start(); l.start();
      }
      this.ready = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  _ramp(param, value, tc = 0.12) { param.setTargetAtTime(value, this.ctx.currentTime, tc); }

  update(s) {
    if (!this.ready) return;
    const R = (p, v, tc) => this._ramp(p, v, tc);
    const t = s.vehicle, th = s.throttle || 0, sp = s.speed || 0;
    R(this.windGain.gain, Math.min(0.28, 0.015 + sp * 0.0009 + (s.altitude > 800 ? 0.03 : 0)) * (s.space ? 0 : 1));
    R(this.windFilter.frequency, 300 + sp * 8);
    R(this.surfGain.gain, s.space ? 0 : s.coast * 0.07);
    let eng = 0, hiss = 0, chop = 0, hum = 0, roar = 0, crackle = 0;
    if (t === 'jet' || t === 'nova') {
      eng = 0.05 + th * 0.09; hiss = 0.01 + th * 0.05 + (s.boosting ? 0.06 : 0);
      R(this.osc1.frequency, 55 + th * 90 + (s.boosting ? 20 : 0)); R(this.osc2.frequency, 28 + th * 45);
      R(this.engFilter.frequency, 500 + th * 1400 + (s.boosting ? 800 : 0));
      R(this.hissFilter.frequency, 1800 + th * 3200);
    } else if (t === 'prop') {
      eng = 0.04 + th * 0.12;
      R(this.osc1.frequency, 40 + th * 55); R(this.osc2.frequency, 80 + th * 110);
      R(this.engFilter.frequency, 380 + th * 900);
    } else if (t === 'heli') {
      const rpm = s.rpm || 0;
      chop = 0.05 + rpm * 0.2; eng = rpm * 0.03; hiss = rpm * 0.025;
      R(this.chopLfo.frequency, rpm * 18); R(this.chopDepth.gain, chop * 0.9);
      R(this.osc1.frequency, 90 + rpm * 60); R(this.engFilter.frequency, 600);
      R(this.hissFilter.frequency, 3200);
    } else if (t === 'car') {
      const rpm = s.rpm || 0;
      eng = 0.04 + th * 0.05 + rpm * 0.035; hiss = (s.skid || 0) * 0.07 + Math.min(0.02, sp * 0.0004);
      R(this.osc1.frequency, 36 + rpm * 175); R(this.osc2.frequency, 18 + rpm * 88);
      R(this.engFilter.frequency, 320 + rpm * 1250 + th * 550);
      R(this.hissFilter.frequency, 1300 + (s.skid || 0) * 1400);
    } else if (t === 'rocket') {
      // In vacuum you only hear the engine through the structure.
      const k = s.thrust ? th : 0, vac = s.vacuum ? 0.25 : 1;
      roar = k * 0.9 * vac + k * 0.12; crackle = k * 0.22 * vac;
      R(this.roarFilter.frequency, 120 + k * 120);
    } else if (t === 'ship') {
      hum = 0.03 + (s.rpm || 0) * 0.04;
      hiss = 0.02 + (s.boosting ? 0.06 : 0.02) + th * 0.04;
      roar = (s.boosting ? 0.12 : 0.05) * (s.vacuum ? 0.3 : 1);
      R(this.hissFilter.frequency, 2600); R(this.roarFilter.frequency, 220);
      R(this.hum1.frequency, 80 + sp * 0.1); R(this.hum2.frequency, 82 + sp * 0.1); R(this.hum3.frequency, 420 + sp * 0.5);
    } else if (t === 'ufo') {
      hum = 0.05 + (s.rpm || 0) * 0.08 + (s.boosting ? 0.05 : 0) + (s.beam ? 0.05 : 0);
      R(this.hum1.frequency, 105 + sp * 0.12); R(this.hum2.frequency, 108 + sp * 0.13); R(this.hum3.frequency, 620 + sp * 0.8 + (s.beam ? 200 : 0));
    }
    R(this.engGain.gain, eng); R(this.hissGain.gain, hiss); R(this.chopGain.gain, chop > 0 ? chop * 0.5 : 0); R(this.humGain.gain, hum);
    R(this.roarGain.gain, roar, 0.2); R(this.crackleGain.gain, crackle, 0.2);
    if (chop === 0) R(this.chopDepth.gain, 0);
    const outside = !s.space && !t;
    R(this.cricketGain.gain, outside || t ? s.night * 0.012 * (s.altitude < 150 ? 1 : 0) : 0, 0.8);
    R(this.padGain.gain, s.menu ? 0.5 : s.space ? 0.7 : s.night * 0.35 + 0.1, 1.5);
    // Daytime birdsong near the ground.
    this.birdTimer -= s.dt || 0.016;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 4;
      if (!s.space && !s.menu && s.night < 0.3 && s.altitude < 120 && !t) this._bird();
    }
  }

  _env(node, peak, a, d, when = this.ctx.currentTime) {
    node.gain.setValueAtTime(0.0001, when);
    node.gain.exponentialRampToValueAtTime(peak, when + a);
    node.gain.exponentialRampToValueAtTime(0.0001, when + a + d);
  }

  _tone(freq, { type = 'sine', peak = 0.15, a = 0.01, d = 0.3, when = 0, slide = 0, reverb = false } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + a + d);
    const g = ctx.createGain(); this._env(g, peak, a, d, t0);
    o.connect(g); g.connect(this.master); if (reverb) g.connect(this.reverb);
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }

  _noise({ peak = 0.3, a = 0.005, d = 0.4, freq = 1200, type = 'lowpass', when = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); this._env(g, peak, a, d, t0);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0, Math.random()); s.stop(t0 + a + d + 0.05);
  }

  _bird() {
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 4); i++) this._tone(base * (0.9 + Math.random() * 0.3), { peak: 0.02, a: 0.01, d: 0.07, when: i * 0.11, slide: 1.3 });
  }

  horn(on) { if (this.ready) this._ramp(this.hornGain.gain, on ? 0.06 : 0, 0.03); }
  thump(k = 5) { this._noise({ peak: Math.min(0.5, 0.06 * k), d: 0.25, freq: 300 }); this._tone(70, { type: 'sine', peak: Math.min(0.4, 0.04 * k), d: 0.2, slide: 0.5 }); }
  jump() { this._noise({ peak: 0.05, d: 0.12, freq: 900 }); }
  splash() { this._noise({ peak: 0.2, d: 0.6, freq: 1600 }); }
  eject() { this._noise({ peak: 0.35, d: 0.5, freq: 2400, type: 'bandpass' }); this._tone(180, { type: 'sawtooth', peak: 0.08, d: 0.3, slide: 0.4 }); }
  chute() { this._noise({ peak: 0.25, a: 0.02, d: 0.8, freq: 500 }); }
  enter() { this._tone(220, { type: 'triangle', peak: 0.08, d: 0.08 }); this._tone(330, { type: 'triangle', peak: 0.06, d: 0.1, when: 0.07 }); }
  zap() { this._tone(1400, { type: 'square', peak: 0.03, d: 0.09, slide: 0.35 }); }
  pop() { this._tone(880, { peak: 0.1, d: 0.2 }); this._tone(1320, { peak: 0.08, d: 0.3, when: 0.06, reverb: true }); this._noise({ peak: 0.12, d: 0.25, freq: 3000, type: 'highpass' }); }
  crash() { this._noise({ peak: 0.9, a: 0.005, d: 1.8, freq: 700 }); this._tone(60, { type: 'sine', peak: 0.6, d: 1.4, slide: 0.5 }); }
  teleport() { this._tone(300, { type: 'sine', peak: 0.12, d: 0.6, slide: 6, reverb: true }); }
  talk() { this._tone(520, { type: 'triangle', peak: 0.04, d: 0.06 }); this._tone(660, { type: 'triangle', peak: 0.035, d: 0.06, when: 0.06 }); }
  ping() { this._tone(988, { peak: 0.06, d: 0.18 }); this._tone(1318, { peak: 0.05, d: 0.25, when: 0.08 }); }
  click() { this._tone(700, { type: 'triangle', peak: 0.04, d: 0.04 }); }
  land() { this._noise({ peak: 0.2, d: 0.3, freq: 500 }); }
  moo() { this._tone(160, { type: 'sawtooth', peak: 0.06, a: 0.1, d: 0.9, slide: 0.7 }); }
  discover() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._tone(f, { peak: 0.09, a: 0.01, d: 1.6, when: i * 0.12, reverb: true }));
    this._tone(130.8, { type: 'triangle', peak: 0.12, a: 0.4, d: 2.5, reverb: true });
  }
}
