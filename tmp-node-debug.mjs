// Headless reproduction of the manager next-season crash, with a real stack trace.
import { readFile } from "node:fs/promises";
import { createCareer } from "./src/career.mjs";
import {
  buildPlayableCareerLeagues,
  combineRosterPlayers,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
} from "./src/data/fc25-roster.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const json = async (path) => JSON.parse(await read(path));

const ratings = parseFc26RatingsCsv(
  await read("data/squads/fc26_player_ratings.csv"),
  await json("data/config/fc26-club-leagues.json"),
);
const added = parseSupplementalPlayersCsv(
  await read("data/squads/player_additions.csv"),
  await json("data/config/supplemental-club-aliases.json"),
);
const careerLeagues = buildPlayableCareerLeagues(
  combineRosterPlayers(ratings, added),
  parseCompetitionMetadataCsv(await read("data/config/football_leagues.csv")),
  await json("data/config/career-league-teams.json"),
);

const firstLeague = careerLeagues[0];
const data = {
  clubs: await json("data/config/clubs.json"),
  league: (await json("data/config/leagues.json"))["premier-league"],
  archetypes: await json("data/config/archetypes.json"),
  squadTemplate: await json("data/squads/ENG.json"),
  objectives: await json("data/config/objectives.json"),
  careerSettings: await json("data/config/career.json"),
  agents: await json("data/config/agents.json"),
  keyMomentOptions: await json("data/config/key-moment-options.json"),
  careerLeagues,
};

const clubId = firstLeague.league.teamIds[0];
const career = createCareer(data, {
  first: "Academy",
  last: "Graduate",
  nationality: "ENG",
  position: "CM",
  archetype: "Playmaker",
  personality: "Professional",
  height: "178",
  weight: "70",
  weakFoot: "3",
  skillMoves: "3",
  age: "17",
  leagueId: firstLeague.id,
  clubId,
  seed: 424242,
  difficulty: "Realistic",
  managerMode: true,
  manager: {
    first: "Sam",
    last: "Reeve",
    nationality: "ENG",
    style: "Balanced",
    leagueId: firstLeague.id,
    clubId,
  },
});

console.log("manager career:", career.isManagerCareer, career.club.name);
career.simulateToSeasonEnd();
console.log("seasonComplete:", career.seasonComplete);
console.log("manager seasons:", career.managerState.seasons.length);
try {
  const result = career.advanceSeason();
  console.log("advanced to", result.season, "manager verdict:", result.manager);
} catch (error) {
  console.error("ADVANCE FAILED:", error.message);
  console.error(error.stack);
}
