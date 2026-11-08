/** Debug: why doesn't the user get minutes at hull? */
import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";
import { effectiveRating } from "../src/model/player.mjs";
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

const career = createCareer(data, options(1));
const rivals = career.players.filter(
  (p) =>
    p.clubId === "hull" && p.position === "ST" && p.id !== career.player.id,
);
console.log(
  "rivals:",
  rivals
    .map(
      (r) => `${r.id}:${r.overall}:eff${effectiveRating(r, "ST").toFixed(1)}`,
    )
    .join(" "),
);
console.log("user eff:", effectiveRating(career.player, "ST").toFixed(1));
console.log("inv:", career.matchInvolvement());
