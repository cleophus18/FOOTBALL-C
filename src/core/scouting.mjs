import { clamp, round } from "./util.mjs";
import { ensureClubFinance, recordClubTransaction, marketValueForPlayer } from "./finance.mjs";
import { generateAttributes } from "../model/player.mjs";
import { randomNameFor, CATALOGUED_NATIONS } from "../model/names.mjs";
import { normalizePosition } from "./constants.mjs";

const REGIONS = ["England", "Spain", "Italy", "Germany", "France", "Portugal", "Brazil", "Argentina", "West Africa", "Scandinavia"];
const POSITIONS = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
const FOCUSES = ["any", "goalkeepers", "defenders", "midfielders", "wingers", "strikers"];
const SCOUT_NAMES = ["Maya Okafor", "Jonas Lind", "Elena Rossi", "Thiago Mendes", "Sophie Martin", "Daniel Hughes", "Kofi Mensah", "Nadia Petrova"];

function stableNumber(value) {
  return String(value ?? "").split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 17);
}

function scoutDefinition(id, index = 0) {
  const quality = 2 + (stableNumber(id) % 4);
  return {
    id,
    name: SCOUT_NAMES[index % SCOUT_NAMES.length],
    nationality: CATALOGUED_NATIONS[index % CATALOGUED_NATIONS.length] ?? "ENG",
    age: 30 + (stableNumber(`${id}-age`) % 25),
    experience: 2 + (stableNumber(`${id}-experience`) % 18),
    ability: quality,
    potential: Math.max(1, Math.min(5, quality + ((index % 3) - 1))),
    tactical: Math.max(1, Math.min(5, quality - (index % 2))),
    youth: Math.max(1, Math.min(5, 1 + ((quality + index) % 5))),
    regionalKnowledge: {},
    wage: 1200 + quality * 950,
    recruitmentCost: 5000 + quality * 9000,
    contractWeeks: 52,
    contractRemaining: 52,
    reputation: 35 + quality * 11,
    assignmentId: null,
    history: [],
  };
}

function defaultScouting(clubId, seed = 1) {
  return {
    budget: 0,
    spent: 0,
    scouts: [
      scoutDefinition(`scout-${clubId}-1`, seed % SCOUT_NAMES.length),
    ],
    availableScouts: [scoutDefinition(`available-${clubId}-1`, (seed + 2) % SCOUT_NAMES.length)],
    assignments: [],
    completedAssignments: [],
    reports: [],
    youthProspects: [],
    shortlist: [],
    notifications: [],
    history: [],
    networkCoverage: {},
  };
}

export function ensureClubScouting(club, seed = 1) {
  if (!club.scouting) club.scouting = defaultScouting(club.id, seed);
  const state = club.scouting;
  state.scouts ??= [];
  state.availableScouts ??= [];
  state.assignments ??= [];
  state.completedAssignments ??= [];
  state.reports ??= [];
  state.youthProspects ??= [];
  state.shortlist ??= [];
  state.notifications ??= [];
  state.history ??= [];
  state.networkCoverage ??= {};
  state.spent = Math.max(0, Number(state.spent ?? 0));
  const defaultBudget = Math.round(ensureClubFinance(club).balance * 0.05);
  if (state.budget == null || (state.budget === 0 && state.spent === 0)) state.budget = defaultBudget;
  state.budget = Math.max(0, Number(state.budget));
  return state;
}

export function scoutingRegions() {
  return [...REGIONS];
}

export function scoutingFocuses() {
  return [...FOCUSES];
}

export function availableScouts(club) {
  return ensureClubScouting(club).availableScouts;
}

function chargeScouting(club, amount, date, description, id) {
  const state = ensureClubScouting(club);
  const finance = ensureClubFinance(club);
  const cost = Math.max(0, Math.round(amount));
  // Scouting costs must not abort a week or season simulation. If the dedicated
  // scouting allocation is low, fund the remaining amount from the club balance.
  if (state.budget < cost) state.budget += cost - state.budget;
  state.budget -= cost;
  state.spent += cost;
  return recordClubTransaction(club, {
    id,
    date,
    category: "scouting",
    description,
    expense: cost,
  });
}

export function hireScout(club, scoutId, date) {
  const state = ensureClubScouting(club);
  const index = state.availableScouts.findIndex((scout) => scout.id === scoutId);
  if (index < 0) throw new Error("That scout is no longer available.");
  const scout = state.availableScouts[index];
  chargeScouting(club, scout.recruitmentCost, date, `Recruit scout ${scout.name}`, `scout-hire-${club.id}-${scout.id}`);
  state.availableScouts.splice(index, 1);
  state.scouts.push({ ...scout });
  state.notifications.unshift({ id: `scout-hired-${scout.id}`, type: "scout", text: `${scout.name} has joined the scouting department.`, date });
  return scout;
}

export function releaseScout(club, scoutId, date) {
  const state = ensureClubScouting(club);
  const index = state.scouts.findIndex((scout) => scout.id === scoutId && !scout.assignmentId);
  if (index < 0) throw new Error("A scout must be free before they can be released.");
  const [scout] = state.scouts.splice(index, 1);
  state.availableScouts.push({ ...scout, id: `available-${club.id}-${scout.id}-${date}` });
  state.history.push({ type: "released", scoutId, date });
  return scout;
}

function assignmentDays(scout, durationWeeks) {
  return Math.max(7, Math.round(Number(durationWeeks ?? 4) * 7 * (1.1 - scout.ability * 0.08)));
}

export function startScoutingAssignment(club, {
  scoutId, type = "first-team", playerId = null, position = null, region = null,
  focus = "any", durationWeeks = 4, date, targetDate,
}) {
  const state = ensureClubScouting(club);
  const scout = state.scouts.find((item) => item.id === scoutId && !item.assignmentId);
  if (!scout) throw new Error("Select an available scout.");
  if (type === "youth" && !REGIONS.includes(region)) throw new Error("Select a supported scouting region.");
  if (focus !== "any" && !FOCUSES.includes(focus)) throw new Error("Select a supported scouting focus.");
  const cost = 900 + scout.ability * 550 + (type === "youth" ? 850 : 0);
  chargeScouting(club, cost, date, `${type === "youth" ? "Youth" : "First-team"} scouting assignment`, `scout-assignment-${club.id}-${date}-${scoutId}`);
  const assignment = {
    id: `assignment-${club.id}-${date}-${state.assignments.length + state.completedAssignments.length + 1}`,
    type, scoutId, playerId, position: position ? normalizePosition(position) : null,
    region, focus, started: date, completes: targetDate ?? date + assignmentDays(scout, durationWeeks),
    progress: 0, durationWeeks: Number(durationWeeks ?? 4),
  };
  scout.assignmentId = assignment.id;
  state.assignments.push(assignment);
  return assignment;
}

function estimate(actual, scout, progress, spread) {
  const accuracy = clamp(0.35 + scout.ability * 0.1 + progress * 0.45, 0.35, 0.96);
  const error = Math.max(1, Math.round(spread * (1 - accuracy)));
  return {
    min: clamp(Math.round(actual - error), 1, 99),
    max: clamp(Math.round(actual + error), 1, 99),
    accuracy: round(accuracy * 100, 1),
  };
}

function valueEstimate(actual, scout, progress) {
  const accuracy = clamp(0.35 + scout.ability * 0.1 + progress * 0.45, 0.35, 0.96);
  const error = Math.max(1000, Math.round(actual * 0.2 * (1 - accuracy)));
  return {
    min: Math.max(0, Math.round(actual - error)),
    max: Math.max(0, Math.round(actual + error)),
    accuracy: round(accuracy * 100, 1),
  };
}

function playerMatches(player, assignment) {
  if (assignment.playerId) return player.id === assignment.playerId;
  if (assignment.position && normalizePosition(player.position) !== assignment.position) return false;
  if (assignment.region && player.nationality && !String(player.nationality).toLowerCase().includes(String(assignment.region).slice(0, 3).toLowerCase())) return false;
  return !!player.clubId;
}

function reportFor(player, club, assignment, scout, date) {
  const progress = clamp(assignment.progress, 0, 1);
  const overall = estimate(player.overall ?? 50, scout, progress, 10);
  const potential = estimate(player.potential ?? player.overall ?? 50, scout, progress * 0.8, 16);
  const value = marketValueForPlayer(player, club, date);
  const valueRange = valueEstimate(value, scout, progress);
  const report = {
    id: `report-${club.id}-${player.id}`,
    playerId: player.id,
    playerName: `${player.first ?? ""} ${player.last ?? ""}`.trim(),
    clubId: player.clubId,
    position: player.position,
    age: player.age,
    nationality: player.nationality,
    estimatedOverall: overall,
    potentialRange: potential,
    marketValueRange: valueRange,
    wageEstimate: Math.round((player.contract?.wage ?? player.wage ?? 1000) * (1 + (1 - progress) * 0.2)),
    confidence: Math.round((overall.accuracy + potential.accuracy) / 2),
    completion: Math.round(progress * 100),
    strengths: Object.entries(player.attrs ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key]) => key),
    weaknesses: Object.entries(player.attrs ?? {}).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([key]) => key),
    recommendation: (player.overall ?? 0) >= 75 ? "Strong target" : (player.overall ?? 0) >= 65 ? "Monitor" : "Development option",
    updated: date,
    assignmentId: assignment.id,
  };
  return report;
}

function youthProspects(club, assignment, scout, rng, date) {
  const count = rng.int(2, 4);
  return Array.from({ length: count }, (_, index) => {
    const position = assignment.focus === "goalkeepers" ? "GK"
      : assignment.focus === "defenders" ? rng.pick(["CB", "LB", "RB"])
        : assignment.focus === "midfielders" ? rng.pick(["CDM", "CM", "CAM"])
          : assignment.focus === "wingers" ? rng.pick(["LW", "RW"])
            : assignment.focus === "strikers" ? "ST" : rng.pick(POSITIONS);
    const age = rng.int(15, 18);
    const target = clamp(38 + scout.youth * 3 + rng.int(-5, 5), 30, 58);
    const potential = clamp(target + rng.int(8, 25) + scout.potential * 2, target + 5, 88);
    const nation = assignment.region ?? rng.pick(CATALOGUED_NATIONS);
    const name = randomNameFor(rng, nation);
    return {
      id: `youth-${club.id}-${assignment.id}-${index + 1}`,
      first: name.first, last: name.last, nationality: nation, age, position,
      attrs: generateAttributes(rng, position, target).attrs,
      overall: target, potential, potentialRange: estimate(potential, scout, assignment.progress, 12),
      confidence: Math.round(35 + scout.youth * 9 + assignment.progress * 35),
      assignmentId: assignment.id, status: "available", discovered: date,
    };
  });
}

export function processScoutingWeek(club, players, date, rng, { ai = false } = {}) {
  const state = ensureClubScouting(club);
  const events = [];
  for (const scout of state.scouts) {
    if (scout.contractRemaining > 0) scout.contractRemaining--;
  }
  const wage = state.scouts.reduce((sum, scout) => sum + Number(scout.wage ?? 0), 0);
  if (wage) events.push(recordClubTransaction(club, {
    id: `scout-wages-${club.id}-${date}`, date, category: "scouting", description: "Scout wages", expense: wage,
  }));
  for (const assignment of [...state.assignments]) {
    const scout = state.scouts.find((item) => item.id === assignment.scoutId);
    if (!scout) continue;
    assignment.progress = clamp((date - assignment.started) / Math.max(1, assignment.completes - assignment.started), 0, 1);
    scout.regionalKnowledge[assignment.region ?? "global"] = clamp((scout.regionalKnowledge[assignment.region ?? "global"] ?? 0) + 0.02, 0, 1);
    if (date < assignment.completes) continue;
    if (assignment.type === "youth") {
      const prospects = youthProspects(club, assignment, scout, rng, date);
      state.youthProspects.push(...prospects);
      events.push(`${prospects.length} youth prospects discovered.`);
    } else {
      const matches = players.filter((player) => player.clubId !== club.id && playerMatches(player, assignment)).slice(0, 8);
      for (const player of matches) {
        const report = reportFor(player, club, assignment, scout, date);
        const existing = state.reports.findIndex((item) => item.playerId === player.id);
        if (existing >= 0) state.reports[existing] = report;
        else state.reports.push(report);
      }
      events.push(matches.length ? `${matches.length} scouting reports completed.` : "Scout found no suitable players.");
    }
    state.completedAssignments.push({ ...assignment, progress: 1, completed: date });
    state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
    scout.assignmentId = null;
    scout.history.push({ assignmentId: assignment.id, completed: date });
    state.notifications.unshift({ id: `scout-complete-${assignment.id}`, type: "assignment", text: events.at(-1), date });
  }
  if (ai && !state.assignments.length && state.scouts.length && players.length) {
    const scout = state.scouts.find((item) => !item.assignmentId);
    if (scout && state.budget > 1200 && rng.chance(0.25)) {
      startScoutingAssignment(club, { scoutId: scout.id, type: "first-team", position: "ST", durationWeeks: 4, date, targetDate: date + 28 });
    }
  }
  return events.filter(Boolean);
}

export function shortlistPlayer(club, playerId) {
  const state = ensureClubScouting(club);
  if (!state.shortlist.includes(playerId)) state.shortlist.push(playerId);
  return state.shortlist;
}

export function removeFromShortlist(club, playerId) {
  const state = ensureClubScouting(club);
  state.shortlist = state.shortlist.filter((id) => id !== playerId);
  return state.shortlist;
}

export function scoutingSummary(club) {
  const state = ensureClubScouting(club);
  return {
    budget: state.budget,
    spent: state.spent,
    activeAssignments: state.assignments.length,
    reports: state.reports.length,
    prospects: state.youthProspects.filter((prospect) => prospect.status === "available").length,
    coverage: Object.keys(state.networkCoverage).length,
  };
}

export function searchScoutingPlayers(players, clubs, filters = {}) {
  const query = String(filters.query ?? "").toLowerCase();
  const minAge = filters.minAge == null ? 0 : Number(filters.minAge);
  const maxAge = filters.maxAge == null ? 99 : Number(filters.maxAge);
  const minOverall = filters.minOverall == null ? 0 : Number(filters.minOverall);
  const maxOverall = filters.maxOverall == null ? 99 : Number(filters.maxOverall);
  const minPotential = filters.minPotential == null ? 0 : Number(filters.minPotential);
  return players
    .filter((player) => player.clubId)
    .filter((player) => !query || `${player.first} ${player.last}`.toLowerCase().includes(query))
    .filter((player) => !filters.position || normalizePosition(player.position) === normalizePosition(filters.position))
    .filter((player) => player.age >= minAge && player.age <= maxAge)
    .filter((player) => player.overall >= minOverall && player.overall <= maxOverall)
    .filter((player) => (player.potential ?? player.overall) >= minPotential)
    .filter((player) => !filters.nationality || player.nationality === filters.nationality)
    .filter((player) => !filters.clubId || player.clubId === filters.clubId)
    .filter((player) => !filters.leagueId || clubs.find((club) => club.id === player.clubId)?.leagueId === filters.leagueId)
    .filter((player) => !filters.preferredFoot || player.preferredFoot === filters.preferredFoot)
    .filter((player) => !filters.loanOnly || player.loanListed)
    .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0));
}

export { REGIONS, FOCUSES };
