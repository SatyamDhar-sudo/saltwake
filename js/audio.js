// audio.js: every sound is generated in code with the Web Audio API.
// No sound files: engines are buzzing oscillators, crashes are bursts of filtered noise.

SW.Audio = {
  ctx: null,
  master: null,
  muted: false,

  // Browsers only allow sound after the player clicks or presses a key,
  // so main.js calls init() from the first button press.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // One second of white noise, reused for every crash, hiss and crunch.
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // ENGINE: a sawtooth + a square wave an octave down, through a low-pass filter.
    this.engOsc1 = ctx.createOscillator(); this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator(); this.engOsc2.type = 'square';
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.Q.value = 4;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const sub = ctx.createGain(); sub.gain.value = 0.5;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(sub).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engOsc1.start(); this.engOsc2.start();

    // BOOST: looping noise through a high-pass filter = a steam hiss.
    const hiss = ctx.createBufferSource(); hiss.buffer = this.noiseBuf; hiss.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 0.8;
    this.boostGain = ctx.createGain(); this.boostGain.gain.value = 0;
    hiss.connect(hp).connect(this.boostGain).connect(this.master);
    hiss.start();
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  },

  // Called every frame while driving. rpm and throttle go from 0 to 1.
  engine(rpm, throttle, running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 38 + rpm * 95;
    this.engOsc1.frequency.setTargetAtTime(base, t, 0.05);
    this.engOsc2.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + rpm * 900 + throttle * 700, t, 0.05);
    this.engGain.gain.setTargetAtTime(running ? 0.07 + throttle * 0.09 : 0, t, 0.08);
  },

  boost(on) {
    if (!this.ctx) return;
    this.boostGain.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
  },

  // Silence the engine and boost (when you leave a run).
  stopLoops() {
    this.engine(0, 0, false);
    this.boost(false);
  },

  // ---- one-shot sound building blocks ----

  // A short burst of noise through a band-pass filter (crashes, crunches, thuds).
  noise(duration, freq, q, volume) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration);
  },

  // A simple beep that can slide from one pitch to another.
  tone(freq, duration, type, volume, slideTo, delay) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + duration);
  },

  // ---- named game sounds ----
  impact(strength) {  // hitting an enemy or the ground hard (strength 0..1)
    const s = SW.util.clamp(strength, 0.15, 1);
    this.noise(0.25 + s * 0.2, 260, 0.8, 0.7 * s);
    this.tone(110, 0.25, 'triangle', 0.5 * s, 40);
  },
  crunch() {          // smashing a crate or coral spire
    this.noise(0.22, 1300, 1.2, 0.5);
    this.tone(160, 0.12, 'square', 0.12, 70);
  },
  land(strength) {    // wheels slamming down after a jump
    const s = SW.util.clamp(strength, 0.1, 1);
    this.tone(90, 0.2, 'sine', 0.6 * s, 45);
    this.noise(0.15, 500, 0.7, 0.3 * s);
  },
  scrape() { this.noise(0.12, 3000, 2, 0.15); },
  zap() {             // brine jelly sting
    this.tone(1200, 0.25, 'sawtooth', 0.12, 180);
    this.noise(0.2, 5000, 3, 0.2);
  },
  harpoon() { this.tone(260, 0.12, 'triangle', 0.25, 900); this.noise(0.08, 2000, 1, 0.2); },
  pickup() {          // fuel can
    this.tone(523, 0.12, 'triangle', 0.25);
    this.tone(784, 0.12, 'triangle', 0.25, null, 0.08);
    this.tone(1046, 0.2, 'triangle', 0.25, null, 0.16);
  },
  coin() { this.tone(1318, 0.08, 'square', 0.08); this.tone(1760, 0.12, 'square', 0.08, null, 0.06); },
  click() { this.tone(660, 0.05, 'square', 0.08); },
  buy() { this.tone(392, 0.1, 'triangle', 0.25); this.tone(587, 0.18, 'triangle', 0.25, null, 0.09); },
  denied() { this.tone(180, 0.18, 'square', 0.12, 120); },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.25, null, i * 0.15));
  },
};
