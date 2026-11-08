import { clamp, round } from "./util.mjs";
import { FORMATIONS, selectLineup } from "../model/club.mjs";
import { effectiveRating, calculateOverall, updatePlayerOverall } from "../model/player.mjs";

export const COACHING_ATTRIBUTES = [
  "tacticalIntelligence",
  "attackingCoaching",
  "defensiveCoaching",
  "playerDevelopment",
  "formationAdaptability",
  "squadManagement",
  "youthDevelopment",
  "matchPreparation",
  "motivation",
  "inGameDecisionMaking",
];

export const COACH_RANKS = [
  { rank: "F", label: "Beginner", minimum: 1, weeklySalary: 800 },
  { rank: "E", label: "Below Average", minimum: 45, weeklySalary: 1800 },
  { rank: "D", label: "Average", minimum: 55, weeklySalary: 4000 },
  { rank: "C", label: "Good", minimum: 65, weeklySalary: 9000 },
  { rank: "B", label: "Very Good", minimum: 75, weeklySalary: 20000 },
  { rank: "A", label: "Elite", minimum: 85, weeklySalary: 50000 },
  { rank: "S", label: "World Class", minimum: 93, weeklySalary: 120000 },
];

export function coachRankFor(overall = 1) {
  return [...COACH_RANKS].reverse().find((entry) => overall >= entry.minimum) ?? COACH_RANKS[0];
}

function stableOffset(value, index) {
  const text = String(value ?? "");
  let hash = index + 17;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return (hash % 13) - 6;
}

const COACH_FIRST_NAMES = ["Marco", "Luca", "Daniel", "Rafael", "Thiago", "Nico", "Matteo", "James", "Carlos", "Andreas"];
const COACH_LAST_NAMES = ["Moretti", "Silva", "Berg", "Costa", "Rossi", "Muller", "Clark", "Vargas", "Navarro", "Kovac"];

export function generateCoachMarket(seed = 0, season = 2026, count = 10) {
  let state = (Number(seed) >>> 0) || 1;
  const random = (max) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % max;
  };
  const styles = Object.keys(PLAYSTYLES);
  return Array.from({ length: count }, (_, index) => {
    const first = COACH_FIRST_NAMES[random(COACH_FIRST_NAMES.length)];
    const last = COACH_LAST_NAMES[random(COACH_LAST_NAMES.length)];
    const rating = clamp(55 + random(35), 55, 89);
    const age = 32 + random(27);
    const style = styles[random(styles.length)];
    const attributes = Object.fromEntries(COACHING_ATTRIBUTES.map((attribute, attrIndex) =>
      [attribute, clamp(rating + ((random(13) - 6) + stableOffset(`${seed}-${index}-${attrIndex}`, attrIndex)), 45, 96)],
    ));
    const candidate = {
      id: `npc-coach-${season}-${seed}-${index + 1}`,
      name: `${first} ${last}`,
      nationality: ["ENG", "ITA", "ESP", "GER", "FRA", "BRA"][random(6)],
      age,
      rating,
      overall: rating,
      playstyle: style,
      style,
      preferredFormation: PLAYSTYLES[style].formations[random(PLAYSTYLES[style].formations.length)],
      coachingAttributes: attributes,
      yearsExperience: Math.max(0, age - 27),
      careerHistory: [],
    };
    return { ...candidate, cost: Math.round(coachSalaryFor(candidate) * 52 * 0.9), salary: coachSalaryFor(candidate) };
  });
}

export function coachOverall(manager) {
  const values = Object.values(manager?.coachingAttributes ?? {});
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : clamp(Number(manager?.rating ?? 60), 1, 99);
}

/** Weekly salary in euros, calibrated to published top-flight manager pay ranges. */
export function coachSalaryFor(manager) {
  const overall = clamp(Number(manager?.overall ?? manager?.rating ?? 60), 1, 99);
  const rank = coachRankFor(overall);
  const withinRank = clamp((overall - rank.minimum) / 8, 0, 1);
  return Math.round(rank.weeklySalary * (1 + withinRank * 0.35));
}

export const PLAYSTYLES = {
  Possession: { formations: ["4-3-3", "4-2-3-1", "4-1-4-1"], attack: 1.03, defence: 1, passing: 1.08, press: 0.9 },
  "High Press": { formations: ["4-3-3", "4-2-3-1", "3-4-3"], attack: 1.06, defence: 0.98, passing: 1, press: 1.12 },
  Counter: { formations: ["4-2-3-1", "5-3-2", "4-4-2"], attack: 1.07, defence: 1.04, passing: 0.96, press: 1.02 },
  "Tiki-Taka": { formations: ["4-3-3", "4-1-4-1", "4-2-3-1"], attack: 1.04, defence: 0.99, passing: 1.1, press: 0.95 },
  "Wing Play": { formations: ["4-3-3", "3-4-3", "5-3-2"], attack: 1.07, defence: 0.98, passing: 1, press: 1 },
  Gegenpressing: { formations: ["4-3-3", "4-2-3-1", "3-5-2"], attack: 1.05, defence: 0.97, passing: 1, press: 1.15 },
  Direct: { formations: ["4-4-2", "4-2-2-2", "5-3-2"], attack: 1.04, defence: 1.02, passing: 0.96, press: 0.98 },
  "Low Block": { formations: ["5-3-2", "4-1-4-1", "5-4-1"], attack: 0.94, defence: 1.1, passing: 0.94, press: 0.8 },
  Balanced: { formations: ["4-3-3", "4-2-3-1", "4-4-2"], attack: 1, defence: 1, passing: 1, press: 1 },
  "Long Ball": { formations: ["4-4-2", "4-2-2-2", "5-3-2"], attack: 1.02, defence: 1.02, passing: 0.92, press: 0.92 },
};

const ROLE_BY_STYLE = {
  Possession: { midfield: "Deep playmaker", winger: "Support", striker: "False nine" },
  "High Press": { midfield: "Box-to-box", winger: "Pressing winger", striker: "Pressing forward" },
  Counter: { midfield: "Holding midfielder", winger: "Inside forward", striker: "Advanced forward" },
  "Wing Play": { midfield: "Box-to-box", winger: "Stay wide", striker: "Target forward" },
  "Low Block": { midfield: "Holding midfielder", winger: "Support", striker: "Advanced forward" },
  Direct: { midfield: "Holding midfielder", winger: "Support", striker: "Target forward" },
};

export function ensureCoachProfile(club) {
  const hierarchy = club.hierarchy ?? {};
  const manager = hierarchy.manager ?? club.manager ?? {};
  const known = PLAYSTYLES[manager.style] ? manager.style : "Balanced";
  manager.playstyle =
    PLAYSTYLES[manager.playstyle] ? manager.playstyle : known;
  manager.secondaryPlaystyle = manager.secondaryPlaystyle ?? "Balanced";
  manager.tacticalKnowledge = clamp(Number(manager.tacticalKnowledge ?? manager.rating ?? 60), 1, 99);
  manager.flexibility = clamp(Number(manager.flexibility ?? manager.rating ?? 60), 1, 99);
  manager.developmentAbility = clamp(Number(manager.developmentAbility ?? manager.rating ?? 60), 1, 99);
  manager.youthAbility = clamp(Number(manager.youthAbility ?? manager.rating ?? 60), 1, 99);
  const seed = manager.id ?? manager.name ?? club.id;
  manager.coachingAttributes ??= {};
  for (const [index, attribute] of COACHING_ATTRIBUTES.entries()) {
    manager.coachingAttributes[attribute] = clamp(
      Number(
        manager.coachingAttributes[attribute] ??
          (manager.rating ?? 60) + stableOffset(seed, index),
      ),
      1,
      99,
    );
  }
  manager.overall = clamp(
    Number(manager.overall ?? coachOverall(manager)),
    1,
    99,
  );
  manager.potential = clamp(
    Number(manager.potential ?? Math.max(manager.overall, manager.overall + 8)),
    manager.overall,
    99,
  );
  manager.rank = manager.rank ?? coachRankFor(manager.overall).rank;
  manager.potentialRank =
    manager.potentialRank ?? coachRankFor(manager.potential).rank;
  manager.yearsExperience = Math.max(
    0,
    Number(manager.yearsExperience ?? Math.max(0, (manager.age ?? 40) - 25)),
  );
  manager.experience = Math.max(0, Number(manager.experience ?? manager.yearsExperience * 4));
  manager.developmentProgress = Number(manager.developmentProgress ?? 0);
  manager.salary = coachSalaryFor(manager);
  manager.salaryPeriod = "weekly";
  manager.recruitmentCost = Math.round(manager.salary * 12);
  manager.statistics ??= {
    matchesManaged: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    leagueTitles: 0,
    cupTrophies: 0,
    continentalTrophies: 0,
    playersDeveloped: 0,
    tacticalSuccess: 0,
    coachAwards: 0,
  };
  manager.statistics.coachAwards ??= 0;
  manager.seasonAwards ??= [];
  manager.careerHistory ??= [];
  manager.trust ??= {};
  manager.coachingRank = manager.rank;
  manager.coachingOverall = manager.overall;
  manager.rating = manager.overall;
  manager.preferredFormation = manager.preferredFormation ?? PLAYSTYLES[manager.playstyle].formations[0];
  manager.tacticalSettings = manager.tacticalSettings ?? {
    pressing: manager.playstyle === "Low Block" ? "Low" : manager.playstyle === "High Press" || manager.playstyle === "Gegenpressing" ? "Aggressive" : "Balanced",
    defensiveLine: manager.playstyle === "Low Block" ? "Low" : manager.playstyle === "High Press" ? "High" : "Balanced",
    buildUp: manager.playstyle === "Possession" || manager.playstyle === "Tiki-Taka" ? "Possession" : manager.playstyle === "Direct" || manager.playstyle === "Long Ball" ? "Direct" : "Balanced",
  };
  if (hierarchy.manager) hierarchy.manager = manager;
  Object.assign(club.manager, manager);
  club.manager.playstyle = manager.playstyle;
  club.manager.tacticalSettings = manager.tacticalSettings;
  return manager;
}

export function recordCoachMatch(club, result) {
  const manager = ensureCoachProfile(club);
  const stats = manager.statistics;
  stats.matchesManaged++;
  if (result === "W") stats.wins++;
  else if (result === "D") stats.draws++;
  else stats.losses++;
  const outcome = result === "W" ? 0.18 : result === "D" ? 0.02 : -0.14;
  manager.developmentProgress += outcome;
  return stats;
}

export function developCoach(club, context = {}) {
  const manager = ensureCoachProfile(club);
  const age = Number(manager.age ?? 40);
  const result = Number(context.result ?? 0);
  const playerGrowth = Number(context.playerGrowth ?? 0);
  const trophy = Number(context.trophy ?? 0);
  const pressure = Number(context.pressure ?? 0);
  const ageFactor = age < 35 ? 1.15 : age > 60 ? 0.45 : 0.8;
  manager.developmentProgress +=
    (result * 0.12 + playerGrowth * 0.08 + trophy * 0.4 - pressure * 0.1) *
    ageFactor;
  if (Math.abs(manager.developmentProgress) >= 1) {
    const direction = manager.developmentProgress > 0 ? 1 : -1;
    const attributes = Object.keys(manager.coachingAttributes);
    const attribute =
      attributes[
        (Math.floor(manager.experience) + attributes.length) %
          attributes.length
      ];
    manager.coachingAttributes[attribute] = clamp(
      manager.coachingAttributes[attribute] + direction,
      1,
      99,
    );
    manager.developmentProgress -= direction;
    manager.experience += direction > 0 ? 1 : 0;
  }
  manager.overall = clamp(coachOverall(manager), 1, manager.potential ?? 99);
  manager.rank = coachRankFor(manager.overall).rank;
  manager.coachingRank = manager.rank;
  manager.potentialRank = coachRankFor(manager.potential ?? manager.overall).rank;
  manager.yearsExperience = Math.max(0, (manager.yearsExperience ?? 0) + 0.02);
  return manager;
}

function playerSuitability(player, slot, profile) {
  const natural = player.position === slot ? 18 : (player.altPositions ?? []).includes(slot) ? 10 : 0;
  const technical = ["Possession", "Tiki-Taka"].includes(profile.playstyle)
    ? (player.attrs?.passing ?? 50) * 0.12
    : ["High Press", "Gegenpressing"].includes(profile.playstyle)
      ? (player.attrs?.stamina ?? 50) * 0.1
      : (player.attrs?.physical ?? 50) * 0.05;
  return effectiveRating(player, slot) + natural + technical - (player.fatigue ?? 0) * 0.08;
}

export function chooseTacticalFormation(club, players, dayIndex = 0) {
  const manager = ensureCoachProfile(club);
  const profile = PLAYSTYLES[manager.playstyle];
  const squad = players.filter((player) => club.squad.includes(player.id) && !player.injury && !(player.suspensionWeeks > 0));
  const candidates = [...new Set([...profile.formations, manager.preferredFormation].filter((formation) => FORMATIONS[formation]))];
  let best = manager.preferredFormation;
  let bestScore = -Infinity;
  for (const formation of candidates) {
    const lineup = selectLineup(squad, formation, dayIndex);
    const suitability = lineup.xi.reduce((sum, item) => sum + playerSuitability(item.player, item.slot, manager), 0);
    const fit =
      suitability / Math.max(1, lineup.xi.length) +
      (formation === manager.preferredFormation
        ? manager.tacticalKnowledge * 0.04
        : manager.coachingAttributes.formationAdaptability * 0.025) +
      manager.coachingAttributes.tacticalIntelligence * 0.012;
    if (fit > bestScore) { bestScore = fit; best = formation; }
  }
  return { formation: best, score: round(bestScore, 2), reason: `${manager.playstyle} preference, squad suitability, fitness, and positional coverage` };
}

export function applyCoachTactics(club, players) {
  const manager = ensureCoachProfile(club);
  const profile = PLAYSTYLES[manager.playstyle] ?? PLAYSTYLES.Balanced;
  const strength = club.strength(players, 0, { tactics: { attack: profile.attack, defence: profile.defence } });
  return {
    ...strength,
    playstyle: manager.playstyle,
    passingMultiplier: profile.passing,
    pressingMultiplier: profile.press,
    tacticalSettings: manager.tacticalSettings,
    coachInfluence: {
      attack: 1 + (manager.coachingAttributes.attackingCoaching - 50) * 0.0008,
      defence: 1 + (manager.coachingAttributes.defensiveCoaching - 50) * 0.0008,
      development: 1 + (manager.coachingAttributes.playerDevelopment - 50) * 0.003,
    },
  };
}

export function tacticalRoles(club) {
  const manager = ensureCoachProfile(club);
  const roles = ROLE_BY_STYLE[manager.playstyle] ?? ROLE_BY_STYLE.Direct;
  return { fullbacks: manager.playstyle === "Wing Play" ? "Attacking" : "Balanced", midfield: roles.midfield, wingers: roles.winger, striker: roles.striker };
}

export function academyState(club) {
  const manager = ensureCoachProfile(club);
  club.academy ??= { players: [], coaches: [], developmentHistory: [], budget: 0 };
  club.academy.players ??= [];
  club.academy.coaches ??= [];
  club.academy.developmentHistory ??= [];
  club.academy.budget ??= 0;
  club.academy.playstyle = manager.playstyle;
  return club.academy;
}

export function acceptYouthProspect(club, prospectId) {
  const state = academyState(club);
  const scouting = club.scouting ?? {};
  const prospect = (scouting.youthProspects ?? []).find((item) => item.id === prospectId && item.status === "available");
  if (!prospect) throw new Error("That youth prospect is no longer available.");
  if (state.players.some((player) => player.id === prospect.id)) throw new Error("That prospect is already in the academy.");
  prospect.status = "academy";
  state.players.push({ ...prospect, plan: "Balanced Development", progress: 0, developmentHistory: [] });
  return state.players.at(-1);
}

export function releaseAcademyPlayer(club, playerId) {
  const state = academyState(club);
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index < 0) throw new Error("Academy player not found.");
  const [player] = state.players.splice(index, 1);
  player.status = "released";
  state.developmentHistory.push({ playerId, action: "released" });
  return player;
}

export function developAcademy(club, rng, date) {
  const state = academyState(club);
  const manager = ensureCoachProfile(club);
  const facilityLevel = club.investment?.facilities?.youthAcademy ?? 1;
  for (const player of state.players) {
    if (player.status !== "academy") continue;
    const gain = Math.max(0.08, 0.14 + (manager.youthAbility - 50) * 0.002 + (facilityLevel - 1) * 0.018 + rng.range(-0.04, 0.05));
    player.progress = (player.progress ?? 0) + gain;
    if (player.progress >= 1 && player.overall < player.potential) {
      const increase = Math.min(1, Math.floor(player.progress), player.potential - player.overall);
      player.overall += increase;
      player.progress -= increase;
      state.developmentHistory.push({ playerId: player.id, date, change: increase, plan: player.plan });
    }
    player.confidence = clamp((player.confidence ?? 50) + gain * 4, 0, 100);
  }
}
