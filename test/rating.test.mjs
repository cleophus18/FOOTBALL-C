import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlayerOverall,
  createPlayer,
  generateAttributes,
  updatePlayerOverall,
  recordOverallChange,
} from "../src/model/player.mjs";
import { Rng } from "../src/core/rng.mjs";
import { formAdjustedOverall } from "../src/model/form.mjs";
import { primeProfileFor } from "../src/model/legends.mjs";
import { PERSONALITIES } from "../src/core/constants.mjs";

const attrs = Object.fromEntries([
  ["pace", 70], ["shooting", 70], ["passing", 70],
  ["dribbling", 70], ["defending", 70], ["physical", 70],
]);
const subAttrs = Object.fromEntries([
  ["acceleration", 70], ["sprintSpeed", 70], ["attackingPositioning", 70],
  ["finishing", 70], ["shotPower", 70], ["longShots", 70], ["volleys", 70],
  ["penalties", 70], ["vision", 70], ["crossing", 70], ["freeKickAccuracy", 70],
  ["shortPassing", 70], ["longPassing", 70], ["curve", 70], ["agility", 70],
  ["balance", 70], ["reactions", 70], ["ballControl", 70], ["dribbling", 70],
  ["composure", 70], ["defensiveAwareness", 70], ["interceptions", 70],
  ["headingAccuracy", 70], ["standingTackle", 70], ["slidingTackle", 70],
  ["jumping", 70], ["stamina", 70], ["strength", 70], ["aggression", 70],
]);

function player(position, overrides = {}) {
  return createPlayer({
    first: "Test",
    last: "Player",
    position,
    attrs: { ...attrs, ...(overrides.attrs ?? {}) },
    subAttrs: { ...subAttrs, ...(overrides.subAttrs ?? {}) },
    gkAttrs: overrides.gkAttrs,
    potential: overrides.potential ?? 95,
  });
}

test("players always receive a category-safe secondary position", () => {
  assert.deepEqual(player("ST").altPositions, ["LW"]);
  assert.deepEqual(player("CM").altPositions, ["DM"]);
  assert.deepEqual(player("CB").altPositions, ["LB"]);
  assert.deepEqual(player("GK").altPositions, ["GK"]);
});

test("players receive a valid personality by default", () => {
  for (const position of ["GK", "CB", "CM", "AM", "ST"]) {
    const candidate = player(position);
    assert.equal(candidate.personality.length, 1);
    assert.ok(PERSONALITIES.includes(candidate.personality[0]));
  }
});

test("identical attributes produce a deterministic OVR", () => {
  const left = player("CM");
  const right = player("CM");
  assert.equal(calculatePlayerOverall(left), calculatePlayerOverall(right));
});

test("generated strikers keep shooting within an overall-based ceiling", () => {
  for (const target of [70, 80, 85, 90, 95]) {
    const generated = generateAttributes(new Rng(target), "ST", target);
    const headroom = target >= 90 ? 5 : target >= 85 ? 3 : 2;
    assert.ok(generated.attrs.shooting <= target + headroom);
    assert.ok(generated.subAttrs.finishing <= target + headroom);
    assert.ok(
      Math.abs(calculatePlayerOverall({
        position: "ST",
        attrs: generated.attrs,
        subAttrs: generated.subAttrs,
      }) - target) <= 2,
    );
  }
});

test("position profiles produce different ratings and reward relevant attributes", () => {
  const defender = player("CB", {
    attrs: { defending: 90 },
    subAttrs: { defensiveAwareness: 90, standingTackle: 90 },
  });
  const striker = player("ST", {
    attrs: { shooting: 90 },
    subAttrs: { finishing: 90 },
  });
  assert.notEqual(calculatePlayerOverall(defender), calculatePlayerOverall(striker));
  const improved = player("ST", {
    attrs: { shooting: 99 },
    subAttrs: { finishing: 99 },
  });
  assert.ok(calculatePlayerOverall(improved) > calculatePlayerOverall(striker));
});

test("goalkeeper OVR uses goalkeeper-specific attributes", () => {
  const keeper = player("GK", {
    gkAttrs: { reflexes: 60, handling: 60, positioning: 60, kicking: 60 },
  });
  const improved = player("GK", {
    gkAttrs: { reflexes: 95, handling: 60, positioning: 60, kicking: 60 },
  });
  assert.ok(calculatePlayerOverall(improved) > calculatePlayerOverall(keeper));
});

test("potential is separate from current OVR and history records only real changes", () => {
  const candidate = player("CM", { potential: 92 });
  const initial = candidate.overall;
  assert.notEqual(initial, candidate.potential);
  updatePlayerOverall(candidate, "No-op");
  assert.equal(candidate.ratingHistory.length, 0);
  candidate.subAttrs.shortPassing = 99;
  candidate.attrs.passing = 99;
  updatePlayerOverall(candidate, "Training development");
  assert.equal(candidate.ratingHistory.length, 1);
  assert.equal(candidate.ratingHistory[0].previous, initial);
  assert.equal(candidate.ratingHistory[0].current, candidate.overall);
});

test("imported starting OVR is calibrated while attributes continue to drive development", () => {
  const imported = {
    source: "real-world",
    position: "ST",
    overall: 80,
    potential: 85,
    attrs: { pace: 80, shooting: 84, passing: 68, dribbling: 78, defending: 42, physical: 76 },
  };
  imported.overallAdjustment =
    imported.overall -
    calculatePlayerOverall({
      ...imported,
      source: null,
      overallAdjustment: 0,
    });

  assert.equal(calculatePlayerOverall(imported), 80);
  imported.attrs.shooting = 99;
  const result = updatePlayerOverall(imported, "Training development", {
    ceiling: imported.potential,
  });
  assert.ok(result.current > 80);
  assert.ok(result.current <= imported.potential);
});

test("secondary positions receive a small suitability adjustment", () => {
  const candidate = player("ST");
  candidate.altPositions = ["LW"];
  const primary = calculatePlayerOverall(candidate, "ST");
  const secondary = calculatePlayerOverall(candidate, "LW");
  assert.equal(primary - secondary, 1);
});

test("career-player form remains a temporary boost within the same ceiling", () => {
  const candidate = player("ST", { potential: 92 });
  candidate.isUser = true;
  candidate.overall = 88;
  candidate.form = 100;
  assert.equal(candidate.potential, 92);
  assert.equal(formAdjustedOverall(candidate), 92);
});

test("non-career players remain capped by potential when in excellent form", () => {
  const candidate = player("ST", { potential: 92 });
  candidate.overall = 90;
  candidate.form = 100;
  assert.equal(formAdjustedOverall(candidate), 92);
});

test("Messi and Ronaldo no longer receive fixed legend production profiles", () => {
  assert.equal(
    primeProfileFor({ isLegend: true, first: "Lionel", last: "Messi" }),
    null,
  );
  assert.equal(
    primeProfileFor({ isLegend: true, first: "Cristiano", last: "Ronaldo" }),
    null,
  );
});

test("NPC overall changes are recorded in rating history", () => {
  const npc = { overall: 70, ratingHistory: [] };
  recordOverallChange(npc, 72, "Season development", { season: 2027 });
  assert.deepEqual(npc.ratingHistory[0], {
    previous: 70,
    current: 72,
    change: 2,
    reason: "Season development",
    season: 2027,
    date: null,
  });
});
