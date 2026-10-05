// input.js: reads the keyboard and the on-screen touch buttons
// and turns them into one simple "controls" object the game can read.

SW.Input = {
  keys: {},                 // which keyboard keys are held right now
  touch: { gas: false, brake: false, leanBack: false, leanFwd: false, boost: false },
  override: null,           // tests and bots can set this to drive the car themselves
  onKey: null,              // main.js sets this to react to single presses (pause, mute)

  init() {
    const gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    window.addEventListener('keydown', (e) => {
      if (gameKeys.includes(e.code)) e.preventDefault(); // stop the page scrolling
      if (!e.repeat && this.onKey) this.onKey(e.code);
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // If the window loses focus, let go of everything so the car doesn't drive itself.
    window.addEventListener('blur', () => { this.keys = {}; });

    // Touch buttons: each has data-touch="gas" (etc). Hold to press.
    document.querySelectorAll('[data-touch]').forEach((btn) => {
      const name = btn.dataset.touch;
      const press = (on) => (e) => {
        e.preventDefault();
        this.touch[name] = on;
        btn.classList.toggle('held', on);
      };
      btn.addEventListener('pointerdown', press(true));
      btn.addEventListener('pointerup', press(false));
      btn.addEventListener('pointercancel', press(false));
      btn.addEventListener('pointerleave', press(false));
    });
  },

  // Is this a touch-screen device? (Then we show the on-screen buttons.)
  isTouchDevice() {
    return ('ontouchstart' in window) || window.matchMedia('(pointer: coarse)').matches;
  },

  controls() {
    if (this.override) return this.override;
    const k = this.keys, t = this.touch;
    return {
      gas: !!(k.ArrowRight || k.KeyD || t.gas),
      brake: !!(k.ArrowLeft || k.KeyA || t.brake),
      leanBack: !!(k.ArrowUp || k.KeyW || t.leanBack),
      leanFwd: !!(k.ArrowDown || k.KeyS || t.leanFwd),
      boost: !!(k.Space || k.ShiftLeft || k.ShiftRight || t.boost),
    };
  },
};
