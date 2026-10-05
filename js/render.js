// render.js: draws everything you see on the canvas each frame:
// the sky (shifting from noon to dusk as you travel), five parallax background layers,
// the terrain, decorations, obstacles, fuel cans, enemies, the car, particles and the HUD.
//
// World space is in metres with y pointing UP. Screen space is in CSS pixels with y DOWN.

SW.Render = {
  camX: 30, camY: 3, zoom: 16, scale: 40,
  shakeX: 0, shakeY: 0,

  // Sky colours at different points of the journey (0 = start, 1 = lighthouse).
  SKY: [
    { t: 0.00, top: '#69c2d6', bottom: '#f6ecd3', sun: '#fff6d8', shadow: '#9a8aa0', tint: '#000000', tintA: 0 },
    { t: 0.30, top: '#5aa7cc', bottom: '#f7e0b0', sun: '#ffeaa8', shadow: '#8d7a98', tint: '#ff9a40', tintA: 0.04 },
    { t: 0.55, top: '#5279b0', bottom: '#f7b47a', sun: '#ffbf6b', shadow: '#6e5a86', tint: '#ff7a40', tintA: 0.08 },
    { t: 0.78, top: '#3b4a8a', bottom: '#f0835e', sun: '#ff8a4c', shadow: '#4c3a6e', tint: '#7a3a8a', tintA: 0.14 },
    { t: 1.00, top: '#1c1d4c', bottom: '#c3566c', sun: '#ff6a4a', shadow: '#2e2348', tint: '#3a2a6a', tintA: 0.24 },
  ],

  // Background layers, far to near. f = how fast it scrolls compared to the ground.
  LAYERS: [
    { f: 0.04, kind: 'mesa',   y: 0.52, amp: 0.17, color: '#c9a48c', haze: 0.55 },
    { f: 0.09, kind: 'ribs',   y: 0.60, amp: 0.05, color: '#d8c9b2', haze: 0.45 },
    { f: 0.17, kind: 'wrecks', y: 0.66, amp: 0.06, color: '#9c8070', haze: 0.35 },
    { f: 0.29, kind: 'coral',  y: 0.73, amp: 0.06, color: '#d39890', haze: 0.22 },
    { f: 0.48, kind: 'dunes',  y: 0.82, amp: 0.06, color: '#d6c19c', haze: 0.12 },
  ],

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    for (const k of this.SKY) for (const key of ['top', 'bottom', 'sun', 'shadow', 'tint']) k[key] = SW.util.hex(k[key]);
    for (const L of this.LAYERS) L.rgb = SW.util.hex(L.color);
    for (const z of SW.Terrain.ZONES) { z.groundRGB = SW.util.hex(z.ground); z.strataRGB = SW.util.hex(z.strata); z.crustRGB = SW.util.hex(z.crust); }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // capped for speed on high-res screens
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  },

  // Blend the sky keyframes for progress p (0..1).
  palette(p) {
    const S = this.SKY, U = SW.util;
    let i = 0;
    while (i < S.length - 2 && p > S[i + 1].t) i++;
    const a = S[i], b = S[i + 1], t = U.clamp((p - a.t) / (b.t - a.t), 0, 1);
    return {
      top: U.mix(a.top, b.top, t), bottom: U.mix(a.bottom, b.bottom, t), sun: U.mix(a.sun, b.sun, t),
      shadow: U.mix(a.shadow, b.shadow, t), tint: U.mix(a.tint, b.tint, t), tintA: U.lerp(a.tintA, b.tintA, t),
    };
  },

  // ---------------- camera ----------------
  followCar(dt, run) {
    const car = run.car, U = SW.util;
    const speed = Math.hypot(car.vx, car.vy);
    // zoom out a little as you speed up, so you can see what's coming
    this.zoom = U.lerp(this.zoom, U.clamp(13.5 + speed * 0.22, 13.5, 21), 1 - Math.exp(-dt * 1.5));
    this.scale = Math.min(this.H / this.zoom, this.W / (this.zoom * 1.25));
    const tx = car.x + U.clamp(car.vx * 0.45, -3, 8) + (this.W / this.scale) * 0.12;
    let ty = car.y + 1.5;
    if (!car.grounded) {   // in the air: look down towards where you'll land
      const ground = SW.Terrain.heightAt(car.x + car.vx * 0.5);
      ty = Math.min(ty, Math.max((car.y + ground) / 2 + 2, ground + 4));
    }
    this.camX = U.lerp(this.camX, tx, 1 - Math.exp(-dt * 5));
    this.camY = U.lerp(this.camY, ty, 1 - Math.exp(-dt * 4));
    const sh = run.shake;
    this.shakeX = (Math.random() - 0.5) * sh * 0.6;
    this.shakeY = (Math.random() - 0.5) * sh * 0.6;
  },

  // Slow drift along the shallows behind the menus.
  idleCamera(time) {
    this.zoom = 18;
    this.scale = Math.min(this.H / this.zoom, this.W / (this.zoom * 1.25));
    this.camX = 40 + (time * 3) % 700;
    this.camY = SW.util.lerp(this.camY, SW.Terrain.heightAt(this.camX) + 3, 0.05);
    this.shakeX = this.shakeY = 0;
  },

  // World -> screen (CSS pixels).
  sx(x) { return (x - this.camX - this.shakeX) * this.scale + this.W / 2; },
  sy(y) { return this.H / 2 - (y - this.camY - this.shakeY) * this.scale; },

  // ==================================================================
  // The whole frame
  // ==================================================================
  frame(run, time) {
    const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr;
    const T = SW.Terrain;
    const p = SW.util.clamp(this.camX / T.LENGTH, 0, 1);
    const pal = this.palette(p);

    // ---- screen-space background ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSky(pal, p, time);
    this.drawParallax(pal, p, time);

    // ---- world space: 1 unit = 1 metre, y up ----
    const s = this.scale;
    ctx.setTransform(s * dpr, 0, 0, -s * dpr,
      (W / 2 - (this.camX + this.shakeX) * s) * dpr, (H / 2 + (this.camY + this.shakeY) * s) * dpr);
    const px = 1 / s;
    this.viewL = this.camX - W / 2 / s - 1;
    this.viewR = this.camX + W / 2 / s + 1;
    this.viewB = this.camY - H / 2 / s - 1;
    this.viewT = this.camY + H / 2 / s + 1;

    this.drawBehindTerrain(pal, px, time);
    this.drawTerrain(pal, px);
    this.drawFinish(px, time);
    if (run) {
      this.drawObstacles(px);
      this.drawCans(px, time);
      SW.Enemies.draw(ctx, px, this.viewL, this.viewR);
      this.drawCar(run.car, px, time);
      SW.Particles.draw(ctx, px);
    }

    // ---- back to screen space ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pal.tintA > 0) { ctx.fillStyle = SW.util.rgb(pal.tint, pal.tintA); ctx.fillRect(0, 0, W, H); }
    this.drawBeam(p, time);
    if (run) this.drawHUD(run, time);
  },

  // ---------------- sky ----------------
  drawSky(pal, p, time) {
    const ctx = this.ctx, W = this.W, H = this.H, U = SW.util;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, U.rgb(pal.top)); g.addColorStop(1, U.rgb(pal.bottom));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // stars come out near the end
    if (p > 0.72) {
      ctx.fillStyle = `rgba(255,255,240,${U.smoothstep(0.72, 0.95, p) * 0.9})`;
      for (let i = 0; i < 70; i++) {
        const x = U.hash(i * 3.1) * W, y = U.hash(i * 7.7) * H * 0.45;
        const tw = 0.6 + 0.4 * Math.sin(time * 2 + i);
        ctx.fillRect(x, y, 1.5 * tw + 0.5, 1.5 * tw + 0.5);
      }
    }

    // the sun sinks as you travel west
    const sunX = W * 0.8, sunY = H * (0.13 + 0.47 * p), r = 34 + 26 * p;
    const glow = ctx.createRadialGradient(sunX, sunY, r * 0.5, sunX, sunY, r * 5);
    glow.addColorStop(0, U.rgb(pal.sun, 0.55)); glow.addColorStop(1, U.rgb(pal.sun, 0));
    ctx.fillStyle = glow; ctx.fillRect(sunX - r * 5, sunY - r * 5, r * 10, r * 10);
    ctx.fillStyle = U.rgb(pal.sun);
    ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, Math.PI * 2); ctx.fill();

    // clouds: puffy ellipses drifting slowly
    const cloud = U.mix([255, 255, 255], pal.sun, 0.25 + p * 0.5);
    ctx.fillStyle = U.rgb(cloud, 0.55);
    const off = this.camX * this.scale * 0.02 + time * 6;
    for (let i = 0; i < 7; i++) {
      const span = W + 400;
      const x = ((U.hash(i * 13.3) * span - off) % span + span) % span - 200;
      const y = H * (0.08 + U.hash(i * 5.1) * 0.25);
      const w = 60 + U.hash(i * 2.9) * 90;
      // each puff is its own shape (sharing one path would join them with thin slivers)
      ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + w * 0.35, y - w * 0.12, w * 0.45, w * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - w * 0.3, y - w * 0.08, w * 0.35, w * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    }
  },

  // ---------------- parallax background ----------------
  drawParallax(pal, p, time) {
    const ctx = this.ctx, W = this.W, H = this.H, U = SW.util;
    this.LAYERS.forEach((L, li) => {
      const offset = this.camX * this.scale * L.f;
      const lift = U.clamp(this.camY * this.scale * L.f * 0.5, -H * 0.15, H * 0.15);
      const base = H * L.y + lift;
      const color = U.mix(U.mix(L.rgb, pal.bottom, L.haze), pal.shadow, p * 0.55);
      ctx.fillStyle = U.rgb(color);
      ctx.strokeStyle = U.rgb(color);

      const ridge = (u) => this.ridge(L, li, u, base);
      // the returning sea glints on the horizon in the last stretch
      if (li === 1 && p > 0.72) {
        const a = U.smoothstep(0.72, 0.92, p);
        ctx.fillStyle = `rgba(70,120,170,${a * 0.85})`;
        ctx.fillRect(0, base - H * 0.03, W, H * 0.06);
        ctx.fillStyle = `rgba(255,220,190,${a * 0.6})`;
        for (let i = 0; i < 24; i++) {
          const x = (U.hash(i * 4.3) * W + time * 10 * (i % 3 + 1)) % W;
          ctx.fillRect(x, base - H * 0.025 + U.hash(i) * H * 0.05, 18, 1.5);
        }
        ctx.fillStyle = U.rgb(color);
      }

      // the silhouette line of this layer
      ctx.beginPath();
      ctx.moveTo(-10, H + 10);
      for (let x = -10; x <= W + 10; x += 8) ctx.lineTo(x, ridge(x + offset));
      ctx.lineTo(W + 10, H + 10);
      ctx.closePath();
      ctx.fill();

      // features standing on the silhouette
      const spacing = [0, 560, 640, 300, 420][li];
      if (!spacing) return;
      const k0 = Math.floor((offset - 300) / spacing), k1 = Math.floor((offset + W + 300) / spacing);
      for (let k = k0; k <= k1; k++) {
        const h = U.hash(k * 17.3 + li * 101);
        if (h < 0.45) continue;
        const u = k * spacing + h * spacing * 0.5;
        const x = u - offset, y = ridge(u) + 4;
        if (L.kind === 'ribs') this.drawWhale(ctx, x, y, 0.6 + h * 0.5, h > 0.7 ? 1 : -1);
        else if (L.kind === 'wrecks') this.drawWreckSilhouette(ctx, x, y, 0.8 + h * 0.5, h);
        else if (L.kind === 'coral') this.drawCoralSilhouette(ctx, x, y, 0.8 + h * 0.6, k);
        else if (L.kind === 'dunes') this.drawBoneSilhouette(ctx, x, y, 1 + h * 0.4);
      }
    });
  },

  ridge(L, li, u, base) {
    const U = SW.util, H = this.H;
    if (L.kind === 'mesa') {
      // flat-topped plateaus with steep sides
      const plateau = U.smoothstep(0.42, 0.5, U.noise(u / 300 + 11));
      return base - H * L.amp * (0.25 + 0.75 * plateau) - U.noise(u / 45) * 6;
    }
    return base - H * L.amp * (U.noise(u / 220 + li * 7) * 0.75 + U.noise(u / 70 + li * 3) * 0.25);
  },

  drawWhale(ctx, x, y, s, dir) {
    ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 120 * s * dir, y); ctx.quadraticCurveTo(x, y - 75 * s, x + 110 * s * dir, y - 10 * s); ctx.stroke();
    ctx.lineWidth = 4 * s;
    for (let i = 0; i < 7; i++) {
      const t = 0.15 + i * 0.1;
      const rx = x + (-120 + 230 * t) * s * dir, ry = y - 75 * s * 2 * t * (1 - t) * 1.6;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(rx + 25 * s * dir, ry + 30 * s, rx + 5 * s * dir, y + 2); ctx.stroke();
    }
    // skull
    ctx.beginPath(); ctx.ellipse(x + 125 * s * dir, y - 12 * s, 28 * s, 14 * s, 0.2 * dir, 0, Math.PI * 2); ctx.fill();
  },

  drawWreckSilhouette(ctx, x, y, s, h) {
    const tilt = (h - 0.7) * 0.6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-90, 0); ctx.lineTo(-80, -38); ctx.lineTo(70, -40); ctx.lineTo(105, -55); ctx.lineTo(80, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(-40, -70, 40, 32);                // wheelhouse
    ctx.fillRect(10, -130, 5, 92);                 // mast
    ctx.beginPath(); ctx.moveTo(15, -125); ctx.lineTo(55, -95); ctx.lineTo(15, -75); ctx.fill(); // torn sail
    ctx.restore();
  },

  drawCoralSilhouette(ctx, x, y, s, seed) {
    ctx.lineCap = 'round';
    const branch = (bx, by, len, ang, w, depth) => {
      const ex = bx + Math.cos(ang) * len, ey = by - Math.sin(ang) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      if (depth > 0) {
        branch(ex, ey, len * 0.7, ang + 0.45 + SW.util.hash(seed + depth) * 0.2, w * 0.7, depth - 1);
        branch(ex, ey, len * 0.7, ang - 0.45 - SW.util.hash(seed - depth) * 0.2, w * 0.7, depth - 1);
      }
    };
    branch(x, y, 45 * s, Math.PI / 2, 10 * s, 3);
  },

  drawBoneSilhouette(ctx, x, y, s) {
    ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 30 * s, y); ctx.quadraticCurveTo(x - 10 * s, y - 50 * s, x + 15 * s, y - 60 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 20 * s, y); ctx.quadraticCurveTo(x + 35 * s, y - 35 * s, x + 50 * s, y - 40 * s); ctx.stroke();
  },

  // ---------------- terrain and world decorations ----------------
  groundColor(x, key) {
    const T = SW.Terrain, z = T.zoneIndex(x), cur = T.ZONES[z];
    if (z === 0) return cur[key];
    const t = SW.util.smoothstep(cur.start - 60, cur.start + 60, x);
    return SW.util.mix(T.ZONES[z - 1][key], cur[key], t);
  },

  // Things that stand behind the ground: chasm walls, coral, ship masts, the lighthouse.
  drawBehindTerrain(pal, px, time) {
    const ctx = this.ctx, T = SW.Terrain, U = SW.util;
    // dark far walls of each chasm
    for (const g of T.gaps) {
      if (g.x1 < this.viewL || g.x0 > this.viewR) continue;
      const grad = ctx.createLinearGradient(0, g.lip, 0, g.lip - 25);
      grad.addColorStop(0, U.rgb(U.mix(this.groundColor(g.x0, 'strataRGB'), [20, 12, 30], 0.5)));
      grad.addColorStop(1, '#140c1c');
      ctx.fillStyle = grad;
      ctx.fillRect(g.x0, g.lip - 60, g.x1 - g.x0, 60.2);
    }
    // ship masts poking up from each wreck mound
    for (const w of T.wrecks) {
      if (w.x1 < this.viewL - 5 || w.x0 > this.viewR + 5) continue;
      const top = T.heightAt(w.x);
      ctx.save(); ctx.translate(w.x - 3, top - 1); ctx.rotate(0.25);
      ctx.fillStyle = '#5a3f2e'; ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2 * px;
      ctx.fillRect(-0.2, 0, 0.4, 9); ctx.strokeRect(-0.2, 0, 0.4, 9);
      ctx.fillRect(-1.6, 6.5, 3.2, 0.25);
      ctx.beginPath(); ctx.moveTo(0.2, 8.5); ctx.lineTo(3 + Math.sin(time * 2) * 0.2, 6.8); ctx.lineTo(0.2, 4.5); ctx.closePath();
      ctx.fillStyle = '#e8d9b8'; ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // small decorations rooted in the ground (bones, coral, posts)
    const x0 = Math.floor(this.viewL), x1 = Math.ceil(this.viewR);
    for (let x = x0; x <= x1; x++) {
      const h = U.hash(x * 3.7);
      if (h < 0.93 || T.inGap(x)) continue;
      const z = T.zoneIndex(x), gy = T.heightAt(x) - 0.3;
      this.drawGroundDecor(ctx, x, gy, z, h, px);
    }
    this.drawLighthouse(px, time);
  },

  drawGroundDecor(ctx, x, y, z, h, px) {
    ctx.lineCap = 'round';
    if (z === 1 || z === 4) {           // bleached coral branches
      ctx.strokeStyle = z === 1 ? '#f7d9cf' : '#b7a8d6';
      const branch = (bx, by, len, ang, w, d) => {
        const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        if (d > 0) { branch(ex, ey, len * 0.7, ang + 0.5, w * 0.7, d - 1); branch(ex, ey, len * 0.7, ang - 0.45, w * 0.7, d - 1); }
      };
      branch(x, y, 0.9 + h, Math.PI / 2, 0.22, 2);
    } else if (z === 0) {               // an old rib bone
      ctx.strokeStyle = '#fbf3e3'; ctx.lineWidth = 0.18;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 0.3, y + 1.4, x + 1.1, y + 1.6); ctx.stroke();
    } else if (z === 2) {               // a leaning plank
      ctx.fillStyle = '#7b5a43';
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3 + h * 0.3); ctx.fillRect(-0.15, 0, 0.3, 1.8); ctx.restore();
    } else {                            // a dark spike of dead kelp
      ctx.fillStyle = '#4a3d55';
      ctx.beginPath(); ctx.moveTo(x - 0.25, y); ctx.lineTo(x + 0.1, y + 2.5 + h); ctx.lineTo(x + 0.3, y); ctx.fill();
    }
  },

  drawTerrain(pal, px) {
    const ctx = this.ctx, T = SW.Terrain, U = SW.util;
    const x0 = Math.floor(this.viewL) - 1, x1 = Math.ceil(this.viewR) + 1;
    const bottom = this.viewB - 2;
    const surface = () => { for (let x = x0; x <= x1; x++) ctx.lineTo(x, T.heightAt(x)); };

    // body of the ground, coloured by zone
    ctx.beginPath(); ctx.moveTo(x0, bottom); surface(); ctx.lineTo(x1, bottom); ctx.closePath();
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, U.rgb(this.groundColor(x0, 'groundRGB')));
    g.addColorStop(1, U.rgb(this.groundColor(x1, 'groundRGB')));
    ctx.fillStyle = g; ctx.fill();

    // layered sediment lines following the surface
    const strata = this.groundColor(this.camX, 'strataRGB');
    const layers = [[0.6, 0.18, 0.5], [1.5, 0.3, 0.45], [3.0, 0.5, 0.4], [5.5, 1.2, 0.35], [9, 3, 0.35]];
    for (const [d, w, a] of layers) {
      ctx.strokeStyle = U.rgb(strata, a); ctx.lineWidth = w;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) ctx.lineTo(x, T.heightAt(x) - d - w / 2);
      ctx.stroke();
    }

    // shipwreck hulls drawn over their mounds
    for (const w of T.wrecks) if (w.x1 > this.viewL && w.x0 < this.viewR) this.drawWreckHull(w, px);

    // pebbles and shells
    ctx.fillStyle = U.rgb(strata, 0.8);
    for (let x = x0; x <= x1; x++) {
      if (U.hash(x * 1.7) < 0.8 || T.inGap(x)) continue;
      ctx.beginPath(); ctx.ellipse(x + 0.3, T.heightAt(x + 0.3) - 0.45, 0.16, 0.09, 0, 0, Math.PI * 2); ctx.fill();
    }

    // salt crust on top with a dark outline
    ctx.lineJoin = 'round';
    ctx.beginPath(); surface();
    ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 0.3 + 4 * px; ctx.stroke();
    ctx.strokeStyle = U.rgb(this.groundColor(this.camX, 'crustRGB')); ctx.lineWidth = 0.28; ctx.stroke();
  },

  drawWreckHull(w, px) {
    const ctx = this.ctx, T = SW.Terrain;
    const a = Math.ceil(w.x0 + 2), b = Math.floor(w.x1 - 2);
    ctx.beginPath();
    for (let x = a; x <= b; x++) ctx.lineTo(x, T.heightAt(x) - 0.1);
    for (let x = b; x >= a; x--) ctx.lineTo(x, T.heightAt(x) - 2.6 - Math.sin(Math.PI * (x - a) / (b - a)) * 1.5);
    ctx.closePath();
    ctx.fillStyle = '#7b5a43'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(42,32,48,0.45)'; ctx.lineWidth = 2 * px;
    for (let d = 0.6; d < 4.5; d += 0.55) {          // planks
      ctx.beginPath();
      for (let x = a; x <= b; x++) ctx.lineTo(x, T.heightAt(x) - d);
      ctx.stroke();
    }
    ctx.lineWidth = 0.25; ctx.strokeStyle = 'rgba(42,32,48,0.3)';
    for (let x = a + 2; x < b; x += 3.5) {            // ribs
      ctx.beginPath(); ctx.moveTo(x, T.heightAt(x)); ctx.lineTo(x, T.heightAt(x) - 5); ctx.stroke();
    }
    ctx.fillStyle = '#2a2030';
    for (let x = a + 5; x < b - 3; x += 7) {           // portholes
      ctx.beginPath(); ctx.arc(x, T.heightAt(x) - 1.1, 0.28, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // The Last Lighthouse, standing just past the finish line.
  drawLighthouse(px, time) {
    const ctx = this.ctx, T = SW.Terrain;
    const x = T.LENGTH + 45;
    if (x < this.viewL - 10 || x > this.viewR + 10) return;
    const y = T.heightAt(x) - 0.5;
    ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 3 * px;
    const h = 16;
    for (let i = 0; i < 5; i++) {   // tapering tower in red and white bands
      const y0 = y + i * h / 5, y1 = y + (i + 1) * h / 5;
      const w0 = 2.4 - i * 0.28, w1 = 2.4 - (i + 1) * 0.28;
      ctx.beginPath(); ctx.moveTo(x - w0, y0); ctx.lineTo(x - w1, y1); ctx.lineTo(x + w1, y1); ctx.lineTo(x + w0, y0); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#d0473a' : '#f4ead6'; ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#2a2030'; ctx.fillRect(x - 1.4, y + h, 2.8, 0.3);
    const lit = 0.75 + 0.25 * Math.sin(time * 4);
    ctx.fillStyle = `rgba(255,236,160,${lit})`; ctx.fillRect(x - 0.8, y + h + 0.3, 1.6, 1.4); ctx.strokeRect(x - 0.8, y + h + 0.3, 1.6, 1.4);
    ctx.beginPath(); ctx.moveTo(x - 1.1, y + h + 1.7); ctx.lineTo(x, y + h + 2.8); ctx.lineTo(x + 1.1, y + h + 1.7); ctx.closePath();
    ctx.fillStyle = '#d0473a'; ctx.fill(); ctx.stroke();
    this.lampX = x; this.lampY = y + h + 1;
  },

  // A sweeping beam from the lighthouse lamp, visible from far away near the end.
  drawBeam(p, time) {
    if (p < 0.78) return;
    const ctx = this.ctx, T = SW.Terrain;
    const lx = this.sx(T.LENGTH + 45), ly = this.sy(T.heightAt(T.LENGTH + 45) + 16.5);
    const a = Math.PI + Math.sin(time * 0.6) * 1.2 - 0.3;
    const len = 2500, spread = 0.07;
    const alpha = SW.util.smoothstep(0.78, 0.95, p) * 0.35;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, len);
    g.addColorStop(0, `rgba(255,240,180,${alpha})`); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(a - spread) * len, ly + Math.sin(a - spread) * len);
    ctx.lineTo(lx + Math.cos(a + spread) * len, ly + Math.sin(a + spread) * len);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  },

  // Finish line: two posts and a string of flags. The "tide line".
  drawFinish(px, time) {
    const ctx = this.ctx, T = SW.Terrain, x = T.LENGTH;
    if (x < this.viewL - 5 || x > this.viewR + 5) return;
    const y = T.heightAt(x);
    ctx.fillStyle = '#6b4a37'; ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2 * px;
    ctx.fillRect(x - 3, y - 0.5, 0.3, 5.5); ctx.strokeRect(x - 3, y - 0.5, 0.3, 5.5);
    ctx.fillRect(x + 3, y - 0.5, 0.3, 5.5); ctx.strokeRect(x + 3, y - 0.5, 0.3, 5.5);
    const colors = ['#e2674f', '#f1dfb4', '#2f8f97', '#e9b04a'];
    for (let i = 0; i < 10; i++) {
      const fx = x - 2.8 + i * 0.6, fy = y + 4.8 - Math.sin(Math.PI * i / 9) * 0.6;
      ctx.fillStyle = colors[i % 4];
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 0.5, fy); ctx.lineTo(fx + 0.25, fy - 0.6 + Math.sin(time * 5 + i) * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },

  drawObstacles(px) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2.2 * px; ctx.lineJoin = 'round';
    for (const o of SW.Terrain.obstacles) {
      if (!o.alive || o.x < this.viewL - 2 || o.x > this.viewR + 2) continue;
      const d = o.def, l = o.x - d.w / 2;
      if (o.type === 'crate') {
        ctx.fillStyle = d.color; ctx.fillRect(l, o.y, d.w, d.h); ctx.strokeRect(l, o.y, d.w, d.h);
        ctx.beginPath(); ctx.moveTo(l, o.y); ctx.lineTo(l + d.w, o.y + d.h); ctx.moveTo(l + d.w, o.y); ctx.lineTo(l, o.y + d.h); ctx.stroke();
        ctx.strokeRect(l + 0.08, o.y + 0.08, d.w - 0.16, d.h - 0.16);
      } else if (o.type === 'timber') {
        ctx.fillStyle = d.color;
        for (let i = 0; i < 3; i++) { ctx.fillRect(l + i * 0.2, o.y, 0.18, d.h - i * 0.15); ctx.strokeRect(l + i * 0.2, o.y, 0.18, d.h - i * 0.15); }
        ctx.strokeStyle = '#e8d9b8'; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(l - 0.05, o.y + 0.6); ctx.lineTo(l + d.w + 0.05, o.y + 0.7); ctx.moveTo(l - 0.05, o.y + 1.4); ctx.lineTo(l + d.w + 0.05, o.y + 1.3); ctx.stroke();
        ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2.2 * px;
      } else {   // coral spire
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.moveTo(l, o.y); ctx.lineTo(o.x - 0.15, o.y + d.h); ctx.lineTo(o.x + 0.15, o.y + d.h * 0.92); ctx.lineTo(l + d.w, o.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o.x - 0.1, o.y + 1.2); ctx.lineTo(o.x - 0.7, o.y + 2.0); ctx.lineTo(o.x - 0.55, o.y + 2.1); ctx.lineTo(o.x, o.y + 1.5); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(o.x + 0.1, o.y + 1.6); ctx.lineTo(o.x + 0.6, o.y + 2.3); ctx.lineTo(o.x + 0.45, o.y + 2.4); ctx.lineTo(o.x + 0.05, o.y + 1.9); ctx.fill(); ctx.stroke();
      }
    }
  },

  // Bobbing red fuel cans with a soft glow.
  drawCans(px, time) {
    const ctx = this.ctx;
    for (const c of SW.Terrain.cans) {
      if (c.taken || c.x < this.viewL - 2 || c.x > this.viewR + 2) continue;
      const y = c.y + Math.sin(time * 3 + c.x) * 0.15;
      const g = ctx.createRadialGradient(c.x, y, 0.1, c.x, y, 1.2);
      g.addColorStop(0, 'rgba(255,220,120,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2.2 * px;
      ctx.fillStyle = '#d0473a';
      ctx.beginPath(); ctx.roundRect(c.x - 0.3, y - 0.4, 0.6, 0.75, 0.08); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a2030'; ctx.fillRect(c.x - 0.2, y + 0.35, 0.25, 0.12);
      ctx.fillStyle = '#e9b04a'; ctx.fillRect(c.x + 0.12, y + 0.35, 0.12, 0.14);
      ctx.strokeStyle = '#f4ead6'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(c.x - 0.2, y - 0.3); ctx.lineTo(c.x + 0.2, y + 0.25); ctx.moveTo(c.x + 0.2, y - 0.3); ctx.lineTo(c.x - 0.2, y + 0.25); ctx.stroke();
    }
  },

  drawCar(car, px, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.a);
    SW.Vehicles.draw(ctx, car, px, time);
    ctx.restore();
  },

  // ==================================================================
  // HUD (screen space)
  // ==================================================================
  text(str, x, y, size, color, align, outline) {
    const ctx = this.ctx;
    ctx.font = `700 ${size}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (outline !== false) { ctx.strokeStyle = '#2a2030'; ctx.lineWidth = Math.max(3, size / 5); ctx.strokeText(str, x, y); }
    ctx.fillStyle = color || '#fff'; ctx.fillText(str, x, y);
  },

  bar(x, y, w, h, frac, color, label, blink) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(42,32,48,0.6)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = blink ? '#ff5a4a' : color;
      ctx.beginPath(); ctx.roundRect(x + 2, y + 2, Math.max(h - 4, (w - 4) * frac), h - 4, (h - 4) / 2); ctx.fill();
    }
    ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.stroke();
    this.text(label, x + 10, y + h / 2 + 0.5, 12, '#fff');
  },

  drawHUD(run, time) {
    const ctx = this.ctx, W = this.W, H = this.H, T = SW.Terrain, st = run.stats;
    const small = W < 600;

    // --- gauges, top-left ---
    const gw = small ? 120 : 190, gh = small ? 18 : 22, gx = 12;
    let gy = 12;
    const fuelFrac = run.fuel / st.fuelMax;
    this.bar(gx, gy, gw, gh, fuelFrac, '#e9b04a', 'FUEL', fuelFrac < 0.2 && Math.sin(time * 10) > 0);
    gy += gh + 6;
    this.bar(gx, gy, gw, gh, run.boost / st.boostMax, '#7fd3e0', 'BOOST');
    gy += gh + 6;
    const hullFrac = Math.max(0, run.hull / st.hullMax);
    this.bar(gx, gy, gw, gh, hullFrac, hullFrac > 0.35 ? '#8cd17d' : '#ff7a5a', 'HULL');

    // --- progress bar along the top ---
    const bw = small ? W - gw - 120 : Math.min(560, W - 2 * gw - 140);
    const bx = small ? gx + gw + 12 : (W - bw) / 2, by = 16, bh = 12;
    ctx.fillStyle = 'rgba(42,32,48,0.6)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
    const frac = SW.util.clamp(run.car.x / T.LENGTH, 0, 1);
    ctx.fillStyle = '#e2674f';
    ctx.beginPath(); ctx.roundRect(bx + 2, by + 2, Math.max(8, (bw - 4) * frac), bh - 4, 4); ctx.fill();
    ctx.strokeStyle = '#2a2030'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const z of T.ZONES) if (z.start > 0) ctx.fillRect(bx + bw * z.start / T.LENGTH - 1, by + 2, 2, bh - 4);
    // best-ever marker (a little flag)
    const best = SW.Save.data.best;
    if (best > 0) {
      const fx = bx + bw * Math.min(1, best / T.LENGTH);
      ctx.fillStyle = '#fff'; ctx.fillRect(fx - 1, by - 6, 2, bh + 8);
      ctx.beginPath(); ctx.moveTo(fx + 1, by - 6); ctx.lineTo(fx + 9, by - 3); ctx.lineTo(fx + 1, by); ctx.fill();
    }
    // the car's position
    const cx = bx + bw * frac;
    ctx.fillStyle = '#7fd3e0'; ctx.strokeStyle = '#2a2030';
    ctx.beginPath(); ctx.arc(cx, by + bh / 2, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // lighthouse icon at the end
    ctx.fillStyle = '#f4ead6';
    ctx.beginPath(); ctx.moveTo(bx + bw + 6, by + bh + 3); ctx.lineTo(bx + bw + 9, by - 6); ctx.lineTo(bx + bw + 13, by - 6); ctx.lineTo(bx + bw + 16, by + bh + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe9a0'; ctx.fillRect(bx + bw + 8, by - 11, 6, 5);
    const zone = T.ZONES[T.zoneIndex(run.car.x)];
    this.text(zone.name, bx + bw / 2, by + bh + 14, 12, '#fff', 'center');

    // --- distance and cash, top-right (left of the pause/mute buttons) ---
    const rx = W - 110;
    const dist = Math.max(0, Math.floor(run.car.x - run.startX));
    this.text(dist + ' m', rx, 24, small ? 20 : 26, '#fff', 'right');
    this.text('$' + SW.util.money(run.cashSoFar()), rx, 52, small ? 15 : 18, '#ffe9a0', 'right');

    // --- air time counter ---
    if (run.curAir > 0.5) this.text('AIR ' + run.curAir.toFixed(1) + 's', W / 2, H * 0.22, 26, '#7fd3e0', 'center');

    // --- zone banner ---
    if (run.banner && run.banner.t > 0) {
      const a = Math.min(1, run.banner.t, (3.5 - run.banner.t) * 2);
      ctx.globalAlpha = SW.util.clamp(a, 0, 1);
      this.text(run.banner.title, W / 2, H * 0.32, small ? 30 : 42, '#fff1e0', 'center');
      this.text(run.banner.sub, W / 2, H * 0.32 + (small ? 30 : 38), small ? 14 : 17, '#fff', 'center');
      ctx.globalAlpha = 1;
    }

    // --- floating popups (+$30, CLANK! ...) ---
    for (const p of run.popups) {
      ctx.globalAlpha = SW.util.clamp(p.t, 0, 1);
      this.text(p.text, this.sx(p.x), this.sy(p.y) - (1.2 - p.t) * 40, 18, p.color, 'center');
    }
    ctx.globalAlpha = 1;

    // --- warnings ---
    if (run.fuel <= 0 && !run.ended) this.text('OUT OF FUEL', W / 2, H * 0.4, 30, '#ff8a6a', 'center');
    else if (fuelFrac < 0.2 && Math.sin(time * 6) > 0) this.text('LOW FUEL', W / 2, H * 0.4, 22, '#ffb36a', 'center');
    if (run.flipTimer > 0.3 && !run.ended) this.text('FLIPPED!', W / 2, H * 0.46, 28, '#ff8a6a', 'center');
  },
};
