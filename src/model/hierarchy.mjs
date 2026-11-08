import { clamp } from "../core/util.mjs";
import { recordClubTransaction } from "../core/finance.mjs";

const REAL_MANAGERS = {
  Arsenal: ["Mikel Arteta", "ESP", "Possession", "Manager-led"],
  Liverpool: ["Arne Slot", "NED", "Possession", "Sporting director"],
  "Manchester City": ["Pep Guardiola", "ESP", "Possession", "Owner-led"],
  "Manchester United": ["Ruben Amorim", "POR", "High Press", "Results-driven"],
  Chelsea: ["Enzo Maresca", "ITA", "Possession", "Development-focused"],
  "Real Madrid": ["Xabi Alonso", "ESP", "Balanced", "Results-driven"],
  Barcelona: ["Hansi Flick", "GER", "High Press", "Development-focused"],
  "Atlético de Madrid": ["Diego Simeone", "ARG", "Defensive", "Results-driven"],
};

const OWNER_NAMES = [
  ["James Whitmore", "patient"],
  ["Elena Rossi", "ambitious"],
  ["Kwame Mensah", "development"],
  ["Nadia Petrov", "commercial"],
];
const STAFF_ROLES = [
  ["assistant-manager", "Assistant Manager"],
  ["attacking-coach", "Attacking Coach"],
  ["defensive-coach", "Defensive Coach"],
  ["goalkeeper-coach", "Goalkeeper Coach"],
  ["fitness-coach", "Fitness Coach"],
  ["youth-coach", "Youth Coach"],
  ["scout", "Chief Scout"],
];

function hash(value) {
  return String(value ?? "").split("").reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 17);
}

function pick(list, seed) {
  return list[hash(seed) % list.length];
}

function person(id, name, role, rating, salary) {
  const [first, ...rest] = name.split(" ");
  return {
    id,
    first,
    last: rest.join(" "),
    name,
    role,
    rating: clamp(Math.round(rating), 1, 99),
    experience: clamp(Math.round(rating * 0.75), 1, 99),
    salary: Math.max(1000, Math.round(salary)),
    contract: { start: 2025, end: 2027 },
    personality: "Professional",
    strengths: [],
    careerHistory: [],
  };
}

function realManagerFor(club) {
  const known = REAL_MANAGERS[club.name];
  if (!known) return null;
  return {
    name: known[0],
    nationality: known[1],
    style: known[2],
    governance: known[3],
  };
}

export function createClubHierarchy(club, seed = club.id) {
  const ownerSpec = pick(OWNER_NAMES, seed);
  const known = realManagerFor(club);
  const owner = person(`owner-${club.id}`, ownerSpec[0], "Owner", 55 + (hash(seed) % 35), 0);
  owner.personality = ownerSpec[1];
  owner.wealth = clamp(Math.round((club.prestige ?? 50) * 0.9), 10, 99);
  owner.ambition = clamp(Math.round((club.prestige ?? 50) + (hash(seed + "a") % 25) - 12), 10, 99);
  owner.patience = owner.personality === "patient" ? 82 : owner.personality === "results-driven" ? 35 : 60;
  owner.investment = clamp(Math.round((club.prestige ?? 50) + (hash(seed + "i") % 30) - 15), 10, 99);
  const board = [
    person(`chair-${club.id}`, pick(["Richard Cole", "Maria Santos", "David Okafor"], seed + "c"), "Chairperson", 60, 0),
    person(`sporting-${club.id}`, pick(["Thomas Berger", "Amina Diallo", "Jon Bell"], seed + "s"), "Sporting Director", 58, 9000),
    person(`finance-${club.id}`, pick(["Laura Chen", "Mateo Silva", "Grace Morgan"], seed + "f"), "Financial Director", 64, 8500),
  ];
  if ((club.prestige ?? 50) >= 55)
    board.push(person(`youth-${club.id}`, pick(["Nina Clarke", "Owen Hughes"], seed + "y"), "Youth Director", 55, 6000));
  const staff = STAFF_ROLES.map(([role, label], index) => {
    const names = ["Alex Morgan", "Priya Shah", "Marco Bianchi", "Samir Haddad", "Helen Wright", "Noah Evans", "Clara Novak"];
    const member = person(`${role}-${club.id}`, names[(hash(seed + role) + index) % names.length], role, 48 + (hash(seed + role) % 36), 3500 + (hash(seed + role + "w") % 7500));
    member.strengths = [role.replace("-coach", "")];
    return member;
  });
  const manager = known
    ? person(`manager-${club.id}`, known.name, "Manager", 70 + (hash(club.id) % 24), 0)
    : person(`manager-${club.id}`, club.manager?.name ?? "Head Coach", "Manager", club.manager?.rating ?? 60, 0);
  manager.nationality = known?.nationality ?? club.manager?.nationality ?? "ENG";
  manager.style = known?.style ?? club.manager?.style ?? "Balanced";
  manager.governance = known?.governance ?? "Manager-led";
  manager.tacticalKnowledge = manager.rating;
  manager.attacking = clamp(manager.rating + (hash(manager.id) % 12) - 6, 1, 99);
  manager.defensive = clamp(manager.rating + (hash(manager.id + "d") % 12) - 6, 1, 99);
  manager.manManagement = clamp(manager.rating + (hash(manager.id + "m") % 12) - 6, 1, 99);
  return {
    version: 1,
    owner,
    board,
    manager,
    staff,
    governance: known?.governance ?? ((club.prestige ?? 50) >= 75 ? "Results-driven" : "Development-focused"),
    objectives: [
      { id: `league-${club.id}`, category: "league", label: (club.prestige ?? 50) >= 80 ? "Challenge for the title" : "Finish above the board target", status: "active" },
      { id: `finance-${club.id}`, category: "finance", label: "Keep the wage bill sustainable", status: "active" },
      { id: `youth-${club.id}`, category: "youth", label: "Develop one young player", status: "active" },
    ],
    relationships: { managerOwner: 60, managerBoard: 60, dressingRoom: 60 },
    inbox: [],
    employment: { status: "active", started: 2025, contractEnd: 2027, salary: 0 },
    processedEvents: [],
  };
}

export function ensureClubHierarchy(club, seed = club.id) {
  if (!club.hierarchy) club.hierarchy = createClubHierarchy(club, seed);
  const defaults = createClubHierarchy(club, seed);
  club.hierarchy = {
    ...defaults,
    ...club.hierarchy,
    owner: { ...defaults.owner, ...(club.hierarchy.owner ?? {}) },
    board: Array.isArray(club.hierarchy.board) && club.hierarchy.board.length ? club.hierarchy.board : defaults.board,
    staff: Array.isArray(club.hierarchy.staff) && club.hierarchy.staff.length ? club.hierarchy.staff : defaults.staff,
    relationships: { ...defaults.relationships, ...(club.hierarchy.relationships ?? {}) },
    objectives: Array.isArray(club.hierarchy.objectives) ? club.hierarchy.objectives : defaults.objectives,
    inbox: Array.isArray(club.hierarchy.inbox) ? club.hierarchy.inbox : [],
  };
  return club.hierarchy;
}

export function hierarchyTrainingModifier(club, area = "general") {
  const staff = club.hierarchy?.staff ?? [];
  const relevant = staff.filter((member) => member.role.includes(area) || member.role === "assistant-manager");
  return 1 + Math.min(0.18, relevant.reduce((sum, member) => sum + (member.rating ?? 50), 0) / 1000);
}

export function processWeeklyHierarchy(club, date) {
  const hierarchy = ensureClubHierarchy(club);
  const salary = (hierarchy.staff ?? []).reduce((sum, member) => sum + (member.salary ?? 0), 0);
  if (salary) recordClubTransaction(club, {
    id: `staff-wages-${club.id}-${date}`,
    date,
    category: "staff wages",
    description: "Coaching and recruitment staff wages",
    expense: Math.round(salary / 52),
  });
  return hierarchy;
}

export function createOwnerRequest(club, position = null) {
  const hierarchy = ensureClubHierarchy(club);
  const finance = club.finances ?? {};
  const highWages = (finance.wageBudget ?? 0) > (finance.annualOperatingBudget ?? 1) * 0.65;
  const request = highWages
    ? { type: "reduce-wages", label: "Reduce the wage bill", detail: "The board wants a sustainable wage-to-revenue ratio." }
    : position && position > 8
      ? { type: "improve-results", label: "Improve league results", detail: `The club is currently ${position}th and needs a stronger run.` }
      : { type: "develop-youth", label: "Promote academy development", detail: "Give a young player a meaningful first-team pathway." };
  const item = { id: `request-${club.id}-${hierarchy.inbox.length + 1}`, date: Date.now(), ...request, status: "open", responses: ["accept", "negotiate", "explain"] };
  hierarchy.inbox.unshift(item);
  hierarchy.inbox = hierarchy.inbox.slice(0, 20);
  return item;
}

export function respondToOwnerRequest(club, requestId, response) {
  const hierarchy = ensureClubHierarchy(club);
  const request = hierarchy.inbox.find((item) => item.id === requestId && item.status === "open");
  if (!request || !request.responses.includes(response)) return false;
  request.status = response;
  const delta = response === "accept" ? 4 : response === "negotiate" ? 1 : -3;
  hierarchy.relationships.managerOwner = clamp((hierarchy.relationships.managerOwner ?? 60) + delta, 0, 100);
  hierarchy.relationships.managerBoard = clamp((hierarchy.relationships.managerBoard ?? 60) + delta, 0, 100);
  return true;
}

export function dismissClubManager(club, reason, date) {
  const hierarchy = ensureClubHierarchy(club);
  if (hierarchy.employment.status !== "active") return false;
  hierarchy.employment.status = "dismissed";
  hierarchy.employment.ended = date;
  hierarchy.employment.reason = reason;
  hierarchy.manager.careerHistory.push({ clubId: club.id, result: "dismissed", date, reason });
  hierarchy.inbox.unshift({ id: `dismissal-${club.id}-${date}`, type: "manager-dismissed", date, detail: reason, status: "resolved" });
  return true;
}

export function appointManager(club, candidate, date) {
  const hierarchy = ensureClubHierarchy(club);
  hierarchy.manager = { ...candidate, id: candidate.id ?? `manager-${club.id}-${date}`, role: "Manager", careerHistory: candidate.careerHistory ?? [] };
  hierarchy.employment = { status: "active", started: date, contractEnd: date + 2, salary: candidate.salary ?? 0 };
  hierarchy.inbox.unshift({ id: `appointment-${club.id}-${date}`, type: "manager-appointed", date, detail: `${hierarchy.manager.name} appointed`, status: "resolved" });
  return hierarchy.manager;
}
