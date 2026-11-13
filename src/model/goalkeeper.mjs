/**
 * Goalkeeper model: one place where keeper attributes are defined, estimated, rated and
 * scored for match purposes.
 *
 * Every other system (import, overall rating, strength, match simulation, training,
 * squad selection) imports from here instead of inventing its own blend of attributes.
 * That is the only way a keeper's rating, his match performance and his training can
 * agree with each other.
 */

import { clamp, round } from "../core/util.mjs";

/** The attributes every goalkeeper record must carry. */
export const GOALKEEPER_ATTRIBUTES = [
  "diving",
  "reflexes",
  "handling",
  "positioning",
  "kicking",
  "speed",
  "reactions",
  "jumping",
  "composure",
];

/** Attributes that come straight from a source CSV when it has a real keeper sheet. */
export const DIRECT_GOALKEEPER_ATTRIBUTES = [
  "diving",
  "handling",
  "kicking",
  "reflexes",
  "positioning",
  "speed",
];

/**
 * Rating weights for the keeper's overall. Shot-stopping dominates; distribution and
 * mobility matter, but never as much as saving the ball.
 */
export const GOALKEEPER_RATING_WEIGHTS = {
  diving: 0.22,
  reflexes: 0.24,
  handling: 0.18,
  positioning: 0.16,
  kicking: 0.08,
  speed: 0.04,
  reactions: 0.04,
  composure: 0.02,
  jumping: 0.02,
};

/** Weights used by match systems when judging a specific type of stoppage. */
export const GOALKEEPER_SKILL_WEIGHTS = {
  shotStopping: { reflexes: 0.4, diving: 0.35, positioning: 0.15, reactions: 0.1 },
  reflexes: { reflexes: 0.65, reactions: 0.2, diving: 0.15 },
  diving: { diving: 0.7, reflexes: 0.2, jumping: 0.1 },
  handling: { handling: 0.7, positioning: 0.2, composure: 0.1 },
  positioning: { positioning: 0.7, reflexes: 0.15, composure: 0.15 },
  oneOnOne: { reflexes: 0.3, positioning: 0.25, composure: 0.25, diving: 0.2 },
  reactions: { reactions: 0.7, reflexes: 0.3 },
  jumping: { jumping: 0.75, diving: 0.15, speed: 0.1 },
  composure: { composure: 0.7, handling: 0.15, positioning: 0.15 },
  distribution: { kicking: 0.85, composure: 0.15 },
  penaltySaves: { reflexes: 0.3, diving: 0.25, composure: 0.25, positioning: 0.2 },
};

const asNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * A supplied keeper value we are willing to trust: finite and inside the 1..99 scale.
 * A zero is never a real rating — it is what an outfield-shaped export writes into a
 * keeper column — so it must fall back to the estimate instead of producing a 0-rated
 * keeper.
 */
const suppliedValue = (value) => {
  const n = asNumber(value);
  return n != null && n >= 1 && n <= 99 ? n : null;
};

/**
 * True when a record actually carries keeper attributes (as opposed to zeros or blanks
 * left by an outfield-shaped CSV export).
 */
export function hasGoalkeeperAttributes(gkAttrs) {
  if (!gkAttrs || typeof gkAttrs !== "object") return false;
  return DIRECT_GOALKEEPER_ATTRIBUTES.some((attribute) => {
    const value = asNumber(gkAttrs[attribute]);
    return value != null && value >= 1 && value <= 99;
  });
}

/**
 * Derive a complete keeper attribute set.
 *
 * `supplied` are values we trust (CSV columns, saved players). Anything missing or
 * zeroed is estimated from the goalkeeper's overall and physical profile, then every
 * value is clamped. The estimate is deterministic — no randomness — so seeded careers
 * and save migration stay stable.
 */
export function estimateGoalkeeperAttributes(supplied = {}, fallback = {}) {
  const overall = clamp(
    asNumber(fallback.overall) ?? weightedAverage(supplied, GOALKEEPER_RATING_WEIGHTS) ?? 60,
    1,
    99,
  );
  const reflexesBase = suppliedValue(supplied.reflexes);
  const positioningBase = suppliedValue(supplied.positioning);
  const handlingBase = suppliedValue(supplied.handling);
  const kickingBase = suppliedValue(supplied.kicking);
  const divingBase = suppliedValue(supplied.diving);
  const speedBase = suppliedValue(supplied.speed);
  // Height is a keeper's reach: a 6'4" keeper commands more, a 5'9" keeper is quicker.
  const height = clamp(asNumber(fallback.height) ?? 188, 160, 205);
  const reach = clamp((height - 185) / 12, -1, 1);
  const physical = asNumber(fallback.physical) ?? overall;

  const diving =
    divingBase ?? clamp((reflexesBase ?? overall) * 0.6 + (positioningBase ?? overall) * 0.4, 1, 99);
  const reflexes =
    reflexesBase ?? clamp(overall * 0.9 + physical * 0.1 - reach * 2, 1, 99);
  const handling =
    handlingBase ?? clamp(overall * 0.85 + reach * 4 + physical * 0.15, 1, 99);
  const positioning =
    positioningBase ?? clamp(overall * 0.88 + reach * 3, 1, 99);
  const kicking = kickingBase ?? clamp(overall * 0.8 + (asNumber(fallback.passing) ?? overall) * 0.2, 1, 99);
  const speed = speedBase ?? clamp((asNumber(fallback.pace) ?? overall) * 0.7 + kicking * 0.3, 1, 99);
  const reactions = clamp(reflexes * 0.6 + overall * 0.4, 1, 99);
  const jumping = clamp(overall * 0.75 + reach * 8 + physical * 0.15, 1, 99);
  const composure = clamp(overall * 0.8 + positioning * 0.2, 1, 99);

  const attributes = {
    diving: round(diving, 1),
    reflexes: round(reflexes, 1),
    handling: round(handling, 1),
    positioning: round(positioning, 1),
    kicking: round(kicking, 1),
    speed: round(speed, 1),
    reactions: round(reactions, 1),
    jumping: round(jumping, 1),
    composure: round(composure, 1),
  };
  const estimated = DIRECT_GOALKEEPER_ATTRIBUTES.some(
    (attribute) => suppliedValue(supplied[attribute]) == null,
  );
  return {
    attributes,
    estimated,
    method: estimated
      ? "Estimated from OVR and physical profile; outfield columns do not describe goalkeeping."
      : "Supplied goalkeeper data.",
  };
}

function weightedAverage(source, weights) {
  let total = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = asNumber(source[key]);
    if (value == null) continue;
    total += value * weight;
    weightTotal += weight;
  }
  return weightTotal ? total / weightTotal : null;
}

/** Keeper overall on the 1..99 scale, from whatever attributes are present. */
export function goalkeeperOverall(gkAttrs, fallbackOverall = 60) {
  const base = hasGoalkeeperAttributes(gkAttrs)
    ? { ...gkAttrs, ...estimateGoalkeeperAttributes(gkAttrs, { overall: fallbackOverall }).attributes }
    : estimateGoalkeeperAttributes({}, { overall: fallbackOverall }).attributes;
  return round(weightedAverage(base, GOALKEEPER_RATING_WEIGHTS) ?? fallbackOverall, 1);
}

/**
 * The single goalkeeper-quality score used by every match system.
 *
 * Returns 1..99. `kind` selects the relevant skill blend so a cross comes in under the
 * keeper's handling while a penalty is judged on reflexes, diving and nerve.
 */
export function goalkeeperQuality(gkAttrs, { kind = "shotStopping", overall = 60 } = {}) {
  const weights = GOALKEEPER_SKILL_WEIGHTS[kind] ?? GOALKEEPER_SKILL_WEIGHTS.shotStopping;
  const base = hasGoalkeeperAttributes(gkAttrs)
    ? { ...gkAttrs, ...estimateGoalkeeperAttributes(gkAttrs, { overall }).attributes }
    : estimateGoalkeeperAttributes({}, { overall }).attributes;
  const value = weightedAverage(base, weights);
  return clamp(round(value ?? overall, 2), 1, 99);
}

/**
 * A 0..1 save factor. 0.5 is a league-average keeper; a 90-rated keeper reaches roughly
 * 0.75 and a 40-rated keeper roughly 0.2. Deliberately bounded so no keeper is unbeatable.
 */
export function goalkeeperSaveFactor(gkAttrs, { kind = "shotStopping", overall = 60, hardness = 0.5 } = {}) {
  const quality = goalkeeperQuality(gkAttrs, { kind, overall });
  const base = clamp((quality - 35) / 45, 0, 1);
  const difficulty = clamp(hardness, 0, 1);
  return clamp(0.18 + base * 0.62 - (difficulty - 0.5) * 0.12, 0.08, 0.86);
}

export const normalizeGkInput = (gkAttrs, fallback = {}) => ({
  ...fallback,
  ...(gkAttrs ?? {}),
});