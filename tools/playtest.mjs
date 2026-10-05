// playtest.mjs: automated checks for Saltwake. Nothing to install.
// It opens the game in headless Chrome and drives it through the Chrome DevTools Protocol
// using Node's built-in WebSocket (Node 22+).
//
//   node tools/playtest.mjs            run the acceptance checks + screenshots
//   node tools/playtest.mjs balance    simulate a full playthrough with a bot driver
//
// Set CHROME=path\to\chrome.exe if Chrome/Edge isn't found automatically.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'checks';
const shotsDir = path.join(root, 'tools', 'shots');

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = candidates.find((p) => existsSync(p));
if (!chromePath) { console.error('Chrome not found. Set CHROME=...'); process.exit(1); }

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(path.join(tmpdir(), 'saltwake-'));
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--window-size=1280,720', pathToFileURL(path.join(root, 'index.html')).href,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- tiny Chrome DevTools Protocol client ----
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Could not connect to Chrome');
}
const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = nextId++;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expr) {
  const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
}
async function waitForGame() {
  for (let i = 0; i < 80; i++) {
    if (await evaluate('!!(window.SW && SW.Main && SW.Terrain.heights && SW.Render.ctx)').catch(() => false)) return;
    await sleep(100);
  }
  throw new Error('Game did not load');
}
async function shot(name) {
  mkdirSync(shotsDir, { recursive: true });
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(shotsDir, name + '.png'), Buffer.from(res.result.data, 'base64'));
}
const injectBot = () => evaluate(readFileSync(path.join(root, 'tools', 'bot.js'), 'utf8') + ';true');

await send('Runtime.enable');
await send('Page.enable');
await waitForGame();

// ---- results table ----
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -  ${detail}`);
}

try {
  if (mode === 'balance') await balance();
  else if (mode === 'mobile') await mobile();
  else if (mode === 'eval') {           // node tools/playtest.mjs eval some-script.js  (for debugging)
    await injectBot();
    console.log(JSON.stringify(await evaluate(readFileSync(process.argv[3], 'utf8')), null, 1));
    if (process.argv[4]) { await sleep(300); await shot(process.argv[4]); }   // optional screenshot name
    results.push({ ok: true });
  }
  else await checks();
} catch (e) {
  console.error('ERROR', e);
  results.push({ ok: false });
}
if (errors.length) { console.log('\nPage errors:'); for (const e of errors) console.log('  ' + e); }
ws.close();
chrome.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome may still hold files */ }
process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);

// =====================================================================
async function checks() {
  await injectBot();
  await evaluate('SW.debug.reset()');
  await sleep(500);
  await shot('1-title');

  // 1. The vehicle drives and does not fall through the ground.
  await evaluate('SW.debug.start()');
  const d = await evaluate('SW.debug.simulate(10, BOT)');
  check('Vehicle drives', d.x > 60, `x after 10 s of gas = ${d.x.toFixed(1)} m, top speed ${d.maxSpeed.toFixed(1)} m/s`);
  check('Never sinks into the ground', d.maxPen < 0.2, `max wheel penetration ${d.maxPen.toFixed(3)} m`);

  // Let the real game loop render a few frames mid-run for a screenshot.
  await sleep(600);
  await shot('2-run-start');

  // 2. A first run ends from fuel in under a minute.
  const end = await evaluate('SW.debug.simulate(120, BOT)');
  check('First run ends from fuel', end.reason === 'fuel', `reason = ${end.reason}`);
  check('...in under 60 s', end.time < 60, `run lasted ${end.time.toFixed(1)} s, reached ${end.summary.distance} m`);
  check('Ground stays solid all run', end.maxPen < 0.2, `max wheel penetration ${end.maxPen.toFixed(3)} m`);

  // 3. Cash is awarded and the summary has every stat.
  const st1 = await evaluate('SW.debug.state()');
  const s = end.summary;
  check('Cash awarded', st1.cash > 0 && st1.cash === s.total, `earned $${s.total} (distance $${s.cash.distance}, bounty $${s.cash.bounty + s.cash.smash}, air $${s.cash.air})`);
  check('Summary has all stats', ['distance', 'enemiesHit', 'airTime', 'total'].every((k) => typeof s[k] === 'number'),
    `distance ${s.distance} m, enemies hit ${s.enemiesHit}, air ${s.airTime.toFixed(1)} s, cash $${s.total}`);
  await sleep(1800);
  await shot('3-summary');

  // 4. Buy an upgrade and check the car performs better.
  const perfTest = `(() => { SW.debug.start(); const r = SW.debug.simulate(7, {gas:true}); return { x: r.x, v: r.maxSpeed }; })()`;
  const before = await evaluate(perfTest);
  const bought = await evaluate(`SW.Garage.buy('engine')`);
  const after = await evaluate(perfTest);
  check('Upgrade can be bought', bought === true, `cash before purchase $${st1.cash}, engine level now ${(await evaluate('SW.debug.state()')).upgrades.engine}`);
  check('Upgrade improves performance', after.x > before.x + 2 && after.v > before.v,
    `7 s flat-out: ${before.x.toFixed(1)} m @ ${before.v.toFixed(1)} m/s  ->  ${after.x.toFixed(1)} m @ ${after.v.toFixed(1)} m/s`);
  await evaluate('SW.Game.end("quit"); SW.Main.openGarage(); true');
  await sleep(500);
  await shot('4-garage');

  // 5. Progress survives a page reload.
  const saved = await evaluate('SW.debug.state()');
  await send('Page.reload');
  await sleep(500);
  await waitForGame();
  const loaded = await evaluate('SW.debug.state()');
  check('Progress survives reload', JSON.stringify(saved) === JSON.stringify(loaded),
    `cash $${loaded.cash}, engine Lv${loaded.upgrades.engine}, runs ${loaded.runs}, best ${loaded.best} m`);

  // 6. Screenshots further along the map + frame time measurement.
  await injectBot();
  for (const [name, x, up] of [['5-coral', 900, 1], ['6-wrecks', 1770, 3], ['7-trench', 2700, 4], ['8-reef', 3740, 5]]) {
    await evaluate(`(() => {
      const u = SW.Save.data.upgrades; for (const k in u) u[k] = ${up};
      SW.Save.data.vehicle = '${up >= 4 ? 'hydrofoil' : up >= 3 ? 'trawler' : 'dinghy'}';
      SW.debug.start();
      const car = SW.Game.run.car; car.x = ${x}; car.y = SW.Terrain.heightAt(${x}) + 1.6; car.vx = 12;
      SW.Render.camX = car.x + 6; SW.Render.camY = car.y;
      SW.debug.simulate(1.5, BOT);
      SW.Input.override = BOT; return true; })()`);
    await sleep(900);
    await shot(name);
  }
  const perf = await evaluate(`new Promise((done) => {
    const orig = SW.Render.frame.bind(SW.Render); const times = []; let frames = 0; const t0 = performance.now();
    SW.Render.frame = (r, t) => { const a = performance.now(); orig(r, t); times.push(performance.now() - a); frames++; };
    setTimeout(() => { SW.Render.frame = orig; times.sort((a, b) => a - b);
      done({ fps: frames / ((performance.now() - t0) / 1000), avg: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)] }); }, 3000);
  })`);
  check('Render cost per frame', perf.avg < 8, `avg ${perf.avg.toFixed(2)} ms, 95th pct ${perf.p95.toFixed(2)} ms, ${perf.fps.toFixed(0)} fps in headless Chrome`);

  // 7. Reaching the lighthouse ends the game with the finale.
  await evaluate(`(() => { SW.debug.start(); const car = SW.Game.run.car;
    car.x = 3955; car.y = SW.Terrain.heightAt(3955) + 1.6; car.vx = 16; SW.Render.camX = car.x + 6; SW.Render.camY = car.y;
    SW.Input.override = BOT; return true; })()`);
  await sleep(2600);
  await shot('9-lighthouse');
  await sleep(2500);
  const fin = await evaluate('({ reason: SW.Game.run.endReason, finished: SW.Save.data.finished, screen: SW.Main.screen })');
  check('Reaching the lighthouse finishes the game', fin.reason === 'finish' && fin.finished && fin.screen === 'summary', JSON.stringify(fin));
  await shot('10-ending');
  await evaluate('SW.Input.override = null; SW.debug.reset()');
}

// =====================================================================
// Phone in landscape with a touch screen: check the on-screen buttons and layouts.
async function mobile() {
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.reload');
  await sleep(600);
  await waitForGame();
  await evaluate('SW.debug.reset(); SW.debug.start(); true');
  await sleep(300);
  // Press the on-screen gas button the way a finger would.
  const box = await evaluate(`(() => { const r = document.querySelector('[data-touch=gas]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  await sleep(2500);
  const moved = await evaluate('SW.Game.run.car.x');
  await shot('m1-run');
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('Touch gas button drives the car', moved > 15, `car x after holding the on-screen gas for 2.5 s: ${moved.toFixed(1)} m`);
  await evaluate('SW.Game.end("quit"); SW.Main.openGarage(); true');
  await sleep(400);
  await shot('m2-garage');
}

// =====================================================================
async function balance() {
  await injectBot();
  await evaluate('SW.debug.reset()');
  const GARAGE_SECONDS = 12;      // rough time a player spends in the garage + summary per run
  let total = 0, finished = false;
  console.log('run  vehicle     upgrades(e,t,f,b,a,r)  time   dist   end       earned  bought');
  for (let i = 1; i <= 90; i++) {
    const r = await evaluate(`(() => { SW.debug.start(); const r = SW.debug.simulate(600, BOT);
      const s = r.summary; const up = SW.Save.data.upgrades;
      return { time: r.time, dist: s.distance, reason: s.reason, total: s.total, veh: SW.Save.data.vehicle,
               up: [up.engine, up.tyres, up.fuel, up.boost, up.armour, up.ram].join(','), bought: BOT_SHOP() }; })()`);
    total += r.time + GARAGE_SECONDS;
    console.log(`${String(i).padStart(3)}  ${r.veh.padEnd(10)}  ${r.up.padEnd(21)}  ${r.time.toFixed(0).padStart(4)}s  ${String(r.dist).padStart(5)}  ${r.reason.padEnd(8)}  $${String(r.total).padStart(5)}  ${r.bought.join(' ')}`);
    if (r.reason === 'finish') { finished = true; break; }
  }
  const st = await evaluate('SW.debug.state()');
  console.log(`\nTotal simulated play time: ${(total / 60).toFixed(1)} min over ${st.runs} runs (finished: ${finished})`);
  results.push({ ok: true });
}
