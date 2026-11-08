import test from "node:test";
import assert from "node:assert/strict";
import {
  ELITE_OVERALL_THRESHOLD,
  eliteProfileFor,
} from "../src/model/elite.mjs";

test("high-overall scorers receive stronger production multipliers", () => {
  const atThreshold = eliteProfileFor({
    position: "CM",
    overall: ELITE_OVERALL_THRESHOLD,
    potential: 95,
  });
  const nearMaximum = eliteProfileFor({
    position: "CM",
    overall: 99,
    potential: 99,
    form: 50,
  });

  assert.equal(atThreshold.goalMultiplier, 1);
  assert.ok(nearMaximum.goalMultiplier > atThreshold.goalMultiplier);
  assert.ok(nearMaximum.assistMultiplier > atThreshold.assistMultiplier);
});

test("only a fully developed, form-boosted 99 OVR receives peak production", () => {
  const developed = eliteProfileFor({
    position: "ST",
    overall: 99,
    potential: 99,
    form: 100,
  });
  const notDeveloped = eliteProfileFor({
    position: "ST",
    overall: 94,
    potential: 99,
    form: 100,
  });

  assert.equal(developed.goalMultiplier, 1.42);
  assert.equal(developed.assistMultiplier, 1.3);
  assert.ok(developed.goalMultiplier > notDeveloped.goalMultiplier);
});

test("elite goalkeepers do not receive outfield scoring rates", () => {
  const profile = eliteProfileFor({
    position: "GK",
    overall: 95,
  });

  assert.equal(profile.goalMultiplier, 0.2);
  assert.equal(profile.assistMultiplier, 0.2);
});

test("Messi and Ronaldo use the same normal profile as any other high-rated player", () => {
  for (const [first, last, position] of [
    ["Lionel", "Messi", "RW"],
    ["Cristiano", "Ronaldo", "ST"],
  ]) {
    const profile = eliteProfileFor({
      first,
      last,
      position,
      overall: 94,
      potential: 99,
    });
    const generic = eliteProfileFor({
      first: "Generated",
      last: "Player",
      position,
      overall: 94,
      potential: 99,
    });

    assert.deepEqual(profile, generic);
    assert.ok(profile.goalMultiplier >= 1);
    assert.ok(profile.assistMultiplier >= 1);
  }
});
