import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";
import {
  buildPlayableCareerLeagues,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
} from "../src/data/fc25-roster.mjs";

async function loadData() {
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
    readFile(
      new URL("../data/config/clubs.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
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
    readFile(
      new URL("../data/config/career.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
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
  const added =
    additions && additions.trim()
      ? parseSupplementalPlayersCsv(additions, aliases)
      : [];
  const players = parseFc26RatingsCsv(ratings, mappings);
  return {
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
}

const data = await loadData();
const options = (seed = 1) => ({
  seed,
  leagueId: "premier-league",
  clubId: "hull",
  creation: {
    age: "17",
    nationality: "ENG",
    height: "178",
    weight: "70",
  },
});
const career = createCareer(data, options(74902));
career.club.formation = "4-3-3";
const incumbent = career.players.find(
  (p) =>
    p.clubId === career.club.id &&
    p.position === career.player.position &&
    p.id !== career.player.id,
);
console.log(
  "incumbent:",
  incumbent?.id,
  incumbent?.position,
  "ovr",
  incumbent?.overall,
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
const inv = career.matchInvolvement();
console.log("involvement:", inv);
console.log(
  "trust:",
  career.player.trusting.manager,
  "ovr:",
  career.player.overall,
  "inc fatigue:",
  incumbent.fatigue,
);
incumbent.fatigue = 40;
const tired = career.matchInvolvement();
console.log("tired:", tired);
