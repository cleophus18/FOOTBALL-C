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
    const report = advanceAndResolve(career);
    console.log(`Week ${week}: userMatch=${!!report.userMatch}, fixtures=${report.fixtures.length}`);
  }
  
  console.log('\nBefore save:');
  console.log('RNG streams:', [...career.rng.streams.keys()]);
  if (career.rng.streams.has('matches')) {
    const s = career.rng.streams.get('matches');
    console.log('Matches stream state:', { a: s.a, b: s.b, c: s.c, d: s.d });
  }
  
  // Save
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  
  console.log('\nSaved RNG streams:', Object.keys(saved.rng.streams));
  if (saved.rng.streams.matches) {
    console.log('Saved matches stream:', saved.rng.streams.matches);
  }
  
  // Restore
  const restored = createCareer(data, saved.creation, saved);
  
  console.log('\nAfter restore:');
  console.log('RNG streams:', [...restored.rng.streams.keys()]);
  if (restored.rng.streams.has('matches')) {
    const s = restored.rng.streams.get('matches');
    console.log('Matches stream state:', { a: s.a, b: s.b, c: s.c, d: s.d });
  }
  
  // Advance 6 more weeks on both
  console.log('\nAdvancing 6 more weeks...');
  for (let week = 0; week < 6; week++) {
    const originalReport = advanceAndResolve(career);
    const restoredReport = advanceAndResolve(restored);
    console.log(`\nWeek ${12 + week}:`);
    console.log('  Original fixtures:', originalReport.fixtures.map(f => `${f.home} ${f.homeGoals}-${f.awayGoals} ${f.away}`));
    console.log('  Restored fixtures:', restoredReport.fixtures.map(f => `${f.home} ${f.homeGoals}-${f.awayGoals} ${f.away}`));
    console.log('  Match:', originalReport.fixtures.map(f => `${f.homeGoals}-${f.awayGoals}`).join(', ') === restoredReport.fixtures.map(f => `${f.homeGoals}-${f.awayGoals}`).join(', ') ? 'SAME' : 'DIFFERENT');
  }
}

main().catch(console.error);