import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureStamina,
  staminaPerformanceFactor,
  applyMatchStamina,
  applyStaminaRecovery,
} from "../src/model/stamina.mjs";
import { seedPlayStyles } from "../src/model/playstyles.mjs";
import { injuryRiskMultiplier, matchInjuryChance } from "../src/sim/injury.mjs";

test("stamina migrates legacy fatigue and stays 0-100", () => {
  const player = { fatigue: 30, fitness: 100, position: "CM", attrs: { stamina: 70, physical: 70 } };
  assert.equal(ensureStamina(player), 70);
  player.stamina = 120;
  assert.equal(ensureStamina(player), 100);
  player.stamina = -5;
  assert.equal(ensureStamina(player), 0);
});

test("stamina loss, fatigue and recovery remain bounded", () => {
  const player = { stamina: 100, fatigue: 0, position: "CM", attrs: { stamina: 60, physical: 60 } };
  applyMatchStamina(player, 90, 1);
  assert.ok(player.stamina >= 0 && player.stamina <= 100);
  assert.equal(player.fatigue, 100 - player.stamina);
  const before = player.stamina;
  applyStaminaRecovery(player, 7, 1, 1);
  assert.ok(player.stamina > before);
  assert.ok(Math.abs(staminaPerformanceFactor({ stamina: 20 }) - 0.82) < 0.001);
});

test("stamina loss scales with actual match minutes", () => {
  const substitute = {
    stamina: 100,
    fatigue: 0,
    position: "CM",
    attrs: { stamina: 60, physical: 60 },
  };
  const starter = { ...substitute, stamina: 100, fatigue: 0 };
  applyMatchStamina(substitute, 45, 1);
  applyMatchStamina(starter, 90, 1);
  assert.ok(substitute.stamina > starter.stamina);
  assert.equal(substitute.fatigue, 100 - substitute.stamina);
});

test("low stamina raises injury risk but Endurance Engine reduces it", () => {
  const base = {
    stamina: 25,
    fatigue: 75,
    fitness: 100,
    position: "CM",
    attrs: { physical: 70, stamina: 70 },
    traits: [],
    playStyles: { unlocked: [], progress: {}, history: [] },
  };
  const high = { ...base, stamina: 90, fatigue: 10 };
  assert.ok(injuryRiskMultiplier(base) > injuryRiskMultiplier(high));

  const engine = {
    ...base,
    first: "Declan",
    last: "Rice",
    isLegend: false,
    playStyles: { unlocked: [], progress: {}, history: [] },
  };
  seedPlayStyles(engine);
  assert.ok(engine.playStyles.unlocked.some((badge) => badge.id === "engine"));
  assert.ok(
    injuryRiskMultiplier(engine) < injuryRiskMultiplier(base),
    "Endurance Engine players should resist low-stamina injury risk",
  );
  assert.ok(matchInjuryChance(base) > matchInjuryChance(high));
});
