import test from "node:test";
import assert from "node:assert/strict";
import { Club } from "../src/model/club.mjs";
import {
  ensureClubInvestment,
  investmentOptions,
  processInvestmentWeek,
  startInvestment,
} from "../src/core/investment.mjs";

test("club investments reserve cash, complete on schedule, and expand stadium capacity", () => {
  const club = new Club({
    id: "investment-club",
    name: "Investment Club",
    prestige: 80,
    capacity: 30_000,
    balance: 100_000_000,
    budget: 20_000_000,
  });
  ensureClubInvestment(club);
  const before = club.capacity;
  const option = investmentOptions(club).find((item) => item.id === "stadium");
  const project = startInvestment(club, "stadium", 100);
  assert.equal(club.investment.activeProjects.length, 1);
  assert.equal(club.finances.ledger.filter((entry) => entry.id === `investment-start-${club.id}-stadium-2`).length, 1);
  processInvestmentWeek(club, project.completes);
  processInvestmentWeek(club, project.completes);
  assert.equal(club.investment.activeProjects.length, 0);
  assert.ok(club.capacity > before);
  assert.equal(club.investment.facilities.stadium, 2);
  assert.equal(option.nextLevel, 2);
});

test("unaffordable investments are rejected", () => {
  const club = new Club({ id: "poor", name: "Poor Club", prestige: 30, balance: 10_000 });
  ensureClubInvestment(club);
  assert.throws(() => startInvestment(club, "commercial", 10), /cannot afford/i);
});
