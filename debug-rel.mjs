import { readFile } from "node:fs/promises";
import { createCareer } from "./src/career.mjs";
import { createPlayer } from "./src/model/player.mjs";
import {
  buildPlayableCareerLeagues,
  combineRosterPlayers,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
} from "./src/data/fc25-roster.mjs";
import { evaluateRecruitmentRequest } from "./src/model/manager-personality.mjs";

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
    expandedLeagueConfig,
    europeanAccessConfig,
  ] = await Promise.all([
    readFile(new URL("./data/config/clubs.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/archetypes.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/squads/ENG.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/objectives.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/career.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/squads/fc26_player_ratings.csv", import.meta.url), "utf8"),
    readFile(new URL("./data/config/fc26-club-leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/football_leagues.csv", import.meta.url), "utf8"),
    readFile(new URL("./data/config/career-league-teams.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/squads/player_additions.csv", import.meta.url), "utf8"),
    readFile(new URL("./data/config/supplemental-club-aliases.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/key-moment-options.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/expanded-leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./data/config/europe-access.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  return {
    clubs,
    league: leagues["premier-league"],
    leagueConfig: leagues,
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    keyMomentOptions,
    expandedLeagueConfig,
    europeanAccessConfig,
    careerLeagues: buildPlayableCareerLeagues(
      combineRosterPlayers(
        parseFc26RatingsCsv(ratings, mappings),
        parseSupplementalPlayersCsv(additions, aliases),
      ),
      parseCompetitionMetadataCsv(metadata),
      teams,
    ),
  };
}

const career = createCareer(await loadData(), {
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
  seed: 7025,
});

const originalClub = career.club;
const limit = originalClub.registrationLimit ?? 25;
while (originalClub.squad.length < limit) {
  const reserve = createPlayer({
    id: `release-test-reserve-${originalClub.squad.length}`,
    first: "Reserve",
    last: `Player${originalClub.squad.length}`,
    position: "ST",
    clubId: originalClub.id,
    attrs: { pace: 10, shooting: 10, passing: 10, dribbling: 10, defending: 10, physical: 10 },
  });
  reserve.overall = 10;
  reserve.contract = { wage: 0 };
  career.players.push(reserve);
  originalClub.addPlayer(reserve.id);
}
const releaseCandidate = career.players
  .filter((p) => p.clubId === originalClub.id && p.id !== career.player.id && !p.isLegend)
  .sort((a, b) => a.overall - b.overall)[0];
releaseCandidate.overall = 1;
const seller = career.clubs.find((c) => c.id !== originalClub.id);
const sellerReserve = createPlayer({
  id: "manager-request-seller-reserve",
  first: "Seller",
  last: "Reserve",
  position: "ST",
  clubId: seller.id,
  attrs: { pace: 10, shooting: 10, passing: 10, dribbling: 10, defending: 10, physical: 10 },
});
sellerReserve.contract = { wage: 0 };
career.players.push(sellerReserve);
seller.addPlayer(sellerReserve.id);
const playerToSign = career.players.find(
  (p) =>
    p.clubId !== originalClub.id &&
    !p.isLegend &&
    career.clubs.find((c) => c.id === p.clubId)?.squad.length > 20,
);
playerToSign.overall = 50;
playerToSign.contract = { wage: 0 };
originalClub.finances.transferBudget = 1e9;
originalClub.finances.balance = 1e9;
originalClub.finances.wageBudget = 1e9;
for (const club of career.clubs) {
  if (club === originalClub) continue;
  club.finances.transferBudget = 0;
  club.finances.balance = 0;
  club.finances.wageBudget = 0;
}
career.player.trusting.manager = 100;
career.player.lastMatchRating = 10;

const request = career.requestBetterTeammates("", playerToSign.id);
console.log("squadSize", originalClub.squad.length, "limit", limit);
console.log("approved:", request.approved);
console.log("response:", request.response);
console.log("verdict:", JSON.stringify(request.managerVerdict, null, 2));
console.log("releaseCandidate clubId:", releaseCandidate.clubId, "squadSize after:", originalClub.squad.length);
console.log("playerToSign clubId:", playerToSign.clubId);
console.log("history[0]:", career.transferHistory[0]?.type, "history[1]:", career.transferHistory[1]?.type);
