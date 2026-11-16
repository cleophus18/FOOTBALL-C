import { loadData } from './src/data/loader.mjs';
import { createCareer } from './src/career.mjs';

function options(seed = 41827) {
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

async function main() {
  const data = await loadData();
  const career = createCareer(data, options(12345));
  
  function advanceAndResolve(career) {
    const report = career.advanceWeek();
    if (report.userMatch) {
      while (career.matchSimulation.status !== "finished") {
        const state = career.advanceMatchSimulation();
        if (
          state.status === "paused" &&
          !career.lastReport.userMatch.playerResult.keyMoments[state.momentIndex].resolved
        ) {
          career.resolveKeyMoment(state.momentIndex, "play-safe");
        }
      }
    }
    return report;
  }

  // Advance 12 weeks
  for (let week = 0; week < 12; week++) {
    advanceAndResolve(career);
  }
  
  // Save
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  
  // Restore
  const restored = createCareer(data, saved.creation, saved);
  
  console.log('Restored fixtureWeeks (full):', restored.league.fixtureWeeks);
  console.log('Restored fixtureDays (full):', restored.league.fixtureDays);
  console.log('Original fixtureWeeks (full):', career.league.fixtureWeeks);
  console.log('Original fixtureDays (full):', career.league.fixtureDays);
}

main().catch(console.error);