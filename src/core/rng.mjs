/**
 * Seeded, reproducible random number generation.
 *
 * Everything random in the game goes through one of these. A save stores the seed and
 * the state of each named stream, so reloading a save and making the same choices
 * produces the same history.
 *
 * Algorithm: sfc32. Fast, good statistical quality, and — importantly — its entire
 * state is four 32-bit integers, which means a save file can serialise it as plain
 * JSON with no precision loss.
 */

/** Hash an arbitrary string to a 32-bit integer (FNV-1a). Used to derive stream seeds. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  /** @param {number} seed @param {string} [name] */
  constructor(seed, name = "main") {
    this.name = name;
    const s = seed >>> 0;
    this.a = (s ^ 0x9e3779b9) >>> 0;
    this.b = (s + 0x6d2b79f5) >>> 0;
    this.c = Math.imul(s ^ (s >>> 15), 1 | s) >>> 0;
    this.d = (hashString(name) ^ s) >>> 0;
    // Warm up: sfc32 needs a few calls before it is well mixed.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Raw 32-bit unsigned integer. */
  next() {
    let { a, b, c, d } = this;
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    return t;
  }

  /** Float in [0, 1). */
  float() {
    return this.next() / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.float() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.float() < p;
  }

  /** Uniform pick from an array. */
  pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(this.float() * arr.length)];
  }

  /**
   * Weighted pick. `weightOf` may be a function or a property name.
   * Returns undefined for an empty list.
   */
  weightedPick(arr, weightOf) {
    if (!arr || arr.length === 0) return undefined;
    const w = typeof weightOf === "function" ? weightOf : (x) => x[weightOf];
    let total = 0;
    for (const item of arr) total += Math.max(0, w(item) ?? 0);
    if (total <= 0) return arr[Math.floor(this.float() * arr.length)];
    let roll = this.float() * total;
    for (const item of arr) {
      roll -= Math.max(0, w(item) ?? 0);
      if (roll < 0) return item;
    }
    return arr[arr.length - 1];
  }

  /** Shuffle in place (Fisher-Yates). Returns the array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** A shuffled copy. */
  shuffled(arr) {
    return this.shuffle(arr.slice());
  }

  /** n distinct elements from arr (or all of them if n >= length). */
  sample(arr, n) {
    return this.shuffled(arr).slice(0, Math.min(n, arr.length));
  }

  /**
   * Standard normal via Box-Muller. Used for attribute rolls and match noise, where a
   * bell curve around a mean is much more realistic than a flat spread.
   */
  normal(mean = 0, sd = 1) {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.float();
    while (v === 0) v = this.float();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * sd;
  }

  /** Normal clamped to a range — the workhorse for rolling attributes. */
  normalClamped(mean, sd, min, max) {
    const x = this.normal(mean, sd);
    return Math.max(min, Math.min(max, x));
  }

  /**
   * Draw from a Poisson distribution with mean lambda.
   * Implemented with Knuth's algorithm for small lambda and a normal approximation for
   * large lambda, so match goal draws never stall.
   */
  poisson(lambda) {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.float();
      } while (p > limit);
      return k - 1;
    }
    return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
  }

  /** Serialise the stream so it can be written to a save file. */
  toJSON() {
    return { name: this.name, a: this.a, b: this.b, c: this.c, d: this.d };
  }

  static fromJSON(obj) {
    const r = new Rng(1, obj.name || "main");
    r.a = obj.a >>> 0;
    r.b = obj.b >>> 0;
    r.c = obj.c >>> 0;
    r.d = obj.d >>> 0;
    return r;
  }
}

/**
 * A bundle of independent random streams.
 *
 * Why this exists: if every system shared one generator, simulating a football match
 * would consume different numbers of draws depending on how many events fired, which
 * would silently shift every subsequent transfer and youth intake. Named streams make
 * each subsystem's sequence independent, so the world stays stable no matter what the
 * player does on the pitch.
 */
export class RngBundle {
  constructor(seed) {
    this.seed = seed >>> 0;
    /** @type {Map<string, Rng>} */
    this.streams = new Map();
  }

  /** Get (creating on first use) the named stream. */
  stream(name) {
    let r = this.streams.get(name);
    if (!r) {
      r = new Rng((this.seed ^ hashString(name)) >>> 0, name);
      this.streams.set(name, r);
    }
    return r;
  }

  // Convenience passthroughs to the default 'main' stream.
  get main() {
    return this.stream("main");
  }

  toJSON() {
    const out = { seed: this.seed, streams: {} };
    for (const [k, v] of this.streams) out.streams[k] = v.toJSON();
    return out;
  }

  static fromJSON(obj) {
    const b = new RngBundle(obj.seed);
    for (const [k, v] of Object.entries(obj.streams || {})) {
      b.streams.set(k, Rng.fromJSON(v));
    }
    return b;
  }
}
