const DEFAULT_ACCESS = {
  ENG: { association: "England", direct: 4, qualifying: 0 },
  ESP: { association: "Spain", direct: 4, qualifying: 0 },
  GER: { association: "Germany", direct: 4, qualifying: 0 },
  ITA: { association: "Italy", direct: 4, qualifying: 0 },
  FRA: { association: "France", direct: 3, qualifying: 1 },
  NED: { association: "Netherlands", direct: 2, qualifying: 1 },
  POR: { association: "Portugal", direct: 2, qualifying: 1 },
  BEL: { association: "Belgium", direct: 1, qualifying: 1 },
  SCO: { association: "Scotland", direct: 1, qualifying: 1 },
  TUR: { association: "Türkiye", direct: 1, qualifying: 1 },
};

export function defaultEuropeanAccessList() {
  return structuredClone(DEFAULT_ACCESS);
}

/** Move configurable numbers of clubs between paired divisions using final standings. */
export function applyPromotionRelegation({
  leagues,
  leagueTables,
  clubIdentities = {},
  playoffWinners = {},
}) {
  const moves = [];
  const byNation = new Map();
  for (const entry of leagues) {
    const tier = entry.league.tier ?? 1;
    const pair = byNation.get(entry.league.nation) ?? {};
    pair[tier] = entry;
    byNation.set(entry.league.nation, pair);
  }
  for (const [nation, pair] of byNation) {
    const upper = pair[1];
    const lower = pair[2];
    if (!upper || !lower) continue;
    const upperOrder = leagueTables[upper.league.id] ?? upper.league.teamIds;
    const lowerOrder = leagueTables[lower.league.id] ?? lower.league.teamIds;
    const promoteRules = lower.league.promotion ?? {};
    const relegateRules = upper.league.relegation ?? {};
    const promoteCount =
      (promoteRules.direct ?? 0) + (promoteRules.playoff ?? 0);
    const relegateCount =
      (relegateRules.direct ?? 0) + (relegateRules.playoff ?? 0);
    if (!promoteCount && !relegateCount) continue;
    if (
      upperOrder.length !== upper.league.teamIds.length ||
      lowerOrder.length !== lower.league.teamIds.length
    )
      throw new Error(
        `Cannot transition ${nation}: final tables are missing clubs.`,
      );
    const relegated = relegateRules.direct
      ? upperOrder.slice(-relegateRules.direct)
      : [];
    const promoted = lowerOrder.slice(0, promoteRules.direct ?? 0);
    const playoffPromoted = playoffWinners[lower.league.id];
    if (
      playoffPromoted &&
      !promoted.includes(playoffPromoted) &&
      lowerOrder.includes(playoffPromoted)
    )
      promoted.push(playoffPromoted);
    if (!playoffPromoted) {
      const candidates =
        lower.league.playoffPositions ??
        lowerOrder.slice(promoteRules.direct ?? 0, promoteCount + 1);
      const winner = candidates[0];
      if (winner && lowerOrder.includes(winner) && !promoted.includes(winner))
        promoted.push(winner);
    }
    for (const clubId of lowerOrder.slice(0, promoteCount))
      if (promoted.length < promoteCount && !promoted.includes(clubId))
        promoted.push(clubId);
    const playoffRelegated = playoffWinners[upper.league.id];
    if (
      playoffRelegated &&
      !relegated.includes(playoffRelegated) &&
      upperOrder.includes(playoffRelegated)
    )
      relegated.push(playoffRelegated);
    for (const clubId of upperOrder.slice(-relegateCount))
      if (relegated.length < relegateCount && !relegated.includes(clubId))
        relegated.push(clubId);
    while (relegated.length < relegateCount) {
      const candidate = [...upperOrder]
        .reverse()
        .find((clubId) => !relegated.includes(clubId));
      if (!candidate) break;
      relegated.push(candidate);
    }
    const nextUpper = [
      ...upper.league.teamIds.filter((id) => !relegated.includes(id)),
      ...promoted,
    ];
    const nextLower = [
      ...lower.league.teamIds.filter((id) => !promoted.includes(id)),
      ...relegated,
    ];
    if (
      new Set(nextUpper).size !== nextUpper.length ||
      new Set(nextLower).size !== nextLower.length ||
      nextUpper.length !== upper.league.teamIds.length ||
      nextLower.length !== lower.league.teamIds.length
    ) {
      // Promotion/relegation can't balance for this nation — most commonly a
      // single-division nation (no paired lower tier) or mismatched promotion/
      // relegation rules. Rather than throwing and crashing the whole season
      // advance, skip the move and keep every club in its current division. The
      // user stays where they are, which is the only sensible fallback.
      continue;
    }
    upper.league.teamIds = nextUpper;
    lower.league.teamIds = nextLower;
    for (const clubId of promoted) {
      if (clubIdentities[clubId]) clubIdentities[clubId].tier = 1;
      moves.push({
        clubId,
        nation,
        from: lower.league.id,
        to: upper.league.id,
        outcome: "promoted",
      });
    }
    for (const clubId of relegated) {
      if (clubIdentities[clubId]) clubIdentities[clubId].tier = 2;
      moves.push({
        clubId,
        nation,
        from: upper.league.id,
        to: lower.league.id,
        outcome: "relegated",
      });
    }
  }
  return moves;
}

/** Standings-based allocation, never uses club reputation or squad strength. */
export function qualifyEuropeanClubs({
  leagues,
  accessList = DEFAULT_ACCESS,
  standings = {},
  titleholders = [],
  extraSpots = [],
}) {
  const selected = [];
  const seen = new Set();
  const add = (clubId, route, competition = "championsLeague") => {
    if (!clubId || seen.has(clubId)) return false;
    const league = leagues.find((entry) =>
      entry.league.teamIds.includes(clubId),
    );
    if (!league || (league.league.tier ?? 1) !== 1) return false;
    seen.add(clubId);
    selected.push({
      clubId,
      leagueId: league.league.id,
      nation: league.league.nation,
      route,
      competition,
    });
    return true;
  };
  for (const holder of titleholders)
    add(
      holder.clubId,
      holder.route ?? "titleholder",
      holder.competition ?? "championsLeague",
    );
  const performancePositions = new Map();
  const competitionRoutes = {};
  for (const holder of titleholders) {
    const route = String(holder.competition ?? "")
      .toLowerCase()
      .includes("conference")
      ? "conferenceLeague"
      : String(holder.competition ?? "")
            .toLowerCase()
            .includes("europa")
        ? "europaLeague"
        : "championsLeague";
    const league = leagues.find((entry) =>
      entry.league.teamIds.includes(holder.clubId),
    );
    if (league) competitionRoutes[league.league.nation] = route;
  }
  for (const spot of extraSpots) {
    const league = leagues.find(
      (entry) =>
        entry.league.nation === spot.nation && (entry.league.tier ?? 1) === 1,
    );
    const order = standings[league?.league.id] ?? league?.league.teamIds ?? [];
    const position = spot.position ?? 5;
    const clubId = order[position - 1];
    if (add(clubId, spot.route ?? "european-performance-spot"))
      performancePositions.set(spot.nation, position);
    else if (seen.has(clubId)) performancePositions.set(spot.nation, position);
  }
  for (const [nation, allocation] of Object.entries(accessList)) {
    const league = leagues.find(
      (entry) =>
        entry.league.nation === nation && (entry.league.tier ?? 1) === 1,
    );
    if (!league) continue;
    const order = standings[league.league.id] ?? league.league.teamIds;
    const ranks = [
      ...(allocation.qualifyingPositions ?? []),
      ...(extraSpots.some((spot) => spot.nation === nation) &&
      performancePositions.has(nation)
        ? [performancePositions.get(nation)]
        : []),
      ...(!extraSpots.length && allocation.extraPosition
        ? [allocation.extraPosition]
        : []),
      ...Array.from(
        { length: (allocation.direct ?? 0) + (allocation.qualifying ?? 0) },
        (_, i) => i + 1,
      ),
    ]
      .filter((rank) => Number.isInteger(rank) && rank > 0)
      .sort((a, b) => a - b);
    const positions = new Set(ranks);
    for (const position of positions) {
      const id = order[position - 1];
      if (!id) continue;
      const route =
        (extraSpots.some((spot) => spot.nation === nation) &&
          performancePositions.get(nation) === position) ||
        (!extraSpots.length && allocation.extraPosition === position)
          ? "european-performance-spot"
          : position <= (allocation.direct ?? 0)
            ? "league-phase"
            : "qualifying-round";
      add(id, route, competitionRoutes[nation] ?? "championsLeague");
    }
  }
  return selected;
}

/** Open association slots change by the previous season's points-per-club coefficient. */
export function updateAssociationCoefficients(
  previous = {},
  results = [],
  config = {},
) {
  const points = config.points ?? { win: 2, draw: 1, loss: 0 };
  const sums = new Map();
  for (const result of results) {
    const nation = result.nation;
    if (!nation) continue;
    const amount =
      result.result === "win"
        ? points.win
        : result.result === "draw"
          ? points.draw
          : points.loss;
    sums.set(nation, (sums.get(nation) ?? 0) + amount + (result.bonus ?? 0));
  }
  const updated = { ...previous };
  for (const [nation, record] of Object.entries(previous)) {
    if (sums.has(nation)) continue;
    const history = [
      ...(record.history ?? []),
      {
        season: config.season ?? null,
        points: 0,
        coefficient: 0,
      },
    ].slice(-5);
    updated[nation] = { coefficient: 0, history };
  }
  for (const [nation, total] of sums) {
    const entry = updated[nation] ?? { coefficient: 0, history: [] };
    const clubCount = Math.max(1, config.clubsPerAssociation?.[nation] ?? 4);
    const coefficient =
      total <= 0 && entry.history?.length
        ? 0
        : Number((total / clubCount).toFixed(3));
    updated[nation] = {
      coefficient,
      history: [
        ...(entry.history ?? []),
        { season: config.season ?? null, points: total, coefficient },
      ].slice(-5),
    };
  }
  return updated;
}

export function coefficientPerformanceSpots(coefficients, count = 2) {
  return Object.entries(coefficients)
    .sort(
      (a, b) =>
        (b[1]?.coefficient ?? 0) - (a[1]?.coefficient ?? 0) ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, count)
    .map(([nation]) => ({
      nation,
      position: 5,
      route: "european-performance-spot",
    }));
}
