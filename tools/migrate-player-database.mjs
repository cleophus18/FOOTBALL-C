import { readFile, writeFile } from "node:fs/promises";
import {
  migrateLegacyPlayerDatabase,
  parsePlayerDatabaseCsv,
} from "../src/data/player-database.mjs";
import { parseFc26RatingsCsv } from "../src/data/fc25-roster.mjs";

const databaseUrl = new URL("../data/squads/touchline_player_database.csv", import.meta.url);

function printReport(report, warnings = []) {
  console.log(JSON.stringify({ ...report, warnings }, null, 2));
}

if (process.argv.includes("--migrate")) {
  const [ratingsCsv, clubLeaguesJson] = await Promise.all([
    readFile(new URL("../data/squads/fc26_player_ratings.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/fc26-club-leagues.json", import.meta.url), "utf8"),
  ]);
  let existingCsv = "";
  try {
    existingCsv = await readFile(databaseUrl, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const migrated = migrateLegacyPlayerDatabase({
    ratingsCsv,
    clubLeagues: JSON.parse(clubLeaguesJson),
    existingCsv,
    parseLegacyRoster: parseFc26RatingsCsv,
  });
  await writeFile(databaseUrl, migrated.csv, "utf8");
  printReport(
    {
      ...migrated.report,
      sourceRows: migrated.sourceRows,
      duplicateSourceRowsSkipped: migrated.duplicateSourceRows,
    },
    migrated.warnings,
  );
} else {
  const csv = await readFile(databaseUrl, "utf8");
  const { report, warnings } = parsePlayerDatabaseCsv(csv);
  printReport(report, warnings);
}
