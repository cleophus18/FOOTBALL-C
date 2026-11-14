import { fromDayIndex, toDayIndex } from "./calendar.mjs";
import { normalizePosition } from "./constants.mjs";
import { clamp } from "./util.mjs";
import { ensureClubFinance, recordClubTransaction, syncLegacyBudgetFields } from "./finance.mjs";

export const CONTRACT_STATUSES = {
  ACTIVE: "active",
  EXPIRING: "expiring",
  NEGOTIATING: "negotiating",
  RENEWAL_OFFERED: "renewal-offered",
  PENDING_RENEWAL: "pending-renewal",
  RENEWAL_REJECTED: "renewal-rejected",
  PRE_CONTRACT_AGREED: "pre-contract-agreed",
  EXPIRED: "expired",
  FREE_AGENT: "free-agent",
  RETIRED: "retired",
};

/** Human labels for the contract status system. */
export const CONTRACT_STATUS_LABELS = {
  [CONTRACT_STATUSES.ACTIVE]: "Active",
  [CONTRACT_STATUSES.EXPIRING]: "Expiring",
  [CONTRACT_STATUSES.NEGOTIATING]: "Negotiating",
  [CONTRACT_STATUSES.RENEWAL_OFFERED]: "Renewal Offered",
  [CONTRACT_STATUSES.PENDING_RENEWAL]: "Negotiating",
  [CONTRACT_STATUSES.RENEWAL_REJECTED]: "Rejected renewal",
  [CONTRACT_STATUSES.PRE_CONTRACT_AGREED]: "Pre-contract Agreed",
  [CONTRACT_STATUSES.EXPIRED]: "Expired",
  [CONTRACT_STATUSES.FREE_AGENT]: "Free Agent",
  [CONTRACT_STATUSES.RETIRED]: "Retired",
};

/**
 * The stage thresholds of the contract lifecycle, in days remaining:
 * 365 days (~12 months), 183 days (~6 months, pre-contract window) and 31 days
 * (the final month). The countdown progresses automatically as the in-game
 * calendar advances.
 */
export const CONTRACT_STAGES = {
  RENEWAL_OPEN: 365,
  PRE_CONTRACT_OPEN: 183,
  FINAL_MONTH: 31,
};

export function contractStageLabel(contract, currentDay) {
  const remaining = daysUntilExpiry(contract, currentDay);
  if (remaining == null) return null;
  if (remaining <= 0) return "expired";
  if (remaining <= URGENT_WINDOW_DAYS) return "final-month";
  if (remaining <= PRE_CONTRACT_WINDOW_DAYS) return "six-months";
  if (remaining <= RENEWAL_WINDOW_DAYS) return "twelve-months";
  return "normal";
}

/** Remaining duration as { years, months } for the profile countdown indicator. */
export function contractRemainingDuration(contract, currentDay) {
  const remaining = daysUntilExpiry(contract, currentDay);
  if (remaining == null || remaining < 0) return { years: 0, months: 0, days: 0 };
  const months = Math.floor(remaining / 30.44);
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: remaining - Math.round(months * 30.44),
  };
}

/** Expected wage demanded by a free agent, based on his quality and previous wage. */
export function freeAgentExpectedWage(player) {
  const previous = Number(player?.contract?.previousWeeklyWage ?? player?.contract?.lastWage ?? 0);
  const estimate = estimateWeeklyWage(player);
  if (!previous) return estimate;
  // A player coming off a big wage expects a similar figure, tempered by his age.
  return Math.round(Math.max(estimate, previous * 0.92) / 50) * 50;
}

/** Agent fee for signing a player: 5% of one year's wages, floored at €25k. */
export function agentFeeFor(wage) {
  return Math.max(25_000, Math.round((Number(wage) || 0) * 52 * 0.05));
}

const DAYS_PER_YEAR = 365;
export const RENEWAL_WINDOW_DAYS = 365;
export const PRE_CONTRACT_WINDOW_DAYS = 183; // ~6 months
export const URGENT_WINDOW_DAYS = 92; // ~3 months

function dayIndexFromDateInput(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (Number.isFinite(Number(value))) return Math.round(Number(value));
  const str = String(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
  if (iso) return toDayIndex(+iso[1], +iso[2], +iso[3]);
  return fallback;
}

function seasonStartDayFor(season) {
  return toDayIndex(Number(season), 7, 1);
}

export function contractExpiryDay(contract, fallbackSeason = null) {
  if (!contract) return null;
  const direct = dayIndexFromDateInput(
    contract.expiryDate ?? contract.endDate ?? contract.contractExpiryDate,
    null,
  );
  if (direct != null) return direct;
  const expiresSeason = Number(
    contract.expiresSeason ?? contract.expires ?? contract.endSeason,
  );
  if (Number.isFinite(expiresSeason)) {
    // End of that season: 30 June of expiresSeason+1
    return toDayIndex(expiresSeason + 1, 6, 30);
  }
  if (fallbackSeason != null) return toDayIndex(Number(fallbackSeason) + 1, 6, 30);
  return null;
}

export function contractStartDay(contract, fallbackSeason = null) {
  if (!contract) return fallbackSeason != null ? seasonStartDayFor(fallbackSeason) : null;
  const direct = dayIndexFromDateInput(
    contract.startDate ?? contract.contractStartDate ?? contract.signedDate,
    null,
  );
  if (direct != null) return direct;
  const startSeason = Number(contract.startSeason ?? contract.season);
  if (Number.isFinite(startSeason)) return seasonStartDayFor(startSeason);
  return fallbackSeason != null ? seasonStartDayFor(fallbackSeason) : null;
}

export function yearsBetweenDays(startDay, endDay) {
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay)) return 0;
  return Math.max(0, (endDay - startDay) / DAYS_PER_YEAR);
}

export function daysUntilExpiry(contract, currentDay) {
  const expiry = contractExpiryDay(contract);
  if (expiry == null || !Number.isFinite(currentDay)) return null;
  return expiry - currentDay;
}

export function contractYearsRemaining(contract, currentDay, currentSeason = null) {
  if (!contract) return 0;
  const remainingDays = daysUntilExpiry(contract, currentDay);
  if (remainingDays != null) return Math.max(0, remainingDays / DAYS_PER_YEAR);
  const expiry = contractExpiryDay(contract, currentSeason);
  if (expiry != null && Number.isFinite(currentDay)) {
    return Math.max(0, (expiry - currentDay) / DAYS_PER_YEAR);
  }
  const season = Number(contract.expiresSeason ?? contract.expires ?? contract.endSeason);
  if (Number.isFinite(season) && Number.isFinite(currentSeason)) {
    return Math.max(0, season - currentSeason + 0.5);
  }
  return 0;
}

export function defaultSquadRole(player) {
  if (player?.contract?.squadRole) return player.contract.squadRole;
  const overall = Number(player?.overall ?? 60);
  const age = Number(player?.age ?? 25);
  if (player?.isUser) return "Key Player";
  if (overall >= 82) return "Star Player";
  if (overall >= 76) return "Important Player";
  if (overall >= 70) return "Regular Starter";
  if (overall >= 64) return age <= 21 ? "Prospect" : "Squad Rotation";
  return age <= 21 ? "Prospect" : "Fringe Player";
}

function normalizedWage(value, fallback = 0) {
  const wage = Number(value);
  return Number.isFinite(wage) && wage >= 0 ? Math.round(wage) : Math.max(0, Math.round(fallback));
}

export function estimateWeeklyWage(player, club = null) {
  const overall = Number(player?.overall ?? player?.rating ?? 55);
  const potential = Number(player?.potential ?? overall);
  const age = Number(player?.age ?? 25);
  const prestige = Number(club?.prestige ?? club?.reputation ?? 50);
  let wage = 700 + overall * overall * 8 + Math.max(0, potential - overall) * 120;
  wage *= 0.85 + prestige / 140;
  if (age <= 21) wage *= 0.92;
  if (age >= 31) wage *= 0.95;
  if (player?.isLegend) wage *= 1.8;
  return Math.max(500, Math.round(wage / 50) * 50);
}

export function createDefaultContract(player, { club = null, currentDay = null, season = null, years = 3 } = {}) {
  const startDay = Number.isFinite(currentDay)
    ? currentDay
    : Number.isFinite(season)
      ? seasonStartDayFor(season)
      : seasonStartDayFor(fromDayIndex(currentDay ?? 0)?.year ?? 2026);
  const safeYears = clamp(Math.round(Number(years) || 3), 1, 6);
  const expiryDay = startDay + safeYears * DAYS_PER_YEAR;
  const wage = normalizedWage(player?.contract?.wage, estimateWeeklyWage(player, club));
  return {
    startDate: startDay,
    expiryDate: expiryDay,
    years: safeYears,
    weeklyWage: wage,
    wage, // legacy compatibility
    squadRole: defaultSquadRole(player),
    releaseClause: player?.contract?.releaseClause ?? null,
    status: CONTRACT_STATUSES.ACTIVE,
    history: Array.isArray(player?.contract?.history) ? [...player.contract.history] : [],
    renewalRejected: false,
    preContractAllowed: false,
    pendingOffer: null,
    lastProcessedDay: null,
    signingBonus: Number(player?.contract?.signingBonus ?? 0) || 0,
  };
}

export function normalizeContract(player, { club = null, currentDay = null, season = null } = {}) {
  if (!player) return null;
  if (!player.clubId) {
    player.squadStatus = "Free Agent";
    player.contract = {
      ...(player.contract ?? {}),
      status: CONTRACT_STATUSES.FREE_AGENT,
      weeklyWage: 0,
      wage: 0,
      expiryDate: contractExpiryDay(player.contract, season) ?? currentDay ?? null,
      startDate: contractStartDay(player.contract, season),
      squadRole: player.contract?.squadRole ?? "Free Agent",
      history: Array.isArray(player.contract?.history) ? player.contract.history : [],
      renewalRejected: false,
      preContractAllowed: false,
      pendingOffer: null,
    };
    return player.contract;
  }

  const existing = player.contract && typeof player.contract === "object" ? player.contract : {};
  const base = createDefaultContract(player, { club, currentDay, season, years: existing.years ?? 3 });
  const startDate = contractStartDay(existing, season) ?? base.startDate;
  const expiryDate = contractExpiryDay(existing, season) ?? base.expiryDate;
  const weeklyWage = normalizedWage(existing.weeklyWage ?? existing.wage, base.weeklyWage);
  const years = Math.max(
    1,
    Math.round(Number(existing.years ?? existing.contractYears ?? yearsBetweenDays(startDate, expiryDate) ?? base.years) || base.years),
  );
  const normalized = {
    ...base,
    ...existing,
    startDate,
    expiryDate,
    years,
    weeklyWage,
    wage: weeklyWage,
    squadRole: existing.squadRole ?? base.squadRole,
    releaseClause:
      existing.releaseClause == null || existing.releaseClause === ""
        ? null
        : Math.max(0, Math.round(Number(existing.releaseClause) || 0)),
    status: existing.status ?? CONTRACT_STATUSES.ACTIVE,
    history: Array.isArray(existing.history) ? existing.history : [],
    renewalRejected: !!existing.renewalRejected,
    preContractAllowed: !!existing.preContractAllowed,
    pendingOffer: existing.pendingOffer ?? null,
    lastProcessedDay: existing.lastProcessedDay ?? null,
    signingBonus: Math.max(0, Math.round(Number(existing.signingBonus ?? 0) || 0)),
  };

  // Keep legacy fields in sync for existing code paths.
  const expiry = fromDayIndex(expiryDate);
  normalized.expiresSeason = expiry ? (expiry.month >= 7 ? expiry.year : expiry.year - 1) : normalized.expiresSeason;
  normalized.expires = normalized.expiresSeason ?? existing.expires ?? season ?? null;
  normalized.endSeason = normalized.expires;
  normalized.contractYears = normalized.years;

  player.contract = normalized;
  if (!player.squadStatus || player.squadStatus === "Free Agent") {
    player.squadStatus = "Contracted";
  }
  return normalized;
}

export function renewalPhase(contract, currentDay) {
  const remaining = daysUntilExpiry(contract, currentDay);
  if (remaining == null) return "normal";
  if (remaining <= 0) return "expired";
  if (remaining <= URGENT_WINDOW_DAYS) return "urgent";
  if (remaining <= PRE_CONTRACT_WINDOW_DAYS) return "pre-contract";
  if (remaining <= RENEWAL_WINDOW_DAYS) return "renewal";
  return "normal";
}

export function canDiscussRenewal(contract, currentDay) {
  const phase = renewalPhase(contract, currentDay);
  return phase === "renewal" || phase === "pre-contract" || phase === "urgent";
}

function addContractHistory(contract, entry) {
  contract.history ??= [];
  contract.history.push(entry);
  if (contract.history.length > 20) contract.history.splice(0, contract.history.length - 20);
}

export function desiredWeeklyWage(player, club = null, { offeredRole = null } = {}) {
  const base = estimateWeeklyWage(player, club);
  const role = offeredRole ?? defaultSquadRole(player);
  const roleFactor =
    role === "Star Player" ? 1.35 :
    role === "Key Player" ? 1.2 :
    role === "Important Player" ? 1.1 :
    role === "Regular Starter" ? 1.0 :
    role === "Squad Rotation" ? 0.9 :
    role === "Prospect" ? 0.8 :
    0.75;
  const form = Number(player?.lastMatchRating ?? 6.6);
  const formFactor = clamp(1 + (form - 6.6) * 0.05, 0.9, 1.2);
  const age = Number(player?.age ?? 25);
  const ageFactor = age <= 23 ? 0.95 : age >= 32 ? 0.92 : 1;
  return Math.max(500, Math.round((base * roleFactor * formFactor * ageFactor) / 50) * 50);
}

export function evaluateContractOffer(player, club, offer) {
  const desiredWage = desiredWeeklyWage(player, club, { offeredRole: offer.squadRole });
  const offeredWage = normalizedWage(offer.weeklyWage ?? offer.wage, 0);
  const years = clamp(Math.round(Number(offer.years ?? offer.contractYears ?? 2) || 2), 1, 5);
  const overall = Number(player?.overall ?? 60);
  const potential = Number(player?.potential ?? overall);
  const age = Number(player?.age ?? 25);
  const prestige = Number(club?.prestige ?? club?.reputation ?? 50);
  const apps = Number(player?.stats?.apps ?? player?.leaguePerformance?.apps ?? 0);
  const playingTimeFit =
    offer.squadRole === "Star Player" || offer.squadRole === "Key Player" ? 1 :
    offer.squadRole === "Important Player" || offer.squadRole === "Regular Starter" ? 0.9 :
    offer.squadRole === "Squad Rotation" ? 0.7 :
    0.5;
  const performance = clamp(Number(player?.lastMatchRating ?? 6.5) / 10, 0.45, 0.95);
  const interest = Number(player?.transferInterest ?? player?.marketDemand ?? 0);
  const loyalty = clamp(Number(player?.loyalty ?? (prestige >= 75 ? 65 : 55)), 0, 100);

  let score = 0;
  score += (offeredWage / Math.max(1, desiredWage)) * 38;
  score += (prestige / 100) * 18;
  score += playingTimeFit * 14;
  score += performance * 10;
  score += (years >= 2 && years <= 4 ? 8 : years === 1 ? 4 : 5);
  score += (loyalty / 100) * 8;
  score += Math.min(6, (Number(offer.signingBonus ?? 0) || 0) / Math.max(25000, desiredWage * 20));
  score -= Math.min(18, interest / 8);
  if (age <= 22 && potential >= overall + 6 && playingTimeFit < 0.8) score -= 8;
  if (age >= 30 && years >= 4) score -= 4;
  if (apps < 8 && age >= 24 && playingTimeFit < 0.7) score -= 6;

  const demandedWage = Math.max(offeredWage, desiredWage);
  const minYears = age >= 32 ? 1 : age <= 22 ? 2 : 2;
  const acceptable = score >= 52 && offeredWage >= desiredWage * 0.92 && years >= minYears;
  const demands = [];
  if (offeredWage < desiredWage * 0.92) demands.push(`weekly wage closer to ${demandedWage}`);
  if (years < minYears) demands.push(`at least ${minYears} years`);
  if (playingTimeFit < 0.7 && overall >= 72) demands.push("an improved squad role");
  if (Number(offer.signingBonus ?? 0) < desiredWage * 4 && overall >= 78) demands.push("a signing bonus");

  return {
    acceptable,
    score: Math.round(score),
    desiredWage: demandedWage,
    demands,
    reason: acceptable
      ? "The player is satisfied with the contract terms."
      : demands.length
        ? `The player wants ${demands.join(", ")}.`
        : "The player is not convinced by this offer.",
  };
}

function ensurePlayerDetachedFromClub(player, club) {
  if (!club || !player) return;
  if (typeof club.removePlayer === "function") club.removePlayer(player.id);
  else if (Array.isArray(club.squad)) {
    const index = club.squad.indexOf(player.id);
    if (index >= 0) club.squad.splice(index, 1);
  }
  if (Array.isArray(club.startingXI)) {
    club.startingXI = club.startingXI.filter((id) => id !== player.id);
  }
  if (Array.isArray(club.customXI)) {
    club.customXI = club.customXI.filter((entry) => {
      const id = typeof entry === "string" ? entry : entry?.playerId ?? entry?.id;
      return id !== player.id;
    });
  }
}

export function expirePlayerContract(player, club, { currentDay = 0, season = null, reason = "Contract expired" } = {}) {
  if (!player) return null;
  const previousClubId = player.clubId ?? club?.id ?? null;
  const contract = normalizeContract(player, { club, currentDay, season });
  if (club) ensurePlayerDetachedFromClub(player, club);
  player.clubId = null;
  player.squadStatus = "Free Agent";
  player.formerClubId = previousClubId;
  player.contract = {
    ...contract,
    status: CONTRACT_STATUSES.FREE_AGENT,
    weeklyWage: 0,
    wage: 0,
    previousWeeklyWage: contract.weeklyWage ?? 0,
    expiryDate: currentDay ?? contract.expiryDate ?? null,
    squadRole: "Free Agent",
    releaseClause: null,
    freeSinceDay: currentDay,
    renewalRejected: !!contract.renewalRejected,
    preContractAllowed: false,
    pendingOffer: null,
    // An agreed pre-contract survives expiry so the destination club can collect him.
    preContract: contract.preContract?.status === "agreed" ? contract.preContract : null,
  };
  addContractHistory(player.contract, {
    date: currentDay,
    season,
    type: "expired",
    clubId: previousClubId,
    reason,
  });
  return {
    playerId: player.id,
    previousClubId,
    date: currentDay,
    reason,
  };
}

export function signPlayerContract(player, club, offer, { currentDay = 0, season = null, isFreeAgent = false, loyaltyBonus = 0, agentFee = 0 } = {}) {
  if (!player || !club) throw new Error("Player and club are required.");
  const normalized = normalizeContract(player, { club, currentDay, season });
  const years = clamp(Math.round(Number(offer.years ?? offer.contractYears ?? 2) || 2), 1, 5);
  const startDate = Number.isFinite(currentDay) ? currentDay : normalized.startDate ?? seasonStartDayFor(season ?? 2026);
  const expiryDate = startDate + years * DAYS_PER_YEAR;
  const weeklyWage = normalizedWage(offer.weeklyWage ?? offer.wage, normalized.weeklyWage);
  const signingBonus = Math.max(0, Math.round(Number(offer.signingBonus ?? 0) || 0));

  if (isFreeAgent) {
    if (player.clubId && player.clubId !== club.id) {
      throw new Error("Player is already contracted elsewhere.");
    }
  } else if (player.clubId && player.clubId !== club.id) {
    throw new Error("Renewals require the player to belong to the club.");
  }

  player.clubId = club.id;
  player.squadStatus = "Contracted";
  if (typeof club.addPlayer === "function") club.addPlayer(player.id);
  else if (Array.isArray(club.squad) && !club.squad.includes(player.id)) club.squad.push(player.id);

  player.contract = {
    ...normalized,
    startDate,
    expiryDate,
    years,
    contractYears: years,
    weeklyWage,
    wage: weeklyWage,
    squadRole: offer.squadRole ?? defaultSquadRole(player),
    releaseClause:
      offer.releaseClause == null || offer.releaseClause === ""
        ? null
        : Math.max(0, Math.round(Number(offer.releaseClause) || 0)),
    status: CONTRACT_STATUSES.ACTIVE,
    renewalRejected: false,
    preContractAllowed: false,
    pendingOffer: null,
    preContract: null,
    signingBonus,
    loyaltyBonus: Math.max(0, Math.round(Number(loyaltyBonus) || 0)),
    signedSeason: season ?? normalized.signedSeason ?? null,
  };
  const expiry = fromDayIndex(expiryDate);
  player.contract.expiresSeason = expiry ? (expiry.month >= 7 ? expiry.year : expiry.year - 1) : season;
  player.contract.expires = player.contract.expiresSeason;
  player.contract.endSeason = player.contract.expiresSeason;
  addContractHistory(player.contract, {
    date: currentDay,
    season,
    type: isFreeAgent ? "signed-free-agent" : "renewed",
    clubId: club.id,
    years,
    weeklyWage,
    signingBonus,
    squadRole: player.contract.squadRole,
  });

  if (signingBonus > 0) {
    const finance = ensureClubFinance(club);
    const eventId = `signing-bonus-${club.id}-${player.id}-${currentDay}-${isFreeAgent ? "free" : "renewal"}`;
    if (!finance.processedEvents.includes(eventId)) {
      recordClubTransaction(club, {
        id: eventId,
        date: currentDay,
        category: "wages",
        description: `Signing bonus for ${player.first ?? ""} ${player.last ?? player.name ?? "player"}`.trim(),
        expense: signingBonus,
      });
    }
    syncLegacyBudgetFields(club);
  }
  if (loyaltyBonus > 0) {
    const finance = ensureClubFinance(club);
    const eventId = `loyalty-bonus-${club.id}-${player.id}-${currentDay}`;
    if (!finance.processedEvents.includes(eventId)) {
      recordClubTransaction(club, {
        id: eventId,
        date: currentDay,
        category: "wages",
        description: `Loyalty bonus for ${player.first ?? ""} ${player.last ?? player.name ?? "player"}`.trim(),
        expense: loyaltyBonus,
      });
    }
    syncLegacyBudgetFields(club);
  }
  if (agentFee > 0) {
    const finance = ensureClubFinance(club);
    const eventId = `agent-fee-${club.id}-${player.id}-${currentDay}`;
    if (!finance.processedEvents.includes(eventId)) {
      recordClubTransaction(club, {
        id: eventId,
        date: currentDay,
        category: "agent fees",
        description: `Agent fee for signing ${player.first ?? ""} ${player.last ?? player.name ?? "player"}`.trim(),
        expense: agentFee,
      });
    }
    syncLegacyBudgetFields(club);
  }
  return player.contract;
}

export function isContractExpired(contract, currentDay) {
  const expiry = contractExpiryDay(contract);
  return expiry != null && Number.isFinite(currentDay) && currentDay >= expiry;
}

export function wageCommitmentForPlayers(players = []) {
  return players.reduce((total, player) => {
    if (!player || player.clubId == null) return total;
    const contract = player.contract ?? {};
    if (contract.status === CONTRACT_STATUSES.FREE_AGENT || contract.status === CONTRACT_STATUSES.EXPIRED) return total;
    const wage = Number(contract.weeklyWage ?? contract.wage ?? 0);
    if (!Number.isFinite(wage) || wage <= 0) return total;
    return total + wage;
  }, 0);
}

export function clubHasRegistrationSpace(club, players = []) {
  const limit = club?.registrationLimit ?? 25;
  const count = Array.isArray(club?.squad)
    ? club.squad.length
    : players.filter((player) => player.clubId === club?.id).length;
  return count < limit;
}

export function createContractOffer({
  weeklyWage,
  years,
  squadRole,
  signingBonus = 0,
  releaseClause = null,
}) {
  return {
    weeklyWage: Math.max(0, Math.round(Number(weeklyWage) || 0)),
    wage: Math.max(0, Math.round(Number(weeklyWage) || 0)),
    years: clamp(Math.round(Number(years) || 1), 1, 5),
    contractYears: clamp(Math.round(Number(years) || 1), 1, 5),
    squadRole: squadRole ?? "Squad Rotation",
    signingBonus: Math.max(0, Math.round(Number(signingBonus) || 0)),
    releaseClause:
      releaseClause == null || releaseClause === ""
        ? null
        : Math.max(0, Math.round(Number(releaseClause) || 0)),
  };
}

export function contractSummary(contract, currentDay) {
  if (!contract) return null;
  const expiryDate = contractExpiryDay(contract);
  const remainingDays = daysUntilExpiry(contract, currentDay);
  return {
    startDate: contractStartDay(contract),
    expiryDate,
    years: Number(contract.years ?? contract.contractYears ?? 0),
    weeklyWage: Number(contract.weeklyWage ?? contract.wage ?? 0),
    squadRole: contract.squadRole ?? null,
    releaseClause: contract.releaseClause ?? null,
    status: contract.status ?? CONTRACT_STATUSES.ACTIVE,
    renewalRejected: !!contract.renewalRejected,
    daysRemaining: remainingDays,
    phase: renewalPhase(contract, currentDay),
  };
}

/* =====================================================================
 * FC26-inspired contract lifecycle: negotiations, free agency and
 * pre-contract agreements. These helpers are pure where practical so
 * they can be driven by the career simulation and the UI alike.
 * ===================================================================== */

/**
 * A renewal negotiation held with a player at (or leaving) a club.
 * Plain data so it survives save/load inside `career.contractNegotiations`.
 */
export function createContractNegotiation({
  playerId,
  clubId,
  offer,
  currentDay,
  season = null,
  kind = "renewal",
  fromCareer = false,
}) {
  return {
    id: `negotiation-${playerId}-${clubId}-${currentDay}-${Math.random().toString(36).slice(2, 7)}`,
    playerId,
    clubId,
    kind, // "renewal" | "free-agent" | "pre-contract"
    offer: createContractOffer(offer),
    status: "awaiting-response", // awaiting-response | accepted | rejected | counteroffer | withdrawn
    response: null,
    createdAt: currentDay,
    season,
    rounds: 0,
    fromCareer,
  };
}

/**
 * Evaluate a contract offer and produce one of the FC26 outcome shapes:
 * accepted / rejected / counteroffer (wants improved wages, a bigger role,
 * or wants to leave). Considers current salary, rating, potential, age,
 * club reputation and performance, playing time, squad role, manager
 * relationship, personality and interest from other clubs.
 */
export function resolveContractNegotiation(player, club, negotiation, context = {}) {
  const evaluation = evaluateContractOffer(player, club, negotiation.offer);
  const rng = context.rng ?? Math.random;
  const remaining = daysUntilExpiry(player.contract, context.currentDay ?? 0);
  const personality = Array.isArray(player.personality) ? player.personality[0] : player.personality;
  const ambitious = personality === "Ambitious" || personality === "Determined";
  const loyal = personality === "Loyal";
  const managerTrust = Number(
    context.managerTrust ?? club?.manager?.trust?.[player.id] ?? 50,
  );
  const clubPerformance = Number(context.clubPosition ?? 10);
  const interest = Number(player.transferInterest ?? player.marketDemand ?? 0);

  let score = evaluation.score;
  score += managerTrust > 70 ? 4 : managerTrust < 35 ? -5 : 0;
  score += clubPerformance <= 4 ? 5 : clubPerformance >= 15 ? -3 : 0;
  if (loyal) score += 5;
  if (ambitious) score -= 3;
  if (remaining != null && remaining <= URGENT_WINDOW_DAYS) score += 6; // wants certainty late on
  if (interest >= 60) score -= 6;

  const outcome = {
    negotiationId: negotiation.id,
    playerId: player.id,
    playerName: `${player.first ?? ""} ${player.last ?? ""}`.trim(),
    day: context.currentDay ?? 0,
    acceptable: evaluation.acceptable,
  };

  if (evaluation.acceptable && score >= 52) {
    negotiation.status = "accepted";
    negotiation.response = { ...outcome, kind: "accepted", message: `${outcome.playerName} has agreed to the new contract.` };
    return negotiation.response;
  }
  if (score >= 46 && evaluation.demands.length && negotiation.rounds < 3) {
    negotiation.rounds += 1;
    negotiation.status = "counteroffer";
    negotiation.response = {
      ...outcome,
      kind: "counteroffer",
      demands: evaluation.demands,
      desiredWage: evaluation.desiredWage,
      message: `${outcome.playerName} wants ${evaluation.demands.join(", ")} before signing.`,
    };
    return negotiation.response;
  }
  if (
    interest >= 65 &&
    Number(player.overall ?? 60) >= 76 &&
    remaining != null &&
    remaining <= PRE_CONTRACT_WINDOW_DAYS
  ) {
    negotiation.status = "rejected";
    negotiation.response = {
      ...outcome,
      kind: "wants-to-leave",
      message: `${outcome.playerName} wants to leave the club and will not sign a renewal.`,
    };
    return negotiation.response;
  }
  negotiation.status = "rejected";
  negotiation.rejectionCooldownDay = (context.currentDay ?? 0) + 60;
  negotiation.response = {
    ...outcome,
    kind: evaluation.demands.length ? "wants-improved-wages" : "rejected",
    demands: evaluation.demands,
    message: `${outcome.playerName} has rejected the offer${evaluation.demands.length ? ` — he wants ${evaluation.demands.join(", ")}` : ""}.`,
  };
  return negotiation.response;
}

/**
 * Score how attractive a free agent is to a club. Elite players draw elite
 * clubs; squad players draw smaller sides. Returns a 0..100 interest score.
 */
export function freeAgentClubInterest(player, club, context = {}) {
  const overall = Number(player.overall ?? 55);
  const age = Number(player.age ?? 25);
  const prestige = Number(club?.prestige ?? club?.reputation ?? 50);
  const wage = freeAgentExpectedWage(player);
  const finance = club?.finances ?? {};
  const wageSpace = Math.max(
    0,
    Number(finance.wageBudget ?? club?.wageBudget ?? 0) - Number(context.currentWageBill ?? 0),
  );
  const leagueReputation = Number(context.leagueReputation ?? prestige);
  const positionalNeed = Number(context.positionalNeed ?? 50);
  const squadSize = Number(context.squadSize ?? 24);
  const registrationLimit = Number(club?.registrationLimit ?? 25);

  if (wage > wageSpace) return 0;
  if (squadSize >= registrationLimit) return 0;

  // Elite players want elite clubs; low-rated players fit lower-prestige sides.
  // The gap is deliberately quadratic so a 55-rated squad player prefers a
  // modest club while an 88-rated star will only move to a major one.
  const reputationGap = Math.abs(prestige - (overall + 6));
  const reputationFit = clamp(100 - reputationGap * reputationGap * 0.35, 0, 100);
  const ageFit = age <= 23 ? 88 : age <= 30 ? 95 : 70;
  const affordability = clamp((wageSpace / Math.max(1, wage * 1.5)) * 100, 0, 100);
  const score =
    reputationFit * 0.42 +
    ageFit * 0.12 +
    affordability * 0.18 +
    positionalNeed * 0.18 +
    leagueReputation * 0.1;
  // A huge reputation mismatch caps interest regardless of other factors.
  const mismatchPenalty = reputationGap > 18 ? 0.55 : 1;
  return Math.round(clamp(score * mismatchPenalty, 0, 100));
}

/** The weekly wage a club should offer a free agent in a first approach. */
export function freeAgentOpeningOffer(player, club, context = {}) {
  const expected = freeAgentExpectedWage(player);
  const prestige = Number(club?.prestige ?? 50);
  const finance = club?.finances ?? {};
  const wageSpace = Math.max(
    0,
    Number(finance.wageBudget ?? club?.wageBudget ?? 0) - Number(context.currentWageBill ?? 0),
  );
  // Clubs lowball slightly; richer clubs can be more generous.
  const ratio = prestige >= 75 ? 1 : prestige >= 55 ? 0.95 : 0.88;
  const wage = Math.min(wageSpace, Math.round((expected * ratio) / 50) * 50);
  const years = Number(player.age ?? 25) >= 31 ? 1 : Number(player.overall ?? 60) <= 68 ? 2 : 3;
  const role =
    Number(player.overall ?? 60) >= 80 ? "Key Player"
    : Number(player.overall ?? 60) >= 74 ? "Important Player"
    : Number(player.overall ?? 60) >= 68 ? "Regular Starter"
    : "Squad Rotation";
  return createContractOffer({
    weeklyWage: Math.max(500, wage),
    years,
    squadRole: role,
    signingBonus: Math.round(expected * 4),
    releaseClause: null,
  });
}

/**
 * A pre-contract agreement: signed while the player still has up to six
 * months at his current club; he joins the destination club for free when
 * the existing contract expires. One player can hold only one agreement.
 */
export function createPreContractAgreement({ player, club, offer, currentDay, season = null }) {
  const existing = player.contract?.preContract;
  if (existing && existing.status === "agreed") {
    throw new Error(`${player.first ?? "Player"} already has a pre-contract agreement.`);
  }
  if (player.clubId === club?.id) {
    throw new Error("A pre-contract is only for joining another club.");
  }
  const agreement = {
    playerId: player.id,
    playerName: `${player.first ?? ""} ${player.last ?? ""}`.trim(),
    fromClubId: player.clubId ?? null,
    toClubId: club.id,
    toClubName: club.name,
    weeklyWage: Math.max(0, Math.round(Number(offer.weeklyWage ?? offer.wage ?? 0))),
    years: clamp(Math.round(Number(offer.years ?? 3) || 3), 1, 5),
    signingBonus: Math.max(0, Math.round(Number(offer.signingBonus ?? 0) || 0)),
    squadRole: offer.squadRole ?? "Regular Starter",
    agreedDay: currentDay,
    season,
    status: "agreed", // agreed | completed | cancelled
  };
  player.contract ??= {};
  player.contract.preContract = agreement;
  player.contract.preContractAllowed = true;
  if (player.contract.status === CONTRACT_STATUSES.ACTIVE || player.contract.status === CONTRACT_STATUSES.EXPIRING) {
    player.contract.status = CONTRACT_STATUSES.PRE_CONTRACT_AGREED;
  }
  return agreement;
}

/** True when the player may sign a pre-contract under the six-month rule. */
export function canSignPreContract(player, currentDay) {
  if (!player?.clubId) return false;
  if (player.contract?.preContract?.status === "agreed") return false;
  const remaining = daysUntilExpiry(player.contract, currentDay);
  return remaining != null && remaining > 0 && remaining <= PRE_CONTRACT_WINDOW_DAYS;
}

/* =====================================================================
 * FC26-inspired AI contract-management and squad-protection engine.
 *
 * Pure, deterministic decision helpers. The career simulation feeds them
 * real club/player state once per decision cycle and applies whichever
 * action they recommend. Nothing here mutates the world directly, so the
 * same save + the same seed always produces the same decisions.
 * ===================================================================== */

/** Configurable squad-management thresholds (FC26-style squad planning). */
export const SQUAD_MANAGEMENT_RULES = {
  criticalSquadSize: 18, // below this a club must recruit urgently
  activeSquadSize: 20, // 18-20: recruit actively
  balancedSquadSize: 24, // 21-24: maintain depth, replace leavers only
  minimumGoalkeepers: 2, // a club can never function with fewer
  minimumReplacementSquadSize: 15, // never sell below this during a season
};

/** Squad-priority bands returned by squadPriorityBand(). */
export function squadPriorityBand(squadSize, registrationLimit = 25) {
  const size = Number(squadSize) || 0;
  if (size >= registrationLimit) return "full";
  if (size < SQUAD_MANAGEMENT_RULES.criticalSquadSize) return "critical";
  if (size < SQUAD_MANAGEMENT_RULES.activeSquadSize) return "active";
  if (size < SQUAD_MANAGEMENT_RULES.balancedSquadSize) return "balanced";
  return "stable";
}

/**
 * How urgently should this club recruit this cycle?
 * 0 = none, 1 = replace departures, 2 = build depth, 3 = urgent recruitment.
 */
export function squadRecruitmentPriority(club, players = []) {
  const squad = Array.isArray(club?.squad)
    ? club.squad
    : players.filter((player) => player.clubId === club?.id);
  const size = squad.length;
  const limit = Number(club?.registrationLimit ?? 25);
  const band = squadPriorityBand(size, limit);
  if (band === "full") return 0;
  const goalkeepers = squad.filter(
    (id) => normalizePosition(players.find((p) => p.id === id)?.position) === "GK",
  ).length;
  if (goalkeepers < SQUAD_MANAGEMENT_RULES.minimumGoalkeepers) return 3;
  if (band === "critical") return 3;
  if (band === "active") return 2;
  return 1;
}

/**
 * The single decision an AI manager takes about one expiring contract:
 * renew / transfer-list / release. Considers rating, potential, age, form,
 * squad role, wage room, positional depth, replacement availability and the
 * club's ambitions. Deterministic through the supplied rng stream.
 */
export function aiContractDecision(player, club, context = {}) {
  const rng = context.rng ?? Math.random;
  const day = Number(context.currentDay ?? 0);
  const overall = Number(player?.overall ?? 55);
  const potential = Number(player?.potential ?? overall);
  const age = Number(player?.age ?? context.ageOfPlayer ?? 25);
  const wage = Number(player?.contract?.weeklyWage ?? 0);
  const prestige = Number(club?.prestige ?? 50);
  const finance = club?.finances ?? {};
  const wageBudget = Number(finance.wageBudget ?? club?.wageBudget ?? 0);
  const wageBill = Number(context.wageBill ?? 0);
  const squadSize = Number(context.squadSize ?? 0);
  const positionalDepth = Number(context.positionalDepth ?? 2);
  const isGoalkeeper = normalizePosition(player?.position) === "GK";
  const apps = Number(player?.stats?.apps ?? 0);
  const rating = Number(player?.lastMatchRating ?? 6.5);
  const role = player?.contract?.squadRole ?? defaultSquadRole(player);

  // Squad protection: never discard a player if the squad is already thin.
  const squadFloor =
    context.transferListed === true
      ? SQUAD_MANAGEMENT_RULES.minimumReplacementSquadSize
      : SQUAD_MANAGEMENT_RULES.criticalSquadSize;
  const shortOfFloor = squadSize <= squadFloor;

  // Financial reality: can the club still afford him for another season?
  const expectedRenewalWage = Math.max(wage, estimateWeeklyWage(player, club) * 1.05);
  const canAfford = wageBill + (expectedRenewalWage - wage) <= wageBudget;

  // Important starter with room in the budget: renew, always.
  const starterQualityGap = overall - (46 + prestige * 0.22);
  const isImportantStarter =
    starterQualityGap >= -4 &&
    (role === "Star Player" || role === "Key Player" || role === "Important Player" ||
      role === "Regular Starter");

  if (!shortOfFloor) {
    // Declining veterans the club can afford to let go.
    const declining =
      age >= 31 && overall <= 74 && potential - overall <= 2 && positionalDepth > 2;
    if (declining && rng.chance(0.55)) {
      return {
        action: "release",
        reason: `${player.first ?? "Player"} is ${age} and the club will not renew a declining squad player.`,
        expectedWage: expectedRenewalWage,
      };
    }
    // Fringe players on wages the club would rather spend elsewhere.
    const expensiveFringe =
      (role === "Fringe Player" || role === "Squad Rotation") &&
      wage > estimateWeeklyWage(player, club) * 1.25 &&
      positionalDepth > 1;
    if (expensiveFringe && rng.chance(0.4)) {
      return {
        action: "transfer-list",
        reason: `${player.first ?? "Player"} is transfer-listed: his wages no longer match his squad role.`,
        expectedWage: expectedRenewalWage,
      };
    }
  }

  if (isImportantStarter && (canAfford || shortOfFloor)) {
    return {
      action: "renew",
      reason: `${player.first ?? "Player"} remains an important player at ${age}.`,
      expectedWage: expectedRenewalWage,
    };
  }

  // High-potential youngsters are cheap to keep and rarely sold.
  if (age <= 23 && potential >= overall + 4) {
    if (canAfford || shortOfFloor) {
      return { action: "renew", reason: `${player.first ?? "Player"} is a prospect worth developing.`, expectedWage: expectedRenewalWage };
    }
  }

  // Good enough for the squad, affordable: renew quietly.
  if (canAfford && positionalDepth <= 3 && starterQualityGap >= -8) {
    return { action: "renew", reason: `${player.first ?? "Player"} provides usable depth.`, expectedWage: expectedRenewalWage };
  }

  // Goalkeepers are always protected — a club without two keepers is broken.
  if (isGoalkeeper && positionalDepth <= 1) {
    return { action: "renew", reason: `Goalkeeper cover must be retained.`, expectedWage: expectedRenewalWage };
  }

  if (shortOfFloor) {
    return { action: "renew", reason: `The squad is too small to lose anyone.`, expectedWage: expectedRenewalWage };
  }

  // Default: not financially or technically justified — let him go.
  return {
    action: rng.chance(0.35) ? "transfer-list" : "release",
    reason: `${player.first ?? "Player"} does not justify a renewal on footballing or financial grounds.`,
    expectedWage: expectedRenewalWage,
  };
}

/**
 * The contract an AI club offers when renewing: realistic wage, duration,
 * squad role and signing bonus derived from the player's quality, age and
 * role, clamped by what the club can afford.
 */
export function aiRenewalOffer(player, club, context = {}) {
  const expected =
    Math.max(Number(player?.contract?.weeklyWage ?? 0), estimateWeeklyWage(player, club));
  const overall = Number(player?.overall ?? 60);
  const age = Number(player?.age ?? 25);
  const prestige = Number(club?.prestige ?? 50);
  const finance = club?.finances ?? {};
  const wageBudget = Number(finance.wageBudget ?? club?.wageBudget ?? 0);
  const wageBill = Number(context.wageBill ?? 0);
  const room = Math.max(0, wageBudget - wageBill);
  const wage = Math.max(500, Math.min(Math.round(expected * 1.08 / 50) * 50, Math.floor(room * 0.55) || expected));
  const years = age >= 33 ? 1 : age >= 30 ? 2 : overall >= 78 ? 4 : 3;
  const role = defaultSquadRole(player);
  const signingBonus = Math.round(wage * (prestige >= 75 ? 8 : 4));
  return createContractOffer({ weeklyWage: wage, years, squadRole: role, signingBonus });
}



/**
 * Position the AI should recruit for next: the highest-demand role from the
 * squad assessment, with goalkeepers protected ahead of everything else.
 */
export function priorityRecruitmentPosition(needs = {}, players = [], club = null) {
  const squad = club && Array.isArray(club.squad)
    ? club.squad.map((id) => players.find((player) => player.id === id)).filter(Boolean)
    : [];
  const goalkeepers = squad.filter((p) => normalizePosition(p.position) === "GK");
  if (goalkeepers.length < SQUAD_MANAGEMENT_RULES.minimumGoalkeepers) return "GK";
  let best = null;
  let bestDemand = 45; // below "Moderate Need" the club stands pat
  for (const need of Object.values(needs)) {
    if (need.demand > bestDemand) {
      bestDemand = need.demand;
      best = need.position;
    }
  }
  return best;
}
