/** Retained for old saves; no active players receive a fixed legend rating. */
export const LEGEND_OVERALL = 94;

/**
 * The headliners the game always keeps in the world.
 *
 * They are ordinary players for rating, development, transfer and match purposes — they
 * age, they can be transferred, and `primeProfileFor` deliberately returns nothing for
 * them. What makes them headliners is only that they are guaranteed to be in the game,
 * so their honours, records and award races survive a career.
 */
export const HEADLINERS = [
  {
    key: "messi",
    name: "Lionel Messi",
    first: "Lionel",
    last: "Messi",
    clubId: "fc-barcelona",
    clubName: "FC Barcelona",
  },
  {
    key: "ronaldo",
    name: "Cristiano Ronaldo",
    first: "Cristiano",
    last: "Ronaldo",
    clubId: "manchester-united",
    clubName: "Manchester United",
  },
];

const HEADLINER_BY_NAME = new Map(
  HEADLINERS.map((entry) => [entry.name.trim().toLowerCase(), entry]),
);

/** The headliner with this full name, or null. */
export function headlinerForName(name) {
  if (!name) return null;
  return HEADLINER_BY_NAME.get(String(name).trim().toLowerCase()) ?? null;
}

/** The headliner who belongs to a club id, or null. */
export function headlinerForClub(clubId) {
  return HEADLINERS.find((entry) => entry.clubId === clubId) ?? null;
}

/** True when this player object is one of the guaranteed headliners. */
export function isHeadliner(player) {
  if (!player) return false;
  return !!headlinerForName(`${player.first ?? ""} ${player.last ?? ""}`.trim());
}

/** Messi and Ronaldo now use the same age, development, and transfer rules as everyone else. */
export const LEGENDS = [];

const LEGEND_ALIAS_INDEX = new Map();

/** Recognise a legend from a full name (case-insensitive), or return null. */
export function legendForName(name) {
  if (!name) return null;
  return LEGEND_ALIAS_INDEX.get(String(name).trim().toLowerCase()) ?? null;
}

/** The legend who belongs to a club id, or null. */
export function legendForClub(clubId) {
  return (
    LEGENDS.find(
      (legend) =>
        legend.clubId === clubId || legend.clubAliases?.includes(clubId),
    ) ?? null
  );
}

/** True when a player object is one of the protected legends. */
export function isLegend(player) {
  return !!player?.isLegend;
}

/** Prime-era output used by the match and world-stat engines. */
export function primeProfileFor(player) {
  if (!player?.isLegend) return null;
  const legend = legendForName(`${player.first ?? ""} ${player.last ?? ""}`);
  return legend?.prime ?? null;
}

/** True when this name is a legend allowed at this club. */
export function legendAllowedAt(name, clubId) {
  const legend = legendForName(name);
  return !!legend && legendForClub(clubId) === legend;
}

/**
 * Every id a legend answers to in the save. A legend in a playable league is stored as
 * `real-<clubId>-<recordId>`, a legend in another league as `real-<clubId>-...` on a
 * world performer, and the fallback in the award race is `legend-<key>`. They are the
 * same man, so honours are keyed on the stable `legend-<key>` id.
 */
export function legendHonourId(player) {
  if (!player?.isLegend) return null;
  const legend =
    legendForClub(player.clubId) ??
    legendForName(`${player.first ?? ""} ${player.last ?? ""}`);
  return legend ? `legend-${legend.key}` : null;
}

/** The canonical identity id for any player, so honours survive a move between leagues. */
export function honourKey(player) {
  return legendHonourId(player) ?? player?.id ?? null;
}
