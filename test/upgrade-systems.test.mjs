import test from "node:test";
import assert from "node:assert/strict";
import {
  COACH_RANKS,
  coachRankFor,
  coachSalaryFor,
  ensureCoachProfile,
  developCoach,
} from "../src/core/coaching.mjs";
import {
  Club,
  ensureSquadRegistration,
  MAX_REGISTERED_SQUAD_SIZE,
  MIN_REGISTERED_SQUAD_SIZE,
} from "../src/model/club.mjs";
import { League } from "../src/model/league.mjs";
import { Career } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";

function player(id, overall = 60) {
  return {
    id,
    first: id,
    last: "Player",
    position: id === "gk" ? "GK" : "CM",
    overall,
    form: 60,
    fitness: 100,
    fatigue: 0,
    squadStatus: "Rotation",
  };
}

test("coaching ranks cover F through S and profiles migrate with attributes", () => {
  assert.equal(coachRankFor(1).rank, "F");
  assert.equal(coachRankFor(99).rank, "S");
  assert.equal(COACH_RANKS.length, 7);
  const club = new Club({
    id: "coach-upgrade",
    name: "Coach Upgrade FC",
    squad: [],
    manager: { name: "Test Coach", rating: 72 },
  });

  test("coach salaries scale realistically from beginner to world-class", () => {
    const weekly = (overall) => coachSalaryFor({ overall });
    assert.ok(weekly(40) >= 800 && weekly(40) < 3000);
    assert.ok(weekly(70) >= 9000 && weekly(70) < 30000);
    assert.ok(weekly(99) >= 120000);
    assert.ok(weekly(99) > weekly(70) * 4);
  });
  const coach = ensureCoachProfile(club);
  assert.equal(Object.keys(coach.coachingAttributes).length, 10);
  assert.ok(coach.potential >= coach.overall);
  const before = coach.experience;
  for (let i = 0; i < 20; i++) developCoach(club, { result: 1, playerGrowth: 1 });
  assert.ok(coach.experience >= before);
});

test("registered squads are capped and expose a reserve pool", () => {
  const players = Array.from({ length: 28 }, (_, index) =>
    player(`p-${index}`, 45 + index),
  );
  const club = new Club({
    id: "squad-upgrade",
    name: "Squad Upgrade FC",
    squad: players.map((entry) => entry.id),
  });
  const registration = ensureSquadRegistration(club, players);
  assert.equal(registration.size, MAX_REGISTERED_SQUAD_SIZE);
  assert.ok(registration.size >= MIN_REGISTERED_SQUAD_SIZE);
  assert.equal(club.squad.length, MAX_REGISTERED_SQUAD_SIZE);
  assert.equal(players.filter((entry) => entry.squadStatus === "Reserve").length, 3);
});

test("league fixture dates never share a day and give clubs 1 to 4 days rest", () => {
  const league = new League({
    id: "rest-test",
    name: "Rest Test League",
    teamIds: ["a", "b", "c", "d"],
  });
  league.buildFixtures({ shuffle: (items) => items });
  league.scheduleOn(
    league.fixtures.map((_, index) => index),
    league.fixtures.map((_, index) => 100 + index * 4),
  );
  const dates = new Set(league.fixtureDays);
  assert.equal(dates.size, league.fixtureDays.length);
  for (const teamId of league.teamIds) {
    const teamDates = league
      .fixturesFor(teamId)
      .map(({ round }) => league.fixtureDays[round]);
    for (let index = 1; index < teamDates.length; index++) {
      const restDays = teamDates[index] - teamDates[index - 1] - 1;
      assert.ok(restDays >= 1 && restDays <= 4);
    }
  }
});

test("season winners persist trophies on the club record", () => {
  const club = new Club({
    id: "winner",
    name: "Winner FC",
    squad: [],
    prestige: 50,
    reputation: 50,
  });

  test("simulate one day advances the calendar one day instead of one week", async () => {
    const data = await loadData();
    const career = new Career(data, {
      first: "Day",
      last: "Tester",
      position: "ST",
      clubId: "hull",
      seed: 901,
    });
    const startDay = career.currentDay();
    const startWeek = career.week;
    const first = career.simulateOneDay();
    assert.equal(first.dayAdvanced, 1);
    assert.equal(career.currentDay(), startDay + 1);
    assert.equal(career.week, startWeek);
    for (let index = 0; index < 5; index++) career.simulateOneDay();
    assert.equal(career.week, startWeek + 1);
  });
  const career = {
    season: 2030,
    clubs: [club],
    worldCareerLeagues: [],
    data: { clubs: {} },
  };
  Career.prototype.recordClubTrophies.call(career, [
    { winnerId: "winner", competition: "Test League" },
  ]);
  Career.prototype.recordClubTrophies.call(career, [
    { winnerId: "winner", competition: "Test League" },
  ]);
  assert.equal(club.honours.length, 1);
  assert.equal(club.honours[0].competition, "Test League");
  assert.equal(club.lastTrophy, "Test League");
});
