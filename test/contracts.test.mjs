import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeContract,
  renewalPhase,
  evaluateContractOffer,
  expirePlayerContract,
  signPlayerContract,
  RENEWAL_WINDOW_DAYS,
  PRE_CONTRACT_WINDOW_DAYS,
  URGENT_WINDOW_DAYS,
  CONTRACT_STATUSES,
  desiredWeeklyWage,
} from "../src/core/contracts.mjs";

test("contract renewal phases follow 12/6/3 month windows", () => {
  const currentDay = 10000;
  const contract = { expiryDate: currentDay + RENEWAL_WINDOW_DAYS + 5 };
  assert.equal(renewalPhase(contract, currentDay), "normal");
  contract.expiryDate = currentDay + RENEWAL_WINDOW_DAYS - 1;
  assert.equal(renewalPhase(contract, currentDay), "renewal");
  contract.expiryDate = currentDay + PRE_CONTRACT_WINDOW_DAYS - 1;
  assert.equal(renewalPhase(contract, currentDay), "pre-contract");
  contract.expiryDate = currentDay + URGENT_WINDOW_DAYS - 1;
  assert.equal(renewalPhase(contract, currentDay), "urgent");
  contract.expiryDate = currentDay;
  assert.equal(renewalPhase(contract, currentDay), "expired");
});

test("normalizeContract produces consistent expiry/start and legacy fields", () => {
  const player = {
    id: "p1",
    clubId: "c1",
    overall: 70,
    age: 25,
    contract: { expires: 2028, wage: 5000 },
  };
  const normalized = normalizeContract(player, { season: 2026, currentDay: 9700 });
  assert.ok(Number.isFinite(normalized.startDate));
  assert.ok(Number.isFinite(normalized.expiryDate));
  assert.equal(normalized.weeklyWage, 5000);
  assert.equal(normalized.wage, 5000);
  assert.equal(player.squadStatus, "Contracted");
});

test("signing and expiring contracts update player state", () => {
  const club = {
    id: "club1",
    squad: [],
    addPlayer(id) { if (!this.squad.includes(id)) this.squad.push(id); },
    removePlayer(id) { this.squad = this.squad.filter((x) => x !== id); },
    prestige: 70,
    finances: { processedEvents: [], balance: 1000000, transferBudget: 0, wageBudget: 0, revenue: {}, expenses: {}, ledger: [] },
  };
  const player = { id: "p1", first: "A", last: "B", clubId: "club1", overall: 72, age: 24, contract: {} };
  normalizeContract(player, { club, season: 2026, currentDay: 9700 });
  signPlayerContract(
    player,
    club,
    { weeklyWage: 12000, years: 3, squadRole: "Key Player", signingBonus: 50000 },
    { currentDay: 9700, season: 2026, isFreeAgent: false },
  );
  assert.equal(player.contract.weeklyWage, 12000);
  assert.equal(player.contract.squadRole, "Key Player");
  assert.equal(player.contract.status, CONTRACT_STATUSES.ACTIVE);
  assert.ok(club.finances.ledger.some((e) => e.category === "wages" && e.expense === 50000));
  expirePlayerContract(player, club, { currentDay: 12000, season: 2029 });
  assert.equal(player.clubId, null);
  assert.equal(player.squadStatus, "Free Agent");
  assert.equal(player.contract.weeklyWage, 0);
  assert.equal(player.contract.status, CONTRACT_STATUSES.FREE_AGENT);
});

test("evaluateContractOffer can reject unreasonable offers", () => {
  const club = { id: "c1", prestige: 55 };
  const player = {
    id: "p1",
    overall: 84,
    potential: 86,
    age: 27,
    stats: { apps: 30 },
    lastMatchRating: 7.2,
    contract: { wage: 60000 },
  };
  const poor = evaluateContractOffer(player, club, {
    weeklyWage: 10000,
    years: 1,
    squadRole: "Fringe Player",
  });
  assert.equal(poor.acceptable, false);
  const desiredKey = desiredWeeklyWage(player, club, { offeredRole: "Key Player" });
  const fair = evaluateContractOffer(player, club, {
    weeklyWage: desiredKey,
    years: 3,
    squadRole: "Key Player",
    signingBonus: desiredKey * 8,
  });
  assert.equal(fair.acceptable, true);
});
