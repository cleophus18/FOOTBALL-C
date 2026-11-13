import { ageOn, formatDate, seasonLabel } from "../core/calendar.mjs";
import {
  ATTRIBUTES,
  GK_ATTRIBUTES,
  PERSONALITIES,
  POSITIONS,
  SUB_ATTRIBUTES,
} from "../core/constants.mjs";
import { formatDecimal } from "../core/util.mjs";
import { Career, createCareer } from "../career.mjs";
import {
  averageRating,
  calculateOverall,
  physiqueFactors,
} from "../model/player.mjs";
import {
  FORMATION_NAMES,
  MANAGER_STYLES,
  selectLineup,
} from "../model/club.mjs";
import {
  boardBandFor,
  boardExpectationFor,
  winRate,
} from "../model/manager.mjs";
import { clubCrestColors, renderClubCrest } from "./club-crests.mjs";
import { ballTransform, createBallSimulation } from "./ball-physics.mjs";
import { Rng, hashString } from "../core/rng.mjs";
import {
  keyMomentActions,
  ROLE_DESCRIPTIONS,
  playerRoleOptionsForPosition,
} from "../sim/playermatch.mjs";
import { ensureStamina } from "../model/stamina.mjs";
import {
  groupHonours,
  seasonsLabel,
  totalTrophies,
} from "../model/honours.mjs";
import { formOverallDelta } from "../model/form.mjs";
import { calculateTeamRatings } from "../model/team-rating.mjs";
import { formatMarketValue } from "../core/finance.mjs";
import { agentSearchTerms } from "../model/transfer-market.mjs";
import {
  PLAYSTYLE_REGISTRY,
  PLAYSTYLE_CATEGORIES,
  ensurePlayStyles,
} from "../model/playstyles.mjs";
import {
  COACHING_ATTRIBUTES,
  ensureCoachProfile,
} from "../core/coaching.mjs";
import {
  buildPlayableCareerLeagues,
  parseCompetitionMetadataCsv,
  PLAYABLE_LEAGUES,
  summarizeRosterLeagues,
} from "../data/fc25-roster.mjs";
import { parsePlayerDatabaseCsv } from "../data/player-database.mjs";

const $app = document.querySelector("#app");
const SAVE_PREFIX = "touchline-career-slot-";
const AUTOSAVE_KEY = "touchline-career-autosave";
const DEVELOPER_MODE_PASSWORD = "cleothegoat";
// Resolve game data against the page's own directory so the build works when it is
// served from a sub-path (Firebase hosting, a project site, or a plain file server).
const DATA_BASE = new URL("../../", import.meta.url);
const countries = [
  ["ENG", "England"],
  ["AUS", "Australia"],
  ["ARG", "Argentina"],
  ["AUT", "Austria"],
  ["BEL", "Belgium"],
  ["BIH", "Bosnia and Herzegovina"],
  ["BRA", "Brazil"],
  ["CAN", "Canada"],
  ["CMR", "Cameroon"],
  ["CHI", "Chile"],
  ["COL", "Colombia"],
  ["CRO", "Croatia"],
  ["DEN", "Denmark"],
  ["ECU", "Ecuador"],
  ["EGY", "Egypt"],
  ["FRA", "France"],
  ["GAB", "Gabon"],
  ["GEO", "Georgia"],
  ["GER", "Germany"],
  ["GHA", "Ghana"],
  ["GUI", "Guinea"],
  ["HUN", "Hungary"],
  ["IRN", "Iran"],
  ["IRL", "Ireland"],
  ["ITA", "Italy"],
  ["JPN", "Japan"],
  ["JAM", "Jamaica"],
  ["KOR", "South Korea"],
  ["KSA", "Saudi Arabia"],
  ["MAR", "Morocco"],
  ["MEX", "Mexico"],
  ["NED", "Netherlands"],
  ["NGA", "Nigeria"],
  ["NOR", "Norway"],
  ["PAR", "Paraguay"],
  ["POL", "Poland"],
  ["POR", "Portugal"],
  ["RSA", "South Africa"],
  ["SCO", "Scotland"],
  ["SEN", "Senegal"],
  ["SRB", "Serbia"],
  ["ESP", "Spain"],
  ["SUI", "Switzerland"],
  ["SVN", "Slovenia"],
  ["SWE", "Sweden"],
  ["TUR", "Turkey"],
  ["URU", "Uruguay"],
  ["USA", "United States"],
];
let data;
let career = null;
let screen = "menu";
const expandedNavGroups = new Set();
let menuSettings = {
  sound: true,
  showTips: true,
};
let renderedScreen = null;
let screenHistory = [];
let isBackNavigation = false;
let screenScrollPositions = new Map();
let scrollRestoreFrame = 0;
let notice = "";
let wageNegotiationOfferId = null;
let worldLeagueName = "";
let refreshBodyPanel = null;
let worldClubName = "";
let statsLeagueId = "";
let developerModePromptOpen = false;
let selectedLineupPlayerId = null;
// What the user has typed into the four creation panels, kept while switching tabs.
let creationDraft = null;
let creationTab = null;
// Manager mode: the in-memory creation draft (the live career lives in `career`).
let managerDraft = null;
// The menu football runs on a real physics loop (see ball-physics.mjs).
let ballAnimationFrame = 0;
let ballSimulation = null;
let lastBallFrame = 0;
let viewedPlayerId = null;
let viewedCoachId = null;
let coachFilter = "overall";
let playerDirectorySearch = "";
let playerDirectoryLeague = "";
let playerDirectoryPage = 0;
let expandedFixtureStatsId = null;
let fixtureFilter = "all";
let lastAutosaveAt = 0;
let autosaveUnavailable = false;
let matchSimulationTimer = null;
let simulationProgressTimer = null;
let simulationProgressCompleteTimer = null;

function serializeCareerSave(compact = false) {
  return JSON.stringify(
    compact && typeof career.toCompactJSON === "function"
      ? career.toCompactJSON()
      : career.toJSON(),
  );
}

function writeCareerStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error?.name !== "QuotaExceededError") throw error;
  }

  const previous = localStorage.getItem(key);
  localStorage.removeItem(key);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (previous != null) {
      try {
        localStorage.setItem(key, previous);
      } catch {
        // Leave the original full save intact when possible.
      }
    }
    throw error;
  }
}

function persistAutosave() {
  if (!career || autosaveUnavailable) return;
  const previous = localStorage.getItem(AUTOSAVE_KEY);
  try {
    writeCareerStorage(AUTOSAVE_KEY, serializeCareerSave(false));
    lastAutosaveAt = Date.now();
    autosaveUnavailable = false;
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      try {
        writeCareerStorage(AUTOSAVE_KEY, serializeCareerSave(true));
        lastAutosaveAt = Date.now();
        autosaveUnavailable = false;
        return;
      } catch {
        if (previous != null) {
          try {
            localStorage.setItem(AUTOSAVE_KEY, previous);
          } catch {
            // Preserve the original quota failure without replacing it with another error.
          }
        }
        autosaveUnavailable = true;
        console.warn(
          "Autosave is unavailable because browser storage is full. Free storage or use a manual save slot.",
        );
        return;
      }
    }
    console.error("Could not autosave career:", error);
  }
}

async function loadData() {
  const [
    clubs,
    leagueConfig,
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    agents,
    competitionCsv,
    careerLeagueTeams,
    expandedLeagueConfig,
    europeanAccessConfig,
    playerDatabaseCsv,
    keyMomentOptions,
  ] = await Promise.all([
    fetchData("data/config/clubs.json").then(checkJson),
    fetchData("data/config/leagues.json").then(checkJson),
    fetchData("data/config/archetypes.json").then(checkJson),
    fetchData("data/squads/ENG.json").then(checkJson),
    fetchData("data/config/objectives.json").then(checkJson),
    fetchData("data/config/career.json").then(checkJson),
    fetchData("data/config/agents.json").then(checkJson),
    fetchData("data/config/football_leagues.csv").then(async (response) => {
      if (!response.ok)
        throw new Error(`Could not load league data (${response.status}).`);
      return response.text();
    }),
    fetchData("data/config/career-league-teams.json").then(checkJson),
    fetchData("data/config/expanded-leagues.json").then(checkJson),
    fetchData("data/config/europe-access.json").then(checkJson),
    fetchData("data/squads/touchline_player_database.csv").then(async (response) => {
      if (!response.ok)
        throw new Error(`Could not load the central player database (${response.status}).`);
      return response.text();
    }),
    fetchData("data/config/key-moment-options.json").then(checkJson),
  ]);
  leagueConfig.$expandedLeagues = expandedLeagueConfig;
  leagueConfig.$europeanAccess = europeanAccessConfig;
  const playerDatabase = parsePlayerDatabaseCsv(playerDatabaseCsv);
  data = {
    clubs,
    league: leagueConfig["premier-league"],
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    agents,
    keyMomentOptions,
    playerDatabase,
    fc25Players: playerDatabase.players.filter((player) =>
      PLAYABLE_LEAGUES.includes(player.league),
    ),
  };
  data.fc25Leagues = summarizeRosterLeagues(data.fc25Players).filter((league) =>
    PLAYABLE_LEAGUES.includes(league.name),
  );
  data.careerLeagues = buildPlayableCareerLeagues(
    data.fc25Players,
    parseCompetitionMetadataCsv(competitionCsv),
    careerLeagueTeams,
  );
  const rosterSummaries = data.fc25Leagues;
  const usedWorldPlayerNames = new Set(
    rosterSummaries.flatMap((league) =>
      league.clubs.flatMap((club) =>
        club.roster.map((player) => playerNameKey(player.displayName)),
      ),
    ),
  );
  data.fc25Leagues = data.careerLeagues.map((entry) => ({
    name: entry.league.name,
    clubs: entry.league.teamIds.map((id) => {
      const clubName = entry.clubIdentities[id].name;
      const imported = rosterSummaries
        .find((league) => league.name === entry.league.name)
        ?.clubs.find((club) => clubKey(club.clubName) === clubKey(clubName));
      return buildWorldClubSquad(
        clubName,
        imported,
        squadTemplate,
        usedWorldPlayerNames,
      );
    }),
  }));
  const defaultLeague =
    data.fc25Leagues.find((league) => league.name === "Premier League") ??
    data.fc25Leagues[0];
  worldLeagueName = defaultLeague?.name ?? "";
  worldClubName = defaultLeague?.clubs[0]?.clubName ?? "";
}

function renderFanApproval(expectation) {
  const fans = career.player.trusting.fans;
  const last = career.lastFanReaction;
  return `<section class="panel fan-approval"><div class="panel-heading"><div><div class="eyebrow">SUPPORTER MOOD</div><h2>Fan approval</h2></div><span class="live-tag">${fans}/100</span></div>
    <div class="fan-meter ${fans >= 60 ? "positive" : fans < 40 ? "negative" : ""}"><i style="width:${fans}%"></i></div>
    <div class="fan-reactions">${last ? `<div><small>LAST MATCH</small><b class="${last.change > 0 ? "positive" : last.change < 0 ? "negative" : ""}">${last.change > 0 ? "+" : ""}${last.change} · ${last.result.toUpperCase()}</b><span>${esc(last.message)} Rating ${formatDecimal(last.rating)}.</span></div>` : `<div><small>LAST MATCH</small><span>Your first performance will shape the supporters' opinion.</span></div>`}
      <div><small>${expectation ? `UP NEXT · ${esc(expectation.competition)} · ${esc(expectation.opponent)}` : "UP NEXT"}</small><b class="${expectation?.approval >= 65 ? "positive" : expectation?.approval <= 40 ? "negative" : ""}">${expectation ? `${expectation.approval}/100` : "No upcoming fixture"}</b><span>${expectation ? esc(expectation.message) : "The season schedule is complete."}</span></div></div></section>`;
}

async function checkJson(response) {
  if (!response.ok)
    throw new Error(`Could not load game data (${response.status}).`);
  return response.json();
}

/**
 * Fetch a game data file by its path under the project root.
 *
 * The paths are relative so the same build runs from the Node dev server (`/data/...`)
 * and from a static host such as Firebase Hosting. If a host returns the SPA shell
 * (`index.html`) for a missing data path — which a catch-all rewrite does — we refuse
 * the HTML and report it, so a broken deploy fails loudly instead of parsing HTML as JSON.
 */
async function fetchData(path) {
  const response = await fetch(new URL(path, DATA_BASE));
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.includes("text/html")) {
    const detail = response.ok ? 0 : response.status;
    return new Response(null, {
      status: detail || 500,
      statusText: "Data unavailable",
    });
  }
  return response;
}

function staminaMarkup(player, compact = false) {
  const stamina = ensureStamina(player);
  const tone = stamina >= 75 ? "lime" : stamina >= 40 ? "yellow" : "red";
  const color = stamina >= 75 ? "#65d46e" : stamina >= 40 ? "#f0c86a" : "#ef6b6b";
  return `<span class="stamina-meter${compact ? " stamina-compact" : ""}" title="Stamina ${stamina}%"><span class="stamina-meter-label">STAMINA ${stamina}%</span><span class="meter"><span style="width:${stamina}%;background:${color}"></span></span></span>`;
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

/** Pretty labels for the 29 sub-attributes shown on the player profile. */
const SUB_LABELS = {
  acceleration: "Acceleration",
  sprintSpeed: "Sprint Speed",
  attackingPositioning: "Att. Positioning",
  finishing: "Finishing",
  shotPower: "Shot Power",
  longShots: "Long Shots",
  volleys: "Volleys",
  penalties: "Penalties",
  vision: "Vision",
  crossing: "Crossing",
  freeKickAccuracy: "FK Accuracy",
  shortPassing: "Short Passing",
  longPassing: "Long Passing",
  curve: "Curve",
  agility: "Agility",
  balance: "Balance",
  reactions: "Reactions",
  ballControl: "Ball Control",
  dribbling: "Dribbling",
  composure: "Composure",
  defensiveAwareness: "Def. Awareness",
  interceptions: "Interceptions",
  headingAccuracy: "Heading",
  standingTackle: "Standing Tackle",
  slidingTackle: "Sliding Tackle",
  jumping: "Jumping",
  stamina: "Stamina",
  strength: "Strength",
  aggression: "Aggression",
};

/** Display names for the six outfield and four keeper group stats. */
const ATTRIBUTE_LABELS = {
  pace: "Pace",
  shooting: "Shooting",
  passing: "Passing",
  dribbling: "Dribbling",
  defending: "Defending",
  physical: "Physical",
  reflexes: "Reflexes",
  handling: "Handling",
  positioning: "Positioning",
  kicking: "Kicking",
  diving: "Diving",
  speed: "Speed",
};

/** The four panels of the player-creation screen, in order. */
const CREATION_TABS = [
  {
    key: "details",
    label: "Player details",
    hint: "Name, birth and nationality",
  },
  { key: "body", label: "Player body", hint: "Height, weight and build" },
  {
    key: "attributes",
    label: "Attributes",
    hint: "Base stats, foot and skills",
  },
  { key: "career", label: "Career setup", hint: "Role, club and world" },
];

/** Continent each playable league's nation belongs to, used to group the
    Starting league dropdown by region. */
const LEAGUE_CONTINENT = {
  ENG: "Europe",
  ESP: "Europe",
  GER: "Europe",
  ITA: "Europe",
  FRA: "Europe",
  NED: "Europe",
  POR: "Europe",
  BEL: "Europe",
  SCO: "Europe",
  TUR: "Europe",
};

const COUNTRY_NAMES = Object.fromEntries(countries);
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Builds the values shown the first time the creation screen opens. */
function defaultCreationDraft() {
  const age = 17;
  return {
    first: "Alex",
    last: "Morgan",
    birthYear: String(2026 - age),
    birthMonth: "1",
    birthDay: "1",
    age: String(age),
    nationality: "ENG",
    height: "178",
    weight: "70",
    foot: "Right",
    weakFoot: "1",
    skillMoves: "1",
    position: "ST",
    archetype: "Poacher",
    trait: "",
    personality: "Professional",
    difficulty: "Realistic",
    leagueId: "",
    clubId: "hull",
    seed: String(Math.floor(Math.random() * 900000) + 100000),
    attrs: {},
  };
}

/** True when the draft has not been filled in yet. */
function creationDraftIsEmpty(draft) {
  return !draft || Object.keys(draft).length === 0;
}

/** Reads a whole form (including unchecked boxes) into the flat creation draft. */
function readCreationForm(form) {
  const values = Object.fromEntries(new FormData(form));
  const attrs = {};
  form.querySelectorAll("[data-creation-attr]").forEach((input) => {
    attrs[input.dataset.creationAttr] = input.value;
  });
  return {
    ...values,
    attrs: { ...(creationDraft?.attrs ?? {}), ...attrs },
    baseAttrs: { ...(creationDraft?.baseAttrs ?? {}) },
    attrsCustomized: creationDraft?.attrsCustomized ?? false,
  };
}

/** Splits the stored birth date into the day/month/year inputs the form uses. */
function birthDateFields(year, month, day) {
  const safeYear = Number.isInteger(Number(year)) ? Number(year) : 2026 - 17;
  return {
    birthYear: String(safeYear),
    birthMonth: String(clampInt(Number(month) || 1, 1, 12)),
    birthDay: String(clampInt(Number(day) || 1, 1, 31)),
  };
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Default value of a group stat for a position, used to seed the creation sliders. */
function defaultCreationAttr(position, group) {
  const profiles = {
    GK: {
      reflexes: 62,
      handling: 60,
      positioning: 60,
      kicking: 55,
      diving: 58,
      speed: 45,
    },
    CB: {
      pace: 58,
      shooting: 32,
      passing: 55,
      dribbling: 48,
      defending: 70,
      physical: 72,
    },
    LB: {
      pace: 72,
      shooting: 38,
      passing: 62,
      dribbling: 62,
      defending: 64,
      physical: 60,
    },
    RB: {
      pace: 72,
      shooting: 38,
      passing: 62,
      dribbling: 62,
      defending: 64,
      physical: 60,
    },
    DM: {
      pace: 60,
      shooting: 45,
      passing: 66,
      dribbling: 62,
      defending: 68,
      physical: 68,
    },
    CDM: {
      pace: 60,
      shooting: 45,
      passing: 66,
      dribbling: 62,
      defending: 68,
      physical: 68,
    },
    CM: {
      pace: 63,
      shooting: 55,
      passing: 70,
      dribbling: 68,
      defending: 58,
      physical: 62,
    },
    AM: {
      pace: 68,
      shooting: 66,
      passing: 72,
      dribbling: 74,
      defending: 40,
      physical: 55,
    },
    CAM: {
      pace: 68,
      shooting: 66,
      passing: 72,
      dribbling: 74,
      defending: 40,
      physical: 55,
    },
    LW: {
      pace: 80,
      shooting: 66,
      passing: 68,
      dribbling: 78,
      defending: 32,
      physical: 52,
    },
    RW: {
      pace: 80,
      shooting: 66,
      passing: 68,
      dribbling: 78,
      defending: 32,
      physical: 52,
    },
    ST: {
      pace: 74,
      shooting: 76,
      passing: 58,
      dribbling: 70,
      defending: 28,
      physical: 62,
    },
  };
  const profile = profiles[position] ?? profiles.CM;
  return String(profile[group] ?? 60);
}

function clubKey(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerNameKey(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

function buildWorldClubSquad(
  clubName,
  imported,
  template,
  usedNames = new Set(),
) {
  const roster = [...(imported?.roster ?? [])];
  for (const player of roster) usedNames.add(playerNameKey(player.displayName));
  const rng = new Rng(hashString(`world-squad:${clubName}`), clubName);
  while (roster.length < 18) {
    const position =
      template.positions[roster.length % template.positions.length];
    let first;
    let last;
    let displayName;
    for (let attempt = 0; attempt < 100 && !displayName; attempt += 1) {
      first = rng.pick(template.firstNames);
      last = rng.pick(template.lastNames);
      const candidate = `${first} ${last}`;
      const nameKey = playerNameKey(candidate);
      if (!usedNames.has(nameKey)) {
        displayName = candidate;
        usedNames.add(nameKey);
      }
    }
    // A shared world-wide name pool can run out of unique first/last combinations
    // when clubs are generated in sequence. Add a deterministic suffix as a fallback.
    if (!displayName) {
      let suffix = 2;
      do {
        first = rng.pick(template.firstNames);
        last = `${rng.pick(template.lastNames)} ${suffix++}`;
        displayName = `${first} ${last}`;
      } while (usedNames.has(playerNameKey(displayName)));
      usedNames.add(playerNameKey(displayName));
    }
    const offset = template.ratingOffsetByPosition[position] ?? 0;
    const overall = Math.max(
      48,
      Math.min(
        84,
        Math.round(
          template.clubRatingFormula.base +
            60 * template.clubRatingFormula.prestigeScale +
            offset +
            rng.normal(0, template.clubRatingFormula.spread),
        ),
      ),
    );
    roster.push({
      id: `world-generated-${clubKey(clubName)}-${roster.length}`,
      displayName,
      position,
      age: rng.int(...template.ageRange),
      overall,
      potential: Math.min(96, overall + rng.int(0, 10)),
      value: null,
      source: "generated",
    });
  }
  roster.sort((a, b) => b.overall - a.overall);
  return {
    clubName,
    roster,
    squadSize: roster.length,
    importedPlayerCount: imported?.squadSize ?? 0,
    averageOverall:
      roster.reduce((total, player) => total + player.overall, 0) /
      roster.length,
  };
}

/*
 * Classic 32-panel football as inline SVG.
 * Panels are positioned on a sphere and scaled by distance from centre so the
 * design curves with the ball instead of looking like flat stickers.
 */
function footballArt() {
  const panel = (cx, cy, r, opacity = 1, shape = "pent") => {
    // Distance from centre -> fades and flattens panels toward the rim.
    const d = Math.hypot(cx - 50, cy - 50) / 50;
    const face = Math.min(1, 1 - d * 0.55);
    const pts = Array.from({ length: shape === "pent" ? 5 : 6 }, (_, i) => {
      const a = (Math.PI * 2 * i) / (shape === "pent" ? 5 : 6) - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="#101216" fill-opacity="${(opacity * face).toFixed(2)}" stroke="#0a0b0d" stroke-opacity="${(0.55 * face).toFixed(2)}" stroke-width="0.9"/>`;
  };
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Football">
    <defs>
      <radialGradient id="fb-face" cx="34%" cy="28%" r="78%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="46%" stop-color="#f3f4f6"/>
        <stop offset="78%" stop-color="#cfd3d9"/>
        <stop offset="100%" stop-color="#9aa0a9"/>
      </radialGradient>
      <radialGradient id="fb-shade" cx="72%" cy="80%" r="72%">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/>
        <stop offset="58%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity=".42"/>
      </radialGradient>
      <radialGradient id="fb-gloss" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff" stop-opacity=".95"/>
        <stop offset="55%" stop-color="#fff" stop-opacity=".25"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="fb-clip"><circle cx="50" cy="50" r="50"/></clipPath>
    </defs>
    <g clip-path="url(#fb-clip)">
      <circle cx="50" cy="50" r="50" fill="url(#fb-face)"/>
      <!-- Seams between panels -->
      <g stroke="#b9bec6" stroke-width="1.1" fill="none" opacity=".9">
        <path d="M50 30 L50 8"/><path d="M50 30 L30 44"/><path d="M50 30 L70 44"/>
        <path d="M30 44 L18 64"/><path d="M30 44 L14 28"/>
        <path d="M70 44 L82 64"/><path d="M70 44 L86 28"/>
        <path d="M18 64 L36 78"/><path d="M82 64 L64 78"/>
        <path d="M36 78 L50 92"/><path d="M64 78 L50 92"/>
      </g>
      <!-- Centre pentagon (black) -->
      ${panel(50, 46, 13.5, 1)}
      <!-- Hexagon ring around it (white, outlined) -->
      ${panel(50, 12, 9, 0.95, "hex")}
      ${panel(12, 40, 9, 0.95, "hex")}
      ${panel(88, 40, 9, 0.95, "hex")}
      ${panel(28, 84, 9, 0.95, "hex")}
      ${panel(72, 84, 9, 0.95, "hex")}
      <!-- Outer pentagons at the rim, foreshortened -->
      ${panel(8, 8, 7, 0.5)}
      ${panel(92, 8, 7, 0.5)}
      ${panel(2, 78, 7, 0.4)}
      ${panel(98, 78, 7, 0.4)}
      <!-- Lighting -->
      <circle cx="50" cy="50" r="50" fill="url(#fb-shade)"/>
      <ellipse cx="33" cy="27" rx="17" ry="12" fill="url(#fb-gloss)" transform="rotate(-28 33 27)"/>
    </g>
    <circle cx="50" cy="50" r="49.5" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1"/>
  </svg>`;
}

function stopBallAnimation() {
  if (ballAnimationFrame) cancelAnimationFrame(ballAnimationFrame);
  ballAnimationFrame = 0;
  ballSimulation = null;
}

/**
 * Drive the menu football from the physics simulation, one real frame at a time.
 * Falls back to a static ball when the user asks for reduced motion.
 */
function startBallAnimation() {
  stopBallAnimation();
  const stage = $app.querySelector(".menu-football");
  const ball = $app.querySelector(".football");
  const shadow = $app.querySelector(".football-shadow");
  if (!stage || !ball) return;
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  )?.matches;
  const sizePx = stage.clientWidth || 100;
  // The world is simulated in metres; the stage decides how many pixels a metre is.
  const bouncePx = Math.max(120, Math.min(420, window.innerHeight * 0.42));
  const pxPerMetre = bouncePx / 0.75;
  ballSimulation = createBallSimulation({ apexM: 0.75, dropFromM: 0.5 });
  const paint = () => {
    const t = ballTransform(ballSimulation.body, {
      pxPerMetre,
      bouncePx,
      sizePx,
    });
    ball.style.transform = `translate(${t.translateX.toFixed(2)}px, ${t.translateY.toFixed(2)}px) rotate(${t.rotate.toFixed(2)}deg) scale(${t.scaleX.toFixed(3)}, ${t.scaleY.toFixed(3)})`;
    if (shadow) {
      // The shadow shrinks and fades with height, and spreads on a hard contact.
      const height = Math.max(0, Math.min(1, ballSimulation.body.y / 0.9));
      const spread = 1 + ballSimulation.body.squash * 1.6;
      shadow.style.opacity = String((0.95 - height * 0.7).toFixed(3));
      shadow.style.transform = `translateX(-50%) scale(${(spread * (1 - height * 0.3)).toFixed(3)}, ${(1 - height * 0.35).toFixed(3)})`;
    }
  };
  paint();
  if (reduceMotion) return;
  lastBallFrame = 0;
  const frame = (now) => {
    if (!ballSimulation) return;
    const dt = lastBallFrame ? (now - lastBallFrame) / 1000 : 1 / 60;
    lastBallFrame = now;
    ballSimulation.step(dt);
    paint();
    ballAnimationFrame = requestAnimationFrame(frame);
  };
  ballAnimationFrame = requestAnimationFrame(frame);
}

function renderLoadGame() {
  const slots = [1, 2, 3]
    .map((slot) => {
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
      let label = "Empty slot";
      if (raw) {
        try {
          const s = JSON.parse(raw);
          label =
            `${s.creation?.first ?? "Career"} ${s.creation?.last ?? ""}`.trim();
        } catch {}
      }
      return `<div class="menu-actions"><button class="button-quiet menu-btn" type="button" data-action="load-slot" data-slot="${slot}" ${raw ? "" : "disabled"}><span class="menu-btn-icon">⟳</span><span class="menu-btn-text">SLOT 0${slot} · ${esc(label)}</span></button><button class="button-quiet menu-btn" type="button" data-action="delete-slot" data-slot="${slot}" ${raw ? "" : "disabled"}><span class="menu-btn-icon">✕</span><span class="menu-btn-text">DELETE</span></button></div>`;
    })
    .join("");
  $app.innerHTML = `<div class="menu-shell menu-shell--solo"><div class="menu-card"><div class="menu-card-inner"><div class="menu-actions">${slots}</div><div class="menu-foot"><button class="button-quiet" type="button" data-action="back-menu">← Back</button></div></div></div></div>`;
  $app
    .querySelectorAll("[data-action]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        handleAction(button.dataset.action, button.dataset),
      ),
    );
}
function renderMenu() {
  stopBallAnimation();
  const hasSaves = [1, 2, 3].some((slot) =>
    localStorage.getItem(`${SAVE_PREFIX}${slot}`),
  );
  const hasAutosave = Boolean(localStorage.getItem(AUTOSAVE_KEY));
  $app.innerHTML = `
    <div class="menu-shell menu-shell--solo">
      <div class="menu-card">
        <div class="menu-card-inner">
          <div class="menu-actions">
            <button class="button-primary menu-btn" type="button" data-action="start-new">
              <span class="menu-btn-icon">▶</span>
              <span class="menu-btn-text">START NEW GAME</span>
            </button>
            <button class="button-quiet menu-btn" type="button" data-action="start-manager">
              <span class="menu-btn-icon">⌂</span>
              <span class="menu-btn-text">MANAGER CAREER</span>
              <span class="menu-btn-tag">NEW MODE</span>
            </button>
            <button class="button-quiet menu-btn" type="button" data-action="load-game" ${hasSaves ? "" : "disabled"}>
              <span class="menu-btn-icon">⟳</span>
              <span class="menu-btn-text">LOAD GAME</span>
              ${hasSaves ? '<span class="menu-btn-tag">3 SLOTS</span>' : '<span class="menu-btn-tag">EMPTY</span>'}
            </button>
            <button class="button-quiet menu-btn" type="button" data-action="resume-autosave" ${hasAutosave ? "" : "disabled"}>
              <span class="menu-btn-icon">↻</span>
              <span class="menu-btn-text">RESUME AUTOSAVE</span>
              <span class="menu-btn-tag">${hasAutosave ? "LATEST" : "EMPTY"}</span>
            </button>
            <button class="button-quiet menu-btn" type="button" data-action="open-settings">
              <span class="menu-btn-icon">⚙</span>
              <span class="menu-btn-text">SETTINGS</span>
            </button>
            <button class="button-quiet menu-btn" type="button" data-action="open-credits">
              <span class="menu-btn-icon">★</span>
              <span class="menu-btn-text">CREDITS</span>
            </button>
          </div>
          <div class="menu-foot">
            <div class="menu-save-status">
              <span class="note-dot"></span>
              <span>${hasSaves ? "Save slots detected in this browser." : "No saved careers found. Start a new game to create one."}</span>
            </div>
            <button class="button-quiet" type="button" data-action="exit-game" aria-label="Exit the game">Exit</button>
          </div>
        </div>
      </div>
      ${notice ? `<p class="creation-notice menu-notice">${esc(notice)}</p>` : ""}
    </div>`;
  $app
    .querySelectorAll("[data-action]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        handleAction(button.dataset.action, button.dataset),
      ),
    );
}

/* ------------------------------------------------------------------------- *
 * Manager career: create a manager, then run his club.
 * ------------------------------------------------------------------------- */

/** The manager-creation draft, defaulted to the first playable league and club. */
function defaultManagerDraft() {
  const leagues = data.careerLeagues ?? [];
  const firstLeague = leagues[0];
  return {
    first: "Sam",
    last: "Reeves",
    nationality: "ENG",
    style: "Balanced",
    leagueId: firstLeague?.id ?? "",
    clubId: firstLeague?.league.teamIds[0] ?? "hull",
    difficulty: "Realistic",
    seed: String(Math.floor(Math.random() * 900000) + 100000),
  };
}

/** Every league and club the manager can take over. */
function managerLeagueOptions() {
  return (data.careerLeagues ?? []).map((entry) => ({
    id: entry.id,
    name: entry.league.name,
    clubs: entry.league.teamIds.map((clubId) => ({
      id: clubId,
      name: entry.clubIdentities[clubId]?.name ?? clubId,
      prestige: entry.clubIdentities[clubId]?.prestige ?? 50,
    })),
  }));
}

function renderManagerCreation() {
  if (!managerDraft) managerDraft = defaultManagerDraft();
  const draft = managerDraft;
  const leagues = managerLeagueOptions();
  if (!leagues.some((league) => league.id === draft.leagueId)) {
    draft.leagueId = leagues[0]?.id ?? "";
  }
  const selectedLeague = leagues.find((league) => league.id === draft.leagueId);
  if (!selectedLeague?.clubs.some((club) => club.id === draft.clubId)) {
    draft.clubId = selectedLeague?.clubs[0]?.id ?? "";
  }
  const selectedClub = selectedLeague?.clubs.find(
    (club) => club.id === draft.clubId,
  );
  const target = boardExpectationFor({
    prestige: selectedClub?.prestige ?? 50,
  });
  const styles = Object.keys(MANAGER_STYLES);

  $app.innerHTML = `
    <div class="creation-shell">
      <header class="brand-row">
        <a class="brand" href="#" aria-label="Touchline home"><span class="brand-ball">T</span> TOUCHLINE</a>
        <span class="eyebrow">MANAGER CAREER · 2026/27</span>
      </header>
      <section class="creation-grid">
        <form id="manager-form" class="creation-card" autocomplete="off" novalidate>
          <div class="form-heading"><span class="eyebrow">NEW MANAGER</span><span class="step-count">TAKE CHARGE</span></div>
          ${notice ? `<p class="creation-notice">${esc(notice)}</p>` : ""}
          <h2>Who's in the dugout?</h2>
          <div class="field-grid">
            <label class="wide">First name<input name="first" value="${esc(draft.first)}" required maxlength="24" autocomplete="given-name"></label>
            <label class="wide">Last name<input name="last" value="${esc(draft.last)}" required maxlength="28" autocomplete="family-name"></label>
            <label class="wide">Nationality<select name="nationality">${countries.map(([code, country]) => `<option value="${code}" ${code === draft.nationality ? "selected" : ""}>${country}</option>`).join("")}</select></label>
            <label>Coaching style<select name="style">${styles.map((style) => `<option value="${esc(style)}" ${style === draft.style ? "selected" : ""}>${esc(style)}</option>`).join("")}</select><small>Your style shapes the shape your side plays and how your teams are rated.</small></label>
            <label>Difficulty<select name="difficulty">${["Realistic", "Easy", "Sandbox"].map((level) => `<option ${level === draft.difficulty ? "selected" : ""}>${level}</option>`).join("")}</select></label>
            <label>League<select name="leagueId">${leagues.map((league) => `<option value="${esc(league.id)}" ${league.id === draft.leagueId ? "selected" : ""}>${esc(league.name)} · ${league.clubs.length} clubs</option>`).join("")}</select></label>
            <label>Club<select name="clubId">${(selectedLeague?.clubs ?? []).map((club) => `<option value="${esc(club.id)}" ${club.id === draft.clubId ? "selected" : ""}>${esc(club.name)} · ${club.prestige} prestige</option>`).join("")}</select></label>
            <label>Season seed<input type="number" name="seed" value="${esc(draft.seed)}" min="1" max="4294967295"><small>Use the same seed to reproduce the same world and results.</small></label>
          </div>
          <p class="creation-summary"><span>CLUB</span><b>${esc(selectedClub?.name ?? "—")}</b><span>BOARD WANTS</span><b>${esc(target.label)}</b><span>SEED</span><b>${esc(draft.seed)}</b></p>
          <p class="creation-hint">You take charge of the club's tactics, XI and results. The board judges you on the league table; the dressing room and the supporters judge you on everything else. Lose the board's confidence and the job goes.</p>
          <div class="creation-actions">
            <button class="button-quiet" type="button" data-action="back-to-menu">← Back to menu</button>
            <button class="button-primary" type="submit">Take charge <span>→</span></button>
          </div>
        </form>
      </section>
    </div>`;

  const form = $app.querySelector("#manager-form");
  // Keep the draft so switching league resets the club to a valid one.
  const syncDraft = () => {
    const values = Object.fromEntries(new FormData(form));
    managerDraft = { ...managerDraft, ...values };
  };
  form.addEventListener("change", (event) => {
    syncDraft();
    if (event.target.name === "leagueId") {
      const league = managerLeagueOptions().find(
        (entry) => entry.id === managerDraft.leagueId,
      );
      managerDraft.clubId = league?.clubs[0]?.id ?? "";
    }
    renderManagerCreation();
  });
  form.addEventListener("input", syncDraft);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    syncDraft();
    const options = {
      ...managerDraft,
      seed: Number(managerDraft.seed) || 1,
    };
    if (!options.first?.trim() || !options.last?.trim()) {
      notice = "Enter a first and last name.";
      renderManagerCreation();
      return;
    }
    try {
      career = startManagerCareer(options);
      managerDraft = null;
      screen = "manager";
      notice = `${career.managerState.first} ${career.managerState.last} takes charge of ${career.club.name}.`;
      renderGame();
    } catch (error) {
      notice = error.message;
      renderManagerCreation();
    }
  });
}

/**
 * Start a manager career from the creation form. Kept out of `createCareer`'s player
 * path so a manager career never needs a career player's attributes to be meaningful.
 */
function startManagerCareer(options) {
  const created = createCareer(data, {
    // The world still needs a player object; in manager mode it is a neutral academy
    // graduate who is not the human and never drives selection or awards.
    first: "Academy",
    last: "Graduate",
    nationality: options.nationality,
    position: "CM",
    archetype: "Playmaker",
    personality: "Professional",
    height: "178",
    weight: "70",
    weakFoot: "3",
    skillMoves: "3",
    age: "17",
    leagueId: options.leagueId,
    clubId: options.clubId,
    seed: options.seed,
    difficulty: options.difficulty,
    managerMode: true,
    manager: options,
  });
  return created;
}

/**
 * The manager hub: the dugout's home screen. Built section by section below so each
 * piece reads on its own — identity strip, board meters, season record, next fixture,
 * squad snapshot, inbox, club around the manager, season history and the trophy case.
 */
function renderManagerHub() {
  const state = career.managerState;
  if (!state) return renderOverview();
  const view = managerHubView(state);
  return `<div class="manager-hub ${view.sacked ? "is-sacked" : ""}">
    <div class="manager-sticky">
      ${renderManagerHero(view)}
      ${renderManagerActionBar(view)}
    </div>
    <div class="manager-hub-layout">
      <div class="manager-hub-main">
        ${renderManagerBoardPanel(view)}
        ${renderManagerHierarchyPanel(view)}
        ${renderManagerSeasonPanel(view)}
        ${renderManagerFixturePanel(view)}
        ${renderManagerSquadPanel(view)}
        ${renderManagerSeasonHistoryPanel(view)}
      </div>
      <aside class="manager-hub-side">
        ${renderManagerInboxPanel(view)}
        ${renderManagerClubPanel(view)}
        ${renderManagerTrophyPanel(view)}
      </aside>
    </div>
    <div class="page-bottom">RNG SEED ${career.seed} <span>·</span> ${esc(view.style)} COACH <span>·</span> ${esc(view.band)} CLUB <span>·</span> ${view.totalTrophies} TROPH${view.totalTrophies === 1 ? "Y" : "IES"}</div>
  </div>`;
}

function renderManagerHierarchyPanel(view) {
  const hierarchy = view.club.hierarchy;
  if (!hierarchy) return "";
  const owner = hierarchy.owner;
  const openRequest = (hierarchy.inbox ?? []).find(
    (item) => item.status === "open",
  );
  const staff = (hierarchy.staff ?? []).filter(
    (member) => member.role !== "scout",
  );
  return `<section class="panel manager-panel">
    <div class="panel-heading"><div><div class="eyebrow">CLUB HIERARCHY</div><h2>Boardroom & staff</h2></div><span class="live-tag">${esc(hierarchy.governance ?? "Manager-led")}</span></div>
    <div class="manager-season-grid">
      <article class="manager-season-cell"><span>OWNER</span><b>${esc(owner.name)}</b><small>${esc(owner.personality)} · ambition ${owner.ambition}/99</small></article>
      <article class="manager-season-cell"><span>CHAIRPERSON</span><b>${esc(hierarchy.board?.[0]?.name ?? "Board")}</b><small>Manager relationship ${Math.round(hierarchy.relationships?.managerBoard ?? 60)}%</small></article>
      <article class="manager-season-cell"><span>HEAD COACH</span><b>${esc(hierarchy.manager?.name ?? view.name)}</b><small>${esc(hierarchy.manager?.style ?? view.style)} · ${hierarchy.manager?.rating == null ? "—" : formatDecimal(hierarchy.manager.rating)} rating</small></article>
      <article class="manager-season-cell"><span>COACHING STAFF</span><b>${staff.length} specialists</b><small>Best development impact ${Math.round(Math.max(...staff.map((member) => member.rating ?? 0), 0))}/99</small></article>
    </div>
    ${openRequest ? `<div class="manager-panel-note"><b>${esc(openRequest.label ?? "Board request")}</b><br><span>${esc(openRequest.detail ?? "")}</span><div class="manager-actions-buttons"><button class="button-primary" data-action="owner-response" data-request-id="${esc(openRequest.id)}" data-response="accept">Accept</button><button class="button-quiet" data-action="owner-response" data-request-id="${esc(openRequest.id)}" data-response="negotiate">Negotiate</button><button class="button-quiet" data-action="owner-response" data-request-id="${esc(openRequest.id)}" data-response="explain">Explain</button></div></div>` : `<div class="manager-actions-buttons"><button class="button-quiet" data-action="owner-request">Request a board meeting</button></div>`}
  </section>`;
}

/** Everything the hub renders, read once from the career and normalised. */
function managerHubView(state) {
  const club = career.club;
  const row = career.league.table.row(club.id);
  const position = career.league.table.positions().get(club.id) ?? null;
  const target = boardExpectationFor(club);
  const band = boardBandFor(club.prestige ?? 50);
  const record = state.record ?? {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  };
  const seasons = state.seasons ?? [];
  const trophies = groupHonours(state.honours ?? []);
  return {
    state,
    club,
    row,
    position,
    target,
    band,
    record,
    seasons,
    trophies,
    confidence: Math.round(state.boardConfidence ?? 50),
    dressingRoom: Math.round(state.squadConfidence ?? 50),
    support: Math.round(state.fanSupport ?? 50),
    totalTrophies: totalTrophies(state.honours ?? []),
    style: state.style ?? career.club.manager?.style ?? "Balanced",
    name: `${state.first ?? ""} ${state.last ?? ""}`.trim(),
    sacked: !!state.sacked,
    next: nextFixture(),
  };
}

/** A headline status word for the side identity strip. */
function managerStatusWord(view) {
  if (view.sacked) return "DISMISSED";
  if (view.confidence >= 65) return "SECURE";
  if (view.confidence >= 35) return "UNDER PRESSURE";
  return "AT RISK";
}

function managerStatusTone(view) {
  if (view.sacked) return "danger";
  if (view.confidence >= 65) return "good";
  if (view.confidence >= 35) return "warn";
  return "danger";
}

function renderManagerHero(view) {
  const { club, target } = view;
  const side = `${esc(club.name)} · ${esc(career.league.name)}`;
  return `<header class="manager-hero">
    <div class="manager-hero-identity">
      ${renderClubCrest(club.name, club.shortName, "club-crest manager-crest")}
      <div class="manager-hero-text">
        <div class="eyebrow lime">MANAGER CAREER · ${esc(seasonLabel(career.season))}</div>
        <h1>${esc(view.name || "New Manager")}</h1>
        <p>${side}</p>
      </div>
    </div>
    <div class="manager-hero-facts">
      <div class="manager-fact"><span>STYLE</span><b>${esc(view.style)}</b></div>
      <div class="manager-fact"><span>BOARD TARGET</span><b>${esc(target.label)}</b></div>
      <div class="manager-fact manager-fact-status tone-${managerStatusTone(view)}"><span>JOB STATUS</span><b>${managerStatusWord(view)}</b></div>
    </div>
  </header>`;
}

function renderManagerActionBar(view) {
  const { state } = view;
  const seasonDone = career.seasonComplete;
  const isNewSeason = state.seasons?.length && !seasonDone && career.week < 0;
  const actions = [];
  if (!seasonDone && !view.sacked) {
    actions.push(
      `<button class="button-quiet" data-action="simulate-day">Simulate one day</button>`,
    );
    actions.push(
      `<button class="button-quiet" data-action="simulate-season">Simulate to season end</button>`,
    );
    actions.push(
      `<button class="button-quiet" data-action="simulate-half-season">Simulate half season</button>`,
    );
  }
  actions.push(
    `<button class="button-primary" data-action="${seasonDone ? "next-season" : "advance"}">${seasonDone ? `Start ${seasonLabel(career.season + 1)}` : isNewSeason ? "Kick off the season" : "Advance one week"} <span>→</span></button>`,
  );
  return `<section class="manager-actions" aria-label="Manager actions">
    <div class="manager-actions-context">
      <span class="manager-actions-week">${career.week < 0 ? "PRE-SEASON" : `WEEK ${career.week + 1}`}</span>
      <span class="manager-actions-date">${esc(currentDate())}</span>
    </div>
    <div class="manager-actions-buttons">${actions.join("")}</div>
  </section>`;
}

function managerMeter(label, value) {
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 65 ? "good" : pct >= 35 ? "warn" : "danger";
  return `<div class="manager-meter tone-${tone}"><div><span>${esc(label)}</span><b>${Math.round(value)}%</b></div><div class="meter"><span style="width:${pct}%"></span></div></div>`;
}

function renderManagerBoardPanel(view) {
  const { state, confidence, position, target } = view;
  const summary = state.sacked
    ? (state.sackedMessage ?? "The board has dismissed you.")
    : confidence >= 65
      ? "The board is behind you. Keep the results coming and the job is yours."
      : confidence >= 35
        ? "The board is watching the league table. A run of wins buys you time."
        : "The board has lost patience. Win now or the job goes.";
  return `<section class="panel manager-panel manager-board-panel">
    <div class="panel-heading"><div><div class="eyebrow">THE BOARDROOM</div><h2>Job security</h2></div><span class="live-tag tone-${managerStatusTone(view)}">${managerStatusWord(view)}</span></div>
    <div class="manager-board-body">
      <div class="manager-board-score tone-${confidence >= 65 ? "good" : confidence >= 35 ? "warn" : "danger"}">
        <b>${confidence}</b><small>BOARD CONFIDENCE</small>
        <span>${position ? `${ordinal(position)} in the ${esc(career.league.name)}` : "First table this season"} · targeting ${esc(target.label.toLowerCase())}</span>
      </div>
      <div class="manager-board-meters">
        ${managerMeter("Board confidence", confidence)}
        ${managerMeter("Dressing room", view.dressingRoom)}
        ${managerMeter("Supporters", view.support)}
      </div>
    </div>
    <p class="manager-panel-note ${confidence < 35 || state.sacked ? "danger-note" : ""}">${esc(summary)}</p>
  </section>`;
}

function renderManagerSeasonPanel(view) {
  const { record, row, position, target } = view;
  const gd = row.goalDifference ?? 0;
  // Result records store club NAMES, so the form strip matches on the club's name.
  const last5 =
    career.results
      .filter(
        (result) =>
          !result.pending &&
          (result.home === career.club.name ||
            result.away === career.club.name),
      )
      .slice(-5)
      .map((result) => managerResultBadge(result, career.club.name))
      .join("") || '<span class="manager-form-empty">No results yet</span>';
  const cells = [
    [
      "LEAGUE POSITION",
      position ? ordinal(position) : "—",
      row.played
        ? `${row.points} pts · GD ${gd > 0 ? `+${gd}` : gd}`
        : "No matches played",
    ],
    [
      "SEASON RECORD",
      `${record.won}-${record.drawn}-${record.lost}`,
      `${record.played} played · ${winRate(record)}% win rate`,
    ],
    [
      "GOALS FOR / AGAINST",
      `${record.goalsFor ?? 0} : ${record.goalsAgainst ?? 0}`,
      `${record.played ? formatDecimal(record.goalsFor / Math.max(1, record.played)) : "0.00"} goals per game`,
    ],
    [
      "BOARD TARGET",
      target.label,
      position
        ? `${ordinal(position)} · ${view.band} club`
        : `Prestige ${view.club.prestige ?? 50}`,
    ],
  ];
  return `<section class="panel manager-panel">
    <div class="panel-heading"><div><div class="eyebrow">THIS SEASON</div><h2>${seasonLabel(career.season)} record</h2></div><span class="live-tag">${record.played} PLAYED</span></div>
    <div class="manager-season-grid">
      ${cells.map(([label, value, note]) => `<article class="manager-season-cell"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></article>`).join("")}
    </div>
    <div class="manager-form-row"><span class="manager-form-label">LAST 5</span><div class="manager-form-badges">${last5}</div></div>
  </section>`;
}

/** A W/D/L pill for a completed result involving the manager's club. */
function managerResultBadge(result, clubName) {
  const isHome = result.home === clubName;
  const scored = isHome ? result.homeGoals : result.awayGoals;
  const conceded = isHome ? result.awayGoals : result.homeGoals;
  const outcome = scored > conceded ? "W" : scored === conceded ? "D" : "L";
  const opponent = isHome ? result.away : result.home;
  const title = `${outcome} ${scored}-${conceded} vs ${opponent ?? "opponent"}`;
  return `<span class="manager-form-badge tone-${outcome === "W" ? "good" : outcome === "D" ? "warn" : "danger"}" title="${esc(title)}">${outcome}</span>`;
}

function renderManagerFixturePanel(view) {
  const next = view.next;
  return `<section class="panel next-match-panel manager-panel">
    <div class="panel-heading"><div><div class="eyebrow">UP NEXT${next?.competition ? ` · ${esc(next.competition)}` : ""}</div><h2>${next ? `${esc(next.home.name)} <span>vs</span> ${esc(next.away.name)}` : "No fixture scheduled"}</h2></div><span class="live-tag">${next ? `${formatDate(next.day)}${next.roundLabel ? ` · ${esc(next.roundLabel)}` : ""}` : career.seasonComplete ? "SEASON COMPLETE" : "SEASON"}</span></div>
    ${next ? `<div class="fixture-preview"><div class="fixture-side">${renderClubCrest(next.home.name, next.home.shortName, "club-crest")}<b>${esc(next.home.name)}</b></div><div class="vs">VS</div><div class="fixture-side">${renderClubCrest(next.away.name, next.away.shortName, "club-crest")}<b>${esc(next.away.name)}</b></div></div>` : `<p class="manager-panel-note">${career.seasonComplete ? "The calendar is complete. Start the new season from the button above." : "No fixture is scheduled for this week."}</p>`}
  </section>`;
}

function renderManagerSquadPanel(view) {
  const day = currentDay();
  const squad = career.players.filter(
    (player) => player.clubId === career.club.id,
  );
  const lineup = selectLineup(squad, career.club.formation, day, {
    customXI: career.club.customXI ?? [],
  });
  const overall = (player) => career.displayOverall(player);
  const topScorers = [...squad]
    .sort((a, b) => (b.stats?.goals ?? 0) - (a.stats?.goals ?? 0))
    .slice(0, 3)
    .filter((player) => (player.stats?.goals ?? 0) > 0);
  const average = squad.length
    ? Math.round(
        squad.reduce((sum, player) => sum + overall(player), 0) / squad.length,
      )
    : 0;
  const injuries = squad.filter(
    (player) => career.injuryStatus(player).injured,
  );
  return `<section class="panel manager-panel">
    <div class="panel-heading"><div><div class="eyebrow">THE DRESSING ROOM</div><h2>${esc(career.club.formation)} · starting XI</h2></div><span class="live-tag">${lineup.xi.length} STARTERS · ${lineup.subs.length} SUBS</span></div>
    <div class="manager-squad-stats">
      <div><b>${average}</b><small>AVG OVERALL</small></div>
      <div><b>${squad.length}</b><small>SQUAD</small></div>
      <div><b class="${injuries.length ? "warn-value" : ""}">${injuries.length}</b><small>INJURED</small></div>
      <div><b>${career.club.wageBill(career.players) ? `€${Math.round(career.club.wageBill(career.players) / 1000)}k` : "—"}</b><small>WEEKLY WAGES</small></div>
    </div>
    <ul class="manager-lineup">
      ${lineup.xi.map(({ slot, player }) => `<li><span class="manager-lineup-slot">${esc(slot)}</span><b>${playerProfileLink(player)}</b><small>${esc(player.position)} · ${overall(player)} OVR${career.injuryStatus(player).injured ? " · INJURED" : ""}</small></li>`).join("")}
    </ul>
    <div class="manager-squad-footer">
      <div class="manager-top-scorers"><span class="manager-form-label">TOP SCORERS</span>${topScorers.length ? topScorers.map((player) => `<span class="manager-scorer">${playerProfileLink(player)} <b>${player.stats?.goals ?? 0}</b></span>`).join("") : '<span class="manager-form-empty">No goals yet</span>'}</div>
      <button class="button-quiet" data-screen="squad">Manage XI &amp; tactics</button>
    </div>
  </section>`;
}

function renderManagerInboxPanel(view) {
  const items = career.news.length
    ? career.news.slice(-6).reverse()
    : [
        "The board is watching the league table closely.",
        "Every result counts this season.",
      ];
  return `<section class="panel inbox-panel manager-panel">
    <div class="panel-heading"><div><div class="eyebrow">CLUBHOUSE</div><h2>Inbox</h2></div><span class="inbox-count">${career.news.length.toString().padStart(2, "0")}</span></div>
    <div class="news-list">${items.map((item, i) => `<div class="news-item"><span class="news-indicator ${i === 0 ? "is-new" : ""}"></span><span>${esc(item)}</span></div>`).join("")}</div>
  </section>`;
}

function renderManagerSeasonHistoryPanel(view) {
  const rows = view.seasons
    .slice()
    .reverse()
    .map((season) => {
      const verdict = season.verdict ?? "—";
      const tone =
        verdict === "met"
          ? "good"
          : verdict === "close"
            ? "warn"
            : verdict === "missed"
              ? "danger"
              : "";
      return `<tr><td>${seasonLabel(season.season)}</td><td>${season.position ? ordinal(season.position) : "—"}</td><td>${season.won}-${season.drawn}-${season.lost}</td><td>${season.goalsFor ?? 0}:${season.goalsAgainst ?? 0}</td><td><span class="manager-verdict tone-${tone}">${esc(verdict.toUpperCase())}</span></td><td>${esc((season.honours ?? []).map((h) => h.award).join(", ") || "—")}</td></tr>`;
    })
    .join("");
  return `<section class="panel manager-panel manager-history-panel">
    <div class="panel-heading"><div><div class="eyebrow">CAREER</div><h2>Season by season</h2></div><span class="live-tag">${view.seasons.length} SEASON${view.seasons.length === 1 ? "" : "S"} COMPLETE</span></div>
    ${view.seasons.length ? `<div class="manager-table-wrap"><table class="history-table"><thead><tr><th>SEASON</th><th>POS</th><th>W-D-L</th><th>GOALS</th><th>VERDICT</th><th>HONOURS</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="manager-panel-note">Your first season is under way. Complete it to see the board's verdict here.</p>`}
  </section>`;
}

function renderManagerTrophyPanel(view) {
  const { state, trophies, totalTrophies: total } = view;
  return `<section class="panel trophy-case manager-panel">
    <div class="panel-heading"><div><div class="eyebrow">MANAGER HONOURS</div><h2>Trophy cabinet</h2></div><span class="live-tag">${total} TROPH${total === 1 ? "Y" : "IES"}</span></div>
    ${trophies.length ? `<div class="trophy-grid">${trophies.map((group) => renderAwardCard({ award: group.award, winners: [{ player: `${state.first} ${state.last}`, club: group.competition }], value: `${group.count}× · ${seasonsLabel(group.seasons) || "this season"}`, valueLabel: "", count: group.count, seasons: group.seasons }, group.latestSeason ?? group.seasons.at(-1))).join("")}</div>` : '<p class="muted">Win a league or a cup and it will be kept here.</p>'}
  </section>`;
}

function renderManagerOverview() {
  const state = career.managerState;
  const row = career.league.table.row(career.club.id);
  const place = career.league.table.positions().get(career.club.id);
  const next = nextFixture();
  const record = state.record ?? { played: 0, won: 0, drawn: 0, lost: 0 };
  const target = boardExpectationFor(career.club);
  const confidence = Math.round(state.boardConfidence ?? 50);
  const seasonDone = career.seasonComplete;
  return `
    <div class="page-heading"><div><div class="eyebrow lime">THE DUGOUT</div><h1>Career hub</h1><p>${esc(state.first)} ${esc(state.last)} · ${esc(career.club.name)}</p></div><div class="overview-actions">${!seasonDone ? `<button class="button-quiet" data-action="simulate-day">Simulate one day</button><button class="button-quiet" data-action="simulate-season">Simulate to end of season</button>` : ""}<button class="button-primary" data-action="advance" ${seasonDone ? "disabled" : ""}>${seasonDone ? "Season complete" : "Advance one week"} <span>→</span></button></div></div>
    ${seasonDone ? `<div class="season-finish"><div><span class="eyebrow">ALL LEAGUES COMPLETE · ${seasonLabel(career.season)}</span><h2>${esc(career.club.name)} finish ${ordinal(place)}</h2><p>${row.points} points · ${record.won}-${record.drawn}-${record.lost} this season · board confidence ${confidence}%</p><button class="button-primary" data-action="next-season">Move to ${seasonLabel(career.season + 1)} <span>→</span></button></div><span class="finish-mark">FT</span></div>` : ""}
    <div class="stat-grid">
      <article class="stat-card"><div class="card-label">YOUR CLUB</div><div class="big-number">${ordinal(place)}</div><div class="muted">${esc(career.league.name)} · ${row.points} pts · GD ${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</div></article>
      <article class="stat-card"><div class="card-label">BOARD CONFIDENCE</div><div class="big-number">${confidence}<span>/100</span></div><div class="muted">Target: ${esc(target.label)}</div></article>
      <article class="stat-card"><div class="card-label">RECORD</div><div class="stat-triplet"><div><b>${record.won}</b><small>WON</small></div><div><b>${record.drawn}</b><small>DRAWN</small></div><div><b>${record.lost}</b><small>LOST</small></div></div><div class="muted">${winRate(record)}% win rate</div></article>
    </div>
    <section class="panel next-match-panel"><div class="panel-heading"><div><div class="eyebrow">UP NEXT${next?.competition ? ` · ${esc(next.competition)}` : ""}</div><h2>${next ? `${esc(next.home.name)} <span>vs</span> ${esc(next.away.name)}` : "No fixture scheduled"}</h2></div><span class="live-tag">${next ? `${formatDate(next.day)}${next.roundLabel ? ` · ${esc(next.roundLabel)}` : ""}` : "SEASON"}</span></div>
      ${next ? `<div class="fixture-preview"><div class="fixture-side">${renderClubCrest(next.home.name, next.home.shortName, "club-crest")}<b>${esc(next.home.name)}</b></div><div class="vs">VS</div><div class="fixture-side">${renderClubCrest(next.away.name, next.away.shortName, "club-crest")}<b>${esc(next.away.name)}</b></div></div>` : ""}
    </section>
    <section class="panel inbox-panel"><div class="panel-heading"><div><div class="eyebrow">CLUBHOUSE</div><h2>Latest update</h2></div><span class="inbox-count">${career.news.length.toString().padStart(2, "0")}</span></div>
      <div class="news-list">${(career.news.slice(-4).reverse().length ? career.news.slice(-4).reverse() : ["The board is watching the league table closely.", "The new season is underway. Every result counts."]).map((item, i) => `<div class="news-item"><span class="news-indicator ${i === 0 ? "is-new" : ""}"></span><span>${esc(item)}</span></div>`).join("")}</div></section>
    <div class="page-bottom">RNG SEED ${career.seed} <span>·</span> ${career.clubs.length} CLUBS <span>·</span> ${career.league.fixtures.length} MATCHDAYS</div>`;
}

function renderCredits() {
  $app.innerHTML = `
    <div class="menu-shell">
      <div class="menu-hero">
        <div class="menu-brand">
          <a class="brand" href="#" aria-label="Touchline home"><span class="brand-ball">T</span> TOUCHLINE</a>
          <span class="eyebrow">ABOUT THE GAME</span>
        </div>
        <div class="menu-title">
          <div class="eyebrow lime">CREDITS</div>
          <h1>Touchline</h1>
          <p>A dependency-free, browser-based football player-career simulation.</p>
        </div>
      </div>
      <div class="menu-card">
        <div class="menu-card-inner">
          <section class="panel"><div class="panel-heading"><div><div class="eyebrow">GAME INFO</div><h2>Touchline · 2026/27</h2></div></div>
            <p class="muted">Build your player, choose a league and club, and advance a week at a time through the scheduled league and tournament fixtures.</p>
          </section>
          <section class="panel"><div class="panel-heading"><div><div class="eyebrow">FEATURES</div><h2>What's inside</h2></div></div>
            <div class="menu-list">
              <span><b>01</b> Player creation · archetype, position, personality</span>
              <span><b>02</b> Seeded squad and fixture results</span>
              <span><b>03</b> Weekly training and attribute development</span>
              <span><b>04</b> League tables, stats, and award races</span>
              <span><b>05</b> Continental tournaments and the FIFA World Cup</span>
              <span><b>06</b> Three browser save slots</span>
            </div>
          </section>
          <section class="panel"><div class="panel-heading"><div><div class="eyebrow">DATA</div><h2>Player data</h2></div></div>
            <p class="muted">English top-flight squads include curated real-player examples; supporting players are generated. The examples are not verified 2026/27 rosters. Names, goals, and ratings remain editable in the CSV.</p>
          </section>
          <div class="menu-foot">
            <button class="button-quiet" type="button" data-action="back-to-menu">← Back to menu</button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSettings() {
  const rows = [
    {
      key: "sound",
      label: "Sound effects",
      desc: "Play audio cues for goals, cards, and key moments.",
    },
    {
      key: "showTips",
      label: "Show tips",
      desc: "Display contextual hints on new screens.",
    },
  ];
  const markup = `
    <div class="menu-shell">
      <div class="menu-hero">
        <div class="menu-brand">
          <a class="brand" href="#" aria-label="Touchline home"><span class="brand-ball">T</span> TOUCHLINE</a>
          <span class="eyebrow">OPTIONS</span>
        </div>
        <div class="menu-title">
          <div class="eyebrow lime">GAME SETTINGS</div>
          <h1>Preferences</h1>
          <p>Adjust the experience to your taste. These are stored locally.</p>
        </div>
      </div>
      <div class="menu-card">
        <div class="menu-card-inner">
          <div class="settings-grid">
            ${rows
              .map(
                (row) => `
              <label class="settings-row">
                <span class="settings-copy"><b>${esc(row.label)}</b><small>${esc(row.desc)}</small></span>
                <span class="settings-toggle" data-setting="${esc(row.key)}">
                  <input type="checkbox" ${menuSettings[row.key] ? "checked" : ""} role="switch" aria-label="${esc(row.label)}">
                  <span class="settings-slider"></span>
                </span>
              </label>
            `,
              )
              .join("")}
          </div>
          <div class="menu-foot">
            <button class="button-quiet" type="button" data-action="back-to-menu">← Back to menu</button>
          </div>
        </div>
      </div>
    </div>`;
  $app.innerHTML = markup;
  $app.querySelectorAll("[data-setting]").forEach((toggle) =>
    toggle.addEventListener("change", (event) => {
      const key = toggle.dataset.setting;
      menuSettings[key] = event.target.checked;
      try {
        localStorage.setItem(
          `touchline-settings-${key}`,
          String(menuSettings[key]),
        );
      } catch (error) {
        notice = `Could not save setting: ${error.message}`;
      }
    }),
  );
}

function renderCreation() {
  const availableLeagues = data.careerLeagues ?? [];
  const defaultLeagueId = availableLeagues[0]?.id ?? "";
  const getLeague = (id) => availableLeagues.find((entry) => entry.id === id);
  const fallbackTeams = () =>
    data.league.teamIds.map((id) => ({
      id,
      ...data.clubs[data.league.clubGroup][id],
    }));
  const teamsFor = (leagueId) => {
    const league = getLeague(leagueId);
    return league
      ? league.league.teamIds.map((id) => ({
          id,
          ...league.clubIdentities[id],
        }))
      : fallbackTeams();
  };

  // --- Shared body preview -------------------------------------------------------
  // The silhouette, the height/weight/BMI read-out, and the "WHAT THIS BODY DOES TO
  // YOUR STATS" grid all come from the same draft values. Keeping them in one helper
  // means dragging a slider updates every part of the body display at once.
  function buildBodyPanel(draft) {
    const heightCm = Number(draft.height) || 178;
    const weightKg = Number(draft.weight) || 70;
    const bmi = weightKg / (heightCm / 100) ** 2;
    const build =
      bmi < 20
        ? "Lean"
        : bmi < 24
          ? "Athletic"
          : bmi < 27
            ? "Strong"
            : "Powerful";
    const heightShare = Math.round(
      ((Math.min(210, Math.max(150, heightCm)) - 150) / 60) * 100,
    );
    const weightShare = Math.round(
      ((Math.min(120, Math.max(45, weightKg)) - 45) / 75) * 100,
    );
    const bodyProfile = physiqueFactors(heightCm, weightKg);

    const swing = (value, label, unit = "%", scale = 0.09) => {
      const delta = Math.round(value * scale * 100);
      return delta === 0
        ? `<span><b>${label}</b><em>average</em></span>`
        : `<span><b>${label}</b><em class="${delta > 0 ? "up" : "down"}">${delta > 0 ? "+" : ""}${delta}${unit}</em></span>`;
    };
    const physiquePreview = [
      swing(-bodyProfile.mass, "Pace"),
      swing(bodyProfile.mass, "Strength"),
      swing(bodyProfile.stature, "Heading"),
      swing(-bodyProfile.stature, "Jump", "%", 15),
      swing(-bodyProfile.stature, "Ball control"),
    ].join("");

    const heightBand =
      heightCm < 168 ? "short" : heightCm > 188 ? "tall" : "average";
    const buildBand =
      bmi < 20
        ? "lean"
        : bmi < 24
          ? "athletic"
          : bmi < 27
            ? "strong"
            : "powerful";

    return `
      <div class="creation-body-card">
        <div class="creation-body-silhouette" data-height="${heightBand}" data-build="${buildBand}" aria-hidden="true">
          <span class="body-head"></span>
          <span class="body-torso" style="--build:${Math.min(1.35, Math.max(0.85, bmi / 23)).toFixed(2)}"></span>
          <span class="body-legs"></span>
        </div>
        <div class="creation-body-stats">
          <div><small>HEIGHT</small><b>${heightCm} cm</b><span class="meter"><span style="width:${heightShare}%"></span></span></div>
          <div><small>WEIGHT</small><b>${weightKg} kg</b><span class="meter"><span style="width:${weightShare}%"></span></span></div>
          <span class="creation-hint">${formatDecimal(bmi)} BMI · taller players win headers, heavier players win challenges but are slower.</span></div>
        </div>
      <div class="creation-physique">
        <small>WHAT THIS BODY DOES TO YOUR STATS</small>
        <div class="creation-physique-grid">${physiquePreview}</div>
        <span class="creation-hint">These effects apply to you for your entire career, in every match, and to every player in the world.</span>
        <button class="button-quiet creation-body-refresh" type="button" data-action="refresh-body">↻ Refresh body display</button>
      </div>`;
  }

  function refreshBodyPanel() {
    const draft = creationDraft;
    const card = form.querySelector(".creation-body-card");
    const physique = form.querySelector(".creation-physique");
    const attrGrid = form.querySelector(".creation-attr-grid");
    if (card || physique || attrGrid) {
      const bodyHtml = buildBodyPanel(draft);
      // The helper returns the card + physique block; splice it in next to the
      // height/weight inputs so the sliders keep their focus and listeners.
      const fragment = document
        .createRange()
        .createContextualFragment(bodyHtml);
      if (card) card.replaceWith(fragment.querySelector(".creation-body-card"));
      if (physique) {
        const replacement = fragment.querySelector(".creation-physique");
        physique.replaceWith(replacement);
        // The refresh button ships inside the swapped block, so re-bind it here.
        replacement
          .querySelector('[data-action="refresh-body"]')
          ?.addEventListener("click", () => handleAction("refresh-body", {}));
      }
      // The body type shifts every attribute, so re-render the read-only grid too.
      if (attrGrid) {
        const position = POSITIONS.includes(draft.position)
          ? draft.position
          : "CM";
        const isKeeper = position === "GK";
        const attrGroups = isKeeper
          ? [...GK_ATTRIBUTES, "diving", "speed"]
          : ATTRIBUTES;
        const bodyProfile = physiqueFactors(
          Number(draft.height) || 178,
          Number(draft.weight) || 70,
        );
        const archetypeSpec =
          data.archetypes[position]?.[draft.archetype] ?? {};
        const archetypeFocus = archetypeSpec.focus ?? "";
        const renderAttr = (group) => {
          const hasCustomValue =
            draft.attrsCustomized && draft.attrs?.[group] != null;
          const base = Number(
            hasCustomValue
              ? draft.attrs[group]
              : (draft.baseAttrs?.[group] ??
                  draft.attrs?.[group] ??
                  defaultCreationAttr(position, group)),
          );
          let value = base;
          if (!hasCustomValue && bodyProfile.mass) value += bodyProfile.mass;
          if (bodyProfile.stature && group === "physical")
            value += hasCustomValue ? 0 : Math.round(bodyProfile.stature);
          if (!hasCustomValue && archetypeFocus === group) value += 4;
          const clamped = Math.max(1, Math.min(99, Math.round(value)));
          draft.baseAttrs = {
            ...(draft.baseAttrs ?? {}),
            [group]: String(base),
          };
          draft.attrs = { ...(draft.attrs ?? {}), [group]: String(clamped) };
          return `<label class="creation-attr"><span><b>${ATTRIBUTE_LABELS[group] ?? group}</b><output data-attr-value="${group}">${clamped}</output></span><input type="range" name="${group}" min="1" max="99" step="1" value="${clamped}" data-creation-attr="${group}" aria-label="${esc(ATTRIBUTE_LABELS[group] ?? group)}"></label>`;
        };
        attrGrid.innerHTML = attrGroups.map(renderAttr).join("");
      }
      return;
    }
    // Fallback: rebuild the whole screen if the card isn't found.
    renderCreation();
  }
  // Exposed so the global action handler can trigger a refresh from the button.
  window.__refreshBodyPanel = refreshBodyPanel;
  refreshBodyPanel = refreshBodyPanel;

  // Everything the user typed lives in `creationDraft`, so switching between the four
  // panels never loses input. It is only reset when a career actually starts.
  if (creationDraftIsEmpty(creationDraft)) {
    creationDraft = defaultCreationDraft();
    creationDraft.leagueId = defaultLeagueId;
    creationDraft.clubId = teamsFor(defaultLeagueId)[0]?.id ?? "hull";
  }
  if (!CREATION_TABS.some((tab) => tab.key === creationTab)) {
    creationTab = CREATION_TABS[0].key;
  }
  const draft = creationDraft;
  const teams = teamsFor(draft.leagueId);
  if (!teams.some((club) => club.id === draft.clubId)) {
    draft.clubId = teams[0]?.id ?? "hull";
  }
  const draftLeague = getLeague(draft.leagueId);
  const draftClub = teams.find((club) => club.id === draft.clubId);
  const position = POSITIONS.includes(draft.position) ? draft.position : "CM";
  const archetypeKeys = Object.keys(data.archetypes).filter(
    (key) => key !== "$comment",
  );
  // Archetypes are grouped by position now, so the dropdown only shows the archetypes
  // that match the selected position. If the current archetype is no longer valid for
  // the new position, fall back to the first archetype for that position.
  const archetypesForPosition = data.archetypes[position] ?? {};
  const positionArchetypeKeys = Object.keys(archetypesForPosition);
  if (!positionArchetypeKeys.includes(draft.archetype)) {
    draft.archetype = positionArchetypeKeys[0] ?? archetypeKeys[0] ?? "";
  }
  const archetypeSpec = archetypesForPosition[draft.archetype] ?? {};
  const availableSaves = [1, 2, 3].filter((slot) =>
    localStorage.getItem(`${SAVE_PREFIX}${slot}`),
  );
  // The four pages are a flow, not free tabs: you can go back, but only forward one
  // section at a time, and the career can only start on the last page.
  const creationTabIndex = Math.max(
    0,
    CREATION_TABS.findIndex((tab) => tab.key === creationTab),
  );
  const isLastCreationTab = creationTabIndex === CREATION_TABS.length - 1;

  // --- Panel 1: player details ---------------------------------------------------
  const [birthYear, birthMonth, birthDay] = [
    draft.birthYear,
    draft.birthMonth,
    draft.birthDay,
  ];
  const birthLabel = `${Number(birthDay)} ${MONTH_NAMES[Number(birthMonth) - 1] ?? "January"} ${birthYear}`;
  const ageNow = Number(draft.age) || 17;
  const detailsPanel = `
    <div class="field-grid">
      <label class="wide">First name<input name="first" value="${esc(draft.first)}" required maxlength="24" autocomplete="given-name"></label>
      <label class="wide">Last name<input name="last" value="${esc(draft.last)}" required maxlength="28" autocomplete="family-name"></label>
      <label>Year of birth<select name="birthYear">${Array.from(
        { length: 12 },
        (_, index) => 2026 - 16 - index,
      )
        .map(
          (year) =>
            `<option value="${year}" ${String(year) === String(birthYear) ? "selected" : ""}>${year}</option>`,
        )
        .join("")}</select></label>
      <label>Age on day one<input value="${ageNow} years old" readonly aria-label="Age on day one"></label>
      <label>Month of birth<select name="birthMonth">${MONTH_NAMES.map((name, index) => `<option value="${index + 1}" ${String(index + 1) === String(birthMonth) ? "selected" : ""}>${name}</option>`).join("")}</select></label>
      <label>Day of birth<select name="birthDay">${Array.from(
        { length: 28 },
        (_, index) => index + 1,
      )
        .map(
          (day) =>
            `<option value="${day}" ${String(day) === String(birthDay) ? "selected" : ""}>${day}</option>`,
        )
        .join("")}</select></label>
      <label class="wide">Country from<select name="nationality">${countries.map(([code, country]) => `<option value="${code}" ${code === draft.nationality ? "selected" : ""}>${country}</option>`).join("")}</select><small>Your national team eligibility is decided by this choice.</small></label>
    </div>
    <p class="creation-summary"><span>BIRTHDAY</span><b>${esc(birthLabel)}</b><span>AGE</span><b>${ageNow}</b><span>NATION</span><b>${esc(COUNTRY_NAMES[draft.nationality] ?? draft.nationality)}</b></p>`;

  // --- Panel 2: player body ------------------------------------------------------
  const bodyInputs = `
    <div class="field-grid">
      <label>Height (cm)<input type="number" name="height" value="${esc(draft.height)}" min="150" max="210" step="1"><input type="range" class="creation-range" min="150" max="210" step="1" value="${Number(draft.height) || 178}" data-range-for="height" aria-label="Height slider"></label>
      <label>Weight (kg)<input type="number" name="weight" value="${esc(draft.weight)}" min="45" max="120" step="1"><input type="range" class="creation-range" min="45" max="120" step="1" value="${Number(draft.weight) || 70}" data-range-for="weight" aria-label="Weight slider"></label>
    </div>`;
  const bodyPanel = bodyInputs + buildBodyPanel(draft);

  // --- Panel 3: attributes -------------------------------------------------------
  const isKeeper = position === "GK";
  const attrGroups = isKeeper
    ? [...GK_ATTRIBUTES, "diving", "speed"]
    : ATTRIBUTES;
  // The body type shifts every attribute, and the archetype gives the focus group a
  // bonus. These are read-only — the numbers are what the game will actually use.
  const bodyProfile = physiqueFactors(
    Number(draft.height) || 178,
    Number(draft.weight) || 70,
  );
  const archetypeFocus = archetypeSpec.focus ?? "";
  const renderStars = (value, label, key) => {
    const count = Math.max(0, Math.min(5, Number(value) || 0));
    const stars = Array.from({ length: 5 }, (_, index) =>
      index < count
        ? '<span class="creation-star filled">★</span>'
        : '<span class="creation-star">★</span>',
    ).join("");
    return `<label class="creation-skill"><span><b>${esc(label)}</b><small>${count} / 5 stars</small></span><span class="creation-stars" data-skill="${key}">${stars}</span><input type="hidden" name="${key}" value="${count}"></label>`;
  };
  const renderAttr = (group) => {
    const hasCustomValue =
      draft.attrsCustomized && draft.attrs?.[group] != null;
    const base = Number(
      hasCustomValue
        ? draft.attrs[group]
        : (draft.baseAttrs?.[group] ??
            draft.attrs?.[group] ??
            defaultCreationAttr(position, group)),
    );
    let value = base;
    if (!hasCustomValue && bodyProfile.mass) value += bodyProfile.mass;
    if (bodyProfile.stature && group === "physical")
      value += hasCustomValue ? 0 : Math.round(bodyProfile.stature);
    if (!hasCustomValue && archetypeFocus === group) value += 4;
    const clamped = Math.max(1, Math.min(99, Math.round(value)));
    draft.baseAttrs = {
      ...(draft.baseAttrs ?? {}),
      [group]: String(base),
    };
    draft.attrs = { ...(draft.attrs ?? {}), [group]: String(clamped) };
    return `<label class="creation-attr"><span><b>${ATTRIBUTE_LABELS[group] ?? group}</b><output data-attr-value="${group}">${clamped}</output></span><input type="range" name="${group}" min="1" max="99" step="1" value="${clamped}" data-creation-attr="${group}" aria-label="${esc(ATTRIBUTE_LABELS[group] ?? group)}"></label>`;
  };
  const attributePanel = `
    <div class="field-grid">
      <label>Playing position<select name="position">${POSITIONS.map((p) => `<option value="${p}" ${p === position ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label>Preferred foot<select name="foot"><option ${draft.foot === "Right" ? "selected" : ""}>Right</option><option ${draft.foot === "Left" ? "selected" : ""}>Left</option></select></label>
      ${renderStars(draft.weakFoot, "Weak foot", "weakFoot")}
      ${renderStars(draft.skillMoves, "Skill moves", "skillMoves")}
      <label>Archetype<select name="archetype">${positionArchetypeKeys.map((a) => `<option value="${esc(a)}" ${a === draft.archetype ? "selected" : ""}>${esc(a)}</option>`).join("")}</select></label>
      <label class="wide">Archetype profile<small id="archetype-description">${esc(archetypeSpec.description ?? "A specialist profile built around your role.")}</small></label>
    </div>
    <h3 class="creation-subheading">Base attributes</h3>
    <div class="creation-attr-grid">
      ${attrGroups.map(renderAttr).join("")}
    </div>
    <p class="creation-hint">Your starting overall always stays at 70. ${isKeeper ? "Goalkeepers are rated on their keeper stats." : "Each group is the average of its detailed sub-attributes."} Your body type (height and weight) shifts these numbers up or down, and your archetype gives your focus group a small bonus.</p>`;

  // --- Panel 4: career setup -----------------------------------------------------
  // Group the playable leagues by continent so the Starting league dropdown is
  // organised by region instead of one long flat list.
  const leaguesByContinent = availableLeagues.reduce((map, entry) => {
    const continent = LEAGUE_CONTINENT[entry.league.nation] ?? "Europe";
    (map[continent] ??= []).push(entry);
    return map;
  }, {});
  const continentOrder = ["Europe", "Africa", "Asia", "Americas"];
  const continentOptions = continentOrder
    .filter((continent) => leaguesByContinent[continent]?.length)
    .map((continent) =>
      leaguesByContinent[continent]
        .map(
          (entry) =>
            `<option value="${esc(entry.id)}" ${entry.id === draft.leagueId ? "selected" : ""}>${esc(entry.league.name)} · ${entry.league.clubCount} clubs</option>`,
        )
        .join(""),
    )
    .join("");
  const careerPanel = `
    <div class="field-grid">
      <label>Starting league<select name="leagueId">${availableLeagues.length ? continentOptions : '<option value="">England · Premier League · generated league</option>'}</select><small>Choose the league your career begins in. Clubs with no imported player data use generated squads.</small></label>
      <label>Starting club<select name="clubId">${teams.map((club) => `<option value="${esc(club.id)}" ${club.id === draft.clubId ? "selected" : ""}>${esc(club.name)} · ${club.prestige} prestige</option>`).join("")}</select></label>
      <label>Development trait<select name="trait"><option value="" ${draft.trait ? "" : "selected"}>None</option><option ${draft.trait === "Wonderkid" ? "selected" : ""}>Wonderkid</option><option ${draft.trait === "Late Bloomer" ? "selected" : ""}>Late Bloomer</option><option ${draft.trait === "Early Peak" ? "selected" : ""}>Early Peak</option><option ${draft.trait === "Late Bloomer (Physical)" ? "selected" : ""}>Late Bloomer (Physical)</option></select></label>
      <label>Personality<select name="personality">${PERSONALITIES.map((p) => `<option ${p === draft.personality ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label>Difficulty<select name="difficulty"><option ${draft.difficulty === "Easy" ? "selected" : ""}>Easy</option><option ${draft.difficulty === "Normal" ? "selected" : ""}>Normal</option><option ${draft.difficulty === "Hard" ? "selected" : ""}>Hard</option><option ${draft.difficulty === "Realistic" ? "selected" : ""}>Realistic</option></select><small>Realistic is the hardest difficulty: the AI is ruthless, your rivals are strong, and every match feels earned.</small></label>
      <label>Season seed<input type="number" name="seed" value="${esc(draft.seed)}" min="1" max="4294967295"><small>Use the same seed to reproduce the same world and results.</small></label>
    </div>
    <p class="creation-summary"><span>CLUB</span><b>${esc(draftClub?.name ?? "—")}</b><span>LEAGUE</span><b>${esc(draftLeague?.league.name ?? "Generated league")}</b><span>DIFFICULTY</span><b>${esc(draft.difficulty)}</b></p>`;

  const panels = {
    details: detailsPanel,
    body: bodyPanel,
    attributes: attributePanel,
    career: careerPanel,
  };

  $app.innerHTML = `
    <div class="creation-shell">
      <header class="brand-row">
        <a class="brand" href="#" aria-label="Touchline home"><span class="brand-ball">T</span> TOUCHLINE</a>
        <span class="eyebrow">PLAYER CAREER · 2026/27</span>
      </header>
      <section class="creation-grid">
        <form id="creation-form" class="creation-card" autocomplete="off" novalidate>
          <div class="form-heading"><span class="eyebrow">NEW CAREER</span><span class="step-count">01 / CREATE</span></div>
          <div class="resume-bar"><label>CONTINUE<select id="resume-slot" ${availableSaves.length ? "" : "disabled"}>${(availableSaves.length ? availableSaves : [1]).map((slot) => `<option value="${slot}">Save slot 0${slot}</option>`).join("")}</select></label><button class="button-quiet" type="button" data-action="resume" ${availableSaves.length ? "" : "disabled"}>Load career →</button></div>
          ${notice ? `<p class="creation-notice">${esc(notice)}</p>` : ""}
          <div class="creation-stage-heading"><span class="eyebrow">STEP ${String(creationTabIndex + 1).padStart(2, "0")} / 04</span><h2>${esc(CREATION_TABS[creationTabIndex].label)}</h2><p>${esc(CREATION_TABS[creationTabIndex].hint)}</p></div>
          <div class="creation-progress" aria-label="Creation progress">
            ${CREATION_TABS.map(
              (tab, index) =>
                `<span class="creation-progress-step ${index < creationTabIndex ? "done" : ""} ${index === creationTabIndex ? "current" : ""} ${index > creationTabIndex ? "locked" : ""}"><b>${index + 1}</b>${esc(tab.label)}</span>`,
            ).join('<i aria-hidden="true"></i>')}
          </div>
          <nav class="creation-tabs" aria-label="Creation steps">
            ${CREATION_TABS.map((tab, index) => `<div class="creation-tab ${creationTab === tab.key ? "active" : ""} ${index < creationTabIndex ? "done" : "locked"}"><b>${index + 1}. ${esc(tab.label)}</b><small>${esc(tab.hint)}</small></div>`).join("")}
          </nav>
          ${CREATION_TABS.map(
            (tab) =>
              `<section class="creation-panel ${creationTab === tab.key ? "active" : ""}" id="creation-panel-${tab.key}" role="tabpanel" aria-labelledby="creation-tab-${tab.key}" data-panel="${tab.key}">${panels[tab.key]}</section>`,
          ).join("")}
          <div class="creation-actions">
            <button class="button-quiet" type="button" data-creation-step="prev" ${creationTabIndex === 0 ? "disabled" : ""}>← Back</button>
            <span class="creation-step-label">Section ${creationTabIndex + 1} of ${CREATION_TABS.length}</span>
            <button class="button-quiet" type="button" data-creation-step="next" ${isLastCreationTab ? "disabled" : ""}>Next →</button>
            <button class="button-primary" type="submit" ${isLastCreationTab ? "" : 'tabindex="-1" aria-hidden="true" title="Complete all four sections to start your career"'}>Start your career <span>→</span></button>
          </div>
          <p class="form-footnote">Your potential is hidden. Your performances are not.</p>
        </form>
      </section>
    </div>`;

  const form = $app.querySelector("#creation-form");

  // Keep the draft in sync with every keystroke and slider move, so nothing is lost
  // when the user jumps between panels.
  const syncDraft = () => {
    creationDraft = readCreationForm(form);
    const age = Number(creationDraft.birthYear);
    if (Number.isInteger(age)) creationDraft.age = String(2026 - age);
  };
  form.addEventListener("input", (event) => {
    syncDraft();
    if (event.target.name === "height" || event.target.name === "weight") {
      // Refresh the body read-out (silhouette, bars, physique) live as the numbers
      // change, without tearing down the whole form and losing the slider focus.
      refreshBodyPanel();
      return;
    }
    if (event.target.dataset.creationAttr) {
      const group = event.target.dataset.creationAttr;
      creationDraft.attrsCustomized = true;
      let adjustment = bodyProfile.mass;
      if (group === "physical") adjustment += Math.round(bodyProfile.stature);
      if (archetypeFocus === group) adjustment += 4;
      creationDraft.baseAttrs = {
        ...(creationDraft.baseAttrs ?? {}),
        [group]: String(
          Math.max(1, Math.min(99, Number(event.target.value) - adjustment)),
        ),
      };
      const output = form.querySelector(`[data-attr-value="${group}"]`);
      if (output) output.textContent = event.target.value;
      return;
    }
    if (event.target.dataset.rangeFor) {
      const twin = form.querySelector(
        `[name="${event.target.dataset.rangeFor}"]`,
      );
      if (twin) twin.value = event.target.value;
      return;
    }
    if (event.target.name === "birthYear") {
      const ageInput = form.querySelector('[aria-label="Age on day one"]');
      const year = Number(event.target.value);
      if (ageInput && Number.isInteger(year))
        ageInput.value = `${2026 - year} years old`;
      return;
    }
    if (
      event.target.name === "birthMonth" ||
      event.target.name === "birthDay"
    ) {
      const summary = form.querySelector(
        ".creation-panel.active .creation-summary b",
      );
      if (summary) {
        summary.textContent = `${Number(creationDraft.birthDay)} ${MONTH_NAMES[Number(creationDraft.birthMonth) - 1]} ${creationDraft.birthYear}`;
      }
    }
  });
  form.addEventListener("change", (event) => {
    syncDraft();
    if (event.target.name === "position") {
      // A new position gets that position's sensible starting profile and resets
      // the archetype to the first one for the new position.
      const nextPosition = event.target.value;
      creationDraft.baseAttrs = Object.fromEntries(
        (nextPosition === "GK"
          ? [...GK_ATTRIBUTES, "diving", "speed"]
          : ATTRIBUTES
        ).map((group) => [group, defaultCreationAttr(nextPosition, group)]),
      );
      creationDraft.attrs = {};
      creationDraft.attrsCustomized = false;
      const firstArchetype = Object.keys(
        data.archetypes[nextPosition] ?? {},
      )[0];
      if (firstArchetype) creationDraft.archetype = firstArchetype;
      renderCreation();
      return;
    }
    if (event.target.name === "archetype") {
      renderCreation();
      return;
    }
    if (event.target.name === "leagueId") {
      creationDraft.clubId = teamsFor(event.target.value)[0]?.id ?? "hull";
      renderCreation();
      return;
    }
    if (event.target.name === "clubId") {
      const summary = form.querySelectorAll(
        ".creation-panel.active .creation-summary b",
      );
      const club = teams.find((entry) => entry.id === event.target.value);
      if (summary[0] && club) summary[0].textContent = club.name;
      return;
    }
    if (
      event.target.name === "nationality" ||
      event.target.name === "difficulty"
    ) {
      // These only feed the summary strip, so a redraw keeps it truthful.
      renderCreation();
    }
  });
  // The tab buttons live outside the form's field scope, but inside the markup above,
  // so they are queried from the whole app shell.
  const goToTab = (key) => {
    syncDraft();
    creationTab = key;
    renderCreation();
  };
  $app.querySelectorAll("[data-creation-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = CREATION_TABS.findIndex(
        (tab) => tab.key === button.dataset.creationTab,
      );
      // The step indicator previews later stages, but forward movement stays sequential.
      if (index > creationTabIndex) {
        if (
          creationTabIndex !== 0 ||
          !creationDraft.first?.trim() ||
          !creationDraft.last?.trim()
        ) {
          notice = `Finish section ${creationTabIndex + 1} first — the pages unlock in order.`;
          renderCreation();
          return;
        }
        notice = "";
        goToTab(CREATION_TABS[creationTabIndex + 1].key);
        return;
      }
      goToTab(button.dataset.creationTab);
    }),
  );
  $app
    .querySelector('[data-creation-step="prev"]')
    .addEventListener("click", () => {
      if (creationTabIndex === 0) return;
      goToTab(CREATION_TABS[creationTabIndex - 1].key);
    });
  $app
    .querySelector('[data-creation-step="next"]')
    .addEventListener("click", () => {
      if (isLastCreationTab) return;
      syncDraft();
      if (!creationDraft.first?.trim() || !creationDraft.last?.trim()) {
        notice = "Enter a first and last name to continue.";
        creationTab = "details";
        renderCreation();
        return;
      }
      notice = "";
      goToTab(CREATION_TABS[creationTabIndex + 1].key);
    });
  // Enter in a text box would otherwise submit from any page, skipping the flow.
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target.tagName === "TEXTAREA") return;
    if (event.target.type === "submit") return;
    event.preventDefault();
    if (!isLastCreationTab) {
      syncDraft();
      if (
        creationTabIndex === 0 &&
        (!creationDraft.first?.trim() || !creationDraft.last?.trim())
      ) {
        notice = "Enter a first and last name to continue.";
        renderCreation();
        return;
      }
      notice = "";
      goToTab(CREATION_TABS[creationTabIndex + 1].key);
    }
  });
  // Weak foot and skill moves are star pickers: delegated handling keeps the
  // picker interactive after its contents are refreshed.
  form.addEventListener("click", (event) => {
    const star = event.target.closest(".creation-star");
    const bar = star?.closest(".creation-stars");
    if (!star || !bar) return;
    const key = bar.dataset.skill;
    const count = Array.from(bar.children).indexOf(star) + 1;
    creationDraft[key] = String(count);
    const fresh = renderStars(
      count,
      key === "weakFoot" ? "Weak foot" : "Skill moves",
      key,
    );
    const parent = bar.closest(".creation-skill");
    if (parent) parent.outerHTML = fresh;
  });
  $app.querySelector('[data-action="resume"]').addEventListener("click", () => {
    const slot = $app.querySelector("#resume-slot").value;
    try {
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
      if (!raw) throw new Error(`Save slot 0${slot} is empty.`);
      const saved = JSON.parse(raw);
      career = createCareer(data, saved.creation, saved);
      screen = resumeCareerScreen(career);
      renderedScreen = null;
      notice = `Welcome back, ${career.player.first}.`;
      window.__career = career;
      window.__renderGame = renderGame;
      renderGame();
    } catch (error) {
      notice = `Could not load career: ${error.message}`;
      renderCreation();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    syncDraft();
    // The whole four-page flow must be completed before a career can be created.
    if (!isLastCreationTab) {
      notice = `Complete all ${CREATION_TABS.length} sections to start your career.`;
      renderCreation();
      return;
    }
    const selectedTeams = teamsFor(creationDraft.leagueId);
    if (!selectedTeams.some((club) => club.id === creationDraft.clubId)) {
      creationDraft.clubId = selectedTeams[0]?.id ?? "";
    }
    const options = {
      ...creationDraft,
      attrs: { ...creationDraft.attrs },
      seed: Number(creationDraft.seed) || 1,
    };
    if (!options.first?.trim() || !options.last?.trim()) {
      notice = "Enter a first and last name.";
      creationTab = "details";
      renderCreation();
      return;
    }
    try {
      career = createCareer(data, options);
      creationDraft = null;
      creationTab = null;
      screen = "overview";
      notice = `Welcome to ${career.club.name}. The hard work starts now.`;
      // Exposed for QA and the console: the live career object, read-only in practice.
      window.__career = career;
      window.__renderGame = renderGame;
      renderGame();
    } catch (error) {
      notice = error.message;
      renderCreation();
    }
  });
}

function renderGame() {
  if (screen !== "simulation" && matchSimulationTimer != null) {
    window.clearTimeout(matchSimulationTimer);
    matchSimulationTimer = null;
  }
  if (screen === "menu") return renderMenu();
  if (screen === "manager-create") return renderManagerCreation();
  if (screen === "load-game") return renderLoadGame();
  if (screen === "settings") return renderSettings();
  if (screen === "credits") return renderCredits();
  if (!career) return renderCreation();
  persistAutosave();
  const previousScreen = renderedScreen;
  const isScreenTransition = previousScreen !== screen;
  if (previousScreen && previousScreen !== screen && !isBackNavigation) {
    screenScrollPositions.set(previousScreen, captureGameScroll());
    if (
      !["menu", "manager-create", "load-game", "settings", "credits"].includes(
        previousScreen,
      )
    ) {
      screenHistory.push(previousScreen);
    }
  }
  let scrollToRestore = screenScrollPositions.get(screen) ?? null;
  if (previousScreen === screen) {
    scrollToRestore = captureGameScroll();
    screenScrollPositions.set(screen, scrollToRestore);
  }
  const navGroups = [
    {
      id: "dashboard",
      title: "1. Dashboard",
      subtitle: "Main hub",
      items: [
        ...(career.isManagerCareer
          ? [["manager", "Manager hub", "♜"]]
          : [["overview", "Overview", "⌂"]]),
        ...(!career.isManagerCareer ? [["simulation", "MATCH SIM", "▶"]] : []),
        ["info", "Game Info", "ⓘ"],
        ["history", "History", "✦"],
      ],
    },
    {
      id: "club",
      title: "2. Club & Squad",
      subtitle: "Team management",
      items: [
        ["team", "Team", "★"],
        ["squad", "Formation & Squad", "♟"],
        ["coaches", "Coaches", "♛"],
        ["players", "Players", "♙"],
        ...(career.isManagerCareer
          ? [["office", "Club office", "▦"]]
          : [
              ["player", "Player Hub", "◎"],
              ["conversation", "Talk to Coach", "✦"],
            ]),
        ["training", "Training & Development", "↗"],
        ["transfers-list", "Transfers List", "⇄"],
        ...(!career.isManagerCareer ? [["agent", "Agent", "♙"]] : []),
      ],
    },
    {
      id: "competitions",
      title: "3. Competitions",
      subtitle: "League schedule",
      items: [
        ["table", "League Table", "▤"],
        ["fixtures", "Fixtures", "◷"],
        ["champions", "Champions League", "★"],
        ["world-cup", "FIFA World Cup", "🏆"],
      ],
    },
    {
      id: "performance",
      title: "4. Performance & Awards",
      subtitle: "Statistics and achievements",
      items: [
        ["stats", "Stats", "▦"],
        ["awards", "Award Race", "★"],
      ],
    },
    {
      id: "world",
      title: "5. Football World",
      subtitle: "World overview",
      items: [["world", "World", "◍"]],
    },
  ];
  $app.innerHTML = `
    <div class="game-shell${isScreenTransition ? " screen-transition" : ""}">
      <aside class="sidebar">
        <a class="brand" href="#"><span class="brand-ball">T</span> TOUCHLINE</a>
        <div class="side-label">CAREER HUB</div>
        <nav class="sidebar-nav">${navGroups
          .map(({ id, title, subtitle, items }) => {
            const isExpanded = expandedNavGroups.has(id);
            return `<section class="nav-group ${isExpanded ? "expanded" : "collapsed"}"><button class="nav-group-heading" data-nav-group="${id}" aria-expanded="${isExpanded}" aria-controls="nav-items-${id}"><span><b>${title}</b><small>${subtitle}</small></span><span class="nav-group-chevron" aria-hidden="true">${isExpanded ? "▾" : "▸"}</span></button><div class="nav-group-items" id="nav-items-${id}" ${isExpanded ? "" : "hidden"}>${items.map(([key, label, icon]) => `<button class="nav-item ${screen === key ? "active" : ""}" data-screen="${key}" aria-label="${label}" title="${label}"><span>${icon}</span>${label}</button>`).join("")}</div></section>`;
          })
          .join("")}</nav>
        <div class="sidebar-bottom">
          <div class="club-mini">${renderClubCrest(career.club.name, career.club.shortName, "club-crest")}<div><b>${esc(career.club.name)}</b><small>${esc(career.league.name)}</small></div></div>
          <button class="nav-item" data-action="new-career"><span>＋</span>New career</button>
        </div>
      </aside>
      <section class="workspace">
        <header class="topbar">
          <div class="topbar-heading">
            ${screen !== "overview" && screen !== "manager" ? '<button class="button-quiet game-back-button" type="button" data-action="game-back" aria-label="Go back">← Back</button>' : ""}
            <div><div class="eyebrow">SEASON ${seasonLabel(career.season)}</div><div class="top-date">${currentDate()}</div></div>
          </div>
          <div class="top-actions">
            <label class="slot-select">SAVE SLOT <select id="slot">${[1, 2, 3].map((slot) => `<option value="${slot}">Slot 0${slot}</option>`).join("")}</select></label>
            <button class="button-quiet" data-action="save">Save</button>
            <button class="button-quiet" data-action="load">Load</button>
            <button class="button-quiet" data-action="delete">Delete</button>
          </div>
        </header>
        <div class="sim-progress-bar" id="sim-progress-bar" hidden>
          <div class="sim-progress-fill" id="sim-progress-fill"></div>
          <small class="sim-progress-label" id="sim-progress-label">Simulating…</small>
        </div>
        <main class="content">
          ${notice ? `<div class="toast">${esc(notice)}<button aria-label="Dismiss" data-action="dismiss">×</button></div>` : ""}
          ${renderScreen()}
        </main>
      </section>
    </div>`;
  renderedScreen = screen;
  isBackNavigation = false;
  if (scrollRestoreFrame) cancelAnimationFrame(scrollRestoreFrame);
  scrollRestoreFrame = requestAnimationFrame(() => {
    restoreGameScroll(scrollToRestore);
    scrollRestoreFrame = 0;
  });

  $app.querySelectorAll("[data-nav-group]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const groupId = button.dataset.navGroup;
      const isExpanded = !expandedNavGroups.has(groupId);
      if (isExpanded) expandedNavGroups.add(groupId);
      else expandedNavGroups.delete(groupId);
      const group = button.closest(".nav-group");
      button.setAttribute("aria-expanded", String(isExpanded));
      button.querySelector(".nav-group-chevron").textContent = isExpanded
        ? "▾"
        : "▸";
      group.classList.toggle("expanded", isExpanded);
      group.classList.toggle("collapsed", !isExpanded);
      group.querySelector(".nav-group-items").hidden = !isExpanded;
    }),
  );
  $app.querySelectorAll("[data-screen]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      selectedLineupPlayerId = null;
      screen = button.dataset.screen;
      if (screen === "players") viewedPlayerId = null;
      notice = "";
      renderGame();
    }),
  );
  const destinationLeagueSelect = $app.querySelector(
    "#agent-destination-league",
  );
  const destinationClubSelect = $app.querySelector(
    "#agent-destination-club",
  );
  const searchSelectedClubButton = $app.querySelector(
    '[data-action="refresh-offers"][data-search-all="false"]',
  );
  destinationLeagueSelect?.addEventListener("change", () => {
    destinationClubSelect.replaceChildren(
      new Option("Choose a club", ""),
    );
    const league = career.worldCareerLeagues.find(
      (entry) => entry.league.id === destinationLeagueSelect.value,
    );
    if (!league) {
      destinationClubSelect.disabled = true;
      return;
    }
    for (const clubId of league.league.teamIds) {
      if (clubId === career.club.id) continue;
      const clubName = league.clubIdentities?.[clubId]?.name ?? clubId;
      destinationClubSelect.add(new Option(clubName, clubId));
    }
    destinationClubSelect.disabled = destinationClubSelect.options.length < 2;
    searchSelectedClubButton.disabled = true;
  });
  destinationClubSelect?.addEventListener("change", () => {
    searchSelectedClubButton.disabled =
      !destinationClubSelect.value ||
      Number(searchSelectedClubButton.dataset.searchesRemaining) <= 0;
  });
  $app
    .querySelector("#wage-negotiation-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      handleAction("submit-wage-request", {
        offerId: form.dataset.offerId,
        wage: form.elements.wage.value,
      });
    });
  // On a phone the sidebar becomes a horizontal icon strip that can overflow; keep
  // the active screen visible rather than hidden off the right-hand edge.
  $app
    .querySelector(".nav-item.active")
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  bindPlayerLinks($app);
  $app
    .querySelector('[data-action="player-directory"]')
    ?.addEventListener("click", () => {
      viewedPlayerId = null;
      screen = "players";
      renderGame();
    });
  $app.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", (event) => {
      // Buttons nested inside a <form> (search filters, developer password, etc.)
      // must not submit the form and reload the page. This is the single fix that
      // stops every data-action button from refreshing the screen.
      if (event.defaultPrevented) return;
      event.preventDefault();
      handleAction(button.dataset.action, button.dataset);
    }),
  );
  $app.querySelectorAll("[data-lineup-bench]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!career.isManagerCareer) {
        notice = "Only the manager can change the starting XI.";
        renderGame();
        return;
      }
      selectedLineupPlayerId = button.dataset.lineupBench;
      notice =
        "Now tap a starter to swap, or drag the substitute onto a starter.";
      renderGame();
    });
  });
  $app.querySelectorAll(".lineup-bench-player").forEach((button) => {
    button.addEventListener("dragstart", (event) => {
      if (!career.isManagerCareer) return;
      selectedLineupPlayerId = button.dataset.playerId;
      event.dataTransfer?.setData("text/plain", selectedLineupPlayerId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
  });
  $app.querySelectorAll("[data-lineup-starter]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (!career.isManagerCareer) {
        notice = "Only the manager can change the team layout.";
        renderGame();
        return;
      }
      if (event.target.closest("[data-open-player]")) return;
      if (!selectedLineupPlayerId) {
        notice = "Choose a substitute first, then tap the starter to replace.";
        renderGame();
        return;
      }
      swapLineupSelection(button.dataset.lineupStarter);
    });
    button.addEventListener("keydown", (event) => {
      if (event.target !== button || !["Enter", " "].includes(event.key))
        return;
      event.preventDefault();
      button.click();
    });
    button.addEventListener("dragover", (event) => event.preventDefault());
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      selectedLineupPlayerId =
        event.dataTransfer?.getData("text/plain") || selectedLineupPlayerId;
      if (selectedLineupPlayerId)
        swapLineupSelection(button.dataset.lineupStarter);
    });
  });
  const focus = $app.querySelector("#training-focus");
  if (focus)
    focus.addEventListener("change", () => {
      try {
        if (career.isManagerCareer) {
          career.setClubTrainingPlan({ programme: $app.querySelector("#club-training-programme")?.value, intensity: $app.querySelector("#club-training-intensity")?.value });
        } else career.setTrainingFocus(focus.value);
        persistAutosave();
        notice = `Individual focus set to ${focus.value}.`;
      } catch (error) {
        notice = error.message;
      }
      renderGame();
    });
  $app.querySelectorAll(".developer-attribute").forEach((input) =>
    input.addEventListener("change", () => {
      try {
        const result = career.setPlayerAttribute(
          input.dataset.attribute,
          Number(input.value),
        );
        notice = `${result.attribute} set to ${result.value}. Overall: ${result.overall}.`;
      } catch (error) {
        notice = `Could not edit attribute: ${error.message}`;
      }
      renderGame();
    }),
  );
  const developerPasswordForm = $app.querySelector("#developer-password-form");
  if (developerPasswordForm)
    developerPasswordForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const password = $app.querySelector("#developer-password").value;
      if (password !== DEVELOPER_MODE_PASSWORD) {
        notice = "Incorrect developer password.";
        renderGame();
        $app.querySelector("#developer-password")?.focus();
        return;
      }
      career.setDeveloperMode(true);
      developerModePromptOpen = false;
      notice = "Developer mode enabled.";
      renderGame();
    });
  const playstyleFilter = $app.querySelector("#playstyle-filter");
  playstyleFilter?.addEventListener("change", () => {
    $app.querySelectorAll(".playstyle-card").forEach((card) => {
      card.hidden =
        playstyleFilter.value !== "all" &&
        card.dataset.playstyleCategory !== playstyleFilter.value;
    });
  });
  const compareSelect = $app.querySelector("#playstyle-compare");
  compareSelect?.addEventListener("change", () => {
    const compare = career.players.find(
      (candidate) => candidate.id === compareSelect.value,
    );
    const output = $app.querySelector("#playstyle-comparison");
    if (!output) return;
    if (!compare) {
      output.innerHTML = "";
      return;
    }
    const ours = new Map(
      ensurePlayStyles(career.player).unlocked.map((badge) => [
        badge.id,
        badge.tier,
      ]),
    );
    const theirs = new Map(
      ensurePlayStyles(compare).unlocked.map((badge) => [badge.id, badge.tier]),
    );
    output.innerHTML = `<h3>Ability comparison · ${esc(compare.first)} ${esc(compare.last)}</h3><div class="playstyle-compare-grid">${Object.entries(
      PLAYSTYLE_REGISTRY,
    )
      .filter(([id]) => ours.has(id) || theirs.has(id))
      .map(
        ([id, definition]) =>
          `<div><b>${esc(definition.name)}</b><span>${ours.has(id) ? `You · ${ours.get(id) === "plus" ? "PlayStyle+" : "Standard"}` : "—"}</span><span>${theirs.has(id) ? `${esc(compare.first)} · ${theirs.get(id) === "plus" ? "PlayStyle+" : "Standard"}` : "—"}</span></div>`,
      )
      .join("")}</div>`;
  });
  const role = $app.querySelector("#match-role");
  if (role)
    role.addEventListener("change", () => {
      career.matchRole = role.value;
      const description = $app.querySelector("#match-role-description");
      if (description)
        description.textContent =
          ROLE_DESCRIPTIONS[role.value] ?? ROLE_DESCRIPTIONS.Balanced;
    });
  const formation = $app.querySelector("#club-formation");
  if (formation)
    formation.addEventListener("change", () => {
      if (!career.isManagerCareer) {
        notice = "Formation changes are reserved for the manager.";
        renderGame();
        return;
      }
      try {
        const resetsLineup =
          career.club.formation !== formation.value &&
          !!career.club.customXI?.length;
        career.changeFormation(formation.value);
        notice = `${formation.value} selected for ${career.club.name}.${resetsLineup ? " Your custom XI was reset for the new shape." : ""}`;
      } catch (error) {
        notice = `Could not change formation: ${error.message}`;
      }
      renderGame();
    });
  const coachFilterSelect = $app.querySelector("#coach-filter");
  if (coachFilterSelect)
    coachFilterSelect.addEventListener("change", () => {
      coachFilter = coachFilterSelect.value;
      renderGame();
    });
  const playerPosition = $app.querySelector("#player-position");
  if (playerPosition)
    playerPosition.addEventListener("change", () => {
      try {
        const result = career.changePosition(playerPosition.value);
        const roleReset = !playerRoleOptionsForPosition(result.position).some(
          (role) => role.name === career.matchRole,
        );
        if (roleReset) career.matchRole = "Balanced";
        const change =
          result.difference > 0
            ? `+${result.difference}`
            : String(result.difference);
        notice = `Position changed to ${result.position}. Overall: ${result.previousOverall} → ${result.overall} (${change}).${roleReset ? " Player role reset to Balanced." : ""}`;
      } catch (error) {
        notice = `Could not change position: ${error.message}`;
      }
      renderGame();
    });
  const playerShirtNumber = $app.querySelector("#player-shirt-number");
  if (playerShirtNumber)
    playerShirtNumber.addEventListener("change", () => {
      try {
        const number = career.setPlayerShirtNumber(
          Number(playerShirtNumber.value),
        );
        notice = `Your shirt number is now ${number}.`;
      } catch (error) {
        notice = `Could not change shirt number: ${error.message}`;
      }
      renderGame();
    });
  const worldLeague = $app.querySelector("#world-league");
  if (worldLeague)
    worldLeague.addEventListener("change", () => {
      worldLeagueName = worldLeague.value;
      worldClubName =
        data.fc25Leagues.find((league) => league.name === worldLeagueName)
          ?.clubs[0]?.clubName ?? "";
      renderGame();
    });
  const worldClub = $app.querySelector("#world-club");
  if (worldClub)
    worldClub.addEventListener("change", () => {
      worldClubName = worldClub.value;
      renderGame();
    });
  const statsLeague = $app.querySelector("#stats-league");
  if (statsLeague)
    statsLeague.addEventListener("change", () => {
      statsLeagueId = statsLeague.value;
      renderGame();
    });
  const playerSearch = $app.querySelector("#player-directory-search");
  const playerDirectoryForm = $app.querySelector("#player-directory-form");
  playerSearch?.addEventListener("input", () => {
    playerDirectorySearch = playerSearch.value;
  });
  if (playerSearch && playerDirectoryForm)
    playerDirectoryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      playerDirectorySearch = playerSearch.value.trim();
      playerDirectoryPage = 0;
      renderGame();
    });
  const playerLeagueFilter = $app.querySelector("#player-directory-league");
  if (playerLeagueFilter)
    playerLeagueFilter.addEventListener("change", () => {
      playerDirectoryLeague = playerLeagueFilter.value;
      playerDirectoryPage = 0;
      renderGame();
    });
    const fixtureFilterSelect = $app.querySelector("#fixture-filter");
    fixtureFilterSelect?.addEventListener("change", () => {
      fixtureFilter = fixtureFilterSelect.value;
      renderGame();
    });
  // The player hub embeds the same directory with suffixed IDs so both pages can
  // bind without clashing.
  const hubSearch = $app.querySelector("#player-directory-search-hub");
  hubSearch?.addEventListener("input", () => {
    playerDirectorySearch = hubSearch.value;
  });
  const hubForm = $app.querySelector("#player-directory-form-hub");
  if (hubForm)
    hubForm.addEventListener("submit", (event) => {
      event.preventDefault();
      playerDirectorySearch = hubSearch.value.trim();
      renderGame();
    });
  const hubLeague = $app.querySelector("#player-directory-league-hub");
  if (hubLeague)
    hubLeague.addEventListener("change", () => {
      playerDirectoryLeague = hubLeague.value;
      renderGame();
    });
  $app.querySelectorAll("[data-player-page]").forEach((button) =>
    button.addEventListener("click", () => {
      playerDirectoryPage = Number(button.dataset.playerPage);
      renderGame();
    }),
  );
  scheduleMatchSimulationTick();
}

function resumeCareerScreen(savedCareer) {
  if (
    savedCareer.lastReport?.userMatch &&
    savedCareer.matchSimulation?.status !== "finished"
  ) {
    return "simulation";
  }
  return savedCareer.isManagerCareer ? "manager" : "overview";
}

function scheduleMatchSimulationTick() {
  if (matchSimulationTimer != null) {
    window.clearTimeout(matchSimulationTimer);
    matchSimulationTimer = null;
  }
  if (
    screen !== "simulation" ||
    career?.matchSimulation?.status !== "running"
  )
    return;
  matchSimulationTimer = window.setTimeout(() => {
    matchSimulationTimer = null;
    try {
      career.tickMatchSimulation();
      refreshLiveMatchDisplay();
      if (
        career.matchSimulation.minute > 0 &&
        career.matchSimulation.minute % 10 === 0
      ) {
        persistAutosave();
      }
      if (career.matchSimulation.status === "running") {
        scheduleMatchSimulationTick();
      } else if (
        ["paused", "finished"].includes(career.matchSimulation.status)
      ) {
        persistAutosave();
      }
    } catch (error) {
      console.error("Live match simulation failed:", error);
      notice = `Match simulation stopped: ${error.message}`;
      updateLiveMatchNotice();
    }
  }, 450);
}

function refreshLiveMatchDisplay() {
  const match = career?.lastReport?.userMatch;
  const state = career?.matchSimulation;
  if (!match || !state || screen !== "simulation") return;

  const fullTimeMinute = 90 + Math.max(0, Number(match.addedTime) || 0);
  const minute = $app.querySelector("#simulation-minute");
  const progress = $app.querySelector("#simulation-progress");
  if (minute) {
    const clockText = `${matchMinuteLabel(state.minute)}'`;
    if (minute.textContent !== clockText) minute.textContent = clockText;
  }
  if (progress) {
    const width = `${Math.min(100, (state.minute / fullTimeMinute) * 100)}%`;
    if (progress.style.width !== width) progress.style.width = width;
  }

  const liveTag = $app.querySelector("#simulation-live-tag");
  if (liveTag) {
    const statusLabel =
      state.status === "finished"
        ? "FULL TIME"
        : state.status === "paused"
          ? "KEY MOMENT · PAUSED"
          : state.status === "running"
            ? "LIVE"
            : "READY";
    const liveText =
      liveTag.classList.contains("simulation-competition")
        ? `${match.competitionName ?? career.league.name} · ${
            state.status === "finished"
              ? "FULL TIME"
              : state.status === "paused"
                ? "KEY MOMENT"
                : state.status === "running"
                  ? `LIVE · ${state.minute}'`
                  : "READY TO PLAY"
          }`
        : statusLabel;
    if (liveTag.textContent !== liveText) liveTag.textContent = liveText;
  }

  const homeScore = $app.querySelector("#home-score");
  const awayScore = $app.querySelector("#away-score");
  if (homeScore && homeScore.textContent !== String(match.homeGoals)) {
    homeScore.textContent = String(match.homeGoals);
  }
  if (awayScore && awayScore.textContent !== String(match.awayGoals)) {
    awayScore.textContent = String(match.awayGoals);
  }

  const goal = state.lastGoalEvent;
  const goalKey = goal
    ? `${goal.side}:${goal.minute}:${goal.scorerId ?? goal.scorerName}`
    : "none";
  const commentary = $app.querySelector("#live-goal-commentary");
  if (commentary && commentary.dataset.goalKey !== goalKey) {
    const scorerTeam = goal
      ? goal.side === "home"
        ? match.home.name
        : match.away.name
      : "";
    commentary.classList.toggle("has-goal", Boolean(goal));
    commentary.innerHTML = goal
      ? `<span>GOAL · ${goal.minute}'</span><b>${playerProfileLink(goal.scorerId, goal.scorerName)}</b><small>${esc(scorerTeam)}${goal.assistName ? ` · Assist: ${playerProfileLink(goal.assistId, goal.assistName)}` : ""}</small>`
      : `<span>LIVE COMMENTARY</span><b>No goals yet</b><small>The scorer will appear here when a goal is scored.</small>`;
    commentary.dataset.goalKey = goalKey;
    bindPlayerLinks(commentary);
  }

  const situation = state.lastSituation;
  const situationKey = situation
    ? `${situation.minute}:${situation.text}:${Boolean(situation.entry)}`
    : "none";
  const situationNode = $app.querySelector("#live-situation");
  if (situationNode && situationNode.dataset.situationKey !== situationKey) {
    situationNode.classList.toggle("has-situation", Boolean(situation));
    situationNode.classList.toggle("entry", Boolean(situation?.entry));
    situationNode.dataset.situationKey = situationKey;
    situationNode.dataset.minute = situation?.entry
      ? String(situation.minute)
      : "";
    situationNode.textContent = situation
      ? `${situation.entry ? "PLAYER ENTERS THE PITCH · " : ""}${situation.minute}' · ${situation.text}`
      : "";
  }

  refreshLivePlayerStatus(state, match);
  refreshLivePitch(match, state.minute);
  refreshLiveKeyMomentTimeline(match, state);
  refreshLiveEventFeed(match, state);
  refreshLiveMatchEvent(state, match);

  const substitutionButton = $app.querySelector("#poor-substitution");
  if (substitutionButton) {
    substitutionButton.hidden = !(
      ["running", "paused"].includes(state.status) &&
      state.minute >= 45 &&
      match.playerResult.rating <= 5.8 &&
      !state.userSubbedOff
    );
  }
}

function refreshLivePlayerStatus(state, match) {
  const node = $app.querySelector("#player-pitch-status");
  if (!node) return;
  const status = describePlayerStatus(state, match);
  const className = `player-pitch-status ${status.tone}`;
  if (node.className !== className) node.className = className;
  const label = node.querySelector("span:last-child");
  const labelMarkup = status.labelHtml ?? esc(status.label);
  if (label && label.innerHTML !== labelMarkup) {
    label.innerHTML = labelMarkup;
    bindPlayerLinks(label);
  }
}

function refreshLivePitch(match, minute) {
  const root = $app.querySelector("#match-formations");
  if (!root) return;
  const lineupKey = matchLineupSignature(match);
  if (root.dataset.lineupKey === lineupKey) {
    refreshLivePitchIncidents(root, match, minute);
    return;
  }
  const wantedMarkup = renderMatchFormations(
    match,
    career.matchSimulation.status === "finished"
      ? Number.POSITIVE_INFINITY
      : minute,
  );
  const template = document.createElement("template");
  template.innerHTML = wantedMarkup;
  const wanted = new Map(
    [...template.content.querySelectorAll("[data-match-side]")].map((slot) => [
      `${slot.dataset.matchSide}:${slot.dataset.matchSlotIndex}`,
      slot,
    ]),
  );
  for (const slot of root.querySelectorAll("[data-match-side]")) {
    const key = `${slot.dataset.matchSide}:${slot.dataset.matchSlotIndex}`;
    const next = wanted.get(key);
    if (!next) continue;
    if (slot.dataset.matchPlayerId !== next.dataset.matchPlayerId) {
      slot.className = next.className;
      slot.title = next.title;
      slot.style.cssText = next.style.cssText;
      slot.dataset.matchPlayerId = next.dataset.matchPlayerId;
      slot.innerHTML = next.innerHTML;
      bindPlayerLinks(slot);
    } else {
      const currentIncident = slot.querySelector(".pitch-incident");
      const nextIncident = next.querySelector(".pitch-incident");
      const incidentKey = nextIncident?.getAttribute("aria-label") ?? "";
      if ((currentIncident?.getAttribute("aria-label") ?? "") !== incidentKey) {
        currentIncident?.remove();
        if (nextIncident) slot.insertBefore(nextIncident.cloneNode(true), slot.querySelector(".pitch-name"));
      }
    }
  }
  root.dataset.lineupKey = lineupKey;
}

function refreshLivePitchIncidents(root, match, minute) {
  const visibleIncidents = new Map(
    (match.misc ?? [])
      .filter(
        (event) =>
          event.minute <= minute &&
          ["yellow", "red"].includes(event.type) &&
          event.playerId,
      )
      .map((event) => [
        event.playerId,
        event.type === "red"
          ? { label: "Red card", icon: "🟥" }
          : { label: "Yellow card", icon: "🟨" },
      ]),
  );
  for (const slot of root.querySelectorAll("[data-match-player-id]")) {
    const incident = visibleIncidents.get(slot.dataset.matchPlayerId);
    const current = slot.querySelector(".pitch-incident");
    const currentLabel = current?.getAttribute("aria-label") ?? "";
    const nextLabel = incident?.label ?? "";
    if (currentLabel === nextLabel) continue;
    current?.remove();
    if (incident) {
      const badge = document.createElement("span");
      badge.className = "pitch-incident";
      badge.dataset.matchIncidentPlayer = slot.dataset.matchPlayerId;
      badge.title = incident.label;
      badge.setAttribute("aria-label", incident.label);
      badge.textContent = incident.icon;
      slot.insertBefore(badge, slot.querySelector(".pitch-name"));
    }
  }
}

function refreshLiveKeyMomentTimeline(match, state) {
  const node = $app.querySelector("#simulation-key-moment-timeline");
  if (!node) return;
  const revealKey = match.playerResult.keyMoments
    .map((moment, index) =>
      moment.resolved || moment.minute <= state.minute
        ? `${index}:${moment.resolved?.success ?? "pending"}:${index === state.activeMomentIndex}`
        : "",
    )
    .filter(Boolean)
    .join("|");
  if (node.dataset.revealKey === revealKey) return;
  node.dataset.revealKey = revealKey;
  const revealed = revealedKeyMoments(match);
  node.innerHTML = `<div class="eyebrow">KEY MOMENT TIMELINE</div>${
    revealed.length
      ? revealed
          .map(
            ({ moment, index }) =>
              `<div class="simulation-timeline-row ${index === state.activeMomentIndex ? "current" : ""}"><b>${matchMinuteLabel(moment.minute)}'</b><span>${esc(matchMomentLabel(moment))}</span><small>${moment.resolved ? (moment.resolved.subbedOff ? "SUBBED OFF" : moment.resolved.success ? "SUCCESS" : "MISSED") : index === state.activeMomentIndex ? "NOW" : "PENDING"}</small></div>`,
          )
          .join("")
      : `<p class="muted">${match.playerResult.keyMoments.length ? "Key moments will appear here as the match clock reaches them." : "No key moments generated in this match."}</p>`
  }`;
}

function refreshLiveEventFeed(match, state) {
  const node = $app.querySelector("#simulation-event-feed");
  if (!node) return;
  const minute =
    state.status === "finished" ? Number.POSITIVE_INFINITY : state.minute;
  const feedKey = [
    match.events
      .filter((event) => event.minute <= minute)
      .map((event) => `${event.type}:${event.minute}:${event.scorerId ?? ""}`)
      .join(","),
    (match.misc ?? [])
      .filter((event) => event.minute <= minute)
      .map((event) => `${event.type}:${event.minute}:${event.playerId ?? ""}`)
      .join(","),
  ].join("|");
  if (node.dataset.feedKey === feedKey) return;
  node.dataset.feedKey = feedKey;
  node.innerHTML = renderEventTimeline(match, minute);
}

function refreshLiveMatchEvent(state, match) {
  const node = $app.querySelector("#simulation-live-event");
  if (!node) return;
  const activeMoment =
    state.activeMomentIndex == null
      ? null
      : match.playerResult.keyMoments[state.activeMomentIndex];
  const eventKey = `${state.status}:${state.activeMomentIndex ?? ""}:${state.userStatus}:${state.userEnteredPitch}:${state.userSubbedOff}`;
  if (node.dataset.eventKey === eventKey) return;
  node.dataset.eventKey = eventKey;

  const allActions = activeMoment
    ? keyMomentActions(
        activeMoment.kind,
        activeMoment.position ?? career.player.position,
        data.keyMomentOptions,
      )
    : [];
  const availableActions = activeMoment
    ? (activeMoment.options ?? allActions.slice(0, 3))
        .map((id) => allActions.find((action) => action.id === id))
        .filter(Boolean)
    : [];
  const decisionButtons = activeMoment
    ? `<div class="simulation-decisions">${availableActions
        .map(
          (option) =>
            `<button class="moment-choice" data-action="moment-decision" data-index="${state.activeMomentIndex}" data-decision="${esc(option.id)}"><span>${esc(option.label)}</span><small>${esc(option.attribute)} · ${option.modifier >= 0.08 ? "lower risk" : option.modifier <= -0.08 ? "high risk" : "balanced"}</small></button>`,
        )
        .join("")}</div>`
    : "";
  const nextAction =
    state.status === "finished"
      ? `<button class="button-primary" data-action="back-to-career">Return to career hub <span>→</span></button>`
      : state.status === "paused"
        ? decisionButtons
        : state.status === "running"
          ? `<span class="simulation-running">MATCH IN PROGRESS · CLOCK RUNNING</span>`
          : `<div class="simulation-start-actions"><button class="button-primary" data-action="start-simulation">Start match <span>▶</span></button><button class="button-quiet" data-action="skip-simulation">Skip to full time</button></div>`;
  node.innerHTML = renderSimulationLiveEvent(
    match,
    state,
    activeMoment,
    decisionButtons,
    nextAction,
  );
  node.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      handleAction(button.dataset.action, button.dataset);
    });
  });
  bindPlayerLinks(node);
}

function updateLiveMatchNotice() {
  const content = $app.querySelector(".content");
  if (!content || !notice) return;
  let toast = content.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    content.prepend(toast);
  }
  toast.innerHTML = `${esc(notice)}<button aria-label="Dismiss" data-action="dismiss">×</button>`;
  toast.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => {
    notice = "";
    toast.remove();
  });
}

function currentDate() {
  return formatDate(career.currentDay());
}

function renderScreen() {
  if (screen === "menu") return renderMenu();
  if (screen === "load-game") return renderLoadGame();
  if (screen === "settings") return renderSettings();
  if (screen === "credits") return renderCredits();
  if (screen === "overview") return renderOverview();
  if (screen === "simulation") return renderSimulation();
  if (screen === "manager") return renderManagerHub();
  if (screen === "info") return renderGameInfo();
  if (screen === "table") return renderTable();
  if (screen === "stats") return renderStats();
  if (screen === "awards") return renderAwards();
  if (screen === "team") return renderTeam();
  if (screen === "squad") return renderSquad();
  if (screen === "coaches")
    return viewedCoachId ? renderCoachProfile() : renderCoachDatabase();

  if (screen === "fixtures") return renderFixtures();
  if (screen === "champions") return renderChampionsLeague();
  if (screen === "world-cup") return renderWorldCup();
  if (screen === "players")
    return viewedPlayerId ? renderOtherPlayer() : renderPlayerDirectory();
  if (screen === "player") return renderPlayer();
  if (screen === "conversation") return renderConversation();
  if (screen === "transfers-list") return renderTransfersList();
  if (screen === "agent") return renderAgent();
  if (screen === "history") return renderHistory();
  if (screen === "investments") return career.isManagerCareer ? renderInvestments() : renderTraining();
  if (screen === "scouting") return career.isManagerCareer ? renderScouting() : renderTraining();
  if (screen === "office") return career.isManagerCareer ? renderClubOffice() : renderTraining();
  if (screen === "coaching") return career.isManagerCareer ? renderCoaching() : renderTraining();
  if (screen === "academy") return career.isManagerCareer ? renderAcademy() : renderTraining();
  if (screen === "world") return renderWorld();
  return renderTraining();
}

function showCurrentClubAfterTransfer() {
  screen = "team";
  screenScrollPositions.delete("team");
  expandedNavGroups.add("club");
}

function renderGameInfo() {
  const leaguePosition = career.league.table.positions().get(career.club.id);
  const completedMatches = career.results.filter(
    (result) => !result.pending,
  ).length;
  const currentWeek = `Week ${Math.max(1, career.week + 1)} · ${formatDate(career.currentDay())}`;
  const remainingWeeks = Math.max(0, career.calendar.length - career.week - 1);
  return `<div class="page-heading"><div><div class="eyebrow lime">TOUCHLINE GUIDE</div><h1>Game info</h1><p>Your career, match controls, competitions, and progression in one place.</p></div><span class="live-tag">${esc(seasonLabel(career.season))} SEASON</span></div>
    <div class="stat-grid">
      <article class="stat-card"><div class="card-label">YOUR CAREER</div><div class="big-number">${esc(career.club.name)}</div><div class="muted">${esc(career.league.name)} · ${leaguePosition ? `${ordinal(leaguePosition)} place` : "Position pending"}</div></article>
      <article class="stat-card"><div class="card-label">CALENDAR</div><div class="big-number">${esc(currentWeek)}</div><div class="muted">${career.seasonComplete ? "Season complete" : `${remainingWeeks} weeks remain in the calendar`}</div></article>
      <article class="stat-card"><div class="card-label">MATCH RECORD</div><div class="big-number">${completedMatches}</div><div class="muted">completed matches · natural player progression</div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">CAREER LOOP</div><h2>Advance your season</h2></div></div><p>Use <b>Advance one week</b> to progress training, recovery, and the league calendar while keeping your own match playable. Choose <b>Simulate one day</b> to automatically finish the current simulation step and complete any fixtures scheduled for it. You can also simulate the rest of the season from the Career hub.</p></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">MATCH DAY</div><h2>Review match results</h2></div></div><p>Results and player performances are recorded as the season advances. Open Fixtures and select <b>Game stats</b> on a completed match to review both teams' match statistics.</p></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">PLAYER DEVELOPMENT</div><h2>Train your player</h2></div></div><p>Select an individual focus in Training. Attributes develop gradually from age, potential, minutes and performance, training quality, staff specialisation, facilities, fitness, morale and recovery. No training-point purchases or club spending are available in player-career mode.</p></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">LEAGUES</div><h2>Follow your competition</h2></div></div><p>Use League table, Fixtures, Stats, and Award race to follow your club and players. Your scheduled league matches can be played live or simulated from the Career hub.</p></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">SAVES</div><h2>Keep your career</h2></div></div><p>Use Save and Load in the top bar to manage one of three browser save slots. Saves include your player, match and competition progress, fixtures, and career history. Use New career to start over.</p></section>
    </div>`;
}

function captureGameScroll() {
  const elements = [...$app.querySelectorAll("*")];
  const seen = new Map();
  const scrollables = [];
  for (const element of elements) {
    const classes = [...element.classList];
    const selector = element.id
      ? `#${CSS.escape(element.id)}`
      : classes.length
        ? `.${classes.map((name) => CSS.escape(name)).join(".")}`
        : element.tagName.toLowerCase();
    const index = seen.get(selector) ?? 0;
    seen.set(selector, index + 1);
    if (
      element.scrollHeight <= element.clientHeight + 1 &&
      element.scrollWidth <= element.clientWidth + 1
    )
      continue;
    scrollables.push({
      selector,
      index,
      top: element.scrollTop,
      left: element.scrollLeft,
    });
  }
  return {
    top: window.scrollY,
    left: window.scrollX,
    scrollables,
  };
}

function restoreGameScroll(state) {
  window.scrollTo(state?.left ?? 0, state?.top ?? 0);
  for (const saved of state?.scrollables ?? []) {
    const element = $app.querySelectorAll(saved.selector)[saved.index];
    if (!element) continue;
    element.scrollTop = saved.top;
    element.scrollLeft = saved.left;
  }
}

function renderLegacyWorld() {
  const clubGroups = Object.entries(data.clubs || {}).flatMap(
    ([groupName, clubs]) =>
      Object.entries(clubs || {}).map(([clubId, club]) => ({
        ...club,
        id: clubId,
        groupName,
        averageRating:
          career.players
            .filter((player) => player.clubId === clubId && !player.isUser)
            .reduce((acc, player) => acc + calculateOverall(player), 0) /
          Math.max(
            1,
            career.players.filter(
              (player) => player.clubId === clubId && !player.isUser,
            ).length,
          ),
      })),
  );
  const leagueSummaries = Object.entries(data.clubs || {}).map(
    ([groupName, clubs]) => {
      const entries = Object.entries(clubs || {});
      const avgPrestige =
        entries.reduce((acc, [, club]) => acc + (club.prestige || 0), 0) /
        Math.max(1, entries.length);
      const bestClub = entries
        .map(([clubId, club]) => ({ ...club, clubId }))
        .sort((a, b) => (b.prestige || 0) - (a.prestige || 0))[0];
      return { groupName, avgPrestige, bestClub, size: entries.length };
    },
  );
  const topClubs = [...clubGroups]
    .sort((a, b) => (b.prestige || 0) - (a.prestige || 0))
    .slice(0, 8);
  const topPlayers = [...career.players]
    .sort((a, b) => calculateOverall(b) - calculateOverall(a))
    .slice(0, 8);
  const managers = [...career.clubs]
    .sort((a, b) => (b.manager?.rating ?? 0) - (a.manager?.rating ?? 0))
    .slice(0, 8);
  const market = [...career.clubs]
    .sort(
      (a, b) =>
        (b.prestige || 0) +
        (b.manager?.rating || 0) -
        ((a.prestige || 0) + (a.manager?.rating || 0)),
    )
    .slice(0, 8);
  const transferActivity = (
    career.transferOffers && career.transferOffers.length
      ? career.transferOffers
      : career.news.slice(-4).map((entry, index) => ({
          clubName: index % 2 === 0 ? "Transfer market" : "Player movement",
          interest: 72 + index * 4,
          fee: 15000000 + index * 2000000,
        }))
  ).slice(0, 5);
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow lime">GLOBAL OVERVIEW</div>
        <h1>World stats</h1>
        <p>Quick view of the strongest clubs, managers and transfer movement beyond your current league.</p>
      </div>
      <span class="live-tag">${clubGroups.length} clubs tracked</span>
    </div>
    <div class="stat-grid">
      <article class="stat-card"><div class="card-label">TOP CLUBS</div><div class="big-number">${topClubs[0]?.prestige ?? 0}</div><div class="muted">${topClubs[0]?.name ?? "—"} prestige</div></article>
      <article class="stat-card"><div class="card-label">BEST PLAYER</div><div class="big-number">${topPlayers[0] ? calculateOverall(topPlayers[0]) : 0}</div><div class="muted">${topPlayers[0] ? `${topPlayers[0].first} ${topPlayers[0].last}` : "—"}</div></article>
      <article class="stat-card"><div class="card-label">TOP MANAGER</div><div class="big-number">${managers[0]?.manager?.rating ?? 0}</div><div class="muted">${managers[0]?.manager?.name ?? "—"}</div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-heading"><div><div class="eyebrow">CLUB POWER</div><h2>Top teams</h2></div></div>
        <div class="transfer-list">
          ${topClubs
            .map(
              (club, index) => `
            <div class="transfer-agent">
              <div>
                <b>#${index + 1} ${esc(club.name)}</b>
                <small>${esc(club.groupName)} · prestige ${club.prestige}</small>
              </div>
              <div class="agent-meta">
                <span>Avg squad ${formatDecimal(club.averageRating || 0)}</span>
                <span>${club.budget ? `€${formatDecimal(club.budget / 1_000_000)}m` : "Budget"}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading"><div><div class="eyebrow">PLAYER POWER</div><h2>Highest-rated players</h2></div></div>
        <div class="transfer-list">
          ${topPlayers
            .map(
              (player, index) => `
            <div class="transfer-agent">
              <div>
                <b>#${index + 1} ${playerProfileLink(player)}</b>
                <small>${esc(player.position)} · ${esc(player.clubId || "Free agent")}</small>
              </div>
              <div class="agent-meta">
                <span>${calculateOverall(player)} OVR</span>
                <span>${player.potential ?? calculateOverall(player)} POT</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-heading"><div><div class="eyebrow">MANAGER INFLUENCE</div><h2>Top managers</h2></div></div>
        <div class="transfer-list">
          ${managers
            .map(
              (club, index) => `
            <div class="transfer-agent">
              <div>
                <b>#${index + 1} ${esc(club.manager?.name ?? "Unknown manager")}</b>
                <small>${esc(club.name)} · ${esc(club.manager?.style ?? "Balanced")}</small>
              </div>
              <div class="agent-meta">
                <span>Rating ${club.manager?.rating ?? 0}</span>
                <span>Prestige ${club.prestige}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading"><div><div class="eyebrow">TRANSFER MARKET</div><h2>Biggest interest</h2></div></div>
        <div class="transfer-list">
          ${market
            .map(
              (club, index) => `
            <div class="transfer-agent">
              <div>
                <b>#${index + 1} ${esc(club.name)}</b>
                <small>${esc(club.manager?.name ?? "No manager")}</small>
              </div>
              <div class="agent-meta">
                <span>Prestige ${club.prestige}</span>
                <span>Manager ${club.manager?.rating ?? 0}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-heading"><div><div class="eyebrow">TRANSFER ACTIVITY</div><h2>Current market buzz</h2></div></div>
      <div class="transfer-list">
        ${transferActivity
          .map(
            (entry) => `
          <div class="transfer-agent">
            <div>
              <b>${esc(entry.clubName || entry.name || "Transfer interest")}</b>
              <small>${entry.interest ? `Interest ${entry.interest}%` : "Market watch"}</small>
            </div>
            <div class="agent-meta">
              <span>${entry.fee ? `€${formatDecimal(entry.fee)}` : "No fee"}</span>
              <span>${entry.window || "Any window"}</span>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><div class="eyebrow">LEAGUE SNAPSHOT</div><h2>Regional strength</h2></div></div>
      <div class="transfer-list">
        ${leagueSummaries
          .map(
            (entry) => `
          <div class="transfer-agent">
            <div>
              <b>${esc(entry.groupName)}</b>
              <small>${entry.size} clubs</small>
            </div>
            <div class="agent-meta">
              <span>Avg prestige ${Math.round(entry.avgPrestige)}</span>
              <span>Best: ${esc(entry.bestClub?.name || "—")}</span>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderWorld() {
  const leagues = data.fc25Leagues ?? [];
  const selectedLeague =
    leagues.find((league) => league.name === worldLeagueName) ?? leagues[0];
  const selectedClub =
    selectedLeague?.clubs.find((club) => club.clubName === worldClubName) ??
    selectedLeague?.clubs[0];
  const careerEntry = career.data.careerLeagues?.find(
    (entry) => entry.league.name === selectedLeague?.name,
  );
  const careerClubId = careerEntry?.league.teamIds.find(
    (id) => careerEntry.clubIdentities[id]?.name === selectedClub?.clubName,
  );
  const worldLeague = career.worldLeagues.find(
    ({ league }) => league.id === careerEntry?.league.id,
  );
  const runtimePlayers =
    selectedLeague?.name === career.league.name
      ? career.players.filter((player) => player.clubId === careerClubId)
      : (worldLeague?.performers.filter(
          (player) => player.clubId === careerClubId,
        ) ?? []);
  const runtimeById = new Map(
    runtimePlayers.map((player) => [player.id, player]),
  );
  const runtimeByName = new Map();
  for (const player of runtimePlayers) {
    const name = `${player.first} ${player.last}`.trim().toLocaleLowerCase();
    if (!runtimeByName.has(name)) runtimeByName.set(name, []);
    runtimeByName.get(name).push(player);
  }
  const legends = career.getLegends?.() ?? [];
  const legendsPanel = legends.length
    ? `<section class="panel legends-panel"><div class="panel-heading"><div><div class="eyebrow">IMMORTALS</div><h2>Legends</h2></div><span class="live-tag">${legends.length} PLAYERS · NEVER AGE</span></div><p class="muted">These two never age, never retire, always sit at ${legends[0].overall} overall, and only ever play for the club below.</p><div class="legends-grid">${legends.map(({ player, clubName, overall }) => `<article class="legend-card"><div><b>${playerProfileLink(player)}</b><small>${esc(player.position)} · ${esc(clubName)}</small></div><span class="legend-rating">${overall}<small>OVR</small></span></article>`).join("")}</div></section>`
    : "";

  if (!leagues.length) {
    return `
      <div class="page-heading">
        <div><div class="eyebrow lime">PLAYER DATABASE</div><h1>Other leagues</h1>
        <p>Browse the 2026/27 player database and team data.</p></div>
        <a class="button-quiet" href="data/logos/team-crests.html" target="_blank" rel="noreferrer">Open team crest catalog ↗</a>
      </div>
      ${legendsPanel}
      <section class="panel">
        <div class="eyebrow">ROSTER FILE MISSING</div>
        <h2>Player database is empty</h2>
        <p class="muted">No supported league players were found in <code>data/squads/touchline_player_database.csv</code>.</p>
      </section>`;
  }

  const roster = selectedClub?.roster ?? [];
  const topPlayer = roster[0];
  const totalValue = roster.reduce(
    (sum, player) => sum + (player.value ?? 0),
    0,
  );
  return `
    <div class="page-heading">
      <div><div class="eyebrow lime">SQUAD RATINGS · IMPORTED & GENERATED</div><h1>Other leagues</h1>
      <p>Compare supplied player data and generated squad fillers across every club in the six supported leagues.</p></div>
      <div class="top-actions"><a class="button-quiet" href="data/logos/team-crests.html" target="_blank" rel="noreferrer">Open team crest catalog ↗</a>
      <span class="live-tag">${leagues.reduce((sum, league) => sum + league.clubs.length, 0)} clubs · ${data.fc25Players.length} supplied players</span>
      </div>
    </div>
    ${legendsPanel}
    <div class="panel world-filters">
      <label>LEAGUE<select id="world-league">${leagues.map((league) => `<option value="${esc(league.name)}" ${league.name === selectedLeague?.name ? "selected" : ""}>${esc(league.name)} · ${league.clubs.length} clubs</option>`).join("")}</select></label>
      <label>TEAM<select id="world-club">${(selectedLeague?.clubs ?? []).map((club) => `<option value="${esc(club.clubName)}" ${club.clubName === selectedClub?.clubName ? "selected" : ""}>${esc(club.clubName)} · ${club.squadSize} players</option>`).join("")}</select></label>
    </div>
    ${
      selectedClub
        ? `
      <div class="stat-grid">
        <article class="stat-card"><div class="card-label">SQUAD SIZE</div><div class="big-number">${selectedClub.squadSize}</div><div class="muted">${selectedClub.importedPlayerCount} supplied · ${selectedClub.squadSize - selectedClub.importedPlayerCount} generated</div></article>
        <article class="stat-card"><div class="card-label">SQUAD AVERAGE</div><div class="big-number">${formatDecimal(selectedClub.averageOverall)}</div><div class="muted">Supplied + generated gameplay estimates</div></article>
        <article class="stat-card"><div class="card-label">TOP RATED PLAYER</div><div class="big-number">${topPlayer?.overall ?? "—"}</div><div class="muted">${esc(topPlayer?.displayName ?? "—")}</div></article>
      </div>
      <section class="panel table-panel world-roster-panel">
        <div class="panel-heading"><div><div class="eyebrow">${esc(selectedLeague.name)}</div><h2>${esc(selectedClub.clubName)} squad ratings</h2></div><span class="live-tag">${roster.length} PLAYERS</span></div>
        <table class="world-roster-table"><thead><tr><th>PLAYER</th><th>POS</th><th>AGE</th><th>OVR*</th><th>POT</th><th>GOALS</th><th>ASSISTS</th><th>APP</th><th>RTG</th><th>VALUE</th></tr></thead>
          <tbody>${
            roster.length
              ? roster
                  .map((player) => {
                    const matchingPlayers = runtimeByName.get(
                      player.displayName.toLocaleLowerCase(),
                    );
                    const runtimeId =
                      careerClubId && player.id
                        ? `real-${careerClubId}-${player.id}`
                        : null;
                    const live =
                      runtimeById.get(runtimeId) ??
                      (matchingPlayers?.length === 1
                        ? matchingPlayers[0]
                        : undefined);
                    const goals = live?.stats?.goals ?? live?.goals ?? 0;
                    const assists = live?.stats?.assists ?? live?.assists ?? 0;
                    const apps = live?.stats?.apps ?? live?.apps ?? 0;
                    const ratingSum =
                      live?.stats?.ratingSum ?? live?.ratingSum ?? 0;
                    const rating = apps ? ratingSum / apps : null;
                    const marketValue = live?.marketValue ?? live?.value ?? player.marketValue ?? player.value ?? null;
                    const prevMarket = live?.previousMarketValue ?? player.previousMarketValue ?? null;
                    const change = marketValue != null && prevMarket != null ? marketValue - prevMarket : 0;
                    const changeTag = change > 0 ? ` <small class="positive">▲ ${formatMarketValue(change)}</small>` : change < 0 ? ` <small class="negative">▼ ${formatMarketValue(Math.abs(change))}</small>` : "";
                    return `<tr><td>${playerProfileLink(live?.id ?? runtimeId, player.displayName, "player-directory-name")}<small class="world-nationality">${player.source === "generated" ? "GENERATED PLAYER" : player.source === "user-supplied-estimate" ? "SUPPLIED PLAYER" : "IMPORTED PLAYER"}</small></td><td>${esc(player.position)}</td><td>${player.age ?? "—"}</td><td class="world-rating">${player.overall}</td><td>${player.potential ?? "—"}</td><td>${goals}</td><td>${assists}</td><td>${apps}</td><td>${rating == null ? "—" : formatDecimal(rating)}</td><td>${marketValue ? `${formatMarketValue(marketValue)}${changeTag}` : "—"}</td></tr>`;
                  })
                  .join("")
              : '<tr><td colspan="10">No player rows supplied for this club.</td></tr>'
          }</tbody>
        </table>
        <p class="muted world-data-foot">${totalValue ? `Combined listed market value: ${formatMarketValue(totalValue)} · ` : ""}Supplied names come from your CSV; generated squad fillers use unique names. The file marks ratings as FC-style estimates, not verified official EA ratings.</p>
      </section>`
        : ""
    }
    <section class="panel table-panel world-league-panel">
      <div class="panel-heading"><div><div class="eyebrow">TEAM COMPARISON</div><h2>${esc(selectedLeague?.name ?? "League")} squads</h2></div><span class="live-tag">RATING RANKING</span></div>
      <table class="world-club-table"><thead><tr><th>#</th><th>TEAM</th><th>PLAYERS</th><th>AVG OVR</th><th>TOP OVR</th></tr></thead>
        <tbody>${[...(selectedLeague?.clubs ?? [])]
          .sort((a, b) => b.averageOverall - a.averageOverall)
          .map(
            (club, index) =>
              `<tr class="${club.clubName === selectedClub?.clubName ? "user-row" : ""}"><td>${index + 1}</td><td class="team-cell">${renderClubCrest(club.clubName, "", "table-crest")}${esc(club.clubName)}</td><td>${club.squadSize || "—"}</td><td>${club.squadSize ? formatDecimal(club.averageOverall) : "—"}</td><td>${club.roster[0]?.overall ?? "—"}</td></tr>`,
          )
          .join("")}</tbody>
      </table>
      <p class="muted world-data-foot">*Gameplay overall is estimated from supplied FC-style ratings or match ratings. Match ratings and goal totals appear when included in your file. Generated players are marked and are not represented as real players.</p>
    </section>`;
}

function renderTransfersList() {
  const market = career.transferMarket();
  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow lime">TRANSFER MARKET</div>
        <h1>Transfers List</h1>
        <p>Players currently available for transfer in ${esc(career.league.name)}.</p>
      </div>
      <span class="live-tag">${market.length} PLAYERS LISTED</span>
    </div>
    <section class="panel table-panel transfer-market-panel">
      <div class="panel-heading">
        <div><div class="eyebrow">AVAILABLE PLAYERS</div><h2>Current market</h2></div>
        <span class="live-tag">${career.isManagerCareer ? `BUDGET €${Math.round(career.financialSummary().transferBudget).toLocaleString("en-GB")}` : "SCOUTING ONLY"}</span>
      </div>
      <table class="world-roster-table">
        <thead><tr><th>PLAYER</th><th>AGE</th><th>POSITION</th><th>OVR</th><th>CURRENT CLUB</th><th>TRANSFER VALUE</th><th></th></tr></thead>
        <tbody>${market
          .map(
            ({ player, club, marketValue }) => `
              <tr>
                <td><b>${playerProfileLink(player, `${player.first} ${player.last}`)}</b></td>
                <td>${player.dob != null ? ageOn(player.dob, currentDay()) : player.age ?? "—"}</td>
                <td>${esc(player.position)}</td>
                <td class="world-rating">${player.overall}</td>
                <td>${esc(club?.name ?? "Free agent")}</td>
                <td>${formatMarketValue(marketValue)}</td>
                <td><button class="button-primary" data-action="${career.isManagerCareer ? "buy-player" : "player-request"}" data-request-type="better-teammates" data-player-id="${esc(player.id)}">${career.isManagerCareer ? "Enquire" : "Ask manager to sign"}</button></td>
              </tr>
            `,
          )
          .join("") || '<tr><td colspan="7" class="scorer-empty">No players are currently listed.</td></tr>'}</tbody>
      </table>
    </section>
  `;
}

function renderAgent() {
  career.renewAgentSearchWindow?.();
  const searchTerms = career.agent
    ? agentSearchTerms(career.agent)
    : { searches: 0, tier: "No Agent" };
  const marketState = career.transferMarketState ?? {
    searchCount: 0,
    lastSearchDay: null,
  };
  const agentStats = career.agent
    ? career.agentPerformance?.[career.agent.id] ?? {
        searches: 0,
        offers: 0,
        deals: 0,
      }
    : { searches: 0, offers: 0, deals: 0 };
  const conversionRate = agentStats.offers
    ? Math.round((agentStats.deals / agentStats.offers) * 100)
    : 0;
  const leagueOptions = (career.worldCareerLeagues ?? [])
    .map((entry) =>
      entry.league.teamIds.some((clubId) => clubId !== career.club.id)
        ? `<option value="${esc(entry.league.id)}">${esc(entry.league.name)}</option>`
        : "",
    )
    .join("");
  const agentOptions = (data.agents ?? career.agentPool ?? [])
    .map(
      (agent) => `
        <article class="transfer-agent">
          <div>
            <b>${esc(agent.name)}</b>
            <small>${esc(agent.specialty)} · ${agent.rating} negotiation rating · Reputation ${agent.reputation}</small>
            <small>${esc(agent.knownFor)}</small>
          </div>
          <div class="agent-meta">
            <span>Hire fee €${formatDecimal(agent.fee)}</span>
            <button class="button-quiet" data-action="hire-agent" data-agent-id="${esc(agent.id)}">Hire</button>
          </div>
        </article>
      `,
    )
    .join("");
  const offers = career.transferOffers.length
    ? career.transferOffers
        .map(
          (offer) => `
            <article class="transfer-offer">
              <div>
                <b>${esc(offer.clubName)}</b>
                <small>${esc(offer.leagueName ?? career.league.name)} · Interest ${offer.interest}% · ${esc(offer.role ?? "Squad role unavailable")} · ${esc(offer.window)}</small>
                <small>${esc(offer.reason ?? "Club interest")}. ${esc(offer.competitionOpportunities ?? "")}</small>
                <small>Expected time ${offer.expectedPlayingTime ?? "—"}% · €${formatDecimal(offer.wage ?? 0)} weekly · ${offer.contractYears ?? 3}-year contract</small>
              </div>
              <div class="agent-actions">
                <span>€${formatDecimal(offer.fee)} transfer fee</span>
                <button class="button-primary" data-action="accept-offer" data-offer-id="${esc(offer.id)}">Accept offer</button>
                <button class="button-quiet" data-action="negotiate-offer" data-offer-id="${esc(offer.id)}">Negotiate wages</button>
                <button class="button-quiet" data-action="request-offer-role" data-offer-id="${esc(offer.id)}">Request bigger role</button>
                <button class="button-quiet" data-action="reject-offer" data-offer-id="${esc(offer.id)}">Reject</button>
              </div>
            </article>
          `,
        )
        .join("")
    : "<div class='empty-report'><p>No offers to review. Choose a destination or let your agent search for suitable clubs.</p></div>";
  const latestHistory = (career.transferHistory ?? []).slice(0, 8);
  const wageNegotiationOffer = career.transferOffers.find(
    (offer) => offer.id === wageNegotiationOfferId,
  );

  return `
    <div class="page-heading">
      <div>
        <div class="eyebrow lime">PLAYER REPRESENTATION</div>
        <h1>Your Agent</h1>
        <p>Review your representative, discuss destinations, and negotiate offers before deciding on a move.</p>
      </div>
      ${career.agent ? `<button class="button-quiet" data-action="fire-agent">Release agent</button>` : ""}
    </div>
    ${
      career.agent
        ? `
          <div class="dashboard-grid agent-dashboard">
            <section class="panel">
              <div class="panel-heading"><div><div class="eyebrow">YOUR REPRESENTATIVE</div><h2>${esc(career.agent.name)}</h2></div><span class="live-tag">${esc(career.agent.specialty)}</span></div>
              <p class="muted">${esc(career.agent.knownFor)}</p>
              <div class="stat-grid agent-stat-grid">
                <article class="stat-card"><div class="card-label">NEGOTIATION RATING</div><div class="big-number">${career.agent.rating}<small>/100</small></div></article>
                <article class="stat-card"><div class="card-label">REPUTATION</div><div class="big-number">${career.agent.reputation}<small>/100</small></div></article>
                <article class="stat-card"><div class="card-label">EXPERIENCE</div><div class="big-number">${agentStats.searches}<small> searches</small></div></article>
                <article class="stat-card"><div class="card-label">PERFORMANCE</div><div class="big-number">${conversionRate}<small>% conversion</small></div><div class="muted">${agentStats.deals} completed · ${agentStats.offers} offers</div></article>
              </div>
              <div class="agent-detail-row"><span>Overall quality</span><b>${career.agent.quality}/100</b></div>
              <div class="agent-detail-row"><span>Hiring fee paid</span><b>€${formatDecimal(career.agent.fee)}</b></div>
              <div class="agent-detail-row"><span>Searches this window</span><b>${marketState.searchCount}/${searchTerms.searches}</b></div>
            </section>
            <section class="panel">
              <div class="panel-heading"><div><div class="eyebrow">TRANSFER INSTRUCTIONS</div><h2>Discuss your next move</h2></div><span class="live-tag">${marketState.searchCount}/${searchTerms.searches} SEARCHES</span></div>
              <p class="muted">Choose a league first, then a club to direct your search. Or ask your agent to search all suitable destinations. Clubs still decide based on squad needs, finances, and player fit.</p>
              <div class="agent-destination-controls">
                <label class="position-select">League
                  <select id="agent-destination-league">
                    <option value="">Choose a league</option>
                    ${leagueOptions}
                  </select>
                </label>
                <label class="position-select">Club
                  <select id="agent-destination-club" disabled>
                    <option value="">Choose a league first</option>
                  </select>
                </label>
                <button class="button-primary" data-action="refresh-offers" data-search-all="false" data-searches-remaining="${Math.max(0, searchTerms.searches - marketState.searchCount)}" ${marketState.searchCount >= searchTerms.searches ? "disabled" : ""}>Search selected club</button>
                <button class="button-quiet" data-action="refresh-offers" data-search-all="true" ${marketState.searchCount >= searchTerms.searches ? "disabled" : ""}>Search all suitable clubs</button>
              </div>
              <p class="muted agent-fee-note">Each search costs €${Math.round(career.agent.fee * 0.08).toLocaleString("en-GB")} and is available during transfer windows, with a 14-day cooldown. Your balance is charged when you search.</p>
            </section>
          </div>
          <section class="panel">
            <div class="panel-heading"><div><div class="eyebrow">CLUB RESPONSES</div><h2>Offers and negotiations</h2></div><span class="live-tag">${career.transferOffers.length} OFFERS</span></div>
            <div class="transfer-list">${offers}</div>
          </section>
        `
        : `
          <section class="panel">
            <div class="panel-heading"><div><div class="eyebrow">CHOOSE REPRESENTATION</div><h2>Hire an agent</h2></div></div>
            <p class="muted">Your agent handles club interest and contract negotiations. The listed hiring fee is deducted from your balance.</p>
            <div class="transfer-list">${agentOptions}</div>
          </section>
        `
    }
    ${
      latestHistory.length
        ? `<section class="panel"><div class="panel-heading"><div><div class="eyebrow">TRANSFER CENTRE</div><h2>Latest completed deals</h2></div><span class="live-tag">${career.transferHistory.length} RECORDED</span></div><div class="transfer-list">${latestHistory.map((item) => `<article class="transfer-agent"><div><b>${esc(item.playerName)}</b><small>${esc(item.fromClub)} → ${esc(item.toClub)} · ${item.type} · ${item.date != null ? esc(formatDate(item.date)) : "Date pending"} · ${item.contractYears ?? 3}-year deal</small></div><span>€${formatDecimal(item.fee)}</span></article>`).join("")}</div></section>`
        : ""
    }
    ${
      wageNegotiationOffer
        ? `<div class="wage-dialog-backdrop"><section class="wage-dialog" role="dialog" aria-modal="true" aria-labelledby="wage-dialog-title">
            <form id="wage-negotiation-form" data-offer-id="${esc(wageNegotiationOffer.id)}">
              <div class="eyebrow lime">CONTRACT NEGOTIATION</div>
              <h2 id="wage-dialog-title">Negotiate with ${esc(wageNegotiationOffer.clubName)}</h2>
              <p class="muted">Current offer: €${formatDecimal(wageNegotiationOffer.wage)} weekly. The club will decide whether to accept your request.</p>
              <label class="position-select" for="wage-request-input">Requested weekly wage (€)
                <input id="wage-request-input" name="wage" type="number" min="1" step="1" value="${Math.max(1, Math.round(wageNegotiationOffer.wage ?? 1))}" required autofocus>
              </label>
              <div class="wage-dialog-actions">
                <button class="button-primary" type="submit">Send wage request</button>
                <button class="button-quiet" type="button" data-action="cancel-wage-negotiation">Cancel</button>
              </div>
            </form>
          </section></div>`
        : ""
    }
  `;
}

function renderOverview() {
  // A manager career has no "your player": the overview is the dugout, not the pitch.
  if (career.isManagerCareer) return renderManagerHub();
  const row = career.league.table.row(career.club.id);
  const place = career.league.table.positions().get(career.club.id) ?? "—";
  const stats = career.player.stats;
  const next = nextFixture();
  const report = career.lastReport?.userMatch;
  const fanExpectation = career.getUpcomingFanExpectation();
  const fixtureHeading = `UP NEXT${next?.competition ? ` · ${esc(next.competition)}` : ""}`;
  const leagueProgress = career.getLeagueSeasonProgress();
  const currentLeagueComplete = career.league.table.isComplete(
    2 * (career.league.teamIds.length - 1),
  );
  const worldCupTournament = career.worldCup?.tournament;
  const worldCupUserTeam = worldCupTournament?.qualified?.find(
    (team) => team.code === career.player.nationality,
  );
  const worldCupUserSelected = Boolean(
    worldCupUserTeam?.squadIds?.includes(career.player.id),
  );
  const nextWorldCupMatch =
    worldCupTournament?.status === "in-progress" && worldCupUserSelected
      ? worldCupTournament.fixtures
          .filter(
            (fixture) =>
              fixture.status !== "completed" &&
              (fixture.homeId === worldCupUserTeam.id ||
                fixture.awayId === worldCupUserTeam.id),
          )
          .sort((left, right) => left.scheduledDay - right.scheduledDay)[0]
      : null;
  const worldCupUserStats =
    worldCupTournament?.playerStats?.[career.player.id] ?? {
      apps: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
    };
  const worldCupUserGroup = worldCupTournament?.groups?.find((group) =>
    group.teams.some((team) => team.id === worldCupUserTeam?.id),
  );
  const worldCupUserStanding = worldCupUserGroup?.table?.find(
    (entry) => entry.teamId === worldCupUserTeam?.id,
  );
  // Where the user sits in this week's squad: starting XI, on the bench, or not
  // selected at all. The overview bar shows this at a glance.
  const liveMatch = career.lastReport?.userMatch;
  const liveState = career.matchSimulation;
  const matchInProgress =
    liveMatch && liveState && liveState.status !== "finished";
  const selectedLineup = matchInProgress
    ? null
    : career.getPlayerMatchSelection(next?.day ?? currentDay());
  const userIsStarter = matchInProgress
    ? Boolean(liveState.userStarted)
    : selectedLineup?.status === "starter";
  const liveSide = matchInProgress ? liveMatch[liveMatch.side] : null;
  const userWasSubstitute =
    matchInProgress &&
    !liveState.userStarted &&
    (liveSide?.subs?.includes(career.player.id) ||
      liveState.userEnteredPitch ||
      liveState.userSubbedOff);
  const userIsSub = matchInProgress
    ? Boolean(userWasSubstitute)
    : selectedLineup?.status === "bench";
  const userOnWorldCupDuty = Boolean(nextWorldCupMatch);
  const userStatus = userOnWorldCupDuty
    ? "INTERNATIONAL DUTY"
    : userIsStarter
    ? "STARTER"
    : userIsSub
      ? "ON THE BENCH"
      : "NOT SELECTED";
  const userStatusClass = userOnWorldCupDuty
    ? "overview-lineup-status is-international"
    : userIsStarter
    ? "overview-lineup-status is-starter"
    : userIsSub
      ? "overview-lineup-status is-bench"
      : "overview-lineup-status is-out";
  function renderLineupStatus() {
    return `<div class="${userStatusClass}"><span class="overview-lineup-dot"></span><div><small>${userOnWorldCupDuty ? "NATIONAL TEAM" : "THIS WEEK'S SQUAD"}</small><b>${esc(userStatus)}</b></div></div>`;
  }
  return `
    <div class="page-heading"><div><div class="eyebrow lime">THE JOURNEY</div><h1>Career hub</h1><p>Your story begins at ${esc(career.club.name)}.</p></div>
      <div class="overview-actions">
        ${renderLineupStatus()}
        ${!career.seasonComplete && !career.careerEnded ? `<button class="button-quiet" data-action="simulate-day">Simulate one day</button><button class="button-quiet" data-action="simulate-season">Simulate to end of season</button><button class="button-quiet" data-action="simulate-half-season">Simulate half season</button>` : ""}<button class="button-primary" data-action="advance" ${career.seasonComplete || career.careerEnded ? "disabled" : ""}>${career.careerEnded ? "Career retired" : career.seasonComplete ? "Season complete" : "Advance one week"} <span>→</span></button></div></div>
    ${career.careerEnded ? `<div class="season-finish"><div><span class="eyebrow">CAREER COMPLETE</span><h2>${esc(career.player.first)} ${esc(career.player.last)} has retired</h2>    <p>${stats.apps} appearances · ${stats.goals} goals · ${stats.assists} assists · ${career.getCareerHonours().length} honours retained in the trophy case.</p></div><span class="finish-mark">FT</span></div>` : career.seasonComplete ? `<div class="season-finish"><div><span class="eyebrow">ALL LEAGUES COMPLETE · ${seasonLabel(career.season)}</span><h2>${esc(career.club.name)} finish ${ordinal(place)}</h2><p>${row.points} points · ${stats.goals} goals · ${stats.assists} assists · ${averageRating(stats) == null ? "—" : formatDecimal(averageRating(stats))} average rating</p><button class="button-primary" data-action="next-season">Move to ${seasonLabel(career.season + 1)} <span>→</span></button></div><span class="finish-mark">FT</span></div>` : currentLeagueComplete ? `<div class="season-finish"><div><span class="eyebrow">DOMESTIC LEAGUE COMPLETE</span><h2>Waiting for the other leagues</h2><p>${leagueProgress.complete} of ${leagueProgress.total} playable league tables are complete. Continue the calendar to finish the season.</p></div><span class="finish-mark">${leagueProgress.complete}/${leagueProgress.total}</span></div>` : ""}
    <div class="stat-grid">
      <article class="stat-card player-card"><div class="card-label">YOUR PLAYER <span class="status-pill">${career.injuryStatus(career.player).injured ? "INJURED" : "FIT"}</span></div><div class="player-title"><div class="rating-badge">${career.displayOverall(career.player)}<small>OVR</small></div><div><h2>${playerProfileLink(career.player)}</h2><p>${esc(career.player.position)} · ${ageOn(career.player.dob, currentDay())} yrs · ${esc(career.player.nationality)}</p></div></div><div class="card-foot"><span>${esc(career.player.archetype ?? "Player")}</span><span>${career.injuryStatus(career.player).injured ? `Out ${career.injuryStatus(career.player).weeks}w` : esc(career.player.personality.join(" · "))}</span></div></article>
      <article class="stat-card"><div class="card-label">LEAGUE POSITION <span class="trend">2026/27</span></div><div class="big-number">${ordinal(place)}</div><div class="muted">${row.played} played · ${row.points} pts · GD ${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</div></article>
      <article class="stat-card"><div class="card-label">SEASON CONTRIBUTION <span class="trend">ALL COMPETITIONS</span></div><div class="stat-triplet"><div><b>${stats.goals}</b><small>GOALS</small></div><div><b>${stats.assists}</b><small>ASSISTS</small></div><div><b>${stats.apps}</b><small>APPS</small></div></div><div class="muted">Average rating <strong>${averageRating(stats) == null ? "—" : formatDecimal(averageRating(stats))}</strong></div></article>
    </div>
    ${nextWorldCupMatch ? `<section class="panel next-match-panel world-cup-priority"><div class="panel-heading"><div><div class="eyebrow lime">INTERNATIONAL PRIORITY · ${worldCupTournament.year} FIFA WORLD CUP</div><h2>Next match: ${esc(worldCupTournament.qualified.find((team) => team.id === (nextWorldCupMatch.homeId === worldCupUserTeam.id ? nextWorldCupMatch.awayId : nextWorldCupMatch.homeId))?.name ?? "Opponent")}</h2></div><span class="live-tag">${formatDate(nextWorldCupMatch.scheduledDay)}</span></div><p class="muted">${nextWorldCupMatch.stage === "group" ? `${esc(worldCupUserGroup?.id ?? "Group stage")} · Matchday ${nextWorldCupMatch.round + 1}` : esc(nextWorldCupMatch.round)} · ${worldCupUserStanding ? `${worldCupUserStanding.points} pts · ${worldCupUserStanding.goalDifference >= 0 ? "+" : ""}${worldCupUserStanding.goalDifference} GD` : "Tournament stage"} · ${worldCupUserStats.apps} apps · ${worldCupUserStats.goals} goals · ${worldCupUserStats.assists} assists</p></section>` : ""}
    <div class="dashboard-grid">
      <section class="panel next-match-panel"><div class="panel-heading"><div><div class="eyebrow">${fixtureHeading}</div><h2>${next ? `${esc(next.home.name)} <span>vs</span> ${esc(next.away.name)}` : "No fixture scheduled"}</h2></div><span class="live-tag">${next ? `${formatDate(next.day)}${next.roundLabel ? ` · ${esc(next.roundLabel)}` : ""}` : "SEASON"}</span></div>
        ${next ? `<div class="fixture-preview"><div class="fixture-side">${renderClubCrest(next.home.name, next.home.shortName, "club-crest")}<b>${esc(next.home.name)}</b></div><div class="vs">VS</div><div class="fixture-side">${renderClubCrest(next.away.name, next.away.shortName, "club-crest")}<b>${esc(next.away.name)}</b></div></div>` : ""}
        <div class="panel-foot"><label>Player role<select id="match-role" aria-describedby="match-role-description">${playerRoleOptionsForPosition(
          career.player.position,
        )
          .map(
            ({ name }) =>
              `<option value="${esc(name)}" ${career.matchRole === name ? "selected" : ""}>${esc(name)}</option>`,
          )
          .join(
            "",
          )}</select><small id="match-role-description">${esc(ROLE_DESCRIPTIONS[career.matchRole] ?? ROLE_DESCRIPTIONS.Balanced)}</small></label><button class="button-quiet" data-screen="simulation">Open MATCH SIM →</button></div></section>
      <section class="panel inbox-panel"><div class="panel-heading"><div><div class="eyebrow">CLUBHOUSE</div><h2>Latest update</h2></div><span class="inbox-count">${career.news.length.toString().padStart(2, "0")}</span></div>
        <div class="news-list">${(career.news.slice(-4).reverse().length ? career.news.slice(-4).reverse() : ["The manager is watching your progress closely.", "The new season is underway. Make every session count."]).map((item, i) => `<div class="news-item"><span class="news-indicator ${i === 0 ? "is-new" : ""}"></span><span>${esc(item)}</span></div>`).join("")}</div>
        <div class="panel-foot dashboard-balances"><span class="live-tag">${esc(career.player.developmentTrajectory ?? "Stable")}</span><b class="points-pill">€${formatDecimal(career.money)}</b></div></section>
    </div>
    ${renderFanApproval(fanExpectation)}
    ${report ? renderMatchReport(report) : `<div class="empty-report"><span class="eyebrow">MATCH CENTRE</span><p>Your match performance and key moments will appear here after your debut.</p></div>`}
    <div class="page-bottom">RNG SEED ${career.seed} <span>·</span> ${career.clubs.length} CLUBS <span>·</span> ${career.league.fixtures.length} MATCHDAYS</div>`;
}

function revealedKeyMoments(match) {
  const minute = career.matchSimulation?.minute ?? 0;
  return match.playerResult.keyMoments
    .map((moment, index) => ({ moment, index }))
    .filter(({ moment }) => moment.resolved || moment.minute <= minute);
}

function renderMatchReport(match) {
  const playerTeamName = match[match.side]?.name ?? career.club.name;
  const p = match.playerResult;
  const matchFinished = career.matchSimulation?.status === "finished";
  const userGoals = matchFinished
    ? match[match.side === "home" ? "homeGoals" : "awayGoals"]
    : 0;
  const oppGoals = matchFinished
    ? match[match.side === "home" ? "awayGoals" : "homeGoals"]
    : 0;
  const events = renderEventTimeline(
    match,
    matchFinished
      ? Number.POSITIVE_INFINITY
      : (career.matchSimulation?.minute ?? 0),
  );
  const momentLabels = {
    chance: "A chance in the box",
    penalty: "Penalty opportunity",
    oneOnOne: "One-on-one",
    bigPass: "Key pass or distribution",
    lastDitch: "Last-ditch defensive action",
    keeperSave: "Goalkeeper save",
  };
  const moments = revealedKeyMoments(match)
    .map(
      ({ moment }) =>
        `<div class="key-moment"><div class="moment-copy"><span>${matchMinuteLabel(moment.minute)}' · KEY MOMENT</span><b>${moment.kind === "oneOnOne" && moment.position === "GK" ? "One-on-one save" : momentLabels[moment.kind] ?? "Key moment"}</b></div>${moment.resolved ? (moment.resolved.subbedOff ? `<span class="moment-outcome">SUBBED OFF</span>` : `<span class="moment-outcome ${moment.resolved.success ? "success" : "failure"}">${moment.resolved.success ? "SUCCESS" : "MISSED"} · ${Math.round(moment.resolved.probability * 100)}%</span>`) : `<span class="moment-outcome">PENDING IN MATCH SIM</span>`}</div>`,
    )
    .join("");
  const standoutBadge =
    matchFinished && p.rating != null && p.rating >= 8.5
      ? `<span class="standout-badge">★ STANDOUT PERFORMANCE</span>`
      : "";
  return `<section class="panel match-report">  <div class="panel-heading"><div><div class="eyebrow">${match.competitionName ? esc(match.competitionName.toUpperCase()) : `LAST MATCH · MATCHDAY ${career.league.table.row(career.club.id).played}`}</div><h2>${esc(playerTeamName)} <span>${userGoals} — ${oppGoals}</span> ${esc(match.opponent)}</h2><p class="objective-result ${matchFinished ? (match.objectiveComplete ? "objective-met" : "objective-missed") : ""}">${matchFinished ? `${match.objectiveComplete ? "✓ OBJECTIVE COMPLETE" : "× OBJECTIVE MISSED"} · ${esc(match.objective)}` : `OBJECTIVE · ${esc(match.objective)} · AWAITING FULL TIME`}</p></div><div class="rating-badge small-rating">${matchFinished && p.rating != null ? formatDecimal(p.rating) : "—"}<small>RATING</small></div>${standoutBadge}</div>
    ${matchFinished ? `<div class="performance-grid"><div><b>${p.stats.goals}</b><small>GOALS</small></div><div><b>${p.stats.assists}</b><small>ASSISTS</small></div><div><b>${p.stats.shots}</b><small>SHOTS</small></div><div><b>${p.stats.keyPasses}</b><small>KEY PASSES</small></div><div><b>${p.stats.tackles}</b><small>TACKLES</small></div><div><b>${p.stats.passesCompleted}/${p.stats.passes}</b><small>PASSES</small></div><div><b>${p.minutes}'</b><small>MINUTES</small></div></div><p class="muted"><b>PLAYER ROLE · ${esc(p.role ?? career.matchRole)}</b> — ${esc(ROLE_DESCRIPTIONS[p.role ?? career.matchRole] ?? ROLE_DESCRIPTIONS.Balanced)}</p>` : `<p class="muted">The match result is being completed. Return to the Career hub shortly to review the finished report.</p>`}
    ${moments ? `<div class="key-moments"><div class="eyebrow">YOUR KEY MOMENTS</div>${moments}</div>` : ""}
    ${
      matchFinished
        ? `<div class="report-bottom"><p>${esc(p.coachesNote ?? p.note ?? "Performance recorded.")}</p><div class="match-events">${events}</div></div>
      ${renderFanApproval(career.getUpcomingFanExpectation())}
      ${renderTeammateRatings(match)}`
        : ""
    }</section>`;
}

// The match timeline records ONLY the meaningful events: goals (with assists),
// yellow and red cards, injuries, and substitutions. Everything else the sim produces
// (fouls, free kicks, offsides, blocks, saves, flavour commentary) is deliberately
// omitted so the timeline stays a clean record of what actually decided the match.
function renderEventTimeline(match, minute) {
  const sideName = (side) =>
    side === "home" ? match.home.name : match.away.name;
  const eventIcons = {
    goal: ["GOAL", "⚽"],
    penaltyGoal: ["PENALTY GOAL", "⚽"],
    ownGoal: ["OWN GOAL", "⚽"],
    yellow: ["YELLOW CARD", "🟨"],
    red: ["RED CARD", "🟥"],
    injury: ["INJURY", "✚"],
    sub: ["SUBSTITUTION", "🔁"],
    event: ["EVENT", "•"],
  };
  const rows = [];

  // Goals, with the assist folded into the detail line.
  for (const event of match.events ?? []) {
    const goalType = event.ownGoal
      ? "ownGoal"
      : event.penalty
        ? "penaltyGoal"
        : "goal";
    const [label, icon] = eventIcons[goalType];
    rows.push({
      minute: event.minute,
      type: goalType,
      label,
      icon,
      detail: `${event.scorerName}${event.penalty ? " · Penalty" : ""}${event.ownGoal ? " · Own goal" : ""}${event.assistName ? ` · Assist: ${event.assistName}` : ""}`,
      detailHtml: `${playerProfileLink(event.scorerId, event.scorerName)}${event.penalty ? " · Penalty" : ""}${event.ownGoal ? " · Own goal" : ""}${event.assistName ? ` · Assist: ${playerProfileLink(event.assistId, event.assistName)}` : ""}`,
      side: sideName(event.side),
    });
  }

  // Cards and injuries only — the sim's fouls/free kicks/offsides etc. are dropped.
  const KEPT = new Set(["yellow", "red", "injury", "sub"]);
  for (const event of match.misc ?? []) {
    if (!KEPT.has(event.type)) continue;
    const [label, icon] = eventIcons[event.type] ?? eventIcons.event;
    let detail;
    if (event.type === "sub") {
      detail = event.on
        ? `${event.playerName} on`
        : event.off
          ? `${event.playerName} off${event.replacedBy ? ` · replaced by ${event.replacedBy}` : ""}`
          : (event.playerName ?? "Substitution");
    } else if (event.type === "yellow") {
      detail = `${event.playerName ?? "Player"} · Booked`;
    } else if (event.type === "red") {
      detail = `${event.playerName ?? "Player"} · Sent off`;
    } else {
      detail = `${event.playerName ?? "Player"} · Injured`;
    }
    rows.push({
      minute: event.minute,
      type: event.type,
      label,
      icon,
      detail,
      detailHtml:
        event.type === "sub"
          ? event.on
            ? `${playerProfileLink(event.playerId, event.playerName)} on`
            : event.off
              ? `${playerProfileLink(event.playerId, event.playerName)} off${event.replacedBy ? ` · replaced by ${playerProfileLink(event.replacementId, event.replacedBy)}` : ""}`
              : playerProfileLink(
                  event.playerId,
                  event.playerName ?? "Substitution",
                )
          : `${playerProfileLink(event.playerId, event.playerName ?? "Player")} · ${event.type === "yellow" ? "Booked" : event.type === "red" ? "Sent off" : "Injured"}`,
      side: event.side ? sideName(event.side) : "",
    });
  }

  const visible = rows
    .filter((event) => event.minute <= minute)
    .sort((left, right) => left.minute - right.minute);
  return visible.length
    ? visible
        .map((event) => {
          const [label, icon] = eventIcons[event.type] ?? eventIcons.event;
          const eventLabel = event.label ?? label;
          return `<div class="timeline-event event-${esc(event.type)}"><span class="timeline-minute">${event.minute}'</span><span class="timeline-icon" role="img" aria-label="${esc(eventLabel)}" title="${esc(eventLabel)}">${event.icon ?? icon}</span><b>${event.detailHtml ?? esc(event.detail)}</b><small>${esc(eventLabel)}${event.side ? ` · ${esc(event.side)}` : ""}</small></div>`;
        })
        .join("")
    : '<span class="muted">Match events will appear here as they happen.</span>';
}

function renderTeammateRatings(match) {
  return `<div class="teammate-ratings"><div class="eyebrow">TEAMMATE MATCH RATINGS</div>${(match.teammateRatings ?? []).map((teammate) => `<div class="teammate-rating-row"><span class="teammate-name">${playerProfileLink(teammate.id, teammate.name)}<small>${esc(teammate.position)}</small></span><b>${teammate.rating == null ? "—" : formatDecimal(teammate.rating)}</b></div>`).join("") || '<p class="muted">No teammate ratings available.</p>'}</div>`;
}

/** Live on-pitch status of the career player, for the match-sim status strip. */
function describePlayerStatus(state, match) {
  const side = match?.[match.side];
  const actuallyOnPitch = side?.xi?.includes(career.player.id) ?? false;
  if (state.userSubbedOff || state.userStatus === "off") {
    return {
      tone: "off",
      label: state.substituteName
        ? `OFF THE PITCH · replaced by ${state.substituteName}`
        : "OFF THE PITCH",
      labelHtml: state.substituteName
        ? `OFF THE PITCH · replaced by ${playerProfileLink(null, state.substituteName)}`
        : null,
    };
  }
  if (!actuallyOnPitch) {
    const listedOnBench = side?.subs?.includes(career.player.id) ?? false;
    if (state.userStatus === "not-selected") {
      return { tone: "bench", label: "NOT SELECTED FOR THIS MATCH" };
    }
    if (!listedOnBench) {
      return { tone: "bench", label: "NOT IN THE MATCHDAY SQUAD" };
    }
    if (state.subOnMinute != null) {
      return {
        tone: "bench",
        label: `ON THE BENCH · expected on around ${state.subOnMinute}'`,
      };
    }
    return {
      tone: "bench",
      label:
        state.userStatus === "unused"
          ? "ON THE BENCH · unused substitute"
          : "ON THE BENCH",
    };
  }
  if (
    actuallyOnPitch &&
    (state.userEnteredPitch || state.userStatus === "on")
  ) {
    return {
      tone: "on",
      label: `ON THE PITCH · came on ${state.enteredPitchMinute ?? state.minute}'`,
    };
  }
  if (actuallyOnPitch) {
    return { tone: "on", label: "ON THE PITCH · started" };
  }
}

/**
 * Both teams' formations side by side, with the players the coach has selected for each
 * position. Works for the user's match and for every other club in the league, so the
 * same view is available everywhere the match sim is shown.
 */
function renderMatchFormations(match, minute = Number.POSITIVE_INFINITY) {
  const liveIncidents = new Map();
  for (const event of match.misc ?? []) {
    if (
      event.minute > minute ||
      !["yellow", "red"].includes(event.type) ||
      !event.playerId
    )
      continue;
    liveIncidents.set(
      event.playerId,
      event.type === "red"
        ? { label: "Red card", icon: "🟥" }
        : { label: "Yellow card", icon: "🟨" },
    );
  }
  const knownPlayers = new Map(
    career.players.map((player) => [player.id, player]),
  );
  const buildSide = (side) => {
    const team = match[side];
    if (!team) return "";
    const xiSlots = team.xiSlots?.length
      ? team.xiSlots
      : (team.xi ?? []).map((id) => ({
          id,
          slot: knownPlayers.get(id)?.position ?? "CM",
        }));
    const entries = xiSlots.map((entry, entryIndex) => {
      const slot = String(entry.slot ?? "CM").replace(/^ALT-/, "");
      const player = knownPlayers.get(entry.id) ?? {
        id: entry.id,
        first: entry.first ?? "Unknown",
        last: entry.last ?? "Player",
        position: entry.position ?? slot,
        overall: entry.overall ?? 50,
        shirtNumber: entry.shirtNumber ?? "—",
      };
      return {
        slot,
        player,
        slotIndex: entry.slotIndex ?? entryIndex,
      };
    });
    const averageStamina = entries.length
      ? Math.round(entries.reduce((sum, entry) => sum + ensureStamina(entry.player), 0) / entries.length)
      : 100;
    const isUserSide = side === match.side;
    const clubName =
      career.clubs.find((club) => club.id === team.clubId)?.name ?? team.name;
    return `<div class="match-formation ${isUserSide ? "is-user" : ""}">
      <div class="match-formation-head"><span class="match-formation-shape">${esc(team.formation ?? career.club.formation)}</span><div><b>${esc(team.name)}</b><small>${esc(team.coach ?? "Head coach")}${isUserSide ? " · YOUR TEAM" : ""}</small></div></div>
      <div class="pitch pitch-compact"><div class="pitch-markings"></div><span class="pitch-arc"></span>${renderPitchMarkup(entries, { highlightIds: isUserSide ? [career.player.id] : [], incidents: liveIncidents, shirtColor: clubCrestColors(clubName)[0], matchSide: side })}</div>
    </div>`;
  };
  return `<div class="match-formations">${buildSide("home")}${buildSide("away")}</div>`;
}

function matchLineupSignature(match) {
  return ["home", "away"]
    .map((side) => {
      const team = match[side];
      const entries =
        team?.xiSlots?.length
          ? team.xiSlots
          : (team?.xi ?? []).map((id) => ({ id }));
      return entries
        .map((entry, index) => `${entry.slotIndex ?? index}:${entry.id}`)
        .join(",");
    })
    .join("|");
}

function matchMinuteLabel(minute) {
  return minute > 90 ? `90+${minute - 90}` : String(minute);
}

function matchMomentLabel(moment) {
  if (moment.kind === "oneOnOne" && moment.position === "GK")
    return "One-on-one save";
  return {
    chance: "Chance in the box",
    penalty: "Penalty opportunity",
    oneOnOne: "One-on-one",
    bigPass: "Key pass or distribution",
    lastDitch: "Defensive action",
    keeperSave: "Goalkeeper save",
  }[moment.kind] ?? "Key moment";
}

function renderSimulation({ embedded = false } = {}) {
  const match = career.lastReport?.userMatch;
  if (!match) {
    const next = nextFixture();
    return `<div class="page-heading"><div><div class="eyebrow lime">MATCH CENTRE</div><h1>Match simulation</h1><p>Start your next fixture to follow the match clock and resolve key moments.</p></div></div>
      <section class="panel simulation-empty"><h2>${next ? `${esc(next.home.name)} vs ${esc(next.away.name)}` : "No upcoming fixture"}</h2>
      <p class="muted">${next ? formatDate(next.day) : "Your season is complete."}</p>
      ${next ? `<p class="muted">Advance the career to the scheduled matchday. Your match will open here without being completed automatically.</p><button class="button-primary" data-action="advance">Advance to matchday <span>→</span></button>` : ""}
      </section>`;
  }

  const state = career.matchSimulation ?? {
    minute: 0,
    activeMomentIndex: null,
    status: "ready",
  };
  const playerTeam = match[match.side];
  const homeGoals = match.homeGoals;
  const awayGoals = match.awayGoals;
  const activeMoment =
    state.activeMomentIndex == null
      ? null
      : match.playerResult.keyMoments[state.activeMomentIndex];
  const lastGoalEvent = state.lastGoalEvent;
  const revealedMoments = revealedKeyMoments(match);
  const allActions = activeMoment
    ? keyMomentActions(
        activeMoment.kind,
        activeMoment.position ?? career.player.position,
        data.keyMomentOptions,
      )
    : [];
  const availableActions = activeMoment
    ? (activeMoment.options ?? allActions.slice(0, 3))
        .map((id) => allActions.find((action) => action.id === id))
        .filter(Boolean)
    : [];
  const scorerTeam = lastGoalEvent
    ? lastGoalEvent.side === "home"
      ? match.home.name
      : match.away.name
    : "";
  const decisionButtons = activeMoment
    ? `<div class="simulation-decisions">
    ${availableActions.map((option) => `<button class="moment-choice" data-action="moment-decision" data-index="${state.activeMomentIndex}" data-decision="${esc(option.id)}"><span>${esc(option.label)}</span><small>${esc(option.attribute)} · ${option.modifier >= 0.08 ? "lower risk" : option.modifier <= -0.08 ? "high risk" : "balanced"}</small></button>`).join("")}
  </div>`
    : "";
  const nextAction =
    state.status === "finished"
      ? `<button class="button-primary" data-action="back-to-career">Return to career hub <span>→</span></button>`
      : state.status === "paused"
        ? decisionButtons
        : state.status === "running"
          ? `<span class="simulation-running">MATCH IN PROGRESS · CLOCK RUNNING</span>`
          : `<div class="simulation-start-actions"><button class="button-primary" data-action="start-simulation">Start match <span>▶</span></button><button class="button-quiet" data-action="skip-simulation">Skip to full time</button></div>`;
  const currentMinuteMoment = state.status === "paused" && activeMoment;
  const canRequestSubstitution =
    ["running", "paused"].includes(state.status) &&
    state.minute >= 45 &&
    match.playerResult.rating <= 5.8 &&
    !state.userSubbedOff;
  const playerStatus = describePlayerStatus(state, match);
  const fullTimeMinute = 90 + Math.max(0, Number(match.addedTime) || 0);
  return `${embedded ? "" : `<div class="page-heading"><div><div class="eyebrow lime">LIVE MATCH ENGINE</div><h1>Match simulation</h1><p>${esc(playerTeam.name)} · ${esc(match.opponent)}</p></div><span id="simulation-live-tag" class="live-tag">${state.status === "finished" ? "FULL TIME" : state.status === "paused" ? "KEY MOMENT · PAUSED" : state.status === "running" ? "LIVE" : "READY"}</span></div>`}
    <section class="panel simulation-panel${embedded ? " simulation-panel-embedded" : ""}">
      ${embedded ? `<div id="simulation-live-tag" class="simulation-competition">${esc(match.competitionName ?? career.league.name)} · ${state.status === "finished" ? "FULL TIME" : state.status === "paused" ? "KEY MOMENT" : state.status === "running" ? `LIVE · ${state.minute}'` : "READY TO PLAY"}</div>` : ""}
      <p class="muted"><b>PLAYER ROLE · ${esc(match.playerResult.role ?? career.matchRole)}</b> — ${esc(ROLE_DESCRIPTIONS[match.playerResult.role ?? career.matchRole] ?? ROLE_DESCRIPTIONS.Balanced)}</p>
      <div class="simulation-scoreboard">
        <div class="simulation-team">${renderClubCrest(match.home.name, null, "club-crest")}<span>${esc(match.home.name)}</span></div>
        <div class="simulation-score"><b id="home-score">${homeGoals}</b><span>—</span><b id="away-score">${awayGoals}</b></div>
        <div class="simulation-team">${renderClubCrest(match.away.name, null, "club-crest")}<span>${esc(match.away.name)}</span></div>
      </div>
      <div id="live-goal-commentary" class="live-goal-commentary ${lastGoalEvent ? "has-goal" : ""}" aria-live="polite">${lastGoalEvent ? `<span>GOAL · ${lastGoalEvent.minute}'</span><b>${playerProfileLink(lastGoalEvent.scorerId, lastGoalEvent.scorerName)}</b><small>${esc(scorerTeam)}${lastGoalEvent.assistName ? ` · Assist: ${playerProfileLink(lastGoalEvent.assistId, lastGoalEvent.assistName)}` : ""}</small>` : `<span>LIVE COMMENTARY</span><b>No goals yet</b><small>The scorer will appear here when a goal is scored.</small>`}</div>
      <div id="live-situation" class="live-situation ${state.lastSituation?.entry ? "has-situation entry" : ""}" aria-live="polite" ${state.lastSituation?.entry ? `data-minute="${state.lastSituation.minute}"` : ""}>${state.lastSituation?.entry ? `PLAYER ENTERS THE PITCH · ${state.lastSituation.minute}' · ${esc(state.lastSituation.text)}` : ""}</div>
      <div class="simulation-clock"><span id="simulation-minute">${matchMinuteLabel(state.minute)}'</span><div class="simulation-track"><i id="simulation-progress" style="width:${Math.min(100, (state.minute / fullTimeMinute) * 100)}%"></i></div><span>${matchMinuteLabel(fullTimeMinute)}'</span></div>
      <div id="player-pitch-status" class="player-pitch-status ${playerStatus.tone}" aria-live="polite">
        <span class="player-pitch-dot"></span>
        <b>${playerProfileLink(career.player)}</b>
        <span>${playerStatus.labelHtml ?? esc(playerStatus.label)}</span>
      </div>
      <div id="match-formations" data-lineup-key="${esc(matchLineupSignature(match))}">${renderMatchFormations(match, state.status === "finished" ? Number.POSITIVE_INFINITY : state.minute)}</div>
      <div id="simulation-live-event">${renderSimulationLiveEvent(match, state, activeMoment, decisionButtons, nextAction)}</div>
      <button id="poor-substitution" class="button-quiet" data-action="substitute-player" ${canRequestSubstitution ? "" : "hidden"}>Request substitution</button>
      <div id="simulation-key-moment-timeline" class="simulation-timeline"><div class="eyebrow">KEY MOMENT TIMELINE</div>${revealedMoments.length ? revealedMoments.map(({ moment, index }) => `<div class="simulation-timeline-row ${index === state.activeMomentIndex ? "current" : ""}"><b>${matchMinuteLabel(moment.minute)}'</b><span>${esc(matchMomentLabel(moment))}</span><small>${moment.resolved ? (moment.resolved.subbedOff ? "SUBBED OFF" : moment.resolved.success ? "SUCCESS" : "MISSED") : index === state.activeMomentIndex ? "NOW" : "PENDING"}</small></div>`).join("") : `<p class="muted">${match.playerResult.keyMoments.length ? "Key moments will appear here as the match clock reaches them." : "No key moments generated in this match."}</p>`}</div>
      <div class="simulation-events"><div class="eyebrow">MATCH TIMELINE</div><div id="simulation-event-feed" class="match-events">${renderEventTimeline(match, state.status === "finished" ? Number.POSITIVE_INFINITY : state.minute)}</div></div>
      ${state.status === "finished" ? renderTeammateRatings(match) : ""}
    </section>`;
}

function renderSimulationLiveEvent(match, state, activeMoment, decisionButtons, nextAction) {
  if (state.status === "paused" && activeMoment) {
    return `<div class="simulation-event"><span class="eyebrow">MATCH CLOCK STOPPED · ${matchMinuteLabel(activeMoment.minute)}'</span><h2>${esc(matchMomentLabel(activeMoment))}</h2><p>Choose how to handle it. The clock will remain paused until you decide.</p>${decisionButtons}</div>`;
  }
  if (state.status === "finished") {
    const playerSummary = state.userSubbedOff
      ? `Substituted in the ${matchMinuteLabel(state.minute)}th minute for ${playerProfileLink(null, state.substituteName)}. `
      : state.userEnteredPitch
        ? `Came on as a substitute in the ${matchMinuteLabel(state.enteredPitchMinute ?? state.minute)}th minute. `
        : state.userStatus === "unused"
          ? "An unused substitute. "
          : state.userStatus === "not-selected"
            ? "Not selected for this match. "
            : "";
    return `<div class="simulation-event"><span class="eyebrow">FULL TIME</span><h2>${playerProfileLink(career.player)} · ${match.playerResult.rating == null ? "—" : formatDecimal(match.playerResult.rating)} rating</h2><p>${playerSummary}All match moments have been resolved. The final score is recorded in your season.</p>${nextAction}</div>`;
  }
  const isRunning = state.status === "running";
  return `<div class="simulation-event"><span class="eyebrow">${isRunning ? "PLAYING" : "READY FOR KICK-OFF"}</span><h2>${isRunning ? "The match is underway." : "The teams are ready."}</h2><p>${isRunning ? "The clock is moving. It will pause automatically when a key moment occurs." : "Start the match simulation. Time will stop automatically at each player key moment."}</p>${nextAction}</div>`;
}

function renderTable() {
  const entries = data.careerLeagues ?? [];
  const selectedId = entries.some((entry) => entry.id === statsLeagueId)
    ? statsLeagueId
    : career.league.id;
  const selectedEntry = entries.find((entry) => entry.id === selectedId);
  const worldState = career.worldLeagues.find(
    ({ league }) => league.id === selectedId,
  );
  const league =
    selectedId === career.league.id ? career.league : worldState?.league;
  const rows = league?.table.sorted() ?? [];
  const players =
    selectedId === career.league.id
      ? career.players
          .filter((player) => player.leagueGoals || player.leagueAssists)
          .map((player) => ({
            ...player,
            goals: player.leagueGoals ?? 0,
            assists: player.leagueAssists ?? 0,
            apps: player.stats.apps,
            ratingSum: player.stats.ratingSum,
          }))
      : (worldState?.performers ?? []);
  const leaders = (stat) =>
    [...players]
      .sort(
        (left, right) =>
          right[stat] - left[stat] ||
          right.apps - left.apps ||
          (left.last ?? "").localeCompare(right.last ?? ""),
      )
      .slice(0, 10);
  const clubName = (clubId) =>
    selectedEntry?.clubIdentities[clubId]?.name ??
    career.clubs.find((club) => club.id === clubId)?.name ??
    clubId;
  const performerTables = `<div class="performer-grid">${["goals", "assists"]
    .map(
      (stat) =>
        `<section class="panel table-panel scorer-panel"><div class="panel-heading"><div><div class="eyebrow">LEAGUE LEADERS</div><h2>Top ${stat === "goals" ? "scorers" : "assisters"}</h2></div></div><table class="league-performer-table"><thead><tr><th>#</th><th>PLAYER</th><th>CLUB</th><th>APP</th><th>${stat.toUpperCase()}</th><th>AVG RTG</th></tr></thead><tbody>${
          leaders(stat)
            .map(
              (player, index) =>
                `<tr><td>${index + 1}</td><td class="team-cell">${playerProfileLink(player)}</td><td>${esc(clubName(player.clubId))}</td><td>${player.apps}</td><td class="scorer-goals">${player[stat]}</td><td>${player.apps ? formatDecimal(player.ratingSum / player.apps) : "—"}</td></tr>`,
            )
            .join("") ||
          `<tr><td class="scorer-empty" colspan="6">No ${stat} recorded yet.</td></tr>`
        }</tbody></table></section>`,
    )
    .join("")}</div>`;
  return `<div class="page-heading"><div><div class="eyebrow lime">${esc(countryName(league?.nation ?? "ENG").toUpperCase())} · TIER 1</div><h1>League stats</h1><p>Standings and leading scorers/assisters for any playable league · ${seasonLabel(career.season)}</p></div><label class="table-league-picker">League<select id="stats-league">${entries.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === selectedId ? "selected" : ""}>${esc(entry.league.name)}${entry.id === career.league.id ? " · Your league" : ""}</option>`).join("")}</select></label></div>
    <div class="page-heading compact-heading"><div><div class="eyebrow lime">LIVE TABLE</div><h2>${esc(league?.name ?? "League")}</h2></div><span class="live-tag">${(rows.reduce((sum, r) => sum + r.played, 0) / 2) | 0} / ${league?.fixtures.length ?? 0} MATCHES</span></div>
    <section class="panel table-panel"><table class="league-standings-table"><thead><tr><th>POS</th><th>CLUB</th><th>PL</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th><th>FORM</th></tr></thead><tbody>${rows
      .map((row, i) => {
        const identity = selectedEntry?.clubIdentities[row.teamId];
        const club =
          selectedId === career.league.id
            ? career.clubs.find((item) => item.id === row.teamId)
            : identity;
        const name = club?.name ?? row.teamId;
        const isUserClub =
          selectedId === career.league.id && row.teamId === career.club.id;
        const relegateCount = league?.rules?.relegation?.direct ?? 0;
        const isRelegated =
          relegateCount > 0 && i >= rows.length - relegateCount;
        return `<tr class="${isUserClub ? "user-row" : ""} ${isRelegated ? "relegation-row" : ""}"><td class="position-cell">${String(i + 1).padStart(2, "0")}</td><td class="team-cell">${renderClubCrest(name, club?.shortName ?? "", "table-crest")}${esc(name)}${isUserClub ? '<span class="you-label">YOU</span>' : ""}${isRelegated ? '<span class="relegation-label">REL</span>' : ""}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td><td class="${row.goalDifference > 0 ? "positive" : ""}">${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td><td class="points-cell">${row.points}</td><td><div class="form-dots">${(row.form.length ? row.form : ["–"]).map((f) => `<span class="form-${f.toLowerCase()}">${f}</span>`).join("")}</div></td></tr>`;
      })
      .join("")}</tbody></table></section>${performerTables}`;
}

// Columns shown on the Stats tab. Each row reads them straight off a player's
// season stats block, so goals, assists and disciplinary records all live together.
const STAT_COLUMNS = [
  { key: "apps", label: "APP", title: "Appearances" },
  { key: "goals", label: "GLS", title: "Goals" },
  { key: "assists", label: "AST", title: "Assists" },
  { key: "yellowCards", label: "YC", title: "Yellow cards" },
  { key: "redCards", label: "RC", title: "Red cards" },
];

function renderStats() {
  const selected = statsLeagueId || career.league.id;
  const isUserLeague = selected === career.league.id;
  const leagueEntries = [
    ...(data.careerLeagues ?? []),
    ...(career.worldCareerLeagues ?? []).map((entry) => ({
      id: entry.league?.id,
      league: entry.league,
    })),
    ...(career.worldLeagues ?? []).map((state) => ({
      id: state.league?.id,
      league: state.league,
    })),
  ].filter((entry, index, entries) =>
    entry?.id && entries.findIndex((item) => item?.id === entry.id) === index
  );
  const worldState = career.worldLeagues.find(
    ({ league }) => league.id === selected,
  );
  const league = isUserLeague ? career.league : worldState?.league;
  const leagueName = league?.name ?? career.league.name;

  // Players belonging to the selected league. The user's own league uses the live
  // career players (its clubs are career.clubs); other leagues fall back to the
  // whole tracked player list since their squads are not simulated in full.
  const userLeagueClubIds = new Set(career.clubs.map((club) => club.id));
  const pool = isUserLeague
    ? career.players.filter((player) => userLeagueClubIds.has(player.clubId))
    : (worldState?.performers ?? career.players).filter((player) =>
        worldState?.clubIds?.includes(player.clubId) ||
        worldState?.league?.teamIds?.includes(player.clubId) ||
        player.leagueId === selected
      );

  const statValue = (player, key) =>
    key === "goals"
      ? (player.leagueGoals ?? player.stats.goals ?? 0)
      : key === "assists"
        ? (player.leagueAssists ?? player.stats.assists ?? 0)
        : (player.stats?.[key] ?? 0);

  const players = pool
    .filter(
      (player) =>
        (player.stats?.apps ?? 0) > 0 || statValue(player, "goals") > 0,
    )
    .sort(
      (left, right) =>
        statValue(right, "goals") - statValue(left, "goals") ||
        statValue(right, "assists") - statValue(left, "assists") ||
        (right.stats?.apps ?? 0) - (left.stats?.apps ?? 0) ||
        left.last.localeCompare(right.last),
    );

  const leader = players[0];
  const clubOf = (player) =>
    career.clubs.find((club) => club.id === player.clubId) ??
    worldState?.clubIdentities?.[player.clubId] ??
    career.worldCareerLeagues
      ?.find((entry) => entry.league.id === selected)
      ?.clubIdentities?.[player.clubId] ??
    career.data?.clubs?.[selected]?.[player.clubId];
  return `<div class="page-heading"><div><div class="eyebrow lime">${esc(leagueName.toUpperCase())}</div><h1>Stats</h1><p>Every player's goals, assists and disciplinary record in this league, updated after each completed fixture.</p></div><label class="table-league-picker">League<select id="stats-league">${leagueEntries.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === selected ? "selected" : ""}>${esc(entry.league?.name ?? entry.name ?? entry.id)}${entry.id === career.league.id ? " · Your league" : ""}</option>`).join("")}</select></label></div>
    <section class="panel table-panel scorer-panel"><div class="panel-heading"><div><div class="eyebrow">LEAGUE STATS</div><h2>Player stats</h2></div><span class="live-tag">${leader ? `${statValue(leader, "goals")} GOALS · LEADER` : "NO RESULTS YET"}</span></div><table class="stats-table"><thead><tr><th>#</th><th>PLAYER</th><th>POS</th><th>CLUB</th><th>APP</th><th>GLS</th><th>AST</th><th>YC</th><th>RC</th><th>AVG RTG</th></tr></thead><tbody>${
      players.length
        ? players
            .map((player, index) => {
              const club = clubOf(player);
              const avg =
                (player.stats?.apps ?? 0)
                  ? formatDecimal(
                      (player.stats.ratingSum ?? 0) / player.stats.apps,
                    )
                  : "—";
              const yellows = statValue(player, "yellowCards");
              const reds = statValue(player, "redCards");
              return `<tr class="${player.isUser ? "user-row" : ""}"><td class="position-cell">${String(index + 1).padStart(2, "0")}</td><td class="performer-player">${playerProfileLink(player, `${player.first} ${player.last}`, "player-directory-name")}</td><td class="scorer-position">${esc(player.position)}</td><td class="team-cell">${club ? renderClubCrest(club.name, club.shortName, "table-crest") : ""}${esc(club?.name ?? "Free agent")}</td><td>${player.stats?.apps ?? 0}</td><td class="scorer-goals">${statValue(player, "goals")}</td><td>${statValue(player, "assists")}</td><td class="stat-card-cell">${yellows ? `<span class="card-chip yellow">${yellows}</span>` : "0"}</td><td class="stat-card-cell">${reds ? `<span class="card-chip red">${reds}</span>` : "0"}</td><td>${avg}</td></tr>`;
            })
            .join("")
        : `<tr><td class="scorer-empty" colspan="10">No player statistics are recorded yet. They update after each completed matchday.</td></tr>`
    }</tbody></table></section>`;
}

function renderChampionsLeague() {
  const competition = career.championsLeague;
  if (!competition) {
    return `<div class="page-heading"><div><div class="eyebrow lime">UEFA COMPETITION</div><h1>Champions League</h1><p>Qualification begins after the first domestic season.</p></div></div><section class="panel"><h2>Not qualified yet</h2><p class="muted">Complete the domestic season to determine next season's Champions League places.</p></section>`;
  }
  const teamName = (id) =>
    competition.leaguePhaseTeams.find((team) => team.id === id)?.name ??
    competition.qualified.find((team) => team.clubId === id)?.clubId ??
    id;
  const rows = competition.leaguePhase.standings ?? [];
  const awards = competition.awards ?? [];
  const renderTie = (tie) => {
    const first = tie.firstLeg;
    const second = tie.secondLeg;
    const firstScore = first?.played
      ? `${first.homeGoals}–${first.awayGoals}`
      : "—";
    const secondScore = second?.played
      ? `${second.homeGoals}–${second.awayGoals}`
      : "—";
    const aggregate =
      first?.played && second?.played
        ? `${first.homeGoals + second.awayGoals}–${first.awayGoals + second.homeGoals}`
        : "—";
    const winner = tie.winnerId ? teamName(tie.winnerId) : null;
    return `<div class="bracket-tie"><div><span class="${winner === teamName(tie.homeId) ? "bracket-side winner" : "bracket-side"}">${esc(teamName(tie.homeId))}</span><small>${firstScore} / ${secondScore}</small></div><b>${aggregate}</b><div><span class="${winner === teamName(tie.awayId) ? "bracket-side winner right" : "bracket-side right"}">${esc(teamName(tie.awayId))}</span><small>${first ? `${secondScore} / ${firstScore}` : "—"}</small></div></div>`;
  };
  const bracketRounds = [
    ["Round of 16", competition.knockout?.roundOf16],
    ["Quarter-finals", competition.knockout?.quarterFinals],
    ["Semi-finals", competition.knockout?.semiFinals],
  ]
    .filter(([, ties]) => ties?.length)
    .map(
      ([label, ties]) =>
        `<div class="bracket-round${competition.stage.toLowerCase().includes(label.toLowerCase().replace("-", "")) ? " current" : ""}"><h4>${label}</h4>${ties.map(renderTie).join("")}</div>`,
    )
    .join("");
  const final = competition.knockout?.final;
  const finalBracket = final
    ? `<div class="bracket-round${competition.stage === "final" ? " current" : ""}"><h4>Final</h4><div class="bracket-tie"><div class="bracket-side">${esc(teamName(final.homeId))}<small>${final.played ? `${final.homeGoals}` : "—"}</small></div><b>${final.played ? `${final.homeGoals}–${final.awayGoals}` : "—"}</b><div class="bracket-side right">${esc(teamName(final.awayId))}<small>${final.played ? `${final.awayGoals}` : "—"}</small></div></div>${competition.winnerId ? `<p class="bracket-winner">Winner: <b>${esc(teamName(competition.winnerId))}</b></p>` : ""}</div>`
    : "";
  const bracket =
    bracketRounds || finalBracket
      ? `<section class="panel tournament-bracket"><h3>Knockout bracket</h3><div class="bracket-grid">${bracketRounds}${finalBracket}</div></section>`
      : "";
  const topScorers = Object.values(competition.stats ?? {})
    .filter((row) =>
      row.apps > 0 &&
      (row.competitionId == null || row.competitionId === "champions-league") &&
      (row.season == null || row.season === competition.season),
    )
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, 10);
  return `<div class="page-heading"><div><div class="eyebrow lime">UEFA COMPETITION · ${esc(String(competition.season))}</div><h1>Champions League</h1><p>${esc(competition.stage)} · ${competition.winnerId ? `Winner: ${esc(teamName(competition.winnerId))}` : "Competition in progress"}</p></div><span class="live-tag">${competition.leaguePhaseTeams.length} TEAMS</span></div>
    <div class="page-heading compact-heading"><div><div class="eyebrow lime">LIVE TABLE</div><h2>Champions League</h2></div><span class="live-tag">${(rows.reduce((sum, row) => sum + row.played, 0) / 2) | 0} / ${competition.leaguePhase.fixtures.length} MATCHES</span></div>
    <section class="panel table-panel"><table class="league-standings-table"><thead><tr><th>POS</th><th>CLUB</th><th>PL</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th><th>FORM</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td class="position-cell">${String(index + 1).padStart(2, "0")}</td><td class="team-cell">${renderClubCrest(teamName(row.teamId), "", "table-crest")}${esc(teamName(row.teamId))}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td><td class="${row.goalDifference > 0 ? "positive" : ""}">${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td><td class="points-cell">${row.points}</td><td><div class="form-dots">${(row.form?.length ? row.form : ["–"]).map((form) => `<span class="form-${form.toLowerCase()}">${form}</span>`).join("")}</div></td></tr>`).join("")}</tbody></table></section>
    ${bracket}
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">PLAYER STATISTICS</div><h2>Champions League top scorers</h2></div></div><table class="data-table"><thead><tr><th>#</th><th>PLAYER</th><th>CLUB</th><th>APP</th><th>GOALS</th><th>ASSISTS</th><th>RATING</th></tr></thead><tbody>${topScorers.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.player)}</td><td>${esc(row.club)}</td><td>${row.apps}</td><td><b>${row.goals}</b></td><td>${row.assists}</td><td>${formatDecimal(row.ratingSum / Math.max(1, row.apps))}</td></tr>`).join("")}</tbody></table></section>
    <section class="panel"><div class="panel-heading"><div><div class="eyebrow">CHAMPIONS LEAGUE AWARDS</div><h2>Competition honours</h2></div></div><div class="trophy-grid">${awards.map((award) => renderAwardCard(award, competition.season)).join("") || '<p class="muted">Awards will appear after the final.</p>'}</div></section>`;
}

function renderWorldCup() {
  const worldCup = career.worldCup;
  const qualification = worldCup.qualification;
  const tournament = worldCup.tournament;
  const yearsToGo = Math.max(0, worldCup.nextYear - career.season);
  const currentUserSelection =
    worldCup.userSelection?.year === worldCup.nextYear
      ? worldCup.userSelection
      : null;
  const renderStandings = (table, teamNames = {}) =>
    `<table class="league-standings-table"><thead><tr><th>POS</th><th>NATION</th><th>PL</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th></tr></thead><tbody>${(table ?? []).map((row, index) => `<tr><td class="position-cell">${String(index + 1).padStart(2, "0")}</td><td class="team-cell">${esc(teamNames[row.teamId] ?? row.name)}</td><td>${row.played}</td><td>${row.won}</td><td>${row.drawn}</td><td>${row.lost}</td><td>${row.goalsFor}</td><td>${row.goalsAgainst}</td><td>${row.goalDifference > 0 ? "+" : ""}${row.goalDifference}</td><td class="points-cell">${row.points}</td></tr>`).join("")}</tbody></table>`;
  const renderResults = (fixtures, teams) => {
    const names = Object.fromEntries((teams ?? []).map((team) => [team.id, team.name]));
    return `<table class="data-table"><thead><tr><th>DATE</th><th>STAGE</th><th>FIXTURE</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>${(fixtures ?? []).map((fixture) => `<tr><td>${Number.isFinite(fixture.scheduledDay) ? formatDate(fixture.scheduledDay) : "—"}</td><td>${esc(fixture.stage === "group" ? `${fixture.groupId} · Matchday ${fixture.round + 1}` : fixture.round ?? fixture.groupId ?? "Group stage")}</td><td>${esc(names[fixture.homeId] ?? fixture.homeId)} vs ${esc(names[fixture.awayId] ?? fixture.awayId)}</td><td>${fixture.homeGoals == null ? "—" : `${fixture.homeGoals}–${fixture.awayGoals}`}</td><td>${esc(fixture.decidedBy ?? fixture.status)}</td></tr>`).join("") || '<tr><td colspan="5" class="scorer-empty">Fixtures will appear as qualification and tournament stages are reached.</td></tr>'}</tbody></table>`;
  };
  const qualificationGroups = (qualification?.groups ?? [])
    .map(
      (group) =>
        `<section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">QUALIFICATION · ${esc(group.id)}</div><h2>${group.teams.map((team) => esc(team.name)).join(" · ")}</h2></div><span class="live-tag">${group.table.reduce((sum, row) => sum + row.played, 0) / 2} MATCHES</span></div>${renderStandings(group.table)}</section>`,
    )
    .join("");
  const tournamentGroups = (tournament?.groups ?? [])
    .map(
      (group) =>
        `<section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">FINALS · ${esc(group.id)}</div><h2>${group.teams.map((team) => esc(team.name)).join(" · ")}</h2></div><span class="live-tag">${group.table.length} NATIONS</span></div>${renderStandings(group.table)}</section>`,
    )
    .join("");
  const teams = tournament?.qualified ?? qualification?.qualified ?? [];
  const userTeam =
    currentUserSelection?.selected
      ? teams.find((team) => team.squadIds?.includes(career.player.id)) ??
        teams.find((team) => team.code === career.player.nationality)
      : null;
  const userTournamentFixtures =
    userTeam && tournament?.fixtures
      ? tournament.fixtures.filter(
          (fixture) =>
            fixture.homeId === userTeam.id ||
            fixture.awayId === userTeam.id,
        )
      : [];
  const internationalPlayers = career.internationalPlayers();
  const countryProfiles = teams
    .map((team) => {
      const roster = (team.squadIds ?? [])
        .map((id) => internationalPlayers.find((player) => player.id === id))
        .filter(Boolean);
      return `<details class="panel national-team-profile"><summary><b>${esc(team.name)}</b><span>${team.rating} OVR · ${roster.length}/26 · ${esc(team.manager?.name ?? "National manager")}</span></summary><div class="player-directory-grid">${roster.map((player) => `<a class="player-directory-card" href="#players" data-open-player="${esc(player.id)}"><div class="directory-card-head"><b>${esc(`${player.first} ${player.last}`)}</b><span class="directory-card-tag">${esc(player.position)}</span></div><div class="directory-card-stats"><span class="world-rating">${player.overall}</span><span>${player.internationalStats?.apps ?? 0} caps</span><span>${player.internationalStats?.goals ?? 0} goals</span></div><div class="directory-card-foot"><span>${esc(player.clubId ?? "—")}</span></div></a>`).join("")}</div></details>`;
    })
    .join("");
  const playerStats = Object.values(tournament?.playerStats ?? {});
  const topScorers = [...playerStats]
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists)
    .slice(0, 10);
  const historyRows = [...(worldCup.history ?? [])]
    .reverse()
    .map((entry) => `<tr><td>${entry.year}</td><td>${esc(entry.winner ?? entry.winnerId ?? "—")}</td><td>${esc(entry.runnerUp ?? entry.runnerUpId ?? "—")}</td><td>${esc(entry.thirdPlace ?? entry.thirdPlaceId ?? "—")}</td><td>${esc(entry.goldenBoot?.player ?? "—")}</td><td>${esc(entry.goldenBall?.player ?? "—")}</td></tr>`)
    .join("");
  const matchCount = tournament?.fixtures?.length ?? 0;
  const completed = tournament?.fixtures?.filter(
    (fixture) => fixture.status === "completed",
  ).length ?? 0;
  return `<div class="page-heading"><div><div class="eyebrow lime">INTERNATIONAL FOOTBALL · FIFA</div><h1>World Cup</h1><p>National selection, qualification, the finals and the history of international football are part of this career.</p></div><span class="live-tag">${worldCup.nextYear} · EVERY FOUR YEARS</span></div>
    <div class="stat-grid">
      <article class="stat-card"><div class="card-label">NEXT WORLD CUP</div><div class="big-number">${worldCup.nextYear}</div><div class="muted">${yearsToGo === 0 ? "Scheduled this season" : `${yearsToGo} season${yearsToGo === 1 ? "" : "s"} away`} · schedule locked to the four-year cycle</div></article>
      <article class="stat-card"><div class="card-label">QUALIFICATION</div><div class="big-number">${qualification?.status === "complete" ? `${qualification.qualified.length} NATIONS` : qualification?.status === "in-progress" ? `${qualification.roundsPlayed} ROUNDS` : "PENDING"}</div><div class="muted">${qualification?.message ?? `${qualification?.groups.length ?? 0} groups · results determine the finalists`}</div></article>
      <article class="stat-card"><div class="card-label">YOUR NATIONAL TEAM</div><div class="big-number">${currentUserSelection ? currentUserSelection.selected ? "CALLED UP" : "NOT SELECTED" : esc(COUNTRY_NAMES[career.player.nationality] ?? career.player.nationality)}</div><div class="muted">${esc(career.player.internationalReputationLevel ?? "Unknown prospect")} · ${career.player.internationalStats?.apps ?? 0} caps</div></article>
      <article class="stat-card"><div class="card-label">TOURNAMENT PROGRESS</div><div class="big-number">${tournament?.status === "complete" ? "FULL TIME" : tournament?.status === "in-progress" ? `${completed}/${matchCount} MATCHES` : "NOT STARTED"}</div><div class="muted">${tournament?.winner ? `${esc(tournament.winner)} are the reigning champions` : "Qualified countries and final standings appear here"}</div></article>
    </div>
    ${tournament?.status === "cancelled" ? `<section class="panel"><h2>World Cup unavailable</h2><p class="muted">${esc(tournament.reason)}</p></section>` : ""}
    ${qualificationGroups ? `<div class="page-heading compact-heading"><div><div class="eyebrow lime">ROAD TO ${worldCup.nextYear}</div><h2>Qualification groups</h2></div><span class="live-tag">${qualification?.fixtures.filter((fixture) => fixture.status === "completed").length ?? 0} RESULTS</span></div><div class="dashboard-grid">${qualificationGroups}</div>` : ""}
    ${tournamentGroups ? `<div class="page-heading compact-heading"><div><div class="eyebrow lime">FIFA WORLD CUP · ${tournament.year}</div><h2>${tournament.status === "complete" ? `${esc(tournament.winner)} are world champions` : "Finals"}</h2></div><span class="live-tag">${teams.length} NATIONS</span></div><div class="dashboard-grid">${tournamentGroups}</div><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">TOURNAMENT RESULTS</div><h2>${userTeam ? `${esc(userTeam.name)} fixtures` : "Your country is not in the tournament"}</h2></div></div>${renderResults(userTournamentFixtures, teams)}</section><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">TOURNAMENT STATISTICS</div><h2>Top scorers</h2></div></div><table class="data-table"><thead><tr><th>#</th><th>PLAYER</th><th>NATION</th><th>APP</th><th>G</th><th>A</th><th>AVG RTG</th></tr></thead><tbody>${topScorers.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.player)}</td><td>${esc(COUNTRY_NAMES[row.nation] ?? row.nation)}</td><td>${row.apps}</td><td><b>${row.goals}</b></td><td>${row.assists}</td><td>${formatDecimal(row.ratingSum / Math.max(1, row.apps))}</td></tr>`).join("") || '<tr><td colspan="7" class="scorer-empty">No tournament appearances have been recorded.</td></tr>'}</tbody></table><p class="muted">${tournament.goldenBoot ? `Golden Boot: ${esc(tournament.goldenBoot.player)} · ` : ""}${tournament.goldenBall ? `Golden Ball: ${esc(tournament.goldenBall.player)} · ` : ""}${tournament.goldenGlove ? `Golden Glove: ${esc(tournament.goldenGlove.player)} · ` : ""}${tournament.bestYoungPlayer ? `Best Young Player: ${esc(tournament.bestYoungPlayer.player)}` : ""}</p></section>` : ""}
    <div class="page-heading compact-heading"><div><div class="eyebrow lime">NATIONAL TEAMS</div><h2>${teams.length ? "Qualified squads and managers" : "The international player pool"}</h2></div><span class="live-tag">${teams.length ? `${teams.length} COUNTRIES` : `${internationalPlayers.length} PLAYERS`}</span></div><div class="dashboard-grid">${countryProfiles || '<section class="panel"><p class="muted">National squads are selected from eligible players across all playable leagues before qualification and each World Cup.</p></section>'}</div>
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">WORLD CUP HISTORY</div><h2>Champions and individual awards</h2></div><span class="live-tag">${worldCup.history?.length ?? 0} TOURNAMENTS</span></div><table class="data-table"><thead><tr><th>YEAR</th><th>CHAMPION</th><th>RUNNER-UP</th><th>THIRD</th><th>GOLDEN BOOT</th><th>GOLDEN BALL</th></tr></thead><tbody>${historyRows || '<tr><td colspan="6" class="scorer-empty">World Cup history will be recorded here after the first tournament.</td></tr>'}</tbody></table></section>`;
}

function renderAwards() {
  const seasonRace = career.getAwardRace().slice(0, 10);
  const ballonRace = career.getBallonDorRace().slice(0, 30);
  const lastCeremony = career.ballonDorCeremonies?.at(-1) ?? null;
  const latestAwards =
    career.currentSeasonAwards ??
    (lastCeremony
      ? career.seasonAwardHistory.find(
          (entry) => entry.season === lastCeremony.awardPeriod,
        )
      : null);
  const latestCeremony =
    lastCeremony?.awardPeriod === latestAwards?.season ? lastCeremony : null;
  const ballonCeremony =
    latestCeremony?.award?.evaluation ??
    (latestCeremony
      ? latestAwards.awards?.find((award) => award.award === "Ballon d'Or")
          ?.evaluation
      : null);
  const ceremonyPending =
    latestAwards?.season === career.season &&
    career.seasonComplete &&
    !career.ballonDorCeremonies?.some(
      (ceremony) => ceremony.awardPeriod === latestAwards.season,
    );
  const leagueNameForClub = (clubId) =>
    career.clubs.find((club) => club.id === clubId)?.leagueName ??
    data.careerLeagues?.find((entry) =>
      entry.league.teamIds.includes(clubId),
    )?.league.name ??
    data.careerLeagues?.find((entry) =>
      entry.clubIdentities?.[clubId],
    )?.league.name ??
    null;
  const awardLeagueName = (award, winner) => {
    if (award.competition === "UEFA Champions League")
      return "UEFA Champions League";
    if (award.competition === "World football") return "World football";
    return (
      leagueNameForClub(winner?.clubId) ??
      award.competition ??
      career.league.name
    );
  };
  const awardMatrix = (() => {
    if (!latestAwards?.awards?.length) return null;
    const columns = [];
    const cells = new Map();
    for (const award of latestAwards.awards) {
      if (award.award === "Ballon d'Or" && ceremonyPending) continue;
      for (const winner of award.winners ?? []) {
        const league = awardLeagueName(award, winner);
        if (!columns.includes(league)) columns.push(league);
        const key = `${award.award}::${league}`;
        const entries = cells.get(key) ?? [];
        entries.push(winner);
        cells.set(key, entries);
      }
    }
    const rows = [...new Set(latestAwards.awards.map((award) => award.award))];
    return { columns, cells, rows };
  })();
  const awardMatrixMarkup = awardMatrix
    ? `<div class="awards-matrix-wrap"><table class="awards-matrix"><thead><tr><th>AWARD</th>${awardMatrix.columns.map((league) => `<th>${esc(league)}</th>`).join("")}</tr></thead><tbody>${awardMatrix.rows.map((awardName) => `<tr><th>${esc(awardName)}</th>${awardMatrix.columns.map((league) => {
        const winners = awardMatrix.cells.get(`${awardName}::${league}`) ?? [];
        return `<td>${winners.length ? winners.map((winner) => winner.coach ? esc(winner.coach) : playerProfileLink(winner.playerId, winner.player)).join("<br>") : '<span class="muted">—</span>'}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>`
    : "";
  const clubNameFor = (player) =>
    career.clubs.find((club) => club.id === player.clubId)?.name ??
    data.careerLeagues?.find((entry) =>
      entry.league.teamIds.includes(player.clubId),
    )?.clubIdentities[player.clubId]?.name ??
    "Free agent";
  const archiveRows = (career.seasonAwardHistory ?? [])
    .slice()
    .reverse()
    .flatMap((entry) =>
      (entry.awards ?? []).flatMap((award) =>
        award.award === "Ballon d'Or" &&
        !career.ballonDorCeremonies?.some(
          (ceremony) => ceremony.awardPeriod === entry.season,
        )
          ? []
          :
        (award.winners ?? []).map((winner) => ({
          season: entry.season,
          award: award.award,
          player: winner.player,
          coach: winner.coach,
          club: winner.club,
          competition: award.competition,
        })),
      ),
    )
    .slice(0, 80);
  const watchlist =
    career.ballonDorWatchlist ??
    ballonRace.map((entry, index) => ({
      playerId: entry.player.id,
      player: `${entry.player.first} ${entry.player.last}`,
      clubId: entry.player.clubId,
      overall: entry.player.overall ?? 0,
      goals: entry.goals,
      assists: entry.assists,
      averageRating: entry.averageRating,
      points: entry.points,
      rank: index + 1,
    }));
  const raceTable = (race, label, title, description, emptyMessage) =>
    `<section class="panel table-panel scorer-panel award-race-panel"><div class="panel-heading"><div><div class="eyebrow">${esc(label)}</div><h2>${esc(title)}</h2></div><span class="live-tag">${race.length ? `${formatDecimal(race[0].points)} PTS · LEADER` : "RACE STARTS AT KICK-OFF"}</span></div><p class="muted award-race-description">${esc(description)}</p><table class="awards-race-table"><thead><tr><th>#</th><th>PLAYER</th><th>CLUB / NATION</th><th>APP</th><th>G</th><th>A</th><th>AVG RTG</th><th>RACE PTS</th></tr></thead><tbody>${
      race.length
        ? race
            .map((entry, index) => {
              const player = entry.player;
              return `<tr class="${player.isUser ? "user-row" : ""}"><td class="position-cell">${String(index + 1).padStart(2, "0")}</td><td class="performer-player">${playerProfileLink(player)}</td><td class="team-cell">${esc(clubNameFor(player))}</td><td>${entry.apps}</td><td>${entry.goals}</td><td>${entry.assists}</td><td>${entry.averageRating == null ? "—" : formatDecimal(entry.averageRating)}</td><td class="scorer-goals">${formatDecimal(entry.points)}</td></tr>`;
            })
            .join("")
        : `<tr><td class="scorer-empty" colspan="8">${esc(emptyMessage)}</td></tr>`
    }</tbody></table></section>`;
  return `<div class="page-heading"><div><div class="eyebrow lime">${esc(career.league.name.toUpperCase())}</div><h1>Season awards</h1><p>Follow your league's Player of the Season race separately from the global Ballon d'Or shortlist.</p></div><span class="live-tag">${seasonRace.length ? `${formatDecimal(seasonRace[0].points)} PTS · LEAGUE LEADER` : "RACE STARTS AT KICK-OFF"}</span></div>
    <section class="panel award-show"><div class="panel-heading"><div><div class="eyebrow">AWARD CEREMONY</div><h2>${latestAwards ? `${seasonLabel(latestAwards.season)} winners` : `${seasonLabel(career.season)} awards`}</h2></div><span class="live-tag">${ceremonyPending ? "BALLON D'OR NEXT SEASON" : latestCeremony ? `${seasonLabel(latestCeremony.ceremonySeason)} CEREMONY COMPLETE` : latestAwards ? "WINNERS ANNOUNCED" : career.seasonComplete ? "AWARDS PENDING" : "SEASON IN PROGRESS"}</span></div>${awardMatrixMarkup || `<p class="muted">${ceremonyPending ? "Season awards are confirmed. The Ballon d'Or ceremony takes place at the start of the next season." : career.seasonComplete ? "Award winners will be announced shortly." : "Award winners are decided at the end of the season, once all six leagues are complete."}</p>`}</section>
    ${raceTable(seasonRace, `LEAGUE RACE · ${career.league.name.toUpperCase()}`, "Player of the Season", "This table only ranks players in your current league. Points: goals × 4, assists × 3, rating above 6.0 × 5, appearances × 0.2 (capped at 30).", "No player ratings yet. This race updates after league appearances.")}
    ${ballonCeremony ? `<section class="panel ballon-ceremony"><div class="panel-heading"><div><div class="eyebrow">1,000-POINT EVALUATION · ${seasonLabel(latestAwards.season)}</div><h2>Ballon d'Or ceremony</h2></div><span class="live-tag">${formatDecimal(ballonCeremony.winner.points)} / 1000 PTS</span></div><div class="ballon-winner"><div><h3>${esc(ballonCeremony.winner.player)}</h3><p>${esc(ballonCeremony.winner.club)} · ${esc(ballonCeremony.winner.nationality)} · ${ballonCeremony.winner.overall} OVR</p><p>${ballonCeremony.winner.goals} goals · ${ballonCeremony.winner.assists} assists</p></div><div class="ballon-categories">${Object.entries(ballonCeremony.winner.categoryScores).map(([name, value]) => `<span><b>${formatDecimal(value)}</b><small>${esc(name.replace(/([A-Z])/g, " $1"))}</small></span>`).join("")}</div></div><p class="muted">${[...(ballonCeremony.winner.domesticAchievements ?? []), ...(ballonCeremony.winner.championsLeagueAchievements ?? [])].join(" · ") || "Individual performance evaluation from completed matches."}</p><h3>Final global top 10</h3><table class="awards-race-table"><thead><tr><th>#</th><th>PLAYER</th><th>CLUB / NATION</th><th>OVR</th><th>G</th><th>A</th><th>PTS / 1000</th></tr></thead><tbody>${(ballonCeremony.top10 ?? ballonCeremony.top30 ?? []).slice(0, 10).map((entry) => `<tr><td>${entry.rank}</td><td>${playerProfileLink(entry.playerId, entry.player)}</td><td>${esc(entry.club)} · ${esc(entry.nationality)}</td><td>${entry.overall}</td><td>${entry.goals}</td><td>${entry.assists}</td><td class="scorer-goals">${formatDecimal(entry.points)}</td></tr>`).join("")}</tbody></table></section>` : ""}
    ${raceTable(ballonRace, "GLOBAL RACE · SIX COMPETITIONS", "Ballon d'Or", "A 1,000-point evaluation across six categories: individual statistics (250), domestic league (200), Champions League (180), team achievements (250), consistency and big matches (70), and international tournament (50). Position-specific statistics are used for each role. The winner is decided by 100 journalist votes on a 30-player shortlist (top-10 ballots, 15/12/10/8/7/5/4/3/2/1 points).", "No eligible player performances have been recorded yet.")}
    <section class="panel table-panel scorer-panel award-race-panel"><div class="panel-heading"><div><div class="eyebrow">LIVE SEASON TRACKER</div><h2>Ballon d'Or Watchlist</h2></div><span class="live-tag">TOP ${watchlist.length} · PERFORMANCE-LED</span></div><p class="muted award-race-description">The shortlist updates from recorded performances and achievements. Overall is context, not an award guarantee.</p><div class="watchlist-grid">${
      watchlist
        .slice(0, 20)
        .map(
          (entry, index) =>
            `<article class="watchlist-card"><span class="watchlist-rank">${String(entry.rank ?? index + 1).padStart(2, "0")}</span><div><b>${playerProfileLink(entry.playerId, entry.player)}</b><small>${esc(clubNameFor({ clubId: entry.clubId }))} · ${entry.overall} OVR</small><small>${entry.goals} G · ${entry.assists} A · ${formatDecimal(Number(entry.averageRating ?? 0))} AVG</small></div><strong>${formatDecimal(Number(entry.points ?? 0))}<small>PTS</small></strong><span class="watchlist-change">${entry.rankChange == null ? "NEW" : entry.rankChange > 0 ? `▲ ${entry.rankChange}` : entry.rankChange < 0 ? `▼ ${Math.abs(entry.rankChange)}` : "—"}</span></article>`,
        )
        .join("") ||
      '<p class="muted">Player performances will populate the watchlist after fixtures.</p>'
    }</div></section>

    <section class="panel table-panel scorer-panel award-race-panel"><div class="panel-heading"><div><div class="eyebrow">PAST WINNERS</div><h2>Awards archive</h2></div><span class="live-tag">${(career.seasonAwardHistory ?? []).length} SEASONS</span></div><table class="awards-race-table"><thead><tr><th>SEASON</th><th>COMPETITION</th><th>AWARD</th><th>PLAYER / COACH</th><th>CLUB</th></tr></thead><tbody>${archiveRows.length ? archiveRows.map((row) => `<tr><td>${seasonLabel(row.season)}</td><td>${esc(row.competition ?? "—")}</td><td>${esc(row.award)}</td><td>${row.coach ? esc(row.coach) : playerProfileLink(row.player, row.player)}</td><td>${esc(row.club ?? "—")}</td></tr>`).join("") : '<tr><td class="scorer-empty" colspan="5">Complete a season to build the awards archive.</td></tr>'}</tbody></table></section>`;
}

function renderAwardCard(award, season) {
  const awardName = esc(award.award);
  const winnerNames = award.winners
    .map((winner) => winner.coach ? esc(winner.coach) : playerProfileLink(winner.playerId, winner.player))
    .join(", ");
  const clubs = award.winners.map((winner) => esc(winner.club)).join(" · ");
  const value = award.displayValue ?? `${award.value} ${award.valueLabel}`;
  const normalized = award.award.toLowerCase();
  const variant = normalized.includes("champions league champion")
    ? "champions-league"
    : normalized.includes("ballon")
    ? "ballon"
    : normalized.includes("boot")
      ? "boot"
      : normalized.includes("playmaker")
        ? "playmaker"
        : normalized.includes("goalkeeper") || normalized.includes("glove")
          ? "glove"
          : normalized.includes("international") || normalized.includes("world")
            ? "world"
            : normalized.includes("champion") || normalized.includes("league")
              ? "champion"
              : normalized.includes("rating")
                ? "rating"
                : "star";
  const trophyArtwork = {
    ballon: `<circle class="trophy-metal" cx="32" cy="22" r="14"/><path class="trophy-engraving" d="M21 22h22M32 8c-4 5-6 9-6 14s2 9 6 14M32 8c4 5 6 9 6 14s-2 9-6 14"/><path class="trophy-stem" d="M28 38h8v14h-8zM23 52h18v5H23zM18 57h28v7H18z"/>`,
    boot: `<path class="trophy-metal" d="M18 37c7 0 11-3 14-9l7 4c1 7 5 12 12 15l8 3c3 1 4 4 3 7l-2 5H13l-2-5c-1-4 1-7 5-9l7-3-5-8z"/><path class="trophy-engraving" d="m32 31 7 4m-3 3 6 3m-2 4 6 2M16 56h41"/>`,
    playmaker: `<path class="trophy-cup" d="M20 15h24v14c0 9-5 15-12 18-7-3-12-9-12-18z"/><path class="trophy-handle" d="M20 19h-8v7c0 7 4 11 11 12m21-19h8v7c0 7-4 11-11 12"/><circle class="trophy-detail" cx="32" cy="28" r="6"/><path class="trophy-engraving" d="m32 23 1.5 3.3 3.5.4-2.6 2.4.7 3.5-3.1-1.8-3.1 1.8.7-3.5-2.6-2.4 3.5-.4z"/><path class="trophy-stem" d="M28 47h8v10h-8zM21 57h22v6H21z"/>`,
    glove: `<path class="trophy-metal" d="M18 55c-2-2-3-5-2-8l5-16c1-3 5-2 5 1l-1 8 4-20c1-4 6-3 6 1l-2 17 5-21c1-4 6-3 6 1l-4 21 6-15c2-4 6-2 5 2l-5 20c-1 6-5 10-11 11H25c-3 0-5-1-7-2z"/><path class="trophy-stem" d="M28 58h8v5h-8zM22 63h20v5H22z"/>`,
    world: `<circle class="trophy-metal" cx="32" cy="19" r="12"/><path class="trophy-engraving" d="M20 19h24M32 7c-4 4-6 8-6 12s2 8 6 12M32 7c4 4 6 8 6 12s-2 8-6 12"/><path class="trophy-cup" d="m21 31 11 8 11-8-4 15H25z"/><path class="trophy-stem" d="M29 46h6v10h-6zM22 56h20v6H22zM18 62h28v6H18z"/>`,
    "champions-league": `<circle class="trophy-metal" cx="32" cy="25" r="16"/><path class="trophy-starball" d="m32 10 3.8 9.3 10.1 1-7.7 6.7 2.3 9.8L32 31.7l-8.5 5.1 2.3-9.8-7.7-6.7 10.1-1z"/><path class="trophy-orbit" d="M16 25c5-7 27-7 32 0M16 25c5 7 27 7 32 0M32 9c-5 5-5 27 0 32M32 9c5 5 5 27 0 32"/><path class="trophy-stem" d="M28 41h8v13h-8zM21 54h22v6H21zM16 60h32v8H16z"/>`,
    champion: `<path class="trophy-cup" d="M20 14h24v15c0 10-5 16-12 19-7-3-12-9-12-19z"/><path class="trophy-handle" d="M20 18h-8v8c0 7 4 11 12 12m20-20h8v8c0 7-4 11-12 12"/><path class="trophy-engraving" d="M24 20h16M25 25h14M27 30h10"/><path class="trophy-stem" d="M28 48h8v9h-8zM21 57h22v6H21zM17 63h30v6H17z"/><path class="trophy-detail" d="m32 16 1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z"/>`,
    rating: `<path class="trophy-metal" d="M32 8 52 17v15c0 13-8 21-20 27-12-6-20-14-20-27V17z"/><path class="trophy-engraving" d="m32 14 4.4 9 9.9 1.4-7.2 7 .0 10-7.1-4.8-7.1 4.8 1.4-9.8-7.2-7 9.9-1.4z"/><path class="trophy-stem" d="M26 57h12v5H26zM20 62h24v6H20z"/>`,
    star: `<path class="trophy-metal" d="m32 8 7 14h16l-12 11 4 17-15-9-15 9 4-17L9 22h16z"/><path class="trophy-engraving" d="m32 17 4.4 9 9.9 1.4-7.2 7 .0 10-7.1-4.8-7.1 4.8 1.4-9.8-7.2-7 9.9-1.4z"/><path class="trophy-stem" d="M28 50h8v9h-8zM21 59h22v6H21zM17 65h30v5H17z"/>`,
  }[variant];
  const count = award.count ?? 1;
  const years = seasonsLabel(award.seasons ?? []);
  const countBadge =
    count > 1 ? `<span class="trophy-count">×${count}</span>` : "";
  return `<article class="award-card trophy-card"><div class="trophy-art trophy-${variant}" role="img" aria-label="${awardName} trophy">
    <svg viewBox="0 0 64 72" aria-hidden="true">${trophyArtwork}</svg>${countBadge}
  </div><div class="eyebrow">${awardName} · ${esc(award.competition ?? "World football")} · ${seasonLabel(season)}</div>${award.winners.length ? `<h2>${winnerNames}</h2><p>${clubs}</p><span class="live-tag">${esc(value)}</span>${years && count > 1 ? `<small class="trophy-years">Won in ${esc(years)}</small>` : ""}` : "<h2>Not awarded</h2><p>No eligible players this season.</p>"}</article>`;
}

function renderTrophyCase() {
  // Trophies are grouped by award + competition, so five league titles are one card
  // showing "×5" and the years won rather than five identical cards.
  const honours = career.getCareerHonours?.() ?? career.player.honours ?? [];
  const groups = groupHonours(honours);
  const total = totalTrophies(honours);
  if (!groups.length) {
    return `<section class="panel trophy-case player-hub-section" id="player-trophies"><div class="panel-heading"><div><div class="eyebrow">CAREER HONOURS</div><h2>Trophy case</h2></div><span class="live-tag">0 TROPHIES</span></div><p class="muted">Season and international honours you earn will be kept here across every new season.</p></section>`;
  }
  return `<section class="panel trophy-case player-hub-section" id="player-trophies"><div class="panel-heading"><div><div class="eyebrow">CAREER HONOURS</div><h2>Trophy case</h2></div><span class="live-tag">${total} TROPH${total === 1 ? "Y" : "IES"} · ${groups.length} TYPE${groups.length === 1 ? "" : "S"}</span></div><div class="trophy-grid">${groups
    .map((group) => {
      const years = seasonsLabel(group.seasons);
      return renderAwardCard(
        {
          award: group.award,
          winners: [
            {
              player: `${career.player.first} ${career.player.last}`,
              playerId: career.player.id,
              club: group.competition,
            },
          ],
          competition: group.competition,
          value: `${group.count}× · ${years || "this season"}`,
          valueLabel: "",
          count: group.count,
          seasons: group.seasons,
        },
        group.latestSeason ?? group.seasons.at(-1),
      );
    })
    .join("")}</div></section>`;
}

/*
 * Where each position naturally sits on the pitch, expressed as a depth (0 = the
 * opposition goal, i.e. the top of the vertical pitch; 1 = our own goal, the bottom)
 * and a lateral lane (-1 = left touchline, 0 = centre, 1 = right touchline).
 *
 * Defining both axes per slot is what makes a shape read correctly: a CDM sits
 * deeper (larger depth) than the CMs ahead of him, a CAM floats between midfield
 * and attack, and wingers hold the widest lanes. Without this a flat, grid-based
 * layout stacks an entire line on one row and loses the shape.
 */
const SLOT_GEOMETRY = {
  GK: { depth: 0.96, lane: 0 },
  CB: { depth: 0.76, lane: -0.05 },
  LB: { depth: 0.74, lane: -1 },
  RB: { depth: 0.74, lane: 1 },
  CDM: { depth: 0.6, lane: 0 },
  DM: { depth: 0.6, lane: 0 },
  CM: { depth: 0.45, lane: 0 },
  CAM: { depth: 0.3, lane: 0 },
  AM: { depth: 0.3, lane: 0 },
  LW: { depth: 0.16, lane: -0.85 },
  RW: { depth: 0.16, lane: 0.85 },
  ST: { depth: 0.1, lane: 0 },
};

// Fall-back geometry for a slot the map does not know, grouped by role.
function slotGeometry(slot) {
  if (SLOT_GEOMETRY[slot]) return SLOT_GEOMETRY[slot];
  if (slot === "GK") return SLOT_GEOMETRY.GK;
  if (["CB", "LB", "RB"].includes(slot)) return SLOT_GEOMETRY.CB;
  if (["CDM", "DM", "CM"].includes(slot)) return SLOT_GEOMETRY.CM;
  if (["CAM", "AM"].includes(slot)) return SLOT_GEOMETRY.AM;
  if (["LW", "RW"].includes(slot)) return SLOT_GEOMETRY[slot];
  return SLOT_GEOMETRY.ST;
}

/**
 * Lay a formation line-up out on the vertical pitch. Attack is at the top (row 1)
 * and the keeper at the bottom (row 5), so a slot's row is derived from its depth
 * and its column from its lateral lane.
 *
 * Players sharing the same nominal slot (two centre-backs, two central midfielders,
 * a strike pair) are fanned out around their ideal lane so they never stack, and
 * players with genuinely different roles (a holding CDM behind two CMs, a CAM
 * between midfield and attack) keep their true depth instead of being flattened
 * onto one row.
 */
function pitchCoordinates(xi) {
  const rows = 5;
  const cols = 5;
  const coordOf = new Map();

  // Work out the lateral lane for every entry: start from the slot's ideal lane, then
  // spread duplicates of the same slot symmetrically around it within the same depth.
  const bySlot = new Map();
  for (const entry of xi) {
    const slot = entry.slot ?? "CM";
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot).push(entry);
  }
  const laneOf = new Map();
  for (const [slot, entries] of bySlot) {
    const base = slot === "CB" ? 0 : slotGeometry(slot).lane;
    const count = entries.length;
    // Duplicates of one slot (two CBs, two CMs, a strike pair) fan out symmetrically
    // around the slot's ideal lane. Keep the CMs clearly left/right of the holding
    // midfielder, while centre-backs stay central and full-backs hold the outside lanes.
    const span = Math.abs(base) > 0.5 ? 0.05 : 0.5;
    entries.forEach((entry, index) => {
      const t = count > 1 ? index / (count - 1) - 0.5 : 0; // -0.5 .. +0.5
      laneOf.set(entry, clampNumber(base + t * 2 * span, -1, 1));
    });
  }

  // Depth decides the row: depth 1 (our own goal) is the bottom row, depth 0 (the
  // opposition goal) the top row. Attack therefore reads at the top of the pitch.
  for (const entry of xi) {
    const depth = slotGeometry(entry.slot ?? "CM").depth;
    const row = clampNumber(1 + Math.round(depth * (rows - 1)), 1, rows);
    const lane = laneOf.get(entry) ?? 0;
    const column = clampNumber(
      Math.round(((lane + 1) / 2) * (cols - 1)) + 1,
      1,
      cols,
    );
    coordOf.set(entry, [row, column]);
  }

  // Never let two players share the exact same cell — nudge any clash one column over.
  const taken = new Set();
  for (const entry of xi) {
    let [row, column] = coordOf.get(entry) ?? [3, 3];
    while (taken.has(`${row}:${column}`)) {
      column = column >= cols ? column - 1 : column + 1;
      if (taken.has(`${row}:${column}`))
        column = clampNumber(column <= 3 ? column - 1 : column + 1, 1, cols);
    }
    taken.add(`${row}:${column}`);
    coordOf.set(entry, [row, column]);
  }

  // Return coordinates in the SAME order as the input XI so callers can zip them.
  return xi.map((entry) => coordOf.get(entry) ?? [3, 3]);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Render a formation as the vertical pitch, given a list of { slot, player } entries.
 * Shared by the squad screen and the live match simulation so both look identical.
 * `highlightIds` lets a caller mark specific players (e.g. the career player).
 */
function renderPitchMarkup(
  entries,
  {
    highlightIds = [],
    incidents = new Map(),
    interactive = false,
    shirtColor = clubCrestColors(career.club.name)[0],
    matchSide = null,
  } = {},
) {
  const coords = pitchCoordinates(entries);
  return entries
    .map(({ slot, player }, index) => {
      const [row, column] = coords[index];
      const highlight = highlightIds.includes(player.id);
      const incident = incidents.get(player.id);
      const incidentIcon = incident
        ? `<span class="pitch-incident" data-match-incident-player="${esc(player.id)}" title="${esc(incident.label)}" aria-label="${esc(incident.label)}">${incident.icon}</span>`
        : "";
      const actualSlot = String(slot).replace(/^ALT-/, "");
      const tag = "div";
      const interactionAttrs = interactive
        ? ` role="button" tabindex="0" data-lineup-starter="${esc(player.id)}" aria-label="Replace ${esc(player.first)} ${esc(player.last)} at ${esc(actualSlot)}"`
        : "";
      const baseOverall = Number.isFinite(player.overall)
        ? player.overall
        : calculateOverall(player);
      // Show the form-adjusted rating, so a player in form reads higher and one who is
      // struggling reads lower — never above his potential.
      const overall = career.displayOverall
        ? career.displayOverall(player)
        : baseOverall;
      const stamina = ensureStamina(player);
      const matchAttrs =
        matchSide == null
          ? ""
          : ` data-match-side="${esc(matchSide)}" data-match-slot-index="${entries[index].slotIndex}" data-match-player-id="${esc(player.id)}"`;
      return `<${tag} class="pitch-slot${highlight ? " is-user" : ""}${interactive ? " is-editable lineup-starter" : ""}"${interactionAttrs}${matchAttrs} style="grid-row:${row};grid-column:${column};--shirt-color:${esc(shirtColor)}" title="${esc(`${actualSlot} · shirt ${player.shirtNumber ?? "—"}`)}"><span class="pitch-badge">${player.shirtNumber ?? "—"}</span>${incidentIcon}<span class="pitch-name">${playerProfileLink(player, player.last, "pitch-player-link")}</span><span class="pitch-stamina" title="Stamina ${stamina}%"><span style="width:${stamina}%"></span></span><small class="pitch-meta">${esc(actualSlot)} · ${overall} OVR · ${stamina}% STM${highlight ? " · YOU" : ""}</small></${tag}>`;
    })
    .join("");
}

function renderSquad() {
  const day =
    career.calendar[
      Math.max(0, Math.min(career.week, career.calendar.length - 1))
    ].matchday;
  const lineup = selectLineup(
    career.players.filter((player) => player.clubId === career.club.id),
    career.club.formation,
    day,
    { customXI: career.club.customXI ?? [] },
  );
  const canEditLineup = career.isManagerCareer;
  const reserves = lineup.unused ?? [];
  const pitch = renderPitchMarkup(
    lineup.xi.map(({ slot, player }) => ({ slot, player })),
    {
      interactive: canEditLineup,
      shirtColor: clubCrestColors(career.club.name)[0],
    },
  );
  return `<div class="page-heading"><div><div class="eyebrow lime">CLUB SQUAD</div><h1>Formation & squad</h1><p>${esc(career.club.name)} · ${lineup.formation} · starting XI and substitutes</p></div><span class="live-tag">${lineup.xi.length} STARTERS · ${lineup.subs.length} SUBS</span></div>
    <section class="panel formation-panel"><div class="panel-heading"><div><div class="eyebrow">MATCH-DAY SHAPE</div><h2>${esc(lineup.formation)}</h2></div>${canEditLineup ? `<label class="formation-picker">TACTIC<select id="club-formation">${FORMATION_NAMES.map((formation) => `<option value="${formation}" ${formation === career.club.formation ? "selected" : ""}>${formation}</option>`).join("")}</select></label>` : '<span class="live-tag">MANAGER SELECTED</span>'}</div><p class="formation-note">${canEditLineup ? "This formation and starting XI will be used at your next kick-off." : "The manager selects the formation and starting XI. You can ask for more playing time from your Player Hub."}</p><p class="lineup-edit-hint">${canEditLineup ? "Tap a substitute, then tap a starter to swap. Dragging works too." : "Read-only team layout"}</p><div class="pitch"><div class="pitch-markings"></div><span class="pitch-arc"></span>${pitch}</div></section>
    <section class="panel bench-panel"><div class="panel-heading"><div><div class="eyebrow">MATCH-DAY BENCH</div><h2>Substitutes</h2></div><span class="live-tag">${lineup.subs.length} PLAYERS</span></div><div class="bench-list">${lineup.subs.map((player) => `<div class="bench-player lineup-bench-player${selectedLineupPlayerId === player.id ? " is-selected" : ""}" data-player-id="${esc(player.id)}" ${canEditLineup ? 'draggable="true"' : ""}><span>${player.shirtNumber}</span><b>${playerProfileLink(player)}</b><small>${esc(player.position)} · ${career.displayOverall(player)} OVR${career.injuryStatus(player).injured ? " · INJURED" : ""}    </small>${staminaMarkup(player, true)}${canEditLineup ? `<button type="button" class="button-quiet bench-select-button" data-lineup-bench="${esc(player.id)}">Select</button>` : ""}</div>`).join("") || '<p class="muted">No substitutes are available.</p>'}</div></section><section class="panel bench-panel"><div class="panel-heading"><div><div class="eyebrow">RESERVE SQUAD</div><h2>Rotation opportunities</h2></div><span class="live-tag">${reserves.length} PLAYERS</span></div><div class="bench-list">${reserves.map((player) => `<div class="bench-player"><span>${player.shirtNumber ?? "—"}</span><b>${playerProfileLink(player)}</b>    <small>${esc(player.position)} · ${career.displayOverall(player)} OVR · form ${Math.round(player.form ?? 50)} · fitness ${Math.round(player.fitness ?? 100)}%</small>${staminaMarkup(player, true)}</div>`).join("") || '<p class="muted">No reserve players are currently registered.</p>'}</div></section>`;
}

function swapLineupSelection(outgoingId) {
  try {
    const result = career.changeLineup(outgoingId, selectedLineupPlayerId);
    selectedLineupPlayerId = null;
    notice = `${result.incoming} replaces ${result.outgoing} at ${result.slot}. Your XI is saved for the next match.`;
  } catch (error) {
    selectedLineupPlayerId = null;
    notice = `Could not change the lineup: ${error.message}`;
  }
  renderGame();
}

/**
 * The World Cup scorer board: who has scored the most goals in this edition's season.
 * Ranked on goals first, then assists, then average rating, so it reads like a real
 * tournament Golden Boot race rather than an alphabetical list.
 */

function renderFixtures() {
  const allFixtures = career.getFixtureList();
  const fixtures = allFixtures.filter((fixture) => {
    if (fixtureFilter === "home") return fixture.userIsHome;
    if (fixtureFilter === "away") return !fixture.userIsHome;
    if (fixtureFilter === "league") return fixture.competitionId === career.league.id;
    if (fixtureFilter === "champions") return fixture.competitionId === "champions-league";
    if (fixtureFilter === "world-cup") return fixture.competitionId === "fifa-world-cup";
    return true;
  });
  const totals = new Map();
  for (const fixture of fixtures)
    totals.set(fixture.competition, (totals.get(fixture.competition) ?? 0) + 1);
  const numbers = new Map();
  return `<div class="page-heading"><div><div class="eyebrow lime">YOUR SEASON</div><h1>Fixtures</h1><p>League and tournament matches, with competition, match number, and scheduled date. Open a played match to review its game stats.</p></div><div class="fixture-heading-actions"><label class="slot-select">FILTER <select id="fixture-filter"><option value="all" ${fixtureFilter === "all" ? "selected" : ""}>All competitions</option><option value="league" ${fixtureFilter === "league" ? "selected" : ""}>${esc(career.league.name)}</option><option value="champions" ${fixtureFilter === "champions" ? "selected" : ""}>Champions League</option><option value="world-cup" ${fixtureFilter === "world-cup" ? "selected" : ""}>FIFA World Cup</option><option value="home" ${fixtureFilter === "home" ? "selected" : ""}>Home matches</option><option value="away" ${fixtureFilter === "away" ? "selected" : ""}>Away matches</option></select></label><span class="live-tag">${fixtures.length} MATCHES SHOWN</span><button class="button-primary" data-action="simulate-day" ${career.seasonComplete ? "disabled" : ""}>Simulate one day <span>→</span></button></div></div>
    <section class="panel fixture-list">${fixtures
      .map((fixture) => {
        const number = (numbers.get(fixture.competition) ?? 0) + 1;
        numbers.set(fixture.competition, number);
        const label =
          fixture.roundLabel ??
          `Match ${number}/${totals.get(fixture.competition)}`;
        const status = fixture.played ? "Completed" : fixture.next ? "Live" : "Upcoming";
        const activeWorldCupMatch =
          fixture.competitionId === "fifa-world-cup" &&
          career.lastReport?.userMatch?.worldCupFixtureId === fixture.id &&
          career.matchSimulation?.status !== "finished";
        return `<div class="fixture-entry"><div class="fixture-row ${fixture.played ? "played" : ""}${fixture.next ? " next" : ""}"><span class="fixture-round">${String(number).padStart(2, "0")}</span><span class="fixture-date">${formatDate(fixture.date)}</span><span class="fixture-team home-name">${renderClubCrest(fixture.home, fixture.homeShortName, "fixture-crest")}${esc(fixture.home)}</span><span class="fixture-score">${fixture.result ?? "— : —"}</span><span class="fixture-team">${renderClubCrest(fixture.away, fixture.awayShortName, "fixture-crest")}${esc(fixture.away)}</span><span class="home-away">${fixture.next ? '<span class="next-tag">UP NEXT</span> ' : ""}${esc(status)} · ${esc(fixture.competition)} · ${esc(label)}${activeWorldCupMatch ? '<button class="fixture-stats-toggle" type="button" data-screen="simulation">Open Match Sim</button>' : ""}${fixture.played ? `<button class="fixture-stats-toggle" type="button" data-action="toggle-fixture-stats" data-fixture-id="${esc(fixture.id)}" aria-expanded="${expandedFixtureStatsId === fixture.id}">${expandedFixtureStatsId === fixture.id ? "Hide stats" : "Game stats"}</button>` : ""}</span></div>${expandedFixtureStatsId === fixture.id && fixture.played ? renderFixtureStats(fixture) : ""}</div>`;
      })
      .join("")}</section>`;
}

function renderFixtureStats(fixture) {
  if (!fixture.stats) {
    return '<div class="fixture-stats-panel"><p>Game stats are unavailable for this match.</p></div>';
  }
  const statRows = [
    ["Goals", (stats) => stats.goals],
    ["Expected goals", (stats) => formatDecimal(stats.xg)],
    ["Possession", (stats) => `${stats.possession}%`],
    ["Shots", (stats) => stats.shots],
    ["Shots on target", (stats) => stats.shotsOnTarget],
    ["Saves", (stats) => stats.saves],
    ["Fouls", (stats) => stats.fouls],
    ["Yellow cards", (stats) => stats.yellowCards],
    ["Red cards", (stats) => stats.redCards],
    ["Offsides", (stats) => stats.offsides],
  ];
  return `<div class="fixture-stats-panel"><h3>Game stats</h3><table><thead><tr><th>${esc(fixture.home)}</th><th>STAT</th><th>${esc(fixture.away)}</th></tr></thead><tbody>${statRows.map(([label, value]) => `<tr><td>${value(fixture.stats.home)}</td><th>${label}</th><td>${value(fixture.stats.away)}</td></tr>`).join("")}</tbody></table></div>`;
}

/**
 * The History screen: every past season's champions and award winners, drawn from the
 * career's season history, competition honours and award history.
 */
function renderHistory() {
  const seasons = career.seasonHistory ?? [];
  const awards = career.seasonAwardHistory ?? [];
  const honourRows = [];
  for (const season of seasons) {
    if (season.trophyWinners?.length) {
      for (const trophy of season.trophyWinners) {
        honourRows.push({
          season: season.season,
          competition: trophy.competition,
          award: "Champion",
          winners: trophy.winner,
        });
      }
    } else {
      const champion = season.standings?.[0];
      if (champion) {
        const winner =
          career.clubs.find((club) => club.id === champion.teamId)?.name ??
          career.data?.league?.clubIdentities?.[champion.teamId]?.name ??
          champion.teamId;
        honourRows.push({
          season: season.season,
          competition: career.league.name,
          award: "Champion",
          winners: winner,
        });
      }
      for (const award of season.competitionAwards ?? []) {
        honourRows.push({
          season: season.season,
          competition: award.competition,
          award: award.award,
          winnerDetails: award.winners,
        });
      }
    }
  }
  const awardRows = awards.flatMap((entry) =>
    (entry.awards ?? [])
      .filter(
        (award) =>
          award.award !== "Ballon d'Or" ||
          career.ballonDorCeremonies?.some(
            (ceremony) => ceremony.awardPeriod === entry.season,
          ),
      )
      .map((award) => ({
      season: entry.season,
      competition:
        award.competition ??
        (award.award === "Ballon d'Or" ? "World football" : career.league.name),
      award: award.award,
      winnerDetails: award.winners,
      })),
  );
  const rows = [...honourRows, ...awardRows].sort(
    (a, b) => b.season - a.season,
  );
  return `<div class="page-heading"><div><div class="eyebrow lime">CAREER ARCHIVE</div><h1>History</h1><p>Every past season's champions and award winners at a glance.</p></div><span class="live-tag">${seasons.length} SEASONS RECORDED</span></div>
    <section class="panel table-panel scorer-panel"><table class="history-table"><thead><tr><th>SEASON</th><th>TROPHY / COMPETITION</th><th>HONOUR</th><th>WINNING TEAM / PLAYER</th></tr></thead><tbody>${
      rows.length
        ? rows
            .map(
              (row) =>
                `<tr><td class="history-season">${seasonLabel(row.season)}</td><td>${esc(row.competition)}</td><td>${esc(row.award)}</td><td class="history-winner">${row.winnerDetails ? row.winnerDetails.map((winner) => `${winner.coach ? esc(winner.coach) : playerProfileLink(winner.playerId, winner.player)} (${esc(winner.club)})`).join(", ") : esc(row.winners)}</td></tr>`,
            )
            .join("")
        : '<tr><td class="scorer-empty" colspan="4">Complete a season to record its champions and award winners here.</td></tr>'
    }</tbody></table></section>`;
}

function renderTeam() {
  const configuredIdentity = Object.values(career.baseData?.clubs ?? {})
    .map((group) => group?.[career.club.id])
    .find(Boolean);
  const club = configuredIdentity
    ? {
        ...career.club,
        stadium: configuredIdentity.stadium ?? career.club.stadium,
        founded: configuredIdentity.founded ?? career.club.founded,
        city: configuredIdentity.city ?? career.club.city,
        capacity:
          Number(career.club.capacity) > Number(configuredIdentity.capacity)
            ? career.club.capacity
            : (configuredIdentity.capacity ?? career.club.capacity),
      }
    : career.club;
  const manager = club.hierarchy?.manager ?? club.manager;
  const squad = career.players.filter((player) => player.clubId === club.id);
  const teamRatings = calculateTeamRatings(club, squad, career.currentDay?.() ?? 0);
  const displayTeamRating = (rating) => Math.round(rating);
  const seasonHistory = career.seasonHistory ?? [];
  const clubHonours = [
    ...(club.honours ?? [])
      .filter((honour) => honour?.award || honour?.competition)
      .map((honour) => ({
        award: honour.award ?? "Champion",
        competition: honour.competition ?? honour.competitionId ?? "Club honour",
        season: honour.season,
        value: honour.value,
      })),
    ...seasonHistory.flatMap((season) =>
      (season.trophyWinners ?? [])
        .filter((trophy) => trophy.winnerId === club.id || trophy.winner === club.name)
        .map((trophy) => ({
          award: "Champion",
          competition: trophy.competition,
          season: season.season,
          value: trophy.finalScore ? `Final ${trophy.finalScore}` : "Winner",
        })),
    ),
  ];
  const trophies = groupHonours(clubHonours);
  const clubSeasons = (club.seasonHistory?.length
    ? club.seasonHistory.map((standing) => ({
        season: standing.season,
        standing: {
          ...standing,
          position: standing.position,
        },
      }))
    : seasonHistory
    .map((season) => {
      const position = season.standings?.findIndex((row) => row.teamId === club.id);
      const standing = position >= 0 ? season.standings[position] : null;
      return standing ? { season: season.season, standing: { ...standing, position: position + 1 } } : null;
    })
    .filter(Boolean))
    .reverse();
  const currentStanding = career.league.table.row(club.id);
  if (
    currentStanding &&
    !clubSeasons.some(({ season }) => season === career.season)
  ) {
    clubSeasons.unshift({
      season: career.season,
      standing: {
        ...currentStanding,
        position: career.league.table.positions().get(club.id),
      },
    });
  }
  const latestTrophy = clubHonours
    .slice()
    .map((honour, index) => ({ honour, index }))
    .sort(
      (left, right) =>
        Number(right.honour.season ?? 0) - Number(left.honour.season ?? 0) ||
        right.index - left.index,
    )[0]?.honour;
  const clubFinance = career.financialSummary(career.club);
  const totalRevenue = Object.values(clubFinance.revenue).reduce(
    (sum, value) => sum + Number(value ?? 0),
    0,
  );
  const totalExpenses = Object.values(clubFinance.expenses).reduce(
    (sum, value) => sum + Number(value ?? 0),
    0,
  );
  const netResult = totalRevenue - totalExpenses;
  const archivedResults = [
    ...(club.matchHistory ?? []),
    ...(career.results ?? []),
  ];
  const recentResults = archivedResults
    .filter(
      (result) =>
        !result.pending &&
        (result.homeClubId === club.id ||
          result.awayClubId === club.id ||
          result.home?.clubId === club.id ||
          result.away?.clubId === club.id ||
          result.homeTeamId === club.id ||
          result.awayTeamId === club.id ||
          result.home === club.name ||
          result.away === club.name),
    )
    .filter(
      (result, index, results) =>
        results.findIndex(
          (entry) =>
            entry.season === result.season &&
            (entry.id ?? `${entry.home}:${entry.away}:${entry.matchday}`) ===
              (result.id ?? `${result.home}:${result.away}:${result.matchday}`),
        ) === index,
    )
    .slice(-5)
    .reverse();
  const resultRows = recentResults
    .map((result) => {
      const home = result.home?.name ?? result.home?.clubName ?? result.homeName ?? result.home ?? "Home";
      const away = result.away?.name ?? result.away?.clubName ?? result.awayName ?? result.away ?? "Away";
      const score = `${result.homeGoals ?? "\u2014"}\u2013${result.awayGoals ?? "\u2014"}`;
      const dateIndex = Number(
        result.dateIndex ?? result.date ?? result.matchday ?? result.week,
      );
      const date = Number.isFinite(dateIndex) ? formatDate(dateIndex) : "—";
      return `<tr><td>${esc(result.competition ?? career.league.name)}</td><td>${esc(home)} ${score} ${esc(away)}</td><td>${date}</td></tr>`;
    })
    .join("");
  return `<div class="page-heading"><div><div class="eyebrow lime">CLUB ARCHIVE</div><h1>${esc(club.name)}</h1><p>Club identity, trophy cabinet, and competitive history.</p></div><div class="top-actions"><button class="button-quiet" data-screen="world">Browse every team</button><span class="live-tag">${squad.length} REGISTERED PLAYERS</span></div></div>
    <section class="panel team-rating-panel"><div class="panel-heading"><div><div class="eyebrow">DYNAMIC TEAM RATINGS</div><h2>${esc(teamRatings.formation)} match profile</h2></div><span class="live-tag">1–99</span></div><div class="stat-grid"><article class="stat-card"><div class="card-label">OVERALL</div><div class="big-number">${displayTeamRating(teamRatings.overall)}</div><div class="muted">Attack ${displayTeamRating(teamRatings.attack)} · Midfield ${displayTeamRating(teamRatings.midfield)} · Defence ${displayTeamRating(teamRatings.defence)}</div></article><article class="stat-card"><div class="card-label">SQUAD OVERALL</div><div class="big-number">${displayTeamRating(teamRatings.squadOverall)}</div><div class="muted">All registered players</div></article><article class="stat-card"><div class="card-label">STARTING XI</div><div class="big-number">${displayTeamRating(teamRatings.startingXIOverall)}</div><div class="muted">Best XI before availability</div></article><article class="stat-card"><div class="card-label">MATCHDAY</div><div class="big-number">${displayTeamRating(teamRatings.matchdayOverall)}</div><div class="muted">${teamRatings.matchdayXI.length} available starters</div></article></div></section>
    <div class="stat-grid"><article class="stat-card"><div class="card-label">HOME</div><div class="big-number">${esc(club.stadium || "Stadium not set")}</div><div class="muted">${esc(club.city || "City unknown")} · ${esc(club.nation || "Nation unknown")}</div></article><article class="stat-card"><div class="card-label">CLUB PROFILE</div><div class="big-number">${club.founded ?? "—"}</div><div class="muted">Founded · ${club.capacity ? `${Number(club.capacity).toLocaleString()} capacity` : "capacity unknown"}</div></article><article class="stat-card"><div class="card-label">LATEST TROPHY</div><div class="big-number">${esc(latestTrophy?.competition ?? "None yet")}</div><div class="muted">${latestTrophy ? `Won ${seasonLabel(latestTrophy.season)}` : "Play and win a competition to update the cabinet"}</div></article><article class="stat-card"><div class="card-label">TEAM BALANCE / RESULT</div><div class="big-number">€${formatDecimal(clubFinance.balance)}</div><div class="muted ${netResult >= 0 ? "positive" : "negative"}">${netResult >= 0 ? "Profit" : "Net loss"} €${formatDecimal(Math.abs(netResult))} this season</div></article></div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">SPORTING DEPARTMENT</div><h2>Current team</h2></div></div><div class="profile-details"><div><small>HEAD COACH</small><b>${esc(manager?.name ?? "No manager")}</b></div><div><small>FORMATION</small><b>${esc(club.formation ?? "—")}</b></div><div><small>LEAGUE</small><b>${esc(career.league.name)}</b></div><div><small>SQUAD SIZE</small><b>${squad.length} players</b></div></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">TROPHY CABINET</div><h2>${totalTrophies(clubHonours)} trophies</h2></div></div>${trophies.length ? `<div class="dashboard-list">${trophies.map((trophy) => `<div class="dashboard-list-row"><b>${esc(trophy.award)}</b><span>${esc(trophy.competition)} · ${trophy.count}×</span><small>${esc(seasonsLabel(trophy.seasons) || "Season not recorded")}</small></div>`).join("")}</div>` : '<p class="muted">No club trophies have been recorded yet. Complete a season to update the cabinet.</p>'}</section></div>
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">SEASON RECORD</div><h2>League history</h2></div></div><table class="history-table"><thead><tr><th>SEASON</th><th>POSITION</th><th>PLAYED</th><th>POINTS</th><th>RECORD</th></tr></thead><tbody>${clubSeasons.length ? clubSeasons.map(({ season, standing }) => `<tr><td>${seasonLabel(season)}</td><td>${standing.position ?? "—"}</td><td>${standing.played ?? standing.playedMatches ?? "—"}</td><td>${standing.points ?? "—"}</td><td>${standing.won ?? 0}W · ${standing.drawn ?? 0}D · ${standing.lost ?? 0}L</td></tr>`).join("") : '<tr><td colspan="5">Complete a season to build the club history.</td></tr>'}</tbody></table></section>
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">MATCH ARCHIVE</div><h2>Recent results</h2></div></div><table class="history-table"><thead><tr><th>COMPETITION</th><th>FIXTURE</th><th>DATE</th></tr></thead><tbody>${resultRows || '<tr><td colspan="3">No completed club results recorded yet.</td></tr>'}</tbody></table></section>`;
}

function renderFinances() {
  const clubFinance = career.financialSummary(career.club);
  const wage = career.player.contract?.wage ?? 0;
  const money = (value) => `€${formatDecimal(value ?? 0)}`;
  const ledger = clubFinance.ledger.length
    ? clubFinance.ledger
        .map(
          (entry) =>
            `<tr><td>${entry.date ?? "—"}</td><td>${esc(entry.category)}</td><td>${esc(entry.description)}</td><td class="positive">${entry.income ? money(entry.income) : "—"}</td><td class="negative">${entry.expense ? money(entry.expense) : "—"}</td><td>${money(entry.balance)}</td></tr>`,
        )
        .join("")
    : '<tr><td colspan="6" class="scorer-empty">Financial activity will appear after the first simulated week.</td></tr>';
  return `<div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">CLUB BALANCE</div><div class="big-number">${money(clubFinance.balance)}</div><div class="muted">Cash after recorded income and expenses</div></article><article class="stat-card"><div class="card-label">TRANSFER BUDGET</div><div class="big-number">${money(clubFinance.transferBudget)}</div><div class="muted">Board-controlled transfer allocation</div></article><article class="stat-card"><div class="card-label">WAGE BUDGET</div><div class="big-number">${money(clubFinance.remainingWageBudget)}</div><div class="muted">${money(clubFinance.wageCommitment)} committed weekly</div></article><article class="stat-card"><div class="card-label">PROJECTED BALANCE</div><div class="big-number">${money(clubFinance.projectedBalance)}</div><div class="muted">Annualised operating projection</div></article></div><section class="panel table-panel finance-ledger-panel"><div class="panel-heading"><div><div class="eyebrow">CLUB FINANCE · ${esc(career.club.name)}</div><h2>Transaction ledger</h2></div><span class="live-tag">${money(clubFinance.netTransferSpend)} NET TRANSFERS</span></div><table class="history-table"><thead><tr><th>DATE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>INCOME</th><th>EXPENSE</th><th>BALANCE</th></tr></thead><tbody>${ledger}</tbody></table></section><section class="panel finance-personal-panel"><div class="panel-heading"><div><div class="eyebrow">PLAYER CONTRACT</div><h2>Personal earnings</h2></div></div><div class="profile-details"><div><small>WEEKLY WAGE</small><b>${money(wage)}</b></div><div><small>CAREER BALANCE</small><b>${money(career.money)}</b></div><div><small>APPEARANCE BONUS</small><b>${money(data.careerSettings.finance.appearanceBonus)}</b></div><div><small>GOAL BONUS</small><b>${money(data.careerSettings.finance.goalBonus)}</b></div></div></section>`;
}

function renderInvestments() {
  if (!career.isManagerCareer) return '<section class="panel"><div class="eyebrow lime">CLUB FACILITIES</div><h1>Investment management</h1><p class="muted">Facility investment, club budgets and spending are restricted to manager-career mode. Training facility levels and their development effects remain visible in Training & Development.</p></section>';
  const finance = career.financialSummary(career.club);
  const options = career.investmentOptions();
  const investment = career.club.investment;
  const money = (value) => `€${formatDecimal(value ?? 0)}`;
  const projects = options
    .map(
      (option) =>
        `<article class="panel investment-card"><div class="panel-heading"><div><div class="eyebrow">${esc(option.category.toUpperCase())}</div><h2>${esc(option.label)}</h2></div><span class="live-tag">LEVEL ${option.level}</span></div><p class="muted">Next level ${option.nextLevel} · ${option.completionWeeks} weeks · maintenance ${money(option.maintenance)}/week.</p><div class="profile-details"><div><small>PROJECT COST</small><b>${option.cost ? money(option.cost) : "MAX LEVEL"}</b></div><div><small>FINANCIAL EFFECT</small><b>${option.benefit === "stadium" ? "Capacity +12% on completion" : option.benefit === "training" ? "Training effectiveness" : option.benefit === "commercial" ? "Commercial reputation" : `${option.benefit} development`}</b></div></div>${option.available ? `<button class="button-primary" data-action="start-investment" data-project-id="${esc(option.id)}">Approve project</button>` : '<span class="live-tag">UNAVAILABLE</span>'}</article>`,
    )
    .join("");
  const active =
    investment.activeProjects
      ?.map(
        (project) =>
          `<tr><td>${esc(options.find((item) => item.id === project.projectId)?.label ?? project.projectId)}</td><td>Level ${project.level}</td><td>${project.started}</td><td>${project.completes}</td><td>${money(project.cost)}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="5">No active construction projects.</td></tr>';
  return `<div class="page-heading"><div><div class="eyebrow lime">CLUB DEVELOPMENT</div><h1>Investments</h1><p>Choose between immediate squad spending and long-term infrastructure.</p></div><span class="live-tag">MANAGER AUTHORITY</span></div><div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">CLUB BALANCE</div><div class="big-number">${money(finance.balance)}</div></article><article class="stat-card"><div class="card-label">INVESTMENT BUDGET</div><div class="big-number">${money(finance.investmentBudget)}</div><div class="muted">Reserved from club cash</div></article><article class="stat-card"><div class="card-label">STADIUM CAPACITY</div><div class="big-number">${career.club.capacity.toLocaleString()}</div><div class="muted">Expansion completes over time</div></article></div><div class="dashboard-grid">${projects}</div><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">CONSTRUCTION PIPELINE</div><h2>Active projects</h2></div></div><table class="history-table"><thead><tr><th>PROJECT</th><th>LEVEL</th><th>STARTED</th><th>COMPLETES</th><th>COST</th></tr></thead><tbody>${active}</tbody></table></section>`;
}

function renderScouting() {
  if (!career.isManagerCareer) return '<section class="panel"><div class="eyebrow lime">SCOUTING</div><h1>Scouting management</h1><p class="muted">Scouting assignments, budgets and recruitment are club management features available only in manager-career mode.</p></section>';
  const state = career.club.scouting ?? {};
  const summary = career.scoutingSummary();
  const scouts = career.scoutingScouts();
  const money = (value) => `€${formatDecimal(value ?? 0)}`;
  const scoutCards = scouts.employed.length
    ? scouts.employed
        .map(
          (scout) =>
            `<article class="panel"><div class="panel-heading"><div><div class="eyebrow">SCOUT · ${scout.ability}/5 ABILITY</div><h2>${esc(scout.name)}</h2></div><span class="live-tag">${scout.assignmentId ? "ON ASSIGNMENT" : "AVAILABLE"}</span></div><p class="muted">${esc(scout.nationality)} · ${scout.age} years · ${scout.youth}/5 youth expertise · ${money(scout.wage)}/week</p>${!scout.assignmentId ? `<button class="button-primary" data-action="create-scout-assignment" data-scout-id="${esc(scout.id)}" data-type="first-team">Scout first-team targets</button> <button class="button-quiet" data-action="create-scout-assignment" data-scout-id="${esc(scout.id)}" data-type="youth">Scout youth network</button>` : ""}</article>`,
        )
        .join("")
    : '<section class="panel"><p class="muted">No scouts employed. Recruit one below.</p></section>';
  const available =
    scouts.available
      .slice(0, 4)
      .map(
        (scout) =>
          `<tr><td>${esc(scout.name)}</td><td>${scout.ability}/5</td><td>${scout.potential}/5</td><td>${money(scout.recruitmentCost)}</td><td><button class="button-quiet" data-action="recruit-scout" data-scout-id="${esc(scout.id)}">Recruit</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="5">No scouts are currently on the market.</td></tr>';
  const reports =
    (state.reports ?? [])
      .map(
        (report) =>
          `<tr><td>${esc(report.playerName)}</td><td>${esc(report.position)}</td><td>${report.estimatedOverall.min}–${report.estimatedOverall.max}</td><td>${report.potentialRange.min}–${report.potentialRange.max}</td><td>${report.confidence}%</td><td><button class="button-quiet" data-action="shortlist-scouting-player" data-player-id="${esc(report.playerId)}">Shortlist</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="6">Complete an assignment to receive reports.</td></tr>';
  const prospects =
    (state.youthProspects ?? [])
      .filter((prospect) => prospect.status === "available")
      .map(
        (prospect) =>
          `<tr><td>${esc(`${prospect.first} ${prospect.last}`)}</td><td>${esc(prospect.nationality)}</td><td>${esc(prospect.position)}</td><td>${prospect.overall}</td><td>${prospect.potentialRange.min}–${prospect.potentialRange.max}</td><td>${prospect.confidence}%</td><td>${prospect.age >= 16 ? `<button class="button-quiet" data-action="sign-youth-prospect" data-prospect-id="${esc(prospect.id)}">Accept into academy</button>` : "Not eligible"}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="7">No youth prospects are currently available.</td></tr>';
  return `<div class="page-heading"><div><div class="eyebrow lime">RECRUITMENT DEPARTMENT</div><h1>Scouting Hub</h1><p>Build knowledge before committing transfer or academy money.</p></div><span class="live-tag">MANAGER AUTHORITY</span></div><div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">SCOUTING BUDGET</div><div class="big-number">${money(summary.budget)}</div><div class="muted">${money(summary.spent)} spent · wages are charged weekly</div></article><article class="stat-card"><div class="card-label">ACTIVE ASSIGNMENTS</div><div class="big-number">${summary.activeAssignments}</div><div class="muted">${summary.reports} reports retained</div></article><article class="stat-card"><div class="card-label">YOUTH PROSPECTS</div><div class="big-number">${summary.prospects}</div><div class="muted">Generated from completed assignments</div></article></div><div class="dashboard-grid">${scoutCards}</div><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">SCOUT RECRUITMENT</div><h2>Available scouts</h2></div></div><table class="history-table"><thead><tr><th>SCOUT</th><th>ABILITY</th><th>POTENTIAL</th><th>FEE</th><th></th></tr></thead><tbody>${available}</tbody></table></section><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">FIRST-TEAM SCOUTING</div><h2>Scouting reports</h2></div></div><table class="history-table"><thead><tr><th>PLAYER</th><th>POS</th><th>OVR EST.</th><th>POTENTIAL</th><th>CONFIDENCE</th><th></th></tr></thead><tbody>${reports}</tbody></table></section><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">YOUTH NETWORK</div><h2>Academy prospects</h2></div></div><table class="history-table"><thead><tr><th>PLAYER</th><th>NATION</th><th>POS</th><th>OVR</th><th>POTENTIAL EST.</th><th>CONFIDENCE</th><th></th></tr></thead><tbody>${prospects}</tbody></table></section>`;
}

function renderClubOffice() {
  return `<div class="page-heading"><div><div class="eyebrow lime">CLUB MANAGEMENT</div><h1>Club office</h1><p>Keep related management systems together instead of overcrowding the main career navigation.</p></div><span class="live-tag">MANAGER TOOLS</span></div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">TACTICS</div><h2>Coaching dashboard</h2></div></div><p class="muted">Review the manager identity, tactical settings, formation logic, and starting XI.</p><button class="button-primary" data-screen="coaching">Open coaching</button></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">DEVELOPMENT</div><h2>Youth academy</h2></div></div><p class="muted">Manage accepted prospects, development plans, promotion decisions, and academy progress.</p><button class="button-primary" data-screen="academy">Open academy</button></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">RECRUITMENT</div><h2>Scouting network</h2></div></div><p class="muted">Assign scouts, review reports, and discover players before entering negotiations.</p><button class="button-quiet" data-screen="scouting">Open scouting</button></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">INFRASTRUCTURE</div><h2>Investments</h2></div></div><p class="muted">Upgrade facilities and stadium infrastructure through the club's investment budget.</p><button class="button-quiet" data-screen="investments">Open investments</button></section></div>`;
}

function renderCoaching() {
  if (!career.isManagerCareer) return `<section class="panel"><div class="eyebrow lime">CLUB COACHING</div><h1>${esc(career.club.manager?.name ?? "Club coach")}</h1><p class="muted">You can review the coaching staff and training specialists, but tactical control, staff appointments, and club spending are reserved for manager-career mode.</p>${renderTraining()}</section>`;
  const manager = career.club.hierarchy?.manager ?? career.club.manager;
  const squad = career.players.filter(
    (player) => player.clubId === career.club.id,
  );
  const lineup = selectLineup(squad, career.club.formation, currentDay(), {
    customXI: career.club.customXI ?? [],
  });
  const roles =
    manager.playstyle === "Wing Play"
      ? "Attacking fullbacks · stay-wide wingers"
      : manager.playstyle === "High Press" ||
          manager.playstyle === "Gegenpressing"
        ? "Aggressive press · box-to-box midfield"
        : "Balanced roles · positional coverage";
  return `<div class="page-heading"><div><div class="eyebrow lime">COACHING DEPARTMENT</div><h1>Coaching dashboard</h1><p>Every tactical choice is evaluated against the current squad and the coach's identity.</p></div><span class="live-tag">${esc(manager.playstyle ?? manager.style ?? "Balanced")}</span></div><div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">HEAD COACH</div><div class="big-number">${esc(manager.name)}</div><div class="muted">Rating ${manager.rating} · tactical knowledge ${manager.tacticalKnowledge ?? manager.rating}</div></article><article class="stat-card"><div class="card-label">CURRENT SHAPE</div><div class="big-number">${esc(career.club.formation)}</div><div class="muted">Preferred ${esc(manager.preferredFormation ?? career.club.formation)}</div></article><article class="stat-card"><div class="card-label">TACTICAL ROLES</div><div class="big-number">${esc(roles)}</div><div class="muted">Adaptability ${manager.flexibility ?? manager.rating}/99</div></article></div><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">STARTING XI</div><h2>Coach selection</h2></div><span class="live-tag">${lineup.xi.length}/11 SELECTED</span></div><table class="history-table"><thead><tr><th>PLAYER</th><th>SLOT</th><th>OVR</th>  <th>STAMINA</th><th>REASON</th></tr></thead><tbody>${lineup.xi.map(({ player, slot }) => `<tr><td>${esc(`${player.first} ${player.last}`)}</td><td>${esc(slot)}</td><td>${career.displayOverall(player)}</td>  <td>${ensureStamina(player)}%${staminaMarkup(player, true)}</td><td>Position suitability, coach style compatibility, form and availability</td></tr>`).join("")}</tbody></table></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">TACTICAL SETTINGS</div><h2>Match approach</h2></div></div><div class="profile-details"><div><small>PRESSING</small><b>${esc(manager.tacticalSettings?.pressing ?? "Balanced")}</b></div><div><small>DEFENSIVE LINE</small><b>${esc(manager.tacticalSettings?.defensiveLine ?? "Balanced")}</b></div><div><small>BUILD-UP</small><b>${esc(manager.tacticalSettings?.buildUp ?? "Balanced")}</b></div><div><small>YOUTH DEVELOPMENT</small><b>${manager.youthAbility ?? manager.rating}/99</b></div></div></section>`;
}

function renderCoachDatabase() {
  const coaches = career.clubs.map((club) => {
    const manager = ensureCoachProfile(club);
    return { club, manager };
  }).filter(({ club }) =>
    club.hierarchy?.employment?.status !== "dismissed"
  );
  const filtered = coaches
    .filter(({ manager }) => {
      if (coachFilter.startsWith("rank-"))
        return manager.rank === coachFilter.slice(5);
      return true;
    })
    .sort((left, right) => {
      if (coachFilter === "potential")
        return right.manager.potential - left.manager.potential;
      if (coachFilter === "salary")
        return left.manager.salary - right.manager.salary;
      if (coachFilter === "experience")
        return right.manager.yearsExperience - left.manager.yearsExperience;
      return right.manager.overall - left.manager.overall;
    });
  const rows = filtered
    .map(
      ({ club, manager }) =>
        `<tr><td><button class="link-button" data-action="coach-profile" data-coach-id="${esc(manager.id)}">${esc(manager.name)}</button></td><td>${esc(club.name)}</td><td><b class="status-pill">${esc(manager.rank)}</b></td><td>${manager.overall}</td><td>${manager.potential}</td><td>${Math.round(manager.age ?? 40)}</td><td>€${Math.round(manager.salary).toLocaleString("en-GB")} / wk</td><td>${manager.yearsExperience.toFixed(1)} yrs</td></tr>`,
    )
    .join("");
  return `<div class="page-heading"><div><div class="eyebrow lime">FOOTBALL WORLD</div><h1>Coach database</h1><p>Every head coach is rated, developed, and connected to the club's tactical and player-development decisions.</p></div><span class="live-tag">${coaches.length} COACHES</span></div><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">GLOBAL LEADERBOARD</div><h2>Coaches from best to worst</h2></div><label>FILTER<select id="coach-filter"><option value="overall" ${coachFilter === "overall" ? "selected" : ""}>Highest overall</option><option value="potential" ${coachFilter === "potential" ? "selected" : ""}>Highest potential</option><option value="salary" ${coachFilter === "salary" ? "selected" : ""}>Cheapest</option><option value="experience" ${coachFilter === "experience" ? "selected" : ""}>Most experienced</option>${["F", "E", "D", "C", "B", "A", "S"].map((rank) => `<option value="rank-${rank}" ${coachFilter === `rank-${rank}` ? "selected" : ""}>${rank} rank</option>`).join("")}</select></label></div><table class="history-table"><thead><tr><th>COACH</th><th>CLUB</th><th>RANK</th><th>OVR</th><th>POT</th><th>AGE</th><th>SALARY</th><th>EXPERIENCE</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderCoachProfile() {
  const entry = career.clubs
    .map((club) => ({ club, manager: ensureCoachProfile(club) }))
    .find(({ manager }) => manager.id === viewedCoachId);
  if (!entry) {
    viewedCoachId = null;
    return renderCoachDatabase();
  }
  const { club, manager } = entry;
  const stats = manager.statistics;
  const recentCoachAwards = (manager.seasonAwards ?? []).slice().reverse().slice(0, 5);
  const attributes = COACHING_ATTRIBUTES.map(
    (attribute) =>
      `<div><small>${esc(attribute.replace(/[A-Z]/g, (letter) => ` ${letter}`).toUpperCase())}</small><b>${manager.coachingAttributes[attribute]}/99</b></div>`,
  ).join("");
  const winPercentage = stats.matchesManaged
    ? ((stats.wins / stats.matchesManaged) * 100).toFixed(1)
    : "0.0";
  return `<div class="page-heading"><div><div class="eyebrow lime">COACH PROFILE</div><h1>${esc(manager.name)}</h1><p>${esc(club.name)} · ${esc(manager.style)} · ${manager.yearsExperience.toFixed(1)} years experience</p></div><button class="button-quiet" data-action="back-to-coaches">← All coaches</button></div><div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">COACHING RANK</div><div class="big-number">${esc(manager.rank)}</div><div class="muted">${manager.overall} overall · potential ${manager.potential} (${manager.potentialRank})</div></article><article class="stat-card"><div class="card-label">CURRENT CLUB</div><div class="big-number">${esc(club.name)}</div><div class="muted">Salary €${Math.round(manager.salary).toLocaleString("en-GB")} / week · recruitment €${Math.round(manager.recruitmentCost).toLocaleString("en-GB")}</div></article><article class="stat-card"><div class="card-label">MANAGEMENT RECORD</div><div class="big-number">${stats.wins}-${stats.draws}-${stats.losses}</div><div class="muted">${stats.matchesManaged} matches · ${winPercentage}% wins</div></article></div><section class="panel"><div class="panel-heading"><div><div class="eyebrow">COACHING ATTRIBUTES</div><h2>Individual ability profile</h2></div></div><div class="profile-details">${attributes}</div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">CAREER HISTORY</div><h2>Honours and development</h2></div></div><div class="profile-details"><div><small>LEAGUE TITLES</small><b>${stats.leagueTitles}</b></div><div><small>CUP TROPHIES</small><b>${stats.cupTrophies}</b></div><div><small>CONTINENTAL TROPHIES</small><b>${stats.continentalTrophies}</b></div><div><small>PLAYERS DEVELOPED</small><b>${stats.playersDeveloped}</b></div><div><small>TACTICAL SUCCESS</small><b>${stats.tacticalSuccess}</b></div><div><small>COACH AWARDS</small><b>${stats.coachAwards ?? 0}</b></div></div></section><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">SEASON UPDATES</div><h2>Coach of the Season awards</h2></div></div><table class="history-table"><thead><tr><th>SEASON</th><th>COMPETITION</th><th>AWARD</th></tr></thead><tbody>${recentCoachAwards.map((award) => `<tr><td>${seasonLabel(award.season)}</td><td>${esc(award.competition ?? "League")}</td><td>${esc(award.award)}</td></tr>`).join("") || '<tr><td colspan="3">No coach awards recorded yet.</td></tr>'}</tbody></table></section>`;
}

function renderAcademy() {
  const academy = career.club.academy ?? {
    players: [],
    developmentHistory: [],
  };
  const rows =
    academy.players
      .map(
        (player) =>
          `<tr><td>${esc(`${player.first} ${player.last}`)}</td><td>${esc(player.position)}</td><td>${player.age}</td><td>${player.overall}</td><td>${player.potentialRange ? `${player.potentialRange.min}–${player.potentialRange.max}` : player.potential}</td><td>${esc(player.developmentTrajectory ?? "Stable")}</td><td>${career.isManagerCareer ? (player.overall >= 55 ? `<button class="button-quiet" data-action="promote-academy-player" data-player-id="${esc(player.id)}">Promote</button>` : `<button class="button-quiet" data-action="release-academy-player" data-player-id="${esc(player.id)}">Release</button>`) : "Manager only"}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="7">No accepted academy players yet. Review youth scouting reports in the Scouting Hub.</td></tr>';
  const promotionReports = career.isManagerCareer ? academy.players.filter((player) => player.age >= 16 && player.overall >= 55).map((player) => `${esc(player.first)} ${esc(player.last)} is ready for senior consideration`).join(" · ") : "Promotions and releases are restricted to the club manager.";
  return `<div class="page-heading"><div><div class="eyebrow lime">YOUTH DEVELOPMENT</div><h1>Academy</h1><p>Accepted prospects develop gradually through the shared player-development engine, youth coaches and academy facilities.</p></div><span class="live-tag">${academy.players.length} PLAYERS</span></div><section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">ACADEMY SQUAD</div><h2>Development pathway</h2></div><span class="live-tag">STYLE ${esc(academy.playstyle ?? "Balanced")}</span></div><table class="history-table"><thead><tr><th>PLAYER</th><th>POS</th><th>AGE</th><th>OVR</th><th>POTENTIAL</th><th>PLAN</th><th>ACTION</th></tr></thead><tbody>${rows}</tbody></table></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">ACADEMY COACHING</div><h2>Development history</h2></div></div><p class="muted">${academy.developmentHistory?.length ?? 0} recorded development updates. Specialist youth coaches and the Youth Academy facility improve opportunity but do not guarantee progression.</p><p class="muted">${promotionReports}</p></section>`;
}

function renderConversation() {
  const history = [...(career.conversationHistory ?? [])].reverse();
  const rows = history
    .map(
      (entry) =>
        `<tr><td>${esc(entry.date ?? "—")}</td><td>${esc(entry.topic)}</td><td>${esc(entry.manager)}</td><td>${esc(entry.response)}</td></tr>`,
    )
    .join("");
  const coaches = career.coachMarket ?? [];
  const appointments = career.coachAppointments?.season === career.season ? career.coachAppointments.count : 0;
  return `<div class="page-heading"><div><div class="eyebrow lime">PLAYER RELATIONSHIP</div><h1>Talk to the coach</h1><p>Discuss your role, development, tactical responsibilities, and future with ${esc(career.club.manager.name)}.</p></div><span class="live-tag">${esc(career.club.fanSupport ? `${Math.round(career.club.fanSupport)}% FAN SUPPORT` : "CLUB DIALOGUE")}</span></div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">CURRENT COACH</div><h2>${esc(career.club.manager.name)}</h2></div><span class="live-tag">${esc(career.club.manager.style)}</span></div><p class="muted">Discuss performances, playing time, development, squad recruitment, and tactical decisions.</p><div class="manager-actions-buttons"><button class="button-primary" data-action="talk-manager" data-topic="playingTime">Ask about playing time</button><button class="button-quiet" data-action="player-request" data-request-type="playing-time" data-amount="less">Request less playing time</button><button class="button-quiet" data-action="talk-manager" data-topic="development">Discuss development</button><button class="button-quiet" data-action="talk-manager" data-topic="role">Discuss tactical role</button><button class="button-quiet" data-action="talk-manager" data-topic="training">Request extra training</button><button class="button-quiet" data-action="talk-manager" data-topic="future">Discuss your future</button></div><div class="manager-actions-buttons"><label class="position-select">Preferred teammate position<select id="coach-teammate-position">${POSITIONS.map((position) => `<option value="${position}" ${position === career.player.position ? "selected" : ""}>${position}</option>`).join("")}</select></label><button class="button-quiet" data-action="talk-manager" data-topic="betterTeammate">Ask coach to find a teammate</button></div><div class="manager-actions-buttons"><label class="position-select">Formation<select id="coach-formation">${FORMATION_NAMES.map((formation) => `<option value="${formation}" ${formation === career.club.formation ? "selected" : ""}>${formation}</option>`).join("")}</select></label><button class="button-primary" data-action="talk-manager" data-topic="formation">Ask coach to change formation</button></div><div class="manager-actions-buttons"><label class="position-select">Transfer destination<select id="player-transfer-target" aria-label="Transfer destination"><option value="">Choose a destination</option>${career.clubs.filter((club) => club.id !== career.club.id).map((club) => `<option value="${esc(club.id)}">${esc(club.name)}</option>`).join("")}</select></label><button class="button-danger" data-action="player-request" data-request-type="transfer">Ask for a transfer</button></div></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">OWNER CONTACT</div><h2>Talk to the owner</h2></div><span class="live-tag">${appointments}/2 APPOINTMENTS THIS SEASON</span></div><p class="muted">Request that the club dismiss the current head coach. The owner's response depends on your importance to the team. If accepted, the best available coach within budget is appointed automatically.</p><div class="manager-actions-buttons"><button class="button-danger" data-action="request-coach-dismissal">Request coach dismissal</button></div></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">CAREER CONTROL</div><h2>End your playing career</h2></div></div><p class="muted">Retirement keeps your statistics, awards, trophy case, and career history in the save while ending weekly progression.</p><button class="button-danger" data-action="retire-career">Retire from football</button></section>
    </div>
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">CONVERSATION LOG</div><h2>Previous meetings</h2></div><span class="live-tag">${history.length} RECORDED</span></div><table class="history-table"><thead><tr><th>DATE</th><th>TOPIC</th><th>MANAGER</th><th>RESPONSE</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="scorer-empty">No conversations recorded yet.</td></tr>'}</tbody></table></section>`;
}

function renderInternationalHistorySection(player) {
  const stats = player.internationalStats ?? {};
  const history = [...(player.internationalHistory ?? [])].reverse();
  const rows = history.slice(0, 20).map(
    (match) =>
      `<tr><td>${match.year ?? "—"}</td><td>${esc(match.competition ?? "—")}</td><td>${esc(match.nation ?? "—")} vs ${esc(match.opponent ?? "—")}</td><td>${match.homeGoals ?? 0}–${match.awayGoals ?? 0}</td><td>${match.goals ?? 0}</td><td>${match.assists ?? 0}</td><td>${match.rating == null ? "—" : formatDecimal(match.rating)}</td></tr>`,
  ).join("");
  return `<section class="player-hub-section"><div class="section-heading"><div><div class="eyebrow">INTERNATIONAL CAREER</div><h2>National team record</h2></div><span class="live-tag">${esc(player.internationalReputationLevel ?? "Unknown prospect")}</span></div><div class="stat-grid"><article class="stat-card"><div class="card-label">CAPS</div><div class="big-number">${stats.apps ?? 0}</div></article><article class="stat-card"><div class="card-label">INTERNATIONAL GOALS</div><div class="big-number">${stats.goals ?? 0}</div></article><article class="stat-card"><div class="card-label">ASSISTS</div><div class="big-number">${stats.assists ?? 0}</div></article><article class="stat-card"><div class="card-label">WORLD CUP APPS</div><div class="big-number">${stats.worldCupApps ?? 0}</div></article></div><section class="panel table-panel player-history-panel"><div class="panel-heading"><div><div class="eyebrow">INTERNATIONAL APPEARANCES</div><h2>Country: ${esc(COUNTRY_NAMES[player.nationality] ?? player.nationality ?? "—")}</h2></div><span class="live-tag">${history.length} MATCHES</span></div><table class="history-table"><thead><tr><th>YEAR</th><th>COMPETITION</th><th>FIXTURE</th><th>SCORE</th><th>G</th><th>A</th><th>RTG</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="scorer-empty">International appearances will be recorded after selection and participation.</td></tr>'}</tbody></table><p class="muted">${(player.internationalAchievements ?? []).map(esc).join(" · ") || "No international honours recorded yet."}</p></section></section>`;
}

function renderPlayer() {
  const player = career.player;
  const careerStats = player.careerStats ?? player.stats;
  const matchHistory = [...(player.matchHistory ?? [])].reverse();
  const playStyles = ensurePlayStyles(player);
  const ratingHistory = [...(player.ratingHistory ?? [])]
    .reverse()
    .slice(0, 12);
  const ratingHistoryRows = ratingHistory
    .map(
      (entry) =>
        `<tr><td>${esc(entry.season ?? "—")}</td><td>${entry.previous} → ${entry.current}</td><td class="${entry.change > 0 ? "positive" : "negative"}">${entry.change > 0 ? "+" : ""}${entry.change}</td><td>${esc(entry.reason ?? "Rating update")}</td></tr>`,
    )
    .join("");
  const internationalMatches = (player.matchHistory ?? []).filter(
    (match) => match.competitionId === "worldCup",
  );
  const international = internationalMatches.reduce(
    (total, match) => {
      total.apps++;
      total.goals += match.goals;
      total.assists += match.assists;
      total.ratingSum += match.rating ?? 0;
      return total;
    },
    {
      apps: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
    },
  );
  const seasons = new Map();
  for (const match of player.matchHistory ?? []) {
    const season = seasons.get(match.season) ?? {
      season: match.season,
      apps: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      honours: [],
    };
    season.apps++;
    season.goals += match.goals;
    season.assists += match.assists;
    season.ratingSum += match.rating ?? 0;
    seasons.set(match.season, season);
  }
  for (const honour of player.honours ?? []) {
    const season = seasons.get(honour.season) ?? {
      season: honour.season,
      apps: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      honours: [],
    };
    season.honours.push(honour.award);
    seasons.set(honour.season, season);
  }
  const seasonRows = [...seasons.values()]
    .sort((left, right) => right.season - left.season)
    .map(
      (season) =>
        `<tr><td>${seasonLabel(season.season)}</td><td>${season.apps}</td><td>${season.goals}</td><td>${season.assists}</td><td>${season.apps ? formatDecimal(season.ratingSum / season.apps) : "—"}</td><td>${esc(season.honours.join(", ") || "—")}</td></tr>`,
    )
    .join("");
  const historyRows = matchHistory
    .slice(0, 30)
    .map(
      (match) =>
        `<tr><td>${match.dateIndex == null ? seasonLabel(match.season) : esc(formatDate(match.dateIndex))}</td><td>${esc(match.competition)}</td><td>${esc(match.club)} vs ${esc(match.opponent)}</td><td>${match.homeGoals}\u2013${match.awayGoals}</td><td>${match.minutes > 0 ? `${match.minutes}'` : "\u2014"}</td><td>${match.goals}</td><td>${match.assists}</td><td>${match.rating == null ? "\u2014" : formatDecimal(match.rating)}</td><td>${match.result}</td></tr>`,
    )
    .join("");
  const overallNow = career.displayOverall(player);
  const formDelta = overallNow - calculateOverall(player);
  const formTag =
    formDelta === 0
      ? ""
      : `<small class="form-delta ${formDelta > 0 ? "positive" : "negative"}">${formDelta > 0 ? "+" : ""}${formDelta} FORM</small>`;
  const injury = career.injuryStatus(player);
  const injuryTag = injury.injured
    ? `<span class="live-tag injury-tag">INJURED · ${esc(injury.label.toUpperCase())} · ${injury.weeks}W</span>`
    : `<span class="live-tag">FIT</span>`;
  // The player hub now embeds the full player directory so you can browse every
  // player in the world without leaving your own hub page.
  const directoryAll = getBrowseablePlayers();
  const directoryLeagues = [
    ...new Set(directoryAll.map((entry) => entry.leagueName)),
  ].sort((left, right) => left.localeCompare(right));
  const directoryQuery = playerDirectorySearch.trim().toLocaleLowerCase();
  const directoryFiltered = directoryAll.filter((entry) => {
    if (playerDirectoryLeague && entry.leagueName !== playerDirectoryLeague)
      return false;
    if (!directoryQuery) return true;
    return [
      entry.fullName,
      entry.clubName,
      entry.leagueName,
      entry.nationality,
      countryName(entry.nationality),
      entry.position,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(directoryQuery);
  });
  const directoryRows =
    directoryFiltered
      .map(
        (entry) =>
          `<a class="player-directory-card" href="#players" data-open-player="${esc(entry.id)}"><div class="directory-card-head"><b>${esc(entry.fullName)}</b><span class="directory-card-tag">${entry.source === "generated" ? "NPC" : entry.id === career.player.id ? "YOU" : "PRO"}</span></div><div class="directory-card-meta"><span>${esc(entry.position ?? "—")}</span><span>${esc(entry.clubName)}</span><span>${esc(countryName(entry.nationality ?? "—"))}</span></div><div class="directory-card-stats"><span class="world-rating">${entry.overall}</span><span>${entry.appearances} apps</span><span>${entry.goals} G</span><span>${entry.assists} A</span></div><div class="directory-card-foot"><span>${esc(entry.leagueName)}</span>${entry.archetype ? `<span class="directory-archetype">${esc(entry.archetype)}</span>` : ""}</div></a>`,
      )
      .join("") || '<p class="muted">No players match your search.</p>';
  return `<div class="page-heading player-hub-heading"><div><div class="eyebrow lime">PLAYER HUB · SEASON ${seasonLabel(career.season)}</div><h1>${esc(player.first)} ${esc(player.last)}</h1><p>${esc(player.archetype)} · ${esc(player.position)} · ${ageOn(player.dob, currentDay())} years old · ${esc(career.club.name)}</p></div><div class="rating-badge">${overallNow}<small>OVR</small>${formTag}</div></div>
    <nav class="player-hub-menu" aria-label="Player sections">${[
      ["player-overview", "Overview"],
      ["player-development", "Development"],
      ["player-statistics", "Statistics"],
      ["player-attributes", "Attributes"],
      ["player-playstyles", "PlayStyles"],
      ["player-directory", "Directory"],
      ["player-trophies", "Trophy case"],
      ["player-history", "History"],
    ]
      .map(
        ([id, label]) =>
          `<a class="player-hub-link" href="#${id}">${label}</a>`,
      )
      .join("")}</nav>
    <section class="player-hub-section" id="player-overview"><div class="section-heading"><div><div class="eyebrow">PLAYER OVERVIEW</div><h2>Player details</h2></div><span class="live-tag">${esc(countryName(player.nationality))} · #${player.shirtNumber}</span></div>
      <div class="profile-grid"><section class="panel profile-panel">
        <div class="profile-details"><div><small>SHIRT NUMBER</small><label class="position-select"><input id="player-shirt-number" type="number" min="1" max="99" step="1" value="${player.shirtNumber}" aria-label="Shirt number"><small>Choose an unused squad number from 1 to 99.</small></label></div><div><small>NATIONALITY</small><b>${esc(countryName(player.nationality))}</b></div><div><small>HEIGHT / WEIGHT</small><b>${player.height} cm / ${player.weight} kg</b></div><div><small>PLAYING POSITION</small><label class="position-select"><select id="player-position" aria-label="Playing position">${POSITIONS.map((position) => `<option value="${position}" ${position === player.position ? "selected" : ""}>${position}</option>`).join("")}</select><small>Overall recalculates for the selected position.</small></label></div><div><small>STRONG FOOT</small><b>${esc(player.foot)} · ${player.weakFoot}★ weak foot</b></div><div><small>SKILL MOVES</small><b>${player.skillMoves} ★</b></div><div><small>PERSONALITY</small><b>${esc(player.personality.join(", "))}</b></div><div><small>ARCHETYPE</small><b>${esc(player.archetype ?? "—")}</b></div><div><small>DEVELOPMENT TRAIT</small><b>${esc(player.traits.join(", ") || "None")}</b></div><div><small>BASE OVERALL / POTENTIAL</small><b>${calculateOverall(player)} / ${player.potential ?? "?"}</b></div><div><small>STATUS</small><b>${injuryTag}</b></div><div><small>INJURY RESISTANCE</small><b>${career.injuryResistance(player)}% · physical ${player.attrs?.physical ?? "—"}</b></div><div><small>CONTRACT / WAGE</small><b>€${formatDecimal(player.contract?.wage ?? 0)} per week</b></div><div><small>CAREER BALANCE</small><b>€${formatDecimal(career.money)}</b></div></div>
      </section><section class="player-condition-grid"><article class="stat-card"><div class="card-label">FORM</div><div class="big-number">${Math.round(player.form)}<span>/100</span></div></article><article class="stat-card"><div class="card-label">MORALE</div><div class="big-number">${Math.round(player.morale)}<span>/100</span></div></article><article class="stat-card"><div class="card-label">STAMINA</div><div class="big-number">${ensureStamina(player)}<span>/100</span></div>${staminaMarkup(player)}</article><article class="stat-card"><div class="card-label">DEVELOPMENT</div><div class="big-number">${esc(player.developmentTrajectory ?? "Stable")}</div></article></section></div>
    </section>
    <section class="player-hub-section" id="player-development"><div class="section-heading"><div><div class="eyebrow">CAREER DEVELOPMENT</div><h2>${esc(player.developmentTrajectory ?? "Stable")}</h2></div><span class="live-tag">BASE ${calculateOverall(player)} · POT ${player.potential ?? "—"}</span></div><div class="development-sparkline">${(player.developmentHistory ?? []).slice(-16).map((point) => `<span title="${point.season}: ${point.overall} OVR" style="height:${Math.max(8, Math.min(100, point.overall))}%"></span>`).join("") || '<small class="muted">Development history will populate as seasons advance.</small>'}</div><table class="history-table"><thead><tr><th>SEASON</th><th>PREVIOUS</th><th>CURRENT</th><th>CHANGE</th><th>REASONS</th></tr></thead><tbody>${(player.developmentReportHistory ?? []).slice(-8).reverse().map((report) => `<tr><td>${report.season}</td><td>${report.previousOverall}</td><td>${report.currentOverall}</td><td class="${report.change >= 0 ? "positive" : "negative"}">${report.change > 0 ? "+" : ""}${report.change}</td><td>${esc(report.reasons?.join(" · ") ?? "—")}</td></tr>`).join("") || '<tr><td colspan="5" class="scorer-empty">No seasonal development reports yet.</td></tr>'}</tbody></table></section>
    <section class="player-hub-section" id="player-statistics"><div class="section-heading"><div><div class="eyebrow">PLAYER STATISTICS</div><h2>Season and career record</h2></div></div>
      <div class="player-stat-panels"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">CURRENT SEASON · ALL COMPETITIONS</div><h2>Season totals</h2></div></div><div class="player-stat-grid"><div><b>${player.stats.apps}</b><small>APPS</small></div><div><b>${player.stats.starts}</b><small>STARTS</small></div><div><b>${player.stats.goals}</b><small>GOALS</small></div><div><b>${player.stats.assists}</b><small>ASSISTS</small></div><div><b>${player.stats.minutes}</b><small>MINUTES</small></div>      <div><b>${averageRating(player.stats) == null ? "—" : formatDecimal(averageRating(player.stats))}</b><small>AVG RATING</small></div><div><b>${player.stats.yellowCards}</b><small>YELLOW CARDS</small></div><div><b>${player.stats.redCards}</b><small>RED CARDS</small></div></div></section>
      <section class="panel"><div class="panel-heading"><div><div class="eyebrow">CAREER TOTALS</div><h2>Lifetime record</h2></div></div><div class="player-stat-grid"><div><b>${careerStats.apps}</b><small>APPS</small></div><div><b>${careerStats.starts}</b><small>STARTS</small></div><div><b>${careerStats.goals}</b><small>GOALS</small></div><div><b>${careerStats.assists}</b><small>ASSISTS</small></div><div><b>${careerStats.minutes}</b><small>MINUTES</small></div>      <div><b>${averageRating(careerStats) == null ? "—" : formatDecimal(averageRating(careerStats))}</b><small>AVG RATING</small></div><div><b>${careerStats.cleanSheets}</b><small>CLEAN SHEETS</small></div><div><b>${careerStats.yellowCards}</b><small>YELLOW CARDS</small></div></div></section></div>
      <div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">CURRENT LEAGUE</div><div class="big-number">${player.leaguePerformance?.apps ?? 0}<span> apps</span></div><div class="muted">${player.leagueGoals ?? 0} goals · ${player.leagueAssists ?? 0} assists · avg ${player.leaguePerformance?.apps ? formatDecimal(player.leaguePerformance.ratingSum / player.leaguePerformance.apps) : "—"}</div></article><article class="stat-card"><div class="card-label">WORLD CUP / INTERNATIONAL</div><div class="big-number">${international.apps}<span> apps</span></div><div class="muted">${international.goals} goals · ${international.assists} assists · avg ${international.apps ? formatDecimal(international.ratingSum / international.apps) : "—"}</div></article></div>
    </section>
    <section class="player-hub-section" id="player-attributes"><div class="section-heading"><div><div class="eyebrow">PLAYER ATTRIBUTES</div><h2>Technical profile</h2></div><span class="live-tag">${esc(player.developmentTrajectory ?? "Stable")}</span></div>
      <div class="profile-grid"><section class="panel attributes-panel"><div class="panel-heading"><div><div class="eyebrow">CORE ATTRIBUTES</div><h2>Overall skill profile</h2></div><span class="live-tag">${overallNow} OVR${formDelta ? ` (${formDelta > 0 ? "+" : ""}${formDelta} form)` : ""}</span></div><div class="attribute-list">${ATTRIBUTES.map((attr) => `<div class="attribute-row"><span>${attr.toUpperCase()}</span><div class="attribute-bar"><i style="width:${player.attrs[attr]}%"></i></div><b>${player.attrs[attr]}</b></div>`).join("")}${player.position === "GK" ? GK_ATTRIBUTES.map((attr) => `<div class="attribute-row"><span>${attr.toUpperCase()}</span><div class="attribute-bar"><i style="width:${player.gkAttrs?.[attr] ?? 50}%"></i></div><b>${player.gkAttrs?.[attr] ?? 50}</b></div>`).join("") : ""}</div></section>
      <section class="panel attributes-panel detailed"><div class="panel-heading"><div><div class="eyebrow">DETAILED ATTRIBUTES</div><h2>Sub-attributes</h2></div><span class="muted">Mean of group</span></div><div class="attribute-list detailed-list">${
        player.position === "GK"
          ? GK_ATTRIBUTES.map(
              (attr) =>
                `<div class="attribute-row small"><span>${SUB_LABELS[attr] ?? attr}</span><div class="attribute-bar"><i style="width:${player.gkAttrs?.[attr] ?? 50}%"></i></div><b>${player.gkAttrs?.[attr] ?? "—"}</b></div>`,
            ).join("")
          : Object.entries(SUB_ATTRIBUTES)
              .map(
                ([group, list]) =>
                  `<div class="attribute-group"><h3>${group.toUpperCase()}</h3>${list.map((sub) => `<div class="attribute-row small"><span>${SUB_LABELS[sub] ?? sub}</span><div class="attribute-bar"><i style="width:${player.subAttrs?.[sub] ?? 50}%"></i></div><b>${player.subAttrs?.[sub] ?? "—"}</b></div>`).join("")}</div>`,
              )
              .join("")
      }</div><div class="work-rates"><span>Attacking work rate</span><b>${esc(player.workRates?.attacking ?? "Medium")}</b><span>Defensive work rate</span><b>${esc(player.workRates?.defensive ?? "Medium")}</b><span>Weak foot</span><b>${player.weakFoot} ★</b><span>Skill moves</span><b>${player.skillMoves} ★</b></div></section></div>
    </section>
    <section class="player-hub-section" id="player-playstyles"><div class="section-heading"><div><div class="eyebrow">SPECIALIST ABILITIES</div><h2>PlayStyles & PlayStyle+</h2></div><span class="live-tag">${playStyles.unlocked.length} ABILITIES</span></div><div class="playstyle-filter-row"><label>FILTER BY CATEGORY<select id="playstyle-filter"><option value="all">All categories</option>${PLAYSTYLE_CATEGORIES.map((category) => `<option value="${category}">${category[0].toUpperCase() + category.slice(1)}</option>`).join("")}</select></label><label>COMPARE PLAYER<select id="playstyle-compare"><option value="">Choose a player</option>${career.players
      .filter(
        (candidate) =>
          candidate.id !== player.id && candidate.clubId === player.clubId,
      )
      .map(
        (candidate) =>
          `<option value="${esc(candidate.id)}">${esc(candidate.first)} ${esc(candidate.last)} · ${candidate.position}</option>`,
      )
      .join("")}</select></label></div><div class="playstyle-grid">${
      playStyles.unlocked
        .map((badge) => {
          const def = PLAYSTYLE_REGISTRY[badge.id];
          if (!def) return "";
          const progress = playStyles.progress[badge.id] ?? 0;
          return `<article class="playstyle-card ${badge.tier === "plus" ? "is-plus" : ""}" data-playstyle-category="${def.category}"><span class="playstyle-icon" aria-hidden="true">${{ shooting: "⚽", passing: "➤", dribbling: "✦", physical: "◆", defending: "⬟", goalkeeping: "▣" }[def.category]}</span><div><b>${esc(def.name)}</b><small>${def.category.toUpperCase()} · ${badge.tier === "plus" ? "PLAYSTYLE+" : "STANDARD"}</small><p>${esc(def.description)}</p><small>Progress: ${Math.min(100, Math.round((progress / def.upgradeConditions.evidence) * 100))}% · ${badge.tier === "plus" ? "Specialist tier reached" : `Needs ${def.upgradeConditions.evidence} evidence, OVR ${def.upgradeConditions.minOverall}+`}</small></div></article>`;
        })
        .join("") ||
      '<p class="muted">Abilities develop from training focus and repeated match actions.</p>'
    }</div><div id="playstyle-comparison" class="playstyle-comparison" aria-live="polite"></div></section>
    ${renderTrophyCase()}
    ${renderInternationalHistorySection(player)}
    <section class="player-hub-section" id="player-history"><div class="section-heading"><div><div class="eyebrow">PLAYER HISTORY</div><h2>Season log and match appearances</h2></div></div>
      <section class="panel table-panel player-history-panel"><div class="panel-heading"><div><div class="eyebrow">SEASON-BY-SEASON</div><h2>Career seasons</h2></div></div><table class="history-table"><thead><tr><th>SEASON</th><th>APPS</th><th>GOALS</th><th>ASSISTS</th><th>AVG RTG</th><th>HONOURS</th></tr></thead><tbody>${seasonRows || `<tr><td colspan="6" class="scorer-empty">Season statistics and honours will appear here as your career progresses.</td></tr>`}</tbody></table></section>
      <section class="panel table-panel player-history-panel"><div class="panel-heading"><div><div class="eyebrow">APPEARANCE RECORD · MOST RECENT 30</div><h2>Match history</h2></div><span class="live-tag">${(player.matchHistory ?? []).length} APPEARANCES</span></div><table class="history-table"><thead><tr><th>DATE</th><th>COMPETITION</th><th>FIXTURE</th><th>SCORE</th><th>MINS</th><th>G</th><th>A</th><th>RTG</th><th>RESULT</th></tr></thead><tbody>${historyRows || `<tr><td colspan="9" class="scorer-empty">Your first appearance will be recorded here.</td></tr>`}</tbody></table></section>
    </section>

    ${renderFinances()}
    `;
}

function renderTraining() {
  const overview = career.trainingOverview();
  const isManager = career.isManagerCareer;
  const isGoalkeeper = career.player.position === "GK";
  const trainingGroups = isGoalkeeper
    ? [["Goalkeeping", GK_ATTRIBUTES]]
    : Object.entries(SUB_ATTRIBUTES);
  const trainingOptions = trainingGroups
    .map(
      ([group, attributes]) =>
        `<optgroup label="${group === "Goalkeeping" ? group : group[0].toUpperCase() + group.slice(1)}">${attributes
          .map((attribute) => {
            const label = attribute.replace(/([A-Z])/g, " $1");
            const current = isGoalkeeper
              ? career.player.gkAttrs?.[attribute]
              : career.player.subAttrs?.[attribute];
            return `<option value="${attribute}" ${career.trainingFocus === attribute ? "selected" : ""}>${label[0].toUpperCase() + label.slice(1)} · current ${current ?? 1}</option>`;
          })
          .join("")}</optgroup>`,
    )
    .join("");
  const player = career.player;
  const attributesForFocus = isGoalkeeper ? GK_ATTRIBUTES : Object.values(SUB_ATTRIBUTES).flat();
  const development = player.developmentReportHistory ?? [];
  const history = (player.developmentHistory ?? []).slice(-8);
  const reports = development.slice(-5).reverse().map((report) => `<tr><td>${report.season}</td><td>${report.previousOverall} → ${report.currentOverall}</td><td class="${report.change >= 0 ? "positive" : "negative"}">${report.change > 0 ? "+" : ""}${report.change}</td><td>${esc(Object.entries(report.attributes ?? {}).map(([name, change]) => `${name} ${change > 0 ? "+" : ""}${change}`).join(", ") || report.reasons?.join(" · ") || "No attribute change")}</td></tr>`).join("");
  const coaches = overview.coaches.map((coach) => `<article class="training-coach-card"><div class="coach-grade">${esc(coach.grade)}</div><div class="coach-card-main"><b>${esc(coach.name)}</b><small>${esc(coach.department)} specialist · ${coach.overall}/99 · €${Number(coach.weeklySalary).toLocaleString("en-GB")}/wk</small></div>${isManager ? `<button class="button-quiet" data-action="dismiss-training-coach" data-coach-id="${esc(coach.id)}">Dismiss</button>` : ""}</article>`).join("") || '<p class="muted">No specialist coaches are currently employed.</p>';
  const departmentPanels = overview.departments.map((department) => {
    const assigned = overview.assignments[department];
    return `<div class="training-department"><b>${esc(department)}</b><small>${(overview.coaches.find((coach) => coach.id === assigned) ?? overview.coaches.find((coach) => coach.department === department))?.name ?? "Unassigned"}</small>${isManager ? `<select id="coach-assignment-${department}" aria-label="Assign ${department} coach"><option value="">Select coach</option>${overview.coaches.map((coach) => `<option value="${esc(coach.id)}" ${coach.id === assigned ? "selected" : ""}>${esc(coach.name)} · ${coach.overall} · ${esc(coach.department)}</option>`).join("")}</select><button class="button-quiet" data-action="assign-training-coach" data-department="${department}">Assign</button>` : ""}</div>`;
  }).join("");
  const market = isManager ? `<section class="panel"><div class="panel-heading"><div><div class="eyebrow">RECRUITMENT MARKET</div><h2>Available training coaches</h2></div><button class="button-quiet" data-action="refresh-training-market">Refresh market</button></div><div class="training-coach-grid">${overview.market.slice(0, 8).map((coach) => `<article class="training-market-card"><span class="coach-grade">${esc(coach.grade)}</span><b>${esc(coach.name)}</b><small>${coach.age} · ${esc(coach.nationality)} · ${esc(coach.department)} specialist</small><small>Technical ${coach.technicalAbility} · Physical ${coach.physicalAbility} · Tactical ${coach.tacticalAbility} · Youth ${coach.youthAbility}</small><small>€${Number(coach.weeklySalary).toLocaleString("en-GB")}/wk · €${Number(coach.recruitmentCost).toLocaleString("en-GB")} recruitment · ${coach.contractWeeks} weeks</small><button class="button-primary" data-action="hire-training-coach" data-coach-id="${esc(coach.id)}">Hire coach</button></article>`).join("")}</div></section>` : "";
  const managerSettings = isManager ? `<section class="panel"><div class="panel-heading"><div><div class="eyebrow">CLUB TRAINING PLAN</div><h2>Programmes & intensity</h2></div><span class="live-tag">€${overview.expenditure.toLocaleString("en-GB")} / WEEK · STAFF PAYROLL</span></div><div class="manager-actions-buttons"><label class="position-select">Programme<select id="club-training-programme">${overview.programmes.map((programme) => `<option ${programme === overview.programme ? "selected" : ""}>${esc(programme)}</option>`).join("")}</select></label><label class="position-select">Intensity<select id="club-training-intensity">${overview.intensities.map((intensity) => `<option ${intensity === overview.intensity ? "selected" : ""}>${esc(intensity)}</option>`).join("")}</select></label><button class="button-primary" data-action="set-club-training">Save training plan</button></div>${departmentPanels}</section>` : `<section class="panel"><div class="panel-heading"><div><div class="eyebrow">CLUB TRAINING STAFF</div><h2>${esc(career.club.name)} coaches</h2></div><span class="live-tag">VIEW ONLY</span></div><p class="muted">Your club staff and specialisations influence your natural attribute development. Hiring, assignments, contracts, wages and club budgets are managed by the club manager.</p><div class="training-department-grid">${departmentPanels}</div></section>`;
  return `<div class="page-heading"><div><div class="eyebrow lime">DEVELOPMENT CENTRE</div><h1>${isManager ? "Club Training & Development" : "Training & Development"}</h1><p>${isManager ? "Manage club programmes, staff assignments, intensity, recruitment, expenditure and academy progression." : "Base OVR follows your attributes. Training focus guides gradual progression; potential, form, fitness and sharpness remain separate."}</p></div><span class="live-tag">${esc(player.developmentTrajectory ?? "Stable")}</span></div>
  <div class="stat-grid lower-stats"><article class="stat-card"><div class="card-label">BASE OVR</div><div class="big-number">${calculateOverall(player)}</div></article><article class="stat-card"><div class="card-label">POTENTIAL</div><div class="big-number">${player.potential ?? "—"}</div></article><article class="stat-card"><div class="card-label">MATCH FORM</div><div class="big-number">${Math.round(player.form ?? 50)}</div></article><article class="stat-card"><div class="card-label">FITNESS</div><div class="big-number">${Math.round(player.fitness ?? 100)}%</div></article></div>
    <div class="training-grid"><section class="panel training-session"><div class="eyebrow">${isManager ? "SQUAD DEVELOPMENT" : "INDIVIDUAL PLAYER FOCUS"}</div><h2>${isManager ? "Club training programme" : "Development plan"}</h2><p>${isManager ? "Set a club-wide training plan and intensity. Individual player development remains gradual and attribute-based." : "Select a detailed attribute as a focus. It improves the probability of that attribute developing over time, but never buys an immediate upgrade."}</p>${isManager ? "" : `<label class="focus-select">INDIVIDUAL FOCUS<select id="training-focus">${attributesForFocus.map((attribute) => `<option value="${attribute}" ${career.trainingFocus === attribute ? "selected" : ""}>${esc(attribute.replace(/[A-Z]/g, " $&"))} · ${isGoalkeeper ? player.gkAttrs?.[attribute] ?? 50 : player.subAttrs?.[attribute] ?? 50}</option>`).join("")}</select></label>`}<div class="training-progress"><div><span>Trajectory</span><b>${esc(player.developmentTrajectory ?? "Stable")}</b></div><div><span>Appearances</span><b>${player.stats.apps}</b></div><div><span>Minutes</span><b>${player.stats.minutes}</b></div><div><span>Average rating</span><b>${player.stats.apps ? formatDecimal(player.stats.ratingSum / player.stats.apps) : "—"}</b></div></div><p class="muted">${isManager ? "Training coaches, facilities, and intensity shape the entire squad." : `Current individual focus: ${esc(player.trainingFocus ?? career.trainingFocus)}. Form, morale and temporary match boosts do not alter base attributes.`}</p>${isManager ? "" : '<button class="button-primary" data-action="train">Save individual focus</button>'}</section><section class="panel training-log"><div class="panel-heading"><div><div class="eyebrow">DEVELOPMENT SNAPSHOT</div><h2>Recent OVR history</h2></div></div><div class="development-sparkline">${history.map((point) => `<span title="${point.season}: ${point.overall} OVR" style="height:${Math.max(8, Math.min(100, point.overall))}%"></span>`).join("") || '<small class="muted">Progress history will appear as your career advances.</small>'}</div><p class="muted">${esc(player.developmentTrajectory ?? "Stable")} · reports are generated once per season.</p></section></div>
    ${managerSettings}<section class="panel"><div class="panel-heading"><div><div class="eyebrow">SPECIALIST STAFF</div><h2>Training coaches</h2></div><span class="live-tag">${overview.coaches.length} EMPLOYED</span></div><div class="training-coach-grid">${coaches}</div></section>${market}<section class="panel"><div class="panel-heading"><div><div class="eyebrow">FACILITIES</div><h2>Training environment</h2></div></div><p class="muted">Training ground level ${career.club.investment?.facilities?.trainingGround ?? 1} · Youth academy level ${career.club.investment?.facilities?.youthAcademy ?? 1}. Better facilities improve training efficiency and young-player development. Facility investment remains available only to the manager.</p></section>
    <section class="panel table-panel"><div class="panel-heading"><div><div class="eyebrow">PLAYER DEVELOPMENT REPORTS</div><h2>Season progression</h2></div><span class="live-tag">${development.length} REPORTS</span></div><table class="history-table"><thead><tr><th>SEASON</th><th>OVR</th><th>CHANGE</th><th>ATTRIBUTE / REASON</th></tr></thead><tbody>${reports || '<tr><td colspan="4" class="scorer-empty">Season development reports will appear here.</td></tr>'}</tbody></table></section>`;
}

function currentDay() {
  return career.currentDay();
}

function nextFixture() {
  // Use the same combined fixture list (league + tournaments) the Fixtures screen
  // renders, so the overview's UP NEXT match always copies the fixture list.
  const fixtures = career.getFixtureList();
  const fixture =
    fixtures.find((item) => item.next) ?? fixtures.find((item) => !item.played);
  if (!fixture) return null;
  return {
    home: career.clubs.find((club) => club.id === fixture.homeId) ?? {
      name: fixture.home,
      shortName: fixture.homeShortName,
    },
    away: career.clubs.find((club) => club.id === fixture.awayId) ?? {
      name: fixture.away,
      shortName: fixture.awayShortName,
    },
    day: fixture.date,
    competitionId: fixture.competitionId,
    competition: fixture.competition,
    roundLabel: fixture.roundLabel,
  };
}

function ordinal(n) {
  if (!n || typeof n !== "number") return "—";
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix}`;
}

function countryName(code) {
  return countries.find(([id]) => id === code)?.[1] ?? code;
}

function isBrowseablePlayerId(playerId) {
  if (!playerId) return false;
  const activeClubIds = new Set(career.clubs.map((club) => club.id));
  return (
    career.players.some(
      (player) =>
        player.id === playerId &&
        (activeClubIds.has(player.clubId) || player.id === career.player.id),
    ) ||
    career.worldLeagues.some((state) =>
      state.performers?.some((player) => player.id === playerId),
    )
  );
}

function bindPlayerLinks(root) {
  root.querySelectorAll("[data-open-player]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isBrowseablePlayerId(link.dataset.openPlayer)) return;
      viewedPlayerId = link.dataset.openPlayer;
      screen = "players";
      renderGame();
    }),
  );
}

function playerProfileLink(playerOrId, displayName, className = "") {
  const player =
    typeof playerOrId === "object" && playerOrId !== null ? playerOrId : null;
  const name =
    displayName ??
    (player ? `${player.first ?? ""} ${player.last ?? ""}`.trim() : "");
  let playerId = player?.id ?? playerOrId;
  if (!isBrowseablePlayerId(playerId) && name) {
    const normalizedName = name.trim().toLocaleLowerCase();
    const matches = getBrowseablePlayers().filter(
      (candidate) => candidate.fullName.toLocaleLowerCase() === normalizedName,
    );
    playerId = matches.length === 1 ? matches[0].id : null;
  }
  if (!playerId || !isBrowseablePlayerId(playerId)) return esc(name);
  return `<a class="player-profile-link${className ? ` ${esc(className)}` : ""}" href="#players" data-open-player="${esc(playerId)}">${esc(name)}</a>`;
}

function getBrowseablePlayers() {
  const entries = career.baseData.careerLeagues ?? [];
  const activeClubIds = new Set(career.clubs.map((club) => club.id));
  const result = [];
  const seen = new Set();
  const add = (player, leagueName, clubName) => {
    if (!player?.id || seen.has(player.id)) return;
    seen.add(player.id);
    const stats = player.careerStats ?? player.stats ?? {};
    result.push({
      ...player,
      fullName: `${player.first ?? ""} ${player.last ?? ""}`.trim(),
      leagueName,
      clubName,
      overall: player.attrs
        ? career.displayOverall(player)
        : (player.overall ?? 50),
      potential: player.potential ?? player.overall ?? 50,
      appearances: stats.apps ?? player.apps ?? 0,
      goals: stats.goals ?? player.goals ?? 0,
      assists: stats.assists ?? player.assists ?? 0,
      ratingSum: stats.ratingSum ?? player.ratingSum ?? 0,
      stats,
    });
  };

  for (const player of career.players) {
    if (!activeClubIds.has(player.clubId) && player.id !== career.player.id)
      continue;
    const club = career.clubs.find((entry) => entry.id === player.clubId);
    add(player, career.league.name, club?.name ?? "Free agent");
  }
  for (const state of career.worldLeagues) {
    const entry = entries.find(
      (candidate) => candidate.league.id === state.league.id,
    );
    for (const player of state.performers ?? []) {
      add(
        player,
        state.league.name,
        entry?.clubIdentities[player.clubId]?.name ?? player.clubId,
      );
    }
  }
  return result.sort(
    (left, right) =>
      left.fullName.localeCompare(right.fullName) ||
      left.id.localeCompare(right.id),
  );
}

function renderPlayerDirectory() {
  const allPlayers = getBrowseablePlayers();
  const population = career.playerPopulationStats?.() ?? null;
  const populationPanel = population
    ? `<section class="panel table-panel player-population-panel"><div class="panel-heading"><div><div class="eyebrow">PLAYER POPULATION</div><h2>${population.generatedPercentage.toFixed(1)}% generated</h2></div><span class="live-tag">${population.total} TOTAL</span></div><div class="player-stat-grid"><div><b>${population.total}</b><small>TOTAL PLAYERS</small></div><div><b>${population.real}</b><small>REAL / IMPORTED</small></div><div><b>${population.generated}</b><small>GENERATED</small></div><div><b>${population.introducedThisSeason}</b><small>INTRODUCED THIS SEASON</small></div><div><b>${population.retiredThisSeason}</b><small>RETIRED THIS SEASON</small></div></div></section>`
    : "";
  const leagueNames = [
    ...new Set(allPlayers.map((player) => player.leagueName)),
  ].sort((left, right) => left.localeCompare(right));
  if (playerDirectoryLeague && !leagueNames.includes(playerDirectoryLeague))
    playerDirectoryLeague = "";
  const query = playerDirectorySearch.trim().toLocaleLowerCase();
  const filtered = allPlayers.filter((player) => {
    if (playerDirectoryLeague && player.leagueName !== playerDirectoryLeague)
      return false;
    if (!query) return true;
    return [
      player.fullName,
      player.clubName,
      player.leagueName,
      player.nationality,
      countryName(player.nationality),
      player.position,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
  const pageSize = 60;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  playerDirectoryPage = Math.min(playerDirectoryPage, pageCount - 1);
  const page = filtered.slice(
    playerDirectoryPage * pageSize,
    (playerDirectoryPage + 1) * pageSize,
  );
  const rows =
    page
      .map(
        (player) =>
          `<a class="player-directory-card" href="#players" data-open-player="${esc(player.id)}"><div class="directory-card-head"><b>${esc(player.fullName)}</b><span class="directory-card-tag">${player.id === career.player.id ? "YOU" : player.source === "generated" ? "NPC" : "PRO"}</span></div><div class="directory-card-meta"><span>${esc(player.position ?? "—")}</span><span>${esc(player.clubName)}</span><span>${esc(countryName(player.nationality ?? "—"))}</span></div><div class="directory-card-stats"><span class="world-rating">${player.overall}</span><span>${player.appearances} apps</span><span>${player.goals} G</span><span>${player.assists} A</span></div><div class="directory-card-foot"><span>${esc(player.leagueName)}</span>${player.archetype ? `<span class="directory-archetype">${esc(player.archetype)}</span>` : ""}</div></a>`,
      )
      .join("") ||
    '<p class="muted">No players match your search. Try a different name, nation, club, or position.</p>';
  return `<div class="page-heading"><div><div class="eyebrow lime">PLAYER DATABASE · ALL CLUBS</div><h1>Players</h1><p>Browse your squad and NPC players throughout all playable leagues. Open any player for their profile, attributes, stats, and recorded match history.</p></div><span class="live-tag">${allPlayers.length} PLAYERS</span></div>${populationPanel}
    <form class="panel player-directory-filters" id="player-directory-form"><label>SEARCH PLAYERS<input id="player-directory-search" type="search" value="${esc(playerDirectorySearch)}" placeholder="Name, team, league, position, country"></label><label>LEAGUE<select id="player-directory-league"><option value="">All leagues</option>${leagueNames.map((name) => `<option value="${esc(name)}" ${name === playerDirectoryLeague ? "selected" : ""}>${name}</option>`).join("")}</select></label><button class="button-primary" type="submit">Search</button></form>
    <section class="panel table-panel player-directory-panel"><div class="panel-heading"><div><div class="eyebrow">PLAYER REGISTER</div><h2>${filtered.length} players found</h2></div><span class="live-tag">${filtered.length ? `PAGE ${playerDirectoryPage + 1} / ${pageCount}` : "NO MATCHES"}</span></div><div class="player-directory-grid">${rows}</div><div class="player-directory-pagination"><button class="button-quiet" type="button" data-player-page="${Math.max(0, playerDirectoryPage - 1)}" ${playerDirectoryPage === 0 ? "disabled" : ""}>← Previous</button><span>${filtered.length ? `${playerDirectoryPage * pageSize + 1}–${Math.min(filtered.length, (playerDirectoryPage + 1) * pageSize)} of ${filtered.length}` : "0 players"}</span><button class="button-quiet" type="button" data-player-page="${Math.min(pageCount - 1, playerDirectoryPage + 1)}" ${playerDirectoryPage + 1 >= pageCount ? "disabled" : ""}>Next →</button></div></section>`;
}

function renderOtherPlayer() {
  const player = getBrowseablePlayers().find(
    (candidate) => candidate.id === viewedPlayerId,
  );
  if (!player) {
    viewedPlayerId = null;
    return renderPlayerDirectory();
  }
  const stats = player.stats ?? {};
  const appearances = player.appearances;
  const average =
    appearances && player.ratingSum
      ? formatDecimal(player.ratingSum / appearances)
      : "—";
  const matchHistory = [...(player.matchHistory ?? [])].reverse();
  const historyRows = matchHistory
    .slice(0, 50)
    .map(
      (match) =>
        `<tr><td>${match.dateIndex == null ? seasonLabel(match.season) : esc(formatDate(match.dateIndex))}</td><td>${esc(match.competition ?? "\u2014")}</td><td>${esc(match.club ?? player.clubName)} vs ${esc(match.opponent ?? "\u2014")}</td><td>${match.homeGoals ?? 0}\u2013${match.awayGoals ?? 0}</td><td>${match.minutes > 0 ? `${match.minutes}'` : "\u2014"}</td><td>${match.goals ?? 0}</td><td>${match.assists ?? 0}</td><td>${match.rating == null ? "\u2014" : formatDecimal(match.rating)}</td><td>${esc(match.result ?? "\u2014")}</td></tr>`,
    )
    .join("");
  const ratingHistory = [...(player.ratingHistory ?? [])]
    .reverse()
    .slice(0, 12);
  const ratingHistoryRows = ratingHistory
    .map(
      (entry) =>
        `<tr><td>${esc(entry.season ?? "—")}</td><td>${entry.previous} → ${entry.current}</td><td class="${entry.change > 0 ? "positive" : "negative"}">${entry.change > 0 ? "+" : ""}${entry.change}</td><td>${esc(entry.reason ?? "Rating update")}</td></tr>`,
    )
    .join("");
  const attributes =
    player.attrs ??
    Object.fromEntries(
      ATTRIBUTES.map((attribute) => [attribute, player.overall]),
    );
  return `<div class="page-heading player-hub-heading"><div><div class="eyebrow lime">PLAYER PROFILE · ${esc(player.leagueName.toUpperCase())}</div><h1>${esc(player.fullName)}</h1><p>${esc(player.archetype ?? "—")} · ${esc(player.position ?? "—")} · ${ageOn(player.dob, currentDay())} years old · ${esc(player.clubName)}</p></div><div class="rating-badge">${player.overall}<small>OVR</small></div></div>
    <button class="button-quiet player-back-button" type="button" data-action="player-directory">← All players</button>
    <section class="player-hub-section"><div class="section-heading"><div><div class="eyebrow">PLAYER OVERVIEW</div><h2>Profile & current record</h2></div><span class="live-tag">${player.age ? `${player.age} YEARS` : "NPC PLAYER"} · POT ${player.potential}</span></div>
    <div class="profile-grid"><section class="panel profile-panel"><div class="profile-details"><div><small>CLUB</small><b>${esc(player.clubName)}</b></div><div><small>LEAGUE</small><b>${esc(player.leagueName)}</b></div><div><small>NATIONALITY</small><b>${esc(countryName(player.nationality ?? "—"))}</b></div><div><small>PLAYING POSITION</small><b>${esc(player.position ?? "—")}</b></div><div><small>AGE</small><b>${player.age ?? (player.dob ? ageOn(player.dob, currentDay()) : "—")}</b></div><div><small>SHIRT NUMBER</small><b>${player.shirtNumber ?? "—"}</b></div><div><small>STRONG FOOT</small><b>${esc(player.foot ?? "Right")} · ${player.weakFoot ?? 3}★ weak foot</b></div><div><small>SKILL MOVES</small><b>${player.skillMoves ?? 3} ★</b></div><div><small>ARCHETYPE</small><b>${esc(player.archetype ?? "—")}</b></div><div><small>PERSONALITY</small><b>${esc((player.personality ?? []).join(", ") || "—")}</b></div><div><small>DEVELOPMENT TRAIT</small><b>${esc((player.traits ?? []).join(", ") || "None")}</b></div><div><small>HEIGHT / WEIGHT</small><b>${player.height ?? "—"} cm / ${player.weight ?? "—"} kg</b></div><div><small>SOURCE</small><b>${player.source === "generated" ? "Generated NPC" : player.source === "real-world" ? "Imported real player" : "League player"}</b></div><div><small>MARKET VALUE</small><b>${(player.marketValue ?? player.value) ? `${formatMarketValue(player.marketValue ?? player.value)}${Number(player.previousMarketValue) > 0 ? ` <small class="${(player.marketValue ?? player.value) >= player.previousMarketValue ? "positive" : "negative"}">${(player.marketValue ?? player.value) >= player.previousMarketValue ? "▲" : "▼"} ${formatMarketValue(Math.abs((player.marketValue ?? player.value) - player.previousMarketValue))}</small>` : ""}` : "—"}</b></div><div><small>CONTRACT</small><b>${player.contract?.wage ? `€${formatDecimal(player.contract.wage)} per week` : "—"}</b></div></div></section><section class="panel attributes-panel"><div class="panel-heading"><div><div class="eyebrow">ATTRIBUTE PROFILE</div><h2>Core attributes</h2></div><span class="live-tag">${player.attrs ? "PLAYER ATTRIBUTES" : "OVR ESTIMATE"}</span></div><div class="attribute-list">${ATTRIBUTES.map((attribute) => `<div class="attribute-row"><span>${attribute.toUpperCase()}</span><div class="attribute-bar"><i style="width:${attributes[attribute] ?? player.overall}%"></i></div><b>${attributes[attribute] ?? player.overall}</b></div>`).join("")}${player.position === "GK" ? GK_ATTRIBUTES.map((attribute) => `<div class="attribute-row"><span>${attribute.toUpperCase()}</span><div class="attribute-bar"><i style="width:${player.gkAttrs?.[attribute] ?? player.overall}%"></i></div><b>${player.gkAttrs?.[attribute] ?? player.overall}</b></div>`).join("") : ""}</div><p class="muted">${player.attrs ? "Attributes are read from this player's imported or simulated profile." : "This NPC is tracked by overall rating only; individual attributes are estimated from overall, not sourced player ratings."}</p></section></div></section>
    <section class="player-hub-section"><div class="section-heading"><div><div class="eyebrow">PLAYER STATISTICS</div><h2>Season & career totals</h2></div></div><div class="player-stat-panels"><section class="panel"><div class="panel-heading"><div><div class="eyebrow">CURRENT SEASON · ${esc(player.leagueName.toUpperCase())}</div><h2>League record</h2></div></div><div class="player-stat-grid"><div><b>${player.appearances}</b><small>APPS</small></div><div><b>${stats.starts ?? "—"}</b><small>STARTS</small></div><div><b>${player.goals}</b><small>GOALS</small></div><div><b>${player.assists}</b><small>ASSISTS</small></div><div><b>${stats.minutes ?? "—"}</b><small>MINUTES</small></div><div><b>${average}</b><small>AVG RATING</small></div><div><b>${stats.yellowCards ?? "—"}</b><small>YELLOW</small></div><div><b>${stats.redCards ?? "—"}</b><small>RED</small></div></div></section><section class="panel"><div class="panel-heading"><div><div class="eyebrow">DEVELOPMENT</div><h2>Player growth</h2></div></div><div class="player-stat-grid"><div><b>${player.overall}</b><small>OVERALL</small></div><div><b>${player.potential}</b><small>POTENTIAL</small></div><div><b>${Math.max(0, player.potential - player.overall)}</b><small>GROWTH ROOM</small></div><div><b>${player.age ?? "—"}</b><small>AGE</small></div></div></section></div></section>
    ${renderOtherPlayerHonours(player)}
    ${renderInternationalHistorySection(player)}
    <section class="player-hub-section"><div class="section-heading"><div><div class="eyebrow">OVR DEVELOPMENT</div><h2>Rating history</h2></div><span class="live-tag">${ratingHistory.length} CHANGES</span></div><section class="panel table-panel player-history-panel"><table class="history-table"><thead><tr><th>SEASON</th><th>OVR</th><th>CHANGE</th><th>REASON</th></tr></thead><tbody>${ratingHistoryRows || '<tr><td colspan="4" class="scorer-empty">No overall changes recorded yet.</td></tr>'}</tbody></table></section></section>
    <section class="player-hub-section"><div class="section-heading"><div><div class="eyebrow">PLAYER HISTORY</div><h2>Match history</h2></div><span class="live-tag">${matchHistory.length} RECORDED APPEARANCES</span></div><section class="panel table-panel player-history-panel"><table class="history-table"><thead><tr><th>DATE</th><th>COMPETITION</th><th>FIXTURE</th><th>SCORE</th><th>MINS</th><th>G</th><th>A</th><th>RTG</th><th>RESULT</th></tr></thead><tbody>${historyRows || `<tr><td colspan="9" class="scorer-empty">${appearances ? "This player's career totals are available, but detailed appearances are not tracked in the selected league data." : "No recorded appearances yet."}</td></tr>`}</tbody></table></section></section>`;
}

function renderOtherPlayerHonours(player) {
  // Look honours up through the career so a legend or a world-league player whose
  // trophies were recorded outside his own object still shows them here.
  const honours = career.getPlayerHonours
    ? career.getPlayerHonours(player)
    : (player.honours ?? []);
  const groups = groupHonours(honours);
  const total = totalTrophies(honours);
  return `<section class="panel trophy-case"><div class="panel-heading"><div><div class="eyebrow">CAREER HONOURS</div><h2>Trophy case</h2></div><span class="live-tag">${total} TROPH${total === 1 ? "Y" : "IES"}${groups.length > 1 ? ` · ${groups.length} TYPES` : ""}</span></div>${
    groups.length
      ? `<div class="trophy-grid">${groups
          .map((group) => {
            const years = seasonsLabel(group.seasons);
            return renderAwardCard(
              {
                award: group.award,
                winners: [
                  {
                    player: player.fullName,
                    playerId: player.id,
                    club: group.competition,
                  },
                ],
                value: `${group.count}× · ${years || "this season"}`,
                valueLabel: "",
                count: group.count,
                seasons: group.seasons,
              },
              group.latestSeason ?? group.seasons.at(-1),
            );
          })
          .join("")}</div>`
      : '<p class="muted">No recorded honours yet.</p>'
  }</section>`;
}

function finishLiveMatchForSimulation() {
  career.finishLiveMatchForSimulation();
}

function showSimProgress(label) {
  clearSimulationProgressTimers();
  const bar = $app?.querySelector("#sim-progress-bar");
  const fill = $app?.querySelector("#sim-progress-fill");
  const labelEl = $app?.querySelector("#sim-progress-label");
  if (!bar || !fill || !labelEl) return;
  bar.hidden = false;
  labelEl.textContent = label;
  fill.style.width = "0%";
  fill.style.background =
    "linear-gradient(90deg, var(--accent), var(--positive, #4caf50))";
  // The bar fills as the simulation ticks; it is cleared when the screen re-renders.
  let progress = 0;
  const tick = () => {
    simulationProgressTimer = null;
    progress = Math.min(95, progress + Math.random() * 18 + 4);
    fill.style.width = `${progress}%`;
    if (progress < 95)
      simulationProgressTimer = window.setTimeout(
        tick,
        60 + Math.random() * 120,
      );
  };
  simulationProgressTimer = window.setTimeout(tick, 120);
}

function hideSimProgress() {
  if (simulationProgressTimer != null) {
    window.clearTimeout(simulationProgressTimer);
    simulationProgressTimer = null;
  }
  if (simulationProgressCompleteTimer != null) {
    window.clearTimeout(simulationProgressCompleteTimer);
    simulationProgressCompleteTimer = null;
  }
  const bar = $app?.querySelector("#sim-progress-bar");
  const fill = $app?.querySelector("#sim-progress-fill");
  const labelEl = $app?.querySelector("#sim-progress-label");
  if (!bar || !fill || !labelEl) return;
  fill.style.width = "100%";
  fill.style.background = "var(--positive, #4caf50)";
  simulationProgressCompleteTimer = window.setTimeout(() => {
    simulationProgressCompleteTimer = null;
    bar.hidden = true;
    fill.style.width = "0%";
    fill.style.background = "";
    labelEl.textContent = "Simulating…";
  }, 260);
}

function clearSimulationProgressTimers() {
  if (simulationProgressTimer != null) {
    window.clearTimeout(simulationProgressTimer);
    simulationProgressTimer = null;
  }
  if (simulationProgressCompleteTimer != null) {
    window.clearTimeout(simulationProgressCompleteTimer);
    simulationProgressCompleteTimer = null;
  }
}

function handleAction(action, details = {}) {
  if (action === "dismiss") notice = "";
  if (action === "refresh-body") {
    if (typeof window.__refreshBodyPanel === "function")
      window.__refreshBodyPanel();
    return;
  }
  if (action === "game-back") {
    if (
      screen &&
      !["menu", "manager-create", "load-game", "settings", "credits"].includes(
        screen,
      )
    ) {
      screenScrollPositions.set(screen, captureGameScroll());
    }
    const previous = screenHistory.pop();
    screen = previous ?? (career?.isManagerCareer ? "manager" : "overview");
    isBackNavigation = true;
    notice = "";
    renderGame();
    return;
  }
  if (action === "start-manager") {
    career = null;
    managerDraft = defaultManagerDraft();
    screen = "manager-create";
    renderedScreen = null;
    screenHistory = [];
    screenScrollPositions.clear();
    window.scrollTo(0, 0);
    notice = "";
    renderGame();
    return;
  }
  if (action === "owner-request" && !career?.isManagerCareer) { notice = "Club management actions are only available in manager-career mode."; }
  if (action === "owner-request" && career?.isManagerCareer) {
    const request = career.createOwnerRequest();
    notice = `${request.label}: ${request.detail}`;
  }
  if (["owner-response", "start-investment", "recruit-scout", "create-scout-assignment", "sign-youth-prospect", "promote-academy-player", "release-academy-player", "hire-training-coach", "dismiss-training-coach", "assign-training-coach", "set-club-training", "refresh-training-market", "owner-fire-coach", "owner-appoint-coach", "refresh-coach-market"].includes(action) && career && !career.isManagerCareer) {
    notice = "This action is reserved for manager-career mode.";
  }
  if (action === "owner-response" && career?.isManagerCareer) {
    const accepted = career.respondToOwnerRequest(
      details.requestId,
      details.response,
    );
    notice = accepted
      ? `Board response recorded: ${details.response}.`
      : "That board request is no longer available.";
  }
  if (action === "start-investment" && career?.isManagerCareer) {
    try {
      const project = career.startClubInvestment(details.projectId);
      notice = `${project.projectId} upgrade approved. Construction completes on day ${project.completes}.`;
    } catch (error) {
      notice = `Could not start investment: ${error.message}`;
    }
  }
  if (action === "recruit-scout" && career?.isManagerCareer) {
    try {
      const scout = career.recruitScout(details.scoutId);
      notice = `${scout.name} recruited. The fee has been recorded in club finances.`;
    } catch (error) {
      notice = `Could not recruit scout: ${error.message}`;
    }
  }
  if (action === "create-scout-assignment" && career?.isManagerCareer) {
    try {
      const assignment = career.createScoutingAssignment({
        scoutId: details.scoutId,
        type: details.type,
        focus: details.type === "youth" ? "any" : undefined,
        durationWeeks: 4,
      });
      notice = `Scouting assignment started and completes on day ${assignment.completes}.`;
    } catch (error) {
      notice = `Could not start scouting: ${error.message}`;
    }
  }
  if (action === "shortlist-scouting-player" && career?.isManagerCareer) {
    try {
      career.shortlistScoutingPlayer(details.playerId);
      notice = "Player added to the scouting shortlist.";
    } catch (error) {
      notice = `Could not update shortlist: ${error.message}`;
    }
  }
  if (action === "sign-youth-prospect" && career?.isManagerCareer) {
    try {
      const player = career.signYouthProspect(details.prospectId);
      notice = `${player.first} ${player.last} joined the academy.`;
    } catch (error) {
      notice = `Could not sign prospect: ${error.message}`;
    }
  }
  if (action === "promote-academy-player" && career?.isManagerCareer) {
    try {
      const player = career.promoteAcademyPlayer(details.playerId);
      notice = `${player.first} ${player.last} promoted to the senior squad.`;
    } catch (error) {
      notice = `Could not promote player: ${error.message}`;
    }
  }
  if (action === "release-academy-player" && career?.isManagerCareer) {
    try {
      const player = career.releaseAcademyPlayer(details.playerId);
      notice = `${player.first} ${player.last} released from the academy.`;
    } catch (error) {
      notice = `Could not release player: ${error.message}`;
    }
  }
  if (action === "player-request" && career && !career.isManagerCareer) {
    try {
      const type = details.requestType;
      const result =
        type === "playing-time"
          ? career.requestPlayingTime(details.amount)
          : type === "better-teammates"
            ? career.requestBetterTeammates("", details.playerId)
            : career.requestTransfer(
                $app.querySelector("#player-transfer-target")?.value,
              );
      notice = result.response;
      if (type === "transfer" && result.approved)
        showCurrentClubAfterTransfer();
    } catch (error) {
      notice = `Could not complete the conversation: ${error.message}`;
    }
  }
  if (action === "talk-manager" && career && !career.isManagerCareer) {
    try {
      const topicDetails = {
        position: $app.querySelector("#coach-teammate-position")?.value,
        formation: $app.querySelector("#coach-formation")?.value,
      };
      const entry = career.talkToManager(details.topic, topicDetails);
      notice = `${entry.manager}: ${entry.response}`;
    } catch (error) {
      notice = `Could not start conversation: ${error.message}`;
    }
  }
  if ((action === "owner-fire-coach" || action === "owner-appoint-coach" || action === "refresh-coach-market") && career?.isManagerCareer) {
    try {
      if (action === "refresh-coach-market") {
        const coaches = career.refreshCoachMarket();
        notice = `${coaches.length} new coach candidates have entered the market.`;
      } else if (action === "owner-fire-coach") {
        const previousName = career.club.manager?.name ?? "the current coach";
        const result = career.fireCoach();
        notice = `The owner has dismissed ${previousName} and appointed ${result.replacement.name} as the replacement.`;
      } else {
        const coachId = $app.querySelector("#coach-market-select")?.value;
        const candidate = career.appointCoach(coachId);
        notice = `The owner has appointed ${candidate.name} as head coach.`;
      }
      screen = "conversation";
    } catch (error) {
      notice = error.message;
    }
  }
  if (action === "request-coach-dismissal" && career && !career.isManagerCareer) {
    try {
      const result = career.requestCoachDismissal();
      if (result.accepted) {
        notice = `The owner accepted your request. ${result.dismissed} dismissed and ${result.replacement.name} (${result.replacement.overall ?? result.replacement.rating}/99) appointed.`;
      } else {
        notice = result.message;
      }
      screen = "conversation";
    } catch (error) {
      notice = error.message;
    }
  }
  if (action === "retire-career" && career && !career.isManagerCareer) {
    try {
      const summary = career.retireCareer();
      notice = `${summary.name} has retired. ${summary.appearances} appearances, ${summary.goals} goals, ${summary.assists} assists.`;
      screen = "conversation";
    } catch (error) {
      notice = `Could not retire: ${error.message}`;
    }
  }
  if (action === "start-new") {
    career = null;
    screen = "overview";
    renderedScreen = null;
    screenHistory = [];
    screenScrollPositions.clear();
    window.scrollTo(0, 0);
    notice = "";
    renderCreation();
    return;
  }
  if (action === "load-game") {
    screen = "load-game";
    notice = "";
    renderGame();
    return;
  }
  if (action === "load-slot") {
    const slot = details.slot;
    try {
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
      if (!raw) throw new Error(`Save slot 0${slot} is empty.`);
      const saved = JSON.parse(raw);
      career = createCareer(data, saved.creation, saved);
      screen = resumeCareerScreen(career);
      renderedScreen = null;
      screenHistory = [];
      notice = career.isManagerCareer
        ? `Welcome back, ${career.managerState.first}.`
        : `Welcome back, ${career.player.first}.`;
      renderGame();
    } catch (error) {
      notice = `Could not load career: ${error.message}`;
      screen = "load-game";
      renderGame();
    }
    return;
  }
  if (action === "resume-autosave") {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) throw new Error("No autosave is available.");
      const saved = JSON.parse(raw);
      career = createCareer(data, saved.creation, saved);
      screen = resumeCareerScreen(career);
      renderedScreen = null;
      screenHistory = [];
      notice = career.isManagerCareer
        ? `Welcome back, ${career.managerState.first}.`
        : `Welcome back, ${career.player.first}.`;
      renderGame();
    } catch (error) {
      notice = `Could not resume autosave: ${error.message}`;
      renderMenu();
    }
    return;
  }
  if (action === "delete-slot") {
    localStorage.removeItem(`${SAVE_PREFIX}${details.slot}`);
    notice = `Slot 0${details.slot} deleted.`;
    screen = "load-game";
    renderGame();
    return;
  }
  if (action === "back-menu") {
    screen = "menu";
    renderGame();
    return;
  }
  if (action === "open-settings") {
    screen = "settings";
    notice = "";
    renderGame();
    return;
  }
  if (action === "open-credits") {
    screen = "credits";
    notice = "";
    renderGame();
    return;
  }
  if (action === "back-to-menu") {
    screen = "menu";
    notice = "";
    renderGame();
    return;
  }
  if (action === "exit-game") {
    career = null;
    screen = "menu";
    renderedScreen = null;
    screenHistory = [];
    screenScrollPositions.clear();
    notice = "Career cleared. Welcome back to the touchline.";
    renderGame();
    return;
  }
  if (action === "new-career") {
    career = null;
    screen = "overview";
    renderedScreen = null;
    screenHistory = [];
    screenScrollPositions.clear();
    window.scrollTo(0, 0);
    notice = "";
    renderCreation();
    return;
  }
  if (action === "advance" && !career.seasonComplete) {
    try {
      finishLiveMatchForSimulation();
      const report = career.advanceWeek();
      if (report.userMatch?.playerResult) {
        screen = "simulation";
        notice = `Matchday ${career.league.table.row(career.club.id).played + 1}: ready for kick-off.`;
      } else {
        const completedMatches = report.fixtures.filter(
          (fixture) => !fixture.pending,
        );
        if (completedMatches.length) {
          screen = "fixtures";
          notice = `${completedMatches.length} match results recorded. View the fixtures list for scores.`;
        } else {
          notice = `Week ${career.week + 1} complete. Training and recovery processed.`;
        }
      }
    } catch (error) {
      notice = error.message;
    }
  }
  if (action === "simulate-day" && !career.seasonComplete) {
    try {
      finishLiveMatchForSimulation();
      showSimProgress("Simulating one day…");
      const result = career.simulateOneDay();
      notice = `Day simulated: ${result.matchesSimulated} match results recorded (${result.leagueMatchesSimulated} league).`;
      hideSimProgress();
    } catch (error) {
      console.error("Simulation failed:", error);
      notice = "The day could not be simulated. Your career save is safe; please try again.";
      hideSimProgress();
    }
  }
  if (action === "simulate-half-season" && !career.seasonComplete) {
    try {
      finishLiveMatchForSimulation();
      showSimProgress("Simulating half season…");
      const result = career.simulateToHalfSeason();
      const place = result.leaguePosition
        ? ordinal(result.leaguePosition)
        : "—";
      notice = `Half-season simulation complete: ${result.weeksSimulated} matchdays simulated (${result.leagueMatchesSimulated} league). You are ${place}; your final stats are on the overview.`;
      hideSimProgress();
    } catch (error) {
      notice = error.message ||
        "The half-season simulation could not be completed. Your save is safe; please try again.";
      hideSimProgress();
    }
  }
  if (action === "toggle-fixture-stats") {
    expandedFixtureStatsId =
      expandedFixtureStatsId === details.fixtureId ? null : details.fixtureId;
  }
  if (action === "simulate-season" && !career.seasonComplete) {
    try {
      finishLiveMatchForSimulation();
      showSimProgress("Simulating to end of season…");
      const result = career.simulateToSeasonEnd();
      const place = result.leaguePosition
        ? ordinal(result.leaguePosition)
        : "—";
      notice = `Season simulated: ${result.matchesSimulated} matches completed (${result.leagueMatchesSimulated} league). You finished ${place}; your final stats are on the overview.`;
      hideSimProgress();
    } catch (error) {
      notice = error.message ||
        "The season simulation could not be completed. Your save is safe; please try again.";
      hideSimProgress();
    }
  }
  if (action === "next-match" && !career.seasonComplete) {
    try {
      const result = career.playNextScheduledMatch();
      if (result.played && career.lastReport?.userMatch?.playerResult) {
        const match = career.lastReport.userMatch;
        career.news.push(
          `${career.club.name} are ready to face ${match.opponent}.`,
        );
        notice = `${match.competitionName ?? career.league.name} match ready. Kick off from the Career hub to play it live.`;
      } else {
        notice = "The season is complete.";
      }
    } catch (error) {
      notice = error.message;
      renderGame();
      return;
    }
  }
  if (action === "train") {
    try {
      if (career.isManagerCareer) {
        career.setClubTrainingPlan({ programme: $app.querySelector("#club-training-programme")?.value, intensity: $app.querySelector("#club-training-intensity")?.value });
        notice = "Club training programme saved.";
      } else {
        const result = career.setTrainingFocus($app.querySelector("#training-focus")?.value ?? career.trainingFocus);
        notice = `Individual focus set to ${result.attribute}. Development happens gradually as the season advances.`;
      }
    } catch (error) { notice = error.message; }
  }
  if (action === "hire-training-coach") {
    try { const coach = career.hireTrainingCoach(details.coachId); notice = `${coach.name} hired for the ${coach.department} department.`; }
    catch (error) { notice = error.message; }
  }
  if (action === "dismiss-training-coach") {
    try { const coach = career.dismissTrainingCoach(details.coachId); notice = `${coach.name} dismissed.`; }
    catch (error) { notice = error.message; }
  }
  if (action === "refresh-training-market") {
    try { notice = `${career.refreshTrainingCoachMarket().length} coaches are available for recruitment.`; }
    catch (error) { notice = error.message; }
  }
  if (action === "assign-training-coach") {
    try { career.assignTrainingCoach(details.department, $app.querySelector(`#coach-assignment-${details.department}`)?.value); notice = `Training coach assigned to ${details.department}.`; }
    catch (error) { notice = error.message; }
  }
  if (action === "set-club-training") {
    try { career.setClubTrainingPlan({ programme: $app.querySelector("#club-training-programme")?.value, intensity: $app.querySelector("#club-training-intensity")?.value }); notice = "Club training programme updated."; }
    catch (error) { notice = error.message; }
  }
  if (action === "toggle-developer-mode") {
    if (career.developerMode) {
      career.setDeveloperMode(false);
      developerModePromptOpen = false;
      notice = "Developer mode disabled.";
    } else {
      developerModePromptOpen = true;
      notice = "";
    }
  }
  if (action === "cancel-developer-auth") {
    developerModePromptOpen = false;
    notice = "";
  }
  if (action === "upgrade-skill") {
    notice = "Weak foot and skill moves are not purchased with points.";
  }
  if (action === "hire-manager") {
    try {
      const manager = career.hireManager(details.manager);
      notice = `${manager.name} hired for €${formatDecimal(manager.cost)}. ${manager.style} tactics are now active.`;
    } catch (error) {
      notice = `Could not hire manager: ${error.message}`;
    }
  }
  if (action === "next-season") {
    try {
      const result = career.advanceSeason();
      screen = "overview";
      notice = `Welcome to the ${seasonLabel(result.season)} season.`;
    } catch (error) {
      notice = `Could not start the next season: ${error.message}`;
    }
  }
  if (
    action === "moment-decision" ||
    action === "moment-risk" ||
    action === "moment-safe"
  ) {
    try {
      const decision =
        action === "moment-decision"
          ? details.decision
          : action === "moment-risk"
            ? "take-risk"
            : "play-safe";
      const result = career.resolveKeyMoment(Number(details.index), decision);
      notice = `${result.action.label}: ${result.success ? "success" : "did not come off"} · ${Math.round(result.probability * 100)}% chance. The clock is running again.`;
    } catch (error) {
      notice = `Could not resolve key moment: ${error.message}`;
    }
  }
  if (action === "start-simulation") {
    try {
      career.startMatchSimulation();
      notice = "Kick-off. The clock will stop at each key moment.";
    } catch (error) {
      notice = `Could not start match: ${error.message}`;
    }
  }
  if (action === "skip-simulation") {
    try {
      finishLiveMatchForSimulation();
      notice = "Match skipped. Full-time result recorded.";
    } catch (error) {
      notice = `Could not skip match: ${error.message}`;
    }
  }
  if (action === "back-to-career") {
    screen = "overview";
    notice = "Full-time report saved. You can advance to the next week.";
  }
  if (action === "coach-profile") {
    viewedCoachId = details.coachId;
    screen = "coaches";
  }
  if (action === "back-to-coaches") {
    viewedCoachId = null;
    screen = "coaches";
  }
  if (action === "substitute-player") {
    try {
      const result = career.substitutePlayer();
      notice = `Substituted in the ${result.minute}th minute. ${result.substitute} is on.`;
    } catch (error) {
      notice = `Could not request substitution: ${error.message}`;
    }
  }
  if (action === "hire-agent") {
    try {
      const result = career.hireAgent(details.agentId);
      notice = `${result.agent.name} hired for €${formatDecimal(result.agent.fee)}.`;
    } catch (error) {
      notice = `Could not hire agent: ${error.message}`;
    }
  }
  if (action === "fire-agent") {
    try {
      career.fireAgent();
      notice = "Your agent has been released.";
    } catch (error) {
      notice = `Could not release agent: ${error.message}`;
    }
  }
  if (action === "refresh-offers") {
    try {
      const selectedClubId = $app.querySelector(
        "#agent-destination-club",
      )?.value;
      const searchAllClubs = details.searchAll === "true";
      if (!searchAllClubs && !selectedClubId)
        throw new Error("Choose a league and club first.");
      career.generateTransferOffers({
        clubIds: searchAllClubs ? [] : [selectedClubId],
      });
      notice = career.transferOffers.length
        ? `Your agent found ${career.transferOffers.length} credible club interest${career.transferOffers.length === 1 ? "" : "s"}.`
        : "No clubs have a strong enough squad need and budget to pursue you right now.";
    } catch (error) {
      notice = `Transfer search unavailable: ${error.message}`;
    }
  }
  if (action === "accept-offer") {
    try {
      const result = career.resolveTransferOffer(details.offerId, "accept");
      notice = result.accepted
        ? `Transfer accepted: ${result.offer.clubName}.`
        : "Transfer rejected.";
      if (result.accepted) showCurrentClubAfterTransfer();
    } catch (error) {
      notice = `Could not process transfer: ${error.message}`;
    }
  }
  if (action === "negotiate-offer") {
    wageNegotiationOfferId = details.offerId;
  }
  if (action === "cancel-wage-negotiation") {
    wageNegotiationOfferId = null;
  }
  if (action === "submit-wage-request") {
    try {
      const result = career.resolveTransferOffer(
        details.offerId,
        "negotiate-wage",
        { wage: details.wage },
      );
      wageNegotiationOfferId = null;
      notice = result.accepted
        ? `${result.offer.clubName} accepted your requested wage of €${formatDecimal(result.offer.wage)} per week. You can now accept the offer.`
        : `${result.offer.clubName} rejected your wage request. The original offer remains available.`;
    } catch (error) {
      notice = `Could not submit wage request: ${error.message}`;
    }
  }
  if (
    action === "reject-offer" ||
    action === "request-offer-role"
  ) {
    try {
      const decision =
        action === "reject-offer"
          ? "reject"
          : "request-role";
      const result = career.resolveTransferOffer(details.offerId, decision);
      notice = result.negotiated
        ? `Your agent has negotiated with ${result.offer.clubName}.`
        : `You rejected ${result.offer.clubName}'s offer.`;
    } catch (error) {
      notice = `Could not update offer: ${error.message}`;
    }
  }
  if (action === "buy-player") {
    try {
      const marketEntry = career
        .transferMarket()
        .find(({ player }) => player.id === details.playerId);
      if (!marketEntry) throw new Error("That player is no longer available.");
      const value = marketEntry.marketValue ?? marketEntry.player?.marketValue ?? marketEntry.player?.value ?? 0;
      const fee = Math.round(value * 1.08);
      const suggestedMonthly = Math.round(
        (marketEntry.player.contract?.wage ??
          marketEntry.player.overall * 900) * 4.33,
      );
      const answer = window.prompt(
        `Contract negotiation for ${marketEntry.player.first} ${marketEntry.player.last}\nTransfer fee payable: €${formatDecimal(fee)}\nEnter monthly salary (€):`,
        String(suggestedMonthly),
      );
      if (answer == null) throw new Error("Contract negotiation cancelled.");
      const monthlyWage = Math.max(0, Number(answer.replace(/[^0-9.-]/g, "")));
      if (!Number.isFinite(monthlyWage) || monthlyWage <= 0)
        throw new Error("Enter a valid monthly salary.");
      const weeklyWage = Math.round(monthlyWage / 4.33);
      career.buyPlayer(details.playerId, {
        fee,
        wage: weeklyWage,
      });
      screen = "transfers-list";
      notice = `${marketEntry.player.first} ${marketEntry.player.last} joined ${career.club.name} for €${formatDecimal(fee)}.`;
    } catch (error) {
      notice = `Could not complete transfer: ${error.message}`;
    }
  }
  if (action === "save") {
    try {
      const slot = $app.querySelector("#slot").value;
      const key = `${SAVE_PREFIX}${slot}`;
      try {
        writeCareerStorage(key, serializeCareerSave(false));
      } catch (error) {
        if (error?.name !== "QuotaExceededError") throw error;
        try {
          writeCareerStorage(key, serializeCareerSave(true));
        } catch (compactError) {
          if (compactError?.name !== "QuotaExceededError")
            throw compactError;
          // Autosave is duplicated browser storage. Release it first, then retry
          // the compact manual save without touching the other manual save slots.
          localStorage.removeItem(AUTOSAVE_KEY);
          writeCareerStorage(key, serializeCareerSave(true));
        }
      }
      notice = `Career saved to Slot 0${slot}.`;
    } catch (error) {
      notice =
        error?.name === "QuotaExceededError"
          ? "Browser storage is full. Delete an old save slot or clear browser site storage, then try again."
          : "The career could not be saved. Your current game is still running safely.";
    }
  }
  if (action === "load") {
    try {
      const slot = $app.querySelector("#slot").value;
      const raw = localStorage.getItem(`${SAVE_PREFIX}${slot}`);
      if (!raw) notice = `Slot 0${slot} is empty.`;
      else {
        const saved = JSON.parse(raw);
        career = createCareer(data, saved.creation, saved);
        screen = resumeCareerScreen(career);
        notice = `Career loaded from Slot 0${slot}.`;
      }
    } catch (error) {
      notice = `Could not load career: ${error.message}`;
    }
  }
  if (action === "delete") {
    try {
      const slot = $app.querySelector("#slot").value;
      localStorage.removeItem(`${SAVE_PREFIX}${slot}`);
      notice = `Slot 0${slot} deleted.`;
    } catch (error) {
      notice = `Could not delete save: ${error.message}`;
    }
  }
  if (
    screen === "simulation" &&
    [
      "start-simulation",
      "skip-simulation",
      "moment-decision",
      "moment-risk",
      "moment-safe",
      "substitute-player",
    ].includes(action)
  ) {
    refreshLiveMatchDisplay();
    updateLiveMatchNotice();
    persistAutosave();
    if (career.matchSimulation?.status === "running") {
      scheduleMatchSimulationTick();
    }
    return;
  }
  renderGame();
}

try {
  await loadData();
  for (const key of Object.keys(menuSettings)) {
    const saved = localStorage.getItem(`touchline-settings-${key}`);
    if (saved === "true") menuSettings[key] = true;
    if (saved === "false") menuSettings[key] = false;
  }
  screen = "menu";
  renderMenu();
  window.addEventListener("beforeunload", persistAutosave);
} catch (error) {
  console.error(error);
  $app.innerHTML = `<div class="fatal-error"><h1>Unable to load the game</h1><p>${esc(error.message)}</p><p>Check that the game is served over HTTP and all data files are available, then refresh.</p></div>`;
}
