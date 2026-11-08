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

export function marketValueForPlayer(player, club, dayIndex = 0) {
  const overall = Number(player.overall ?? 50);
  const potential = Number(player.potential ?? overall);
  const age = Number(player.age ?? 25);
  const ageFactor = age < 23 ? 1 + (23 - age) * 0.08 : age > 29 ? Math.max(0.45, 1 - (age - 29) * 0.08) : 1;
  const potentialFactor = 1 + clamp(potential - overall, 0, 20) * 0.025;
  const contractFactor = clamp(Number(player.contract?.yearsRemaining ?? 2) / 3, 0.55, 1.15);
  const reputationFactor = 0.8 + Number(club?.prestige ?? 50) / 250;
  const value = overall ** 3 * 95 * ageFactor * potentialFactor * contractFactor * reputationFactor;
  player.value = Math.max(25_000, Math.round(value / 1_000) * 1_000);
  player.marketValueUpdatedAt = dayIndex;
  return player.value;
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
  if ((buyer.squad?.length ?? 0) >= 25)
    throw new Error("The buying club has reached its 25-player registration limit.");
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
  if (Array.isArray(players)) marketValueForPlayer(player, buyer, date);
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
