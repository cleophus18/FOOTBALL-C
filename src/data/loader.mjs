import { readFile } from "node:fs/promises";
import { parsePlayerDatabaseCsv } from "./player-database.mjs";
import {
  buildPlayableCareerLeagues,
  parseCompetitionMetadataCsv,
} from "./fc25-roster.mjs";

const readJson = (path) =>
  readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");

/** Load the local game data for Node-based tools and tests. */
export async function loadData() {
  const [
    clubs,
    leagueConfig,
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    agents,
    competitionCsv,
    careerLeagueTeams,
    expandedLeagueConfig,
    europeanAccessConfig,
    playerDatabaseCsv,
    keyMomentOptions,
  ] = await Promise.all([
    readJson("../../data/config/clubs.json"),
    readJson("../../data/config/leagues.json"),
    readJson("../../data/config/archetypes.json"),
    readJson("../../data/squads/ENG.json"),
    readJson("../../data/config/objectives.json"),
    readJson("../../data/config/career.json"),
    readJson("../../data/config/agents.json"),
    readText("../../data/config/football_leagues.csv"),
    readJson("../../data/config/career-league-teams.json"),
    readJson("../../data/config/expanded-leagues.json"),
    readJson("../../data/config/europe-access.json"),
    readText("../../data/squads/touchline_player_database.csv"),
    readJson("../../data/config/key-moment-options.json"),
  ]);

  leagueConfig.$expandedLeagues = expandedLeagueConfig;
  leagueConfig.$europeanAccess = europeanAccessConfig;
  const playerDatabase = parsePlayerDatabaseCsv(playerDatabaseCsv);
  const players = playerDatabase.players;
  const expectedClubCounts = Object.fromEntries(
    Object.entries(careerLeagueTeams)
      .filter(([league]) => playerDatabase.report.byLeague[league])
      .map(([league, clubs]) => [league, clubs.length]),
  );
  const slug = (value) =>
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const clubCounts = new Map();
  for (const player of players) {
    const key = `${player.league}:${slug(player.clubName)}`;
    clubCounts.set(key, (clubCounts.get(key) ?? 0) + 1);
  }
  const unmatchedClubs = [];
  const configuredClubsByLeague = new Map(
    Object.entries(careerLeagueTeams)
      .filter(([, clubs]) => Array.isArray(clubs))
      .map(([league, clubs]) => [league, new Set(clubs.map(slug))]),
  );
  for (const [league, clubs] of playerDatabase.byLeague) {
    const leagueName = players.find(
      (player) => player.league.toLowerCase() === league,
    )?.league;
    const configured = configuredClubsByLeague.get(leagueName) ?? new Set();
    for (const club of new Set(clubs.map((player) => slug(player.clubName)))) {
      if (!configured.has(club))
        unmatchedClubs.push({ league: leagueName, club });
    }
  }
  playerDatabase.expectedClubCounts = expectedClubCounts;
  playerDatabase.unmatchedClubs = unmatchedClubs;
  if (unmatchedClubs.length) {
    const details = unmatchedClubs
      .map(({ league, club }) => `${league}: ${club}`)
      .join(", ");
    throw new Error(
      `Player database contains clubs not configured for the five leagues: ${details}.`,
    );
  }
  playerDatabase.incompleteLeagues = Object.entries(expectedClubCounts)
    .filter(([leagueName, expected]) => {
      const leaguePlayers = playerDatabase.byLeague.get(leagueName.toLowerCase()) ?? [];
      const coveredClubs = new Set(leaguePlayers.map((player) => slug(player.clubName)));
      return (
        coveredClubs.size < expected ||
        [...coveredClubs].some(
          (clubId) =>
            (clubCounts.get(`${leagueName}:${clubId}`) ?? 0) < 20,
        )
      );
    })
    .map(([leagueName]) => leagueName);
  return {
    clubs,
    league: leagueConfig["premier-league"],
    leagueConfig,
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    agents,
    keyMomentOptions,
    expandedLeagueConfig,
    europeanAccessConfig,
    playerDatabase,
    fc25Players: players,
    fc25Leagues: [],
    careerLeagues: buildPlayableCareerLeagues(
      players,
      parseCompetitionMetadataCsv(competitionCsv),
      careerLeagueTeams,
    ),
  };
}
