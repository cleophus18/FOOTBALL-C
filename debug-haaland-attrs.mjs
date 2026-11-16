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
  
  const haaland = career.players.find(p => p.first === "Erling" && p.last === "Haaland");
  console.log('Haaland attrs:', haaland?.attrs);
  console.log('Haaland subAttrs:', haaland?.subAttrs);
  console.log('Haaland finishing tendency:', haaland?.tendencies?.shotTaking, haaland?.tendencies?.goalThreat);
  console.log('Haaland archetype:', haaland?.archetype);
  
  // Compare with a top scoring midfielder
  const bruno = career.players.find(p => p.first === "Bruno" && p.last === "Guimarães Moura");
  if (bruno) {
    console.log('\nBruno Guimarães attrs:', bruno.attrs);
    console.log('Bruno finishing tendency:', bruno.tendencies?.shotTaking, bruno.tendencies?.goalThreat);
    console.log('Bruno archetype:', bruno.archetype);
  }
}

main().catch(console.error);