// util.js: small helpers shared by every other file.
// Everything in the game hangs off one global object called SW ("SaltWake").
window.SW = window.SW || {};

SW.util = {
  // Keep v between lo and hi.
  clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },

  // Blend from a to b by t (0 = a, 1 = b).
  lerp(a, b, t) { return a + (b - a) * t; },

  // A smooth 0..1 ramp as x goes from e0 to e1 (eases in and out).
  smoothstep(e0, e1, x) {
    const t = SW.util.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  // Seeded random numbers: the same seed always gives the same sequence,
  // so the map is identical every time you play.
  rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // Turn any number into a repeatable "random" value between 0 and 1.
  hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  },

  // Smooth 1D noise: gentle random wiggles, used for background hills.
  noise(x) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    return SW.util.lerp(SW.util.hash(i), SW.util.hash(i + 1), u);
  },

  // Colours are stored as [r, g, b] arrays so they can be blended.
  hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  },
  rgb(c, alpha) {
    const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0;
    return alpha === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
  },

  // Format money nicely: 12500 -> "12,500".
  money(n) { return Math.floor(n).toLocaleString('en-US'); },
};
