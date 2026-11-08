/**
 * Turning two clubs into baseline expected-goals values.
 *
 * The values guide the event engine's attacking opportunity rate and also feed the
 * pre-match probability preview. Actual match scores come from simulated actions.
 */

import { clamp, round } from "../core/util.mjs";

/** League-average strength. All club ratings are expressed relative to this. */
export const LEAGUE_BASELINE = 68;

export const MATCH_DEFAULTS = {
  // Expected goals in a completely even match at a neutral venue.
  baseGoals: 1.38,
  // How strongly a one-point attack/defence advantage moves expected goals. The slopes
  // are intentionally strong enough to distinguish team quality in previews and matches.
  attackSlope: 0.07,
  defenceSlope: 0.07,
  // Home advantage, in expected goals, applied to the home side only.
  homeAdvantage: 0.28,
  // Clamp on expected goals so freak results stay merely improbable, not absurd.
  minXg: 0.15,
  maxXg: 4.6,
};

export function normalizeTeamStrength(strength = {}) {
  const source = strength && typeof strength === "object" ? strength : {};
  const attack = Number(source.attack);
  const midfield = Number(source.midfield);
  const defence = Number(source.defence);
  const goalkeeping = Number(source.goalkeeping);
  const fallback = LEAGUE_BASELINE;
  return {
    ...source,
    attack: Number.isFinite(attack) ? attack : fallback,
    midfield: Number.isFinite(midfield) ? midfield : (Number.isFinite(attack) ? attack : fallback),
    defence: Number.isFinite(defence) ? defence : fallback,
    goalkeeping: Number.isFinite(goalkeeping) ? goalkeeping : fallback,
  };
}

/** Convert the 0..10 club booster into a deliberately modest match multiplier. */
export function teamBoosterMultiplier(booster = 0) {
  const value = clamp(Number(booster) || 0, 0, 10);
  return 1 + value * 0.0045;
}

/**
 * Expected goals for each side.
 *
 * @param {object} home  { attack, defence } for the home club
 * @param {object} away  { attack, defence } for the away club
 * @param {object} ctx   { neutralVenue, homeMod, awayMod, weather, matchImportance }
 */
export function expectedGoals(home, away, ctx = {}) {
  const cfg = { ...MATCH_DEFAULTS, ...(ctx.cfg ?? {}) };
  const neutral = !!ctx.neutralVenue;
  home = normalizeTeamStrength(home);
  away = normalizeTeamStrength(away);

  // Attack vs defence, each expressed as a deviation from the league baseline.
  // Note that the *opponent's* defence suppresses your expected goals: this is what
  // makes a strong defence useful to its own side, rather than merely self-flattering.
  const homeBooster = teamBoosterMultiplier(home.booster);
  const awayBooster = teamBoosterMultiplier(away.booster);
  let xgHome =
    cfg.baseGoals +
    (home.attack * homeBooster - LEAGUE_BASELINE) * cfg.attackSlope -
    (away.defence * awayBooster - LEAGUE_BASELINE) * cfg.defenceSlope;

  let xgAway =
    cfg.baseGoals +
    (away.attack * awayBooster - LEAGUE_BASELINE) * cfg.attackSlope -
    (home.defence * homeBooster - LEAGUE_BASELINE) * cfg.defenceSlope;

  xgHome -= ((away.goalkeeping ?? LEAGUE_BASELINE) - LEAGUE_BASELINE) * 0.018;
  xgAway -= ((home.goalkeeping ?? LEAGUE_BASELINE) - LEAGUE_BASELINE) * 0.018;

  // Home advantage lifts the home side and suppresses the away side by the same half
  // amount, so a neutral-venue match is a clean, symmetric baseline.
  if (!neutral) {
    xgHome += cfg.homeAdvantage / 2;
    xgAway -= cfg.homeAdvantage / 2;
  }

  // Situational modifiers: fatigue from a midweek European tie, pressure in a title
  // decider, a hostile crowd. Passed in rather than inferred so callers stay explicit.
  if (ctx.homeMod) xgHome *= ctx.homeMod;
  if (ctx.awayMod) xgAway *= ctx.awayMod;

  // A team chasing a game late pushes forward; this is applied by the live match engine
  // rather than here, but the hook is exposed so knockouts can use it too.
  xgHome = clamp(xgHome, cfg.minXg, cfg.maxXg);
  xgAway = clamp(xgAway, cfg.minXg, cfg.maxXg);

  return { home: round(xgHome, 3), away: round(xgAway, 3) };
}

/**
 * Probability the home side wins / draws / loses, given expected goals.
 * Computed exactly by summing Poisson terms rather than sampling, so it can be used
 * for pre-match previews and betting-style odds without consuming randomness.
 */
export function outcomeProbabilities(xgHome, xgAway, maxGoals = 9) {
  const pHome = poissonPmf(xgHome, maxGoals);
  const pAway = poissonPmf(xgAway, maxGoals);
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = pHome[i] * pAway[j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away;
  return {
    home: round(home / total, 4),
    draw: round(draw / total, 4),
    away: round(away / total, 4),
  };
}

function poissonPmf(lambda, maxK) {
  const out = [];
  let term = Math.exp(-lambda);
  for (let k = 0; k <= maxK; k++) {
    out.push(term);
    term = (term * lambda) / (k + 1);
  }
  return out;
}

/**
 * Team strength including the situational state that club.strength() can't know about:
 * a midweek fixture hangover, a morale crisis, an important match.
 */
export function matchStrength(club, players, dayIndex) {
  const base = club.strength(players, dayIndex);

  // Average fatigue and morale across the likely starters, not the whole squad, so a
  // handful of tired reserves don't drag the rating down.
  const squad = players.filter((p) =>
    club.squad.includes(p.id) && !p.injury && !(p.suspensionWeeks > 0),
  );
  const key = squad
    .slice()
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
    .slice(0, 14);
  const goalkeeper = squad
    .filter((p) => p.position === "GK")
    .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
  const goalkeeping = goalkeeper
    ? (["reflexes", "diving", "handling", "positioning", "reactions"]
      .reduce(
        (sum, attribute) =>
          sum +
          (goalkeeper.gkAttrs?.[attribute] ??
            goalkeeper.subAttrs?.[attribute] ??
            (attribute === "diving" || attribute === "reactions"
              ? goalkeeper.gkAttrs?.reflexes
              : null) ??
            60),
        0,
      ) / 5)
    : (base.goalkeeping ?? LEAGUE_BASELINE);

  const avgFatigue = key.length
    ? key.reduce((acc, p) => acc + (p.fatigue ?? 0), 0) / key.length
    : 0;
  const avgMorale = key.length
    ? key.reduce((acc, p) => acc + (p.morale ?? 60), 0) / key.length
    : 60;

  // Fatigue above 40 starts to bite; below that it is simply normal season wear.
  const fatiguePenalty = clamp((avgFatigue - 40) / 160, 0, 0.12);
  // Morale swings the side by up to ±4%: real, but never enough to overturn quality.
  const moraleFactor = 0.96 + clamp((avgMorale - 50) / 50, -1, 1) * 0.04;
  const managerBonus = clamp(((club.manager?.rating ?? 60) - 60) * 0.035, -1.4, 1.4);
  const coaching = club.manager?.coachingAttributes ?? {};
  const preparationFactor = 1 + clamp(((coaching.matchPreparation ?? 50) - 50) * 0.0008, -0.04, 0.04);
  const motivationFactor = 1 + clamp(((coaching.motivation ?? 50) - 50) * 0.0005, -0.025, 0.025);
  const playstyle = club.manager?.playstyle ?? club.manager?.style ?? "Balanced";
  const tacticalEffects = {
    Possession: { attack: 1.02, defence: 1, passing: 1.05 },
    "High Press": { attack: 1.04, defence: 0.98, pressing: 1.08 },
    Counter: { attack: 1.04, defence: 1.03 },
    "Tiki-Taka": { attack: 1.03, defence: 0.99, passing: 1.06 },
    "Wing Play": { attack: 1.04, defence: 0.98 },
    Gegenpressing: { attack: 1.03, defence: 0.97, pressing: 1.1 },
    Direct: { attack: 1.02, defence: 1.01 },
    "Low Block": { attack: 0.95, defence: 1.07 },
    "Long Ball": { attack: 1.01, defence: 1.01 },
    Balanced: { attack: 1, defence: 1 },
  }[playstyle] ?? { attack: 1, defence: 1 };
  const pressingWear = tacticalEffects.pressing ? clamp(avgFatigue / 1000, 0, 0.04) : 0;
  const chemistry = clamp((base.chemistry ?? 60) / 100, 0.9, 1.03);
  const tacticalFamiliarity = clamp(
    (base.tacticalFamiliarity ?? 60) / 100,
    0.9,
    1.03,
  );
  const fitness = clamp((base.fitness ?? 80) / 100, 0.78, 1.03);
  const depth = clamp(
    1 + ((base.squadDepth ?? 60) - (base.matchdayOverall ?? 60)) * 0.0015,
    0.94,
    1.04,
  );
  const teamPreparation =
    chemistry * tacticalFamiliarity * fitness * depth;

  return {
    ...base,
    booster: club.booster ?? 0,
    attack: round(base.attack * tacticalEffects.attack * preparationFactor * motivationFactor * (1 - fatiguePenalty - pressingWear) * moraleFactor * teamPreparation + managerBonus, 2),
    midfield: round((base.midfield ?? base.overall) * tacticalEffects.attack ** 0.35 * teamPreparation, 2),
    defence: round(base.defence * tacticalEffects.defence * preparationFactor * motivationFactor * (1 - fatiguePenalty) * moraleFactor * teamPreparation + managerBonus, 2),
    managerBonus: round(managerBonus, 2),
    avgFatigue: round(avgFatigue, 1),
    avgMorale: round(avgMorale, 1),
    goalkeeping: round(goalkeeping, 2),
    chemistry: round(chemistry, 3),
    tacticalFamiliarity: round(tacticalFamiliarity, 3),
    fitness: round(fitness, 3),
    depth: round(depth, 3),
    playstyle,
    tacticalPassing: tacticalEffects.passing ?? 1,
    tacticalPressing: tacticalEffects.pressing ?? 1,
  };
}
