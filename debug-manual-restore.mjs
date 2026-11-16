import { loadData } from './src/data/loader.mjs';
import { createCareer } from './src/career.mjs';
import { League } from './src/model/league.mjs';
import { LeagueTable } from './src/model/league.mjs';

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
  
  // Manually replicate restoration
  const spec = saved.league;
  console.log('spec.fixtureWeeks:', spec.fixtureWeeks.slice(0, 5));
  console.log('spec.fixtureDays:', spec.fixtureDays.slice(0, 5));
  console.log('spec.fixtures.length:', spec.fixtures.length);
  console.log('spec.fixtureDays.length:', spec.fixtureDays.length);
  
  const league = new League(spec);
  console.log('\nAfter new League(spec):');
  console.log('league.fixtureWeeks:', league.fixtureWeeks);
  console.log('league.fixtureDays:', league.fixtureDays);
  
  league.fixtures = spec.fixtures;
  console.log('\nAfter league.fixtures = spec.fixtures:');
  console.log('league.fixtures.length:', league.fixtures.length);
  
  league.fixtureWeeks = spec.fixtureWeeks;
  console.log('\nAfter league.fixtureWeeks = spec.fixtureWeeks:');
  console.log('league.fixtureWeeks:', league.fixtureWeeks.slice(0, 5));
  
  const condition = spec.fixtureDays?.length === league.fixtures.length;
  console.log('\nCondition:', condition);
  console.log('spec.fixtureDays?.length:', spec.fixtureDays?.length);
  console.log('league.fixtures.length:', league.fixtures.length);
  
  league.fixtureDays = condition ? spec.fixtureDays : career.buildFixtureDays(league);
  console.log('\nAfter fixtureDays assignment:');
  console.log('league.fixtureDays:', league.fixtureDays.slice(0, 5));
}

main().catch(console.error);