import { clamp } from "../core/util.mjs";
import {
  normalizePosition,
  personalityForPlayer,
  SIMILAR_POSITIONS,
} from "../core/constants.mjs";
import expansionConfig from "../../data/config/expanded-leagues.json" with { type: "json" };
import configuredClubGroups from "../../data/config/clubs.json" with { type: "json" };
import leagueConfig from "../../data/config/leagues.json" with { type: "json" };
import { normalizeClubName, stadiumIdentityForClub } from "../model/stadiums.mjs";
import { playerIdentity, splitFullName } from "../model/identity.mjs";
import {
  estimateGoalkeeperAttributes,
  hasGoalkeeperAttributes,
} from "../model/goalkeeper.mjs";
import { parseCsvRows } from "./csv.mjs";
export { parseCsvRows } from "./csv.mjs";

const EXPANSION_LEAGUES = expansionConfig.leagues.map((config) => ({
  ...config,
  ...leagueConfig[config.id],
  name: config.name,
  country: config.country,
  teams: config.teams,
}));

function findConfiguredIdentity(clubName, clubGroupId, clubId) {
  const wanted = normalizeClubName(clubName);
  const group = configuredClubGroups[clubGroupId] ?? {};
  if (group[clubId]) return group[clubId];
  for (const candidateGroup of Object.values(configuredClubGroups)) {
    if (!candidateGroup || typeof candidateGroup !== "object") continue;
    for (const identity of Object.values(candidateGroup)) {
      if (
        normalizeClubName(identity?.name) === wanted ||
        normalizeClubName(identity?.fictionalName) === wanted
      ) return identity;
    }
  }
  return null;
}
const LEAGUE_NAMES = new Map([
  ["premier league", "Premier League"],
  ["la liga", "La Liga"],
  ["laliga ea sports", "La Liga"],
  ["bundesliga", "Bundesliga"],
  ["serie a", "Serie A"],
  ["serie a enilive", "Serie A"],
  ["ligue 1", "Ligue 1"],
  ["ligue 1 mcdonald's", "Ligue 1"],
  ["eredivisie", "Eredivisie"],
  ["primeira liga", "Primeira Liga"],
  ["belgian pro league", "Belgian Pro League"],
  ["scottish premiership", "Scottish Premiership"],
  ["süper lig", "Süper Lig"],
  ["super lig", "Süper Lig"],
  ["efl championship", "EFL Championship"],
  ["championship", "EFL Championship"],
  ["segunda división", "Segunda División"],
  ["segunda division", "Segunda División"],
  ["2. bundesliga", "2. Bundesliga"],
  ["serie b", "Serie B"],
  ["ligue 2", "Ligue 2"],
  ["betway premiership", "Betway Premiership"],
]);
const BIG_FIVE = new Set([
  "Premier League",
  "La Liga",
  "Bundesliga",
  "Serie A",
  "Ligue 1",
]);
export const PLAYABLE_LEAGUES = [...BIG_FIVE];

const POSITION_MAP = {
  GK: "GK",
  CB: "CB",
  LB: "LB",
  LWB: "LB",
  RB: "RB",
  RWB: "RB",
  CDM: "DM",
  DM: "DM",
  CM: "CM",
  CAM: "AM",
  AM: "AM",
  LM: "LW",
  LW: "LW",
  RM: "RW",
  RW: "RW",
  CF: "ST",
  ST: "ST",
  FORWARD: "ST",
  STRIKER: "ST",
  MIDFIELDER: "CM",
  DEFENDER: "CB",
  GOALKEEPER: "GK",
};

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

const VERIFIED_IMPORTED_PROFILES = {
  "ousmane dembélé": {
    nationality: "FRA",
    age: 29,
    shirtNumber: 10,
    foot: "Both",
    weakFoot: 5,
    skillMoves: 5,
    height: 178,
    weight: 67,
    archetype: "Inside Forward",
    value: 102_000_000,
    wage: 349_600,
    contractYears: 2,
  },
  "ousmane dembele": {
    nationality: "FRA",
    age: 29,
    shirtNumber: 10,
    foot: "Both",
    weakFoot: 5,
    skillMoves: 5,
    height: 178,
    weight: 67,
    archetype: "Inside Forward",
    value: 102_000_000,
    wage: 349_600,
    contractYears: 2,
  },
  "lionel messi": {
    nationality: "ARG",
    age: 39,
    shirtNumber: 10,
    foot: "Left",
    weakFoot: 4,
    skillMoves: 5,
    height: 170,
    weight: 72,
    archetype: "Advanced Playmaker",
    personality: "Leader",
    value: 25_000_000,
    wage: 1_000_000,
    contractYears: 1,
  },
  messi: {
    nationality: "ARG",
    age: 39,
    shirtNumber: 10,
    foot: "Left",
    weakFoot: 4,
    skillMoves: 5,
    height: 170,
    weight: 72,
    archetype: "Advanced Playmaker",
    personality: "Leader",
    value: 25_000_000,
    wage: 1_000_000,
    contractYears: 1,
  },
  "cristiano ronaldo": {
    nationality: "POR",
    age: 41,
    shirtNumber: 7,
    foot: "Right",
    weakFoot: 4,
    skillMoves: 5,
    height: 187,
    weight: 83,
    archetype: "Complete Forward",
    personality: "Ambitious",
    value: 15_000_000,
    wage: 500_000,
    contractYears: 1,
  },
  ronaldo: {
    nationality: "POR",
    age: 41,
    shirtNumber: 7,
    foot: "Right",
    weakFoot: 4,
    skillMoves: 5,
    height: 187,
    weight: 83,
    archetype: "Complete Forward",
    personality: "Ambitious",
    value: 15_000_000,
    wage: 500_000,
    contractYears: 1,
  },
};

function importedProfileFor(name, position, overall, nationality) {
  const verified = VERIFIED_IMPORTED_PROFILES[name.toLocaleLowerCase()];
  if (verified) return { ...verified };
  const positionDefaults = {
    GK: { height: 190, weight: 84, foot: "Right", skillMoves: 1 },
    CB: { height: 187, weight: 80, foot: "Right", skillMoves: 2 },
    LB: { height: 178, weight: 72, foot: "Left", skillMoves: 3 },
    RB: { height: 178, weight: 72, foot: "Right", skillMoves: 3 },
    DM: { height: 182, weight: 77, foot: "Right", skillMoves: 3 },
    CM: { height: 178, weight: 73, foot: "Right", skillMoves: 3 },
    AM: { height: 176, weight: 70, foot: "Right", skillMoves: 4 },
    LW: { height: 176, weight: 70, foot: "Right", skillMoves: 4 },
    RW: { height: 176, weight: 70, foot: "Left", skillMoves: 4 },
    ST: { height: 184, weight: 78, foot: "Right", skillMoves: 3 },
  };
  const defaults = positionDefaults[position] ?? positionDefaults.CM;
  return {
    nationality: nationality || "UNK",
    age: 25,
    shirtNumber: null,
    foot: defaults.foot,
    weakFoot: overall >= 85 ? 4 : 3,
    skillMoves: defaults.skillMoves,
    height: defaults.height,
    weight: defaults.weight,
    archetype: position === "GK" ? "Sweeper Keeper" : position === "ST" ? "Complete Forward" : "First-Team Player",
    value: Math.round(Math.max(250_000, overall ** 3 * 70)),
    wage: Math.round(Math.max(1_200, overall * 600)),
    contractYears: 3,
    personality: personalityForPlayer(name.split(" ")[0], name.split(" ").slice(1).join(" "), position, overall),
  };
}

export function parseCompetitionMetadataCsv(text) {
  return parseCsvRows(text)
    .map((record) => ({
      name: record.league?.trim(),
      country: record.country?.trim(),
      teams: numberOrNull(record.teams),
      matchesPerTeam: numberOrNull(record.matches_per_team),
      season: record.season?.trim(),
      champion: record.champion?.trim(),
      runnerUp: record.runner_up?.trim(),
      championPoints: numberOrNull(record.champ_pts),
      topScorer: record.top_scorer?.trim(),
      topScorerGoals: numberOrNull(record.top_scorer_goals),
    }))
    .filter((record) => record.name);
}

function normalizeLeague(value) {
  const displayLeague = String(value ?? "").trim();
  const league = displayLeague
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return LEAGUE_NAMES.get(league) ?? (displayLeague || null);
}

function splitName(player) {
  const fullName = String(
    player.long_name ?? player.name ?? player.short_name ?? "",
  ).trim();
  if (!fullName) return { first: "Unknown", last: "Player" };
  // Identity resolution is centralised: it understands Iberian compound surnames,
  // Dutch/French particles, and single-name football nicknames.
  const identity = splitFullName(fullName);
  if (!identity.last) {
    const fix = IMPORTED_NAME_FIXES[fullName.toLocaleLowerCase()];
    if (fix) return fix;
  }
  return { first: identity.first, last: identity.last };
}

// Several real players are commonly imported under a single-name football
// nickname. Keep the nickname as the first-name display while supplying the
// surname needed by the player model and UI.
const IMPORTED_NAME_FIXES = {
  rodri: { first: "Rodri", last: "Hernández" },
  alisson: { first: "Alisson", last: "Becker" },
  pedri: { first: "Pedri", last: "González" },
  raphinha: { first: "Raphinha", last: "Belloli" },
  marquinhos: { first: "Marquinhos", last: "Corrêa" },
  vitinha: { first: "Vitinha", last: "Ferreira" },
  ederson: { first: "Ederson", last: "Moraes" },
  marta: { first: "Marta", last: "Vieira" },
};

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const NATION_CODES = {
  England: "ENG",
  Spain: "ESP",
  Germany: "GER",
  Italy: "ITA",
  France: "FRA",
  Netherlands: "NED",
  Portugal: "POR",
  Scotland: "SCO",
  Belgium: "BEL",
  Turkey: "TUR",
  "Saudi Arabia": "KSA",
  "South Africa": "RSA",
  Brazil: "BRA",
  "United States/Canada": "USA",
  Mexico: "MEX",
};
const NATION_ALIASES = {
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Belgium: "BEL",
  Brazil: "BRA",
  Cameroon: "CMR",
  Canada: "CAN",
  Chile: "CHI",
  China: "CHN",
  Colombia: "COL",
  Croatia: "CRO",
  Denmark: "DEN",
  Ecuador: "ECU",
  Egypt: "EGY",
  England: "ENG",
  Finland: "FIN",
  France: "FRA",
  Georgia: "GEO",
  Germany: "GER",
  Ghana: "GHA",
  Greece: "GRE",
  Guinea: "GUI",
  Hungary: "HUN",
  Iran: "IRN",
  Ireland: "IRL",
  "Ivory Coast": "CIV",
  Japan: "JPN",
  "Korea Republic": "KOR",
  "South Korea": "KOR",
  Mexico: "MEX",
  Morocco: "MAR",
  Netherlands: "NED",
  Nigeria: "NGA",
  Norway: "NOR",
  Poland: "POL",
  Portugal: "POR",
  "Saudi Arabia": "KSA",
  Scotland: "SCO",
  Senegal: "SEN",
  Serbia: "SRB",
  "South Africa": "RSA",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Turkey: "TUR",
  "United States": "USA",
  Uruguay: "URU",
};
const REAL_PLAYER_NATIONALITIES = new Map(
  Object.entries({
    "Kylian Mbappe": "FRA",
    "Erling Haaland": "NOR",
    "Mohamed Salah": "EGY",
    "Jude Bellingham": "ENG",
    "Vinicius Junior": "BRA",
    Rodri: "ESP",
    "Virgil van Dijk": "NED",
    "Kevin De Bruyne": "BEL",
    "Harry Kane": "ENG",
    "Ousmane Dembele": "FRA",
    "Lamine Yamal": "ESP",
    "Aitana Bonmati": "ESP",
    "Alexia Putellas": "ESP",
    "Yassine Bounou": "MAR",
    "Andre-Pierre Gignac": "FRA",
    "Hirving Lozano": "MEX",
    "Denis Bouanga": "GAB",
    "Cucho Hernandez": "COL",
    "Hany Mukhtar": "GER",
    "Wendie Renard": "FRA",
    "Sam Kerr": "AUS",
    "Lauren James": "ENG",
    "Mary Earps": "ENG",
    "Sophia Smith": "USA",
    "Alex Morgan": "USA",
    Marta: "BRA",
    "Caroline Graham Hansen": "NOR",
    "Khadija Shaw": "JAM",
    "Alyssa Naeher": "USA",
    "Thibaut Courtois": "BEL",
    Alisson: "BRA",
    "Alisson Becker": "BRA",
    "Jan Oblak": "SVN",
    "Gianluigi Donnarumma": "ITA",
    Pedri: "ESP",
    "Federico Valverde": "URU",
    Raphinha: "BRA",
    "Bukayo Saka": "ENG",
    "Declan Rice": "ENG",
    "William Saliba": "FRA",
    "Martin Odegaard": "NOR",
    "Martin Ødegaard": "NOR",
    "Bruno Fernandes": "POR",
    "Cole Palmer": "ENG",
    "Enzo Fernandez": "ARG",
    "Moises Caicedo": "ECU",
    "Alessandro Bastoni": "ITA",
    "Lautaro Martinez": "ARG",
    "Nicolo Barella": "ITA",
    "Rafael Leao": "POR",
    "Mike Maignan": "FRA",
    "Paulo Dybala": "ARG",
    "Khvicha Kvaratskhelia": "GEO",
    "Achraf Hakimi": "MAR",
    Marquinhos: "BRA",
    Vitinha: "POR",
    "Jamal Musiala": "GER",
    "Michael Olise": "FRA",
    "Joshua Kimmich": "GER",
    "Manuel Neuer": "GER",
    "Florian Wirtz": "GER",
    "Antoine Griezmann": "FRA",
    "Julian Alvarez": "ARG",
    "Robert Lewandowski": "POL",
    "Frenkie de Jong": "NED",
    "Son Heung-min": "KOR",
    "James Maddison": "ENG",
    "Alexander Isak": "SWE",
    "Bruno Guimaraes": "BRA",
    "Phil Foden": "ENG",
    "Bernardo Silva": "POR",
    Ederson: "BRA",
    "Gabriel Martinelli": "BRA",
    "Kai Havertz": "GER",
    "Micky van de Ven": "NED",
    "Alexis Mac Allister": "ARG",
    "Dominik Szoboszlai": "HUN",
    "Ollie Watkins": "ENG",
    "Youri Tielemans": "BEL",
    "Serhou Guirassy": "GUI",
    "Nico Schlotterbeck": "GER",
    "Gregor Kobel": "SUI",
    "Deniz Undav": "GER",
    "Lois Openda": "BEL",
    "Xavi Simons": "NED",
    "Benjamin Sesko": "SVN",
    "Victor Osimhen": "NGA",
    "Mauro Icardi": "ARG",
    "Edin Dzeko": "BIH",
    "Sergio Ramos": "ESP",
    "Lionel Messi": "ARG",
    "Luis Suarez": "URU",
    "Cristiano Ronaldo": "POR",
    "Ruben Neves": "POR",
    "Salem Al-Dawsari": "KSA",
    "Sadio Mane": "SEN",
    "Sergej Milinkovic-Savic": "SRB",
  }).map(([name, code]) => [slug(name), code]),
);
const NORMALIZED_NATION_CODES = new Map(
  Object.entries({ ...NATION_CODES, ...NATION_ALIASES }).map(([name, code]) => [
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase(),
    code,
  ]),
);

export function normalizePlayerNationality(value, playerName = "") {
  const knownNationality = REAL_PLAYER_NATIONALITIES.get(slug(playerName));
  if (knownNationality) return knownNationality;
  const nationality = String(value ?? "").trim();
  if (!nationality) return "";
  if (/^[a-z]{3}$/i.test(nationality)) return nationality.toUpperCase();
  const key = nationality
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
  return (
    NORMALIZED_NATION_CODES.get(key) ??
    REAL_PLAYER_NATIONALITIES.get(slug(playerName)) ??
    nationality
  );
}

export function buildPlayableCareerLeagues(
  players,
  metadata,
  clubsByLeague = {},
) {
  const byLeague = new Map();
  for (const player of players) {
    const leagueKey = player.league.toLowerCase();
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, new Map());
    const clubs = byLeague.get(leagueKey);
    if (!clubs.has(player.clubName)) clubs.set(player.clubName, []);
    clubs.get(player.clubName).push(player);
  }

  const metadataByName = new Map(
    metadata
      .filter((item) => PLAYABLE_LEAGUES.includes(item.name))
      .map((item) => [item.name.toLowerCase(), item]),
  );
  for (const expansion of EXPANSION_LEAGUES) {
    if (!metadataByName.has(expansion.name.toLowerCase())) {
      metadataByName.set(expansion.name.toLowerCase(), {
        name: expansion.name,
        country: expansion.country,
        teams: expansion.teams.length,
        matchesPerTeam: 2 * (expansion.teams.length - 1),
        season: "2026-27 configured",
      });
    }
  }
  return [...metadataByName.entries()]
    .sort(
      ([, left], [, right]) =>
        PLAYABLE_LEAGUES.indexOf(left.name) -
        PLAYABLE_LEAGUES.indexOf(right.name),
    )
    .flatMap(([leagueKey, source]) => {
      const leagueName = source.name;
      const clubs = byLeague.get(leagueKey) ?? new Map();
      const expansion = EXPANSION_LEAGUES.find(
        (item) => item.name === leagueName,
      );
      const leagueId = `world-${slug(leagueName)}`;
      const clubGroup = leagueId;
      const identities = {};
      const rostersByClub = {};
      const teamIds = [];
      const clubList = clubsByLeague[leagueName] ??
        expansion?.teams ?? [...clubs.keys()];
      const names = new Set(clubList);
      if (!names.size) return [];
      for (const clubName of [...names].sort((a, b) => a.localeCompare(b))) {
        const roster =
          [...clubs.entries()].find(
            ([importedName]) => slug(importedName) === slug(clubName),
          )?.[1] ?? [];
        const clubId = slug(clubName);
        teamIds.push(clubId);
        const averageRating = roster.length
          ? roster.reduce((sum, player) => sum + player.overall, 0) /
            roster.length
          : expansion?.tier === 2
            ? 55
            : 62;
        const configuredId = slug(clubName);
        const configuredIdentity = findConfiguredIdentity(
          clubName,
          expansion?.clubGroup,
          configuredId,
        );
        const realVenue = stadiumIdentityForClub(configuredIdentity?.name ?? clubName);
        identities[clubId] = {
          ...configuredIdentity,
          id: clubId,
          name: clubName,
          shortName:
            configuredIdentity?.shortName ??
            clubName
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 3)
              .toUpperCase(),
          city: configuredIdentity?.city ?? realVenue?.city ?? "",
          stadium: configuredIdentity?.stadium ?? realVenue?.stadium ?? "",
          capacity: configuredIdentity?.capacity ?? realVenue?.capacity ?? 22000,
          founded: configuredIdentity?.founded ?? null,
          prestige:
            configuredIdentity?.prestige ??
            Math.max(35, Math.min(95, Math.round(averageRating))),
          budget:
            configuredIdentity?.budget ?? Math.round(averageRating * 1_000_000),
          wageBudget:
            configuredIdentity?.wageBudget ??
            Math.round(averageRating * 20_000),
        };
        rostersByClub[clubId] = roster.map((player) => ({
          id: player.id,
          playerId: player.playerId,
          league: player.league,
          clubName: player.clubName,
          first: player.first,
          last: player.last,
          fullName: player.fullName ?? `${player.first} ${player.last}`.trim(),
          displayName: player.displayName,
          nickname: player.nickname ?? null,
          dob: player.dob,
          nationality: player.nationality,
          age: player.age,
          shirtNumber: player.shirtNumber,
          foot: player.foot,
          weakFoot: player.weakFoot,
          skillMoves: player.skillMoves,
          height: player.height,
          weight: player.weight,
          archetype: player.archetype,
          personality: player.personality,
          traits: player.traits,
          position: player.position,
          altPositions: player.altPositions?.length
            ? player.altPositions
            : [],
          overall: player.overall,
          potential: player.potential ?? player.overall,
          attrs: player.attrs,
          gkAttrs: player.gkAttrs,
          value: player.value,
          wage: player.wage,
          contractYears: player.contractYears,
          contractStartDate: player.contractStartDate,
          contractExpiryDate: player.contractExpiryDate,
          releaseClause: player.releaseClause,
          loanStatus: player.loanStatus,
          loanParentClub: player.loanParentClub,
          dataStatus: player.dataStatus,
          dataSource: player.dataSource,
          source: player.source ?? "fc26-estimate",
        }));
      }
      const league = {
        id: leagueId,
        name: leagueName,
        nation: NATION_CODES[source.country] ?? source.country,
        tier: expansion?.tier ?? 1,
        country: expansion?.country ?? source.country,
        promotion: expansion?.promotion,
        relegation: expansion?.relegation,
        clubGroup,
        teamIds,
        importedTeamCount: source.teams,
        clubCount: teamIds.length,
        importedMatchesPerTeam: source.matchesPerTeam,
        sourceSeason: source.season,
        metadataChampion: source.champion,
        metadataRunnerUp: source.runnerUp,
        seasonStartYear: 2026,
        seasonWeeks: 52,
        fixtureStartWeek: 3,
        fixtureEndWeek: Math.min(48, 3 + 2 * (teamIds.length - 1) - 1),
        pointsForWin: 3,
        pointsForDraw: 1,
      };
      return [
        { id: leagueId, league, clubIdentities: identities, rostersByClub },
      ];
    });
}

function normalizePlayer(record, index, clubLeagueMap) {
  const clubName = String(record.club_name ?? record.club ?? "").trim();
  const clubLeague = clubLeagueMap[clubName.toLocaleLowerCase()];
  const league =
    normalizeLeague(record.league_name ?? record.league) ??
    normalizeLeague(clubLeague);
  const overall = numberOrNull(record.overall ?? record.ovr);
  const positionField = String(record.player_positions ?? record.position ?? "")
    .split(",")[0]
    .trim()
    .toUpperCase();
  let position = POSITION_MAP[positionField];
  if (!league || !clubName || overall == null || !position) return null;

  const name = splitName(record);
  const normalizedDisplayName = `${name.first} ${name.last}`.trim().toLowerCase();
  if (normalizedDisplayName === "lionel messi") {
    position = "CAM";
  }
  const sourceDisplayName = String(
    record.long_name ??
      record.name ??
      record.short_name ??
      `${name.first} ${name.last}`,
  ).trim();
  const age = numberOrNull(record.age);
  const sourceStatus = String(
    record.data_status ?? record.source ?? "",
  ).toLocaleLowerCase();
  const attrs = {
    pace: numberOrNull(record.pace),
    shooting: numberOrNull(record.shooting),
    passing: numberOrNull(record.passing),
    dribbling: numberOrNull(record.dribbling),
    defending: numberOrNull(record.defending),
    physical: numberOrNull(record.physicality ?? record.physic),
  };
  const nationality = normalizePlayerNationality(
    record.nationality_name ?? record.nationality,
    record.long_name ?? record.name ?? record.short_name,
  );
  const profile = importedProfileFor(
    sourceDisplayName,
    position,
    overall,
    nationality,
  );
  const resolvedNationality = nationality || profile.nationality || "UNK";
  return {
    id: `fc25-${index}-${String(record.short_name ?? name.first)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}`,
    ...name,
    displayName:
      name.last && !sourceDisplayName.includes(" ")
        ? `${name.first} ${name.last}`
        : sourceDisplayName,
    league,
    clubName,
    nationality: resolvedNationality,
    age: age ?? profile.age,
    shirtNumber: numberOrNull(record.shirt_number ?? record.shirtNumber) ?? profile.shirtNumber,
    foot: record.foot?.trim() || profile.foot,
    weakFoot: numberOrNull(record.weak_foot ?? record.weakFoot) ?? profile.weakFoot,
    skillMoves: numberOrNull(record.skill_moves ?? record.skillMoves) ?? profile.skillMoves,
    height: numberOrNull(record.height) ?? profile.height,
    weight: numberOrNull(record.weight) ?? profile.weight,
    archetype: record.archetype?.trim() || profile.archetype,
    personality: profile.personality,
    position,
    displayPosition:
      normalizedDisplayName === "lionel messi" ? "CAM" : undefined,
    altPositions:
      normalizedDisplayName === "lionel messi"
        ? ["ST", "RW", "LW"]
        : (SIMILAR_POSITIONS[position] ?? []),
    overall,
    potential: numberOrNull(record.potential),
    value: numberOrNull(record.value_eur ?? record.value) ?? profile.value,
    wage: numberOrNull(record.wage_eur ?? record.wage) ?? profile.wage,
    contractYears: numberOrNull(record.contract_years) ?? profile.contractYears,
    attrs: Object.values(attrs).every((value) => value != null)
      ? attrs
      : undefined,
    // Full identity (full name, display name, common nickname) for imported players.
    identity: playerIdentity({
      fullName: sourceDisplayName,
      firstName: name.first,
      lastName: name.last,
      displayName: String(record.long_name ?? record.name ?? record.short_name ?? "").trim(),
      nationality: resolvedNationality,
      club: clubName,
      league,
      position,
    }),
    gkAttrs: position === "GK"
      ? estimateGoalkeeperAttributes({}, {
          overall,
          pace: attrs.pace,
          shooting: attrs.shooting,
          passing: attrs.passing,
          dribbling: attrs.dribbling,
          defending: attrs.defending,
          physical: attrs.physical,
          height: numberOrNull(record.height),
        }).attributes
      : undefined,
    source: sourceStatus.startsWith("real player")
      ? "real-world"
      : record.source,
  };
}

export function parseFc25RosterCsv(text) {
  return parseRatingsRosterCsv(text).filter((player) =>
    BIG_FIVE.has(player.league),
  );
}

export function parseFc26RatingsCsv(text, clubLeagueMap = {}) {
  return parseRatingsRosterCsv(text, clubLeagueMap).filter((player) =>
    BIG_FIVE.has(player.league),
  );
}

export function parseSupplementalPlayersCsv(text, clubAliases = {}) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Supplemental player CSV is empty.");
  }
  const aliases = Object.fromEntries(
    Object.entries(clubAliases)
      .filter(([key]) => !key.startsWith("$"))
      .map(([key, value]) => [key.toLocaleLowerCase(), value]),
  );
  return parseCsvRows(text)
    .map((record, index) => {
      const sourceClub = String(record.team ?? "").trim();
      const clubName = aliases[sourceClub.toLocaleLowerCase()] ?? sourceClub;
      const league = normalizeLeague(record.league);
      const positionField = String(record.position ?? "")
        .trim()
        .toUpperCase();
      let position = POSITION_MAP[positionField];
      if (!league || !clubName || !position || !record["player name"]?.trim())
        return null;
      if (!BIG_FIVE.has(league)) return null;
      const name = splitName({ name: record["player name"] });
      const normalizedDisplayName = record["player name"].trim().toLowerCase();
      if (normalizedDisplayName === "lionel messi") {
        position = "CAM";
      }
      const matchRating = numberOrNull(record.rating);
      const goals = numberOrNull(record.goals) ?? 0;
      const defaults = { GK: 68, CB: 68, CM: 69, ST: 70 };
      const overall = clamp(
        Math.round(
          matchRating != null
            ? matchRating * 10
            : defaults[position] + Math.min(12, goals),
        ),
        55,
        92,
      );
      const profile = importedProfileFor(
        record["player name"].trim(),
        position,
        overall,
        normalizePlayerNationality("", record["player name"]) || "UNK",
      );
      return {
        id: `added-${slug(clubName)}-${slug(record["player name"])}-${index}`,
        ...name,
        displayName: record["player name"].trim(),
        league,
        clubName,
        nationality: profile.nationality,
        age: profile.age,
        shirtNumber: profile.shirtNumber,
        foot: profile.foot,
        weakFoot: profile.weakFoot,
        skillMoves: profile.skillMoves,
        height: profile.height,
        weight: profile.weight,
        archetype: profile.archetype,
        personality: profile.personality,
        position,
        displayPosition:
          normalizedDisplayName === "lionel messi" ? "CAM" : undefined,
        altPositions:
          normalizedDisplayName === "lionel messi"
            ? ["ST", "RW", "LW"]
            : (SIMILAR_POSITIONS[position] ?? []),
        overall,
        potential: overall,
        value: profile.value,
        wage: profile.wage,
        contractYears: profile.contractYears,
        goals,
        matchRating,
        notes: record.notes?.trim() ?? "",
        attrs: undefined,
        source: "user-supplied-estimate",
      };
    })
    .filter(Boolean);
}

export function combineRosterPlayers(...rosters) {
  const playersByIdentity = new Map();
  for (const player of rosters.flat()) {
    const identity = `${slug(player.league)}:${slug(player.displayName)}`;
    if (!playersByIdentity.has(identity))
      playersByIdentity.set(identity, player);
  }
  return [...playersByIdentity.values()];
}

function parseRatingsRosterCsv(text, clubLeagueMap = {}) {
  if (typeof text !== "string" || !text.trim())
    throw new Error("Player ratings CSV is empty.");
  const records = parseCsvRows(text);
  const headers = new Set(Object.keys(records[0] ?? {}));
  const hasName = ["long_name", "name", "short_name", "player_name"].some(
    (name) => headers.has(name),
  );
  if (
    !hasName ||
    !(headers.has("club_name") || headers.has("club")) ||
    !(
      headers.has("overall") ||
      headers.has("ovr") ||
      headers.has("overall_rating")
    ) ||
    !(headers.has("player_positions") || headers.has("position"))
  ) {
    throw new Error(
      "Ratings CSV needs player name, club, overall rating, and position columns.",
    );
  }

  const normalizedClubLeagueMap = Object.fromEntries(
    Object.entries(clubLeagueMap).map(([club, league]) => [
      club.trim().toLocaleLowerCase(),
      league,
    ]),
  );
  const players = records
    .map((record, index) => {
      const sourceStatus = String(
        record.notes?.trim() || record.data_status || record.source || "",
      ).toLocaleLowerCase();
      if (
        sourceStatus.includes(
          "fictional sample player; generated fc-style attributes",
        )
      ) {
        return null;
      }
      const normalized = {
        ...record,
        long_name: record.long_name ?? record.player_name ?? record.name,
        overall: record.overall ?? record.overall_rating ?? record.ovr,
        player_positions: record.player_positions ?? record.position,
        nationality_name: record.nationality_name ?? record.nationality,
      };
      return normalizePlayer(normalized, index, normalizedClubLeagueMap);
    })
    .filter(Boolean);
  if (!players.length)
    throw new Error(
      "No players with a recognized league and supported position were found in the ratings CSV.",
    );
  return players;
}

export function summarizeRosterLeagues(players) {
  const leagues = new Map();
  for (const player of players) {
    if (!leagues.has(player.league)) leagues.set(player.league, new Map());
    const clubs = leagues.get(player.league);
    if (!clubs.has(player.clubName)) clubs.set(player.clubName, []);
    clubs.get(player.clubName).push(player);
  }
  return [...leagues.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, clubs]) => ({
      name,
      clubs: [...clubs.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clubName, roster]) => ({
          clubName,
          roster: [...roster].sort((a, b) => b.overall - a.overall),
          averageOverall:
            roster.reduce((total, player) => total + player.overall, 0) /
            roster.length,
          squadSize: roster.length,
        })),
    }));
}
