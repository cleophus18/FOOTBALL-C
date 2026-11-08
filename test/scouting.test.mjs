import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createClubFinance } from "../src/core/finance.mjs";
import {
  ensureClubScouting,
  hireScout,
  startScoutingAssignment,
  processScoutingWeek,
  shortlistPlayer,
  scoutingSummary,
} from "../src/core/scouting.mjs";

function club() {
  const value = {
    id: "club-scout-test",
    name: "Scout FC",
    prestige: 70,
    capacity: 30000,
    finances: createClubFinance({
      id: "club-scout-test",
      prestige: 70,
      balance: 10_000_000,
      transferBudget: 2_000_000,
    }),
    wageBill: () => 0,
  };
  ensureClubScouting(value, 4);
  return value;
}

test("clubs recruit scouts and record the recruitment expense exactly once", () => {
  const team = club();
  const candidate = team.scouting.availableScouts[0];
  const before = team.finances.balance;
  hireScout(team, candidate.id, 100);
  assert.equal(team.scouting.scouts.length, 2);
  assert.equal(team.finances.balance, before - candidate.recruitmentCost);
  hireScout;
  assert.equal(team.finances.ledger.filter((entry) => entry.category === "scouting").length, 1);
});

test("scouting assignments progress and produce estimates from real player data", () => {
  const team = club();
  const scout = team.scouting.scouts[0];
  const player = {
    id: "target-1",
    first: "Ava",
    last: "Stone",
    clubId: "other-club",
    position: "ST",
    age: 21,
    nationality: "ENG",
    overall: 78,
    potential: 88,
    attrs: { shooting: 85, dribbling: 82, passing: 64, defending: 40, physical: 70, pace: 79 },
    contract: { wage: 12000 },
  };
  const assignment = startScoutingAssignment(team, {
    scoutId: scout.id,
    position: "ST",
    durationWeeks: 2,
    date: 0,
  });
  processScoutingWeek(team, [player], 20, new Rng(8, "scouting-test"));
  assert.equal(assignment.progress, 1);
  assert.equal(team.scouting.reports.length, 1);
  assert.equal(team.scouting.reports[0].playerId, player.id);
  assert.ok(team.scouting.reports[0].estimatedOverall.min <= player.overall);
  assert.ok(team.scouting.reports[0].estimatedOverall.max >= player.overall);
});

test("shortlists are persistent data and youth assignments generate bounded prospects", () => {
  const team = club();
  const scout = team.scouting.scouts[0];
  shortlistPlayer(team, "target-1");
  assert.deepEqual(team.scouting.shortlist, ["target-1"]);
  startScoutingAssignment(team, {
    scoutId: scout.id,
    type: "youth",
    region: "England",
    focus: "strikers",
    durationWeeks: 1,
    date: 0,
  });
  processScoutingWeek(team, [], 14, new Rng(9, "scouting-youth-test"));
  assert.ok(team.scouting.youthProspects.length >= 2);
  assert.ok(team.scouting.youthProspects.length <= 4);
  assert.ok(team.scouting.youthProspects.every((prospect) => prospect.age >= 15 && prospect.age <= 18));
  assert.equal(scoutingSummary(team).prospects, team.scouting.youthProspects.length);
});
