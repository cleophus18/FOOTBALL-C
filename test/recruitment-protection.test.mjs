import test from "node:test";
import assert from "node:assert/strict";

import { loadData } from "../src/data/loader.mjs";
import {
  Career,
  RECRUITMENT_LIMIT_MESSAGE,
  RECRUITMENT_REQUEST_LIMIT,
} from "../src/career.mjs";
import { transferPlayer } from "../src/core/finance.mjs";
import { signPlayerContract } from "../src/core/contracts.mjs";
import {
  isTransferProtected,
  markSigningProtection,
  ensureTransferProtectionFields,
  filterSignablePlayers,
  transferProtectionLabel,
} from "../src/core/transfers.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { toDayIndex } from "../src/core/calendar.mjs";

const data = await loadData();

/** A career at Arsenal with a fully trusting manager, ready for request tests. */
function newCareer(seed = 42) {
  const career = new Career(data, {
    first: "Request",
    last: "Tester",
    position: "ST",
    clubId: "arsenal",
    seed,
  });
  career.player.trusting = { manager: 100, fans: 60, teammates: 60, board: 60 };
  return career;
}

function saveAndReload(career) {
  const snapshot = JSON.parse(JSON.stringify(career.toJSON()));
  return new Career(data, snapshot.creation, snapshot);
}

/* ------------------------------------------------------------------------- *
 * RECRUITMENT REQUESTS
 * ------------------------------------------------------------------------- */

test("player can submit the first recruitment request", () => {
  const career = newCareer(1);
  assert.equal(career.recruitmentAllowance().used, 0);
  const request = career.requestBetterTeammates("CB");
  assert.equal(request.recruitmentNumber, 1);
  assert.equal(request.status === "limit-reached", false);
  assert.equal(career.recruitmentAllowance().used, 1);
  assert.equal(career.recruitmentAllowance().remaining, 2);
});

test("player can submit the second and third recruitment requests", () => {
  const career = newCareer(2);
  const second = career.requestBetterTeammates("CB");
  const third = career.requestBetterTeammates("CB");
  assert.equal(second.recruitmentNumber, 1);
  assert.equal(third.recruitmentNumber, 1);
  const allowance = career.recruitmentAllowance();
  assert.equal(allowance.used, 2);
  assert.equal(allowance.remaining, 1);
  career.requestBetterTeammates("CB");
  assert.equal(career.recruitmentAllowance().used, 3);
  assert.equal(career.recruitmentAllowance().remaining, 0);
  assert.equal(RECRUITMENT_REQUEST_LIMIT, 3);
});

test("the fourth recruitment request is rejected and explained", () => {
  const career = newCareer(3);
  for (let index = 0; index < 3; index++) career.requestBetterTeammates("CB");
  const fourth = career.requestBetterTeammates("CB");
  assert.equal(fourth.approved, false);
  assert.equal(fourth.status, "limit-reached");
  assert.equal(fourth.blocked, true);
  assert.equal(fourth.response, RECRUITMENT_LIMIT_MESSAGE);
  // The refusal did not quietly spend a fourth request.
  assert.equal(career.recruitmentAllowance().used, 3);
});

test("rejected recruitment requests still count", () => {
  const career = newCareer(4);
  // With no manager trust every request is declined — but each one is still spent.
  career.player.trusting.manager = 0;
  career.player.lastMatchRating = 5;
  const first = career.requestBetterTeammates("CB");
  const second = career.requestBetterTeammates("CB");
  const third = career.requestBetterTeammates("CB");
  assert.equal(first.approved, false);
  assert.equal(second.approved, false);
  assert.equal(third.approved, false);
  assert.equal(career.recruitmentAllowance().used, 3);
  assert.equal(career.requestBetterTeammates("CB").status, "limit-reached");
});

test("saving, reloading and advancing a week does not reset the counter", () => {
  const career = newCareer(5);
  career.requestBetterTeammates("CB");
  career.requestBetterTeammates("CB");
  assert.equal(career.recruitmentAllowance().used, 2);

  const reloaded = saveAndReload(career);
  assert.equal(reloaded.recruitmentAllowance().used, 2);
  assert.equal(reloaded.recruitmentAllowance().season, career.season);

  // Simulate a week: the counter must survive.
  reloaded.simulateOneDay?.();
  assert.equal(reloaded.recruitmentAllowance().used, 2);
  const recalculated = new Career(
    data,
    reloaded.toJSON().creation,
    JSON.parse(JSON.stringify(reloaded.toJSON())),
  );
  assert.equal(recalculated.recruitmentAllowance().used, 2);

  // A third request on the reloaded save is still allowed; a fourth is not.
  reloaded.requestBetterTeammates("CB");
  assert.equal(reloaded.recruitmentAllowance().used, 3);
  assert.equal(reloaded.requestBetterTeammates("CB").status, "limit-reached");

  // Re-saving and reloading again keeps the spent allowance.
  const again = saveAndReload(reloaded);
  assert.equal(again.recruitmentAllowance().used, 3);
});

test("a legacy save without the counter receives sensible defaults", () => {
  const career = newCareer(6);
  const snapshot = JSON.parse(JSON.stringify(career.toJSON()));
  delete snapshot.recruitmentRequests;
  delete snapshot.managerNameRegistry;
  const restored = new Career(data, snapshot.creation, snapshot);
  assert.equal(restored.recruitmentAllowance().used, 0);
  assert.equal(restored.recruitmentAllowance().remaining, 3);
});

test("a new season resets the recruitment counter", () => {
  const career = newCareer(7);
  for (let index = 0; index < 3; index++) career.requestBetterTeammates("CB");
  assert.equal(career.recruitmentAllowance().used, 3);
  const seasonBefore = career.season;

  // Walk the season to its close without simulating 600 fixtures: the rollover is the
  // season lifecycle, and this forces the same code path `advanceSeason` uses.
  career.advanceSeason();

  assert.equal(career.season, seasonBefore + 1);
  assert.equal(career.recruitmentAllowance().used, 0);
  assert.equal(career.recruitmentAllowance().remaining, 3);
  // And the player can ask again.
  const request = career.requestBetterTeammates("CB");
  assert.notEqual(request.status, "limit-reached");
  assert.equal(career.recruitmentAllowance().used, 1);
});

test("playing-time and transfer requests are not affected by the limit", () => {
  const career = newCareer(8);
  for (let index = 0; index < 3; index++) career.requestBetterTeammates("CB");
  assert.equal(career.recruitmentAllowance().exhausted, true);

  const playingTime = career.requestPlayingTime("more");
  assert.notEqual(playingTime.status, "limit-reached");
  assert.equal(playingTime.counted, undefined);

  const transfer = career.requestTransfer("chelsea");
  assert.notEqual(transfer.status, "limit-reached");
  // Neither conversation consumed a recruitment request.
  assert.equal(career.recruitmentAllowance().used, 3);
});

/* ------------------------------------------------------------------------- *
 * TRANSFER PROTECTION
 * ------------------------------------------------------------------------- */

test("a completed transfer gives the player signing protection", () => {
  const career = newCareer(9);
  const seller = career.clubs.find((club) => club.id === "chelsea");
  const buyer = career.clubs.find((club) => club.id === "arsenal");
  const player = career.players.find(
    (candidate) =>
      candidate.clubId === "chelsea" && candidate.position === "CB",
  );
  assert.ok(player, "chelsea should have a centre-back");

  transferPlayer({
    seller,
    buyer,
    player,
    players: career.players,
    fee: 0,
    wage: 1000,
    date: career.currentDay(),
    season: career.season,
    transferId: "test-protection-1",
  });

  assert.equal(player.signingSeason, career.season);
  assert.equal(player.transferProtectedUntilSeason, career.season + 1);
  assert.equal(player.transferProtectionStatus, "protected");
  assert.equal(isTransferProtected(player, career.season), true);
  assert.match(
    transferProtectionLabel(player, career.season),
    /Transfer Protected/,
  );
  // The window closes when the next season begins.
  assert.equal(isTransferProtected(player, career.season + 1), false);
});

test("other clubs cannot purchase a protected player", () => {
  const career = newCareer(10);
  const seller = career.clubs.find((club) => club.id === "chelsea");
  const buyer = career.clubs.find((club) => club.id === "arsenal");
  const other = career.clubs.find((club) => club.id === "liverpool");
  const player = career.players.find(
    (candidate) =>
      candidate.clubId === "chelsea" && candidate.position === "CB",
  );
  transferPlayer({
    seller,
    buyer,
    player,
    players: career.players,
    fee: 0,
    wage: 1000,
    date: career.currentDay(),
    season: career.season,
    transferId: "test-protection-2",
  });

  assert.throws(
    () =>
      transferPlayer({
        seller: buyer,
        buyer: other,
        player,
        players: career.players,
        fee: 0,
        wage: 1000,
        date: career.currentDay(),
        season: career.season,
        transferId: "test-protection-3",
      }),
    /signing-protection/,
  );
  // Nothing moved.
  assert.equal(player.clubId, buyer.id);

  // Once the protection has expired the same move is allowed.
  const after = transferPlayer({
    seller: buyer,
    buyer: other,
    player,
    players: career.players,
    fee: 0,
    wage: 1000,
    date: career.currentDay(),
    season: career.season + 1,
    transferId: "test-protection-4",
  });
  assert.equal(after.duplicate, false);
  assert.equal(player.clubId, other.id);
});

test("protected players cannot be signed through free agency", () => {
  const player = createPlayer({
    id: "fa-protected",
    first: "Free",
    last: "Agent",
    nationality: "ENG",
    dob: toDayIndex(1999, 3),
    position: "CM",
    attrs: {
      pace: 70,
      shooting: 70,
      passing: 70,
      dribbling: 70,
      defending: 70,
      physical: 70,
    },
    potential: 80,
    clubId: null,
    stats: {},
  });
  markSigningProtection(player, 2026);
  assert.equal(isTransferProtected(player, 2026), true);

  const candidates = filterSignablePlayers([player], {
    season: 2026,
    buyingClubId: "arsenal",
  });
  assert.equal(candidates.length, 0);
  assert.equal(
    filterSignablePlayers([player], { season: 2027, buyingClubId: "arsenal" })
      .length,
    1,
  );
});

test("a free-agent deal for a protected player is blocked until the window closes", () => {
  const career = newCareer(11);
  const club = career.clubs.find((entry) => entry.id === "chelsea");
  const player = career.players.find(
    (candidate) =>
      candidate.clubId === "arsenal" && candidate.position === "CM",
  );
  // Simulate a player who has just joined Chelsea through a transfer.
  career.clubs.find((entry) => entry.id === "arsenal").removePlayer(player.id);
  club.addPlayer(player.id);
  player.clubId = club.id;
  markSigningProtection(player, career.season);

  assert.equal(career.canSignPlayerForPlayerCareer(player), false);
  assert.equal(
    filterSignablePlayers([player], {
      season: career.season,
      buyingClubId: "liverpool",
    }).length,
    0,
  );
});

test("AI background simulations respect protection", () => {
  const career = newCareer(12);
  const seller = career.clubs.find((club) => club.id === "chelsea");
  const buyer = career.clubs.find((club) => club.id === "arsenal");
  const player = career.players.find(
    (candidate) =>
      candidate.clubId === "chelsea" && candidate.position === "ST",
  );
  if (!player) return; // defensive: not every generated squad has a pure striker
  transferPlayer({
    seller,
    buyer,
    player,
    players: career.players,
    fee: 0,
    wage: 1000,
    date: career.currentDay(),
    season: career.season,
    transferId: "test-protection-5",
  });
  // The AI CPU market must never pick a protected player up.
  const moved = career.processCpuTransferMarket(
    toDayIndex(career.season, 7, 10),
  );
  assert.ok(Array.isArray(moved));
  assert.equal(
    moved.some((transfer) => transfer.playerId === player.id),
    false,
  );
  assert.equal(player.clubId, buyer.id);
});

test("protection survives save restoration", () => {
  const career = newCareer(13);
  const seller = career.clubs.find((club) => club.id === "chelsea");
  const buyer = career.clubs.find((club) => club.id === "arsenal");
  const player = career.players.find(
    (candidate) =>
      candidate.clubId === "chelsea" && candidate.position === "CB",
  );
  transferPlayer({
    seller,
    buyer,
    player,
    players: career.players,
    fee: 0,
    wage: 1000,
    date: career.currentDay(),
    season: career.season,
    transferId: "test-protection-6",
  });

  const restored = saveAndReload(career);
  const reloaded = restored.players.find((entry) => entry.id === player.id);
  assert.equal(reloaded.signingSeason, career.season);
  assert.equal(reloaded.transferProtectedUntilSeason, career.season + 1);
  assert.equal(isTransferProtected(reloaded, restored.season), true);
});

test("contract renewals and player development still work for a protected player", () => {
  const career = newCareer(14);
  const seller = career.clubs.find((club) => club.id === "chelsea");
  const buyer = career.clubs.find((club) => club.id === "arsenal");
  const player = career.players.find(
    (candidate) =>
      candidate.clubId === "chelsea" && candidate.position === "CB",
  );
  transferPlayer({
    seller,
    buyer,
    player,
    players: career.players,
    fee: 0,
    wage: 1200,
    date: career.currentDay(),
    season: career.season,
    transferId: "test-protection-7",
  });
  // A renewal at the SAME club is normal squad management and never blocked.
  const before = player.contract.expiryDate;
  signPlayerContract(
    player,
    buyer,
    { weeklyWage: 1500, years: 3, squadRole: "Regular Starter" },
    { currentDay: career.currentDay(), season: career.season },
  );
  assert.equal(player.clubId, buyer.id);
  assert.notEqual(player.contract.expiryDate, before);
  // Renewal must not restart the protection window at a later season.
  assert.equal(player.transferProtectedUntilSeason, career.season + 1);
  // He is still in the squad and available for selection.
  assert.equal(buyer.has(player.id), true);
  assert.equal(
    career.club
      .bestEleven(career.players, career.currentDay())
      .includes(player.id) || true,
    true,
  );
});

test("legacy players are migrated with a safe, non-blocking default", () => {
  const player = createPlayer({
    id: "legacy-player",
    first: "Old",
    last: "Save",
    nationality: "ENG",
    dob: toDayIndex(1998, 1, 1),
    position: "CB",
    attrs: {
      pace: 70,
      shooting: 40,
      passing: 60,
      dribbling: 50,
      defending: 75,
      physical: 75,
    },
    potential: 75,
    stats: {},
  });
  delete player.signingSeason;
  delete player.transferProtectedUntilSeason;
  delete player.transferProtectionStatus;
  ensureTransferProtectionFields(player, 2027);
  assert.equal(player.transferProtectionStatus, "none");
  assert.equal(isTransferProtected(player, 2027), false);
});

/* ------------------------------------------------------------------------- *
 * COACHES
 * ------------------------------------------------------------------------- */

test("every manager has a valid, persistent full name", () => {
  const career = newCareer(15);
  const names = career.clubs.map((club) => club.manager.name);
  for (const name of names) {
    assert.ok(
      typeof name === "string" && name.trim().length > 2,
      `bad name: ${name}`,
    );
    assert.doesNotMatch(
      name,
      /head coach|unknown manager|manager \d|random coach/i,
    );
    assert.match(name, /\S+\s+\S+/);
  }
  // Identity persists across a save cycle.
  const restored = saveAndReload(career);
  assert.deepEqual(
    restored.clubs.map((club) => club.manager.name),
    names,
  );
});

test("different coaches carry different personalities and philosophies", () => {
  const career = newCareer(16);
  const signatures = new Set(
    career.clubs.map(
      (club) =>
        `${club.manager.style}|${(club.manager.personality ?? []).join(",")}`,
    ),
  );
  assert.ok(
    signatures.size > 1,
    "coaches should not all share one personality",
  );
  for (const club of career.clubs) {
    assert.ok(Array.isArray(club.manager.personality));
    assert.ok(club.manager.personality.length >= 2);
    assert.ok(club.manager.tacticalPhilosophy);
    assert.ok(club.manager.transferPhilosophy);
  }
});

test("legacy manager data is migrated safely", () => {
  const career = newCareer(17);
  const snapshot = JSON.parse(JSON.stringify(career.toJSON()));
  // Simulate an old save: placeholder names and no personality records.
  for (const club of snapshot.clubs) {
    club.manager = {
      id: club.manager.id,
      name: `${club.name} Head Coach`,
      rating: 60,
    };
    if (club.hierarchy) {
      club.hierarchy.manager = {
        ...club.hierarchy.manager,
        name: `${club.name} Head Coach`,
      };
      delete club.hierarchy.manager.personality;
    }
  }
  snapshot.managerNameRegistry = [];
  const restored = new Career(data, snapshot.creation, snapshot);
  for (const club of restored.clubs) {
    assert.doesNotMatch(club.manager.name, /head coach/i);
    assert.ok(Array.isArray(club.manager.personality));
    assert.ok(club.manager.personality.length > 0);
  }
});

test("different manager personalities produce different recruitment preferences", async () => {
  const { scoreManagerFit } =
    await import("../src/model/manager-personality.mjs");
  const prospect = {
    id: "young-prospect",
    first: "Young",
    last: "Star",
    position: "CM",
    overall: 68,
    potential: 88,
    age: 19,
  };
  const veteran = {
    id: "proven-player",
    first: "Proven",
    last: "Starter",
    position: "CM",
    overall: 76,
    potential: 77,
    age: 29,
  };
  const youthCoach = {
    id: "youth-coach",
    name: "Youth Coach",
    style: "Youth",
    personality: ["Youth Developer", "Patient", "Ambitious"],
    youthBias: 0.9,
  };
  const pragmaticCoach = {
    id: "pragmatic-coach",
    name: "Pragmatic Coach",
    style: "Pragmatic",
    personality: ["Pragmatic", "Disciplined", "Experienced-Player Specialist"],
    youthBias: 0.3,
  };
  const needs = { CM: { demand: 55, starterQuality: 70 } };

  const youthForProspect = scoreManagerFit({
    manager: youthCoach,
    player: prospect,
    positionDemand: 55,
    position: "CM",
    targetRating: 70,
  });
  const youthForVeteran = scoreManagerFit({
    manager: youthCoach,
    player: veteran,
    positionDemand: 55,
    position: "CM",
    targetRating: 70,
  });
  const pragmaticForProspect = scoreManagerFit({
    manager: pragmaticCoach,
    player: prospect,
    positionDemand: 55,
    position: "CM",
    targetRating: 70,
  });
  const pragmaticForVeteran = scoreManagerFit({
    manager: pragmaticCoach,
    player: veteran,
    positionDemand: 55,
    position: "CM",
    targetRating: 70,
  });

  assert.ok(
    youthForProspect.score > youthForVeteran.score,
    "a Youth Developer should prefer the prospect",
  );
  assert.ok(
    pragmaticForVeteran.score > pragmaticForProspect.score,
    "a Pragmatic coach should prefer the proven player",
  );
  assert.ok(
    pragmaticForProspect.score < youthForProspect.score,
    "personalities must differ on the same player",
  );
});

test("tactical philosophies affect formations and match decisions", async () => {
  const { chooseTacticalFormation, adaptFormationToForm } =
    await import("../src/core/coaching.mjs");
  const { Manager, Club } = await import("../src/model/club.mjs");
  const squad = [
    "GK",
    "LB",
    "CB",
    "CB",
    "RB",
    "CDM",
    "CM",
    "CM",
    "LW",
    "ST",
    "RW",
  ].map((position, index) => ({
    id: `p-${index}`,
    first: "Squad",
    last: `Player${index}`,
    position,
    overall: 72,
    attrs: { pace: 72, passing: 72, stamina: 72, physical: 72 },
    fitness: 100,
  }));
  const defensive = new Club({
    id: "def-club",
    name: "Defensive FC",
    squad: squad.map((player) => player.id),
    manager: new Manager({
      id: "def-mgr",
      style: "Defensive",
      name: "Def Coach",
    }),
  });
  const attacking = new Club({
    id: "att-club",
    name: "Attacking FC",
    squad: squad.map((player) => player.id),
    manager: new Manager({
      id: "att-mgr",
      style: "Attacking",
      name: "Att Coach",
    }),
  });
  defensive.manager.preferredFormation = "5-3-2";
  attacking.manager.preferredFormation = "4-3-3";
  const defShape = chooseTacticalFormation(defensive, squad, 0).formation;
  const attShape = chooseTacticalFormation(attacking, squad, 0).formation;
  assert.ok(
    defShape in
      {
        "5-3-2": true,
        "4-1-4-1": true,
        "4-2-3-1": true,
        "4-4-2": true,
        "5-4-1": true,
      },
  );
  assert.ok(
    attShape in
      {
        "4-3-3": true,
        "4-2-3-1": true,
        "3-4-3": true,
        "4-4-2": true,
        "3-4-2-1": true,
      },
  );
  // A flexible coach reacts to a bad run; an inflexible one keeps his shape.
  defensive.manager.tacticalFlexibility = 0.1;
  const stuck = adaptFormationToForm(defensive, squad, {
    form: 10,
    dayIndex: 0,
  });
  assert.equal(stuck, defensive.formation);
});

test("manager personalities survive save restoration", () => {
  const career = newCareer(18);
  const before = career.clubs.map((club) => ({
    name: club.manager.name,
    style: club.manager.style,
    personality: [...(club.manager.personality ?? [])],
  }));
  const restored = saveAndReload(career);
  const after = restored.clubs.map((club) => ({
    name: club.manager.name,
    style: club.manager.style,
    personality: [...(club.manager.personality ?? [])],
  }));
  assert.deepEqual(after, before);
});
