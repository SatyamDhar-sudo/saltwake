# Saltwake

The sea drained away in a single night. Drive a boat-on-wheels across the dry seabed
to the Last Lighthouse, 4 km west, before the sun goes down.

**To play:** double-click `index.html`. Nothing to install. Progress saves automatically.

## Controls
| Action | Keyboard | Touch |
|---|---|---|
| Gas | → or D | ▶ gas |
| Brake / reverse | ← or A | ◀ brake |
| Nose up (lean back) | ↑ or W | ⟲ |
| Nose down (lean forward) | ↓ or S | ⟳ |
| Steam boost | Space or Shift | boost |
| Pause / mute | P / M | buttons top-right |

## How the code is organised
| File | What it does |
|---|---|
| `js/util.js` | Small maths and colour helpers |
| `js/save.js` | Saves progress in the browser (localStorage) |
| `js/input.js` | Keyboard and touch buttons |
| `js/audio.js` | All sounds, generated with the Web Audio API |
| `js/terrain.js` | The map: hills, ramps, gaps, wrecks, obstacles, fuel cans |
| `js/physics.js` | Car physics: chassis, spring suspension, tyre grip, collisions |
| `js/vehicles.js` | The 3 vehicles, 6 upgrade tracks, and how they're drawn |
| `js/enemies.js` | The 4 enemy types and the harpoon gun |
| `js/particles.js` | Dust, debris, sparks, steam |
| `js/render.js` | Sky, parallax background, terrain, HUD |
| `js/garage.js` | The Boatyard (upgrade shop) |
| `js/game.js` | A single run: fuel, damage, scoring, ending a run |
| `js/main.js` | Screens and the main loop |

Easy things to tweak: prices are in `TRACKS` in `vehicles.js`, cash rewards and fuel burn are at
the top of `game.js`, and the level layout is the `SET_PIECES` list in `terrain.js`.

## Automated tests
`node tools/playtest.mjs` opens the game in headless Chrome and checks driving, ground collision,
fuel, cash, upgrades, saving and the ending (screenshots go to `tools/shots/`).
`node tools/playtest.mjs balance` lets a bot play the whole game to check the economy, and
`node tools/playtest.mjs mobile` tests the touch controls on a phone-sized screen.
