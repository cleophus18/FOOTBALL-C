import test from "node:test";
import assert from "node:assert/strict";
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";
import {
  CHAMPIONS_LEAGUE_SCHEDULE,
  recordChampionsLeagueFixture,
  simulateChampionsLeagueWeek,
} from "../src/model/champions-league.mjs";

test("Champions League starts only after the first domestic season", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "hull",
    seed: 812,
  });
  assert.equal(career.championsLeague, null);
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
    league.table.sorted = () =>
      [...league.teamIds].reverse().map((teamId) => league.table.row(teamId));
  }
  career.advanceSeason();
  assert.equal(career.championsLeague.season, career.season);
  assert.equal(career.championsLeague.leaguePhaseTeams.length, 30);
  for (const leagueName of [
    "Premier League",
    "La Liga",
    "Bundesliga",
    "Serie A",
    "Ligue 1",
  ]) {
    const qualified = career.championsLeague.qualified.filter(
      (entry) => entry.league === leagueName,
    );
    assert.equal(qualified.length, 6, `${leagueName} sends six clubs`);
    assert.deepEqual(
      qualified.map((entry) => entry.domesticPosition),
      [1, 2, 3, 4, 5, 6],
    );
  }
  assert.equal(career.championsLeague.leaguePhase.fixtures.length, 120);
  assert.deepEqual(
    [...new Set(career.championsLeague.leaguePhase.fixtures.map((f) => f.round))].sort(),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("Messi and Ronaldo appear in UEFA competition only when their clubs qualify", async () => {
  const data = await loadData();
  const premierLeagueEntry = data.careerLeagues.find(
    (entry) => entry.league.name === "Premier League",
  );
  const career = createCareer(await loadData(), {
    first: "Test",
    last: "Player",
    position: "ST",
    leagueId: premierLeagueEntry.id,
    clubId: "manchester-united",
    seed: 824,
  });
  const laLiga = career.worldLeagues.find(
    (state) => state.league.name === "La Liga",
  );
  const premierLeague = { league: career.league };
  assert.ok(laLiga);
  const barcelonaRow = laLiga.league.table.row("fc-barcelona");
  const manUnitedRow = premierLeague.league.table.row("manchester-united");
  assert.ok(barcelonaRow);
  assert.ok(manUnitedRow);
  const laLigaOthers = [...laLiga.league.table.rows.values()].filter(
    (row) => row.teamId !== barcelonaRow.teamId,
  );
  const premierLeagueOthers = [...premierLeague.league.table.rows.values()].filter(
    (row) => row.teamId !== manUnitedRow.teamId,
  );
  laLiga.league.table.sorted = () => [
    barcelonaRow,
    ...laLigaOthers.slice(0, 5),
    ...laLigaOthers.slice(5),
  ];
  premierLeague.league.table.sorted = () => [
    ...premierLeagueOthers.slice(0, 6),
    manUnitedRow,
    ...premierLeagueOthers.slice(6),
  ];

  const competition = career.prepareChampionsLeague();
  const barcelona = competition.leaguePhaseTeams.find(
    (team) => team.id === "fc-barcelona",
  );
  assert.ok(barcelona, "Barcelona qualifies from the top six");
  assert.ok(
    barcelona.roster.some(
      (player) => !player.isLegend && player.first === "Lionel",
    ),
    "Messi is included in his qualified club's UEFA squad",
  );
  assert.equal(
    competition.leaguePhaseTeams.find((team) => team.id === "manchester-united"),
    undefined,
    "Manchester United finishes outside the top six",
  );
  assert.ok(
    !competition.leaguePhaseTeams.some((team) =>
      team.roster.some(
        (player) => !player.isLegend && player.first === "Cristiano",
      ),
    ),
    "Ronaldo is not included in UEFA when his club does not qualify",
  );

  premierLeague.league.table.sorted = () => [
    manUnitedRow,
    ...premierLeagueOthers.slice(0, 5),
    ...premierLeagueOthers.slice(5),
  ];
  const secondCompetition = career.prepareChampionsLeague();
  const qualifiedManUnited = secondCompetition.leaguePhaseTeams.find(
    (team) => team.id === "manchester-united",
  );
  assert.ok(qualifiedManUnited, "Manchester United qualifies from the top six");
  assert.ok(
    qualifiedManUnited.roster.some(
      (player) => !player.isLegend && player.first === "Cristiano",
    ),
    "Ronaldo is included in his qualified club's UEFA squad",
  );
});

test("Champions League generates eight league-phase matches and all knockout rounds", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "hull",
    seed: 813,
  });

  test("Champions League schedule finishes before the season and leaves two rest days", () => {
    const weeks = [
      ...CHAMPIONS_LEAGUE_SCHEDULE.leaguePhase,
      ...CHAMPIONS_LEAGUE_SCHEDULE.roundOf16,
      ...CHAMPIONS_LEAGUE_SCHEDULE.quarterFinals,
      ...CHAMPIONS_LEAGUE_SCHEDULE.semiFinals,
      CHAMPIONS_LEAGUE_SCHEDULE.final,
    ];
    assert.equal(CHAMPIONS_LEAGUE_SCHEDULE.final, 55);
    assert.ok(weeks.every((week, index) => !index || week - weeks[index - 1] >= 2));
    assert.ok(CHAMPIONS_LEAGUE_SCHEDULE.final < 56);
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  career.completeChampionsLeagueIfDue();
  const competition = career.championsLeague;
  const appearances = new Map(
    competition.leaguePhaseTeams.map((team) => [team.id, 0]),
  );
  for (const fixture of competition.leaguePhase.fixtures) {
    appearances.set(fixture.homeId, appearances.get(fixture.homeId) + 1);
    appearances.set(fixture.awayId, appearances.get(fixture.awayId) + 1);
  }
  assert.ok([...appearances.values()].every((count) => count === 8));
  assert.equal(competition.leaguePhaseTeams.length, 30);
  assert.equal(competition.leaguePhase.fixtures.length, 120);
  assert.equal(competition.knockout.roundOf16.length, 8);
  assert.ok(
    [...appearances.values()].every((count) => count === 8),
    "every club plays eight league-phase matches",
  );
  const top16 = new Set(
    competition.leaguePhase.standings
      .slice()
      .sort(
        (left, right) =>
          right.points - left.points ||
          right.goalDifference - left.goalDifference ||
          right.goalsFor - left.goalsFor ||
          right.won - left.won ||
          left.teamId.localeCompare(right.teamId),
      )
      .slice(0, 16)
      .map((row) => row.teamId),
  );
  assert.equal(
    new Set(
      competition.knockout.roundOf16.flatMap((tie) => [
        tie.homeId,
        tie.awayId,
      ]),
    ).size,
    16,
    "only the top 16 clubs progress to the round of 16",
  );
  assert.deepEqual(
    new Set(
      competition.knockout.roundOf16.flatMap((tie) => [
        tie.homeId,
        tie.awayId,
      ]),
    ),
    top16,
  );
  assert.equal(competition.knockout.quarterFinals.length, 4);
  assert.equal(competition.knockout.semiFinals.length, 2);
  assert.ok(competition.knockout.final);
  assert.equal(competition.status, "complete");
  assert.ok(competition.winnerId);
  assert.ok(
    competition.awards.some(
      (award) => award.award === "Champions League Golden Boot",
    ),
  );
  const championAward = competition.awards.find(
    (award) => award.award === "Champions League Champion",
  );
  assert.ok(championAward);
  const championPlayers = [
    ...new Set(
      [
        ...career.players,
        ...career.worldLeagues.flatMap((state) => state.performers),
      ]
        .filter((player) => player.clubId === competition.winnerId)
        .map((player) => player.id),
    ),
  ].map((playerId) => career.findWorldPlayer(playerId));
  assert.deepEqual(
    championAward.winners.map((winner) => winner.playerId).sort(),
    championPlayers.map((player) => player.id).sort(),
  );
  assert.ok(
    championPlayers.every((player) =>
      player.honours?.some(
        (honour) =>
          honour.award === "Champions League Champion" &&
          honour.competition === "UEFA Champions League",
      ),
    ),
  );
  assert.equal(
    championAward.winners.length,
    championPlayers.length,
    "every player on the winning team receives the Champions League trophy",
  );
});

test("round of 16 pairs league-phase rank 1 with 16, 2 with 15, and so on", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "hull",
    seed: 823,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();

  const competition = career.championsLeague;
  const standings = competition.leaguePhase.standings;
  standings.forEach((row, index) => {
    row.points = standings.length - index;
    row.goalDifference = 0;
    row.goalsFor = 0;
    row.won = 0;
  });
  competition.leaguePhase.fixtures.forEach((fixture) => {
    fixture.played = true;
    fixture.result = { homeGoals: 0, awayGoals: 0 };
  });

  simulateChampionsLeagueWeek(competition, {}, 37);

  assert.deepEqual(
    competition.knockout.roundOf16.map((tie) => [
      tie.homeId,
      tie.awayId,
    ]),
    Array.from({ length: 8 }, (_, index) => [
      standings[index].teamId,
      standings[15 - index].teamId,
    ]),
  );
});

test("Champions League state survives save and restore", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "hull",
    seed: 814,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  career.completeChampionsLeagueIfDue();
  const restored = createCareer(data, career.creation, career.toJSON());
  assert.deepEqual(restored.championsLeague, career.championsLeague);
});

test("main fixture list includes scheduled Champions League matches for the user club", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 815,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  const fixtures = career
    .getFixtureList()
    .filter((fixture) => fixture.competition === "UEFA Champions League");
  assert.equal(fixtures.length, 8);
  assert.ok(fixtures.every((fixture) => Number.isInteger(fixture.date)));
  assert.ok(fixtures.every((fixture) => !fixture.played));
  assert.ok(
    fixtures.every((fixture) => fixture.roundLabel.startsWith("League phase")),
  );
  assert.ok(career.getFixtureList().some((fixture) => fixture.next));
});

test("upcoming Champions League knockout fixtures remain available as the next match", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 821,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();

  for (let index = 0; index < career.league.fixtures.length; index++) {
    const match = career.league.fixtures[index].find(
      (fixture) =>
        fixture.home === career.club.id || fixture.away === career.club.id,
    );
    if (!match) continue;
    career.results.push({
      roundIndex: index,
      home: career.clubs.find((club) => club.id === match.home).name,
      away: career.clubs.find((club) => club.id === match.away).name,
      homeGoals: 1,
      awayGoals: 0,
      pending: false,
    });
  }
  for (const fixture of career.championsLeague.leaguePhase.fixtures) {
    fixture.played = true;
    fixture.result = { homeGoals: 1, awayGoals: 0 };
  }

  const opponentId = career.championsLeague.leaguePhaseTeams.find(
    (team) => team.id !== career.club.id,
  ).id;
  const leg = (id, homeId, awayId, week) => ({
    id,
    homeId,
    awayId,
    week,
    played: false,
  });
  const rounds = [
    {
      label: "Round of 16 · First leg",
      knockout: {
        roundOf16: [{
          stage: "roundOf16",
          homeId: career.club.id,
          awayId: opponentId,
          firstLeg: leg("r16-1", career.club.id, opponentId, 38),
          secondLeg: leg("r16-2", opponentId, career.club.id, 41),
        }],
      },
    },
    {
      label: "Semi-final · First leg",
      knockout: {
        semiFinals: [{
          stage: "semiFinals",
          homeId: career.club.id,
          awayId: opponentId,
          firstLeg: leg("semi-1", career.club.id, opponentId, 50),
          secondLeg: leg("semi-2", opponentId, career.club.id, 53),
        }],
      },
    },
    {
      label: "Final",
      knockout: {
        final: {
          id: "final",
          homeId: career.club.id,
          awayId: opponentId,
          week: 55,
          played: false,
        },
      },
    },
  ];

  for (const { label, knockout } of rounds) {
    career.championsLeague.knockout = {
      roundOf16: null,
      quarterFinals: null,
      semiFinals: null,
      final: null,
      ...knockout,
    };
    const fixtures = career.getFixtureList();
    const next = fixtures.find((fixture) => fixture.next);
    assert.ok(next, `${label} should be selected as the next fixture`);
    assert.equal(next.competition, "UEFA Champions League");
    assert.equal(next.roundLabel, label);
    assert.equal(next.played, false);
    assert.equal(next.result, null);
    assert.ok(Number.isInteger(next.date));
  }
});

test("a live Champions League winner receives the trophy honour and keeps it after reload", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 822,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  const competition = career.championsLeague;
  const opponentId = competition.leaguePhaseTeams.find(
    (team) => team.id !== career.club.id,
  ).id;
  competition.knockout.final = {
    id: "cl-final",
    homeId: career.club.id,
    awayId: opponentId,
    week: CHAMPIONS_LEAGUE_SCHEDULE.final,
    played: false,
  };
  recordChampionsLeagueFixture(competition, "cl-final", {
    homeGoals: 2,
    awayGoals: 1,
    winnerId: career.club.id,
  });
  career.simulateChampionsLeagueWeek(CHAMPIONS_LEAGUE_SCHEDULE.final);

  const honour = career.getCareerHonours().find(
    (entry) =>
      entry.award === "Champions League Champion" &&
      entry.competition === "UEFA Champions League",
  );
  assert.ok(honour);
  assert.equal(honour.season, career.season);
  assert.ok(
    competition.awards.some(
      (award) =>
        award.award === "Champions League Champion" &&
        award.winners.some((winner) => winner.playerId === career.player.id),
    ),
  );

  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career)),
  );
  assert.ok(
    restored.getCareerHonours().some(
      (entry) =>
        entry.award === "Champions League Champion" &&
        entry.competition === "UEFA Champions League",
    ),
  );
});

test("completed Champions League fixtures retain scores and shared fixture shape", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 816,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  career.completeChampionsLeagueIfDue();
  const fixtures = career
    .getFixtureList()
    .filter((fixture) => fixture.competition === "UEFA Champions League");
  assert.ok(fixtures.length >= 8);
  assert.ok(fixtures.every((fixture) => fixture.played));
  assert.ok(fixtures.every((fixture) => /^\d+ – \d+$/.test(fixture.result)));
  assert.ok(fixtures.every((fixture) => fixture.roundLabel));
});

test("weekly simulation completes only Champions League fixtures scheduled for that week", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 817,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  while (career.week < 6) {
    career.simulateOneWeek();
  }
  const fixtures = career
    .getFixtureList()
    .filter((fixture) => fixture.competition === "UEFA Champions League");
  assert.equal(fixtures.length, 8);
  assert.ok(fixtures.some((fixture) => fixture.played));
  assert.ok(fixtures.some((fixture) => !fixture.played));
});

test("UEFA fixtures can be played through the live match simulation", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 820,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();

  let report;
  do {
    report = career.advanceWeek();
    if (
      report.userMatch &&
      report.userMatch.competitionName !== "UEFA Champions League"
    ) {
      career.startMatchSimulation();
      while (career.matchSimulation.status !== "finished") {
        const state = career.advanceMatchSimulation();
        if (state.status === "paused") {
          career.resolveKeyMoment(state.momentIndex, "play-safe");
        }
      }
    }
  } while (report.userMatch?.competitionName !== "UEFA Champions League");

  assert.equal(report.userMatch.competitionName, "UEFA Champions League");
  assert.ok(report.userMatch.playerResult.keyMoments.length <= 3);
  career.startMatchSimulation();
  while (career.matchSimulation.status !== "finished") {
    const state = career.advanceMatchSimulation();
    if (state.status === "paused") {
      career.resolveKeyMoment(state.momentIndex, "play-safe");
    }
  }

  const fixture = career
    .getFixtureList()
    .find((entry) => entry.id === report.userMatch.uefaFixtureId);
  assert.ok(fixture?.played);
  assert.equal(fixture.competitionId, "champions-league");
  assert.match(fixture.result, /^\d+ – \d+$/);
  const historyEntry = career.player.matchHistory
    .filter((entry) => entry.competitionId === "champions-league")
    .at(-1);
  assert.equal(historyEntry?.competition, "UEFA Champions League");
  assert.ok(historyEntry);
  const statRow = Object.values(career.championsLeague.stats)
    .find((entry) => entry.playerId === career.player.id);
  assert.ok(statRow);
  assert.equal(statRow.competitionId, "champions-league");
  assert.equal(statRow.season, career.championsLeague.season);
  assert.equal(statRow.knockoutApps, 0);
});

test("season simulation completes domestic leagues and Champions League together", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 818,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  assert.equal(career.seasonComplete, false);
  career.simulateToSeasonEnd();
  assert.equal(career.seasonComplete, true);
  assert.equal(career.areAllLeagueSeasonsComplete(), true);
  assert.equal(career.championsLeague.status, "complete");
  assert.equal(career.championsLeague.season, career.season);
});

test("Champions League standings rank live points and retain form after each matchweek", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Test",
    last: "Player",
    position: "ST",
    clubId: "arsenal",
    seed: 819,
  });
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  career.simulateChampionsLeagueWeek(6);
  const standings = career.championsLeague.leaguePhase.standings;
  assert.ok(standings.some((row) => row.played === 1));
  assert.ok(standings.every((row) => row.form.length === 1));
  assert.deepEqual(
    standings,
    [...standings].sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDifference - left.goalDifference ||
        right.goalsFor - left.goalsFor ||
        right.won - left.won ||
        left.teamId.localeCompare(right.teamId),
    ),
  );
});
