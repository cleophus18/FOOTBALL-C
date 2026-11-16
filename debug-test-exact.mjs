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
  const career = createCareer(data, options(77021));
  
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
  
  // Exact test logic
  for (const row of career.league.table.rows.values()) row.played = 38;
  for (const row of career.league.table.rows.values()) row.played = 0;
  let weeks = 0;
  const maxWeeks = career.calendar.length + 10;
  while (!career.seasonComplete && weeks < maxWeeks) {
    advanceAndResolve(career);
    weeks++;
  }
  
  console.log('Season complete:', career.seasonComplete);
  console.log('Weeks:', weeks);
  
  const goalScorers = career.players.filter((player) => player.leagueGoals > 0);
  const mostGoals = Math.max(...goalScorers.map((player) => player.leagueGoals));
  console.log('Most goals:', mostGoals);
  
  const topScorers = goalScorers.filter((player) => player.leagueGoals === mostGoals);
  console.log('Top scorers:', topScorers.map(p => `${p.clubId}:${p.first} ${p.last} (${p.leagueGoals})`));
  
  const goldenBoot = career.currentSeasonAwards.awards.find(a => a.award === "Golden Boot");
  console.log('Golden Boot winners:', goldenBoot?.winners.map(w => `${w.clubId}:${w.player} (${w.value})`));
  
  // Check Haaland and Louie Webb specifically
  const haaland = career.players.find(p => p.first === "Erling" && p.last === "Haaland");
  const webb = career.players.find(p => p.first === "Louie" && p.last === "Webb");
  console.log('\nHaaland goals:', haaland?.leagueGoals);
  console.log('Webb goals:', webb?.leagueGoals);
}

main().catch(console.error);