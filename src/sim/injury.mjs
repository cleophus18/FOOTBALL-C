import { ensureStamina } from "../model/stamina.mjs";
import { playStyleTier } from "../model/playstyles.mjs";

/**
 * The injury system.
 *
 * A player who is injured sits out of every match — league, cup, Europe and the World
 * Cup — until he is fit again. Three things decide who gets hurt:
 *
 *   1. **Physicality.** A player's `physical` group attribute (strength, stamina,
 *      jumping, aggression) is the main protection. A strong, robust player shrugs off
 *      knocks that put a frail one out for weeks, so the same challenge has a very
 *      different risk for the two of them.
 *   2. **Load.** A tired player (`fatigue`) and a player whose `fitness` has dropped are
 *      far more likely to break down.
 *   3. **Traits.** "Injury Prone" multiplies the risk, "Iron Man" divides it.
 *
 * Severity is drawn the same way in every competition so a knock is always a knock and
 * a serious injury is always serious, whether it happens in training or a cup final.
 */

/** The injury catalogue. `weight` is the relative chance of each severity. */
export const INJURY_SEVERITIES = [
  { type: "knock", label: "Knock", minWeeks: 1, maxWeeks: 1, weight: 10 },
  { type: "minor", label: "Minor injury", minWeeks: 2, maxWeeks: 3, weight: 6 },
  {
    type: "moderate",
    label: "Moderate injury",
    minWeeks: 4,
    maxWeeks: 6,
    weight: 3,
  },
  {
    type: "serious",
    label: "Serious injury",
    minWeeks: 8,
    maxWeeks: 16,
    weight: 1,
  },
];

/** A human-readable label for a stored injury severity. */
export function injurySeverityLabel(severity) {
  return (
    INJURY_SEVERITIES.find((entry) => entry.type === severity)?.label ??
    "Injury"
  );
}

/**
 * The physical attribute that protects a player. Keepers are rated on `physical` too,
 * so a keeper built like a fighter is more durable than a slight one.
 */
function physicalOf(player) {
  const value = player?.attrs?.physical;
  return Number.isFinite(value) ? value : 60;
}

/**
 * How many times more (or less) likely this player is to be hurt than an average
 * player in average condition. 1 means "average", 2 means "twice as likely".
 */
export function injuryRiskMultiplier(player) {
  if (!player) return 1;
  const physical = physicalOf(player);
  // Physical 50 is the reference point. Each point above it shaves 2.5% off the risk,
  // each point below adds it — a 90-physical tank is ~55% safer than a 50-physical
  // prospect, who is ~30% more fragile than the reference.
  const physique = Math.max(0.25, 1 - (physical - 50) * 0.025);
  const fatigue = Number(player.fatigue) || 0;
  const fitness = Number.isFinite(player.fitness) ? player.fitness : 100;
  const stamina = ensureStamina(player);
  const lowStaminaLoad =
    stamina >= 75 ? 1
      : stamina >= 40 ? 1 + (75 - stamina) * 0.018
        : 1 + (75 - stamina) * 0.038;
  const load =
    1 + Math.max(0, fatigue - 30) * 0.012 + Math.max(0, 80 - fitness) * 0.01;
  const staminaLoad = load * lowStaminaLoad;
  const traits = player.traits ?? [];
  const traitFactor = traits.includes("Injury Prone")
    ? 1.75
    : traits.includes("Iron Man")
      ? 0.45
      : 1;
  const engineTier = playStyleTier(player, "engine");
  const engineFactor =
    engineTier === "plus" ? 0.35
      : engineTier === "standard" ? 0.55
        : 1;
  return Math.max(0.1, physique * staminaLoad * traitFactor * engineFactor);
}

/**
 * The chance (0..1) a player picks up an injury in a single match. `importance`
 * scales with the stakes of the game, exactly like cards do in the match sim.
 */
export function matchInjuryChance(player, importance = 1) {
  const base = 0.016 * Math.max(0.75, Math.min(1.5, importance));
  return Math.min(0.2, base * injuryRiskMultiplier(player));
}

/** The chance (0..1) a player picks up an injury during a training week. */
export function trainingInjuryChance(player, intensity = 1) {
  const base = 0.008 * Math.max(0.5, Math.min(1.5, intensity));
  return Math.min(0.15, base * injuryRiskMultiplier(player));
}

/**
 * Draw an injury for a player. Returns the stored injury record
 * `{ type, label, weeks, matchMinute }` or null when the roll says he is fine.
 *
 * `rng` must be a seeded stream so saves stay reproducible.
 */
export function rollInjury(player, rng, { chance, minute = null } = {}) {
  if (!player || player.injury) return null;
  const roll = Number.isFinite(chance) ? chance : matchInjuryChance(player);
  if (!rng.chance(Math.max(0, Math.min(1, roll)))) return null;
  const severity = rng.weightedPick(
    INJURY_SEVERITIES.map((entry) => entry.type),
    (type) => INJURY_SEVERITIES.find((entry) => entry.type === type).weight,
  );
  return createInjury(severity, rng, minute);
}

/** Build an injury record of a given severity, with a duration drawn from its range. */
export function createInjury(severity, rng, minute = null) {
  const entry =
    INJURY_SEVERITIES.find((candidate) => candidate.type === severity) ??
    INJURY_SEVERITIES[0];
  const weeks = rng.int(entry.minWeeks, entry.maxWeeks);
  return {
    type: entry.type,
    label: entry.label,
    weeks,
    matchMinute: minute,
  };
}

/** True when the player cannot be selected because he is injured. */
export function isInjured(player) {
  return !!player?.injury && (player.injury.weeks ?? 0) > 0;
}

/**
 * Advance an injury by one week. Mutates the player and clears the injury once the
 * lay-off is over. Returns the player (so callers can chain).
 */
export function progressInjury(player) {
  if (!player?.injury) return player;
  player.injury.weeks = Math.max(0, (player.injury.weeks ?? 1) - 1);
  if (player.injury.weeks === 0) {
    player.injury = null;
  } else if (player.fitness != null) {
    // Rehab is gradual: a player coming back is less sharp than one who never left.
    player.fitness = Math.max(0, Math.min(100, player.fitness - 1));
  }
  return player;
}
