import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import {
  decidePlayerAction,
  playerLevel,
  simulateNpcPerformance,
  rateNpcPerformance,
} from "../src/sim/playerintelligence.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";
import { calculateOverall } from "../src/model/player.mjs";

function player(id, position, overall, attrs = {}) {
  const defaults = {
    pace: overall,
    shooting: overall,
    passing: overall,
    dribbling: overall,
    defending: overall,
    physical: overall,
  };
  return createPlayer({
    id,
    first: id,
    last: "Test",
    position,
    overall,
    potential: 99,
    attrs: { ...defaults, ...attrs },
    subAttrs: {
      finishing: overall,
      longShots: overall,
      vision: overall,
      shortPassing: overall,
      longPassing: overall,
      crossing: overall,
      ballControl: overall,
      agility: overall,
      stamina: overall,
      defensiveAwareness: overall,
      interceptions: overall,
      standingTackle: overall,
      acceleration: overall,
      sprintSpeed: overall,
      composure: overall,
      strength: overall,
      headingAccuracy: overall,
      attackingPositioning: overall,
    },
    gkAttrs: {
      reflexes: overall,
      handling: overall,
      positioning: overall,
      kicking: overall,
    },
    age: 26,
  });
}

test("player levels and contextual decisions distinguish elite strikers and playmakers", () => {
  const elite = player("elite", "ST", 92);
  const novice = player("novice", "ST", 67);
  assert.equal(playerLevel(elite).label, "world-class");
  const context = {
    position: "ST",
    shotQuality: 0.9,
    space: 0.8,
    pressure: 0.15,
    scoreFor: 0,
    scoreAgainst: 0,
    minute: 65,
  };
  const good = decidePlayerAction(elite, context, new Rng(12, "elite"));
  const weak = decidePlayerAction(novice, context, new Rng(12, "novice"));
  assert.ok(good.successChance > weak.successChance);
  assert.equal(
    decidePlayerAction(
      player("mid", "CM", 88),
      { position: "CM", laneQuality: 0.95, pressure: 0.1 },
      new Rng(44, "pass"),
    ).action,
    "throughBall",
  );
});

test("relevant attributes dominate mismatched overall for specialized actions", () => {
  const fast = player("fast", "LW", 78, { pace: 95, dribbling: 82 });
  const technician = player("tech", "LW", 86, { pace: 62, dribbling: 94 });
  assert.ok(
    decidePlayerAction(
      fast,
      { position: "LW", space: 0.95, pressure: 0.1 },
      new Rng(7, "run"),
    ).successChance > 0,
  );
  const quickRun = decidePlayerAction(
    fast,
    { position: "LW", space: 0.95, pressure: 0.1 },
    new Rng(7, "run"),
  );
  const closeControl = decidePlayerAction(
    technician,
    { position: "LW", space: 0.3, pressure: 0.7 },
    new Rng(7, "close"),
  );
  assert.ok(quickRun.ability !== closeControl.ability);
});

test("NPC match performances and position-specific ratings respond to ability and fatigue", () => {
  const elite = player("elite-st", "ST", 92);
  const low = player("low-st", "ST", 65);
  const elitePerf = simulateNpcPerformance(
    elite,
    { position: "ST", pressure: 0.1, space: 0.8 },
    { poisson: (lambda) => Math.round(lambda), chance: (p) => p > 0.5 },
  );
  const lowPerf = simulateNpcPerformance(
    low,
    { position: "ST", pressure: 0.8, space: 0.15 },
    { poisson: (lambda) => Math.round(lambda), chance: (p) => p > 0.5 },
  );
  assert.ok(elitePerf.decisionQuality > lowPerf.decisionQuality);
  assert.ok(elitePerf.shotsOnTarget >= lowPerf.shotsOnTarget);
  const keeper = player("keeper", "GK", 90);
  const gkScore = rateNpcPerformance(
    keeper,
    { minutes: 90, saves: 7, passAttempts: 20, completedPasses: 16 },
    { position: "GK", won: false, goalsConceded: 2 },
  );
  const defenderScore = rateNpcPerformance(
    player("cb", "CB", 80),
    { minutes: 90, tacklesWon: 5, interceptions: 4, aerialsWon: 5 },
    { position: "CB", won: false, goalsConceded: 2 },
  );
  assert.ok(gkScore > 6.5 && defenderScore > 6.5);
  elite.fatigue = 92;
  assert.equal(calculateOverall(elite), 91);
});

test("background quick-match probabilities remain seeded and are affected by player XI quality", () => {
  const xiStrong = [player("striker", "ST", 95), player("keeper", "GK", 85)];
  const xiWeak = [player("striker2", "ST", 58), player("keeper2", "GK", 55)];
  const strong = simulateQuickMatch(
    { strength: { attack: 72, defence: 72 }, xi: xiStrong },
    { strength: { attack: 68, defence: 68 }, xi: xiWeak },
    { rng: new Rng(123, "quick") },
  );
  const replay = simulateQuickMatch(
    { strength: { attack: 72, defence: 72 }, xi: xiStrong },
    { strength: { attack: 68, defence: 68 }, xi: xiWeak },
    { rng: new Rng(123, "quick") },
  );
  assert.deepEqual(strong, replay);
  assert.ok(Number.isFinite(strong.xg.home) && strong.xg.home >= 0);
  assert.equal(strong.xg.home, strong.stats.home.xg);
});
