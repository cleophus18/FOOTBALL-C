import { readFile } from "node:fs/promises";
import {
  buildPlayableCareerLeagues,
  combineRosterPlayers,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
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
    ratingsCsv,
    fc26ClubLeagues,
    competitionCsv,
    careerLeagueTeams,
    expandedLeagueConfig,
    europeanAccessConfig,
    supplementalCsv,
    supplementalAliases,
    keyMomentOptions,
  ] = await Promise.all([
    readJson("../../data/config/clubs.json"),
    readJson("../../data/config/leagues.json"),
    readJson("../../data/config/archetypes.json"),
    readJson("../../data/squads/ENG.json"),
    readJson("../../data/config/objectives.json"),
    readJson("../../data/config/career.json"),
    readJson("../../data/config/agents.json"),
    readText("../../data/squads/fc26_player_ratings.csv"),
    readJson("../../data/config/fc26-club-leagues.json"),
    readText("../../data/config/football_leagues.csv"),
    readJson("../../data/config/career-league-teams.json"),
    readJson("../../data/config/expanded-leagues.json"),
    readJson("../../data/config/europe-access.json"),
    readText("../../data/squads/player_additions.csv"),
    readJson("../../data/config/supplemental-club-aliases.json"),
    readJson("../../data/config/key-moment-options.json"),
  ]);

  leagueConfig.$expandedLeagues = expandedLeagueConfig;
  leagueConfig.$europeanAccess = europeanAccessConfig;
  const players = combineRosterPlayers(
    parseFc26RatingsCsv(ratingsCsv, fc26ClubLeagues),
    parseSupplementalPlayersCsv(supplementalCsv, supplementalAliases),
  );
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
    fc25Players: players,
    fc25Leagues: [],
    careerLeagues: buildPlayableCareerLeagues(
      players,
      parseCompetitionMetadataCsv(competitionCsv),
      careerLeagueTeams,
    ),
  };
}
