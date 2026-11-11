import test from "node:test";
import assert from "node:assert/strict";
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";

async function careerForTest(seed = 781) {
  const data = await loadData();
  const entry =
    data.careerLeagues.find((item) => item.league.name === "Premier League") ??
    data.careerLeagues[0];
  return createCareer(data, {
    first: "Award",
    last: "Tester",
    position: "ST",
    clubId: entry.league.teamIds[0],
    leagueId: entry.id,
    seed,
  });
}

test("Ballon d'Or race reflects performance evidence and exposes a ranked watchlist", async () => {
  const career = await careerForTest();
  const players = career.players.filter((player) => player.clubId);
  const star = players.find((player) => player.position === "ST") ?? players[0];
  const ordinary =
    players.find(
      (player) => player.id !== star.id && player.position === "CM",
    ) ?? players.find((player) => player.id !== star.id);
  star.leaguePerformance = { apps: 28, ratingSum: 224 };
  star.leagueGoals = 29;
  star.leagueAssists = 9;
  star.overall = 94;
  ordinary.leaguePerformance = { apps: 28, ratingSum: 171 };
  ordinary.leagueGoals = 5;
  ordinary.leagueAssists = 4;
  ordinary.overall = 73;
  career.league.table.sorted = () => [];
  const race = career.getBallonDorRace();
  const starEntry = race.find((entry) => entry.playerId === star.id);
  const ordinaryEntry = race.find((entry) => entry.playerId === ordinary.id);
  assert.ok(starEntry.points > ordinaryEntry.points);
  assert.ok(starEntry.performanceScore > ordinaryEntry.performanceScore);
  assert.ok(Array.isArray(career.ballonDorWatchlist));
  assert.ok(career.ballonDorWatchlist.length <= 20);
});

test("Ballon d'Or winner is determined by journalist voting, not raw score", async () => {
  const career = await careerForTest(920);
  const players = career.players.filter((player) => player.clubId);
  for (const player of players) {
    player.leaguePerformance = { apps: 38, ratingSum: 323 };
    player.leagueGoals = Math.floor(Math.random() * 10);
    player.leagueAssists = Math.floor(Math.random() * 10);
  }
  players[0].leagueGoals = 29;
  players[0].leagueAssists = 9;
  players[1].leagueGoals = 21;
  players[1].leagueAssists = 13;
  career.league.table.sorted = () => [];

  const race = career.getBallonDorRace();
  assert.ok(race.length > 0, "race should have entries");
  const topEntry = race[0];
  assert.ok(topEntry.apps === 38);
  assert.ok(topEntry.points > 0);
  assert.ok(topEntry.points <= 1000);

  const voteResult = career.getBallonDorVoteResult();
  assert.ok(voteResult, "vote result should exist");
  assert.ok(voteResult.winner, "vote result should have a winner");
  assert.ok(voteResult.top10, "vote result should have top 10");
  assert.ok(voteResult.shortlist, "vote result should have shortlist");
  assert.equal(voteResult.totalJournalists, 100);
  assert.ok(voteResult.shortlist.length <= 30);
  assert.ok(voteResult.top10.length <= 10);
  assert.ok(
    voteResult.shortlist.includes(voteResult.winner.playerId),
    "winner should be on shortlist",
  );

  // Determinism: same seed produces same result
  const voteResult2 = career.getBallonDorVoteResult();
  assert.equal(voteResult2.winner.playerId, voteResult.winner.playerId);
  assert.deepEqual(
    voteResult2.top10.map((e) => e.playerId),
    voteResult.top10.map((e) => e.playerId),
  );

  // Tiebreakers: first-place votes, then second-place
  const winner = voteResult.winner;
  assert.ok(winner.firstPlaceVotes >= 0);
  assert.ok(winner.secondPlaceVotes >= 0);
  assert.ok(winner.points > 0);
});

test("Ballon d'Or ceremony uses journalist voting for winner", async () => {
  const career = await careerForTest(918);
  for (const player of career.players.filter((entry) => entry.clubId)) {
    player.stats.apps = 28;
    player.stats.ratingSum = 196;
    player.leaguePerformance = { apps: 28, ratingSum: 196 };
    player.leagueGoals = 8;
    player.leagueAssists = 6;
  }
  for (const state of career.worldLeagues) {
    for (const player of state.performers) {
      player.apps = 28;
      player.ratingSum = 196;
      player.goals = 8;
      player.assists = 6;
    }
  }
  career.areAllLeagueSeasonsComplete = () => true;
  career.recordSeasonAwards();

  const evaluation = career.currentSeasonAwards.awards.find(
    (award) => award.award === "Ballon d'Or",
  ).evaluation;
  assert.ok(evaluation, "Ballon d'Or evaluation should exist");
  assert.ok(evaluation.winner, "Ballon d'Or winner should exist");
  assert.ok(evaluation.voting, "Voting data should be present");
  assert.equal(evaluation.voting.totalJournalists, 100);
  assert.ok(evaluation.top10.length <= 10);
  assert.ok(evaluation.top10.every((entry) => entry.votePoints >= 0));
  assert.ok(
    evaluation.shortlist.length <= 30,
    "shortlist should be at most 30",
  );
  assert.ok(
    evaluation.shortlist.includes(evaluation.winner.playerId),
    "winner should be on shortlist",
  );
});

test("Ballon d'Or scoring allows outstanding goalkeepers to win without position multipliers", async () => {
  const career = await careerForTest(919);
  const players = career.players.filter((player) => player.clubId);
  const goalkeeper = players.find((player) => player.position === "GK");
  const striker = players.find((player) => player.position === "ST");
  assert.ok(goalkeeper);
  assert.ok(striker);

  for (const player of players) {
    player.leaguePerformance = { apps: 20, ratingSum: 120 };
    player.leagueGoals = 0;
    player.leagueAssists = 0;
  }
  goalkeeper.leaguePerformance = { apps: 38, ratingSum: 380 };
  goalkeeper.stats = {
    ...goalkeeper.stats,
    cleanSheets: 38,
    saves: 250,
    savePercentage: 90,
    goalsPrevented: 20,
  };
  career.league.table.sorted = () => [];

  const race = career.getBallonDorRace();
  const goalkeeperEntry = race.find((entry) => entry.playerId === goalkeeper.id);
  const strikerEntry = race.find((entry) => entry.playerId === striker.id);
  assert.ok(goalkeeperEntry);
  assert.ok(strikerEntry);
  assert.ok(goalkeeperEntry.points <= 1000);
  assert.ok(strikerEntry.points <= 1000);
  assert.ok(goalkeeperEntry.categoryScores.individualStatistics <= 250);
  assert.ok(goalkeeperEntry.categoryScores.consistencyBigMatches <= 70);
  assert.ok(strikerEntry.categoryScores.individualStatistics <= 250);
  assert.ok(strikerEntry.categoryScores.consistencyBigMatches <= 70);
  assert.ok(goalkeeperEntry.points > strikerEntry.points);
});

test("poor season lowers an elite player's race score and low rated excellence still has merit", async () => {
  const career = await careerForTest(912);
  const [poorElite, strongSeason] = career.players
    .filter((player) => player.clubId)
    .slice(0, 2);
  poorElite.overall = 95;
  poorElite.leaguePerformance = { apps: 24, ratingSum: 142 };
  poorElite.leagueGoals = 1;
  poorElite.leagueAssists = 1;
  strongSeason.overall = 73;
  strongSeason.leaguePerformance = { apps: 30, ratingSum: 234 };
  strongSeason.leagueGoals = 21;
  strongSeason.leagueAssists = 13;
  career.league.table.sorted = () => [];
  const race = career.getBallonDorRace();
  const poor = race.find((entry) => entry.playerId === poorElite.id);
  const good = race.find((entry) => entry.playerId === strongSeason.id);
  assert.ok(good.performanceScore > poor.performanceScore);
});

test("winning any league improves a player's Ballon d'Or chance", async () => {
  const career = await careerForTest(913);
  const players = career.players.filter((player) => player.clubId);
  const champion = players[0];
  const challenger = players.find(
    (player) => player.clubId !== champion.clubId,
  );
  for (const player of [champion, challenger]) {
    player.leaguePerformance = { apps: 28, ratingSum: 224 };
    player.leagueGoals = 20;
    player.leagueAssists = 10;
    player.overall = 86;
  }
  career.league.table.sorted = () => [{ teamId: champion.clubId }];
  const championEntry = career
    .getBallonDorRace()
    .find((entry) => entry.playerId === champion.id);
  const challengerEntry = career
    .getBallonDorRace()
    .find((entry) => entry.playerId === challenger.id);
  assert.ok(championEntry.trophyScore > challengerEntry.trophyScore);
  assert.ok(championEntry.points > challengerEntry.points);
});

test("Ballon d'Or categories stay capped and individual form beats team bias", async () => {
  const career = await careerForTest(914);
  const players = career.players.filter((player) => player.clubId);
  const prolific = players.find((player) => player.position === "ST") ?? players[0];
  const champion = players.find(
    (player) => player.clubId !== prolific.clubId,
  );
  prolific.leaguePerformance = { apps: 30, ratingSum: 270 };
  prolific.leagueGoals = 45;
  prolific.leagueAssists = 15;
  champion.leaguePerformance = { apps: 30, ratingSum: 180 };
  champion.leagueGoals = 3;
  champion.leagueAssists = 4;
  career.championsLeague = {
    winnerId: champion.clubId,
    leaguePhaseTeams: [{ id: champion.clubId }],
    runnerUpId: null,
    stats: {
      [champion.id]: {
        playerId: champion.id,
        clubId: champion.clubId,
        apps: 8,
        ratingSum: 48,
        goals: 1,
        assists: 0,
      },
    },
  };
  career.league.table.sorted = () => [];
  const race = career.getBallonDorRace();
  const prolificEntry = race.find((entry) => entry.playerId === prolific.id);
  const championEntry = race.find((entry) => entry.playerId === champion.id);
  assert.ok(prolificEntry.points > championEntry.points);
  assert.ok(prolificEntry.categoryScores.individualStatistics <= 250);
  assert.ok(prolificEntry.categoryScores.domesticLeaguePerformance <= 200);
  assert.ok(prolificEntry.categoryScores.consistencyBigMatches <= 70);
  assert.ok(prolificEntry.categoryScores.teamAchievements <= 250);
  assert.ok(prolificEntry.categoryScores.championsLeaguePerformance <= 180);
  assert.ok(race.every((entry) => entry.points <= 1000));
});

test("Ballon d'Or eligibility requires an individual award, not team honours", async () => {
  const career = await careerForTest(916);
  const [teamOnly, individualWinner] = career.players.filter(
    (player) => player.clubId,
  );
  for (const player of [teamOnly, individualWinner]) {
    player.leaguePerformance = { apps: 30, ratingSum: 240 };
    player.leagueGoals = player === teamOnly ? 30 : 12;
    player.leagueAssists = 10;
    player.overall = 88;
  }
  career.league.table.sorted = () => [];

  const awards = [
    {
      award: "Team of the Season",
      winners: [{ playerId: teamOnly.id }],
    },
    {
      award: "Golden Boot",
      winners: [{ playerId: individualWinner.id }],
    },
  ];
  const race = career.getBallonDorRace({
    awards,
    requireIndividualAward: true,
  });

  assert.deepEqual(
    race.map((entry) => entry.playerId),
    [individualWinner.id],
  );
});

test("World Cup performances add a separate Ballon d'Or component once per race", async () => {
  const career = await careerForTest(1492);
  const player = career.players.find(
    (candidate) =>
      candidate.clubId &&
      candidate.position === "ST" &&
      candidate.nationality,
  );
  player.leaguePerformance = { apps: 24, ratingSum: 180 };
  player.leagueGoals = 20;
  player.leagueAssists = 6;
  career.league.table.sorted = () => [];

  const baseline = career
    .getBallonDorRace()
    .find((entry) => entry.playerId === player.id);
  career.worldCup = {
    tournament: {
      year: career.season + 1,
      season: career.season,
      status: "complete",
      winnerId: player.nationality,
      playerStats: {
        [player.id]: {
          apps: 7,
          goals: 6,
          assists: 2,
          ratingSum: 56,
          knockoutApps: 4,
          knockoutRatingSum: 33,
        },
      },
      goldenBoot: { playerId: player.id },
      goldenBall: { playerId: player.id },
    },
  };

  const race = career.getBallonDorRace();
  const entry = race.find((candidate) => candidate.playerId === player.id);
  const repeat = career
    .getBallonDorRace()
    .find((candidate) => candidate.playerId === player.id);
  assert.ok(entry.worldCupPoints > 0);
  assert.ok(entry.categoryScores.worldCup > 0);
  assert.ok(entry.points > baseline.points);
  assert.equal(repeat.worldCupPoints, entry.worldCupPoints);
  assert.equal(repeat.points, entry.points);
});

test("Ballon d'Or ceremony archive shows voting-based top 10", async () => {
  const career = await careerForTest(918);
  for (const player of career.players.filter((entry) => entry.clubId)) {
    player.stats.apps = 28;
    player.stats.ratingSum = 196;
    player.leaguePerformance = { apps: 28, ratingSum: 196 };
    player.leagueGoals = 8;
    player.leagueAssists = 6;
  }
  for (const state of career.worldLeagues) {
    for (const player of state.performers) {
      player.apps = 28;
      player.ratingSum = 196;
      player.goals = 8;
      player.assists = 6;
    }
  }
  career.areAllLeagueSeasonsComplete = () => true;
  career.recordSeasonAwards();

  const evaluation = career.currentSeasonAwards.awards.find(
    (award) => award.award === "Ballon d'Or",
  ).evaluation;
  assert.ok(evaluation.top10.length <= 10);
  assert.ok(
    evaluation.top10.every((entry) => evaluation.shortlist.includes(entry.playerId)),
    "all top 10 entries should be on the shortlist",
  );
  assert.ok(
    evaluation.shortlist.includes(evaluation.winner.playerId),
    "winner should be on shortlist",
  );
  assert.ok(
    evaluation.top10[0].playerId === evaluation.winner.playerId,
    "top 10 first entry should be the winner",
  );
});

test("Champions League goals and assists materially raise the European category", async () => {
  const career = await careerForTest(915);
  const players = career.players.filter((player) => player.clubId);
  const scorer = players.find((player) => player.position === "ST") ?? players[0];
  const second = players.find(
    (player) => player.clubId !== scorer.clubId,
  );
  scorer.stats.apps = 0;
  for (const player of [scorer, second]) {
    player.leaguePerformance = { apps: 28, ratingSum: 196 };
    player.leagueGoals = 8;
    player.leagueAssists = 5;
  }
  career.championsLeague = {
    winnerId: scorer.clubId,
    leaguePhaseTeams: [{ id: scorer.clubId }],
    stats: {
      [`${scorer.clubId}:${scorer.first} ${scorer.last}`]: {
        playerId: scorer.id,
        clubId: scorer.clubId,
        player: `${scorer.first} ${scorer.last}`,
        apps: 4,
        goals: 4,
        assists: 2,
        ratingSum: 30,
        knockoutApps: 2,
        knockoutGoals: 2,
        knockoutAssists: 1,
        knockoutRatingSum: 15,
        playerOfMatch: 1,
      },
      [`${second.clubId}:${second.first} ${second.last}`]: {
        playerId: second.id,
        clubId: second.clubId,
        player: `${second.first} ${second.last}`,
        apps: 4,
        goals: 1,
        assists: 0,
        ratingSum: 30,
        knockoutApps: 2,
        knockoutGoals: 0,
        knockoutAssists: 0,
        knockoutRatingSum: 15,
      },
    },
  };
  career.league.table.sorted = () => [];
  const race = career.getBallonDorRace();
  const scorerEntry = race.find((entry) => entry.playerId === scorer.id);
  const secondEntry = race.find((entry) => entry.playerId === second.id);
  assert.ok(
    scorerEntry.championsLeaguePerformance >
      secondEntry.championsLeaguePerformance,
  );
  assert.equal(
    secondEntry.championsLeaguePerformance,
    0,
    "players whose club did not qualify cannot benefit from UEFA stats",
  );
  assert.equal(scorerEntry.apps, 32);
  assert.equal(secondEntry.apps, 28);
  assert.ok(scorerEntry.championsLeaguePerformance >= 60);
  assert.ok(scorerEntry.championsLeaguePerformance <= 180);
});

test("World Player of the Season rewards the best global league and tournament performer", async () => {
  const career = await careerForTest(917);
  const state = career.worldLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const candidate = state.performers.find((player) => !player.isLegend);
  candidate.apps = 0;
  candidate.goals = 0;
  candidate.assists = 0;
  candidate.ratingSum = 0;

  for (const league of [
    career.league,
    ...career.worldLeagues.map((entry) => entry.league),
  ]) {
    for (const row of league.table.rows.values()) {
      row.played = 2 * (league.teamIds.length - 1);
    }
  }
  career.championsLeague = {
    season: career.season,
    status: "complete",
    winnerId: candidate.clubId,
    runnerUpId: null,
    leaguePhaseTeams: [{ id: candidate.clubId, name: "Global Test FC" }],
    stats: {
      [candidate.id]: {
        playerId: candidate.id,
        clubId: candidate.clubId,
        player: `${candidate.first} ${candidate.last}`,
        apps: 8,
        goals: 50,
        assists: 20,
        ratingSum: 80,
        knockoutApps: 4,
        knockoutGoals: 20,
        knockoutAssists: 8,
        knockoutRatingSum: 40,
      },
    },
    awards: [],
  };
  career.recordSeasonAwards();

  const globalAward = career.currentSeasonAwards.awards.find(
    (award) => award.award === "World Player of the Season",
  );
  const raceAfterAwards = career.getBallonDorRace({
    awards: career.currentSeasonAwards.awards,
  });
  assert.equal(globalAward.competition, "World football");
  assert.equal(globalAward.winners[0].playerId, raceAfterAwards[0].playerId);
  assert.ok(
    career
      .getBallonDorRace()
      .some(
        (entry) =>
          entry.playerId === candidate.id &&
          entry.championsLeaguePerformance > 0,
      ),
  );
  const globalWinner = career.findWorldPlayer(globalAward.winners[0].playerId);
  assert.ok(
    career.getPlayerHonours(globalWinner).some(
      (honour) =>
        honour.award === "World Player of the Season" &&
        honour.competition === "World football",
    ),
  );
});
