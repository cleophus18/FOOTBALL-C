import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../src/model/player.mjs";
import {
  computeRating,
  matchRatingFromStats,
} from "../src/sim/playermatch.mjs";

function makePlayer(id, position, overall = 75) {
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

function match(homeGoals, awayGoals) {
  return { homeGoals, awayGoals };
}

test("an event-sourced goalkeeper rating rewards saves and clean sheets", () => {
  const keeper = makePlayer("home-0", "GK", 78);
  const brickWall = {
    minutes: 90,
    goals: 0,
    assists: 0,
    passAttempts: 20,
    completedPasses: 18,
    saves: 9,
    goalsConceded: 0,
  };
  const exposed = {
    minutes: 90,
    goals: 0,
    assists: 0,
    passAttempts: 20,
    completedPasses: 14,
    saves: 1,
    goalsConceded: 4,
  };
  // A clean sheet with many saves (1-0 win).
  const great = matchRatingFromStats(keeper, "GK", brickWall, match(1, 0), "home");
  // A shaky display shipping four (2-4 loss).
  const poor = matchRatingFromStats(keeper, "GK", exposed, match(2, 4), "home");
  assert.ok(great > poor, `clean sheet (${great}) should out-rate shipping four (${poor})`);
});

test("an event-sourced defender rating rewards tackles and interceptions", () => {
  const defender = makePlayer("home-4", "CB", 75);
  const dominant = {
    minutes: 90,
    tacklesWon: 7,
    interceptions: 5,
    aerialsWon: 4,
    duels: 10,
    duelsWon: 8,
    dribbles: 0,
    dribblesWon: 0,
    goals: 0,
    assists: 0,
    passAttempts: 40,
    completedPasses: 35,
    keyPasses: 0,
    saves: 0,
    goalsConceded: 0,
    yellowCards: 0,
    redCards: 0,
    foulsCommitted: 1,
  };
  const anonymous = { ...dominant, tacklesWon: 0, interceptions: 0, aerialsWon: 0, duelsWon: 3 };
  const strong = matchRatingFromStats(defender, "CB", dominant, match(1, 0), "home");
  const quiet = matchRatingFromStats(defender, "CB", anonymous, match(1, 0), "home");
  assert.ok(strong > quiet, `dominant CB (${strong}) should out-rate anonymous one (${quiet})`);
});

test("a red card and fouls drag an event-sourced rating down", () => {
  const mid = makePlayer("home-6", "CM", 75);
  const clean = {
    minutes: 90,
    yellowCards: 0,
    redCards: 0,
    foulsCommitted: 0,
    goals: 0,
    assists: 0,
    passAttempts: 40,
    completedPasses: 34,
  };
  const booked = { ...clean, yellowCards: 1, foulsCommitted: 4 };
  const sentOff = { ...clean, redCards: 1, foulsCommitted: 6 };
  const base = matchRatingFromStats(mid, "CM", clean, match(1, 1), "home");
  const caution = matchRatingFromStats(mid, "CM", booked, match(1, 1), "home");
  const dismissal = matchRatingFromStats(mid, "CM", sentOff, match(1, 1), "home");
  assert.ok(base > caution, "a booking lowers the rating");
  assert.ok(caution > dismissal, "a red card lowers it further");
});

test("a player who did not feature has no event-sourced rating", () => {
  const player = makePlayer("home-10", "ST", 75);
  assert.equal(matchRatingFromStats(player, "ST", null, match(1, 0), "home"), null);
  assert.equal(
    matchRatingFromStats(player, "ST", { minutes: 0 }, match(1, 0), "home"),
    null,
  );
});

test("matchRatingFromStats is deterministic and within the rating band", () => {
  const striker = makePlayer("home-9", "ST", 80);
  const stats = {
    minutes: 90,
    goals: 2,
    assists: 1,
    passAttempts: 25,
    completedPasses: 18,
    keyPasses: 2,
    shots: 5,
    shotsOnTarget: 4,
    dribbles: 3,
    dribblesWon: 2,
    duels: 6,
    duelsWon: 4,
  };
  const a = matchRatingFromStats(striker, "ST", stats, match(3, 1), "home");
  const b = matchRatingFromStats(striker, "ST", stats, match(3, 1), "home");
  assert.equal(a, b, "deterministic without rng");
  assert.ok(a >= 3.1 && a <= 10, `rating ${a} within band`);
  assert.ok(a > 6.8, "a two-goal, one-assist display rates above average");
});

test("computeRating still accepts an rng for match noise", () => {
  const player = makePlayer("home-9", "ST", 80);
  const stats = {
    minutes: 90,
    goals: 1,
    assists: 0,
    passes: 20,
    passesCompleted: 15,
    keyPasses: 1,
    tacklesWon: 1,
    interceptions: 1,
    aerialsWon: 1,
    duels: 5,
    duelsWon: 3,
    dribbles: 2,
    dribblesWon: 1,
    saves: 0,
    cleanSheets: 0,
    yellowCards: 0,
    redCards: 0,
    foulsCommitted: 1,
  };
  let seed = 12345;
  const rng = {
    normal: () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return ((seed / 0x7fffffff) - 0.5) * 0.48;
    },
  };
  const withNoise = computeRating(player, "ST", stats, match(1, 0), "home", rng);
  const noNoise = computeRating(player, "ST", stats, match(1, 0), "home", null);
  assert.ok(Number.isFinite(withNoise));
  assert.ok(Number.isFinite(noNoise));
});