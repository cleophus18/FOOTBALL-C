import { normalizePosition } from "../core/constants.mjs";
import { formatDecimal } from "../core/util.mjs";

const DEFENDERS = new Set(["CB", "LB", "RB"]);
const MIDFIELDERS = new Set(["DM", "CM", "AM", "CDM", "CAM"]);
const ATTACKERS = new Set(["LW", "RW", "ST"]);

export const INDIVIDUAL_AWARD_DEFINITIONS = {
  "Player of the Season": { category: "overall", minimumApps: 5 },
  "Young Player of the Season": { category: "overall", minimumApps: 5, maxAge: 23 },
  "Golden Boot": { category: "goals", minimumApps: 1 },
  "Playmaker of the Season": { category: "assists", minimumApps: 1 },
  "Best Goalkeeper": { category: "goalkeeper", minimumApps: 5 },
  "Best Defender": { category: "defender", minimumApps: 5 },
  "Best Midfielder": { category: "midfielder", minimumApps: 5 },
  "Best Forward": { category: "forward", minimumApps: 5 },
  "Player of the Tournament": { category: "overall", minimumApps: 2 },
  "Top Scorer": { category: "goals", minimumApps: 1 },
};

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function playerAwardScore(player, {
  category = "overall",
  championIds = new Set(),
  competitionWeight = 1,
  importantMatches = 0,
} = {}) {
  const stats = player?.stats ?? player ?? {};
  const apps = number(stats.apps ?? player?.apps);
  if (!apps) return 0;
  const position = normalizePosition(player?.position ?? "CM");
  const average = number(stats.ratingSum ?? player?.ratingSum) / apps;
  const goals = number(stats.goals ?? player?.goals ?? player?.leagueGoals);
  const assists = number(stats.assists ?? player?.assists ?? player?.leagueAssists);
  const cleanSheets = number(stats.cleanSheets);
  const saves = number(stats.saves);
  const defensive = number(stats.tacklesWon) + number(stats.interceptions) +
    number(stats.aerialsWon) * 0.5;
  const creation = number(stats.keyPasses) + number(stats.bigChancesCreated) * 1.5 +
    number(stats.passesCompleted) / 80;
  const minutesFactor = Math.min(1.25, Math.max(0.35, number(stats.minutes) / 1800 || apps / 30));
  const consistency = Math.max(0, average - 6) * 12;
  const decisive = number(stats.motm) * 1.5 + number(importantMatches) * 0.8;
  const teamSuccess = championIds.has(player?.clubId) ? 12 : 0;

  if (category === "goals") return goals * 10 + apps * 0.1;
  if (category === "assists") return assists * 10 + creation * 2 + apps * 0.1;
  if (category === "goalkeeper") {
    return average * 7 + cleanSheets * 4 + saves * 0.35 + teamSuccess * 0.5 +
      minutesFactor * 8 + decisive;
  }
  if (category === "defender") {
    return average * 7 + cleanSheets * 2.5 + defensive * 1.8 + creation +
      teamSuccess * 0.5 + minutesFactor * 8 + decisive;
  }
  if (category === "midfielder") {
    return average * 7 + assists * 3 + goals * 2 + creation * 1.5 +
      defensive * 0.7 + teamSuccess * 0.5 + minutesFactor * 8 + decisive;
  }
  if (category === "forward") {
    return average * 7 + goals * 5 + assists * 2 + creation +
      teamSuccess * 0.5 + minutesFactor * 8 + decisive;
  }
  return average * 8 + goals * 3.2 + assists * 2.4 + defensive * 0.8 +
    creation * 1.2 + teamSuccess + decisive + minutesFactor * 10 +
    number(player?.overall) * 0.18 * competitionWeight;
}

export function eligibleAwardPlayers(players, definition = {}) {
  return (players ?? []).filter((player) => {
    const stats = player?.stats ?? player ?? {};
    const apps = number(stats.apps ?? player?.apps);
    const age = number(player?.age);
    return apps >= (definition.minimumApps ?? 1) &&
      (definition.maxAge == null || !age || age <= definition.maxAge);
  });
}

export function selectAwardWinner(players, definition = {}, context = {}) {
  const eligible = eligibleAwardPlayers(players, definition);
  if (!eligible.length) return null;
  return [...eligible].sort((left, right) =>
    playerAwardScore(right, { ...definition, ...context }) -
      playerAwardScore(left, { ...definition, ...context }) ||
    number(right?.stats?.apps ?? right?.apps) - number(left?.stats?.apps ?? left?.apps) ||
    String(left.id ?? left.name ?? "").localeCompare(String(right.id ?? right.name ?? "")),
  )[0];
}

export function awardRecord(name, players, definition = {}, context = {}) {
  const winner = selectAwardWinner(players, definition, context);
  if (!winner) return {
    award: name,
    winners: [],
    value: null,
    valueLabel: "score",
  };
  const score = playerAwardScore(winner, { ...definition, ...context });
  return {
    award: name,
    winners: [{
      player: `${winner.first ?? ""} ${winner.last ?? ""}`.trim() || winner.name,
      playerId: winner.id,
      club: winner.clubName ?? winner.club ?? winner.clubId ?? "—",
    }],
    value: score,
    valueLabel: "award score",
    displayValue: `${formatDecimal(score)} pts`,
  };
}

export function positionAwardDefinition(name) {
  if (name === "Best Goalkeeper") return { category: "goalkeeper", minimumApps: 5 };
  if (name === "Best Defender") return { category: "defender", minimumApps: 5 };
  if (name === "Best Midfielder") return { category: "midfielder", minimumApps: 5 };
  if (name === "Best Forward") return { category: "forward", minimumApps: 5 };
  return INDIVIDUAL_AWARD_DEFINITIONS[name] ?? { category: "overall", minimumApps: 1 };
}

export function awardRacePoints({ goals = 0, assists = 0, averageRating = 0, apps = 0 } = {}) {
  return goals * 4 + assists * 2 + averageRating * 10 + Math.min(apps, 38) * 0.25;
}

export function awardRace(players = []) {
  return players
    .map((player) => {
      const stats = player.stats ?? {};
      const apps = number(stats.apps);
      const ratingSum = number(stats.ratingSum);
      const averageRating = apps ? ratingSum / apps : 0;
      const goals = number(player.leagueGoals ?? player.goals);
      const assists = number(player.leagueAssists ?? player.assists);
      return {
        player,
        playerId: player.id,
        apps,
        averageRating,
        goals,
        assists,
        points: awardRacePoints({ goals, assists, averageRating, apps }),
      };
    })
    .sort((left, right) => right.points - left.points || left.playerId.localeCompare(right.playerId));
}

const VOTE_POINTS = [15, 12, 10, 8, 7, 5, 4, 3, 2, 1];
const JOURNALIST_COUNT = 100;
const SHORTLIST_SIZE = 30;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed, counter = 0) {
  return mulberry32((seed * 31 + counter) | 0);
}

const JOURNALIST_ARCHETYPES = [
  { id: "stats_purist", name: "Statistics Purist", weights: { individualStatistics: 0.35, domesticLeaguePerformance: 0.20, championsLeaguePerformance: 0.15, teamAchievements: 0.10, consistencyBigMatches: 0.10, worldCup: 0.10 } },
  { id: "trophy_hunter", name: "Trophy Hunter", weights: { individualStatistics: 0.15, domesticLeaguePerformance: 0.15, championsLeaguePerformance: 0.15, teamAchievements: 0.35, consistencyBigMatches: 0.10, worldCup: 0.10 } },
  { id: "european_specialist", name: "European Specialist", weights: { individualStatistics: 0.20, domesticLeaguePerformance: 0.15, championsLeaguePerformance: 0.35, teamAchievements: 0.15, consistencyBigMatches: 0.10, worldCup: 0.05 } },
  { id: "domestic_traditionalist", name: "Domestic Traditionalist", weights: { individualStatistics: 0.20, domesticLeaguePerformance: 0.35, championsLeaguePerformance: 0.10, teamAchievements: 0.20, consistencyBigMatches: 0.10, worldCup: 0.05 } },
  { id: "international_observer", name: "International Observer", weights: { individualStatistics: 0.20, domesticLeaguePerformance: 0.15, championsLeaguePerformance: 0.15, teamAchievements: 0.15, consistencyBigMatches: 0.10, worldCup: 0.25 } },
  { id: "consistency_advocate", name: "Consistency Advocate", weights: { individualStatistics: 0.20, domesticLeaguePerformance: 0.20, championsLeaguePerformance: 0.15, teamAchievements: 0.10, consistencyBigMatches: 0.25, worldCup: 0.10 } },
  { id: "attacking_bias", name: "Attacking Bias", weights: { individualStatistics: 0.30, domesticLeaguePerformance: 0.25, championsLeaguePerformance: 0.20, teamAchievements: 0.10, consistencyBigMatches: 0.10, worldCup: 0.05 } },
  { id: "defensive_appreciation", name: "Defensive Appreciation", weights: { individualStatistics: 0.20, domesticLeaguePerformance: 0.25, championsLeaguePerformance: 0.15, teamAchievements: 0.15, consistencyBigMatches: 0.15, worldCup: 0.10 } },
  { id: "balanced_analyst", name: "Balanced Analyst", weights: { individualStatistics: 0.25, domesticLeaguePerformance: 0.20, championsLeaguePerformance: 0.18, teamAchievements: 0.15, consistencyBigMatches: 0.12, worldCup: 0.10 } },
  { id: "narrative_writer", name: "Narrative Writer", weights: { individualStatistics: 0.20, domesticLeaguePerformance: 0.15, championsLeaguePerformance: 0.20, teamAchievements: 0.20, consistencyBigMatches: 0.15, worldCup: 0.10 } },
];

function positionCategory(position) {
  const pos = normalizePosition(position);
  if (pos === "GK") return "goalkeeper";
  if (DEFENDERS.has(pos)) return "defender";
  if (MIDFIELDERS.has(pos)) return "midfielder";
  if (ATTACKERS.has(pos)) return "forward";
  return "midfielder";
}

function journalistPositionBias(archetype, position) {
  const cat = positionCategory(position);
  const biases = {
    attacking_bias: { forward: 1.15, midfielder: 1.05, defender: 0.9, goalkeeper: 0.85 },
    defensive_appreciation: { defender: 1.15, goalkeeper: 1.1, midfielder: 1.0, forward: 0.9 },
    stats_purist: { forward: 1.0, midfielder: 1.0, defender: 1.0, goalkeeper: 1.0 },
    trophy_hunter: { forward: 1.0, midfielder: 1.0, defender: 1.0, goalkeeper: 1.0 },
    european_specialist: { forward: 1.05, midfielder: 1.05, defender: 0.95, goalkeeper: 0.95 },
    domestic_traditionalist: { forward: 1.0, midfielder: 1.0, defender: 1.0, goalkeeper: 1.0 },
    international_observer: { forward: 1.0, midfielder: 1.0, defender: 1.0, goalkeeper: 1.0 },
    consistency_advocate: { forward: 1.0, midfielder: 1.05, defender: 1.05, goalkeeper: 1.1 },
    balanced_analyst: { forward: 1.0, midfielder: 1.0, defender: 1.0, goalkeeper: 1.0 },
    narrative_writer: { forward: 1.1, midfielder: 1.0, defender: 0.95, goalkeeper: 0.9 },
  };
  return (biases[archetype.id]?.[cat] ?? 1.0);
}

function evaluateCandidateForJournalist(candidate, archetype, seasonSeed, journalistIndex) {
  const rng = seededRandom(seasonSeed, journalistIndex * 1000 + JOURNALIST_ARCHETYPES.findIndex(a => a.id === archetype.id));
  
  const categoryScores = candidate.categoryScores ?? {};
  const weights = archetype.weights;
  
  let score = 0;
  for (const [category, weight] of Object.entries(weights)) {
    const categoryValue = categoryScores[category] ?? 0;
    score += categoryValue * weight;
  }
  
  const positionBias = journalistPositionBias(archetype, candidate.player?.position ?? "CM");
  score *= positionBias;
  
  const noise = (rng() - 0.5) * 0.02 * score;
  score += noise;
  
  return Math.max(0, score);
}

function journalistBallot(shortlist, journalistIndex, seasonSeed) {
  const archetype = JOURNALIST_ARCHETYPES[journalistIndex % JOURNALIST_ARCHETYPES.length];
  
  const evaluated = shortlist.map((entry) => ({
    ...entry,
    journalistScore: evaluateCandidateForJournalist(entry, archetype, seasonSeed, journalistIndex),
  }));
  
  evaluated.sort((a, b) => b.journalistScore - a.journalistScore || a.playerId.localeCompare(b.playerId));
  
  const ballot = [];
  for (let i = 0; i < 10 && i < evaluated.length; i++) {
    ballot.push(evaluated[i].playerId);
  }
  return ballot;
}

export function runJournalistVoting(shortlist, seasonSeed) {
  const voteTally = new Map();
  const firstPlaceVotes = new Map();
  const secondPlaceVotes = new Map();

  for (const entry of shortlist) {
    voteTally.set(entry.playerId, 0);
    firstPlaceVotes.set(entry.playerId, 0);
    secondPlaceVotes.set(entry.playerId, 0);
  }

  for (let j = 0; j < JOURNALIST_COUNT; j++) {
    const ballot = journalistBallot(shortlist, j, seasonSeed);
    for (let i = 0; i < ballot.length; i++) {
      const playerId = ballot[i];
      const points = VOTE_POINTS[i] ?? 0;
      voteTally.set(playerId, (voteTally.get(playerId) ?? 0) + points);
      if (i === 0) firstPlaceVotes.set(playerId, (firstPlaceVotes.get(playerId) ?? 0) + 1);
      if (i === 1) secondPlaceVotes.set(playerId, (secondPlaceVotes.get(playerId) ?? 0) + 1);
    }
  }

  const results = [...shortlist].map((entry) => ({
    playerId: entry.playerId,
    player: entry.player,
    club: entry.clubId,
    nationality: entry.nationality,
    overall: entry.overall,
    goals: entry.goals,
    assists: entry.assists,
    averageRating: entry.averageRating,
    points: voteTally.get(entry.playerId) ?? 0,
    firstPlaceVotes: firstPlaceVotes.get(entry.playerId) ?? 0,
    secondPlaceVotes: secondPlaceVotes.get(entry.playerId) ?? 0,
    categoryScores: entry.categoryScores,
  }));

  results.sort((left, right) =>
    right.points - left.points ||
    right.firstPlaceVotes - left.firstPlaceVotes ||
    right.secondPlaceVotes - left.secondPlaceVotes ||
    String(left.playerId).localeCompare(String(right.playerId)),
  );

  return {
    winner: results[0] ?? null,
    top10: results.slice(0, 10).map((entry, index) => ({
      rank: index + 1,
      ...entry,
    })),
    shortlist: results.map((entry) => entry.playerId),
    totalJournalists: JOURNALIST_COUNT,
    voteBreakdown: results.slice(0, 10).map((entry, index) => ({
      rank: index + 1,
      playerId: entry.playerId,
      player: entry.player,
      club: entry.club,
      points: entry.points,
      firstPlaceVotes: entry.firstPlaceVotes,
      secondPlaceVotes: entry.secondPlaceVotes,
    })),
  };
}

export function calculateBallonDorScore(player, context = {}) {
  const {
    stats = player?.stats ?? {},
    leaguePerformance = player?.leaguePerformance ?? {},
    championsLeague = context.championsLeague ?? null,
    worldCup = context.worldCup ?? null,
    awards = context.awards ?? [],
    isLeagueChampion = context.isLeagueChampion ?? false,
    isCLWinner = context.isCLWinner ?? false,
    isCLRunnerUp = context.isCLRunnerUp ?? false,
  } = context;

  const position = normalizePosition(player?.position ?? "CM");
  const apps = number(leaguePerformance.apps ?? stats.apps ?? player?.apps ?? 0);
  const clApps = number(championsLeague?.apps ?? 0);
  const totalApps = apps + clApps;
  if (!totalApps) return 0;

  const ratingSum = number(leaguePerformance.ratingSum ?? stats.ratingSum ?? player?.ratingSum ?? 0);
  const averageRating = apps ? ratingSum / apps : 0;

  const goals = number(leaguePerformance.goals ?? player?.leagueGoals ?? stats.goals ?? 0);
  const assists = number(leaguePerformance.assists ?? player?.leagueAssists ?? stats.assists ?? 0);
  const clGoals = number(championsLeague?.goals ?? 0);
  const clAssists = number(championsLeague?.assists ?? 0);

  const cleanSheets = number(stats.cleanSheets);
  const saves = number(stats.saves);
  const defensive = number(stats.tacklesWon) + number(stats.interceptions) +
    number(stats.aerialsWon) * 0.5;
  const creation = number(stats.keyPasses) + number(stats.bigChancesCreated) * 1.5 +
    number(stats.passesCompleted) / 80;

  const playingTimeFactor = Math.min(1, apps / 20);
  const clPlayingTimeFactor = Math.min(1, clApps / 4);

  const diminishing = (value, max, scale) =>
    Math.max(0, Math.min(max, max * (1 - Math.exp(-Math.max(0, value) / scale))));

  let individualStatistics = 0;
  if (position === "GK") {
    individualStatistics = diminishing(
      cleanSheets * 3 + saves * 0.35 + (stats.savePercentage ?? 0) * 0.25 + (stats.goalsPrevented ?? 0) * 2 +
        goals * 4 + assists * 3,
      250, 55
    );
  } else if (DEFENDERS.has(position)) {
    individualStatistics = diminishing(
      goals * 5 + assists * 4 + cleanSheets * 3 + defensive * 0.8 + (stats.interceptions ?? 0) * 0.7 +
        (stats.blocks ?? 0) * 0.7 + (stats.aerialsWon ?? 0) * 0.3,
      250, 55
    );
  } else if (MIDFIELDERS.has(position)) {
    individualStatistics = diminishing(
      goals * 7 + assists * 8 + (stats.keyPasses ?? stats.bigChancesCreated ?? 0) * 0.7 +
        defensive * 0.35 + (stats.passesCompleted ?? 0) * 0.015,
      250, 55
    );
  } else {
    individualStatistics = diminishing(
      goals * 11 + assists * 8 + (stats.shotsOnTarget ?? 0) * 0.35 + (stats.chancesCreated ?? stats.keyPasses ?? 0) * 0.35,
      250, 55
    );
  }
  individualStatistics += Math.min(65, Math.max(0, (averageRating - 6) * 42));
  individualStatistics += Math.min(45, Math.min(apps, 38) * 1.2);
  individualStatistics = Math.min(250, Math.max(0, individualStatistics));

  let domesticLeaguePerformance = 0;
  if (apps > 0) {
    const domesticStats = position === "GK"
      ? cleanSheets * 3 + saves * 0.35
      : DEFENDERS.has(position)
        ? goals * 5 + assists * 4 + cleanSheets * 3 + defensive * 0.8
        : MIDFIELDERS.has(position)
          ? goals * 7 + assists * 8 + creation * 0.7
          : goals * 11 + assists * 8;

    domesticLeaguePerformance = (
      Math.min(70, Math.max(0, (averageRating - 6) * 38)) +
      diminishing(domesticStats, 95, 55) +
      Math.min(44, Math.min(apps, 38) * 1.15)
    ) * (0.65 + playingTimeFactor * 0.35);
    domesticLeaguePerformance = Math.min(200, Math.max(0, domesticLeaguePerformance));
  }

  let championsLeaguePerformance = 0;
  if (clApps > 0) {
    const clRating = championsLeague.ratingSum / Math.max(1, clApps);
    const clStats = position === "GK"
      ? (championsLeague.cleanSheets ?? cleanSheets) * 3 + (championsLeague.saves ?? saves) * 0.35
      : DEFENDERS.has(position)
        ? clGoals * 5 + clAssists * 4 + (championsLeague.cleanSheets ?? cleanSheets) * 3
        : MIDFIELDERS.has(position)
          ? clGoals * 7 + clAssists * 8 + (championsLeague.keyPasses ?? 0) * 0.7
          : clGoals * 11 + clAssists * 8;

    const clGoalPoints = Math.min(55, clGoals * 5 + (championsLeague.knockoutGoals ?? 0) * 3 + (championsLeague.finalGoals ?? 0) * 2);
    const clAssistPoints = Math.min(32, clAssists * 4 + (championsLeague.knockoutAssists ?? 0) * 2 + (championsLeague.finalAssists ?? 0));
    const knockoutApps = number(championsLeague.knockoutApps ?? 0);
    const knockoutRating = knockoutApps ? (championsLeague.knockoutRatingSum ?? 0) / knockoutApps : 0;

    championsLeaguePerformance = (
      Math.min(38, Math.max(0, (clRating - 6) * 25)) +
      clGoalPoints + clAssistPoints +
      diminishing(clStats, 14, 35) +
      Math.min(14, clApps * 1.5) +
      Math.min(20, knockoutApps * 4) +
      Math.min(12, Math.max(0, knockoutRating - 7) * 12) +
      Math.min(12, (championsLeague.playerOfMatch ?? 0) * 4)
    ) * clPlayingTimeFactor;
    championsLeaguePerformance = Math.min(180, Math.max(0, championsLeaguePerformance));
  }

  const leagueChampionContribution = isLeagueChampion ? 180 * playingTimeFactor : 0;
  const clWinnerContribution = isCLWinner ? 70 * clPlayingTimeFactor : 0;
  const clRunnerUpContribution = isCLRunnerUp ? 30 * clPlayingTimeFactor : 0;
  const teamAchievements = Math.min(250, Math.max(0, leagueChampionContribution + clWinnerContribution + clRunnerUpContribution));

  const consistencyBigMatches = Math.min(70, Math.max(0,
    Math.min(70, Math.min(totalApps, 50) * 1.5) +
    Math.max(0, (averageRating - 6.2) * 34) +
    (knockoutRating > 0 ? Math.min(25, Math.max(0, (knockoutRating - 6) * 18)) : 0) +
    Math.min(30, ((player.matchHistory ?? []).filter(m => m.rating >= 7.5).length || 0) * 2)
  ));

  let worldCupPoints = 0;
  if (worldCup?.playerStats?.[player.id]) {
    const wc = worldCup.playerStats[player.id];
    const wcApps = number(wc.apps);
    const wcRating = wcApps ? wc.ratingSum / wcApps : 0;
    const wcIndividual = Math.min(40, Math.max(0, (wcRating - 6) * 9) * Math.min(1, wcApps / 3));
    const wcGoalsAssists = Math.min(20, wc.goals * 3 + wc.assists * 2.5);
    const wcKnockouts = Math.min(15, (wc.knockoutApps ?? 0) * 2 + (wc.knockoutRatingSum ?? 0) * 0.25 + wc.goals * 0.8);
    const wcTeam = (player.nationality === worldCup.winnerId ? 15 : 0) +
      (player.nationality === worldCup.runnerUpId ? 10 : 0) +
      (player.nationality === worldCup.thirdPlaceId ? 6 : 0);
    const wcAwards = Math.min(10,
      (worldCup.goldenBoot?.playerId === player.id ? 4 : 0) +
      (worldCup.goldenBall?.playerId === player.id ? 5 : 0) +
      (worldCup.goldenGlove?.playerId === player.id ? 4 : 0) +
      (worldCup.bestYoungPlayer?.playerId === player.id ? 3 : 0));
    worldCupPoints = Math.min(50, wcIndividual + wcGoalsAssists + wcKnockouts + wcTeam + wcAwards);
  }

  const totalScore = Math.min(1000, Math.max(0,
    individualStatistics +
    domesticLeaguePerformance +
    championsLeaguePerformance +
    teamAchievements +
    consistencyBigMatches +
    worldCupPoints
  ));

  return {
    total: Math.round(totalScore * 100) / 100,
    categoryScores: {
      individualStatistics: Math.round(individualStatistics * 100) / 100,
      domesticLeaguePerformance: Math.round(domesticLeaguePerformance * 100) / 100,
      championsLeaguePerformance: Math.round(championsLeaguePerformance * 100) / 100,
      teamAchievements: Math.round(teamAchievements * 100) / 100,
      consistencyBigMatches: Math.round(consistencyBigMatches * 100) / 100,
      worldCup: Math.round(worldCupPoints * 100) / 100,
    },
  };
}