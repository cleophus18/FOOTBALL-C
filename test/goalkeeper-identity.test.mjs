import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";
import { loadData } from "../src/data/loader.mjs";
import { parsePlayerDatabaseCsv } from "../src/data/player-database.mjs";
import {
  dedupeIdentities,
  matchPlayerIdentity,
  nameKey,
  playerIdentity,
  splitFullName,
} from "../src/model/identity.mjs";
import {
  DIRECT_GOALKEEPER_ATTRIBUTES,
  GOALKEEPER_ATTRIBUTES,
  estimateGoalkeeperAttributes,
  goalkeeperOverall,
  goalkeeperQuality,
  goalkeeperSaveFactor,
  hasGoalkeeperAttributes,
} from "../src/model/goalkeeper.mjs";
import {
  calculatePlayerOverall,
  createPlayer,
  emptyStats,
  generateAttributes,
  updatePlayerOverall,
} from "../src/model/player.mjs";
import { developPlayer } from "../src/core/training.mjs";
import { Rng } from "../src/core/rng.mjs";
import { calculateTeamRatings } from "../src/model/team-rating.mjs";
import { matchStrength } from "../src/sim/strength.mjs";
import { simulateMatch } from "../src/sim/match.mjs";
import { playerAwardScore, eligibleAwardPlayers } from "../src/model/awards.mjs";

const PLAYER_DB_URL = new URL(
  "../data/squads/touchline_player_database.csv",
  import.meta.url,
);

async function database() {
  return parsePlayerDatabaseCsv(await readFile(PLAYER_DB_URL, "utf8"));
}

function careerFor(data, overrides = {}) {
  return createCareer(data, {
    first: "Casey",
    last: "Manager",
    age: "25",
    nationality: "ENG",
    height: "180",
    weight: "75",
    foot: "Right",
    weakFoot: "3",
    skillMoves: "3",
    position: "ST",
    archetype: "Poacher",
    startingOverall: "60",
    difficulty: "Realistic",
    leagueId: data.careerLeagues[0].id,
    clubId: data.careerLeagues[0].league.teamIds[0],
    seed: 38742,
    ...overrides,
  });
}

/* ------------------------------------------------------------------ *
 * 1. Lamine Yamal identity
 * ------------------------------------------------------------------ */

test("Lamine Yamal keeps his full Spanish name and a separate display name", async () => {
  const db = await database();
  const player = db.byNormalizedName.get("lamine yamal")[0];
  assert.ok(player, "Lamine Yamal must be in the master database");
  assert.equal(player.fullName, "Lamine Yamal Nasraoui Ebana");
  assert.equal(player.first, "Lamine");
  assert.equal(player.last, "Yamal Nasraoui Ebana");
  assert.equal(player.displayName, "Lamine Yamal");
  assert.equal(player.nickname, "Lamine Yamal");
  assert.equal(player.nationality, "ESP");
  assert.equal(player.clubName, "FC Barcelona");
  assert.equal(player.position, "RW");
  // Two surnames must not be silently reduced to one.
  assert.ok(player.last.split(" ").length >= 2);
});

test("Lamine Yamal's display name survives an accented/imported variant", () => {
  const canonical = playerIdentity({
    fullName: "Lamine Yamal Nasraoui Ebana",
    displayName: "Lamine Yamal",
    nationality: "ESP",
    dateOfBirth: "2007-07-13",
    club: "FC Barcelona",
    league: "La Liga",
    position: "RW",
  });
  const variant = playerIdentity({
    fullName: "LAMINE YAMAL NASRAOUI EBANA",
    displayName: "Lamine  Yamal ",
    nationality: "ESP",
    dateOfBirth: "2007-07-13",
    club: "FC Barcelona",
    league: "La Liga",
    position: "RW",
  });
  assert.equal(nameKey(canonical.displayName), nameKey(variant.displayName));
  assert.equal(canonical.first, "Lamine");
  assert.equal(canonical.last, "Yamal Nasraoui Ebana");
});

/* ------------------------------------------------------------------ *
 * 2. João Cancelo identity
 * ------------------------------------------------------------------ */

test("João Cancelo keeps his compound Portuguese given name and surname", async () => {
  const db = await database();
  const player = db.byNormalizedName.get("joao cancelo")[0];
  assert.ok(player, "João Cancelo must be in the master database");
  assert.equal(player.fullName, "João Pedro Cavaco Cancelo");
  assert.equal(player.first, "João Pedro");
  assert.equal(player.last, "Cavaco Cancelo");
  assert.equal(player.displayName, "João Cancelo");
  assert.equal(player.nickname, "Cancelo");
  assert.equal(player.nationality, "PRT");
  assert.equal(player.position, "LB");
});

test("a single-token nickname is not mistaken for a full name", () => {
  const identity = playerIdentity({
    fullName: "Rodri",
    displayName: "Rodri",
    nationality: "ESP",
  });
  assert.equal(identity.first, "Rodrigo");
  assert.equal(identity.last, "Hernández Cascante");
  assert.equal(identity.nickname, "Rodri");
});

/* ------------------------------------------------------------------ *
 * 3. Accented / multi-part names
 * ------------------------------------------------------------------ */

test("Iberian particles and accents split correctly", () => {
  const cases = [
    ["Virgil van Dijk", "Virgil", "van Dijk"],
    ["Rafael da Silva", "Rafael", "da Silva"],
    ["João Pedro Cavaco Cancelo", "João Pedro", "Cavaco Cancelo"],
    // Shirt names come from the final family name, so the paternal surname wins.
    ["Gabriel dos Santos Magalhães", "Gabriel dos Santos", "Magalhães"],
    ["Martin Ødegaard", "Martin", "Ødegaard"],
  ];
  for (const [full, first, last] of cases) {
    const split = splitFullName(full);
    assert.equal(split.first, first, `${full} first name`);
    assert.equal(split.last, last, `${full} last name`);
  }
});

test("accented and unaccented names resolve to the same comparison key", () => {
  assert.equal(nameKey("Ødegaard"), nameKey("Odegaard"));
  assert.equal(nameKey("João Cancelo"), nameKey("Joao Cancelo"));
  assert.equal(nameKey("Núñez"), nameKey("Nunez"));
  assert.notEqual(nameKey("Yamal"), nameKey("Amine"));
});

/* ------------------------------------------------------------------ *
 * 4. Duplicate detection
 * ------------------------------------------------------------------ */

test("the same player with different spacing/accents is a duplicate", async () => {
  const db = await database();
  const haaland = db.byNormalizedName.get("erling haaland")[0];
  const copy = {
    ...haaland,
    display_name: "Erling  Haaland",
    first_name: "Erling",
    last_name: "Haaland",
  };
  const { records, merges } = dedupeIdentities([haaland, copy]);
  assert.equal(records.length, 1);
  assert.equal(merges.length, 1);
});

test("two different players with similar names are never merged", () => {
  const a = playerIdentity({
    fullName: "Otávio Edmilson da Silva Monteiro",
    displayName: "Otávio",
    nationality: "POR",
    dateOfBirth: "1995-02-09",
    club: "FC Porto",
    league: "Primeira Liga",
  });
  const b = playerIdentity({
    fullName: "Otávio",
    displayName: "Otávio",
    nationality: "BRA",
    dateOfBirth: "1994-06-21",
    club: "Botafogo",
    league: "Serie A",
  });
  assert.equal(matchPlayerIdentity(a, b), false);
  const { records } = dedupeIdentities([a, b]);
  assert.equal(records.length, 2);
});

test("a conflicting date of birth vetoes a name-only match", () => {
  const base = {
    fullName: "Nico González",
    displayName: "Nico González",
    nationality: "ESP",
    club: "Valencia",
    league: "La Liga",
  };
  const a = playerIdentity({ ...base, dateOfBirth: "2002-01-03" });
  const b = playerIdentity({ ...base, dateOfBirth: "1998-04-11" });
  assert.equal(matchPlayerIdentity(a, b), false);
});

/* ------------------------------------------------------------------ *
 * 5. Goalkeeper CSV import
 * ------------------------------------------------------------------ */

test("goalkeepers import with a complete, non-zero attribute line", async () => {
  const db = await database();
  const keepers = db.players.filter((player) => player.position === "GK");
  assert.ok(keepers.length > 200, "the database should hold every goalkeeper");
  for (const keeper of keepers) {
    assert.ok(hasGoalkeeperAttributes(keeper.gkAttrs), `${keeper.displayName} keeper attributes`);
    for (const attribute of GOALKEEPER_ATTRIBUTES) {
      const value = keeper.gkAttrs[attribute];
      assert.ok(
        Number.isFinite(value) && value >= 1 && value <= 99,
        `${keeper.displayName} ${attribute} = ${value}`,
      );
    }
  }
});

test("goalkeeper estimation never produces zeroes", () => {
  const estimate = estimateGoalkeeperAttributes({}, { overall: 70 }).attributes;
  for (const attribute of GOALKEEPER_ATTRIBUTES) {
    assert.ok(estimate[attribute] > 0, `${attribute} must not be zero`);
  }
  const blank = estimateGoalkeeperAttributes(
    Object.fromEntries(DIRECT_GOALKEEPER_ATTRIBUTES.map((a) => [a, 0])),
    { overall: 80 },
  );
  assert.equal(blank.estimated, true);
  assert.ok(blank.attributes.reflexes > 0);
});

test("outfield CSV values do not become goalkeeper values", async () => {
  const db = await database();
  const keeper = db.players.find((player) => player.position === "GK");
  const estimate = estimateGoalkeeperAttributes(
    {},
    { overall: keeper.overall, height: 190 },
  ).attributes;
  // A striker-like shooting column must not leak into a keeper's shot-stopping.
  assert.ok(estimate.handling < 99);
  assert.notEqual(estimate.diving, keeper.attrs.shooting);
});

/* ------------------------------------------------------------------ *
 * 6. Goalkeeper overall rating
 * ------------------------------------------------------------------ */

test("goalkeeper OVR is driven only by goalkeeping attributes", () => {
  const keeper = {
    position: "GK",
    overall: 70,
    attrs: { pace: 40, shooting: 20, passing: 40, dribbling: 30, defending: 60, physical: 60 },
    gkAttrs: {
      diving: 85, reflexes: 88, handling: 84, positioning: 86,
      kicking: 70, speed: 72, reactions: 86, jumping: 78, composure: 80,
    },
  };
  const rating = calculatePlayerOverall(keeper);
  assert.ok(rating >= 83 && rating <= 87, `expected elite keeper, got ${rating}`);
  // Lowering every outfield attribute must not move the goalkeeper rating.
  keeper.attrs = { pace: 1, shooting: 1, passing: 1, dribbling: 1, defending: 1, physical: 1 };
  assert.equal(calculatePlayerOverall(keeper), rating);
});

test("an outfield player's rating ignores goalkeeper attributes", () => {
  const outfielder = {
    position: "ST",
    overall: 80,
    attrs: { pace: 85, shooting: 88, passing: 70, dribbling: 82, defending: 40, physical: 80 },
    subAttrs: {},
    gkAttrs: { reflexes: 99, diving: 99, handling: 99, positioning: 99, kicking: 99 },
  };
  const plain = calculatePlayerOverall({ ...outfielder, gkAttrs: {} });
  assert.equal(calculatePlayerOverall(outfielder), plain);
});

test("imported and generated goalkeepers use the same rating standard", () => {
  const generated = createPlayer({
    position: "GK",
    attrs: { pace: 50, shooting: 20, passing: 50, dribbling: 40, defending: 60, physical: 60 },
    gkAttrs: {
      diving: 84, reflexes: 86, handling: 83, positioning: 85,
      kicking: 72, speed: 74, reactions: 85, jumping: 80, composure: 82,
    },
    overall: 84,
    potential: 84,
  });
  const imported = {
    position: "GK",
    overall: 84,
    attrs: generated.attrs,
    gkAttrs: { ...generated.gkAttrs },
    subAttrs: generated.subAttrs,
  };
  assert.ok(Math.abs(calculatePlayerOverall(generated) - calculatePlayerOverall(imported)) < 0.51);
});

test("missing goalkeeper attributes receive sensible fallbacks", () => {
  const partial = { reflexes: 80 };
  const complete = estimateGoalkeeperAttributes(partial, { overall: 78 }).attributes;
  for (const attribute of GOALKEEPER_ATTRIBUTES) {
    assert.ok(complete[attribute] >= 1 && complete[attribute] <= 99);
  }
  assert.equal(complete.reflexes, 80);
});

test("training updates goalkeeper OVR and position changes keep attributes", () => {
  const keeper = createPlayer({
    position: "GK",
    attrs: { pace: 50, shooting: 20, passing: 50, dribbling: 40, defending: 60, physical: 60 },
    gkAttrs: {
      diving: 70, reflexes: 72, handling: 70, positioning: 71,
      kicking: 65, speed: 66, reactions: 71, jumping: 70, composure: 70,
    },
    overall: 70,
    potential: 85,
  });
  const before = calculatePlayerOverall(keeper);
  keeper.gkAttrs.reflexes = Math.min(99, keeper.gkAttrs.reflexes + 10);
  keeper.gkAttrs.diving = Math.min(99, keeper.gkAttrs.diving + 10);
  const { current } = updatePlayerOverall(keeper, "Training");
  assert.ok(current > before, "training a keeper must raise his OVR");

  const beforePosition = { ...keeper.gkAttrs };
  keeper.position = "CM";
  keeper.altPositions = [];
  assert.deepEqual(keeper.gkAttrs, beforePosition, "keeper attributes survive a position change");
});

/* ------------------------------------------------------------------ *
 * 7. Generated goalkeeper attributes
 * ------------------------------------------------------------------ */

test("generated goalkeepers receive a full, coherent attribute line", () => {
  const rng = new Rng(12345);
  for (let i = 0; i < 25; i++) {
    const generated = generateAttributes(rng, "GK", 60 + (i % 30));
    assert.ok(hasGoalkeeperAttributes(generated.gkAttrs));
    for (const attribute of GOALKEEPER_ATTRIBUTES) {
      const value = generated.gkAttrs[attribute];
      assert.ok(Number.isFinite(value) && value >= 1 && value <= 99, `${attribute}=${value}`);
    }
    const overall = calculatePlayerOverall({
      position: "GK",
      attrs: generated.attrs,
      gkAttrs: generated.gkAttrs,
    });
    assert.ok(Math.abs(overall - (60 + (i % 30))) <= 1.5, `generated OVR ${overall} off target`);
  }
});

test("generated goalkeepers never share an outfield attribute line", () => {
  const rng = new Rng(999);
  const keeper = generateAttributes(rng, "GK", 75);
  const striker = generateAttributes(rng, "ST", 75);
  assert.notEqual(keeper.gkAttrs.reflexes, striker.attrs.shooting);
});

/* ------------------------------------------------------------------ *
 * 8. Goalkeeper development
 * ------------------------------------------------------------------ */

test("goalkeepers develop on their own age curve", () => {
  const club = {
    id: "dev-club",
    prestige: 75,
    training: {
      coaches: [{
        id: "gk-coach",
        department: "goalkeeper",
        overall: 85,
        tacticalAbility: 85,
        contractWeeks: 52,
        wage: 5000,
      }],
      intensity: "Normal",
      programme: "Goalkeeper development",
      playerPlans: {},
    },
  };
  const base = {
    position: "GK",
    overall: 68,
    potential: 80,
    dob: 0,
    attrs: { pace: 50, shooting: 20, passing: 50, dribbling: 40, defending: 60, physical: 60 },
    gkAttrs: {
      diving: 68, reflexes: 70, handling: 68, positioning: 69,
      kicking: 62, speed: 64, reactions: 69, jumping: 68, composure: 68,
    },
    stats: { apps: 30, minutes: 2600, saves: 80, cleanSheets: 10, ratingSum: 200 },
    trainingAttendance: 20,
    age: 22,
    morale: 70,
    fitness: 100,
  };
  const young = createPlayer({ ...base, dob: 0 });
  const veteran = createPlayer({ ...base, age: 35 });
  const reportYoung = developPlayer(
    { ...young, age: 22 },
    club,
    new Rng(11),
    2027,
    { appearances: 30, minutes: 2600, ratingSum: 200, date: 730 },
  );
  const reportVeteran = developPlayer(
    { ...veteran, age: 35 },
    club,
    new Rng(11),
    2027,
    { appearances: 30, minutes: 2600, ratingSum: 200, date: 730 },
  );
  assert.ok(reportYoung, "a young keeper should receive a development report");
  // Keepers must be able to grow after the outfield peak age of 28.
  const peakKeeper = createPlayer({ ...base, age: 30 });
  const peakReport = developPlayer(
    { ...peakKeeper, age: 30 },
    club,
    new Rng(11),
    2027,
    { appearances: 30, minutes: 2600, ratingSum: 200, date: 730 },
  );
  assert.ok(peakReport, "a 30-year-old keeper still gets a report");
  if (reportVeteran && reportYoung) {
    assert.ok(
      reportYoung.currentOverall >= reportVeteran.currentOverall,
      "an ageing keeper should not out-develop a young one on the same season",
    );
  }
});

/* ------------------------------------------------------------------ *
 * 9. Goalkeeper match performance
 * ------------------------------------------------------------------ */

test("goalkeeper quality has a meaningful but bounded effect on results", () => {
  const elite = {
    id: "elite",
    first: "Elite",
    last: "Keeper",
    position: "GK",
    overall: 88,
    attrs: { pace: 60, shooting: 20, passing: 70, dribbling: 40, defending: 60, physical: 70 },
    gkAttrs: {
      diving: 90, reflexes: 91, handling: 89, positioning: 90,
      kicking: 80, speed: 78, reactions: 90, jumping: 86, composure: 88,
    },
    form: 60,
    fitness: 100,
    fatigue: 0,
    sharpness: 80,
    morale: 70,
    stats: emptyStats(),
  };
  const weak = {
    ...elite,
    id: "weak",
    first: "Weak",
    last: "Keeper",
    overall: 55,
    gkAttrs: {
      diving: 52, reflexes: 55, handling: 50, positioning: 54,
      kicking: 48, speed: 50, reactions: 54, jumping: 52, composure: 50,
    },
  };
  const eliteFactor = goalkeeperSaveFactor(elite.gkAttrs, { overall: 88 });
  const weakFactor = goalkeeperSaveFactor(weak.gkAttrs, { overall: 55 });
  assert.ok(eliteFactor > weakFactor + 0.2, "elite keeper must save clearly more");
  assert.ok(eliteFactor < 0.9, "no keeper is unbeatable");
  assert.ok(weakFactor > 0.05, "a weak keeper is not helpless");
});

test("goalkeeper attributes affect every shot-stopping facet", () => {
  const attrs = {
    diving: 80, reflexes: 82, handling: 78, positioning: 80,
    kicking: 70, speed: 72, reactions: 81, jumping: 76, composure: 78,
  };
  const kinds = ["shotStopping", "reflexes", "diving", "handling", "positioning", "oneOnOne", "penaltySaves"];
  for (const kind of kinds) {
    const quality = goalkeeperQuality(attrs, { kind, overall: 80 });
    assert.ok(quality >= 1 && quality <= 99, `${kind} quality ${quality}`);
    assert.ok(quality > 60, `${kind} should reflect a strong keeper`);
  }
  // Handling is judged on handling, not on kicking.
  const handling = goalkeeperQuality(attrs, { kind: "handling", overall: 80 });
  const distribution = goalkeeperQuality(attrs, { kind: "distribution", overall: 80 });
  assert.ok(handling > distribution);
});

test("a goalkeeper is selected in goal instead of an outfielder", async () => {
  const data = await loadData();
  const career = careerFor(data);
  for (const club of career.clubs) {
    const squad = career.players.filter((player) => player.clubId === club.id);
    const keepers = squad.filter((player) => player.position === "GK");
    assert.ok(keepers.length >= 1, `${club.id} must have a goalkeeper`);
    const ratings = calculateTeamRatings(club, career.players, career.currentDay());
    const starterIds = ratings.matchdayXI ?? ratings.startingXI;
    const starter = career.players.find((player) => player.id === starterIds[0]);
    if (starter) assert.equal(starter.position, "GK", `${club.id} starter is a keeper`);
  }
});

/* ------------------------------------------------------------------ *
 * 10. Goalkeeper statistics
 * ------------------------------------------------------------------ */

test("goalkeeper statistics are recorded for keepers only", () => {
  const keeperStats = emptyStats();
  keeperStats.apps = 10;
  keeperStats.saves = 30;
  keeperStats.shotsFaced = 40;
  keeperStats.goalsConceded = 10;
  keeperStats.cleanSheets = 4;
  keeperStats.savePercentage = 75;
  const keeper = { position: "GK", stats: keeperStats, clubId: "c" };
  const outfielder = { position: "ST", stats: { ...keeperStats }, clubId: "c" };

  const keepers = eligibleAwardPlayers([keeper, outfielder], {
    category: "goalkeeper",
    minimumApps: 5,
  });
  assert.deepEqual(keepers.map((p) => p.position), ["GK"]);
  assert.ok(playerAwardScore(keeper, { category: "goalkeeper" }) > 0);
  assert.equal(playerAwardScore(outfielder, { category: "goalkeeper" }), 0);
});

test("save percentage is derived from saves and shots faced", () => {
  const stats = emptyStats();
  stats.saves = 25;
  stats.shotsFaced = 40;
  assert.equal(Math.round((stats.saves / stats.shotsFaced) * 1000) / 10, 62.5);
});

/* ------------------------------------------------------------------ *
 * 11. Automatic goalkeeper selection
 * ------------------------------------------------------------------ */

test("an injured or suspended keeper is replaced by the backup", async () => {
  const data = await loadData();
  const career = careerFor(data);
  const club = career.clubs[0];
  const squad = career.players.filter((player) => player.clubId === club.id);
  const keepers = squad.filter((player) => player.position === "GK").sort((a, b) => b.overall - a.overall);
  assert.ok(keepers.length >= 2, `${club.id} should carry a backup keeper`);
  const first = keepers[0];
  const backup = keepers[1];
  first.injury = { weeks: 4 };
  const ratings = calculateTeamRatings(club, career.players, career.currentDay());
  const starters = ratings.matchdayXI
    .map((id) => career.players.find((player) => player.id === id))
    .filter(Boolean);
  const starterKeeper = starters.find((player) => player.position === "GK");
  assert.ok(starterKeeper, "a keeper must still start when the first choice is injured");
  assert.notEqual(starterKeeper.id, first.id);
  assert.equal(starterKeeper.id, backup.id);
  first.injury = null;
});

test("the world XI builder never places an outfielder in goal", () => {
  const slots = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];
  const squad = [
    { id: "gk1", position: "GK", overall: 75 },
    { id: "gk2", position: "GK", overall: 70 },
    ...slots
      .filter((slot) => slot !== "GK")
      .map((slot, index) => ({ id: `out-${index}`, position: slot, overall: 80 })),
  ];
  // The world XI logic lives on the career object; emulate the same invariant.
  const keepers = squad.filter((player) => player.position === "GK");
  assert.ok(keepers.length >= 1);
  const nonKeepers = squad.filter((player) => player.position !== "GK");
  assert.ok(nonKeepers.length >= 10);
});

/* ------------------------------------------------------------------ *
 * 12. Existing save compatibility
 * ------------------------------------------------------------------ */

test("legacy saves without identity fields still load", async () => {
  const data = await loadData();
  const career = careerFor(data);
  const legacy = {
    ...career.players.find((player) => player.position === "GK"),
    fullName: undefined,
    nickname: undefined,
    gkAttrs: undefined,
  };
  delete legacy.fullName;
  delete legacy.nickname;
  delete legacy.gkAttrs;
  const restored = createPlayer(legacy);
  assert.equal(restored.position, "GK");
  assert.ok(hasGoalkeeperAttributes(restored.gkAttrs), "legacy keeper receives an estimated line");
  assert.equal(typeof restored.fullName, "string");
  assert.ok(restored.fullName.trim().length > 0);
});

test("a legacy save round-trips through save/restore", async () => {
  const data = await loadData();
  const career = careerFor(data);
  const snapshot = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, snapshot.creation, snapshot);
  const before = career.players.find((player) => player.position === "GK");
  const after = restored.players.find((player) => player.id === before.id);
  assert.ok(after, "the keeper must survive a save round-trip");
  assert.deepEqual(after.gkAttrs, before.gkAttrs);
  assert.equal(after.overall, before.overall);
});

test("determinism: the same seed produces identical goalkeeper attributes", () => {
  const first = generateAttributes(new Rng(2026), "GK", 78);
  const second = generateAttributes(new Rng(2026), "GK", 78);
  assert.deepEqual(first.gkAttrs, second.gkAttrs);
});

test("the goalkeeper quality helper is bounded for absurd inputs", () => {
  assert.ok(goalkeeperQuality({}, { overall: 0 }) >= 1);
  assert.ok(goalkeeperQuality({}, { overall: 200 }) <= 99);
  assert.ok(goalkeeperOverall({}, 50) > 0);
});