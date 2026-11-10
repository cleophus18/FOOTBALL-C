import {
  GK_ATTRIBUTES,
  SUB_ATTRIBUTES,
  SUB_ATTRIBUTE_GROUP,
  normalizePosition,
} from "./constants.mjs";
import { clamp } from "./util.mjs";
import { recordClubTransaction, ensureClubFinance } from "./finance.mjs";
import {
  calculateOverall,
  createPlayer,
  generateAttributes,
  syncGroupsFromSubAttrs,
  updatePlayerOverall,
  POSITION_ATTRIBUTE_WEIGHTS,
} from "../model/player.mjs";
import { Rng } from "./rng.mjs";

export const TRAINING_DEPARTMENTS = {
  attacking: ["finishing", "shotPower", "longShots", "attackingPositioning", "volleys"],
  midfield: ["shortPassing", "longPassing", "vision", "ballControl", "composure"],
  defensive: ["defensiveAwareness", "interceptions", "standingTackle", "slidingTackle", "headingAccuracy"],
  physical: ["acceleration", "sprintSpeed", "strength", "stamina", "jumping"],
  goalkeeper: ["reflexes", "handling", "positioning", "diving", "kicking"],
  youth: [],
};

export const TRAINING_PROGRAMMES = [
  "Balanced development",
  "Attacking development",
  "Defensive development",
  "Physical development",
  "Technical development",
  "Position-specific development",
  "Goalkeeper development",
  "Recovery-focused training",
];

export const TRAINING_INTENSITIES = ["Light", "Normal", "Intense"];

const DEPARTMENT_GROUPS = {
  attacking: ["shooting"],
  midfield: ["passing", "dribbling"],
  defensive: ["defending"],
  physical: ["pace", "physical"],
  goalkeeper: [],
  youth: [],
};
const PROGRAMME_DEPARTMENTS = {
  "Attacking development": ["attacking"],
  "Defensive development": ["defensive"],
  "Physical development": ["physical"],
  "Technical development": ["midfield"],
  "Goalkeeper development": ["goalkeeper"],
};
const GRADE_BANDS = [
  ["F", 1, 39, 350],
  ["E", 40, 49, 1_500],
  ["D", 50, 59, 4_000],
  ["C", 60, 69, 9_000],
  ["B", 70, 79, 22_000],
  ["A", 80, 89, 55_000],
  ["S", 90, 99, 125_000],
];
const FIRST_NAMES = [
  "Mateo", "Ibrahim", "Daniel", "Rafael", "Luca", "Noah", "Thiago",
  "Owen", "Milan", "Andreas", "Jules", "Samir", "Nico", "Santiago",
];
const LAST_NAMES = [
  "Silva", "Kovac", "Moretti", "Okafor", "Berg", "Navarro", "Costa",
  "Mensah", "Varga", "Rossi", "Clark", "Diallo", "Haddad", "Muller",
];
const NATIONALITIES = ["ENG", "ESP", "FRA", "GER", "ITA", "NED", "BRA", "GHA", "USA", "JPN"];
const ATTRIBUTE_LABELS = {
  "Balanced development": ["attacking", "midfield", "defensive", "physical"],
  "Attacking development": ["attacking"],
  "Defensive development": ["defensive"],
  "Physical development": ["physical"],
  "Technical development": ["midfield", "attacking"],
  "Position-specific development": [],
  "Goalkeeper development": ["goalkeeper"],
  "Recovery-focused training": ["physical"],
};

export function trainingGradeFor(overall) {
  const rating = clamp(Math.round(Number(overall) || 1), 1, 99);
  return GRADE_BANDS.find(([, minimum, maximum]) => rating >= minimum && rating <= maximum)?.[0] ?? "F";
}

export function trainingCoachSalary(overall) {
  const rating = clamp(Math.round(Number(overall) || 1), 1, 99);
  const [, minimum, maximum, base] =
    GRADE_BANDS.find(([, low, high]) => rating >= low && rating <= high) ?? GRADE_BANDS[0];
  return Math.round(base * (0.8 + 0.4 * (rating - minimum) / Math.max(1, maximum - minimum)));
}

function randomSource(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return (maximum) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % maximum;
  };
}

export function generateTrainingCoachMarket(seed = 1, season = 2026, count = 18) {
  const random = randomSource(seed);
  const departments = Object.keys(TRAINING_DEPARTMENTS);
  return Array.from({ length: count }, (_, index) => {
    const overall = 1 + random(99);
    const department = departments[random(departments.length)];
    const specialistAbility = clamp(overall + 8 + random(15), 1, 99);
    const technical = clamp(overall + random(17) - 8, 1, 99);
    const physical = clamp(overall + random(17) - 8, 1, 99);
    const tactical = clamp(overall + random(17) - 8, 1, 99);
    const youth = clamp(overall + random(17) - 8, 1, 99);
    const salary = trainingCoachSalary(overall);
    const coach = {
      id: `training-coach-${season}-${seed}-${index + 1}`,
      name: `${FIRST_NAMES[random(FIRST_NAMES.length)]} ${LAST_NAMES[random(LAST_NAMES.length)]}`,
      age: 27 + random(36),
      nationality: NATIONALITIES[random(NATIONALITIES.length)],
      overall,
      grade: trainingGradeFor(overall),
      department,
      specialisation: department,
      technicalAbility: department === "attacking" || department === "midfield" ? specialistAbility : technical,
      physicalAbility: department === "physical" ? specialistAbility : physical,
      tacticalAbility: department === "defensive" || department === "goalkeeper" ? specialistAbility : tactical,
      youthAbility: department === "youth" ? specialistAbility : youth,
      experience: 1,
      reputation: clamp(Math.round(overall * 0.82 + random(18)), 1, 99),
      weeklySalary: salary,
      recruitmentCost: salary * (20 + random(21)),
      contractWeeks: 52,
    };
    coach.experience = Math.max(1, coach.age - 23);
    return coach;
  });
}

function seededDepartmentCoach(seed, season, department, index, prestige) {
  const random = randomSource(`${seed}-${season}-${department}-${index}`.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7));
  const overall = clamp(Math.round(prestige * 0.62 + 20 + random(21)), 20, 92);
  const salary = trainingCoachSalary(overall);
  const coach = {
    id: `staff-${department}-${seed}-${index}`,
    name: `${FIRST_NAMES[random(FIRST_NAMES.length)]} ${LAST_NAMES[random(LAST_NAMES.length)]}`,
    age: 31 + random(26),
    nationality: NATIONALITIES[random(NATIONALITIES.length)],
    overall,
    grade: trainingGradeFor(overall),
    department,
    specialisation: department,
    technicalAbility: clamp(overall + random(17) - 8, 1, 99),
    physicalAbility: clamp(overall + random(17) - 8, 1, 99),
    tacticalAbility: clamp(overall + random(17) - 8, 1, 99),
    youthAbility: clamp(overall + random(17) - 8, 1, 99),
    experience: Math.max(1, 31 + random(26) - 24),
    reputation: clamp(Math.round(overall * 0.8), 1, 99),
    weeklySalary: salary,
    recruitmentCost: salary * 30,
    contractWeeks: 52,
  };
  const specialist = clamp(overall + 8 + random(12), 1, 99);
  if (department === "physical") coach.physicalAbility = specialist;
  else if (department === "youth") coach.youthAbility = specialist;
  else if (department === "defensive" || department === "goalkeeper") coach.tacticalAbility = specialist;
  else coach.technicalAbility = specialist;
  return coach;
}

export function ensureClubTraining(club, seed = 1, season = 2026) {
  const state = club.training ?? {};
  club.training = {
    ...state,
    coaches: Array.isArray(state.coaches) ? state.coaches : [],
    assignments: { ...(state.assignments ?? {}) },
    programme: TRAINING_PROGRAMMES.includes(state.programme) ? state.programme : "Balanced development",
    intensity: TRAINING_INTENSITIES.includes(state.intensity) ? state.intensity : "Normal",
    playerPlans: { ...(state.playerPlans ?? {}) },
    reports: Array.isArray(state.reports) ? state.reports : [],
    notifications: Array.isArray(state.notifications) ? state.notifications : [],
    market: Array.isArray(state.market) ? state.market : [],
    season: Number(state.season ?? season),
    weeksProcessed: Array.isArray(state.weeksProcessed) ? state.weeksProcessed : [],
  };
  const training = club.training;
  if (training.season !== season) {
    training.season = season;
    training.weeksProcessed = [];
    training.market = generateTrainingCoachMarket(`${seed}-${season}-${club.id}`.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7), season);
  }
  training.market = training.market.map((coach) => ({ ...coach, overall: clamp(Math.round(Number(coach.overall ?? coach.rating ?? 50)), 1, 99), grade: trainingGradeFor(coach.overall ?? coach.rating ?? 50) }));
  if (!training.coaches.length && !training.initialized) {
    const prestige = clamp(Number(club.prestige ?? 50), 1, 100);
    const primary = prestige >= 65 ? "midfield" : "physical";
    const secondary = prestige >= 72 ? "youth" : (primary === "physical" ? "defensive" : "physical");
    for (const [index, department] of [primary, secondary].entries()) {
      const coach = seededDepartmentCoach(`${seed}-${club.id}`, season, department, index, prestige);
      training.coaches.push(coach);
      training.assignments[department] = coach.id;
    }
    training.initialized = true;
  }
  for (const coach of training.coaches) {
    coach.overall = clamp(Math.round(Number(coach.overall ?? coach.rating ?? 50)), 1, 99);
    coach.grade = trainingGradeFor(coach.overall);
    coach.weeklySalary = Math.max(0, Math.round(coach.weeklySalary ?? trainingCoachSalary(coach.overall)));
    coach.recruitmentCost = Math.max(0, Math.round(coach.recruitmentCost ?? coach.weeklySalary * 30));
    coach.department = Object.hasOwn(TRAINING_DEPARTMENTS, coach.department) ? coach.department : "midfield";
    coach.specialisation = coach.department;
  }
  if (!training.market.length) {
    const marketSeed = `${seed}-${season}-${club.id}`.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
    training.market = generateTrainingCoachMarket(marketSeed, season);
  }
  return training;
}

export function hireTrainingCoach(club, coachId, date, seed, season) {
  const training = ensureClubTraining(club, seed, season);
  const index = training.market.findIndex((coach) => coach.id === coachId);
  if (index < 0) throw new Error("That training coach is no longer available.");
  const coach = training.market[index];
  const finance = ensureClubFinance(club);
  if (finance.balance < coach.recruitmentCost)
    throw new Error("The club cannot afford this coach's recruitment fee.");
  recordClubTransaction(club, {
    id: `training-coach-hire-${club.id}-${coach.id}`,
    date,
    category: "training staff",
    description: `Recruitment fee: ${coach.name}`,
    expense: coach.recruitmentCost,
  });
  training.market.splice(index, 1);
  training.coaches.push({ ...coach });
  if (!training.assignments[coach.department]) training.assignments[coach.department] = coach.id;
  return coach;
}

export function dismissTrainingCoach(club, coachId, seed, season) {
  const training = ensureClubTraining(club, seed, season);
  const index = training.coaches.findIndex((coach) => coach.id === coachId);
  if (index < 0) throw new Error("Training coach not found.");
  const [coach] = training.coaches.splice(index, 1);
  for (const [department, assignedId] of Object.entries(training.assignments))
    if (assignedId === coachId) delete training.assignments[department];
  return coach;
}

export function assignTrainingCoach(club, department, coachId, seed, season) {
  const training = ensureClubTraining(club, seed, season);
  if (!Object.hasOwn(TRAINING_DEPARTMENTS, department))
    throw new Error("Unknown training department.");
  const coach = training.coaches.find((entry) => entry.id === coachId);
  if (!coach) throw new Error("That coach is not employed by this club.");
  training.assignments[department] = coachId;
  return coach;
}

export function setClubTrainingPlan(club, { programme, intensity, playerId, focus }, seed, season) {
  const training = ensureClubTraining(club, seed, season);
  if (programme != null) {
    if (!TRAINING_PROGRAMMES.includes(programme)) throw new Error("Unknown training programme.");
    training.programme = programme;
  }
  if (intensity != null) {
    if (!TRAINING_INTENSITIES.includes(intensity)) throw new Error("Unknown training intensity.");
    training.intensity = intensity;
  }
  if (playerId) {
    training.playerPlans[playerId] = {
      ...(training.playerPlans[playerId] ?? {}),
      ...(programme ? { programme } : {}),
      ...(focus ? { focus } : {}),
      ...(intensity ? { intensity } : {}),
    };
  }
  return training;
}

function coachForDepartment(club, training, department) {
  const coach = training.coaches.find((entry) => entry.id === training.assignments[department]);
  return coach ?? training.coaches.find((entry) => entry.department === department) ?? null;
}

export function createWorldTrainingClub(clubId, prestige = 55) {
  const balance = Math.max(500_000, prestige * 500_000);
  return {
    id: clubId,
    name: clubId,
    prestige,
    finances: { balance, transferBudget: Math.round(balance * 0.25), wageBudget: prestige * 20_000, investmentBudget: Math.round(balance * 0.1), ledger: [], processedEvents: [], expenses: {}, revenue: {} },
    investment: { facilities: { trainingGround: prestige >= 78 ? 3 : prestige >= 65 ? 2 : 1, youthAcademy: prestige >= 78 ? 3 : prestige >= 65 ? 2 : 1 } },
  };
}

function specialistAbilityFor(coach, department) {
  if (!coach) return 0;
  if (department === "physical") return Number(coach.physicalAbility ?? coach.overall);
  if (department === "youth") return Number(coach.youthAbility ?? coach.overall);
  if (department === "goalkeeper") return Number(coach.technicalAbility ?? coach.overall);
  if (department === "defensive") return Number(coach.tacticalAbility ?? coach.technicalAbility ?? coach.overall);
  return Number(coach.technicalAbility ?? coach.overall);
}

/** AI clubs recruit a stronger coach only when cash and wage capacity are sustainable. */
export function manageAITrainingStaff(club, date, seed = 1, season = 2026) {
  const training = ensureClubTraining(club, seed, season);
  const recruitmentEvent = `${season}-${date}`;
  if (training.lastRecruitmentEvent === recruitmentEvent) return training;
  if (!training.lastRecruitmentDate || date - training.lastRecruitmentDate >= 84) {
    const finance = ensureClubFinance(club);
    const stableClubSeed = String(club.id).split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
    if (finance.balance > Math.max(250_000, (club.prestige ?? 50) * 30_000)) {
      const candidate = generateTrainingCoachMarket((Number(seed) + Number(date) + stableClubSeed) >>> 0, season, 1)[0];
      const incumbent = training.coaches.find((coach) => coach.department === candidate.department);
      const canAfford = finance.balance > candidate.recruitmentCost + candidate.weeklySalary * 104;
      const wageRoom = candidate.weeklySalary <= Math.max(15_000, (club.prestige ?? 50) * 1_500);
      if (canAfford && wageRoom && (!incumbent || candidate.overall > incumbent.overall + 7)) {
        if (incumbent) {
          training.coaches = training.coaches.filter((coach) => coach.id !== incumbent.id);
          for (const [department, coachId] of Object.entries(training.assignments)) if (coachId === incumbent.id) delete training.assignments[department];
        }
        training.market.push(candidate);
        hireTrainingCoach(club, candidate.id, date, seed, season);
      }
    }
    training.lastRecruitmentDate = date;
    training.lastRecruitmentEvent = recruitmentEvent;
  }
  return training;
}

export function processClubTrainingWeek(club, players, date, seed, season, { ai = false } = {}) {
  const training = ensureClubTraining(club, seed, season);
  const eventId = `${season}-${date}`;
  if (training.weeksProcessed.includes(eventId)) return { coaches: training.coaches.length, wage: 0, duplicate: true };
  training.weeksProcessed.push(eventId);
  training.weeksProcessed = training.weeksProcessed.slice(-80);
  const coaches = training.coaches;
  const salary = coaches.reduce((total, coach) => total + coach.weeklySalary, 0);
  if (salary) recordClubTransaction(club, {
    id: `training-staff-wages-${club.id}-${date}`,
    date,
    category: "training staff",
    description: "Training coach wages",
    expense: salary,
  });
  const intensityLoad = training.intensity === "Intense" ? 1.8 : training.intensity === "Light" ? 0.55 : 1;
  for (const player of players) {
    if (player.clubId !== club.id || player.isLegend) continue;
    const plan = training.playerPlans[player.id] ?? {};
    const intensity = plan.intensity ?? training.intensity;
    const load = intensity === "Intense" ? 1.8 : intensity === "Light" ? 0.55 : intensityLoad;
    player.trainingAttendance ??= 0;
    player.trainingLoad ??= 0;
    if (!player.injury && (player.fitness ?? 100) >= 20) {
      player.trainingAttendance = Math.min(40, player.trainingAttendance + 1);
      player.trainingLoad += load;
      player.fatigue = clamp((player.fatigue ?? 0) + load * 0.55, 0, 100);
    }
    if (ai && player.age >= 31 && player.fatigue > 55) training.intensity = "Light";
  }
  for (const coach of coaches) coach.contractWeeks = Math.max(0, (coach.contractWeeks ?? 52) - 1);
  if (!ai && date % 7 === 0) training.lastWeeklyDate = date;
  return { coaches: coaches.length, wage: salary };
}

function attributeForDevelopment(player, training, rng, decline = false) {
  const plan = training.playerPlans[player.id] ?? {};
  const programme = plan.programme ?? training.programme;
  let departments = ATTRIBUTE_LABELS[programme] ?? ATTRIBUTE_LABELS["Balanced development"];
  if (programme === "Position-specific development") {
    departments = player.position === "GK"
      ? ["goalkeeper"]
      : player.position === "ST" || player.position === "LW" || player.position === "RW"
        ? ["attacking", "physical"]
        : player.position === "CB" || player.position === "LB" || player.position === "RB"
          ? ["defensive", "physical"]
          : ["midfield", "defensive"];
  }
  if (player.position === "GK" && programme !== "Goalkeeper development") departments = ["goalkeeper"];
  if (programme === "Recovery-focused training") departments = ["physical"];
  const map = player.position === "GK"
    ? { goalkeeper: GK_ATTRIBUTES }
    : Object.fromEntries(Object.entries(SUB_ATTRIBUTES).flatMap(([group, attributes]) => attributes.map((attribute) => [attribute, attribute])));
  let candidates = departments.flatMap((department) => {
    if (department === "goalkeeper") return player.position === "GK" ? GK_ATTRIBUTES : [];
    const names = TRAINING_DEPARTMENTS[department] ?? [];
    return names.filter((attribute) => player.position !== "GK" && map[attribute]);
  });
  if (!candidates.length) candidates = player.position === "GK" ? GK_ATTRIBUTES : Object.values(SUB_ATTRIBUTES).flat();
  if (decline && Number(player.age) >= 30 && rng.chance(0.7)) {
    const physical = player.position === "GK" ? ["reflexes", "kicking", "positioning"] : [
      ...SUB_ATTRIBUTES.pace,
      ...SUB_ATTRIBUTES.physical,
    ];
    const filtered = candidates.filter((attribute) => physical.includes(attribute));
    if (filtered.length) candidates = filtered;
  }
  const focus = plan.focus ?? player.trainingFocus;
  const validAttributes = player.position === "GK" ? GK_ATTRIBUTES : Object.values(SUB_ATTRIBUTES).flat();
  if (focus && validAttributes.includes(focus) && !candidates.includes(focus)) candidates.push(focus);
  return rng.weightedPick(candidates, (attribute) => {
    const values = player.position === "GK" ? player.gkAttrs : player.subAttrs;
    const weakness = 105 - Number(values?.[attribute] ?? 50);
    const department = departments.find((name) => (TRAINING_DEPARTMENTS[name] ?? []).includes(attribute)) ?? Object.entries(TRAINING_DEPARTMENTS).find(([, attributes]) => attributes.includes(attribute))?.[0];
    const coach = department ? coachForDepartment(null, training, department) : null;
    const ability = specialistAbilityFor(coach, department);
    const focusBoost = attribute === focus ? 3.5 : 1;
    return Math.max(1, weakness * (coach ? 1 + (ability - 50) * 0.018 : 1) * focusBoost);
  });
}

function changeAttribute(player, attribute, direction, potential) {
  const keeper = player.position === "GK";
  const values = keeper ? player.gkAttrs : player.subAttrs;
  if (!values || values[attribute] == null) return false;
  const oldValue = values[attribute];
  const group = keeper ? null : SUB_ATTRIBUTE_GROUP[attribute];
  const oldGroup = group ? player.attrs?.[group] : null;
  values[attribute] = clamp(oldValue + direction, 1, 99);
  if (values[attribute] === oldValue) return false;
  // A detailed attribute rarely moves the rounded OVR on its own, so a growth season
  // lifts the rest of that attribute's group too. The group then visibly moves, and the
  // position-weighted OVR follows it. Decline is a single sharp loss instead: an older
  // player loses one point at a time, in the attributes most exposed to ageing.
  if (!keeper && group && direction > 0) {
    for (const sibling of SUB_ATTRIBUTES[group] ?? []) {
      if (sibling === attribute) continue;
      values[sibling] = clamp((values[sibling] ?? 50) + 1, 1, 99);
    }
  }
  if (!keeper) syncGroupsFromSubAttrs(player, [group]);
  if (direction > 0 && calculateOverall(player) > potential && Number(player.age) < 34) {
    values[attribute] = oldValue;
    if (!keeper) {
      player.attrs[group] = oldGroup;
      syncGroupsFromSubAttrs(player, [group]);
    }
    return false;
  }
  return true;
}

export function developmentTrajectory(player) {
  const history = (player.ratingHistory ?? []).slice(-6);
  const total = history.reduce((sum, entry) => sum + Number(entry.change ?? 0), 0);
  if (total >= 3) return "Rapid Development";
  if (total >= 1) return "Developing";
  if (total <= -2) return "Declining";
  if ((player.developmentProgress ?? 0) <= -0.5) return "Stagnating";
  return "Stable";
}

export function developPlayer(player, club, rng, season, { appearances, minutes, ratingSum, date } = {}) {
  if (!player || player.isLegend || player.lastDevelopmentSeason === season) return null;
  // Age comes from the player's birthday when the date is known, so the age curve
  // reflects the season being reviewed rather than a stale cached number.
  const age = Number.isFinite(Number(date)) && Number.isFinite(Number(player.dob))
    ? Math.max(15, Math.floor((Number(date) - Number(player.dob)) / 365.25))
    : Number(player.age ?? 25);
  player.age = age;
  const training = ensureClubTraining(club, rng.seed ?? 1, season);
  const previousRating = Number.isFinite(player.overall) ? player.overall : calculateOverall(player);
  const weeklySessions = Math.max(0, Math.floor(Number(player.trainingAttendance ?? 0)));
  const current = calculateOverall(player);
  // Potential only limits growth, never decline: a player past his ceiling who declines
  // must be able to fall back below the rating he happened to hold.
  const potential = Math.max(current, clamp(Number(player.potential ?? current), 1, 99));
  const ceiling = potential;
  const apps = Math.max(0, Number(appearances ?? player.stats?.apps ?? player.apps ?? 0));
  const playedMinutes = Math.max(0, Number(minutes ?? player.stats?.minutes ?? 0));
  const avgRating = apps
    ? Number(ratingSum ?? player.stats?.ratingSum ?? player.ratingSum ?? 0) / apps
    : 6.1;
  // Development propensity, not a rating: it follows the design's age bands (15-19
  // high, 20-23 strong, 24-27 gradual, 28-30 peak, 31-33 decline, 34+ decline). It
  // only causes growth when the player has played and rated above par.
  const ageRate = age <= 19 ? 1.1 : age <= 23 ? 0.85 : age <= 27 ? 0.5 : age <= 30 ? 0.25 : age <= 33 ? 0 : -0.4;
  const gap = Math.max(0, potential - current);
  const playingTime = clamp(Math.max(apps / 24, playedMinutes / 1800), 0, 1);
  const performance = clamp(avgRating - 6.2, -3.2, 2.8);
  const morale = clamp(Number(player.morale ?? player.confidence ?? 60) / 100, 0.35, 1);
  const fitness = clamp(Number(player.fitness ?? 100) / 100, 0.2, 1);
  const attendance = player.academyTraining ? 1 : clamp(weeklySessions / 20, 0, 1);
  const intensityChoice = training.playerPlans[player.id]?.intensity ?? training.intensity;
  const intensity = intensityChoice === "Intense" ? 1.08 : intensityChoice === "Light" ? 0.86 : 1;
  const facilities = 1 + (Number(club.investment?.facilities?.trainingGround ?? 1) - 1) * 0.04;
  const youthFacilities = 1 + (Number(club.investment?.facilities?.youthAcademy ?? 1) - 1) * 0.04;
  const programme = training.playerPlans[player.id]?.programme ?? training.programme;
  const departments = ATTRIBUTE_LABELS[programme] ?? [];
  const focus = training.playerPlans[player.id]?.focus ?? player.trainingFocus;
  const focusDepartment = Object.entries(TRAINING_DEPARTMENTS).find(([, attributes]) => attributes.includes(focus))?.[0];
  const specialists = [...new Set([...departments, ...(focusDepartment ? [focusDepartment] : [])])].map((department) => ({ department, coach: coachForDepartment(club, training, department) })).filter(({ coach }) => coach);
  const relevantCoach = specialists.length
    ? Math.max(...specialists.map(({ coach, department }) => specialistAbilityFor(coach, department)))
    : Math.max(0, ...training.coaches.map((coach) => coach.overall));
  const youthCoach = coachForDepartment(club, training, "youth");
  const youthBoost = age <= 21 ? (specialistAbilityFor(youthCoach, "youth") - 50) * 0.0012 : 0;
  const specialtyBoost = specialists.length
    ? specialists.reduce((sum, { coach, department }) => sum + Math.max(0, specialistAbilityFor(coach, department) - coach.overall), 0) / specialists.length * 0.002
    : 0;
  const coachFactor = clamp(0.88 + relevantCoach * 0.0022 + youthBoost + specialtyBoost, 0.88, 1.22);
  const personality = Array.isArray(player.personality) ? player.personality.join(" ") : String(player.personality ?? "");
  const professionalism = /professional|determined|ambitious/i.test(personality) ? 0.12 : /lazy|unprofessional/i.test(personality) ? -0.2 : 0;
  const contribution = Math.min(0.5, Math.max(0, Number(player.stats?.goals ?? 0) + Number(player.stats?.assists ?? 0)) / 100);
  const trajectory = clamp((Number(player.potentialTrajectory ?? 0) / 100) * (age <= 23 ? 0.12 : age <= 27 ? 0.04 : 0), 0, 0.12);
  void trajectory;
  const environment = clamp(((Number(club.prestige ?? 50) - 55) * 0.002), -0.08, 0.08);
  const boyhoodBoost = age <= 21 && specialistAbilityFor(youthCoach, "youth") >= 60 ? 0.4 : 0;
  let developmentScore = ageRate + performance * 1.5 + playingTime * 0.9 + Math.min(1.2, gap * 0.035) + contribution + professionalism + environment + trajectory;
  developmentScore *= coachFactor * facilities * intensity * morale * fitness * (attendance <= 0 ? 0.55 : 0.72 + attendance * 0.28);
  developmentScore *= age <= 21 ? youthFacilities : facilities;
  if (player.injury) developmentScore *= 0.65;
  developmentScore *= Number(player.developmentRate ?? 1);
  developmentScore += rng.normal(0, 0.15);
  const progressBefore = Number(player.developmentProgress ?? 0);
  player.developmentProgress = progressBefore + developmentScore;
  const beforeAttributes = { ...(player.subAttrs ?? {}), ...(player.gkAttrs ?? {}) };
  // Seasonal growth is measured in OVR points, and is driven by what the player actually
  // did: match rating, minutes, how close he is to his ceiling, his age, his personality
  // and the quality of his coaches and facilities. A young high-potential player with a
  // standout season can gain up to 7; a bench player or a veteran gains 1, or declines.
  // Development stays gradual because the engine walks attribute points one at a time
  // until the player reaches that season's OVR target.
  // Only above-par performance develops a player. Below-bar ratings and empty minutes
  // therefore contribute nothing here; they express themselves through the decline path.
  const ratingEdge = Math.max(0, avgRating - 6.45) * 4.2;
  const minutesEdge = playingTime * 3.2;
  const headroom = Math.min(1, gap / 10);
  let growthScore =
    ratingEdge +
    minutesEdge +
    headroom * 2 +
    (age <= 19 ? 1.3 : age <= 23 ? 1 : age <= 27 ? 0.5 : age <= 30 ? 0.2 : 0) +
    professionalism +
    boyhoodBoost -
    (age > 28 ? (age - 28) * 0.55 : 0);
  growthScore *= coachFactor * facilities * intensity * morale * fitness;
  growthScore *= attendance <= 0 ? 0.5 : 0.7 + attendance * 0.3;
  // Round only at the end, so a borderline season lands on 1 or 2 rather than 0.
  const rawGrowth = Math.max(0, growthScore);
  const growthOpportunity =
    playingTime > 0.12 &&
    avgRating >= 6.35 &&
    !player.injury &&
    (attendance > 0 || age <= 19 || player.academyTraining);
  const targetGrowth = growthOpportunity
    ? clamp(Math.floor(rawGrowth + 0.5), 1, 7)
    : 0;
  const maxGrowth = targetGrowth;
  let changes = 0;
  // A season rated above par never triggers decline, even when the growth gate itself
  // closes (for example a prime player with no headroom left).
  const abovePar = playingTime > 0 && avgRating >= 6.6;
  if (maxGrowth > 0 && current < ceiling) {
    const targetOverall = Math.min(ceiling, current + maxGrowth);
    let attempts = 0;
    // Group totals move too slowly for the rounded OVR to follow within a season, so a
    // growth step also lifts the attribute that position weights most heavily. Without
    // this a season of solid progress could leave the displayed OVR unchanged.
    const keyAttributes = Object.entries(
      POSITION_ATTRIBUTE_WEIGHTS[normalizePosition(player.position)] ?? {},
    )
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
    const progress = () => {
      const attribute = attributeForDevelopment(player, training, rng);
      const group = SUB_ATTRIBUTE_GROUP[attribute];
      const key = keyAttributes.find(
        (candidate) => SUB_ATTRIBUTE_GROUP[candidate] === group,
      );
      if (!changeAttribute(player, key ?? attribute, 1, targetOverall)) return false;
      return true;
    };
    while (calculateOverall(player) < targetOverall && changes < 96 && attempts++ < 48) {
      if (!progress()) break;
      changes++;
    }
  } else {
    // Decline: a player who never featured, one whose season rating fell below par, or
    // one chronologically past his peak. Decline is capped, so a strong veteran loses
    // roughly a point while an exceptional one can hold his rating altogether.
    const belowPar = playingTime > 0 && avgRating < 6.4;
    const ageing = age >= 29;
    const unused = playingTime === 0 && age >= 24;
    if (!abovePar && (belowPar || ageing || unused) && current > 1) {
      // Ageing alone is a gentle point for most players and two past 33; a genuinely
      // poor season costs a point at any age.
      const maxDecline = age >= 33 ? 2 : 1;
      const severity = belowPar
        ? Math.max(0.75, (6.4 - avgRating) * 3.2)
        : ageing
          ? 0.75 + (age - 33) * 0.9
          : 0.9;
      const targetDecline = Math.min(
        maxDecline,
        Math.max(1, Math.floor(severity)),
      );
      const targetOverall = Math.max(1, current - targetDecline);
      let attempts = 0;
      while (
        calculateOverall(player) > targetOverall &&
        changes > -96 &&
        attempts++ < 32
      ) {
        const attribute = attributeForDevelopment(player, training, rng, true);
        if (!changeAttribute(player, attribute, -1, Infinity)) break;
        changes--;
      }
    }
  }
  const calculatedAfter = calculateOverall(player);
  const result = updatePlayerOverall(player, "Season development", { season, date });
  player.overall = calculatedAfter;
  player.baseOverall = calculatedAfter;
  player.previousOverall = previousRating;
  player.previousAttributes = beforeAttributes;
  player.lastDevelopmentSeason = season;
  player.developmentReportHistory ??= [];
  const changesByAttribute = Object.fromEntries(
    Object.entries({ ...(player.subAttrs ?? {}), ...(player.gkAttrs ?? {}) })
      .filter(([attribute, value]) => beforeAttributes[attribute] != null && value !== beforeAttributes[attribute])
      .map(([attribute, value]) => [attribute, value - beforeAttributes[attribute]]),
  );
  const report = {
    season,
    date: date ?? null,
    previousOverall: previousRating,
    currentOverall: calculatedAfter,
    change: calculatedAfter - previousRating,
    attributes: changesByAttribute,
    age,
    appearances: apps,
    averageRating: Number(avgRating.toFixed(2)),
    reasons: [
      age <= 23 ? "age and potential" : age >= 31 ? "age curve" : "career stage",
      playingTime > 0.6 ? "regular minutes" : playingTime < 0.15 ? "limited minutes" : "match involvement",
      relevantCoach ? `${trainingGradeFor(relevantCoach)}-grade specialist coaching` : "training quality",
    ],
  };
  player.developmentReportHistory.push(report);
  player.developmentReportHistory = player.developmentReportHistory.slice(-20);
  player.developmentHistory ??= [];
  player.developmentHistory.push({ season, date: date ?? null, overall: calculatedAfter, change: report.change, attributes: changesByAttribute });
  player.developmentHistory = player.developmentHistory.slice(-40);
  if (club.training) {
    if (report.change) {
      club.training.reports.unshift({ playerId: player.id, player: `${player.first ?? ""} ${player.last ?? ""}`.trim(), ...report });
      club.training.reports = club.training.reports.slice(0, 100);
      const notification = report.change >= 2
        ? `${player.first} ${player.last} is developing rapidly (+${report.change} OVR).`
        : report.change <= -1
          ? `${player.first} ${player.last} declined ${Math.abs(report.change)} OVR this season.`
          : null;
      if (notification) {
        club.training.notifications.unshift({ id: `development-${season}-${player.id}`, date, text: notification });
        club.training.notifications = club.training.notifications.slice(0, 40);
      }
    }
  }
  player.trainingAttendance = 0;
  player.trainingLoad = 0;
  player.developmentTrajectory = developmentTrajectory(player);
  return report;
}

export function developAcademyPlayer(club, prospect, rng, date) {
  const academy = club.academy;
  const current = Number(prospect.overall ?? 40);
  if (!prospect.subAttrs && !prospect.gkAttrs) {
    const generated = generateAttributes(rng, prospect.position, current);
    const built = createPlayer({
      ...prospect,
      attrs: prospect.attrs ?? generated.attrs,
      subAttrs: generated.subAttrs,
      gkAttrs: generated.gkAttrs,
      potential: prospect.potential ?? Math.min(88, current + rng.int(6, 16)),
    });
    Object.assign(prospect, built, { status: "academy", plan: prospect.plan ?? "Balanced development" });
  }
  prospect.stats ??= { apps: 0, minutes: 0, ratingSum: 0 };
  prospect.age ??= 16;
  prospect.trainingAttendance = (prospect.trainingAttendance ?? 0) + 1;
  prospect.morale ??= prospect.confidence ?? 65;
  const report = developPlayer(prospect, club, rng, Math.floor(date / 365), {
    appearances: 0,
    minutes: 0,
    ratingSum: 0,
    date,
  });
  prospect.academyTraining = false;
  if (report?.change) {
    academy.developmentHistory.unshift({
      playerId: prospect.id,
      date,
      previousOverall: report.previousOverall,
      currentOverall: report.currentOverall,
      change: report.change,
      attributes: report.attributes,
      plan: prospect.plan,
    });
    academy.developmentHistory = academy.developmentHistory.slice(0, 200);
  }
  return report;
}
