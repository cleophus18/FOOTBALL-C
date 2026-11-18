import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";
import { simulatePlayerMatch } from "../src/sim/playermatch.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];

function makeTeam(prefix, rating, { goalkeeper = rating } = {}) {
  const xi = XI.map((position, index) => {
    const overall = position === "GK" ? goalkeeper : rating;
    return createPlayer({
      id: `${prefix}-${index}`,
      first: `${prefix}${index}`,
      last: "Test",
      position,
      overall,
      potential: 99,
      age: 26,
      attrs: { pace: rating, shooting: rating, passing: rating, dribbling: rating, defending: rating, physical: rating },
      subAttrs: {
        finishing: rating, longShots: rating, vision: rating, shortPassing: rating, longPassing: rating,
        crossing: rating, ballControl: rating, agility: rating, stamina: rating, defensiveAwareness: rating,
        interceptions: rating, standingTackle: rating, acceleration: rating, sprintSpeed: rating,
        composure: rating, strength: rating, attackingPositioning: rating,
      },
      gkAttrs: { reflexes: overall, diving: overall, handling: overall, positioning: overall, reactions: overall },
    });
  });
  return { xi, formation: "4-3-3", strength: { attack: rating, midfield: rating, defence: rating, goalkeeping: goalkeeper } };
}

/** Distinct id prefixes per side so home and away players never collide. */
const sidesFor = (seed) => ({ home: `h${seed}`, away: `a${seed}` });

const playerStatsFor = (result, prefix) =>
  Object.entries(result.playerStats)
    .filter(([id]) => id.startsWith(`${prefix}-`))
    .map(([, stats]) => stats);

test("identical seeds produce identical full match results including player statistics", () => {
  const run = () =>
    simulateQuickMatch(makeTeam("det-home", 78), makeTeam("det-away", 74), {
      rng: new Rng(2024, "stats-determinism"),
    });
  const first = run();
  const replay = run();
  assert.deepEqual(replay, first);
  assert.deepEqual(replay.playerStats, first.playerStats);
});

test("identical seeds produce identical player-match output from fresh inputs", () => {
  const run = () => {
    const home = makeTeam("pm-home", 78);
    const away = makeTeam("pm-away", 74);
    const match = simulateQuickMatch(home, away, { rng: new Rng(99, "pm-det") });
    const striker = home.xi.find((p) => p.position === "ST");
    return simulatePlayerMatch({
      player: striker,
      match,
      side: "home",
      opponents: away.xi,
      rng: new Rng(555, "pm-det"),
      position: "ST",
      minutes: 90,
      role: "Balanced",
    });
  };
  assert.deepEqual(run(), run());
});

test("team statistics equal the counts derived from actual events and actions", () => {
  for (let seed = 1; seed <= 150; seed++) {
    const sides = sidesFor(seed);
    const result = simulateQuickMatch(makeTeam(sides.home, 76), makeTeam(sides.away, 73), {
      rng: new Rng(seed, "stats-consistency"),
    });
    const goals = { home: 0, away: 0 };
    const assists = { home: 0, away: 0 };
    for (const event of result.events) {
      if (event.type !== "goal") continue;
      goals[event.side]++;
      if (event.assistId) assists[event.side]++;
    }
    assert.deepEqual(goals, { home: result.homeGoals, away: result.awayGoals });
    for (const side of ["home", "away"]) {
      const teamStats = result.stats[side];
      const shots = result.actions.filter((a) => a.type === "shot" && a.side === side);
      assert.equal(teamStats.goals, goals[side]);
      assert.equal(teamStats.shots, shots.length);
      assert.equal(
        teamStats.shotsOnTarget,
        shots.filter((s) => ["goal", "saved"].includes(s.outcome)).length,
      );
      assert.ok(teamStats.shotsOnTarget >= teamStats.goals);
      const sidePlayers = playerStatsFor(result, sides[side]);
      assert.equal(sidePlayers.reduce((t, p) => t + p.goals, 0), goals[side]);
      assert.equal(sidePlayers.reduce((t, p) => t + p.assists, 0), assists[side]);
      assert.equal(
        result.actions.filter((a) => a.type === "pass" && a.side === side).length,
        teamStats.passes,
      );
      assert.equal(sidePlayers.reduce((t, p) => t + p.passAttempts, 0), teamStats.passes);
      assert.equal(
        sidePlayers.reduce((t, p) => t + p.completedPasses, 0),
        teamStats.passesCompleted,
      );
    }
  }
});

test("goals and assists are attributed to the correct players with no contradictions", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const sides = sidesFor(seed);
    const result = simulateQuickMatch(makeTeam(sides.home, 78), makeTeam(sides.away, 74), {
      rng: new Rng(seed, "stats-attribution"),
    });
    const byId = result.playerStats;
    for (const event of result.events) {
      if (event.type !== "goal" || event.ownGoal) continue;
      const scorer = byId[event.scorerId];
      assert.ok(scorer, `scorer ${event.scorerId} has a stat line`);
      // A goal always comes from a shot, and the goal is on target.
      assert.ok(scorer.goals >= 1, "scorer is credited with the goal");
      assert.ok(scorer.shots >= 1, "scorer took at least one shot");
      assert.ok(scorer.shotsOnTarget >= scorer.goals, "goals are on target");
      assert.ok(scorer.shotsOnTarget <= scorer.shots, "on target never exceeds shots");
      if (event.assistId) {
        const assister = byId[event.assistId];
        assert.ok(assister, `assister ${event.assistId} has a stat line`);
        assert.ok(assister.assists >= 1, "assister is credited with the assist");
        assert.notEqual(event.assistId, event.scorerId, "a player cannot assist himself");
      }
    }
    // No player may have more goals than shots or more shots on target than shots.
    for (const side of ["home", "away"]) {
      for (const stats of playerStatsFor(result, sides[side])) {
        assert.ok(stats.goals <= stats.shots, "goals never exceed shots");
        assert.ok(stats.shotsOnTarget <= stats.shots, "on target never exceeds shots");
      }
    }
  }
});

test("player-match statistics are sourced from the actual match events", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sides = sidesFor(seed);
    const home = makeTeam(sides.home, 78);
    const away = makeTeam(sides.away, 74);
    const match = simulateQuickMatch(home, away, { rng: new Rng(seed, "stats-source") });
    for (const position of ["ST", "CM", "CB"]) {
      const starter = home.xi.find((p) => p.position === position);
      const recorded = match.playerStats[starter.id];
      assert.ok(recorded, `${position} has an event stat line`);
      const result = simulatePlayerMatch({
        player: starter,
        match,
        side: "home",
        opponents: away.xi,
        rng: new Rng(seed * 7 + 1, "stats-source-player"),
        position,
        minutes: 90,
        role: "Balanced",
      });
      assert.equal(result.stats.goals, recorded.goals, `${position} goals come from events`);
      assert.equal(result.stats.assists, recorded.assists, `${position} assists come from events`);
      assert.equal(result.stats.shots, recorded.shots, `${position} shots come from events`);
      assert.equal(result.stats.shotsOnTarget, recorded.shotsOnTarget, `${position} SoT come from events`);
      assert.equal(result.stats.passes, recorded.passAttempts, `${position} pass attempts come from events`);
      assert.equal(result.stats.passesCompleted, recorded.completedPasses, `${position} completed passes come from events`);
      assert.equal(result.stats.keyPasses, recorded.keyPasses, `${position} key passes come from events`);
      assert.equal(result.stats.tackles, recorded.tackleAttempts, `${position} tackles come from events`);
      assert.equal(result.stats.tacklesWon, recorded.tacklesWon, `${position} tackles won come from events`);
      assert.equal(result.stats.interceptions, recorded.interceptions, `${position} interceptions come from events`);
      assert.equal(result.stats.dribbles, recorded.dribbles, `${position} dribbles come from events`);
      assert.ok(result.stats.shotsOnTarget >= result.stats.goals, "no goal without an on-target shot");
      if (result.stats.goals > 0) assert.ok(result.stats.shots > 0, "no goal without a shot");
    }
  }
});

test("goalkeeper saves and goals conceded come from the actual match", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sides = sidesFor(seed);
    const home = makeTeam(sides.home, 76, { goalkeeper: 80 });
    const away = makeTeam(sides.away, 74, { goalkeeper: 72 });
    const match = simulateQuickMatch(home, away, { rng: new Rng(seed, "stats-keeper") });
    const keeper = home.xi.find((p) => p.position === "GK");
    const recorded = match.playerStats[keeper.id];
    const result = simulatePlayerMatch({
      player: keeper,
      match,
      side: "home",
      opponents: away.xi,
      rng: new Rng(seed * 13 + 5, "stats-keeper-player"),
      position: "GK",
      minutes: 90,
      role: "Balanced",
    });
    assert.equal(result.stats.saves, recorded.saves, "saves come from events");
    assert.equal(result.stats.goalsConceded, match.awayGoals, "goals conceded match the score");
    assert.equal(result.stats.cleanSheets, match.awayGoals === 0 ? 1 : 0);
    assert.equal(result.stats.shotsFaced, match.awayGoals + recorded.saves);
  }
});

test("cards are recorded against the correct players and match the match report", () => {
  for (let seed = 1; seed <= 120; seed++) {
    const sides = sidesFor(seed);
    const result = simulateQuickMatch(makeTeam(sides.home, 78), makeTeam(sides.away, 74), {
      rng: new Rng(seed, "stats-cards"),
    });
    const yellowByPlayer = {};
    const redByPlayer = {};
    for (const ev of result.misc) {
      if (ev.type === "yellow" && ev.playerId) yellowByPlayer[ev.playerId] = (yellowByPlayer[ev.playerId] ?? 0) + 1;
      if (ev.type === "red" && ev.playerId) redByPlayer[ev.playerId] = (redByPlayer[ev.playerId] ?? 0) + 1;
    }
    for (const side of ["home", "away"]) {
      const prefix = sides[side];
      const teamYellow = Object.entries(yellowByPlayer)
        .filter(([id]) => id.startsWith(`${prefix}-`))
        .reduce((t, [, n]) => t + n, 0);
      const teamRed = Object.entries(redByPlayer)
        .filter(([id]) => id.startsWith(`${prefix}-`))
        .reduce((t, [, n]) => t + n, 0);
      assert.equal(result.stats[side].yellowCards, teamYellow);
      assert.equal(result.stats[side].redCards, teamRed);
    }
    // Every card misc with a playerId is reflected in that player's stat line.
    for (const ev of result.misc) {
      if (!ev.playerId) continue;
      if (ev.type !== "yellow" && ev.type !== "red") continue;
      const stats = result.playerStats[ev.playerId];
      if (!stats) continue;
      assert.ok(
        (stats.yellowCards ?? 0) + (stats.redCards ?? 0) >= 1,
        "a booked player is credited with the card in his stat line",
      );
    }
  }
});

test("extra-time player statistics aggregate goals, assists and minutes consistently", () => {
  const sides = sidesFor(7);
  const home = makeTeam(sides.home, 76);
  const away = makeTeam(sides.away, 76);
  let decided;
  for (let seed = 1; seed <= 60; seed++) {
    const result = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "stats-extra-time"),
      mustHaveWinner: true,
    });
    if (result.decidedBy !== "normal") {
      decided = result;
      break;
    }
  }
  assert.ok(decided, "a seeded match reaches extra time");
  const goals = { home: 0, away: 0 };
  for (const event of decided.events) if (event.type === "goal") goals[event.side]++;
  assert.deepEqual(goals, { home: decided.homeGoals, away: decided.awayGoals });
  assert.equal(decided.stats.home.goals, decided.homeGoals);
  assert.equal(decided.stats.away.goals, decided.awayGoals);
  for (const stats of Object.values(decided.playerStats)) {
    assert.ok(stats.minutes >= 90, "extra-time players have at least 90 minutes");
    assert.ok(stats.goals <= stats.shots, "goals never exceed shots after extra time");
  }
});