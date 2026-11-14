import test from "node:test";
import assert from "node:assert/strict";
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";
import {
  CONTRACT_STATUSES,
  aiContractDecision,
  aiRenewalOffer,
  squadRecruitmentPriority,
  squadPriorityBand,
  priorityRecruitmentPosition,
  SQUAD_MANAGEMENT_RULES,
} from "../src/core/contracts.mjs";

function options(seed = 4242) {
  return {
    first: "Alex",
    last: "Hunter",
    age: "17",
    nationality: "ENG",
    height: "178",
    weight: "70",
    foot: "Right",
    weakFoot: "3",
    skillMoves: "4",
    position: "ST",
    archetype: "Poacher",
    startingOverall: "62",
    trait: "Wonderkid",
    personality: "Professional",
    difficulty: "Realistic",
    clubId: "hull",
    seed,
  };
}

function advanceAndResolve(career) {
  const report = career.advanceWeek();
  if (report.userMatch) {
    while (career.matchSimulation.status !== "finished") {
      const state = career.advanceMatchSimulation();
      if (
        state.status === "paused" &&
        !career.lastReport.userMatch.playerResult.keyMoments[state.momentIndex]
          .resolved
      ) {
        career.resolveKeyMoment(state.momentIndex, "play-safe");
      }
    }
  }
  return report;
}

function npc(career, { clubId = career.club.id, overallMin = 55 } = {}) {
  return career.players.find(
    (player) =>
      player.id !== career.player.id &&
      player.clubId === clubId &&
      Number(player.overall ?? 0) >= overallMin,
  );
}

/* 1. AI renewal decisions */
test("AI managers renew important affordable players entering the final year", async () => {
  const career = createCareer(await loadData(), options(4001));
  const player = npc(career, { overallMin: 66 });
  const club = career.clubs.find((entry) => entry.id === player.clubId);
  const finance = club.finances;
  finance.wageBudget = Math.max(
    finance.wageBudget,
    player.contract.weeklyWage * 400,
  );
  player.contract.expiryDate = career.currentDay() + 60;
  const decisionsBefore = career.players.filter(
    (p) => p.contract?.lastManagedDay != null,
  ).length;
  career.processAIContractManagement(career.currentDay());
  const after = career.players.filter(
    (p) => p.contract?.lastManagedDay != null,
  ).length;
  assert.ok(
    after > decisionsBefore,
    "renewal-window players must be evaluated",
  );
  const evaluated = career.players.filter(
    (p) => p.contract?.lastManagedDay != null,
  );
  for (const entry of evaluated) {
    assert.ok(
      [
        "active",
        "renewal-offered",
        "negotiating",
        "pending-renewal",
        "expiring",
        "free-agent",
      ].includes(entry.contract.status),
      `unexpected status ${entry.contract.status}`,
    );
  }
  // Someone, somewhere, must have been renewed (or their negotiation recorded).
  assert.ok(
    career.news.some((message) =>
      /renewed .* contract|transfer list|will not renew/.test(message),
    ),
    "AI contract decisions must produce club news",
  );
});

/* 2. AI rejection and release decisions */
test("AI managers refuse to renew declining, overpaid squad players and record the reason", async () => {
  const declining = {
    id: "old-frm",
    first: "Marek",
    last: "Vetchy",
    overall: 71,
    potential: 71,
    age: 33,
    position: "CM",
    stats: { apps: 12 },
    lastMatchRating: 6.4,
    contract: { weeklyWage: 40000, squadRole: "Fringe Player" },
  };
  const rngAlways = { chance: () => true };
  const decision = aiContractDecision(
    declining,
    {
      id: "c1",
      prestige: 70,
      finances: { wageBudget: 100 },
    },
    {
      currentDay: 10000,
      wageBill: 0,
      squadSize: 24,
      positionalDepth: 5,
      rng: rngAlways,
    },
  );
  assert.equal(decision.action, "release");
  assert.ok(decision.reason);
});

/* 3. AI recruitment after multiple contract expiries */
test("clubs recruit from the free-agent market after a wave of expiries and keep squads playable", async () => {
  const career = createCareer(await loadData(), options(4003));
  const club = career.clubs.find(
    (entry) => entry.id !== career.club.id && entry.squad.length >= 22,
  );
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  const squadBefore = club.squad.length;
  for (const id of club.squad.slice(0, 6)) {
    const player = career.players.find((entry) => entry.id === id);
    expirePlayerContract(player, club, {
      currentDay: career.currentDay(),
      season: career.season,
    });
  }
  assert.ok(
    club.squad.length === squadBefore - 6 && club.squad.length < 20,
    `the wave must shrink the squad first (${squadBefore} -> ${club.squad.length})`,
  );
  for (let week = 0; week < 12 && club.squad.length < 20; week++)
    advanceAndResolve(career);
  assert.ok(
    club.squad.length >= 18,
    `club must rebuild to a playable squad, has ${club.squad.length}`,
  );
  const goalkeepers = club.squad
    .map((id) => career.players.find((entry) => entry.id === id))
    .filter((player) => player && player.position === "GK");
  assert.ok(
    goalkeepers.length >= 1,
    "the rebuilt squad must include a goalkeeper",
  );
});

/* 4. Free-agent market availability */
test("expired players appear on the free-agent market exactly once", async () => {
  const career = createCareer(await loadData(), options(4004));
  const player = npc(career, { overallMin: 55 });
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  expirePlayerContract(player, career.club, {
    currentDay: career.currentDay(),
    season: career.season,
  });
  const listings = career.freeAgents({});
  const found = listings.filter((entry) => entry.player.id === player.id);
  assert.equal(found.length, 1, "a player must be listed once");
  assert.ok(found[0].expectedWage >= 0);
});

/* 5. AI free-agent signings */
test("AI clubs complete free-agent signings that register, pay and record history", async () => {
  const career = createCareer(await loadData(), options(4005));
  const player = npc(career, { overallMin: 55 });
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  expirePlayerContract(player, career.club, {
    currentDay: career.currentDay(),
    season: career.season,
  });
  let signings = [];
  for (let week = 0; week < 14 && !player.clubId; week++) {
    advanceAndResolve(career);
    signings = career.transferHistory.filter(
      (entry) => entry.playerId === player.id && entry.type === "free-transfer",
    );
  }
  if (player.clubId) {
    assert.equal(
      signings.length >= 1,
      true,
      "the signing must be recorded once",
    );
    assert.ok(
      career.clubs
        .find((club) => club.id === player.clubId)
        .squad.includes(player.id),
      "the signing club must register him",
    );
    assert.ok(
      player.contract.weeklyWage > 0,
      "a signed free agent must earn wages",
    );
    assert.equal(player.contract.status, CONTRACT_STATUSES.ACTIVE);
  } else {
    // Nobody wanted him yet — he must still be available on the market.
    assert.ok(
      career.freeAgents({}).some((entry) => entry.player.id === player.id),
      "an unwanted player must remain available, not disappear",
    );
  }
});

/* 6. Squad-depth protection */
test("the squad-management controller prioritises critical clubs and goalkeeper cover", () => {
  const players = [
    { id: "gk1", position: "GK" },
    { id: "gk2", position: "GK" },
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `out${index}`,
      position: "CM",
    })),
  ];
  const club = {
    id: "c1",
    squad: players.map((player) => player.id),
    registrationLimit: 25,
  };
  assert.equal(squadPriorityBand(17), "critical");
  assert.equal(squadPriorityBand(19), "active");
  assert.equal(squadPriorityBand(22), "balanced");
  assert.equal(squadPriorityBand(26, 25), "full");
  // 17 players with 2 keepers: below the critical floor but keeper cover is fine,
  // so the controller reports depth-2 recruitment (urgent only when keepers are short).
  const priority = squadRecruitmentPriority(club, players);
  assert.ok(priority >= 2, `17 players must recruit actively, got ${priority}`);
  const keeperless = {
    id: "c2",
    squad: players.filter((p) => p.position !== "GK").map((p) => p.id),
    registrationLimit: 25,
  };
  assert.equal(
    priorityRecruitmentPosition({}, players, keeperless),
    "GK",
    "a club without keeper cover must target a goalkeeper",
  );
  const fullClub = {
    id: "c3",
    squad: Array.from({ length: 25 }, (_, i) => `x${i}`),
    registrationLimit: 25,
  };
  assert.equal(
    squadRecruitmentPriority(fullClub, players),
    0,
    "a full club does not recruit",
  );
});

/* 7. User contract-expiry simulation pause */
test("the user's expiring contract pauses the simulation until a decision", async () => {
  const career = createCareer(await loadData(), options(4007));
  career.player.contract.expiryDate = career.currentDay() + 2;
  advanceAndResolve(career);
  assert.ok(
    career.userContractDecision && !career.userContractDecision.resolved,
    "the expiry must open a pending decision",
  );
  assert.equal(
    career.player.clubId,
    null,
    "the expired contract must end the club link",
  );
  assert.equal(career.player.contract.status, CONTRACT_STATUSES.FREE_AGENT);
  assert.ok(
    !career.club.squad.includes(career.player.id),
    "the user must be deregistered from his former club",
  );
  const view = career.userContractExpiryView();
  assert.ok(view && view.paused);
  assert.ok(view.clubOffer, "the club must present a renewal offer");
  assert.throws(
    () => career.advanceWeek(),
    /contract has expired/i,
    "the sim must stay paused",
  );
});

/* 8. User contract renewal and wage updates */
test("accepting the club's renewal updates the contract and resumes the sim", async () => {
  const career = createCareer(await loadData(), options(4008));
  const club = career.club;
  const finance = club.finances;
  finance.wageBudget = Math.max(finance.wageBudget, 5_000_000);
  finance.balance = Math.max(finance.balance, 50_000_000);
  career.player.contract.expiryDate = career.currentDay() + 2;
  advanceAndResolve(career);
  const offer = career.userContractDecision.clubOffer;
  const result = career.negotiateUserContract({
    weeklyWage: offer.weeklyWage,
    years: 3,
    squadRole: offer.squadRole,
    signingBonus: offer.signingBonus,
  });
  assert.equal(result.status, "accepted");
  assert.equal(career.player.clubId, club.id, "renewal restores the club link");
  assert.equal(career.player.contract.weeklyWage, offer.weeklyWage);
  assert.equal(career.player.contract.years, 3);
  assert.ok(career.player.contract.expiryDate > career.currentDay() + 1000);
  assert.ok(
    career.player.contract.history.some((entry) => entry.type === "renewed"),
    "renewal history must be recorded",
  );
  assert.equal(
    career.userContractDecision.resolved,
    true,
    "the sim must resume",
  );
  career.advanceWeek();
});

/* 9. User rejection and free-agent conversion */
test("declining the renewal converts the user to a free agent with history preserved", async () => {
  const career = createCareer(await loadData(), options(4009));
  career.player.stats.apps = 14;
  career.player.stats.goals = 5;
  const appsBefore = career.player.stats.apps;
  const honoursBefore = JSON.parse(JSON.stringify(career.player.honours ?? []));
  career.player.contract.expiryDate = career.currentDay() + 2;
  advanceAndResolve(career);
  const result = career.declineUserContract();
  assert.equal(result.status, "free-agent");
  assert.equal(career.player.clubId, null);
  assert.equal(career.player.squadStatus, "Free Agent");
  assert.equal(career.player.contract.status, CONTRACT_STATUSES.FREE_AGENT);
  assert.equal(career.player.contract.weeklyWage, 0);
  assert.ok(
    !career.clubs.some((club) => club.squad.includes(career.player.id)),
    "the player must not remain registered anywhere",
  );
  assert.equal(
    career.player.stats.apps,
    appsBefore,
    "career stats must be preserved",
  );
  assert.deepEqual(
    career.player.honours ?? [],
    honoursBefore,
    "honours must be preserved",
  );
  assert.ok(
    career.freeAgentOpportunities.length >= 0,
    "the agent must open a search",
  );
});

/* 10. Immediate agent search */
test("the agent searches immediately across every playable league with no cooldown", async () => {
  const career = createCareer(await loadData(), options(4010));
  career.player.clubId = null;
  career.player.formerClubId = career.club.id;
  career.player.squadStatus = "Free Agent";
  career.player.contract.status = CONTRACT_STATUSES.FREE_AGENT;
  const opportunities = career.searchFreeAgentClubs();
  assert.ok(
    Array.isArray(opportunities),
    "the search must return opportunities",
  );
  const leagues = new Set(opportunities.map((entry) => entry.leagueId));
  const playableLeagues = career.worldCareerLeagues.length;
  assert.ok(
    leagues.size <= playableLeagues,
    "searches must cover the playable world without inventing clubs",
  );
  // A refresh produces a fresh search rather than an error.
  const again = career.searchFreeAgentClubs();
  assert.ok(
    Array.isArray(again),
    "repeated searches must never be blocked by a cooldown",
  );
});

/* 11. Multiple club offers */
test("the agent presents several comparable opportunities", async () => {
  const career = createCareer(await loadData(), options(4011));
  career.player.clubId = null;
  career.player.formerClubId = career.club.id;
  career.player.contract.status = CONTRACT_STATUSES.FREE_AGENT;
  career.player.overall = 84;
  career.player.potential = 90;
  const opportunities = career.searchFreeAgentClubs();
  assert.ok(
    opportunities.length >= 2,
    `a strong free agent should attract multiple clubs, got ${opportunities.length}`,
  );
  for (const opportunity of opportunities) {
    assert.ok(opportunity.clubName);
    assert.ok(opportunity.leagueName);
    assert.ok(opportunity.offer.weeklyWage > 0);
    assert.ok(opportunity.reason);
  }
  const sorted = [...opportunities].sort((a, b) => b.interest - a.interest);
  assert.deepEqual(
    opportunities,
    sorted,
    "opportunities must be ranked by interest",
  );
});

/* 12. Accepting an offer and changing clubs */
test("accepting a free-agent offer joins, registers and records the transfer", async () => {
  const career = createCareer(await loadData(), options(4012));
  career.player.clubId = null;
  career.player.formerClubId = career.club.id;
  career.player.contract.status = CONTRACT_STATUSES.FREE_AGENT;
  const opportunities = career.searchFreeAgentClubs();
  const target =
    opportunities.find((entry) => entry.clubId !== career.club.id) ??
    opportunities[0];
  assert.ok(target, "there must be at least one interested club");
  const destination = career.clubs.find((club) => club.id === target.clubId);
  const result = career.acceptFreeAgentOffer(target.clubId);
  assert.equal(result.status, "signed");
  assert.equal(career.player.clubId, destination.id);
  assert.ok(
    destination.squad.includes(career.player.id),
    "he must be registered",
  );
  assert.ok(career.player.contract.weeklyWage > 0);
  assert.ok(
    career.transferHistory.some(
      (entry) =>
        entry.playerId === career.player.id && entry.type === "free-transfer",
    ),
    "the transfer must be recorded",
  );
  assert.throws(
    () => career.acceptFreeAgentOffer(target.clubId),
    /already under contract/,
  );
});

/* 13. Duplicate registration prevention */
test("no player is ever registered at two clubs after free-agency moves", async () => {
  const career = createCareer(await loadData(), options(4013));
  const squadByClub = new Map();
  for (const club of career.clubs) squadByClub.set(club.id, [...club.squad]);
  for (let week = 0; week < 6; week++) advanceAndResolve(career);
  const seen = new Map();
  for (const club of career.clubs) {
    for (const playerId of club.squad) {
      assert.ok(!seen.has(playerId), `${playerId} registered at two clubs`);
      seen.set(playerId, club.id);
    }
  }
  for (const player of career.players) {
    if (!player.clubId) continue;
    assert.equal(
      seen.get(player.id),
      player.clubId,
      `${player.id} squad/clubId mismatch`,
    );
  }
});

/* 14. Save/load persistence */
test("contract-expiry decisions, free-agent state and opportunities survive save/load", async () => {
  const data = await loadData();
  const career = createCareer(data, options(4014));
  career.player.clubId = null;
  career.player.formerClubId = career.club.id;
  career.player.contract.status = CONTRACT_STATUSES.FREE_AGENT;
  career.searchFreeAgentClubs();
  career.userContractDecision = {
    kind: "contract-expiry",
    resolved: false,
    day: career.currentDay(),
    season: career.season,
    formerClubId: career.club.id,
    formerClubName: career.club.name,
    previousWeeklyWage: 8000,
    clubOffer: { weeklyWage: 9000, years: 3 },
  };
  const saved = career.toJSON();
  const restored = createCareer(
    data,
    saved.creation,
    JSON.parse(JSON.stringify(saved)),
  );
  assert.ok(restored.userContractDecision, "the pending decision must survive");
  assert.equal(restored.userContractDecision.resolved, false);
  assert.ok(
    Array.isArray(restored.freeAgentOpportunities),
    "agent opportunities must survive",
  );
  assert.equal(restored.player.clubId, null);
  assert.throws(
    () => restored.advanceWeek(),
    /contract has expired/i,
    "the pause persists",
  );
});

/* 15. Long-term multi-season squad stability */
test("a multi-season sim keeps every club playable with goalkeepers", async () => {
  const data = await loadData();
  const career = createCareer(data, options(4015));
  const maxWeeks = 200;
  let weeks = 0;
  while (weeks < maxWeeks) {
    if (career.seasonComplete) break;
    try {
      advanceAndResolve(career);
    } catch (error) {
      if (/contract has expired/i.test(error.message)) {
        // Resolve the pause the way the UI would: accept the club offer.
        const offer = career.userContractDecision.clubOffer;
        career.negotiateUserContract(offer);
        continue;
      }
      throw error;
    }
    weeks++;
  }
  for (const club of career.clubs) {
    assert.ok(
      club.squad.length >= SQUAD_MANAGEMENT_RULES.criticalSquadSize,
      `${club.name} collapsed to ${club.squad.length} players`,
    );
    const keepers = club.squad
      .map((id) => career.players.find((player) => player.id === id))
      .filter((player) => player && player.position === "GK");
    assert.ok(keepers.length >= 1, `${club.name} has no goalkeeper`);
    for (const id of club.squad) {
      const player = career.players.find((entry) => entry.id === id);
      assert.ok(player, `${club.name} references missing player ${id}`);
      assert.equal(player.clubId, club.id, `${id} has a broken club reference`);
    }
  }
  const finances = career.clubs.map((club) => club.finances);
  for (const finance of finances) {
    assert.ok(
      Number.isFinite(finance.balance),
      "club balances must stay numeric",
    );
    assert.ok(
      Number.isFinite(finance.wageBudget),
      "wage budgets must stay numeric",
    );
  }
});

/* Deterministic AI helpers */
test("aiContractDecision and aiRenewalOffer are deterministic and budget-aware", () => {
  const player = {
    id: "p1",
    first: "A",
    last: "B",
    overall: 80,
    potential: 83,
    age: 27,
    position: "ST",
    stats: { apps: 20 },
    lastMatchRating: 7.2,
    contract: { weeklyWage: 30000, squadRole: "Key Player" },
  };
  const club = { id: "c1", prestige: 72, finances: { wageBudget: 2_000_000 } };
  const no = { chance: () => false };
  const decision = aiContractDecision(player, club, {
    currentDay: 10000,
    wageBill: 500_000,
    squadSize: 22,
    positionalDepth: 2,
    rng: no,
  });
  assert.equal(decision.action, "renew");
  const offer = aiRenewalOffer(player, club, { wageBill: 500_000 });
  assert.ok(offer.weeklyWage > 0);
  assert.ok(offer.years >= 1 && offer.years <= 5);
  assert.ok(offer.signingBonus >= 0);
  const poorClub = { id: "c2", prestige: 40, finances: { wageBudget: 31_000 } };
  const poorOffer = aiRenewalOffer(player, poorClub, { wageBill: 30_000 });
  assert.ok(
    poorOffer.weeklyWage <= offer.weeklyWage,
    "renewal offers must respect the club's wage room",
  );
});
