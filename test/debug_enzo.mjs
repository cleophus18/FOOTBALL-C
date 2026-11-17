import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";

async function loadData() {
  const [clubs, leagues, archetypes, squadTemplate, objectives, careerSettings, ratings, mappings, metadata, teams, additions, aliases, keyMomentOptions, expandedLeagueConfig, europeanAccessConfig] = await Promise.all([
    readFile(new URL("../data/config/clubs.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/leagues.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/archetypes.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/squad-template.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/objectives.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/career-settings.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/ratings.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/mappings.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/metadata.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/teams.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/additions.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/aliases.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/key-moment-options.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/expanded-league-config.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/config/european-access-config.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  return { clubs, leagues, archetypes, squadTemplate, objectives, careerSettings, ratings, mappings, metadata, teams, additions, aliases, keyMomentOptions, expandedLeagueConfig, europeanAccessConfig };
}

const options = (seed = 77021) => ({ seed, first: "Test", last: "Player", clubId: "manchestercity" });
const data = await loadData();
const career = createCareer(data, options(77021));

// Check if Enzo Fernandez exists
const enzo = career.players.find(p => p.first === "Enzo" && p.last === "Fernandez" && p.clubId === "chelsea");
console.log("Enzo at start:", enzo ? "YES" : "NO");
if (enzo) console.log("Enzo contract:", JSON.stringify(enzo.contract, null, 2));

// Check all Chelsea players
const chelseaPlayers = career.players.filter(p => p.clubId === "chelsea");
console.log("Chelsea players:", chelseaPlayers.map(p => p.first + " " + p.last + " (" + p.position + ")").join(", "));

// Check Haaland
const haaland = career.players.find(p => p.first === "Erling" && p.last === "Haaland");
console.log("Haaland:", haaland ? "YES" : "NO");
if (haaland) console.log("Haaland club:", haaland.clubId, "overall:", haaland.overall, "contract:", haaland.contract);