// Simulate a full season headlessly and report on the three data fixes:
//  1. honours recorded for legends / non-user players
//  2. grouped trophy counts
//  3. World Cup goal leaderboard
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";
import {
  groupHonours,
  seasonsLabel,
  totalTrophies,
} from "../src/model/honours.mjs";

const data = await loadData();
const career = createCareer(data, {
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
  clubId: "hull-city",
  seed: 41827,
});

const finishLiveMatch = () => {
  if (!career.matchSimulation || career.matchSimulation.status === "finished")
    return;
  if (career.matchSimulation.status === "ready") career.startMatchSimulation();
  let guard = 0;
  while (career.matchSimulation.status !== "finished" && guard++ < 500) {
    const state = career.advanceMatchSimulation();
    if (state.status === "paused")
      career.resolveKeyMoment(state.momentIndex, "play-safe");
  }
};

let guard = 0;
while (!career.seasonComplete && guard++ < 120) {
  try {
    career.advanceWeek();
    finishLiveMatch();
  } catch (error) {
    if (!/season/i.test(error.message)) throw error;
    break;
  }
}

console.log("season complete:", career.seasonComplete, "week", career.week);
const awards = career.currentSeasonAwards?.awards ?? [];
console.log("\nAWARDS:");
for (const award of awards) {
  const who = award.winners.map((w) => `${w.player} (${w.club})`).join(", ");
  console.log(
    `  ${award.award}: ${who || "—"} [${award.displayValue ?? award.value}]`,
  );
}

const legends = career.getLegends();
console.log("\nLEGENDS:");
for (const { player, clubName } of legends) {
  const honours = career.getPlayerHonours(player);
  console.log(
    `  ${player.first} ${player.last} @ ${clubName}: ${honours.length} honour(s)` +
      (honours.length
        ? ` — ${honours.map((h) => `${h.award} ${h.season}`).join("; ")}`
        : ""),
  );
}

const winnersWithHonours = career.players
  .concat(...career.worldLeagues.map((s) => s.performers))
  .filter((p) => (p.honours ?? []).length)
  .slice(0, 12);
console.log(`\nPLAYERS WITH HONOURS: ${winnersWithHonours.length} shown`);
for (const p of winnersWithHonours) {
  const groups = career.getPlayerHonours(p);
  console.log(
    `  ${p.first} ${p.last}: ${groups.length} → ${groups.map((h) => h.award).join(", ")}`,
  );
}
