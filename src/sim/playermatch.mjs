/**
 * The player's own match: his involvements, his rating, and the key moments he decides.
 *
 * This is the layer that makes the game feel like a *player* career rather than a
 * manager game. The design rule is that the player influences outcomes rather than
 * puppeting them:
 *
 *  - The team engine supplies a baseline score and goal timeline; live decisions can
 *    add attacking goals or cancel an upcoming opponent goal.
 *  - We then walk the 90 minutes and roll individual involvements for the player,
 *    driven by his attributes against the specific opponents he is facing.
 *  - Baseline player goals are assigned from the team's scheduled scorers. Goals created
 *    by live moments are added to both the score and the player's match record.
 *  - Position-weighted key moments (such as a centre-back's last-ditch block or a
 *    striker's clear chance) are surfaced to the UI. The user can decide them, or let
 *    the player's attributes decide them.
 *
 * The rating model is anchored so that the league mean is around 6.8, which is the
 * real-world distribution: most players are a 6 or 7, and an 8+ means you played well.
 */

import { clamp, round } from "../core/util.mjs";
import {
  normalizePosition,
  RATING_BASE,
  RATING_MIN,
  RATING_MAX,
} from "../core/constants.mjs";
import { physiqueFactors } from "../model/player.mjs";
import { goalkeeperQuality } from "../model/goalkeeper.mjs";
import {
  playStyleEffect,
  awardPlayStyleEvidence,
  ensurePlayStyles,
} from "../model/playstyles.mjs";

const POSITION_MOMENT_WEIGHTS = {
  CB: {
    chance: 0.8,
    penalty: 0.5,
    oneOnOne: 0.6,
    bigPass: 1.2,
    lastDitch: 4.5,
  },
  LB: {
    chance: 1.2,
    penalty: 0.7,
    oneOnOne: 1.4,
    bigPass: 2.2,
    lastDitch: 2.7,
  },
  RB: {
    chance: 1.2,
    penalty: 0.7,
    oneOnOne: 1.4,
    bigPass: 2.2,
    lastDitch: 2.7,
  },
  DM: {
    chance: 0.9,
    penalty: 0.7,
    oneOnOne: 0.9,
    bigPass: 3,
    lastDitch: 3.6,
  },
  CM: {
    chance: 2,
    penalty: 0.9,
    oneOnOne: 1.5,
    bigPass: 2.8,
    lastDitch: 1.8,
  },
  AM: {
    chance: 3,
    penalty: 1.1,
    oneOnOne: 2.2,
    bigPass: 3,
    lastDitch: 0.8,
  },
  LW: {
    chance: 3.4,
    penalty: 1.1,
    oneOnOne: 3,
    bigPass: 2,
    lastDitch: 0.6,
  },
  RW: {
    chance: 3.4,
    penalty: 1.1,
    oneOnOne: 3,
    bigPass: 2,
    lastDitch: 0.6,
  },
  ST: {
    chance: 5,
    penalty: 1.4,
    oneOnOne: 3.5,
    bigPass: 1.2,
    lastDitch: 0.35,
  },
};

/**
 * Per-90 involvement rates by position, for an *average* player at this level.
 * Real per-90 numbers for a top-division player: a striker takes ~2.5 shots, a
 * centre-back makes ~4 clearances, a midfielder completes ~50 passes. These are the
 * baselines; attributes then scale each one.
 */
const INVOLVEMENT_BASE = {
  GK: {
    passes: 28,
    duels: 0.8,
    tackles: 0.1,
    interceptions: 0.2,
    shots: 0.0,
    keyPasses: 0.1,
    dribbles: 0.2,
    aerials: 0.6,
    foulsCommitted: 0.1,
    foulsWon: 0.2,
    saves: 3.2,
  },
  CB: {
    passes: 52,
    duels: 6.5,
    tackles: 1.6,
    interceptions: 1.5,
    shots: 0.5,
    keyPasses: 0.3,
    dribbles: 0.5,
    aerials: 3.4,
    foulsCommitted: 1.0,
    foulsWon: 0.7,
    saves: 0,
  },
  LB: {
    passes: 55,
    duels: 5.8,
    tackles: 2.0,
    interceptions: 1.3,
    shots: 0.6,
    keyPasses: 1.0,
    dribbles: 1.1,
    aerials: 1.2,
    foulsCommitted: 0.9,
    foulsWon: 1.0,
    saves: 0,
  },
  RB: {
    passes: 55,
    duels: 5.8,
    tackles: 2.0,
    interceptions: 1.3,
    shots: 0.6,
    keyPasses: 1.0,
    dribbles: 1.1,
    aerials: 1.2,
    foulsCommitted: 0.9,
    foulsWon: 1.0,
    saves: 0,
  },
  DM: {
    passes: 62,
    duels: 6.0,
    tackles: 2.3,
    interceptions: 1.9,
    shots: 0.9,
    keyPasses: 0.9,
    dribbles: 0.9,
    aerials: 1.6,
    foulsCommitted: 1.3,
    foulsWon: 1.1,
    saves: 0,
  },
  CM: {
    passes: 60,
    duels: 5.2,
    tackles: 1.7,
    interceptions: 1.2,
    shots: 1.3,
    keyPasses: 1.5,
    dribbles: 1.4,
    aerials: 0.9,
    foulsCommitted: 0.9,
    foulsWon: 1.3,
    saves: 0,
  },
  AM: {
    passes: 46,
    duels: 4.6,
    tackles: 1.0,
    interceptions: 0.7,
    shots: 2.0,
    keyPasses: 2.2,
    dribbles: 2.4,
    aerials: 0.5,
    foulsCommitted: 0.6,
    foulsWon: 1.7,
    saves: 0,
  },
  LW: {
    passes: 42,
    duels: 5.4,
    tackles: 1.0,
    interceptions: 0.6,
    shots: 2.2,
    keyPasses: 1.8,
    dribbles: 3.1,
    aerials: 0.5,
    foulsCommitted: 0.5,
    foulsWon: 1.8,
    saves: 0,
  },
  RW: {
    passes: 42,
    duels: 5.4,
    tackles: 1.0,
    interceptions: 0.6,
    shots: 2.2,
    keyPasses: 1.8,
    dribbles: 3.1,
    aerials: 0.5,
    foulsCommitted: 0.5,
    foulsWon: 1.8,
    saves: 0,
  },
  ST: {
    passes: 30,
    duels: 6.2,
    tackles: 0.6,
    interceptions: 0.4,
    shots: 2.9,
    keyPasses: 1.1,
    dribbles: 1.9,
    aerials: 2.6,
    foulsCommitted: 0.7,
    foulsWon: 1.5,
    saves: 0,
  },
};

/** Which attribute governs winning each type of involvement. */
const DUEL_ATTRIBUTE = {
  tackle: "defending",
  interception: "defending",
  aerial: "physical",
  dribble: "dribbling",
  duel: "physical",
  pass: "passing",
};

/**
 * Simulate one player's match.
 *
 * @param {object} opts
 *   player            the user's player
 *   match             the already-simulated match (from match.mjs)
 *   side              'home' | 'away'
 *   opponents         the opposing XI as player objects
 *   rng               named Rng stream
 *   position          the position he is actually fielded in
 *   minutes           how long he plays (0-90+); 0 means he did not get on
 *   role              optional tactical instruction, e.g. 'Attack', 'Hold'
 */
export function simulatePlayerMatch(opts) {
  const {
    player,
    match,
    side,
    opponents,
    rng,
    position,
    minutes,
    role = "Balanced",
  } = opts;

  const stats = blankPlayerMatchStats();
  const involvementLog = [];
  const keyMoments = [];
  const selectedRole = ROLE_MODIFIERS[role] ? role : "Balanced";

  if (!minutes || minutes <= 0) {
    return {
      played: false,
      minutes: 0,
      role: selectedRole,
      stats,
      rating: null,
      involvementLog,
      keyMoments,
      note: "Did not play",
    };
  }

  stats.started = minutes >= 60;
  stats.minutes = minutes;

  const base = INVOLVEMENT_BASE[position] ?? INVOLVEMENT_BASE.CM;
  const scaled = minutes / 90;

  // The opposition's defensive quality suppresses everything the player does.
  const oppQuality = opponents.length
    ? opponents.reduce((a, p) => a + (p.overall ?? 65), 0) / opponents.length
    : 65;
  const oppFactor = clamp(1 - (oppQuality - 68) / 190, 0.72, 1.16);

  // Role instructions trade risk for reward: an attacking role produces more shots and
  // key passes but loses the ball more often, which is exactly the real trade-off.
  const roleMod = ROLE_MODIFIERS[selectedRole];

  // Initialize legacy player badge data once, then apply only context-relevant effects.
  ensurePlayStyles(player);
  const pressureLevel = clamp((oppQuality - (player.overall ?? 65)) / 45, 0, 1);
  const passContext = {
    position,
    attribute: player.attrs.passing,
    pressure: pressureLevel,
  };

  // --- Passing -------------------------------------------------------------
  const passVolume =
    base.passes *
    scaled *
    attrFactor(player.attrs.passing, 0.55, 1.45) *
    oppFactor *
    roleMod.passingVolume;
  stats.passes = Math.max(
    0,
    Math.round(rng.normal(passVolume, passVolume * 0.12)),
  );
  const passSkill = clamp(
    (0.62 +
      (player.attrs.passing - 60) / 220 +
      (player.attrs.dribbling - 60) / 500) *
      playStyleEffect(player, "shortPass", {
        ...passContext,
        suitability: ["Tiki-Taka", "Possession"].includes(opts.teamStyle)
          ? 1
          : 0.75,
      }) *
      playStyleEffect(player, "throughPass", {
        ...passContext,
        suitability: 0.7,
      }) *
      playStyleEffect(player, "longPass", {
        ...passContext,
        suitability: 0.7,
      }) *
      playStyleEffect(player, "drivenPass", {
        ...passContext,
        suitability: 0.65,
      }) *
      playStyleEffect(player, "creativePass", {
        ...passContext,
        suitability: 0.7,
      }) *
      playStyleEffect(player, "cross", { ...passContext, suitability: 0.65 }) *
      playStyleEffect(player, "crossAccuracy", {
        ...passContext,
        suitability: 0.65,
      }) *
      playStyleEffect(player, "setPiece", {
        ...passContext,
        suitability: 0.25,
      }) *
      playStyleEffect(player, "trivela", { ...passContext, suitability: 0.25 }),
    0.35,
    0.98,
  );
  stats.passesCompleted = 0;
  for (let i = 0; i < stats.passes; i++) {
    if (rng.chance(passSkill * roleMod.passRisk)) stats.passesCompleted++;
  }
  stats.keyPasses = drawCount(
    rng,
    base.keyPasses *
      scaled *
      attrFactor(player.attrs.passing, 0.5, 1.7) *
      oppFactor *
      roleMod.creativity,
  );

  // --- Defensive work ------------------------------------------------------
  stats.tackles = drawCount(
    rng,
    base.tackles * scaled * oppFactor * roleMod.defensiveWork,
  );
  stats.tacklesWon = Math.round(
    stats.tackles *
      clamp(0.5 + (player.attrs.defending - 60) / 150, 0.25, 0.9) *
      playStyleEffect(player, "intercept", {
        position,
        attribute: player.attrs.defending,
        pressure: pressureLevel,
        suitability: 0.45,
      }) *
      playStyleEffect(player, "anticipate", {
        position,
        attribute: player.attrs.defending,
        pressure: pressureLevel,
        suitability: 0.55,
      }) *
      playStyleEffect(player, "slideTackle", {
        position,
        attribute: player.attrs.defending,
        pressure: pressureLevel,
        suitability: 0.35,
      }) *
      playStyleEffect(player, "jockey", {
        position,
        attribute: player.attrs.defending,
        pressure: pressureLevel,
        suitability: 0.45,
      }),
  );
  stats.interceptions = drawCount(
    rng,
    base.interceptions *
      scaled *
      oppFactor *
      roleMod.defensiveWork *
      playStyleEffect(player, "intercept", {
        position,
        attribute: player.attrs.defending,
        pressure: pressureLevel,
        suitability: 0.8,
      }) *
      playStyleEffect(player, "anticipate", {
        position,
        attribute: player.attrs.defending,
        pressure: pressureLevel,
        suitability: 0.65,
      }),
  );
  stats.aerials = drawCount(
    rng,
    base.aerials * scaled * oppFactor * roleMod.aerialVolume,
  );
  // Reach wins headers: every 5 cm over 178 cm is worth roughly 4 percentage points,
  // and a heavy frame (muscle or timber) holds its ground in the air.
  const aerialSkill = clamp(
    (0.35 +
      (player.attrs.physical - 60) / 130 +
      (player.height - 178) / 130 +
      Math.max(0, physiqueOf(player).mass) * 0.04) *
      playStyleEffect(player, "aerial", {
        position,
        attribute: player.attrs.physical,
        suitability: 0.8,
      }) *
      playStyleEffect(player, "aerialDefense", {
        position,
        attribute: player.attrs.defending,
        suitability: 0.6,
      }) *
      playStyleEffect(player, "header", {
        position,
        attribute: player.attrs.shooting,
        suitability: 0.5,
      }) *
      playStyleEffect(player, "acrobatics", {
        position,
        attribute: player.attrs.dribbling,
        suitability: 0.4,
      }),
    0.15,
    0.9,
  );
  stats.aerialsWon = 0;
  for (let i = 0; i < stats.aerials; i++)
    if (rng.chance(aerialSkill)) stats.aerialsWon++;

  stats.duels = drawCount(
    rng,
    base.duels * scaled * oppFactor * roleMod.duelVolume,
  );
  // A heavy player wins shoulder-to-shoulder duels; a small, nimble one slips out of them.
  const body = physiqueOf(player);
  const duelSkill = clamp(
    (0.42 +
      (player.attrs.physical - 60) / 170 +
      (player.attrs.dribbling - 60) / 250 +
      body.load * 0.05 -
      body.stature * 0.02) *
      playStyleEffect(player, "duel", {
        position,
        attribute: player.attrs.physical,
        pressure: pressureLevel,
        suitability: 0.85,
      }),
    0.2,
    0.9,
  );
  stats.duelsWon = 0;
  for (let i = 0; i < stats.duels; i++)
    if (rng.chance(duelSkill)) stats.duelsWon++;

  stats.dribbles = drawCount(
    rng,
    base.dribbles *
      scaled *
      attrFactor(player.attrs.dribbling, 0.5, 1.8) *
      oppFactor *
      roleMod.dribbling,
  );
  // Low centre of gravity beats a tall frame in a tight area.
  const dribbleSkill = clamp(
    (0.4 +
      ((player.attrs.dribbling - 60) / 150) *
        (1 + ((player.skillMoves ?? 3) - 3) * 0.12) +
      Math.max(0, -body.stature) * 0.04 -
      Math.max(0, body.mass) * 0.03) *
      playStyleEffect(player, "dribble", {
        position,
        attribute: player.attrs.dribbling,
        pressure: pressureLevel,
        suitability: 0.85,
      }) *
      playStyleEffect(player, "retention", {
        position,
        attribute: player.attrs.dribbling,
        pressure: pressureLevel,
        suitability: pressureLevel,
      }) *
      playStyleEffect(player, "skill", {
        position,
        attribute: player.skillMoves * 20,
        pressure: pressureLevel,
        suitability: 0.45,
      }) *
      playStyleEffect(player, "acceleration", {
        position,
        attribute: player.subAttrs?.acceleration ?? player.attrs.pace,
        pressure: pressureLevel,
        suitability: 0.65,
      }) *
      playStyleEffect(player, "carrySpeed", {
        position,
        attribute: player.attrs.pace,
        pressure: pressureLevel,
        suitability: 0.65,
      }) *
      playStyleEffect(player, "firstTouch", {
        position,
        attribute: player.subAttrs?.ballControl ?? player.attrs.dribbling,
        pressure: pressureLevel,
        suitability: 0.55,
      }) *
      playStyleEffect(player, "flair", {
        position,
        attribute: player.skillMoves * 20,
        pressure: pressureLevel,
        suitability: 0.35,
      }) *
      playStyleEffect(player, "run", {
        position,
        attribute: player.attrs.pace,
        pressure: pressureLevel,
        suitability: 0.5,
      }),
    0.2,
    0.94,
  );
  stats.dribblesWon = 0;
  for (let i = 0; i < stats.dribbles; i++)
    if (rng.chance(dribbleSkill)) stats.dribblesWon++;

  // --- Discipline ----------------------------------------------------------
  stats.foulsCommitted = drawCount(
    rng,
    base.foulsCommitted * scaled * roleMod.foulRisk,
  );
  stats.foulsWon = drawCount(
    rng,
    base.foulsWon *
      scaled *
      attrFactor(player.attrs.dribbling, 0.5, 1.6) *
      roleMod.dribbling,
  );

  // --- Goalkeeping ---------------------------------------------------------
  if (position === "GK") {
    const conceded = side === "home" ? match.awayGoals : match.homeGoals;
    stats.goalsConceded = conceded;
    stats.cleanSheets = conceded === 0 ? 1 : 0;
    stats.shotsFaced = conceded + Number(stats.saves ?? 0);
    // Every goalkeeping facet comes from the shared quality model, so this engine, the
    // strength ratings and the team ratings all describe the same goalkeeper.
    const overall = Number(player.overall) || 60;
    const shotStopping = goalkeeperQuality(player.gkAttrs, { kind: "shotStopping", overall });
    const reflexes = goalkeeperQuality(player.gkAttrs, { kind: "reflexes", overall });
    const handling = goalkeeperQuality(player.gkAttrs, { kind: "handling", overall });
    const positioning = goalkeeperQuality(player.gkAttrs, { kind: "positioning", overall });
    const distribution = goalkeeperQuality(player.gkAttrs, { kind: "distribution", overall });
    // A keeper makes roughly one save per goal conceded, plus routine work.
    const expectedSaves = 2.0 + conceded * 0.8;
    const fatigueRelief = playStyleEffect(player, "fatigue", {
      position: "GK",
      attribute: reflexes,
      suitability: clamp((player.fatigue ?? 0) / 100, 0, 1),
    });
    const keeperDistribution =
      playStyleEffect(player, "farThrow", {
        position: "GK",
        attribute: distribution,
        suitability: 0.4,
      }) *
      playStyleEffect(player, "crossClaim", {
        position: "GK",
        attribute: handling,
        suitability: 0.45,
      }) *
      playStyleEffect(player, "rushOut", {
        position: "GK",
        attribute: positioning,
        suitability: 0.4,
      }) *
      playStyleEffect(player, "sweeper", {
        position: "GK",
        attribute: positioning,
        suitability: opts.teamStyle === "High Press" ? 0.8 : 0.35,
      }) *
      playStyleEffect(player, "deflect", {
        position: "GK",
        attribute: handling,
        suitability: 0.4,
      }) *
      playStyleEffect(player, "footwork", {
        position: "GK",
        attribute: reflexes,
        suitability: 0.35,
      }) *
      playStyleEffect(player, "farReach", {
        position: "GK",
        attribute: shotStopping,
        suitability: 0.4,
      });
    stats.saves = drawCount(
      rng,
      expectedSaves *
        attrFactor(reflexes, 0.6, 1.5) *
        playStyleEffect(player, "reflex", {
          position: "GK",
          attribute: reflexes,
          suitability: 0.7,
        }) *
        keeperDistribution *
        (fatigueRelief < 1 ? 1 : Math.min(1.08, fatigueRelief)) *
        roleMod.saveVolume,
    );
    // A shootout save is rare but real: keepers with strong reflexes, diving and
    // composure are the ones who guess right. Recorded separately from open-play saves.
    const penaltyAttempts = Number(match.penaltyShootout?.[side === "home" ? "home" : "away"] ?? 0);
    const penaltySkill = goalkeeperQuality(player.gkAttrs, {
      kind: "penaltySaves",
      overall,
    });
    stats.penaltySaves = penaltyAttempts
      ? binomial(
          penaltyAttempts,
          clamp(0.08 + (penaltySkill - 45) * 0.006, 0.03, 0.55),
          rng,
        )
      : 0;
    stats.savePercentage = stats.shotsFaced > 0
      ? round((stats.saves / stats.shotsFaced) * 100, 1)
      : 0;
  }

  // --- Shooting ------------------------------------------------------------
  // Shots are the one involvement that can produce the goals the team already scored.
  const shotVolume =
    base.shots *
    scaled *
    attrFactor(player.attrs.shooting, 0.45, 1.95) *
    oppFactor *
    roleMod.shooting *
    (1 +
      (playStyleEffect(player, "longShot", {
        position,
        attribute: player.subAttrs?.longShots ?? player.attrs.shooting,
        suitability: position === "GK" ? 0 : 0.7,
        pressure: pressureLevel,
      }) -
        1) *
        0.3);
  const longShotEffect = playStyleEffect(player, "longShot", {
    position,
    attribute: player.attrs.shooting,
    suitability: position === "GK" ? 0 : 0.8,
    pressure: pressureLevel,
  });
  const shotEffect =
    playStyleEffect(player, "shoot", {
      position,
      attribute: player.attrs.shooting,
      suitability: 0.8,
      pressure: pressureLevel,
    }) *
    playStyleEffect(player, "chip", {
      position,
      attribute: player.attrs.shooting,
      suitability: 0.3,
      pressure: pressureLevel,
    }) *
    playStyleEffect(player, "lowShot", {
      position,
      attribute: player.attrs.shooting,
      suitability: 0.5,
      pressure: pressureLevel,
    }) *
    playStyleEffect(player, "volley", {
      position,
      attribute: player.attrs.shooting,
      suitability: 0.3,
      pressure: pressureLevel,
    }) *
    playStyleEffect(player, "trivela", {
      position,
      attribute: player.attrs.shooting,
      suitability: 0.25,
      pressure: pressureLevel,
    });
  stats.shots = drawCount(
    rng,
    shotVolume * (longShotEffect > 1 ? 1 + (longShotEffect - 1) * 0.35 : 1),
  );

  // How many of the team's goals is this player entitled to? Decided by his share of
  // the team's shot volume relative to his team-mates — which is why a striker who is
  // playing badly (few shots) also stops scoring.
  const teamGoals = side === "home" ? match.homeGoals : match.awayGoals;
  const hisGoals = assignGoals(player, match, side, rng);

  const distanceSuitability = clamp(
    ((player.subAttrs?.longShots ?? player.attrs.shooting ?? 60) - 45) / 45,
    0.15,
    1,
  );
  const shotAccuracy = clamp(
    shooterAccuracy(player) *
      shotEffect *
      playStyleEffect(player, "finesse", {
        position,
        attribute: player.subAttrs?.curve ?? player.attrs.shooting,
        suitability: 0.55,
        pressure: pressureLevel,
      }) *
      playStyleEffect(player, "firstTime", {
        position,
        attribute: player.attrs.shooting,
        suitability: 0.55,
        pressure: pressureLevel,
      }) *
      (longShotEffect > 1 ? 1 + (longShotEffect - 1) * distanceSuitability : 1),
    0.15,
    0.85,
  );
  stats.shotsOnTarget = Math.min(
    stats.shots,
    hisGoals +
      Math.round((stats.shots - hisGoals) * clamp(shotAccuracy, 0.15, 0.85)),
  );
  stats.goals = hisGoals;

  // Assists come from key passes, with a conversion rate that rises with passing.
  const assistChance = clamp(
    (0.08 + (player.attrs.passing - 60) / 420) * roleMod.assistChance,
    0.03,
    0.28,
  );
  stats.assists = 0;
  for (let i = 0; i < stats.keyPasses; i++)
    if (rng.chance(assistChance)) stats.assists++;
  // The team cannot have more assists than goals, and at most one assist per goal.
  stats.assists = Math.min(stats.assists, Math.max(0, teamGoals - stats.goals));

  // --- Cards ---------------------------------------------------------------
  // Read the cards that the team-level engine already gave out, so the player's own
  // card record is consistent with the match report he can read in the inbox.
  for (const ev of match.misc ?? []) {
    if (ev.playerId !== player.id) continue;
    if (ev.type === "yellow") stats.yellowCards++;
    if (ev.type === "red") stats.redCards++;
  }

  // --- Rating --------------------------------------------------------------
  const rating = computeRating(player, position, stats, match, side, rng);
  const evidence = {
    shortPass: stats.passesCompleted / 35,
    passing: stats.keyPasses / 3 + stats.passesCompleted / 70,
    shooting: stats.shotsOnTarget / 3,
    dribbling: stats.dribblesWon / 3,
    defending: stats.tacklesWon / 2 + stats.interceptions / 2,
    physical: stats.aerialsWon / 2 + stats.duelsWon / 5,
    goalkeeping: position === "GK" ? stats.saves / 2 : 0,
    passing: stats.keyPasses / 3 + stats.passesCompleted / 70,
    shooting: stats.shotsOnTarget / 3,
    dribbling: stats.dribblesWon / 3,
    defending: stats.tacklesWon / 2 + stats.interceptions / 2,
    physical: stats.aerialsWon / 2 + stats.duelsWon / 5,
    goalkeeping: position === "GK" ? stats.saves / 2 : 0,
    throughPass: stats.keyPasses / 2,
    longPass: stats.passesCompleted / 50,
    dribble: stats.dribblesWon / 2,
    retention: stats.duelsWon / 3,
    intercept: stats.interceptions / 2,
    anticipate: stats.interceptions / 2,
    aerial: stats.aerialsWon / 2,
    aerialDefense: position === "CB" ? stats.aerialsWon / 2 : 0,
    duel: stats.duelsWon / 3,
    longShot: stats.shotsOnTarget / 2,
    shoot: stats.shotsOnTarget / 3,
    reflex: position === "GK" ? stats.saves / 2 : 0,
  };
  const unlockedStyles = awardPlayStyleEvidence(player, evidence, {
    season: opts.season,
    age: player.age,
  });
  if (unlockedStyles.length)
    involvementLog.push({
      type: "playstyleProgress",
      badgeIds: unlockedStyles,
    });

  // --- Key moments ---------------------------------------------------------
  // Position weighting makes generated moments fit the player's role. Three is the
  // hard per-match ceiling so a fixture can never overwhelm the live flow.
  const momentBudget =
    (() => {
      const involvement =
        position === "GK"
          ? stats.saves * 1.1 + stats.passesCompleted * 0.012
          : stats.shots * (position === "ST" ? 0.8 : 0.55) +
            stats.keyPasses * 0.4 +
            stats.tacklesWon * (["CB", "LB", "RB", "DM"].includes(position) ? 0.24 : 0.12) +
            stats.interceptions * 0.2 +
            stats.dribblesWon * (["LW", "RW", "AM"].includes(position) ? 0.2 : 0.08);
      const chance = clamp(
        (0.12 + involvement * 0.13) * roleMod.momentVolume,
        0.08,
        0.82,
      );
      let opportunities = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (rng.chance(chance)) opportunities++;
      }
      return opportunities;
    })();
  const opposingKeeper = opponents.find(
    (opponent) => opponent.position === "GK",
  );
  const opposingKeeperQuality = opposingKeeper
    ? goalkeeperQuality(opposingKeeper.gkAttrs, {
        kind: "shotStopping",
        overall: Number(opposingKeeper.overall) || 60,
      })
    : 60;
  const defensivePressure = clamp(
    (Math.max(
      0,
      ...opponents
        .filter((opponent) =>
          ["CB", "LB", "RB", "DM"].includes(opponent.position),
        )
        .map(
          (opponent) =>
            (opponent.attrs.defending ?? 60) * 0.7 +
            (opponent.overall ?? 60) * 0.3,
        ),
    ) -
      65) *
      0.002,
    0,
    0.12,
  );
  for (let i = 0; i < momentBudget; i++) {
    const minute = rng.int(5, 90);
    const goalsBeforeMoment = (match.events ?? []).filter(
      (event) => event.type === "goal" && event.minute <= minute,
    );
    const scoreDifference = goalsBeforeMoment.reduce(
      (difference, event) =>
        difference +
        (event.side === side ? 1 : -1) * (event.ownGoal ? -1 : 1),
      0,
    );
    const matchPressure =
      minute >= 75 && scoreDifference < 0
        ? 0.025
        : minute >= 75 && scoreDifference > 0
          ? -0.015
          : 0;
    const abilityAdjustment = clamp(
      ((player.overall ?? 60) - 60) * 0.0015 +
        ((player.fitness ?? 85) - 85) * 0.001 +
        ((player.stamina ?? 80) - 80) * 0.0005,
      -0.1,
      0.1,
    );
    const kind =
      position === "GK"
        ? rng.weightedPick(
            ["keeperSave", "oneOnOne", "penalty", "bigPass"],
            (k) => (k === "keeperSave" ? 4 : k === "bigPass" ? 1.5 : 0.6),
          )
        : rng.weightedPick(
            ["chance", "penalty", "oneOnOne", "bigPass", "lastDitch"],
            (k) => {
              const positionWeight =
                POSITION_MOMENT_WEIGHTS[normalizePosition(position)] ??
                POSITION_MOMENT_WEIGHTS.CM;
              if (k === "bigPass")
                return positionWeight[k] * roleMod.creativity;
              if (k === "lastDitch")
                return (
                  positionWeight[k] *
                  (stats.tackles > 1 ? 1 : 0.4) *
                  roleMod.defensiveMomentWeight
                );
              if (k === "assist")
                return (
                  positionWeight.chance *
                  0.8 *
                  roleMod.creativity *
                  (player.attrs.passing / 70)
                );
              return positionWeight[k] * roleMod.attackingMomentWeight;
            },
          );
    const moment = {
      kind,
      minute,
      position,
      resolved: null,
      // Pre-computed so the "trust your attributes" option is instant and honest.
      opposingKeeperQuality,
      defensivePressure,
      autoSuccessChance: clamp(
        autoSuccessChance(player, position, kind, opposingKeeperQuality) -
          defensivePressure +
          roleMod.momentSuccess +
          abilityAdjustment +
          matchPressure,
        0.05,
        0.95,
      ),
      roleSuccessAdjustment: roleMod.momentSuccess,
    };
    moment.options = rng
      .sample(keyMomentActions(kind, position, opts.catalog), 3)
      .map((action) => action.id);
    keyMoments.push(moment);
  }
  keyMoments.sort((a, b) => a.minute - b.minute);

  involvementLog.push(
    ...buildInvolvementLog(stats, position, plcontrib(player)),
  );

  return {
    played: true,
    minutes,
    role: selectedRole,
    stats,
    rating,
    keyMoments,
    involvementLog,
    coachesNote: describePerformance(position, stats, rating),
  };
}

export const ROLE_MODIFIERS = {
  Balanced: {
    shooting: 1.0,
    creativity: 1.0,
    passRisk: 1.0,
    passingVolume: 1.0,
    dribbling: 1.0,
    aerialVolume: 1.0,
    duelVolume: 1.0,
    defensiveWork: 1.0,
    foulRisk: 1.0,
    assistChance: 1.0,
    momentVolume: 1.0,
    attackingMomentWeight: 1.0,
    defensiveMomentWeight: 1.0,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  Attack: {
    shooting: 1.25,
    creativity: 1.2,
    passRisk: 0.93,
    passingVolume: 0.95,
    dribbling: 1.08,
    aerialVolume: 1.05,
    duelVolume: 1.05,
    defensiveWork: 0.8,
    foulRisk: 0.95,
    assistChance: 1.05,
    momentVolume: 1.12,
    attackingMomentWeight: 1.3,
    defensiveMomentWeight: 0.7,
    momentSuccess: 0.01,
    saveVolume: 1.0,
  },
  "Hold Shape": {
    shooting: 0.8,
    creativity: 0.85,
    passRisk: 1.08,
    passingVolume: 1.08,
    dribbling: 0.85,
    aerialVolume: 1.08,
    duelVolume: 0.9,
    defensiveWork: 1.2,
    foulRisk: 0.95,
    assistChance: 0.9,
    momentVolume: 0.92,
    attackingMomentWeight: 0.75,
    defensiveMomentWeight: 1.2,
    momentSuccess: 0.015,
    saveVolume: 1.0,
  },
  "Press High": {
    shooting: 1.05,
    creativity: 1.05,
    passRisk: 0.96,
    passingVolume: 0.95,
    dribbling: 1.08,
    aerialVolume: 1.05,
    duelVolume: 1.25,
    defensiveWork: 1.15,
    foulRisk: 1.25,
    assistChance: 1.0,
    momentVolume: 1.08,
    attackingMomentWeight: 1.08,
    defensiveMomentWeight: 1.3,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  "Play Safe": {
    shooting: 0.75,
    creativity: 0.75,
    passRisk: 1.18,
    passingVolume: 1.12,
    dribbling: 0.75,
    aerialVolume: 0.95,
    duelVolume: 0.85,
    defensiveWork: 1.05,
    foulRisk: 0.8,
    assistChance: 0.8,
    momentVolume: 0.82,
    attackingMomentWeight: 0.8,
    defensiveMomentWeight: 1.05,
    momentSuccess: 0.02,
    saveVolume: 1.0,
  },
  "Express Yourself": {
    shooting: 1.2,
    creativity: 1.35,
    passRisk: 0.85,
    passingVolume: 1.05,
    dribbling: 1.4,
    aerialVolume: 0.9,
    duelVolume: 1.1,
    defensiveWork: 0.75,
    foulRisk: 1.0,
    assistChance: 1.15,
    momentVolume: 1.15,
    attackingMomentWeight: 1.25,
    defensiveMomentWeight: 0.75,
    momentSuccess: -0.01,
    saveVolume: 1.0,
  },
  "Deep-Lying Playmaker": {
    shooting: 0.82,
    creativity: 1.35,
    passRisk: 0.96,
    passingVolume: 1.28,
    dribbling: 0.9,
    aerialVolume: 0.95,
    duelVolume: 0.92,
    defensiveWork: 1.0,
    foulRisk: 0.85,
    assistChance: 1.25,
    momentVolume: 1.08,
    attackingMomentWeight: 1.1,
    defensiveMomentWeight: 0.95,
    momentSuccess: 0.015,
    saveVolume: 1.0,
  },
  "Box-to-Box": {
    shooting: 1.08,
    creativity: 1.05,
    passRisk: 0.98,
    passingVolume: 1.08,
    dribbling: 1.08,
    aerialVolume: 1.12,
    duelVolume: 1.2,
    defensiveWork: 1.08,
    foulRisk: 1.08,
    assistChance: 1.05,
    momentVolume: 1.12,
    attackingMomentWeight: 1.08,
    defensiveMomentWeight: 1.08,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  "Ball-Winning Midfielder": {
    shooting: 0.78,
    creativity: 0.82,
    passRisk: 1.02,
    passingVolume: 0.98,
    dribbling: 0.88,
    aerialVolume: 1.1,
    duelVolume: 1.35,
    defensiveWork: 1.42,
    foulRisk: 1.2,
    assistChance: 0.85,
    momentVolume: 0.95,
    attackingMomentWeight: 0.72,
    defensiveMomentWeight: 1.35,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  "Attacking Midfielder": {
    shooting: 1.16,
    creativity: 1.38,
    passRisk: 0.9,
    passingVolume: 1.08,
    dribbling: 1.18,
    aerialVolume: 0.85,
    duelVolume: 0.9,
    defensiveWork: 0.78,
    foulRisk: 0.9,
    assistChance: 1.2,
    momentVolume: 1.16,
    attackingMomentWeight: 1.3,
    defensiveMomentWeight: 0.7,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  Poacher: {
    shooting: 1.42,
    creativity: 0.78,
    passRisk: 0.92,
    passingVolume: 0.78,
    dribbling: 0.9,
    aerialVolume: 1.05,
    duelVolume: 0.92,
    defensiveWork: 0.58,
    foulRisk: 0.9,
    assistChance: 0.8,
    momentVolume: 1.2,
    attackingMomentWeight: 1.5,
    defensiveMomentWeight: 0.55,
    momentSuccess: 0.01,
    saveVolume: 1.0,
  },
  "Target Forward": {
    shooting: 1.15,
    creativity: 0.9,
    passRisk: 0.88,
    passingVolume: 0.86,
    dribbling: 0.78,
    aerialVolume: 1.48,
    duelVolume: 1.3,
    defensiveWork: 0.72,
    foulRisk: 1.05,
    assistChance: 1.1,
    momentVolume: 1.08,
    attackingMomentWeight: 1.25,
    defensiveMomentWeight: 0.65,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  "Inverted Winger": {
    shooting: 1.18,
    creativity: 1.18,
    passRisk: 0.9,
    passingVolume: 0.94,
    dribbling: 1.42,
    aerialVolume: 0.78,
    duelVolume: 1.05,
    defensiveWork: 0.78,
    foulRisk: 0.95,
    assistChance: 1.08,
    momentVolume: 1.16,
    attackingMomentWeight: 1.32,
    defensiveMomentWeight: 0.68,
    momentSuccess: -0.005,
    saveVolume: 1.0,
  },
  "Wide Playmaker": {
    shooting: 0.92,
    creativity: 1.4,
    passRisk: 0.92,
    passingVolume: 1.16,
    dribbling: 1.18,
    aerialVolume: 0.82,
    duelVolume: 0.95,
    defensiveWork: 0.82,
    foulRisk: 0.9,
    assistChance: 1.3,
    momentVolume: 1.14,
    attackingMomentWeight: 1.22,
    defensiveMomentWeight: 0.72,
    momentSuccess: 0.005,
    saveVolume: 1.0,
  },
  "Overlapping Full-Back": {
    shooting: 0.86,
    creativity: 1.18,
    passRisk: 0.91,
    passingVolume: 1.14,
    dribbling: 1.2,
    aerialVolume: 0.95,
    duelVolume: 1.1,
    defensiveWork: 0.9,
    foulRisk: 1.0,
    assistChance: 1.15,
    momentVolume: 1.12,
    attackingMomentWeight: 1.15,
    defensiveMomentWeight: 0.85,
    momentSuccess: 0,
    saveVolume: 1.0,
  },
  "Ball-Playing Defender": {
    shooting: 0.75,
    creativity: 1.14,
    passRisk: 1.02,
    passingVolume: 1.2,
    dribbling: 0.88,
    aerialVolume: 1.08,
    duelVolume: 1.08,
    defensiveWork: 1.08,
    foulRisk: 0.92,
    assistChance: 0.98,
    momentVolume: 1.0,
    attackingMomentWeight: 0.82,
    defensiveMomentWeight: 1.05,
    momentSuccess: 0.005,
    saveVolume: 1.0,
  },
  "Pressing Forward": {
    shooting: 1.08,
    creativity: 0.96,
    passRisk: 0.9,
    passingVolume: 0.9,
    dribbling: 1.02,
    aerialVolume: 0.96,
    duelVolume: 1.32,
    defensiveWork: 1.18,
    foulRisk: 1.22,
    assistChance: 0.94,
    momentVolume: 1.08,
    attackingMomentWeight: 1.12,
    defensiveMomentWeight: 1.22,
    momentSuccess: -0.005,
    saveVolume: 1.0,
  },
  "Sweeper Keeper": {
    shooting: 0.2,
    creativity: 1.1,
    passRisk: 0.9,
    passingVolume: 1.35,
    dribbling: 1.08,
    aerialVolume: 0.9,
    duelVolume: 0.9,
    defensiveWork: 0.95,
    foulRisk: 0.9,
    assistChance: 0.95,
    momentVolume: 1.05,
    attackingMomentWeight: 1.0,
    defensiveMomentWeight: 0.95,
    momentSuccess: 0.015,
    saveVolume: 0.95,
  },
  "Shot Stopper": {
    shooting: 0.2,
    creativity: 0.82,
    passRisk: 1.08,
    passingVolume: 0.85,
    dribbling: 0.75,
    aerialVolume: 1.15,
    duelVolume: 0.92,
    defensiveWork: 1.18,
    foulRisk: 0.85,
    assistChance: 0.8,
    momentVolume: 1.12,
    attackingMomentWeight: 0.72,
    defensiveMomentWeight: 1.22,
    momentSuccess: 0.025,
    saveVolume: 1.3,
  },
};

export const ROLE_DESCRIPTIONS = {
  Balanced: "A measured all-round role with no major trade-offs.",
  Attack:
    "Push forward for more shots and attacking moments, with less defensive work.",
  "Hold Shape":
    "Stay disciplined, protect your area, and keep possession moving safely.",
  "Press High":
    "Hunt the ball aggressively for more duels and defensive actions.",
  "Play Safe":
    "Prioritise secure passing and defensive responsibility over flair.",
  "Express Yourself":
    "Take creative risks, dribble more, and make more attacking plays.",
  "Deep-Lying Playmaker":
    "Dictate play from deep with extra passing and chance creation.",
  "Box-to-Box":
    "Cover both ends of the pitch with more duels, passing, and shooting.",
  "Ball-Winning Midfielder":
    "Focus on tackles, interceptions, and winning midfield duels.",
  "Attacking Midfielder":
    "Create and finish chances from advanced central areas.",
  Poacher:
    "Prioritise shots and attacking opportunities around the penalty area.",
  "Target Forward":
    "Use aerial strength and physical duels to lead the attack.",
  "Inverted Winger": "Dribble inside from wide areas and look to shoot.",
  "Wide Playmaker":
    "Create chances from wide positions with extra passing and dribbling.",
  "Overlapping Full-Back":
    "Join attacks from deep with forward runs and crossing chances.",
  "Ball-Playing Defender":
    "Build attacks from defence with more confident distribution.",
  "Pressing Forward":
    "Lead the press while remaining a direct attacking threat.",
  "Sweeper Keeper":
    "Join build-up play with more passing and confident distribution.",
  "Shot Stopper":
    "Prioritise saves and defensive actions over risky distribution.",
};

const SPECIALIST_ROLE_POSITIONS = {
  "Deep-Lying Playmaker": ["DM", "CM"],
  "Box-to-Box": ["CM"],
  "Ball-Winning Midfielder": ["DM", "CM"],
  "Attacking Midfielder": ["AM", "CM"],
  Poacher: ["ST"],
  "Target Forward": ["ST"],
  "Inverted Winger": ["LW", "RW"],
  "Wide Playmaker": ["LW", "RW", "AM"],
  "Overlapping Full-Back": ["LB", "RB"],
  "Ball-Playing Defender": ["CB"],
  "Pressing Forward": ["ST", "LW", "RW"],
  "Sweeper Keeper": ["GK"],
  "Shot Stopper": ["GK"],
};

export const PLAYER_ROLE_OPTIONS = Object.keys(ROLE_MODIFIERS).map((name) => ({
  name,
  description: ROLE_DESCRIPTIONS[name],
  positions: SPECIALIST_ROLE_POSITIONS[name] ?? null,
}));

export function playerRoleOptionsForPosition(position) {
  return PLAYER_ROLE_OPTIONS.filter(
    (option) => !option.positions || option.positions.includes(position),
  );
}

function blankPlayerMatchStats() {
  return {
    started: false,
    minutes: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    passes: 0,
    passesCompleted: 0,
    keyPasses: 0,
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
  };
}

/** Scale an involvement rate by an attribute and how important flexibility is. */
function attrFactor(value, lo, hi) {
  const v = clamp((value ?? 60) / 78, 0.4, 1.5);
  return clamp(lo + ((hi - lo) * (v - 0.4)) / 1.1, lo, hi);
}

/** Poisson-ish draw for a count stat, so a 2.9-shot striker sometimes takes 6. */
function drawCount(rng, lambda) {
  if (lambda <= 0) return 0;
  return rng.poisson(lambda);
}

function shooterAccuracy(player) {
  const weakFootFactor = 1 + ((player.weakFoot ?? 3) - 3) * 0.05;
  // A heavier frame strikes the ball harder but with less finesse.
  const massFactor = 1 + Math.max(0, physiqueOf(player).mass) * 0.04;
  return clamp(
    (((player.attrs.shooting ?? 60) - 40) / 90) * weakFootFactor * massFactor,
    0.15,
    0.7,
  );
}

/** Body factors for a player, cached so the per-match loops stay cheap. */
function physiqueOf(player) {
  if (!player) return { mass: 0, stature: 0, load: 0 };
  if (!player._physique)
    player._physique = physiqueFactors(player.height, player.weight);
  return player._physique;
}

/**
 * How many of the team's goals belong to this player.
 *
 * The team's goals were already drawn in `match.mjs`, but there we picked *any* scorer
 * from the XI. If the user's player was in that XI, we must honour that draw — otherwise
 * the match report would show him scoring a goal his own stats deny. So we check the
 * match events first, and only fall back to a share-based estimate for matches where
 * his participation wasn't part of the detailed event log.
 */
function assignGoals(player, match, side, rng) {
  const eventGoals = (match.events ?? []).filter(
    (e) => e.side === side && e.scorerId === player.id,
  ).length;
  if (eventGoals > 0) return eventGoals;

  // Not in the event log: this happens when the match was simulated without the user's
  // club in the detailed pass. No goals credited — which is correct, not a bug.
  return 0;
}

/** Chance that an attribute-driven resolution of a key moment succeeds. */
export function autoSuccessChance(player, position, kind, keeperQuality = 60) {
  const a = player.attrs;
  const isKeeper = normalizePosition(position) === "GK";
  // A keeper's own save chance scales directly with his goalkeeper quality; an outfield
  // player's finishing chance scales down against a better opposing keeper.
  const keeperSkill = isKeeper
    ? goalkeeperQuality(player.gkAttrs, {
        kind: kind === "penalty" ? "penaltySaves" : kind === "oneOnOne" ? "oneOnOne" : "shotStopping",
        overall: Number(player.overall) || 60,
      })
    : 60;
  const goalkeeperModifier = (75 - keeperQuality) * 0.004;
  switch (kind) {
    case "keeperSave":
      return clamp(
        0.18 + (keeperSkill - 40) * 0.0095,
        0.15,
        0.92,
      );
    case "chance":
      return clamp(
        (0.06 + ((a.shooting - 55) / 44) * 0.29) *
          (1 + ((player.weakFoot ?? 3) - 3) * 0.05) +
          goalkeeperModifier,
        0.03,
        0.65,
      );
    case "penalty":
      if (isKeeper) {
        return clamp(0.12 + (keeperSkill - 40) * 0.0085, 0.12, 0.78);
      }
      return clamp(
        (0.68 + ((a.shooting - 60) / 39) * 0.22) *
          (1 + ((player.weakFoot ?? 3) - 3) * 0.05) +
          goalkeeperModifier,
        0.5,
        0.97,
      );
    case "oneOnOne":
      if (isKeeper) {
        return clamp(0.16 + (keeperSkill - 40) * 0.0092, 0.15, 0.84);
      }
      return clamp(
        0.22 +
          ((a.dribbling - 55) / 44) *
            (0.33 + ((player.skillMoves ?? 3) - 3) * 0.025) +
          ((a.pace - 55) / 44) * 0.15 +
          goalkeeperModifier,
        0.1,
        0.82,
      );
    case "bigPass":
      return clamp(0.3 + ((a.passing - 55) / 44) * 0.36, 0.15, 0.78);
    case "lastDitch":
      return clamp(0.35 + ((a.defending - 55) / 44) * 0.36, 0.15, 0.82);
    default:
      return 0.4;
  }
}

/**
 * Match rating.
 *
 * Built from a weighted event score, then normalised by what is *expected* of the
 * position — a centre-back is judged on duels and interceptions, a striker on goals.
 * Finally anchored so the mean sits near 6.8, which is where real player-rating systems
 * sit, and clipped so a catastrophe is a 3.1 rather than a 1.0.
 */
export function computeRating(player, position, stats, match, side, rng) {
  const goals = stats.goals;
  const assists = stats.assists;
  const teamGoals = side === "home" ? match.homeGoals : match.awayGoals;
  const teamConceded = side === "home" ? match.awayGoals : match.homeGoals;

  // --- Attacking contribution ---
  const goalValue =
    {
      GK: 0.9,
      CB: 0.85,
      LB: 0.65,
      RB: 0.65,
      DM: 0.6,
      CM: 0.55,
      AM: 0.48,
      LW: 0.42,
      RW: 0.42,
      ST: 0.38,
    }[position] ?? 0.5;
  let score = goals * goalValue * 1.15 + assists * (goalValue * 0.72);

  // --- Passing ---
  const passAcc = stats.passes > 0 ? stats.passesCompleted / stats.passes : 0.7;
  // Above 85% is excellent, below 70% is poor; measured against a positional baseline
  // because centre-backs pass far more safely than wingers.
  const passBaseline =
    {
      GK: 0.86,
      CB: 0.9,
      LB: 0.84,
      RB: 0.84,
      DM: 0.88,
      CM: 0.85,
      AM: 0.8,
      LW: 0.78,
      RW: 0.78,
      ST: 0.72,
    }[position] ?? 0.84;
  score += (passAcc - passBaseline) * 2.6;
  score += Math.min(stats.keyPasses, 6) * 0.075;

  // --- Defensive work ---
  const defActions =
    stats.tacklesWon + stats.interceptions + stats.aerialsWon * 0.5;
  const defValue =
    {
      GK: 0.03,
      CB: 0.115,
      LB: 0.085,
      RB: 0.085,
      DM: 0.09,
      CM: 0.06,
      AM: 0.04,
      LW: 0.03,
      RW: 0.03,
      ST: 0.03,
    }[position] ?? 0.05;
  score += Math.min(defActions, 12) * defValue;

  // --- Duels and dribbles ---
  const duelRate = stats.duels > 0 ? stats.duelsWon / stats.duels : 0.5;
  score += (duelRate - 0.5) * 0.45;
  const dribbleRate =
    stats.dribbles > 0 ? stats.dribblesWon / stats.dribbles : 0.5;
  score += (dribbleRate - 0.5) * 0.35;

  // --- Goalkeeping ---
  if (position === "GK") {
    score += stats.saves * 0.055;
    // A clean sheet is worth a lot to a keeper; conceding three is a bad day.
    score += stats.cleanSheets * 0.5 - Math.max(0, teamConceded - 1) * 0.28;
  }

  // --- Team result ---
  // Winning matters, but not overwhelmingly: a defender in a 1-0 win should not out-rate
  // a striker who scored twice in a 2-3 defeat.
  const won =
    side === "home"
      ? match.homeGoals > match.awayGoals
      : match.awayGoals > match.homeGoals;
  const drew = match.homeGoals === match.awayGoals;
  score += won ? 0.24 : drew ? 0.04 : -0.14;

  // --- Discipline ---
  score -= stats.yellowCards * 0.22 + stats.redCards * 1.15;

  // Fouls and lost possession drag a rating down, as they do in real models.
  score -= Math.min(stats.foulsCommitted, 5) * 0.035;

  // Small amount of match noise so identical performances score slightly differently,
  // the way two identical stat lines in real life do. Wider spread than a single
  // decimal place so a good game and a great one are visibly different.
  score += rng.normal(0, 0.24);

  const rating = clamp(RATING_BASE + score, RATING_MIN, RATING_MAX);
  return round(rating, 1);
}

/** A short, FC-style coach comment on the performance. */
function describePerformance(position, stats, rating) {
  if (rating == null) return "Did not feature.";
  if (rating >= 9.0) return "Outstanding. A match-winning performance.";
  if (rating >= 8.0) {
    if (stats.goals >= 2)
      return "Clinical. The manager will want more of that.";
    if (stats.assists >= 2) return "Unplayable going forward.";
    return "Excellent. One of the best players on the pitch.";
  }
  if (rating >= 7.2) return "Good, solid performance. Kept your standards up.";
  if (rating >= 6.5) return "Steady. Did your job without standing out.";
  if (rating >= 5.8) return "Quiet game. You were on the periphery.";
  if (rating >= 4.8) return "Below par. The manager noticed.";
  return "A game to forget. Hooked early, and rightly so.";
}

function plcontrib(player) {
  return {
    vision: player.attrs.passing,
    engine: player.attrs.physical,
    flair: player.attrs.dribbling,
  };
}

function buildInvolvementLog(stats, position, contrib) {
  const lines = [];
  if (stats.goals)
    lines.push(`${stats.goals} goal${stats.goals > 1 ? "s" : ""}`);
  if (stats.assists)
    lines.push(`${stats.assists} assist${stats.assists > 1 ? "s" : ""}`);
  if (stats.keyPasses)
    lines.push(`${stats.keyPasses} key pass${stats.keyPasses > 1 ? "es" : ""}`);
  if (stats.shots)
    lines.push(
      `${stats.shots} shot${stats.shots > 1 ? "s" : ""} (${stats.shotsOnTarget} on target)`,
    );
  if (stats.passes) {
    const pct = stats.passes
      ? Math.round((stats.passesCompleted / stats.passes) * 100)
      : 0;
    lines.push(`${stats.passesCompleted}/${stats.passes} passes (${pct}%)`);
  }
  if (stats.duels) lines.push(`${stats.duelsWon}/${stats.duels} duels won`);
  if (stats.dribbles)
    lines.push(`${stats.dribblesWon}/${stats.dribbles} dribbles`);
  if (stats.tackles) lines.push(`${stats.tacklesWon}/${stats.tackles} tackles`);
  if (stats.interceptions) lines.push(`${stats.interceptions} interceptions`);
  if (stats.aerials)
    lines.push(`${stats.aerialsWon}/${stats.aerials} aerial duels`);
  if (stats.saves) lines.push(`${stats.saves} saves`);
  if (stats.yellowCards) lines.push("Booked");
  if (stats.redCards) lines.push("Sent off");
  return lines;
}

/**
 * Resolve a key moment with the player's attributes rather than the user's choice.
 * This is the "Coach" mode and is also what underpins the honesty of the displayed
 * success chance — the UI number comes from the same function.
 */
export function resolveMomentAuto(player, position, moment, rng) {
  const p =
    moment.autoSuccessChance ??
    autoSuccessChance(player, position, moment.kind);
  const success = rng.chance(p);
  return { success, probability: p };
}

export function keyMomentActions(kind, position, catalog) {
  const canonicalPosition = normalizePosition(position);
  const group = catalog?.positionGroups?.[canonicalPosition];
  const actions = catalog?.moments?.[kind]?.[group];
  const existing = Array.isArray(actions) ? actions : [];
  return [...existing, ...additionalPositionActions(canonicalPosition, kind)];
}

const POSITION_ACTION_DETAILS = {
  GK: {
    role: "goalkeeper",
    bigPass: [
      "roll quickly to the full-back",
      "clip a pass into the wide channel",
      "throw long toward the striker",
      "take a measured short restart",
    ],
    keeperSave: [
      "set early and attack the near side",
      "stay tall and narrow the angle",
      "take a quick step before diving",
      "hold your ground and watch the strike",
    ],
  },
  CB: {
    role: "centre-back",
    bigPass: [
      "break the first line with a firm pass",
      "switch play toward the far full-back",
      "feed the midfielder between the lines",
      "keep possession with a simple outlet",
    ],
    chance: [
      "attack the near post",
      "try a controlled first-time finish",
      "place the shot across goal",
      "hold off the marker before shooting",
    ],
    penalty: [
      "side-foot the ball toward the corner",
      "wait for the keeper before choosing a side",
      "strike firmly down the middle",
      "open your body and place it low",
    ],
    oneOnOne: [
      "take a touch around the keeper",
      "shoot early before the angle closes",
      "place the ball toward the far post",
      "use your strength to hold off the defender",
    ],
    lastDitch: [
      "step across to block the shooting lane",
      "track the runner and make a clean tackle",
      "cover the near post",
      "clear the danger toward the touchline",
    ],
  },
  LB: {
    role: "left-back",
    bigPass: [
      "thread the ball inside from the flank",
      "switch play to the right winger",
      "find the overlapping teammate",
      "keep the move safe with a short pass",
    ],
    chance: [
      "arrive late at the far post",
      "cut inside and place a shot",
      "hit a low drive across goal",
      "take a first-time effort from the edge",
    ],
    penalty: [
      "place the ball low into the corner",
      "wait for the keeper and send it the other way",
      "strike through the centre of the ball",
      "open your body and side-foot it",
    ],
    oneOnOne: [
      "take the ball beyond the keeper",
      "shoot across goal from the angle",
      "finish early before the recovery run",
      "use a composed touch to open the far corner",
    ],
    lastDitch: [
      "recover down the channel and block the cross",
      "get goal-side for a clean tackle",
      "cover the far post",
      "show the attacker away from goal",
    ],
  },
  RB: {
    role: "right-back",
    bigPass: [
      "thread the ball inside from the flank",
      "switch play to the left winger",
      "find the overlapping teammate",
      "keep the move safe with a short pass",
    ],
    chance: [
      "arrive late at the far post",
      "cut inside and place a shot",
      "hit a low drive across goal",
      "take a first-time effort from the edge",
    ],
    penalty: [
      "place the ball low into the corner",
      "wait for the keeper and send it the other way",
      "strike through the centre of the ball",
      "open your body and side-foot it",
    ],
    oneOnOne: [
      "take the ball beyond the keeper",
      "shoot across goal from the angle",
      "finish early before the recovery run",
      "use a composed touch to open the far corner",
    ],
    lastDitch: [
      "recover down the channel and block the cross",
      "get goal-side for a clean tackle",
      "cover the far post",
      "show the attacker away from goal",
    ],
  },
  DM: {
    role: "holding midfielder",
    bigPass: [
      "switch play away from the press",
      "slip a pass through the midfield line",
      "play a crisp one-two to escape pressure",
      "keep possession with a safe outlet",
    ],
    chance: [
      "arrive at the edge of the box",
      "take a first-time shot through traffic",
      "place a low effort toward the far post",
      "strike from the second-ball position",
    ],
    penalty: [
      "place the ball low into the corner",
      "wait for the keeper before choosing",
      "strike firmly down the middle",
      "side-foot it beyond the keeper's reach",
    ],
    oneOnOne: [
      "take a composed touch around the keeper",
      "shoot early as the angle opens",
      "place the finish across goal",
      "stay balanced and pick the corner",
    ],
    lastDitch: [
      "screen the passing lane and intercept",
      "track back for a clean tackle",
      "cover the centre before blocking",
      "hold your position and force a wide pass",
    ],
  },
  CM: {
    role: "central midfielder",
    bigPass: [
      "split the lines with a measured pass",
      "switch play toward the open flank",
      "combine quickly in a one-two",
      "keep the move flowing with a short pass",
    ],
    chance: [
      "arrive late at the edge of the area",
      "hit a first-time shot through traffic",
      "place the ball toward the far corner",
      "drive forward before taking the shot",
    ],
    penalty: [
      "place the ball low into the corner",
      "wait for the keeper before choosing",
      "strike firmly down the middle",
      "side-foot it beyond the keeper's reach",
    ],
    oneOnOne: [
      "take a composed touch around the keeper",
      "shoot early as the angle opens",
      "place the finish across goal",
      "stay balanced and pick the corner",
    ],
    lastDitch: [
      "track the runner and make a clean tackle",
      "intercept the pass into the channel",
      "cover the centre before blocking",
      "force the attacker toward the touchline",
    ],
  },
  AM: {
    role: "attacking midfielder",
    bigPass: [
      "thread a through-ball behind the defence",
      "slip a teammate into the half-space",
      "disguise a pass around the marker",
      "combine quickly at the edge of the box",
    ],
    chance: [
      "curl the ball toward the far corner",
      "take a quick touch and shoot",
      "place a low finish through traffic",
      "open your body and bend it around the keeper",
    ],
    penalty: [
      "wait for the keeper and place it low",
      "send the keeper the wrong way",
      "strike firmly into the side netting",
      "take a calm side-foot finish",
    ],
    oneOnOne: [
      "round the keeper with a composed touch",
      "lift the ball over the advancing keeper",
      "place the finish into the far corner",
      "shoot early before the angle closes",
    ],
    lastDitch: [
      "counter-press immediately after losing possession",
      "track back to block the central lane",
      "make a clean tackle from the side",
      "force the ball away from the danger area",
    ],
  },
  LW: {
    role: "left winger",
    bigPass: [
      "cut the ball back from the byline",
      "switch the attack to the far side",
      "slip the striker into the channel",
      "whip a low cross into the box",
    ],
    chance: [
      "cut inside and curl toward the far corner",
      "drive to the byline and finish at the near post",
      "take a quick touch before shooting",
      "bend a controlled effort around the keeper",
    ],
    penalty: [
      "wait for the keeper and place it low",
      "send the keeper the wrong way",
      "strike firmly into the side netting",
      "take a calm side-foot finish",
    ],
    oneOnOne: [
      "take the ball past the keeper",
      "finish early across the open angle",
      "lift the ball over the advancing keeper",
      "cut inside and place it into the far corner",
    ],
    lastDitch: [
      "track back along the touchline to make a tackle",
      "press the full-back into a rushed pass",
      "cover the passing lane to the winger",
      "recover quickly and block the cross",
    ],
  },
  RW: {
    role: "right winger",
    bigPass: [
      "cut the ball back from the byline",
      "switch the attack to the far side",
      "slip the striker into the channel",
      "whip a low cross into the box",
    ],
    chance: [
      "cut inside and curl toward the far corner",
      "drive to the byline and finish at the near post",
      "take a quick touch before shooting",
      "bend a controlled effort around the keeper",
    ],
    penalty: [
      "wait for the keeper and place it low",
      "send the keeper the wrong way",
      "strike firmly into the side netting",
      "take a calm side-foot finish",
    ],
    oneOnOne: [
      "take the ball past the keeper",
      "finish early across the open angle",
      "lift the ball over the advancing keeper",
      "cut inside and place it into the far corner",
    ],
    lastDitch: [
      "track back along the touchline to make a tackle",
      "press the full-back into a rushed pass",
      "cover the passing lane to the winger",
      "recover quickly and block the cross",
    ],
  },
  ST: {
    role: "striker",
    bigPass: [
      "lay the ball off for a teammate's run",
      "flick the pass into the channel",
      "hold up play and release the winger",
      "slip a runner through on goal",
    ],
    chance: [
      "strike first time toward the far corner",
      "use a quick feint before shooting",
      "place a low finish beyond the keeper",
      "hold off the defender and hit the target",
    ],
    penalty: [
      "wait for the keeper and place it low",
      "send the keeper the wrong way",
      "strike firmly into the side netting",
      "take a calm side-foot finish",
    ],
    oneOnOne: [
      "round the keeper and finish",
      "lift the ball over the advancing keeper",
      "place the finish into the far corner",
      "shoot early before the keeper sets",
    ],
    lastDitch: [
      "press the centre-back into a rushed clearance",
      "track back to block the passing lane",
      "make a clean tackle in midfield",
      "force the opponent toward the touchline",
    ],
  },
};

function additionalPositionActions(position, kind) {
  position = normalizePosition(position);
  const details = POSITION_ACTION_DETAILS[position];
  const phrases = details?.[kind];
  if (!phrases) return [];
  const effects = {
    bigPass: position === "GK" ? "pass" : "pass",
    chance: "shot",
    penalty: "shot",
    oneOnOne: position === "GK" ? "save" : "shot",
    keeperSave: "save",
    lastDitch:
      position === "CB" ||
      position === "LB" ||
      position === "RB" ||
      position === "DM" ||
      position === "CM"
        ? "tackle"
        : "block",
  };
  const attributes = {
    bigPass: "passing",
    chance: position === "GK" ? "reflexes" : "shooting",
    penalty: "shooting",
    oneOnOne: position === "GK" ? "reflexes" : "shooting",
    keeperSave: "reflexes",
    lastDitch: "defending",
  };
  const count = 10;
  const labels = Array.from({ length: count }, (_, index) => {
    const phrase = phrases[index % phrases.length];
    return index < phrases.length ? phrase : `${phrase} under pressure`;
  });
  return labels.map((label, index) => ({
    id: `extra-${position.toLowerCase()}-${kind}-${index + 1}`,
    label: `${label} (${details.role})`,
    attribute: attributes[kind],
    modifier: [0.12, 0.07, 0.02, -0.03, -0.08, -0.12, 0.1, -0.05, 0.04, -0.1][
      index % 10
    ],
    effect: effects[kind],
  }));
}

/** Resolve a position-specific action with its own skill check and risk profile. */
export function resolveMomentDecision(
  player,
  moment,
  decision,
  rng,
  catalog,
  position = moment.position ?? player.position,
) {
  const actions = keyMomentActions(moment.kind, position, catalog);
  let action = actions.find((candidate) => candidate.id === decision);
  if (!action && (decision === "take-risk" || decision === "play-safe")) {
    const modifier = decision === "take-risk" ? 0.08 : 0;
    action = {
      id: decision,
      label: decision === "take-risk" ? "Take the risk" : "Play it safe",
      attribute:
        moment.kind === "bigPass"
          ? "passing"
          : moment.kind === "lastDitch"
            ? "defending"
            : position === "GK"
              ? "reflexes"
              : "shooting",
      modifier,
      effect: ["chance", "penalty", "oneOnOne"].includes(moment.kind)
        ? "shot"
        : moment.kind === "keeperSave"
          ? "save"
          : moment.kind === "lastDitch"
            ? "block"
            : "pass",
    };
  }
  if (!action) throw new Error(`Unsupported key-moment action: ${decision}`);

  const goalkeeperAttribute = ["reflexes", "diving", "handling", "positioning", "kicking", "speed", "reactions", "jumping", "composure"].includes(
    action.attribute,
  );
  const selectedSkill = goalkeeperAttribute
    ? goalkeeperQuality(
        player.gkAttrs,
        action.attribute === "diving"
          ? { kind: "diving", overall: player.overall }
          : action.attribute === "handling"
            ? { kind: "handling", overall: player.overall }
            : action.attribute === "positioning"
              ? { kind: "positioning", overall: player.overall }
              : action.attribute === "kicking"
                ? { kind: "distribution", overall: player.overall }
                : { kind: "reflexes", overall: player.overall },
      )
    : (player.attrs?.[action.attribute] ?? 60);
  const baselineSkill =
    moment.kind === "keeperSave"
      ? goalkeeperQuality(player.gkAttrs, { kind: "shotStopping", overall: player.overall })
      : moment.kind === "bigPass"
        ? (player.attrs?.passing ?? 60)
        : moment.kind === "lastDitch"
          ? (player.attrs?.defending ?? 60)
          : (player.attrs?.shooting ?? 60);
  const skillAdjustment = clamp(
    (selectedSkill - baselineSkill) * 0.003,
    -0.12,
    0.12,
  );
  const probability = clamp(
    autoSuccessChance(
      player,
    position,
      moment.kind,
      moment.opposingKeeperQuality,
    ) +
      action.modifier +
      skillAdjustment -
      (moment.defensivePressure ?? 0) +
      (moment.roleSuccessAdjustment ?? 0),
    0.05,
    0.95,
  );
  return {
    decision: action.id,
    action: { ...action },
    success: rng.chance(probability),
    probability,
  };
}
