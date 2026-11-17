import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";

async function loadData() {
  const [clubs, leagues, archetypes, squadTemplate, objectives, careerSettings, ratings, mappings, metadata, teams, additions, aliases, keyMomentOptions, expandedLeagueConfig, europeanAccessConfig] = await Promise.all([
    readFile(new URL("../data/config/clubs.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/archetypes.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/squads/ENG.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/objectives.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/career.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/squads/fc26_player_ratings.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/fc26-club-leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/football_leagues.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/career-league-teams.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/squads/player_additions.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/supplemental-club-aliases.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/key-moment-options.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/expanded-leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/europe-access.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  return { clubs, leagues, archetypes, squadTemplate, objectives, careerSettings, ratings, mappings, metadata, teams, additions, aliases, keyMomentOptions, expandedLeagueConfig, europeanAccessConfig };
}

function advanceAndResolve(career) {
  const report = career.advanceWeek();
  if (report.userMatch) {
    while (career.matchSimulation.status !== "finished") {
      const state = career.advanceMatchSimulation();
      if (
        state.status === "paused" &&
        !career.lastReport.userMatch.playerResult.keyMoments[state.momentIndex]
          .resolved
      ) {
        career.resolveKeyMoment(state.momentIndex, "play-safe");
      }
    }
  }
  return report;
}

const options = (seed = 77021) => ({ seed, first: "Test", last: "Player", clubId: "manchestercity" });
const data = await loadData();
const career = createCareer(data, options(77021));

// Check if Enzo Fernandez exists at start
let enzo = career.players.find(p => p.first === "Enzo" && p.last === "Fernandez" && p.clubId === "chelsea");
console.log("Enzo at start:", enzo ? "YES" : "NO");
if (enzo) console.log("Enzo contract:", JSON.stringify(enzo.contract, null, 2));

// Check Chelsea manager
const chelseaClub = career.clubs.find(c => c.id === "chelsea");
if (chelseaClub && chelseaClub.manager) {
  console.log("Chelsea manager:", chelseaClub.manager.first, chelseaClub.manager.last);
  console.log("Chelsea manager personality:", chelseaClub.manager.personality);
}

// Run season
let weeks = 0;
const maxWeeks = career.calendar.length + 10;
while (!career.seasonComplete && weeks < maxWeeks) {
  advanceAndResolve(career);
  weeks++;
  
  // Check Enzo every 10 weeks
  if (weeks % 10 === 0) {
    enzo = career.players.find(p => p.first === "Enzo" && p.last === "Fernandez" && p.clubId === "chelsea");
    if (!enzo) {
      console.log(`Week ${weeks}: Enzo no longer at Chelsea!`);
      // Find where he went
      const enzoAnywhere = career.players.find(p => p.first === "Enzo" && p.last === "Fernandez");
      if (enzoAnywhere) {
        console.log(`  Found at: ${enzoAnywhere.clubId}, contract: ${JSON.stringify(enzoAnywhere.contract)}`);
      }
      break;
    }
  }
}

// Check Enzo at end
enzo = career.players.find(p => p.first === "Enzo" && p.last === "Fernandez" && p.clubId === "chelsea");
console.log("Enzo at end:", enzo ? "YES" : "NO");
if (enzo) console.log("Enzo leagueGoals:", enzo.leagueGoals);

// Check Golden Boot
const goalScorers = career.players.filter((player) => player.leagueGoals > 0);
const mostGoals = Math.max(...goalScorers.map((player) => player.leagueGoals));
console.log("Most goals:", mostGoals);
console.log("Top scorers:", goalScorers.filter(p => p.leagueGoals === mostGoals).map(p => `${p.clubId}:${p.first} ${p.last} (${p.leagueGoals})`));