// particles.js: little bits of flying stuff that make things feel alive:
// salt dust from the tyres, debris from smashed crates, sparks from scraping metal,
// steam puffs from the boost and smoke from the exhaust.

SW.Particles = {
  MAX: 700,      // hard cap so a big crash can never slow the game down
  list: [],

  clear() { this.list.length = 0; },

  // kind: 'dust' | 'debris' | 'spark' | 'steam' | 'smoke'
  spawn(kind, x, y, vx, vy, life, size, color) {
    if (this.list.length >= this.MAX) return;
    this.list.push({ kind, x, y, vx, vy, life, maxLife: life, size, color, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12 });
  },

  dust(x, y, count, color, push) {
    for (let i = 0; i < count; i++) {
      this.spawn('dust', x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.2,
        -push * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 1.8,
        0.5 + Math.random() * 0.6, 0.15 + Math.random() * 0.25, color);
    }
  },

  debris(x, y, color, count, push) {
    for (let i = 0; i < count; i++) {
      this.spawn('debris', x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6,
        push * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * 5, 2 + Math.random() * 6,
        0.9 + Math.random() * 0.8, 0.08 + Math.random() * 0.18, color);
    }
  },

  sparks(x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI, sp = 4 + Math.random() * 7;
      this.spawn('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.3, 0.05, '#ffd66b');
    }
  },

  steam(x, y, vx, vy) {
    this.spawn('steam', x, y, vx + (Math.random() - 0.5), vy + (Math.random() - 0.5), 0.5 + Math.random() * 0.3, 0.15, '#ffffff');
  },

  smoke(x, y) {
    this.spawn('smoke', x, y, -0.5 + Math.random() * 0.4, 1 + Math.random() * 0.6, 0.8, 0.08, '#6b6470');
  },

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }   // fast remove
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.kind === 'debris' || p.kind === 'spark') p.vy -= 14 * dt;   // heavy bits fall
      else if (p.kind === 'dust') { p.vy -= 2 * dt; p.vx *= 1 - 1.5 * dt; }
      else { p.vx *= 1 - 2 * dt; p.vy *= 1 - 1 * dt; }                  // steam and smoke drift
      if (p.kind === 'debris') {
        const g = SW.Terrain.heightAt(p.x);
        if (p.y < g) { p.y = g; p.vy *= -0.3; p.vx *= 0.6; }
      }
    }
  },

  // Drawn in world space (metres). px = one screen pixel in metres.
  draw(ctx, px) {
    for (const p of this.list) {
      const t = p.life / p.maxLife;           // 1 when new, 0 when about to vanish
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color; ctx.globalAlpha = t; ctx.lineWidth = 2 * px;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else if (p.kind === 'debris') {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
        ctx.restore();
      } else {
        // dust, steam, smoke: soft circles that grow as they fade
        const grow = p.kind === 'dust' ? 1 + (1 - t) * 1.5 : 1 + (1 - t) * 4;
        ctx.globalAlpha = t * (p.kind === 'steam' ? 0.7 : 0.55);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * grow, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },
};
