// terrain.js: builds the one long, hand-tuned map and answers "where is the ground?".
//
// The ground is stored as a list of heights, one per metre (a "heightfield").
// Rolling hills come from a few sine waves; on top of those we stamp hand-placed
// set pieces: ramps ("kickers"), gaps over the deep, and shipwreck mounds.
// Units: metres. y points UP (bigger y = higher).

SW.Terrain = {
  LENGTH: 4000,     // metres from the start line to the Last Lighthouse
  EXTRA: 320,       // flat-ish land after the finish so there is something to look at
  heights: null,

  // The five regions of the dry seabed. amp = hill height, rough = small bumps.
  ZONES: [
    { name: 'Salt Shallows',   start: 0,    amp: 2.2, rough: 0.4, ground: '#eadcc0', crust: '#fffaf0', strata: '#cdb894',
      line: 'The old shoreline. Flat salt, easy going.' },
    { name: 'Coral Graveyard', start: 650,  amp: 4.0, rough: 0.7, ground: '#e7b8a6', crust: '#fff1ea', strata: '#c98f7f',
      line: 'Bleached reef, white as bone. Mind the gaps.' },
    { name: 'Wreck Field',     start: 1450, amp: 5.0, rough: 0.8, ground: '#cbb196', crust: '#f5ead8', strata: '#9f8468',
      line: 'A thousand ships ran aground the night the sea left.' },
    { name: 'The Trench',      start: 2330, amp: 7.0, rough: 1.0, ground: '#a3919f', crust: '#ece2ec', strata: '#76657a',
      line: 'The deep water. Now just the deep.' },
    { name: 'Lighthouse Reef', start: 3280, amp: 4.5, rough: 0.8, ground: '#8f87a6', crust: '#e6e2f2', strata: '#655d80',
      line: 'The beam is turning. Almost there.' },
  ],

  // Hand-placed set pieces: this list IS the level design.
  // kicker = a launch ramp, gap = a ramp then a drop into the deep, wreck = a ship hull to drive over.
  SET_PIECES: [
    // Salt Shallows: small kickers to learn air control
    { type: 'kicker', x: 120, h: 1.4, len: 10 },
    { type: 'kicker', x: 250, h: 1.8, len: 10 },
    { type: 'kicker', x: 385, h: 2.1, len: 10 },
    { type: 'kicker', x: 530, h: 2.4, len: 11 },
    // Coral Graveyard: the first gaps
    { type: 'kicker', x: 720, h: 2.6, len: 10 },
    { type: 'gap', x: 850, w: 6 },
    { type: 'kicker', x: 1000, h: 3.0, len: 12 },
    { type: 'gap', x: 1185, w: 8 },
    { type: 'kicker', x: 1330, h: 2.6, len: 9 },
    // Wreck Field: drive right over the stranded ships
    { type: 'wreck', x: 1535, h: 4, len: 36 },
    { type: 'gap', x: 1655, w: 9 },
    { type: 'wreck', x: 1800, h: 5, len: 40 },
    { type: 'kicker', x: 1935, h: 3.0, len: 10 },
    { type: 'wreck', x: 2065, h: 6, len: 44 },
    { type: 'gap', x: 2210, w: 10 },
    // The Trench: big gaps over the deep
    { type: 'gap', x: 2450, w: 11 },
    { type: 'kicker', x: 2610, h: 3.2, len: 10 },
    { type: 'gap', x: 2745, w: 12 },
    { type: 'gap', x: 2960, w: 12 },
    { type: 'wreck', x: 3090, h: 5, len: 36 },
    { type: 'gap', x: 3200, w: 11 },
    // Lighthouse Reef: the final climb
    { type: 'kicker', x: 3400, h: 3.0, len: 10 },
    { type: 'gap', x: 3560, w: 10 },
    { type: 'wreck', x: 3705, h: 5, len: 40 },
    { type: 'kicker', x: 3840, h: 2.6, len: 10 },
  ],

  // Fuel cans dropped along the route (metres).
  FUEL_CANS: [560, 930, 1300, 1680, 2050, 2420, 2800, 3170, 3540, 3900],
  FUEL_CAN_AMOUNT: 25,

  // Breakable obstacles. toughness = speed (m/s) needed to smash through.
  OBSTACLES: {
    crate:  { w: 1.1, h: 1.1, toughness: 3.5, slow: 0.10, cash: 10, color: '#a8754a' },
    timber: { w: 0.6, h: 2.0, toughness: 7,   slow: 0.18, cash: 15, color: '#7a5537' },
    spire:  { w: 0.9, h: 2.8, toughness: 9.5, slow: 0.24, cash: 25, color: '#f2a7a0' },
  },

  // ------------------------------------------------------------------
  // Building the map (runs once when the page loads)
  // ------------------------------------------------------------------
  build() {
    const n = this.LENGTH + this.EXTRA;
    this.heights = new Float32Array(n + 1);
    for (let i = 0; i <= n; i++) this.heights[i] = this.baseHeight(i);

    this.gaps = []; this.kickers = []; this.wrecks = [];
    for (const p of this.SET_PIECES) {
      if (p.type === 'kicker') this.stampKicker(p.x, p.h, p.len);
      if (p.type === 'wreck') this.stampWreck(p.x, p.h, p.len);
      if (p.type === 'gap') this.stampGap(p.x, p.w);
    }
    this.placeObstacles();
    this.placeEnemies();
  },

  // Rolling hills: three sine waves of different sizes added together.
  baseHeight(x) {
    const U = SW.util;
    const amp = this.zoneValue(x, 'amp'), rough = this.zoneValue(x, 'rough');
    let h = amp * (Math.sin(x / 43 + 1.3) + 0.55 * Math.sin(x / 19.3 + 4.1) + 0.22 * rough * Math.sin(x / 8.7 + 0.7));
    h *= U.smoothstep(25, 110, x);                 // flat start line
    h += -18 * U.smoothstep(2280, 2520, x);        // drop down into the Trench...
    h += 30 * U.smoothstep(3160, 3600, x);         // ...and the long climb up to the reef
    return h;
  },

  // A launch ramp that rises over `len` metres and ends with a steep drop.
  stampKicker(x, h, len) {
    for (let i = x - len; i <= x; i++) this.heights[i] += h * Math.pow((i - (x - len)) / len, 1.4);
    for (let i = x + 1; i <= x + 4; i++) this.heights[i] += h * Math.pow(1 - (i - x) / 4, 2);
    this.kickers.push({ x, h, len });
  },

  // A beached ship hull: a smooth hump you drive over.
  stampWreck(x, h, len) {
    const x0 = x - len / 2;
    for (let i = Math.ceil(x0); i <= x0 + len; i++) this.heights[i] += h * Math.pow(Math.sin(Math.PI * (i - x0) / len), 1.2);
    this.wrecks.push({ x, h, len, x0, x1: x0 + len });
  },

  // A ramp, then a deep chasm `w` metres wide. The far side is kept lower so it can be cleared.
  stampGap(x, w) {
    this.stampKicker(x, 2.3 + w * 0.06, 10);
    const lip = this.heights[x];
    for (let i = x + 1; i < x + w; i++) this.heights[i] = lip - 55;
    // Make sure the landing is a bit lower than the take-off.
    const want = lip - 1.2 - w * 0.12;
    const extra = this.heights[x + w] - want;
    if (extra > 0) {
      for (let i = x + w; i <= x + w + 50; i++) this.heights[i] -= extra * (1 - SW.util.smoothstep(0, 50, i - (x + w)));
    }
    this.gaps.push({ x0: x, x1: x + w, lip });
  },

  // Breakable obstacles every 60-140 m, never right on a ramp or gap.
  placeObstacles() {
    const rand = SW.util.rng(4242);
    const pools = [['crate'], ['crate', 'spire', 'crate'], ['crate', 'timber', 'timber'], ['timber', 'spire', 'crate'], ['spire', 'crate', 'timber']];
    this.obstacleSpawns = [];
    let x = 110;
    while (x < this.LENGTH - 60) {
      const z = this.zoneIndex(x);
      if (!this.nearSetPiece(x, 18)) {
        const pool = pools[z];
        this.obstacleSpawns.push({ type: pool[Math.floor(rand() * pool.length)], x });
      }
      x += 70 + rand() * 70 - z * 6;
    }
  },

  // Enemy spawn points. Each zone has its own mix of Salt Choir creatures.
  placeEnemies() {
    const rand = SW.util.rng(777);
    const pools = [
      ['crab', 'jelly', 'crab'],
      ['crab', 'eel', 'jelly', 'eel'],
      ['skimmer', 'crab', 'eel', 'skimmer'],
      ['skimmer', 'eel', 'crab', 'jelly', 'skimmer'],
      ['skimmer', 'jelly', 'crab', 'eel'],
    ];
    this.enemySpawns = [];
    let x = 75;
    while (x < this.LENGTH - 40) {
      const z = this.zoneIndex(x);
      const pool = pools[z];
      const type = pool[Math.floor(rand() * pool.length)];
      if (!this.nearSetPiece(x, 14)) this.enemySpawns.push({ type, x });
      x += 42 + rand() * 50 - z * 4;
    }
  },

  // Fresh copies of obstacles and fuel cans at the start of every run.
  resetRun() {
    this.obstacles = this.obstacleSpawns.map((o) => {
      const def = this.OBSTACLES[o.type];
      const y = Math.min(this.heightAt(o.x - def.w / 2), this.heightAt(o.x + def.w / 2)) - 0.1;
      return { type: o.type, def, x: o.x, y, alive: true };
    });
    this.cans = this.FUEL_CANS.map((x) => {
      const g = this.inGap(x);
      if (g) x = g.x1 + 15;                  // never float a can over a chasm
      return { x, y: this.heightAt(x) + 1.3, taken: false };
    });
  },

  // ------------------------------------------------------------------
  // Questions the rest of the game asks
  // ------------------------------------------------------------------

  zoneIndex(x) {
    let z = 0;
    for (let i = 0; i < this.ZONES.length; i++) if (x >= this.ZONES[i].start) z = i;
    return z;
  },

  // Blend a zone setting smoothly across the border between two zones.
  zoneValue(x, key) {
    const z = this.zoneIndex(x), cur = this.ZONES[z];
    if (z === 0) return cur[key];
    const t = SW.util.smoothstep(cur.start - 60, cur.start + 60, x);
    return SW.util.lerp(this.ZONES[z - 1][key], cur[key], t);
  },

  nearSetPiece(x, d) {
    for (const k of this.kickers) if (x > k.x - k.len - d && x < k.x + 4 + d) return true;
    for (const g of this.gaps) if (x > g.x0 - 12 - d && x < g.x1 + d) return true;
    for (const w of this.wrecks) if (x > w.x0 - d && x < w.x1 + d) return true;
    return false;
  },

  inGap(x) {
    for (const g of this.gaps) if (x > g.x0 && x < g.x1) return g;
    return null;
  },

  // Ground height at any x (straight lines between the per-metre samples).
  heightAt(x) {
    const h = this.heights, n = h.length - 1;
    if (x <= 0) return h[0];
    if (x >= n) return h[n];
    const i = Math.floor(x), f = x - i;
    return h[i] + (h[i + 1] - h[i]) * f;
  },

  // Find the closest point on the ground line to (px, py), searching x0..x1.
  _q: { x: 0, y: 0, d: 0 },
  closest(px, py, x0, x1) {
    const h = this.heights;
    const last = h.length - 2;   // clamp so we always test at least one segment, even off the map
    const i0 = SW.util.clamp(Math.floor(x0), 0, last), i1 = SW.util.clamp(Math.ceil(x1), 0, last);
    let best = Infinity, bx = px, by = this.heightAt(px);
    for (let i = i0; i <= i1; i++) {
      const ay = h[i], dy = h[i + 1] - ay;
      let t = ((px - i) + (py - ay) * dy) / (1 + dy * dy);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = i + t, qy = ay + dy * t;
      const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      if (d2 < best) { best = d2; bx = qx; by = qy; }
    }
    const q = this._q; q.x = bx; q.y = by; q.d = Math.sqrt(best);
    return q;
  },

  // Does a circle (a wheel) touch the ground? Returns {depth, nx, ny} or null.
  // (nx, ny) is the direction to push the circle out of the ground.
  _hit: { depth: 0, nx: 0, ny: 1 },
  collideCircle(cx, cy, r) {
    const q = this.closest(cx, cy, cx - r - 1, cx + r + 1);
    const inside = cy < this.heightAt(cx);
    if (!inside && q.d >= r) return null;
    const out = this._hit;
    if (q.d < 1e-6) { out.nx = 0; out.ny = 1; out.depth = r; }
    else if (inside) { out.nx = (q.x - cx) / q.d; out.ny = (q.y - cy) / q.d; out.depth = r + q.d; }
    else { out.nx = (cx - q.x) / q.d; out.ny = (cy - q.y) / q.d; out.depth = r - q.d; }
    return out;
  },

  // Is a single point (a corner of the hull) under the ground?
  collidePoint(px, py) {
    if (py >= this.heightAt(px)) return null;
    const q = this.closest(px, py, px - 2, px + 2);
    const out = this._hit;
    if (q.d < 1e-6) { out.nx = 0; out.ny = 1; out.depth = 0; }
    else { out.nx = (q.x - px) / q.d; out.ny = (q.y - py) / q.d; out.depth = q.d; }
    return out;
  },

  // ------------------------------------------------------------------
  // Obstacles: smash through them if fast enough, otherwise they block you
  // ------------------------------------------------------------------
  hitObstacles(run) {
    const car = run.car, st = run.stats;
    for (const o of this.obstacles) {
      if (!o.alive || Math.abs(o.x - car.x) > 5) continue;
      const left = o.x - o.def.w / 2, right = o.x + o.def.w / 2, bottom = o.y, top = o.y + o.def.h;
      // Test every collision point on the car (hull corners + wheels).
      for (const p of car.testPoints) {
        const r = p.r;
        if (p.x + r < left || p.x - r > right || p.y + r < bottom || p.y - r > top) continue;
        const speed = Math.hypot(car.vx, car.vy);
        if (speed >= o.def.toughness - st.smashBonus) {
          // SMASH! The obstacle breaks and slows you a little.
          o.alive = false;
          const keep = 1 - o.def.slow * (1 - st.impactReduce);
          car.vx *= keep; car.vy *= keep;
          run.smashed++;
          run.smashCash += o.def.cash;
          run.shake = Math.max(run.shake, 0.5);
          SW.Particles.debris(o.x, o.y + o.def.h / 2, o.def.color, 16, car.vx);
          SW.Audio.crunch();
          SW.Game.popup('+$' + o.def.cash, o.x, top + 0.5, '#fff1c0');
        } else {
          // Too slow: it's a wall. Push the car back out and bounce a little.
          const overlapX = car.vx >= 0 ? (p.x + r) - left : right - (p.x - r);
          const overlapY = top - (p.y - r);
          if (overlapY < overlapX && car.vy < 0) {        // landed on top: stand on it
            car.y += overlapY; car.vy = Math.max(0, car.vy);
          } else {
            car.x += car.vx >= 0 ? -overlapX : overlapX;
            car.vx = -car.vx * 0.25;
            if (speed > 2) { SW.Audio.impact(0.3); run.shake = Math.max(run.shake, 0.3); }
          }
        }
        break;
      }
    }
  },
};
