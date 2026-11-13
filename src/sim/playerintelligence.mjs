import { clamp, round } from "../core/util.mjs";
import { playStyleEffect, ensurePlayStyles } from "../model/playstyles.mjs";
import { goalkeeperSaveFactor } from "../model/goalkeeper.mjs";

export const PLAYER_LEVELS = Object.freeze([
  { min: 90, label: "world-class", decision: 0.15, consistency: 0.94 },
  { min: 85, label: "elite", decision: 0.11, consistency: 0.9 },
  { min: 80, label: "high-level", decision: 0.07, consistency: 0.85 },
  { min: 75, label: "strong", decision: 0.035, consistency: 0.79 },
  { min: 70, label: "average", decision: 0, consistency: 0.7 },
  { min: 60, label: "developing", decision: -0.045, consistency: 0.58 },
  { min: 0, label: "low-rated", decision: -0.09, consistency: 0.46 },
]);

const POSITION_ACTIONS = {
  GK: { distribute: 1.1, hold: 1, rush: 0.55, pass: 0.8 },
  CB: {
    pass: 1,
    hold: 0.8,
    intercept: 1.15,
    block: 0.95,
    tackle: 0.75,
    clear: 0.9,
  },
  LB: {
    pass: 0.95,
    overlap: 0.9,
    cross: 0.7,
    dribble: 0.7,
    trackBack: 1,
    tackle: 0.9,
    intercept: 0.85,
  },
  RB: {
    pass: 0.95,
    overlap: 0.9,
    cross: 0.7,
    dribble: 0.7,
    trackBack: 1,
    tackle: 0.9,
    intercept: 0.85,
  },
  DM: {
    pass: 1,
    throughBall: 0.65,
    hold: 0.9,
    intercept: 1.2,
    tackle: 1,
    trackBack: 1,
  },
  CDM: {
    pass: 1,
    throughBall: 0.65,
    hold: 0.9,
    intercept: 1.2,
    tackle: 1,
    trackBack: 1,
  },
  CM: {
    pass: 1.05,
    throughBall: 0.85,
    switch: 0.75,
    dribble: 0.65,
    intercept: 0.75,
    shoot: 0.45,
    hold: 0.8,
  },
  AM: {
    throughBall: 1.1,
    pass: 0.85,
    shoot: 0.9,
    dribble: 0.9,
    cross: 0.55,
    hold: 0.55,
  },
  CAM: {
    throughBall: 1.1,
    pass: 0.85,
    shoot: 0.9,
    dribble: 0.9,
    cross: 0.55,
    hold: 0.55,
  },
  LW: {
    dribble: 1,
    cross: 0.9,
    shoot: 0.75,
    pass: 0.65,
    run: 1.05,
    hold: 0.45,
  },
  RW: {
    dribble: 1,
    cross: 0.9,
    shoot: 0.75,
    pass: 0.65,
    run: 1.05,
    hold: 0.45,
  },
  ST: {
    shoot: 1.1,
    run: 1.05,
    hold: 0.7,
    pass: 0.45,
    throughBall: 0.35,
    dribble: 0.65,
  },
};

const ACTION_ATTRIBUTES = {
  shoot: ["finishing", "shooting", "composure"],
  pass: ["shortPassing", "passing", "vision"],
  throughBall: ["vision", "longPassing", "passing"],
  switch: ["longPassing", "vision", "passing"],
  dribble: ["dribbling", "ballControl", "agility"],
  cross: ["crossing", "curve", "passing"],
  intercept: ["interceptions", "defensiveAwareness", "defending"],
  tackle: ["standingTackle", "defending", "strength"],
  block: ["defensiveAwareness", "reactions", "defending"],
  trackBack: ["stamina", "sprintSpeed", "defending"],
  run: ["attackingPositioning", "acceleration", "pace"],
  overlap: ["stamina", "acceleration", "crossing"],
  hold: ["ballControl", "composure", "dribbling"],
  clear: ["headingAccuracy", "strength", "defending"],
  rush: ["positioning", "speed", "reflexes"],
  distribute: ["kicking", "longPassing", "passing"],
};
const HOOKS = {
  shoot: "shoot",
  pass: "shortPass",
  throughBall: "throughPass",
  switch: "longPass",
  dribble: "dribble",
  cross: "crossAccuracy",
  intercept: "intercept",
  tackle: "slideTackle",
  block: "block",
  trackBack: "trackBack",
  run: "run",
  overlap: "cross",
  clear: "aerialDefense",
  rush: "rushOut",
  distribute: "farThrow",
  hold: "retention",
};
const POS_SHOOT = new Set(["ST", "LW", "RW", "AM", "CAM", "CM"]);

export function playerLevel(player) {
  const overall = Number(player?.overall ?? player?.ovr ?? 50);
  return (
    PLAYER_LEVELS.find((level) => overall >= level.min) ?? PLAYER_LEVELS.at(-1)
  );
}

function attribute(player, key) {
  return Number(
    player?.subAttrs?.[key] ??
      player?.gkAttrs?.[key] ??
      player?.attrs?.[key] ??
      player?.attrs?.[
        key === "finishing"
          ? "shooting"
          : key === "composure" || key === "vision"
            ? "passing"
            : key === "ballControl" || key === "agility" || key === "dribbling"
              ? "dribbling"
              : key === "crossing" ||
                  key === "curve" ||
                  key === "longPassing" ||
                  key === "shortPassing"
                ? "passing"
                : key === "defensiveAwareness" ||
                    key === "standingTackle" ||
                    key === "interceptions" ||
                    key === "headingAccuracy"
                  ? "defending"
                  : key === "strength" || key === "stamina"
                    ? "physical"
                    : key === "acceleration" ||
                        key === "sprintSpeed" ||
                        key === "pace"
                      ? "pace"
                      : key
      ] ??
      60,
  );
}

export function actionAbility(player, action, context = {}) {
  const keys = ACTION_ATTRIBUTES[action] ?? ["overall"];
  const attributeScore =
    keys.reduce((sum, key) => sum + attribute(player, key), 0) / keys.length;
  const level = playerLevel(player);
  const fatigue = clamp((player.fatigue ?? 0) / 100, 0, 1);
  const stamina = attribute(player, "stamina");
  const form = clamp(((player.form ?? 50) - 50) / 100, -0.12, 0.12);
  const confidence = clamp(
    ((player.confidence ?? player.morale ?? 60) - 60) / 250,
    -0.12,
    0.12,
  );
  const sharpness = clamp(((player.sharpness ?? 70) - 70) / 300, -0.1, 0.1);
  const relentlessness = playStyleEffect(player, "fatigue", { position:context.position ?? player.position, attribute:stamina, suitability:fatigue });
  const condition = clamp(
    1 - fatigue * (0.18 + (100 - stamina) * 0.0012) * (relentlessness < 1 ? relentlessness : 1),
    0.72,
    1.05,
  );
  const style = HOOKS[action]
    ? playStyleEffect(player, HOOKS[action], {
        position: context.position ?? player.position,
        attribute: attributeScore,
        pressure: context.pressure ?? 0,
        suitability: context.suitability ?? 0.8,
      })
    : 1;
  return clamp(
    (attributeScore / 100) *
      (1 + level.decision * 0.35 + form + confidence + sharpness) *
      condition *
      style,
    0.12,
    1.22,
  );
}

function situationFactor(action, context, player) {
  const position = context.position ?? player.position;
  const scoreDiff = (context.scoreFor ?? 0) - (context.scoreAgainst ?? 0);
  const late = (context.minute ?? 0) >= 70;
  const chase =
    late && scoreDiff < 0 ? 1 + Math.min(0.3, Math.abs(scoreDiff) * 0.1) : 1;
  const protect =
    late && scoreDiff > 0 ? 1 - Math.min(0.28, scoreDiff * 0.08) : 1;
  const pressure = clamp(context.pressure ?? 0.25, 0, 1);
  const space = clamp(context.space ?? 0.5, 0, 1);
  let factor = 1;
  if (action === "shoot")
    factor *=
      (context.shotQuality ?? 0.48) *
      chase *
      (scoreDiff > 0 && late ? 0.76 : 1);
  if (action === "throughBall")
    factor *=
      (context.laneQuality ?? 0.5) *
      (1 + (player.attrs?.passing ?? 60) / 500) *
      chase;
  if (action === "pass" || action === "switch")
    factor *= context.laneQuality == null ? 0.8 : 0.4 + context.laneQuality;
  if (action === "dribble")
    factor *= (0.65 + space * 0.6) * (1 - pressure * 0.25);
  if (action === "cross") factor *= context.crossOpportunity ?? 0.55;
  if (action === "run" || action === "overlap")
    factor *= space * (1 - fatigue(player) * 0.3);
  if (["intercept", "tackle", "block", "trackBack", "clear"].includes(action))
    factor *= context.defensiveNeed ?? (scoreDiff < 0 && late ? 0.85 : 1);
  if (action === "hold")
    factor *= (context.possessionNeed ?? 0.5) > 0.6 ? 1.2 : 0.75;
  if (["pass", "hold", "trackBack", "intercept"].includes(action))
    factor *= protect;
  const style = context.tactics ?? context.coachStyle;
  if (
    ["Possession", "Tiki-Taka"].includes(style) &&
    ["pass", "hold", "switch"].includes(action)
  )
    factor *= 1.12;
  if (
    ["Counter", "Direct", "Long Ball"].includes(style) &&
    ["run", "throughBall", "switch"].includes(action)
  )
    factor *= 1.12;
  if (["Wing Play"].includes(style) && ["cross", "overlap"].includes(action))
    factor *= 1.12;
  if (
    ["High Press", "Gegenpressing"].includes(style) &&
    ["intercept", "tackle", "trackBack"].includes(action)
  )
    factor *= 1.08;
  if (position === "GK" && action === "rush")
    factor *= context.throughBallThreat ? 1.45 : 0.55;
  return Math.max(0.03, factor);
}
function fatigue(player) {
  return clamp((player.fatigue ?? 0) / 100, 0, 1);
}

/** Select among position-appropriate actions using the player's skills and match context. */
export function decidePlayerAction(player, context = {}, rng = null) {
  const position = context.position ?? player.position ?? "CM";
  const profile = POSITION_ACTIONS[position] ?? POSITION_ACTIONS.CM;
  const candidates = Object.entries(profile).map(([action, roleWeight]) => {
    const ability = actionAbility(player, action, { ...context, position });
    const situation = situationFactor(action, context, player);
    const experience = clamp(((player.age ?? 25) - 18) / 20, -0.08, 0.12);
    const consistency = playerLevel(player).consistency;
    const probability = clamp(
      0.45 +
        playerLevel(player).decision +
        (attribute(player, ACTION_ATTRIBUTES[action]?.[0] ?? "overall") - 60) *
          0.0013 +
        experience * 0.25,
      0.22,
      0.88,
    );
    return {
      action,
      weight: Math.max(0.001, roleWeight * ability * situation * probability),
      ability,
      probability,
      consistency,
    };
  });
  const selected = rng?.weightedPick
    ? rng.weightedPick(candidates, (item) => item.weight * (item.action === "throughBall" && (context.laneQuality ?? 0) > 0.8 ? 3.2 : item.action === "shoot" && (context.shotQuality ?? 0) > 0.8 ? 1.8 : 1))
    : candidates.sort((a, b) => b.weight - a.weight)[0];
  const decisionQuality = clamp(
    (selected?.probability ?? 0.5) + playerLevel(player).decision * 0.35,
    0.15,
    0.97,
  );
  const successChance = clamp(
    (selected?.ability ?? 0.5) *
      (0.72 + decisionQuality * 0.28) *
      (1 - clamp(context.pressure ?? 0, 0, 1) * 0.22),
    0.08,
    0.96,
  );
  return {
    action: selected?.action ?? "pass",
    decisionQuality,
    successChance,
    ability: selected?.ability ?? 0.5,
    tier: playerLevel(player).label,
  };
}

const BASE_VOLUME = {
  GK: [25, 0.3, 0.1, 0.1, 0],
  CB: [48, 0.8, 1.7, 1.8, 2.4],
  LB: [48, 1.2, 1.4, 1.4, 1.3],
  RB: [48, 1.2, 1.4, 1.4, 1.3],
  DM: [55, 0.9, 2.1, 2.4, 1.6],
  CM: [57, 1.5, 1.6, 1.5, 0.8],
  AM: [43, 2.4, 0.9, 0.7, 0.5],
  LW: [40, 2, 0.9, 0.7, 0.5],
  RW: [40, 2, 0.9, 0.7, 0.5],
  ST: [29, 1.3, 0.6, 0.5, 2.2],
};

/** Fast event/stat estimate for a single NPC match appearance; used in batch and full matches. */
export function simulateNpcPerformance(player, context = {}, rng) {
  const position = context.position ?? player.position ?? "CM";
  ensurePlayStyles(player);
  const [passes, keys, tackles, interceptions, aerials] =
    BASE_VOLUME[position] ?? BASE_VOLUME.CM;
  const minutes = clamp(context.minutes ?? 90, 0, 120);
  const scale = minutes / 90;
  const level = playerLevel(player);
  const pressure = clamp(context.pressure ?? 0.25, 0, 1);
  const passDecision = decidePlayerAction(
    player,
    { ...context, position, pressure, laneQuality: 0.72 },
    rng,
  );
  const attackDecision = decidePlayerAction(
    player,
    {
      ...context,
      position,
      pressure,
      shotQuality: 0.64,
      laneQuality: 0.6,
      space: 0.65,
    },
    rng,
  );
  const defensiveDecision = decidePlayerAction(
    player,
    { ...context, position, pressure, defensiveNeed: 0.8 },
    rng,
  );
  const passingAbility = actionAbility(player, "pass", {
    ...context,
    position,
    pressure,
  });
  const shootingAbility = actionAbility(player, "shoot", {
    ...context,
    position,
    pressure,
  });
  const dribbleAbility = actionAbility(player, "dribble", {
    ...context,
    position,
    pressure,
  });
  const defenseAbility =
    (actionAbility(player, "tackle", { ...context, position, pressure }) +
      actionAbility(player, "intercept", { ...context, position, pressure })) /
    2;
  const aerialAbility = actionAbility(player, "clear", {
    ...context,
    position,
    pressure,
  });
  const draw = (rate) => Math.max(0, rng.poisson(Math.max(0.01, rate * scale)));
  const passAttempts = draw(
    passes *
      clamp(0.78 + (attribute(player, "passing") - 60) * 0.006, 0.55, 1.25),
  );
  const passAccuracy = clamp(
    0.66 +
      (attribute(player, "passing") - 60) * 0.0031 +
      (passDecision.decisionQuality - 0.5) * 0.14 -
      pressure * 0.08,
    0.42,
    0.96,
  );
  const completedPasses = binomial(passAttempts, passAccuracy, rng);
  const shots = draw(
    (BASE_VOLUME[position]?.[0] === 0
      ? 0
      : position === "ST"
        ? 2.2
        : ["LW", "RW", "AM"].includes(position)
          ? 1.45
          : position === "CM"
            ? 0.75
            : 0.18) *
      (0.75 + shootingAbility * 0.48),
  );
  const onTarget = binomial(
    shots,
    clamp(0.23 + shootingAbility * 0.37, 0.15, 0.75),
    rng,
  );
  const dribbles = draw(
    (["LW", "RW", "AM", "ST"].includes(position)
      ? 2.4
      : ["CM", "LB", "RB"].includes(position)
        ? 1.1
        : 0.35) *
      (0.65 + dribbleAbility * 0.55),
  );
  const dribblesWon = binomial(
    dribbles,
    clamp(0.34 + dribbleAbility * 0.42 - pressure * 0.12, 0.18, 0.88),
    rng,
  );
  const tackleAttempts = draw(
    tackles * (0.75 + (context.defensiveNeed ?? 0.5) * 0.45),
  );
  const tacklesWon = binomial(
    tackleAttempts,
    clamp(0.3 + defenseAbility * 0.45, 0.16, 0.85),
    rng,
  );
  const interceptionCount = draw(
    interceptions *
      (0.68 + defensiveDecision.decisionQuality * 0.55) *
      (1 + playerLevel(player).decision * 0.2),
  );
  const aerialCount = draw(aerials);
  const aerialsWon = binomial(
    aerialCount,
    clamp(0.3 + aerialAbility * 0.48, 0.15, 0.86),
    rng,
  );
  // Goalkeeping statistics are only ever credited to a goalkeeper. An outfielder who
  // happens to make a last-ditch block does not accumulate saves, clean sheets or a
  // save percentage.
  const shotsOnTarget = draw(context.opponentShotsOnTarget ?? 3);
  const saves =
    position === "GK"
      ? binomial(
          shotsOnTarget,
          clamp(
            goalkeeperSaveFactor(player.gkAttrs, {
              kind: "shotStopping",
              overall: Number(player.overall) || 60,
            }) * (1 - pressure * 0.12),
            0.2,
            0.88,
          ),
          rng,
        )
      : 0;
  const performance = {
    minutes,
    passAttempts,
    completedPasses,
    keyPasses: Math.min(
      draw(keys * (0.6 + passingAbility * 0.55)),
      Math.ceil(passAttempts / 5),
    ),
    shots,
    shotsOnTarget: onTarget,
    dribbles,
    dribblesWon,
    tackleAttempts,
    tacklesWon,
    interceptions: interceptionCount,
    aerials: aerialCount,
    aerialsWon,
    saves,
    ...(position === "GK"
      ? {
          shotsFaced: shotsOnTarget,
          goalsConceded: Math.max(0, shotsOnTarget - saves),
          cleanSheets: shotsOnTarget === 0 ? 1 : 0,
          penaltySaves: 0,
          savePercentage:
            shotsOnTarget > 0 ? round((saves / shotsOnTarget) * 100, 1) : 0,
        }
      : {}),
    decisionQuality: round(
      (passDecision.decisionQuality +
        attackDecision.decisionQuality +
        defensiveDecision.decisionQuality) /
        3,
      3,
    ),
    evidence: {
      passing: completedPasses / 45,
      shooting: onTarget / 2,
      dribbling: dribblesWon / 2,
      defending: tacklesWon / 2 + interceptionCount / 2,
      physical: aerialsWon / 2,
      goalkeeping: saves / 2,
    },
    goals: 0,
    assists: 0,
    possessionLosses: Math.max(0, passAttempts - completedPasses),
  };
  performance.rating = rateNpcPerformance(player, performance, context);
  return performance;
}

function binomial(n, probability, rng) {
  let successes = 0;
  for (let index = 0; index < n; index++)
    if (rng.chance(probability)) successes++;
  return successes;
}

export function rateNpcPerformance(player, stats = {}, context = {}) {
  const position = context.position ?? player.position ?? "CM";
  const minutes = Math.max(1, stats.minutes ?? 90);
  const per90 = (value) => (Number(value ?? 0) * 90) / minutes;
  const safe = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const weights = {
    GK: { saves: 0.12, pass: 0.006, defense: 0.015, concession: -0.22 },
    CB: {
      defense: 0.105,
      aerial: 0.085,
      pass: 0.009,
      key: 0.07,
      concession: -0.18,
    },
    LB: {
      defense: 0.075,
      aerial: 0.035,
      pass: 0.008,
      key: 0.12,
      dribble: 0.08,
      concession: -0.13,
    },
    RB: {
      defense: 0.075,
      aerial: 0.035,
      pass: 0.008,
      key: 0.12,
      dribble: 0.08,
      concession: -0.13,
    },
    DM: {
      defense: 0.09,
      aerial: 0.035,
      pass: 0.009,
      key: 0.08,
      concession: -0.11,
    },
    CM: { defense: 0.055, aerial: 0.02, pass: 0.009, key: 0.11, dribble: 0.07 },
    AM: { defense: 0.025, pass: 0.007, key: 0.15, dribble: 0.09, shots: 0.06 },
    LW: { defense: 0.02, pass: 0.006, key: 0.13, dribble: 0.1, shots: 0.08 },
    RW: { defense: 0.02, pass: 0.006, key: 0.13, dribble: 0.1, shots: 0.08 },
    ST: { defense: 0.015, pass: 0.005, key: 0.06, dribble: 0.06, shots: 0.1 },
  }[position] ?? { defense: 0.05, pass: 0.008, key: 0.08 };
  const passAcc = stats.passAttempts
    ? safe(stats.completedPasses) / safe(stats.passAttempts)
    : 0.7;
  const scaleActions = position === "GK" || position === "CB" || position === "ST" ? 2.2 : 3.3;
  let contribution =
    (passAcc - 0.72) * 2.2 +
    Math.min(5, per90(safe(stats.keyPasses))) * (weights.key ?? 0) +
    Math.min(5, per90(safe(stats.tacklesWon) + safe(stats.interceptions))) * (weights.defense ?? 0) +
    Math.min(5, per90(safe(stats.aerialsWon))) * (weights.aerial ?? 0) +
    Math.min(5, per90(safe(stats.dribblesWon))) * (weights.dribble ?? 0) +
    Math.min(5, per90(safe(stats.shotsOnTarget))) * (weights.shots ?? 0) +
    Math.min(6, per90(safe(stats.saves))) * (weights.saves ?? 0) +
    safe(stats.goals) * (position === "GK" ? 0.8 : position === "ST" ? 0.78 : 0.5) +
    safe(stats.assists) * 0.42;
  contribution += context.won ? 0.18 : context.drew ? 0.03 : -0.12;
  contribution += Math.min(scaleActions, per90(safe(stats.saves))) * (weights.saves ?? 0) * 4.0;
  contribution += Math.min(scaleActions, per90(safe(stats.tacklesWon) + safe(stats.interceptions))) * (weights.defense ?? 0) * 3.0;
  contribution += Math.min(scaleActions, per90(safe(stats.aerialsWon))) * (weights.aerial ?? 0) * 2.4;
  contribution +=
    Math.max(
      0,
      Number(context.goalsConceded ?? 0) - (position === "GK" ? 1.2 : 1.8),
    ) * (weights.concession ?? 0);
  contribution -= Math.max(0, Number(stats.errors ?? 0)) * 0.35;
  contribution -= Math.max(0, Number(stats.possessionLosses ?? 0) - 4) * 0.025;
  // Overall/attributes change execution likelihood and thus stats, not the rating baseline.
  return round(
    clamp(6.45 + contribution + Number(context.formShift ?? 0), 4.0, 9.8),
    1,
  );
}
