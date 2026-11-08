/**
 * The Player model.
 *
 * The single most important design decision in this file: **overall rating is derived,
 * never stored.** A player's `overall` is a position-weighted blend of his attributes.
 * That means:
 *   - training an attribute always moves the rating the way a player would expect,
 *   - there is no way for `overall` and `attrs` to disagree,
 *   - and re-weighting a position (say, making modern full-backs more about pace) is a
 *     one-line data change rather than a re-balance of every stored rating.
 */

import {
  ALL_SUB_ATTRIBUTES,
  ATTRIBUTES,
  GK_ATTRIBUTES,
  SUB_ATTRIBUTES,
  SUB_ATTRIBUTE_GROUP,
  groupOf,
  normalizePosition,
  WORK_RATES,
  secondaryPositionFor,
} from "../core/constants.mjs";
import { attr as clampAttr, clamp, round } from "../core/util.mjs";
import { ageOn, toDayIndex } from "../core/calendar.mjs";
import { LEGEND_OVERALL } from "./legends.mjs";
import { ensurePlayStyles, seedPlayStyles } from "./playstyles.mjs";
import { ensureStamina, staminaPerformanceFactor } from "./stamina.mjs";

/* ------------------------------------------------------------------------- *
 * Physique
 *
 * Height and weight are not decoration: they decide how a player's body moves,
 * so they bend the group stats every time a player is built. The rules are the
 * ones every coach knows:
 *   - a heavy player carries weight into challenges (physical up) but loses a
 *     step and a lung (pace, stamina down),
 *   - a tall player wins headers and covers ground, but changes direction slowly,
 *   - a short player cannot out-jump a giant, but is balanced, agile and keeps
 *     the ball close to his feet,
 *   - a lean player is quicker and lasts longer, but gets brushed aside.
 * A "normal" build (about 180 cm and a 22.8 BMI) is neutral, so seeded squads
 * keep the shape they were generated with.
 * ------------------------------------------------------------------------- */

export const PHYSIQUE_BASELINE = {
  height: 180,
  weight: 75,
  bmi: 75 / 1.8 ** 2,
};

/**
 * How far a body deviates from the neutral build, as -1..1-ish numbers.
 * `mass` is body mass index (heavy vs lean), `stature` is height, `load` is the
 * total weight carried (mass x height), which is what a defender feels.
 */
export function physiqueFactors(height, weight) {
  const h = clamp(Number(height) || PHYSIQUE_BASELINE.height, 140, 220);
  const w = clamp(Number(weight) || PHYSIQUE_BASELINE.weight, 40, 140);
  const bmi = w / (h / 100) ** 2;
  const mass = clamp((bmi - PHYSIQUE_BASELINE.bmi) / 4.5, -1, 1);
  const stature = clamp((h - PHYSIQUE_BASELINE.height) / 20, -1, 1);
  const load = clamp(mass * 0.6 + stature * 0.55, -1, 1);
  return { height: h, weight: w, bmi: round(bmi, 1), mass, stature, load };
}

/** A readable build label, used by the profile and the creation screen. */
export function bodyBuild(height, weight) {
  const { bmi, stature } = physiqueFactors(height, weight);
  const mass = bmi < 20 ? "Lean" : bmi < 24 ? "Athletic" : bmi < 27 ? "Strong" : "Heavy";
  const frame = stature > 0.45 ? "tall" : stature < -0.45 ? "small" : "medium";
  return `${mass} · ${frame}`;
}

/**
 * The stat profile a body imposes. Multipliers are applied once, when the player
 * is created (and once more if his body is edited), so `overall` and the match
 * engine both see the same physical reality.
 *
 * Keepers are exempt from the outfield penalty on `pace` (they are judged on
 * their own weights) but still gain from reach.
 */
export function physiqueProfile(position, height, weight) {
  const { mass, stature, load } = physiqueFactors(height, weight);
  const reach = Math.max(0, stature);
  const small = Math.max(0, -stature);
  const lean = Math.max(0, -mass);
  const heavy = Math.max(0, mass);
  const pos = normalizePosition(position || "CM");

  // Group-stat multipliers.
  const attrs = {
    pace: 1 - heavy * 0.1 - small * 0.03 - reach * 0.05 + lean * 0.05,
    shooting: 1 - small * 0.05 + heavy * 0.02 + reach * 0.03,
    passing: 1 - heavy * 0.02 + small * 0.02,
    dribbling: 1 - heavy * 0.07 + small * 0.06 + lean * 0.04,
    defending: 1 - small * 0.02 + heavy * 0.02,
    physical: 1 + load * 0.1 + heavy * 0.04,
  };
  // A body can never make a keeper's distribution or reflexes worse than -8%.
  if (pos === "GK") attrs.pace = 1 - heavy * 0.04 + reach * 0.02;

  // Keeper-specific effects: reach is the keeper's biggest physical gift.
  const gkAttrs = {
    reflexes: 1 - heavy * 0.05 + small * 0.03,
    handling: 1 + heavy * 0.05 + reach * 0.03,
    positioning: 1 - small * 0.04 + reach * 0.04,
    kicking: 1 + reach * 0.04,
  };

  // Detailed layer, applied on top of the group-derived spread.
  const subAttrs = {
    acceleration: 1 - heavy * 0.13 + small * 0.07 + lean * 0.05,
    sprintSpeed: 1 - heavy * 0.12 + reach * 0.04 + lean * 0.05,
    agility: 1 - heavy * 0.14 + small * 0.1 + lean * 0.05,
    balance: 1 - reach * 0.1 + small * 0.05,
    jumping: 1 + reach * 0.2 - heavy * 0.08,
    headingAccuracy: 1 + reach * 0.16 - small * 0.04,
    strength: 1 + heavy * 0.16 + reach * 0.05,
    stamina: 1 - heavy * 0.13 + reach * 0.03 + lean * 0.04,
    aggression: 1 + heavy * 0.06,
    ballControl: 1 - heavy * 0.04 + small * 0.07 + lean * 0.03,
    dribbling: 1 - heavy * 0.06 + small * 0.07,
    composure: 1 - heavy * 0.02,
    reactions: 1 - heavy * 0.04 + small * 0.03,
    shotPower: 1 + heavy * 0.06 + reach * 0.02,
    freeKickAccuracy: 1 + small * 0.02,
    penalties: 1 + small * 0.02,
  };

  return { attrs, gkAttrs, subAttrs, factors: physiqueFactors(height, weight) };
}

/**
 * Apply the physique profile to a finished player object. Idempotent: it
 * records the body it was applied for, so calling it twice is a no-op.
 */
export function applyPhysique(player) {
  if (!player) return player;
  const body = `${player.height}|${player.weight}`;
  if (player.physiqueApplied === body) return player;
  const profile = physiqueProfile(player.position, player.height, player.weight);
  for (const [key, mult] of Object.entries(profile.attrs)) {
    if (player.attrs?.[key] == null) continue;
    player.attrs[key] = clampAttr(Math.round(player.attrs[key] * mult));
  }
  for (const [key, mult] of Object.entries(profile.gkAttrs)) {
    if (player.gkAttrs?.[key] == null) continue;
    player.gkAttrs[key] = clampAttr(Math.round(player.gkAttrs[key] * mult));
  }
  for (const [key, mult] of Object.entries(profile.subAttrs)) {
    if (player.subAttrs?.[key] == null) continue;
    player.subAttrs[key] = clampAttr(Math.round(player.subAttrs[key] * mult));
  }
  player.physiqueApplied = body;
  player.physique = profile.factors;
  player.overall = calculateOverall(player);
  return player;
}

/**
 * Give a generated player a believable body for his position. Tall players
 * gravitate to the spine (keeper, centre-back, striker), small ones to the
 * flanks and the number 10. Uses the caller's rng so seeded worlds stay stable.
 */
export function physicalProfileFor(rng, position) {
  const pos = normalizePosition(position || "CM");
  const ranges = {
    GK: [186, 198],
    CB: [183, 195],
    LB: [170, 182],
    RB: [170, 182],
    DM: [175, 188],
    CDM: [175, 188],
    CM: [172, 185],
    AM: [168, 180],
    CAM: [168, 180],
    LW: [167, 180],
    RW: [167, 180],
    ST: [175, 192],
  };
  const [minH, maxH] = ranges[pos] ?? [172, 185];
  const height = rng.int(minH, maxH);
  // Target a healthy, position-appropriate BMI: keepers and centre-backs heavier,
  // wingers and playmakers leaner.
  const bmiRange = {
    GK: [22.5, 24.5],
    CB: [22.5, 24.5],
    LB: [21, 23],
    RB: [21, 23],
    DM: [22, 24],
    CDM: [22, 24],
    CM: [21.5, 23.5],
    AM: [21, 23],
    CAM: [21, 23],
    LW: [20.5, 22.5],
    RW: [20.5, 22.5],
    ST: [22, 24],
  }[pos] ?? [21.5, 23.5];
  const bmi = rng.normal((bmiRange[0] + bmiRange[1]) / 2, 0.7);
  const weight = Math.round(
    clamp(bmi, bmiRange[0] - 0.6, bmiRange[1] + 0.6) * (height / 100) ** 2,
  );
  return { height, weight };
}

let __idCounter = 0;
export const nextPlayerId = (prefix = "p") =>
  `${prefix}${(__idCounter++).toString(36)}${Date.now().toString(36).slice(-4)}`;

/**
 * Position rating weights. Each row sums to 1 and says how much each of the six
 * outfield attributes contributes to playing that position well.
 *
 * These encode real football, not a spreadsheet: a Poacher's rating barely notices
 * `defending`, while a centre-back's is dominated by it.
 */
export const POSITION_WEIGHTS = {
  GK: {
    pace: 0.05,
    shooting: 0.0,
    passing: 0.1,
    dribbling: 0.05,
    defending: 0.2,
    physical: 0.2,
  },
  CB: {
    pace: 0.12,
    shooting: 0.02,
    passing: 0.1,
    dribbling: 0.06,
    defending: 0.45,
    physical: 0.25,
  },
  LB: {
    pace: 0.22,
    shooting: 0.04,
    passing: 0.16,
    dribbling: 0.14,
    defending: 0.3,
    physical: 0.14,
  },
  RB: {
    pace: 0.22,
    shooting: 0.04,
    passing: 0.16,
    dribbling: 0.14,
    defending: 0.3,
    physical: 0.14,
  },
  DM: {
    pace: 0.1,
    shooting: 0.06,
    passing: 0.22,
    dribbling: 0.12,
    defending: 0.3,
    physical: 0.2,
  },
  // CDM is the modern name for a defensive midfielder; identical weighting to DM.
  CDM: {
    pace: 0.1,
    shooting: 0.06,
    passing: 0.22,
    dribbling: 0.12,
    defending: 0.3,
    physical: 0.2,
  },
  CM: {
    pace: 0.12,
    shooting: 0.12,
    passing: 0.28,
    dribbling: 0.18,
    defending: 0.16,
    physical: 0.14,
  },
  AM: {
    pace: 0.14,
    shooting: 0.18,
    passing: 0.28,
    dribbling: 0.24,
    defending: 0.06,
    physical: 0.1,
  },
  // CAM is the modern name for an attacking midfielder; identical weighting to AM.
  CAM: {
    pace: 0.14,
    shooting: 0.18,
    passing: 0.28,
    dribbling: 0.24,
    defending: 0.06,
    physical: 0.1,
  },
  LW: {
    pace: 0.26,
    shooting: 0.18,
    passing: 0.16,
    dribbling: 0.26,
    defending: 0.04,
    physical: 0.1,
  },
  RW: {
    pace: 0.26,
    shooting: 0.18,
    passing: 0.16,
    dribbling: 0.26,
    defending: 0.04,
    physical: 0.1,
  },
  ST: {
    pace: 0.22,
    shooting: 0.34,
    passing: 0.1,
    dribbling: 0.16,
    defending: 0.02,
    physical: 0.16,
  },
};

const POSITION_SHIRT_NUMBERS = {
  GK: [1, 13, 22, 31],
  CB: [4, 5, 6, 15, 26],
  LB: [3, 12, 15, 21, 24],
  RB: [2, 12, 22, 23],
  DM: [6, 4, 14, 16],
  CDM: [6, 4, 14, 16],
  CM: [8, 6, 10, 18],
  AM: [10, 8, 20, 22],
  LW: [11, 7, 17, 19],
  RW: [7, 11, 17, 21],
  ST: [9, 10, 19, 20],
};

export function preferredShirtNumbers(position) {
  return POSITION_SHIRT_NUMBERS[normalizePosition(position)] ?? [8, 18, 20];
}

/**
 * Goalkeeper weighting separate from the outfield six, because a keeper's rating is
 * mostly about shot-stopping and command of his box, not pace or dribbling.
 * `defending`/`physical` still feed in lightly so a physically imposing keeper is
 * rewarded, which is how real scouting reports read.
 */
export const GK_WEIGHTS = {
  reflexes: 0.26,
  diving: 0.24,
  handling: 0.18,
  positioning: 0.16,
  kicking: 0.06,
  speed: 0.06,
  physical: 0.04,
};

/**
 * Individual attribute profiles used by the authoritative rating calculation.
 * The broad groups remain available for old saves and for the match engine, but
 * OVR is driven by the detailed football attributes whenever they are present.
 */
export const POSITION_ATTRIBUTE_WEIGHTS = {
  GK: {
    diving: 0.22, handling: 0.18, kicking: 0.08, reflexes: 0.24,
    positioning: 0.16, speed: 0.04, reactions: 0.04, composure: 0.04,
  },
  CB: {
    defensiveAwareness: 0.18, standingTackle: 0.14, slidingTackle: 0.08,
    interceptions: 0.14, strength: 0.1, jumping: 0.07, headingAccuracy: 0.08,
    reactions: 0.07, sprintSpeed: 0.05, acceleration: 0.03, composure: 0.06,
  },
  LB: {
    acceleration: 0.1, sprintSpeed: 0.12, stamina: 0.1, defensiveAwareness: 0.1,
    standingTackle: 0.08, interceptions: 0.06, crossing: 0.1, shortPassing: 0.08,
    agility: 0.07, positioning: 0.07, reactions: 0.06, dribbling: 0.06,
  },
  RB: {
    acceleration: 0.1, sprintSpeed: 0.12, stamina: 0.1, defensiveAwareness: 0.1,
    standingTackle: 0.08, interceptions: 0.06, crossing: 0.1, shortPassing: 0.08,
    agility: 0.07, positioning: 0.07, reactions: 0.06, dribbling: 0.06,
  },
  DM: {
    interceptions: 0.13, defensiveAwareness: 0.12, standingTackle: 0.08,
    shortPassing: 0.12, longPassing: 0.08, stamina: 0.1, strength: 0.08,
    reactions: 0.08, composure: 0.08, vision: 0.06, ballControl: 0.04,
    aggression: 0.03,
  },
  CDM: {
    interceptions: 0.13, defensiveAwareness: 0.12, standingTackle: 0.08,
    shortPassing: 0.12, longPassing: 0.08, stamina: 0.1, strength: 0.08,
    reactions: 0.08, composure: 0.08, vision: 0.06, ballControl: 0.04,
    aggression: 0.03,
  },
  CM: {
    shortPassing: 0.14, longPassing: 0.1, vision: 0.1, ballControl: 0.1,
    reactions: 0.09, stamina: 0.1, dribbling: 0.08, composure: 0.08,
    interceptions: 0.06, defensiveAwareness: 0.04, agility: 0.05,
    longShots: 0.04, positioning: 0.02,
  },
  AM: {
    vision: 0.13, shortPassing: 0.12, dribbling: 0.1, ballControl: 0.1,
    agility: 0.08, longShots: 0.08, composure: 0.1, attackingPositioning: 0.09,
    reactions: 0.07, curve: 0.03, finishing: 0.04, acceleration: 0.06,
  },
  CAM: {
    vision: 0.13, shortPassing: 0.12, dribbling: 0.1, ballControl: 0.1,
    agility: 0.08, longShots: 0.08, composure: 0.1, attackingPositioning: 0.09,
    reactions: 0.07, curve: 0.03, finishing: 0.04, acceleration: 0.06,
  },
  LW: {
    acceleration: 0.1, sprintSpeed: 0.1, dribbling: 0.12, ballControl: 0.1,
    agility: 0.09, crossing: 0.08, finishing: 0.08, attackingPositioning: 0.08,
    shortPassing: 0.06, reactions: 0.07, composure: 0.06, vision: 0.04,
    shotPower: 0.02,
  },
  RW: {
    acceleration: 0.1, sprintSpeed: 0.1, dribbling: 0.12, ballControl: 0.1,
    agility: 0.09, crossing: 0.08, finishing: 0.08, attackingPositioning: 0.08,
    shortPassing: 0.06, reactions: 0.07, composure: 0.06, vision: 0.04,
    shotPower: 0.02,
  },
  ST: {
    finishing: 0.18, attackingPositioning: 0.13, shotPower: 0.1, composure: 0.11,
    reactions: 0.1, headingAccuracy: 0.08, ballControl: 0.08, sprintSpeed: 0.07,
    acceleration: 0.06, strength: 0.05, jumping: 0.04, volleys: 0.04,
    dribbling: 0.04, positioning: 0.02,
  },
};

/** Default, roughly-realistic attribute spreads for each position, by squad role. */
export const BASE_PROFILE = {
  GK: {
    pace: 45,
    shooting: 18,
    passing: 45,
    dribbling: 35,
    defending: 62,
    physical: 60,
    gk: { reflexes: 68, handling: 65, positioning: 66, kicking: 58 },
  },
  CB: {
    pace: 62,
    shooting: 30,
    passing: 55,
    dribbling: 50,
    defending: 72,
    physical: 72,
  },
  LB: {
    pace: 76,
    shooting: 40,
    passing: 64,
    dribbling: 66,
    defending: 68,
    physical: 62,
  },
  RB: {
    pace: 76,
    shooting: 40,
    passing: 64,
    dribbling: 66,
    defending: 68,
    physical: 62,
  },
  DM: {
    pace: 62,
    shooting: 50,
    passing: 70,
    dribbling: 62,
    defending: 72,
    physical: 70,
  },
  CDM: {
    pace: 62,
    shooting: 50,
    passing: 70,
    dribbling: 62,
    defending: 72,
    physical: 70,
  },
  CM: {
    pace: 66,
    shooting: 60,
    passing: 74,
    dribbling: 70,
    defending: 60,
    physical: 62,
  },
  AM: {
    pace: 72,
    shooting: 68,
    passing: 75,
    dribbling: 76,
    defending: 40,
    physical: 52,
  },
  CAM: {
    pace: 72,
    shooting: 68,
    passing: 75,
    dribbling: 76,
    defending: 40,
    physical: 52,
  },
  LW: {
    pace: 84,
    shooting: 68,
    passing: 68,
    dribbling: 80,
    defending: 36,
    physical: 50,
  },
  RW: {
    pace: 84,
    shooting: 68,
    passing: 68,
    dribbling: 80,
    defending: 36,
    physical: 50,
  },
  ST: {
    pace: 78,
    shooting: 78,
    passing: 60,
    dribbling: 70,
    defending: 32,
    physical: 70,
  },
};

/**
 * Generated players should have a coherent attribute ceiling. A specialist can sit
 * slightly above his OVR, but only elite players should regularly reach the 90s.
 */
export function generatedAttributeLimits(targetOverall, attribute, position) {
  const overall = clamp(Number(targetOverall) || 50, 30, 99);
  const pos = normalizePosition(position);
  const eliteHeadroom = overall >= 90 ? 5 : overall >= 85 ? 3 : 2;
  const isScoringAttribute =
    pos === "ST" &&
    (attribute === "shooting" ||
      ["finishing", "attackingPositioning", "composure", "shotPower", "volleys"].includes(attribute));
  const max = overall + (isScoringAttribute ? eliteHeadroom : Math.min(8, eliteHeadroom + 3));
  return {
    min: clamp(overall - 14, 20, 94),
    max: clamp(max, 25, 95),
  };
}

/**
 * Derive the EA-style keeper attributes that are not rolled (diving, speed) from the
 * four core keeper attributes. Deterministic, so saves and seeded streams stay stable.
 */
export function deriveGkAttrs(gkAttrs = {}, attrs = {}) {
  return {
    diving: clampAttr(
      (gkAttrs.reflexes ?? 55) * 0.6 +
        (gkAttrs.positioning ?? 55) * 0.4,
    ),
    speed: clampAttr(
      (attrs.pace ?? 50) * 0.7 + (gkAttrs.kicking ?? 55) * 0.3,
    ),
  };
}

/**
 * The position-weighted overall, on the 1..99 scale the whole game uses.
 * A keeper is rated on his GK attributes; an outfield player on the six.
 */
export function calculatePlayerOverall(player, position = player?.position) {
  // Legends are frozen at their fixed rating regardless of attributes or form.
  if (player.isLegend) return LEGEND_OVERALL;
  // Imported real-world players keep their CSV overall exactly; the attribute
  // layer exists for match-engine detail but the displayed rating must match
  // the source data rather than being re-derived from it.
  if (player.source === "real-world" && Number.isFinite(player.overall))
    return clampAttr(player.overall);
  // Aggregate world-league performers predate the detailed player model. They are
  // intentionally kept as compact records and retain their imported overall.
  if (!player.attrs && !player.subAttrs && !player.gkAttrs)
    return clampAttr(player.overall ?? 50);
  const pos = normalizePosition(position || "CM");
  if (pos === "GK") {
    const a = {
      ...player.attrs,
      ...player.gkAttrs,
      // Diving/speed are derived on the fly if the save predates them.
      ...deriveGkAttrs(player.gkAttrs, player.attrs),
    };
    const weights = POSITION_ATTRIBUTE_WEIGHTS.GK;
    let total = 0;
    let weightTotal = 0;
    for (const [key, weight] of Object.entries(weights)) {
      total += (a[key] ?? 50) * weight;
      weightTotal += weight;
    }
    // Old imported keepers may not have detailed attributes; preserve a useful,
    // deterministic fallback rather than silently rating missing data as zero.
    if (!player.gkAttrs && !player.subAttrs) {
      return clampAttr(
        Object.entries(GK_WEIGHTS).reduce(
          (sum, [key, weight]) => sum + (a[key] ?? 50) * weight,
          0,
        ),
      );
    }
    const rating = clampAttr(total / weightTotal);
    return pos === normalizePosition(player.position)
      ? rating
      : clampAttr(rating - ((player.altPositions ?? []).map(normalizePosition).includes(pos) ? 1 : 3));
  }
  const weights = POSITION_ATTRIBUTE_WEIGHTS[pos] || POSITION_ATTRIBUTE_WEIGHTS.CM;
  const subAttrs = player.subAttrs ?? {};
  const groupOverrides = new Set(
    ATTRIBUTES.filter((group) => {
      const values = (SUB_ATTRIBUTES[group] ?? [])
        .map((key) => subAttrs[key])
        .filter((value) => value != null);
      if (!values.length || player.attrs?.[group] == null) return false;
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return Math.abs(player.attrs[group] - average) > 3;
    }),
  );
  let total = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const group = SUB_ATTRIBUTE_GROUP[key];
    const value = groupOverrides.has(group)
      ? (player.attrs?.[group] ?? 50)
      : (subAttrs[key] ?? player.attrs?.[group] ?? 50);
    total += value * weight;
    weightTotal += weight;
  }
  const rating = clampAttr(total / weightTotal);
  if (pos === normalizePosition(player.position)) return rating;
  return clampAttr(
    rating -
      ((player.altPositions ?? []).map(normalizePosition).includes(pos) ? 1 : 3),
  );
}

/** Backwards-compatible name used by the simulation and existing integrations. */
export function calculateOverall(player) {
  return calculatePlayerOverall(player);
}

/**
 * Recalculate and persist the official base OVR. This is the only pathway that
 * records rating changes; rendering and match form must never mutate the rating.
 */
export function updatePlayerOverall(player, reason = "Attribute update", details = {}) {
  if (!player) return { previous: null, current: 0, change: 0 };
  const previous = Number.isFinite(player.overall) ? player.overall : null;
  const calculated = calculatePlayerOverall(player);
  const current = details.ceiling == null
    ? calculated
    : Math.min(calculated, details.ceiling);
  player.baseOverall = current;
  player.previousOverall = previous;
  player.overall = current;
  player.ratingHistory ??= [];
  if (previous != null && previous !== current) {
    player.ratingHistory.push({
      previous,
      current,
      change: current - previous,
      reason,
      season: details.season ?? player.season ?? null,
      date: details.date ?? null,
      attributes: details.attributes ?? null,
    });
  }

  return { previous, current, change: previous == null ? 0 : current - previous };
}

export function recordOverallChange(player, current, reason = "Rating update", details = {}) {
  if (!player) return { previous: null, current, change: 0 };
  const previous = Number.isFinite(player.overall) ? player.overall : null;
  player.previousOverall = previous;
  player.overall = current;
  player.ratingHistory ??= [];
  if (previous != null && previous !== current) {
    player.ratingHistory.push({
      previous,
      current,
      change: current - previous,
      reason,
      season: details.season ?? player.season ?? null,
      date: details.date ?? null,
    });
  }
  return { previous, current, change: previous == null ? 0 : current - previous };
}

/**
 * How well a player performs in a position he is not natural to.
 * Returns a 0..1 competence factor applied to his effective rating.
 */
export function positionFamiliarity(player, pos) {
  const target = normalizePosition(pos);
  const natural = normalizePosition(player.position);
  if (target === natural) return 1.0;
  if ((player.altPositions || []).map(normalizePosition).includes(target)) return 0.97;
  const fam = player.familiarity || {};
  if (fam[pos] != null) return clamp(fam[pos] / 100, 0.5, 0.97);
  if (fam[target] != null) return clamp(fam[target] / 100, 0.5, 0.97);
  // Adjacent positions in the same band are far less punishing than a striker at CB.
  const naturalGroup = groupOf(natural);
  const targetGroup = groupOf(target);
  if (naturalGroup === targetGroup) return 0.88;
  if (target === "GK" || natural === "GK") return 0.35;
  const adjacent = {
    DEF: ["DM"],
    MID: ["DEF", "ATT"],
    ATT: ["MID"],
  };
  return (adjacent[targetGroup] || []).includes(naturalGroup) ? 0.78 : 0.62;
}

/**
 * Effective rating when fielded in a given position. This is what match sim and
 * selection actually use, so an unfit, out-of-position, out-of-form player is
 * measurably worse rather than just cosmetically so.
 */
export function effectiveRating(player, pos = player.position, ctx = {}) {
  const base = calculateOverall(player);
  const familiarity = positionFamiliarity(player, pos);
  const fitness = clamp((player.fitness ?? 100) / 100, 0.6, 1);
  const sharpness = clamp((player.sharpness ?? 100) / 100, 0.7, 1);
  const form = clamp((player.form ?? 50) / 50, 0.85, 1.12);
  const morale = clamp((player.morale ?? 60) / 60, 0.9, 1.06);
  const fatigue = clamp(1 - (player.fatigue ?? 0) / 260, 0.72, 1);
  const stamina = staminaPerformanceFactor(player);

  // Familiarity is deliberately applied as a large penalty/low ceiling: playing a
  // striker at centre-back should hurt the team, not nudge it by 3%.
  const famFactor = 0.72 + familiarity * 0.28;
  const rating =
    base * famFactor * fitness * sharpness * form * morale * fatigue * stamina;

  // Big-game players lift in knockouts and finals.
  if (ctx.bigGame && (player.traits || []).includes("Big Game Player")) {
    return clampAttr(rating * 1.05);
  }
  return clampAttr(rating);
}

/** Age at a given day index. Convenience wrapper so callers don't import calendar. */
export function age(player, dayIndex) {
  return ageOn(player.dob, dayIndex);
}

/**
 * Market value in euros, from rating, age and potential.
 *
 * Shape: value doubles roughly every 5 rating points (`VALUE_DOUBLING`), which is the
 * empirical relationship in the real transfer market, and is then bent by an age curve
 * (young players carry a premium for their upside, old players are discounted heavily).
 * Anchored so a mid-70s squad player at a mid-table club sits around €10m and a
 * 90-rated player in his prime sits around €150m.
 *
 * All coefficients come from data/config/finance.json so the market can be retuned
 * without touching this function.
 */
export function marketValue(player, dayIndex, financeCfg = {}) {
  const cfg = {
    // Value of a 50-rated player, in euros. Anchored so that a 90-rated 26-year-old
    // lands near €130m and an 85-rated one near €65m, which matches the real market.
    baseValue: financeCfg.valueBase ?? 500000,
    // How many rating points it takes to double a player's value.
    doubling: financeCfg.valueDoubling ?? 5.0,
    primeAge: financeCfg.valuePrimeAge ?? 24,
    youthPremium: financeCfg.valueYouthPremium ?? 1.9,
    declineFrom: financeCfg.valueDeclineFrom ?? 30,
    declineRate: financeCfg.valueDeclineRate ?? 0.82,
    unprovenDiscount: financeCfg.valueUnprovenDiscount ?? 0.35,
    unprovenUntil: financeCfg.valueUnprovenUntil ?? 18,
  };
  const ov = calculateOverall(player);
  const a = age(player, dayIndex);
  const pot = Math.max(player.potential ?? ov, ov);

  let v = cfg.baseValue * Math.pow(2, (ov - 50) / cfg.doubling);

  // Upside is priced in for young players, in proportion to how much room there is
  // and how many years of improvement are still ahead of them.
  if (a <= cfg.primeAge + 4) {
    const upside = Math.max(0, pot - ov);
    const yearsLeft = Math.max(0, cfg.primeAge + 4 - a);
    v *=
      1 +
      (upside / 18) *
        (cfg.youthPremium - 1) *
        (yearsLeft / (cfg.primeAge + 4 - 16));
  }
  // After the peak, value decays — gently at first, then sharply. This is the single
  // biggest reason a 33-year-old world-beater costs less than a 24-year-old prospect.
  if (a > cfg.declineFrom) v *= Math.pow(cfg.declineRate, a - cfg.declineFrom);
  // Teenagers are cheap because they are unproven, however good they might become.
  if (a < cfg.unprovenUntil) {
    v *=
      cfg.unprovenDiscount +
      ((1 - cfg.unprovenDiscount) * (a - 16)) /
        Math.max(1, cfg.unprovenUntil - 16);
  }

  // Round to a readable step so the UI never shows "€41,238,912".
  const step = v > 5e7 ? 1e6 : v > 5e6 ? 5e5 : v > 5e5 ? 1e5 : 5e4;
  return Math.max(50000, Math.round(v / step) * step);
}

/**
 * A generated attribute line for an AI player at a target ability level.
 * Used for youth intake, regens, and for padding out squads in later phases.
 */
export function generateAttributes(rng, position, targetOverall) {
  const position0 = normalizePosition(position);
  const profile = BASE_PROFILE[position0] || BASE_PROFILE.CM;
  const out = {};
  for (const k of ATTRIBUTES) {
    // Spread the attributes around the profile shape, then scale the whole line so
    // the resulting position-weighted overall lands near the target.
    const base = profile[k] ?? 50;
    const limits = generatedAttributeLimits(targetOverall, k, position0);
    out[k] = clampAttr(rng.normalClamped(base, 7, limits.min, limits.max));
  }
  const gk = {};
  if (position0 === "GK" && profile.gk) {
    for (const k of GK_ATTRIBUTES) {
      gk[k] = clampAttr(rng.normalClamped(profile.gk[k] ?? 60, 6, 15, 99));
    }
    // Diving/speed are derived, never rolled — keeps seeded streams stable.
    Object.assign(gk, deriveGkAttrs(gk, out));
  }

  // Rescale to hit the target: compute what overall this line produced, then shift
  // every attribute by the shortfall (respecting the profile shape).
  const probe = { position: position0, attrs: out, gkAttrs: gk };
  let ov = calculateOverall(probe);
  let guard = 0;
  while (Math.abs(ov - targetOverall) > 1 && guard++ < 26) {
    const delta = targetOverall - ov;
    const step = clamp(delta * 0.5, -4, 4);
    for (const k of ATTRIBUTES) {
      // Nudge relative to how much this attribute matters for the position, so a
      // striker's shooting climbs faster than his defending as he improves.
      const w = POSITION_WEIGHTS[position0]?.[k] ?? GK_WEIGHTS[k] ?? 0.2;
      const limits = generatedAttributeLimits(targetOverall, k, position0);
      out[k] = clamp(out[k] + step * (0.4 + w * 2.2), limits.min, limits.max);
    }
    if (position0 === "GK") {
      for (const k of GK_ATTRIBUTES) {
        gk[k] = clampAttr(gk[k] + step);
      }
    }
    ov = calculateOverall({ position: position0, attrs: out, gkAttrs: gk });
  }
  // The detailed layer is derived deterministically from the final group stats —
  // deliberately with NO extra rng draws, so every seeded stream downstream
  // (lineups, key moments, match results) stays identical to the pre-existing
  // engine. Sub-attribute offsets vary per group index rather than per player.
  const subAttrs = {};
  for (const [group, list] of Object.entries(SUB_ATTRIBUTES)) {
    const groupIndex = ATTRIBUTES.indexOf(group);
    for (let i = 0; i < list.length; i++) {
      const offset = ((i % 3) - 1) * 2 + ((groupIndex + i) % 2);
      const limits = generatedAttributeLimits(targetOverall, list[i], position0);
      subAttrs[list[i]] = clamp(out[group] + offset, limits.min, limits.max);
    }
  }
  return { attrs: out, gkAttrs: gk, subAttrs };
}

/**
 * Recompute the six group attributes from a player's sub-attributes. Called after any
 * sub-attribute changes so the two layers never disagree.
 */
export function syncGroupsFromSubAttrs(player, groups = Object.keys(SUB_ATTRIBUTES)) {
  const subAttrs = player.subAttrs ?? {};
  for (const group of groups) {
    const list = SUB_ATTRIBUTES[group];
    if (!list) continue;
    const values = list.map((sub) => subAttrs[sub]).filter((v) => v != null);
    if (values.length) {
      player.attrs[group] = clampAttr(
        Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
      );
    }
  }
}

/**
 * Rebuild the detailed sub-attribute layer from the group stats, using the same
 * deterministic offsets as `generateAttributes`. Called when the group stats are edited
 * directly (player creation sliders) so the two layers never disagree.
 */
export function deriveSubAttrsFromGroups(attrs) {
  const out = {};
  for (const [group, list] of Object.entries(SUB_ATTRIBUTES)) {
    const groupIndex = ATTRIBUTES.indexOf(group);
    const groupValue = attrs[group] ?? 50;
    for (let i = 0; i < list.length; i++) {
      const offset = ((i % 3) - 1) * 2 + ((groupIndex + i) % 2);
      out[list[i]] = clampAttr(groupValue + offset);
    }
  }
  return out;
}

/** A complete, engine-ready player object. */
export function createPlayer(spec) {
  // Detailed attribute layer: 29 outfield sub-attributes. Older saves and hand-built
  // specs may not carry one; synthesise it from the group stats so every player has it.
  const subAttrs = spec.subAttrs
    ? { ...spec.subAttrs }
    : deriveSubAttrs(spec.attrs ?? {}, spec);
  const position = normalizePosition(spec.position ?? "CM");
  const suppliedDob = Number.isFinite(Number(spec.dob)) ? Number(spec.dob) : null;
  const fallbackArchetype =
    position === "GK" ? "Sweeper Keeper"
      : ["ST", "CF"].includes(position) ? "Complete Forward"
      : ["CB"].includes(position) ? "Ball-Playing Defender"
      : ["CM", "CAM", "CDM"].includes(position) ? "Central Playmaker"
      : ["LW", "RW", "LM", "RM"].includes(position) ? "Wide Playmaker"
      : "Balanced Player";
  const suppliedAltPositions = (spec.altPositions ?? [])
    .map(normalizePosition)
    .filter(
      (altPosition, index, positions) =>
        altPosition !== position &&
        positions.indexOf(altPosition) === index,
    );
  const player = {
    id: spec.id || nextPlayerId(),
    first: spec.first ?? "New",
    last: spec.last ?? "Player",
    // Nation code, e.g. 'ENG'. Decides which national team he is eligible for.
    nationality: spec.nationality ?? "ENG",
    dob: suppliedDob ?? toDayIndex(2001, 7, 1),
    height: spec.height ?? 180,
    weight: spec.weight ?? 75,
    foot: spec.foot ?? "Right",
    weakFoot: clamp(spec.weakFoot ?? 3, 1, 5),
    skillMoves: clamp(spec.skillMoves ?? 3, 1, 5),
    leagueGoals: spec.leagueGoals ?? 0,
    leagueAssists: spec.leagueAssists ?? 0,
    lastMatchRating: spec.lastMatchRating ?? null,
    lastMatchWeek: spec.lastMatchWeek ?? null,
    position,
    displayPosition: spec.displayPosition ?? position,
    shirtNumber:
      spec.shirtNumber ?? preferredShirtNumbers(position)[0],
    altPositions:
      suppliedAltPositions.length
        ? suppliedAltPositions
        : [secondaryPositionFor(position)],
    familiarity: spec.familiarity ? { ...spec.familiarity } : {},
    archetype: spec.archetype ?? fallbackArchetype,
    attrs: { ...spec.attrs },
    subAttrs,
    gkAttrs: spec.gkAttrs ? { ...spec.gkAttrs } : {},
    // EA-style attacking/defensive work rates, defaulted sensibly by position.
    workRates: spec.workRates ?? {
      attacking: spec.attackingWorkRate ?? defaultWorkRate(spec.position, "attacking"),
      defensive: spec.defensiveWorkRate ?? defaultWorkRate(spec.position, "defensive"),
    },
    tendencies: spec.tendencies ? { ...spec.tendencies } : deriveTendencies(spec),
    potential:
      spec.potential ??
      calculateOverall({
        position: spec.position ?? "CM",
        attrs: spec.attrs,
        gkAttrs: spec.gkAttrs,
      }),
    baseOverall: spec.baseOverall ?? null,
    traits: spec.traits ? [...spec.traits] : [],
    personality: spec.personality
      ? (Array.isArray(spec.personality) ? [...spec.personality] : [spec.personality])
      : ["Professional"],

    // Dynamic state
    form: spec.form ?? 55,
    morale: spec.morale ?? 70,
    sharpness: spec.sharpness ?? 70,
    fitness: spec.fitness ?? 100,
    fatigue: spec.fatigue ?? 0,
    stamina: Number.isFinite(spec.stamina) ? clamp(spec.stamina, 0, 100) : null,
    injury: spec.injury ? { ...spec.injury } : null,
    suspensionWeeks: spec.suspensionWeeks ?? 0,
    developmentProgress: spec.developmentProgress ?? 0,
    developmentRate: spec.developmentRate ?? 1,
    peakAge: spec.peakAge ?? 27,
    physicalDeclineProfile: spec.physicalDeclineProfile
      ? { ...spec.physicalDeclineProfile }
      : { pace: 1, physical: 0.8, technical: 0.35 },
    previousAttributes: spec.previousAttributes
      ? { ...spec.previousAttributes }
      : { ...spec.attrs },
    previousOverall: spec.previousOverall ?? null,
    ratingHistory: spec.ratingHistory ? [...spec.ratingHistory] : [],
    condition: "Fit",

    // Relationship / career state
    squadStatus: spec.squadStatus ?? "Prospect",
    clubId: spec.clubId ?? null,
    contract:
      spec.contract ??
      (spec.wage != null
        ? { wage: Number(spec.wage), expires: spec.contractYears == null ? null : spec.contractYears }
        : null),
    value: spec.value ?? null,
    source: spec.source ?? "generated",
    trusting: spec.trusting ?? {
      manager: 50,
      fans: 50,
      teammates: 50,
      board: 50,
    },
    fame: spec.fame ?? 5,

    // Record keeping
    stats: spec.stats ?? emptyStats(),
    history: spec.history ? [...spec.history] : [],
    honours: spec.honours ? [...spec.honours] : [],

    // Set by the engine; true only for the one human-controlled player.
    isUser: !!spec.isUser,
    // Kept only to migrate older saves that stored protected legend players.
    isLegend: !!spec.isLegend,
    playStyles: spec.playStyles ? structuredClone(spec.playStyles) : { unlocked: [], progress: {}, history: [] },
  };
  ensurePlayStyles(player);
  seedPlayStyles(player);

  // NOTE: no syncGroupsFromSubAttrs here. At creation the sub-attribute layer is
  // derived from the group stats, so it already agrees; re-syncing would round
  // nudge group stats and shift every seeded rating downstream.
  //
  // Height and weight bend the stats here, once, so the whole game — rating, match
  // engine, transfer market — works from the same physical reality.
  applyPhysique(player);
  if (player.isLegend) player.potential = LEGEND_OVERALL;
  ensureStamina(player);
  if (!player.contract || Number(player.contract.wage ?? 0) <= 0) {
    const fallbackWage = Math.round(
      900 +
        Math.max(0, Number(player.overall ?? 50) - 50) * 250 +
        Math.max(0, Number(player.age ?? 24) - 30) * 75,
    );
    player.contract = {
      ...(player.contract ?? {}),
      wage: fallbackWage,
      expires: player.contract?.expires ?? spec.contractYears ?? null,
    };
  }
  return player;
}

/**
 * Build a sub-attribute set from group stats when none exists (old saves, imported
 * legends). Each sub-attribute starts at its group value with a small deterministic
 * spread keyed off the group, so the result is stable and matches the card.
 */
function deriveSubAttrs(attrs, spec) {
  const out = {};
  for (const [group, list] of Object.entries(SUB_ATTRIBUTES)) {
    const groupValue = attrs[group] ?? 50;
    for (const sub of list) out[sub] = clampAttr(groupValue);
  }
  return out;
}

/** Default work rate by position: attackers press forward, defenders stay home. */
function defaultWorkRate(position, kind) {
  const pos = normalizePosition(position ?? "CM");
  const attackingBias = {
    GK: 0, CB: 1, LB: 2, RB: 2, DM: 1, CDM: 1, CM: 2, AM: 3, CAM: 3,
    LW: 3, RW: 3, ST: 3,
  }[pos] ?? 2;
  const level = kind === "attacking" ? attackingBias : 3 - attackingBias;
  return WORK_RATES[clamp(level, 0, 2)];
}

function deriveTendencies(spec) {
  const position = normalizePosition(spec.position ?? "CM");
  const attrs = spec.attrs ?? {};
  const gkAttrs = spec.gkAttrs ?? {};
  const attackWeight = {
    GK: 0.05, CB: 0.2, LB: 0.35, RB: 0.35, DM: 0.35, CM: 0.55,
    AM: 0.8, LW: 0.9, RW: 0.9, ST: 1,
  }[position] ?? 0.5;
  const finishing = attrs.shooting ?? 50;
  const passing = attrs.passing ?? 50;
  return {
    shotTaking: round(0.35 + attackWeight * 0.45 + finishing / 250, 2),
    goalThreat: round(0.4 + attackWeight * 0.7 + finishing / 180, 2),
    playmaking: round(0.35 + passing / 140 + (position === "AM" ? 0.2 : 0), 2),
    pressing: round(0.35 + (attrs.physical ?? 50) / 160 + (position === "ST" ? 0.15 : 0), 2),
    shotStopping: position === "GK"
      ? round(["reflexes", "handling", "positioning"].reduce((sum, key) => sum + (gkAttrs[key] ?? 60), 0) / 3, 1)
      : 0,
  };
}

/** A blank statistics block. Shape shared by season and career totals. */
export function emptyStats() {
  return {
    apps: 0,
    starts: 0,
    minutes: 0,
    subs: 0,
    unusedSub: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    xg: 0,
    passes: 0,
    passesCompleted: 0,
    keyPasses: 0,
    bigChancesCreated: 0,
    dribbles: 0,
    dribblesWon: 0,
    duels: 0,
    duelsWon: 0,
    aerials: 0,
    aerialsWon: 0,
    tackles: 0,
    tacklesWon: 0,
    interceptions: 0,
    foulsCommitted: 0,
    foulsWon: 0,
    yellowCards: 0,
    redCards: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    saves: 0,
    penaltiesScored: 0,
    penaltiesMissed: 0,
    ratingSum: 0,
    motm: 0,
  };
}

/** Add stat block `b` into `a` (mutates a). Used for career and competition totals. */
export function addStats(a, b) {
  for (const k of Object.keys(a)) a[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return a;
}

/** Average match rating, or null if he never played. */
export function averageRating(stats) {
  return stats.apps > 0 ? round(stats.ratingSum / stats.apps, 2) : null;
}

/** Pass completion percentage. */
export function passAccuracy(stats) {
  return stats.passes > 0
    ? round((stats.passesCompleted / stats.passes) * 100, 1)
    : 0;
}

/** Per-90 rate for any counting stat — the correct way to compare part-time players. */
export function per90(stats, key) {
  return stats.minutes > 0
    ? round(((stats[key] ?? 0) / stats.minutes) * 90, 2)
    : 0;
}

/** Human-readable summary used across the UI. */
export function describePosition(player) {
  const alts = (player.altPositions || []).length
    ? ` / ${player.altPositions.join(" / ")}`
    : "";
  return `${player.position}${alts}`;
}
