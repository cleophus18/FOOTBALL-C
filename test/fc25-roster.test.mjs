import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildPlayableCareerLeagues,
  combineRosterPlayers,
  parseCompetitionMetadataCsv,
  parseFc25RosterCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
  PLAYABLE_LEAGUES,
  summarizeRosterLeagues,
} from "../src/data/fc25-roster.mjs";
import {
  clubCrestColors,
  renderClubCrest,
} from "../src/ui/club-crests.mjs";

const csv = `long_name,short_name,league_name,club_name,nationality_name,age,player_positions,overall,potential,value_eur
"A. Player, Jr.",A. Player,Premier League,North FC,England,24,"CM, CDM",82,86,25000000
Second Player,Second,Bundesliga,South FC,Germany,21,ST,78,84,12000000
Ignored Player,Ignored,Championship,Other FC,England,20,CB,70,75,1000000`;

test("FC 25 roster import groups supported leagues and normalizes player stats", () => {
  const players = parseFc25RosterCsv(csv);
  assert.equal(players.length, 2);
  assert.equal(players[0].displayName, "A. Player, Jr.");
  assert.equal(players[0].position, "CM");
  assert.equal(players[0].overall, 82);
  assert.equal(players[0].nationality, "ENG");

  const leagues = summarizeRosterLeagues(players);
  assert.deepEqual(leagues.map((league) => league.name), ["Bundesliga", "Premier League"]);
  assert.equal(leagues.find((league) => league.name === "Premier League").clubs[0].squadSize, 1);
});

test("FC 25 roster import rejects CSV without required data columns", () => {
  assert.throws(
    () => parseFc25RosterCsv("name,overall\nPlayer,80"),
    /needs player name, club, overall rating, and position columns/,
  );
});

test("FC 26 ratings import accepts supplied headers and fills blank league from club mapping", () => {
  const fc26Csv = `Player_Name,Club,League,Nationality,Position,Overall_Rating,Potential,Data_Status
"Kylian Mbappé",Real Madrid,,France,ST,91,94,Estimate`;
  const players = parseFc26RatingsCsv(fc26Csv, { "real madrid": "La Liga" });
  assert.equal(players.length, 1);
  assert.equal(players[0].displayName, "Kylian Mbappé");
  assert.equal(players[0].league, "La Liga");
  assert.equal(players[0].overall, 91);
  assert.equal(players[0].potential, 94);
  assert.equal(players[0].nationality, "FRA");
});

test("FC 26 real-player rows with blank country fields use their real nationalities", () => {
  const players = parseFc26RatingsCsv(
    `Player_Name,Club,League,Nationality,Position,Overall_Rating,Potential
Kylian Mbappé,Real Madrid,La Liga,,ST,91,94
Lionel Messi,Inter Miami,La Liga,,RW,90,90
Federico Valverde,Real Madrid,La Liga,,CM,89,91`,
  );
  assert.deepEqual(
    players.map(({ displayName, nationality }) => [displayName, nationality]),
    [
      ["Kylian Mbappé", "FRA"],
      ["Lionel Messi", "ARG"],
      ["Federico Valverde", "URU"],
    ],
  );
});

test("FC 26 single-name football nicknames receive full imported names", () => {
  const players = parseFc26RatingsCsv(
    `Player_Name,Club,League,Nationality,Position,Overall_Rating,Potential
Rodri,Manchester City,Premier League,Spain,CM,90,91
Alisson,Liverpool,Premier League,Brazil,GK,89,90
Pedri,FC Barcelona,La Liga,Spain,CM,88,92`,
  );
  assert.deepEqual(
    players.map(({ first, last, displayName }) => [first, last, displayName]),
    [
      ["Rodri", "Hernández", "Rodri Hernández"],
      ["Alisson", "Becker", "Alisson Becker"],
      ["Pedri", "González", "Pedri González"],
    ],
  );
});

test("imported player profiles carry identity and financial fields into the game", () => {
  const players = parseFc26RatingsCsv(
    `Player_Name,Club,League,Nationality,Position,Overall_Rating,Potential,Pace,Shooting,Passing,Dribbling,Defending,Physicality
Ousmane Dembélé,Paris Saint-Germain,Ligue 1,France,RW,90,91,94,82,84,93,39,66`,
  );
  assert.partialDeepStrictEqual(players[0], {
    first: "Ousmane",
    last: "Dembélé",
    nationality: "FRA",
    position: "RW",
    age: 29,
    shirtNumber: 10,
    foot: "Both",
    weakFoot: 5,
    skillMoves: 5,
    height: 178,
    weight: 67,
    archetype: "Inside Forward",
    value: 102000000,
    wage: 349600,
    contractYears: 2,
  });
});

test("every imported real player has a country code matching the game data", async () => {
  const ratings = await readFile(
    new URL("../data/squads/fc26_player_ratings.csv", import.meta.url),
    "utf8",
  );
  const mappings = JSON.parse(
    await readFile(
      new URL("../data/config/fc26-club-leagues.json", import.meta.url),
      "utf8",
    ),
  );
  const realPlayers = parseFc26RatingsCsv(ratings, mappings).filter(
    (player) => player.source === "real-world",
  );
  const countryOf = (name) =>
    realPlayers.find((player) => player.displayName === name)?.nationality;

  assert.ok(realPlayers.length >= 90);
  assert.ok(
    realPlayers.every((player) => /^[A-Z]{3}$/.test(player.nationality)),
  );
  assert.equal(countryOf("Kylian Mbappé"), "FRA");
  assert.equal(countryOf("Martin Ødegaard"), "NOR");
  assert.equal(countryOf("Alisson Becker"), "BRA");
  assert.equal(countryOf("Lionel Messi"), "ARG");
  assert.equal(countryOf("Cristiano Ronaldo"), "POR");
});

test("FC 26 ratings import skips fictional sample rows that masquerade as imported players", () => {
  const players = parseFc26RatingsCsv(
   `Player_Name,Club,League,Nationality,Position,Overall_Rating,Potential,Data_Status
Real Player,Real Madrid,La Liga,Spain,ST,90,92,Verified roster entry
André Sample 123,Real Madrid,La Liga,Portugal,LW,70,75,"Fictional sample player; generated FC-style attributes"`,
  );
  assert.deepEqual(
    players.map(({ displayName }) => displayName),
    ["Real Player"],
  );
});

test("combined rosters keep the FC26 player when the same league contains a duplicate", () => {
  const fc26Player = {
    league: "Premier League",
    clubName: "Manchester City",
    displayName: "Erling Haaland",
    source: "fc26-estimate",
  };
  const addedPlayer = {
    league: "Premier League",
    clubName: "Manchester City",
    displayName: "Erling Haaland",
    source: "user-supplied-estimate",
  };
  assert.deepEqual(combineRosterPlayers([fc26Player], [addedPlayer]), [fc26Player]);
});

test("every club across all supported leagues has its own original crest", async () => {
  const leagues = JSON.parse(await readFile(
    new URL("../data/config/career-league-teams.json", import.meta.url),
    "utf8",
  ));
  const teams = Object.values(leagues).filter(Array.isArray).flat();
  const crests = teams.map((name) => renderClubCrest(name));

  assert.equal(teams.length, 296);
  assert.equal(new Set(crests).size, teams.length);
  assert.ok(crests.every((crest) => crest.includes('role="img"') && crest.includes("custom crest")));
});

test("formation shirt color uses the primary color from that club's crest", () => {
  const clubName = "Arsenal";
  const [primaryColor] = clubCrestColors(clubName);
  assert.match(primaryColor, /^#[0-9a-f]{6}$/i);
  assert.equal(clubCrestColors(clubName)[0], primaryColor);
});

test("supplemental player CSV imports role, estimate, performance, and club aliases", () => {
  const players = parseSupplementalPlayersCsv(
    "League,Team,Player Name,Position,Goals,Rating,Notes\nBetway Premiership,AmaZulu FC,Thandolwenkosi Ngwenya,Forward,6,8.01,Top scorer\nLa Liga,Barcelona,Raphinha,Forward,12,8.71,Top scorer\nBundesliga,Stuttgart,Nick Woltemade,Forward,4,,Scoring leader",
    {
      "amazulu fc": "AmaZulu",
      Barcelona: "FC Barcelona",
      Stuttgart: "VfB Stuttgart",
    },
  );
  assert.equal(players.length, 3);
  assert.deepEqual(
    players.map(({ league, clubName, position }) => [league, clubName, position]),
    [
      ["Betway Premiership", "AmaZulu", "ST"],
      ["La Liga", "FC Barcelona", "ST"],
      ["Bundesliga", "VfB Stuttgart", "ST"],
    ],
  );
  assert.equal(players[0].overall, 80);
  assert.equal(players[0].goals, 6);
  assert.equal(players[2].overall, 74);
  assert.equal(players[2].source, "user-supplied-estimate");
});

test("supplemental player profiles receive complete gameplay and finance fields", () => {
  const [player] = parseSupplementalPlayersCsv(
    "League,Team,Player Name,Position,Goals,Rating\nLa Liga,Barcelona,Raphinha,Forward,12,8.71",
    { Barcelona: "FC Barcelona" },
  );
  for (const field of [
    "nationality",
    "age",
    "foot",
    "weakFoot",
    "skillMoves",
    "height",
    "weight",
    "archetype",
    "value",
    "wage",
    "contractYears",
  ]) {
    assert.notEqual(player[field], null, `${field} should be populated`);
    assert.notEqual(player[field], undefined, `${field} should be populated`);
  }
});

test("competition metadata builds joinable leagues from roster clubs and listed title contenders", () => {
  const players = parseFc26RatingsCsv(
    `Player_Name,Club,League,Nationality,Position,Overall_Rating,Potential,Pace,Shooting,Passing,Dribbling,Defending,Physicality\nKylian Mbappe,Real Madrid,,France,ST,91,94,97,90,80,92,37,76\nErling Haaland,Manchester City,,Norway,ST,91,93,88,91,70,80,45,88`,
    { "real madrid": "La Liga", "manchester city": "Premier League" },
  );
  const metadata = parseCompetitionMetadataCsv(
    "League,Country,Teams,Matches_Per_Team,Season,Champion,Champ_Pts,Top_Scorer,Top_Scorer_Goals,Runner_Up\nPremier League,England,20,38,2025-26,Arsenal,85,Player A,20,Manchester City\nLa Liga,Spain,20,38,2025-26,Barcelona,94,Player B,25,Real Madrid\nScottish Premiership,Scotland,12,38,2025-26,Celtic,,,,",
  );
  const careerLeagues = buildPlayableCareerLeagues(players, metadata, {
    "Premier League": ["Arsenal", "Manchester City"],
    "La Liga": ["FC Barcelona", "Real Madrid"],
    "Scottish Premiership": ["Celtic"],
  });
  assert.ok(careerLeagues.length >= 2);
  const premier = careerLeagues.find((league) => league.league.name === "Premier League");
  assert.equal(premier.league.importedTeamCount, 20);
  assert.deepEqual(premier.league.teamIds, ["arsenal", "manchester-city"]);
  assert.equal(premier.rostersByClub["manchester-city"][0].attrs.pace, 88);
  const laLiga = careerLeagues.find((league) => league.league.name === "La Liga");
  assert.deepEqual(laLiga.league.teamIds, ["fc-barcelona", "real-madrid"]);
  assert.ok(PLAYABLE_LEAGUES.includes("Eredivisie"));
  assert.ok(PLAYABLE_LEAGUES.includes("EFL Championship"));
});

test("career league config contains configured top flights and second divisions", async () => {
  const metadata = parseCompetitionMetadataCsv(
    await readFile(new URL("../data/config/football_leagues.csv", import.meta.url), "utf8"),
  );
  const teams = JSON.parse(await readFile(
    new URL("../data/config/career-league-teams.json", import.meta.url),
    "utf8",
  ));
  const leagues = buildPlayableCareerLeagues([], metadata, teams);
  const leagueByName = new Map(leagues.map(({ league }) => [league.name, league]));
  for (const [name, size] of Object.entries({
    "Premier League": 20, "La Liga": 20, "Bundesliga": 18, "Serie A": 20,
    "Ligue 1": 18, "Betway Premiership": 16, "EFL Championship": 24,
    "Segunda División": 22, "2. Bundesliga": 18, "Serie B": 20, "Ligue 2": 18,
    Eredivisie: 18, "Primeira Liga": 18, "Belgian Pro League": 16,
    "Scottish Premiership": 12, "Süper Lig": 18,
  })) {
    assert.equal(leagueByName.get(name)?.teamIds.length, size, name);
  }
  const clubLeagueIds = new Map();
  for (const { league } of leagues) {
    for (const id of league.teamIds) {
      const previous = clubLeagueIds.get(id);
      if (previous) {
        assert.equal(league.nation, previous.nation, `${id} may be shared only within a domestic pyramid`);
      } else {
        clubLeagueIds.set(id, league);
      }
    }
  }
});

test("every supplied player is assigned to a playable career club", async () => {
  const [metadataCsv, teams, additionsCsv, aliases, ratingsCsv, clubLeagues] = await Promise.all([
    readFile(new URL("../data/config/football_leagues.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/career-league-teams.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/squads/player_additions.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/supplemental-club-aliases.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/squads/fc26_player_ratings.csv", import.meta.url), "utf8"),
    readFile(new URL("../data/config/fc26-club-leagues.json", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const addedPlayers = parseSupplementalPlayersCsv(additionsCsv, aliases);
  const fc26Names = new Set(parseFc26RatingsCsv(ratingsCsv, clubLeagues).map(({ displayName }) =>
    displayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
  ));
  assert.ok(addedPlayers.every(({ displayName }) =>
    !fc26Names.has(displayName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "")),
  ), "player_additions.csv should not repeat an FC26 roster player");
  const leagues = buildPlayableCareerLeagues(
    addedPlayers,
    parseCompetitionMetadataCsv(metadataCsv),
    teams,
  );
  assert.equal(addedPlayers.length, 67);
  for (const player of addedPlayers) {
    const league = leagues.find((entry) => entry.league.name === player.league);
    const clubId = league.league.teamIds.find((id) => league.clubIdentities[id].name === player.clubName);
    assert.ok(league.rostersByClub[clubId].some((rosterPlayer) => rosterPlayer.id === player.id), player.displayName);
  }
});
