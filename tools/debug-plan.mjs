/** Debug: which week does the first user match fall on, and what did MI plan? */
import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";
import {
  buildPlayableCareerLeagues,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
} from "../src/data/fc25-roster.mjs";

const [
  clubs,
  leagues,
  archetypes,
  squadTemplate,
  objectives,
  careerSettings,
  ratings,
  mappings,
  metadata,
  teams,
  additions,
  aliases,
  keyMomentOptions,
] = await Promise.all([
  readFile(new URL("../data/config/clubs.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
  readFile(
    new URL("../data/config/leagues.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(
    new URL("../data/config/archetypes.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(new URL("../data/squads/ENG.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
  readFile(
    new URL("../data/config/objectives.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(new URL("../data/config/career.json", import.meta.url), "utf8").then(
    JSON.parse,
  ),
  readFile(
    new URL("../data/squads/fc26_player_ratings.csv", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../data/config/fc26-club-leagues.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(
    new URL("../data/config/football_leagues.csv", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../data/config/career-league-teams.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(
    new URL("../data/squads/player_additions.csv", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../data/config/supplemental-club-aliases.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
  readFile(
    new URL("../data/config/key-moment-options.json", import.meta.url),
    "utf8",
  ).then(JSON.parse),
]);
const added = additions.trim()
  ? parseSupplementalPlayersCsv(additions, aliases)
  : [];
const players = parseFc26RatingsCsv(ratings, mappings);
const data = {
  clubs,
  league: leagues["premier-league"],
  archetypes,
  squadTemplate,
  objectives,
  careerSettings,
  keyMomentOptions,
  careerLeagues: buildPlayableCareerLeagues(
    players,
    parseCompetitionMetadataCsv(metadata),
    teams,
  ),
  agents: [],
};

const options = (seed = 1) => ({
  first: "Alex",
  last: "Morgan",
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
  leagueId: "world-premier-league",
  clubId: "hull",
  seed,
});

const career = createCareer(data, options(74902));
career.club.formation = "4-3-3";
const incumbent = career.players.find(
  (p) =>
    p.clubId === career.club.id &&
    p.position === "ST" &&
    p.id !== career.player.id,
);
career.player.overall = 55;
career.player.attrs = Object.fromEntries(
  Object.keys(career.player.attrs).map((a) => [a, 45]),
);
career.player.attrs.shooting = 50;
incumbent.attrs = Object.fromEntries(
  Object.keys(incumbent.attrs).map((a) => [a, 90]),
);
incumbent.fatigue = 0;
career.player.trusting.manager = 60;
career.player.attrs = Object.fromEntries(
  Object.keys(career.player.attrs).map((a) => [a, 88]),
);
career.player.attrs.shooting = 92;
career.player.overall = 70;
incumbent.fatigue = 40;

const orig = career.matchInvolvement.bind(career);
career.matchInvolvement = (...args) => {
  const result = orig(...args);
  console.log(
    "MI@week",
    career.week,
    JSON.stringify(result),
    "incFat",
    incumbent.fatigue,
  );
  return result;
};
let report;
do {
  report = career.advanceWeek();
  console.log(
    "week",
    career.week,
    "userMatch:",
    !!report.userMatch,
    report.userMatch
      ? `userXI=${report.userMatch[report.userMatch.side].xi.includes(career.player.id)} incXI=${report.userMatch[report.userMatch.side].xi.includes(incumbent.id)}`
      : "",
  );
} while (!report.userMatch);
