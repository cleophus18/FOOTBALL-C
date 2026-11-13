/**
 * The match engine.
 *
 * Both quick and detailed matches use the same event-driven possession engine.
 * Team expected goals and player ability influence the opportunities generated; passes,
 * defensive actions, shots and saves then determine the score and match statistics.
 *
 * Everything random here comes from a named RNG stream, so simulating a match does not
 * perturb the transfer market or the youth intake.
 */

import { clamp, round } from "../core/util.mjs";
import {
  INJURY_SEVERITIES,
  matchInjuryChance,
} from "./injury.mjs";
import { expectedGoals, normalizeTeamStrength, outcomeProbabilities } from "./strength.mjs";
import { FORMATIONS, selectLineup } from "../model/club.mjs";
import { simulatePossessionEngine } from "./event-engine.mjs";
import {
  applyMatchStamina,
  applyStaminaRecovery,
  staminaPerformanceFactor,
} from "../model/stamina.mjs";
import { groupOf } from "../core/constants.mjs";
import { goalkeeperQuality } from "../model/goalkeeper.mjs";

/**
 * A player cannot score more than this many goals in one league season. The cap is a
 * game rule, not a data quirk: without it a single elite striker can end a season on an
 * absurd total, and the record books stop meaning anything.
 */
export const MAX_LEAGUE_GOALS = 50;

/** The per-player league goal ceiling for a match, or null when the cap does not apply. */
export function leagueGoalLimit(competition) {
  return competition === "league" ? MAX_LEAGUE_GOALS : null;
}

/**
 * Simulate a background match using the shared event engine.
 *
 * @returns {{homeGoals:number, awayGoals:number, xg:object, events:Array, stats:object, playerStats:object}}
 */
export function simulateQuickMatch(home, away, ctx = {}) {
  const rng = ctx.rng;
  home = { ...home, strength: normalizeTeamStrength(home?.strength) };
  away = { ...away, strength: normalizeTeamStrength(away?.strength) };
  const xg = ctx.xg ?? expectedGoals(home.strength, away.strength, ctx);
  const homeQuality = teamUnitQuality(home.xi ?? [], "attack");
  const awayQuality = teamUnitQuality(away.xi ?? [], "attack");
  const homeDefending = teamUnitQuality(home.xi ?? [], "defense");
  const awayDefending = teamUnitQuality(away.xi ?? [], "defense");
  const tunedXg = {
    home: clamp((xg.home * homeQuality) / awayDefending, 0.1, 5),
    away: clamp((xg.away * awayQuality) / homeDefending, 0.1, 5),
  };
  const maxLeagueGoals = leagueGoalLimit(ctx.competition);
  let simulation = simulatePossessionEngine({
    home: { ...home, xi: home.xi ?? [] },
    away: { ...away, xi: away.xi ?? [] },
    baselineXg: tunedXg,
    rng,
    neutralVenue: ctx.neutralVenue,
    maxLeagueGoals,
  });
  let homeGoals = simulation.homeGoals;
  let awayGoals = simulation.awayGoals;

  // Knockout ties can require a winner. Extra time is simulated as a short, tired
  // extra period, then penalties if still level — matching real competition rules.
  let decidedBy = "normal";
  let penalties = null;
  if (ctx.mustHaveWinner && homeGoals === awayGoals) {
    const extraTime = simulatePossessionEngine({
      home: { ...home, xi: home.xi ?? [] },
      away: { ...away, xi: away.xi ?? [] },
      baselineXg: {
        home: tunedXg.home * (30 / 90) * 0.85,
        away: tunedXg.away * (30 / 90) * 0.85,
      },
      rng,
      neutralVenue: ctx.neutralVenue,
      minutes: 30,
      maxLeagueGoals,
    });
    simulation = mergeExtraTime(simulation, extraTime, 90);
    homeGoals += extraTime.homeGoals;
    awayGoals += extraTime.awayGoals;
    decidedBy = "extraTime";
    if (homeGoals === awayGoals) {
      const p = simulatePenalties(home, away, rng);
      penalties = p;
      decidedBy = "penalties";
    }
  }

  return {
    homeGoals,
    awayGoals,
    xg: simulation.xg,
    decidedBy,
    penalties,
    stats: simulation.stats,
    events: simulation.events,
    misc: simulation.misc,
    actions: simulation.actions,
    playerStats: simulation.playerStats,
    // Stoppage time is what the narrative layer uses as the "clock length".
    addedTime: rng.int(2, 6),
  };
}

function mergeExtraTime(regulation, extraTime, minuteOffset) {
  const merged = {
    ...regulation,
    homeGoals: regulation.homeGoals + extraTime.homeGoals,
    awayGoals: regulation.awayGoals + extraTime.awayGoals,
    xg: {
      home: round(regulation.xg.home + extraTime.xg.home, 2),
      away: round(regulation.xg.away + extraTime.xg.away, 2),
    },
    events: [
      ...regulation.events,
      ...extraTime.events.map((event) => ({
        ...event,
        minute: event.minute + minuteOffset,
      })),
    ],
    misc: [
      ...regulation.misc,
      ...extraTime.misc.map((event) => ({
        ...event,
        minute: event.minute + minuteOffset,
      })),
    ],
    actions: [
      ...regulation.actions,
      ...extraTime.actions.map((event) => ({
        ...event,
        minute: event.minute + minuteOffset,
      })),
    ],
    playerStats: { ...regulation.playerStats },
    stats: {},
  };
  for (const id of new Set([
    ...Object.keys(regulation.playerStats),
    ...Object.keys(extraTime.playerStats),
  ])) {
    const first = regulation.playerStats[id] ?? {};
    const second = extraTime.playerStats[id] ?? {};
    merged.playerStats[id] = {};
    for (const key of new Set([
      ...Object.keys(first),
      ...Object.keys(second),
    ])) {
      merged.playerStats[id][key] =
        (Number(first[key]) || 0) + (Number(second[key]) || 0);
    }
  }
  for (const side of ["home", "away"]) {
    const first = regulation.stats[side];
    const second = extraTime.stats[side];
    const stats = { ...first };
    for (const [key, value] of Object.entries(second)) {
      if (["possession", "passAccuracy"].includes(key)) continue;
      if (typeof value === "number")
        stats[key] = (Number(first[key]) || 0) + value;
    }
    stats.xg = merged.xg[side];
    stats.possessionSeconds =
      (first.possessionSeconds ?? 0) + (second.possessionSeconds ?? 0);
    stats.passAccuracy = stats.passes
      ? round((stats.passesCompleted / stats.passes) * 100, 1)
      : 0;
    merged.stats[side] = stats;
  }
  const possessionTotal =
    merged.stats.home.possessionSeconds + merged.stats.away.possessionSeconds;
  for (const side of ["home", "away"]) {
    merged.stats[side].possession = Math.round(
      (merged.stats[side].possessionSeconds / Math.max(1, possessionTotal)) *
        100,
    );
  }
  return merged;
}

/**
 * Penalty shootout. Best of five, then sudden death.
 * Modelled on the real thing rather than a coin flip: better keepers and more
 * composed takers measurably matter, and the pressure rises with each sudden-death round.
 */
export function simulatePenalties(home, away, rng) {
  const score = { home: 0, away: 0 };
  const taken = { home: [], away: [] };
  const hQuality = penaltyQuality(home);
  const aQuality = penaltyQuality(away);

  const take = (side, quality, keeperQuality, round, suddenDeath) => {
    // Base conversion is ~75%, which is the real success rate in professional shootouts.
    const skill = clamp(0.75 + (quality - keeperQuality) * 0.004, 0.5, 0.93);
    // Sudden death is measurably harder for everyone.
    const pressure = suddenDeath ? 0.93 : 1 - round * 0.012;
    return rng.chance(skill * pressure);
  };

  const order = ["home", "away"];
  for (let round = 0; round < 5; round++) {
    for (const side of order) {
      const opp = side === "home" ? "away" : "home";
      const scored = take(
        side,
        side === "home" ? hQuality : aQuality,
        opp === "home" ? hQuality : aQuality,
        round,
        false,
      );
      taken[side].push(scored);
      if (scored) score[side]++;
      // A shootout can be over before all five are taken.
      if (round >= 2 && canDecide(score, round + 1)) break;
    }
    if (canDecide(score, round + 1) && round >= 2) break;
  }

  let sdRound = 0;
  while (score.home === score.away && sdRound < 20) {
    const h = take("home", hQuality, aQuality, sdRound, true);
    const a = take("away", aQuality, hQuality, sdRound, true);
    taken.home.push(h);
    taken.away.push(a);
    if (h) score.home++;
    if (a) score.away++;
    sdRound++;
  }
  // Safety net; a real shootout never runs this long.
  while (score.home === score.away) {
    if (rng.chance(0.5)) score.home++;
    else score.away++;
  }

  return { ...score, taken, winner: score.home > score.away ? "home" : "away" };
}

/** Given the score, is a shootout already decided? */
function canDecide(score, takenEach) {
  const remaining = 5 - takenEach;
  return Math.abs(score.home - score.away) > remaining;
}

function penaltyQuality(team) {
  // Used by both the quality rolls above and, in the detailed engine, to decide who
  // steps up in a shootout. Kept as a standalone so both callers share one definition.
  if (!team.xi || !team.xi.length) return 65;
  const taker = team.xi
    .filter((p) => p.position !== "GK")
    .sort((a, b) => (b.attrs.shooting ?? 0) - (a.attrs.shooting ?? 0))[0];
  return taker ? (taker.attrs.shooting ?? 60) : 60;
}

function keeperQuality(team) {
  if (!team.xi || !team.xi.length) return 65;
  const gk = team.xi.find((p) => p.position === "GK");
  if (!gk) return 55;
  // One definition of goalkeeper quality, shared by every simulation path.
  return goalkeeperQuality(gk.gkAttrs, {
    kind: "shotStopping",
    overall: Number(gk.overall) || 60,
  });
}

/**
 * The full match, including per-player detail for the clubs involved.
 *
 * Every match produces the same event-backed team and player statistics. The optional
 * detailed-player metadata is retained for existing callers and UI behavior.
 *
 * @param {object} opts
 *   home/away: { club, players, strength }
 *   rng: Rng
 *   dayIndex: number
 *   detailedPlayerIds: string[]  players to generate full involvement logs for
 *   mustHaveWinner: boolean
 */
export function simulateMatch(opts) {
  let {
    home,
    away,
    rng,
    dayIndex,
    detailedPlayerIds = [],
    forcedPlayerIds = [],
    benchOnlyPlayerIds = [],
    excludedPlayerIds = [],
    playerRoles = {},
    mustHaveWinner = false,
    competition = null,
    neutralVenue = false,
    importance = 1,
  } = opts;
  const normalizedHome = { ...home, strength: normalizeTeamStrength(home?.strength) };
  const normalizedAway = { ...away, strength: normalizeTeamStrength(away?.strength) };
  home = normalizedHome;
  away = normalizedAway;

  // 1. Pick the XIs. The manager's trust in each player is injected onto the player
  //    objects here, because the selector is a pure function of the squad it is given.
  const homeSquad = home.players.filter(
    (p) =>
      home.club.squad.includes(p.id) && !p.injury && !(p.suspensionWeeks > 0),
  );
  const awaySquad = away.players.filter(
    (p) =>
      away.club.squad.includes(p.id) && !p.injury && !(p.suspensionWeeks > 0),
  );

  for (const p of homeSquad) {
    const trustOf = home.club.manager?.trustOf;
    p._managerTrust = typeof trustOf === "function"
      ? trustOf.call(home.club.manager, p.id)
      : Number(home.club.manager?.trust?.[p.id] ?? 50);
  }
  for (const p of awaySquad) {
    const trustOf = away.club.manager?.trustOf;
    p._managerTrust = typeof trustOf === "function"
      ? trustOf.call(away.club.manager, p.id)
      : Number(away.club.manager?.trust?.[p.id] ?? 50);
  }

  const homeSel = selectLineup(homeSquad, home.club.formation, dayIndex, {
    customXI: home.club.customXI ?? [],
    forcedXI: forcedPlayerIds.filter((id) => home.club.squad.includes(id)),
    benchOnly: benchOnlyPlayerIds.filter((id) => home.club.squad.includes(id)),
    // Players explicitly excluded (e.g. an unused career player on the bench) are kept
    // out of the XI entirely, so they can never score, pick up cards or key moments.
    excluded: excludedPlayerIds.filter((id) => home.club.squad.includes(id)),
    prioritizeRating: forcedPlayerIds.length > 0,
  });
  const awaySel = selectLineup(awaySquad, away.club.formation, dayIndex, {
    customXI: away.club.customXI ?? [],
    forcedXI: forcedPlayerIds.filter((id) => away.club.squad.includes(id)),
    benchOnly: benchOnlyPlayerIds.filter((id) => away.club.squad.includes(id)),
    excluded: excludedPlayerIds.filter((id) => away.club.squad.includes(id)),
    prioritizeRating: forcedPlayerIds.length > 0,
  });

  const homeXI = homeSel.xi.map((s) => s.player);
  const awayXI = awaySel.xi.map((s) => s.player);
  const homeAttackQuality = teamUnitQuality(homeXI, "attack");
  const homeDefenseQuality = teamUnitQuality(homeXI, "defense");
  const awayAttackQuality = teamUnitQuality(awayXI, "attack");
  const awayDefenseQuality = teamUnitQuality(awayXI, "defense");
  const homeTactical = teamTacticalModifier(home.club, homeXI);
  const awayTactical = teamTacticalModifier(away.club, awayXI);

  // 2. The scoreline reflects actual available XI quality and role/tactical fit.
  const xg = expectedGoals(
    { ...home.strength, attack: home.strength.attack * homeAttackQuality * homeTactical.attack, defence: home.strength.defence * homeDefenseQuality * homeTactical.defence },
    { ...away.strength, attack: away.strength.attack * awayAttackQuality * awayTactical.attack, defence: away.strength.defence * awayDefenseQuality * awayTactical.defence },
    { neutralVenue },
  );
  const homeShape = FORMATIONS[home.club.formation]?.shape;
  const awayShape = FORMATIONS[away.club.formation]?.shape;
  let simulation = simulatePossessionEngine({
    home: {
      club: home.club,
      xi: homeXI,
      roles: playerRoles,
      strength: home.strength,
      shape: homeShape,
      importance,
    },
    away: {
      club: away.club,
      xi: awayXI,
      roles: playerRoles,
      strength: away.strength,
      shape: awayShape,
      importance,
    },
    baselineXg: xg,
    rng,
    neutralVenue,
    maxLeagueGoals: leagueGoalLimit(competition),
  });
  const result = {
    homeGoals: simulation.homeGoals,
    awayGoals: simulation.awayGoals,
    decidedBy: "normal",
    penalties: null,
    addedTime: rng.int(2, 6),
  };
  if (mustHaveWinner && result.homeGoals === result.awayGoals) {
    const extraTime = simulatePossessionEngine({
      home: {
        club: home.club,
        xi: homeXI,
        roles: playerRoles,
        strength: home.strength,
        shape: homeShape,
        importance,
      },
      away: {
        club: away.club,
        xi: awayXI,
        roles: playerRoles,
        strength: away.strength,
        shape: awayShape,
        importance,
      },
      baselineXg: {
        home: xg.home * (30 / 90) * 0.85,
        away: xg.away * (30 / 90) * 0.85,
      },
      rng,
      neutralVenue,
      minutes: 30,
      maxLeagueGoals: leagueGoalLimit(competition),
    });
    simulation = mergeExtraTime(simulation, extraTime, 90);
    result.homeGoals += extraTime.homeGoals;
    result.awayGoals += extraTime.awayGoals;
    result.decidedBy = "extraTime";
    if (result.homeGoals === result.awayGoals) {
      result.penalties = simulatePenalties({ xi: homeXI }, { xi: awayXI }, rng);
      result.decidedBy = "penalties";
    }
  }

  const events = simulation.events;
  const misc = simulation.misc;
  for (const [side, xi] of [["home", homeXI], ["away", awayXI]]) {
    for (const player of xi) {
      if (rng.chance(matchInjuryChance(player, importance))) {
        misc.push({
          type: "injury",
          side,
          minute: rng.int(5, 90),
          playerId: player.id,
          playerName: `${player.first} ${player.last}`,
          severity: rng.weightedPick(
            ["serious", "moderate", "minor", "knock"],
            (severity) =>
              INJURY_SEVERITIES.find((entry) => entry.type === severity).weight,
          ),
        });
      }
    }
  }
  const matchStats = simulation.stats;

  const substitutions = { home: [], away: [] };
  for (const [side, sel] of [["home", homeSel], ["away", awaySel]]) {
    let subsUsed = 0;
    for (const entry of sel.xi) {
      if (subsUsed >= 3) break;
      const starter = entry.player;
      if (Number(starter.stamina ?? 100) >= 48) continue;
      const replacement = sel.subs.find((candidate) => {
        const sameGroup = groupOf(candidate.position) === groupOf(starter.position);
        const replacementStamina = Number(candidate.stamina ?? 100);
        return sameGroup && replacementStamina >= Number(starter.stamina ?? 100) + 8;
      });
      if (!replacement) continue;
      const minute = 58 + subsUsed * 12;
      substitutions[side].push({ playerId: starter.id, replacementId: replacement.id, minute });
      misc.push({
        type: "sub",
        side,
        minute,
        playerId: replacement.id,
        playerName: `${replacement.first} ${replacement.last}`,
        replacedId: starter.id,
        replacedName: `${starter.first} ${starter.last}`,
        on: true,
      });
      subsUsed++;
    }
    const fullMatchMinutes =
      result.decidedBy === "extraTime" || result.decidedBy === "penalties" ? 120 : 90;
    const minutes = new Map();
    for (const player of sel.xi) minutes.set(player.id, fullMatchMinutes);
    for (const entry of substitutions[side]) {
      minutes.set(entry.playerId, entry.minute);
      minutes.set(entry.replacementId, fullMatchMinutes - entry.minute);
    }
    for (const event of misc) {
      if (event.side !== side) continue;
      if (
        ["injury", "red"].includes(event.type) &&
        minutes.has(event.playerId) &&
        Number.isFinite(event.minute)
      ) {
        minutes.set(event.playerId, Math.min(minutes.get(event.playerId), event.minute));
      }
    }
    for (const [playerId, playerMinutes] of minutes) {
      const player = [...sel.xi, ...sel.subs, ...(sel.unused ?? [])]
        .find((candidate) => candidate.id === playerId);
      if (player) {
        applyMatchStamina(
          player,
          playerMinutes,
          1 + (importance - 1) * 0.08,
        );
      }
    }
    const usedIds = new Set(substitutions[side].map((entry) => entry.replacementId));
    for (const player of [...sel.subs, ...(sel.unused ?? [])]) {
      if (usedIds.has(player.id)) continue;
      applyStaminaRecovery(player, 7, 0.8, 1);
    }
  }
  misc.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  return {
    home: {
      clubId: home.club.id,
      name: home.club.name,
      formation: home.club.formation,
      coach: home.club.manager?.name ?? null,
      xi: homeXI.map((p) => p.id),
      startingXI: homeXI.map((p) => p.id),
      xiSlots: homeSel.xi.map((s) => ({
        slot: s.slot,
        slotIndex: s.slotIndex,
        id: s.player.id,
        first: s.player.first,
        last: s.player.last,
        position: s.player.position,
        overall: s.player.overall,
        shirtNumber: s.player.shirtNumber,
      })),
      subs: homeSel.subs.map((p) => p.id),
    },
    away: {
      clubId: away.club.id,
      name: away.club.name,
      formation: away.club.formation,
      coach: away.club.manager?.name ?? null,
      xi: awayXI.map((p) => p.id),
      startingXI: awayXI.map((p) => p.id),
      xiSlots: awaySel.xi.map((s) => ({
        slot: s.slot,
        slotIndex: s.slotIndex,
        id: s.player.id,
        first: s.player.first,
        last: s.player.last,
        position: s.player.position,
        overall: s.player.overall,
        shirtNumber: s.player.shirtNumber,
      })),
      subs: awaySel.subs.map((p) => p.id),
    },
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    xg: simulation.xg,
    stats: matchStats,
    events,
    misc,
    actions: simulation.actions,
    playerStats: simulation.playerStats,
    decidedBy: result.decidedBy,
    penalties: result.penalties,
    addedTime: result.addedTime,
    substitutions,
    competitionId: competition?.id ?? null,
    dayIndex,
    neutralVenue,
    generatedFor: detailedPlayerIds,
  };
}

/**
 * Build a compact, human-readable timeline for the UI and the inbox.
 * Deliberately separate from the sim so the log can be re-formatted (or translated)
 * without touching a single simulation rule.
 */
export function formatTimeline(match) {
  /** @type {{minute:number, text:string}[]} */
  const rows = [];

  for (const ev of match.events) {
    const side = ev.side === "home" ? match.home.name : match.away.name;
    let text = `GOAL  ${ev.minute}'  ${ev.scorerName} (${side})`;
    if (ev.penalty) text += " — penalty";
    if (ev.ownGoal)
      text = `GOAL  ${ev.minute}'  ${ev.scorerName} (${side}) — own goal`;
    if (ev.assistName) text += ` — assist: ${ev.assistName}`;
    rows.push({ minute: ev.minute, text });
  }

  for (const ev of match.misc) {
    const side = ev.side === "home" ? match.home.name : match.away.name;
    const labels = {
      yellow: "YELLOW",
      red: "RED",
      injury: "INJURY",
      foul: "FOUL",
      freeKick: "FREE KICK",
      offside: "OFFSIDE",
      block: "BLOCK",
      save: "SAVE",
    };
    const label = labels[ev.type];
    if (label) {
      const player =
        ev.type === "freeKick"
          ? (ev.description ?? "Free kick awarded")
          : ev.playerName;
      rows.push({
        minute: ev.minute,
        text: `${label} ${ev.minute}'  ${player ?? "Match event"} (${side})`,
      });
    }
  }

  rows.sort((a, b) => a.minute - b.minute);
  return rows.map((r) => r.text);
}

/** Convenience: pre-match odds for the preview screen. */
export function matchPreview(home, away, ctx = {}) {
  const xg = expectedGoals(home.strength, away.strength, ctx);
  return { xg, probabilities: outcomeProbabilities(xg.home, xg.away) };
}


function teamUnitQuality(xi, unit) {
  if (!xi?.length) return 1;
  const scores = xi.map((player) => {
    const position = player.position;
    const relevant = unit === "attack"
      ? (position === "GK" ? 35 : (player.attrs?.shooting ?? 55) * 0.26 + (player.attrs?.passing ?? 55) * 0.24 + (player.attrs?.dribbling ?? 55) * 0.22 + (player.attrs?.pace ?? 55) * 0.12 + (player.overall ?? 60) * 0.16)
      : (position === "GK"
          ? goalkeeperQuality(player.gkAttrs, { kind: "shotStopping", overall: player.overall })
          : (player.attrs?.defending ?? 55) * 0.38 + (player.attrs?.physical ?? 55) * 0.18 + (player.attrs?.pace ?? 55) * 0.08 + (player.overall ?? 60) * 0.36);
    const form = clamp(1 + ((player.form ?? 50) - 50) * 0.0015, 0.9, 1.08);
    const fatigue = clamp(1 - (player.fatigue ?? 0) * 0.001, 0.82, 1);
    const stamina = staminaPerformanceFactor(player);
    return relevant * form * fatigue * stamina;
  });
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return clamp(0.88 + (average - 65) * 0.0035, 0.75, 1.13);
}

function teamTacticalModifier(club, xi) {
  const style = club.manager?.playstyle ?? club.manager?.style ?? "Balanced";
  const tactical = {
    Possession: { attack:1.025, defence:1.005, preferred:["tikiTaka","firstTouch","technical","incisivePass"] },
    "Tiki-Taka": { attack:1.03, defence:1, preferred:["tikiTaka","firstTouch","technical","incisivePass"] },
    Counter: { attack:1.04, defence:1.015, preferred:["rapid","rapidBreakaway","longBallPass","incisivePass"] },
    "High Press": { attack:1.025, defence:0.995, preferred:["relentless","trackBack","intercept","anticipate"] },
    Gegenpressing: { attack:1.02, defence:0.99, preferred:["relentless","trackBack","intercept","anticipate"] },
    "Wing Play": { attack:1.035, defence:0.99, preferred:["whippedPass","precisionCross","aerial","powerHeader"] },
    "Low Block": { attack:0.965, defence:1.035, preferred:["anticipate","block","jockey","aerialFortress"] },
    Direct: { attack:1.015, defence:1.01, preferred:["longBallPass","aerial","powerHeader","rapidBreakaway"] },
    "Long Ball": { attack:1.015, defence:1.01, preferred:["longBallPass","aerial","powerHeader"] },
    Balanced: { attack:1, defence:1, preferred:[] },
  }[style] ?? { attack:1, defence:1, preferred:[] };
  const fit = xi.length ? xi.reduce((sum, player) => sum + (player.playStyles?.unlocked ?? []).filter((badge) => tactical.preferred.includes(badge.id)).length, 0) / xi.length : 0;
  const fitModifier = 1 + clamp(fit * 0.007, 0, 0.035);
  const coach = club.manager?.coachingAttributes ?? {};
  const preparation = 1 + clamp(((coach.matchPreparation ?? 50) - 50) * 0.0007, -0.035, 0.035);
  const tacticalAwareness = 1 + clamp(((coach.tacticalIntelligence ?? 50) - 50) * 0.0006, -0.03, 0.03);
  const decisionMaking = 1 + clamp(((coach.inGameDecisionMaking ?? 50) - 50) * 0.0004, -0.02, 0.02);
  return {
    attack: tactical.attack * fitModifier * preparation * tacticalAwareness,
    defence: tactical.defence * fitModifier * preparation * decisionMaking,
  };
}
