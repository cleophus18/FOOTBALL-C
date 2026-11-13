import { createCareer } from "./src/career.mjs";
import { loadData } from "./src/data/loader.mjs";

const data = await loadData();
const career = createCareer(data, {
  first: "Test",
  last: "Player",
  position: "ST",
  clubId: "arsenal",
  seed: 816,
});
for (const league of [career.league, ...career.worldLeagues.map((s) => s.league)]) {
  const matches = 2 * (league.teamIds.length - 1);
  for (const row of league.table.rows.values()) row.played = matches;
}
career.advanceSeason();
career.completeChampionsLeagueIfDue();
const fixtures = career
  .getFixtureList()
  .filter((f) => f.competition === "UEFA Champions League");
console.log("count", fixtures.length);
for (const f of fixtures.slice(0, 12))
  console.log(
    JSON.stringify({
      id: f.id,
      round: f.roundLabel,
      played: f.played,
      result: f.result,
      home: f.home?.name ?? f.home,
      away: f.away?.name ?? f.away,
    }),
  );