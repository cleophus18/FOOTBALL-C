import { normalizePosition } from "../core/constants.mjs";
import { toDayIndex } from "../core/calendar.mjs";

export const WORLD_CUP_INTERVAL = 4;
export const WORLD_CUP_SQUAD_SIZE = 26;
export const WORLD_CUP_START_YEAR_OFFSET = 4;

const POSITION_GROUPS = {
  GK: new Set(["GK"]),
  DEF: new Set(["CB", "LB", "RB"]),
  MID: new Set(["DM", "CDM", "CM", "AM", "CAM", "LM", "RM"]),
  ATT: new Set(["LW", "RW", "ST"]),
};
const POSITION_TARGETS = [
  ["GK", 3],
  ["DEF", 8],
  ["MID", 8],
  ["ATT", 7],
];
export const NATION_NAMES = {
  ARG: "Argentina",
  AUS: "Australia",
  BEL: "Belgium",
  BRA: "Brazil",
  CAN: "Canada",
  CIV: "Ivory Coast",
  COL: "Colombia",
  CRO: "Croatia",
  EGY: "Egypt",
  ENG: "England",
  ESP: "Spain",
  FRA: "France",
  GER: "Germany",
  GHA: "Ghana",
  ITA: "Italy",
  JPN: "Japan",
  KOR: "South Korea",
  MAR: "Morocco",
  MEX: "Mexico",
  NED: "Netherlands",
  NGA: "Nigeria",
  POL: "Poland",
  POR: "Portugal",
  RSA: "South Africa",
  SEN: "Senegal",
  SUI: "Switzerland",
  TUR: "Turkey",
  UKR: "Ukraine",
  URU: "Uruguay",
  USA: "United States",
};

export function worldCupSchedule(startYear) {
  const firstYear = Number(startYear) + WORLD_CUP_START_YEAR_OFFSET;
  return {
    startYear: Number(startYear),
    firstYear,
    interval: WORLD_CUP_INTERVAL,
    nextYear: firstYear,
    history: [],
    qualification: null,
    tournament: null,
  };
}

export function worldCupQualificationRound(schedule, season) {
  const firstQualificationSeason = Number(schedule?.nextYear) - WORLD_CUP_INTERVAL;
  const currentSeason = Number(season);
  if (
    !Number.isInteger(firstQualificationSeason) ||
    !Number.isInteger(currentSeason) ||
    currentSeason < firstQualificationSeason ||
    currentSeason >= Number(schedule.nextYear)
  ) {
    return null;
  }
  return currentSeason - firstQualificationSeason;
}

export function worldCupFixtureDay(year, stage, round = 0) {
  const dates = {
    group: [11, 19, 27].map((day) => toDayIndex(year, 6, day)),
    "Round of 32": toDayIndex(year, 7, 1),
    "Round of 16": toDayIndex(year, 7, 7),
    "Quarter-finals": toDayIndex(year, 7, 13),
    "Semi-finals": toDayIndex(year, 7, 19),
    "Third-place playoff": toDayIndex(year, 7, 25),
    Final: toDayIndex(year, 7, 26),
  };
  if (stage === "group") return dates.group[round] ?? dates.group.at(-1);
  const day = dates[stage];
  if (Number.isFinite(day)) return day;
  const genericRound = /^Knockout round of (\d+)$/i.exec(String(stage));
  if (genericRound) {
    const teamCount = Number(genericRound[1]);
    if (teamCount > 16) return dates["Round of 32"];
    if (teamCount > 8) return dates["Round of 16"];
    if (teamCount > 4) return dates["Quarter-finals"];
    if (teamCount > 2) return dates["Semi-finals"];
    if (teamCount === 2) return dates.Final;
  }
  if (!Number.isFinite(day)) throw new Error(`Unknown World Cup stage: ${stage}`);
  return day;
}

export function nationalTeamReputation(player) {
  const score = Number(player?.internationalReputation ?? 0);
  if (score >= 85) return "National team superstar";
  if (score >= 65) return "Key national team player";
  if (score >= 45) return "Established international";
  if (score >= 25) return "National team contender";
  if (score >= 10) return "Emerging talent";
  return "Unknown prospect";
}

export function nationalTeamSelectionScore(player, clubLevel = 50) {
  const overall = Number(player.overall) || 0;
  const form = Number(player.form ?? 50);
  const recent = Array.isArray(player.recentMatchRatings)
    ? player.recentMatchRatings.map(Number).filter(Number.isFinite)
    : [];
  const stats = player.stats ?? player.careerStats ?? {};
  const recentAverage = recent.length
    ? recent.reduce((sum, rating) => sum + rating, 0) / recent.length
    : Number(stats.apps)
      ? Number(stats.ratingSum ?? 0) / stats.apps
      : 6.4;
  const apps = Number(stats.apps) || 0;
  const output = Math.min(
    3,
    Number(stats.goals ?? 0) * 0.22 + Number(stats.assists ?? 0) * 0.16,
  );
  const defensivePerAppearance =
    (Number(stats.tacklesWon ?? 0) +
      Number(stats.interceptions ?? 0) +
      Number(stats.blocks ?? 0) +
      Number(stats.aerialsWon ?? 0) * 0.5) /
    Math.max(1, apps);
  const consistency = recent.length >= 3
    ? Math.max(
        -1,
        1.5 -
          Math.sqrt(
            recent.reduce(
              (sum, rating) => sum + (rating - recentAverage) ** 2,
              0,
            ) / recent.length,
          ) *
            1.5,
      )
    : 0;
  const injuryPenalty = player.injury ? 28 : 0;
  const fatiguePenalty =
    Math.max(0, Number(player.fatigue ?? 0) - 30) * 0.18;
  const potentialCredit = Math.max(
    0,
    Math.min(7, Number(player.potential ?? overall) - overall),
  ) * 0.35;
  return (
    overall * 0.58 +
    (form - 50) * 0.22 +
    (recentAverage - 6) * 6 +
    Math.min(apps, 30) * 0.08 +
    output +
    Math.min(2, defensivePerAppearance * 0.2) +
    consistency +
    (clubLevel - 50) * 0.08 +
    Number(player.internationalReputation ?? 0) * 0.12 +
    potentialCredit -
    injuryPenalty -
    fatiguePenalty
  );
}

export function selectNationalTeamSquad(players, nation, clubLevels = {}) {
  const candidates = players
    .filter(
      (player) =>
        player.nationality === nation &&
        player.id &&
        !player.retired &&
        !player.internationalRetired,
    )
    .map((player) => ({
      player,
      score: nationalTeamSelectionScore(
        player,
        clubLevels[player.clubId] ?? 50,
      ),
      position: normalizePosition(player.position),
    }))
    .sort((left, right) => right.score - left.score);
  if (candidates.length < WORLD_CUP_SQUAD_SIZE) return null;

  const selected = [];
  const used = new Set();
  for (const [group, target] of POSITION_TARGETS) {
    const positions = POSITION_GROUPS[group];
    for (const candidate of candidates) {
      if (selected.length >= WORLD_CUP_SQUAD_SIZE) break;
      if (used.has(candidate.player.id) || !positions.has(candidate.position))
        continue;
      if (
        selected.filter((entry) => positions.has(entry.position)).length >=
        target
      )
        break;
      selected.push(candidate);
      used.add(candidate.player.id);
    }
  }
  if (selected.length !== WORLD_CUP_SQUAD_SIZE) return null;
  return selected.map(({ player, score }) => ({ player, score }));
}

export function worldCupFieldSize(eligibleNationCount) {
  if (eligibleNationCount >= 48) return 48;
  if (eligibleNationCount >= 32) return 32;
  if (eligibleNationCount >= 24) return 24;
  if (eligibleNationCount >= 16) return 16;
  if (eligibleNationCount >= 8) return 8;
  if (eligibleNationCount >= 4) return 4;
  return 0;
}

export function drawGroups(teams, groupSize, rng) {
  if (!Number.isInteger(groupSize) || groupSize < 2)
    throw new Error("International group size must be at least two.");
  const groups = Array.from(
    { length: Math.ceil(teams.length / groupSize) },
    (_, index) => ({ id: `Group ${String.fromCharCode(65 + index)}`, teams: [] }),
  );
  const ranked = rng.shuffled([...teams]).sort(
    (left, right) => right.rating - left.rating,
  );
  ranked.forEach((team, index) => {
    const band = Math.floor(index / groups.length);
    const groupIndex =
      band % 2 === 0 ? index % groups.length : groups.length - 1 - (index % groups.length);
    groups[groupIndex].teams.push(team);
  });
  return groups;
}

export function roundRobinFixtures(groups, prefix) {
  return groups.flatMap((group) => {
    const teams = [...group.teams];
    if (teams.length % 2) teams.push(null);
    const rounds = teams.length - 1;
    const fixtures = [];
    for (let round = 0; round < rounds; round++) {
      for (let index = 0; index < teams.length / 2; index++) {
        const home = teams[index];
        const away = teams[teams.length - 1 - index];
        if (home && away) {
          fixtures.push({
            id: `${prefix}:${group.id}:${round}:${home.id}:${away.id}`,
            groupId: group.id,
            round,
            homeId: round % 2 ? away.id : home.id,
            awayId: round % 2 ? home.id : away.id,
            status: "scheduled",
            homeGoals: null,
            awayGoals: null,
          });
        }
      }
      teams.splice(1, 0, teams.pop());
    }
    return fixtures;
  });
}

export function emptyInternationalTable(teams) {
  return teams.map((team) => ({
    teamId: team.id,
    name: team.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
}

export function updateInternationalTable(table, fixture) {
  const home = table.find((row) => row.teamId === fixture.homeId);
  const away = table.find((row) => row.teamId === fixture.awayId);
  if (!home || !away) throw new Error(`Unknown national team in ${fixture.id}.`);
  home.played++;
  away.played++;
  home.goalsFor += fixture.homeGoals;
  home.goalsAgainst += fixture.awayGoals;
  away.goalsFor += fixture.awayGoals;
  away.goalsAgainst += fixture.homeGoals;
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;
  if (fixture.homeGoals > fixture.awayGoals) {
    home.won++;
    home.points += 3;
    away.lost++;
  } else if (fixture.homeGoals < fixture.awayGoals) {
    away.won++;
    away.points += 3;
    home.lost++;
  } else {
    home.drawn++;
    away.drawn++;
    home.points++;
    away.points++;
  }
}

export function sortInternationalTable(table, fixtures = []) {
  const rowsByPoints = new Map();
  for (const row of table) {
    const tied = rowsByPoints.get(row.points) ?? [];
    tied.push(row);
    rowsByPoints.set(row.points, tied);
  }
  const ranked = [];
  for (const [points, tiedRows] of [...rowsByPoints].sort(
    ([left], [right]) => right - left,
  )) {
    if (tiedRows.length < 2) {
      ranked.push(...tiedRows);
      continue;
    }
    const tiedIds = new Set(tiedRows.map((row) => row.teamId));
    const headToHead = new Map(
      tiedRows.map((row) => [
        row.teamId,
        { points: 0, goalDifference: 0, goalsFor: 0 },
      ]),
    );
    for (const fixture of fixtures) {
      if (
        fixture.status !== "completed" ||
        !tiedIds.has(fixture.homeId) ||
        !tiedIds.has(fixture.awayId) ||
        !Number.isFinite(fixture.homeGoals) ||
        !Number.isFinite(fixture.awayGoals)
      ) {
        continue;
      }
      const home = headToHead.get(fixture.homeId);
      const away = headToHead.get(fixture.awayId);
      home.goalsFor += fixture.homeGoals;
      home.goalDifference += fixture.homeGoals - fixture.awayGoals;
      away.goalsFor += fixture.awayGoals;
      away.goalDifference += fixture.awayGoals - fixture.homeGoals;
      if (fixture.homeGoals > fixture.awayGoals) home.points += 3;
      else if (fixture.homeGoals < fixture.awayGoals) away.points += 3;
      else {
        home.points++;
        away.points++;
      }
    }
    ranked.push(
      ...[...tiedRows].sort((left, right) => {
        const leftHead = headToHead.get(left.teamId);
        const rightHead = headToHead.get(right.teamId);
        return (
          rightHead.points - leftHead.points ||
          rightHead.goalDifference - leftHead.goalDifference ||
          rightHead.goalsFor - leftHead.goalsFor ||
          right.goalDifference - left.goalDifference ||
          right.goalsFor - left.goalsFor ||
          left.name.localeCompare(right.name)
        );
      }),
    );
  }
  return ranked;
}
