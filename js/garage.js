// garage.js: "The Boatyard" between runs. Spend cash on upgrades and new vehicles.
// Upgrades are parts you bolt on, so they carry over when you switch vehicles.

SW.Garage = {
  init() {
    this.el = {
      cash: document.getElementById('g-cash'),
      best: document.getElementById('g-best'),
      bestBar: document.getElementById('g-best-bar'),
      upgrades: document.getElementById('g-upgrades'),
      vehicles: document.getElementById('g-vehicles'),
      stats: document.getElementById('g-stats'),
    };
    this.preview = document.getElementById('preview').getContext('2d');

    // One row per upgrade track: name, description, level pips and a buy button.
    this.rows = {};
    for (const tr of SW.Vehicles.TRACKS) {
      const row = document.createElement('div');
      row.className = 'upgrade';
      row.innerHTML = `
        <div class="name">${tr.name} <span class="lvl"></span></div>
        <button></button>
        <div class="desc">${tr.desc}</div>
        <div class="pips">${'<div class="pip"></div>'.repeat(5)}</div>`;
      row.querySelector('button').addEventListener('click', () => this.buy(tr.id));
      this.el.upgrades.appendChild(row);
      this.rows[tr.id] = row;
    }

    // The "max" stats (best vehicle, everything level 5) so the bars have something to compare to.
    const maxUp = { engine: 5, tyres: 5, fuel: 5, boost: 5, armour: 5, ram: 5 };
    const all = SW.Vehicles.ORDER.map((id) => SW.Vehicles.computeStats(id, maxUp));
    this.max = {};
    for (const k of ['torque', 'topSpeed', 'grip', 'fuelMax', 'boostMax', 'hullMax']) this.max[k] = Math.max(...all.map((s) => s[k]));
  },

  track(id) { return SW.Vehicles.TRACKS.find((t) => t.id === id); },

  // Price of the next level, or null if maxed out.
  price(id) {
    const L = SW.Save.data.upgrades[id];
    return L >= 5 ? null : this.track(id).prices[L];
  },

  buy(id) {
    const save = SW.Save.data, cost = this.price(id);
    if (cost === null || save.cash < cost) { SW.Audio.denied(); return false; }
    save.cash -= cost;
    save.upgrades[id]++;
    SW.Save.save();
    SW.Audio.buy();
    this.refresh();
    return true;
  },

  // Click a vehicle card: switch to it if owned, otherwise try to buy it.
  vehicleClick(id) {
    const save = SW.Save.data, def = SW.Vehicles.DEFS[id];
    if (!save.owned.includes(id)) {
      if (save.cash < def.price) { SW.Audio.denied(); return false; }
      save.cash -= def.price;
      save.owned.push(id);
      SW.Audio.buy();
    } else SW.Audio.click();
    save.vehicle = id;
    SW.Save.save();
    this.refresh();
    return true;
  },

  refresh() {
    const save = SW.Save.data, U = SW.util;
    this.el.cash.textContent = U.money(save.cash);
    this.el.best.textContent = U.money(save.best);
    this.el.bestBar.style.width = Math.min(100, save.best / SW.Terrain.LENGTH * 100) + '%';
    document.getElementById('g-length').textContent = SW.Terrain.LENGTH;

    for (const tr of SW.Vehicles.TRACKS) {
      const row = this.rows[tr.id], L = save.upgrades[tr.id], cost = this.price(tr.id);
      row.querySelector('.lvl').textContent = `· ${tr.levels[L]}`;
      row.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('on', i < L));
      const btn = row.querySelector('button');
      btn.textContent = cost === null ? 'MAX' : '$' + U.money(cost);
      btn.disabled = cost === null;
      btn.classList.toggle('cant', cost !== null && save.cash < cost);
    }

    // vehicle cards
    this.el.vehicles.innerHTML = '';
    for (const id of SW.Vehicles.ORDER) {
      const def = SW.Vehicles.DEFS[id], owned = save.owned.includes(id);
      const card = document.createElement('button');
      card.className = 'vehicle-card' + (save.vehicle === id ? ' selected' : '');
      card.innerHTML = `<b>${def.name}</b><span class="tag">${owned ? (save.vehicle === id ? 'Driving' : 'Owned · tap to drive') : '$' + U.money(def.price)}</span>`;
      card.title = def.blurb;
      card.addEventListener('click', () => this.vehicleClick(id));
      this.el.vehicles.appendChild(card);
    }

    // stat bars for the current vehicle
    const st = SW.Vehicles.computeStats(save.vehicle, save.upgrades);
    this.stats = st;
    const rows = [
      ['Power', st.torque / this.max.torque], ['Top speed', st.topSpeed / this.max.topSpeed],
      ['Grip', st.grip / this.max.grip], ['Fuel', st.fuelMax / st.fuelUse / (this.max.fuelMax / 0.78)],
      ['Boost', st.boostMax / this.max.boostMax], ['Hull', st.hullMax / this.max.hullMax],
    ];
    this.el.stats.innerHTML = `<div style="grid-column:1/-1;font-style:italic;color:#5d4f5a">${SW.Vehicles.DEFS[save.vehicle].blurb}</div>` +
      rows.map(([n, f]) => `<span>${n}</span><div class="stat-bar"><div style="width:${Math.round(Math.min(1, f) * 100)}%"></div></div>`).join('');

    // a pretend car resting on its springs, for the preview picture
    const car = SW.Physics.createCar(st, 0, 0);
    for (const wh of car.wheels) wh.comp = st.mass * SW.Physics.GRAVITY / car.wheels.length / st.spring;
    car.aim = 0.15;
    this.previewCar = car;
  },

  // Draw the current vehicle (with all its upgrades) on the little preview canvas.
  drawPreview(time) {
    const ctx = this.preview, car = this.previewCar;
    if (!car) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const wh = car.wheels[0];
    const groundY = wh.ly - wh.len + wh.comp - wh.r;     // car-local height of the tyre bottoms
    const s = 52;                                        // pixels per metre
    ctx.fillStyle = '#e4d3b2'; ctx.fillRect(0, H * 0.78, W, H);
    ctx.fillStyle = '#2a2030'; ctx.fillRect(0, H * 0.78 - 2, W, 3);
    ctx.fillStyle = 'rgba(42,32,48,0.18)';
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.78 + 4, s * car.stats.length * 0.55, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.setTransform(s, 0, 0, -s, W / 2, H * 0.78 + groundY * s);
    for (const w of car.wheels) w.rot = time * 1.5;
    SW.Vehicles.draw(ctx, car, 1 / s, time);
  },
};
