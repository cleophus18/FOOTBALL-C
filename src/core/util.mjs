/** Small generic helpers. No game knowledge lives here. */

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Clamp to 1..99, the attribute scale. */
export const attr = (x) => Math.round(clamp(x, 1, 99));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Inverse lerp: where does x sit between a and b? Clamped to 0..1. */
export const invLerp = (a, b, x) => clamp((x - a) / (b - a || 1), 0, 1);

export const sum = (arr, f = (x) => x) => arr.reduce((acc, x) => acc + f(x), 0);

export const mean = (arr, f = (x) => x) =>
  arr.length ? sum(arr, f) / arr.length : 0;

/** Mean of the top k values, descending. Used for "top 11" team strength. */
export function topMean(arr, k, f = (x) => x) {
  if (!arr.length) return 0;
  const vals = arr.map(f).sort((a, b) => b - a);
  return mean(vals.slice(0, Math.min(k, vals.length)));
}

/** Group an array by a key function into a Map of arrays. */
export function groupBy(arr, keyOf) {
  const m = new Map();
  for (const item of arr) {
    const k = keyOf(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

/** Round to n decimal places (avoids 0.30000000000000004 in JSON saves). */
export const round = (x, n = 0) => {
  const p = 10 ** n;
  return Math.round(x * p) / p;
};

/** Format a number for display: integers show as-is, decimals show 2 places. */
export const formatDecimal = (value) => {
  const number =
    value == null || value === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) return "—";
  if (Number.isInteger(number)) return String(number);
  return number.toFixed(2);
};

/**
 * Move `current` toward `target` by at most `maxStep`.
 * The single most-used function in the game: morale, fitness, form and trust all drift
 * rather than jump, which is what makes a season feel like it has momentum.
 */
export function approach(current, target, maxStep) {
  const d = target - current;
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Title-case a name for display, e.g. "van dijk" -> "Van Dijk". */
export function titleCase(s) {
  return String(s)
    .split(/([\s-])/)
    .map((part) =>
      /^[\s-]$/.test(part)
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

/** Pluralise simply: plural(1,'goal') -> "1 goal", plural(2,'goal') -> "2 goals". */
export function plural(n, word, suffix = "s") {
  return `${n} ${word}${n === 1 ? "" : suffix}`;
}

/** "72" -> "72nd", for league positions and ranks. */
export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
