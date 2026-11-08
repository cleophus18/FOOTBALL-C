import { clamp } from "./util.mjs";
import { ensureClubFinance, recordClubTransaction } from "./finance.mjs";

export const INVESTMENT_PROJECTS = {
  trainingGround: {
    label: "Training ground",
    category: "sporting",
    costs: [2_000_000, 4_000_000, 7_500_000, 12_000_000],
    weeks: 8,
    maintenance: [0, 15_000, 30_000, 50_000],
    benefit: "training",
  },
  youthAcademy: {
    label: "Youth academy",
    category: "youth",
    costs: [1_500_000, 3_500_000, 6_000_000, 10_000_000],
    weeks: 10,
    maintenance: [0, 10_000, 22_000, 40_000],
    benefit: "youth",
  },
  medicalCentre: {
    label: "Medical centre",
    category: "medical",
    costs: [1_250_000, 3_000_000, 5_500_000, 9_000_000],
    weeks: 7,
    maintenance: [0, 8_000, 18_000, 30_000],
    benefit: "recovery",
  },
  scoutingNetwork: {
    label: "Scouting network",
    category: "recruitment",
    costs: [1_000_000, 2_500_000, 5_000_000, 8_500_000],
    weeks: 6,
    maintenance: [0, 7_000, 16_000, 28_000],
    benefit: "scouting",
  },
  stadium: {
    label: "Stadium expansion",
    category: "infrastructure",
    costs: [8_000_000, 15_000_000, 28_000_000, 45_000_000],
    weeks: 20,
    maintenance: [0, 25_000, 55_000, 90_000],
    benefit: "stadium",
  },
  commercial: {
    label: "Commercial facilities",
    category: "commercial",
    costs: [2_500_000, 6_000_000, 12_000_000, 20_000_000],
    weeks: 12,
    maintenance: [0, 12_000, 28_000, 50_000],
    benefit: "commercial",
  },
};

function defaultInvestment() {
  return {
    facilities: {
      trainingGround: 1,
      youthAcademy: 1,
      medicalCentre: 1,
      scoutingNetwork: 1,
      stadium: 1,
      commercial: 1,
    },
    activeProjects: [],
    completedProjects: [],
    history: [],
    reputationProjects: 0,
    fanEngagement: 0,
  };
}

export function ensureClubInvestment(club) {
  const current = club.investment ?? {};
  const defaults = defaultInvestment();
  club.investment = {
    ...defaults,
    ...current,
    facilities: { ...defaults.facilities, ...(current.facilities ?? {}) },
    activeProjects: Array.isArray(current.activeProjects) ? current.activeProjects : [],
    completedProjects: Array.isArray(current.completedProjects) ? current.completedProjects : [],
    history: Array.isArray(current.history) ? current.history : [],
  };
  const finance = ensureClubFinance(club);
  finance.investmentBudget = Math.max(
    0,
    Number(finance.investmentBudget ?? Math.round(finance.balance * 0.2)),
  );
  return club.investment;
}

export function investmentOptions(club) {
  const investment = ensureClubInvestment(club);
  return Object.entries(INVESTMENT_PROJECTS).map(([id, project]) => {
    const level = Number(investment.facilities[id] ?? 1);
    const nextLevel = level + 1;
    return {
      id,
      ...project,
      level,
      nextLevel,
      available: nextLevel <= 5 && !investment.activeProjects.some((item) => item.projectId === id),
      cost: project.costs[nextLevel - 2] ?? null,
      completionWeeks: project.weeks,
      maintenance: project.maintenance[nextLevel - 1] ?? 0,
    };
  });
}

export function startInvestment(club, projectId, date, { approved = true } = {}) {
  const investment = ensureClubInvestment(club);
  const project = INVESTMENT_PROJECTS[projectId];
  if (!project) throw new Error("That investment is not available.");
  const option = investmentOptions(club).find((item) => item.id === projectId);
  if (!option?.available) throw new Error("That facility is already being upgraded or is at maximum level.");
  if (!approved) throw new Error("The board did not approve this investment.");
  const finance = ensureClubFinance(club);
  if (finance.balance < option.cost || finance.investmentBudget < option.cost)
    throw new Error("The club cannot afford this investment while protecting its financial reserves.");
  finance.investmentBudget -= option.cost;
  recordClubTransaction(club, {
    id: `investment-start-${club.id}-${projectId}-${option.nextLevel}`,
    date,
    category: "investment",
    description: `${project.label} level ${option.nextLevel} construction`,
    expense: option.cost,
  });
  investment.activeProjects.push({
    id: `project-${club.id}-${projectId}-${option.nextLevel}`,
    projectId,
    level: option.nextLevel,
    started: date,
    completes: date + project.weeks * 7,
    cost: option.cost,
    status: "active",
  });
  investment.history.unshift({ ...investment.activeProjects.at(-1), event: "started" });
  return investment.activeProjects.at(-1);
}

export function processInvestmentWeek(club, date) {
  const investment = ensureClubInvestment(club);
  const finance = ensureClubFinance(club);
  for (const [id, project] of Object.entries(INVESTMENT_PROJECTS)) {
    const level = Number(investment.facilities[id] ?? 1);
    const maintenance = project.maintenance[level - 1] ?? 0;
    if (maintenance)
      recordClubTransaction(club, {
        id: `investment-maintenance-${club.id}-${id}-${date}`,
        date,
        category: "investment maintenance",
        description: `${project.label} maintenance`,
        expense: Math.round(maintenance / 4),
      });
  }
  for (const active of investment.activeProjects) {
    if (active.status !== "active" || date < active.completes) continue;
    active.status = "complete";
    investment.facilities[active.projectId] = active.level;
    investment.completedProjects.push({ ...active, completed: date });
    investment.history.unshift({ ...active, completed: date, event: "completed" });
    investment.activeProjects = investment.activeProjects.filter((item) => item.id !== active.id);
    if (active.projectId === "stadium") club.capacity = Math.min(120_000, Math.round(club.capacity * 1.12));
    if (active.projectId === "commercial") club.reputation = clamp((club.reputation ?? club.prestige) + 1, 1, 100);
  }
  return investment;
}

export function investmentModifiers(club) {
  const facilities = ensureClubInvestment(club).facilities;
  return {
    training: 1 + (facilities.trainingGround - 1) * 0.04,
    youth: 1 + (facilities.youthAcademy - 1) * 0.05,
    recovery: 1 + (facilities.medicalCentre - 1) * 0.04,
    scouting: 1 + (facilities.scoutingNetwork - 1) * 0.05,
    commercial: 1 + (facilities.commercial - 1) * 0.04,
    stadium: 1 + (facilities.stadium - 1) * 0.03,
  };
}

export function aiInvestmentDecision(club, date) {
  if (club.isUserClub) return null;
  const finance = ensureClubFinance(club);
  const options = investmentOptions(club).filter((option) => option.available);
  if (!options.length || finance.balance < 10_000_000) return null;
  const priority = (club.prestige ?? 50) < 60 ? "youthAcademy" : "trainingGround";
  const option = options.find((item) => item.id === priority) ?? options[0];
  try {
    return startInvestment(club, option.id, date);
  } catch {
    return null;
  }
}
