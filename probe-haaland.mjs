import { createCareer } from "./src/career.mjs";
import { loadData } from "./src/data/loader.mjs";

const data = await loadData();
console.time("loadData");
const career = createCareer(data, {
  first: "Test",
  last: "Player",
  position: "ST",
  leagueId: data.careerLeagues[0].id,
  clubId: data.careerLeagues[0].league.teamIds[0],
  seed: 38742,
});
console.timeEnd("loadData");
const generated = career.players.filter(
  (p) => p.source === "generated" || p.source?.startsWith("generated-"),
);
console.log("generated count", generated.length);
for (const p of generated.slice(0, 5))
  console.log(" ", p.id, p.first, p.last, p.position, p.clubId, p.source);
console.log("incompleteLeagues", data.playerDatabase.incompleteLeagues);