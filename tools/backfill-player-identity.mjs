/**
 * One-time, non-destructive backfill of the master player database.
 *
 * Adds the identity columns (full_name, nickname) and the goalkeeper columns
 * (gk_diving ... gk_speed) to touchline_player_database.csv while preserving every
 * existing value and every existing row. Goalkeeper values are estimated from OVR and
 * the player's physical profile where the source sheet has none; the data_status field
 * is updated so the estimate is never presented as verified data.
 *
 * Usage: node tools/backfill-player-identity.mjs [--write]
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  PLAYER_DATABASE_HEADERS,
  parsePlayerDatabaseCsv,
} from "../src/data/player-database.mjs";
import { parseCsvRows, serializeCsvRows } from "../src/data/csv.mjs";
import { playerIdentity, nameKey } from "../src/model/identity.mjs";
import {
  DIRECT_GOALKEEPER_ATTRIBUTES,
  estimateGoalkeeperAttributes,
  hasGoalkeeperAttributes,
} from "../src/model/goalkeeper.mjs";
import { normalizePosition } from "../src/core/constants.mjs";

const databaseUrl = new URL("../data/squads/touchline_player_database.csv", import.meta.url);
const csv = await readFile(databaseUrl, "utf8");
const rows = parseCsvRows(csv);

let identityBackfilled = 0;
let gkBackfilled = 0;

for (const record of rows) {
  const position = normalizePosition(record.position);
  const identity = playerIdentity({
    playerId: record.player_id,
    fullName: record.full_name,
    firstName: record.first_name,
    lastName: record.last_name,
    displayName: record.display_name,
    nickname: record.nickname,
    nationality: record.nationality,
    dateOfBirth: record.date_of_birth,
    club: record.club,
    league: record.league,
    position,
  });
  if (!String(record.full_name ?? "").trim()) {
    record.full_name = identity.fullName;
    identityBackfilled++;
  }
  if (!String(record.nickname ?? "").trim() && identity.nickname) {
    record.nickname = identity.nickname;
    identityBackfilled++;
  }
  // Keep first/last in step with the resolved identity (fixes the first-space split).
  if (String(record.first_name ?? "").trim() !== identity.first ||
      String(record.last_name ?? "").trim() !== identity.last) {
    if (identity.first) record.first_name = identity.first;
    if (identity.last) record.last_name = identity.last;
    identityBackfilled++;
  }

  if (position === "GK") {
    const numeric = {};
    for (const field of [
      "overall", "pace", "shooting", "passing", "dribbling", "defending",
      "physicality", "height_cm",
    ]) {
      const parsed = Number(String(record[field] ?? "").replace(/,/g, "").trim());
      numeric[field] = Number.isFinite(parsed) ? parsed : null;
    }
    const supplied = {};
    for (const attribute of DIRECT_GOALKEEPER_ATTRIBUTES) {
      const parsed = Number(String(record[`gk_${attribute}`] ?? "").trim());
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 99)
        supplied[attribute] = parsed;
    }
    const existing = {};
    for (const attribute of DIRECT_GOALKEEPER_ATTRIBUTES)
      existing[attribute] = supplied[attribute];
    if (!hasGoalkeeperAttributes(existing)) {
      const { attributes } = estimateGoalkeeperAttributes({}, numeric);
      for (const attribute of DIRECT_GOALKEEPER_ATTRIBUTES) {
        const column = `gk_${attribute}`;
        if (!String(record[column] ?? "").trim() || Number(record[column]) === 0) {
          record[column] = String(Math.round(attributes[attribute]));
          gkBackfilled++;
        }
      }
      const status = String(record.data_status ?? "").trim();
      if (!/estimated goalkeeping/i.test(status)) {
        record.data_status = status
          ? `${status}. Goalkeeping attributes estimated from OVR and physical profile.`
          : "Goalkeeping attributes estimated from OVR and physical profile.";
      }
    }
  }
}

const normalized = rows.map((record) => {
  const out = {};
  for (const header of PLAYER_DATABASE_HEADERS) out[header] = record[header] ?? "";
  return out;
});

const parsed = parsePlayerDatabaseCsv(
  serializeCsvRows(PLAYER_DATABASE_HEADERS, normalized),
  { strict: true },
);

console.log(
  JSON.stringify(
    {
      rows: rows.length,
      identityBackfilled,
      gkBackfilled,
      players: parsed.players.length,
      warningCount: parsed.warnings.length,
      warningSample: parsed.warnings.slice(0, 10),
    },
    null,
    2,
  ),
);

if (process.argv.includes("--write")) {
  await writeFile(
    databaseUrl,
    serializeCsvRows(PLAYER_DATABASE_HEADERS, normalized),
    "utf8",
  );
  console.log("Wrote data/squads/touchline_player_database.csv");
}