import { readFile } from "node:fs/promises";
import { createCareer } from "./src/career.mjs";
import {
  buildPlayableCareerLeagues,
  combineRosterPlayers,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
} from "./src/data/fc25-roster.mjs";

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
      new URL("./data/squads/fc26_player_ratings.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./data/config/fc26-club-leagues.json", import.meta.url),
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
      new URL("./data/squads/player_additions.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("./data/config/supplemental-club-aliases.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("./data/config/key-moment-options.json", import.meta.url),
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

function options(seed = 22841) {
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
data.agents = [
  {
    id: "agent-1",
    name: "Milo Ace",
    specialty: "Deals",
    rating: 80,
    fee: 100000,
    reputation: 75,
  },
  {
    id: "agent-2",
    name: "Ava North",
    specialty: "Contracts",
    rating: 75,
    fee: 90000,
    reputation: 70,
  },
];
const career = createCareer(data, options());
career.week = 0;
career.money = 5_000_000;
const summer = new Date(
  Date.UTC(2000, 0, 1) + career.calendar[0].day * 86400000,
);
summer.setUTCMonth(6, 15);
career.calendar[0].day = Math.round(
  (summer.getTime() - Date.UTC(2000, 0, 1)) / 86400000,
);
career.calendar[0].matchday = career.calendar[0].day + 5;
career.player.overall = 90;
career.player.potential = 94;
career.hireAgent(career.agentPool[0].id);
for (const club of career.clubs) {
  const striker = career.players.find(
    (item) => item.clubId === club.id && item.position === "ST",
  );
  if (!striker) continue;
  striker.overall = 45;
  striker.potential = 52;
  striker.source = "generated";
  for (const attribute of Object.keys(striker.subAttrs ?? {}))
    striker.subAttrs[attribute] = 45;
}
career.transferMarketState.searchCount = 0;
career.transferMarketState.lastSearchDay = null;
console.log(
  "currentDay",
  career.currentDay(),
  "month",
  new Date(Date.UTC(2000, 0, 1) + career.currentDay() * 86400000)
    .toISOString()
    .slice(0, 10),
);
console.log("window?", career.isTransferWindowWeek());
console.log("player overall", career.player.overall, "club", career.club.id);
const interest = career.evaluateTransferInterest(career.player, {
  threshold: 0,
});
console.log("interest count", interest.length);
console.log(
  "pre",
  JSON.stringify(
    career
      .evaluateTransferInterest(career.player, {
        threshold: 0,
        excludeClubId: null,
      })
      .slice(0, 10)
      .map((e) => [
        e.club.id,
        e.fit.score,
        e.fit.demand,
        e.fit.affordability,
        e.fit.wageFit,
      ]),
  ),
);
console.log("players", career.players.length, "clubs", career.clubs.length);
console.log("position", career.player.position);
{
  const { scoreTransferSuitability } =
    await import("./src/model/transfer-market.mjs");
  const club = career.clubs.find((c) => c.id === "arsenal");
  const needs = career.transferNeedAssessment(club, career.currentDay());
  const squad = career.playersForClub(club.id);
  const fit = scoreTransferSuitability({
    player: career.player,
    club: {
      ...club,
      currentWageBill: career.getWageBill(club.id),
      _marketSquad: squad,
    },
    needs,
    agentQuality: 80,
    leagueReputation: 80,
    performanceBonus: 0,
  });
  console.log(
    "arsenal fit",
    JSON.stringify(fit),
    JSON.stringify(club.finances),
  );
}
for (const entry of interest.slice(0, 12)) {
  console.log(
    entry.club.id,
    entry.club.name,
    entry.club.prestige,
    JSON.stringify(entry.fit),
  );
}
const probeClub = career.clubs.find((c) => c.id !== career.club.id);
const probeNeeds = career.transferNeedAssessment(
  probeClub,
  career.currentDay(),
);
console.log(
  "probe",
  probeClub.id,
  probeClub.name,
  JSON.stringify(probeNeeds.ST),
);
console.log(
  "player marketValue",
  career.player.marketValue,
  "overall",
  career.player.overall,
  "age",
  career.player.age,
  "potential",
  career.player.potential,
);
const offers = career.generateTransferOffers();
console.log("offers", offers.length);
