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

const WEEKS_PER_SEASON = 52;

function positiveNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

/** Round to a readable step so budgets never show spurious euro digits. */
function roundAmount(value) {
  const amount = Math.max(0, Math.round(nonNegative(value)));
  if (amount >= 10_000_000) return Math.round(amount / 100_000) * 100_000;
  if (amount >= 1_000_000) return Math.round(amount / 10_000) * 10_000;
  if (amount >= 100_000) return Math.round(amount / 1_000) * 1_000;
  return amount;
}

/**
 * Weekly wages, stadium operations and academy upkeep are fixed commitments.
 * They are annualised to a season-long reserve, which is what the board protects
 * before it releases any money for transfers.
 */
export function annualOperatingCommitment({
  capacity = 20_000,
  wageCommitment = 0,
  prestige = 50,
} = {}) {
  const weeklyWages = nonNegative(wageCommitment);
  const matchdayOperations = Math.max(1000, nonNegative(capacity, 20_000) * 1.5) * 24;
  const academyAndAdmin = 500_000 + nonNegative(prestige) * 25_000;
  return roundAmount(weeklyWages * WEEKS_PER_SEASON + matchdayOperations + academyAndAdmin);
}

/** Expected matchday, commercial and broadcast income for one season. */
export function expectedSeasonIncome(club, finance = ensureClubFinance(club)) {
  const capacity = Math.max(1000, nonNegative(club?.capacity, 20_000));
  const prestige = clamp(nonNegative(club?.prestige ?? club?.reputation, 50), 1, 100);
  const ticketPrice = nonNegative(finance.ticketPrice, 24 + prestige * 0.35);
  const sponsorship = (finance.sponsorships ?? []).reduce(
    (total, sponsor) => total + nonNegative(sponsor.annualPayment),
    0,
  );
  const matchday = roundAmount(capacity * 21 * ticketPrice);
  const broadcast = roundAmount(prestige * prestige * 22_000);
  return roundAmount(matchday + sponsorship + broadcast);
}

/**
 * The weekly commitment the finance model protects. Defaults to the club's
 * configured wage budget share until a real squad wage bill is measured.
 */
function plannedWageCommitment(finance) {
  return Math.max(nonNegative(finance.wageCommitment), nonNegative(finance.wageBudget) * 0.22);
}

/**
 * Money the club genuinely has spare after every protected obligation: the season's
 * wage bill, outstanding debt and committed facility investment are all reserved
 * before anything is left over for the board to consider.
 */
export function spareCash(club, finance = ensureClubFinance(club), players = []) {
  const wageCommitment =
    players.length && typeof club?.wageBill === "function"
      ? nonNegative(club.wageBill(players))
      : plannedWageCommitment(finance);
  const reserve =
    Math.max(nonNegative(finance.annualOperatingBudget), wageCommitment * WEEKS_PER_SEASON) +
    nonNegative(finance.debt) +
    nonNegative(finance.investmentBudget);
  const cash = nonNegative(finance.balance) + expectedSeasonIncome(club, finance) - reserve;
  return roundAmount(Math.max(0, cash));
}

/**
 * Transfer money the club can actually spend right now: the board's allocation.
 * Fees are deducted from the allocation when the transfer is booked, so this is the
 * unspent remainder and protected obligations are never part of it.
 */
export function availableTransferFunds(club, finance = ensureClubFinance(club), players = []) {
  return roundAmount(Math.max(0, nonNegative(finance.transferBudget)));
}

/**
 * Board policy profiles. They decide what share of genuinely spare cash the board
 * is willing to release, and how much it insists on keeping as a cash buffer.
 */
export const BOARD_ALLOCATION_POLICIES = {
  conservative: { label: "Conservative", share: 0.35, reserveShare: 0.3, floor: 2_000_000 },
  balanced: { label: "Balanced", share: 0.55, reserveShare: 0.18, floor: 5_000_000 },
  ambitious: { label: "Ambitious", share: 0.75, reserveShare: 0.08, floor: 10_000_000 },
};

/**
 * What the board has ever committed to transfers, tracked separately from the live
 * transfer budget so money already spent on players is never released a second time.
 */
function boardCommittedToDate(finance, fallback = 0) {
  return Math.max(
    nonNegative(finance.allocationReleased, fallback),
    nonNegative(finance.transferBudget, fallback),
  );
}

export function boardPolicyFor(club, finance = ensureClubFinance(club)) {
  const configured = String(finance.boardPolicy ?? "").toLowerCase();
  if (BOARD_ALLOCATION_POLICIES[configured]) return configured;
  // Smaller clubs run a tighter ship; only genuinely wealthy boards back a big push.
  const prestige = clamp(Number(club?.prestige ?? club?.reputation ?? 50), 1, 100);
  const cash = nonNegative(finance.balance);
  if (prestige >= 80 && cash >= 80_000_000) return "ambitious";
  if (prestige <= 58 || cash <= 15_000_000) return "conservative";
  return "balanced";
}

/**
 * The board's transfer allocation review. It weighs cash, the existing allocation,
 * outstanding debt, committed wages, operating expenses, expected income,
 * sponsorship and matchday revenue, previous transfer spending, club prestige and
 * the board's own policy, then releases only the money that is genuinely spare.
 *
 * `season` makes the review idempotent: the same season is never reviewed twice,
 * and money already spent on players is never released a second time.
 */
export function reviewBoardTransferAllocation(
  club,
  { season = null, players = [], force = false } = {},
) {
  const finance = ensureClubFinance(club);
  if (!force && season != null && finance.allocationSeason === season) {
    return { changed: false, finance, allocation: finance.transferBudget };
  }
  const previousAllocation = nonNegative(finance.transferBudget);
  const sameSeason = season != null && finance.allocationSeason === season;
  // A new season starts with a clean slate: last season's spending is already
  // reflected in the cash balance, so it must not be deducted a second time.
  const spent = sameSeason ? nonNegative(finance.allocationSpent) : 0;
  const released = boardCommittedToDate(finance, previousAllocation);
  // Money already handed over for players: the unspent part of the release is what
  // the board still stands behind.
  const committed = Math.max(0, released - spent);
  const transferIncome = nonNegative(finance.revenue?.transfers);
  const wageCommitment =
    players.length && typeof club?.wageBill === "function"
      ? nonNegative(club.wageBill(players))
      : plannedWageCommitment(finance);
  const operatingReserve = Math.max(
    nonNegative(finance.annualOperatingBudget),
    wageCommitment * WEEKS_PER_SEASON,
  );
  const expectedIncome = expectedSeasonIncome(club, finance);
  const obligations =
    operatingReserve + nonNegative(finance.debt) + nonNegative(finance.investmentBudget);
  // Genuinely spare cash: cash on hand plus expected income, less every protected
  // obligation and less the transfer money already committed.
  const freeCash = roundAmount(
    Math.max(
      0,
      nonNegative(finance.balance) +
        expectedIncome -
        obligations -
        committed +
        transferIncome,
    ),
  );
  const policyKey = boardPolicyFor(club, finance);
  const policy = BOARD_ALLOCATION_POLICIES[policyKey];
  const prestige = clamp(Number(club?.prestige ?? club?.reputation ?? 50), 1, 100);
  const prestigeFactor = 0.85 + prestige / 330;
  // A club in the red keeps its powder dry, however prestigious it is.
  const health = clamp(
    0.55 + nonNegative(finance.balance) / Math.max(1, operatingReserve) / 4,
    0.25,
    1.15,
  );
  // Cash the club can genuinely cover once every obligation is protected.
  const headroom = roundAmount(
    Math.max(0, nonNegative(finance.balance) + expectedIncome - obligations),
  );
  const seasonalAllowance = roundAmount(
    freeCash * policy.share * health * prestigeFactor,
  );
  // The board keeps what it has already committed and adds only what it can afford.
  const desired = Math.max(committed, seasonalAllowance);
  const buffer = roundAmount(
    Math.max(nonNegative(finance.balance) * policy.reserveShare, policy.floor * 0.25),
  );
  const cashRoom = roundAmount(
    Math.max(0, nonNegative(finance.balance) - buffer + expectedIncome - operatingReserve),
  );
  const allocation = roundAmount(
    Math.max(
      Math.min(previousAllocation, cashRoom),
      Math.min(desired, headroom, cashRoom),
    ),
  );
  finance.transferBudget = allocation;
  finance.allocationSeason = season;
  finance.allocationReference = freeCash;
  // Everything released for the season: the live budget plus what has been spent.
  finance.allocationReleased = roundAmount(allocation + spent);
  finance.allocationSpent = spent;
  finance.boardAllocationSeason = season;
  finance.boardPolicy = policyKey;
  finance.boardCashReserve = buffer;
  finance.boardLastReview = {
    season,
    policy: policyKey,
    allocation,
    previousAllocation,
    operatingReserve: roundAmount(operatingReserve),
    expectedIncome,
    obligations: roundAmount(obligations),
    freeCash,
  };
  syncLegacyBudgetFields(club);
  return {
    changed: allocation !== previousAllocation,
    finance,
    allocation,
    previousAllocation,
    policy: policyKey,
    freeCash,
    obligations: roundAmount(obligations),
    headroom,
  };
}

export function createClubFinance(spec = {}, identity = {}) {
  const prestige = clamp(Number(spec.prestige ?? identity.prestige ?? 50), 1, 100);
  const capacity = Math.max(1000, Number(spec.capacity ?? identity.capacity ?? 20000));
  const existing = spec.finances ?? {};
  // The configured `budget` is a transfer war chest, not a bank balance: it seeds
  // the allocation, while cash comes from `balance` (or a prestige-based reserve).
  const configuredTransferBudget = Math.max(
    0,
    Math.round(
      positiveNumber(
        existing.transferBudget,
        spec.transferBudget,
        spec.budget,
        identity.transferBudget,
        identity.budget,
      ),
    ),
  );
  const balance = Math.max(
    0,
    Math.round(
      positiveNumber(existing.balance, spec.balance) ||
        Math.max(prestige * 1_000_000, configuredTransferBudget * 2),
    ),
  );
  const wageBudget = Math.max(
    0,
    Math.round(
      positiveNumber(
        existing.wageBudget,
        spec.wageBudget,
        identity.wageBudget,
      ) || prestige * 250_000,
    ),
  );
  const sponsorships = Array.isArray(existing.sponsorships)
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
      ];
  const sponsorshipIncome = sponsorships.reduce(
    (total, sponsor) => total + nonNegative(sponsor.annualPayment),
    0,
  );
  const wageCommitment = Math.max(
    nonNegative(existing.wageCommitment, spec.wageCommitment),
    wageBudget * 0.22,
  );
  const annualOperatingBudget = Math.max(
    nonNegative(existing.annualOperatingBudget, spec.annualOperatingBudget),
    Math.round(
      wageCommitment * WEEKS_PER_SEASON +
        Math.max(1000, capacity * 1.5) * 24 +
        500_000 +
        prestige * 25_000,
    ),
  );
  const investmentBudget = Math.max(
    nonNegative(existing.investmentBudget, spec.investmentBudget),
    Math.round(balance * 0.2),
  );
  const debt = Math.max(0, Math.round(nonNegative(existing.debt, spec.debt)));
  const expectedIncome = roundAmount(
    capacity * 21 * Math.max(5, 24 + prestige * 0.35) +
      sponsorshipIncome +
      prestige * prestige * 22_000,
  );
  // The board's starting point: what is genuinely spare after obligations, with
  // a reference figure for clubs whose configured war chest predates the model.
  const cashAvailable = Math.max(
    0,
    balance + expectedIncome - annualOperatingBudget - investmentBudget - debt,
  );
  const initialAllocation = roundAmount(
    configuredTransferBudget || cashAvailable * 0.6,
  );
  const finance = {
    balance,
    transferBudget: initialAllocation,
    investmentBudget,
    wageBudget,
    wageCommitment,
    annualOperatingBudget,
    debt,
    revenue: { ...(existing.revenue ?? {}) },
    expenses: { ...(existing.expenses ?? {}) },
    ledger: Array.isArray(existing.ledger) ? [...existing.ledger] : [],
    processedEvents: Array.isArray(existing.processedEvents)
      ? [...existing.processedEvents]
      : [],
    sponsorships,
    ticketPrice: Math.max(5, Number(existing.ticketPrice ?? 24 + prestige * 0.35)),
    boardConfidence: clamp(Number(existing.boardConfidence ?? 60), 0, 100),
    // Cash the last board review was based on, so a later review adds only the
    // genuinely new money instead of re-releasing funds already spent on transfers.
    allocationSeason:
      existing.allocationSeason ?? spec.allocationSeason ?? null,
    allocationReference:
      existing.allocationReference ?? spec.allocationReference ?? cashAvailable,
    allocationReleased: Math.max(
      nonNegative(existing.allocationReleased),
      initialAllocation,
    ),
    boardAllocationSeason:
      existing.boardAllocationSeason ?? spec.boardAllocationSeason ?? null,
    boardPolicy:
      existing.boardPolicy ?? spec.boardPolicy ?? "balanced",
  };
  return finance;
}

export function ensureClubFinance(club) {
  if (!club.finances) club.finances = createClubFinance(club);
  const finance = club.finances;
  finance.balance = Math.max(0, Math.round(nonNegative(finance.balance ?? club.balance)));
  finance.transferBudget = Math.max(
    0,
    Math.round(nonNegative(finance.transferBudget ?? club.budget)),
  );
  finance.wageBudget = Math.max(
    0,
    Math.round(nonNegative(finance.wageBudget ?? club.wageBudget)),
  );
  const prestige = clamp(Number(club.prestige ?? club.reputation ?? 50), 1, 100);
  const capacity = Math.max(1000, Number(club.capacity ?? 20000));
  const wageCommitment = plannedWageCommitment(finance);
  finance.wageCommitment = wageCommitment;
  finance.annualOperatingBudget = Math.max(
    nonNegative(finance.annualOperatingBudget),
    Math.round(
      wageCommitment * WEEKS_PER_SEASON +
        Math.max(1000, capacity * 1.5) * 24 +
        500_000 +
        prestige * 25_000,
    ),
  );
  finance.investmentBudget = Math.max(
    nonNegative(finance.investmentBudget),
    Math.round(finance.balance * 0.2),
  );
  finance.debt = Math.max(0, Math.round(nonNegative(finance.debt)));
  finance.sponsorships = Array.isArray(finance.sponsorships)
    ? finance.sponsorships
    : [
        {
          id: `sponsor-${club.id ?? "club"}`,
          category: "main shirt",
          name: sponsorFor({ id: club.id }),
          season: Number(club.season ?? 2026),
          annualPayment: Math.round(prestige * 180_000),
          performanceBonus: Math.round(prestige * 35_000),
        },
      ];
  finance.ticketPrice = Math.max(5, nonNegative(finance.ticketPrice, 24 + prestige * 0.35));
  finance.allocationSeason ??= null;
  finance.allocationReference = nonNegative(finance.allocationReference);
  finance.allocationReleased = nonNegative(finance.allocationReleased);
  finance.allocationSpent = nonNegative(finance.allocationSpent);
  finance.boardAllocationSeason ??= null;
  finance.boardPolicy ??= "balanced";
  finance.boardConfidence = clamp(Number(finance.boardConfidence ?? 60), 0, 100);
  syncLegacyBudgetFields(club);
  return finance;
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

  // Base value curve: realistic football ranges
  // OVR 55 -> ~0.5M, 65 -> ~5M, 75 -> ~25M, 85 -> ~65M, 90 -> ~110M, 95 -> ~180M
  let value = 400_000 * Math.pow(1.18, overall - 55);
  if (overall >= 85) value *= 1 + (overall - 85) * 0.12;
  if (overall >= 92) value *= 1 + (overall - 92) * 0.08;

  // Age and potential.
  const upside = Math.max(0, potential - overall);
  if (age <= 23) value *= 1.1 + upside * 0.04 + (23 - age) * 0.05;
  else if (age <= 27) value *= 1.03 + upside * 0.015;
  else if (age <= 30) value *= 0.98 - (age - 27) * 0.035 + upside * 0.005;
  else value *= Math.pow(0.85, age - 30) * (1 + upside * 0.003);
  if (age >= 33 && overall >= 86) value *= 1.1;
  if (age >= 35 && overall >= 88) value *= 1.07;

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

/**
 * Move transfer money without ever double-counting a transfer. The ledger record
 * is the only thing that changes the balance; the budget split is tracked against
 * the same transfer id so a repeated or replayed transfer cannot move money twice.
 * Fees the buyer pays are also booked against the current allocation so the board
 * never releases the same money again.
 */
function applyTransferBudgetSplit(finance, transferId, { buyerShare = 0, sellerShare = 0 } = {}) {
  if (!transferId) {
    finance.transferBudget = Math.max(0, finance.transferBudget - buyerShare + sellerShare);
    finance.allocationSpent = roundAmount(
      nonNegative(finance.allocationSpent) + Math.max(0, buyerShare),
    );
    return true;
  }
  finance.transferSplits ??= {};
  if (finance.transferSplits[transferId]) return false;
  finance.transferSplits[transferId] = { buyerShare, sellerShare };
  const keys = Object.keys(finance.transferSplits);
  if (keys.length > 400) {
    for (const key of keys.slice(0, 150)) delete finance.transferSplits[key];
  }
  finance.transferBudget = Math.max(0, finance.transferBudget - buyerShare + sellerShare);
  finance.allocationSpent = roundAmount(
    nonNegative(finance.allocationSpent) + Math.max(0, buyerShare),
  );
  return true;
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
  if (
    transferId &&
    (buyerFinance.transferSplits?.[transferId] || sellerFinance.transferSplits?.[transferId])
  ) {
    // This exact transfer has already been processed. Replaying it must never
    // charge the buyer or pay the seller a second time.
    syncLegacyBudgetFields(buyer);
    syncLegacyBudgetFields(seller);
    return { fee: amount, player, seller, buyer, duplicate: true };
  }
  if (buyerFinance.transferBudget < amount || buyerFinance.balance < amount)
    throw new Error("The buying club cannot afford this transfer fee.");
  const buyerWage =
    Number(wage ?? player.contract?.weeklyWage ?? player.contract?.wage ?? 0);
  if (buyerFinance.wageBudget < buyerWage)
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
  // The ledger is idempotent; the budget split is guarded by the same transfer id.
  const buyEntry = recordClubTransaction(buyer, {
    id: `${transferId}-buy`,
    date,
    category: "transfers",
    description: `Transfer fee for ${player.first} ${player.last}`,
    expense: amount,
  });
  const sellEntry = recordClubTransaction(seller, {
    id: `${transferId}-sell`,
    date,
    category: "transfers",
    description: `Transfer income for ${player.first} ${player.last}`,
    income: amount,
  });
  if (!buyEntry || !sellEntry) {
    syncLegacyBudgetFields(buyer);
    syncLegacyBudgetFields(seller);
    return { fee: amount, player, seller, buyer, duplicate: true };
  }
  applyTransferBudgetSplit(buyerFinance, transferId, { buyerShare: amount });
  applyTransferBudgetSplit(sellerFinance, transferId, { sellerShare: amount });
  seller.removePlayer(player.id);
  buyer.addPlayer(player.id);
  player.clubId = buyer.id;
  player.contract = {
    ...(player.contract ?? {}),
    weeklyWage: buyerWage,
    wage: buyerWage,
    startSeason: Number(date ?? 0),
  };
  player.lastTransferFee = amount; // actual negotiated transfer fee (distinct from market value)
  // Refresh market value estimate after move; fee paid remains the negotiated amount.
  syncPlayerMarketValue(player, { club: buyer, dayIndex: date, force: true });
  syncLegacyBudgetFields(seller);
  syncLegacyBudgetFields(buyer);
  return { fee: amount, player, seller, buyer, duplicate: false };
}

export function financialSummary(club, players = []) {
  const finance = ensureClubFinance(club);
  const wageCommitment =
    players.length && typeof club.wageBill === "function"
      ? nonNegative(club.wageBill(players))
      : plannedWageCommitment(finance);
  const operatingReserve = Math.max(
    nonNegative(finance.annualOperatingBudget),
    wageCommitment * WEEKS_PER_SEASON,
  );
  const expectedIncome = expectedSeasonIncome(club, finance);
  const debt = nonNegative(finance.debt);
  const investment = nonNegative(finance.investmentBudget);
  const obligations = roundAmount(operatingReserve + debt + investment);
  const transferSpend = nonNegative(finance.expenses.transfers);
  const transferIncome = nonNegative(finance.revenue.transfers);
  const revenueTotal = Object.values(finance.revenue).reduce(
    (total, value) => total + nonNegative(value),
    0,
  );
  const expenseTotal = Object.values(finance.expenses).reduce(
    (total, value) => total + nonNegative(value),
    0,
  );
  const remainingSeasonIncome = roundAmount(Math.max(0, expectedIncome - revenueTotal));
  const projectedBalance = roundAmount(
    nonNegative(finance.balance) +
      Math.max(0, remainingSeasonIncome - (expenseTotal - transferSpend)),
  );
  return {
    balance: nonNegative(finance.balance),
    transferBudget: nonNegative(finance.transferBudget),
    investmentBudget: investment,
    wageBudget: nonNegative(finance.wageBudget),
    wageCommitment,
    remainingWageBudget: roundAmount(nonNegative(finance.wageBudget) - wageCommitment),
    debt,
    annualOperatingExpenses: operatingReserve,
    financialObligations: obligations,
    expectedIncome,
    sponsorshipIncome: roundAmount(
      (finance.sponsorships ?? []).reduce(
        (total, sponsor) => total + nonNegative(sponsor.annualPayment),
        0,
      ),
    ),
    matchdayIncome: roundAmount(
      Math.max(
        0,
        expectedIncome -
          (finance.sponsorships ?? []).reduce(
            (total, sponsor) => total + nonNegative(sponsor.annualPayment),
            0,
          ) -
          clamp(nonNegative(club.prestige ?? club.reputation, 50), 1, 100) ** 2 * 22_000,
      ),
    ),
    availableTransferFunds: availableTransferFunds(club, finance, players),
    spareCash: spareCash(club, finance, players),
    committedTransfers: roundAmount(nonNegative(finance.allocationReleased)),
    allocationSpent: roundAmount(nonNegative(finance.allocationSpent)),
    previousTransferSpend: transferSpend,
    boardPolicy: finance.boardPolicy ?? boardPolicyFor(club, finance),
    boardPolicyLabel:
      BOARD_ALLOCATION_POLICIES[
        finance.boardPolicy ?? boardPolicyFor(club, finance)
      ]?.label ?? "Balanced",
    lastAllocationSeason: finance.allocationSeason ?? null,
    netTransferSpend: roundAmount(transferSpend - transferIncome),
    ledger: [...finance.ledger].reverse().slice(0, 20),
    revenue: { ...finance.revenue },
    expenses: { ...finance.expenses },
    revenueTotal: roundAmount(revenueTotal),
    expenseTotal: roundAmount(expenseTotal),
    projectedBalance,
  };
}
