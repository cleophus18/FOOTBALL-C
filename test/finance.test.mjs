import test from "node:test";
import assert from "node:assert/strict";
import {
  createClubFinance,
  financialSummary,
  marketValueForPlayer,
  processMatchdayRevenue,
  processWeeklyClubFinances,
  recordClubTransaction,
  transferPlayer,
} from "../src/core/finance.mjs";
import { Club } from "../src/model/club.mjs";

function club(id, prestige = 60) {
  return new Club({
    id,
    name: id,
    prestige,
    capacity: 30000,
    budget: prestige * 200_000,
    wageBudget: prestige * 10_000,
  });
}

function player(id = "p1") {
  return {
    id,
    first: "Test",
    last: "Player",
    overall: 70,
    potential: 82,
    age: 21,
    position: "ST",
    value: 0,
    contract: { wage: 10_000, yearsRemaining: 3 },
  };
}

test("clubs receive distinct migrated finance profiles and ledger entries are idempotent", () => {
  const wealthy = club("wealthy", 90);
  const small = club("small", 45);
  assert.notEqual(wealthy.finances.balance, small.finances.balance);
  const before = wealthy.finances.balance;
  recordClubTransaction(wealthy, {
    id: "event-1",
    category: "broadcasting",
    description: "Test broadcast",
    income: 1000,
  });
  recordClubTransaction(wealthy, {
    id: "event-1",
    category: "broadcasting",
    description: "Duplicate",
    income: 1000,
  });
  assert.equal(wealthy.finances.balance, before + 1000);
  assert.equal(wealthy.finances.ledger.length, 1);
});

test("weekly finances and home match revenue are recorded once", () => {
  const home = club("home", 75);
  const away = club("away", 50);
  const players = [{ ...player(), clubId: home.id }];
  home.addPlayer(players[0].id);
  const before = home.finances.balance;
  processWeeklyClubFinances(home, players, 10);
  processMatchdayRevenue(home, away, {
    date: 15,
    resultKey: "match-1",
    competition: "league",
  });
  processMatchdayRevenue(home, away, {
    date: 15,
    resultKey: "match-1",
    competition: "league",
  });
  assert.ok(home.finances.expenses.wages > 0);
  assert.ok(home.finances.expenses.operations > 0);
  assert.equal(home.finances.ledger.filter((entry) => entry.id === "match-1").length, 1);
  assert.ok(home.finances.revenue.matchday > 0);
});

test("market values respond to player profile and transfers move money and registration atomically", () => {
  const seller = club("seller", 60);
  const buyer = club("buyer", 80);
  const signed = player();
  seller.addPlayer(signed.id);
  const value = marketValueForPlayer(signed, seller, 100);
  assert.ok(value > 0);
  const buyerBefore = buyer.finances.balance;
  const sellerBefore = seller.finances.balance;
  const result = transferPlayer({
    seller,
    buyer,
    player: signed,
    players: [signed],
    fee: 1_000_000,
    wage: 12_000,
    date: 100,
    transferId: "transfer-1",
  });
  assert.equal(result.player.clubId, buyer.id);
  assert.ok(!seller.has(signed.id));
  assert.ok(buyer.has(signed.id));
  assert.equal(buyer.finances.balance, buyerBefore - 1_000_000);
  assert.equal(seller.finances.balance, sellerBefore + 1_000_000);
  assert.equal(financialSummary(buyer, [signed]).wageCommitment, 12_000);
});
