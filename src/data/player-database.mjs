import { toDayIndex } from "../core/calendar.mjs";
import { normalizePosition, POSITIONS } from "../core/constants.mjs";
import { parseCsvRows, serializeCsvRows } from "./csv.mjs";

export const PLAYER_DATABASE_HEADERS = [
  "player_id",
  "display_name",
  "first_name",
  "last_name",
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
  "weak_foot",
  "skill_moves",
  "height_cm",
  "weight_kg",
  "shirt_number",
  "market_value_eur",
  "weekly_wage_eur",
  "release_clause_eur",
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

function normalizeRecord(record) {
  const position = normalizePosition(record.position);
  const numeric = Object.fromEntries(
    numericFields.map((key) => [key, numberOrNull(record[key])]),
  );
  const dateOfBirth = String(record.date_of_birth ?? "").trim();
  const parsedBirthDate = dateIndex(dateOfBirth);
  const traits = splitList(record.development_traits);
  const dataStatus = String(record.data_status ?? "").trim();
  const dataSource = String(record.data_source ?? "").trim();
  const id = String(record.player_id ?? "").trim();
  const club = String(record.club ?? "").trim();
  const league = String(record.league ?? "").trim();
  const displayName = String(record.display_name ?? "").trim();
  const first = String(record.first_name ?? "").trim();
  const last = String(record.last_name ?? "").trim();
  const alternatePositions = splitList(record.alternate_positions).map(
    normalizePosition,
  );
  const sourceStatus = dataStatus.toLowerCase();
  return {
    ...record,
    ...numeric,
    id,
    playerId: id,
    first,
    last,
    displayName,
    dob: parsedBirthDate,
    age: null,
    nationality: String(record.nationality ?? "").trim() || null,
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
    source: sourceStatus.includes("real player") ? "real-world" : dataSource,
  };
}

export function validatePlayerDatabase(records) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const identityRows = new Map();
  const shirts = new Map();

  records.forEach((record, index) => {
    const row = index + 2;
    const normalized = normalizeRecord(record);
    if (!normalized.playerId) errors.push(`Row ${row}: player_id is required.`);
    else if (ids.has(normalized.playerId))
      errors.push(`Row ${row}: duplicate player_id "${normalized.playerId}".`);
    else ids.add(normalized.playerId);
    if (!normalized.displayName)
      errors.push(`Row ${row}: display_name is required.`);
    if (!normalized.first || !normalized.last)
      warnings.push(`Row ${row}: first_name or last_name is missing.`);
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
    if (!normalized.dataSource)
      errors.push(`Row ${row}: data_source is required.`);
    if (!normalized.dataStatus)
      errors.push(`Row ${row}: data_status is required.`);

    const identity = `${normalized.league.toLowerCase()}:${normalized.clubName.toLowerCase()}:${normalized.displayName.toLocaleLowerCase()}`;
    if (identityRows.has(identity))
      warnings.push(
        `Row ${row}: same player name and club as row ${identityRows.get(identity)}.`,
      );
    else identityRows.set(identity, row);

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
  const estimatedRecords = records
    .filter((record) => /estimate|unverified/i.test(record.data_status ?? ""))
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
    estimatedRecordCount: estimatedRecords.length,
    estimatedRecords,
    verifiedRecordCount,
  };
}

export function parsePlayerDatabaseCsv(text) {
  const records = parseCsvRows(text);
  const missingHeaders = PLAYER_DATABASE_HEADERS.filter(
    (field) => !Object.hasOwn(records[0] ?? {}, field),
  );
  if (missingHeaders.length)
    throw new Error(
      `Player database is missing columns: ${missingHeaders.join(", ")}.`,
    );

  const validation = validatePlayerDatabase(records);
  if (!validation.valid)
    throw new Error(`Invalid player database:\n${validation.errors.join("\n")}`);

  const players = records.map(normalizeRecord);
  const byId = new Map(players.map((player) => [player.playerId, player]));
  const byName = new Map();
  const byLeague = new Map();
  const byClub = new Map();
  for (const player of players) {
    const nameKey = player.displayName.toLocaleLowerCase();
    const leagueKey = player.league.toLocaleLowerCase();
    const clubKey = `${leagueKey}:${player.clubName.toLocaleLowerCase()}`;
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(player);
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, []);
    byLeague.get(leagueKey).push(player);
    if (!byClub.has(clubKey)) byClub.set(clubKey, []);
    byClub.get(clubKey).push(player);
  }
  return {
    players,
    byId,
    byName,
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
      display_name: player.displayName,
      first_name: player.first,
      last_name: player.last,
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
