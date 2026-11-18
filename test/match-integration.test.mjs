import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];
const BENCH = ["GK", "CB", "CM", "ST", "LB", "CM"];

function makePlayer(id, position, overall, stamina = 80) {
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
      stamina,
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
  });
}

// A full-featured team: a bench (so substitutions fire), a real manager (so in-game
// mentality and tactics apply) and low-ish stamina (so fatigue and rotation matter).
function fullTeam(prefix, overall, stamina = 70) {
  return {
    xi: XI.map((position, i) =>
      makePlayer(`${prefix}-${i}`, position, position === "GK" ? overall + 2 : overall, stamina),
    ),
    bench: BENCH.map((position, i) =>
      makePlayer(`${prefix}-b${i}`, position, overall - 2, 95),
    ),
    formation: "4-3-3",
    strength: { attack: overall, midfield: overall, defence: overall, goalkeeping: overall },
    club: {
      manager: {
        playstyle: "High Press",
        coachingAttributes: { inGameDecisionMaking: 72 },
        tacticalSettings: { pressing: "Aggressive", defensiveLine: "High" },
      },
    },
  };
}

test("the full-featured match pipeline is deterministic", () => {
  for (const seed of [3, 7, 11, 42, 99]) {
    const run = () =>
      simulateQuickMatch(fullTeam(`h${seed}`, 78), fullTeam(`a${seed}`, 76, 65), {
        rng: new Rng(seed, "integration-determinism"),
        enableSubs: true,
        maxSubs: 5,
      });
    const a = run();
    const b = run();
    assert.deepEqual(a.events, b.events, `seed ${seed}: events identical`);
    assert.deepEqual(a.misc, b.misc, `seed ${seed}: misc identical`);
    assert.deepEqual(a.actions, b.actions, `seed ${seed}: actions identical`);
    assert.deepEqual(a.substitutions, b.substitutions, `seed ${seed}: subs identical`);
    assert.deepEqual(a.playerStats, b.playerStats, `seed ${seed}: player stats identical`);
    assert.equal(a.homeGoals, b.homeGoals);
    assert.equal(a.awayGoals, b.awayGoals);
  }
});

test("full-featured matches uphold cross-cutting invariants under load", () => {
  const seeds = 200;
  let matchesWithSubs = 0;
  let matchesWithPenalties = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const home = fullTeam(`h${seed}`, 78, 70);
    const away = fullTeam(`a${seed}`, 75, 62);
    const result = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "integration-soak"),
      enableSubs: true,
      maxSubs: 5,
    });

    // Score agrees with goal events.
    const goalEvents = result.events.filter((e) => e.type === "goal");
    assert.equal(
      result.homeGoals,
      goalEvents.filter((e) => e.side === "home").length,
      `seed ${seed}: home goals match events`,
    );
    assert.equal(
      result.awayGoals,
      goalEvents.filter((e) => e.side === "away").length,
      `seed ${seed}: away goals match events`,
    );

    for (const [side, team] of [["home", home], ["away", away]]) {
      const teamStats = result.stats[side];
      assert.ok(teamStats.shots >= teamStats.goals, `seed ${seed}: shots >= goals`);
      assert.ok(
        teamStats.shotsOnTarget >= teamStats.goals,
        `seed ${seed}: on target >= goals`,
      );
      assert.ok(
        teamStats.shotsOnTarget <= teamStats.shots,
        `seed ${seed}: on target <= shots`,
      );

      // Substitution minutes: every on-pitch slot is covered for the full match.
      const squadIds = new Set([
        ...team.xi.map((p) => p.id),
        ...team.bench.map((p) => p.id),
      ]);
      let minutes = 0;
      for (const id of squadIds) {
        const stats = result.playerStats[id];
        if (stats) minutes += stats.minutes;
      }
      // 11 slots * 90 minutes (subs shuffle bodies but never leave a slot uncovered).
      assert.ok(
        Math.abs(minutes - 11 * 90) <= 11,
        `seed ${seed}: ${side} minutes ${minutes} ~ 990`,
      );

      const subs = result.substitutions[side];
      if (subs.length > 0) matchesWithSubs++;
      for (const sub of subs) {
        const onStats = result.playerStats[sub.playerId];
        assert.ok(onStats && onStats.minutes > 0, `seed ${seed}: sub has minutes`);
      }
    }

    // Every penalty kick is backed by a penalty shot.
    const penaltyShots = result.actions.filter(
      (a) => a.type === "shot" && a.shotType === "penalty",
    );
    const penalties = result.misc.filter((e) => e.type === "penalty");
    assert.equal(penaltyShots.length, penalties.length, `seed ${seed}: penalties = shots`);
    if (penalties.length > 0) matchesWithPenalties++;
  }

  assert.ok(matchesWithSubs > 0, "substitutions occur across the sample");
  assert.ok(matchesWithPenalties > 0, "penalties occur across the sample");
});

test("disabling features leaves a clean, invariant-preserving match", () => {
  // No bench and enableSubs:false: a pure open-play match must still satisfy the core
  // score/shot/goal invariants and be deterministic.
  for (let seed = 1; seed <= 60; seed++) {
    const team = (prefix, ov) => ({
      xi: XI.map((pos, i) => makePlayer(`${prefix}-${i}`, pos, ov)),
      bench: [],
      formation: "4-3-3",
      strength: { attack: ov, midfield: ov, defence: ov, goalkeeping: ov },
      club: { manager: { playstyle: "Balanced", tacticalSettings: { pressing: "Balanced" } } },
    });
    const result = simulateQuickMatch(team(`h${seed}`, 78), team(`a${seed}`, 74), {
      rng: new Rng(seed, "integration-clean"),
      enableSubs: false,
    });
    const goals = result.events.filter((e) => e.type === "goal");
    assert.equal(result.homeGoals, goals.filter((e) => e.side === "home").length);
    for (const side of ["home", "away"]) {
      const t = result.stats[side];
      assert.ok(t.shots >= t.goals);
      assert.ok(t.shotsOnTarget >= t.goals);
    }
    assert.equal(result.substitutions.home.length, 0);
    assert.equal(result.substitutions.away.length, 0);
  }
});