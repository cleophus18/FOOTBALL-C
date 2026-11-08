import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_CUP_SQUAD_SIZE,
  drawGroups,
  emptyInternationalTable,
  nationalTeamSelectionScore,
  selectNationalTeamSquad,
  sortInternationalTable,
  updateInternationalTable,
  worldCupFixtureDay,
  worldCupFieldSize,
  worldCupQualificationRound,
  worldCupSchedule,
} from "../src/model/international.mjs";

test("World Cup schedule starts exactly four years after career creation", () => {
  const schedule = worldCupSchedule(2026);
  assert.equal(schedule.firstYear, 2030);
  assert.equal(schedule.nextYear, 2030);
  assert.equal(schedule.interval, 4);
  assert.deepEqual(
    [schedule.nextYear, schedule.nextYear + schedule.interval, schedule.nextYear + 2 * schedule.interval],
    [2030, 2034, 2038],
  );
  assert.equal(worldCupQualificationRound(schedule, 2026), 0);
  assert.equal(worldCupQualificationRound(schedule, 2029), 3);
  assert.equal(worldCupQualificationRound(schedule, 2030), null);

  schedule.nextYear = 2034;
  assert.equal(worldCupQualificationRound(schedule, 2030), 0);
  assert.equal(worldCupQualificationRound(schedule, 2033), 3);
  assert.equal(worldCupQualificationRound(schedule, 2034), null);
});

test("World Cup fixture dates use separate group and knockout matchdays", () => {
  const groupDays = [0, 1, 2].map((round) =>
    worldCupFixtureDay(2030, "group", round),
  );
  assert.equal(new Set(groupDays).size, 3);
  const knockoutDays = [
    "Round of 32",
    "Round of 16",
    "Quarter-finals",
    "Semi-finals",
    "Third-place playoff",
    "Final",
  ].map((stage) => worldCupFixtureDay(2030, stage));
  assert.equal(new Set(knockoutDays).size, knockoutDays.length);
  assert.deepEqual(knockoutDays, [...knockoutDays].sort((a, b) => a - b));
  assert.equal(
    worldCupFixtureDay(2030, "Knockout round of 14"),
    worldCupFixtureDay(2030, "Round of 16"),
  );
  assert.throws(() => worldCupFixtureDay(2030, "Unknown stage"));
});

test("national team selection creates a balanced 26-player squad", () => {
  const positions = [
    ...Array(3).fill("GK"),
    ...Array(4).fill("CB"),
    ...Array(2).fill("LB"),
    ...Array(2).fill("RB"),
    ...Array(4).fill("CM"),
    ...Array(2).fill("DM"),
    ...Array(2).fill("AM"),
    ...Array(3).fill("ST"),
    ...Array(2).fill("LW"),
    ...Array(2).fill("RW"),
  ];
  const players = positions.map((position, index) => ({
    id: `player-${index}`,
    nationality: "ENG",
    position,
    overall: 80 + (index % 10),
    potential: 90,
    stats: { apps: 20, ratingSum: 140, goals: 4, assists: 3 },
  }));
  const squad = selectNationalTeamSquad(players, "ENG");

  assert.equal(squad.length, WORLD_CUP_SQUAD_SIZE);
  assert.equal(new Set(squad.map(({ player }) => player.id)).size, 26);
  assert.equal(squad.filter(({ player }) => player.position === "GK").length, 3);
  assert.equal(
    squad.filter(({ player }) => ["CB", "LB", "RB"].includes(player.position)).length,
    8,
  );
  assert.equal(
    squad.filter(({ player }) => ["CM", "DM", "AM"].includes(player.position)).length,
    8,
  );
  assert.equal(
    squad.filter(({ player }) => ["ST", "LW", "RW"].includes(player.position)).length,
    7,
  );
});

test("national team selection rejects squads without sufficient positional cover", () => {
  const players = Array.from({ length: 26 }, (_, index) => ({
    id: `player-${index}`,
    nationality: "ENG",
    position: index < 2 ? "GK" : "ST",
    overall: 75,
  }));
  assert.equal(selectNationalTeamSquad(players, "ENG"), null);
});

test("national team selection rewards current form over a reputation-free OVR gap", () => {
  const outOfFormStar = {
    overall: 88,
    form: 30,
    recentMatchRatings: [5.5, 5.7, 5.4],
    stats: { apps: 10, ratingSum: 56 },
  };
  const inFormContender = {
    overall: 82,
    form: 85,
    recentMatchRatings: [8, 8.1, 7.9],
    stats: { apps: 10, ratingSum: 80 },
  };
  assert.ok(
    nationalTeamSelectionScore(inFormContender) >
      nationalTeamSelectionScore(outOfFormStar),
  );
});

test("World Cup field sizes fit the available qualified nations", () => {
  assert.equal(worldCupFieldSize(48), 48);
  assert.equal(worldCupFieldSize(35), 32);
  assert.equal(worldCupFieldSize(29), 24);
  assert.equal(worldCupFieldSize(20), 16);
  assert.equal(worldCupFieldSize(7), 4);
  assert.equal(worldCupFieldSize(3), 0);
});

test("international group draws and standings retain all teams and score correctly", () => {
  const teams = Array.from({ length: 8 }, (_, index) => ({
    id: `nation-${index}`,
    name: `Nation ${index}`,
    rating: 90 - index,
  }));
  const groups = drawGroups(teams, 4, { shuffled: (items) => items });
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.flatMap((group) => group.teams).map((team) => team.id).sort(),
    teams.map((team) => team.id).sort(),
  );

  const table = emptyInternationalTable(groups[0].teams);
  updateInternationalTable(table, {
    id: "fixture-1",
    homeId: groups[0].teams[0].id,
    awayId: groups[0].teams[1].id,
    homeGoals: 2,
    awayGoals: 1,
  });
  assert.equal(table.find((row) => row.teamId === groups[0].teams[0].id).points, 3);
  assert.equal(table.find((row) => row.teamId === groups[0].teams[1].id).points, 0);
});

test("international group standings use head-to-head before overall goal difference", () => {
  const table = [
    { teamId: "A", name: "Alpha", points: 6, goalDifference: 0, goalsFor: 4 },
    { teamId: "B", name: "Bravo", points: 6, goalDifference: 8, goalsFor: 12 },
  ];
  const fixtures = [
    {
      status: "completed",
      homeId: "A",
      awayId: "B",
      homeGoals: 2,
      awayGoals: 1,
    },
  ];

  assert.deepEqual(
    sortInternationalTable(table, fixtures).map((row) => row.teamId),
    ["A", "B"],
  );
});
