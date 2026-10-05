// save.js: keeps your progress in the browser's localStorage,
// so closing the tab (or the whole browser) loses nothing.

SW.Save = {
  KEY: 'saltwake-save-v1',
  data: null,

  // What a brand-new player starts with.
  defaults() {
    return {
      cash: 0,
      upgrades: { engine: 0, tyres: 0, fuel: 0, boost: 0, armour: 0, ram: 0 },
      owned: ['dinghy'],      // vehicles you have bought
      vehicle: 'dinghy',      // the one you are driving
      best: 0,                // furthest distance ever reached (metres)
      zoneReached: 0,         // furthest zone reached (for one-time bonuses)
      runs: 0,
      totalEarned: 0,
      playSeconds: 0,         // total time spent playing
      finished: false,        // reached the Last Lighthouse?
      muted: false,
    };
  },

  load() {
    const base = this.defaults();
    try {
      const raw = localStorage.getItem(this.KEY);
      const saved = raw ? JSON.parse(raw) : {};
      this.data = Object.assign(base, saved);
      this.data.upgrades = Object.assign(this.defaults().upgrades, saved.upgrades || {});
    } catch (e) {
      this.data = base; // storage blocked or corrupted: start fresh
    }
    return this.data;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },

  reset() {
    this.data = this.defaults();
    this.save();
  },
};
