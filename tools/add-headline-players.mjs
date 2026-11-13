/**
 * One-off maintenance script: add the two headline real-world players the game's
 * "requested club" fiction places in the five playable leagues, so the canonical
 * loader (which reads only the master player database) exposes them like every other
 * imported player.
 *
 * Run: node tools/add-headline-players.mjs [--write]
 */
import { readFile, writeFile } from "node:fs/promises";
import {
  PLAYER_DATABASE_HEADERS,
  parsePlayerDatabaseCsv,
  validatePlayerDatabase,
} from "../src/data/player-database.mjs";
import { parseCsvRows, serializeCsvRows } from "../src/data/csv.mjs";

const CSV_URL = new URL(
  "../data/squads/touchline_player_database.csv",
  import.meta.url,
);

const HEADLINERS = [
  {
    player_id: "fc26_900001",
    full_name: "Lionel Messi",
    display_name: "Lionel Messi",
    first_name: "Lionel",
    last_name: "Messi",
    nickname: "Leo Messi",
    date_of_birth: "1987-06-24",
    nationality: "ARG",
    league: "La Liga",
    club: "FC Barcelona",
    position: "RW",
    alternate_positions: "CAM;ST;LW",
    overall: "94",
    potential: "94",
    pace: "80",
    shooting: "93",
    passing: "94",
    dribbling: "95",
    defending: "40",
    physicality: "68",
    weak_foot: "4",
    skill_moves: "4",
    preferred_foot: "Left",
    height_cm: "170",
    weight_kg: "72",
    shirt_number: "10",
    data_source: "Real player; FC-style estimate; requested club placement",
    data_status:
      "Imported source data; club membership and ratings require independent verification",
  },
  {
    player_id: "fc26_900002",
    full_name: "Cristiano Ronaldo",
    display_name: "Cristiano Ronaldo",
    first_name: "Cristiano",
    last_name: "Ronaldo",
    nickname: "CR7",
    date_of_birth: "1985-02-05",
    nationality: "POR",
    league: "Premier League",
    club: "Manchester United",
    position: "ST",
    alternate_positions: "LW;RW",
    overall: "94",
    potential: "94",
    pace: "84",
    shooting: "95",
    passing: "80",
    dribbling: "90",
    defending: "38",
    physicality: "86",
    weak_foot: "4",
    skill_moves: "5",
    preferred_foot: "Right",
    height_cm: "187",
    weight_kg: "83",
    shirt_number: "7",
    data_source: "Real player; FC-style estimate; requested club placement",
    data_status:
      "Imported source data; club membership and ratings require independent verification",
  },
];

const write = process.argv.includes("--write");
const text = await readFile(CSV_URL, "utf8");
const parsed = parsePlayerDatabaseCsv(text);
const existing = new Set(parsed.players.map((player) => player.playerId));
const rows = parseCsvRows(text);

const added = [];
for (const headliner of HEADLINERS) {
  if (existing.has(headliner.player_id)) {
    console.log(`skip ${headliner.player_id}: already present`);
    continue;
  }
  const row = Object.fromEntries(
    PLAYER_DATABASE_HEADERS.map((header) => [header, ""]),
  );
  Object.assign(row, headliner);
  rows.push(row);
  added.push(headliner);
  console.log(`add  ${headliner.player_id} ${headliner.full_name} (${headliner.club})`);
}

if (!added.length) {
  console.log("nothing to do");
  process.exit(0);
}

const csv = serializeCsvRows(PLAYER_DATABASE_HEADERS, rows);
const reparsed = parsePlayerDatabaseCsv(csv, { strict: true });
const validation = validatePlayerDatabase(parseCsvRows(csv), { strict: true });
console.log(
  `players ${parsed.players.length} -> ${reparsed.players.length}, warnings ${validation.warnings.length}, errors ${validation.errors.length}`,
);
if (!validation.valid) {
  console.error(validation.errors.join("\n"));
  process.exit(1);
}

if (!write) {
  console.log("dry run; pass --write to persist");
  process.exit(0);
}
await writeFile(CSV_URL, csv, "utf8");
console.log("written");