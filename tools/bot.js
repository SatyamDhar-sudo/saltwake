// bot.js: a simple computer driver used only by the automated tests (tools/playtest.mjs).
// It holds the gas, keeps the car level in the air, and boosts towards gaps and up hills.
// Not loaded by the game itself.

window.BOT = function (run) {
  const car = run.car, T = SW.Terrain, st = run.stats;
  const ctl = { gas: true, brake: false, leanBack: false, leanFwd: false, boost: false };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const slopeAt = (x) => Math.atan2(T.heightAt(x + 1.5) - T.heightAt(x - 1.5), 3);

  let target;
  if (car.grounded) target = slopeAt(car.x + 1);
  else target = slopeAt(car.x + car.vx * 0.5) * 0.8;          // match the slope we'll land on
  const err = wrap(target - car.a) - car.w * 0.18;
  const deadband = car.grounded ? 0.45 : 0.12;
  if (err > deadband) ctl.leanBack = true;
  else if (err < -deadband) ctl.leanFwd = true;
  if (car.grounded && wrap(car.a - target) > 0.6) ctl.gas = false;  // stop a wheelie becoming a flip

  // Boost if a gap is coming up, or on steep climbs, as long as we're pointing the right way.
  let gapAhead = false;
  for (const g of T.gaps) if (g.x0 > car.x && g.x0 - car.x < 45) gapAhead = true;
  const aligned = Math.abs(wrap(car.a - slopeAt(car.x + 1))) < 0.35;
  if (run.boost > 0 && aligned && car.grounded && (gapAhead || slopeAt(car.x + 2) > 0.2)) ctl.boost = true;
  if (gapAhead && car.grounded) ctl.gas = true;
  return ctl;
};

// The bot's shopping strategy between runs: buy a new vehicle as soon as it can,
// otherwise buy the cheapest upgrade, but start saving once upgrades get pricey
// compared to the next vehicle.
window.BOT_SHOP = function () {
  const save = SW.Save.data, V = SW.Vehicles, G = SW.Garage;
  const bought = [];
  for (;;) {
    const next = V.ORDER.find((id) => !save.owned.includes(id));
    if (next && save.cash >= V.DEFS[next].price) { G.vehicleClick(next); bought.push(next); continue; }
    let best = null;
    for (const tr of V.TRACKS) {
      const p = G.price(tr.id);
      if (p !== null && (!best || p < best.p)) best = { id: tr.id, p };
    }
    if (!best || best.p > save.cash) break;
    if (next && best.p > V.DEFS[next].price * 0.35) break;   // save up for the vehicle instead
    G.buy(best.id); bought.push(best.id);
  }
  return bought;
};
