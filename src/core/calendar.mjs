/**
 * Calendar and date arithmetic.
 *
 * The game's unit of time is the *week*, but the unit of *meaning* is the season
 * (2026/27, 2027/28, ...). Every date in a save is stored as an absolute day index
 * (days since 1 Jan 2000) so that arithmetic is integer maths with no timezone or
 * leap-year bugs, and so a save file is compact.
 */

const MS_PER_DAY = 86400000;
/** Day 0 of the internal calendar. */
const EPOCH = Date.UTC(2000, 0, 1);

/**
 * A real-world date -> absolute day index.
 *
 * `month` is 1-based (1 = January) to match how dates read everywhere else in the
 * codebase and in the data files. `Date.UTC` is 0-based, hence the `- 1`.
 */
export function toDayIndex(year, month, day) {
  return Math.round((Date.UTC(year, month - 1, day) - EPOCH) / MS_PER_DAY);
}

/** Absolute day index -> { year, month, day, dow } (dow: 0=Sunday). */
export function fromDayIndex(idx) {
  const d = new Date(EPOCH + idx * MS_PER_DAY);
  return {
    // month is converted back to 1-based so fromDayIndex is the inverse of toDayIndex.
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
  };
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(idx, { long = false } = {}) {
  const { year, month, day, dow } = fromDayIndex(idx);
  const m = long
    ? [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ][month - 1]
    : MONTH_NAMES[month - 1];
  return long ? `${day} ${m} ${year}` : `${DAY_NAMES[dow]} ${day} ${m} ${year}`;
}

export function formatShort(idx) {
  const { month, day } = fromDayIndex(idx);
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

/**
 * Which season (by start year) a date belongs to.
 * A season spans July 2026 -> June 2027 and is called "2026/27", keyed as 2026.
 */
export function seasonOfDay(idx, startMonth = 7) {
  const { year, month } = fromDayIndex(idx);
  return month >= startMonth ? year : year - 1;
}

/** Human label for a season key: 2026 -> "2026/27". */
export function seasonLabel(key) {
  return `${key}/${String((key + 1) % 100).padStart(2, "0")}`;
}

/**
 * The first day of the pre-season for a season key. Pre-season starts on the first
 * Monday of July so weeks always align to Mondays.
 */
export function seasonStartDay(seasonKey, startMonth = 7) {
  const first = toDayIndex(seasonKey, startMonth, 1);
  const dow = fromDayIndex(first).dow;
  const delta = dow === 1 ? 0 : (8 - dow) % 7;
  return first + delta;
}

/** Every Monday from the season start through the given number of weeks. */
export function seasonWeeks(seasonKey, count = 44, startMonth = 7) {
  const start = seasonStartDay(seasonKey, startMonth);
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const day = start + i * 7;
    weeks.push({
      index: i,
      // The Monday that opens the week.
      day,
      // The Saturday of this week is when league fixtures are played.
      matchday: day + 5,
      // Midweek slot retained as a free day for the league calendar.
      midweek: day + 1,
      season: seasonKey,
    });
  }
  return weeks;
}



/** Age in whole years on a given absolute day. */
export function ageOn(dob, dayIndex) {
  const b = fromDayIndex(dob);
  const n = fromDayIndex(dayIndex);
  let age = n.year - b.year;
  if (n.month < b.month || (n.month === b.month && n.day < b.day)) age--;
  return age;
}

/** "1998-06-24" (or "24 June 1998") -> day index. Tolerates a leading zero. */
export function parseDate(str) {
  if (typeof str === "number") return str;
  if (!str) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str.trim());
  if (iso) return toDayIndex(+iso[1], +iso[2], +iso[3]);
  const dmy = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(str.trim());
  if (dmy) {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const mi = months.findIndex((m) =>
      m.startsWith(dmy[2].toLowerCase().slice(0, 3)),
    );
    if (mi >= 0) return toDayIndex(+dmy[3], mi + 1, +dmy[1]);
  }
  throw new Error(`Unparseable date: ${str}`);
}

/** Iterate day indices from a to b inclusive. */
export function* dayRange(a, b) {
  for (let d = a; d <= b; d++) yield d;
}
