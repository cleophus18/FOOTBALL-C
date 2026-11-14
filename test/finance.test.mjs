import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_ALLOCATION_POLICIES,
  createClubFinance,
  financialSummary,
  marketValueForPlayer,
  processMatchdayRevenue,
  processWeeklyClubFinances,
  recordClubTransaction,
  reviewBoardTransferAllocation,
  transferPlayer,
} from "../src/core/finance.mjs";
import { Club } from "../src/model/club.mjs";

function squad(size = 24, prefix = "squad") {
  return Array.from({ length: size }, (_, index) => ({
    id: `${prefix}-${index}`,
    first: "Squad",
    last: `Player ${index}`,
    overall: 60,
    position: "CM",
    contract: { wage: 5_000 },
  }));
}

function club(id, prestige = 60) {
  const instance = new Club({
    id,
    name: id,
    prestige,
    capacity: 30000,
    budget: prestige * 200_000,
    wageBudget: prestige * 10_000,
  });
  for (const member of squad(24, id)) instance.squad.push(member.id);
  return instance;
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

test("the board only releases transfer money that is genuinely spare", () => {
  const wealthy = club("wealthy", 92);
  const modest = club("modest", 55);
  const wealthyReview = reviewBoardTransferAllocation(wealthy, {
    season: 2026,
    players: [],
    force: true,
  });
  const modestReview = reviewBoardTransferAllocation(modest, {
    season: 2026,
    players: [],
    force: true,
  });

  assert.equal(wealthyReview.changed, true);
  assert.ok(wealthyReview.allocation > 0);
  // The allocation is a share of genuinely spare cash, never more than the headroom.
  assert.ok(wealthyReview.allocation <= wealthyReview.headroom);
  assert.ok(wealthyReview.allocation <= wealthyReview.freeCash);
  // The reserve is protected: the club keeps its operating budget and its debt.
  assert.ok(
    wealthy.finances.balance >=
      wealthy.finances.annualOperatingBudget + wealthy.finances.investmentBudget,
    "operating reserve must survive the allocation",
  );
  // A less prestigious, poorer board releases less money than an elite one.
  assert.ok(modestReview.allocation < wealthyReview.allocation);
  assert.ok(BOARD_ALLOCATION_POLICIES[modestReview.policy]);
});

function transferReadyClub(id, prestige = 70, extras = []) {
  const instance = club(id, prestige);
  const wanted = [...squad(24, id).map((member) => member.id), ...extras];
  for (const playerId of wanted) {
    if (!instance.has(playerId)) instance.squad.push(playerId);
  }
  return instance;
}

test("a season is only reviewed once, and spending is never re-released", () => {
  const buyingClub = club("arsenal", 88);
  const seller = transferReadyClub("seller-club", 70, ["buy-1"]);
  const first = reviewBoardTransferAllocation(buyingClub, { season: 2026, players: [] });
  assert.equal(first.changed, true);
  const allocation = first.allocation;

  const replay = reviewBoardTransferAllocation(buyingClub, { season: 2026, players: [] });
  assert.equal(replay.changed, false);
  assert.equal(replay.allocation, allocation);

  const target = {
    id: "buy-1",
    first: "New",
    last: "Signing",
    overall: 70,
    contract: { wage: 1 },
  };
  transferPlayer({
    seller,
    buyer: buyingClub,
    player: target,
    players: [target],
    fee: 10_000_000,
    wage: 20_000,
    date: 200,
    transferId: "review-transfer",
  });
  const afterSpend = buyingClub.finances.transferBudget;
  assert.ok(afterSpend < allocation, "spending must reduce the transfer budget");

  const nextSeason = reviewBoardTransferAllocation(buyingClub, {
    season: 2026,
    players: [],
    force: true,
  });
  assert.equal(
    nextSeason.allocation,
    afterSpend,
    "money already spent on players must not be released again",
  );
});

test("spending transfer money reduces available funds without touching the reserve", () => {
  const buyer = club("buyer", 85);
  reviewBoardTransferAllocation(buyer, { season: 2026, players: [], force: true });
  const summaryBefore = financialSummary(buyer, []);
  const reserve = summaryBefore.financialObligations;
  const available = summaryBefore.availableTransferFunds;

  const target = {
    id: "target-1",
    first: "Target",
    last: "One",
    overall: 74,
    contract: { wage: 1 },
  };
  const seller = transferReadyClub("seller-two", 70, [target.id]);
  transferPlayer({
    seller,
    buyer,
    player: target,
    players: [target],
    fee: 5_000_000,
    wage: 15_000,
    date: 300,
    transferId: "spend-1",
  });

  const summaryAfter = financialSummary(buyer, []);
  assert.equal(summaryAfter.availableTransferFunds, available - 5_000_000);
  assert.equal(summaryAfter.financialObligations, reserve);
  assert.ok(summaryAfter.spareCash >= 0);
});
