// main.js: starts everything up, switches between screens
// (title -> run -> summary -> garage -> run ...) and runs the frame loop.

SW.Main = {
  screen: 'title',
  paused: false,
  time: 0,
  acc: 0,
  last: 0,

  init() {
    SW.Save.load();
    SW.Audio.muted = SW.Save.data.muted;
    SW.Terrain.build();
    SW.Render.init(document.getElementById('game'));
    SW.Input.init();
    SW.Input.onKey = (code) => this.onKey(code);
    SW.Garage.init();
    this.bindButtons();
    this.show('title');

    // Save regularly, and whenever the tab is hidden or closed.
    setInterval(() => SW.Save.save(), 5000);
    window.addEventListener('beforeunload', () => SW.Save.save());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      SW.Save.save();
      if (this.screen === 'run') this.setPaused(true);
    });

    requestAnimationFrame((t) => this.loop(t));
  },

  $(id) { return document.getElementById(id); },

  bindButtons() {
    const on = (id, fn) => this.$(id).addEventListener('click', () => { SW.Audio.init(); fn(); });
    on('btn-play', () => {
      SW.Audio.click();
      if (SW.Save.data.runs === 0) this.startRun();   // brand new player: straight into the action
      else this.openGarage();
    });
    on('btn-reset', () => {
      if (confirm('Erase all progress and start again?')) { SW.Save.reset(); SW.Garage.refresh(); }
    });
    on('btn-drive', () => this.startRun());
    on('btn-to-garage', () => { SW.Audio.click(); this.openGarage(); });
    on('btn-resume', () => this.setPaused(false));
    on('btn-abandon', () => { this.setPaused(false); SW.Game.end('quit'); });
    on('btn-pause', () => this.setPaused(!this.paused));
    on('btn-mute', () => this.toggleMute());
  },

  onKey(code) {
    SW.Audio.init();
    if (code === 'KeyM') this.toggleMute();
    if (this.screen === 'run' && (code === 'KeyP' || code === 'Escape')) this.setPaused(!this.paused);
    if (code === 'Enter') {
      if (this.screen === 'garage') this.startRun();
      else if (this.screen === 'summary') this.openGarage();
      else if (this.screen === 'title') this.$('btn-play').click();
    }
  },

  toggleMute() {
    SW.Save.data.muted = !SW.Save.data.muted;
    SW.Audio.setMuted(SW.Save.data.muted);
    SW.Save.save();
  },

  // Show one screen and hide the others.
  show(name) {
    this.screen = name;
    for (const s of ['title', 'garage', 'summary']) this.$('screen-' + s).classList.toggle('hidden', s !== name);
    this.$('screen-pause').classList.toggle('hidden', !(name === 'run' && this.paused));
    this.$('run-buttons').classList.toggle('hidden', name !== 'run');
    this.$('touch').classList.toggle('hidden', !(name === 'run' && SW.Input.isTouchDevice()));
  },

  setPaused(p) {
    this.paused = p;
    if (p) SW.Audio.stopLoops();
    this.show(this.screen);
  },

  openGarage() {
    SW.Garage.refresh();
    this.show('garage');
  },

  startRun() {
    SW.Audio.init();
    SW.Game.start();
    this.paused = false;
    this.acc = 0;
    SW.Render.camX = SW.Game.run.car.x + 6;
    SW.Render.camY = SW.Game.run.car.y + 1.5;
    this.show('run');
  },

  showSummary(r) {
    const s = r.summary, U = SW.util;
    this.$('s-title').textContent = s.title;
    this.$('s-flavour').textContent = s.flavour;
    const rows = [
      ['Distance', `${U.money(s.distance)} m${s.newBest ? '  (new best!)' : ''}`],
      ['Enemies hit', s.enemiesHit + (s.harpooned ? `  (+${s.harpooned} harpooned)` : '')],
      ['Obstacles smashed', s.smashed],
      ['Air time', `${s.airTime.toFixed(1)} s  (longest ${s.bestAir.toFixed(1)} s)`],
      ['Distance pay', '$' + U.money(s.cash.distance)],
      ['Bounties', '$' + U.money(s.cash.bounty + s.cash.smash)],
      ['Air bonus', '$' + U.money(s.cash.air)],
    ];
    if (s.cash.zone) rows.push(['New zone bonus', '$' + U.money(s.cash.zone)]);
    if (s.cash.finish) rows.push(['Lighthouse reward', '$' + U.money(s.cash.finish)]);
    if (s.reason === 'finish') {
      const m = Math.floor(SW.Save.data.playSeconds / 60), sec = Math.floor(SW.Save.data.playSeconds % 60);
      rows.push(['Total journey time', `${m} min ${sec} s over ${SW.Save.data.runs} runs`]);
    }
    this.$('s-table').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    this.$('s-cash').textContent = U.money(s.total);
    this.show('summary');
  },

  // ---------------- the frame loop ----------------
  loop(ts) {
    const dt = Math.min(0.05, (ts - this.last) / 1000 || 0);
    this.last = ts;
    this.time += dt;
    SW.Save.data.playSeconds += dt;

    const r = SW.Game.run;
    const inRun = r && (this.screen === 'run' || this.screen === 'summary');
    if (inRun) {
      if (!this.paused) {
        // Run the physics in fixed 1/120 s steps, however long this frame took.
        this.acc += dt;
        let n = 0;
        const ctl = this.screen === 'run' ? SW.Input.controls() : {};
        while (this.acc >= SW.Physics.DT && n < 12) { SW.Game.step(SW.Physics.DT, ctl); this.acc -= SW.Physics.DT; n++; }
        if (n === 12) this.acc = 0;
        this.updateSound(r, ctl);
      }
      SW.Render.followCar(dt, r);
      SW.Render.frame(r, this.time);
      if (r.ended && r.endTimer > 1.2 && this.screen === 'run') this.showSummary(r);
    } else {
      SW.Render.idleCamera(this.time);
      SW.Render.frame(null, this.time);
    }
    if (this.screen === 'garage') SW.Garage.drawPreview(this.time);
    requestAnimationFrame((t) => this.loop(t));
  },

  updateSound(r, ctl) {
    if (r.ended) { SW.Audio.stopLoops(); return; }
    const st = r.stats;
    let rpm = 0;
    for (const wh of r.car.wheels) if (wh.drive) rpm = Math.max(rpm, Math.abs(wh.spin * wh.r) / st.topSpeed);
    SW.Audio.engine(Math.min(1.2, rpm), ctl.gas && r.fuel > 0 ? 1 : 0, r.fuel > 0);
    SW.Audio.boost(r.boosting);
  },
};

// ---------------- hooks for automated testing (tools/playtest.mjs) ----------------
SW.debug = {
  reset() { SW.Save.reset(); return true; },
  start() { SW.Main.startRun(); return true; },

  // Run the simulation as fast as possible for `seconds` of game time.
  // ctl is either a controls object or a function (run) => controls.
  simulate(seconds, ctl) {
    const T = SW.Terrain, DT = SW.Physics.DT;
    let maxPen = 0, maxSpeed = 0;
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      const r = SW.Game.run;
      if (r.ended) break;
      SW.Game.step(DT, typeof ctl === 'function' ? ctl(r) : ctl);
      const car = r.car;
      maxSpeed = Math.max(maxSpeed, Math.hypot(car.vx, car.vy));
      // How far is any wheel sunk into the ground? (Should stay tiny.)
      for (const wh of car.wheels) {
        const hit = T.collideCircle(wh.cx, wh.cy, wh.r);
        if (hit && hit.ny > 0.4) maxPen = Math.max(maxPen, hit.depth);
      }
      if (car.y < T.heightAt(car.x) - 0.5 && !T.inGap(car.x)) maxPen = Math.max(maxPen, 99);
    }
    const r = SW.Game.run;
    return { time: r.time, x: r.car.x, ended: r.ended, reason: r.endReason, maxPen, maxSpeed, fuel: r.fuel, summary: r.summary };
  },

  state() {
    const d = SW.Save.data;
    return { cash: d.cash, upgrades: Object.assign({}, d.upgrades), best: d.best, runs: d.runs, vehicle: d.vehicle, owned: d.owned.slice() };
  },
};

window.addEventListener('load', () => SW.Main.init());
