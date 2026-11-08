import { clamp } from "../core/util.mjs";
import { formAdjustedOverall, formOverallDelta } from "./form.mjs";

export const ELITE_OVERALL_THRESHOLD = 90;

function peakBoost(player, overall, potential) {
  return (
    potential >= 99 &&
    overall >= potential &&
    formOverallDelta(player) > 0 &&
    formAdjustedOverall(player) >= 99
  );
}

export function eliteProfileFor(player) {
  const overall = Number(player?.overall) || 0;
  if (overall < ELITE_OVERALL_THRESHOLD) return null;

  if (String(player?.position ?? "").toUpperCase() === "GK") {
    return {
      tier: "elite",
      goalMultiplier: 0.2,
      assistMultiplier: 0.2,
      ratingBonus: 0.18,
    };
  }

  const peak = peakBoost(player, overall, Number(player?.potential ?? overall));
  const highRating = clamp((overall - ELITE_OVERALL_THRESHOLD) / 9, 0, 1);
  return {
    tier: "elite",
    goalMultiplier: clamp(1 + highRating * 0.18 + (peak ? 0.24 : 0), 1, 1.42),
    assistMultiplier: clamp(
      1 + highRating * 0.12 + (peak ? 0.18 : 0),
      1,
      1.3,
    ),
    ratingBonus: 0.08 + highRating * 0.06,
  };
}

export const SPECIAL_ELITE_PROFILES = {};
