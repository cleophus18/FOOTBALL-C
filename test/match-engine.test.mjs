import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";
import { expectedGoals, normalizeTeamStrength } from "../src/sim/strength.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];

function makeTeam(prefix, rating, { goalkeeper = rating, formation = "4-3-3" } = {}) {
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
      attrs: {
        pace: rating,
        shooting: rating,
        passing: rating,
        dribbling: rating,
        defending: rating,
        physical: rating,
      },
      subAttrs: {
        finishing: rating,
        longShots: rating,
        vision: rating,
        shortPassing: rating,
        longPassing: rating,
        crossing: rating,
        ballControl: rating,
        agility: rating,
        stamina: rating,
        defensiveAwareness: rating,
        interceptions: rating,
        standingTackle: rating,
        acceleration: rating,
        sprintSpeed: rating,
        composure: rating,
        strength: rating,
        attackingPositioning: rating,
      },
      gkAttrs: {
        reflexes: overall,
        diving: overall,
        handling: overall,
        positioning: overall,
        reactions: overall,
      },
    });
  });
  return {
    xi,
    formation,
    strength: {
      attack: rating,
      midfield: rating,
      defence: rating,
      goalkeeping: goalkeeper,
    },
  };
}

test("missing strength data safely falls back instead of reading defence on undefined", () => {
  const normalized = normalizeTeamStrength({ attack: 74 });
  assert.equal(normalized.attack, 74);
  assert.equal(normalized.defence, 68);
  assert.doesNotThrow(() => expectedGoals(normalized, undefined));

  const home = makeTeam("home-missing", 76);
  const away = makeTeam("away-missing", 74);
  home.strength = { attack: 76 };
  away.strength = undefined;
  assert.doesNotThrow(() =>
    simulateQuickMatch(home, away, {
      rng: new Rng(1802, "missing-strength-test"),
    }),
  );
});

test("event-driven match results replay deterministically from the same seed", () => {
  const first = simulateQuickMatch(makeTeam("home", 76), makeTeam("away", 74), {
    rng: new Rng(1802, "match-engine-replay"),
  });
  const replay = simulateQuickMatch(makeTeam("home", 76), makeTeam("away", 74), {
    rng: new Rng(1802, "match-engine-replay"),
  });

  assert.deepEqual(replay, first);
});

test("Messi and Ronaldo use ordinary scoring and stay within the league goal cap", () => {
  const team = makeTeam("legend-season", 82);
  const messi = team.xi.find((player) => player.position === "RW");
  const ronaldo = team.xi.find((player) => player.position === "ST");
  messi.first = "Lionel";
  messi.last = "Messi";
  ronaldo.first = "Cristiano";
  ronaldo.last = "Ronaldo";
  messi.leagueGoals = 0;
  ronaldo.leagueGoals = 0;

  for (let matchday = 1; matchday <= 38; matchday++) {
    const result = simulateQuickMatch(team, makeTeam(`legend-opponent-${matchday}`, 82), {
      rng: new Rng(matchday, "legend-season-goals"),
      competition: "league",
    });
    for (const legend of [messi, ronaldo]) {
      const goals = result.playerStats[legend.id]?.goals ?? 0;
      legend.leagueGoals += goals;
      assert.equal(
        result.events.filter(
          (event) => event.type === "goal" && event.scorerId === legend.id,
        ).length,
        goals,
      );
    }
    assert.equal(
      result.events.filter((event) => event.type === "goal").length,
      result.homeGoals + result.awayGoals,
    );
  }

  assert.ok(messi.leagueGoals < 50);
  assert.ok(ronaldo.leagueGoals < 50);
});

test("players already at 50 league goals cannot score again in that league", () => {
  const team = makeTeam("capped-scorer", 90);
  const scorer = team.xi.find((player) => player.position === "ST");
  scorer.leagueGoals = 50;

  for (let seed = 1; seed <= 20; seed++) {
    const result = simulateQuickMatch(team, makeTeam(`cap-away-${seed}`, 65), {
      rng: new Rng(seed, "league-goal-cap"),
      competition: "league",
    });
    assert.equal(result.playerStats[scorer.id]?.goals ?? 0, 0);
  }
});

test("match score, xG, and player and team statistics match simulated events", () => {
  const scorelines = new Set();
  let totalGoals = 0;
  let draws = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const result = simulateQuickMatch(
      makeTeam(`home-${seed}`, 76),
      makeTeam(`away-${seed}`, 73),
      { rng: new Rng(seed, "match-engine-consistency") },
    );
    scorelines.add(`${result.homeGoals}-${result.awayGoals}`);
    totalGoals += result.homeGoals + result.awayGoals;
    if (result.homeGoals === result.awayGoals) draws++;
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
      const shots = result.actions.filter(
        (action) => action.type === "shot" && action.side === side,
      );
      const shotXg = shots.reduce((total, shot) => total + shot.xg, 0);
      const playerStats = Object.entries(result.playerStats)
        .filter(([id]) => id.startsWith(`${side}-${seed}-`))
        .map(([, stats]) => stats);

      assert.equal(teamStats.goals, goals[side]);
      assert.equal(teamStats.shots, shots.length);
      assert.equal(
        teamStats.shotsOnTarget,
        shots.filter((shot) =>
          ["goal", "saved"].includes(shot.outcome),
        ).length,
      );
      assert.ok(teamStats.shotsOnTarget >= teamStats.goals);
      assert.ok(Math.abs(teamStats.xg - shotXg) <= 0.011);
      assert.equal(
        playerStats.reduce((total, player) => total + player.goals, 0),
        goals[side],
      );
      assert.equal(
        result.actions.filter(
          (action) => action.type === "pass" && action.side === side,
        ).length,
        teamStats.passes,
      );
      assert.equal(
        Math.abs(result.stats.home.possession + result.stats.away.possession - 100) <= 1,
        true,
      );
    }
    assert.equal(
      Object.values(result.playerStats).reduce(
        (total, player) => total + player.assists,
        0,
      ),
      assists.home + assists.away,
    );
  }
  assert.ok(scorelines.size > 12);
  assert.ok(totalGoals / 200 > 1.5 && totalGoals / 200 < 3.8);
  assert.ok(draws / 200 < 0.5);
});

test("extra-time aggregation preserves player minutes, events, and team stats", () => {
  const home = makeTeam("extra-home", 75);
  const away = makeTeam("extra-away", 75);
  let decidedMatch;

  for (let seed = 1; seed <= 100; seed++) {
    const result = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "match-engine-extra-time"),
      mustHaveWinner: true,
    });
    if (result.decidedBy !== "normal") {
      decidedMatch = result;
      break;
    }
  }

  assert.ok(decidedMatch, "a seeded match should reach extra time");
  assert.ok(
    Object.values(decidedMatch.playerStats).every(
      (player) => player.minutes === 120,
    ),
  );
  assert.equal(
    decidedMatch.events.filter((event) => event.side === "home").length,
    decidedMatch.homeGoals,
  );
  assert.equal(
    decidedMatch.events.filter((event) => event.side === "away").length,
    decidedMatch.awayGoals,
  );
  assert.equal(decidedMatch.stats.home.goals, decidedMatch.homeGoals);
  assert.equal(decidedMatch.stats.away.goals, decidedMatch.awayGoals);
  assert.ok(decidedMatch.events.every((event) => event.minute <= 120));
});

test("the selected player role changes their event-driven match actions", () => {
  const balanced = makeTeam("role-home", 76);
  const attack = makeTeam("role-home", 76);
  const opponent = makeTeam("role-away", 76);
  const strikerId = attack.xi.find((player) => player.position === "ST").id;
  attack.roles = { [strikerId]: "Attack" };
  let balancedShots = 0;
  let attackingShots = 0;

  for (let seed = 1; seed <= 250; seed++) {
    const regular = simulateQuickMatch(balanced, opponent, {
      rng: new Rng(seed, "match-engine-role"),
    });
    const roleAdjusted = simulateQuickMatch(attack, makeTeam("role-away", 76), {
      rng: new Rng(seed, "match-engine-role"),
    });
    balancedShots += regular.playerStats[strikerId]?.shots ?? 0;
    attackingShots += roleAdjusted.playerStats[strikerId]?.shots ?? 0;
  }

  assert.ok(attackingShots > balancedShots);
});

test("home advantage produces a modest long-run scoring benefit", () => {
  const home = makeTeam("home-advantage-home", 75);
  const away = makeTeam("home-advantage-away", 75);
  let homeGoals = 0;
  let awayGoals = 0;

  for (let seed = 1; seed <= 700; seed++) {
    const result = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "match-engine-home-advantage"),
    });
    homeGoals += result.homeGoals;
    awayGoals += result.awayGoals;
  }

  assert.ok(homeGoals > awayGoals);
});

test("higher-quality squads and goalkeepers improve match outcomes", () => {
  const strong = makeTeam("strong", 88);
  const weak = makeTeam("weak", 58);
  const weakKeeper = makeTeam("weak-keeper", 72, { goalkeeper: 48 });
  const strongKeeper = makeTeam("strong-keeper", 72, { goalkeeper: 95 });
  let strongGoals = 0;
  let weakGoals = 0;
  let strongWins = 0;
  let concededByWeakKeeper = 0;
  let concededByStrongKeeper = 0;

  for (let seed = 1; seed <= 700; seed++) {
    const result = simulateQuickMatch(strong, weak, {
      rng: new Rng(seed, "match-engine-team-quality"),
    });
    strongGoals += result.homeGoals;
    weakGoals += result.awayGoals;
    if (result.homeGoals > result.awayGoals) strongWins++;

    const againstWeakKeeper = simulateQuickMatch(
      makeTeam(`att-${seed}`, 80),
      makeTeam(`def-low-${seed}`, 72, { goalkeeper: 48 }),
      { rng: new Rng(seed, "match-engine-keeper-quality") },
    );
    const againstStrongKeeper = simulateQuickMatch(
      makeTeam(`att-${seed}`, 80),
      makeTeam(`def-high-${seed}`, 72, { goalkeeper: 95 }),
      { rng: new Rng(seed, "match-engine-keeper-quality") },
    );
    concededByWeakKeeper += againstWeakKeeper.homeGoals;
    concededByStrongKeeper += againstStrongKeeper.homeGoals;
  }

  assert.ok(strongGoals > weakGoals + 75);
  assert.ok(strongWins / 700 > 0.35);
  assert.ok(concededByStrongKeeper < concededByWeakKeeper);
});
