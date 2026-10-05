// physics.js: the vehicle simulation, written from scratch (no library).
//
// The car is one rigid body (the "chassis") with position, velocity, angle and spin.
// Each wheel hangs below it on a spring + damper (the suspension). Every tiny time step:
//   1. each wheel looks for the ground and its spring pushes the chassis up,
//   2. gravity, air drag, boost and your lean keys add their pushes,
//   3. the engine spins the wheels and tyre grip turns that spin into forward motion,
//   4. the chassis moves, then any hull corner that dug into the ground is pushed back out.
// Units: metres, seconds, kilograms. y points UP. Angles are radians, counter-clockwise.

SW.Physics = {
  GRAVITY: 12,      // a bit stronger than Earth so jumps feel weighty, not floaty
  DT: 1 / 120,      // we always simulate in steps of 1/120 s, whatever the frame rate

  createCar(stats, x, y) {
    return {
      stats,
      x, y, a: 0,          // position (metres) and angle (radians)
      vx: 0, vy: 0, w: 0,  // velocity and angular velocity
      mass: stats.mass,
      inertia: stats.mass * (stats.length * stats.length + 1.4) / 12,
      wheels: stats.wheels.map((wd) => ({
        lx: wd.x, ly: wd.y,          // where the suspension is bolted on (car-local)
        len: stats.susLen,           // how far the spring can stretch
        r: stats.wheelR,
        drive: wd.drive,             // does the engine turn this wheel?
        comp: 0, prevComp: 0,        // how squashed the spring is
        spin: 0,                     // wheel speed (rad/s, positive = rolling forward)
        rot: 0,                      // wheel angle, only for drawing
        contact: false, load: 0, slip: 0,
        nx: 0, ny: 1, px: 0, py: 0, cx: 0, cy: 0,
      })),
      testPoints: [],                // world-space points other code uses for collisions
      grounded: false,
      roofContact: false,
      hasFuel: true,
    };
  },

  // Push the chassis with an instant change in momentum (impulse) at world point (px, py).
  applyImpulse(car, jx, jy, px, py) {
    car.vx += jx / car.mass;
    car.vy += jy / car.mass;
    car.w += ((px - car.x) * jy - (py - car.y) * jx) / car.inertia;
  },

  // Advance the car by one time step. ctl = {gas, brake, leanBack, leanFwd, boost}.
  // ev collects things that happened (hard landings, hull hits) for game.js to react to.
  step(car, T, ctl, dt, ev) {
    const st = car.stats, m = car.mass, I = car.inertia, U = SW.util;
    let c = Math.cos(car.a), s = Math.sin(car.a);
    const dx = s, dy = -c;              // the car's own "down" direction
    let fx = 0, fy = -m * this.GRAVITY, torque = 0;
    let contacts = 0;

    // ---- 1. Suspension: find the ground under each wheel ----
    for (const wh of car.wheels) {
      const mx = car.x + wh.lx * c - wh.ly * s;   // mount point in the world
      const my = car.y + wh.lx * s + wh.ly * c;
      const cx0 = mx + dx * wh.len, cy0 = my + dy * wh.len;   // wheel centre if the spring were fully stretched
      const hit = T.collideCircle(cx0, cy0, wh.r);
      const wasContact = wh.contact;
      wh.prevComp = wh.comp;
      wh.contact = false; wh.load = 0;

      if (hit && hit.ny < 0.4) {
        // Hitting a near-vertical wall (the far side of a chasm): no grip, just bump off it.
        car.x += hit.nx * hit.depth; car.y += hit.ny * hit.depth;
        this.solidBounce(car, cx0 - hit.nx * wh.r, cy0 - hit.ny * wh.r, hit.nx, hit.ny, 0.1, ev);
        wh.comp = Math.max(0, wh.comp - 6 * dt);
      } else if (hit) {
        const along = Math.max(0.35, -(hit.nx * dx + hit.ny * dy)); // how square-on the ground is
        let comp = hit.depth / along;
        if (comp > wh.len) {
          // The spring is fully squashed ("bottomed out"): the chassis itself takes the hit.
          const extra = (comp - wh.len) * along;
          car.x += hit.nx * extra; car.y += hit.ny * extra;
          this.solidBounce(car, mx, my, hit.nx, hit.ny, 0.05, ev);
          comp = wh.len;
        }
        wh.comp = comp;
        // Spring force grows with squash; damper resists fast squashing (stops endless bouncing).
        const compVel = U.clamp((wh.comp - wh.prevComp) / dt, -8, 8);
        let F = st.spring * comp + st.damp * compVel;
        if (F < 0) F = 0;
        const Fx = -dx * F, Fy = -dy * F;          // push the car "up" along its own axis
        fx += Fx; fy += Fy;
        torque += (mx - car.x) * Fy - (my - car.y) * Fx;

        wh.contact = true;
        wh.load = F * along;
        wh.nx = hit.nx; wh.ny = hit.ny;
        const wcx = cx0 - dx * comp, wcy = cy0 - dy * comp;
        wh.px = wcx - hit.nx * wh.r; wh.py = wcy - hit.ny * wh.r;   // where the tyre touches
        contacts++;

        // Landing: how fast was this wheel's mount coming down when it touched?
        if (!wasContact) {
          const vmy = car.vy + car.w * (mx - car.x), vmx = car.vx - car.w * (my - car.y);
          const vn = -(vmx * hit.nx + vmy * hit.ny);
          if (vn > ev.landSpeed) ev.landSpeed = vn;
        }
      } else {
        wh.comp = Math.max(0, wh.comp - 6 * dt);   // wheel drops down when in the air
      }
    }
    car.grounded = contacts > 0;

    // ---- 2. Other forces ----
    const speed = Math.hypot(car.vx, car.vy);
    fx -= car.vx * speed * st.drag * m;
    fy -= car.vy * speed * st.drag * m;
    if (ctl.boost) {                       // steam boost pushes along the car's nose
      fx += c * m * st.boostThrust;
      fy += s * m * st.boostThrust;
    }
    car.vx += fx / m * dt;
    car.vy += fy / m * dt;
    car.w += torque / I * dt;

    // Lean keys rotate the car. Strong in the air, gentle on the ground.
    const lean = (ctl.leanBack ? 1 : 0) - (ctl.leanFwd ? 1 : 0);
    car.w += lean * (car.grounded ? st.groundLean : st.airLean) * dt;
    car.w *= 1 - (car.grounded ? 0.8 : 0.35) * dt;   // a little rotational air resistance

    // ---- 3. Engine, brakes and tyre grip ----
    const fwdSpeed = car.vx * c + car.vy * s;
    const Iw = st.wheelInertia;
    for (const wh of car.wheels) {
      let T_ = 0;
      const ws = wh.spin * wh.r;           // how fast the tyre surface is moving
      if (ctl.gas && wh.drive && car.hasFuel) {
        // Full torque at low speed, fading out as the wheel nears top speed.
        T_ = st.torque / st.driveCount * U.clamp((st.topSpeed - ws) / (st.topSpeed * 0.35), 0, 1);
      } else if (ctl.brake) {
        if (fwdSpeed > 0.8) {
          const b = st.brakeTorque / Iw * dt;           // brake: slow the wheel towards 0
          wh.spin = Math.abs(wh.spin) <= b ? 0 : wh.spin - Math.sign(wh.spin) * b;
        } else if (wh.drive && car.hasFuel) {
          T_ = -st.torque * 0.6 / st.driveCount * U.clamp((ws + 5) / 2, 0, 1); // reverse, max 5 m/s
        }
      } else {
        wh.spin *= 1 - 0.25 * dt;            // rolling resistance
      }
      wh.spin += T_ / Iw * dt;
      // The engine twisting the wheel twists the car the other way: this is what makes wheelies.
      car.w += T_ * st.reaction / I * dt;
      if (!wh.contact) wh.spin = U.clamp(wh.spin, -st.topSpeed * 1.3 / wh.r, st.topSpeed * 1.3 / wh.r);

      if (wh.contact) {
        // Tyre grip: find the push needed to make the tyre roll without slipping,
        // but never more than grip x the weight on that wheel.
        const tx = wh.ny, ty = -wh.nx;                 // the ground direction, pointing "forward"
        const rx = wh.px - car.x, ry = wh.py - car.y;
        const vpx = car.vx - car.w * ry, vpy = car.vy + car.w * rx;
        const slip = (vpx * tx + vpy * ty) - wh.spin * wh.r;
        const rt = rx * ty - ry * tx;
        const k = 1 / m + rt * rt / I + wh.r * wh.r / Iw;
        const maxJ = st.grip * wh.load * dt;
        const J = U.clamp(-slip / k, -maxJ, maxJ);
        this.applyImpulse(car, J * tx, J * ty, wh.px, wh.py);
        wh.spin -= J * wh.r / Iw;
        wh.slip = Math.abs(slip);
      } else {
        wh.slip = 0;
      }
    }

    // ---- 4. Move ----
    car.w = U.clamp(car.w, -9, 9);
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.a += car.w * dt;
    for (const wh of car.wheels) wh.rot += wh.spin * dt;

    // ---- 5. Hull collisions: corners of the boat that dug into the ground ----
    c = Math.cos(car.a); s = Math.sin(car.a);
    let roof = false;
    for (const p of st.hullPoints) {
      const px = car.x + p.x * c - p.y * s, py = car.y + p.x * s + p.y * c;
      const hit = T.collidePoint(px, py);
      if (!hit) continue;
      car.x += hit.nx * hit.depth * 0.8;
      car.y += hit.ny * hit.depth * 0.8;
      this.solidBounce(car, px, py, hit.nx, hit.ny, 0.15, ev, true);
      if (p.roof) roof = true;
    }
    car.roofContact = roof;

    // ---- 6. Remember where everything is, for drawing and other collisions ----
    car.testPoints.length = 0;
    for (const p of st.hullPoints) {
      car.testPoints.push({ x: car.x + p.x * c - p.y * s, y: car.y + p.x * s + p.y * c, r: 0.15 });
    }
    for (const wh of car.wheels) {
      const ly = wh.ly - wh.len + wh.comp;   // wheel centre in car-local space
      wh.cx = car.x + wh.lx * c - ly * s;
      wh.cy = car.y + wh.lx * s + ly * c;
      car.testPoints.push({ x: wh.cx, y: wh.cy, r: wh.r });
    }
  },

  // A hard contact at point (px, py) with surface normal (nx, ny): stop moving into it,
  // bounce a little (restitution e) and scrape along it with friction.
  solidBounce(car, px, py, nx, ny, e, ev, isHull) {
    const m = car.mass, I = car.inertia;
    const rx = px - car.x, ry = py - car.y;
    const vpx = car.vx - car.w * ry, vpy = car.vy + car.w * rx;
    const vn = vpx * nx + vpy * ny;
    if (vn >= 0) return;                     // already moving away
    const rn = rx * ny - ry * nx;
    const Jn = -(1 + e) * vn / (1 / m + rn * rn / I);
    const tx = ny, ty = -nx;
    const vt = vpx * tx + vpy * ty;
    const rt = rx * ty - ry * tx;
    const Jt = SW.util.clamp(-vt / (1 / m + rt * rt / I), -0.5 * Jn, 0.5 * Jn);
    this.applyImpulse(car, nx * Jn + tx * Jt, ny * Jn + ty * Jt, px, py);
    if (isHull && -vn > ev.hullImpact) { ev.hullImpact = -vn; ev.hullX = px; ev.hullY = py; }
  },
};
