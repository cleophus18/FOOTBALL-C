// Seasonal growth/decline probe for the shared development engine.
// Profiles a young starter, a young bench player, a prime starter and a veteran
// using the same developPlayer() call the calendar and the AI clubs use.
import { developPlayer, ensureClubTraining } from "../src/core/training.mjs";
import { Club } from "../src/model/club.mjs";
import { calculateOverall, createPlayer } from "../src/model/player.mjs";
import { toDayIndex } from "../src/core/calendar.mjs";
import { Rng } from "../src/core/rng.mjs";

const SEASON = 2026;
const finalDay = toDayIndex(2027, 6, 30);
const attrs = {
  pace: 72,
  shooting: 72,
  passing: 66,
  dribbling: 70,
  defending: 42,
  physical: 68,
};

function makePlayer(id, birthYear, potential, base = 68) {
  const scaled = Object.fromEntries(
    Object.entries(attrs).map(([key, value]) => [key, value + (base - 68)]),
  );
  return createPlayer({
    id,
    first: id,
    last: "Probe",
    position: "ST",
    dob: toDayIndex(birthYear, 1, 1),
    attrs: scaled,
    potential,
    age: 2026 - birthYear,
    morale: 80,
    fitness: 95,
    trainingAttendance: 20,
    personality: ["Professional"],
    stats: { apps: 0, minutes: 0, ratingSum: 0, goals: 0, assists: 0 },
  });
}

function season(player, club, { apps, avgRating, goals, assists, seed }) {
  player.stats = {
    apps,
    minutes: apps * 85,
    ratingSum: avgRating * apps,
    goals,
    assists,
  };
  const before = calculateOverall(player);
  const report = developPlayer(player, club, new Rng(seed, "probe"), SEASON, {
    appearances: apps,
    minutes: apps * 85,
    ratingSum: avgRating * apps,
    date: finalDay,
  });
  return {
    before,
    after: calculateOverall(player),
    change: report?.change ?? 0,
    age: player.age,
    potential: player.potential,
  };
}

const cases = [
  [
    "Young starter, elite season",
    makePlayer("youngStarter", 2008, 92, 68),
    { apps: 34, avgRating: 7.4, goals: 14, assists: 6 },
  ],
  [
    "Young starter, average season",
    makePlayer("youngAverage", 2008, 92, 68),
    { apps: 30, avgRating: 6.5, goals: 5, assists: 3 },
  ],
  [
    "Young bench, little time",
    makePlayer("youngBench", 2008, 92, 68),
    { apps: 5, avgRating: 6.4, goals: 1, assists: 0 },
  ],
  [
    "Prime starter, strong season",
    makePlayer("prime", 1999, 86, 78),
    { apps: 34, avgRating: 7.2, goals: 16, assists: 7 },
  ],
  [
    "Prime starter, average season",
    makePlayer("primeAvg", 1999, 86, 78),
    { apps: 30, avgRating: 6.6, goals: 6, assists: 2 },
  ],
  [
    "Prime starter, poor season",
    makePlayer("primePoor", 1999, 86, 78),
    { apps: 22, avgRating: 6.0, goals: 2, assists: 1 },
  ],
  [
    "Veteran, good season",
    makePlayer("veteran", 1992, 84, 78),
    { apps: 28, avgRating: 7.0, goals: 10, assists: 2 },
  ],
  [
    "Veteran, poor season",
    makePlayer("veteranPoor", 1992, 84, 78),
    { apps: 20, avgRating: 6.1, goals: 2, assists: 1 },
  ],
];

const club = new Club({
  id: "probe-club",
  name: "Probe FC",
  prestige: 70,
  squad: [],
});
ensureClubTraining(club, 1, SEASON);

for (const [label, player, stats] of cases) {
  player.clubId = club.id;
  club.addPlayer(player.id);
  const result = season(player, club, { ...stats, seed: label.length * 97 });
  console.log(
    `${label.padEnd(32)} age ${String(result.age).padStart(2)}  OVR ${result.before} → ${result.after}  (${result.change >= 0 ? "+" : ""}${result.change})  POT ${result.potential}`,
  );
}
