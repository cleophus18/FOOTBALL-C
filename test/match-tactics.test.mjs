import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import {
  mentalityFor,
  simulatePossessionEngine,
} from "../src/sim/event-engine.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];

function makePlayer(id, position, overall) {
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
  });
}

function makeTeam(prefix, overall, adaptability = 70) {
  return {
    xi: XI.map((position, i) => makePlayer(`${prefix}-${i}`, position, overall)),
    bench: [],
    formation: "4-3-3",
    strength: {
      attack: overall,
      midfield: overall,
      defence: overall,
      goalkeeping: overall,
    },
    club: {
      manager: {
        playstyle: "Balanced",
        coachingAttributes: { inGameDecisionMaking: adaptability },
        tacticalSettings: { pressing: "Balanced", defensiveLine: "Balanced" },
      },
    },
  };
}

test("mentality reflects game state: chase when behind, protect when ahead", () => {
  // Level game: no tactical lean.
  assert.equal(mentalityFor(1, 1, 80, 70), 0);
  // Behind late: positive (chasing).
  assert.ok(mentalityFor(0, 1, 80, 70) > 0, "behind should chase");
  // Ahead late: negative (protecting).
  assert.ok(mentalityFor(2, 0, 80, 70) < 0, "ahead should protect");
});

test("mentality ramps in late and is stronger for adaptable managers", () => {
  // Early on there is no lean even if behind.
  assert.equal(mentalityFor(0, 1, 20, 70), 0);
  // The lean grows from 60' to 85'.
  const at60 = mentalityFor(0, 1, 60, 70);
  const at85 = mentalityFor(0, 1, 85, 70);
  assert.ok(Math.abs(at85) > Math.abs(at60), "mentality ramps up late");

  // A more adaptable manager reacts more strongly.
  const lowAdapt = mentalityFor(0, 1, 85, 40);
  const highAdapt = mentalityFor(0, 1, 85, 90);
  assert.ok(highAdapt > lowAdapt, "adaptable managers chase harder");
});

test("protecting a lead keeps the ball better than chasing the game", () => {
  let aheadAtt = 0;
  let aheadComp = 0;
  let behindAtt = 0;
  let behindComp = 0;
  const seeds = 250;
  for (let seed = 1; seed <= seeds; seed++) {
    const result = simulatePossessionEngine({
      home: makeTeam(`h${seed}`, 78),
      away: makeTeam(`a${seed}`, 77),
      baselineXg: { home: 1.35, away: 1.15 },
      rng: new Rng(seed, "phase4-mentality"),
      minutes: 90,
      enableSubs: false,
    });
    // Home scoreline at the 70' mark, then updated through late goals.
    let homeGoals = 0;
    let awayGoals = 0;
    for (const event of result.events) {
      if (event.type !== "goal") continue;
      if (event.minute < 70) {
        if (event.side === "home") homeGoals++;
        else awayGoals++;
      }
    }
    for (const event of result.events) {
      if (event.type !== "goal" || event.minute < 70) continue;
      if (event.side === "home") homeGoals++;
      else awayGoals++;
    }
    for (const action of result.actions) {
      if (action.side !== "home" || action.type !== "pass" || action.minute < 70) continue;
      if (homeGoals > awayGoals) {
        aheadAtt++;
        if (action.completed) aheadComp++;
      } else if (homeGoals < awayGoals) {
        behindAtt++;
        if (action.completed) behindComp++;
      }
    }
  }
  assert.ok(aheadAtt > 500 && behindAtt > 500, "enough late samples");
  const aheadPct = (100 * aheadComp) / aheadAtt;
  const behindPct = (100 * behindComp) / behindAtt;
  // The side protecting a lead drops its intensity and keeps the ball better than the
  // side chasing, which presses higher and tires itself.
  assert.ok(
    aheadPct > behindPct + 0.3,
    `ahead late pass% (${aheadPct.toFixed(2)}) should beat behind (${behindPct.toFixed(2)})`,
  );
});

test("in-game mentality preserves determinism", () => {
  const run = () =>
    simulateQuickMatch(makeTeam("h", 78, 85), makeTeam("a", 76, 45), {
      rng: new Rng(9001, "phase4-determinism"),
      enableSubs: false,
    });
  const a = run();
  const b = run();
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.playerStats, b.playerStats);
  assert.equal(a.homeGoals, b.homeGoals);
});