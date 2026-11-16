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
  
  console.log('Before save - league fixtures (first 3 rounds):');
  for (let i = 0; i < 3 && i < career.league.fixtures.length; i++) {
    console.log(`  Round ${i}:`, career.league.fixtures[i].map(f => `${f.home} vs ${f.away}`));
  }
  console.log('fixtureWeeks:', career.league.fixtureWeeks.slice(0, 5));
  console.log('fixtureDays:', career.league.fixtureDays?.slice(0, 5));
  
  // Save
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  
  console.log('\nSaved league fixtures (first 3 rounds):');
  for (let i = 0; i < 3 && i < saved.league.fixtures.length; i++) {
    console.log(`  Round ${i}:`, saved.league.fixtures[i].map(f => `${f.home} vs ${f.away}`));
  }
  console.log('Saved fixtureWeeks:', saved.league.fixtureWeeks?.slice(0, 5));
  console.log('Saved fixtureDays:', saved.league.fixtureDays?.slice(0, 5));
  
  // Restore
  const restored = createCareer(data, saved.creation, saved);
  
  console.log('\nAfter restore - league fixtures (first 3 rounds):');
  for (let i = 0; i < 3 && i < restored.league.fixtures.length; i++) {
    console.log(`  Round ${i}:`, restored.league.fixtures[i].map(f => `${f.home} vs ${f.away}`));
  }
  console.log('Restored fixtureWeeks:', restored.league.fixtureWeeks?.slice(0, 5));
  console.log('Restored fixtureDays:', restored.league.fixtureDays?.slice(0, 5));
  
  // Check if fixtures are the same
  const same = JSON.stringify(career.league.fixtures) === JSON.stringify(restored.league.fixtures);
  console.log('\nFixtures identical:', same);
  
  if (!same) {
    console.log('\nFirst difference:');
    for (let i = 0; i < career.league.fixtures.length; i++) {
      const orig = JSON.stringify(career.league.fixtures[i]);
      const rest = JSON.stringify(restored.league.fixtures[i]);
      if (orig !== rest) {
        console.log(`Round ${i}:`);
        console.log('  Original:', career.league.fixtures[i].map(f => `${f.home} vs ${f.away}`));
        console.log('  Restored:', restored.league.fixtures[i].map(f => `${f.home} vs ${f.away}`));
        break;
      }
    }
  }
}

main().catch(console.error);