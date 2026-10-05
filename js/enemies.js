// enemies.js: the creatures of the Salt Choir, how each one behaves, what happens
// when you hit them, and the harpoon gun that shoots them.
//
//  Shellback  : a hermit crab wearing an old diving helmet. Walks at you. Heavy, survives one light hit.
//  Skimmer    : a gull-shaped kite drone. Hovers high, then dive-bombs the car.
//  Burrow Eel : hides under the salt and leaps out in an arc as you pass, knocking your nose up.
//  Brine Jelly: a drifting jellyfish balloon. Its sting drains your steam boost.

SW.Enemies = {
  TYPES: {
    crab:    { name: 'Shellback',   r: 0.8,  hp: 2, bounty: 30, slow: 0.35, damage: 10 },
    skimmer: { name: 'Skimmer',     r: 0.65, hp: 1, bounty: 25, slow: 0.12, damage: 12 },
    eel:     { name: 'Burrow Eel',  r: 0.55, hp: 1, bounty: 20, slow: 0.16, damage: 8 },
    jelly:   { name: 'Brine Jelly', r: 0.7,  hp: 1, bounty: 15, slow: 0.08, damage: 4 },
  },
  list: [],
  harpoons: [],

  // Fresh set of enemies for a new run, from the spawn points in terrain.js.
  reset() {
    const T = SW.Terrain;
    this.list = T.enemySpawns.map((sp) => {
      const def = this.TYPES[sp.type];
      return {
        type: sp.type, def, x: sp.x, y: T.heightAt(sp.x) + 1, homeX: sp.x,
        vx: 0, vy: 0, hp: def.hp, alive: true, state: 'idle',
        t: SW.util.hash(sp.x) * 10, stun: 0, hitCool: 0,
      };
    });
    this.harpoons = [];
  },

  update(dt, run) {
    const car = run.car;
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.x < car.x - 40 || e.x > car.x + 60) continue;   // only bother with nearby enemies
      e.t += dt;
      e.hitCool -= dt;
      this.behave[e.type](e, dt, car);
      if (e.alive && e.hitCool <= 0 && e.state !== 'hidden' && this.touchesCar(e, car)) this.hitCar(e, run);
    }
    this.updateHarpoons(dt, run);
  },

  // ---- Behaviours: one small function per enemy type ----
  behave: {
    crab(e, dt, car) {
      const T = SW.Terrain;
      if (e.stun > 0) {                    // knocked away by a hit: slide and recover
        e.stun -= dt;
        e.x += e.vx * dt; e.vx *= 1 - 3 * dt;
      } else {
        if (e.state === 'idle' && car.x > e.x - 35) e.state = 'walk';
        if (e.state === 'walk') {
          const nx = e.x - 1.6 * dt;       // scuttle towards the car (to the left)
          if (T.heightAt(nx) > T.heightAt(e.x) - 2) e.x = nx;   // but don't walk into a chasm
        }
      }
      e.y = T.heightAt(e.x) + 0.75;
    },

    skimmer(e, dt, car) {
      const ground = SW.Terrain.heightAt(e.x);
      if (e.state === 'idle') {
        e.x = e.homeX + Math.sin(e.t * 0.7) * 2;
        e.y = SW.Terrain.heightAt(e.homeX) + 7 + Math.sin(e.t * 2) * 0.5;
        if (car.x > e.x - 24) {
          // Aim at where the car WILL be, then dive.
          const tx = car.x + car.vx * 0.9, ty = car.y + 0.4;
          const d = Math.hypot(tx - e.x, ty - e.y) || 1;
          e.vx = (tx - e.x) / d * 15; e.vy = (ty - e.y) / d * 15;
          e.state = 'dive';
        }
      } else {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.state === 'dive' && e.y < ground + 0.9) { e.state = 'climb'; e.vy = 9; e.vx = -7; }
        if (e.state === 'climb' && e.y > ground + 14) e.alive = false;   // flew off: missed you
      }
    },

    eel(e, dt, car) {
      const ground = SW.Terrain.heightAt(e.homeX);
      if (e.state === 'idle') { e.state = 'hidden'; }
      if (e.state === 'hidden') {
        e.y = ground - 0.2;
        if (car.x > e.x - 9) { e.state = 'leap'; e.vx = -3.5; e.vy = 10.5; }
      } else {
        e.vy -= 12 * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.vy < 0 && e.y < SW.Terrain.heightAt(e.x) - 0.8) e.alive = false;   // dived back under
      }
    },

    jelly(e, dt) {
      e.x = e.homeX + Math.sin(e.t * 0.5) * 1.5 - e.t * 0.3;
      e.y = SW.Terrain.heightAt(e.homeX) + 2.3 + Math.sin(e.t * 1.7) * 0.5;
    },
  },

  // Is the enemy touching the car? The car is a capsule (a fat line) plus its wheels.
  touchesCar(e, car) {
    const cap = car.stats.capsule, c = Math.cos(car.a), s = Math.sin(car.a);
    const ax = car.x + cap.ax * c - cap.ay * s, ay = car.y + cap.ax * s + cap.ay * c;
    const bx = car.x + cap.bx * c - cap.by * s, by = car.y + cap.bx * s + cap.by * c;
    const abx = bx - ax, aby = by - ay;
    const t = SW.util.clamp(((e.x - ax) * abx + (e.y - ay) * aby) / (abx * abx + aby * aby), 0, 1);
    const dx = e.x - (ax + abx * t), dy = e.y - (ay + aby * t);
    const R = cap.r + e.def.r;
    if (dx * dx + dy * dy < R * R) return true;
    for (const wh of car.wheels) {
      const rr = wh.r + e.def.r;
      if ((e.x - wh.cx) ** 2 + (e.y - wh.cy) ** 2 < rr * rr) return true;
    }
    return false;
  },

  // You rammed into an enemy (or it into you).
  hitCar(e, run) {
    const car = run.car, st = run.stats, def = e.def;
    const relSpeed = Math.hypot(car.vx - e.vx, car.vy - e.vy);
    run.enemiesHit++;
    // Slow the car down. Ram and armour soften the blow.
    const keep = 1 - def.slow * (1 - st.impactReduce);
    car.vx *= keep; car.vy *= keep;
    run.hull -= def.damage * (1 - st.armourReduce);
    run.shake = Math.max(run.shake, 0.4 + def.slow * 2);
    SW.Audio.impact(0.3 + def.slow * 1.5);
    SW.Particles.sparks(e.x, e.y, 8);

    if (e.type === 'eel') car.w += 1.6;                       // whack! nose flips up
    if (e.type === 'jelly') { run.boost *= 0.4; SW.Audio.zap(); SW.Game.popup('STUNG! -boost', e.x, e.y + 1.2, '#d8b4ff'); }

    e.hp -= 1 + (st.ramLevel >= 1 ? 2 : 0) + (relSpeed > 14 ? 1 : 0);
    if (e.hp <= 0) this.kill(e, run);
    else {                                                    // a Shellback shrugged it off
      e.stun = 0.8; e.vx = Math.max(car.vx, 0) + 4; e.hitCool = 0.6;
      SW.Game.popup('CLANK!', e.x, e.y + 1.2, '#ffffff');
    }
  },

  kill(e, run) {
    e.alive = false;
    run.kills++;
    run.bounty += e.def.bounty;
    const colors = { crab: '#c99a3b', skimmer: '#f1dfb4', eel: '#5e8a6e', jelly: '#d8b4ff' };
    SW.Particles.debris(e.x, e.y, colors[e.type], 12, run.car.vx * 0.6);
    SW.Audio.coin();
    SW.Game.popup('+$' + e.def.bounty, e.x, e.y + 1.4, '#fff1c0');
  },

  // ---- Harpoon gun (Ram & Harpoon level 3+) ----
  updateHarpoons(dt, run) {
    const car = run.car, st = run.stats;
    if (st.harpoon) {
      run.harpoonTimer -= dt;
      // Find the nearest enemy in front of the car.
      let target = null, best = 1e9;
      for (const e of this.list) {
        if (!e.alive || e.state === 'hidden') continue;
        const dx = e.x - car.x, dy = e.y - car.y;
        if (dx < 2.5 || dx > 22 || Math.abs(dy) > 12) continue;
        if (dx < best) { best = dx; target = e; }
      }
      const want = target ? SW.util.clamp(Math.atan2(target.y - car.y - 0.5, target.x - car.x) - car.a, -0.4, 1.2) : 0.1;
      car.aim = SW.util.lerp(car.aim || 0.1, want, Math.min(1, dt * 10));
      if (target && run.harpoonTimer <= 0) {
        run.harpoonTimer = st.harpoon.cooldown;
        const A = st.anchors.turret;
        const p = SW.Vehicles.toWorld(car, A[0], A[1] + 0.18);
        const flight = Math.hypot(target.x - p.x, target.y - p.y) / 38;
        const tx = target.x + target.vx * flight, ty = target.y + target.vy * flight;
        const d = Math.hypot(tx - p.x, ty - p.y) || 1;
        const spread = st.harpoon.twin ? [-0.12, 0.12] : [0];
        for (const o of spread) {
          this.harpoons.push({ x: p.x, y: p.y + o, vx: (tx - p.x) / d * 38 + car.vx * 0.5, vy: (ty - p.y) / d * 38, t: 0 });
        }
        SW.Audio.harpoon();
      }
    }
    // Move harpoons and check what they hit.
    for (let i = this.harpoons.length - 1; i >= 0; i--) {
      const h = this.harpoons[i];
      h.t += dt; h.vy -= 4 * dt;
      h.x += h.vx * dt; h.y += h.vy * dt;
      let done = h.t > 1 || h.y < SW.Terrain.heightAt(h.x);
      for (const e of this.list) {
        if (done || !e.alive || e.state === 'hidden') continue;
        if ((e.x - h.x) ** 2 + (e.y - h.y) ** 2 < (e.def.r + 0.3) ** 2) {
          e.hp -= 3;
          run.harpooned++;
          if (e.hp <= 0) this.kill(e, run);
          done = true;
        }
      }
      if (done) this.harpoons.splice(i, 1);
    }
  },

  // ==================================================================
  // DRAWING (world space, metres, y up). px = one screen pixel in metres.
  // ==================================================================
  draw(ctx, px, viewL, viewR) {
    const line = 2.2 * px, INK = '#2a2030';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const e of this.list) {
      if (!e.alive || e.x < viewL - 3 || e.x > viewR + 3) continue;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.strokeStyle = INK; ctx.lineWidth = line;
      this.drawers[e.type](ctx, e, line, INK);
      ctx.restore();
    }
    // harpoons
    for (const h of this.harpoons) {
      const a = Math.atan2(h.vy, h.vx);
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
      ctx.strokeStyle = '#6b4a37'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(-0.9, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#c8c0b0'; ctx.strokeStyle = INK; ctx.lineWidth = line;
      ctx.beginPath(); ctx.moveTo(0.25, 0); ctx.lineTo(-0.05, 0.1); ctx.lineTo(-0.05, -0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  },

  drawers: {
    // Hermit crab wearing a brass diving helmet as a shell.
    crab(ctx, e, line, INK) {
      const walk = e.state === 'walk' ? e.t * 12 : 0;
      // legs
      ctx.strokeStyle = '#a5452f'; ctx.lineWidth = 0.09;
      for (let i = 0; i < 3; i++) {
        const lx = -0.4 + i * 0.35, k = Math.sin(walk + i * 2) * 0.12;
        ctx.beginPath(); ctx.moveTo(lx, -0.2); ctx.lineTo(lx - 0.15 + k, -0.45); ctx.lineTo(lx - 0.05 + k, -0.75); ctx.stroke();
      }
      // claws reaching forward (towards the car, on the left)
      ctx.strokeStyle = INK; ctx.lineWidth = line;
      ctx.fillStyle = '#d9774f';
      const snap = Math.abs(Math.sin(e.t * 5)) * 0.15;
      ctx.beginPath(); ctx.ellipse(-0.85, -0.2, 0.32, 0.2, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1.1, -0.15); ctx.lineTo(-1.3, -0.05 + snap); ctx.lineTo(-1.05, -0.02); ctx.fill(); ctx.stroke();
      // eye stalks
      ctx.beginPath(); ctx.moveTo(-0.5, 0.05); ctx.lineTo(-0.6, 0.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.6, 0.5, 0.09, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.63, 0.5, 0.04, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      // the helmet shell
      ctx.beginPath(); ctx.arc(0.15, 0.05, 0.62, 0, Math.PI * 2);
      ctx.fillStyle = e.stun > 0 ? '#e9c46a' : '#c99a3b'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.1, 0.1, 0.24, 0, Math.PI * 2);
      ctx.fillStyle = '#5b7f8a'; ctx.fill(); ctx.stroke();                 // porthole
      ctx.beginPath(); ctx.arc(-0.16, 0.16, 0.07, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
      ctx.fillStyle = '#8e6b2c';
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); ctx.arc(0.15 + Math.cos(a) * 0.5, 0.05 + Math.sin(a) * 0.5, 0.045, 0, Math.PI * 2); ctx.fill(); }
      if (e.hp < e.def.hp) {   // dented: crack line
        ctx.beginPath(); ctx.moveTo(0.4, 0.5); ctx.lineTo(0.3, 0.2); ctx.lineTo(0.45, 0); ctx.stroke();
      }
    },

    // Kite drone shaped like a gull, with a patched sail and a buzzing propeller.
    skimmer(ctx, e, line, INK) {
      const flap = e.state === 'idle' ? Math.sin(e.t * 6) * 0.2 : 0.35;
      const facing = e.state === 'climb' ? 1 : -1;
      ctx.scale(facing === 1 ? -1 : 1, 1);
      // tail ribbons
      ctx.strokeStyle = '#e2674f'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(0.5, 0);
      for (let i = 1; i <= 4; i++) ctx.lineTo(0.5 + i * 0.25, Math.sin(e.t * 10 + i) * 0.1);
      ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = line;
      // wings (a diamond kite)
      ctx.beginPath();
      ctx.moveTo(-0.5, 0); ctx.lineTo(0.05, 0.55 + flap); ctx.lineTo(0.55, 0); ctx.lineTo(0.05, -0.25 - flap * 0.3); ctx.closePath();
      ctx.fillStyle = '#f1dfb4'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.05, 0.55 + flap); ctx.lineTo(0.05, -0.25 - flap * 0.3); ctx.moveTo(-0.5, 0); ctx.lineTo(0.55, 0); ctx.stroke();
      ctx.fillStyle = '#e2674f'; ctx.fillRect(0.1, 0.05, 0.2, 0.18);          // patch
      // head + beak
      ctx.beginPath(); ctx.arc(-0.55, 0.05, 0.16, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.68, 0.06); ctx.lineTo(-0.95, -0.02); ctx.lineTo(-0.68, -0.04); ctx.fillStyle = '#e9b04a'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.58, 0.1, 0.04, 0, Math.PI * 2); ctx.fillStyle = '#d0302a'; ctx.fill();
      // propeller blur
      ctx.fillStyle = 'rgba(42,32,48,0.35)';
      ctx.beginPath(); ctx.ellipse(0.6, 0, 0.05, 0.28 * Math.abs(Math.sin(e.t * 40)) + 0.05, 0, 0, Math.PI * 2); ctx.fill();
    },

    // Burrow eel: two eyes peeking from the salt, then a long arcing body.
    eel(ctx, e, line, INK) {
      if (e.state === 'hidden') {
        ctx.fillStyle = 'rgba(80,60,50,0.35)';
        ctx.beginPath(); ctx.ellipse(0, 0.1, 0.7, 0.2, 0, 0, Math.PI * 2); ctx.fill();
        const blink = Math.sin(e.t * 2) > 0.95 ? 0.01 : 0.06;
        ctx.fillStyle = '#ffe36b';
        ctx.beginPath(); ctx.ellipse(-0.15, 0.25, 0.07, blink, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0.12, 0.25, 0.07, blink, 0, 0, Math.PI * 2); ctx.fill();
        return;
      }
      const ang = Math.atan2(e.vy, e.vx);
      ctx.rotate(ang);
      // body: a chain of shrinking circles trailing behind the head
      for (let i = 6; i >= 0; i--) {
        const bx = -i * 0.32, by = Math.sin(e.t * 12 + i) * 0.08;
        ctx.beginPath(); ctx.arc(bx, by, 0.36 - i * 0.035, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#5e8a6e' : '#6f9e7c'; ctx.fill(); ctx.stroke();
      }
      // open jaw
      ctx.fillStyle = '#3a1f2a';
      ctx.beginPath(); ctx.moveTo(0.1, 0); ctx.lineTo(0.55, 0.22); ctx.lineTo(0.5, -0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0.05, 0.15, 0.07, 0, Math.PI * 2); ctx.fillStyle = '#ffe36b'; ctx.fill();
    },

    // Brine jelly: a see-through balloon with stinging tentacles.
    jelly(ctx, e, line, INK) {
      ctx.strokeStyle = 'rgba(160,110,220,0.8)'; ctx.lineWidth = 0.06;
      for (let i = 0; i < 5; i++) {
        const tx = -0.45 + i * 0.22;
        ctx.beginPath(); ctx.moveTo(tx, -0.1);
        for (let k = 1; k <= 4; k++) ctx.lineTo(tx + Math.sin(e.t * 3 + i + k) * 0.1, -0.1 - k * 0.25);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(0, 0.2, 0.05, 0, 0.1, 0.9);
      g.addColorStop(0, 'rgba(255,220,255,0.5)'); g.addColorStop(1, 'rgba(200,160,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0.1, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = line;
      ctx.beginPath(); ctx.ellipse(0, 0, 0.6, 0.55, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = 'rgba(216,180,255,0.75)'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(-0.2, 0.3, 0.12, 0.08, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(-0.15, 0.15, 0.05, 0, Math.PI * 2); ctx.arc(0.15, 0.15, 0.05, 0, Math.PI * 2); ctx.fill();
    },
  },
};
