import { groupOf, normalizePosition, POSITIONS } from "../core/constants.mjs";
import { FORMATIONS } from "./club.mjs";
import { clamp } from "../core/util.mjs";
import { daysUntilExpiry } from "../core/contracts.mjs";
import { scoreManagerFit } from "./manager-personality.mjs";

/**
 * The club coach's opinion of a candidate, as a 0..100 number. Board-orientated AI
 * recruitment reads this so two coaches in the same situation make different signings.
 */
function coachFitForPlayer(manager, club, player, { needs = {}, position = null, targetRating = null } = {}) {
  const slot = position ?? player?.position ?? "CM";
  const demand = Number(needs?.[slot]?.demand ?? 45);
  const { score } = scoreManagerFit({
    manager,
    club,
    player,
    positionDemand: demand,
    position: slot,
    targetRating: needs?.[slot]?.starterQuality ?? targetRating,
  });
  return { score: clamp(50 + score, 0, 100) };
}

const UNIQUE_POSITIONS = [...new Set(POSITIONS.map(normalizePosition))];

function playerRating(player) {
  return Number(player.overall ?? player.rating ?? 50);
}

function positionalFit(player, position) {
  const actual = normalizePosition(player.position);
  if (actual === position) return 1;
  if (groupOf(actual) === groupOf(position)) return 0.55;
  return 0;
}

/** Assess depth and quality at each role using the club's current formation and squad. */
export function assessClubSquadNeeds(club, players, { dayIndex = 0 } = {}) {
  const squad = Array.isArray(players)
    ? players.filter((player) => player.clubId === club.id)
    : players?.get?.(club.id) ?? [];
  const slots = club.formationSlots ?? [];
  const formationPositions = {
    "4-3-3": [
      "GK",
      "LB",
      "CB",
      "CB",
      "RB",
      "CDM",
      "CM",
      "CM",
      "LW",
      "ST",
      "RW",
    ],
    "4-2-3-1": [
      "GK",
      "LB",
      "CB",
      "CB",
      "RB",
      "CDM",
      "CDM",
      "AM",
      "LW",
      "RW",
      "ST",
    ],
    "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LW", "CM", "CM", "RW", "ST", "ST"],
    "3-5-2": ["GK", "CB", "CB", "CB", "LB", "DM", "CM", "CM", "RB", "ST", "ST"],
    "4-1-4-1": [
      "GK",
      "LB",
      "CB",
      "CB",
      "RB",
      "DM",
      "LW",
      "CM",
      "CM",
      "RW",
      "ST",
    ],
    "5-3-2": ["GK", "LB", "CB", "CB", "CB", "RB", "DM", "CM", "CM", "ST", "ST"],
    "3-4-3": ["GK", "CB", "CB", "CB", "LB", "CM", "CM", "RB", "LW", "ST", "RW"],
  };
  const usedSlots =
    slots.length > 0
      ? slots
      : (formationPositions[club.formation] ??
        FORMATIONS[club.formation]?.slots ??
        []);
  const needs = {};
  for (const position of UNIQUE_POSITIONS) {
    const required = Math.max(
      1,
      usedSlots.filter(
        (slot) =>
          normalizePosition(
            typeof slot === "string"
              ? slot
              : (slot.position ?? slot.role ?? slot.id ?? ""),
          ) === position,
      ).length,
    );
    const ranked = squad
      .map((player) => ({
        player,
        fit: positionalFit(player, position),
        rating: playerRating(player),
        unavailable: !!player.injury || (player.suspensionWeeks ?? 0) > 0,
      }))
      .filter(({ fit }) => fit > 0)
      .sort((a, b) => b.rating * b.fit - a.rating * a.fit);
    const available = ranked.filter((entry) => !entry.unavailable);
    const starters = available.slice(0, required);
    const backups = available.slice(required, required + 2);
    const target = 49 + Number(club.prestige ?? 50) * 0.23;
    const starterQuality = starters.length
      ? starters.reduce((sum, entry) => sum + entry.rating * entry.fit, 0) /
        required
      : 0;
    const backupQuality = backups.length
      ? backups.reduce((sum, entry) => sum + entry.rating * entry.fit, 0) /
        backups.length
      : 0;
    const missingDepth = Math.max(0, required + 1 - available.length);
    const depthGap = Math.max(0, required + 4 - available.length);
    const unavailableCount = ranked.filter((entry) => entry.unavailable).length;
    const agingStarters = starters.filter(
      ({ player }) =>
        Number(player.age ?? 25) >= 31 && playerRating(player) >= target,
    ).length;
    const lowPerformance = starters.filter(
      ({ player }) => Number(player.lastMatchRating ?? 6.5) < 6.1,
    ).length;
    const lowPotential = starters.filter(
      ({ player }) =>
        Number(player.potential ?? playerRating(player)) <=
          playerRating(player) + 1 && Number(player.age ?? 25) <= 23,
    ).length;
    const expiring = starters.filter(
      ({ player }) => {
        const remaining = daysUntilExpiry(player.contract, dayIndex);
        return remaining != null && remaining <= 7;
      },
    ).length;
    const demand = clamp(
      Math.round(
        42 +
          missingDepth * 22 +
          depthGap * 12 +
          unavailableCount * 9 +
          agingStarters * 5 +
          lowPerformance * 4 +
          lowPotential * 3 +
          expiring * 4 +
          (target - starterQuality) * 1.55 +
          (target - backupQuality) * 0.48 -
          Math.max(0, available.length - required - 2) * 14,
      ),
      0,
      100,
    );
    const level =
      demand >= 80
        ? "Critical Need"
        : demand >= 65
          ? "High Need"
          : demand >= 45
            ? "Moderate Need"
            : demand >= 25
              ? "Low Need"
              : "No Need";
    needs[position] = {
      position,
      demand,
      level,
      required,
      depth: available.length,
      starterQuality: Math.round(starterQuality),
      backupQuality: Math.round(backupQuality),
    };
  }
  return needs;
}

/** Score a player-club fit; weak matches stay rumours rather than becoming offers. */
export function scoreTransferSuitability({
  player,
  club,
  needs,
  agentQuality = 50,
  leagueReputation = 50,
  performanceBonus = 0,
  strengthBoost = null,
}) {
  const overall = playerRating(player);
  const potential = Number(player.potential ?? overall);
  const age = Number(player.age ?? 25);
  const position = normalizePosition(player.position);
  const need = needs?.[position] ?? { demand: 0, level: "No Need" };
  const finance = club.finances ?? {};
  const transferValue = Math.max(
    25_000,
    Number(player.marketValue ?? player.value ?? overall ** 3 * 90),
  );
  const availableBudget = Number(finance.transferBudget ?? club.budget ?? 0);
  const currentWage = Number(player.contract?.wage ?? overall * 600);
  const wageSpace = Math.max(
    0,
    Number(finance.wageBudget ?? club.wageBudget ?? 0) -
      Number(club.currentWageBill ?? 0),
  );
  const squad = club._marketSquad ?? [];
  // A club's own coach is part of the market decision: his philosophy decides whether a
  // player is a fit, and a Youth Developer and a Pragmatic coach weigh the same player
  // very differently. Computed after the positional ranks so it can compare the squad.
  const coachFit = () =>
    club.manager
      ? coachFitForPlayer(club.manager, club, player, {
          needs,
          position,
          targetRating: positionalRanks[0] ?? null,
        })
      : null;
  const positionalRanks = squad
    .filter((candidate) => positionalFit(candidate, position) > 0)
    .map(
      (candidate) =>
        playerRating(candidate) * positionalFit(candidate, position),
    )
    .sort((a, b) => b - a);
  const playingTime = clamp(
    72 -
      Math.max(0, (positionalRanks[0] ?? 50) - overall) * 3 -
      Math.max(0, positionalRanks.length - 2) * 7,
    5,
    95,
  );
  const improvement = clamp(
    62 + (overall - (positionalRanks[0] ?? 55)) * 2.1,
    0,
    100,
  );
  const potentialValue = clamp(
    (potential - overall) * 2.5 + (age < 23 ? 12 : 0),
    0,
    45,
  );
  const affordability =
    availableBudget >= transferValue * 0.65
      ? 100
      : clamp((availableBudget / Math.max(1, transferValue)) * 100, 0, 100);
  const needUrgency = need.demand >= 85 ? 18 : need.demand >= 70 ? 10 : 0;
  const wageFit =
    wageSpace >= currentWage * 1.2
      ? 100
      : clamp((wageSpace / Math.max(1, currentWage)) * 100, 0, 100);
  const reputation = Number(club.prestige ?? club.reputation ?? 50);
  // The level of player this club actually fields, derived from its prestige and the
  // strength of the league it plays in. A club judges a signing against this: a weaker
  // player is a depth option, a stronger one a statement. strengthBoost is the previous
  // name for the same number, kept for callers that already pass it.
  const realisticTarget = Number(
    strengthBoost ?? clamp(42 + reputation * 0.42 + (leagueReputation - 60) * 0.12, 40, 95),
  );
  const reputationFit = clamp(
    100 - Math.abs(reputation - (overall + potentialValue * 0.2)),
    15,
    100,
  );
  
  // Enhanced factors
  // Recent performance (goals/assists in current season)
  const leagueGoals = Number(player.leagueGoals ?? 0);
  const leagueAssists = Number(player.leagueAssists ?? 0);
  const leagueApps = Number(player.stats?.apps ?? 0);
  const performanceScore = leagueApps > 0
    ? clamp(
        (leagueGoals * 3 + leagueAssists * 2) / Math.max(1, leagueApps) * 100,
        0,
        50,
      )
    : 0;
  
  // Tactical compatibility - check if club formation suits player position
  const formation = club.formation ?? "4-3-3";
  const formationFit = FORMATIONS[formation]?.shape
    ? calculateTacticalFit(position, formation)
    : 50;
  
  // European competition participation - proxy based on prestige and league reputation
  const europeanBonus = (reputation >= 75 && leagueReputation >= 70) ? 8 : 0;
  
  // Player reputation/market value factor
  const marketValue = Number(player.marketValue ?? player.value ?? 0);
  const reputationValue = Math.min(marketValue / 5_000_000, 100);
  
  // Age/development trajectory - younger players with high potential get bonus
  const ageDevelopmentBonus = age <= 21 && potential >= overall + 10 ? 12 : 0;
  
  // Elite club chasing elite player - strong prestige match
  const eliteMatch = overall >= 88 && reputation >= 85 ? 15 : 0;
  
  // Squad depth penalty - if club already has 3+ players in position
  const depthPenalty = positionalRanks.length >= 3 ? 10 : 0;

  const coach = coachFit();
  const coachScore = coach?.score ?? null;
  // A squad with numbers at a position is only a problem if none of them is already
  // better than the candidate. An elite player is a proven upgrade wherever he goes.
  const depthResult = coach != null && coach.outRanksIncumbent ? depthPenalty : -depthPenalty;
  const rawScore =
    need.demand * 0.30 +
    improvement * 0.20 +
    potentialValue * 0.15 +
    playingTime * 0.10 +
    affordability * 0.10 +
    wageFit * 0.08 +
    reputationFit * 0.05 +
    performanceScore * 0.08 +
    formationFit * 0.05 +
    reputationValue * 0.04 +
    clamp(leagueReputation, 0, 100) * 0.03 +
    clamp(agentQuality, 0, 100) * 0.02 +
    needUrgency +
    europeanBonus +
    ageDevelopmentBonus +
    eliteMatch +
    clamp(performanceBonus, 0, 18) -
    depthResult +
    (coachScore != null ? (coachScore - 50) * 0.18 : 0) +
    (player.injury ? -18 : 0);
  const score = Math.round(rawScore);
  // How much better the player is than what the club normally fields. Positive means
  // he is a genuine upgrade; deeply negative means he is far beneath the level.
  const levelDelta = Math.round(
    Math.max(overall, Number(player.potential ?? overall) - 4) - realisticTarget,
  );

  return {
    score: clamp(score, 0, 100),
    demand: need.demand,
    demandLevel: need.level,
    playingTime: Math.round(playingTime),
    transferValue,
    affordability: Math.round(affordability),
    wageFit: Math.round(wageFit),
    // How much better the player is than what the club normally fields. Positive means
    // he is a genuine upgrade; deeply negative means he is far beneath the level.
    levelDelta,
    reason:
      need.demand >= 65
        ? `${need.level.toLowerCase()} at ${position}`
        : improvement >= 75
          ? `a clear upgrade at ${position}`
          : potentialValue >= 25
            ? `a high-potential ${position} prospect`
            : `squad depth at ${position}`,
  };
}

/** Calculate tactical fit between player position and club formation. */
function calculateTacticalFit(position, formation) {
  const shape = FORMATIONS[formation]?.shape ?? { attack: 1, defence: 1, midfield: 1 };
  const posGroup = groupOf(position);
  
  // Positions that benefit from attacking formations
  const attackingPositions = ["ST", "RW", "LW", "CAM", "CF"];
  // Positions that benefit from defensive formations
  const defensivePositions = ["CB", "CDM", "LB", "RB", "GK"];
  // Positions that benefit from midfield-heavy formations
  const midfieldPositions = ["CM", "CDM", "CAM", "RM", "LM"];
  
  let fit = 50;
  
  if (attackingPositions.includes(position)) {
    fit += (shape.attack - 1) * 30;
  } else if (defensivePositions.includes(position)) {
    fit += (shape.defence - 1) * 30;
  } else if (midfieldPositions.includes(position)) {
    fit += (shape.midfield ?? 1 - 1) * 20;
  }
  
  return clamp(fit, 0, 100);
}

export function agentSearchTerms(agent) {
  const reputation = Number(agent?.reputation ?? 50);
  if (reputation < 50) return { tier: "Basic", searches: 2, maxPrestige: 58 };
  if (reputation < 70)
    return { tier: "Professional", searches: 3, maxPrestige: 76 };
  if (reputation < 90) return { tier: "Elite", searches: 4, maxPrestige: 92 };
  return { tier: "World-Class", searches: 5, maxPrestige: 100 };
}

export function transferWindowForMonth(month) {
  if (month === 7 || month === 8) return "summer";
  if (month === 1) return "winter";
  return null;
}
