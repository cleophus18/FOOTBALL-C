import { loadData } from "./src/data/loader.mjs";
import { createCareer } from "./src/career.mjs";
const data = await loadData();
const career = createCareer(data, {
  first: "A",
  last: "B",
  age: "17",
  nationality: "ENG",
  position: "ST",
  archetype: "Poacher",
  clubId: "hull",
  seed: 41827,
});
career.agent = career.agentPool[0];
const interests = career.evaluateTransferInterest(career.player, {
  agent: career.agent,
  threshold: 1,
});
console.log(
  JSON.stringify(
    {
      clubs: career.clubs.length,
      player: career.player.overall,
      potential: career.player.potential,
      interests: interests
        .slice(0, 12)
        .map((entry) => [
          entry.club.name,
          entry.fit.score,
          entry.fit.demand,
          entry.fit.affordability,
          entry.fit.wageFit,
          entry.fit.playingTime,
        ]),
    },
    null,
    2,
  ),
);
