import { toDayIndex, fromDayIndex } from "../core/calendar.mjs";
import { normalizePosition, POSITIONS, POSITION_GROUPS, GK_ATTRIBUTES, GK_DERIVED_ATTRIBUTES } from "../core/constants.mjs";
import {
  nameKey,
  normalizeText,
  playerIdentity,
  matchPlayerIdentity,
  strongIdentityKey,
} from "../model/identity.mjs";
import { parseCsvRows, serializeCsvRows } from "./csv.mjs";
import {
  DIRECT_GOALKEEPER_ATTRIBUTES,
  GOALKEEPER_ATTRIBUTES,
  estimateGoalkeeperAttributes,
  hasGoalkeeperAttributes,
} from "../model/goalkeeper.mjs";

const SEASON_START_DAY_INDEX = toDayIndex(2026, 7, 1);

const CAREER_LEAGUE_TEAMS = {
  "Premier League": [
    "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton & Hove Albion",
    "Chelsea", "Coventry City", "Crystal Palace", "Everton", "Fulham", "Hull City",
    "Ipswich Town", "Leeds United", "Liverpool", "Manchester City", "Manchester United",
    "Newcastle United", "Nottingham Forest", "Sunderland", "Tottenham Hotspur"
  ],
  "La Liga": [
    "Alavés", "Athletic Club", "Atlético Madrid", "FC Barcelona", "Celta Vigo",
    "Elche", "Espanyol", "Getafe", "Levante", "Osasuna", "Rayo Vallecano",
    "Real Betis", "Real Madrid", "Racing Santander", "Real Sociedad", "Sevilla",
    "Valencia", "Villarreal", "Deportivo de La Coruña", "Málaga"
  ],
  "Bundesliga": [
    "Augsburg", "Bayer Leverkusen", "Bayern München", "Borussia Dortmund",
    "Borussia Mönchengladbach", "Eintracht Frankfurt", "FC Köln", "Freiburg",
    "Hamburger SV", "Elversberg", "Hoffenheim", "Mainz 05", "RB Leipzig",
    "Paderborn 07", "Schalke 04", "Union Berlin", "VfB Stuttgart", "Werder Bremen"
  ],
  "Serie A": [
    "Atalanta", "Bologna", "Cagliari", "Como", "Torino", "Fiorentina", "Frosinone",
    "Genoa", "Udinese", "Inter", "Juventus", "Lazio", "Lecce", "AC Milan", "Monza",
    "Napoli", "Parma", "Venezia", "Roma", "Sassuolo"
  ],
  "Ligue 1": [
    "Angers", "Auxerre", "Brest", "Lens", "Lille", "Lorient", "Lyon", "Marseille",
    "Le Mans", "Monaco", "Troyes", "Nice", "Paris FC", "Paris Saint-Germain",
    "Rennes", "Strasbourg", "Toulouse", "Le Havre"
  ],
};

const VALID_CLUBS = new Set();
for (const [league, clubs] of Object.entries(CAREER_LEAGUE_TEAMS)) {
  for (const club of clubs) {
    VALID_CLUBS.add(`${league.toLowerCase()}:${club.toLowerCase()}`);
  }
}

export const PLAYER_DATABASE_HEADERS = [
  "player_id",
  "full_name",
  "display_name",
  "first_name",
  "last_name",
  "nickname",
  "date_of_birth",
  "nationality",
  "league",
  "club",
  "position",
  "alternate_positions",
  "overall",
  "potential",
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physicality",
  "gk_diving",
  "gk_handling",
  "gk_kicking",
  "gk_reflexes",
  "gk_positioning",
  "gk_speed",
  "weak_foot",
  "skill_moves",
  "preferred_foot",
  "height_cm",
  "weight_kg",
  "shirt_number",
  "development_traits",
  "personality",
  "market_value_eur",
  "weekly_wage_eur",
  "contract_start_date",
  "contract_expiry_date",
  "release_clause_eur",
  "loan_status",
  "loan_parent_club",
  "data_source",
  "data_status",
  "last_verified",
];

export const PLAYER_DATABASE_LEAGUES = [
  "Premier League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
];

const numericFields = [
  "overall",
  "potential",
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physicality",
  "gk_diving",
  "gk_handling",
  "gk_kicking",
  "gk_reflexes",
  "gk_positioning",
  "gk_speed",
  "weak_foot",
  "skill_moves",
  "height_cm",
  "weight_kg",
  "shirt_number",
  "market_value_eur",
  "weekly_wage_eur",
  "release_clause_eur",
];
const ratingFields = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physicality",
];
const positionSet = new Set(POSITIONS.map(normalizePosition));

function numberOrNull(value) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function dateIndex(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const index = toDayIndex(year, month, day);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? index
    : null;
}

function splitList(value) {
  return String(value ?? "")
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** The six EA-style goalkeeper columns read from the CSV (may be absent). */
const GK_COLUMN_BY_ATTRIBUTE = {
  gk_diving: "diving",
  gk_handling: "handling",
  gk_kicking: "kicking",
  gk_reflexes: "reflexes",
  gk_positioning: "positioning",
  gk_speed: "speed",
};

/**
 * Map the CSV columns into the engine's goalkeeper attribute set.
 * Rows whose GK columns are blank (or zero where zero is not a real value) fall back
 * to a clearly-labelled estimation derived from the outfield profile and OVR, so an
 * imported keeper never silently receives zeros.
 */
export function goalkeeperAttributesFromRecord(record, numeric, position) {
  const supplied = {};
  for (const [column, attribute] of Object.entries(GK_COLUMN_BY_ATTRIBUTE)) {
    const value = numeric[column];
    if (Number.isFinite(value) && value >= 1 && value <= 99) supplied[attribute] = value;
  }
  const fallbackSource = {
    overall: numeric.overall,
    pace: numeric.pace,
    shooting: numeric.shooting,
    passing: numeric.passing,
    dribbling: numeric.dribbling,
    defending: numeric.defending,
    physical: numeric.physicality,
    height: numeric.height_cm,
  };
  const { attributes, estimated, method } = estimateGoalkeeperAttributes(supplied, fallbackSource);
  return { attributes, estimated, method, suppliedCount: Object.keys(supplied).length };
}

function normalizeRecord(record) {
  const position = normalizePosition(record.position);
  const numeric = Object.fromEntries(
    numericFields.map((key) => [key, numberOrNull(record[key])]),
  );
  const dateOfBirth = String(record.date_of_birth ?? "").trim();
  const parsedBirthDate = dateIndex(dateOfBirth);
  const age = parsedBirthDate != null ? Math.floor((SEASON_START_DAY_INDEX - parsedBirthDate) / 365.25) : null;
  const traits = splitList(record.development_traits);
  const dataStatus = String(record.data_status ?? "").trim();
  const dataSource = String(record.data_source ?? "").trim();
  const id = String(record.player_id ?? "").trim();
  const league = String(record.league ?? "").trim();
  const sourceClub = String(record.club ?? "").trim();
  const club =
    league === "Premier League" &&
    sourceClub.toLocaleLowerCase() === "ipswich"
      ? "Ipswich Town"
      : sourceClub;
  const nationality = String(record.nationality ?? "").trim().toUpperCase() || null;
  // Names are resolved through the identity module: never a blind first-space split.
  const identity = playerIdentity({
    playerId: id,
    fullName: String(record.full_name ?? "").trim(),
    firstName: String(record.first_name ?? "").trim(),
    lastName: String(record.last_name ?? "").trim(),
    displayName: String(record.display_name ?? "").trim(),
    nickname: String(record.nickname ?? "").trim() || null,
    nationality,
    dateOfBirth,
    club,
    league,
    position,
    source: "player-database",
  });
  const alternatePositions = [
    ...new Set(
      splitList(record.alternate_positions)
        .map(normalizePosition)
        .filter((alternate) => alternate !== position),
    ),
  ];
  const sourceStatus = dataStatus.toLowerCase();
  const goalkeeper = position === "GK"
    ? goalkeeperAttributesFromRecord(record, numeric, position)
    : null;
  return {
    ...record,
    ...numeric,
    id,
    playerId: id,
    first: identity.first,
    last: identity.last,
    fullName: identity.fullName,
    displayName: identity.displayName,
    nickname: identity.nickname,
    identityKey: identity.identityKey,
    strongIdentityKey: identity.strongIdentityKey,
    dob: parsedBirthDate,
    age,
    nationality,
    league,
    clubName: club,
    position,
    altPositions: alternatePositions,
    overall: numeric.overall,
    potential: numeric.potential,
    attrs: {
      pace: numeric.pace,
      shooting: numeric.shooting,
      passing: numeric.passing,
      dribbling: numeric.dribbling,
      defending: numeric.defending,
      physical: numeric.physicality,
    },
    gkAttrs: goalkeeper?.attributes ?? null,
    gkAttributesEstimated: goalkeeper?.estimated ?? false,
    gkEstimationMethod: goalkeeper?.method ?? null,
    shirtNumber: numeric.shirt_number,
    foot: String(record.preferred_foot ?? "").trim() || null,
    weakFoot: numeric.weak_foot,
    skillMoves: numeric.skill_moves,
    height: numeric.height_cm,
    weight: numeric.weight_kg,
    traits,
    personality: String(record.personality ?? "").trim() || null,
    value: numeric.market_value_eur,
    wage: numeric.weekly_wage_eur,
    contractStartDate: String(record.contract_start_date ?? "").trim() || null,
    contractExpiryDate: String(record.contract_expiry_date ?? "").trim() || null,
    releaseClause: numeric.release_clause_eur,
    loanStatus: String(record.loan_status ?? "").trim() || null,
    loanParentClub: String(record.loan_parent_club ?? "").trim() || null,
    dataSource,
    dataStatus,
    lastVerified: String(record.last_verified ?? "").trim() || null,
    source: sourceStatus.includes("generated")
      ? "generated"
      : id
        ? "real-world"
        : dataSource,
  };
}

export function validatePlayerDatabase(records, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const identityRows = new Map();
  const identityRecords = new Map();
  const nameRows = new Map();
  const shirts = new Map();
  const criticalFields = [
    "height_cm",
    "weight_kg",
    "shirt_number",
    "market_value_eur",
    "weekly_wage_eur",
    "contract_start_date",
    "contract_expiry_date",
    "release_clause_eur",
    "development_traits",
    "personality",
  ];

  records.forEach((record, index) => {
    const row = index + 2;
    const normalized = normalizeRecord(record);
    if (!normalized.playerId) errors.push(`Row ${row}: player_id is required.`);
    else if (ids.has(normalized.playerId))
      errors.push(`Row ${row}: duplicate player_id "${normalized.playerId}".`);
    else ids.add(normalized.playerId);
    if (!normalized.displayName)
      errors.push(`Row ${row}: display_name is required.`);
    // A single token is fine when it is a genuine football nickname (Alisson, Pedri...).
    if (!normalized.first && !normalized.nickname)
      warnings.push(`Row ${row}: first_name is missing and no nickname is recorded.`);
    if (!normalized.last)
      warnings.push(`Row ${row}: last_name is missing.`);
    if (
      normalized.fullName &&
      normalized.last &&
      !nameKey(normalized.fullName).endsWith(nameKey(normalized.last)) &&
      !nameKey(normalized.fullName).includes(nameKey(normalized.last))
    )
      warnings.push(
        `Row ${row}: full_name "${normalized.fullName}" does not contain last name "${normalized.last}".`,
      );
    if (!PLAYER_DATABASE_LEAGUES.includes(normalized.league))
      errors.push(`Row ${row}: unsupported league "${normalized.league}".`);
    if (!normalized.clubName) errors.push(`Row ${row}: club is required.`);
    if (!positionSet.has(normalized.position))
      errors.push(`Row ${row}: unsupported position "${record.position}".`);
    for (const alternate of normalized.altPositions) {
      if (!positionSet.has(alternate))
        errors.push(`Row ${row}: unsupported alternate position "${alternate}".`);
      if (alternate === normalized.position)
        warnings.push(`Row ${row}: alternate position repeats the main position.`);
    }
    for (const field of ["overall", "potential"]) {
      const value = normalized[field];
      if (!Number.isFinite(value) || value < 1 || value > 99)
        errors.push(`Row ${row}: ${field} must be a number from 1 to 99.`);
    }
    for (const field of numericFields) {
      const value = normalized[field];
      if (Number.isNaN(value))
        errors.push(`Row ${row}: ${field} must be numeric when supplied.`);
    }
    for (const field of ratingFields) {
      const value = normalized[field];
      if (value != null && (value < 1 || value > 99))
        errors.push(`Row ${row}: ${field} must be from 1 to 99.`);
    }
    if (
      Number.isFinite(normalized.overall) &&
      Number.isFinite(normalized.potential) &&
      normalized.overall > normalized.potential
    )
      errors.push(`Row ${row}: overall must not exceed potential.`);
    for (const field of [
      "date_of_birth",
      "contract_start_date",
      "contract_expiry_date",
      "last_verified",
    ]) {
      if (record[field] && dateIndex(record[field]) == null)
        errors.push(`Row ${row}: ${field} must be a valid YYYY-MM-DD date.`);
    }
    if (
      record.contract_start_date &&
      record.contract_expiry_date &&
      record.contract_start_date > record.contract_expiry_date
    )
      errors.push(`Row ${row}: contract_start_date is after contract_expiry_date.`);
    if (
      normalized.nationality &&
      !/^[A-Z]{3}$/.test(normalized.nationality)
    )
      errors.push(`Row ${row}: nationality must be a three-letter country code.`);
    for (const field of ["weak_foot", "skill_moves"]) {
      const value = normalized[field];
      if (value != null && (!Number.isInteger(value) || value < 1 || value > 5))
        errors.push(`Row ${row}: ${field} must be an integer from 1 to 5.`);
    }
    for (const field of [
      "height_cm",
      "weight_kg",
      "market_value_eur",
      "weekly_wage_eur",
      "release_clause_eur",
    ]) {
      const value = normalized[field];
      if (value != null && value < 0)
        errors.push(`Row ${row}: ${field} cannot be negative.`);
    }

    // Validate age range
    if (normalized.age != null && (normalized.age < 15 || normalized.age > 45)) {
      warnings.push(`Row ${row}: age ${normalized.age} is outside typical range (15-45).`);
    }

    // Validate club membership against career-league-teams.json
    if (normalized.league && normalized.clubName) {
      const clubKey = `${normalized.league.toLowerCase()}:${normalized.clubName.toLowerCase()}`;
      if (!VALID_CLUBS.has(clubKey)) {
        if (strict) {
          errors.push(`Row ${row}: club "${normalized.clubName}" not found in ${normalized.league} career league configuration.`);
        } else {
          warnings.push(`Row ${row}: club "${normalized.clubName}" not found in ${normalized.league} career league configuration.`);
        }
      }
    }

    // Validate attribute ranges per position group
    const posGroup = POSITION_GROUPS.GK.includes(normalized.position) ? "GK" :
      POSITION_GROUPS.DEF.includes(normalized.position) ? "DEF" :
      POSITION_GROUPS.MID.includes(normalized.position) ? "MID" : "ATT";
    if (posGroup === "GK") {
      // A keeper is judged on his keeper attributes. Outfield columns may exist for
      // display, but a genuine keeper must never be left without a goalkeeping line.
      if (!hasGoalkeeperAttributes(normalized.gkAttrs))
        errors.push(`Row ${row}: goalkeeper has no usable goalkeeping attributes.`);
      for (const attribute of GOALKEEPER_ATTRIBUTES) {
        const value = normalized.gkAttrs?.[attribute];
        if (!Number.isFinite(value) || value < 1 || value > 99)
          errors.push(`Row ${row}: goalkeeper ${attribute} must be from 1 to 99.`);
      }
    } else {
      const keyAttrs = posGroup === "DEF" ? ["defending", "physicality"] :
        posGroup === "MID" ? ["passing", "dribbling"] : ["shooting", "pace"];
      for (const attr of keyAttrs) {
        const value = normalized.attrs?.[attr] ?? normalized[attr];
        if (value != null && (value < 1 || value > 99)) {
          errors.push(`Row ${row}: ${attr} must be from 1 to 99 for ${posGroup} player.`);
        }
      }
    }

    if (!normalized.dataSource)
      errors.push(`Row ${row}: data_source is required.`);
    if (!normalized.dataStatus)
      errors.push(`Row ${row}: data_status is required.`);

    // Warnings for missing critical fields (only in strict mode)
    if (strict) {
      const missingCritical = criticalFields.filter(field => !String(record[field] ?? "").trim());
      if (missingCritical.length > 0) {
        warnings.push(`Row ${row}: missing critical fields: ${missingCritical.join(", ")}.`);
      }
    }

    // Duplicate detection uses stable identity keys, not accent/spacing-sensitive text.
    const identity = normalized.strongIdentityKey;
    const prior = identityRows.get(identity);
    if (prior) {
      const priorRecord = identityRecords.get(identity);
      if (priorRecord && matchPlayerIdentity(priorRecord, normalized))
        warnings.push(
          `Row ${row}: same player identity as row ${prior} (${normalized.displayName}).`,
        );
    } else {
      identityRows.set(identity, row);
      identityRecords.set(identity, normalized);
    }
    // Same name with *conflicting* evidence (different club/nation/DOB) is two humans.
    const nameOnly = nameKey(normalized.displayName);
    const priorName = nameRows.get(nameOnly);
    if (priorName && !prior && normalized.playerId !== priorName.playerId) {
      if (!matchPlayerIdentity(priorName, normalized))
        warnings.push(
          `Row ${row}: "${normalized.displayName}" matches row ${priorName.playerId}'s name but has conflicting identity data; kept as a separate player.`,
        );
    } else if (!priorName) {
      nameRows.set(nameOnly, normalized);
    }

    if (
      Number.isInteger(normalized.shirtNumber) &&
      normalized.clubName &&
      normalized.shirtNumber >= 1 &&
      normalized.shirtNumber <= 99
    ) {
      const key = `${normalized.league}:${normalized.clubName}:${normalized.shirtNumber}`;
      if (shirts.has(key))
        errors.push(
          `Row ${row}: shirt number ${normalized.shirtNumber} is duplicated at ${normalized.clubName}.`,
        );
      else shirts.set(key, row);
    } else if (normalized.shirtNumber != null) {
      errors.push(`Row ${row}: shirt_number must be an integer from 1 to 99.`);
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}

export function playerDatabaseReport(records) {
  const byLeague = Object.fromEntries(
    PLAYER_DATABASE_LEAGUES.map((league) => {
      const players = records.filter((record) => record.league === league);
      return [
        league,
        {
          players: players.length,
          clubs: new Set(players.map((record) => record.club)).size,
        },
      ];
    }),
  );
  const missingFields = Object.fromEntries(
    PLAYER_DATABASE_HEADERS
      .filter((field) => !["player_id", "display_name"].includes(field))
      .map((field) => [
        field,
        records.filter((record) => !String(record[field] ?? "").trim()).length,
      ])
      .filter(([, count]) => count > 0),
  );
  const estimatedCandidates = records
    .filter((record) => /estimate|unverified|verification/i.test(record.data_status ?? ""));
  const estimatedRecords = estimatedCandidates
    .slice(0, 20)
    .map((record) => ({
      playerId: record.player_id,
      player: record.display_name,
      league: record.league,
      club: record.club,
      status: record.data_status,
    }));
  const verifiedRecordCount = records.filter((record) =>
    /\bverified\b/i.test(record.data_status ?? "") &&
    !/\bunverified\b/i.test(record.data_status ?? ""),
  ).length;
  return {
    totalPlayers: records.length,
    totalClubs: new Set(records.map((record) => `${record.league}:${record.club}`)).size,
    byLeague,
    missingFields,
    estimatedRecordCount: estimatedCandidates.length,
    estimatedRecords,
    unverifiedRecordCount: records.filter((record) =>
      /unverified|verification/i.test(record.data_status ?? ""),
    ).length,
    verifiedRecordCount,
  };
}

export function parsePlayerDatabaseCsv(text, { strict = false } = {}) {
  const records = parseCsvRows(text);
  const missingHeaders = PLAYER_DATABASE_HEADERS.filter(
    (field) => !Object.hasOwn(records[0] ?? {}, field),
  );
  if (missingHeaders.length)
    throw new Error(
      `Player database is missing columns: ${missingHeaders.join(", ")}.`,
    );

  const validation = validatePlayerDatabase(records, { strict });
  if (!validation.valid)
    throw new Error(`Invalid player database:\n${validation.errors.join("\n")}`);

  const players = records.map(normalizeRecord);
  const byId = new Map(players.map((player) => [player.playerId, player]));
  const byName = new Map();
  const byNormalizedName = new Map();
  const byIdentity = new Map();
  const byLeague = new Map();
  const byClub = new Map();
  for (const player of players) {
    const nameKey = player.displayName.toLocaleLowerCase();
    const normalizedName = normalizeText(player.displayName);
    const leagueKey = player.league.toLocaleLowerCase();
    const clubKey = `${leagueKey}:${player.clubName.toLocaleLowerCase()}`;
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(player);
    // Accent/spacing-insensitive lookup for imports with different formatting.
    if (!byNormalizedName.has(normalizedName)) byNormalizedName.set(normalizedName, []);
    byNormalizedName.get(normalizedName).push(player);
    if (!byIdentity.has(player.strongIdentityKey)) byIdentity.set(player.strongIdentityKey, []);
    byIdentity.get(player.strongIdentityKey).push(player);
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, []);
    byLeague.get(leagueKey).push(player);
    if (!byClub.has(clubKey)) byClub.set(clubKey, []);
    byClub.get(clubKey).push(player);
  }
  return {
    players,
    byId,
    byName,
    byNormalizedName,
    byIdentity,
    byLeague,
    byClub,
    report: playerDatabaseReport(records),
    warnings: validation.warnings,
  };
}

export function migrateLegacyPlayerDatabase({
  ratingsCsv,
  clubLeagues,
  existingCsv = "",
  parseLegacyRoster,
}) {
  if (typeof parseLegacyRoster !== "function")
    throw new Error("A legacy roster parser is required for migration.");
  const imported = parseLegacyRoster(ratingsCsv, clubLeagues);
  const rawRows = parseCsvRows(ratingsCsv);
  const existingRows = existingCsv.trim()
    ? parseCsvRows(existingCsv)
    : [];
  const identityForPlayerId = new Map(
    imported.map((player) => {
      const clubId = String(player.clubName)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return [
        `real-${clubId}-${player.id}`,
        `${player.league.toLocaleLowerCase()}:${player.clubName.toLocaleLowerCase()}:${player.displayName.toLocaleLowerCase()}`,
      ];
    }),
  );
  const existingByIdentity = new Map();
  const existingById = new Map();
  const merged = [];
  const duplicateSourceRows = [];
  for (const record of existingRows) {
    const identity =
      identityForPlayerId.get(record.player_id) ??
      `${record.league.toLocaleLowerCase()}:${record.club.toLocaleLowerCase()}:${record.display_name.toLocaleLowerCase()}`;
    const prior = existingByIdentity.get(identity);
    if (prior) {
      for (const field of PLAYER_DATABASE_HEADERS) {
        if (!String(prior[field] ?? "").trim() && record[field] !== "")
          prior[field] = record[field];
      }
      continue;
    }
    existingByIdentity.set(identity, record);
    existingById.set(record.player_id, record);
    merged.push(record);
  }

  for (const player of imported) {
    const rawIndex = Number(/^fc25-(\d+)-/.exec(player.id)?.[1]);
    const source = rawRows[rawIndex];
    if (!source) throw new Error(`Missing legacy CSV row for ${player.id}.`);
    const clubId = String(player.clubName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const playerId = `real-${clubId}-${player.id}`;
    const fresh = Object.fromEntries(
      PLAYER_DATABASE_HEADERS.map((field) => [field, ""]),
    );
    Object.assign(fresh, {
      player_id: playerId,
      full_name: player.fullName ?? player.displayName,
      display_name: player.displayName,
      first_name: player.first,
      last_name: player.last,
      nickname: player.nickname ?? "",
      nationality: String(source.nationality ?? "").trim(),
      league: player.league,
      club: player.clubName,
      position: player.position,
      overall: source.overall_rating,
      potential: source.potential,
      pace: source.pace,
      shooting: source.shooting,
      passing: source.passing,
      dribbling: source.dribbling,
      defending: source.defending,
      physicality: source.physicality,
      weak_foot: source.weak_foot,
      skill_moves: source.skill_moves,
      data_source: "data/squads/fc26_player_ratings.csv",
      data_status:
        String(source.data_status ?? "").trim() ||
        "Unverified: migrated from a legacy ratings import.",
    });

    const identity = `${player.league.toLocaleLowerCase()}:${player.clubName.toLocaleLowerCase()}:${player.displayName.toLocaleLowerCase()}`;
    const existing = existingById.get(playerId) ?? existingByIdentity.get(identity);
    if (existing) {
      if (existingByIdentity.has(identity) && !existingById.has(playerId)) {
        duplicateSourceRows.push({
          player: player.displayName,
          club: player.clubName,
          discardedId: playerId,
          keptId: existing.player_id,
        });
      }
      for (const field of PLAYER_DATABASE_HEADERS) {
        if (!String(existing[field] ?? "").trim() && fresh[field] !== "")
          existing[field] = fresh[field];
      }
      if (!existing.player_id) existing.player_id = playerId;
      existingById.set(existing.player_id, existing);
      continue;
    }
    merged.push(fresh);
    existingById.set(playerId, fresh);
    existingByIdentity.set(identity, fresh);
  }

  for (const record of merged) {
    for (const field of ratingFields) {
      const value = String(record[field] ?? "").trim();
      if (value && Number(value) === 0) record[field] = "";
    }
    // Backfill the identity columns for pre-existing rows, without overwriting data.
    if (!String(record.full_name ?? "").trim())
      record.full_name = `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim();
    if (!String(record.nickname ?? "").trim()) {
      const identity = playerIdentity({
        fullName: record.full_name,
        firstName: record.first_name,
        lastName: record.last_name,
        displayName: record.display_name,
        nationality: record.nationality,
        dateOfBirth: record.date_of_birth,
        club: record.club,
        league: record.league,
        position: record.position,
      });
      record.first_name = identity.first || record.first_name;
      record.last_name = identity.last || record.last_name;
      record.display_name = identity.displayName || record.display_name;
      record.nickname = identity.nickname ?? "";
    }
    // Give goalkeepers a complete, non-zero goalkeeping line.
    if (normalizePosition(record.position) === "GK") {
      const numeric = Object.fromEntries(
        ["overall", "pace", "shooting", "passing", "dribbling", "defending", "physicality",
          "height_cm", "gk_diving", "gk_handling", "gk_kicking", "gk_reflexes",
          "gk_positioning", "gk_speed"].map((field) => [field, numberOrNull(record[field])]),
      );
      const supplied = {};
      for (const [column, attribute] of Object.entries({
        gk_diving: "diving",
        gk_handling: "handling",
        gk_kicking: "kicking",
        gk_reflexes: "reflexes",
        gk_positioning: "positioning",
        gk_speed: "speed",
      })) {
        const value = numeric[column];
        if (Number.isFinite(value) && value >= 1 && value <= 99) supplied[attribute] = value;
      }
      const { attributes } = estimateGoalkeeperAttributes(supplied, numeric);
      for (const attribute of DIRECT_GOALKEEPER_ATTRIBUTES) {
        const column = `gk_${attribute}`;
        if (!String(record[column] ?? "").trim() || Number(record[column]) === 0)
          record[column] = String(Math.round(attributes[attribute]));
      }
    }
  }

  const validation = validatePlayerDatabase(merged);
  if (!validation.valid)
    throw new Error(`Invalid migrated database:\n${validation.errors.join("\n")}`);
  return {
    csv: serializeCsvRows(PLAYER_DATABASE_HEADERS, merged),
    report: playerDatabaseReport(merged),
    warnings: validation.warnings,
    sourceRows: imported.length,
    duplicateSourceRows,
  };
}
