/**
 * League model: fixtures, table, and (from Phase 3) promotion/relegation.
 *
 * Fixture generation uses the circle method, which is the standard way to build a
 * double round-robin. It guarantees every club plays every other club twice, home and
 * away, with no club playing twice in a round — which is exactly what a real league
 * calendar is.
 */

// No helpers are imported: the league table is deliberately integer-only, so that
// point deductions and tiebreakers stay exact with no floating-point noise.

export class LeagueTable {
  constructor(teamIds) {
    /** @type {Map<string, object>} */
    this.rows = new Map();
    for (const id of teamIds) this.rows.set(id, blankRow(id));
    /** Tiebreaker order, mirroring the real rules of these leagues. */
    this.tiebreakers = ["points", "goalDifference", "goalsFor", "wins"];
  }

  /** Record a result. `h` and `a` are club ids. */
  record(homeId, awayId, homeGoals, awayGoals) {
    const h = this.rows.get(homeId);
    const a = this.rows.get(awayId);
    if (!h || !a)
      throw new Error(`Unknown club in result: ${homeId} vs ${awayId}`);

    h.played++;
    a.played++;
    h.goalsFor += homeGoals;
    h.goalsAgainst += awayGoals;
    a.goalsFor += awayGoals;
    a.goalsAgainst += homeGoals;
    h.goalDifference = h.goalsFor - h.goalsAgainst;
    a.goalDifference = a.goalsFor - a.goalsAgainst;

    if (homeGoals > awayGoals) {
      h.won++;
      a.lost++;
      h.points += 3;
      h.form.push("W");
      a.form.push("L");
      h.streak = h.streak > 0 ? h.streak + 1 : 1;
      a.streak = a.streak < 0 ? a.streak - 1 : -1;
    } else if (homeGoals < awayGoals) {
      a.won++;
      h.lost++;
      a.points += 3;
      h.form.push("L");
      a.form.push("W");
      a.streak = a.streak > 0 ? a.streak + 1 : 1;
      h.streak = h.streak < 0 ? h.streak - 1 : -1;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
      h.form.push("D");
      a.form.push("D");
      h.streak = 0;
      a.streak = 0;
    }
    // Keep only recent form; the UI shows the last six.
    if (h.form.length > 6) h.form.shift();
    if (a.form.length > 6) a.form.shift();
  }

  /** Sorted rows, best first. */
  sorted() {
    const rows = [...this.rows.values()];
    rows.sort((x, y) => {
      for (const t of this.tiebreakers) {
        const diff = t === "goalDifference" ? y[t] - x[t] : y[t] - x[t];
        if (diff !== 0) return diff;
      }
      return x.teamId.localeCompare(y.teamId);
    });
    return rows;
  }

  /** Map of club id -> 1-based position. */
  positions() {
    const out = new Map();
    this.sorted().forEach((r, i) => out.set(r.teamId, i + 1));
    return out;
  }

  row(teamId) {
    return this.rows.get(teamId);
  }

  /** True once every club has played `matches` games. */
  isComplete(matches) {
    return [...this.rows.values()].every((r) => r.played >= matches);
  }
}

function blankRow(teamId) {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
    streak: 0,
    // Set per-season by the sim; kept here so the table is the single source of truth.
    deduction: 0,
  };
}

export class League {
  constructor(spec) {
    this.id = spec.id;
    this.name = spec.name;
    this.fictionalName = spec.fictionalName ?? spec.name;
    this.nation = spec.nation;
    /** 1 = top division, 2 = second division. */
    this.tier = spec.tier ?? 1;
    this.teamIds = [...spec.teamIds];
    /** Ordered fixture rounds: [ [ {home, away}, ... ], ... ] */
    this.fixtures = [];
    this.table = new LeagueTable(this.teamIds);
    /** Cup / Europe / play-off id hooks, resolved by the loader in later phases. */
    this.cups = spec.cups ?? [];
    /** Promotion and relegation rules for this division (data-driven). */
    this.rules = spec.rules ?? null;
    /** Set by the season sim, for the UI and for awards. */
    this.season = spec.season ?? null;
    /** Historical finishing order, newest last: [{season, order: [teamId]}]. */
    this.history = spec.history ? [...spec.history] : [];
  }

  get displayName() {
    return this._useRealNames === false ? this.fictionalName : this.name;
  }

  /**
   * Build the double round-robin calendar.
   *
   * Circle method: fix club 0, rotate the rest. When the club count is odd we insert a
   * bye (null), which is why the real Bundesliga/Ligue 1 with 18 teams still works:
   * 18 is even, but the same code handles 19 or 21 gracefully rather than crashing.
   */
  buildFixtures(rng) {
    // Circle method: fix club 0 and rotate the rest. A bye (null) is inserted for an
    // odd number of clubs, which is what lets an 18- or 20-team division schedule the
    // usual home-and-away double round robin.
    const teams = [...this.teamIds];
    const hasBye = teams.length % 2 !== 0;
    if (hasBye) teams.push(null);
    const n = teams.length;
    const roundsPerHalf = n - 1;
    const half = [];

    let order = teams.slice();
    for (let r = 0; r < roundsPerHalf; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) {
        const home = order[i];
        const away = order[n - 1 - i];
        if (home === null || away === null) continue;
        // Alternate the home side by round so the schedule is not lopsided.
        const fixture = r % 2 === 0 ? { home, away } : { home: away, away: home };
        round.push({
          ...fixture,
          id: `${this.id}-${this.season ?? "season"}-md-${r + 1}-m-${i + 1}`,
          competitionId: this.id,
          season: this.season,
          matchday: r + 1,
          status: "upcoming",
        });
      }
      half.push(round);
      // Rotate everything except the first element.
      order = [order[0], order[n - 1], ...order.slice(1, n - 1)];
    }

    // Second half = first half with venues reversed.
    const second = half.map((round, roundIndex) =>
      round.map((f, matchIndex) => ({
        ...f,
        id: `${this.id}-${this.season ?? "season"}-md-${roundIndex + roundsPerHalf + 1}-m-${matchIndex + 1}`,
        home: f.away,
        away: f.home,
        matchday: roundIndex + roundsPerHalf + 1,
      })),
    );

    // Shuffle whole rounds within each half. Every round still contains each club
    // exactly once; shuffling the halves together would let a club face the same
    // opponent in consecutive weeks.
    const shuffledFirst = rng.shuffle(half);
    const shuffledSecond = rng.shuffle(second);

    this.fixtures = [...shuffledFirst, ...shuffledSecond];
    this.validateFixtures();
    return this.fixtures;
  }

  validateFixtures() {
    // A double round robin means every club plays every other club home and away.
    // This is expressed per opponent rather than per league size so an odd-sized
    // league with a bye validates correctly.
    const expectedMatches = Math.max(1, this.teamIds.length - 1);
    const expectedTotal = this.teamIds.length * expectedMatches;
    // An odd-sized league has a bye each round, so one club sits out that matchday.
    const hasBye = this.teamIds.length % 2 !== 0;
    const teamsPerRound = hasBye ? this.teamIds.length - 1 : this.teamIds.length;
    const seen = new Set();
    const appearances = new Map(
      this.teamIds.map((teamId) => [
        teamId,
        { total: 0, home: 0, away: 0, opponents: new Map() },
      ]),
    );
    // A bye pads an odd league to an even size; the double round robin then needs
    // twice that padded size minus two matchdays in total (one per half).
    const expectedRounds =
      (hasBye ? this.teamIds.length + 1 : this.teamIds.length) * 2 - 2;
    if (this.fixtures.length !== expectedRounds) {
      throw new Error(
        `${this.name} must contain ${expectedRounds} matchdays.`,
      );
    }
    let matchCount = 0;
    for (let round = 0; round < this.fixtures.length; round++) {
      const roundTeams = new Set();
      for (const fixture of this.fixtures[round] ?? []) {
        const { home, away } = fixture;
        if (!appearances.has(home) || !appearances.has(away) || home === away) {
          throw new Error(`${this.name} contains an invalid fixture.`);
        }
        if (roundTeams.has(home) || roundTeams.has(away)) {
          throw new Error(`${this.name} schedules a club twice on matchday ${round + 1}.`);
        }
        roundTeams.add(home);
        roundTeams.add(away);
        const key = `${home}:${away}`;
        if (seen.has(key)) throw new Error(`${this.name} contains a duplicate fixture.`);
        seen.add(key);
        const homeStats = appearances.get(home);
        const awayStats = appearances.get(away);
        homeStats.total++;
        homeStats.home++;
        awayStats.total++;
        awayStats.away++;
        homeStats.opponents.set(away, (homeStats.opponents.get(away) ?? 0) + 1);
        awayStats.opponents.set(home, (awayStats.opponents.get(home) ?? 0) + 1);
        matchCount++;
      }
      if (roundTeams.size !== teamsPerRound) {
        throw new Error(`${this.name} has an incomplete matchday ${round + 1}.`);
      }
    }
    // With a bye a club can only play so many home and away games; the two counts
    // still have to add up to the full fixture list.
    const expectedHalf = hasBye ? expectedMatches - 1 : expectedMatches;
    for (const [teamId, stats] of appearances) {
      if (
        stats.total !== expectedMatches * 2 ||
        Math.min(stats.home, stats.away) < expectedHalf ||
        stats.home + stats.away !== stats.total ||
        stats.opponents.size !== expectedMatches ||
        // Every pairing is played home and away, so each opponent is faced twice.
        [...stats.opponents.values()].some((count) => count !== 2)
      ) {
        throw new Error(`${this.name} has an invalid schedule for ${teamId}.`);
      }
    }
    if (matchCount !== expectedTotal) {
      throw new Error(`${this.name} contains an invalid number of fixtures.`);
    }
    return true;
  }

  /** Map a fixture round onto a calendar week index. Allows slack weeks for cups. */
  scheduleOn(weekIndices, dayIndices = null) {
    this.fixtureWeeks = weekIndices.slice(0, this.fixtures.length);
    this.fixtureDays = dayIndices
      ? dayIndices.slice(0, this.fixtures.length)
      : [];
    return this.fixtureWeeks;
  }

  /** All fixtures for one club, in order, with the round index. */
  fixturesFor(teamId) {
    const out = [];
    this.fixtures.forEach((round, ri) => {
      for (const f of round) {
        if (f.home === teamId)
          out.push({ round: ri, opponent: f.away, home: true, fixture: f });
        else if (f.away === teamId)
          out.push({ round: ri, opponent: f.home, home: false, fixture: f });
      }
    });
    return out;
  }

  /** Reset the table for a new season. */
  reset(teamIds = this.teamIds) {
    this.teamIds = [...teamIds];
    this.table = new LeagueTable(this.teamIds);
  }

  /** Final standings as an array of club ids. */
  finalOrder() {
    return this.table.sorted().map((r) => r.teamId);
  }
}

/**
 * Build the fixture-week plan for a season: which calendar week each league round is
 * played on. Leaves gaps for international breaks and cup weekends, the same way the
 * real calendar does.
 */
export function planLeagueWeeks(seasonWeeks, opts = {}) {
  const {
    startWeek = 3,
    endWeek = Math.min(seasonWeeks.length - 2, 54),
    breakWeeks = [], // weeks with no league football
    unavailableWeeks = [],
  } = opts;
  const weeks = [];
  for (let w = startWeek; w <= endWeek && w < seasonWeeks.length; w++) {
    if (breakWeeks.includes(w) || unavailableWeeks.includes(w)) continue;
    weeks.push(w);
  }
  return { weeks, seasonWeeks };
}
