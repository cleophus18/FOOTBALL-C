/**
 * A football bouncing on a pitch, simulated rather than keyframed.
 *
 * The menu ball used to be a hand-tuned CSS keyframe pie. This integrates Newtonian
 * motion every animation frame instead, so everything that makes a real bounce look
 * real happens on its own:
 *
 *   - gravity (9.81 m/s²) gives the parabola, and the slowing at the apex,
 *   - every impact is inelastic: the outgoing speed is `restitution` times the incoming
 *     speed, and the loss is what stops the ball climbing back to the same height,
 *   - the ball also loses energy during flight to air resistance, so successive hops
 *     are not just smaller but the rise/flight ratio changes too,
 *   - horizontal rolling friction means a little forward travel is scrubbed off on
 *     every contact, while the ball keeps moving forward (no sliding on the spot),
 *   - the contact frame squashes the ball along the surface normal and it springs
 *     back, like a tyre: the harder the impact, the deeper the squash.
 *
 * Spin: a ball with backspin — the ball is rotating backwards as it drops, like a
 * dropped ball whose bottom surface is dragged backwards by the floor — converts some
 * of its spin into forward velocity on impact (the Magnus/rebound coupling), which is
 * why a real dropped ball pops forward on the bounce instead of falling straight down.
 * The rendered rotation tracks the visual travel, so scars (the ball's pattern) spin
 * at a plausible rate rather than a guessed one.
 */

/** metres per second², the real thing. */
export const GRAVITY = 9.81;

export const BALL_DEFAULTS = {
  // A football keeps roughly 75-80% of its speed off a firm pitch.
  restitution: 0.78,
  // Quadratic-ish drag, tuned so the ball is a little more floaty than in vacuum.
  airDrag: 0.06,
  // Fraction of the bounce that hops forward, from spin coupling.
  forwardKick: 0.22,
  // Rolling friction during contact.
  groundFriction: 0.16,
};

/**
 * Squash factor at contact. Independent of the frame rate so a slow device looks the
 * same as a fast one.
 *
 * @param {number} speed  impact speed in m/s
 * @param {number} maxSpeed  speed that produces the deepest allowed squash
 */
export function squashFor(speed, maxSpeed = 4.2) {
  // Below ~1 m/s the ball is resting; above maxSpeed it is a hard drop.
  const t = Math.min(1, Math.max(0, speed / maxSpeed));
  const eased = t * t * (3 - 2 * t);
  return 0.1 + eased * 0.1; // 10%..20% compression
}

/**
 * One step of free flight.
 *
 * @param {{x:number,y:number,vx:number,vy:number}} body  metres, metres/second, y up
 * @param {number} dt  seconds
 * @param {object} cfg  overrides for BALL_DEFAULTS
 */
export function integrateFlight(body, dt, cfg = BALL_DEFAULTS) {
  const drag = Math.exp(-cfg.airDrag * dt);
  body.vy -= GRAVITY * dt;
  body.vx *= drag;
  body.vy *= drag;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

/**
 * Resolve a bounce off the floor (y = 0).
 *
 * Returns the new body, the impact speed (for the squash) and whether the ball has
 * come to rest (then the simulation restarts it with a fresh kick).
 */
export function bounceOnFloor(body, cfg = BALL_DEFAULTS) {
  const impact = Math.abs(body.vy);
  body.y = 0;
  body.vy = impact * cfg.restitution;
  // Backspin becomes forward roll: the faster the impact, the more it pops forward.
  body.vx += impact * cfg.restitution * cfg.forwardKick;
  body.vx *= 1 - cfg.groundFriction * Math.min(1, impact / 3);
  return { impact, resting: body.vy < 0.35 };
}

/**
 * Create a simulation for a throw-in at the start of the menu.
 *
 * @param {object} opts
 *   heightM     apex the ball should reach (metres above the floor)
 *   dropHeightM height the ball is released from
 *   cfg         physics overrides
 */
export function createBallSimulation({
  apexM = 0.62,
  dropFromM = 0.42,
  spawnX = 0,
  cfg = BALL_DEFAULTS,
} = {}) {
  // v = sqrt(2 g h) is the speed needed to reach the apex — neatly, the ball is just
  // released from a bit lower and the first bounce sends it to apexM.
  const launch = Math.sqrt(2 * GRAVITY * apexM);
  const body = {
    x: spawnX,
    y: dropFromM,
    vx: 0.16,
    vy: 0,
    angle: 0,
    squash: 0,
    impact: 0,
    hops: 0,
    time: 0,
    landings: [],
  };
  return {
    body,
    cfg,
    apexM,
    /** Advance the world by dt seconds. */
    step(dt) {
      const clamped = Math.min(dt, 1 / 30); // never let a stutter tunnel the ball
      body.time += clamped;
      body.angle += (body.vx * clamped * 180) / Math.PI / 0.11; // radius 0.11 m
      body.squash = Math.max(0, body.squash - clamped * 12);
      integrateFlight(body, clamped, cfg);
      if (body.y <= 0) {
        const { impact, resting } = bounceOnFloor(body, cfg);
        body.hops += 1;
        body.impact = impact;
        body.squash = squashFor(impact);
        body.landings.push({ x: body.x, t: body.time, impact });
        if (resting) this.restart(launch);
      }
      return body;
    },
    /** Kick the ball again with a given launch speed (m/s, upwards). */
    restart(vy = launch) {
      body.y = 0.002;
      body.vy = Math.abs(vy);
      body.x = spawnX;
      body.vx = 0.16;
      body.hops = 0;
      body.landings = [];
    },
  };
}

/**
 * The screen-space transform for the ball, given its simulated position.
 *
 * @param {object} body
 * @param {object} opts
 *   pxPerMetre   horizontal scale
 *   bouncePx     pixels the ball rises for one metre of height
 *   sizePx       rendered ball diameter
 *   maxDistanceM how far the ball may travel before the caller shifts its origin
 */
export function ballTransform(body, opts) {
  const { pxPerMetre = 260, bouncePx = 90, sizePx = 100 } = opts;
  const squash = body.squash;
  // Volume-preserving squash: wider by (1+s), shorter by (1-s), anchored at the floor.
  const scaleY = 1 - squash;
  const scaleX = 1 + squash * 0.9;
  return {
    translateX: body.x * pxPerMetre,
    translateY: -body.y * bouncePx - sizePx * squash * 0.5,
    scaleX,
    scaleY,
    rotate: body.angle,
    speed: Math.hypot(body.vx, body.vy),
  };
}
