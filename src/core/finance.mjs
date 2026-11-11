import { clamp, round } from "./util.mjs";
import { isLegend, legendForClub } from "../model/legends.mjs";

const DEFAULT_SPONSORS = [
  "Vertex Mobile",
  "Northstar Energy",
  "Kinetic Financial",
  "Apex Telecom",
  "Summit Sportswear",
];

function stableSeed(value) {
  return String(value ?? "club")
    .split("")
    .reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function sponsorFor(club) {
  return DEFAULT_SPONSORS[stableSeed(club.id) % DEFAULT_SPONSORS.length];
}

/**
 * Financial state is deliberately plain data so it survives the existing save format.
 * Amounts are integer euros; transaction ids make event processing idempotent.
 */
export function createClubFinance(spec = {}, identity = {}) {
  const prestige = clamp(Number(spec.prestige ?? identity.prestige ?? 50), 1, 100);
  const capacity = Math.max(1000, Number(spec.capacity ?? identity.capacity ?? 20000));
  const balance = Math.max(
    0,
    Math.round(Number(spec.balance ?? spec.budget ?? prestige * 1_000_000)),
  );
  const transferBudget = Math.max(
    0,
    Math.round(Number(spec.transferBudget ?? spec.budget ?? balance * 0.35)),
  );
  const wageBudget = Math.max(
    0,
    Math.round(Number(spec.wageBudget ?? prestige * 250_000)),
  );
  const existing = spec.finances ?? {};
  return {
    balance: Math.max(0, Number(existing.balance ?? balance)),
    transferBudget: Math.max(0, Number(existing.transferBudget ?? transferBudget)),
    investmentBudget: Math.max(0, Number(existing.investmentBudget ?? Math.round(balance * 0.2))),
    wageBudget: Math.max(0, Number(existing.wageBudget ?? wageBudget)),
    annualOperatingBudget: Math.max(
      0,
      Number(existing.annualOperatingBudget ?? Math.round(balance * 0.42)),
    ),
    debt: Math.max(0, Number(existing.debt ?? 0)),
    revenue: { ...(existing.revenue ?? {}) },
    expenses: { ...(existing.expenses ?? {}) },
    ledger: Array.isArray(existing.ledger) ? [...existing.ledger] : [],
    processedEvents: Array.isArray(existing.processedEvents)
      ? [...existing.processedEvents]
      : [],
    sponsorships: Array.isArray(existing.sponsorships)
      ? [...existing.sponsorships]
      : [
          {
            id: `sponsor-${spec.id ?? "club"}`,
            category: "main shirt",
            name: existing.sponsorName ?? sponsorFor({ id: spec.id }),
            season: Number(spec.season ?? 2026),
            annualPayment: Math.round(prestige * 180_000),
            performanceBonus: Math.round(prestige * 35_000),
          },
        ],
    ticketPrice: Math.max(5, Number(existing.ticketPrice ?? 24 + prestige * 0.35)),
    boardConfidence: clamp(Number(existing.boardConfidence ?? 60), 0, 100),
  };
}

export function ensureClubFinance(club) {
  if (!club.finances) club.finances = createClubFinance(club);
  club.finances.balance = Math.max(0, Number(club.finances.balance ?? club.balance ?? 0));
  club.finances.transferBudget = Math.max(
    0,
    Number(club.finances.transferBudget ?? club.budget ?? 0),
  );
  club.finances.wageBudget = Math.max(
    0,
    Number(club.finances.wageBudget ?? club.wageBudget ?? 0),
  );
  club.finances.investmentBudget = Math.max(
    0,
    Number(club.finances.investmentBudget ?? Math.round(club.finances.balance * 0.2)),
  );
  syncLegacyBudgetFields(club);
  return club.finances;
}

export function syncLegacyBudgetFields(club) {
  if (!club.finances) return;
  club.balance = club.finances.balance;
  club.budget = club.finances.transferBudget;
  club.wageBudget = club.finances.wageBudget;
}

function markEvent(finance, eventId) {
  if (!eventId) return false;
  if (finance.processedEvents.includes(eventId)) return false;
  finance.processedEvents.push(eventId);
  if (finance.processedEvents.length > 500) finance.processedEvents.splice(0, 100);
  return true;
}

export function recordClubTransaction(
  club,
  { id, date = null, category, description, income = 0, expense = 0 },
) {
  const finance = ensureClubFinance(club);
  if (!markEvent(finance, id)) return null;
  const incoming = Math.max(0, Math.round(income));
  const outgoing = Math.max(0, Math.round(expense));
  finance.balance = Math.max(0, finance.balance + incoming - outgoing);
  const bucket = incoming ? finance.revenue : finance.expenses;
  const key = category || "other";
  bucket[key] = (bucket[key] ?? 0) + (incoming || outgoing);
  const transaction = {
    id: id ?? `tx-${club.id}-${finance.ledger.length + 1}`,
    date,
    category: key,
    description: description ?? key,
    income: incoming,
    expense: outgoing,
    balance: finance.balance,
  };
  finance.ledger.push(transaction);
  if (finance.ledger.length > 250) finance.ledger.splice(0, finance.ledger.length - 250);
  syncLegacyBudgetFields(club);
  return transaction;
}

export function processWeeklyClubFinances(club, players, date) {
  const finance = ensureClubFinance(club);
  const wageBill = club.wageBill(players);
  const sponsorIncome = Math.round(
    (finance.sponsorships ?? []).reduce(
      (total, sponsor) => total + Number(sponsor.annualPayment ?? 0),
      0,
    ) / 52,
  );
  const events = [];
  if (sponsorIncome) {
    events.push(
      recordClubTransaction(club, {
        id: `sponsor-week-${club.id}-${date}`,
        date,
        category: "sponsorship",
        description: "Weekly sponsorship instalment",
        income: sponsorIncome,
      }),
    );
  }
  events.push(
    recordClubTransaction(club, {
      id: `wages-week-${club.id}-${date}`,
      date,
      category: "wages",
      description: "Player wages",
      expense: wageBill,
    }),
  );
  const operating = Math.max(1000, Math.round((club.capacity ?? 20000) * 1.5));
  events.push(
    recordClubTransaction(club, {
      id: `operations-week-${club.id}-${date}`,
      date,
      category: "operations",
      description: "Stadium and academy operations",
      expense: operating,
    }),
  );
  return events.filter(Boolean);
}

export function processMatchdayRevenue(
  club,
  opponent,
  { date, competition = "league", importance = 1, resultKey, outcome },
) {
  const finance = ensureClubFinance(club);
  const capacity = Math.max(1000, Number(club.capacity ?? 20000));
  const opponentPrestige = Number(opponent?.prestige ?? 50);
  club.fanSupport = clamp(Number(club.fanSupport ?? 55), 0, 100);
  const demand = clamp(
    0.52 +
      Number(club.reputation ?? club.prestige ?? 50) * 0.003 +
      opponentPrestige * 0.002 +
      Number(importance) * 0.05 +
      club.fanSupport * 0.0035,
    0.2,
    0.99,
  );
  const tickets = Math.min(capacity, Math.round(capacity * demand));
  const income = Math.round(tickets * finance.ticketPrice);
  if (outcome === "W") club.fanSupport = clamp(club.fanSupport + 2.4, 0, 100);
  else if (outcome === "D") club.fanSupport = clamp(club.fanSupport + 0.2, 0, 100);
  else if (outcome === "L") club.fanSupport = clamp(club.fanSupport - 1.8, 0, 100);
  return recordClubTransaction(club, {
    id: resultKey ?? `matchday-${club.id}-${date}`,
    date,
    category: "matchday",
    description: `${competition} attendance (${tickets.toLocaleString()} tickets)`,
    income,
  });
}

/** ---- Dynamic market value system ---- */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundToStep(value) {
  const step = value >= 50_000_000 ? 1_000_000
    : value >= 10_000_000 ? 500_000
    : value >= 1_000_000 ? 100_000
    : value >= 250_000 ? 25_000
    : 10_000;
  return Math.max(25_000, Math.round(value / step) * step);
}

function contractYearsRemaining(player, context = {}) {
  const contract = player?.contract ?? {};
  const direct = num(contract.yearsRemaining ?? contract.years ?? contract.length, NaN);
  if (Number.isFinite(direct)) return clamp(direct, 0, 6);
  const expires = num(contract.expires ?? contract.endSeason ?? contract.expiry, NaN);
  const season = num(context.season, NaN);
  if (Number.isFinite(expires) && Number.isFinite(season)) return clamp(expires - season, 0, 6);
  return 2;
}

function playerStatsBundle(player) {
  const stats = player?.stats ?? {};
  const leagueApps = num(player?.leaguePerformance?.apps ?? player?.apps, NaN);
  const leagueRatingSum = num(player?.leaguePerformance?.ratingSum ?? player?.ratingSum, NaN);
  const apps = Math.max(0, Number.isFinite(leagueApps) ? leagueApps : num(stats.apps));
  const ratingSum = Number.isFinite(leagueRatingSum) ? leagueRatingSum : num(stats.ratingSum);
  const averageRating = apps > 0 ? ratingSum / apps : (num(player?.lastMatchRating, NaN) || 6.4);
  const goals = Math.max(0, num(player?.leagueGoals ?? player?.goals ?? stats.goals));
  const assists = Math.max(0, num(player?.leagueAssists ?? player?.assists ?? stats.assists));
  const minutes = Math.max(0, num(stats.minutes, apps * 70));
  const motm = Math.max(0, num(stats.motm ?? stats.manOfTheMatch));
  const cleanSheets = Math.max(0, num(stats.cleanSheets));
  return { apps, averageRating, goals, assists, minutes, motm, cleanSheets };
}

function formSignal(player) {
  const recent = Array.isArray(player?.recentMatchRatings) ? player.recentMatchRatings.filter(Number.isFinite) : [];
  if (recent.length) {
    const avg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    return clamp((avg - 6.5) / 2.2, -1, 1);
  }
  const form = num(player?.form, NaN);
  if (Number.isFinite(form)) return clamp((form - 50) / 35, -1, 1);
  const last = num(player?.lastMatchRating, NaN);
  return Number.isFinite(last) ? clamp((last - 6.6) / 2.4, -1, 1) : 0;
}

function injurySignal(player) {
  if (!player) return 1;
  if (player.injury) {
    const weeks = num(player.injury.weeks ?? player.injury.duration ?? player.injury.remaining, 2);
    const type = String(player.injury.type ?? "").toLowerCase();
    const severe = type.includes("serious") || weeks >= 8 ? 0.72 : weeks >= 4 ? 0.82 : 0.9;
    return severe;
  }
  const fitness = num(player.fitness, 100);
  return clamp(0.9 + (fitness / 100) * 0.1, 0.9, 1);
}

function positionDemand(position = "") {
  const pos = String(position).toUpperCase();
  if (pos === "ST" || pos === "CF") return 1.05;
  if (pos === "GK") return 0.97;
  if (pos === "CB") return 0.99;
  if (["LW", "RW", "AM", "CAM"].includes(pos)) return 1.03;
  return 1;
}

function expectedSeasonApps(player, context = {}) {
  const apps = playerStatsBundle(player).apps;
  if (apps > 0) return apps;
  if (player?.status === "academy" || String(player?.id ?? "").startsWith("academy")) return 6;
  if (player?.onLoan || player?.loan) return 18;
  return 24;
}

/**
 * Dynamic market value estimate (euros). Estimate only, not a guaranteed transfer fee.
 * Uses current OVR/potential/age, accumulated season performance, form/ratings, playing time,
 * injuries/availability, position, contract, club/league context and demand signals.
 * Single-match swings are damped via accumulated stats and recent-form averages.
 */
export function calculateMarketValue(player, context = {}) {
  if (!player) return 0;
  const prestige = clamp(num(context.clubPrestige ?? context.club?.prestige ?? context.club?.reputation, 55), 1, 100);
  const season = context.season ?? context.completedSeason ?? null;
  const overall = clamp(num(player.overall ?? player.currentOverall ?? player.baseOverall, 55), 35, 99);
  const potential = clamp(Math.max(num(player.potential, overall), overall), 35, 99);
  const age = clamp(num(player.age, 25), 15, 45);
  const { apps, averageRating, goals, assists, minutes, motm, cleanSheets } = playerStatsBundle(player);
  const position = player.position ?? "CM";
  const yearsLeft = contractYearsRemaining(player, { season });

  // Base OVR curve anchored to realistic football ranges (approximate, not hard limits).
  let value = 65_000 * Math.pow(2.08, overall - 55);
  if (overall >= 90) value *= 1 + (overall - 90) * 0.08;

  // Age and potential.
  const upside = Math.max(0, potential - overall);
  if (age <= 23) value *= 1.08 + upside * 0.03 + (23 - age) * 0.045;
  else if (age <= 27) value *= 1.02 + upside * 0.012;
  else if (age <= 30) value *= 0.97 - (age - 27) * 0.03 + upside * 0.004;
  else value *= Math.pow(0.88, age - 30) * (1 + upside * 0.002);
  if (age >= 33 && overall >= 86) value *= 1.08;
  if (age >= 35 && overall >= 88) value *= 1.06;

  // Accumulated season performance and consistency/exposure.
  const ratingFactor = clamp(1 + (averageRating - 6.6) * 0.11, 0.72, 1.28);
  const appsNorm = clamp(apps / 30, 0, 1.3);
  const playingTime = clamp(0.82 + appsNorm * 0.22 + clamp(minutes / 2400, 0, 1.2) * 0.08, 0.78, 1.18);
  const outputBase = goals + assists * 0.72 + motm * 0.35 + (position === "GK" ? cleanSheets * 0.45 : 0);
  const outputPerApp = apps > 0 ? outputBase / apps : 0;
  const outputFactor = clamp(1 + outputPerApp * 0.22, 0.84, 1.32);
  const exposurePenalty = apps < 8 ? 0.84 + apps * 0.015 : apps < 15 ? 0.94 + (apps - 8) * 0.008 : 1;
  const consistency = clamp(1 - Math.abs(formSignal(player)) * 0.03, 0.96, 1.02);

  const prestigeFactor = clamp(0.88 + prestige / 185, 0.9, 1.16);
  const competitionFactor = clamp(num(context.competitionFactor, 1), 0.9, 1.15);
  const demandRaw = num(player.transferDemand ?? player.marketDemand ?? player.interestLevel, NaN);
  const demandFactor = Number.isFinite(demandRaw)
    ? clamp(0.94 + clamp(demandRaw <= 1 ? demandRaw : demandRaw / 100, 0, 1.5) * 0.12, 0.94, 1.12)
    : 1;
  const contractFactor = clamp(0.82 + yearsLeft * 0.08, 0.82, 1.16);

  value *= ratingFactor * playingTime * outputFactor * exposurePenalty * consistency;
  value *= positionDemand(position) * injurySignal(player) * prestigeFactor * competitionFactor * demandFactor * contractFactor;

  if (age <= 21 && averageRating >= 7.0 && apps >= 10) value *= 1.08 + clamp((averageRating - 7.0) * 0.12, 0, 0.18);
  if (overall >= 92 && averageRating >= 7.1) value *= 1.05;
  if (expectedSeasonApps(player, context) < 10 && apps < 10) value *= 0.92;

  return roundToStep(value);
}

export function syncPlayerMarketValue(player, {
  club = null,
  dayIndex = 0,
  season = null,
  completedSeason = null,
  force = false,
} = {}) {
  if (!player) return 0;
  const markerSeason = completedSeason ?? season ?? null;
  const current = calculateMarketValue(player, {
    club,
    clubPrestige: club?.prestige ?? club?.reputation,
    dayIndex,
    season: markerSeason ?? season,
  });
  const existing = num(player.marketValue ?? player.value, NaN);
  if (!Number.isFinite(existing)) {
    player.marketValue = current;
  } else if (force || player.marketValueSeason !== markerSeason) {
    player.marketValue = current;
  } else {
    player.marketValue = existing;
  }
  player.value = player.marketValue; // backward-compatible alias
  if (markerSeason != null && (force || player.marketValueSeason !== markerSeason)) {
    player.marketValueUpdatedAt = dayIndex;
  } else if (player.marketValueUpdatedAt == null) {
    player.marketValueUpdatedAt = dayIndex;
  }
  player.marketValueUpdatedSeason ??= player.marketValueSeason ?? null;
  return player.marketValue;
}

export function formatMarketValue(value) {
  const amount = Math.max(0, num(value));
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const rounded = millions >= 100 ? Math.round(millions) : Math.round(millions * 10) / 10;
    return `€${String(rounded).replace(/\.0$/, "")}M`;
  }
  const thousands = Math.round(amount / 1_000);
  return `€${thousands}K`;
}

export function marketValueForPlayer(player, club, dayIndex = 0, context = {}) {
  return syncPlayerMarketValue(player, { club, dayIndex, ...context });
}

export function transferPlayer({
  seller,
  buyer,
  player,
  players,
  fee,
  wage,
  date,
  transferId,
}) {
  if (isLegend(player)) {
    const homeClub = legendForClub(player.clubId);
    throw new Error(
      `${player.first} ${player.last} is a protected legend and cannot leave ${homeClub?.clubName ?? "their club"}.`,
    );
  }
  const amount = Math.max(0, Math.round(fee));
  const sellerFinance = ensureClubFinance(seller);
  const buyerFinance = ensureClubFinance(buyer);
  if (buyerFinance.transferBudget < amount || buyerFinance.balance < amount)
    throw new Error("The buying club cannot afford this transfer fee.");
  if (buyerFinance.wageBudget < Number(wage ?? player.contract?.wage ?? 0))
    throw new Error("The buying club cannot fit this player's wages.");
  const registrationLimit = buyer.registrationLimit ?? 25;
  if ((buyer.squad?.length ?? 0) >= registrationLimit)
    throw new Error(
      `The buying club has reached its ${registrationLimit}-player registration limit.`,
    );
  if ((seller.squad?.length ?? 0) <= 20)
    throw new Error("The selling club must retain at least 20 registered players.");
  if (!seller.has(player.id) || buyer.has(player.id))
    throw new Error("The player is not available for this transfer.");
  buyerFinance.transferBudget -= amount;
  sellerFinance.transferBudget += amount;
  recordClubTransaction(buyer, {
    id: `${transferId}-buy`,
    date,
    category: "transfers",
    description: `Transfer fee for ${player.first} ${player.last}`,
    expense: amount,
  });
  recordClubTransaction(seller, {
    id: `${transferId}-sell`,
    date,
    category: "transfers",
    description: `Transfer income for ${player.first} ${player.last}`,
    income: amount,
  });
  seller.removePlayer(player.id);
  buyer.addPlayer(player.id);
  player.clubId = buyer.id;
  player.contract = {
    ...(player.contract ?? {}),
    wage: Number(wage ?? player.contract?.wage ?? 0),
    startSeason: Number(date ?? 0),
  };
  player.lastTransferFee = amount; // actual negotiated transfer fee (distinct from market value)
  // Refresh market value estimate after move; fee paid remains the negotiated amount.
  syncPlayerMarketValue(player, { club: buyer, dayIndex: date, force: true });
  syncLegacyBudgetFields(seller);
  syncLegacyBudgetFields(buyer);
  return { fee: amount, player, seller, buyer };
}

export function financialSummary(club, players = []) {
  const finance = ensureClubFinance(club);
  const wageCommitment = club.wageBill(players);
  return {
    balance: finance.balance,
    transferBudget: finance.transferBudget,
    investmentBudget: finance.investmentBudget,
    wageBudget: finance.wageBudget,
    wageCommitment,
    remainingWageBudget: finance.wageBudget - wageCommitment,
    debt: finance.debt,
    netTransferSpend: (finance.expenses.transfers ?? 0) - (finance.revenue.transfers ?? 0),
    ledger: [...finance.ledger].reverse().slice(0, 20),
    revenue: { ...finance.revenue },
    expenses: { ...finance.expenses },
    projectedBalance: Math.round(finance.balance + finance.sponsorships.reduce((sum, sponsor) => sum + Number(sponsor.annualPayment ?? 0), 0) - wageCommitment * 52),
  };
}
