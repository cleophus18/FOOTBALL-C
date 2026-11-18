import { clamp, round } from "../core/util.mjs";
import { eliteProfileFor } from "../model/elite.mjs";
import { actionAbility, decidePlayerAction } from "./playerintelligence.mjs";
import { ROLE_MODIFIERS } from "./playermatch.mjs";
import { goalkeeperQuality } from "../model/goalkeeper.mjs";
import { groupOf } from "../core/constants.mjs";

const POSSESSION_COUNT = 70;

const PASS_WEIGHT = {
  GK: 0.2,
  CB: 1.1,
  LB: 1.15,
  RB: 1.15,
  DM: 1.6,
  CDM: 1.6,
  CM: 1.8,
  AM: 1.6,
  CAM: 1.6,
  LW: 0.9,
  RW: 0.9,
  ST: 0.55,
};

function skill(player, keys, fallback = 55) {
  for (const key of keys) {
    const value =
      player.attrs?.[key] ??
      player.gkAttrs?.[key] ??
      player.subAttrs?.[key];
    if (Number.isFinite(Number(value))) return Number(value);
  }
  // A goalkeeper's missing attribute must not fall back to an outfield group value:
  // that would import a striker's shooting as "reflexes". Use the shared estimator.
  const isGoalkeeperKeys = keys.some((key) =>
    ["reflexes", "diving", "handling", "positioning", "kicking", "speed", "reactions", "jumping", "composure"].includes(key),
  );
  if (isGoalkeeperKeys && normalizeGkPosition(player)) {
    const overall = Number(player.overall) || fallback;
    return goalkeeperQuality(player.gkAttrs, {
      kind: keys.includes("handling")
        ? "handling"
        : keys.includes("positioning")
          ? "positioning"
          : keys.includes("kicking")
            ? "distribution"
            : "reflexes",
      overall,
    });
  }
  return Number(player.overall) || fallback;
}

function normalizeGkPosition(player) {
  return (player.position ?? "").toUpperCase() === "GK";
}

function productionFactor(player, category) {
  const profile = eliteProfileFor(player);
  return clamp(profile?.[category] ?? 1, 0.2, 1.1);
}

function playerStat(player, stats, key, amount = 1) {
  if (!player?.id) return;
  const record = stats[player.id] ?? {
    minutes: 0,
    passAttempts: 0,
    completedPasses: 0,
    keyPasses: 0,
    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    assists: 0,
    dribbles: 0,
    dribblesWon: 0,
    duels: 0,
    duelsWon: 0,
    tackleAttempts: 0,
    tacklesWon: 0,
    interceptions: 0,
    aerials: 0,
    aerialsWon: 0,
    saves: 0,
    goalsConceded: 0,
    foulsCommitted: 0,
    foulsWon: 0,
    yellowCards: 0,
    redCards: 0,
    possessionLosses: 0,
  };
  record[key] = (record[key] ?? 0) + amount;
  stats[player.id] = record;
  return record;
}

/** The goalkeeper currently on the pitch for a team, or null. */
function keeperOf(team) {
  return team.xi.find((player) => player.position === "GK") ?? null;
}

function pickOutfield(team, rng, weightOf) {
  const players = team.xi.filter((player) => player.position !== "GK");
  return rng.weightedPick(players, (player) => weightOf(player));
}

function pickDefender(team, rng) {
  const defenders = team.xi.filter((player) =>
    ["CB", "LB", "RB", "DM", "CDM", "CM"].includes(player.position),
  );
  const pool = defenders.length
    ? defenders
    : team.xi.filter((player) => player.position !== "GK");
  return rng.weightedPick(
    pool,
    (player) =>
      Math.max(
        0.1,
        skill(player, ["defensiveAwareness", "defending"]) *
          0.55 +
          skill(player, ["interceptions", "reactions"]) * 0.25 +
          skill(player, ["standingTackle", "strength"]) * 0.2,
      ),
  );
}

function styleOf(team) {
  return (
    team.club?.manager?.playstyle ??
    team.club?.manager?.style ??
    team.tactics ??
    "Balanced"
  );
}

function roleEffect(team, player, effect) {
  const role = team.roles?.[player.id];
  return ROLE_MODIFIERS[role]?.[effect] ?? 1;
}

function teamContext(team, opponent, baselineXg, side, neutralVenue) {
  const style = styleOf(team);
  const shape = team.shape ?? {};
  const coaching = team.club?.manager?.coachingAttributes ?? {};
  const manager = team.club?.manager ?? {};
  const attack =
    Number(team.strength?.attack ?? 65) * Number(shape.attack ?? 1);
  const midfield =
    Number(team.strength?.midfield ?? attack) *
    Number(shape.midfield ?? 1);
  const defence =
    Number(team.strength?.defence ?? 65) * Number(shape.defence ?? 1);
  const opponentDefence =
    Number(opponent.strength?.defence ?? 65) *
    Number(opponent.shape?.defence ?? 1);
  const fitness = clamp(
    team.xi.reduce(
      (sum, player) =>
        sum +
        (Number.isFinite(player.fitness) ? player.fitness : 100) -
        clamp(Number(player.fatigue) || 0, 0, 100) * 0.25,
      0,
    ) / Math.max(1, team.xi.length),
    45,
    100,
  );
  const stamina = team.xi.length
    ? team.xi.reduce(
        (sum, player) => sum + skill(player, ["stamina", "physical"]),
        0,
      ) / team.xi.length
    : 60;
  const pressSetting =
    team.club?.manager?.tacticalSettings?.pressing ??
    (["High Press", "Gegenpressing"].includes(style) ? "Aggressive" : "Balanced");
  const defensiveLine =
    team.club?.manager?.tacticalSettings?.defensiveLine ??
    team.defensiveLine ??
    "Balanced";
  const press = pressSetting === "Aggressive" ? 1.12 : pressSetting === "Low" ? 0.88 : 1;
  const familiarity = clamp(
    Number(team.strength?.tacticalFamiliarity ?? 75) / 100,
    0.85,
    1.04,
  );
  const chemistry = clamp(Number(team.strength?.chemistry ?? 75) / 100, 0.88, 1.04);
  const tacticalKnowledge = clamp(
    Number(coaching.tacticalIntelligence ?? manager.tacticalKnowledge ?? manager.rating ?? 60),
    1,
    99,
  );
  const adaptability = clamp(
    Number(coaching.inGameDecisionMaking ?? manager.flexibility ?? manager.rating ?? 60),
    1,
    99,
  );
  const homeBoost = !neutralVenue && side === "home" ? 1.05 : 1;
  const formation =
    team.club?.formation ??
    team.formation ??
    "4-3-3";
  const formationStyle = {
    "4-3-3": { attack: 1.035, midfield: 1.025, width: 1.08 },
    "4-2-3-1": { attack: 1.01, midfield: 1.04, width: 1.02 },
    "3-5-2": { attack: 1.015, midfield: 1.055, width: 0.96 },
    "4-4-2": { attack: 1.035, midfield: 0.99, width: 1 },
    "5-3-2": { attack: 0.97, midfield: 0.99, width: 0.93 },
    "4-1-4-1": { attack: 0.98, midfield: 1.04, width: 1.02 },
  }[formation] ?? { attack: 1, midfield: 1, width: 1 };
  const styleFactors = {
    Possession: { progression: 0.92, pass: 1.08, press: 0.95 },
    "Tiki-Taka": { progression: 0.9, pass: 1.1, press: 0.98 },
    Counter: { progression: 1.16, pass: 0.97, press: 1.02 },
    "High Press": { progression: 1.04, pass: 0.96, press: 1.12 },
    Gegenpressing: { progression: 1.02, pass: 0.94, press: 1.15 },
    "Wing Play": { progression: 1.08, pass: 0.97, press: 1 },
    Direct: { progression: 1.18, pass: 0.91, press: 0.98 },
    "Long Ball": { progression: 1.16, pass: 0.9, press: 0.94 },
    "Low Block": { progression: 1.02, pass: 1.02, press: 0.84 },
  }[style] ?? { progression: 1, pass: 1, press: 1 };
  const tacticalPress = press * styleFactors.press;
  const skillQuality = team.xi.length
    ? team.xi.reduce(
        (sum, player) =>
          sum +
          skill(player, ["passing", "vision", "shortPassing"]) * 0.34 +
          skill(player, ["dribbling", "ballControl"]) * 0.22 +
          skill(player, ["pace", "sprintSpeed"]) * 0.14 +
          skill(player, ["attackingPositioning", "positioning"]) * 0.15 +
          skill(player, ["finishing", "shooting"]) * 0.15,
        0,
      ) / team.xi.length
    : 60;
  const attackingEdge = clamp((attack - opponentDefence) / 100, -0.18, 0.18);
  const coachEffect = clamp((tacticalKnowledge - 60) * 0.0007, -0.035, 0.035);
  const familiarityEffect = familiarity * chemistry;
  const skillEffect = clamp((skillQuality - 65) * 0.0005, -0.025, 0.025);

  return {
    style,
    defensiveLine,
    formation,
    formationStyle,
    styleFactors,
    press: tacticalPress,
    familiarity,
    chemistry,
    fitness,
    stamina,
    tacticalKnowledge,
    adaptability,
    midfield,
    attack,
    defence,
    opponentDefence,
    skillQuality,
    attackingEdge,
    coachEffect,
    familiarityEffect,
    skillEffect,
    homeBoost,
    baselineXg,
    chanceRate: clamp(
      0.09 +
        baselineXg * 0.06 +
        attackingEdge * 0.08 +
        (formationStyle.attack - 1) * 0.6 +
        (Number(shape.attack ?? 1) - 1) * 0.08 +
        coachEffect +
        skillEffect +
        (homeBoost - 1) * 0.2,
      0.075,
      0.3,
    ),
  };
}

function shotOpportunity(
  actor,
  team,
  opponent,
  zone,
  pressure,
  minute,
  rng,
  canScore,
) {
  const wide = ["LW", "RW", "LB", "RB"].includes(actor.position);
  const oneOnOne = zone > 0.78 && pressure < 0.3 && rng.chance(0.22);
  const header = rng.chance(
    wide && team.style === "Wing Play" ? 0.25 : 0.1,
  );
  const distance = oneOnOne
    ? rng.range(7, 13)
    : header
      ? rng.range(8, 17)
      : zone > 0.72
        ? rng.range(10, 20)
        : zone > 0.48
          ? rng.range(18, 27)
          : rng.range(25, 34);
  const widthAngle = (1 - Number(team.formationStyle?.width ?? 1)) * 30;
  const angle = clamp(
    (wide ? rng.range(18, 58) : rng.range(2, 36)) +
      (1 - zone) * 12 +
      widthAngle,
    0,
    70,
  );
  const shotType = oneOnOne
    ? "oneOnOne"
    : header
      ? "header"
      : distance >= 25
        ? "longRange"
        : "regular";
  const typeFactor =
    shotType === "header" ? 0.72 : shotType === "oneOnOne" ? 1.18 : 1;
  const xg = clamp(
    0.42 *
      Math.exp(-0.078 * Math.max(0, distance - 8)) *
      Math.exp(-0.016 * angle) *
      typeFactor *
      (1 - pressure * 0.24),
    0.012,
    0.72,
  );
  const finishing = skill(actor, ["finishing", "shooting"]);
  const composure = skill(actor, ["composure", "vision"]);
  const keeper = opponent.xi.find((player) => player.position === "GK");
  // Goalkeeping is judged by the shared model: reflexes, diving, positioning, handling
  // and reactions all feed one quality number, with one-on-one situations weighted for
  // the shot type actually faced.
  const keeperQuality = keeper
    ? goalkeeperQuality(keeper.gkAttrs, {
        kind: shotType === "oneOnOne" ? "oneOnOne" : "shotStopping",
        overall: Number(keeper.overall) || 60,
      })
    : 55;
  const conversion = clamp(
    (0.82 + finishing * 0.003 + composure * 0.0015) *
      clamp(1.08 - (keeperQuality - 60) * 0.004, 0.78, 1.16) *
      productionFactor(actor, "goalMultiplier"),
    0.62,
    2.8,
  );
  const onTargetChance = clamp(
    0.32 + finishing * 0.0036 + composure * 0.001 -
      pressure * 0.1 -
      angle * 0.0015,
    0.25,
    0.78,
  );
  const defender = pickDefender(opponent, rng);
  const blockAbility = defender
    ? actionAbility(defender, "block", {
        position: defender.position,
        pressure,
        suitability: 0.8,
      })
    : 0.45;
  const blockChance = clamp(
    0.035 +
      blockAbility * 0.12 +
      (opponent.defensiveLine === "High" ? 0.025 : 0),
    0.035,
    0.21,
  );
  const blocked = !!defender && rng.chance(blockChance);
  const goal =
    canScore && !blocked && rng.chance(clamp(xg * conversion, 0.005, 0.78));
  const onTarget = !blocked && (goal || rng.chance(onTargetChance));
  const saved = onTarget && !goal;

  return {
    actor,
    defender,
    keeper,
    distance: round(distance, 1),
    angle: round(angle, 1),
    shotType,
    xg: round(xg, 3),
    onTarget,
    goal,
    saved,
    blocked,
    minute,
  };
}

function addAction(actions, action) {
  actions.push(action);
}

/**
 * Resolve a penalty kick for `side`, taken by `taker` against `opponent`. The taker
 * must be under any league goal cap. A penalty is a shot: it is counted in team and
 * player shot totals, carries xG, and is on target when scored or saved, so it flows
 * through the same statistics and event timeline as an open-play shot. Emits a
 * "penalty" misc event, a "shot" action, and a full goal event when scored. Returns
 * whether it scored.
 */
export function scorePenalty({
  side,
  taker,
  opponent,
  playerStats,
  score,
  stats,
  events,
  misc,
  actions,
  rng,
  maxLeagueGoals,
  minute,
}) {
  const defendingSide = side === "home" ? "away" : "home";
  const teamStats = stats[side];
  const opponentStats = stats[defendingSide];
  const keeper = opponent.xi.find((player) => player.position === "GK");
  const composure = skill(taker, ["composure", "finishing", "shooting"]);
  const keeperQuality = keeper
    ? goalkeeperQuality(keeper.gkAttrs, {
        kind: "shotStopping",
        overall: Number(keeper.overall) || 60,
      })
    : 55;
  const canScore =
    maxLeagueGoals == null ||
    (Number(taker.leagueGoals ?? taker.goals ?? taker.stats?.goals ?? 0) +
      (playerStats[taker.id]?.goals ?? 0)) <
      maxLeagueGoals;
  const conversion = clamp(
    0.76 + (composure - 60) * 0.004 - (keeperQuality - 60) * 0.002,
    0.55,
    0.9,
  );
  const goal = canScore && rng.chance(conversion);
  // Penalties are almost always on target; a saved one still counts as on target.
  const onTarget = goal || rng.chance(0.85);
  const saved = onTarget && !goal;
  const outcome = goal ? "goal" : saved ? "saved" : "missed";

  // A penalty is a shot for statistical and xG purposes.
  teamStats.shots++;
  teamStats.xg = round(teamStats.xg + 0.76, 3);
  playerStat(taker, playerStats, "shots");
  addAction(actions, {
    type: "shot",
    side,
    minute,
    playerId: taker.id,
    playerName: `${taker.first} ${taker.last}`,
    xg: 0.76,
    distance: 11,
    angle: 6,
    shotType: "penalty",
    outcome,
  });
  misc.push({
    type: "penalty",
    side,
    minute,
    playerId: taker.id,
    playerName: `${taker.first} ${taker.last}`,
    goal,
    saved,
  });

  if (onTarget) {
    teamStats.shotsOnTarget++;
    playerStat(taker, playerStats, "shotsOnTarget");
  }
  if (goal) {
    score[side]++;
    teamStats.goals++;
    playerStat(taker, playerStats, "goals");
    if (keeper) playerStat(keeper, playerStats, "goalsConceded");
    const goalEvent = {
      type: "goal",
      minute,
      side,
      scorerId: taker.id,
      scorerName: `${taker.first} ${taker.last}`,
      assistId: null,
      assistName: null,
      penalty: true,
      ownGoal: false,
      xg: 0.76,
    };
    events.push(goalEvent);
    addAction(actions, goalEvent);
  } else if (saved && keeper) {
    opponentStats.saves++;
    playerStat(keeper, playerStats, "saves");
  }
  return goal;
}

/**
 * In-match energy (0-100) for a player who has been on the pitch for `played` minutes.
 * This is the fatigue model that drives substitution decisions: a high-stamina,
 * physically strong player drains slowly, a low-stamina one fades, and the cost rises
 * with the team's pressing intensity. It is deterministic and does not consume RNG, so
 * a match in which no substitution is made is bit-for-bit identical to the pre-sub engine.
 */
function playerEnergy(player, played, press = 1) {
  const staminaAttr = skill(player, ["stamina", "physical"]);
  const position =
    player.position === "GK"
      ? 0.7
      : ["CM", "CDM", "CAM", "DM", "RM", "LM", "WB", "LWB", "RWB"].includes(
            player.position,
          )
        ? 1.12
        : 1;
  // A high stamina attribute lowers the per-minute drain (resilience < 1).
  const resilience = clamp(1 - (staminaAttr - 60) * 0.006, 0.6, 1.3);
  const drainPerMinute = 0.5 * position * resilience * clamp(press, 0.8, 1.3);
  return clamp(100 - played * drainPerMinute, 0, 100);
}

/** A single number for how good a player is for a given slot, used to rank replacements. */
function slotRating(player, slot) {
  const base = Number(player.overall) || 60;
  const groupMatch = groupOf(player.position) === groupOf(slot) ? 1 : 0.9;
  return base * groupMatch;
}

/**
 * The live energy of a player at a given minute, accounting for when they came on.
 * A fresh player is near 100; energy falls as minutes are played, faster for low
 * stamina attributes and high-pressing sides. This is the same curve that drives
 * substitution decisions, reused so in-match degradation and substitutions agree.
 */
function liveEnergyOf(player, minute, squad, press = 1) {
  if (!player) return 100;
  const entry = squad?.onPitchSince?.get(player.id) ?? 0;
  return playerEnergy(player, Math.max(0, minute - entry), press);
}

/**
 * A ~0.78..1 multiplier on a player's effectiveness from live fatigue. Players with
 * energy >= 65 are unaffected so the fresh-match model is preserved; as legs tire the
 * multiplier falls, reaching ~0.78 for an empty tank. This makes late-match fatigue a
 * real but gradual factor without rewriting every event probability.
 */
function fatigueFactorOf(player, minute, squad, press = 1) {
  const energy = liveEnergyOf(player, minute, squad, press);
  if (energy >= 65) return 1;
  return clamp(0.78 + ((energy - 15) * 0.22) / 50, 0.78, 1);
}

/**
 * A live tactical mentality for a side, in roughly [-1, 1]: positive means chasing
 * the game (attacking, higher press, more direct), negative means protecting a lead
 * (dropping the press, keeping the ball). It ramps in after ~55 minutes, grows with
 * the size of the deficit/lead, and is scaled by the manager's adaptability so a
 * cannier coach reacts more strongly. A balanced side stays at 0.
 */
export function mentalityFor(scoreFor, scoreAgainst, minute, adaptability = 60) {
  const diff = scoreFor - scoreAgainst;
  const late = clamp((minute - 55) / 30, 0, 1);
  let mentality = 0;
  if (diff < 0) mentality = late * clamp(-diff * 0.45, 0.35, 1);
  else if (diff > 0) mentality = -late * clamp(diff * 0.35, 0.3, 0.8);
  return mentality * clamp(adaptability / 70, 0.65, 1.2);
}

/**
 * Decide and, when warranted, execute one substitution for `side`. Returns the
 * substitution record when one was made, otherwise null. Tactical intent is derived
 * from the live score and minute: a side that is losing chases the game with fresh
 * legs, a side that is winning protects its lead, and a balanced side simply replaces
 * the most exhausted player. Replacements always occupy a position-compatible slot so
 * the team keeps its shape, and a substituted player never returns.
 */
function trySubstitution(squad, side, minute, scoreFor, scoreAgainst, maxSubs, totalMinutes) {
  if (!squad || squad.subsUsed >= maxSubs) return null;
  if (minute - (squad.lastSubMinute ?? 0) < 8) return null;
  // Don't waste a substitution when there is almost no time left to play: a player
  // who comes on in the final minutes would accrue ~0 minutes and add nothing.
  if (totalMinutes - minute < 5) return null;
  const onPitch = squad.xi.filter((p) => p.position !== "GK");
  if (!onPitch.length || !squad.bench.length) return null;

  const losing = scoreFor < scoreAgainst;
  const winning = scoreFor > scoreAgainst;
  // Tactical willingness: a losing side turns to its bench earlier, a winning side
  // waits a little longer but still refreshes tired legs to see the game out.
  const minMinute = losing ? 60 : winning ? 68 : 65;
  if (minute < minMinute) return null;
  const energyThreshold = losing ? 62 : winning ? 58 : 55;

  // Rank the on-pitch players by how tired they are.
  const ranked = onPitch
    .map((player) => ({
      player,
      energy: playerEnergy(
        player,
        minute - (squad.onPitchSince.get(player.id) ?? 0),
        squad.press ?? 1,
      ),
    }))
    .sort((a, b) => a.energy - b.energy);
  const candidate = ranked.find((entry) => entry.energy < energyThreshold);
  if (!candidate) return null;

  const outgoing = candidate.player;
  const outGroup = groupOf(outgoing.position);
  // The keeper is never substituted for an outfield body, and outfield players are
  // never replaced by a goalkeeper, so keepers are excluded from the available pool.
  const available = squad.bench.filter(
    (p) => !squad.usedBench.has(p.id) && p.position !== "GK",
  );
  // Prefer a like-for-like replacement; fall back to the same group, then to the best
  // available body, so the shape is preserved whenever football allows it.
  const sameSlot = available.filter(
    (p) => groupOf(p.position) === outGroup,
  );
  const pool = sameSlot.length ? sameSlot : available;
  if (!pool.length) return null;
  // A winning side leans on defensively-minded fresh legs; a losing side leans on
  // attacking ones. This only breaks ties among position-compatible options.
  const attackingNeed = losing && minute >= 70;
  const defendingNeed = winning && minute >= 70;
  const replacement = pool
    .slice()
    .sort((a, b) => {
      let delta = slotRating(b, outgoing.position) - slotRating(a, outgoing.position);
      if (attackingNeed)
        delta +=
          (groupOf(b.position) === "ATT" ? 4 : 0) -
          (groupOf(a.position) === "ATT" ? 4 : 0);
      if (defendingNeed)
        delta +=
          (groupOf(b.position) === "DEF" ? 4 : 0) -
          (groupOf(a.position) === "DEF" ? 4 : 0);
      return delta;
    })[0];

  const index = squad.xi.indexOf(outgoing);
  if (index < 0) return null;
  squad.xi[index] = replacement; // takes the vacated slot exactly
  squad.bench = squad.bench.filter((p) => p.id !== replacement.id);
  squad.usedBench.add(replacement.id);
  squad.subbedOff.add(outgoing.id);
  squad.onPitchSince.set(replacement.id, minute);
  squad.subsUsed++;
  squad.lastSubMinute = minute;
  squad.exitMinute.set(outgoing.id, minute);
  squad.appeared.push(replacement);

  return {
    type: "sub",
    side,
    minute,
    playerId: replacement.id,
    playerName: `${replacement.first} ${replacement.last}`,
    replacedId: outgoing.id,
    replacedName: `${outgoing.first} ${outgoing.last}`,
    on: true,
  };
}

export function simulatePossessionEngine({
  home,
  away,
  baselineXg,
  rng,
  neutralVenue = false,
  minutes = 90,
  maxLeagueGoals = null,
  quickBackground = false,
  enableSubs = false,
  maxSubs = 3,
}) {
  // Work on shallow clones so in-match substitutions never mutate the caller's arrays
  // (callers reuse their XI objects across matches and replays).
  const teams = {
    home: {
      ...home,
      xi: [...home.xi],
      bench: enableSubs ? [...(home.bench ?? [])] : [],
    },
    away: {
      ...away,
      xi: [...away.xi],
      bench: enableSubs ? [...(away.bench ?? [])] : [],
    },
  };
  const score = { home: 0, away: 0 };
  const actions = [];
  const events = [];
  const misc = [];
  const playerStats = {};
  const substitutions = { home: [], away: [] };
  for (const side of ["home", "away"]) {
    const squad = teams[side];
    squad.subsUsed = 0;
    squad.usedBench = new Set();
    squad.subbedOff = new Set();
    squad.onPitchSince = new Map(squad.xi.map((p) => [p.id, 0]));
    squad.exitMinute = new Map();
    squad.appeared = [...squad.xi];
    squad.lastSubMinute = 0;
    squad.press = teamContext(squad, teams[side === "home" ? "away" : "home"], 1, side, neutralVenue).press ?? 1;
  }
  const stats = {
    home: {
      goals: 0,
      xg: 0,
      possessionSeconds: 0,
      possessions: 0,
      shots: 0,
      shotsOnTarget: 0,
      passes: 0,
      passesCompleted: 0,
      tackles: 0,
      tacklesWon: 0,
      interceptions: 0,
      fouls: 0,
      offsides: 0,
      corners: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0,
    },
    away: {
      goals: 0,
      xg: 0,
      possessionSeconds: 0,
      possessions: 0,
      shots: 0,
      shotsOnTarget: 0,
      passes: 0,
      passesCompleted: 0,
      tackles: 0,
      tacklesWon: 0,
      interceptions: 0,
      fouls: 0,
      offsides: 0,
      corners: 0,
      saves: 0,
      yellowCards: 0,
      redCards: 0,
    },
  };
  const contexts = {
    home: teamContext(home, away, baselineXg.home, "home", neutralVenue),
    away: teamContext(away, home, baselineXg.away, "away", neutralVenue),
  };
  const totalPossessions = Math.max(24, Math.round(POSSESSION_COUNT * minutes / 90));
  const possessionCount = quickBackground
    ? Math.max(28, Math.round(totalPossessions * 0.42))
    : totalPossessions;
  for (let possession = 0; possession < possessionCount * 2; possession++) {
    const side = possession % 2 === 0 ? "home" : "away";
    const defendingSide = side === "home" ? "away" : "home";
    const team = teams[side];
    const opponent = teams[defendingSide];
    const context = contexts[side];
    const opponentContext = contexts[defendingSide];
    const teamStats = stats[side];
    const opponentStats = stats[defendingSide];
    if (!team.xi.length || !opponent.xi.length) continue;

    const currentMinute = Math.min(
      minutes,
      Math.floor((possession * minutes) / (totalPossessions * 2)) + 1,
    );
    // Genuine in-match substitutions: tired or tactically-selected players are replaced
    // by fresh legs from the bench, and the new player takes part in every subsequent
    // possession. Both sides are considered so the AI reacts to the flow of the game.
    if (enableSubs) {
      for (const subSide of [side, defendingSide]) {
        const sub = trySubstitution(
          teams[subSide],
          subSide,
          currentMinute,
          score[subSide],
          score[subSide === "home" ? "away" : "home"],
          maxSubs,
          minutes,
        );
        if (sub) {
          substitutions[subSide].push(sub);
          misc.push(sub);
        }
      }
    }
    teamStats.possessions++;
    teamStats.possessionSeconds +=
      rng.range(20, 45) *
      clamp(1 + (context.midfield - 65) * 0.003, 0.82, 1.18) *
      (context.style === "Possession" || context.style === "Tiki-Taka"
        ? 1.12
        : 1);
    let zone = rng.range(0.12, 0.28);
    let carrier = pickOutfield(
      team,
      rng,
      (player) =>
        (PASS_WEIGHT[player.position] ?? PASS_WEIGHT.CM) *
        (0.75 + skill(player, ["passing", "vision"]) / 200) *
        productionFactor(player, "assistMultiplier") *
        (0.7 + productionFactor(player, "goalMultiplier") * 0.45),
    );
    if (!carrier) continue;
    const passLimit =
      context.style === "Direct" || context.style === "Long Ball"
        ? rng.int(2, 4)
        : context.style === "Possession" || context.style === "Tiki-Taka"
          ? rng.int(4, 7)
          : rng.int(3, 5);
    // In-game tactical mentality: a side chasing the game presses higher and plays
    // more direct (fewer passes, quicker to the shot); a side protecting a lead drops
    // the press and keeps the ball (more passes, slower tempo). Scaled by adaptability.
    const sideMentality = mentalityFor(
      score[side],
      score[defendingSide],
      currentMinute,
      context.adaptability,
    );
    const oppMentality = mentalityFor(
      score[defendingSide],
      score[side],
      currentMinute,
      opponentContext.adaptability,
    );
    const liveOwnPress = context.press * (1 + sideMentality * 0.18);
    const liveOppPress = opponentContext.press * (1 + oppMentality * 0.18);
    const mentalityPassAdj =
      sideMentality > 0.2 ? -1 : sideMentality < -0.2 ? 1 : 0;
    const effectivePassLimit = clamp(passLimit + mentalityPassAdj, 2, 7);
    const matchFitness = clamp(
      context.fitness +
        (context.stamina - 70) * Math.max(0, currentMinute - 20) * 0.001 -
        Math.max(0, liveOwnPress - 1) *
          Math.max(0, currentMinute - 20) *
          0.08,
      45,
      100,
    );
    const carrierFatigue = fatigueFactorOf(carrier, currentMinute, team, liveOwnPress);
    const pressure = clamp(
      (liveOppPress * 0.28 +
        opponentContext.defence / 350 +
        (100 - matchFitness) / 450) *
        (1 - skill(carrier, ["composure", "ballControl"]) / 1000) *
        (1 + (1 - carrierFatigue) * 0.6),
      0.08,
      0.86,
    );
    let lost = false;
    let shotTaken = false;

    for (let passIndex = 0; passIndex < effectivePassLimit; passIndex++) {
      const lateChase =
        currentMinute >= 68 && score[side] < score[defendingSide];
      const protectLead =
        currentMinute >= 72 && score[side] > score[defendingSide];
      const attackingIntent =
        (lateChase ? 0.07 : 0) +
        (protectLead ? -0.035 : 0) +
        context.attackingEdge * 0.04;
      const adaptiveIntent =
        attackingIntent * clamp(context.adaptability / 60, 0.75, 1.3);
      const actionDecision = decidePlayerAction(
        carrier,
        {
          position: carrier.position,
          minute: currentMinute,
          space: clamp(zone, 0.05, 0.95),
          pressure,
          laneQuality: clamp(0.82 - pressure + zone * 0.14, 0.08, 0.98),
          shotQuality: clamp(zone * 0.8, 0.08, 0.92),
          tactics: context.style,
          scoreFor: score[side],
          scoreAgainst: score[defendingSide],
          possessionNeed: protectLead ? 0.9 : 0.45,
        },
        rng,
      );
      const shotThreshold =
        clamp(
          0.58 -
            (skill(carrier, ["longShots", "shooting"]) - 60) * 0.004 -
              (roleEffect(team, carrier, "shooting") - 1) * 0.22 -
              (productionFactor(carrier, "goalMultiplier") - 1) * 0.12,
          0.42,
          0.68,
        );
      if (
        zone > shotThreshold &&
        (actionDecision.action === "shoot" ||
          rng.chance(
            context.chanceRate +
              zone * 0.045 +
              adaptiveIntent +
              (opponentContext.defensiveLine === "High" ? 0.012 : 0),
          ))
      ) {
        const shot = shotOpportunity(
          carrier,
          context,
          opponent,
          zone,
          pressure,
          currentMinute,
          rng,
          maxLeagueGoals == null ||
            Number(
              carrier.leagueGoals ??
                carrier.goals ??
                carrier.stats?.goals ??
                0,
            ) +
              (playerStats[carrier.id]?.goals ?? 0) <
              maxLeagueGoals,
        );
        teamStats.shots++;
        teamStats.xg += shot.xg;
        playerStat(carrier, playerStats, "shots");
        addAction(actions, {
          type: "shot",
          side,
          minute: currentMinute,
          playerId: carrier.id,
          playerName: `${carrier.first} ${carrier.last}`,
          xg: shot.xg,
          distance: shot.distance,
          angle: shot.angle,
          shotType: shot.shotType,
          outcome: shot.goal
            ? "goal"
            : shot.saved
              ? "saved"
              : shot.blocked
                ? "blocked"
                : "missed",
        });
        if (shot.onTarget) {
          teamStats.shotsOnTarget++;
          playerStat(carrier, playerStats, "shotsOnTarget");
        }
        if (shot.goal) {
          score[side]++;
          teamStats.goals++;
          playerStat(carrier, playerStats, "goals");
          // A header is a won aerial duel for the scorer; the defending centre-back
          // who contested it is credited with the aerial attempt too.
          if (shot.shotType === "header") {
            playerStat(carrier, playerStats, "aerials");
            playerStat(carrier, playerStats, "aerialsWon");
            if (shot.defender) playerStat(shot.defender, playerStats, "aerials");
          }
          // The defending keeper is credited with the goal conceded.
          const concedingKeeper = keeperOf(opponent);
          if (concedingKeeper) playerStat(concedingKeeper, playerStats, "goalsConceded");
          const assistCandidate = actions
            .slice(-effectivePassLimit * 2)
            .filter(
              (action) =>
                action.side === side &&
                action.type === "pass" &&
                action.completed &&
                action.playerId !== carrier.id,
            )
            .at(-1);
          const assister = assistCandidate
            ? team.xi.find((player) => player.id === assistCandidate.playerId)
            : null;
          if (assister) playerStat(assister, playerStats, "assists");
          const goalEvent = {
            type: "goal",
            minute: currentMinute,
            side,
            scorerId: carrier.id,
            scorerName: `${carrier.first} ${carrier.last}`,
            assistId: assister?.id ?? null,
            assistName: assister
              ? `${assister.first} ${assister.last}`
              : null,
            penalty: false,
            ownGoal: false,
            xg: shot.xg,
          };
          events.push(goalEvent);
          addAction(actions, goalEvent);
        } else if (shot.saved) {
          opponentStats.saves++;
          playerStat(shot.keeper, playerStats, "saves");
          if (shot.shotType === "header") {
            // The striker won the aerial but the keeper kept it out.
            playerStat(carrier, playerStats, "aerials");
            playerStat(carrier, playerStats, "aerialsWon");
            if (shot.defender) playerStat(shot.defender, playerStats, "aerials");
          }
          misc.push({
            type: "save",
            side: defendingSide,
            minute: currentMinute,
            playerId: shot.keeper?.id ?? null,
            playerName: shot.keeper
              ? `${shot.keeper.first} ${shot.keeper.last}`
              : "Goalkeeper",
            description: "Saved a shot",
          });
        } else if (shot.blocked) {
          opponentStats.tackles++;
          opponentStats.tacklesWon++;
          if (rng.chance(0.35)) {
            teamStats.corners++;
            addAction(actions, { type: "corner", side, minute: currentMinute });
          }
          playerStat(shot.defender, playerStats, "tackleAttempts");
          playerStat(shot.defender, playerStats, "tacklesWon");
          // A blocked header is a defensive aerial win for the blocker.
          if (shot.shotType === "header") {
            playerStat(shot.defender, playerStats, "aerials");
            playerStat(shot.defender, playerStats, "aerialsWon");
            playerStat(carrier, playerStats, "aerials");
          }
          playerStat(carrier, playerStats, "possessionLosses");
          misc.push({
            type: "block",
            side: defendingSide,
            minute: currentMinute,
            playerId: shot.defender?.id ?? null,
            playerName: shot.defender
              ? `${shot.defender.first} ${shot.defender.last}`
              : null,
            description: "Blocked a shot",
          });
        } else if (rng.chance(0.09)) {
          teamStats.corners++;
          addAction(actions, { type: "corner", side, minute: currentMinute });
        }
        shotTaken = true;
        break;
      }

      const shouldDribble =
        ["dribble", "run", "overlap"].includes(actionDecision.action) &&
        zone > 0.24;
      if (shouldDribble) {
        const defender = pickDefender(opponent, rng);
        const attackSkill =
          actionAbility(carrier, "dribble", {
            position: carrier.position,
            pressure,
            suitability: 0.85,
          }) * fatigueFactorOf(carrier, currentMinute, team, context.press ?? 1);
        const defendSkill = defender
          ? actionAbility(defender, "tackle", {
              position: defender.position,
              pressure,
              suitability: 0.85,
            })
          : 0.45;
        const won = rng.chance(
          clamp(
            0.5 + (attackSkill - defendSkill) * 0.55 +
              (skill(carrier, ["pace", "dribbling"]) -
                skill(defender ?? {}, ["defending", "standingTackle"])) *
                0.002 +
              (roleEffect(team, carrier, "dribbling") - 1) * 0.1,
            0.12,
            0.88,
          ),
        );
        playerStat(carrier, playerStats, "dribbles");
        // Every dribble is a one-on-one duel; the defender is credited with the attempt.
        playerStat(carrier, playerStats, "duels");
        if (defender) playerStat(defender, playerStats, "duels");
        if (won) {
          playerStat(carrier, playerStats, "dribblesWon");
          playerStat(carrier, playerStats, "duelsWon");
          zone = clamp(
            zone + 0.1 + skill(carrier, ["pace", "dribbling"]) / 1000,
            0,
            0.96,
          );
          addAction(actions, {
            type: "dribble",
            side,
            minute: currentMinute,
            playerId: carrier.id,
            playerName: `${carrier.first} ${carrier.last}`,
            success: true,
          });
        } else {
          opponentStats.tackles++;
          opponentStats.tacklesWon++;
          playerStat(defender, playerStats, "tackleAttempts");
          playerStat(defender, playerStats, "tacklesWon");
          playerStat(defender, playerStats, "duelsWon");
          addAction(actions, {
            type: "tackle",
            side: defendingSide,
            minute: currentMinute,
            playerId: defender?.id ?? null,
            playerName: defender
              ? `${defender.first} ${defender.last}`
              : null,
            success: true,
          });
          lost = true;
          break;
        }
      } else {
        const receivers = team.xi.filter(
          (player) =>
            player.id !== carrier.id &&
            player.position !== "GK",
        );
        const receiver = rng.weightedPick(
          receivers,
          (player) =>
            (PASS_WEIGHT[player.position] ?? PASS_WEIGHT.CM) *
            (0.7 + skill(player, ["attackingPositioning", "vision"]) / 220) *
            (1 + (player.position === "ST" ? zone * 0.45 : 0)) *
            productionFactor(player, "goalMultiplier"),
        );
        if (!receiver) break;
        teamStats.passes++;
        playerStat(carrier, playerStats, "passAttempts");
        const passing =
          actionAbility(carrier, "pass", {
            position: carrier.position,
            pressure,
            laneQuality: clamp(0.8 - pressure + zone * 0.1, 0.12, 0.98),
            suitability: 0.9,
          }) * fatigueFactorOf(carrier, currentMinute, team, context.press ?? 1);
        const receiverMovement = skill(
          receiver,
          ["attackingPositioning", "vision", "pace"],
        );
        const passChance = clamp(
          0.65 +
            passing * 0.23 +
            (receiverMovement - 60) * 0.0015 +
            (productionFactor(carrier, "assistMultiplier") - 1) * 0.06 +
            context.styleFactors.pass * 0.08 +
            (context.familiarityEffect - 1) * 0.3 -
            (1 - roleEffect(team, carrier, "creativity")) * 0.08 -
            opponentContext.press * 0.08 -
            pressure * 0.1,
          0.42,
          0.94,
        );
        const completed = rng.chance(passChance);
        addAction(actions, {
          type: "pass",
          side,
          minute: currentMinute,
          playerId: carrier.id,
          playerName: `${carrier.first} ${carrier.last}`,
          receiverId: receiver.id,
          receiverName: `${receiver.first} ${receiver.last}`,
          completed,
          progressive: completed && zone > 0.35,
        });
        if (completed) {
          teamStats.passesCompleted++;
          playerStat(carrier, playerStats, "completedPasses");
          if (zone > 0.5 && skill(carrier, ["vision", "passing"]) > 72)
            playerStat(carrier, playerStats, "keyPasses");
          const progression =
            0.1 +
            rng.range(0.015, 0.105) * context.styleFactors.progression +
            skill(receiver, ["pace", "attackingPositioning"]) / 2200;
          zone = clamp(zone + progression, 0.05, 0.96);
          carrier = receiver;
        } else {
          const defender = pickDefender(opponent, rng);
          const interceptionChance = clamp(
            0.35 +
              (skill(defender ?? {}, ["interceptions", "defensiveAwareness"]) -
                60) *
                0.003 +
              opponentContext.press * 0.12,
            0.2,
            0.75,
          );
          if (defender && rng.chance(interceptionChance)) {
            opponentStats.interceptions++;
            playerStat(defender, playerStats, "interceptions");
            addAction(actions, {
              type: "interception",
              side: defendingSide,
              minute: currentMinute,
              playerId: defender.id,
              playerName: `${defender.first} ${defender.last}`,
            });
          } else {
            opponentStats.tackles++;
            playerStat(defender, playerStats, "tackleAttempts");
          }
          playerStat(carrier, playerStats, "possessionLosses");
          lost = true;
          break;
        }
      }
    }

    if (!shotTaken && !lost && zone > 0.48 && rng.chance(0.14)) {
      const attackers = team.xi.filter((player) =>
        ["ST", "LW", "RW", "AM", "CAM"].includes(player.position),
      );
      if (attackers.length && rng.chance(0.12)) {
        const offsidePlayer = rng.weightedPick(
          attackers,
          (player) => skill(player, ["attackingPositioning", "pace"]),
        );
        teamStats.offsides++;
        addAction(actions, {
          type: "offside",
          side,
          minute: currentMinute,
          playerId: offsidePlayer.id,
          playerName: `${offsidePlayer.first} ${offsidePlayer.last}`,
        });
      }
    }

    const foulChance = clamp(
      0.025 +
        (opponentContext.press - 1) * 0.12 +
        (context.style.includes("Press") ? 0.018 : 0),
      0.015,
      0.09,
    );
    if (lost && rng.chance(foulChance)) {
      const defender = pickDefender(opponent, rng);
      opponentStats.fouls++;
      // The defender who committed the foul, and the attacker who was fouled.
      if (defender) playerStat(defender, playerStats, "foulsCommitted");
      playerStat(carrier, playerStats, "foulsWon");
      misc.push({
        type: "foul",
        side: defendingSide,
        minute: currentMinute,
        playerId: defender?.id ?? null,
        playerName: defender
          ? `${defender.first} ${defender.last}`
          : null,
      });
      // A foul always restarts play with a free kick to the attacking side.
      misc.push({
        type: "freeKick",
        side,
        minute: currentMinute,
        playerId: carrier.id,
        playerName: `${carrier.first} ${carrier.last}`,
      });
      // A foul committed deep in the defending team's own penalty area is a penalty.
      // It is converted through the normal goal/stat pipeline and respects any goal cap.
      if (zone > 0.82 && carrier) {
        scorePenalty({
          side,
          taker: carrier,
          opponent,
          playerStats,
          score,
          stats,
          events,
          misc,
          actions,
          rng,
          maxLeagueGoals,
          minute: currentMinute,
        });
      }
    }
  }

  for (const side of ["home", "away"]) {
    const team = teams[side];
    const context = contexts[side];
    const teamStats = stats[side];
    const opponentSide = side === "home" ? "away" : "home";
    const opponent = teams[opponentSide];
    const importance = clamp(team.importance ?? 1, 0.75, 1.5);
    // Cards can be shown to anyone who was on the pitch at any point, so iterate the
    // players who actually appeared (starters plus substitutes who came on).
    for (const player of team.appeared) {
      const aggression = skill(player, ["aggression", "physical"]);
      const foulRisk = clamp(
        0.018 +
          (aggression - 50) * 0.00045 +
          (context.style === "High Press" ||
          context.style === "Gegenpressing"
            ? 0.014
            : 0),
        0.008,
        0.075,
      );
      if (rng.chance(foulRisk * importance)) {
        const secondYellow = rng.chance(0.035);
        const type = secondYellow ? "red" : "yellow";
        teamStats[secondYellow ? "redCards" : "yellowCards"]++;
        // Cards belong to the specific player who committed the foul.
        if (secondYellow) playerStat(player, playerStats, "redCards");
        else playerStat(player, playerStats, "yellowCards");
        misc.push({
          type,
          side,
          minute: rng.int(10, minutes),
          playerId: player.id,
          playerName: `${player.first} ${player.last}`,
        });
      }
    }

    teamStats.possession = Math.round(
      100 *
        (teamStats.possessionSeconds /
          Math.max(
            1,
            stats.home.possessionSeconds + stats.away.possessionSeconds,
          )),
    );
    teamStats.passAccuracy = teamStats.passes
      ? round((teamStats.passesCompleted / teamStats.passes) * 100, 1)
      : 0;
    teamStats.xg = round(teamStats.xg, 2);
  }

  // Finalise minutes per player from the actual substitutions: a starter who was
  // replaced is credited only up to the substitution minute, and the player who came
  // on is credited with the remainder. Players who never left the pitch keep the full
  // match length. This is what makes player statistics (including minutes) agree with
  // the substitution timeline.
  for (const side of ["home", "away"]) {
    const squad = teams[side];
    for (const player of squad.appeared) {
      const entry = squad.onPitchSince.get(player.id) ?? 0;
      const exit = squad.exitMinute.get(player.id) ?? minutes;
      const played = Math.max(0, exit - entry);
      // Always create a record so the substitution timeline never points at a player
      // with no statistics; a substitute who somehow played ~0 minutes simply gets 0.
      const record = playerStat(player, playerStats, "minutes", 0);
      record.minutes = Math.round(played);
    }
  }

  return {
    homeGoals: score.home,
    awayGoals: score.away,
    xg: { home: stats.home.xg, away: stats.away.xg },
    stats,
    events: events.sort((a, b) => a.minute - b.minute),
    misc: misc.sort((a, b) => a.minute - b.minute),
    actions,
    playerStats,
    contexts,
    substitutions,
    lineups: { home: teams.home.xi.map((p) => p.id), away: teams.away.xi.map((p) => p.id) },
  };
}
