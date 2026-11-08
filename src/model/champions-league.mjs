import { simulateFixtureResult } from "../sim/tournament.mjs";

export const CHAMPIONS_LEAGUE_PLACES = {
  "Premier League": 6,
  "La Liga": 6,
  Bundesliga: 6,
  "Serie A": 6,
  "Ligue 1": 6,
};

const STAGES = [
  "league-phase",
  "round-of-16",
  "quarter-finals",
  "semi-finals",
  "final",
  "complete",
];

// Each tie is separated by three calendar weeks (two complete weeks between
// matchdays), while the final remains inside the 56-week career calendar.
export const CHAMPIONS_LEAGUE_SCHEDULE = Object.freeze({
  leaguePhase: Object.freeze([6, 10, 14, 18, 22, 26, 30, 34]),
  roundOf16: Object.freeze([38, 41]),
  quarterFinals: Object.freeze([44, 47]),
  semiFinals: Object.freeze([50, 53]),
  final: 55,
});

export function normalizeChampionsLeagueSchedule(state) {
  for (const fixture of state?.leaguePhase?.fixtures ?? []) {
    const week = CHAMPIONS_LEAGUE_SCHEDULE.leaguePhase[fixture.round - 1];
    if (Number.isInteger(week)) fixture.week = week;
  }
  for (const [stage, weeks] of [
    ["roundOf16", CHAMPIONS_LEAGUE_SCHEDULE.roundOf16],
    ["quarterFinals", CHAMPIONS_LEAGUE_SCHEDULE.quarterFinals],
    ["semiFinals", CHAMPIONS_LEAGUE_SCHEDULE.semiFinals],
  ]) {
    for (const tie of state?.knockout?.[stage] ?? []) {
      if (tie.firstLeg) tie.firstLeg.week = weeks[0];
      if (tie.secondLeg) tie.secondLeg.week = weeks[1];
    }
  }
  if (state?.knockout?.final) {
    state.knockout.final.week = CHAMPIONS_LEAGUE_SCHEDULE.final;
  }
  return state;
}

function standingsRow(teamId) {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
  };
}

function rank(rows) {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      b.won - a.won ||
      a.teamId.localeCompare(b.teamId),
  );
}

function record(row, goalsFor, goalsAgainst) {
  row.played++;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (goalsFor > goalsAgainst) {
    row.won++;
    row.points += 3;
    row.form = [...row.form, "W"].slice(-5);
  } else if (goalsFor === goalsAgainst) {
    row.drawn++;
    row.points++;
    row.form = [...row.form, "D"].slice(-5);
  } else {
    row.lost++;
    row.form = [...row.form, "L"].slice(-5);
  }
}

function makeLeagueFixtures(teamIds, season) {
  const rounds = [];
  const list = [...teamIds];
  for (let round = 0; round < 8; round++) {
    const matches = [];
    for (let index = 0; index < list.length / 2; index++) {
      const left = list[index];
      const right = list[list.length - 1 - index];
      matches.push({ left, right, round, index });
    }
    rounds.push(matches);
    list.splice(1, 0, list.pop());
  }
  const edges = rounds.flatMap((matches) => matches);
  const adjacentEdges = new Map(teamIds.map((id) => [id, []]));
  edges.forEach((edge, index) => {
    adjacentEdges.get(edge.left).push(index);
    adjacentEdges.get(edge.right).push(index);
  });
  const usedEdges = new Set();
  const oriented = new Map();
  for (const teamId of teamIds) {
    if (!adjacentEdges.get(teamId).some((edgeId) => !usedEdges.has(edgeId)))
      continue;
    const stack = [{ teamId, via: null }];
    const circuit = [];
    while (stack.length) {
      const current = stack.at(-1);
      const edgeId = adjacentEdges
        .get(current.teamId)
        .find((candidate) => !usedEdges.has(candidate));
      if (edgeId == null) {
        const popped = stack.pop();
        if (popped.via != null) {
          circuit.push({
            edgeId: popped.via,
            homeId: popped.teamId,
            awayId: stack.at(-1).teamId,
          });
        }
        continue;
      }
      usedEdges.add(edgeId);
      const edge = edges[edgeId];
      const nextTeam = edge.left === current.teamId ? edge.right : edge.left;
      stack.push({ teamId: nextTeam, via: edgeId });
    }
    for (const edge of circuit.reverse())
      oriented.set(edge.edgeId, [edge.homeId, edge.awayId]);
  }
  return rounds.flat().map((edge, edgeId) => {
    const [homeId, awayId] = oriented.get(edgeId);
    return {
      id: `cl-${season}-league-${edge.round + 1}-${edge.index + 1}`,
      competitionId: "champions-league",
      stage: "league-phase",
      round: edge.round + 1,
      matchday: edge.round + 1,
      week: CHAMPIONS_LEAGUE_SCHEDULE.leaguePhase[edge.round],
      homeId,
      awayId,
      status: "upcoming",
      played: false,
    };
  });
}

export function validateChampionsLeagueFixtures(fixtures, teamIds) {
  const counts = new Map(
    teamIds.map((id) => [id, { home: 0, away: 0, opponents: new Set() }]),
  );
  const ids = new Set();
  for (const fixture of fixtures ?? []) {
    if (
      !counts.has(fixture.homeId) ||
      !counts.has(fixture.awayId) ||
      fixture.homeId === fixture.awayId ||
      ids.has(fixture.id) ||
      fixture.round < 1 ||
      fixture.round > 8
    ) {
      throw new Error("Champions League contains an invalid fixture.");
    }
    ids.add(fixture.id);
    counts.get(fixture.homeId).home++;
    counts.get(fixture.awayId).away++;
    counts.get(fixture.homeId).opponents.add(fixture.awayId);
    counts.get(fixture.awayId).opponents.add(fixture.homeId);
  }
  if (fixtures.length !== teamIds.length * 4) {
    throw new Error("Champions League league phase has an invalid fixture count.");
  }
  for (const stats of counts.values()) {
    if (stats.home !== 4 || stats.away !== 4 || stats.opponents.size !== 8) {
      throw new Error("Champions League league phase is not balanced.");
    }
  }
  return true;
}

function makeTies(teamIds, stage) {
  const ties = [];
  for (let index = 0; index < teamIds.length; index += 2) {
    const home = teamIds[index];
    const away = teamIds[index + 1];
    ties.push({
      id: `cl-${stage}-${index / 2 + 1}`,
      stage,
      homeId: home,
      awayId: away,
      firstLeg: null,
      secondLeg: null,
      winnerId: null,
    });
  }
  return ties;
}

export function qualifyChampionsLeague(leagues, standings) {
  const qualified = [];
  for (const [leagueName, places] of Object.entries(CHAMPIONS_LEAGUE_PLACES)) {
    const entry = leagues.find((item) => item.league.name === leagueName);
    if (!entry) continue;
    const order = standings[entry.league.id] ?? entry.league.teamIds;
    for (let index = 0; index < places; index++) {
      const clubId = order[index];
      if (clubId && !qualified.some((item) => item.clubId === clubId)) {
        qualified.push({
          clubId,
          leagueId: entry.league.id,
          league: leagueName,
          domesticPosition: index + 1,
        });
      }
    }
  }
  return qualified;
}

export function createChampionsLeague({ season, qualified, teams }) {
  const leagueTeams = qualified
    .map((entry) => teams.find((team) => team.id === entry.clubId))
    .filter(Boolean);
  const teamIds = leagueTeams.map((team) => team.id);
  const fixtures = makeLeagueFixtures(teamIds, season);
  validateChampionsLeagueFixtures(fixtures, teamIds);
  return {
    competition: "UEFA Champions League",
    season,
    status: "scheduled",
    stage: STAGES[0],
    qualified,
    leaguePhaseTeams: leagueTeams,
    leaguePhase: {
      fixtures,
      standings: teamIds.map(standingsRow),
      completed: false,
    },
    knockout: {
      roundOf16: null,
      quarterFinals: null,
      semiFinals: null,
      final: null,
    },
    stats: {},
    awards: [],
    winnerId: null,
    runnerUpId: null,
    finalScore: null,
  };
}

function addPlayerStats(state, rows, context = {}) {
  const bestRating = Math.max(
    ...(rows ?? []).map((row) => row.ratingSum / Math.max(1, row.apps ?? 1)),
    0,
  );
  for (const row of rows ?? []) {
    const key = `${row.club}:${row.name}`;
    const existing = state.stats[key] ?? {
      playerId: row.id,
      clubId: row.clubId,
      player: row.name,
      club: row.club,
      position: row.position,
      competitionId: "champions-league",
      season: state.season,
      apps: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      knockoutApps: 0,
      knockoutRatingSum: 0,
      knockoutGoals: 0,
      knockoutAssists: 0,
      finalApps: 0,
      finalGoals: 0,
      finalAssists: 0,
      playerOfMatch: 0,
    };
    existing.apps += row.apps ?? 0;
    existing.goals += row.goals ?? 0;
    existing.assists += row.assists ?? 0;
    existing.ratingSum += row.ratingSum ?? 0;
    existing.knockoutApps += row.knockoutApps ?? 0;
    existing.knockoutRatingSum += row.knockoutRatingSum ?? 0;
    if (context.knockout) {
      existing.knockoutGoals += row.goals ?? 0;
      existing.knockoutAssists += row.assists ?? 0;
    }
    if (context.final) {
      existing.finalApps += row.apps ?? 0;
      existing.finalGoals += row.goals ?? 0;
      existing.finalAssists += row.assists ?? 0;
    }
    if (
      context.knockout &&
      row.ratingSum / Math.max(1, row.apps ?? 1) === bestRating
    ) {
      existing.playerOfMatch += 1;
    }
    state.stats[key] = existing;
  }
}

function simulateLeagueFixture(state, fixture, competition, rng) {
  const result = simulateFixtureResult(fixture, competition, rng, false);
  fixture.played = true;
  fixture.result = result;
  const home = state.leaguePhase.standings.find(
    (row) => row.teamId === fixture.homeId,
  );
  const away = state.leaguePhase.standings.find(
    (row) => row.teamId === fixture.awayId,
  );
  record(home, result.homeGoals, result.awayGoals);
  record(away, result.awayGoals, result.homeGoals);
  addPlayerStats(state, result.playerStats);
  return result;
}

function createNextKnockoutStage(state, stage, teams) {
  const nextStage = {
    roundOf16: "quarterFinals",
    quarterFinals: "semiFinals",
    semiFinals: "final",
  }[stage];
  if (!nextStage) return;
  if (nextStage === "final") {
    state.knockout.final = {
      id: "cl-final",
      homeId: teams[0],
      awayId: teams[1],
      week: CHAMPIONS_LEAGUE_SCHEDULE.final,
      played: false,
    };
    state.stage = "final";
    return;
  }
  const weeks =
    nextStage === "quarterFinals"
      ? CHAMPIONS_LEAGUE_SCHEDULE.quarterFinals
      : CHAMPIONS_LEAGUE_SCHEDULE.semiFinals;
  const [week, secondWeek] = weeks;
  state.knockout[nextStage] = makeTies(teams, nextStage);
  for (const tie of state.knockout[nextStage]) {
    tie.firstLeg = {
      id: `${tie.id}-1`,
      homeId: tie.homeId,
      awayId: tie.awayId,
      week,
      played: false,
    };
    tie.secondLeg = {
      id: `${tie.id}-2`,
      homeId: tie.awayId,
      awayId: tie.homeId,
      week: secondWeek,
      played: false,
    };
  }
  state.stage = nextStage;
}

function simulateKnockoutLeg(state, leg, competition, rng) {
  const result = simulateFixtureResult(leg, competition, rng, false);
  Object.assign(leg, result, { played: true });
  addPlayerStats(state, result.playerStats, { knockout: true });
  return result;
}

export function recordChampionsLeagueFixture(state, fixtureId, result) {
  const fixtures = [
    ...(state.leaguePhase?.fixtures ?? []),
    ...["roundOf16", "quarterFinals", "semiFinals"].flatMap((stage) =>
      (state.knockout?.[stage] ?? []).flatMap((tie) => [
        tie.firstLeg,
        tie.secondLeg,
      ]),
    ),
    state.knockout?.final,
  ].filter(Boolean);
  const fixture = fixtures.find((entry) => entry.id === fixtureId);
  if (!fixture)
    throw new Error(`Unknown Champions League fixture: ${fixtureId}`);
  Object.assign(fixture, result, { played: true });
  fixture.status = "completed";
  if (!fixture.statsRecorded) {
    const isLeaguePhase = state.leaguePhase?.fixtures.includes(fixture);
    addPlayerStats(state, result.playerStats, {
      knockout: !isLeaguePhase,
      final: fixture === state.knockout?.final,
    });
    fixture.statsRecorded = true;
  }
  if (state.leaguePhase?.fixtures.includes(fixture)) {
    const home = state.leaguePhase.standings.find(
      (row) => row.teamId === fixture.homeId,
    );
    const away = state.leaguePhase.standings.find(
      (row) => row.teamId === fixture.awayId,
    );
    record(home, result.homeGoals, result.awayGoals);
    record(away, result.awayGoals, result.homeGoals);
    state.leaguePhase.standings = rank(state.leaguePhase.standings);
  }
  if (fixture === state.knockout?.final) {
    state.winnerId = result.winnerId;
    state.runnerUpId =
      result.winnerId === fixture.homeId ? fixture.awayId : fixture.homeId;
    state.finalScore = {
      home: result.homeGoals,
      away: result.awayGoals,
    };
    state.stage = "complete";
    state.status = "complete";
  }
  return fixture;
}

function resolveKnockoutStage(state, stage, rng) {
  const ties = state.knockout[stage] ?? [];
  if (
    !ties.length ||
    ties.some((tie) => !tie.firstLeg?.played || !tie.secondLeg?.played)
  ) {
    return false;
  }
  if (ties.every((tie) => tie.winnerId)) return false;
  const winners = [];
  for (const tie of ties) {
    const first = tie.firstLeg.result ?? tie.firstLeg;
    const second = tie.secondLeg.result ?? tie.secondLeg;
    const homeTotal = first.homeGoals + second.awayGoals;
    const awayTotal = first.awayGoals + second.homeGoals;
    tie.winnerId =
      homeTotal === awayTotal
        ? rng.chance(0.5)
          ? tie.homeId
          : tie.awayId
        : homeTotal > awayTotal
          ? tie.homeId
          : tie.awayId;
    tie.decidedBy = homeTotal === awayTotal ? "penalties" : "aggregate";
    winners.push(tie.winnerId);
  }
  createNextKnockoutStage(state, stage, winners);
  return true;
}

export function simulateChampionsLeagueWeek(
  state,
  rng,
  week,
  { skipFixtureIds = [] } = {},
) {
  const competition = {
    teams: state.leaguePhaseTeams,
  };
  const due = state.leaguePhase.fixtures.filter(
    (fixture) =>
      !fixture.played &&
      fixture.week === week &&
      !skipFixtureIds.includes(fixture.id),
  );
  for (const fixture of due)
    simulateLeagueFixture(state, fixture, competition, rng);
  if (due.length)
    state.leaguePhase.standings = rank(state.leaguePhase.standings);
  if (
    !state.leaguePhase.completed &&
    state.leaguePhase.fixtures.length &&
    state.leaguePhase.fixtures.every((fixture) => fixture.played)
  ) {
    state.leaguePhase.completed = true;
    state.leaguePhase.standings = rank(state.leaguePhase.standings);
    state.stage = "round-of-16";
    const teams = state.leaguePhase.standings
      .slice(0, 16)
      .map((row) => row.teamId);
    const seededTeams = Array.from({ length: teams.length / 2 }, (_, index) => [
      teams[index],
      teams[teams.length - 1 - index],
    ]).flat();
    state.knockout.roundOf16 = makeTies(seededTeams, "roundOf16");
    for (const tie of state.knockout.roundOf16) {
      tie.firstLeg = {
        id: `${tie.id}-1`,
        homeId: tie.homeId,
        awayId: tie.awayId,
        week: CHAMPIONS_LEAGUE_SCHEDULE.roundOf16[0],
        played: false,
      };
      tie.secondLeg = {
        id: `${tie.id}-2`,
        homeId: tie.awayId,
        awayId: tie.homeId,
        week: CHAMPIONS_LEAGUE_SCHEDULE.roundOf16[1],
        played: false,
      };
    }
  }
  for (const stage of ["roundOf16", "quarterFinals", "semiFinals"]) {
    for (const tie of state.knockout[stage] ?? []) {
      for (const leg of [tie.firstLeg, tie.secondLeg]) {
        if (
          leg &&
          !leg.played &&
          leg.week === week &&
          !skipFixtureIds.includes(leg.id)
        ) {
          simulateKnockoutLeg(state, leg, competition, rng);
        }
      }
    }
    resolveKnockoutStage(state, stage, rng);
  }
  const final = state.knockout.final;
  if (
    final &&
    !final.played &&
    final.week === week &&
    !skipFixtureIds.includes(final.id)
  ) {
    const result = simulateFixtureResult(final, competition, rng, true);
    Object.assign(final, result, { played: true, venue: "Neutral stadium" });
    state.winnerId = result.winnerId;
    state.runnerUpId =
      result.winnerId === result.homeId ? result.awayId : result.homeId;
    state.finalScore = { home: result.homeGoals, away: result.awayGoals };
    addPlayerStats(state, result.playerStats, { knockout: true, final: true });
    state.stage = "complete";
    state.status = "complete";
  }
  return state;
}

export function simulateChampionsLeague(state, rng) {
  for (const week of [
    ...CHAMPIONS_LEAGUE_SCHEDULE.leaguePhase,
    ...CHAMPIONS_LEAGUE_SCHEDULE.roundOf16,
    ...CHAMPIONS_LEAGUE_SCHEDULE.quarterFinals,
    ...CHAMPIONS_LEAGUE_SCHEDULE.semiFinals,
    CHAMPIONS_LEAGUE_SCHEDULE.final,
  ]) {
    simulateChampionsLeagueWeek(state, rng, week);
  }
  return state;
}
