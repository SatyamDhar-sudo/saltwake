// vehicles.js: the three boats-on-wheels, the six upgrade tracks,
// how upgrades change the numbers, and how each vehicle is drawn (upgrades included).
//
// All shapes are in metres, in the car's own coordinate system:
// x points to the nose, y points up, (0, 0) is the centre of mass.

SW.Vehicles = {
  DEFS: {
    dinghy: {
      name: 'The Dinghy', price: 0,
      blurb: 'A leaky rowing boat with an outboard and a prayer.',
      mass: 420, length: 3.6,
      wheels: [{ x: -1.15, y: -0.25, drive: true }, { x: 1.2, y: -0.25, drive: false }],
      susLen: 0.5, spring: 12500, damp: 1300, wheelR: 0.42,
      torque: 650, topSpeed: 12.5, grip: 1.0,
      hull: 120, fuelUse: 1.0, boostThrust: 9, boostCap: 1.0,
      airLean: 5.5, groundLean: 2.0, reaction: 0.5,
      hullShape: [[-1.8, 0.35], [1.45, 0.35], [1.95, 0.6], [1.55, 0.0], [1.05, -0.35], [-1.5, -0.35], [-1.8, -0.05]],
      roofPoints: [[-0.35, 1.38], [1.2, 1.15]],
      capsule: { ax: -1.5, ay: 0.15, bx: 1.6, by: 0.25, r: 0.55 },
      anchors: { engine: [-1.85, 0.2], barrels: [0.35, 0.35], tanks: [-1.25, 0.35], turret: [0.9, 0.35],
                 bow: [1.75, 0.2], driver: [-0.35, 0.35], lantern: [1.2, 0.35] },
      colors: { hull: '#3d8c95', stripe: '#f1dfb4', deck: '#8a6a4d' },
    },
    trawler: {
      name: 'The Trawler', price: 6000,
      blurb: 'A rust-red fishing boat on truck axles. Four-wheel drive, heavy, unstoppable.',
      mass: 640, length: 4.5,
      wheels: [{ x: -1.45, y: -0.3, drive: true }, { x: 1.5, y: -0.3, drive: true }],
      susLen: 0.6, spring: 17500, damp: 2000, wheelR: 0.5,
      torque: 1250, topSpeed: 16, grip: 1.12,
      hull: 170, fuelUse: 0.85, boostThrust: 10, boostCap: 1.1,
      airLean: 4.8, groundLean: 1.8, reaction: 0.45,
      hullShape: [[-2.25, 0.45], [1.9, 0.5], [2.4, 0.85], [2.0, 0.0], [1.4, -0.4], [-1.9, -0.4], [-2.25, -0.05]],
      roofPoints: [[-1.35, 1.65], [0.25, 1.65], [0.95, 2.15]],
      capsule: { ax: -1.9, ay: 0.3, bx: 2.0, by: 0.35, r: 0.75 },
      anchors: { engine: [-2.3, 0.25], barrels: [0.65, 0.5], tanks: [-1.85, 0.45], turret: [1.45, 0.5],
                 bow: [2.15, 0.3], driver: [-0.55, 0.75], lantern: [0.95, 0.5] },
      colors: { hull: '#b5523b', stripe: '#f4ead6', deck: '#6b4a37' },
    },
    hydrofoil: {
      name: 'The Hydrofoil', price: 18000,
      blurb: 'A pre-drain racing hydrofoil. Light, fast, hungry for boost.',
      mass: 470, length: 4.3,
      wheels: [{ x: -1.45, y: -0.2, drive: true }, { x: 1.55, y: -0.2, drive: true }],
      susLen: 0.55, spring: 14000, damp: 1500, wheelR: 0.46,
      torque: 1150, topSpeed: 21, grip: 1.28,
      hull: 140, fuelUse: 0.72, boostThrust: 13, boostCap: 1.35,
      airLean: 6.5, groundLean: 2.2, reaction: 0.4,
      hullShape: [[-2.15, 0.3], [0.6, 0.38], [2.3, 0.15], [2.0, -0.1], [1.5, -0.25], [-1.9, -0.25], [-2.15, 0.0]],
      roofPoints: [[-0.15, 0.98], [-1.8, 1.05]],
      capsule: { ax: -1.9, ay: 0.15, bx: 2.0, by: 0.1, r: 0.5 },
      anchors: { engine: [-2.2, 0.15], barrels: [0.85, 0.33], tanks: [-1.45, 0.3], turret: [1.3, 0.3],
                 bow: [2.1, 0.05], driver: [-0.15, 0.4], lantern: [0.6, 0.38] },
      colors: { hull: '#ece4d0', stripe: '#e2674f', deck: '#3b6f8f' },
    },
  },

  ORDER: ['dinghy', 'trawler', 'hydrofoil'],

  // The six upgrade tracks. Each has 5 levels; prices rise steeply.
  TRACKS: [
    { id: 'engine', name: 'Outboard Engine', desc: 'More torque and a higher top speed.',
      prices: [300, 800, 1700, 3300, 6000],
      levels: ['Rusty two-stroke', 'Rebored', 'Twin carbs', 'Brass V-twin', 'Steam-diesel', 'Leviathan'] },
    { id: 'tyres', name: 'Salt Tyres', desc: 'Bigger, knobblier wheels that grip steep dunes.',
      prices: [200, 550, 1200, 2500, 4500],
      levels: ['Bald', 'Retreaded', 'Knobbly', 'Dune paddles', 'Brass-rim crawlers', 'Reef grippers'] },
    { id: 'fuel', name: 'Fuel Barrels', desc: 'Strap on more barrels and drive for longer.',
      prices: [250, 650, 1400, 2800, 5000],
      levels: ['One jerrycan', '+1 barrel', 'Big barrel', '+2 barrels', 'Big barrels', 'Whole fuel dump'] },
    { id: 'boost', name: 'Steam Boost', desc: 'Bigger steam tanks and a stronger blast.',
      prices: [200, 500, 1100, 2400, 4400],
      levels: ['Tea kettle', 'Canister', 'Whistle tank', 'Twin tanks', 'Pressure drums', 'Golden whistle'] },
    { id: 'armour', name: 'Hull Plating', desc: 'More hull, less damage, softer hits.',
      prices: [150, 450, 1000, 2100, 3900],
      levels: ['Bare planks', 'Patch plates', 'Riveted belt', 'Full belt', 'Bow armour', 'Spiked keel'] },
    { id: 'ram', name: 'Ram & Harpoon', desc: 'Lv1-2: iron bow ram. Lv3-5: auto-firing harpoon gun.',
      prices: [300, 800, 1800, 3500, 6500],
      levels: ['Nothing', 'Iron prow', 'Spiked ram', 'Harpoon gun', 'Fast harpoon', 'Twin harpoons'] },
  ],

  // Turn a vehicle + upgrade levels into the numbers the physics uses.
  computeStats(id, up) {
    const d = this.DEFS[id];
    const ramReduce = [0, 0.25, 0.4, 0.42, 0.45, 0.5][up.ram];
    const hullPoints = d.hullShape.map(([x, y]) => ({ x, y }))
      .concat(d.roofPoints.map(([x, y]) => ({ x, y, roof: true })));
    return {
      id, def: d, upgrades: Object.assign({}, up),
      mass: d.mass, length: d.length, wheels: d.wheels,
      driveCount: d.wheels.filter((w) => w.drive).length,
      susLen: d.susLen, spring: d.spring, damp: d.damp,
      wheelR: d.wheelR + 0.035 * up.tyres,
      wheelInertia: 0.5 * 25 * d.wheelR * d.wheelR,
      grip: d.grip * (1 + 0.12 * up.tyres),
      torque: d.torque * (1 + 0.22 * up.engine),
      topSpeed: d.topSpeed * (1 + 0.11 * up.engine),
      brakeTorque: d.torque * 1.5,
      reaction: d.reaction,
      airLean: d.airLean, groundLean: d.groundLean,
      drag: 0.0022,
      fuelMax: 100 + 32 * up.fuel,
      fuelUse: d.fuelUse,
      boostMax: (2.0 + 1.1 * up.boost) * d.boostCap,          // seconds of boost
      boostThrust: d.boostThrust * (1 + 0.08 * up.boost),     // m/s² of extra push
      hullMax: Math.round(d.hull * (1 + 0.3 * up.armour)),
      armourReduce: 0.07 * up.armour,                          // fraction of damage ignored
      impactReduce: Math.min(0.65, 0.04 * up.armour + ramReduce), // fraction of slow-down ignored
      ramLevel: up.ram,
      smashBonus: [0, 2, 4, 4.5, 5, 5.5][up.ram],              // smash obstacles at lower speed
      harpoon: up.ram >= 3 ? { cooldown: [0, 0, 0, 1.6, 1.0, 0.75][up.ram], twin: up.ram >= 5 } : null,
      hullPoints, capsule: d.capsule, anchors: d.anchors,
    };
  },

  // Car-local point -> world point.
  toWorld(car, lx, ly) {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    return { x: car.x + lx * c - ly * s, y: car.y + lx * s + ly * c };
  },

  // ==================================================================
  // DRAWING. ctx is already moved/rotated so (0,0) is the car's centre,
  // 1 unit = 1 metre, y up. px = the size of one screen pixel in metres.
  // ==================================================================
  INK: '#2a2030',

  draw(ctx, car, px, time) {
    const st = car.stats, d = st.def, u = st.upgrades, A = d.anchors;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const line = 2.2 * px;

    // Suspension struts (behind everything)
    for (const wh of car.wheels) {
      const wy = wh.ly - wh.len + wh.comp;
      ctx.strokeStyle = '#4b4552'; ctx.lineWidth = 0.13;
      ctx.beginPath(); ctx.moveTo(wh.lx, wh.ly + 0.05); ctx.lineTo(wh.lx, wy); ctx.stroke();
      this.drawSpring(ctx, wh.lx, wh.ly, wy, px);
    }

    this.drawTanks(ctx, A.tanks, u.boost, line);
    this.drawEngine(ctx, A.engine, u.engine, line, time);

    // The hull
    this.hullPath(ctx, d);
    ctx.fillStyle = d.colors.hull; ctx.fill();
    // stripe + plank lines, clipped to the hull shape
    ctx.save(); this.hullPath(ctx, d); ctx.clip();
    ctx.fillStyle = d.colors.stripe;
    ctx.fillRect(-3, d.hullShape[0][1] - 0.16, 6, 0.1);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.2 * px;
    for (let y = -0.3; y < 0.3; y += 0.18) { ctx.beginPath(); ctx.moveTo(-3, y); ctx.lineTo(3, y); ctx.stroke(); }
    this.drawArmour(ctx, d, u.armour, px);
    ctx.restore();
    this.hullPath(ctx, d);
    ctx.strokeStyle = this.INK; ctx.lineWidth = line; ctx.stroke();
    if (u.armour >= 5) this.drawKeelSpikes(ctx, d, line);

    // Vehicle-specific top half (cabin, canopy, driver)
    if (st.id === 'dinghy') this.drawDinghyTop(ctx, A, line, time);
    if (st.id === 'trawler') this.drawTrawlerTop(ctx, A, line, time);
    if (st.id === 'hydrofoil') this.drawHydroTop(ctx, A, line, time);

    this.drawBarrels(ctx, A.barrels, u.fuel, line);
    this.drawRam(ctx, A.bow, u.ram, line);
    if (u.ram >= 3) this.drawTurret(ctx, A.turret, u.ram, line, car.aim || 0.1);
    this.drawLantern(ctx, A.lantern, line, time);

    // Wheels in front
    for (const wh of car.wheels) this.drawWheel(ctx, wh.lx, wh.ly - wh.len + wh.comp, wh.r, wh.rot, u.tyres, line);
  },

  hullPath(ctx, d) {
    const p = d.hullShape;
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
  },

  drawSpring(ctx, x, top, bottom, px) {
    ctx.strokeStyle = '#c9c2b6'; ctx.lineWidth = 2 * px;
    ctx.beginPath();
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const y = top + (bottom - top) * (i / n) * 0.8;
      ctx.lineTo(x + (i % 2 ? 0.1 : -0.1), y);
    }
    ctx.stroke();
  },

  drawWheel(ctx, x, y, r, rot, level, line) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-rot);                       // positive spin = rolling forward = clockwise
    // tread knobs: more and chunkier with tyre upgrades
    const knobs = 8 + level * 2;
    ctx.fillStyle = this.INK;
    for (let i = 0; i < knobs; i++) {
      const a = (i / knobs) * Math.PI * 2;
      ctx.save(); ctx.rotate(a);
      ctx.fillRect(r - 0.04, -0.06 - level * 0.006, 0.07 + level * 0.012, 0.12 + level * 0.012);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#3a3440'; ctx.fill();
    ctx.lineWidth = line; ctx.strokeStyle = this.INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = level >= 3 ? '#e9b04a' : '#c8c0b0'; ctx.fill(); ctx.stroke();
    ctx.lineWidth = r * 0.12;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = this.INK; ctx.fill();
    ctx.restore();
  },

  // Outboard engine bolted to the stern. Grows and changes colour with each level.
  drawEngine(ctx, [x, y], L, line, time) {
    const w = 0.32 + 0.05 * L, h = 0.55 + 0.07 * L;
    const col = ['#8d8f96', '#6f8fa8', '#6f8fa8', '#c99a3b', '#c99a3b', '#d24e3a'][L];
    ctx.lineWidth = line; ctx.strokeStyle = this.INK;
    // leg and propeller
    ctx.fillStyle = '#55505e';
    ctx.fillRect(x - 0.06, y - 0.65, 0.12, 0.7); ctx.strokeRect(x - 0.06, y - 0.65, 0.12, 0.7);
    const spin = time * 30;
    ctx.beginPath(); ctx.ellipse(x - 0.05, y - 0.62, 0.05, 0.18 * Math.abs(Math.cos(spin)) + 0.03, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c8c0b0'; ctx.fill(); ctx.stroke();
    // exhaust stacks
    const stacks = L >= 4 ? 2 : L >= 2 ? 1 : 0;
    for (let i = 0; i < stacks; i++) {
      const sx = x - w / 2 + 0.08 + i * 0.16;
      ctx.fillStyle = '#4b4552';
      ctx.fillRect(sx, y + h - 0.1, 0.09, 0.35); ctx.strokeRect(sx, y + h - 0.1, 0.09, 0.35);
    }
    // engine cowl
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, h, 0.08);
    ctx.fillStyle = col; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - w / 2 + 0.05, y + h * 0.55, w - 0.1, 0.06);
  },

  // Fuel barrels strapped to the deck.
  drawBarrels(ctx, [x, y], L, line) {
    const count = [0, 1, 1, 2, 2, 3][L];
    const big = L === 2 || L >= 4;
    const bw = big ? 0.36 : 0.3, bh = big ? 0.5 : 0.42;
    ctx.lineWidth = line; ctx.strokeStyle = this.INK;
    for (let i = 0; i < count; i++) {
      const bx = x - i * (bw + 0.04), by = i === 2 ? y + bh : y;
      const cx = i === 2 ? x - (bw + 0.04) / 2 : bx;
      ctx.beginPath(); ctx.roundRect(cx - bw / 2, by, bw, bh, 0.06);
      ctx.fillStyle = '#d0583a'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8e3a28';
      ctx.fillRect(cx - bw / 2, by + bh * 0.28, bw, 0.05);
      ctx.fillRect(cx - bw / 2, by + bh * 0.68, bw, 0.05);
    }
  },

  // Steam tanks for the boost. Bigger and more of them with each level.
  drawTanks(ctx, [x, y], L, line) {
    const count = L >= 5 ? 3 : L >= 3 ? 2 : 1;
    const r = 0.11 + 0.025 * Math.min(L, 4);
    const len = 0.5 + 0.08 * L;
    ctx.lineWidth = line; ctx.strokeStyle = this.INK;
    for (let i = 0; i < count; i++) {
      const ty = y + r + i * (r * 2 + 0.02);
      ctx.beginPath(); ctx.roundRect(x - len / 2, ty - r, len, r * 2, r);
      ctx.fillStyle = L >= 5 ? '#e9b04a' : '#9fb7bd'; ctx.fill(); ctx.stroke();
      // nozzle pointing backwards
      ctx.fillStyle = '#4b4552';
      ctx.beginPath(); ctx.moveTo(x - len / 2, ty - r * 0.5); ctx.lineTo(x - len / 2 - 0.16, ty - r * 0.8);
      ctx.lineTo(x - len / 2 - 0.16, ty + r * 0.8); ctx.lineTo(x - len / 2, ty + r * 0.5); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (L >= 2) {   // the steam whistle
      const top = y + count * (r * 2 + 0.02);
      ctx.fillStyle = L >= 5 ? '#ffd66b' : '#c99a3b';
      ctx.fillRect(x - 0.04, top, 0.08, 0.22 + 0.04 * L); ctx.strokeRect(x - 0.04, top, 0.08, 0.22 + 0.04 * L);
    }
  },

  // Riveted grey plates over the lower hull (already clipped to the hull shape).
  drawArmour(ctx, d, L, px) {
    if (L === 0) return;
    const xs = d.hullShape.map((p) => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const ys = d.hullShape.map((p) => p[1]);
    const bottom = Math.min(...ys), top = Math.max(...ys);
    const plateTop = L >= 3 ? bottom + (top - bottom) * 0.62 : bottom + (top - bottom) * 0.42;
    const span = maxX - minX;
    const plates = L === 1 ? [0.25, 0.55] : L === 2 ? [0.1, 0.32, 0.54, 0.76] : null;
    ctx.fillStyle = '#7d8590'; ctx.strokeStyle = '#3d424a'; ctx.lineWidth = 1.5 * px;
    if (plates) {
      for (const f of plates) {
        ctx.fillRect(minX + span * f, bottom - 0.1, span * 0.18, plateTop - bottom + 0.1);
        ctx.strokeRect(minX + span * f, bottom - 0.1, span * 0.18, plateTop - bottom + 0.1);
      }
    } else {
      ctx.fillRect(minX - 0.1, bottom - 0.1, span + 0.2, plateTop - bottom + 0.1);
      for (let x = minX; x < maxX; x += span / 6) { ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, plateTop); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(minX, plateTop); ctx.lineTo(maxX, plateTop); ctx.stroke();
    }
    if (L >= 4) {   // bow armour
      ctx.fillRect(maxX - span * 0.22, bottom - 0.1, span * 0.3, top - bottom + 0.3);
    }
    // rivets
    ctx.fillStyle = '#d7dadf';
    for (let x = minX + 0.1; x < maxX; x += 0.22) {
      ctx.beginPath(); ctx.arc(x, plateTop - 0.07, 0.025, 0, Math.PI * 2); ctx.fill();
    }
  },

  drawKeelSpikes(ctx, d, line) {
    const ys = d.hullShape.map((p) => p[1]), bottom = Math.min(...ys);
    ctx.fillStyle = '#c8c0b0'; ctx.strokeStyle = this.INK; ctx.lineWidth = line;
    for (let x = -1.3; x <= 1.0; x += 0.45) {
      ctx.beginPath(); ctx.moveTo(x - 0.1, bottom + 0.02); ctx.lineTo(x, bottom - 0.2); ctx.lineTo(x + 0.1, bottom + 0.02);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },

  // The bow ram: an iron cap, then a long spiked ram.
  drawRam(ctx, [x, y], L, line) {
    if (L === 0) return;
    const len = L === 1 ? 0.45 : 0.8;
    ctx.lineWidth = line; ctx.strokeStyle = this.INK; ctx.fillStyle = '#6d727b';
    ctx.beginPath();
    ctx.moveTo(x - 0.25, y + 0.32); ctx.lineTo(x + len, y); ctx.lineTo(x - 0.25, y - 0.32);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (L >= 2) {   // teeth
      ctx.fillStyle = '#c8c0b0';
      for (let i = 0; i < 3; i++) {
        const tx = x + i * 0.22;
        ctx.beginPath(); ctx.moveTo(tx, y + 0.22 - i * 0.07); ctx.lineTo(tx + 0.12, y + 0.36 - i * 0.07); ctx.lineTo(tx + 0.16, y + 0.17 - i * 0.07);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
  },

  // Harpoon gun on the deck. aim = barrel angle (car-local).
  drawTurret(ctx, [x, y], L, line, aim) {
    ctx.lineWidth = line; ctx.strokeStyle = this.INK;
    ctx.fillStyle = '#4b4552';
    ctx.beginPath(); ctx.arc(x, y + 0.02, 0.22, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(x, y + 0.18); ctx.rotate(aim);
    const len = L >= 4 ? 0.95 : 0.75;
    const barrels = L >= 5 ? [-0.06, 0.06] : [0];
    for (const o of barrels) {
      ctx.fillStyle = '#8d8f96';
      ctx.fillRect(0, o - 0.05, len, 0.1); ctx.strokeRect(0, o - 0.05, len, 0.1);
      ctx.fillStyle = '#e9b04a';
      ctx.beginPath(); ctx.moveTo(len, o - 0.07); ctx.lineTo(len + 0.18, o); ctx.lineTo(len, o + 0.07); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (L >= 4) { ctx.fillStyle = '#6d727b'; ctx.beginPath(); ctx.arc(0.1, -0.12, 0.12, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  },

  // A pole with a little cage holding the glowing Tide Pearl.
  drawLantern(ctx, [x, y], line, time) {
    ctx.strokeStyle = this.INK; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 0.65); ctx.stroke();
    const py = y + 0.78, glow = 0.32 + 0.05 * Math.sin(time * 3);
    const g = ctx.createRadialGradient(x, py, 0.02, x, py, glow);
    g.addColorStop(0, 'rgba(160,255,240,0.9)'); g.addColorStop(1, 'rgba(160,255,240,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, py, glow, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, py, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#bff8ee'; ctx.fill();
    ctx.lineWidth = line; ctx.stroke();
  },

  // Wren, the driver: a red coat, goggles and a long scarf flapping in the wind.
  drawDriver(ctx, x, y, line, time, scale) {
    const k = scale || 1;
    ctx.lineWidth = line; ctx.strokeStyle = this.INK;
    // scarf
    ctx.strokeStyle = '#e2674f'; ctx.lineWidth = 0.09 * k;
    ctx.beginPath(); ctx.moveTo(x, y + 0.6 * k);
    for (let i = 1; i <= 4; i++) ctx.lineTo(x - i * 0.17 * k, y + 0.6 * k + Math.sin(time * 9 + i) * 0.06 * k - i * 0.02);
    ctx.stroke();
    ctx.strokeStyle = this.INK; ctx.lineWidth = line;
    // body
    ctx.beginPath(); ctx.roundRect(x - 0.17 * k, y, 0.34 * k, 0.55 * k, 0.12 * k);
    ctx.fillStyle = '#c9553f'; ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(x, y + 0.8 * k, 0.21 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c9a0'; ctx.fill(); ctx.stroke();
    // hair + goggles
    ctx.fillStyle = '#3b2a2a';
    ctx.beginPath(); ctx.arc(x - 0.03 * k, y + 0.86 * k, 0.2 * k, Math.PI * 0.1, Math.PI * 1.05); ctx.fill();
    ctx.fillStyle = '#7fd3e0';
    ctx.beginPath(); ctx.roundRect(x + 0.02 * k, y + 0.78 * k, 0.2 * k, 0.1 * k, 0.04 * k); ctx.fill(); ctx.stroke();
  },

  drawDinghyTop(ctx, A, line, time) {
    // an oar lashed along the side, a wooden bench seat, then Wren
    ctx.strokeStyle = '#8a6a4d'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(-1.5, 0.45); ctx.lineTo(0.9, 0.55); ctx.stroke();
    ctx.fillStyle = '#8a6a4d'; ctx.strokeStyle = this.INK; ctx.lineWidth = line;
    ctx.fillRect(-0.7, 0.3, 0.8, 0.1); ctx.strokeRect(-0.7, 0.3, 0.8, 0.1);
    this.drawDriver(ctx, A.driver[0], A.driver[1], line, time);
  },

  drawTrawlerTop(ctx, A, line, time) {
    ctx.strokeStyle = this.INK; ctx.lineWidth = line;
    // mast with a scrap of sail
    ctx.fillStyle = '#6b4a37';
    ctx.fillRect(0.9, 0.5, 0.09, 1.65); ctx.strokeRect(0.9, 0.5, 0.09, 1.65);
    ctx.beginPath(); ctx.moveTo(0.99, 2.05); ctx.lineTo(1.75, 1.6 + Math.sin(time * 4) * 0.05); ctx.lineTo(0.99, 1.25); ctx.closePath();
    ctx.fillStyle = '#e8d9b8'; ctx.fill(); ctx.stroke();
    // wheelhouse (Wren peeks out of the window)
    ctx.beginPath();
    ctx.moveTo(-1.3, 0.45); ctx.lineTo(-1.3, 1.5); ctx.lineTo(0.25, 1.5); ctx.lineTo(0.2, 0.45);
    ctx.fillStyle = 'rgba(244,234,214,1)'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7fb9c4';
    ctx.fillRect(-0.95, 0.85, 0.8, 0.45); ctx.strokeRect(-0.95, 0.85, 0.8, 0.45);
    this.drawDriverHead(ctx, A.driver[0], A.driver[1] + 0.48, line);
    ctx.fillStyle = '#b5523b';
    ctx.fillRect(-1.4, 1.5, 1.75, 0.12); ctx.strokeRect(-1.4, 1.5, 1.75, 0.12);
  },

  drawDriverHead(ctx, x, y, line) {
    ctx.lineWidth = line; ctx.strokeStyle = this.INK;
    ctx.beginPath(); ctx.arc(x, y, 0.17, 0, Math.PI * 2); ctx.fillStyle = '#f0c9a0'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7fd3e0'; ctx.fillRect(x + 0.02, y, 0.16, 0.07);
  },

  drawHydroTop(ctx, A, line, time) {
    ctx.strokeStyle = this.INK; ctx.lineWidth = line;
    // tail fin
    ctx.beginPath(); ctx.moveTo(-2.1, 0.3); ctx.lineTo(-1.85, 1.05); ctx.lineTo(-1.5, 1.05); ctx.lineTo(-1.45, 0.32); ctx.closePath();
    ctx.fillStyle = '#e2674f'; ctx.fill(); ctx.stroke();
    // foil struts down towards the wheels
    ctx.strokeStyle = '#3b6f8f'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(-1.0, -0.2); ctx.lineTo(-1.35, -0.45); ctx.moveTo(1.1, -0.2); ctx.lineTo(1.45, -0.45); ctx.stroke();
    // Wren + glass canopy
    this.drawDriver(ctx, A.driver[0], A.driver[1] - 0.2, line, time, 0.85);
    ctx.beginPath(); ctx.ellipse(-0.1, 0.4, 0.85, 0.55, 0, 0, Math.PI);
    ctx.fillStyle = 'rgba(127,211,224,0.45)'; ctx.fill();
    ctx.strokeStyle = this.INK; ctx.lineWidth = line; ctx.stroke();
  },
};
