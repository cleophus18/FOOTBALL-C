import { fromDayIndex, toDayIndex } from "./calendar.mjs";
import { clamp } from "./util.mjs";
import { ensureClubFinance, recordClubTransaction, syncLegacyBudgetFields } from "./finance.mjs";

export const CONTRACT_STATUSES = {
  ACTIVE: "active",
  EXPIRING: "expiring",
  PENDING_RENEWAL: "pending-renewal",
  RENEWAL_REJECTED: "renewal-rejected",
  EXPIRED: "expired",
  FREE_AGENT: "free-agent",
};

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
    expiryDate: currentDay ?? contract.expiryDate ?? null,
    squadRole: "Free Agent",
    releaseClause: null,
    renewalRejected: !!contract.renewalRejected,
    preContractAllowed: false,
    pendingOffer: null,
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

export function signPlayerContract(player, club, offer, { currentDay = 0, season = null, isFreeAgent = false } = {}) {
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
    signingBonus,
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
