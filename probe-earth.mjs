import { readFile } from "node:fs/promises";
import { createCareer } from "./src/career.mjs";
import {
  buildPlayableCareerLeagues,
  parseCompetitionMetadataCsv,
} from "./src/data/fc25-roster.mjs";
import { parsePlayerDatabaseCsv } from "./src/data/player-database.mjs";

async function loadData() {
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
    readFile(new URL("./data/config/clubs.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
    readFile(
      new URL("./data/config/leagues.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/archetypes.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(new URL("./data/squads/ENG.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
    readFile(
      new URL("./data/config/objectives.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/career.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/agents.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/football_leagues.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./data/config/career-league-teams.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/expanded-leagues.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/europe-access.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/squads/touchline_player_database.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./data/config/key-moment-options.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);
  const playerDatabase = parsePlayerDatabaseCsv(playerDatabaseCsv, {
    strict: true,
  });
  const players = playerDatabase.players;
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
    careerLeagues: buildPlayableCareerLeagues(
      players,
      parseCompetitionMetadataCsv(competitionCsv),
      careerLeagueTeams,
    ),
  };
}

function options(seed = 4242) {
  return {
    first: "Alex",
    last: "Hunter",
    age: "17",
    nationality: "ENG",
    height: "178",
    weight: "70",
    foot: "Right",
    weakFoot: "3",
    skillMoves: "4",
    position: "ST",
    archetype: "Poacher",
    startingOverall: "62",
    trait: "Wonderkid",
    personality: "Professional",
    difficulty: "Realistic",
    clubId: "hull",
    seed,
  };
}

const data = await loadData();
console.log("leagues", data.careerLeagues.length);
const career = createCareer(data, options());
console.log("clubs", career.clubs.length, "players", career.players.length);
const aged = career.players.filter((p) => p.age === 25).length;
console.log("players with the 25 fallback age:", aged);
const missingAge = career.players.filter((p) => !Number.isFinite(p.age)).length;
console.log("players with no age:", missingAge);
console.log(
  "age sample",
  career.players.slice(0, 8).map((p) => `${p.first} ${p.last}:${p.age}`),
);
