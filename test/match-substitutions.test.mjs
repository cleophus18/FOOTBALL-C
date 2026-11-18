import { test } from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/core/rng.mjs";
import { createPlayer } from "../src/model/player.mjs";
import { simulatePossessionEngine } from "../src/sim/event-engine.mjs";
import { simulateQuickMatch } from "../src/sim/match.mjs";

const XI = ["GK", "LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "ST", "RW"];
const BENCH = ["GK", "CB", "CB", "CM", "CM", "ST"];

function makePlayer(id, position, overall, stamina) {
  return createPlayer({
    id,
    first: id,
    last: "Test",
    position,
    overall,
    potential: 99,
    age: 24,
    attrs: {
      pace: overall,
      shooting: overall,
      passing: overall,
      dribbling: overall,
      defending: overall,
      physical: overall,
    },
    subAttrs: {
      finishing: overall,
      longShots: overall,
      vision: overall,
      shortPassing: overall,
      longPassing: overall,
      crossing: overall,
      ballControl: overall,
      agility: overall,
      stamina,
      defensiveAwareness: overall,
      interceptions: overall,
      standingTackle: overall,
      acceleration: overall,
      sprintSpeed: overall,
      composure: overall,
      strength: overall,
      attackingPositioning: overall,
    },
    gkAttrs: {
      reflexes: overall,
      diving: overall,
      handling: overall,
      positioning: overall,
      reactions: overall,
    },
    stamina: 100,
    fatigue: 0,
  });
}

function makeTeam(prefix, rating, { starterStamina = 45 } = {}) {
  const xi = XI.map((position, i) =>
    makePlayer(`${prefix}-${i}`, position, rating, starterStamina),
  );
  const bench = BENCH.map((position, i) =>
    makePlayer(`${prefix}-b${i}`, position, rating - 2, 99),
  );
  return {
    xi,
    bench,
    formation: "4-3-3",
    strength: {
      attack: rating,
      midfield: rating,
      defence: rating,
      goalkeeping: rating,
    },
  };
}

function perSide(subs) {
  return {
    home: subs.home,
    away: subs.away,
  };
}

test("substitutions only happen with a bench and when explicitly enabled", () => {
  const home = makeTeam("h", 78);
  const away = makeTeam("a", 76);

  let subsWithoutBench = 0;
  let subsDisabled = 0;
  let subsEnabled = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const noBench = simulateQuickMatch(
      { ...home, bench: [] },
      { ...away, bench: [] },
      { rng: new Rng(seed, "no-bench") },
    );
    subsWithoutBench +=
      noBench.substitutions.home.length + noBench.substitutions.away.length;

    const disabled = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "disabled"),
      enableSubs: false,
    });
    subsDisabled +=
      disabled.substitutions.home.length + disabled.substitutions.away.length;

    const enabled = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "enabled"),
      enableSubs: true,
    });
    subsEnabled +=
      enabled.substitutions.home.length + enabled.substitutions.away.length;
  }

  assert.equal(subsWithoutBench, 0, "no bench means no substitutions");
  assert.equal(subsDisabled, 0, "enableSubs:false means no substitutions");
  assert.ok(subsEnabled > 0, "fresh legs off a low-stamina bench produce substitutions");
});

test("per-side minutes add up to a full match and every substitute accrues minutes", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const home = makeTeam(`h${seed}`, 78);
    const away = makeTeam(`a${seed}`, 76);
    const result = simulatePossessionEngine({
      home,
      away,
      baselineXg: { home: 1.35, away: 1.15 },
      rng: new Rng(seed, "minutes"),
      minutes: 90,
      enableSubs: true,
      maxSubs: 5,
    });

    for (const [side, team] of [["home", home], ["away", away]]) {
      // Every player who could set foot on the pitch: the XI plus the whole bench.
      const sidePlayerIds = new Set([
        ...team.xi.map((p) => p.id),
        ...team.bench.map((p) => p.id),
      ]);

      let total = 0;
      for (const id of sidePlayerIds) {
        const stats = result.playerStats[id];
        if (!stats) continue;
        total += stats.minutes;
      }
      // Eleven slots, each occupied for the whole 90 minutes, regardless of how many
      // substitutions shuffle bodies through them. Rounding keeps this within 1.
      assert.ok(
        Math.abs(total - 11 * 90) <= 1,
        `${side} seed ${seed}: minutes sum to ${total}, expected 990`,
      );

      for (const sub of result.substitutions[side]) {
        const onStats = result.playerStats[sub.playerId];
        assert.ok(onStats, `substitute ${sub.playerId} has a statistics record`);
        assert.ok(
          onStats.minutes > 0,
          `substitute ${sub.playerId} accrues minutes (got ${onStats?.minutes})`,
        );
      }
      assert.equal(result.lineups[side].length, 11, "the on-pitch XI is always eleven");
    }
  }
});

test("a substituted player never returns and no body is used twice", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const home = makeTeam(`h${seed}`, 78);
    const away = makeTeam(`a${seed}`, 76);
    const result = simulatePossessionEngine({
      home,
      away,
      baselineXg: { home: 1.35, away: 1.15 },
      rng: new Rng(seed, "reentry"),
      minutes: 90,
      enableSubs: true,
      maxSubs: 5,
    });

    for (const side of ["home", "away"]) {
      const incoming = result.substitutions[side].map((s) => s.playerId);
      const outgoing = result.substitutions[side].map((s) => s.replacedId);
      // No player comes on twice (no re-entry through the bench).
      assert.equal(
        new Set(incoming).size,
        incoming.length,
        `${side} seed ${seed}: no player enters twice`,
      );
      // A player who went off is never brought back on.
      for (const id of outgoing) {
        assert.ok(
          !incoming.includes(id),
          `${side} seed ${seed}: ${id} does not return after going off`,
        );
      }
    }
  }
});

test("substitutions respect the competition substitution limit", () => {
  for (const limit of [1, 2, 3]) {
    for (let seed = 1; seed <= 30; seed++) {
      const home = makeTeam(`h${seed}`, 78);
      const away = makeTeam(`a${seed}`, 76);
      const result = simulatePossessionEngine({
        home,
        away,
        baselineXg: { home: 1.35, away: 1.15 },
        rng: new Rng(seed, `limit-${limit}`),
        minutes: 90,
        enableSubs: true,
        maxSubs: limit,
      });
      assert.ok(
        result.substitutions.home.length <= limit,
        `home seed ${seed}: ${result.substitutions.home.length} subs exceeds limit ${limit}`,
      );
      assert.ok(
        result.substitutions.away.length <= limit,
        `away seed ${seed}: ${result.substitutions.away.length} subs exceeds limit ${limit}`,
      );
    }
  }
});

test("substitutions change the flow of the match and substitutes take part", () => {
  let matchesWithSubs = 0;
  let substitutesWithTouches = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const home = makeTeam(`h${seed}`, 78);
    const away = makeTeam(`a${seed}`, 76);
    const result = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "flow"),
      enableSubs: true,
    });

    const subs = [...result.substitutions.home, ...result.substitutions.away];
    if (subs.length === 0) continue;
    matchesWithSubs++;

    for (const sub of subs) {
      const stats = result.playerStats[sub.playerId];
      const touches =
        (stats?.passAttempts ?? 0) +
        (stats?.dribbles ?? 0) +
        (stats?.shots ?? 0) +
        (stats?.tackleAttempts ?? 0);
      if (touches > 0) substitutesWithTouches++;
    }
  }

  assert.ok(matchesWithSubs > 0, "some matches feature substitutions");
  assert.ok(
    substitutesWithTouches > 0,
    "substitutes who come on take part in subsequent play",
  );
});

test("substitution output is deterministic for a given seed", () => {
  const home = makeTeam("h", 78);
  const away = makeTeam("a", 76);
  const a = simulateQuickMatch(home, away, {
    rng: new Rng(42, "determinism"),
    enableSubs: true,
  });
  const b = simulateQuickMatch(home, away, {
    rng: new Rng(42, "determinism"),
    enableSubs: true,
  });
  assert.deepEqual(a.substitutions, b.substitutions);
  assert.deepEqual(a.playerStats, b.playerStats);
  assert.deepEqual(a.events, b.events);
});

test("extra-time substitutions stay within the regulation limit", () => {
  // A tight, evenly matched fixture is most likely to reach extra time; the event
  // engine disables substitutions in extra time, so no side can exceed the cap.
  const home = makeTeam("h", 80, { starterStamina: 60 });
  const away = makeTeam("a", 80, { starterStamina: 60 });
  for (let seed = 1; seed <= 40; seed++) {
    const result = simulateQuickMatch(home, away, {
      rng: new Rng(seed, "extra-time"),
      enableSubs: true,
    });
    assert.ok(
      result.substitutions.home.length <= 5,
      `home seed ${seed}: ${result.substitutions.home.length} subs`,
    );
    assert.ok(
      result.substitutions.away.length <= 5,
      `away seed ${seed}: ${result.substitutions.away.length} subs`,
    );
  }
});