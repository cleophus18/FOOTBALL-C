import test from "node:test";
import assert from "node:assert/strict";
import { loadData } from "../src/data/loader.mjs";
import { createCareer } from "../src/career.mjs";
import { Rng } from "../src/core/rng.mjs";
import {
  developPlayer,
  ensureClubTraining,
  generateTrainingCoachMarket,
  processClubTrainingWeek,
  trainingGradeFor,
} from "../src/core/training.mjs";
import { calculateOverall, createPlayer } from "../src/model/player.mjs";
import { Club } from "../src/model/club.mjs";

const options = (managerMode = false) => ({
  first: "Test",
  last: "Career",
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
  seed: 99231,
  ...(managerMode
    ? {
        managerMode: true,
        manager: { first: "Test", last: "Manager", style: "Balanced" },
      }
    : {}),
});

function developmentPlayer(age, potential, position = "ST") {
  const initial = createPlayer({
    id: `base-${age}-${position}`,
    first: "Base",
    last: "Player",
    position,
    attrs: {
      pace: 65,
      shooting: 65,
      passing: 65,
      dribbling: 65,
      defending: 65,
      physical: 65,
    },
  });
  return createPlayer({
    id: `development-${age}-${potential}-${position}`,
    first: "Development",
    last: "Player",
    position,
    age,
    attrs: initial.attrs,
    subAttrs: initial.subAttrs,
    gkAttrs:
      position === "GK"
        ? { reflexes: 60, handling: 60, positioning: 60, kicking: 60 }
        : {},
    potential,
    fitness: 100,
    morale: 95,
    personality: ["Professional"],
    stats: { apps: 40, minutes: 3200, ratingSum: 300, goals: 10, assists: 8 },
    trainingAttendance: 40,
  });
}

test("player-career permissions expose observation/focus only and deny club staff spending", async () => {
  const data = await loadData();
  const career = createCareer(data, options(false));
  assert.equal(career.trainingOverview().coaches.length > 0, true);
  assert.throws(
    () => career.hireTrainingCoach(career.trainingOverview().market[0].id),
    /Only the manager/,
  );
  assert.throws(
    () => career.dismissTrainingCoach(career.trainingOverview().coaches[0].id),
    /Only the manager/,
  );
  assert.throws(
    () =>
      career.assignTrainingCoach(
        "attacking",
        career.trainingOverview().coaches[0].id,
      ),
    /Only the manager/,
  );
  assert.throws(
    () => career.setClubTrainingPlan({ intensity: "Intense" }),
    /Only the manager/,
  );
  assert.throws(
    () => career.startClubInvestment("trainingGround"),
    /Only the manager/,
  );
  assert.equal(career.setTrainingFocus("finishing").selected, true);
  assert.equal(Object.hasOwn(career.toJSON(), "trainingPoints"), false);
  assert.equal(
    Object.hasOwn(career.toJSON(), "trainingPointsEarnedSeason"),
    false,
  );
});

test("manager career can hire specialists and staff costs are ledger-backed and idempotent", async () => {
  const data = await loadData();
  const career = createCareer(data, options(true));
  const training = career.trainingOverview();
  assert.throws(
    () => career.setTrainingFocus("finishing"),
    /Only player-career mode/,
  );
  const candidate = training.market[0];
  const before = career.club.finances.balance;
  career.hireTrainingCoach(candidate.id);
  assert.ok(career.club.finances.balance < before);
  const day = career.currentDay();
  const payrollBefore = career.club.finances.ledger.filter(
    (entry) => entry.id === `training-staff-wages-${career.club.id}-${day}`,
  ).length;
  processClubTrainingWeek(
    career.club,
    career.players,
    day,
    career.seed,
    career.season,
  );
  processClubTrainingWeek(
    career.club,
    career.players,
    day,
    career.seed,
    career.season,
  );
  const payrollAfter = career.club.finances.ledger.filter(
    (entry) => entry.id === `training-staff-wages-${career.club.id}-${day}`,
  ).length;
  assert.ok(payrollAfter - payrollBefore <= 1);
});

test("coach grade thresholds and specialised ability are meaningful", () => {
  assert.deepEqual([1, 40, 50, 60, 70, 80, 90].map(trainingGradeFor), [
    "F",
    "E",
    "D",
    "C",
    "B",
    "A",
    "S",
  ]);
  const market = generateTrainingCoachMarket(7, 2026, 60);
  assert.ok(
    market.some(
      (coach) => coach.overall >= 90 && coach.weeklySalary >= 125_000,
    ),
  );
  assert.ok(
    market.every((coach) => coach.grade === trainingGradeFor(coach.overall)),
  );
  assert.ok(
    market.every(
      (coach) =>
        coach[
          coach.department === "physical"
            ? "physicalAbility"
            : coach.department === "youth"
              ? "youthAbility"
              : coach.department === "defensive" ||
                  coach.department === "goalkeeper"
                ? "tacticalAbility"
                : "technicalAbility"
        ] >= coach.overall,
    ),
  );
});

test("season development changes detailed attributes, updates calculated OVR, and cannot be repeated", () => {
  const player = developmentPlayer(18, 96);
  const club = new Club({
    id: "development-club",
    name: "Development",
    prestige: 80,
    squad: [player.id],
  });
  const training = ensureClubTraining(club, 42, 2026);
  training.intensity = "Normal";
  training.programme = "Attacking development";
  training.playerPlans[player.id] = { focus: "finishing" };
  const before = calculateOverall(player);
  const result = developPlayer(
    player,
    club,
    new Rng(919, "development"),
    2026,
    {
      appearances: 40,
      minutes: 3200,
      ratingSum: 320,
      date: 800000,
    },
  );
  assert.ok(result);
  assert.equal(player.overall, calculateOverall(player));
  assert.ok(player.subAttrs.finishing >= 1);
  assert.equal(developPlayer(player, club, new Rng(1), 2026), null);
  assert.ok(result.currentOverall >= 1);
  assert.ok(result.previousOverall >= before);
  assert.equal(player.developmentHistory.length, 1);
});

test("older players can decline without independent OVR edits and potential is preserved", () => {
  const player = developmentPlayer(36, 72);
  const club = new Club({
    id: "decline-club",
    name: "Decline",
    prestige: 35,
    squad: [player.id],
  });
  player.developmentProgress = -1.5;
  player.fitness = 35;
  player.morale = 30;
  player.stats = { apps: 5, minutes: 250, ratingSum: 25, goals: 0, assists: 0 };
  const before = calculateOverall(player);
  const report = developPlayer(player, club, new Rng(5), 2026, {
    appearances: 5,
    minutes: 250,
    ratingSum: 25,
    date: 800000,
  });
  assert.equal(player.overall, calculateOverall(player));
  assert.ok(player.potential === 72);
  assert.ok(report.currentOverall <= before);
});

test("goalkeeper and world player types retain positional attribute calculations", () => {
  const keeper = developmentPlayer(20, 95, "GK");
  const club = new Club({
    id: "keeper-club",
    name: "Keeper",
    prestige: 65,
    squad: [keeper.id],
  });
  const training = ensureClubTraining(club, 8, 2026);
  training.playerPlans[keeper.id] = {
    focus: "reflexes",
    programme: "Goalkeeper development",
  };
  developPlayer(keeper, club, new Rng(17), 2026, {
    appearances: 30,
    minutes: 2500,
    ratingSum: 240,
    date: 800000,
  });
  assert.equal(keeper.overall, calculateOverall(keeper));
  assert.ok(keeper.gkAttrs.reflexes >= 60);
});
