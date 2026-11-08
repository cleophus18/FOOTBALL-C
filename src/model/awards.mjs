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
