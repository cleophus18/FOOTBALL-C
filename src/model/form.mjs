/**
 * Form-adjusted overall.
 *
 * A player's `overall` is his *base* rating: the ceiling his attributes can reach and
 * the number development, training and the transfer market all work from. Form is a
 * separate, temporary layer on top of it:
 *
 *   - a player in great form shows a higher OVR (up to FORM_OVERALL_MAX bonus points),
 *   - a player out of form shows a lower OVR (down to FORM_OVERALL_MAX points),
 *   - established NPCs remain capped by potential, while the career player's form
 *     ceiling is 99 so a developed player can reach the game's top displayed rating.
 *
 * Keeping this in one place means the profile, the squad list, the player directory and
 * the match engine all read the same number instead of each inventing their own.
 */

/** The most form can add to (or take from) a player's displayed overall. */
export const FORM_OVERALL_MAX = 5;

/** Form runs 0..100 and 50 is neutral, so this is the break-even point. */
export const NEUTRAL_FORM = 50;

/**
 * The form swing in whole rating points, from -FORM_OVERALL_MAX to +FORM_OVERALL_MAX.
 * The swing is linear across the neutral point and rounded, so form 50 is exactly 0.
 */
export function formOverallDelta(player) {
  if (!player || player.isLegend) return 0;
  const form = Number(player.form);
  if (!Number.isFinite(form)) return 0;
  const raw = ((form - NEUTRAL_FORM) / 50) * FORM_OVERALL_MAX;
  return Math.round(
    Math.max(-FORM_OVERALL_MAX, Math.min(FORM_OVERALL_MAX, raw)),
  );
}

/**
 * The overall a player actually shows right now: his base rating bent by form, never
 * above his potential. `base` defaults to the player's stored overall.
 */
export function formAdjustedOverall(player, base = player?.overall) {
  if (!player) return 0;
  if (player.isLegend) return base ?? 0;
  const baseOverall = Number.isFinite(base) ? base : (player.overall ?? 0);
  const potential = Number.isFinite(player.potential) ? player.potential : baseOverall;
  const adjusted = baseOverall + formOverallDelta(player);
  // A purple patch can lift a player to his ceiling, never through it.
  return Math.max(1, Math.min(potential, adjusted));
}
