import { groupOf, normalizePosition } from "../core/constants.mjs";
import { clamp, round } from "../core/util.mjs";
import { calculatePlayerOverall, effectiveRating } from "./player.mjs";
import { goalkeeperQuality } from "./goalkeeper.mjs";

const FORMATION_SLOTS = {
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "CAM", "LW", "RW", "ST"],
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LW", "CM", "CM", "RW", "ST", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LB", "CDM", "CM", "CM", "RB", "ST", "ST"],
  "4-1-4-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "LW", "CM", "CM", "RW", "ST"],
  "5-3-2": ["GK", "LB", "CB", "CB", "CB", "RB", "CDM", "CM", "CM", "ST", "ST"],
  "3-4-3": ["GK", "CB", "CB", "CB", "LB", "CM", "CM", "RB", "LW", "ST", "RW"],
  "4-3-2-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CAM", "CAM", "ST"],
  "4-2-2-2": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "CAM", "CAM", "ST", "ST"],
  "4-1-2-1-2": ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CAM", "ST", "ST"],
  "4-5-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CM", "CAM", "ST"],
  "5-4-1": ["GK", "LB", "CB", "CB", "CB", "RB", "CDM", "CM", "CM", "CM", "ST"],
  "3-4-2-1": ["GK", "CB", "CB", "CB", "LB", "CM", "CM", "RB", "CAM", "CAM", "ST"],
  "4-4-1-1": ["GK", "LB", "CB", "CB", "RB", "LW", "CM", "CM", "RW", "CAM", "ST"],
};

const DEFAULT_SLOTS = FORMATION_SLOTS["4-3-3"];

const bounded = (value, fallback = 1) =>
  clamp(Number.isFinite(Number(value)) ? Number(value) : 50, 1, 99);

function slotFit(player, slot) {
  const natural = normalizePosition(player.position ?? "CM");
  const alternatives = (player.altPositions ?? []).map(normalizePosition);
  if (natural === slot) return 1;
  if (alternatives.includes(slot)) return 0.97;
  if (groupOf(natural) === groupOf(slot)) return 0.88;
  if (slot === "GK" || natural === "GK") return 0.35;
  return 0.62;
}

function pickLineup(players, slots, availableOnly) {
  const pool = players.filter((player) =>
    !availableOnly || (!player.injury && !(player.suspensionWeeks > 0)),
  );
  const unused = new Set(pool);
  return slots.map((slot) => {
    let best;
    for (const player of unused) {
      const score = calculatePlayerOverall(player, slot) * slotFit(player, slot);
      if (!best || score > best.score) best = { player, slot, score };
    }
    if (!best) return null;
    unused.delete(best.player);
    return best;
  }).filter(Boolean);
}

function average(items, value) {
  return items.length
    ? items.reduce((sum, item) => sum + value(item), 0) / items.length
    : 50;
}

function lineRatings(lineup, useEffective, dayIndex) {
  const rated = lineup.map(({ player, slot }) => ({
    player,
    slot,
    rating: useEffective
      ? effectiveRating(player, slot, { dayIndex })
      : calculatePlayerOverall(player, slot),
  }));
  const area = (name) => rated.filter(({ slot }) => groupOf(slot) === name);
  const goalkeeper = rated.filter(({ slot }) => normalizePosition(slot) === "GK");
  const defence = average(area("DEF"), (item) => item.rating);
  const midfield = average(area("MID"), (item) => item.rating);
  const attack = average(area("ATT"), (item) => item.rating);
  const keeper = average(goalkeeper, (item) => item.rating);
  const suitability = average(rated, ({ player, slot }) => slotFit(player, slot) * 100);
  const familiarity = average(
    rated,
    ({ player }) => Math.min(100, 50 + (player.stats?.apps ?? player.apps ?? 0) * 0.5),
  );
  const fitness = average(rated, ({ player }) => {
    const fatigue = clamp(Number(player.fatigue) || 0, 0, 100);
    return (Number.isFinite(player.fitness) ? player.fitness : 100) - fatigue * 0.35;
  });
  const goalkeepingQuality = average(
    goalkeeper,
    ({ player }) => goalkeeperQuality(player.gkAttrs, {
      kind: "shotStopping",
      overall: Number(player.overall) || 55,
    }),
  );
  return {
    attack: bounded(attack),
    midfield: bounded(midfield),
    defence: bounded(defence * 0.8 + keeper * 0.2),
    goalkeeping: bounded(goalkeepingQuality),
    positionSuitability: bounded(suitability),
    tacticalFamiliarity: bounded(familiarity),
    fitness: bounded(fitness),
    overall: bounded(average(rated, (item) => item.rating)),
    lineup: rated,
  };
}

/**
 * Calculate the club's football ratings without mutating the club or players.
 * squadOverall and startingXIOverall intentionally ignore availability; only
 * matchdayOverall changes when injuries or suspensions remove players.
 */
export function calculateTeamRatings(club = {}, players = [], dayIndex = 0) {
  const squad = players.filter((player) => (club.squad ?? []).includes(player.id));
  const slots = FORMATION_SLOTS[club.formation] ?? DEFAULT_SLOTS;
  const starting = pickLineup(squad, slots, false);
  const matchday = pickLineup(squad, slots, true);
  const base = lineRatings(starting, false, dayIndex);
  const live = lineRatings(matchday, true, dayIndex);
  const depthPlayers = squad
    .filter((player) => !player.injury && !(player.suspensionWeeks > 0))
    .sort(
      (a, b) =>
        effectiveRating(b, b.position, { dayIndex }) -
        effectiveRating(a, a.position, { dayIndex }),
    )
    .slice(11, 18);
  return {
    attack: base.attack,
    midfield: base.midfield,
    defence: base.defence,
    goalkeeping: live.goalkeeping,
    squadDepth: bounded(
      average(depthPlayers, (player) => effectiveRating(player, player.position, { dayIndex })),
    ),
    fitness: live.fitness,
    chemistry: live.tacticalFamiliarity,
    tacticalFamiliarity: live.tacticalFamiliarity,
    positionSuitability: live.positionSuitability,
    overall: base.overall,
    squadOverall: bounded(average(squad, (player) => calculatePlayerOverall(player))),
    startingXIOverall: base.overall,
    matchdayOverall: live.overall,
    matchdayAttack: live.attack,
    matchdayMidfield: live.midfield,
    matchdayDefence: live.defence,
    formation: club.formation ?? "4-3-3",
    startingXI: starting.map(({ player }) => player.id),
    matchdayXI: matchday.map(({ player }) => player.id),
  };
}

export function teamRatingSummary(club, players, dayIndex = 0) {
  const ratings = calculateTeamRatings(club, players, dayIndex);
  return Object.fromEntries(
    Object.entries(ratings).map(([key, value]) =>
      typeof value === "number" ? [key, round(bounded(value), 2)] : [key, value],
    ),
  );
}
