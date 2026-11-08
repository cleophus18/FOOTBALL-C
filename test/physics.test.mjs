import test from "node:test";
import assert from "node:assert/strict";
import {
  BALL_DEFAULTS,
  GRAVITY,
  ballTransform,
  bounceOnFloor,
  createBallSimulation,
  squashFor,
} from "../src/ui/ball-physics.mjs";
import {
  applyPhysique,
  bodyBuild,
  physiqueFactors,
  physiqueProfile,
} from "../src/model/player.mjs";

/** Run the simulation for `seconds` at 60 fps and collect every frame. */
function simulate(seconds, opts = {}) {
  const sim = createBallSimulation(opts);
  const frames = [];
  for (let t = 0; t < seconds * 60; t++) frames.push({ ...sim.step(1 / 60) });
  return frames;
}

test("gravity is the real thing and a free fall follows h = ½gt²", () => {
  assert.equal(GRAVITY, 9.81);
  const sim = createBallSimulation({ dropFromM: 1, apexM: 1 });
  // Drop 1 m: the real time to fall is sqrt(2h/g) ≈ 0.4515 s.
  let frames = 0;
  while (sim.body.y > 0 && frames < 600) {
    sim.step(1 / 120);
    frames++;
  }
  const seconds = frames / 120;
  assert.ok(
    Math.abs(seconds - Math.sqrt(2 / 9.81)) < 0.02,
    `fell in ${seconds}s`,
  );
});

test("each bounce loses energy, so hops get lower and shorter", () => {
  const frames = simulate(12, { apexM: 0.8, dropFromM: 0.8 });
  // Split the flight into hops at every contact.
  const peaks = [];
  let current = 0;
  for (const frame of frames) {
    if (frame.hops > 0 && frame.y < 0.001 && current > 0) {
      peaks.push(current);
      current = 0;
      continue;
    }
    current = Math.max(current, frame.y);
  }
  assert.ok(peaks.length >= 3, `only ${peaks.length} hops`);
  // Compare consecutive hops until the ball comes to rest (contract kicks it again).
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i] < 0.05) break;
    assert.ok(
      peaks[i] < peaks[i - 1],
      `hop ${i} was not lower than hop ${i - 1}`,
    );
  }
});

test("restitution and the resting threshold behave like a real ball", () => {
  const body = { x: 0, y: 0, vx: 0.4, vy: -3, angle: 0, squash: 0 };
  const { impact, resting } = bounceOnFloor(body, BALL_DEFAULTS);
  assert.equal(impact, 3);
  assert.ok(Math.abs(body.vy - 3 * BALL_DEFAULTS.restitution) < 1e-9);
  // It pops forward off the bounce instead of dropping straight down.
  assert.ok(body.vx > 0.4);
  assert.equal(resting, false);

  const slow = { x: 0, y: 0, vx: 0, vy: -0.1, angle: 0 };
  assert.equal(bounceOnFloor(slow).resting, true);
});

test("a hard impact squashes more than a soft one", () => {
  assert.ok(squashFor(4) > squashFor(1));
  assert.ok(squashFor(0) >= 0.1 && squashFor(100) <= 0.2);
});

test("the ball always stays on or above the floor and keeps moving", () => {
  const frames = simulate(20, { apexM: 0.75 });
  for (const frame of frames)
    assert.ok(frame.y >= -1e-9, "ball went under the floor");
  // The simulation loops back to its spawn point at rest, so measure the furthest
  // point within a cycle rather than start-to-finish displacement.
  let furthest = 0;
  for (const frame of frames) furthest = Math.max(furthest, Math.abs(frame.x));
  assert.ok(furthest > 0.1, "ball never moved forward");
});

test("screen transform anchors the squash at the floor and shrinks with height", () => {
  const low = ballTransform(
    { x: 0, y: 0, vx: 1, vy: 0, angle: 0, squash: 0.15 },
    {},
  );
  const high = ballTransform(
    { x: 0, y: 0.8, vx: 1, vy: 0, angle: 0, squash: 0 },
    {},
  );
  assert.ok(low.translateY > high.translateY);
  assert.ok(low.scaleY < 1 && low.scaleX > 1);
});

test("physique: a heavy player is slower and stronger, a short one jumps less", () => {
  const heavy = physiqueProfile("ST", 178, 95);
  const lean = physiqueProfile("ST", 178, 62);
  assert.ok(heavy.attrs.pace < lean.attrs.pace);
  assert.ok(heavy.attrs.physical > lean.attrs.physical);
  assert.ok(heavy.subAttrs.sprintSpeed < lean.subAttrs.sprintSpeed);
  assert.ok(heavy.subAttrs.strength > lean.subAttrs.strength);

  const short = physiqueProfile("CM", 162, 62);
  const tall = physiqueProfile("CM", 194, 88);
  assert.ok(short.subAttrs.jumping < tall.subAttrs.jumping);
  assert.ok(short.subAttrs.headingAccuracy < tall.subAttrs.headingAccuracy);
  // Small players keep the ball closer to their feet and turn faster.
  assert.ok(short.subAttrs.ballControl > tall.subAttrs.ballControl);
  assert.ok(short.subAttrs.agility > tall.subAttrs.agility);
  assert.ok(short.subAttrs.balance > tall.subAttrs.balance);
});

test("physique: a neutral build changes nothing, and the pass is idempotent", () => {
  const neutral = physiqueProfile("CM", 180, 75);
  for (const [key, value] of Object.entries(neutral.attrs)) {
    assert.ok(Math.abs(value - 1) < 0.03, `${key} moved by ${value}`);
  }
  const player = {
    position: "CM",
    height: 195,
    weight: 98,
    attrs: {
      pace: 80,
      shooting: 60,
      passing: 70,
      dribbling: 70,
      defending: 50,
      physical: 70,
    },
    gkAttrs: {},
    subAttrs: {
      sprintSpeed: 80,
      strength: 70,
      jumping: 60,
      agility: 70,
      balance: 70,
      ballControl: 70,
      headingAccuracy: 60,
    },
  };
  applyPhysique(player);
  const first = { ...player.attrs };
  applyPhysique(player);
  assert.deepEqual(
    player.attrs,
    first,
    "applying the body twice must not double-penalise",
  );
});

test("physique: build labels read like a scouting report", () => {
  assert.match(bodyBuild(178, 60), /Lean/);
  assert.match(bodyBuild(190, 88), /tall/);
  assert.match(bodyBuild(165, 90), /Heavy|Strong/);
  const f = physiqueFactors(200, 60);
  assert.ok(f.stature > 0 && f.mass < 0);
});
