import { randomNameFor } from "../model/names.mjs";
import { teamBoosterFor } from "../model/club.mjs";
import { teamBoosterMultiplier } from "./strength.mjs";

function fixturePlayerStats(team, goals, conceded, rng, knockout = false) {
  const roster = (team.roster ?? []).map((player, index) => ({
    ...player,
    id: `competition-player-${team.id}-${player.id ?? index}`,
  }));
  while (roster.length < 11) {
    const index = roster.length;
    const { first, last } = randomNameFor(rng, team.nation ?? "ENG");
    roster.push({
      id: `generated-${index}`,
      first,
      last,
      position: [
        "GK",
        "CB",
        "LB",
        "RB",
        "DM",
        "CM",
        "AM",
        "LW",
        "RW",
        "ST",
        "ST",
      ][index],
    });
  }
  const starting = rng.shuffled(roster).slice(0, 11);
  const attackers = [...starting].sort(
    (left, right) =>
      (["ST", "LW", "RW", "AM"].indexOf(left.position) + 1 || 99) -
      (["ST", "LW", "RW", "AM"].indexOf(right.position) + 1 || 99),
  );
  const stats = new Map(
    starting.map((player) => [
      player.id,
      {
        id: player.id.startsWith("competition-player-")
          ? player.id
          : `competition-player-${team.id}-${player.id}`,
        clubId: team.id,
        name: `${player.first} ${player.last}`,
        club: team.name,
        position: player.position,
        goals: 0,
        assists: 0,
        apps: 1,
        knockoutApps: knockout ? 1 : 0,
        ratingSum:
          6.4 + (goals > conceded ? 0.25 : goals === conceded ? 0.05 : -0.15),
        knockoutRatingSum: knockout
          ? 6.4 + (goals > conceded ? 0.25 : goals === conceded ? 0.05 : -0.15)
          : 0,
      },
    ]),
  );
  for (let index = 0; index < goals; index++) {
    const scorer = attackers[index % attackers.length];
    const scorerStats = stats.get(scorer.id);
    scorerStats.goals++;
    scorerStats.ratingSum += 0.75;
    if (knockout) scorerStats.knockoutRatingSum += 0.75;
    const eligible = starting.filter((player) => player.id !== scorer.id);
    const assister =
      eligible.length && rng.chance(0.72) ? rng.pick(eligible) : null;
    if (assister) {
      const assistStats = stats.get(assister.id);
      assistStats.assists++;
      assistStats.ratingSum += 0.4;
      if (knockout) assistStats.knockoutRatingSum += 0.4;
    }
  }
  return [...stats.values()];
}

/** Shared deterministic-ish lightweight cup fixture simulation. */
export function simulateFixtureResult(
  fixture,
  competition,
  rng,
  knockout = false,
) {
  const home = competition.teams.find((team) => team.id === fixture.homeId);
  const away = competition.teams.find((team) => team.id === fixture.awayId);
  if (!home || !away)
    throw new Error(`Competition fixture has an unknown team: ${fixture.id}`);
  const homeBooster = home.booster ?? teamBoosterFor(home.name);
  const awayBooster = away.booster ?? teamBoosterFor(away.name);
  const difference =
    (home.rating * teamBoosterMultiplier(homeBooster) -
      away.rating * teamBoosterMultiplier(awayBooster)) /
    24;
  let homeGoals = rng.poisson(
    Math.max(0.25, Math.min(3.4, 1.35 + difference + 0.15)),
  );
  let awayGoals = rng.poisson(Math.max(0.25, Math.min(3.4, 1.35 - difference)));
  let winnerId = null;
  let decidedBy = null;
  if (knockout && homeGoals === awayGoals) {
    homeGoals += rng.poisson(Math.max(0.05, 0.38 + difference / 3));
    awayGoals += rng.poisson(Math.max(0.05, 0.38 - difference / 3));
    if (homeGoals === awayGoals) {
      winnerId = rng.chance(0.5) ? home.id : away.id;
      decidedBy = "penalties";
    } else {
      winnerId = homeGoals > awayGoals ? home.id : away.id;
      decidedBy = "extra time";
    }
  } else if (knockout) {
    winnerId = homeGoals > awayGoals ? home.id : away.id;
    decidedBy = "normal time";
  }
  return {
    ...fixture,
    homeGoals,
    awayGoals,
    winnerId,
    decidedBy,
    playerStats: [
      ...fixturePlayerStats(home, homeGoals, awayGoals, rng, knockout),
      ...fixturePlayerStats(away, awayGoals, homeGoals, rng, knockout),
    ],
  };
}
