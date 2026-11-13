import { loadData } from "./src/data/loader.mjs";

const data = await loadData();
const laLiga = data.careerLeagues.find((e) => e.league.name === "La Liga");
const pl = data.careerLeagues.find((e) => e.league.name === "Premier League");
const find = (list, last) => list.find((p) => p.last === last);
for (const [label, club, last] of [
  ["La Liga", "fc-barcelona", "Messi"],
  ["Premier League", "manchester-united", "Ronaldo"],
]) {
  const entry = label === "La Liga" ? laLiga : pl;
  const player = find(entry.rostersByClub[club] ?? [], last);
  console.log(label, club, player ? [player.first, player.last, player.position, player.overall, player.source] : "MISSING");
}