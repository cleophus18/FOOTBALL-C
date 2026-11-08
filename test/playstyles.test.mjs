import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYSTYLE_REGISTRY,
  playStyleEffect,
  ensurePlayStyles,
  awardPlayStyleEvidence,
} from "../src/model/playstyles.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { Rng } from "../src/core/rng.mjs";
import { simulatePlayerMatch } from "../src/sim/playermatch.mjs";

function player(position = "ST", badges = []) {
  const p = createPlayer({
    id: `test-${position}`,
    first: "Test",
    last: "Player",
    position,
    overall: 80,
    age: 24,
    potential: 90,
    attrs: {
      pace: 78,
      shooting: 84,
      passing: 80,
      dribbling: 82,
      defending: 70,
      physical: 75,
    },
    subAttrs: {
      longShots: 82,
      curve: 82,
      finishing: 84,
      stamina: 78,
      ballControl: 82,
    },
    gkAttrs:
      position === "GK"
        ? { reflexes: 82, handling: 80, positioning: 81, kicking: 75 }
        : {},
  });
  p.playStyles.unlocked = badges.map((id) => ({ id, tier: "standard" }));
  return p;
}

test("registry includes data definitions for every gameplay style and tiers", () => {
  assert.ok(Object.keys(PLAYSTYLE_REGISTRY).length >= 40);
  assert.ok(
    PLAYSTYLE_REGISTRY.longShot.effect.plus >
      PLAYSTYLE_REGISTRY.longShot.effect.standard,
  );
});

test("long-shot ability is contextual and plus remains probabilistic-strength, not certainty", () => {
  const specialist = player("ST", ["longShot"]);
  const effect = playStyleEffect(specialist, "longShot", {
    position: "ST",
    attribute: 85,
    suitability: 1,
  });
  assert.ok(effect > 1.05);
  assert.equal(
    playStyleEffect(specialist, "longShot", {
      position: "ST",
      attribute: 85,
      suitability: 0,
    }),
    1,
  );
  specialist.playStyles.unlocked[0].tier = "plus";
  assert.ok(
    playStyleEffect(specialist, "longShot", {
      position: "ST",
      attribute: 85,
      suitability: 1,
    }) > effect,
  );
  assert.ok(
    playStyleEffect(specialist, "longShot", {
      position: "ST",
      attribute: 48,
      suitability: 1,
      pressure: 1,
    }) < 1.3,
  );
});

test("finesse and other categories only influence matching match hooks", () => {
  const p = player("ST", ["finesseShot"]);
  assert.ok(
    playStyleEffect(p, "finesse", {
      position: "ST",
      attribute: 82,
      suitability: 1,
    }) > 1,
  );
  assert.equal(
    playStyleEffect(p, "tackle", {
      position: "ST",
      attribute: 82,
      suitability: 1,
    }),
    1,
  );
  const keeper = player("GK", ["quickReflexes"]);
  assert.ok(
    playStyleEffect(keeper, "reflex", {
      position: "GK",
      attribute: 82,
      suitability: 1,
    }) > 1,
  );
  assert.equal(
    playStyleEffect(keeper, "reflex", {
      position: "ST",
      attribute: 82,
      suitability: 1,
    }),
    1,
  );
});

test("match performance and passing styles enter normal simulation stats and evidence", () => {
  const p = player("CM", ["incisivePass", "tikiTaka"]);
  const match = {
    homeGoals: 0,
    awayGoals: 0,
    events: [],
    misc: [],
    home: {},
    away: {},
  };
  const result = simulatePlayerMatch({
    player: p,
    match,
    side: "home",
    opponents: [],
    rng: new Rng(712, "playstyle-test"),
    position: "CM",
    minutes: 90,
    role: "Balanced",
  });
  assert.ok(result.stats.passes > 0);
  assert.ok(result.stats.passesCompleted <= result.stats.passes);
  assert.ok(p.playStyles.progress.incisivePass >= 0);
  assert.ok(p.playStyles.progress.incissivePass === undefined);
});

test("valid repeated training/performance evidence unlocks and upgrades without duplicates", () => {
  const p = player("ST");
  p.overall = 82;
  const evidence = { longShot: 1 };
  awardPlayStyleEvidence(p, evidence, { age: 20, season: 1 });
  awardPlayStyleEvidence(p, evidence, { age: 20, season: 1 });
  const unlocked = awardPlayStyleEvidence(p, evidence, { age: 20, season: 1 });
  assert.ok(unlocked.includes("longShot"));
  for (let index = 0; index < 12; index++)
    awardPlayStyleEvidence(p, evidence, { age: 20, season: 2 });
  assert.equal(
    p.playStyles.unlocked.filter((badge) => badge.id === "longShot").length,
    1,
  );
  assert.equal(
    p.playStyles.unlocked.find((badge) => badge.id === "longShot").tier,
    "plus",
  );
  ensurePlayStyles(p);
  assert.equal(
    p.playStyles.unlocked.length,
    new Set(p.playStyles.unlocked.map((badge) => badge.id)).size,
  );
});

test("legacy playstyle arrays migrate safely and legends receive no progression", () => {
  const p = {
    isLegend: true,
    position: "ST",
    overall: 95,
    playStyles: ["longShot"],
  };
  ensurePlayStyles(p);
  assert.equal(p.playStyles.unlocked[0].id, "longShot");
  assert.deepEqual(
    awardPlayStyleEvidence(p, { longShot: 100 }, { age: 25 }),
    [],
  );
  assert.equal(p.overall, 95);
});
