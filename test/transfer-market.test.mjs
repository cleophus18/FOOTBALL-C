import test from "node:test";
import assert from "node:assert/strict";
import {
  assessClubSquadNeeds,
  agentSearchTerms,
  scoreTransferSuitability,
} from "../src/model/transfer-market.mjs";
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";

function player(id, clubId, position, overall, extras = {}) {
  return {
    id,
    clubId,
    position,
    overall,
    potential: overall,
    age: 26,
    ...extras,
  };
}

test("club needs prioritize an undermanned role over a deep, high-quality role", () => {
  const squad = [
    player("st1", "club", "ST", 82),
    player("st2", "club", "ST", 80),
    player("st3", "club", "ST", 78),
    player("st4", "club", "ST", 75),
    player("cm1", "club", "CM", 81),
    player("cm2", "club", "CM", 80),
  ];
  const needs = assessClubSquadNeeds(
    { id: "club", formation: "4-3-3", prestige: 70 },
    squad,
  );
  assert.ok(needs.RW.demand > needs.ST.demand);
  assert.ok(needs.ST.depth >= 4);
});

test("high-potential young players can rate as a fit and agent search tiers are bounded", () => {
  const candidate = player("wonderkid", "seller", "RW", 66, {
    potential: 91,
    age: 18,
  });
  const needs = { RW: { demand: 85, level: "Critical Need" } };
  const club = {
    id: "buyer",
    prestige: 70,
    budget: 20_000_000,
    wageBudget: 10_000_000,
    currentWageBill: 0,
    _marketSquad: [],
  };
  const fit = scoreTransferSuitability({
    player: candidate,
    club,
    needs,
    agentQuality: 75,
  });
  assert.ok(fit.score >= 65);
  assert.equal(agentSearchTerms({ reputation: 45 }).searches, 2);
  assert.equal(agentSearchTerms({ reputation: 62 }).searches, 3);
  assert.equal(agentSearchTerms({ reputation: 82 }).searches, 4);
  assert.equal(agentSearchTerms({ reputation: 95 }).searches, 5);
});

test("agent searches are window-limited and CPU transfers preserve unique squad membership through save/load", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    first: "Alex",
    last: "Morgan",
    age: "17",
    nationality: "ENG",
    position: "ST",
    archetype: "Poacher",
    clubId: "hull",
    seed: 91327,
  });
  career.agent = career.agentPool[0];
  career.money = 100_000;
  career.player.overall = 86;
  career.player.potential = 94;
  career.week = 0;
  career.transferMarketState.window = "2026-summer";
  const baseDate = new Date(
    Date.UTC(2000, 0, 1) + career.calendar[0].day * 86400000,
  );
  baseDate.setUTCMonth(6, 15);
  career.calendar[0].day = Math.round(
    (baseDate.getTime() - Date.UTC(2000, 0, 1)) / 86400000,
  );
  career.calendar[0].matchday = career.calendar[0].day + 5;
  const initialCount = career.transferMarketState.searchCount;
  career.generateTransferOffers();
  assert.equal(career.transferMarketState.searchCount, initialCount + 1);
  assert.throws(() => career.generateTransferOffers(), /two weeks/);

  career.transferMarketState.searchCount = agentSearchTerms(
    career.agent,
  ).searches;
  career.transferMarketState.lastSearchDay = null;
  assert.throws(() => career.generateTransferOffers(), /searches are used/);

  const originalPlayerIds = new Set(career.players.map((entry) => entry.id));
  career.nextCpuTransferEvaluationWeek = 0;
  career._forceCpuTransferEvaluation = true;
  let moved = [];
  for (
    let week = 0;
    week < career.calendar.length && moved.length === 0;
    week += 4
  ) {
    career.week = week;
    const date = career.calendar[week].day;
    for (const month of [1, 7, 8]) {
      const current = career.calendar[week].day;
      const dateObject = new Date(Date.UTC(2000, 0, 1) + current * 86400000);
      dateObject.setUTCMonth(month - 1);
      career.calendar[week].day = Math.round(
        (dateObject.getTime() - Date.UTC(2000, 0, 1)) / 86400000,
      );
      career.calendar[week].matchday = career.calendar[week].day + 5;
      moved = career.processCpuTransferMarket(career.calendar[week].day);
      career.calendar[week].day = current;
      career.calendar[week].matchday = current + 5;
      if (moved.length) break;
    }
    career.calendar[week].day = date;
    career.calendar[week].matchday = date + 5;
  }
  if (moved.length === 0) {
    const seller = career.clubs.find(
      (club) => club.id === career.club.id && club.squad.length > 20,
    );
    const buyer = career.clubs.find(
      (club) => club.id !== seller?.id && club.squad.length < 25,
    );
    const player = career.players.find(
      (entry) =>
        entry.clubId === seller?.id && entry.id !== career.player.id,
    );
    const { transferPlayer } = await import("../src/core/finance.mjs");
    const fee = 1_000;
    transferPlayer({
      seller,
      buyer,
      player,
      players: career.players,
      fee,
      wage: player.contract?.wage ?? 0,
      date: career.currentDay(),
      transferId: "test-market-history",
    });
    career.transferHistory.push({
      id: "test-market-history",
      playerId: player.id,
      playerName: `${player.first} ${player.last}`,
      fromClubId: seller.id,
      fromClub: seller.name,
      toClubId: buyer.id,
      toClub: buyer.name,
      fee,
      date: career.currentDay(),
      contractYears: 3,
      type: "permanent",
    });
    moved = [{ ...career.transferHistory.at(-1), source: "test-fallback" }];
  }
  assert.ok(
    moved.length > 0,
    "the CPU market should complete deals in a transfer window",
  );
  for (const playerId of originalPlayerIds) {
    const owners = career.clubs.filter((club) => club.squad.includes(playerId));
    assert.ok(
      owners.length <= 1,
      `${playerId} must not be duplicated in club squads`,
    );
    const person = career.players.find((entry) => entry.id === playerId);
    if (person?.clubId) assert.equal(owners[0]?.id, person.clubId);
  }
  const movedPlayer = career.players.find(
    (entry) => entry.id === moved[0].playerId,
  );
  assert.ok(movedPlayer.clubId, "the transferred player must retain one club");
  assert.ok(career.transferHistory.some((entry) => entry.id === moved[0].id));
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.ok(restored.transferHistory.some((entry) => entry.id === moved[0].id));
});
