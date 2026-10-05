// game.js: one "run" from the start line until you run out of fuel, wreck, fall into
// the Trench or reach the lighthouse. Handles fuel and boost, damage, air time,
// pickups, zone banners, and the cash you earn at the end.

SW.Game = {
  run: null,

  // ---- economy knobs (tweak these to make the game easier or harder) ----
  CASH_PER_METRE: 2,
  AIR_CASH_PER_SECOND: 25,
  ZONE_BONUS: [0, 400, 800, 1200, 1600],   // one-time bonus the first time you reach each zone
  FINISH_BONUS: 5000,
  FUEL_IDLE: 0.6,                         // fuel used per second just ticking over
  FUEL_THROTTLE: 2.3,                     // extra fuel per second with the pedal down

  start() {
    const save = SW.Save.data;
    const stats = SW.Vehicles.computeStats(save.vehicle, save.upgrades);
    const T = SW.Terrain;
    const startX = 6;
    const car = SW.Physics.createCar(stats, startX, T.heightAt(startX) + stats.susLen + stats.wheelR + 0.4);
    T.resetRun();
    SW.Enemies.reset();
    SW.Particles.clear();
    this.run = {
      car, stats, startX,
      fuel: stats.fuelMax, boost: stats.boostMax, hull: stats.hullMax,
      time: 0, maxX: startX, lastProgressT: 0,
      enemiesHit: 0, kills: 0, harpooned: 0, smashed: 0,
      bounty: 0, smashCash: 0, airCash: 0, zoneBonus: 0,
      airTime: 0, curAir: 0, bestAir: 0,
      zone: 0, flipTimer: 0, noFuelTimer: 0, harpoonTimer: 0,
      boosting: false, shake: 0, popups: [], banner: null,
      ended: false, endReason: null, endTimer: 0, summary: null,
      cashSoFar() {
        return Math.floor(Math.floor(this.maxX) * SW.Game.CASH_PER_METRE) + this.bounty + this.smashCash + this.airCash + this.zoneBonus;
      },
    };
    this.showBanner(T.ZONES[0].name, T.ZONES[0].line);
    return this.run;
  },

  popup(text, x, y, color) {
    if (this.run) this.run.popups.push({ text, x, y, color, t: 1.2 });
  },

  showBanner(title, sub) {
    this.run.banner = { title: title.toUpperCase(), sub, t: 3.5 };
  },

  _ev: { landSpeed: 0, hullImpact: 0, hullX: 0, hullY: 0 },

  // One fixed time step (1/120 s) of the run.
  step(dt, ctl) {
    const r = this.run, car = r.car, st = r.stats, T = SW.Terrain;
    this.effects(dt);
    const ev = this._ev;
    ev.landSpeed = 0; ev.hullImpact = 0;

    if (r.ended) {               // keep the wreck tumbling for a moment after the run ends
      r.endTimer += dt;
      SW.Physics.step(car, T, {}, dt, ev);
      return;
    }
    r.time += dt;

    // ---- fuel and boost ----
    car.hasFuel = r.fuel > 0;
    const gas = ctl.gas && car.hasFuel;
    r.boosting = !!(ctl.boost && r.boost > 0 && car.hasFuel);
    r.fuel = Math.max(0, r.fuel - (this.FUEL_IDLE + this.FUEL_THROTTLE * (gas ? 1 : 0)) * st.fuelUse * dt);
    if (r.boosting) r.boost = Math.max(0, r.boost - dt);

    // ---- physics ----
    SW.Physics.step(car, T, { gas, brake: ctl.brake, leanBack: ctl.leanBack, leanFwd: ctl.leanFwd, boost: r.boosting }, dt, ev);
    if (car.x < 2) { car.x = 2; if (car.vx < 0) car.vx = 0; }   // invisible wall behind the start
    const speed = Math.hypot(car.vx, car.vy);

    // ---- air time: cash and a little boost refill for big jumps ----
    const touching = car.grounded || car.roofContact || ev.hullImpact > 0;
    if (!touching) r.curAir += dt;
    else {
      if (r.curAir > 0.6) {
        const cash = Math.round(r.curAir * this.AIR_CASH_PER_SECOND);
        r.airTime += r.curAir; r.airCash += cash;
        r.bestAir = Math.max(r.bestAir, r.curAir);
        r.boost = Math.min(st.boostMax, r.boost + r.curAir * 0.35);
        this.popup(`AIR ${r.curAir.toFixed(1)}s +$${cash}`, car.x, car.y + 2.2, '#bff8ee');
      }
      r.curAir = 0;
    }

    // ---- hard landings and hull hits: shake, sparks, damage ----
    if (ev.landSpeed > 6) {
      const s = ev.landSpeed;
      r.shake = Math.max(r.shake, Math.min(1.2, (s - 5) * 0.15));
      SW.Audio.land((s - 5) / 8);
      SW.Particles.dust(car.x, car.y - 0.9, 12, '#efe4cf', car.vx);
      if (s > 13) r.hull -= (s - 13) * 2 * (1 - st.armourReduce);   // the suspension soaks up the rest
    }
    if (ev.hullImpact > 3.5) {
      const s = ev.hullImpact;
      r.shake = Math.max(r.shake, Math.min(1.5, (s - 3) * 0.2));
      SW.Particles.sparks(ev.hullX, ev.hullY, 10);
      SW.Audio.impact((s - 3) / 8);
      r.hull -= (s - 3.5) * 3 * (1 - st.armourReduce);
    }

    // ---- dust from the tyres, steam from the boost, smoke from big engines ----
    for (const wh of car.wheels) {
      if (wh.contact && (wh.slip > 1.5 || speed > 5) && Math.random() < 0.25) {
        SW.Particles.dust(wh.px, wh.py, 1, '#efe4cf', wh.spin * wh.r);
      }
    }
    const c = Math.cos(car.a), s = Math.sin(car.a);
    if (r.boosting && Math.random() < 0.6) {
      const A = st.anchors.tanks, len = 0.5 + 0.08 * st.upgrades.boost;
      const p = SW.Vehicles.toWorld(car, A[0] - len / 2 - 0.2, A[1] + 0.15);
      SW.Particles.steam(p.x, p.y, car.vx - c * 6, car.vy - s * 6);
    }
    if (gas && st.upgrades.engine >= 2 && Math.random() < 0.08) {
      const A = st.anchors.engine;
      const p = SW.Vehicles.toWorld(car, A[0], A[1] + 1.1 + 0.07 * st.upgrades.engine);
      SW.Particles.smoke(p.x, p.y);
    }

    // ---- the world: obstacles, fuel cans, enemies ----
    T.hitObstacles(r);
    for (const can of T.cans) {
      if (!can.taken && Math.abs(can.x - car.x) < 1.9 && Math.abs(can.y - car.y) < 2.4) {
        can.taken = true;
        r.fuel = Math.min(st.fuelMax, r.fuel + T.FUEL_CAN_AMOUNT);
        SW.Audio.pickup();
        this.popup('+FUEL', can.x, can.y + 1, '#ffe9a0');
      }
    }
    SW.Enemies.update(dt, r);

    // ---- progress and zones ----
    if (car.x > r.maxX + 0.5) { r.maxX = car.x; r.lastProgressT = r.time; }
    const z = T.zoneIndex(car.x);
    if (z > r.zone) {
      r.zone = z;
      let sub = T.ZONES[z].line;
      if (z > SW.Save.data.zoneReached && !r['bonus' + z]) {
        r['bonus' + z] = true;
        r.zoneBonus += this.ZONE_BONUS[z];
        sub += `  (+$${this.ZONE_BONUS[z]} first-visit bonus)`;
        SW.Audio.coin();
      }
      this.showBanner(T.ZONES[z].name, sub);
    }

    // ---- ways a run can end ----
    // upside down and resting on the roof
    if (Math.cos(car.a) < 0 && car.roofContact) r.flipTimer += dt;
    else r.flipTimer = Math.max(0, r.flipTimer - dt);
    if (r.flipTimer > 1.5) return this.end('flipped');
    if (r.hull <= 0) { r.hull = 0; return this.end('wrecked'); }
    for (const g of T.gaps) {
      if (car.x > g.x0 - 1 && car.x < g.x1 + 1 && car.y < g.lip - 8) return this.end('trench');
    }
    if (car.x >= T.LENGTH) return this.end('finish');
    if (r.fuel <= 0) {
      r.noFuelTimer += dt;
      if ((speed < 0.7 && r.noFuelTimer > 1) || r.noFuelTimer > 10) return this.end('fuel');
    }
    if (r.time - r.lastProgressT > 10) return this.end('stuck');
  },

  // Things that fade over time (also run after the run has ended).
  effects(dt) {
    const r = this.run;
    r.shake = Math.max(0, r.shake - dt * 2.5);
    for (let i = r.popups.length - 1; i >= 0; i--) { r.popups[i].t -= dt; if (r.popups[i].t <= 0) r.popups.splice(i, 1); }
    if (r.banner) r.banner.t -= dt;
    SW.Particles.update(dt);
  },

  END_TEXT: {
    fuel:    ['Out of fuel', 'The engine coughs, sputters, and the salt goes quiet. Wren hikes back to the boatyard.'],
    wrecked: ['Wrecked', 'The hull gives up with a groan of popping rivets.'],
    flipped: ['Flipped', 'Wheels to the sky. The Salt Choir will be picking at that one by nightfall.'],
    trench:  ['Lost to the Trench', 'The deep swallowed another boat. Wren scrambles up the wall, Pearl still in hand.'],
    stuck:   ['Stranded', 'Going nowhere. Time to head back and rethink.'],
    quit:    ['Turned back', 'Discretion, valour, etc.'],
    finish:  ['The Last Lighthouse!', 'Wren climbs the tower and sets the Tide Pearl in the lamp. The beam turns blue... and far out in the dark, the sea begins to come home.'],
  },

  // The run is over: work out the cash, save, and tell main.js.
  end(reason) {
    const r = this.run, save = SW.Save.data;
    if (r.ended) return;
    r.ended = true; r.endReason = reason; r.boosting = false;
    const distance = Math.floor(r.maxX);
    const cash = {
      distance: Math.floor(distance * this.CASH_PER_METRE),
      bounty: r.bounty, smash: r.smashCash, air: r.airCash, zone: r.zoneBonus,
      finish: reason === 'finish' ? this.FINISH_BONUS : 0,
    };
    const total = cash.distance + cash.bounty + cash.smash + cash.air + cash.zone + cash.finish;
    const newBest = distance > save.best;

    save.cash += total;
    save.totalEarned += total;
    save.runs++;
    save.best = Math.max(save.best, distance);
    save.zoneReached = Math.max(save.zoneReached, r.zone);
    const firstFinish = reason === 'finish' && !save.finished;
    if (reason === 'finish') save.finished = true;
    SW.Save.save();

    r.summary = {
      reason, title: this.END_TEXT[reason][0], flavour: this.END_TEXT[reason][1],
      distance, newBest, best: save.best, time: r.time,
      enemiesHit: r.enemiesHit, kills: r.kills, harpooned: r.harpooned, smashed: r.smashed,
      airTime: r.airTime, bestAir: r.bestAir, cash, total, firstFinish,
    };
    SW.Audio.stopLoops();
    if (reason === 'finish') SW.Audio.fanfare();
    else if (reason !== 'fuel' && reason !== 'quit') SW.Audio.impact(0.8);
    return r.summary;
  },
};
