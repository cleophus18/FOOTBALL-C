import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { simulatePossessionEngine } from "../src/sim/event-engine.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";
import { Career } from "../src/career.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];

function makePlayer(id, position, overall, stamina) {
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

function makeTeam(prefix, rating, stamina) {
  const xi = XI.map((position, i) =>
    makePlayer(`${prefix}-${i}`, position, rating, stamina),
  );
  return {
    xi,
    bench: [],
    formation: "4-3-3",
    strength: {
      attack: rating,
      midfield: rating,
      defence: rating,
      goalkeeping: rating,
    },
  };
}

function passAccuracyByBand(stamina, seeds = 120) {
  let earlyAtt = 0;
  let earlyComp = 0;
  let lateAtt = 0;
  let lateComp = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const result = simulatePossessionEngine({
      home: makeTeam(`h${seed}`, 78, stamina),
      away: makeTeam(`a${seed}`, 78, stamina),
      baselineXg: { home: 1.35, away: 1.15 },
      rng: new Rng(seed, "phase3-fatigue"),
      minutes: 90,
      enableSubs: false,
    });
    for (const action of result.actions) {
      if (action.side !== "home" || action.type !== "pass") continue;
      if (action.minute >= 65) {
        lateAtt++;
        if (action.completed) lateComp++;
      } else {
        earlyAtt++;
        if (action.completed) earlyComp++;
      }
    }
  }
  return {
    early: (100 * earlyComp) / earlyAtt,
    late: (100 * lateComp) / lateAtt,
  };
}

test("in-match fatigue degrades tired players late, not when fresh", () => {
  const fresh = passAccuracyByBand(95);
  const tired = passAccuracyByBand(40);
  // Early on, both are fresh: pass completion should be close.
  assert.ok(
    Math.abs(fresh.early - tired.early) < 1.5,
    `fresh vs tired early pass % too far apart: ${fresh.early} vs ${tired.early}`,
  );
  // Late on, the low-stamina side should be measurably worse.
  assert.ok(
    tired.late < fresh.late - 0.5,
    `tired late pass % (${tired.late}) should trail fresh (${fresh.late})`,
  );
});

test("in-match fatigue preserves determinism", () => {
  const run = () =>
    simulateQuickMatch(makeTeam("h", 78, 55), makeTeam("a", 77, 55), {
      rng: new Rng(2024, "phase3-determinism"),
      enableSubs: false,
    });
  const a = run();
  const b = run();
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.playerStats, b.playerStats);
  assert.equal(a.homeGoals, b.homeGoals);
});

test("rest days before the next match reflect fixture congestion", () => {
  const stub = Object.create(Career.prototype);
  stub.season = 1;

  // No history: a fully rested player recovers a full week.
  assert.equal(stub.restDaysBeforeNextMatch({ matchHistory: [] }, 100), 7);
  assert.equal(stub.restDaysBeforeNextMatch({}, 100), 7);

  // Played two days before the next match: a congested turnaround.
  assert.equal(
    stub.restDaysBeforeNextMatch({ matchHistory: [{ season: 1, dateIndex: 98 }] }, 100),
    2,
  );

  // Played over a week ago: full recovery (clamped at 7).
  assert.equal(
    stub.restDaysBeforeNextMatch({ matchHistory: [{ season: 1, dateIndex: 90 }] }, 100),
    7,
  );

  // A last match from a previous season is ignored.
  assert.equal(
    stub.restDaysBeforeNextMatch({ matchHistory: [{ season: 0, dateIndex: 99 }] }, 100),
    7,
  );

  // History entries without a usable date are skipped.
  assert.equal(
    stub.restDaysBeforeNextMatch({ matchHistory: [{ season: 1 }, { season: 1, dateIndex: 97 }] }, 100),
    3,
  );
});

test("congestion recovery leaves one-match-a-week players unaffected", () => {
  const stub = Object.create(Career.prototype);
  stub.season = 1;
  // A player who last played exactly one week (7 days) before the next match is
  // fully recovered — the heart of "dynamic" not "punishing" stamina.
  const lastWeek = stub.restDaysBeforeNextMatch(
    { matchHistory: [{ season: 1, dateIndex: 93 }] },
    100,
  );
  assert.equal(lastWeek, 7);
});