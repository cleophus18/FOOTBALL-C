import { createCareer } from "./src/career.mjs";
import { loadData } from "./src/data/loader.mjs";
import { contractExpiryDay, daysUntilExpiry } from "./src/core/contracts.mjs";

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
  seed: 4007,
});
career.player.contract.expiryDate = career.currentDay() + 2;
console.log(
  "day",
  career.currentDay(),
  "exp",
  career.player.contract.expiryDate,
  "expiryDay",
  contractExpiryDay(career.player.contract),
  "remaining",
  daysUntilExpiry(career.player.contract, career.currentDay()),
  "status",
  career.player.contract.status,
);
const report = career.advanceWeek();
console.log(
  "after advance: day",
  career.currentDay(),
  "decision?",
  !!career.userContractDecision,
  "clubId",
  career.player.clubId,
  "status",
  career.player.contract.status,
);
console.log("headlines", JSON.stringify(report.headlines));
console.log("lastReport paused?", report.contractExpiryPaused);
