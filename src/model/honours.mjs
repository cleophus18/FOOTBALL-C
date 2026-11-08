/**
 * Trophy-case grouping.
 *
 * A career collects the same award many times over — five league titles, three Golden
 * Boots, two Champions Leagues. Showing five identical cards is noise, so the trophy
 * case groups honours by trophy (award + competition) and lists the years won, with the
 * total on the card. The raw honour list is still kept per season for the History screen.
 */

/** The sort key for a season: honours store either `2026` or `"2026/27"`. */
function seasonNumber(season) {
  const value = parseInt(String(season ?? ""), 10);
  return Number.isFinite(value) ? value : 0;
}

/** A readable season label for the years list. */
function seasonText(season) {
  return String(season ?? "").trim();
}

/**
 * Group honours into trophy rows:
 *
 * ```
 * [{ award, competition, count, seasons: [2026, 2027], latestSeason, value }]
 * ```
 *
 * Sorted by count (most won first), then by the most recent win.
 */
export function groupHonours(honours = []) {
  const groups = new Map();
  for (const honour of honours) {
    if (!honour?.award) continue;
    const award = String(honour.award).trim();
    const competition = String(honour.competition ?? "").trim();
    const key = `${award}::${competition}`;
    const entry = groups.get(key) ?? {
      award,
      competition,
      count: 0,
      seasons: [],
      latestSeason: null,
      value: honour.value ?? "",
    };
    entry.count += 1;
    const season = seasonNumber(honour.season);
    if (season && !entry.seasons.includes(season)) entry.seasons.push(season);
    if (
      season &&
      (!entry.latestSeason || season > seasonNumber(entry.latestSeason))
    ) {
      entry.latestSeason = honour.season;
      entry.value = honour.value ?? entry.value;
    }
    groups.set(key, entry);
  }
  return [...groups.values()]
    .map((entry) => ({
      ...entry,
      seasons: [...entry.seasons].sort((a, b) => a - b),
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        seasonNumber(right.latestSeason) - seasonNumber(left.latestSeason) ||
        left.award.localeCompare(right.award),
    );
}

/** A compact "2026, 2027" / "2026/27" list of the seasons a trophy was won. */
export function seasonsLabel(seasons = []) {
  return seasons.map(seasonText).filter(Boolean).join(", ");
}

/** Total number of trophies, counting every individual win. */
export function totalTrophies(honours = []) {
  return honours.filter((honour) => honour?.award).length;
}
