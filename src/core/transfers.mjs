/**
 * Central transfer rules.
 *
 * Every transfer pathway in the game — the AI market, background simulations, free
 * agency, pre-contracts, player-career requests and the manager's own purchases — asks
 * this module the same questions. Keeping the rules here is what makes a newly signed
 * player genuinely protected: there is no second, cheaper route into a protected squad.
 *
 * ## One-season signing protection
 *
 * A player who joins a club through a completed transfer is protected for the rest of
 * that season. The season value used is the game's own season year (the year the season
 * starts in, e.g. 2026 for 2026/27), never a real-world date, so the rule follows the
 * career lifecycle exactly:
 *
 *   - signed during 2026/27  -> `transferProtectedUntilSeason: 2027`
 *   - eligible again when the world rolls into the 2027/28 season
 *
 * The buying club may still renew, select, play and develop the player. Only a move to
 * a *different* club is blocked.
 */

/** The default protection marker for a player who is not protected. */
export const TRANSFER_PROTECTION_OFF = "none";

function seasonNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

/**
 * Mark a player as freshly signed during `season`.
 * Idempotent per signing: re-running it during the same season keeps the same window.
 */
export function markSigningProtection(player, season) {
  if (!player) return null;
  const year = seasonNumber(season);
  if (year == null) return player;
  const until = year + 1;
  player.signingSeason = year;
  player.transferProtectedUntilSeason = until;
  player.transferProtectionStatus = "protected";
  player.transferProtectionHistory ??= [];
  const last = player.transferProtectionHistory.at(-1);
  if (!last || last.untilSeason !== until || last.signingSeason !== year) {
    player.transferProtectionHistory.push({
      signingSeason: year,
      untilSeason: until,
      status: "protected",
    });
    if (player.transferProtectionHistory.length > 12) {
      player.transferProtectionHistory.splice(
        0,
        player.transferProtectionHistory.length - 12,
      );
    }
  }
  return player;
}

/** Clear a protection marker (used when legacy data is migrated or a career ends it). */
export function clearSigningProtection(player, { untilSeason = null } = {}) {
  if (!player) return player;
  player.transferProtectionStatus = TRANSFER_PROTECTION_OFF;
  if (untilSeason != null) player.transferProtectedUntilSeason = untilSeason;
  return player;
}

/**
 * Fill in the protection fields of a player whose save predates them.
 *
 * Existing careers must keep their current squads intact, so a migrated player is never
 * retro-protected — he simply becomes normally eligible. Only records that already
 * carry a signing season (i.e. were written after this system existed) keep protection.
 */
export function ensureTransferProtectionFields(player, season = null) {
  if (!player) return player;
  const current = seasonNumber(season);
  if (player.transferProtectedUntilSeason == null) {
    player.signingSeason = player.signingSeason ?? null;
    player.transferProtectedUntilSeason = null;
    player.transferProtectionStatus = TRANSFER_PROTECTION_OFF;
    return player;
  }
  const until = seasonNumber(player.transferProtectedUntilSeason);
  player.transferProtectedUntilSeason = until;
  // Re-derive the status from the lifecycle so a stale flag can never lock a
  // player out for longer than his protection window.
  if (until == null || (current != null && current >= until)) {
    player.transferProtectionStatus = TRANSFER_PROTECTION_OFF;
  } else {
    player.transferProtectionStatus = "protected";
  }
  return player;
}

/**
 * True when this signing season has already been recorded, so a repeated or replayed
 * transfer does not rewrite the protection window.
 */
export function transferProtectionApplied(player, season = null) {
  if (!player) return true;
  const year = seasonNumber(season);
  if (year == null) return player.transferProtectionStatus === "protected";
  return (
    player.transferProtectionStatus === "protected" &&
    seasonNumber(player.signingSeason) === year
  );
}

/** The season a player's protection ends (first season he may move again). */
export function protectionUntilSeason(player) {
  const until = seasonNumber(player?.transferProtectedUntilSeason);
  return until;
}

/**
 * True when the player may not be signed by another club in `season`.
 * `season` defaults to the player's signing season when not supplied, which keeps the
 * helper useful in pure unit tests.
 */
export function isTransferProtected(player, season = null) {
  if (!player) return false;
  const until = protectionUntilSeason(player);
  const signing = seasonNumber(player.signingSeason);
  const current = seasonNumber(season) ?? signing;
  if (until == null || current == null) return false;
  if (current >= until) return false;
  return true;
}

/** A short human label for the profile: "Transfer Protected · until 2027/28". */
export function transferProtectionLabel(player, season = null) {
  if (!isTransferProtected(player, season)) return null;
  const until = protectionUntilSeason(player);
  return `Transfer Protected · eligible from ${until}/${until + 1}`;
}

/**
 * The one gate every transfer pathway calls before a player changes club.
 *
 * Throws a readable error instead of silently skipping, so a caller that forgot to
 * filter is caught by its own tests rather than quietly breaking the rule.
 */
export function assertTransferAllowed(
  player,
  { season = null, buyingClubId = null } = {},
) {
  if (!isTransferProtected(player, season)) return true;
  const until = protectionUntilSeason(player);
  const name = `${player.first ?? ""} ${player.last ?? "player"}`.trim();
  const buyer = buyingClubId ? ` for ${buyingClubId}` : "";
  throw new Error(
    `${name} is in his signing-protection season and cannot be signed${buyer} until the ${until}/${until + 1} season.`,
  );
}

/** A non-throwing form of the same gate, used by filters and candidate lists. */
export function canSignFromClub(
  player,
  { season = null, buyingClubId = null } = {},
) {
  if (!player) return false;
  if (buyingClubId && player.clubId === buyingClubId) return true;
  return !isTransferProtected(player, season);
}

/**
 * Drop players who are protected from a candidate list. Squad-agnostic: the same call
 * serves the AI market, free agency, the player's recruitment request and the manager's
 * shortlist.
 */
export function filterSignablePlayers(
  players = [],
  { season = null, buyingClubId = null } = {},
) {
  return players.filter((player) =>
    canSignFromClub(player, { season, buyingClubId }),
  );
}

/** True when the player is in his signing-protection season, for UI badges. */
export function showsTransferProtectedBadge(player, season = null) {
  return isTransferProtected(player, season);
}
