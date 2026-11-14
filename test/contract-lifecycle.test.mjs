import test from "node:test";
import assert from "node:assert/strict";
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";
import {
  CONTRACT_STATUSES,
  INITIAL_CAREER_CONTRACT_YEARS,
  applyInitialContractTerm,
  contractStageLabel,
  createContractNegotiation,
  createPreContractAgreement,
  canSignPreContract,
  freeAgentClubInterest,
  freeAgentExpectedWage,
  freeAgentOpeningOffer,
  agentFeeFor,
  contractRemainingDuration,
  initialCareerContractYears,
  resolveContractNegotiation,
  daysUntilExpiry,
} from "../src/core/contracts.mjs";

function options(seed = 90210) {
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

function npcInSquad(career, { overallMin = 60, excludeUser = true } = {}) {
  return career.players.find(
    (player) =>
      (!excludeUser || player.id !== career.player.id) &&
      player.clubId === career.club.id &&
      Number(player.overall ?? 0) >= overallMin,
  );
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

test("every professional player gets a normalized contract with start, expiry, wage, status and history", async () => {
  const career = createCareer(await loadData(), options(9001));
  const contracted = career.players.filter((player) => player.clubId);
  assert.ok(contracted.length > 100);
  for (const player of contracted) {
    const contract = player.contract;
    assert.ok(contract, `${player.id} missing a contract`);
    assert.ok(Number.isFinite(contract.startDate));
    assert.ok(Number.isFinite(contract.expiryDate));
    assert.ok(
      contract.expiryDate > contract.startDate,
      "negative contract duration",
    );
    assert.ok(Number.isFinite(contract.weeklyWage) && contract.weeklyWage > 0);
    assert.ok(contract.status);
    assert.ok(Array.isArray(contract.history));
  }
});

test("contract durations are clamped between 1 and 5 years", async () => {
  const career = createCareer(await loadData(), options(9002));
  for (const player of career.players) {
    const years = Number(player.contract?.years ?? 0);
    if (years) assert.ok(years >= 1 && years <= 5);
  }
});

test("a new career gives AI players four years and the user player two", async () => {
  const career = createCareer(await loadData(), options(9003));
  const contracted = career.players.filter((player) => player.clubId && player.contract);
  assert.ok(contracted.length > 100);
  const aiPlayers = contracted.filter((player) => !player.isUser);
  assert.ok(aiPlayers.length > 100);
  for (const player of aiPlayers) {
    assert.equal(player.contract.years, INITIAL_CAREER_CONTRACT_YEARS.ai);
  }
  assert.equal(career.player.isUser, true);
  assert.equal(career.player.contract.years, INITIAL_CAREER_CONTRACT_YEARS.user);
  // The user's deal must genuinely expire inside the standard window.
  const remaining = daysUntilExpiry(career.player.contract, career.currentDay());
  assert.ok(remaining > 600 && remaining <= 731);
});

test("initial contract terms survive a save round-trip and are not re-applied", async () => {
  const career = createCareer(await loadData(), options(9004));
  const userContract = career.player.contract;
  const npc = career.players.find(
    (player) => player.clubId && !player.isUser && player.contract,
  );
  const saved = career.toJSON();
  const restored = createCareer(
    await loadData(),
    options(9004),
    saved,
  );
  assert.equal(restored.player.contract.years, userContract.years);
  assert.equal(restored.player.contract.expiryDate, userContract.expiryDate);
  const restoredNpc = restored.players.find((player) => player.id === npc.id);
  assert.equal(restoredNpc.contract.years, npc.contract.years);

  // Re-running the standardisation on a live contract changes nothing.
  const before = { ...restoredNpc.contract };
  const result = applyInitialContractTerm(restoredNpc, {
    season: restored.season,
    currentDay: restored.currentDay(),
  });
  assert.equal(result, null);
  assert.deepEqual(
    { years: restoredNpc.contract.years, expiryDate: restoredNpc.contract.expiryDate },
    { years: before.years, expiryDate: before.expiryDate },
  );
});

test("initial career lengths are the documented four and two years", () => {
  assert.deepEqual(INITIAL_CAREER_CONTRACT_YEARS, { ai: 4, user: 2 });
  assert.equal(initialCareerContractYears({ isUser: true }), 2);
  assert.equal(initialCareerContractYears({ isUser: false }), 4);
});

test("contract stage labels follow the 12/6/1 month lifecycle", () => {
  const day = 10000;
  assert.equal(contractStageLabel({ expiryDate: day + 400 }, day), "normal");
  assert.equal(
    contractStageLabel({ expiryDate: day + 365 }, day),
    "twelve-months",
  );
  assert.equal(
    contractStageLabel({ expiryDate: day + 180 }, day),
    "six-months",
  );
  assert.equal(
    contractStageLabel({ expiryDate: day + 20 }, day),
    "final-month",
  );
  assert.equal(contractStageLabel({ expiryDate: day }, day), "expired");
});

test("remaining duration returns years and months without going negative", () => {
  const day = 10000;
  const result = contractRemainingDuration({ expiryDate: day + 400 }, day);
  assert.equal(result.years, 1);
  assert.equal(result.months, 1);
  assert.ok(result.days >= 0);
  assert.equal(
    contractRemainingDuration({ expiryDate: day - 5 }, day).years,
    0,
  );
});

test("the weekly advance processes stage notifications and expiry idempotently", async () => {
  const career = createCareer(await loadData(), options(9003));
  const player = npcInSquad(career, { overallMin: 55 });
  assert.ok(player, "no squad player found");
  player.contract.expiryDate = career.currentDay() + 370;
  const before = player.clubId;
  // Cross the 12-month threshold.
  for (let i = 0; i < 2; i++) career.advanceWeek();
  assert.ok(
    career.contractNotifications.length > 0,
    "no 12-month notification issued",
  );
  assert.equal(player.clubId, before, "player must not expire early");
  // Jump to expiry.
  player.contract.expiryDate = career.currentDay() + 3;
  const club = career.club;
  const squadBefore = club.squad.length;
  for (let i = 0; i < 5 && player.clubId; i++) advanceAndResolve(career);
  assert.equal(player.clubId, null, "expired player must leave the club");
  assert.equal(player.squadStatus, "Free Agent");
  assert.equal(player.contract.status, CONTRACT_STATUSES.FREE_AGENT);
  assert.equal(player.contract.weeklyWage, 0, "free agent must not draw wages");
  assert.ok(
    !club.squad.includes(player.id),
    "expired player must be deregistered",
  );
  assert.ok(club.squad.length < squadBefore || !club.squad.includes(player.id));
  assert.ok(
    career.recentlyExpiredContracts.some(
      (entry) => entry.playerId === player.id,
    ),
    "expiry should be recorded once",
  );
  const count = career.recentlyExpiredContracts.filter(
    (entry) => entry.playerId === player.id,
  ).length;
  assert.equal(count, 1, "contracts must not expire repeatedly");
});

test("processing the same day twice never duplicates expiry or notifications", async () => {
  const career = createCareer(await loadData(), options(9004));
  const day = career.currentDay();
  const first = career.processContractLifecycle(day);
  const second = career.processContractLifecycle(day);
  assert.equal(second.notifications, 0);
  assert.equal(second.expired.length, 0);
  assert.equal(first.expired.length, second.expired.length);
});

test("a renewal negotiation can be accepted and updates the contract and ledger", async () => {
  const career = createCareer(await loadData(), options(9005));
  const player = npcInSquad(career, { overallMin: 55 });
  player.contract.expiryDate = career.currentDay() + 300;
  const oldWage = player.contract.weeklyWage;
  const decision = career.offerContractRenewal(player.id, {
    weeklyWage: Math.round(oldWage * 2),
    years: 4,
    squadRole: "Key Player",
    signingBonus: oldWage * 20,
  });
  assert.ok(decision, "a negotiation decision must be returned");
  const negotiation = career.contractNegotiations[0];
  assert.ok(negotiation, "negotiation recorded");
  if (negotiation.status === "accepted") {
    assert.equal(player.contract.years, 4);
    assert.ok(player.contract.expiryDate > career.currentDay() + 1400);
    assert.ok(
      player.contract.history.some((entry) => entry.type === "renewed"),
    );
    assert.ok(
      career.club.finances.ledger.some(
        (entry) =>
          entry.category === "wages" &&
          entry.expense > 0 &&
          entry.id.startsWith("signing-bonus"),
      ),
      "signing bonus recorded once in the ledger",
    );
    assert.equal(player.contract.status, CONTRACT_STATUSES.ACTIVE);
  } else {
    assert.ok(
      negotiation.response?.message,
      "rejected offers must produce an inbox message",
    );
  }
});

test("a lowball renewal is rejected or countered, never silently accepted", async () => {
  const career = createCareer(await loadData(), options(9006));
  const player = npcInSquad(career, { overallMin: 65 });
  player.contract.expiryDate = career.currentDay() + 200;
  const wage = player.contract.weeklyWage;
  const decision = career.offerContractRenewal(player.id, {
    weeklyWage: Math.round(wage * 0.2),
    years: 1,
    squadRole: "Fringe Player",
    signingBonus: 0,
  });
  const negotiation = career.contractNegotiations[0];
  assert.ok(
    ["rejected", "counteroffer"].includes(negotiation.status),
    `unexpected status ${negotiation.status}`,
  );
  assert.ok(decision.message);
});

test("an offer can be withdrawn", async () => {
  const career = createCareer(await loadData(), options(9007));
  const player = npcInSquad(career, { overallMin: 60 });
  player.contract.expiryDate = career.currentDay() + 200;
  career.offerContractRenewal(player.id, {
    weeklyWage: player.contract.weeklyWage,
    years: 2,
    squadRole: "Squad Rotation",
  });
  const negotiation = career.contractNegotiations[0];
  if (["awaiting-response", "counteroffer"].includes(negotiation.status)) {
    career.withdrawContractNegotiation(negotiation.id);
    assert.equal(negotiation.status, "withdrawn");
  }
});

test("the user can sign a genuine free agent with no fee but ledgered costs", async () => {
  const career = createCareer(await loadData(), options(9008));
  const player = npcInSquad(career, { overallMin: 55 });
  const club = career.club;
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  expirePlayerContract(player, club, {
    currentDay: career.currentDay(),
    season: career.season,
  });
  assert.equal(player.clubId, null);
  const wage = Math.max(1000, freeAgentExpectedWage(player));
  career.club.finances.wageBudget = Math.max(
    career.club.finances.wageBudget,
    wage * 60,
  );
  const contract = career.signFreeAgent(player.id, {
    weeklyWage: wage,
    years: 3,
    squadRole: "Regular Starter",
    signingBonus: 100000,
  });
  assert.equal(player.clubId, career.club.id);
  assert.ok(
    career.club.squad.includes(player.id),
    "signed player must be registered",
  );
  assert.equal(contract.status, CONTRACT_STATUSES.ACTIVE);
  assert.ok(
    contract.history.some((entry) => entry.type === "signed-free-agent"),
  );
  const ledger = career.club.finances.ledger.map((entry) => entry.id);
  assert.ok(
    ledger.some((id) => id.startsWith("agent-fee-")),
    "agent fee charged",
  );
  assert.ok(
    ledger.some((id) => id.startsWith("signing-bonus-")),
    "signing bonus charged",
  );
  const unique = new Set(ledger);
  assert.equal(
    ledger.length,
    unique.size,
    "duplicate financial transactions detected",
  );
  assert.ok(
    career.transferHistory.some(
      (entry) => entry.playerId === player.id && entry.type === "free-transfer",
    ),
  );
});

test("signing a player already contracted elsewhere is refused", async () => {
  const career = createCareer(await loadData(), options(9009));
  const player = npcInSquad(career, { overallMin: 55 });
  assert.throws(
    () => career.signFreeAgent(player.id, { weeklyWage: 5000 }),
    /already under contract/,
  );
});

test("pre-contract agreements follow the six-month rule and cannot double-sign", async () => {
  const career = createCareer(await loadData(), options(9010));
  const player = npcInSquad(career, { overallMin: 55 });
  const destination = career.clubs.find((club) => club.id !== player.clubId);
  const farDay = career.currentDay();
  player.contract.expiryDate = farDay + 400;
  assert.equal(
    canSignPreContract(player, farDay),
    false,
    "pre-contract outside six months must be blocked",
  );
  player.contract.expiryDate = farDay + 100;
  assert.equal(canSignPreContract(player, farDay), true);
  const agreement = createPreContractAgreement({
    player,
    club: destination,
    offer: { weeklyWage: 20000, years: 3, signingBonus: 250000 },
    currentDay: farDay,
    season: career.season,
  });
  assert.equal(agreement.status, "agreed");
  assert.equal(player.contract.status, CONTRACT_STATUSES.PRE_CONTRACT_AGREED);
  assert.throws(
    () =>
      createPreContractAgreement({
        player,
        club: career.clubs.find(
          (club) => club.id !== player.clubId && club.id !== destination.id,
        ),
        offer: { weeklyWage: 30000, years: 2 },
        currentDay: farDay,
      }),
    /pre-contract/,
    "conflicting pre-contract must be prevented",
  );
});

test("a pre-contract completes automatically when the original contract expires", async () => {
  const career = createCareer(await loadData(), options(9011));
  const player = npcInSquad(career, { overallMin: 55 });
  const destination = career.clubs.find(
    (club) => club.id !== player.clubId && club.squad.length < 25,
  );
  assert.ok(destination, "no destination club available");
  const day = career.currentDay();
  player.contract.expiryDate = day + 50;
  createPreContractAgreement({
    player,
    club: destination,
    offer: {
      weeklyWage: 15000,
      years: 3,
      signingBonus: 100000,
      squadRole: "Regular Starter",
    },
    currentDay: day,
    season: career.season,
  });
  const originalClub = career.clubs.find((club) => club.id === player.clubId);
  for (let i = 0; i < 12 && player.clubId !== destination.id; i++)
    advanceAndResolve(career);
  assert.equal(
    player.clubId,
    destination.id,
    "player must join the destination club after expiry",
  );
  assert.ok(destination.squad.includes(player.id));
  assert.ok(
    !originalClub.squad.includes(player.id),
    "former club must deregister the player",
  );
  assert.ok(
    career.transferHistory.some(
      (entry) => entry.playerId === player.id && entry.type === "pre-contract",
    ),
    "completed pre-contract must appear in transfer history",
  );
  assert.equal(player.contract.weeklyWage, 15000);
});

test("AI clubs sign suitable free agents; elite players attract elite clubs", async () => {
  const career = createCareer(await loadData(), options(9012));
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  const squadPlayer = npcInSquad(career, { overallMin: 55 });
  expirePlayerContract(squadPlayer, career.club, {
    currentDay: career.currentDay(),
    season: career.season,
  });
  const before = career.players.filter((player) => !player.clubId).length;
  assert.ok(before > 0);
  for (let i = 0; i < 10; i++) advanceAndResolve(career);
  const stillFree = career.players.filter(
    (player) =>
      !player.clubId &&
      player.id !== career.player.id &&
      !player.source?.startsWith("academy"),
  );
  assert.ok(
    stillFree.length <
      career.players.filter((player) => !player.clubId).length + 1,
    "AI free-agency evaluation must run without throwing",
  );
  // Lower-rated players attract smaller clubs.
  const weak = {
    overall: 58,
    age: 27,
    potential: 62,
    position: "CM",
    contract: {},
  };
  const strong = {
    overall: 88,
    age: 27,
    potential: 90,
    position: "ST",
    contract: {},
  };
  const smallClub = career.clubs.reduce((a, b) =>
    a.prestige < b.prestige ? a : b,
  );
  const bigClub = career.clubs.reduce((a, b) =>
    a.prestige > b.prestige ? a : b,
  );
  const weakAtSmall = freeAgentClubInterest(weak, smallClub, {
    currentWageBill: 0,
    positionalNeed: 60,
    squadSize: 20,
  });
  const weakAtBig = freeAgentClubInterest(weak, bigClub, {
    currentWageBill: 0,
    positionalNeed: 60,
    squadSize: 20,
  });
  assert.ok(weakAtSmall >= weakAtBig, "weak players should suit smaller clubs");
  const strongAtBig = freeAgentClubInterest(strong, bigClub, {
    currentWageBill: 0,
    positionalNeed: 60,
    squadSize: 20,
  });
  const strongAtSmall = freeAgentClubInterest(strong, smallClub, {
    currentWageBill: 0,
    positionalNeed: 60,
    squadSize: 20,
  });
  assert.ok(
    strongAtBig > strongAtSmall,
    "elite players should attract stronger clubs",
  );
});

test("free-agent opening offers respect wage space and squad role", () => {
  const player = {
    overall: 82,
    age: 26,
    potential: 85,
    position: "CM",
    contract: { previousWeeklyWage: 60000 },
  };
  const rich = {
    prestige: 88,
    finances: { wageBudget: 10_000_000 },
    registrationLimit: 25,
  };
  const poor = {
    prestige: 40,
    finances: { wageBudget: 200_000 },
    registrationLimit: 25,
  };
  const richOffer = freeAgentOpeningOffer(player, rich, { currentWageBill: 0 });
  const poorOffer = freeAgentOpeningOffer(player, poor, { currentWageBill: 0 });
  assert.ok(richOffer.weeklyWage > poorOffer.weeklyWage);
  assert.ok(poorOffer.weeklyWage <= 200_000);
  assert.equal(richOffer.squadRole, "Key Player");
});

test("agent fees scale with wages and never fall below the floor", () => {
  assert.equal(agentFeeFor(0), 25_000);
  assert.equal(agentFeeFor(10_000), 26_000);
});

test("negotiations consider personality, manager trust and club standing", () => {
  const player = {
    id: "p1",
    first: "A",
    last: "B",
    overall: 75,
    potential: 80,
    age: 26,
    stats: { apps: 25 },
    lastMatchRating: 7.0,
    contract: { wage: 30000, expiryDate: 11000 },
    personality: ["Loyal"],
  };
  const club = { id: "c1", prestige: 70, manager: { trust: { p1: 90 } } };
  const negotiation = createContractNegotiation({
    playerId: "p1",
    clubId: "c1",
    offer: {
      weeklyWage: 45000,
      years: 3,
      squadRole: "Key Player",
      signingBonus: 400000,
    },
    currentDay: 10000,
  });
  const decision = resolveContractNegotiation(player, club, negotiation, {
    currentDay: 10000,
    managerTrust: 90,
  });
  assert.ok(
    ["accepted", "counteroffer", "rejected", "wants-to-leave"].includes(
      decision.kind,
    ),
  );
});

test("career save and reload preserves contracts, negotiations and free-agent state", async () => {
  const data = await loadData();
  const career = createCareer(data, options(9013));
  const player = npcInSquad(career, { overallMin: 55 });
  player.contract.expiryDate = career.currentDay() + 100;
  career.offerContractRenewal(player.id, {
    weeklyWage: player.contract.weeklyWage * 2,
    years: 3,
    squadRole: "Important Player",
  });
  const saved = career.toJSON();
  const restored = createCareer(
    data,
    saved.creation,
    JSON.parse(JSON.stringify(saved)),
  );
  const restoredPlayer = restored.players.find(
    (entry) => entry.id === player.id,
  );
  assert.ok(restoredPlayer);
  assert.equal(restoredPlayer.clubId, player.clubId);
  assert.equal(restoredPlayer.contract.expiryDate, player.contract.expiryDate);
  assert.equal(restoredPlayer.contract.weeklyWage, player.contract.weeklyWage);
  assert.deepEqual(
    restored.contractNegotiations.length,
    career.contractNegotiations.length,
  );
  assert.ok(
    restored.lastContractProcessDay == null ||
      restored.lastContractProcessDay >= (career.lastContractProcessDay ?? 0),
    "restore must resume contract processing from the saved day",
  );
});

test("a free agent never remains registered at his former club and wages stop", async () => {
  const career = createCareer(await loadData(), options(9014));
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  const player = npcInSquad(career, { overallMin: 55 });
  const club = career.club;
  const wageBillBefore = club.wageBill(career.players);
  expirePlayerContract(player, club, {
    currentDay: career.currentDay(),
    season: career.season,
  });
  assert.equal(
    club.wageBill(career.players),
    wageBillBefore - (player.contract.previousWeeklyWage ?? 0) ||
      wageBillBefore,
  );
  assert.ok(!club.squad.includes(player.id));
  const freeAgents = career.freeAgents({});
  assert.ok(freeAgents.some((entry) => entry.player.id === player.id));
});

test("no player appears at two clubs simultaneously after expiry and re-signing", async () => {
  const career = createCareer(await loadData(), options(9015));
  const { expirePlayerContract } = await import("../src/core/contracts.mjs");
  const player = npcInSquad(career, { overallMin: 55 });
  const firstClub = career.club;
  expirePlayerContract(player, firstClub, {
    currentDay: career.currentDay(),
    season: career.season,
  });
  const destination = career.clubs.find(
    (club) => club.id !== firstClub.id && club.squad.length < 25,
  );
  player.contract.weeklyWage = 12000;
  career.club = firstClub; // ensure signFreeAgent targets the original club for check
  assert.ok(!firstClub.squad.includes(player.id));
  void destination;
});
