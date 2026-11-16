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
  
  // Find Haaland
  const haaland = career.players.find(p => p.first === "Erling" && p.last === "Haaland");
  console.log('Haaland:', haaland ? { id: haaland.id, clubId: haaland.clubId, overall: haaland.overall, position: haaland.position } : 'NOT FOUND');
  
  // Find Louie Webb
  const webb = career.players.find(p => p.first === "Louie" && p.last === "Webb");
  console.log('Louie Webb:', webb ? { id: webb.id, clubId: webb.clubId, overall: webb.overall, position: webb.position } : 'NOT FOUND');
  
  // Simulate season
  for (const row of career.league.table.rows.values()) row.played = 38;
  for (const row of career.league.table.rows.values()) row.played = 0;
  let weeks = 0;
  const maxWeeks = career.calendar.length + 10;
  while (!career.seasonComplete && weeks < maxWeeks) {
    advanceAndResolve(career);
    weeks++;
  }
  
  console.log('\nSeason complete:', career.seasonComplete);
  console.log('Weeks:', weeks);
  
  const haalandFinal = career.players.find(p => p.first === "Erling" && p.last === "Haaland");
  console.log('Haaland final:', haalandFinal ? { leagueGoals: haalandFinal.leagueGoals, leagueAssists: haalandFinal.leagueAssists, apps: haalandFinal.stats.apps, leaguePerformance: haalandFinal.leaguePerformance } : 'NOT FOUND');
  
  const webbFinal = career.players.find(p => p.first === "Louie" && p.last === "Webb");
  console.log('Louie Webb final:', webbFinal ? { leagueGoals: webbFinal.leagueGoals, leagueAssists: webbFinal.leagueAssists, apps: webbFinal.stats.apps, leaguePerformance: webbFinal.leaguePerformance } : 'NOT FOUND');
  
  const goalScorers = career.players.filter((player) => player.leagueGoals > 0);
  const mostGoals = Math.max(...goalScorers.map((player) => player.leagueGoals));
  console.log('\nMost goals:', mostGoals);
  console.log('Top scorers:', goalScorers.filter((player) => player.leagueGoals === mostGoals).map(p => `${p.clubId}:${p.first} ${p.last} (${p.leagueGoals})`));
  
  const goldenBoot = career.currentSeasonAwards.awards.find(a => a.award === "Golden Boot");
  console.log('Golden Boot winners:', goldenBoot?.winners.map(w => `${w.clubId}:${w.player}`));
}

main().catch(console.error);