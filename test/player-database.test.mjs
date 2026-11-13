import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCareer } from "../src/career.mjs";
import { transferPlayer } from "../src/core/finance.mjs";
import { loadData } from "../src/data/loader.mjs";
import { parseCsvRows, serializeCsvRows } from "../src/data/csv.mjs";
import {
  migrateLegacyPlayerDatabase,
  PLAYER_DATABASE_HEADERS,
  parsePlayerDatabaseCsv,
  validatePlayerDatabase,
} from "../src/data/player-database.mjs";
import { parseFc26RatingsCsv } from "../src/data/fc25-roster.mjs";

test("central database follows the supplied schema and indexes imported players", async () => {
  const [template, csv] = await Promise.all([
    readFile(new URL("../touchline_player_database_template.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/squads/touchline_player_database.csv", import.meta.url), "utf8"),
  ]);
  assert.deepEqual(template.trim().split(","), PLAYER_DATABASE_HEADERS);

  const parsed = parsePlayerDatabaseCsv(csv);
  // 2786 imported players plus the two headliners the game always keeps (Messi, Ronaldo).
  assert.equal(parsed.players.length, 2788);
  assert.equal(parsed.byId.size, 2788);
  assert.equal(parsed.byName.get("kylian mbappé")[0].overall, 91);
  assert.equal(parsed.byName.get("kylian mbappé")[0].potential, 91);
  assert.equal(parsed.byName.get("erling haaland")[0].attrs.pace, 87);
  assert.equal(parsed.byLeague.get("premier league").length, 613);
  assert.equal(parsed.report.estimatedRecordCount, 2788);
  assert.equal(parsed.report.verifiedRecordCount, 0);
  assert.equal(parsed.report.totalClubs, 96);
  assert.equal(parsed.warnings.length, 0);
  assert.ok(parsed.players.every((player) => player.source === "real-world"));
  assert.equal(
    parsed.byClub.get("premier league:ipswich town").length,
    30,
  );
  assert.ok(
    ["height_cm", "weight_kg", "shirt_number", "market_value_eur", "weekly_wage_eur",
      "contract_expiry_date"].every(
      (field) => parsed.report.missingFields[field] === 2788,
    ),
  );
});

test("central loader uses the canonical player database for new career data", async () => {
  const data = await loadData();
  assert.equal(data.fc25Players.length, 2788);
  assert.deepEqual(data.playerDatabase.incompleteLeagues, []);
  assert.deepEqual(data.playerDatabase.unmatchedClubs, []);
  for (const league of data.careerLeagues) {
    assert.equal(
      Object.keys(league.rostersByClub).length,
      league.league.teamIds.length,
    );
    for (const clubId of league.league.teamIds) {
      const roster = league.rostersByClub[clubId];
      assert.ok(roster.length >= 20, `${league.league.name}/${clubId} depth`);
      assert.ok(
        roster.every(
          (player) =>
            player.league === league.league.name &&
            player.clubName === league.clubIdentities[clubId].name,
        ),
      );
    }
  }
  const league = data.careerLeagues.find(
    (entry) => entry.league.name === "Premier League",
  );
  const career = createCareer(data, {
    first: "Casey",
    last: "Manager",
    age: "25",
    nationality: "ENG",
    height: "180",
    weight: "75",
    foot: "Right",
    weakFoot: "3",
    skillMoves: "3",
    position: "ST",
    archetype: "Poacher",
    startingOverall: "60",
    difficulty: "Realistic",
    clubId: "manchester-city",
    leagueId: league.id,
    seed: 38742,
  });

  const haaland = career.players.find((player) => player.first === "Erling");
  assert.equal(
    haaland.id,
    data.playerDatabase.byName.get("erling haaland")[0].playerId,
  );
  assert.equal(haaland.overall, 91);
  assert.equal(haaland.potential, 93);
  assert.deepEqual(
    haaland.attrs,
    data.playerDatabase.byId.get(haaland.id).attrs,
  );
  assert.equal(
    career.players.some(
      (player) =>
        player.id !== career.player.id &&
        (player.source === "generated" ||
          player.source?.startsWith("generated-")),
    ),
    false,
  );
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  const restoredHaaland = restored.players.find((player) => player.id === haaland.id);
  assert.deepEqual(restoredHaaland.attrs, haaland.attrs);
  assert.equal(restoredHaaland.overall, haaland.overall);
  assert.equal(restoredHaaland.potential, haaland.potential);
});

test("new careers in all five leagues contain only players from the master database", async () => {
  const data = await loadData();
  for (const [index, league] of data.careerLeagues.entries()) {
    const clubId = league.league.teamIds[0];
    const sourcePlayers = league.league.teamIds.flatMap((id) =>
      league.rostersByClub[id].map((player) => ({ ...player, clubId: id })),
    );
    const career = createCareer(data, {
      first: "Casey",
      last: "Manager",
      age: "25",
      nationality: "ENG",
      height: "180",
      weight: "75",
      foot: "Right",
      weakFoot: "3",
      skillMoves: "3",
      position: "ST",
      archetype: "Poacher",
      startingOverall: "60",
      difficulty: "Realistic",
      leagueId: league.id,
      clubId,
      seed: 38742 + index,
    });
    const importedIds = career.players
      .filter((player) => player.source === "real-world")
      .map((player) => player.id)
      .sort();
    assert.deepEqual(
      importedIds,
      sourcePlayers.map((player) => player.playerId).sort(),
      `${league.league.name} must use every source record without fillers`,
    );
    for (const sourcePlayer of sourcePlayers) {
      const imported = career.players.find(
        (player) => player.id === sourcePlayer.playerId,
      );
      assert.equal(imported.clubId, sourcePlayer.clubId);
    }
    for (const clubId of league.league.teamIds) {
      const clubPlayers = career.players.filter(
        (player) => player.clubId === clubId,
      );
      const shirtNumbers = clubPlayers.map((player) => player.shirtNumber);
      assert.equal(new Set(shirtNumbers).size, shirtNumbers.length);
      assert.ok(
        shirtNumbers.every(
          (number) => Number.isInteger(number) && number >= 1 && number <= 99,
        ),
      );
    }
    assert.equal(
      career.players.some(
        (player) =>
          player.id !== career.player.id &&
          (player.source === "generated" ||
            player.source?.startsWith("generated-")),
      ),
      false,
    );
  }
});

test("full master rosters can transfer within their database-sized registration limit", async () => {
  const data = await loadData();
  const league = data.careerLeagues.find(
    (entry) => entry.league.name === "Premier League",
  );
  const career = createCareer(data, {
    first: "Casey",
    last: "Manager",
    age: "25",
    nationality: "ENG",
    height: "180",
    weight: "75",
    foot: "Right",
    weakFoot: "3",
    skillMoves: "3",
    position: "ST",
    archetype: "Poacher",
    startingOverall: "60",
    difficulty: "Realistic",
    leagueId: league.id,
    clubId: "hull-city",
    seed: 38742,
  });
  const seller = career.clubs.find((club) => club.id === "fulham");
  const buyer = career.clubs.find((club) => club.id === "chelsea");
  const player = career.players.find(
    (entry) => entry.clubId === seller.id && entry.source === "real-world",
  );
  buyer.finances.transferBudget = 1_000_000_000;
  buyer.finances.balance = 1_000_000_000;
  buyer.finances.wageBudget = 1_000_000_000;
  const before = buyer.squad.length;

  transferPlayer({
    seller,
    buyer,
    player,
    players: career.players,
    fee: 0,
    wage: 0,
    date: career.currentDay(),
    transferId: "master-roster-transfer",
  });

  assert.equal(player.clubId, buyer.id);
  assert.equal(seller.has(player.id), false);
  assert.equal(buyer.has(player.id), true);
  assert.equal(buyer.squad.length, before + 1);
  assert.ok(buyer.squad.length <= buyer.registrationLimit);
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  const restoredBuyer = restored.clubs.find((club) => club.id === buyer.id);
  assert.equal(restoredBuyer.registrationLimit, buyer.registrationLimit);
  assert.ok(restoredBuyer.has(player.id));
});

test("CSV parsing preserves quoted commas, quotes, and UTF-8 names", async () => {
  const csv = await readFile(
    new URL("../data/squads/touchline_player_database.csv", import.meta.url),
    "utf8",
  );
  const record = parseCsvRows(csv)[0];
  record.player_id = "test-utf8-1";
  record.display_name = 'Núñez, "El Rayo"';
  record.first_name = "Núñez";
  record.last_name = '"El Rayo"';
  record.club = "Club, \"United\"";
  record.date_of_birth = "2000-01-02";
  record.alternate_positions = "CM; AM";
  record.contract_start_date = "2024-07-01";
  record.contract_expiry_date = "2027-06-30";
  record.release_clause_eur = "30000000";
  record.loan_status = "On loan";
  record.loan_parent_club = "Parent FC";
  const serialized = serializeCsvRows(PLAYER_DATABASE_HEADERS, [record]);
  const reparsed = parsePlayerDatabaseCsv(serialized);
  assert.equal(reparsed.players[0].displayName, 'Núñez, "El Rayo"');
  assert.equal(reparsed.players[0].clubName, 'Club, "United"');
  assert.ok(Number.isInteger(reparsed.players[0].dob));
  assert.deepEqual(reparsed.players[0].altPositions, ["CM", "AM"]);
  assert.equal(reparsed.players[0].contractStartDate, "2024-07-01");
  assert.equal(reparsed.players[0].contractExpiryDate, "2027-06-30");
  assert.equal(reparsed.players[0].releaseClause, 30000000);
  assert.equal(reparsed.players[0].loanStatus, "On loan");
  assert.equal(reparsed.players[0].loanParentClub, "Parent FC");
});

test("database validation rejects duplicate shirt numbers within a club", async () => {
  const csv = await readFile(
    new URL("../data/squads/touchline_player_database.csv", import.meta.url),
    "utf8",
  );
  const first = parseCsvRows(csv)[0];
  const second = { ...first, player_id: "distinct-player-id" };
  first.shirt_number = "10";
  second.shirt_number = "10";
  const validation = validatePlayerDatabase([first, second]);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes("shirt number 10")));
});

test("legacy migration preserves old career IDs and deduplicates repeated source rows", async () => {
  const [ratingsCsv, clubLeaguesJson] = await Promise.all([
    readFile(new URL("../data/squads/fc26_player_ratings.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/fc26-club-leagues.json", import.meta.url), "utf8"),
  ]);
  const migrated = migrateLegacyPlayerDatabase({
    ratingsCsv,
    clubLeagues: JSON.parse(clubLeaguesJson),
    parseLegacyRoster: parseFc26RatingsCsv,
  });

  assert.equal(migrated.sourceRows, 72);
  assert.equal(migrated.report.totalPlayers, 71);
  assert.equal(migrated.duplicateSourceRows.length, 1);
  assert.equal(migrated.duplicateSourceRows[0].player, "Alisson Becker");
  const database = parsePlayerDatabaseCsv(migrated.csv);
  assert.ok(database.byId.has("real-manchester-city-fc25-1-erling"));
  assert.equal(database.report.missingFields.date_of_birth, 71);
});
