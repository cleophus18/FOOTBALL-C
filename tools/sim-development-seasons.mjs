import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";
import { calculateOverall } from "../src/model/player.mjs";

const data = await loadData();
const career = createCareer(data, {
  first: "Development",
  last: "Audit",
  age: "17",
  nationality: "ENG",
  height: "178",
  weight: "70",
  foot: "Right",
  weakFoot: "3",
  skillMoves: "3",
  position: "ST",
  archetype: "Poacher",
  startingOverall: "62",
  trait: "Wonderkid",
  personality: "Professional",
  difficulty: "Realistic",
  leagueId: "world-premier-league",
  clubId: "hull-city",
  seed: 6112026,
});

const finishLiveMatch = () => {
  if (!career.matchSimulation || career.matchSimulation.status === "finished")
    return;
  if (career.matchSimulation.status === "ready") career.startMatchSimulation();
  let guard = 0;
  while (career.matchSimulation.status !== "finished" && guard++ < 600) {
    const state = career.advanceMatchSimulation();
    if (state.status === "paused")
      career.resolveKeyMoment(state.momentIndex, "play-safe");
  }
  if (guard >= 600) throw new Error("Live match did not reach full time.");
};

const initialPlayers = new Map(
  career.players.map((player) => [player.id, calculateOverall(player)]),
);
const seasons = [];
for (let index = 0; index < 10; index++) {
  const result = career.simulateToSeasonEnd();
  finishLiveMatch();
  const all = [
    ...career.players,
    ...career.worldLeagues.flatMap((state) => state.performers ?? []),
  ];
  const unique = [
    ...new Map(
      all
        .filter((player) => !player.isLegend)
        .map((player) => [player.id, player]),
    ).values(),
  ];
  const ratings = unique
    .map((player) => calculateOverall(player))
    .sort((a, b) => a - b);
  const average =
    ratings.reduce((sum, value) => sum + value, 0) /
    Math.max(1, ratings.length);
  const elite = ratings.filter((value) => value >= 90).length;
  const highElite = ratings.filter((value) => value >= 95).length;
  seasons.push({
    season: career.season,
    average: Number(average.toFixed(2)),
    median: ratings[Math.floor(ratings.length / 2)],
    p90: ratings[Math.floor(ratings.length * 0.9)],
    elite90: elite,
    elite95: highElite,
    players: unique.length,
    userOVR: career.player.overall,
    userPotential: career.player.potential,
    leaguePosition: result.leaguePosition,
  });
  if (index < 9) career.advanceSeason();
}
const final = [
  ...career.players,
  ...career.worldLeagues.flatMap((state) => state.performers ?? []),
];
const uniqueFinal = [
  ...new Map(
    final
      .filter((player) => !player.isLegend)
      .map((player) => [player.id, player]),
  ).values(),
];
const mismatches = uniqueFinal.filter(
  (player) => player.attrs && player.overall !== calculateOverall(player),
);
console.log(
  JSON.stringify(
    {
      seasons,
      initialUserOVR: initialPlayers.get(career.player.id),
      ovrAttributeMismatches: mismatches.length,
      maximumOVR: Math.max(
        ...uniqueFinal.map((player) => calculateOverall(player)),
      ),
      reportsPersist: career.player.developmentHistory?.length ?? 0,
      worldClubTrainingProfiles: career.worldLeagues.reduce(
        (sum, state) => sum + Object.keys(state.trainingClubs ?? {}).length,
        0,
      ),
    },
    null,
    2,
  ),
);
