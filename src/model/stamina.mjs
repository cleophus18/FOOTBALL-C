import { clamp } from "../core/util.mjs";
import { playStyleEffect } from "./playstyles.mjs";

export function ensureStamina(player) {
  let outOfRange = false;
  if (Number.isFinite(player.stamina) && (player.stamina < 0 || player.stamina > 100)) {
    player.stamina = clamp(Math.round(player.stamina), 0, 100);
    outOfRange = true;
  } else if (!Number.isFinite(player.stamina)) {
    const fitness = Number.isFinite(player.fitness) ? player.fitness : 100;
    const legacyFatigue = Number(player.fatigue) || 0;
    player.stamina = clamp(Math.round(fitness * 0.72 + (100 - legacyFatigue) * 0.28), 0, 100);
  }
  const legacyFatigue = Number(player.fatigue) || 0;
  if (!outOfRange && legacyFatigue > 100 - player.stamina) {
    player.stamina = clamp(100 - legacyFatigue, 0, 100);
  }
  player.stamina = clamp(Math.round(player.stamina), 0, 100);
  return player.stamina;
}

export function staminaPerformanceFactor(player) {
  const stamina = ensureStamina(player);
  if (stamina >= 75) return 1;
  if (stamina >= 40) return clamp(0.97 - (75 - stamina) * 0.0012, 0.93, 0.97);
  return clamp(0.88 - (40 - stamina) * 0.003, 0.76, 0.88);
}

export function staminaMatchLoss(player, minutes = 90, intensity = 1) {
  ensureStamina(player);
  const attr = Number(player.attrs?.stamina) || 65;
  const physical = Number(player.attrs?.physical) || 65;
  const position =
    player.position === "GK" ? 0.7
      : ["CM", "CDM", "CAM", "RM", "LM", "WB", "LWB", "RWB"].includes(player.position) ? 1.12
      : 1;
  const resilience = clamp(1 - (attr - 50) * 0.004 - (physical - 50) * 0.001, 0.72, 1.18);
  const engineFactor = playStyleEffect(player, "stamina", {
    position: player.position,
    attribute: attr,
    suitability: 1,
  });
  return clamp((minutes / 90) * 14 * intensity * position * resilience * engineFactor, 0, 22);
}

export function applyMatchStamina(player, minutes = 90, intensity = 1) {
  const stamina = ensureStamina(player) - staminaMatchLoss(player, minutes, intensity);
  player.stamina = clamp(Math.round(stamina), 0, 100);
  player.fatigue = clamp(Math.round(100 - player.stamina), 0, 100);
  return player.stamina;
}

export function applyStaminaRecovery(player, restDays = 7, trainingIntensity = 1, medicalFactor = 1) {
  const stamina = ensureStamina(player);
  const naturalRecovery = 4 + clamp(restDays, 0, 7) * 2.1;
  const trainingCost = clamp((trainingIntensity - 1) * 8, -3, 8);
  const recovery = (naturalRecovery - trainingCost) * clamp(medicalFactor, 0.8, 1.25);
  player.stamina = clamp(Math.round(stamina + recovery), 0, 100);
  player.fatigue = clamp(Math.round(100 - player.stamina), 0, 100);
  return player.stamina;
}
