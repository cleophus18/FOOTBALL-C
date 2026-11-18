import { loadData } from "./src/data/loader.mjs";
import { createCareer } from "./src/career.mjs";

const data = await loadData();

function options(seed = 4242) {
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

const career = createCareer(data, options());
// Force the user's contract to expire just after the current day.
const expiry = career.currentDay() + 3;
career.player.contract.expiryDate = expiry;
career.player.contract.expires = expiry + 0;
console.log("contract", JSON.stringify(career.player.contract));
console.log("currentDay", career.currentDay(), "expiry", expiry);

for (let i = 0; i < 6; i++) {
  let report;
  try {
    report = career.advanceWeek();
  } catch (error) {
    console.log("advanceWeek threw:", error.message);
    break;
  }
  if (report?.contractExpiryPaused) {
    console.log("paused at week", career.week, "day", career.currentDay());
    break;
  }
}
console.log(
  "decision",
  JSON.stringify(career.userContractDecision, null, 2).slice(0, 800),
);
console.log("player clubId", career.player.clubId);
console.log(
  "view",
  JSON.stringify(career.userContractExpiryView(), null, 2).slice(0, 400),
);
try {
  career.advanceWeek();
} catch (error) {
  console.log("blocked:", error.message);
}
