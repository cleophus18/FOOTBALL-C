import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { scorePenalty, simulatePossessionEngine } from "../src/sim/event-engine.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];

function makePlayer(id, position, overall, extra = {}) {
  return createPlayer({
    id,
    first: id,
    last: "Test",
    position,
    overall,
    potential: 99,
    age: 24,
    attrs: {
      pace: overall,
      shooting: overall,
      passing: overall,
      dribbling: overall,
      defending: overall,
      physical: overall,
    },
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
      attackingPositioning: overall,
    },
    gkAttrs: {
      reflexes: overall,
      diving: overall,
      handling: overall,
      positioning: overall,
      reactions: overall,
    },
    stamina: 100,
    fatigue: 0,
    ...extra,
  });
}

function makeTeam(prefix, overall) {
  return {
    xi: XI.map((position, i) => makePlayer(`${prefix}-${i}`, position, overall)),
    bench: [],
    formation: "4-3-3",
    strength: { attack: overall, midfield: overall, defence: overall, goalkeeping: overall },
  };
}

// A deterministic rng stub whose chance() returns a scripted sequence.
function scriptedRng(values) {
  let i = 0;
  return { chance: () => values[Math.min(i++, values.length - 1)] };
}

function blankStats() {
  const side = () => ({
    goals: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    saves: 0,
  });
  return { home: side(), away: side() };
}

test("a converted penalty scores, counts as a shot, and is on target", () => {
  const taker = makePlayer("h-9", "ST", 80);
  const opponent = makeTeam("a", 75);
  const playerStats = {};
  const stats = blankStats();
  const score = { home: 0, away: 0 };
  const events = [];
  const misc = [];
  const actions = [];

  const goal = scorePenalty({
    side: "home",
    taker,
    opponent,
    playerStats,
    score,
    stats,
    events,
    misc,
    actions,
    rng: scriptedRng([true]),
    maxLeagueGoals: null,
    minute: 70,
  });

  assert.equal(goal, true);
  assert.equal(score.home, 1);
  assert.equal(stats.home.goals, 1);
  assert.equal(stats.home.shots, 1);
  assert.equal(stats.home.shotsOnTarget, 1);
  assert.ok(stats.home.xg > 0);
  // A penalty shot action and a goal event are both recorded.
  assert.equal(actions.filter((a) => a.type === "shot" && a.shotType === "penalty").length, 1);
  assert.equal(events.filter((e) => e.type === "goal" && e.penalty).length, 1);
  // The taker is credited with a goal and a shot.
  assert.equal(playerStats[taker.id].goals, 1);
  assert.equal(playerStats[taker.id].shots, 1);
  assert.equal(playerStats[taker.id].shotsOnTarget, 1);
});

test("a penalty that is saved is on target but not a goal", () => {
  const taker = makePlayer("h-9", "ST", 80);
  const opponent = makeTeam("a", 75);
  const playerStats = {};
  const stats = blankStats();
  const score = { home: 0, away: 0 };
  const events = [];
  const misc = [];
  const actions = [];

  const goal = scorePenalty({
    side: "home",
    taker,
    opponent,
    playerStats,
    score,
    stats,
    events,
    misc,
    actions,
    rng: scriptedRng([false, true]), // not goal, but on target
    maxLeagueGoals: null,
    minute: 70,
  });

  assert.equal(goal, false);
  assert.equal(stats.home.goals, 0);
  assert.equal(stats.home.shots, 1);
  assert.equal(stats.home.shotsOnTarget, 1);
  assert.equal(stats.away.saves, 1);
  const keeper = opponent.xi.find((p) => p.position === "GK");
  assert.equal(playerStats[keeper.id].saves, 1);
});

test("a penalty respects the league goal cap", () => {
  const taker = makePlayer("h-9", "ST", 80, { leagueGoals: 5 });
  const opponent = makeTeam("a", 75);
  const playerStats = {};
  const stats = blankStats();
  const score = { home: 0, away: 0 };
  const events = [];
  const misc = [];
  const actions = [];

  // Even with a "would-score" roll, the taker is at the cap so it cannot be a goal.
  const goal = scorePenalty({
    side: "home",
    taker,
    opponent,
    playerStats,
    score,
    stats,
    events,
    misc,
    actions,
    rng: scriptedRng([true]),
    maxLeagueGoals: 5,
    minute: 70,
  });

  assert.equal(goal, false);
  assert.equal(stats.home.goals, 0);
  assert.equal(events.filter((e) => e.type === "goal").length, 0);
  // It is still recorded as a shot.
  assert.equal(stats.home.shots, 1);
});

test("every foul is followed by a free-kick restart", () => {
  let fouls = 0;
  let freeKicks = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const result = simulateQuickMatch(makeTeam(`h${seed}`, 78), makeTeam(`a${seed}`, 74), {
      rng: new Rng(seed, "realism-fk"),
    });
    for (const event of result.misc) {
      if (event.type === "foul") fouls++;
      if (event.type === "freeKick") freeKicks++;
    }
  }
  assert.ok(fouls > 0, "fouls occur");
  assert.equal(freeKicks, fouls, "each foul restarts play with a free kick");
});

test("penalties flow through shots and goal events consistently", () => {
  let penalties = 0;
  let penaltyGoals = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const result = simulateQuickMatch(makeTeam(`h${seed}`, 78), makeTeam(`a${seed}`, 74), {
      rng: new Rng(seed, "realism-pen"),
    });
    const penaltyShots = result.actions.filter(
      (a) => a.type === "shot" && a.shotType === "penalty",
    );
    const penaltyEvents = result.misc.filter((e) => e.type === "penalty");
    assert.equal(
      penaltyShots.length,
      penaltyEvents.length,
      `seed ${seed}: each penalty has one shot`,
    );
    for (const event of result.events) {
      if (event.type === "goal" && event.penalty) {
        penaltyGoals++;
        // A penalty goal is a penalty kick that scored.
        assert.ok(
          penaltyEvents.some((p) => p.goal && p.playerId === event.scorerId),
          `seed ${seed}: penalty goal matches a scored penalty`,
        );
      }
    }
    penalties += penaltyEvents.length;
    // Team shot totals include the penalty shots.
    for (const side of ["home", "away"]) {
      const sidePenShots = penaltyShots.filter((a) => a.side === side).length;
      assert.ok(
        result.stats[side].shots >= sidePenShots,
        `seed ${seed}: ${side} shots include penalties`,
      );
    }
  }
  assert.ok(penalties > 0, "penalties occur over a large sample");
  // Conversion rate should be in a realistic band.
  const conversion = penaltyGoals / penalties;
  assert.ok(conversion > 0.6 && conversion < 0.95, `penalty conversion ${conversion}`);
});

test("realism additions preserve determinism", () => {
  const run = () =>
    simulateQuickMatch(makeTeam("h", 78), makeTeam("a", 75), {
      rng: new Rng(555, "realism-determinism"),
    });
  const a = run();
  const b = run();
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.misc, b.misc);
  assert.deepEqual(a.actions, b.actions);
});