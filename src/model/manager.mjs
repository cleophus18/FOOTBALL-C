/**
 * Manager career.
 *
 * A manager career runs the *same world* as a player career — the same clubs, the same
 * leagues, the same match engine — but the human is the person in the dugout instead of
 * a player on the pitch. That means:
 *
 *   - the club the manager picks is HIS club: he owns the tactics, the XI and the results,
 *   - his standing is measured by the board (job security), the dressing room and the
 *     supporters, not by an individual match rating,
 *   - his honours are trophies, not awards,
 *   - the career ends when he is sacked, or when he chooses to retire.
 *
 * The state is a plain, serialisable object so it slots into the existing three save
 * slots alongside a player career. It deliberately does NOT subclass `Career`: the player
 * facade is built around one human player's week, and mixing the two would put a
 * "career player" that does not exist into every selection and award calculation.
 */

import { clamp, round } from "../core/util.mjs";

/** How the board measures a manager, by the prestige band of the club he took over. */
export const BOARD_EXPECTATIONS = {
  elite: { label: "Win the league", minPosition: 1, maxPosition: 3 },
  strong: {
    label: "Finish in the Champions League places",
    minPosition: 1,
    maxPosition: 6,
  },
  mid: { label: "Finish in the top half", minPosition: 6, maxPosition: 12 },
  modest: { label: "Stay clear of the drop", minPosition: 12, maxPosition: 17 },
  lower: { label: "Avoid relegation", minPosition: 15, maxPosition: 20 },
};

/** The band a club sits in, from its prestige (1..100). */
export function boardBandFor(prestige = 55) {
  if (prestige >= 82) return "elite";
  if (prestige >= 72) return "strong";
  if (prestige >= 62) return "mid";
  if (prestige >= 52) return "modest";
  return "lower";
}

/** The board's season target for a club. */
export function boardExpectationFor(club) {
  const band = boardBandFor(club?.prestige ?? 55);
  return { band, ...BOARD_EXPECTATIONS[band] };
}

/** A new manager career, ready to serialise. */
export function createManagerState(options = {}) {
  return {
    mode: "manager",
    first: String(options.first ?? "New").trim() || "New",
    last: String(options.last ?? "Manager").trim() || "Manager",
    nationality: options.nationality ?? "ENG",
    style: options.style ?? "Balanced",
    clubId: options.clubId ?? null,
    leagueId: options.leagueId ?? null,
    seed: Number(options.seed) >>> 0,
    difficulty: options.difficulty ?? "Realistic",
    season: null,
    /** 0..100. Falls and the board loses patience; zero means the sack. */
    boardConfidence: 55,
    /** 0..100. The dressing room's view of him. */
    squadConfidence: 60,
    /** 0..100. The supporters' view. */
    fanSupport: 55,
    sacked: false,
    retired: false,
    /** Trophy case: { award, competition, season, value }. */
    honours: [],
    /** One entry per completed season. */
    seasons: [],
    /** Match-by-match record for the current season. */
    record: {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    },
    createdAt: options.createdAt ?? null,
  };
}

/** Win percentage for the current record, 0..100. */
export function winRate(record) {
  const played = record?.played ?? 0;
  if (!played) return 0;
  return round(((record.won ?? 0) / played) * 100, 1);
}

/**
 * The board's verdict on a finished season. `position` is the club's league placing and
 * `target` comes from `boardExpectationFor`. A finish inside the band is a pass; one
 * outside it costs confidence, and a big miss can end the job.
 */
export function judgeSeason({ position, target, record }) {
  if (!position)
    return {
      verdict: "unknown",
      confidence: 0,
      message: "No league position recorded.",
    };
  const inside =
    position >= target.minPosition && position <= target.maxPosition;
  const missedBy = inside
    ? 0
    : position < target.minPosition
      ? target.minPosition - position
      : position - target.maxPosition;
  const winPct = winRate(record);
  // A pass is worth up to +18 confidence; the wins bonus rewards a good style of play.
  const confidence = inside
    ? clamp(10 + Math.round(winPct * 0.1) - missedBy * 2, -20, 22)
    : clamp(-8 - missedBy * 6, -45, -2);
  const verdict = inside ? "met" : missedBy <= 2 ? "close" : "missed";
  const message =
    verdict === "met"
      ? `The board is satisfied: ${target.label.toLowerCase()} was achieved (${position}${ordinalSuffix(position)}).`
      : verdict === "close"
        ? `The board expected to ${target.label.toLowerCase()}; ${position}${ordinalSuffix(position)} was close.`
        : `The board expected to ${target.label.toLowerCase()}; finishing ${position}${ordinalSuffix(position)} was well short.`;
  return { verdict, confidence, message, position, target: target.label };
}

function ordinalSuffix(n) {
  if (!n) return "";
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return suffix;
}

/** A league title awarded to a manager who finishes first. */
export function seasonTrophiesFor({ leagueName, position }) {
  if (position !== 1) return [];
  return [{
    award: `${leagueName} Champion`,
    competition: leagueName,
    value: "Champion",
  }];
}
