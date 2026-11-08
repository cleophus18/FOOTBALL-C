/**
 * Engine-level constants.
 *
 * Rule of thumb used throughout this project: anything a *designer* would want to
 * retune lives in `data/config/*.json`; anything that is a structural fact of the
 * engine (the attribute scale, the position list) lives here.
 */

/** The six outfield attribute groups, in the order the UI displays them. */
export const ATTRIBUTES = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physical",
];

/** Goalkeeper-specific attributes. A GK ignores the outfield six for rating purposes. */
export const GK_ATTRIBUTES = ["reflexes", "handling", "positioning", "kicking"];

/**
 * Derived keeper attributes (EA-style Diving and Speed). They are computed from the
 * four rolled keeper attributes rather than drawn independently, so adding them does
 * not shift any seeded stream downstream.
 */
export const GK_DERIVED_ATTRIBUTES = ["diving", "speed"];

/**
 * The 29 individual outfield attributes, in EA-style groups. Each group is the mean of
 * its sub-attributes, so training a sub-attribute nudges the group and the OVR follows.
 */
export const SUB_ATTRIBUTES = {
  pace: ["acceleration", "sprintSpeed"],
  shooting: [
    "attackingPositioning",
    "finishing",
    "shotPower",
    "longShots",
    "volleys",
    "penalties",
  ],
  passing: [
    "vision",
    "crossing",
    "freeKickAccuracy",
    "shortPassing",
    "longPassing",
    "curve",
  ],
  dribbling: [
    "agility",
    "balance",
    "reactions",
    "ballControl",
    "dribbling",
    "composure",
  ],
  defending: [
    "defensiveAwareness",
    "interceptions",
    "headingAccuracy",
    "standingTackle",
    "slidingTackle",
  ],
  physical: ["jumping", "stamina", "strength", "aggression"],
};

/** Flat list of every sub-attribute, in display order. */
export const ALL_SUB_ATTRIBUTES = Object.values(SUB_ATTRIBUTES).flat();

/** Which group a sub-attribute belongs to (inverse of SUB_ATTRIBUTES). */
export const SUB_ATTRIBUTE_GROUP = Object.fromEntries(
  Object.entries(SUB_ATTRIBUTES).flatMap(([group, list]) =>
    list.map((sub) => [sub, group]),
  ),
);

/** Work-rate levels, EA-style. */
export const WORK_RATES = ["Low", "Medium", "High"];

export const POSITIONS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "DM",
  "CM",
  "CAM",
  "AM",
  "LW",
  "RW",
  "ST",
];

/**
 * Modern positional aliases. CAM/CDM are the widely-used names for the attacking and
 * defensive midfield roles, so we accept them everywhere and normalise to the internal
 * AM/DM codes. This keeps data files, squads and formations interchangeable.
 */
export const POSITION_ALIASES = {
  CAM: "AM",
  CDM: "DM",
  LWB: "LB",
  RWB: "RB",
  LF: "LW",
  RF: "RW",
  CF: "ST",
};

/** Normalise any position label to the engine's canonical code (e.g. CAM -> AM). */
export const normalizePosition = (pos) => POSITION_ALIASES[pos] ?? pos;

/** Positions grouped broadly, used for squad-planning and strength calculations. */
export const POSITION_GROUPS = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB"],
  MID: ["CDM", "DM", "CM", "CAM", "AM"],
  ATT: ["LW", "RW", "ST"],
};

export const groupOf = (pos) => {
  const normalized = normalizePosition(pos);
  for (const [g, list] of Object.entries(POSITION_GROUPS))
    if (list.includes(normalized)) return g;
  return "MID";
};

/** Positions similar to each position, used to fill `altPositions` so players can
 *  be deployed in more than one role on the pitch. */
export const SIMILAR_POSITIONS = {
  GK: ["GK"],
  CB: ["LB", "RB"],
  LB: ["CB", "RB"],
  RB: ["CB", "LB"],
  CDM: ["CM", "AM"],
  DM: ["CM", "AM"],
  CM: ["DM", "AM"],
  CAM: ["CM", "DM"],
  AM: ["CM", "DM"],
  LW: ["ST", "RW"],
  RW: ["ST", "LW"],
  ST: ["LW", "RW"],
};

/** Returns a safe fallback role when a player has no supplied secondary role. */
export const secondaryPositionFor = (position) => {
  const normalized = normalizePosition(position ?? "CM");
  return SIMILAR_POSITIONS[normalized]?.[0] ?? normalized;
};
export const SQUAD_STATUSES = [
  "Rotation",
  "First Team",
  "Key Player",
  "Star",
];

/** Numeric weight of each status: minutes share, wage multiplier, and trust baseline. */
export const STATUS_INFO = {
  Prospect: { minutesShare: 0.15, wageMult: 0.5, trust: 35, order: 0 },
  Rotation: { minutesShare: 0.4, wageMult: 0.85, trust: 50, order: 1 },
  "First Team": { minutesShare: 0.7, wageMult: 1.2, trust: 65, order: 2 },
  "Key Player": { minutesShare: 0.88, wageMult: 1.8, trust: 80, order: 3 },
  Star: { minutesShare: 0.95, wageMult: 2.6, trust: 92, order: 4 },
};

export const FOOT = ["Right", "Left"];

/** Trait definitions. `type` decides when the effect is applied in the engine. */
export const TRAITS = {
  Wonderkid:
    "Potential skews high, but a hard cap if you do not play before 21.",
  "Late Bloomer":
    "Lower ceiling now; the ceiling itself grows through your early twenties.",
  "Injury Prone": "Recurs more often, but recovers faster.",
  "Iron Man": "Rarely injured; fatigue accumulates slower.",
  Leader: "Faster trust gains with teammates and the armband.",
  "Set-Piece Specialist":
    "Takes your club penalties and free kicks when selected.",
  "Big Game Player": "Performs above his rating in finals and knockouts.",
  "Media Darling": "Fame rises faster; controversy is less damaging.",
};

export const PERSONALITIES = [
  "Professional",
  "Ambitious",
  "Loyal",
  "Flashy",
  "Leader",
];

export function personalityForPlayer(first, last, position, overall = 70) {
  const seed = `${first ?? ""}:${last ?? ""}:${position ?? ""}:${overall}`;
  const score = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PERSONALITIES[score % PERSONALITIES.length] ?? "Professional";
}

/**
 * How each personality bends the simulation. Multipliers >1 amplify the named quantity.
 * Kept readable rather than clever: these are the knobs that make the personalities
 * feel different week to week.
 */
export const PERSONALITY_INFO = {
  Professional: {
    growth: 1.12,
    fatigueDecay: 1.1,
    moraleVolatility: 0.75,
    mediaRisk: 0.8,
    trustGain: 1.05,
    desc: "Trains hard, rarely distracted. Faster development, steadier morale.",
  },
  Ambitious: {
    growth: 1.05,
    fatigueDecay: 0.95,
    moraleVolatility: 1.25,
    mediaRisk: 1.15,
    trustGain: 1.0,
    desc: "Wants to win now. Suffers badly in a losing side, pushes for moves.",
  },
  Loyal: {
    growth: 0.98,
    fatigueDecay: 1.0,
    moraleVolatility: 0.8,
    mediaRisk: 0.85,
    trustGain: 1.15,
    desc: "Stays through hard times. Fans and teammates trust you faster.",
  },
  Flashy: {
    growth: 1.0,
    fatigueDecay: 0.98,
    moraleVolatility: 1.1,
    mediaRisk: 1.5,
    trustGain: 0.95,
    desc: "Fame and sponsorships come easily; so do headlines you did not want.",
  },
  Leader: {
    growth: 1.03,
    fatigueDecay: 1.05,
    moraleVolatility: 0.85,
    mediaRisk: 0.9,
    trustGain: 1.2,
    desc: "Natural captain material. The dressing room follows you.",
  },
};

/** Match ratings are anchored here. */
export const RATING_BASE = 6.2;
export const RATING_MIN = 3.1;
export const RATING_MAX = 10.0;

/** A season, for the calendar. 2026/27 starts July 2026. */
export const SEASON_START_MONTH = 7; // July (1-based)
export const SEASON_START_YEAR = 2026;

/** Transfer window boundaries, as {month, day}. Configurable per-league later. */
export const WINDOWS = {
  summer: [
    { month: 6, day: 10, yearOffset: 0 },
    { month: 9, day: 1, yearOffset: 0 },
  ],
  winter: [
    { month: 1, day: 1, yearOffset: 1 },
    { month: 1, day: 31, yearOffset: 1 },
  ],
};
