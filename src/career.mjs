import {
  ageOn,
  fromDayIndex,
  seasonLabel,
  seasonWeeks,
  toDayIndex,
} from "./core/calendar.mjs";
import {
  ATTRIBUTES,
  ALL_SUB_ATTRIBUTES,
  GK_ATTRIBUTES,
  PERSONALITIES,
  personalityForPlayer,
  POSITIONS,
  RATING_MAX,
  RATING_MIN,
  SUB_ATTRIBUTES,
  SUB_ATTRIBUTE_GROUP,
  groupOf,
  normalizePosition,
  SIMILAR_POSITIONS,
} from "./core/constants.mjs";
import { Rng, RngBundle, hashString } from "./core/rng.mjs";

import { clamp, round, formatDecimal } from "./core/util.mjs";
import {
  calculateMarketValue,
  ensureClubFinance,
  financialSummary,
  marketValueForPlayer,
  processMatchdayRevenue,
  processWeeklyClubFinances,
  recordClubTransaction,
  syncPlayerMarketValue,
  transferPlayer,
} from "./core/finance.mjs";
import { Agent } from "./model/agent.mjs";
import {
  agentSearchTerms,
  assessClubSquadNeeds,
  scoreTransferSuitability,
  transferWindowForMonth,
} from "./model/transfer-market.mjs";
import {
  Club,
  Manager,
  MANAGER_STYLES,
  FORMATIONS,
  FORMATION_NAMES,
  COACH_STYLE_FORMATIONS,
  MIN_REGISTERED_SQUAD_SIZE,
  ensureSquadRegistration,
  realFormationFor,
  selectLineup,
  teamBoosterFor,
} from "./model/club.mjs";
import {
  ensureClubHierarchy,
  processWeeklyHierarchy,
  createOwnerRequest,
  respondToOwnerRequest,
  dismissClubManager,
  hierarchyTrainingModifier,
} from "./model/hierarchy.mjs";
import {
  aiInvestmentDecision,
  ensureClubInvestment,
  investmentModifiers,
  investmentOptions,
  processInvestmentWeek,
  startInvestment,
} from "./core/investment.mjs";
import {
  ensureClubScouting,
  scoutingSummary,
  hireScout,
  releaseScout,
  startScoutingAssignment,
  processScoutingWeek,
  shortlistPlayer,
  removeFromShortlist,
  availableScouts,
  scoutingRegions,
  scoutingFocuses,
  searchScoutingPlayers,
} from "./core/scouting.mjs";
import {
  ensureCoachProfile,
  chooseTacticalFormation,
  applyCoachTactics,
  developCoach,
  recordCoachMatch,
  tacticalRoles,
  academyState,
  acceptYouthProspect,
  releaseAcademyPlayer,
  developAcademy,
  generateCoachMarket,
} from "./core/coaching.mjs";
import { League, LeagueTable, planLeagueWeeks } from "./model/league.mjs";
import {
  TRAINING_DEPARTMENTS,
  TRAINING_PROGRAMMES,
  TRAINING_INTENSITIES,
  ensureClubTraining,
  processClubTrainingWeek,
  developPlayer,
  developAcademyPlayer,
  generateTrainingCoachMarket,
  hireTrainingCoach,
  dismissTrainingCoach,
  assignTrainingCoach,
  setClubTrainingPlan,
  manageAITrainingStaff,
  trainingGradeFor,
  createWorldTrainingClub,
} from "./core/training.mjs";
import {
  addStats,
  calculateOverall,
  applyPhysique,
  createPlayer,
  deriveSubAttrsFromGroups,
  ensureGoalkeeperAttributes,
  GK_WEIGHTS,
  physiqueProfile,
  physicalProfileFor,
  effectiveRating,
  emptyStats,
  generateAttributes,
  POSITION_WEIGHTS,
  preferredShirtNumbers,
  syncGroupsFromSubAttrs,
  updatePlayerOverall,
  recordOverallChange,
} from "./model/player.mjs";
import {
  DIRECT_GOALKEEPER_ATTRIBUTES,
  GOALKEEPER_ATTRIBUTES,
  goalkeeperOverall,
  goalkeeperQuality,
  goalkeeperSaveFactor,
} from "./model/goalkeeper.mjs";
import { primeProfileFor } from "./model/legends.mjs";
import { eliteProfileFor } from "./model/elite.mjs";
import {
  LEGENDS,
  LEGEND_OVERALL,
  honourKey,
  headlinerForClub,
  isHeadliner,
  legendForName,
  legendForClub,
  legendAllowedAt,
} from "./model/legends.mjs";
import { formAdjustedOverall } from "./model/form.mjs";
import {
  normalizeClubName,
  stadiumIdentityForClub,
} from "./model/stadiums.mjs";
import {
  ensurePlayStyles,
  playStyleEffect,
  awardPlayStyleEvidence,
  seedPlayStyles,
} from "./model/playstyles.mjs";
import {
  simulateNpcPerformance,
  rateNpcPerformance,
} from "./sim/playerintelligence.mjs";
import {
  applyStaminaRecovery,
  applyMatchStamina,
  ensureStamina,
} from "./model/stamina.mjs";
import {
  INJURY_SEVERITIES,
  createInjury,
  injurySeverityLabel,
  isInjured,
  matchInjuryChance,
  progressInjury,
  rollInjury,
  trainingInjuryChance,
} from "./sim/injury.mjs";
import { CATALOGUED_NATIONS, randomNameFor } from "./model/names.mjs";
import {
  drawGroups,
  emptyInternationalTable,
  NATION_NAMES,
  nationalTeamReputation,
  nationalTeamSelectionScore,
  roundRobinFixtures,
  selectNationalTeamSquad,
  sortInternationalTable,
  updateInternationalTable,
  WORLD_CUP_INTERVAL,
  WORLD_CUP_SQUAD_SIZE,
  WORLD_CUP_START_YEAR_OFFSET,
  worldCupQualificationRound,
  worldCupFixtureDay,
  worldCupFieldSize,
  worldCupSchedule,
} from "./model/international.mjs";
import {
  boardExpectationFor,
  createManagerState,
  judgeSeason,
  seasonTrophiesFor,
} from "./model/manager.mjs";
import { normalizePlayerNationality } from "./data/fc25-roster.mjs";
import expansionConfig from "../data/config/expanded-leagues.json" with { type: "json" };
import { simulateMatch, MAX_LEAGUE_GOALS } from "./sim/match.mjs";
import { simulatePossessionEngine } from "./sim/event-engine.mjs";
import {
  resolveMomentDecision,
  simulatePlayerMatch,
} from "./sim/playermatch.mjs";
import { expectedGoals, matchStrength } from "./sim/strength.mjs";
import {
  awardRecord,
  awardRace,
  awardRacePoints,
  positionAwardDefinition,
  runJournalistVoting,
} from "./model/awards.mjs";
import { applyPromotionRelegation } from "./model/europe.mjs";
import {
  CHAMPIONS_LEAGUE_PLACES,
  CHAMPIONS_LEAGUE_SCHEDULE,
  createChampionsLeague,
  normalizeChampionsLeagueSchedule,
  qualifyChampionsLeague,
  recordChampionsLeagueFixture,
  simulateChampionsLeague,
  simulateChampionsLeagueWeek,
} from "./model/champions-league.mjs";

const TRAINABLE_SUB_ATTRIBUTES = new Set(ALL_SUB_ATTRIBUTES);
// A keeper trains every goalkeeper attribute, not just the historical four.
const TRAINABLE_GK_ATTRIBUTES = new Set(GOALKEEPER_ATTRIBUTES);

function normalizedTrainingFocus(attribute, position) {
  if (normalizePosition(position) === "GK") {
    return TRAINABLE_GK_ATTRIBUTES.has(attribute) ? attribute : "reflexes";
  }
  const legacyGroup = SUB_ATTRIBUTES[attribute] ? attribute : null;
  const focus = legacyGroup ? SUB_ATTRIBUTES[legacyGroup][0] : attribute;
  return TRAINABLE_SUB_ATTRIBUTES.has(focus) ? focus : ALL_SUB_ATTRIBUTES[0];
}

/**
 * Personality bends the weekly development curve. Determined players grow a little
 * faster and more reliably; Lazy ones coast; Nervous ones are erratic week to week.
 * Returns a multiplier and an additive offset applied to the seasonal change.
 */
function personalityGrowthMod(personalities) {
  const list = Array.isArray(personalities) ? personalities : [personalities];
  const primary = list[0] ?? "Professional";
  switch (primary) {
    case "Determined":
      return { rate: 1.08, offset: 0.06 };
    case "Lazy":
      return { rate: 0.86, offset: -0.08 };
    case "Nervous":
      return { rate: 0.94, offset: 0.02 };
    case "Loyal":
      return { rate: 1.02, offset: 0.02 };
    case "Ambitious":
      return { rate: 1.05, offset: 0.04 };
    case "Professional":
    default:
      return { rate: 1, offset: 0 };
  }
}

/**
 * A world league has no full squad objects, so its coach picks a formation from his
 * philosophy alone (biased by prestige). This keeps formations consistent across every
 * league, even the ones simulated in aggregate rather than player-by-player.
 */
function coachStyleFor(entry, clubId, rating, season) {
  const identity = entry.clubIdentities?.[clubId];
  const styles =
    rating >= 78
      ? ["Possession", "High Press", "Counter", "Wing Play", "Tiki-Taka"]
      : rating >= 65
        ? ["Balanced", "Counter", "Wing Play", "Direct", "Low Block"]
        : ["Low Block", "Direct", "Counter", "Balanced"];
  return styles[
    hashString(
      `coach-style-${entry.id}-${clubId}-${season}-${identity?.name ?? ""}`,
    ) % styles.length
  ];
}

function coachFormationFor(entry, clubId, rating, season) {
  const identity = entry.clubIdentities?.[clubId];
  const realShape = realFormationFor(identity?.name ?? clubId, clubId);
  if (realShape) return realShape;
  const prestige = identity?.prestige ?? rating ?? 55;
  const stylePool =
    prestige >= 75
      ? ["Attacking", "High Press", "Balanced"]
      : prestige >= 60
        ? ["Balanced", "High Press", "Attacking", "Pragmatic"]
        : ["Defensive", "Pragmatic", "Balanced", "Youth"];
  const style =
    stylePool[
      hashString(`coach-${entry.id}-${clubId}-${season}`) % stylePool.length
    ];
  const shapes =
    COACH_STYLE_FORMATIONS[style] ?? COACH_STYLE_FORMATIONS.Balanced;
  return shapes[
    hashString(`shape-${entry.id}-${clubId}-${season}`) % shapes.length
  ];
}
const ONE_TIME_MATCH_SITUATIONS = [
  "The captain gives you a personal vote of confidence before kick-off.",
  "A youth player from the academy asks for a tip during the warm-up.",
  "Your family sends an encouraging message from the stands.",
  "A former coach is watching from the directors' box.",
  "The club celebrates a community project during the pre-match ceremony.",
  "A teammate dedicates their first appearance to the academy staff.",
  "The supporters unveil a banner welcoming you to the starting eleven.",
  "A local school team is invited to watch the match today.",
  "The captain asks you to lead the team talk for a minute.",
  "The stadium announcer recognizes your recent community work.",
];
const REPEATABLE_MATCH_SITUATIONS = [
  "A gust of wind briefly changes the flight of a long ball.",
  "The crowd starts a rhythmic chant that lifts the home end.",
  "A light shower makes the surface slick for a few minutes.",
  "A teammate calls for a quicker switch of play.",
  "The referee pauses play to check a player's equipment.",
  "A camera catches the away supporters waving their flags.",
  "A loose divot is replaced before the next restart.",
  "The ball is changed after losing pressure near the touchline.",
  "The fourth official signals a brief equipment check.",
  "A loud cheer follows a well-timed team press.",
  "The opposition changes its pressing shape from the sideline.",
  "A teammate offers a quick reminder about your defensive assignment.",
  "The crowd reacts to a close call near the penalty area.",
  "A short burst of rain sends players toward the touchline for towels.",
  "The referee reminds both captains to keep the restart moving.",
  "A well-worked passing move earns applause from both stands.",
  "The stadium screen replays a clean tackle from earlier in the half.",
  "The opposing bench calls for its midfield to sit deeper.",
  "A teammate points out space opening on the far side.",
  "The grounds crew clears a stray paper cup from the sideline.",
  "The crowd grows louder as the match enters its closing stages.",
  "A quick word from the coach refocuses the team's shape.",
  "The ball skids on the damp grass after a goalkeeper's clearance.",
  "A supporter waves a handmade shirt with your number on it.",
  "A teammate signals for a calmer spell of possession.",
  "The stadium lights brighten as the evening sky darkens.",
  "The referee checks that the goal net is secure before the restart.",
  "The opposition's winger switches sides to test the other flank.",
  "A near-post run draws a shout of approval from the crowd.",
  "The fourth official confirms the added-time board is ready.",
  "A teammate encourages you after a difficult first touch.",
  "The home crowd applauds a fair challenge from the visitors.",
  "A short chant from the away end answers the home supporters.",
  "The referee moves play a few steps away from a wet patch.",
  "The coach asks the midfield to keep its passing options close.",
  "A gust carries a corner kick just beyond the near post.",
  "A quick exchange between teammates opens a passing lane.",
  "The crowd applauds the goalkeeper's composed distribution.",
  "A substitute warms up near the touchline and gets the crowd going.",
  "The referee checks in with a player after a harmless collision.",
];
export const MATCH_SITUATIONS = [
  ...ONE_TIME_MATCH_SITUATIONS.map((text, index) => ({
    id: `once-${index + 1}`,
    text,
    once: true,
  })),
  ...REPEATABLE_MATCH_SITUATIONS.map((text, index) => ({
    id: `repeat-${index + 1}`,
    text,
    once: false,
  })),
];

function assignShirtNumbers(players, club, preserveExisting = false) {
  const assigned = new Set();
  const squad = club.squad
    .map((id) => players.find((player) => player.id === id))
    .filter(Boolean)
    .sort((left, right) => Number(right.isLegend) - Number(left.isLegend));
  for (const player of squad) {
    const number =
      ((preserveExisting || player.source === "real-world") &&
      Number.isInteger(player.shirtNumber) &&
      player.shirtNumber >= 1 &&
      player.shirtNumber <= 99 &&
      !assigned.has(player.shirtNumber)
        ? player.shirtNumber
        : null) ??
      [
        ...preferredShirtNumbers(player.position),
        ...Array.from({ length: 99 }, (_, index) => index + 1),
      ].find((candidate) => !assigned.has(candidate));
    if (number != null) {
      player.shirtNumber = number;
      assigned.add(number);
    } else if (
      !Number.isInteger(player.shirtNumber) ||
      player.shirtNumber < 1
    ) {
      player.shirtNumber = 99;
    }
  }
}

function releaseSquadPlayer(club, player, date) {
  if (
    !player ||
    player.isLegend ||
    player.clubId !== club.id ||
    !club.has(player.id)
  )
    throw new Error("That player cannot be released from this club.");
  if (club.squad.length <= MIN_REGISTERED_SQUAD_SIZE)
    throw new Error("The club must retain at least 20 registered players.");
  club.removePlayer(player.id);
  player.releasedFromClubId = club.id;
  player.clubId = null;
  player.squadStatus = "Free Agent";
  player.contract = {
    ...(player.contract ?? {}),
    wage: 0,
    expires: Number(date ?? 0),
  };
  return player;
}

export class Career {
  constructor(data, options, saved = null) {
    this.baseData = data;
    const selectedWorldLeague = options.leagueId
      ? data.careerLeagues?.find((entry) => entry.id === options.leagueId)
      : null;
    this.data = selectedWorldLeague
      ? this.dataForLeague(selectedWorldLeague)
      : data;
    data = this.data;
    this.creation = { ...options };
    this.seed = Number(options.seed) >>> 0;
    this.difficulty = options.difficulty ?? "Realistic";
    /**
     * Manager mode. When present, the human runs the club rather than playing in it:
     * the board, the dressing room and the supporters replace the player's trust, and
     * honours are trophies rather than awards. It is plain data, so it serialises with
     * the rest of the save and a player career simply has `managerState === null`.
     */
    this.managerState = options.managerMode
      ? createManagerState({
          ...(options.manager ?? options),
          leagueId: options.leagueId,
        })
      : null;
    this.isManagerCareer = !!this.managerState;
    this.rng = new RngBundle(this.seed);
    this.season = data.league.seasonStartYear;
    this.careerStartYear = this.season;
    this.seasonWeekCount = Math.max(
      56,
      52,
      data.league.seasonWeeks ?? 44,
      ...expansionConfig.leagues.map(
        (entry) =>
          2 * ((entry.teams?.length ?? entry.teamIds?.length ?? 0) - 1) +
          (entry.fixtureStartWeek ?? 3),
      ),
    );
    this.week = -1;
    const archetypeFocus =
      data.archetypes[options.position]?.[options.archetype]?.focus ??
      "passing";
    this.trainingFocus = normalizedTrainingFocus(
      archetypeFocus,
      options.position ?? "ST",
    );
    this.developerMode = false;
    this.matchRole = "Balanced";
    this.performanceDevelopmentProgress = 0;
    this.trainingMarketRefresh = 0;
    this.news = [];
    this.lastReport = null;
    this.results = [];
    this.currentObjective = null;
    this.playerId = `user-${this.seed.toString(36)}`;
    this.agentPool = this.buildAgents();
    this.agent = null;
    this.transferOffers = [];
    this.transferRefreshCount = 0;
    this.transferMarketState = {
      season: this.season,
      window: null,
      searchCount: 0,
      lastSearchDay: null,
    };
    this.agentPerformance = {};
    this.transferHistory = [];
    this.transferRumours = [];
    this.positionNeedCache = null;
    this.nextCpuTransferEvaluationWeek = 0;
    this._forceCpuTransferEvaluation = false;
    this.matchSimulation = null;
    this.usedSituationIds = [];
    this.worldPlayerDevelopment = {};
    this.conversationHistory = [];
    this.careerEnded = false;
    this.championsLeague = null;
    this.generatedEliteIds = [];
    this.populationTracking = {
      seasonIntroduced: {},
      retired: {},
    };

    this.expansionLeagues = expansionConfig.leagues;
    this.worldCareerLeagues = this.buildCareerWorldLeagues(options.leagueId);
    this.league = data.league;
    this.clubs = this.buildClubs();
    this.players = this.buildSquads();
    for (const club of this.clubs) ensureClubTraining(club, this.seed, this.season);
    for (const player of this.players) {
      if (player.first === "Lionel" && player.last === "Messi") {
        player.position = "AM";
        player.altPositions = ["ST", "RW", "LW"];
        player.displayPosition = "CAM";
      }
      const league = this.worldCareerLeagues.find((entry) =>
        entry.league.teamIds.includes(player.clubId),
      );
      if (league) player.leagueId = league.league.id;
    }
    this.syncAllPlayerMarketValues({ season: this.season, dayIndex: this.currentDay(), initialize: true });
    this.expansionPlayers = [];
    this.worldCupNpcPlayers = [];
    this.leagueHistories = {};
    this.seasonHistory = [];
    for (const club of this.clubs) {
      ensureClubInvestment(club);
      ensureClubFinance(club);
      ensureClubScouting(club, this.seed);
      ensureCoachProfile(club);
      ensureClubTraining(club, this.seed, this.season);
      if (club.id !== options.clubId) aiInvestmentDecision(club, toDayIndex(this.season, 7, 1));
      academyState(club);
      if (!club.academy.players.length) {
        const academyRng = this.rng.stream(`academy-intake-${club.id}`);
        for (let index = 0; index < 2; index++) {
          const position = academyRng.pick(["GK", "CB", "CM", "ST"]);
          const rating = clamp(
            Math.round((club.prestige ?? 50) * 0.42 + academyRng.int(10, 24)),
            32,
            52,
          );
          const attributes = generateAttributes(academyRng, position, rating);
          club.academy.players.push(
            createPlayer({
              id: `academy-${club.id}-${this.season}-${index + 1}`,
              first: this.nameForNationality(academyRng, club.nation).first,
              last: this.nameForNationality(academyRng, club.nation).last,
              nationality: club.nation,
              dob: toDayIndex(this.season - academyRng.int(15, 18), 6, 1),
              position,
              attrs: attributes.attrs,
              subAttrs: attributes.subAttrs,
              gkAttrs: attributes.gkAttrs,
              potential: clamp(rating + academyRng.int(8, 20), rating + 5, 82),
              clubId: club.id,
              stats: emptyStats(),
              status: "academy",
              plan: "Balanced development",
              morale: 65,
            }),
          );
        }
      }
      ensureClubHierarchy(club, `${this.seed}-${club.id}`);
      if (!options.managerMode && club.hierarchy.manager) {
        const head = club.hierarchy.manager;
        club.manager.name = head.name;
        club.manager.nationality = head.nationality;
        club.manager.style = head.style;
        club.manager.rating = head.rating;
      }
    }
    this.player = this.createCareerPlayer(options);
    this.player.contract = {
      ...(this.player.contract ?? {}),
      wage: data.careerSettings.finance.startingWeeklyWage,
    };
    this.money = data.careerSettings.finance.startingBalance;
    this.financialHistory = [];
    this.lastFanReaction = null;
    this.players.push(this.player);
    for (const player of this.players) {
      player.careerStats = { ...player.stats };
      player.leaguePerformance = { apps: 0, ratingSum: 0 };
    }
    this.club = this.clubs.find((club) => club.id === options.clubId);
    if (!this.club) throw new Error(`Unknown starting club: ${options.clubId}`);
    this.club.isUserClub = true;
    this.club.addPlayer(this.player.id);
    this.club.isUserClub = true;
    this.player.clubId = this.club.id;
    this.ensureSquadSizes();
    for (const club of this.clubs) assignShirtNumbers(this.players, club);
    // In manager mode the human is the coach, so his chosen style is the club's style
    // and he picks the shape — not an AI head coach.
    if (this.managerState) {
      this.club.manager.style = this.managerState.style;
      this.club.manager.name = `${this.managerState.first} ${this.managerState.last}`;
      this.club.manager.nationality = this.managerState.nationality;
      this.club.hierarchy.manager = {
        ...this.club.hierarchy.manager,
        name: this.club.manager.name,
        nationality: this.club.manager.nationality,
        style: this.club.manager.style,
      };
    }
    // Every club's head coach now picks the shape that fits his squad.
    this.applyCoachFormations();
    this.worldCareerLeagues = this.refreshWorldCareerLeagues();
    this.league = this.buildLeague();
    this.leagueHistories ??= {};
    this.leagueHistories[this.league.id] ??= this.league.history;
    this.data = { ...this.data, careerLeagues: this.worldCareerLeagues };
    this.league = this.buildLeague();
    this.worldLeagues = this.buildWorldLeagues();
    for (const state of this.worldLeagues ?? []) {
      for (const player of state.performers ?? []) {
        if (player.first === "Lionel" && player.last === "Messi") {
          player.position = "AM";
          player.altPositions = ["ST", "RW", "LW"];
          player.displayPosition = "CAM";
        }
      }
    }
    this.applyExpansionSquads();
    for (const state of this.worldLeagues) {
      for (const performer of state.performers ?? []) {
        this.ensureWorldPlayerModel(performer);
        performer.overall = performer.isLegend ? LEGEND_OVERALL : calculateOverall(performer);
        performer.baseOverall = performer.overall;
      }
    }
    this.reconcileSquadMembership();
    this.ensureWorldCupMajorNationPlayers();
    this.worldCup = worldCupSchedule(this.careerStartYear);
    this.initializeWorldCupQualification();
    if (this.managerState) {
      this.managerState.season = this.season;
      this.managerState.clubId = this.club.id;
      this.managerState.leagueId = this.league.id;
    }
    this.seasonAwardHistory = [];
    this.currentSeasonAwards = null;
    this.ballonDorCeremonies = [];
    this.ballonDorWatchlist = [];
    this.ballonDorShortlist = [];
    this.managerCandidates = [
      {
        id: "manager-attacking",
        name: "Luca Moretti",
        style: "Attacking",
        rating: 78,
        cost: 18000,
      },
      {
        id: "manager-balanced",
        name: "Amara Diallo",
        style: "Balanced",
        rating: 82,
        cost: 32000,
      },
      {
        id: "manager-youth",
        name: "Sofia Keller",
        style: "Youth",
        rating: 75,
        cost: 14000,
      },
      {
        id: "manager-press",
        name: "Daniel Okoye",
        style: "High Press",
        rating: 86,
        cost: 50000,
      },
    ];
    this.hiredManagerId = null;
    this.coachMarket = generateCoachMarket(this.seed, this.season, 12);
    this.coachAppointments = { season: this.season, count: 0 };

    if (saved) this.restore(saved);
    // One authority for the base overall: derived from attributes, never above potential.
    this.enforcePotentialCeiling();
    this.enforceGeneratedOverallLimit();
  }

  developWorldPlayers() {
    const finalDay =
      this.calendar.at(-1)?.matchday ?? toDayIndex(this.season, 12, 31);
    const developed = new Set();
    for (const state of this.worldLeagues) {
      for (const player of state.performers ?? []) {
        if (player.isLegend || developed.has(player.id)) continue;
        developed.add(player.id);
        let club =
          this.clubs.find((item) => item.id === player.clubId) ??
          (() => {
            state.trainingClubs ??= {};
            return (state.trainingClubs[player.clubId] ??=
              createWorldTrainingClub(
                player.clubId,
                state.clubRatings?.[player.clubId] ?? 55,
              ));
          })();
        if (!state.trainingClubs && this.clubs.includes(club)) {
          state.trainingClubs ??= {};
          state.trainingClubs[club.id] = club;
        }
        const training = ensureClubTraining(club, this.seed, this.season);
        if (!this.clubs.includes(club)) aiInvestmentDecision(club, finalDay);
        manageAITrainingStaff(
          club,
          finalDay,
          this.seed + this.season,
          this.season,
        );
        const wageEvent = `world-training-wages-${this.season}-${club.id}`;
        const annualWages =
          training.coaches.reduce(
            (total, coach) => total + coach.weeklySalary,
            0,
          ) * 52;
        if (annualWages && !club.finances.processedEvents.includes(wageEvent))
          recordClubTransaction(club, {
            id: wageEvent,
            date: finalDay,
            category: "training staff",
            description: "Background club annual training staff wages",
            expense: annualWages,
          });
        if (player.lastDevelopmentSeason === this.season) continue;
        player.age = Number(player.age ?? 25) + 1;
        this.ensureWorldPlayerModel(player);
        const report = developPlayer(
          player,
          club,
          this.rng.stream(`development-${this.season}-${player.id}`),
          this.season,
          {
            appearances: player.apps ?? 0,
            minutes: (player.apps ?? 0) * 75,
            ratingSum: player.ratingSum ?? (player.apps ?? 0) * 6.5,
            date: finalDay,
          },
        );
        this.worldPlayerDevelopment[player.id] = {
          ...(this.worldPlayerDevelopment[player.id] ?? {}),
          overall: player.overall,
          age: player.age,
          potential: player.potential,
          developmentProgress: player.developmentProgress,
          lastDevelopmentSeason: this.season,
          developmentHistory: player.developmentHistory ?? [],
          developmentReportHistory: player.developmentReportHistory ?? [],
        };
      }
    }
    this.enforceGeneratedOverallLimit();
  }

  ensureWorldPlayerModel(player) {
    if (
      player.isLegend ||
      (player.attrs && player.subAttrs && player.gkAttrs)
    ) {
      return player;
    }
    const target = clamp(Number(player.overall) || 60, 40, 99);
    const generated = generateAttributes(
      this.rng.stream(`world-attributes-${player.id}`),
      player.position,
      target,
    );
    player.attrs = player.attrs
      ? { ...generated.attrs, ...player.attrs }
      : generated.attrs;
    player.subAttrs ??= deriveSubAttrsFromGroups(player.attrs);
    player.gkAttrs ??= generated.gkAttrs;
    updatePlayerOverall(player, "NPC rating migration", {
      ceiling: player.potential ?? 99,
    });
    return player;
  }

  adjustWorldPlayerAttributes(player, direction) {
    const groups =
      player.position === "GK"
        ? ["reflexes", "positioning", "handling", "diving", "kicking", "speed"]
        : ["shooting", "passing", "defending", "physical", "dribbling", "pace"];
    const rng = this.rng.stream(
      `world-attribute-growth-${player.id}-${this.season}`,
    );
    const attribute = rng.pick(groups);
    if (
      player.position === "GK" &&
      ["reflexes", "positioning", "handling", "kicking"].includes(attribute)
    ) {
      player.gkAttrs[attribute] = clamp(
        (player.gkAttrs[attribute] ?? 50) + direction,
        1,
        99,
      );
    } else if (
      player.position === "GK" &&
      ["diving", "speed"].includes(attribute)
    ) {
      const source = attribute === "diving" ? "reflexes" : "pace";
      if (source === "pace")
        player.attrs.pace = clamp((player.attrs.pace ?? 50) + direction, 1, 99);
      else
        player.gkAttrs.reflexes = clamp(
          (player.gkAttrs.reflexes ?? 50) + direction,
          1,
          99,
        );
    } else {
      player.attrs[attribute] = clamp(
        (player.attrs[attribute] ?? 50) + direction,
        1,
        99,
      );
      const sub = SUB_ATTRIBUTES[attribute]?.[0];
      if (sub)
        player.subAttrs[sub] = clamp(
          (player.subAttrs[sub] ?? 50) + direction,
          1,
          99,
        );
    }
  }

  /**
   * Retire old world-league performers and replace them with generated prospects, so
   * every league in the world ages and refreshes the same way the user's league does.
   */
  retireAndReplaceWorldPlayers() {
    const rng = this.rng.stream("world-retirement");
    for (const state of this.worldLeagues) {
      const kept = [];
      const retiredIds = new Set();
      for (const player of state.performers) {
        const age = player.age ?? 25;
        const faded = age >= 34 && (player.developmentProgress ?? 0) <= 0;
        const legend = player.isLegend;
        if (!legend && (age >= 38 || (faded && rng.chance((age - 33) / 6)))) {
          const tracking = (this.populationTracking ??= {
            seasonIntroduced: {},
            retired: {},
          });
          tracking.retired[this.season] =
            (tracking.retired[this.season] ?? 0) + 1;
          const retiredPlayer = this.players.find(
            (item) => item.id === player.id,
          );
          const club = this.clubs.find((item) => item.id === player.clubId);
          retiredIds.add(player.id);
          if (retiredPlayer) {
            club?.removePlayer(retiredPlayer.id);
            this.players = this.players.filter(
              (item) => item.id !== retiredPlayer.id,
            );
            this.expansionPlayers = this.expansionPlayers.filter(
              (item) => item.id !== retiredPlayer.id,
            );
          }
          // Replace with a young prospect in the same position, nationality and name pool.
          const nationality = this.pickNationality(
            rng,
            player.nationality ?? state.league.nation,
          );
          const { first, last } = this.nameForNationality(rng, nationality);
          kept.push({
            id: `world-regen-${player.clubId}-${this.season}-${player.position}-${rng.int(1000, 9999)}`,
            first,
            last,
            nationality,
            position: player.position,
            overall: clamp(
              this.season <= 1 ? rng.int(70, 84) : rng.int(55, 75),
              55,
              84,
            ),
            age: rng.int(16, 20),
            potential: clamp(
              (state.clubRatings[player.clubId] ?? 62) + rng.int(6, 18),
              45,
              97,
            ),
            developmentProgress: 0,
            clubId: player.clubId,
            source: "generated-expansion",
            apps: 0,
            goals: 0,
            assists: 0,
            ratingSum: 0,
            lastMatchRating: null,
            ratingHistory: [],
            developmentHistory: [],
            developmentReportHistory: [],
            lastDevelopmentSeason: null,
            honours: [],
          });
          if (retiredPlayer) {
            const generatedRecord = kept.at(-1);
            const generatedAttrs = generateAttributes(
              rng,
              player.position,
              generatedRecord.overall,
            );
            const replacement = createPlayer({
              id: generatedRecord.id,
              first: generatedRecord.first,
              last: generatedRecord.last,
              nationality: generatedRecord.nationality,
              dob: toDayIndex(this.season - generatedRecord.age, 1, 1),
              position: player.position,
              archetype: this.pickArchetypeForPosition(rng, player.position),
              attrs: generatedAttrs.attrs,
              subAttrs: generatedAttrs.subAttrs,
              gkAttrs: generatedAttrs.gkAttrs,
              potential: generatedRecord.potential,
              clubId: player.clubId,
              source: "generated-expansion",
            });
            this.players.push(replacement);
            this.expansionPlayers.push(replacement);
            club?.addPlayer(replacement.id);
            kept[kept.length - 1] = replacement;
            const tracking = (this.populationTracking ??= {
              seasonIntroduced: {},
              retired: {},
            });
            tracking.seasonIntroduced[this.season] =
              (tracking.seasonIntroduced[this.season] ?? 0) + 1;
          }
        } else {
          kept.push(player);
        }
      }
      state.performers = kept;
      for (const retiredId of retiredIds) {
        state.trainingClubs ??= {};
        const staff = state.trainingClubs[retiredId];
        if (staff?.training) {
          const wages =
            staff.coaches.reduce(
              (sum, coach) => sum + Number(coach.weeklySalary ?? 0),
              0,
            ) * 52;
          if (wages)
            recordClubTransaction(staff, {
              id: `world-training-wages-${this.season}-${retiredId}`,
              date: this.calendar.at(-1)?.matchday ?? null,
              category: "training staff",
              description: "Background club annual training staff wages",
              expense: wages,
            });
        }
      }
      for (const performer of kept) {
        if (
          !performer.source?.startsWith("generated") ||
          this.players.some((player) => player.id === performer.id)
        )
          continue;
        const club = this.clubs.find((item) => item.id === performer.clubId);
        const replacement = createPlayer({
          id: performer.id,
          first: performer.first,
          last: performer.last,
          nationality: performer.nationality,
          dob: toDayIndex(this.season - (performer.age ?? 18), 1, 1),
          position: performer.position,
          archetype:
            performer.position && this.data.archetypes[performer.position]
              ? this.pickArchetypeForPosition(rng, performer.position)
              : null,
          attrs: generateAttributes(rng, performer.position, performer.overall)
            .attrs,
          potential: performer.potential,
          clubId: performer.clubId,
          source: "generated-expansion",
          contract: { wage: Math.round((club?.wageBudget ?? 300000) / 30) },
        });
        this.players.push(replacement);
        this.expansionPlayers.push(replacement);
        club?.addPlayer(replacement.id);
      }
    }
  }

  dataForLeague(entry) {
    return {
      ...this.baseData,
      league: entry.league,
      clubs: {
        ...this.baseData.clubs,
        [entry.league.clubGroup]: entry.clubIdentities,
      },
      careerLeagues: this.worldCareerLeagues ?? this.baseData.careerLeagues,
      squadTemplate: {
        ...this.baseData.squadTemplate,
        nationality: entry.league.nation,
        realPlayersByClub: entry.rostersByClub,
      },
    };
  }

  buildWorldLeagues() {
    return (this.worldCareerLeagues ?? this.data.careerLeagues ?? [])
      .filter(
        (entry) =>
          (entry.league.tier ?? 1) === 1 &&
          entry.league.id !== this.league.id &&
          entry.league.name !== this.league.name,
      )
      .map((entry) => {
        const league = new League({ ...entry.league, season: this.season });
        const history = this.leagueHistories?.[entry.league.id];
        if (history?.length) league.history = history;
        league.buildFixtures(
          this.rng.stream(`world-schedule-${entry.id}-${this.season}`),
        );
        this.scheduleDomesticLeague(league);
        const clubRatings = Object.fromEntries(
          league.teamIds.map((id) => {
            const identity = entry.clubIdentities[id];
            if (!identity)
              throw new Error(
                `League ${entry.league.name} references missing club "${id}".`,
              );
            return [
              id,
              // A club with a resident legend (Real Madrid, FC Barcelona) is an elite
              // side: the boost makes them win their league far more often.
              clamp(
                Math.round(
                  55 +
                    (identity.prestige ?? 50) * 0.32 +
                    (legendForClub(id) ? 6 : 0),
                ),
                48,
                91,
              ),
            ];
          }),
        );
        // Every world club gets a coach who picks a shape, so formations matter here too.
        const clubFormations = Object.fromEntries(
          league.teamIds.map((id) => [
            id,
            coachFormationFor(entry, id, clubRatings[id], this.season),
          ]),
        );
        const trainingClubs = Object.fromEntries(league.teamIds.map((id) => {
          const previousStaff = this.worldLeagues?.find((state) => state.league.id === league.id)?.trainingClubs?.[id];
          return [id, previousStaff ?? createWorldTrainingClub(id, clubRatings[id])];
        }));
        const clubTactics = Object.fromEntries(
          league.teamIds.map((id) => [
            id,
            coachStyleFor(entry, id, clubRatings[id], this.season),
          ]),
        );
        const performers = league.teamIds.flatMap((clubId) => {
          const roster = entry.rostersByClub[clubId] ?? [];
          const existingSquad =
            entry.league.id === this.league.id
              ? this.players.filter((player) => player.clubId === clubId)
              : [];
          const players = [...existingSquad, ...roster]
            .filter((record) => {
              // A legend never appears for a club other than his own.
              const legend = record.playerId
                ? null
                : legendForName(`${record.first} ${record.last}`);
              return (
                !legend ||
                legendAllowedAt(`${record.first} ${record.last}`, clubId)
              );
            })
            .map((record) => {
              const id = record.playerId ?? `real-${clubId}-${record.id}`;
              const existingPlayer = existingSquad.find(
                (player) => player.id === id,
              );
              if (existingPlayer) return existingPlayer;
              const legend = record.playerId
                ? null
                : legendForName(`${record.first} ${record.last}`);
              const development = legend
                ? {}
                : (this.worldPlayerDevelopment[id] ?? {});
              const hasCsvAttrs =
                !legend &&
                record.attrs &&
                Object.values(record.attrs).some((value) => value != null);
              const model =
                hasCsvAttrs && record.position !== "GK"
                  ? null
                  : generateAttributes(
                      this.rng.stream(`world-attributes-${id}`),
                      record.position,
                      development.overall ?? record.overall,
                    );
              const previous = this.worldLeagues
                ?.flatMap((worldState) => worldState.performers ?? [])
                .find(
                  (performer) =>
                    performer.id === id ||
                    (legend &&
                      performer.isLegend &&
                      performer.clubId === clubId),
                );
              const attrs = previous?.attrs ?? (hasCsvAttrs ? record.attrs : (model?.attrs ?? null));
              const subAttrs = previous?.subAttrs ?? (hasCsvAttrs ? (record.subAttrs ?? deriveSubAttrsFromGroups(record.attrs)) : (model?.subAttrs ?? null));
              const gkAttrs = previous?.gkAttrs ??
                (hasCsvAttrs && record.position === "GK"
                  ? ensureGoalkeeperAttributes(record.gkAttrs ?? {}, {
                      ...record.attrs,
                      overall: record.overall,
                    })
                  : (model?.gkAttrs ?? null));
              const overallAdjustment = hasCsvAttrs ? Number(record.overall) - calculateOverall({ position: record.position, attrs, subAttrs, gkAttrs, overallAdjustment: 0 }) : null;
              const calculatedOverall = hasCsvAttrs
                ? Number(record.overall)
                : (development.overall ??
                  calculateOverall({
                    position: record.position,
                    attrs: model?.attrs ?? record.attrs,
                    subAttrs: model?.subAttrs,
                    gkAttrs: model?.gkAttrs,
                  }));
              return {
                id,
                first: record.first,
                last: record.last,
                fullName: record.fullName ?? `${record.first} ${record.last}`.trim(),
                nickname: record.nickname ?? null,
                nationality: record.nationality,
                dob: record.dob,
                shirtNumber: legend?.shirtNumber ?? record.shirtNumber,
                foot: legend?.foot ?? record.foot,
                weakFoot: legend?.weakFoot ?? record.weakFoot,
                skillMoves: legend?.skillMoves ?? record.skillMoves,
                height: legend?.height ?? record.height,
                weight: legend?.weight ?? record.weight,
                archetype: legend?.archetype ?? record.archetype,
                personality: [
                  legend?.personality ??
                    record.personality ??
                    personalityForPlayer(
                      record.first,
                      record.last,
                      record.position,
                      record.overall,
                    ),
                ],
                attrs,
                subAttrs,
                gkAttrs,
                source: record.source ?? "real-world",
                overallAdjustment: previous?.overallAdjustment ?? overallAdjustment,
                dataStatus: record.dataStatus,
                dataSource: record.dataSource,
                value: legend?.value ?? record.value,
                wage: legend?.wage ?? record.wage,
                position: record.position,
                traits: record.traits ?? [],
                altPositions: record.altPositions ?? [],
                displayPosition:
                  record.first === "Lionel" && record.last === "Messi"
                    ? "CAM"
                    : undefined,
                overall: legend
                  ? LEGEND_OVERALL
                  : calculatedOverall,
                age: legend
                  ? 25
                  : (development.age ??
                    (record.dob != null
                      ? ageOn(record.dob, this.currentDay())
                      : Number(record.age) || 25)),
                potential: legend
                  ? LEGEND_OVERALL
                  : (development.potential ??
                    (Number(record.potential) ||
                      Math.min(99, Number(record.overall) + 6))),
                lastDevelopmentSeason:
                  development.lastDevelopmentSeason ??
                  previous?.lastDevelopmentSeason ??
                  null,
                developmentProgress: legend ? 1 : (development.developmentProgress ?? 0),
                developmentHistory: development.developmentHistory ?? previous?.developmentHistory ?? [],
                developmentReportHistory: development.developmentReportHistory ?? previous?.developmentReportHistory ?? [],
                clubId,
                isLegend: !!legend,
                playStyles: previous?.playStyles ?? {
                  unlocked: [],
                  progress: {},
                  history: [],
                },
                traits: record.traits ?? [],
                form: previous?.form ?? 50,
                confidence: previous?.confidence ?? 60,
                fitness: previous?.fitness ?? 100,
                fatigue: previous?.fatigue ?? 0,
                stamina: previous?.stamina ?? null,
                sharpness: previous?.sharpness ?? 70,
                apps: previous?.apps ?? 0,
                goals: previous?.goals ?? 0,
                assists: previous?.assists ?? 0,
                ratingSum: previous?.ratingSum ?? 0,
                lastMatchRating: previous?.lastMatchRating ?? null,
                ratingHistory: previous?.ratingHistory ?? [],
                developmentHistory: previous?.developmentHistory ?? [],
                developmentReportHistory:
                  previous?.developmentReportHistory ?? [],
                lastDevelopmentSeason:
                  previous?.lastDevelopmentSeason ??
                  development.lastDevelopmentSeason ??
                  null,
                attrs:
                  previous?.attrs ??
                  (hasCsvAttrs ? record.attrs : model?.attrs),
                subAttrs:
                  previous?.subAttrs ??
                  (hasCsvAttrs
                    ? (record.subAttrs ??
                      deriveSubAttrsFromGroups(record.attrs))
                    : model?.subAttrs),
                gkAttrs:
                  previous?.gkAttrs ??
                  (record.position === "GK"
                    ? ensureGoalkeeperAttributes(record.gkAttrs ?? {}, {
                        ...record.attrs,
                        overall: record.overall,
                      })
                    : (record.gkAttrs ?? model?.gkAttrs ?? {})),
                overallAdjustment:
                  previous?.overallAdjustment ?? overallAdjustment,
                matchHistory: previous?.matchHistory ?? [],
                internationalStats: previous?.internationalStats,
                internationalHistory: previous?.internationalHistory ?? [],
                internationalAchievements:
                  previous?.internationalAchievements ?? [],
                internationalReputation: previous?.internationalReputation ?? 0,
                worldCupAppearances: previous?.worldCupAppearances ?? 0,
                honours: previous?.honours ?? [],
                contract:
                  previous?.contract ??
                  ((legend?.wage ?? record.wage)
                    ? {
                        wage: legend?.wage ?? record.wage,
                        expires:
                          (legend?.contractYears ?? record.contractYears) ==
                          null
                            ? null
                            : this.season +
                              (legend?.contractYears ?? record.contractYears),
                      }
                    : null),
                cards: previous?.cards ?? { yellow: 0, red: 0 },
                injuryHistory: previous?.injuryHistory ?? [],
              };
            });
          const fillerRng = this.rng.stream(
            `world-filler-${league.id}-${clubId}-${this.season}`,
          );
          const homeNation = entry.league.nation;
          while (players.length < 20) {
            const index = players.length;
            const id = `world-generated-${clubId}-${index + 1}`;
            const previous = this.worldLeagues
              ?.flatMap((worldState) => worldState.performers ?? [])
              .find((performer) => performer.id === id);
            const development = this.worldPlayerDevelopment[id] ?? {};
            const nationality = this.pickNationality(fillerRng, homeNation);
            const generatedName = this.nameForNationality(
              fillerRng,
              nationality,
            );
            const position =
              previous?.position ??
              this.data.squadTemplate.positions[
                index % this.data.squadTemplate.positions.length
              ];
            const overall =
              development.overall ??
              previous?.overall ??
              clamp(
                this.season <= 1
                  ? 70 + ((index * 3) % 15)
                  : fillerRng.int(55, 75),
                55,
                84,
              );
            const model =
              previous?.attrs && previous?.subAttrs && previous?.gkAttrs
                ? {
                    attrs: previous.attrs,
                    subAttrs: previous.subAttrs,
                    gkAttrs: previous.gkAttrs,
                  }
                : generateAttributes(fillerRng, position, overall);
            players.push({
              id,
              first: previous?.first ?? generatedName.first,
              last: previous?.last ?? generatedName.last,
              nationality: previous?.nationality ?? nationality,
              position,
              altPositions:
                previous?.altPositions ??
                SIMILAR_POSITIONS[normalizePosition(position)] ??
                [],
              ...model,
              overall: calculateOverall({ position, ...model }),
              source: "generated",
              playStyles: previous?.playStyles ?? {
                unlocked: [],
                progress: {},
                history: [],
              },
              age:
                development.age ??
                previous?.age ??
                (this.season <= 1
                  ? 18 + ((index + league.teamIds.indexOf(clubId)) % 17)
                  : 16 + ((index + league.teamIds.indexOf(clubId)) % 6)),
              potential:
                development.potential ??
                previous?.potential ??
                Math.min(
                  96,
                  Math.max(
                    overall + 5,
                    Math.min(
                      overall + fillerRng.int(5, 16),
                      clubRatings[clubId] + 12,
                    ),
                  ),
                ),
              developmentProgress:
                development.developmentProgress ??
                previous?.developmentProgress ??
                0,
              lastDevelopmentSeason:
                development.lastDevelopmentSeason ??
                previous?.lastDevelopmentSeason ??
                null,
              developmentHistory:
                development.developmentHistory ??
                previous?.developmentHistory ??
                [],
              developmentReportHistory:
                development.developmentReportHistory ??
                previous?.developmentReportHistory ??
                [],
              potentialTrajectory: previous?.potentialTrajectory ?? (previous?.potential != null ? Math.max(0, (previous.potential - overall) * 5) : fillerRng.int(15, 75)),
              source: previous?.source ?? "generated",
              clubId,
              apps: 0,
              goals: 0,
              assists: 0,
              ratingSum: 0,
              lastMatchRating: null,
              ratingHistory: previous?.ratingHistory ?? [],
              matchHistory: previous?.matchHistory ?? [],
              internationalStats: previous?.internationalStats,
              internationalHistory: previous?.internationalHistory ?? [],
              internationalAchievements:
                previous?.internationalAchievements ?? [],
              internationalReputation: previous?.internationalReputation ?? 0,
              worldCupAppearances: previous?.worldCupAppearances ?? 0,
              honours: previous?.honours ?? [],
              form: previous?.form ?? 50,
              confidence: previous?.confidence ?? 60,
              fitness: previous?.fitness ?? 100,
              fatigue: previous?.fatigue ?? 0,
              stamina: previous?.stamina ?? null,
              sharpness: previous?.sharpness ?? 70,
            });
          }
          if (entry.league.id === this.league.id) {
            const registeredIds = new Set(players.map((player) => player.id));
            players.push(
              ...existingSquad.filter(
                (player) => !registeredIds.has(player.id),
              ),
            );
          }
          return players;
        });
        return { league, clubRatings, clubFormations, clubTactics, trainingClubs, performers };
      });
  }

  /**
   * Recompute every player's base overall from detailed attributes. Potential is
   * a development estimate, not an OVR cap; temporary form remains a separate layer.
   */
  enforcePotentialCeiling() {
    for (const player of this.players ?? []) {
      if (player.isLegend) {
        player.overall = LEGEND_OVERALL;
        player.potential = LEGEND_OVERALL;
        continue;
      }
      updatePlayerOverall(player, "Save migration");
      player.ratingHistory ??= [];
      player.developmentHistory ??= [];
      player.developmentReportHistory ??= [];
    }
  }

  enforceGeneratedOverallLimit() {
    const players = new Map();
    for (const player of [
      ...(this.players ?? []),
      ...(this.expansionPlayers ?? []),
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
    ]) {
      if (
        player.id &&
        !player.isLegend &&
        player.id !== this.player?.id &&
        ["generated", "generated-expansion"].includes(player.source)
      ) {
        const instances = players.get(player.id) ?? [];
        if (!instances.includes(player)) instances.push(player);
        players.set(player.id, instances);
      }
    }

    const eliteIds = this.ensureGeneratedElitePlayers(players);
    const ranked = [...players.entries()]
      .map(([id, instances]) => ({
        id,
        instances,
        overall: Math.max(
          ...instances.map((player) => calculateOverall(player)),
        ),
      }))
      .sort((a, b) => b.overall - a.overall);

    for (const candidate of ranked) {
      if (candidate.overall < 90 || eliteIds.has(candidate.id)) continue;
      for (const player of candidate.instances) {
        if (calculateOverall(player) < 90) continue;
        this.ensureWorldPlayerModel(player);
        const target = Math.min(89, player.potential ?? 99);
        let attempts = 0;
        while (calculateOverall(player) > target && attempts++ < 2000) {
          this.adjustWorldPlayerAttributes(player, -1);
        }
        updatePlayerOverall(player, "Generated player rating limit", {
          season: this.season,
          ceiling: target,
        });
      }
      const development = this.worldPlayerDevelopment[candidate.id];
      if (development)
        development.overall = Math.min(
          ...candidate.instances.map((player) => player.overall),
        );
    }
  }

  ensureGeneratedElitePlayers(generatedPlayers = null) {
    const players =
      generatedPlayers ??
      new Map(
        [
          ...(this.players ?? []),
          ...(this.expansionPlayers ?? []),
          ...(this.worldLeagues ?? []).flatMap(
            (state) => state.performers ?? [],
          ),
        ]
          .filter(
            (player) =>
              player.id &&
              !player.isLegend &&
              player.id !== this.player?.id &&
              ["generated", "generated-expansion"].includes(player.source),
          )
          .reduce((groups, player) => {
            const instances = groups.get(player.id) ?? [];
            if (!instances.includes(player)) instances.push(player);
            groups.set(player.id, instances);
            return groups;
          }, new Map()),
      );
    const availableIds = new Set(players.keys());
    this.generatedEliteIds = [
      ...new Set(
        (this.generatedEliteIds ?? []).filter((id) => availableIds.has(id)),
      ),
    ].slice(0, 4);
    if (this.generatedEliteIds.length >= 4) {
      for (const id of this.generatedEliteIds.slice(0, 4)) {
        for (const player of players.get(id) ?? []) {
          player.potential = Math.max(90, Number(player.potential) || 0);
          const development = this.worldPlayerDevelopment?.[id];
          if (development) development.potential = player.potential;
        }
      }
      return new Set(this.generatedEliteIds.slice(0, 4));
    }

    const teamRatings = new Map();
    for (const state of this.worldLeagues ?? []) {
      for (const [clubId, rating] of Object.entries(state.clubRatings ?? {}))
        teamRatings.set(clubId, rating);
    }
    for (const club of this.clubs ?? []) {
      if (teamRatings.has(club.id)) continue;
      teamRatings.set(
        club.id,
        clamp(Math.round(55 + (club.prestige ?? 50) * 0.32), 48, 91),
      );
    }

    const candidates = [...players.entries()]
      .filter(([id]) => !this.generatedEliteIds.includes(id))
      .map(([id, instances]) => {
        const player = instances[0];
        return {
          id,
          instances,
          clubId: player.clubId,
          teamRating: teamRatings.get(player.clubId) ?? 60,
          potential: Math.max(
            ...instances.map((instance) => Number(instance.potential) || 0),
          ),
          overall: Math.max(
            ...instances.map((instance) => calculateOverall(instance)),
          ),
        };
      })
      .sort(
        (a, b) =>
          a.teamRating - b.teamRating ||
          b.potential - a.potential ||
          b.overall - a.overall ||
          a.id.localeCompare(b.id),
      );
    const chosenClubs = new Set(
      [...this.generatedEliteIds]
        .map((id) => players.get(id)?.[0]?.clubId)
        .filter(Boolean),
    );
    for (const candidate of candidates) {
      if (this.generatedEliteIds.length >= 4) break;
      if (chosenClubs.has(candidate.clubId)) continue;
      this.generatedEliteIds.push(candidate.id);
      chosenClubs.add(candidate.clubId);
    }
    for (const candidate of candidates) {
      if (this.generatedEliteIds.length >= 4) break;
      if (this.generatedEliteIds.includes(candidate.id)) continue;
      this.generatedEliteIds.push(candidate.id);
    }

    for (const id of this.generatedEliteIds) {
      for (const player of players.get(id) ?? []) {
        player.potential = Math.max(90, Number(player.potential) || 0);
        const development = this.worldPlayerDevelopment?.[id];
        if (development) development.potential = player.potential;
      }
    }
    return new Set(this.generatedEliteIds.slice(0, 4));
  }

  /**
   * Weekly training injuries for the user's league. Runs before the fixtures, so a player
   * hurt in training this week is unavailable for selection in it. Physicality is the
   * main shield: a strong player shrugs off what sidelines a frail one.
   */
  rollTrainingInjuries() {
    const rng = this.rng.stream(
      `training-injuries-${this.season}-${this.week}`,
    );
    for (const player of this.players) {
      if (player.injury || player.isLegend) continue;
      if (
        player.clubId !== this.club.id &&
        !this.club?.squad.includes(player.id)
      )
        continue;
      const chance = trainingInjuryChance(player, 1);
      const injury = rollInjury(player, rng, { chance });
      if (!injury) continue;
      player.injury = injury;
      if (player.id === this.player.id) {
        this.news.push(
          `${player.first} ${player.last} picked up a ${injury.label.toLowerCase()} in training and will miss ${injury.weeks} week${injury.weeks === 1 ? "" : "s"}.`,
        );
      }
    }
  }

  /**
   * Injuries for the other playable leagues. Their squads are tracked as light-weight
   * performers, so this keeps the same rule (physicality decides the risk) without a
   * full attribute line: physical is read from the performer when present and otherwise
   * estimated from overall, which is how those squads are modelled anyway.
   */
  rollWorldLeagueInjuries() {
    const rng = this.rng.stream(`world-injuries-${this.season}-${this.week}`);
    for (const state of this.worldLeagues) {
      for (const player of state.performers ?? []) {
        if (player.isLegend) continue;
        // One week passes for everyone: a recovered player is back, an injured one is
        // one week closer to fitness.
        progressInjury(player);
        if (player.injury) continue;
        const physical =
          player.attrs?.physical ??
          clamp((player.overall ?? 65) + (player.physicalOffset ?? 0), 30, 95);
        const chance = matchInjuryChance({ ...player, attrs: { physical } }, 1);
        const injury = rollInjury(player, rng, { chance });
        if (injury) player.injury = injury;
      }
    }
  }

  internationalPlayers() {
    const players = new Map();
    for (const player of [
      ...(this.players ?? []),
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
      ...(this.expansionPlayers ?? []),
      ...(this.worldCupNpcPlayers ?? []),
    ]) {
      if (player?.id && player.nationality && !players.has(player.id))
        players.set(player.id, player);
    }
    return [...players.values()];
  }

  ensureWorldCupMajorNationPlayers() {
    const rosters = {
      ESP: [
        ["GK", "Unai", "Simon", 87, 1997],
        ["CB", "Aymeric", "Laporte", 87, 1994],
        ["LB", "Alejandro", "Balde", 84, 2003],
        ["CDM", "Rodri", "Hernandez", 90, 1996],
        ["CM", "Pedri", "Gonzalez", 90, 2002],
        ["CM", "Fabian", "Ruiz", 86, 1996],
        ["RW", "Lamine", "Yamal", 89, 2007],
        ["LW", "Nico", "Williams", 84, 2002],
        ["ST", "Alvaro", "Morata", 83, 1992],
      ],
      FRA: [
        ["GK", "Mike", "Maignan", 87, 1995],
        ["CB", "William", "Saliba", 87, 2001],
        ["CB", "Ibrahima", "Konate", 86, 1999],
        ["LB", "Theo", "Hernandez", 86, 1997],
        ["CDM", "Aurelien", "Tchouameni", 87, 2000],
        ["CM", "Eduardo", "Camavinga", 86, 2002],
        ["RW", "Ousmane", "Dembele", 90, 1997],
        ["RW", "Michael", "Olise", 87, 2001],
        ["ST", "Kylian", "Mbappe", 91, 1998],
      ],
      NED: [
        ["GK", "Bart", "Verbruggen", 84, 2002],
        ["CB", "Virgil", "van Dijk", 89, 1991],
        ["CB", "Stefan", "de Vrij", 82, 1992],
        ["LB", "Micky", "van de Ven", 85, 2001],
        ["RB", "Jeremie", "Frimpong", 84, 2000],
        ["CDM", "Frenkie", "de Jong", 87, 1997],
        ["CM", "Xavi", "Simons", 84, 2003],
        ["LW", "Cody", "Gakpo", 86, 1999],
        ["ST", "Memphis", "Depay", 83, 1993],
      ],
      ENG: [
        ["GK", "Jordan", "Pickford", 84, 1994],
        ["CB", "John", "Stones", 85, 1994],
        ["LB", "Luke", "Shaw", 83, 1995],
        ["CDM", "Declan", "Rice", 87, 1999],
        ["CM", "Jude", "Bellingham", 90, 2003],
        ["CM", "Phil", "Foden", 88, 2000],
        ["AM", "Cole", "Palmer", 87, 2002],
        ["RW", "Bukayo", "Saka", 88, 2001],
        ["ST", "Harry", "Kane", 90, 1993],
      ],
      POR: [
        ["GK", "Diogo", "Costa", 87, 1999],
        ["CB", "Ruben", "Dias", 89, 1997],
        ["LB", "Nuno", "Mendes", 87, 2002],
        ["CM", "Vitinha", "Ferreira", 89, 2000],
        ["CM", "Bruno", "Fernandes", 87, 1994],
        ["CAM", "Bernardo", "Silva", 89, 1994],
        ["LW", "Rafael", "Leao", 87, 1999],
        ["ST", "Cristiano", "Ronaldo", 86, 1985],
        ["ST", "Joao", "Felix", 84, 1999],
      ],
      RSA: [
        ["GK", "Ronwen", "Williams", 84, 1992],
        ["CB", "Mbekezeli", "Mbokazi", 75, 2005],
        ["LB", "Fawaaz", "Basadien", 80, 1996],
        ["DM", "Thalente", "Mbatha", 76, 2000],
        ["CM", "Sphephelo", "Sithole", 77, 1999],
        ["LW", "Relebohile", "Mofokeng", 79, 2004],
        ["RW", "Patrick", "Maswanganyi", 78, 1998],
        ["ST", "Lyle", "Foster", 80, 2000],
        ["ST", "Evidence", "Makgopa", 77, 2000],
      ],
      ARG: [
        ["GK", "Emiliano", "Martinez", 87, 1992],
        ["CB", "Cristian", "Romero", 87, 1998],
        ["LB", "Nicolas", "Tagliafico", 84, 1992],
        ["CM", "Enzo", "Fernandez", 84, 2001],
        ["CM", "Alexis", "Mac Allister", 86, 1998],
        ["CAM", "Lionel", "Messi", 88, 1987],
        ["LW", "Julian", "Alvarez", 86, 2000],
        ["ST", "Lautaro", "Martinez", 89, 1997],
      ],
      BRA: [
        ["GK", "Alisson", "Becker", 89, 1992],
        ["CB", "Marquinhos", "Correa", 88, 1994],
        ["LB", "Gabriel", "Magalhaes", 86, 1997],
        ["CM", "Bruno", "Guimaraes", 86, 1997],
        ["LW", "Vinicius", "Junior", 90, 2000],
        ["RW", "Raphinha", "Dias", 87, 1996],
        ["ST", "Rodrygo", "Goes", 88, 2001],
      ],
      GER: [
        ["GK", "Manuel", "Neuer", 87, 1986],
        ["CB", "Antonio", "Rudiger", 88, 1993],
        ["CM", "Joshua", "Kimmich", 88, 1995],
        ["CM", "Florian", "Wirtz", 89, 2003],
        ["LW", "Jamal", "Musiala", 90, 2003],
        ["RW", "Kai", "Havertz", 86, 1999],
        ["ST", "Niclas", "Fullkrug", 83, 1993],
      ],
      ITA: [
        ["GK", "Gianluigi", "Donnarumma", 89, 1999],
        ["CB", "Alessandro", "Bastoni", 87, 1999],
        ["CB", "Giovanni", "Di Lorenzo", 84, 1993],
        ["CM", "Nicolo", "Barella", 87, 1997],
        ["LW", "Federico", "Chiesa", 84, 1997],
        ["RW", "Matteo", "Politano", 83, 1993],
        ["ST", "Gianluca", "Scamacca", 82, 1999],
      ],
    };

    this.worldCupNpcPlayers ??= [];
    const normalizedName = (first, last) =>
      `${first ?? ""}-${last ?? ""}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");

    for (const [nation, specs] of Object.entries(rosters)) {
      const existing = new Set(
        this.internationalPlayers()
          .filter((player) => player.nationality === nation)
          .map((player) => normalizedName(player.first, player.last)),
      );
      for (const [position, first, last, overall, birthYear] of specs) {
        const nameKey = normalizedName(first, last);
        if (existing.has(nameKey)) continue;
        const id = `world-cup-fc27-${nation.toLowerCase()}-${nameKey}`;
        if (this.worldCupNpcPlayers.some((player) => player.id === id))
          continue;
        const attributes = generateAttributes(
          this.rng.stream(`fc27-major-roster-${nation}-${nameKey}`),
          position,
          overall,
        );
        const player = createPlayer({
          id,
          first,
          last,
          nationality: nation,
          dob: toDayIndex(birthYear, 6, 15),
          position,
          ...physicalProfileFor(
            this.rng.stream(`fc27-major-physical-${nation}-${nameKey}`),
            position,
          ),
          attrs: attributes.attrs,
          subAttrs: attributes.subAttrs,
          gkAttrs: attributes.gkAttrs,
          potential: clamp(overall + 4, overall, 95),
          baseOverall: overall,
          source: "fc27-estimated",
          squadStatus: "World Cup Player",
          displayPosition:
            first === "Lionel" && last === "Messi" ? "CAM" : undefined,
          altPositions:
            first === "Lionel" && last === "Messi"
              ? ["ST", "RW", "LW"]
              : undefined,
        });
        player.overall = overall;
        player.baseOverall = overall;
        this.worldCupNpcPlayers.push(player);
        existing.add(nameKey);
      }
    }
  }

  internationalClubLevels() {
    const levels = Object.fromEntries(
      this.clubs.map((club) => [club.id, club.prestige ?? 50]),
    );
    for (const entry of this.worldCareerLeagues ?? []) {
      for (const [clubId, identity] of Object.entries(
        entry.clubIdentities ?? {},
      )) {
        levels[clubId] = identity.prestige ?? 50;
      }
    }
    return levels;
  }

  fillNationalSquadGaps(players, nation, clubLevels) {
    if (selectNationalTeamSquad(players, nation, clubLevels)) return;

    const groups = [
      { positions: ["GK"], target: 3, roster: ["GK", "GK", "GK"] },
      {
        positions: ["CB", "LB", "RB"],
        target: 8,
        roster: ["CB", "CB", "CB", "CB", "LB", "LB", "RB", "RB"],
      },
      {
        positions: ["DM", "CDM", "CM", "AM", "CAM", "LM", "RM"],
        target: 8,
        roster: ["CM", "CM", "CM", "CM", "DM", "DM", "AM", "AM"],
      },
      {
        positions: ["LW", "RW", "ST"],
        target: 7,
        roster: ["ST", "ST", "ST", "LW", "LW", "RW", "RW"],
      },
    ];
    const eligible = players.filter(
      (player) =>
        player.nationality === nation &&
        player.id &&
        !player.retired &&
        !player.internationalRetired,
    );
    const knownIds = new Set(players.map((player) => player.id));
    const ratedPlayers = eligible.map((player) => Number(player.overall) || 50);
    const baseline = ratedPlayers.length
      ? clamp(
          Math.round(
            (ratedPlayers.reduce((sum, rating) => sum + rating, 0) /
              ratedPlayers.length) *
              0.72,
          ),
          48,
          68,
        )
      : 58;
    const rng = this.rng.stream(`world-cup-national-squad-${nation}`);
    const generated = [];

    for (const group of groups) {
      const count = eligible.filter((player) =>
        group.positions.includes(normalizePosition(player.position)),
      ).length;
      const missing = Math.max(0, group.target - count);
      for (let index = 0; index < missing; index++) {
        const rosterIndex = count + index;
        const position = group.roster[rosterIndex % group.roster.length];
        const id = `national-npc-${nation}-${position}-${rosterIndex + 1}`;
        if (knownIds.has(id)) continue;
        const age = rng.int(18, 30);
        const attributes = generateAttributes(rng, position, baseline);
        const name = this.nameForNationality(rng, nation);
        const npc = createPlayer({
          id,
          first: name.first,
          last: name.last,
          nationality: nation,
          dob: toDayIndex(this.season - age, rng.int(1, 12), rng.int(1, 28)),
          position,
          ...physicalProfileFor(rng, position),
          attrs: attributes.attrs,
          subAttrs: attributes.subAttrs,
          gkAttrs: attributes.gkAttrs,
          potential: clamp(baseline + rng.int(2, 12), baseline, 88),
          source: "generated-national-team",
          squadStatus: "National Team NPC",
        });
        generated.push(npc);
        knownIds.add(id);
      }
    }

    players.push(...generated);
    this.worldCupNpcPlayers.push(...generated);
    if (!selectNationalTeamSquad(players, nation, clubLevels)) {
      // Never let one small/partially catalogued nation abort a career simulation.
      // Keep the eligible real players first, then fill every missing group slot
      // so qualification and tournament calendars can continue for 20+ seasons.
      const existing = players.filter(
        (player) =>
          player.nationality === nation &&
          !player.retired &&
          !player.internationalRetired,
      );
      const emergency = [];
      for (const group of groups) {
        const count = existing.filter((player) =>
          group.positions.includes(normalizePosition(player.position)),
        ).length;
        for (let index = count; index < group.target; index++) {
          const position = group.roster[index % group.roster.length];
          const name = this.nameForNationality(rng, nation);
          const id = `national-emergency-${nation}-${position}-${index + 1}`;
          if (knownIds.has(id)) continue;
          const attributes = generateAttributes(rng, position, baseline);
          const npc = createPlayer({
            id,
            first: name.first,
            last: name.last,
            nationality: nation,
            dob: toDayIndex(
              this.season - rng.int(18, 30),
              rng.int(1, 12),
              rng.int(1, 28),
            ),
            position,
            ...physicalProfileFor(rng, position),
            attrs: attributes.attrs,
            subAttrs: attributes.subAttrs,
            gkAttrs: attributes.gkAttrs,
            potential: clamp(baseline + 8, baseline, 88),
            source: "generated-national-team",
            squadStatus: "National Team NPC",
          });
          emergency.push(npc);
          existing.push(npc);
          knownIds.add(id);
        }
      }
      for (let index = existing.length; index < WORLD_CUP_SQUAD_SIZE; index++) {
        const group = groups[index % groups.length];
        const position = group.roster[index % group.roster.length];
        const name = this.nameForNationality(rng, nation);
        const id = `national-emergency-${nation}-${position}-${index + 1}`;
        if (knownIds.has(id)) continue;
        const attributes = generateAttributes(rng, position, baseline);
        const npc = createPlayer({
          id,
          first: name.first,
          last: name.last,
          nationality: nation,
          dob: toDayIndex(
            this.season - rng.int(18, 30),
            rng.int(1, 12),
            rng.int(1, 28),
          ),
          position,
          ...physicalProfileFor(rng, position),
          attrs: attributes.attrs,
          subAttrs: attributes.subAttrs,
          gkAttrs: attributes.gkAttrs,
          potential: clamp(baseline + 8, baseline, 88),
          source: "generated-national-team",
          squadStatus: "National Team NPC",
        });
        emergency.push(npc);
        existing.push(npc);
        knownIds.add(id);
      }
      players.push(...emergency);
      this.worldCupNpcPlayers.push(...emergency);
    }
  }

  initializeWorldCupQualification() {
    if (this.worldCup?.qualification) return this.worldCup.qualification;
    const players = this.internationalPlayers();
    const clubLevels = this.internationalClubLevels();
    const nations = new Set([
      ...CATALOGUED_NATIONS,
      ...players
        .map((player) => String(player.nationality ?? "").toUpperCase())
        .filter(Boolean),
    ]);
    for (const code of nations)
      this.fillNationalSquadGaps(players, code, clubLevels);
    const teams = [...nations]
      .map((code) => {
        let selected = selectNationalTeamSquad(players, code, clubLevels);
        if (!selected) {
          this.fillNationalSquadGaps(players, code, clubLevels);
          selected = selectNationalTeamSquad(players, code, clubLevels);
          if (!selected) return null;
        }
        const name = NATION_NAMES[code] ?? code;
        const manager = this.internationalManager(code);
        const average =
          selected.reduce(
            (sum, entry) => sum + Number(entry.player.overall ?? 50),
            0,
          ) / selected.length;
        return {
          id: code,
          code,
          name,
          rating: Math.round(average),
          manager: { ...manager },
        };
      })
      .filter(Boolean);
    const fieldSize = worldCupFieldSize(teams.length);
    if (!fieldSize) {
      this.worldCup.qualification = {
        year: this.worldCup.nextYear,
        fieldSize: 0,
        groups: [],
        fixtures: [],
        status: "unavailable",
        message:
          "There are not enough countries with complete 26-player squads.",
        roundsPlayed: 0,
      };
      return this.worldCup.qualification;
    }
    const groupCount = Math.ceil(teams.length / 5);
    const groupSize = Math.ceil(teams.length / groupCount);
    const groups = drawGroups(
      teams,
      groupSize,
      this.rng.stream(`world-cup-qualifying-draw-${this.worldCup.nextYear}`),
    );
    for (const group of groups)
      group.table = emptyInternationalTable(group.teams);
    this.worldCup.qualification = {
      year: this.worldCup.nextYear,
      fieldSize,
      groups,
      fixtures: roundRobinFixtures(
        groups,
        `world-cup-qualifier-${this.worldCup.nextYear}`,
      ),
      status: "in-progress",
      roundsPlayed: 0,
      qualified: [],
    };
    return this.worldCup.qualification;
  }

  internationalManager(code) {
    this.worldCup.nationalManagers ??= {};
    if (this.worldCup.nationalManagers[code])
      return this.worldCup.nationalManagers[code];
    const styles = [
      "Possession",
      "Counter",
      "High Press",
      "Balanced",
      "Low Block",
      "Wing Play",
    ];
    const rng = this.rng.stream(`national-manager-${code}`);
    const name = randomNameFor(rng, code);
    const manager = {
      name: `${name.first} ${name.last}`,
      style: rng.pick(styles),
      tacticalIntelligence: rng.int(48, 92),
      selectionIntelligence: rng.int(45, 93),
      substitutionIntelligence: rng.int(45, 90),
      developmentAbility: rng.int(45, 90),
    };
    this.worldCup.nationalManagers[code] = manager;
    return manager;
  }

  buildInternationalTeam(teamInfo, { refresh = true } = {}) {
    const players = this.internationalPlayers();
    const clubLevels = this.internationalClubLevels();
    const selected = refresh
      ? selectNationalTeamSquad(players, teamInfo.code, clubLevels)
      : null;
    const roster = selected
      ? selected.map((entry) => entry.player)
      : (teamInfo.squadIds ?? [])
          .map((id) => players.find((player) => player.id === id))
          .filter(Boolean);
    if (roster.length < 11) {
      const candidates = this.internationalPlayers()
        .filter(
          (player) => player.nationality === teamInfo.code && !player.retired,
        )
        .sort((left, right) => (right.overall ?? 0) - (left.overall ?? 0));
      roster.push(...candidates.slice(0, 26));
    }
    if (roster.length < 11) {
      const rng = this.rng.stream(`world-cup-emergency-${teamInfo.code}`);
      const baseline = Math.max(55, Number(teamInfo.rating ?? 65) - 8);
      for (let index = roster.length; index < 11; index++) {
        const position = [
          "GK",
          "CB",
          "LB",
          "RB",
          "CM",
          "CM",
          "ST",
          "ST",
          "LW",
          "RW",
          "DM",
        ][index];
        const name = this.nameForNationality(rng, teamInfo.code);
        const attributes = generateAttributes(rng, position, baseline);
        roster.push(
          createPlayer({
            id: `national-emergency-club-${teamInfo.code}-${index + 1}`,
            first: name.first,
            last: name.last,
            nationality: teamInfo.code,
            dob: toDayIndex(
              this.season - rng.int(18, 30),
              rng.int(1, 12),
              rng.int(1, 28),
            ),
            position,
            ...physicalProfileFor(rng, position),
            attrs: attributes.attrs,
            subAttrs: attributes.subAttrs,
            gkAttrs: attributes.gkAttrs,
            potential: clamp(baseline + 8, baseline, 88),
            source: "generated-national-team",
            squadStatus: "National Team NPC",
          }),
        );
      }
    }
    const manager =
      teamInfo.manager ?? this.internationalManager(teamInfo.code);
    const club = new Club({
      id: `national-${teamInfo.code}`,
      name: teamInfo.name,
      nation: teamInfo.code,
      prestige: teamInfo.rating ?? 60,
      formation: "4-3-3",
      manager: {
        name: manager.name,
        style: manager.style,
        rating: manager.tacticalIntelligence,
      },
      squad: roster.map((player) => player.id),
    });
    club.formation = "4-3-3";
    club.manager.style = manager.style;
    club.manager.playstyle = manager.style;
    club.manager.rating = manager.tacticalIntelligence;
    club.manager.name = manager.name;
    const average =
      roster.reduce((sum, player) => sum + Number(player.overall ?? 50), 0) /
      roster.length;
    const strength = {
      attack: average,
      midfield: average,
      defence: average,
      tacticalFamiliarity: 55 + (manager.tacticalIntelligence ?? 50) * 0.3,
      chemistry: this.worldCup.chemistry?.[teamInfo.code] ?? 55,
    };
    return {
      ...teamInfo,
      manager,
      roster,
      players: roster,
      squadIds: roster.map((player) => player.id),
      rating: Math.round(average),
      club,
      strength,
    };
  }

  simulateInternationalMatch(
    homeInfo,
    awayInfo,
    {
      id,
      year,
      competition,
      knockout = false,
      neutralVenue = true,
      dateIndex = toDayIndex(year, 6, 15),
      refreshTeams = true,
    },
  ) {
    const home = this.buildInternationalTeam(homeInfo, {
      refresh: refreshTeams,
    });
    const away = this.buildInternationalTeam(awayInfo, {
      refresh: refreshTeams,
    });
    const userSelected =
      home.roster.some((player) => player.id === this.player.id) ||
      away.roster.some((player) => player.id === this.player.id);
    const match = simulateMatch({
      home,
      away,
      rng: this.rng.stream(`international-match-${id}`),
      dayIndex: dateIndex,
      competition: { id: "fifa-world-cup", name: competition },
      mustHaveWinner: knockout,
      neutralVenue,
      importance: knockout ? 1.25 : 1,
      detailedPlayerIds: userSelected ? [this.player.id] : [],
      forcedPlayerIds: userSelected ? [this.player.id] : [],
    });
    match.id = id;
    match.season = year - 1;
    match.competitionName = competition;
    match.homeName = home.name;
    match.awayName = away.name;
    this.recordInternationalMatch(match, home, away, {
      worldCup: competition === "FIFA World Cup",
      knockout,
    });
    return match;
  }

  createWorldCupUserMatch(tournament, fixture, homeInfo, awayInfo) {
    const home = this.buildInternationalTeam(homeInfo, { refresh: false });
    const away = this.buildInternationalTeam(awayInfo, { refresh: false });
    const side = home.code === this.player.nationality ? "home" : "away";
    const opponent = side === "home" ? away : home;
    const isKnockout = fixture.stage !== "group";
    const match = simulateMatch({
      home,
      away,
      rng: this.rng.stream(`international-match-${fixture.id}`),
      dayIndex: fixture.scheduledDay,
      competition: { id: "fifa-world-cup", name: "FIFA World Cup" },
      mustHaveWinner: isKnockout,
      neutralVenue: true,
      importance: isKnockout ? 1.25 : 1,
      detailedPlayerIds: [this.player.id],
      forcedPlayerIds: [this.player.id],
    });
    const playerResult = simulatePlayerMatch({
      player: this.player,
      match,
      side,
      opponents: opponent.roster,
      rng: this.rng.stream("world-cup-player-moments"),
      position: this.player.position,
      minutes: 90,
      role: this.matchRole,
      catalog: this.data.keyMomentOptions,
      season: this.season,
      teamStyle: (side === "home" ? home : away).manager?.style,
    });
    const scheduledGoalEvents = match.events;
    const record = {
      id: fixture.id,
      competitionId: "fifa-world-cup",
      competition: "FIFA World Cup",
      season: tournament.year - 1,
      matchday: fixture.round,
      scheduledDate: fixture.scheduledDay,
      homeClubId: home.club.id,
      awayClubId: away.club.id,
      home: home.name,
      away: away.name,
      homeGoals: 0,
      awayGoals: 0,
      stats: match.stats,
      userMatch: true,
      pending: true,
      worldCupFixtureId: fixture.id,
    };
    match.id = fixture.id;
    match.season = tournament.year - 1;
    match.competitionName = "FIFA World Cup";
    match.worldCupFixtureId = fixture.id;
    match.worldCupFixtureRecord = record;
    match.events = [];
    match.scheduledGoalEvents = scheduledGoalEvents;
    match.plannedHomeGoals = match.homeGoals;
    match.plannedAwayGoals = match.awayGoals;
    match.homeGoals = 0;
    match.awayGoals = 0;
    const userMatch = {
      ...match,
      playerResult,
      opponent: opponent.name,
      side,
      competitionId: "fifa-world-cup",
      objective: "International tournament",
      objectiveComplete: false,
      objectiveAwarded: false,
    };
    const role = this.playerMatchRole(userMatch, side);
    this.matchSimulation = {
      minute: 0,
      outgoingPlayerId: null,
      activeMomentIndex: null,
      status: "ready",
      releasedGoalCount: 0,
      finalized: false,
      ...role,
    };
    return userMatch;
  }

  recordInternationalMatch(match, home, away, { worldCup, knockout }) {
    const goals = new Map();
    const assists = new Map();
    for (const event of match.events ?? []) {
      if (event.type !== "goal") continue;
      if (event.scorerId)
        goals.set(event.scorerId, (goals.get(event.scorerId) ?? 0) + 1);
      if (event.assistId)
        assists.set(event.assistId, (assists.get(event.assistId) ?? 0) + 1);
    }
    const teams = [
      { team: home, side: "home", opponent: away },
      { team: away, side: "away", opponent: home },
    ];
    const participants = new Set();
    for (const { team, side, opponent } of teams) {
      const teamGoals = side === "home" ? match.homeGoals : match.awayGoals;
      const opponentGoals = side === "home" ? match.awayGoals : match.homeGoals;
      const participation = new Map(
        (match[side].xi ?? []).map((playerId) => {
          const minutes = Number(match.playerStats?.[playerId]?.minutes);
          return [playerId, minutes > 0 ? minutes : 90];
        }),
      );
      for (const event of match.misc ?? []) {
        if (event.type !== "sub" || event.side !== side) continue;
        if (event.off && event.playerId)
          participation.set(event.playerId, event.minute);
        if (event.replacementId)
          participation.set(
            event.replacementId,
            Math.max(0, 90 - event.minute),
          );
        if (event.on && event.playerId) {
          participation.set(event.playerId, Math.max(0, 90 - event.minute));
          if (event.replacedId)
            participation.set(event.replacedId, event.minute);
        }
      }
      for (const [playerId, minutes] of participation) {
        if (minutes <= 0) continue;
        const player = team.roster.find((entry) => entry.id === playerId);
        if (!player) continue;
        participants.add(player.id);
        const playerGoals = goals.get(player.id) ?? 0;
        const playerAssists = assists.get(player.id) ?? 0;
        const rating = round(
          clamp(
            6.35 +
              (Number(player.overall ?? 60) - team.rating) * 0.012 +
              (teamGoals > opponentGoals
                ? 0.25
                : teamGoals === opponentGoals
                  ? 0.05
                  : -0.15) +
              playerGoals * 0.8 +
              playerAssists * 0.5 +
              (Number(player.form ?? 50) - 50) * 0.003,
            RATING_MIN,
            RATING_MAX,
          ),
          1,
        );
        player.internationalStats ??= {
          apps: 0,
          goals: 0,
          assists: 0,
          ratingSum: 0,
          worldCupApps: 0,
          worldCupGoals: 0,
          worldCupAssists: 0,
          worldCupWins: 0,
        };
        const stats = player.internationalStats;
        stats.apps++;
        stats.goals += playerGoals;
        stats.assists += playerAssists;
        stats.ratingSum += rating;
        if (worldCup) {
          stats.worldCupApps++;
          stats.worldCupGoals += playerGoals;
          stats.worldCupAssists += playerAssists;
          player.worldCupAppearances = (player.worldCupAppearances ?? 0) + 1;
          player.fatigue = clamp(
            (player.fatigue ?? 0) + 7 + (knockout ? 2 : 0),
            0,
            100,
          );
          const injury = rollInjury(
            player,
            this.rng.stream(`world-cup-injury-${match.id}-${player.id}`),
            {
              chance: matchInjuryChance(player, knockout ? 1.25 : 1),
            },
          );
          if (injury) {
            player.injury = injury;
            if (player.id === this.player.id)
              this.news.unshift(
                `World Cup injury: ${this.player.first} ${this.player.last} is out for ${injury.weeks} week${injury.weeks === 1 ? "" : "s"}.`,
              );
          }
        }
        const madeInternationalDebut = stats.apps === 1;
        player.internationalHistory ??= [];
        player.internationalHistory.push({
          id: `${match.id}:${player.id}`,
          year: match.season + 1,
          competition: match.competitionName,
          competitionId:
            match.competitionName === "FIFA World Cup"
              ? "fifa-world-cup"
              : "fifa-world-cup-qualifying",
          nation: team.code,
          opponent: opponent.name,
          home: home.name,
          away: away.name,
          homeGoals: match.homeGoals,
          awayGoals: match.awayGoals,
          goals: playerGoals,
          assists: playerAssists,
          minutes,
          rating,
          knockout,
          result:
            teamGoals > opponentGoals
              ? "W"
              : teamGoals < opponentGoals
                ? "L"
                : "D",
        });
        player.internationalReputation = clamp(
          (player.internationalReputation ?? 0) +
            0.15 +
            Math.max(0, rating - 6.5) * 0.12 +
            playerGoals * 0.3 +
            playerAssists * 0.2,
          0,
          100,
        );
        player.internationalReputationLevel = nationalTeamReputation(player);
        if (madeInternationalDebut && player.id === this.player.id)
          this.news.unshift(
            `${this.player.first} ${this.player.last} made an international debut for ${team.name}.`,
          );
        if (worldCup) {
          const tournament = this.worldCup.tournament;
          tournament.playerStats ??= {};
          const row = (tournament.playerStats[player.id] ??= {
            playerId: player.id,
            player: `${player.first} ${player.last}`,
            nation: team.code,
            apps: 0,
            goals: 0,
            assists: 0,
            ratingSum: 0,
            knockoutApps: 0,
            knockoutRatingSum: 0,
            cleanSheets: 0,
          });
          row.apps++;
          row.goals += playerGoals;
          row.assists += playerAssists;
          row.ratingSum += rating;
          if (knockout) {
            row.knockoutApps++;
            row.knockoutRatingSum += rating;
          }
          if (player.position === "GK" && opponentGoals === 0)
            row.cleanSheets++;
        }
      }
    }
    if (worldCup) {
      const tournament = this.worldCup.tournament;
      for (const id of participants) {
        const row = tournament.playerStats[id];
        if (row && match.homeGoals === match.awayGoals && !match.winnerId)
          row.draws = (row.draws ?? 0) + 1;
      }
    }
    return participants;
  }

  simulateQualificationRound(round) {
    const qualification = this.initializeWorldCupQualification();
    if (qualification.status !== "in-progress") return [];
    if (round < qualification.roundsPlayed) return [];
    const fixtures = qualification.fixtures.filter(
      (fixture) => fixture.round === round && fixture.status === "scheduled",
    );
    const results = [];
    const groupFor = (groupId) =>
      qualification.groups.find((group) => group.id === groupId);
    for (const fixture of fixtures) {
      const homeInfo = qualification.groups
        .flatMap((group) => group.teams)
        .find((team) => team.id === fixture.homeId);
      const awayInfo = qualification.groups
        .flatMap((group) => group.teams)
        .find((team) => team.id === fixture.awayId);
      const result = this.simulateInternationalMatch(homeInfo, awayInfo, {
        id: fixture.id,
        year: this.season + 1,
        competition: "World Cup Qualifying",
        neutralVenue: false,
        dateIndex: toDayIndex(this.season, 9, Math.min(28, 1 + round * 5)),
      });
      Object.assign(fixture, {
        status: "completed",
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        winnerId:
          result.homeGoals === result.awayGoals
            ? null
            : result.homeGoals > result.awayGoals
              ? fixture.homeId
              : fixture.awayId,
        decidedBy: "normal time",
      });
      updateInternationalTable(groupFor(fixture.groupId).table, fixture);
      results.push(fixture);
    }
    qualification.roundsPlayed = Math.max(
      qualification.roundsPlayed,
      round + 1,
    );
    if (
      qualification.fixtures.every((fixture) => fixture.status === "completed")
    ) {
      qualification.status = "complete";
      qualification.qualified = this.qualifiedWorldCupTeams(qualification);
    }
    return results;
  }

  qualifiedWorldCupTeams(qualification = this.worldCup.qualification) {
    if (!qualification?.groups?.length) return [];
    const ranked = qualification.groups.flatMap((group) => {
      const standings = sortInternationalTable(
        group.table,
        qualification.fixtures.filter(
          (fixture) => fixture.groupId === group.id,
        ),
      );
      return standings.map((row, index) => ({
        ...group.teams.find((team) => team.id === row.teamId),
        table: row,
        groupPosition: index + 1,
        groupId: group.id,
      }));
    });
    return ranked
      .sort(
        (left, right) =>
          right.table.points - left.table.points ||
          right.table.goalDifference - left.table.goalDifference ||
          right.table.goalsFor - left.table.goalsFor ||
          right.rating - left.rating ||
          left.id.localeCompare(right.id),
      )
      .slice(0, qualification.fieldSize)
      .map(({ table, ...team }) => team);
  }

  startWorldCupTournament() {
    const qualification = this.initializeWorldCupQualification();
    const year = this.worldCup.nextYear;
    if (qualification.fieldSize < 4 || qualification.status === "unavailable") {
      this.worldCup.tournament = {
        year,
        season: year - 1,
        status: "cancelled",
        reason:
          qualification.message ??
          "There are not enough national teams with complete squads.",
        groups: [],
        fixtures: [],
        fixtureIds: [],
        calendar: [],
        playerStats: {},
      };
      this.worldCup.nextYear += this.worldCup.interval ?? WORLD_CUP_INTERVAL;
      this.worldCup.qualification = null;
      return this.worldCup.tournament;
    }
    if (qualification.status === "in-progress") {
      const lastRound =
        Math.max(...qualification.fixtures.map((fixture) => fixture.round)) + 1;
      for (let round = qualification.roundsPlayed; round < lastRound; round++)
        this.simulateQualificationRound(round);
    }
    const qualified = qualification.qualified?.length
      ? qualification.qualified
      : this.qualifiedWorldCupTeams(qualification);
    if (qualified.length < Math.min(8, qualification.fieldSize)) {
      this.worldCup.tournament = {
        year,
        season: year - 1,
        status: "cancelled",
        reason: "Too few national teams qualified with complete squads.",
        groups: [],
        fixtures: [],
        fixtureIds: [],
        calendar: [],
        playerStats: {},
      };
      this.worldCup.nextYear += this.worldCup.interval ?? WORLD_CUP_INTERVAL;
      this.worldCup.qualification = null;
      return this.worldCup.tournament;
    }

    const clubLevels = this.internationalClubLevels();
    const allPlayers = this.internationalPlayers();
    const teams = qualified.flatMap((team) => {
      const squad = selectNationalTeamSquad(allPlayers, team.code, clubLevels);
      return squad
        ? [
            {
              ...team,
              squadIds: squad.map((entry) => entry.player.id),
              manager: { ...this.internationalManager(team.code) },
            },
          ]
        : [];
    });
    if (teams.length < Math.min(8, qualification.fieldSize)) {
      this.worldCup.tournament = {
        year,
        season: year - 1,
        status: "cancelled",
        reason: "Too few qualified countries have complete 26-player squads.",
        groups: [],
        fixtures: [],
        fixtureIds: [],
        calendar: [],
        playerStats: {},
      };
      this.worldCup.nextYear += this.worldCup.interval ?? WORLD_CUP_INTERVAL;
      this.worldCup.qualification = null;
      return this.worldCup.tournament;
    }
    const tournament = {
      year,
      season: year - 1,
      status: "in-progress",
      stage: "Group stage",
      groups: [],
      qualified: teams,
      fixtures: [],
      fixtureIds: [],
      calendar: [],
      playerStats: {},
      awards: [],
      winnerId: null,
      runnerUpId: null,
      thirdPlaceId: null,
      groupsAdvanced: false,
    };
    const groups = drawGroups(
      teams.map((team) => ({ ...team, rating: team.rating ?? 50 })),
      4,
      this.rng.stream(`world-cup-finals-draw-${year}`),
    );
    tournament.groups = groups.map((group) => ({
      id: group.id,
      teams: group.teams,
      table: emptyInternationalTable(group.teams),
    }));
    tournament.fixtures = roundRobinFixtures(
      tournament.groups,
      `world-cup-${year}`,
    ).map((fixture) => ({
      ...fixture,
      stage: "group",
      scheduledDay: worldCupFixtureDay(year, "group", fixture.round),
    }));
    const userNation = this.player.nationality;
    const userTeam = teams.find((team) => team.code === userNation);
    const userSelected = userTeam?.squadIds.includes(this.player.id) ?? false;
    this.worldCup.userSelection = {
      year,
      nation: userNation,
      selected: userSelected,
      qualified: !!userTeam,
      reputation: nationalTeamReputation(this.player),
    };
    if (userSelected) {
      this.news.unshift(
        `International call-up: ${this.player.first} ${this.player.last} has been selected for ${userTeam.name} at the ${year} FIFA World Cup.`,
      );
    } else if (userTeam) {
      this.news.unshift(
        `Selection news: ${userTeam.name} have not selected you for the ${year} FIFA World Cup. Your international reputation is ${nationalTeamReputation(this.player).toLowerCase()}.`,
      );
    } else {
      this.news.unshift(
        `${NATION_NAMES[userNation] ?? userNation} did not qualify for the ${year} FIFA World Cup. The next tournament is scheduled for ${year + 4}.`,
      );
    }
    this.news.unshift(`The ${year} FIFA World Cup group draw is complete.`);
    this.worldCup.tournament = tournament;
    this.worldCupUnavailableIds = new Set(
      teams.flatMap((team) => team.squadIds),
    );
    this.refreshWorldCupCalendar(tournament);
    return tournament;
  }

  limitWorldCupToRoundOf16(tournament, teamIds) {
    const uniqueIds = [...new Set(teamIds)];
    const rows = new Map();
    for (const group of tournament.groups ?? []) {
      for (const row of group.table ?? []) rows.set(row.teamId, row);
    }
    const rankedIds = uniqueIds
      .map((id) => ({
        id,
        team: tournament.qualified.find((team) => team.id === id),
        row: rows.get(id),
      }))
      .sort(
        (left, right) =>
          (right.row?.points ?? 0) - (left.row?.points ?? 0) ||
          (right.row?.goalDifference ?? 0) - (left.row?.goalDifference ?? 0) ||
          (right.row?.goalsFor ?? 0) - (left.row?.goalsFor ?? 0) ||
          (Number(right.team?.rating) || 0) -
            (Number(left.team?.rating) || 0) ||
          left.id.localeCompare(right.id),
      )
      .map((entry) => entry.id);
    const knockoutSize = rankedIds.length
      ? 2 ** Math.floor(Math.log2(rankedIds.length))
      : 0;
    return rankedIds.slice(0, Math.min(16, knockoutSize));
  }

  refreshWorldCupCalendar(tournament) {
    tournament.fixtureIds = tournament.fixtures.map((fixture) => fixture.id);
    const days = new Map();
    for (const fixture of tournament.fixtures) {
      if (!Number.isFinite(fixture.scheduledDay))
        throw new Error(
          `World Cup fixture ${fixture.id} has no scheduled day.`,
        );
      const day = days.get(fixture.scheduledDay) ?? {
        day: fixture.scheduledDay,
        fixtureIds: [],
      };
      day.fixtureIds.push(fixture.id);
      days.set(fixture.scheduledDay, day);
    }
    tournament.calendar = [...days.values()].sort(
      (left, right) => left.day - right.day,
    );
  }

  createWorldCupKnockoutFixtures(tournament, teamIds) {
    let teams = teamIds
      .map((id) => tournament.qualified.find((team) => team.id === id))
      .filter(Boolean)
      .sort((left, right) => right.rating - left.rating);
    if (teams.length > 2) {
      const bracketSize = 2 ** Math.floor(Math.log2(teams.length));
      teams = teams.slice(0, bracketSize);
    }
    if (teams.length < 2 || teams.length % 2)
      throw new Error("World Cup knockout round requires an even team count.");
    const round =
      teams.length === 32
        ? "Round of 32"
        : teams.length === 16
          ? "Round of 16"
          : teams.length === 8
            ? "Quarter-finals"
            : teams.length === 4
              ? "Semi-finals"
              : teams.length === 2
                ? "Final"
                : `Knockout round of ${teams.length}`;
    tournament.knockoutStage = round;
    tournament.stage = round;
    tournament.knockoutTeams = teams.map((team) => team.id);
    for (let index = 0; index < teams.length / 2; index++) {
      const home = teams[index];
      const away = teams[teams.length - 1 - index];
      const id = `world-cup-${tournament.year}:${round}:${home.id}:${away.id}`;
      if (tournament.fixtures.some((fixture) => fixture.id === id)) continue;
      tournament.fixtures.push({
        id,
        stage: "knockout",
        knockoutStage: round,
        round,
        groupId: null,
        homeId: home.id,
        awayId: away.id,
        status: "scheduled",
        homeGoals: null,
        awayGoals: null,
        scheduledDay: worldCupFixtureDay(tournament.year, round),
      });
    }
    this.refreshWorldCupCalendar(tournament);
  }

  completeWorldCupTournament(tournament) {
    this.awardWorldCupHonours(tournament);
    tournament.status = "complete";
    tournament.stage = "Complete";
    this.worldCup.history ??= [];
    if (!this.worldCup.history.some((entry) => entry.year === tournament.year))
      this.worldCup.history.push(structuredClone(tournament));
    this.worldCup.nextYear =
      tournament.year + (this.worldCup.interval ?? WORLD_CUP_INTERVAL);
    this.worldCup.qualification = null;
    this.worldCup.tournament = tournament;
    this.worldCup.chemistry ??= {};
    for (const team of tournament.qualified)
      this.worldCup.chemistry[team.code] = clamp(
        (this.worldCup.chemistry[team.code] ?? 55) + 8,
        0,
        100,
      );
    this.initializeWorldCupQualification();
    this.news.unshift(
      `${tournament.winner} win the ${tournament.year} FIFA World Cup. ${tournament.runnerUp} finish runners-up.`,
    );
  }

  progressWorldCupFixtures(tournament, today) {
    const completed = [];
    let userMatch = null;
    while (true) {
      let due = tournament.fixtures
        .filter(
          (fixture) =>
            fixture.status !== "completed" && fixture.scheduledDay <= today,
        )
        .sort(
          (left, right) =>
            left.scheduledDay - right.scheduledDay ||
            left.id.localeCompare(right.id),
        );
      let stageOnly = false;
      if (!due.length) {
        const completedGroup = tournament.fixtures.find(
          (fixture) => fixture.stage === "group",
        );
        const completedKnockout = tournament.fixtures.find(
          (fixture) =>
            fixture.stage === "knockout" &&
            fixture.knockoutStage === tournament.knockoutStage,
        );
        if (
          completedGroup &&
          !tournament.groupsAdvanced &&
          tournament.fixtures
            .filter((fixture) => fixture.stage === "group")
            .every((fixture) => fixture.status === "completed")
        ) {
          due = [completedGroup];
          stageOnly = true;
        } else if (
          completedKnockout &&
          tournament.fixtures
            .filter(
              (fixture) =>
                fixture.stage === "knockout" &&
                fixture.knockoutStage === tournament.knockoutStage,
            )
            .every((fixture) => fixture.status === "completed")
        ) {
          due = [completedKnockout];
          stageOnly = true;
        } else {
          break;
        }
      }
      const first = due[0];
      const sameMatchday = stageOnly
        ? []
        : due.filter(
            (fixture) =>
              fixture.scheduledDay === first.scheduledDay &&
              fixture.stage === first.stage &&
              fixture.knockoutStage === first.knockoutStage,
          );
      for (const fixture of sameMatchday) {
        const selectedNation =
          this.worldCup.userSelection?.selected &&
          this.worldCup.userSelection?.nation === this.player.nationality;
        const userTeamId = tournament.qualified.find(
          (team) => team.code === this.player.nationality,
        )?.id;
        if (
          selectedNation &&
          userTeamId &&
          (fixture.homeId === userTeamId || fixture.awayId === userTeamId)
        ) {
          const home = tournament.qualified.find(
            (team) => team.id === fixture.homeId,
          );
          const away = tournament.qualified.find(
            (team) => team.id === fixture.awayId,
          );
          if (!home || !away)
            throw new Error(`Missing World Cup team in fixture ${fixture.id}.`);
          const playerSelected =
            home.squadIds?.includes(this.player.id) ||
            away.squadIds?.includes(this.player.id);
          if (playerSelected) {
            userMatch = this.createWorldCupUserMatch(
              tournament,
              fixture,
              home,
              away,
            );
            continue;
          }
        }
        const home = tournament.qualified.find(
          (team) => team.id === fixture.homeId,
        );
        const away = tournament.qualified.find(
          (team) => team.id === fixture.awayId,
        );
        if (!home || !away)
          throw new Error(`Missing World Cup team in fixture ${fixture.id}.`);
        const isKnockout = fixture.stage !== "group";
        const result = this.simulateInternationalMatch(home, away, {
          id: fixture.id,
          year: tournament.year,
          competition: "FIFA World Cup",
          knockout: isKnockout,
          dateIndex: fixture.scheduledDay,
          refreshTeams: false,
        });
        Object.assign(fixture, {
          status: "completed",
          homeGoals: result.homeGoals,
          awayGoals: result.awayGoals,
          stats: result.stats,
          penalties: result.penalties ?? null,
          decidedBy: result.decidedBy ?? null,
        });
        if (isKnockout) {
          const winnerId =
            result.homeGoals === result.awayGoals
              ? result.penalties?.winner === "home"
                ? home.id
                : result.penalties?.winner === "away"
                  ? away.id
                  : null
              : result.homeGoals > result.awayGoals
                ? home.id
                : away.id;
          if (!winnerId)
            throw new Error(`Knockout fixture ${fixture.id} has no winner.`);
          fixture.winnerId = winnerId;
          if (fixture.round === "Final") {
            tournament.winnerId = winnerId;
            tournament.runnerUpId = winnerId === home.id ? away.id : home.id;
            tournament.winner = tournament.qualified.find(
              (team) => team.id === tournament.winnerId,
            )?.name;
            tournament.runnerUp = tournament.qualified.find(
              (team) => team.id === tournament.runnerUpId,
            )?.name;
          }
          if (fixture.round === "Third-place playoff")
            tournament.thirdPlaceId = winnerId;
        } else {
          const group = tournament.groups.find(
            (entry) => entry.id === fixture.groupId,
          );
          if (!group)
            throw new Error(
              `Missing World Cup group in fixture ${fixture.id}.`,
            );
          updateInternationalTable(group.table, fixture);
        }
        completed.push(fixture.id);
      }

      if (
        first.stage === "group" &&
        tournament.fixtures
          .filter((fixture) => fixture.stage === "group")
          .every((fixture) => fixture.status === "completed") &&
        !tournament.groupsAdvanced
      ) {
        tournament.groupsAdvanced = true;
        for (const group of tournament.groups) {
          group.table = sortInternationalTable(
            group.table,
            tournament.fixtures.filter(
              (fixture) =>
                fixture.stage === "group" && fixture.groupId === group.id,
            ),
          );
          group.table.forEach((row, index) => {
            row.groupPosition = index + 1;
          });
        }
        let advancing;
        if (
          tournament.qualified.length === 4 &&
          tournament.groups.length === 1
        ) {
          const standings = tournament.groups[0].table;
          advancing = standings.slice(0, 2).map((row) => row.teamId);
          tournament.thirdPlaceId = standings[2]?.teamId ?? null;
        } else {
          const thirds = tournament.groups
            .filter((group) => group.teams.length === 4)
            .map((group) => group.table[2])
            .filter(Boolean)
            .sort(
              (left, right) =>
                right.points - left.points ||
                right.goalDifference - left.goalDifference ||
                right.goalsFor - left.goalsFor ||
                left.teamId.localeCompare(right.teamId),
            );
          advancing = tournament.groups.flatMap((group) =>
            group.table.slice(0, 2).map((row) => row.teamId),
          );
          const target =
            tournament.groups.length === 12
              ? 32
              : tournament.groups.length === 6
                ? 16
                : tournament.groups.length === 4
                  ? 8
                  : tournament.groups.length === 2
                    ? 4
                    : advancing.length;
          advancing.push(
            ...thirds
              .slice(0, Math.max(0, target - advancing.length))
              .map((row) => row.teamId),
          );
        }
        advancing = this.limitWorldCupToRoundOf16(tournament, advancing);
        const userTeam = tournament.qualified.find(
          (team) => team.code === this.player.nationality,
        );
        if (userTeam) {
          tournament.notifications ??= [];
          const qualified = advancing.includes(userTeam.id);
          const notification = qualified
            ? "group-qualified"
            : "group-eliminated";
          if (!tournament.notifications.includes(notification)) {
            tournament.notifications.push(notification);
            this.news.unshift(
              qualified
                ? `${userTeam.name} advance from their ${tournament.groups.find((group) => group.teams.some((team) => team.id === userTeam.id))?.id ?? "World Cup"} group.`
                : `${userTeam.name} are eliminated from the ${tournament.year} FIFA World Cup.`,
            );
          }
        }
        this.createWorldCupKnockoutFixtures(tournament, advancing);
      }

      const currentStage = tournament.knockoutStage;
      if (
        currentStage &&
        tournament.fixtures
          .filter(
            (fixture) =>
              fixture.stage === "knockout" &&
              fixture.knockoutStage === currentStage,
          )
          .every((fixture) => fixture.status === "completed")
      ) {
        const roundFixtures = tournament.fixtures.filter(
          (fixture) =>
            fixture.stage === "knockout" &&
            fixture.knockoutStage === currentStage,
        );
        const winners = roundFixtures.map((fixture) => fixture.winnerId);
        const userTeam = tournament.qualified.find(
          (team) => team.code === this.player.nationality,
        );
        if (
          userTeam &&
          roundFixtures.some(
            (fixture) =>
              fixture.homeId === userTeam.id || fixture.awayId === userTeam.id,
          )
        ) {
          tournament.notifications ??= [];
          const notification = winners.includes(userTeam.id)
            ? `${currentStage}-reached`
            : `${currentStage}-eliminated`;
          if (!tournament.notifications.includes(notification)) {
            tournament.notifications.push(notification);
            this.news.unshift(
              winners.includes(userTeam.id)
                ? `${userTeam.name} reach the ${currentStage.toLowerCase()} of the ${tournament.year} FIFA World Cup.`
                : `${userTeam.name} are eliminated in the ${currentStage.toLowerCase()} of the ${tournament.year} FIFA World Cup.`,
            );
          }
        }
        if (currentStage === "Semi-finals") {
          const losers = roundFixtures.map((fixture) =>
            fixture.homeId === fixture.winnerId
              ? fixture.awayId
              : fixture.homeId,
          );
          const [homeId, awayId] = losers;
          const thirdId = `world-cup-${tournament.year}:Third-place:${homeId}:${awayId}`;
          if (!tournament.fixtures.some((fixture) => fixture.id === thirdId)) {
            tournament.fixtures.push({
              id: thirdId,
              stage: "third-place",
              round: "Third-place playoff",
              homeId,
              awayId,
              status: "scheduled",
              homeGoals: null,
              awayGoals: null,
              scheduledDay: worldCupFixtureDay(
                tournament.year,
                "Third-place playoff",
              ),
            });
          }
          this.createWorldCupKnockoutFixtures(tournament, winners);
        } else if (currentStage === "Final") {
          this.completeWorldCupTournament(tournament);
        } else {
          this.createWorldCupKnockoutFixtures(tournament, winners);
        }
      }
      this.refreshWorldCupCalendar(tournament);
      if (tournament.status === "complete") break;
      if (userMatch) break;
      if (stageOnly) continue;
      if (sameMatchday.length === 0) break;
    }
    return { completed, userMatch };
  }

  processWorldCupCalendar() {
    this.worldCupUnavailableIds = new Set();
    const date = fromDayIndex(this.currentDay());
    const worldCup = this.worldCup;
    const qualificationFixtures = [];
    if (
      worldCupQualificationRound(worldCup, this.season) != null &&
      this.week === 16
    ) {
      qualificationFixtures.push(
        ...this.simulateQualificationRound(
          worldCupQualificationRound(worldCup, this.season),
        ),
      );
    }
    if (
      this.season === worldCup.nextYear - 1 &&
      this.week === 32 &&
      worldCup.qualification?.status === "in-progress"
    ) {
      for (
        let round = worldCup.qualification.roundsPlayed;
        round <
        Math.max(
          ...worldCup.qualification.fixtures.map((fixture) => fixture.round),
        ) +
          1;
        round++
      ) {
        qualificationFixtures.push(...this.simulateQualificationRound(round));
      }
    }
    if (date.year !== worldCup.nextYear || date.month < 6) {
      return qualificationFixtures.length ? { qualificationFixtures } : null;
    }
    let tournament = worldCup.tournament;
    let tournamentStarted = false;
    if (
      tournament?.year !== worldCup.nextYear ||
      ["complete", "cancelled"].includes(tournament?.status)
    ) {
      tournament = this.startWorldCupTournament();
      tournamentStarted = tournament.status === "in-progress";
    }
    if (tournament.status !== "in-progress") {
      return {
        qualificationFixtures,
        tournament,
        tournamentStarted,
        worldCupMatches: [],
      };
    }
    const today = this.currentDay();
    const worldCupProgress = this.progressWorldCupFixtures(tournament, today);
    const worldCupMatches = worldCupProgress.completed;
    const unavailableIds = new Set();
    for (const fixture of tournament.fixtures) {
      const active =
        fixture.status !== "completed" || fixture.scheduledDay === today;
      if (!active) continue;
      const home = tournament.qualified.find(
        (team) => team.id === fixture.homeId,
      );
      const away = tournament.qualified.find(
        (team) => team.id === fixture.awayId,
      );
      for (const id of [...(home?.squadIds ?? []), ...(away?.squadIds ?? [])])
        unavailableIds.add(id);
    }
    this.worldCupUnavailableIds = unavailableIds;
    return {
      qualificationFixtures,
      tournament,
      tournamentStarted,
      worldCupMatches,
      worldCupUserMatch: worldCupProgress.userMatch,
    };
  }

  simulateWorldCup() {
    if (
      this.worldCup.tournament?.year === this.worldCup.nextYear &&
      ["complete", "cancelled"].includes(this.worldCup.tournament.status)
    ) {
      return this.worldCup.tournament;
    }
    const qualification = this.initializeWorldCupQualification();
    if (qualification.fieldSize < 4 || qualification.status === "unavailable") {
      this.worldCup.tournament = {
        year: this.worldCup.nextYear,
        status: "cancelled",
        reason:
          qualification.message ??
          "There are not enough national teams with complete squads.",
        groups: [],
        fixtures: [],
        playerStats: {},
      };
      this.worldCup.nextYear += this.worldCup.interval ?? WORLD_CUP_INTERVAL;
      this.worldCup.qualification = null;
      return this.worldCup.tournament;
    }
    if (qualification.status === "in-progress") {
      const lastRound =
        Math.max(...qualification.fixtures.map((fixture) => fixture.round)) + 1;
      for (let round = qualification.roundsPlayed; round < lastRound; round++)
        this.simulateQualificationRound(round);
    }
    const qualified = qualification.qualified?.length
      ? qualification.qualified
      : this.qualifiedWorldCupTeams(qualification);
    if (qualified.length < Math.min(8, qualification.fieldSize)) {
      this.worldCup.tournament = {
        year: this.worldCup.nextYear,
        status: "cancelled",
        reason: "Too few national teams qualified with complete squads.",
        groups: [],
        fixtures: [],
        playerStats: {},
      };
      this.worldCup.nextYear += this.worldCup.interval ?? WORLD_CUP_INTERVAL;
      this.worldCup.qualification = null;
      return this.worldCup.tournament;
    }
    const tournament = {
      year: this.worldCup.nextYear,
      season: this.worldCup.nextYear - 1,
      status: "in-progress",
      qualified: [],
      groups: [],
      fixtures: [],
      playerStats: {},
      awards: [],
      winnerId: null,
      runnerUpId: null,
      thirdPlaceId: null,
    };
    this.worldCup.tournament = tournament;
    const clubLevels = this.internationalClubLevels();
    const allPlayers = this.internationalPlayers();
    for (const team of qualified) {
      const squad = selectNationalTeamSquad(allPlayers, team.code, clubLevels);
      if (!squad) continue;
      const selectedTeam = {
        ...team,
        squadIds: squad.map((entry) => entry.player.id),
        manager: { ...this.internationalManager(team.code) },
      };
      tournament.qualified.push(selectedTeam);
    }
    this.worldCupUnavailableIds = new Set(
      tournament.qualified.flatMap((team) => team.squadIds),
    );
    const userNation = this.player.nationality;
    const userTeam = tournament.qualified.find(
      (team) => team.code === userNation,
    );
    const userSelected = userTeam?.squadIds.includes(this.player.id) ?? false;
    this.worldCup.userSelection = {
      year: tournament.year,
      nation: userNation,
      selected: userSelected,
      qualified: !!userTeam,
      reputation: nationalTeamReputation(this.player),
    };
    if (userSelected) {
      this.news.unshift(
        `International call-up: ${this.player.first} ${this.player.last} has been selected for ${userTeam.name} at the ${tournament.year} FIFA World Cup.`,
      );
    } else if (userTeam) {
      this.news.unshift(
        `Selection news: ${userTeam.name} have not selected you for the ${tournament.year} FIFA World Cup. Your international reputation is ${nationalTeamReputation(this.player).toLowerCase()}.`,
      );
    } else {
      this.news.unshift(
        `${NATION_NAMES[userNation] ?? userNation} did not qualify for the ${tournament.year} FIFA World Cup. The next tournament is scheduled for ${tournament.year + 4}.`,
      );
    }
    const groupSize = 4;
    const groups = drawGroups(
      tournament.qualified.map((team) => ({
        ...team,
        rating: team.rating ?? 50,
      })),
      groupSize,
      this.rng.stream(`world-cup-finals-draw-${tournament.year}`),
    );
    tournament.groups = groups.map((group) => ({
      id: group.id,
      teams: group.teams,
      table: emptyInternationalTable(group.teams),
    }));
    const groupFixtures = roundRobinFixtures(
      tournament.groups,
      `world-cup-${tournament.year}`,
    );
    for (const fixture of groupFixtures) {
      const group = tournament.groups.find(
        (entry) => entry.id === fixture.groupId,
      );
      const home = group.teams.find((team) => team.id === fixture.homeId);
      const away = group.teams.find((team) => team.id === fixture.awayId);
      const result = this.simulateInternationalMatch(home, away, {
        id: fixture.id,
        year: tournament.year,
        competition: "FIFA World Cup",
        dateIndex: worldCupFixtureDay(tournament.year, "group", fixture.round),
        refreshTeams: false,
      });
      Object.assign(fixture, {
        status: "completed",
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        scheduledDay: worldCupFixtureDay(
          tournament.year,
          "group",
          fixture.round,
        ),
      });
      updateInternationalTable(group.table, fixture);
      tournament.fixtures.push(fixture);
    }
    for (const group of tournament.groups) {
      group.table = sortInternationalTable(
        group.table,
        tournament.fixtures.filter((fixture) => fixture.groupId === group.id),
      );
      for (const row of group.table)
        row.groupPosition = group.table.indexOf(row) + 1;
    }
    let qualifiedForKnockout = [];
    if (tournament.qualified.length === 4 && tournament.groups.length === 1) {
      const standings = tournament.groups[0].table;
      qualifiedForKnockout = standings.slice(0, 2).map((row) => row.teamId);
      tournament.thirdPlaceId = standings[2]?.teamId ?? null;
    } else if (tournament.groups.length === 12) {
      const third = tournament.groups
        .map((group) => group.table[2])
        .filter(Boolean)
        .sort(
          (left, right) =>
            right.points - left.points ||
            right.goalDifference - left.goalDifference ||
            right.goalsFor - left.goalsFor ||
            left.teamId.localeCompare(right.teamId),
        )
        .slice(0, 8)
        .map((row) => row.teamId);
      qualifiedForKnockout = tournament.groups
        .flatMap((group) => group.table.slice(0, 2).map((row) => row.teamId))
        .concat(third);
    } else {
      const thirdPlaceQualifiers = tournament.groups
        .filter((group) => group.teams.length === 4)
        .map((group) => group.table[2])
        .filter(Boolean)
        .sort(
          (left, right) =>
            right.points - left.points ||
            right.goalDifference - left.goalDifference ||
            right.goalsFor - left.goalsFor ||
            left.teamId.localeCompare(right.teamId),
        );
      const target =
        tournament.groups.length === 6
          ? 16
          : tournament.groups.length === 8
            ? 16
            : tournament.groups.length === 4
              ? 8
              : tournament.groups.length === 2
                ? 4
                : tournament.qualified.length;
      qualifiedForKnockout = tournament.groups.flatMap((group) =>
        group.table.slice(0, 2).map((row) => row.teamId),
      );
      qualifiedForKnockout.push(
        ...thirdPlaceQualifiers
          .slice(0, Math.max(0, target - qualifiedForKnockout.length))
          .map((row) => row.teamId),
      );
    }
    qualifiedForKnockout = this.limitWorldCupToRoundOf16(
      tournament,
      qualifiedForKnockout,
    );
    this.simulateWorldCupKnockouts(tournament, qualifiedForKnockout);
    tournament.calendar = Object.values(
      tournament.fixtures.reduce((days, fixture) => {
        const day = fixture.scheduledDay;
        if (!Number.isFinite(day))
          throw new Error(
            `World Cup fixture ${fixture.id} has no scheduled day.`,
          );
        (days[day] ??= { day, fixtureIds: [] }).fixtureIds.push(fixture.id);
        return days;
      }, {}),
    ).sort((left, right) => left.day - right.day);
    tournament.fixtureIds = tournament.fixtures.map((fixture) => fixture.id);
    this.awardWorldCupHonours(tournament);
    tournament.status = "complete";
    this.worldCup.history ??= [];
    if (!this.worldCup.history.some((entry) => entry.year === tournament.year))
      this.worldCup.history.push(structuredClone(tournament));
    this.worldCup.nextYear =
      tournament.year + (this.worldCup.interval ?? WORLD_CUP_INTERVAL);
    this.worldCup.qualification = null;
    this.worldCup.tournament = tournament;
    this.worldCup.chemistry ??= {};
    for (const team of tournament.qualified)
      this.worldCup.chemistry[team.code] = clamp(
        (this.worldCup.chemistry[team.code] ?? 55) + 8,
        0,
        100,
      );
    this.initializeWorldCupQualification();
    this.news.unshift(
      `${tournament.winner} win the ${tournament.year} FIFA World Cup. ${tournament.runnerUp} finish runners-up.`,
    );
    return tournament;
  }

  simulateWorldCupKnockouts(tournament, qualifiedIds) {
    let roundTeams = qualifiedIds
      .map((id) => tournament.qualified.find((team) => team.id === id))
      .filter(Boolean)
      .sort((left, right) => right.rating - left.rating);
    const stageNames = {
      32: "Round of 32",
      16: "Round of 16",
      8: "Quarter-finals",
      4: "Semi-finals",
      2: "Final",
    };
    const semifinalLosers = [];
    while (roundTeams.length > 1) {
      const stage =
        stageNames[roundTeams.length] ??
        `Knockout round of ${roundTeams.length}`;
      const winners = [];
      for (let index = 0; index < roundTeams.length / 2; index++) {
        const home = roundTeams[index];
        const away = roundTeams[roundTeams.length - 1 - index];
        const fixture = {
          id: `world-cup-${tournament.year}:${stage}:${home.id}:${away.id}`,
          round: stage,
          groupId: null,
          homeId: home.id,
          awayId: away.id,
          status: "completed",
          scheduledDay: worldCupFixtureDay(tournament.year, stage),
        };
        const result = this.simulateInternationalMatch(home, away, {
          id: fixture.id,
          year: tournament.year,
          competition: "FIFA World Cup",
          knockout: true,
          dateIndex: fixture.scheduledDay,
          refreshTeams: false,
        });
        const winnerId =
          result.homeGoals === result.awayGoals
            ? ((result.penalties?.winner === "home"
                ? home.id
                : result.penalties?.winner === "away"
                  ? away.id
                  : null) ??
              (this.rng.stream(`world-cup-draw-${fixture.id}`).chance(0.5)
                ? home.id
                : away.id))
            : result.homeGoals > result.awayGoals
              ? home.id
              : away.id;
        Object.assign(fixture, {
          homeGoals: result.homeGoals,
          awayGoals: result.awayGoals,
          winnerId,
          decidedBy: result.decidedBy,
          penalties: result.penalties ?? null,
        });
        tournament.fixtures.push(fixture);
        winners.push(winnerId === home.id ? home : away);
        if (roundTeams.length === 4)
          semifinalLosers.push(winnerId === home.id ? away : home);
      }
      if (roundTeams.length === 2) {
        tournament.winnerId = winners[0].id;
        tournament.runnerUpId =
          roundTeams.find((team) => team.id !== winners[0].id)?.id ?? null;
      }
      roundTeams = winners;
    }
    if (semifinalLosers.length === 2) {
      const [home, away] = semifinalLosers;
      const fixture = {
        id: `world-cup-${tournament.year}:Third-place:${home.id}:${away.id}`,
        round: "Third-place playoff",
        homeId: home.id,
        awayId: away.id,
        status: "completed",
        scheduledDay: worldCupFixtureDay(
          tournament.year,
          "Third-place playoff",
        ),
      };
      const result = this.simulateInternationalMatch(home, away, {
        id: fixture.id,
        year: tournament.year,
        competition: "FIFA World Cup",
        knockout: true,
        dateIndex: fixture.scheduledDay,
        refreshTeams: false,
      });
      const winnerId =
        result.homeGoals === result.awayGoals
          ? ((result.penalties?.winner === "home"
              ? home.id
              : result.penalties?.winner === "away"
                ? away.id
                : null) ??
            (this.rng.stream(`world-cup-draw-${fixture.id}`).chance(0.5)
              ? home.id
              : away.id))
          : result.homeGoals > result.awayGoals
            ? home.id
            : away.id;
      Object.assign(fixture, {
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        winnerId,
        decidedBy: result.decidedBy,
      });
      tournament.fixtures.push(fixture);
      tournament.thirdPlaceId = winnerId;
    }
    tournament.winner =
      tournament.qualified.find((team) => team.id === tournament.winnerId)
        ?.name ?? "Unknown";
    tournament.runnerUp =
      tournament.qualified.find((team) => team.id === tournament.runnerUpId)
        ?.name ?? "Unknown";
    tournament.thirdPlace =
      tournament.qualified.find((team) => team.id === tournament.thirdPlaceId)
        ?.name ?? null;
  }

  awardWorldCupHonours(tournament) {
    if (tournament.honoursAwarded) return;
    const teams = new Map(tournament.qualified.map((team) => [team.id, team]));
    const entries = Object.values(tournament.playerStats);
    const byGoals = [...entries].sort(
      (left, right) =>
        right.goals - left.goals ||
        right.assists - left.assists ||
        right.ratingSum / Math.max(1, right.apps) -
          left.ratingSum / Math.max(1, left.apps),
    );
    const playerById = new Map(
      this.internationalPlayers().map((player) => [player.id, player]),
    );
    const meanRating = (entry) => entry.ratingSum / Math.max(1, entry.apps);
    const topRated = [...entries]
      .filter((entry) => entry.apps >= 3)
      .sort((left, right) => meanRating(right) - meanRating(left));
    const goalkeepers = entries
      .filter(
        (entry) =>
          playerById.get(entry.playerId)?.position === "GK" && entry.apps >= 2,
      )
      .sort(
        (left, right) =>
          right.cleanSheets - left.cleanSheets ||
          meanRating(right) - meanRating(left),
      );
    const youngPlayers = topRated.filter(
      (entry) =>
        ageOn(
          playerById.get(entry.playerId)?.dob ??
            toDayIndex(tournament.year - 20, 1, 1),
          toDayIndex(tournament.year, 7, 20),
        ) <= 21,
    );
    tournament.goldenBoot = byGoals[0] ?? null;
    tournament.goldenBall = topRated[0] ?? null;
    tournament.goldenGlove = goalkeepers[0] ?? null;
    tournament.bestYoungPlayer = youngPlayers[0] ?? null;
    const winners = teams.get(tournament.winnerId);
    const runnersUp = teams.get(tournament.runnerUpId);
    const third = teams.get(tournament.thirdPlaceId);
    const medals = [
      [winners, "FIFA World Cup Winner"],
      [runnersUp, "FIFA World Cup Runner-up"],
      [third, "FIFA World Cup Third Place"],
    ];
    for (const [team, award] of medals) {
      if (!team) continue;
      for (const playerId of team.squadIds ?? []) {
        const player = playerById.get(playerId);
        if (!player) continue;
        player.internationalAchievements ??= [];
        const achievement = `${award} ${tournament.year}`;
        const winnerHonourId = `${tournament.season}:FIFA World Cup:FIFA World Cup Winner`;
        const winnerHonourExists =
          award === "FIFA World Cup Winner" &&
          (player.honours?.some(
            (honour) =>
              (honour.id ??
                `${honour.season}:${honour.competition}:${honour.award}`) ===
              winnerHonourId,
          ) ||
            player.internationalAchievements.includes(achievement));
        if (!player.internationalAchievements.includes(achievement))
          player.internationalAchievements.push(achievement);
        if (award === "FIFA World Cup Winner" && !winnerHonourExists) {
          player.internationalStats ??= { worldCupWins: 0 };
          player.internationalStats.worldCupWins =
            (player.internationalStats.worldCupWins ?? 0) + 1;
          player.fatigue = clamp((player.fatigue ?? 0) + 18, 0, 100);
        }
        if (award === "FIFA World Cup Runner-up")
          this.recordPlayerHonour(player, {
            award: "FIFA World Cup Runner-up Medal",
            season: tournament.season,
            competition: "FIFA World Cup",
            value: `${tournament.year} · ${team.name}`,
          });
        if (award === "FIFA World Cup Third Place")
          this.recordPlayerHonour(player, {
            award: "FIFA World Cup Third-place Medal",
            season: tournament.season,
            competition: "FIFA World Cup",
            value: `${tournament.year} · ${team.name}`,
          });
        this.recordPlayerHonour(player, {
          award,
          season: tournament.season,
          competition: "FIFA World Cup",
          value: `${tournament.year} · ${team.name}`,
        });
      }
    }
    const individualAwards = [
      ["FIFA World Cup Golden Boot", tournament.goldenBoot],
      ["FIFA World Cup Golden Ball", tournament.goldenBall],
      ["FIFA World Cup Golden Glove", tournament.goldenGlove],
      ["FIFA World Cup Best Young Player", tournament.bestYoungPlayer],
    ];
    for (const [award, winner] of individualAwards) {
      if (!winner) continue;
      tournament.awards.push({
        award,
        winners: [
          {
            playerId: winner.playerId,
            player: winner.player,
            nation: winner.nation,
          },
        ],
      });
      const player = playerById.get(winner.playerId);
      if (player)
        this.recordPlayerHonour(player, {
          award,
          season: tournament.season,
          competition: "FIFA World Cup",
          value: `${tournament.year} · ${winner.goals} goals · ${formatDecimal(meanRating(winner))} rating`,
        });
    }
    const countryTrophies = (this.worldCup.countryTrophies ??= {});
    const winnerHistory = (countryTrophies[tournament.winnerId] ??= []);
    if (!winnerHistory.some((entry) => entry.year === tournament.year)) {
      winnerHistory.push({
        year: tournament.year,
        manager: winners?.manager?.name ?? null,
        squadIds: winners?.squadIds ?? [],
        opponent: runnersUp?.name ?? null,
        score: tournament.fixtures.find((fixture) => fixture.round === "Final")
          ? (() => {
              const final = tournament.fixtures.find(
                (fixture) => fixture.round === "Final",
              );
              return `${final.homeGoals}-${final.awayGoals}`;
            })()
          : null,
      });
    }
    tournament.topScorers = byGoals.slice(0, 10);
    tournament.topRated = topRated.slice(0, 10);
    const ratings = (this.worldCup.nationalRatings ??= {});
    for (const fixture of tournament.fixtures) {
      if (fixture.homeGoals == null) continue;
      const home = ratings[fixture.homeId] ?? 1500;
      const away = ratings[fixture.awayId] ?? 1500;
      const expectedHome = 1 / (1 + 10 ** ((away - home) / 400));
      const actualHome =
        fixture.homeGoals > fixture.awayGoals
          ? 1
          : fixture.homeGoals === fixture.awayGoals
            ? 0.5
            : 0;
      ratings[fixture.homeId] = Math.round(
        home + 18 * (actualHome - expectedHome),
      );
      ratings[fixture.awayId] = Math.round(
        away + 18 * (1 - actualHome - (1 - expectedHome)),
      );
    }
    tournament.honoursAwarded = true;
  }

  simulateWorldLeaguesWeek(week) {
    for (const state of this.worldLeagues) {
      const roundIndex = state.league.fixtureWeeks.indexOf(week);
      if (roundIndex < 0) continue;
      const rng = this.rng.stream(
        `world-matches-${state.league.id}-${this.season}`,
      );
      for (const fixture of state.league.fixtures[roundIndex]) {
        const homeRating = this.worldClubStrength(state, fixture.home);
        const awayRating = this.worldClubStrength(state, fixture.away);
        const worldEntry = this.worldCareerLeagues.find(
          (entry) => entry.league.id === state.league.id,
        );
        const boosterFor = (clubId) =>
          teamBoosterFor(worldEntry?.clubIdentities?.[clubId]?.name);
        state.clubRatings[fixture.home] = homeRating;
        state.clubRatings[fixture.away] = awayRating;
        // The coach's formation shapes how each side attacks and defends, exactly as it
        // does in the user's league, so a back five is harder to score against here too.
        const homeShape = FORMATIONS[state.clubFormations?.[fixture.home]]
          ?.shape ?? { attack: 1, defence: 1 };
        const awayShape = FORMATIONS[state.clubFormations?.[fixture.away]]
          ?.shape ?? { attack: 1, defence: 1 };
        const homeTactic = state.clubTactics?.[fixture.home] ?? "Balanced";
        const awayTactic = state.clubTactics?.[fixture.away] ?? "Balanced";
        const tacticsAttack = (style) =>
          ({
            Possession: 1.02,
            "Tiki-Taka": 1.02,
            Counter: 1.03,
            "Wing Play": 1.03,
            Direct: 1.02,
            "High Press": 1.02,
            Gegenpressing: 1.01,
            "Low Block": 0.96,
            "Long Ball": 1.01,
          })[style] ?? 1;
        const tacticalForm = (style) =>
          ({
            Possession: 1.02,
            "Tiki-Taka": 1.04,
            Counter: 1,
            "Wing Play": 1,
            Direct: 0.98,
            "High Press": 0.96,
            Gegenpressing: 0.95,
            "Low Block": 1.03,
            "Long Ball": 0.98,
          })[style] ?? 1;
        const homeXIQuality = this.worldClubUnitQuality(
          state,
          fixture.home,
          "attack",
        );
        const homeDefense = this.worldClubUnitQuality(
          state,
          fixture.home,
          "defense",
        );
        const awayXIQuality = this.worldClubUnitQuality(
          state,
          fixture.away,
          "attack",
        );
        const awayDefense = this.worldClubUnitQuality(
          state,
          fixture.away,
          "defense",
        );
        const xg = expectedGoals(
          {
            attack:
              homeRating *
              homeShape.attack *
              tacticsAttack(homeTactic) *
              homeXIQuality,
            defence:
              homeRating *
              homeShape.defence *
              tacticalForm(homeTactic) *
              homeDefense,
            goalkeeping: this.worldClubUnitQuality(
              state,
              fixture.home,
              "goalkeeping",
            ),
            booster: boosterFor(fixture.home),
          },
          {
            attack:
              awayRating *
              awayShape.attack *
              tacticsAttack(awayTactic) *
              awayXIQuality,
            defence:
              awayRating *
              awayShape.defence *
              tacticalForm(awayTactic) *
              awayDefense,
            goalkeeping: this.worldClubUnitQuality(
              state,
              fixture.away,
              "goalkeeping",
            ),
            booster: boosterFor(fixture.away),
          },
        );
        const homeStartingXI = this.worldClubStartingXI(state, fixture.home);
        const awayStartingXI = this.worldClubStartingXI(state, fixture.away);
        const matchSimulation = simulatePossessionEngine({
          home: {
            xi: homeStartingXI,
            formation: state.clubFormations?.[fixture.home],
            shape: homeShape,
            tactics: homeTactic,
            strength: {
              attack: homeRating,
              midfield: homeRating,
              defence: homeRating,
              tacticalFamiliarity: 70,
              chemistry: 70,
            },
            defensiveLine:
              homeTactic === "Low Block"
                ? "Low"
                : homeTactic === "High Press"
                  ? "High"
                  : "Balanced",
          },
          away: {
            xi: awayStartingXI,
            formation: state.clubFormations?.[fixture.away],
            shape: awayShape,
            tactics: awayTactic,
            strength: {
              attack: awayRating,
              midfield: awayRating,
              defence: awayRating,
              tacticalFamiliarity: 70,
              chemistry: 70,
            },
            defensiveLine:
              awayTactic === "Low Block"
                ? "Low"
                : awayTactic === "High Press"
                  ? "High"
                  : "Balanced",
          },
          baselineXg: xg,
          rng,
          // World-league fixtures are league matches, so the same 50-goal season cap
          // applies here as it does in the domestic league.
          maxLeagueGoals: MAX_LEAGUE_GOALS,
        });
        const { homeGoals, awayGoals } = matchSimulation;
        state.league.table.record(
          fixture.home,
          fixture.away,
          homeGoals,
          awayGoals,
        );
        this.recordWorldLeaguePerformers(
          state,
          fixture.home,
          fixture.away,
          homeGoals,
          awayGoals,
          rng,
          matchSimulation,
          fixture,
        );
      }
    }
  }

  worldClubUnitQuality(state, clubId, unit = "attack") {
    const squad = (state.performers ?? []).filter(
      (player) =>
        player.clubId === clubId &&
        !isInjured(player) &&
        !this.worldCupUnavailableIds?.has(player.id),
    );
    if (!squad.length) return 1;
    const sorted = [...squad].sort(
      (a, b) => (b.overall ?? 60) - (a.overall ?? 60),
    );
    const slots = FORMATIONS[state.clubFormations?.[clubId]]?.slots ?? [
      "GK",
      "LB",
      "CB",
      "CB",
      "RB",
      "DM",
      "CM",
      "CM",
      "LW",
      "ST",
      "RW",
    ];
    const used = new Set();
    const xi = slots
      .map((slot) => {
        const candidate = sorted
          .filter((player) => !used.has(player.id))
          .sort((a, b) => {
            const posFit = (player) =>
              player.position === slot
                ? 1
                : ["DM", "CDM"].includes(slot) &&
                    ["DM", "CDM", "CM"].includes(player.position)
                  ? 0.75
                  : ["CB", "LB", "RB"].includes(slot) &&
                      ["CB", "LB", "RB"].includes(player.position)
                    ? 0.72
                    : ["LW", "RW", "AM", "CAM", "ST"].includes(slot) &&
                        ["LW", "RW", "AM", "CAM", "ST"].includes(
                          player.position,
                        )
                      ? 0.72
                      : 0.45;
            return (
              (b.overall ?? 60) * posFit(b) - (a.overall ?? 60) * posFit(a)
            );
          })[0];
        if (candidate) used.add(candidate.id);
        return candidate;
      })
      .filter(Boolean);
    const quality = (player) => {
      if (unit === "goalkeeping")
        // Shared goalkeeper quality; never a re-derived blend of attributes.
        return player.position === "GK"
          ? goalkeeperQuality(player.gkAttrs, {
              kind: "shotStopping",
              overall: Number(player.overall) || 60,
            })
          : Number(player.overall) || 60;
      const stats = player.attrs ?? {};
      if (unit === "attack")
        return (
          (stats.shooting ?? player.overall ?? 60) * 0.26 +
          (stats.passing ?? player.overall ?? 60) * 0.25 +
          (stats.dribbling ?? player.overall ?? 60) * 0.22 +
          (stats.pace ?? player.overall ?? 60) * 0.12 +
          (player.overall ?? 60) * 0.15
        );
      return (
        (stats.defending ?? player.overall ?? 60) * 0.4 +
        (stats.physical ?? player.overall ?? 60) * 0.18 +
        (stats.pace ?? player.overall ?? 60) * 0.08 +
        (player.overall ?? 60) * 0.34
      );
    };
    const average =
      xi.reduce((sum, player) => sum + quality(player), 0) /
      Math.max(1, xi.length);
    return clamp(0.85 + (average - 65) * 0.004, 0.72, 1.16);
  }

  worldClubStartingXI(state, clubId) {
    const squad = (state.performers ?? [])
      .filter(
        (player) =>
          player.clubId === clubId &&
          !isInjured(player) &&
          !this.worldCupUnavailableIds?.has(player.id),
      )
      .sort((a, b) => (b.overall ?? 60) - (a.overall ?? 60));
    const slots = FORMATIONS[state.clubFormations?.[clubId]]?.slots ?? [
      "GK",
      "LB",
      "CB",
      "CB",
      "RB",
      "CDM",
      "CM",
      "CM",
      "LW",
      "ST",
      "RW",
    ];
    const alternatives = {
      GK: ["GK"],
      LB: ["LB", "RB", "CB"],
      RB: ["RB", "LB", "CB"],
      CB: ["CB", "LB", "RB"],
      DM: ["DM", "CDM", "CM", "CB"],
      CDM: ["CDM", "DM", "CM", "CB"],
      CM: ["CM", "CAM", "AM", "DM", "CDM"],
      AM: ["AM", "CAM", "CM", "LW", "RW"],
      CAM: ["CAM", "AM", "CM", "LW", "RW"],
      LW: ["LW", "RW", "ST", "AM", "CAM"],
      RW: ["RW", "LW", "ST", "AM", "CAM"],
      ST: ["ST", "LW", "RW", "AM", "CAM"],
    };
    const available = [...squad];
    // Fill the goalkeeper slot first and only from natural goalkeepers: a keeper is not
    // interchangeable with an outfielder, and an outfielder must never be selected there.
    const keeperSlotIndex = slots.findIndex(
      (slot) => (slot ?? "").toUpperCase() === "GK",
    );
    const chosen = new Array(slots.length).fill(null);
    if (keeperSlotIndex >= 0) {
      const keepers = available
        .filter((player) => (player.position ?? "").toUpperCase() === "GK")
        .sort((a, b) => (b.overall ?? 60) - (a.overall ?? 60));
      const keeper = keepers[0];
      if (keeper) {
        chosen[keeperSlotIndex] = keeper;
        available.splice(available.indexOf(keeper), 1);
      }
    }
    slots.forEach((slot, slotIndex) => {
      if (chosen[slotIndex]) return;
      const options = available
        .filter((player) => (player.position ?? "").toUpperCase() !== "GK")
        .map((player) => ({
          player,
          score:
            (player.overall ?? 60) +
            ((alternatives[slot] ?? [slot]).includes(player.position) ? 0 : -18),
        }))
        .sort((left, right) => right.score - left.score);
      const selected = options[0]?.player;
      if (!selected) return;
      available.splice(available.indexOf(selected), 1);
      chosen[slotIndex] = selected;
    });
    return chosen.filter(Boolean);
  }

  /**
   * Measure the live quality of a background club from its available players.
   * The top XI matters most, while the best few players provide the ceiling that
   * separates elite clubs from deep but average squads.
   */
  worldClubStrength(state, clubId) {
    const squad = (state.performers ?? [])
      .filter(
        (player) =>
          player.clubId === clubId &&
          !isInjured(player) &&
          !this.worldCupUnavailableIds?.has(player.id),
      )
      .map((player) => Number(player.overall) || 50)
      .sort((left, right) => right - left);
    if (!squad.length) return state.clubRatings[clubId] ?? 60;
    const starters = squad.slice(0, 11);
    const topCore = squad.slice(0, Math.min(5, squad.length));
    const starterAverage =
      starters.reduce((sum, rating) => sum + rating, 0) / starters.length;
    const coreAverage =
      topCore.reduce((sum, rating) => sum + rating, 0) / topCore.length;
    return round(clamp(starterAverage * 0.72 + coreAverage * 0.28, 40, 99), 2);
  }

  worldClubName(state, clubId) {
    const identity = this.worldCareerLeagues.find(
      (entry) => entry.league.id === state.league.id,
    )?.clubIdentities?.[clubId];
    return identity?.name ?? clubId;
  }

  completeLeagueSeason() {
    const leagues = [
      this.league,
      ...this.worldLeagues.map((state) => state.league),
    ];
    const tables = Object.fromEntries(
      leagues.map((league) => [
        league.id,
        league.table.sorted().map((row) => row.teamId),
      ]),
    );
    const moves = applyPromotionRelegation({
      leagues: this.worldCareerLeagues,
      leagueTables: tables,
      clubIdentities: Object.fromEntries(
        this.worldCareerLeagues.flatMap((entry) =>
          Object.entries(entry.clubIdentities),
        ),
      ),
    });
    for (const entry of this.worldCareerLeagues) {
      const order = tables[entry.league.id];
      if (order) {
        entry.league.history ??= [];
        entry.league.history.push({ season: this.season, order });
        this.leagueHistories[entry.league.id] = entry.league.history;
      }
      for (const clubId of entry.league.teamIds) {
        const identity = entry.clubIdentities[clubId];
        if (!identity) continue;
        identity.tier = entry.league.tier;
        const factor = entry.league.tier === 1 ? 1.15 : 0.78;
        identity.budget = Math.round((identity.budget ?? 0) * factor);
        identity.wageBudget = Math.round((identity.wageBudget ?? 0) * factor);
      }
    }
    return moves;
  }

  recordWorldLeaguePerformers(
    state,
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    rng,
    matchSimulation = null,
    fixture = null,
  ) {
    const assistsByPlayer = new Map();
    for (const [clubId, goals, conceded] of [
      [homeId, homeGoals, awayGoals],
      [awayId, awayGoals, homeGoals],
    ]) {
      const starting = this.worldClubStartingXI(state, clubId);
      if (!starting.length) continue;
      const attackers = starting.filter((player) => player.position !== "GK");
      if (!matchSimulation) {
        for (const player of starting) {
          ensurePlayStyles(player);
          seedPlayStyles(player, rng);
        }
      }
      const elite = new Map(
        starting.map((player) => [player.id, eliteProfileFor(player)]),
      );
      const scorers = [];
      const goalsByPlayer = new Map();
      const decisionContext = {
        minute: 60,
        tactics: state.clubTactics?.[clubId] ?? "Balanced",
        space: 0.55,
        shotQuality: 0.58,
        pressure: clamp((state.clubRatings[clubId] - 70) / 90, 0.08, 0.55),
      };
      if (matchSimulation) {
        const side = clubId === homeId ? "home" : "away";
        for (const goal of matchSimulation.events.filter(
          (event) => event.side === side && event.type === "goal",
        )) {
          let scorer = starting.find((player) => player.id === goal.scorerId);
          if (!scorer || Number(scorer.goals ?? 0) >= 50) {
            scorer =
              starting.find(
                (player) =>
                  player.position !== "GK" && Number(player.goals ?? 0) < 50,
              ) ?? null;
          }
          if (!scorer) continue;
          scorer.goals++;
          goalsByPlayer.set(scorer.id, (goalsByPlayer.get(scorer.id) ?? 0) + 1);
          scorers.push(scorer);
          const assister = starting.find(
            (player) => player.id === goal.assistId,
          );
          if (assister) {
            assister.assists++;
            assistsByPlayer.set(
              assister.id,
              (assistsByPlayer.get(assister.id) ?? 0) + 1,
            );
          }
        }
        const recordedGoals = matchSimulation.events.filter(
          (event) => event.side === side && event.type === "goal",
        ).length;
        for (let goal = recordedGoals; goal < goals; goal++) {
          const scorer =
            starting.find(
              (player) =>
                player.position !== "GK" && Number(player.goals ?? 0) < 50,
            ) ?? null;
          if (!scorer) break;
          scorer.goals++;
          goalsByPlayer.set(scorer.id, (goalsByPlayer.get(scorer.id) ?? 0) + 1);
          scorers.push(scorer);
        }
      } else {
        for (let goal = 0; goal < goals; goal++) {
          const scorerPool = attackers.length
            ? attackers
            : starting.filter((player) => player.position !== "GK");
          const eligibleScorers = scorerPool.filter(
            (player) =>
              (goalsByPlayer.get(player.id) ?? 0) < 2 &&
              Number(player.goals ?? 0) < 50,
          );
          const scorer = rng.weightedPick(
            eligibleScorers.length ? eligibleScorers : scorerPool,
            (player) => {
              const positionWeight =
                {
                  ST: 4.2,
                  LW: 2.8,
                  RW: 2.8,
                  AM: 2.4,
                  CM: 1.4,
                  DM: 0.75,
                  LB: 0.55,
                  RB: 0.55,
                  CB: 0.4,
                }[player.position] ?? 0.5;
              const legendBoost = player.isLegend ? 4.5 : 1;
              const eliteBoost = elite.get(player.id)?.goalMultiplier ?? 1;
              const decision = simulateNpcPerformance(
                player,
                { ...decisionContext, position: player.position },
                rng,
              );
              player._matchPerformance = {
                ...(player._matchPerformance ?? {}),
                ...decision,
              };
              return (
                (positionWeight *
                  legendBoost *
                  eliteBoost *
                  Math.max(0.2, ((player.overall ?? 60) - 35) / 40) *
                  (0.72 +
                    decision.shotsOnTarget * 0.16 +
                    decision.decisionQuality * 0.35)) /
                (1 + (goalsByPlayer.get(player.id) ?? 0) * 1.5)
              );
            },
          );
          if (!scorer) continue;
          scorer.goals++;
          goalsByPlayer.set(scorer.id, (goalsByPlayer.get(scorer.id) ?? 0) + 1);
          scorers.push(scorer);
        }

        const assistedThisMatch = new Set();
        for (const scorer of scorers) {
          const creators = starting.filter(
            (player) =>
              player.id !== scorer.id &&
              player.position !== "GK" &&
              !assistedThisMatch.has(player.id),
          );
          if (!creators.length || !rng.chance(0.68)) continue;
          const assister = rng.weightedPick(creators, (player) => {
            const positionWeight =
              {
                LW: 2.5,
                RW: 2.5,
                AM: 2.4,
                CAM: 2.4,
                CM: 1.8,
                ST: 1.3,
                DM: 1,
                CDM: 1,
                LB: 0.8,
                RB: 0.8,
                CB: 0.4,
              }[player.position] ?? 0.5;
            const decision = simulateNpcPerformance(
              player,
              {
                ...decisionContext,
                position: player.position,
                laneQuality: 0.75,
              },
              rng,
            );
            player._matchPerformance = {
              ...(player._matchPerformance ?? {}),
              ...decision,
            };
            return (
              positionWeight *
              (player.isLegend ? 1.2 : 1) *
              (elite.get(player.id)?.assistMultiplier ?? 1) *
              Math.max(
                0.45,
                Math.min(1.2, ((player.overall ?? 60) - 40) / 40),
              ) *
              (0.72 +
                decision.keyPasses * 0.15 +
                decision.decisionQuality * 0.3)
            );
          });
          if (assister) {
            assister.assists++;
            assistsByPlayer.set(
              assister.id,
              (assistsByPlayer.get(assister.id) ?? 0) + 1,
            );
            assistedThisMatch.add(assister.id);
          }
        }
      }
      for (const player of starting) {
        player.apps++;
        const performance =
          matchSimulation?.playerStats?.[player.id] ??
          player._matchPerformance ??
          simulateNpcPerformance(
            player,
            {
              position: player.position,
              minutes: 90,
              tactics: state.clubTactics?.[clubId],
              won: goals > conceded,
              drew: goals === conceded,
              goalsConceded: conceded,
            },
            rng,
          );
        performance.goals = goalsByPlayer.get(player.id) ?? 0;
        performance.assists = assistsByPlayer.get(player.id) ?? 0;
        const rating =
          player.isLegend && primeProfileFor(player)
            ? round(
                clamp(
                  primeProfileFor(player).averageRating +
                    Math.min(
                      0.45,
                      performance.goals * 0.08 + performance.assists * 0.06,
                    ) +
                    (goals > conceded ? 0.12 : goals === conceded ? 0 : -0.1),
                  RATING_MIN,
                  RATING_MAX,
                ),
                1,
              )
            : round(
                clamp(
                  rateNpcPerformance(player, performance, {
                    position: player.position,
                    won: goals > conceded,
                    drew: goals === conceded,
                    goalsConceded: conceded,
                    opponentQuality: state.clubRatings[clubId],
                  }),
                  RATING_MIN,
                  RATING_MAX,
                ),
                1,
              );
        player.ratingSum += rating;
        player.lastMatchRating = rating;
        player.lastMatchPerformance = { ...performance, rating };
        // Goalkeeper statistics are recorded only for a goalkeeper, and only from the
        // shots the opposing side actually had on target.
        if ((player.position ?? "").toUpperCase() === "GK") {
          player.stats ??= emptyStats();
          player.careerStats ??= emptyStats();
          const goalsConceded = Math.max(0, Math.round(Number(conceded) || 0));
          // Shots on target are at least the goals conceded. The keeper's own quality
          // decides how many of the rest he keeps out, so a 90-rated keeper is not
          // credited with a 0% save rate just because his defence kept the score down.
          const saveFactor = goalkeeperSaveFactor(player.gkAttrs, {
            kind: "shotStopping",
            overall: player.overall,
          });
          // A league match sees roughly 3-7 shots on target against a side; the keeper's
          // quality decides how many he keeps out. Seeded, so a save still simulates the
          // same way for the same career.
          const shotsFaced = Math.max(
            goalsConceded,
            Math.round(Number(performance.shotsFaced) || 0) ||
              3 +
                Math.round(
                  hashString(
                    `${player.id}:${fixture?.id ?? state.league?.name ?? ""}:${goalsConceded}`,
                  ) % 4,
                ) +
                (goalsConceded > 0 ? 1 : 0),
          );
          const saves = Math.min(
            Math.max(0, shotsFaced - goalsConceded),
            Math.round(shotsFaced * saveFactor),
          );
          player.stats.saves = (player.stats.saves ?? 0) + saves;
          player.careerStats.saves = (player.careerStats.saves ?? 0) + saves;
          player.stats.shotsFaced = (player.stats.shotsFaced ?? 0) + shotsFaced;
          player.careerStats.shotsFaced =
            (player.careerStats.shotsFaced ?? 0) + shotsFaced;
          player.stats.goalsConceded =
            (player.stats.goalsConceded ?? 0) + goalsConceded;
          player.careerStats.goalsConceded =
            (player.careerStats.goalsConceded ?? 0) + goalsConceded;
          if (goalsConceded === 0) {
            player.stats.cleanSheets = (player.stats.cleanSheets ?? 0) + 1;
            player.careerStats.cleanSheets =
              (player.careerStats.cleanSheets ?? 0) + 1;
          }
          const faced = player.stats.shotsFaced ?? shotsFaced;
          player.stats.savePercentage = faced
            ? round(((player.stats.saves ?? 0) / faced) * 100, 1)
            : 0;
        }
        player.matchHistory ??= [];
        player.matchHistory.push({
          season: this.season,
          dateIndex: fixture?.scheduledDate ?? fixture?.matchday ?? this.week,
          competitionId: state.league.id,
          competition: state.league.name,
          club: this.worldClubName(state, clubId),
          opponent: this.worldClubName(
            state,
            clubId === homeId ? awayId : homeId,
          ),
          homeGoals,
          awayGoals,
          result: goals > conceded ? "W" : goals === conceded ? "D" : "L",
          starts: true,
          minutes: performance.minutes ?? 90,
          goals: performance.goals,
          assists: performance.assists,
          rating,
        });
        player._matchPerformance = null;
        player.form = clamp(
          (player.form ?? 50) * 0.82 + rating * 7 * 0.18,
          25,
          90,
        );
        player.confidence = clamp(
          (player.confidence ?? 60) * 0.9 + rating * 1.5,
          20,
          95,
        );
        player.fatigue = clamp((player.fatigue ?? 0) + 14, 0, 100);
        player.sharpness = clamp(
          (player.sharpness ?? 70) * 0.85 + 85 * 0.15,
          20,
          100,
        );
      }
    }
  }

  areAllLeagueSeasonsComplete() {
    const isComplete = (league) =>
      league.table.isComplete(2 * (league.teamIds.length - 1));
    return (
      isComplete(this.league) &&
      this.worldLeagues.every(({ league }) => isComplete(league)) &&
      this.expansionLeagues.every((config) => {
        const currentEntry = this.worldCareerLeagues?.find(
          (entry) => entry.league.id === config.id,
        );
        const currentLeague = [
          this.league,
          ...this.worldLeagues.map((state) => state.league),
        ].find((league) => league.id === config.id);
        return !currentEntry || !currentLeague || isComplete(currentLeague);
      })
    );
  }

  areAllSeasonCompetitionsComplete() {
    const worldCupYear = this.worldCup?.nextYear;
    const tournament = this.worldCup?.tournament;
    const worldCupDueThisSeason =
      worldCupYear != null && this.season === worldCupYear - 1;
    const tournamentBelongsToSeason = tournament?.season === this.season;
    const worldCupComplete =
      (!worldCupDueThisSeason && !tournamentBelongsToSeason) ||
      ["complete", "cancelled"].includes(tournament?.status);
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status !== "complete" &&
      !this.areAllLeagueSeasonsComplete()
    ) {
      return false;
    }
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status !== "complete" &&
      this.areAllLeagueSeasonsComplete()
    ) {
      this.completeChampionsLeagueIfDue();
    }
    return (
      this.areAllLeagueSeasonsComplete() &&
      (!this.championsLeague ||
        this.championsLeague.season !== this.season ||
        this.championsLeague.status === "complete") &&
      worldCupComplete
    );
  }

  publishBallonDorCeremony() {
    const awardPeriod = this.season;
    if (
      this.ballonDorCeremonies.some(
        (ceremony) => ceremony.awardPeriod === awardPeriod,
      )
    ) {
      return null;
    }
    if (this.currentSeasonAwards?.season !== awardPeriod) return null;
    this.refreshCurrentBallonDorSnapshot();
    const award = this.currentSeasonAwards.awards.find(
      (entry) => entry.award === "Ballon d'Or",
    );
    if (!award?.evaluation?.winner) return null;
    const ceremony = {
      awardPeriod,
      ceremonySeason: awardPeriod + 1,
      award: structuredClone(award),
      presented: true,
    };
    this.ballonDorCeremonies.push(ceremony);
    const winner = award.winners?.[0];
    if (winner) {
      this.recordPlayerHonour(
        this.findWorldPlayer(winner.playerId) ?? winner.playerId,
        {
          award: "Ballon d'Or",
          season: awardPeriod,
          competition: "World football",
          value: award.displayValue,
        },
      );
    }
    this.news.unshift(
      `Ballon d'Or ceremony: ${award.evaluation.winner.player} wins the ${awardPeriod} award with ${formatDecimal(award.evaluation.winner.points)} points.`,
    );
    return ceremony;
  }

  recordSeasonAwards() {
    if (!this.areAllLeagueSeasonsComplete()) return;
    if (this.seasonAwardHistory.at(-1)?.season === this.season) return;
    for (const club of this.clubs) {
      const manager = ensureCoachProfile(club);
      const row =
        this.league.id === club.leagueId
          ? this.league.table.row(club.id)
          : this.worldLeagues
              .find((state) => state.league.teamIds.includes(club.id))
              ?.league.table.row(club.id);
      const result = row?.won > row?.lost ? 1 : row?.won < row?.lost ? -1 : 0;
      developCoach(club, {
        result,
        trophy:
          row?.points > 0 &&
          row?.teamId === (this.league.table.sorted()[0]?.teamId ?? null)
            ? 1
            : 0,
      });
      manager.salary = ensureCoachProfile(club).salary;
    }
    const race = this.getAwardRace();
    const ballonRace = this.getBallonDorRace();
    const awardCandidates = race.map((entry) => entry.player);
    this.ballonDorWatchlist = ballonRace.slice(0, 20).map((entry, index) => ({
      playerId: entry.playerId ?? entry.player.id,
      player: `${entry.player.first} ${entry.player.last}`,
      clubId: entry.player.clubId,
      overall: entry.player.overall ?? 0,
      goals: entry.goals ?? 0,
      assists: entry.assists ?? 0,
      averageRating: entry.averageRating ?? 0,
      points: entry.points ?? 0,
      rank: index + 1,
    }));
    const withClub = (player) => ({
      player: `${player.first} ${player.last}`,
      playerId: player.id,
      club:
        this.clubs.find((club) => club.id === player.clubId)?.name ??
        this.data.careerLeagues?.find((entry) =>
          entry.league.teamIds.includes(player.clubId),
        )?.clubIdentities[player.clubId]?.name ??
        "Free agent",
      clubId: player.clubId,
    });
    const winnersFor = (items, score) => {
      if (!items.length) return { winners: [], value: null };
      const ranked = [...items].sort(
        (left, right) =>
          score(right) - score(left) ||
          String((right.player ?? right).id ?? "").localeCompare(
            String((left.player ?? left).id ?? ""),
          ),
      );
      const winner = ranked[0];
      return {
        winners: [withClub(winner.player ?? winner)],
        value: score(winner),
      };
    };
    const leagueAwardsFor = (leagueName, league, leagueRace) => {
      const candidates = leagueRace.map((entry) => entry.player);
      const championId = league.table.sorted()[0]?.teamId;
      const championRace = leagueRace
        .filter((entry) => entry.player.clubId === championId)
        .sort(
          (left, right) =>
            right.points - left.points ||
            right.averageRating - left.averageRating ||
            right.player.overall - left.player.overall,
        );
      const playerOfSeason = championRace[0] ?? leagueRace[0];
      const championIds = new Set([championId]);
      const awards = [
        {
          award: "Player of the Season",
          winners: playerOfSeason ? [withClub(playerOfSeason.player)] : [],
          value: playerOfSeason?.points ?? null,
          valueLabel: "race points",
          displayValue: playerOfSeason
            ? `${formatDecimal(playerOfSeason.points)} pts · league champions`
            : null,
        },
        {
          award: "Golden Boot",
          ...winnersFor(
            candidates.filter((player) => player.leagueGoals > 0),
            (player) => player.leagueGoals,
          ),
          valueLabel: "league goals",
        },
        {
          award: "Playmaker of the Season",
          ...winnersFor(
            candidates.filter((player) => player.leagueAssists > 0),
            (player) => player.leagueAssists,
          ),
          valueLabel: "league assists",
        },
        {
          award: "Best Average Rating",
          ...winnersFor(
            leagueRace.filter((entry) => entry.player.stats.apps >= 5),
            (entry) => entry.averageRating,
          ),
          valueLabel: "average rating",
          displayValue: leagueRace.find((entry) => entry.player.stats.apps >= 5)
            ? `${formatDecimal(Math.max(...leagueRace.filter((entry) => entry.player.stats.apps >= 5).map((entry) => entry.averageRating)))} rating`
            : null,
        },
      ];
      const positionalPlayers = candidates;
      for (const awardName of [
        "Young Player of the Season",
        "Best Goalkeeper",
        "Best Defender",
        "Best Midfielder",
        "Best Forward",
      ]) {
        const definition = positionAwardDefinition(awardName);
        const filtered =
          awardName === "Best Goalkeeper"
            ? positionalPlayers.filter(
                (player) => normalizePosition(player.position) === "GK",
              )
            : awardName === "Best Defender"
              ? positionalPlayers.filter((player) =>
                  ["CB", "LB", "RB"].includes(
                    normalizePosition(player.position),
                  ),
                )
              : awardName === "Best Midfielder"
                ? positionalPlayers.filter((player) =>
                    ["DM", "CM", "AM"].includes(
                      normalizePosition(player.position),
                    ),
                  )
                : awardName === "Best Forward"
                  ? positionalPlayers.filter((player) =>
                      ["LW", "RW", "ST"].includes(
                        normalizePosition(player.position),
                      ),
                    )
                  : positionalPlayers;
        awards.push(
          awardRecord(awardName, filtered, definition, { championIds }),
        );
      }
      const teamOfSeason = [...leagueRace]
        .sort(
          (left, right) =>
            right.points - left.points ||
            right.averageRating - left.averageRating,
        )
        .slice(0, 11)
        .map((entry) => withClub(entry.player));
      awards.push({
        award: "Team of the Season",
        winners: teamOfSeason,
        value: teamOfSeason.length,
        valueLabel: "players selected",
        displayValue: `${teamOfSeason.length} players selected`,
      });
      const coachCandidates = league.teamIds
        .map((teamId) => {
          const club =
            this.clubs.find((entry) => entry.id === teamId) ??
            (() => {
              const identity = this.worldCareerLeagues
                ?.flatMap((entry) => Object.values(entry.clubIdentities ?? {}))
                .find((entry) => entry.id === teamId);
              if (!identity) return null;
              return new Club({
                ...identity,
                id: teamId,
                leagueId: league.id,
                manager: {
                  id: `manager-${teamId}`,
                  name: `${identity.name} Head Coach`,
                  rating: identity.prestige ?? 60,
                },
              });
            })();
          if (!club) return null;
          const manager = ensureCoachProfile(club);
          const row = league.table.row(teamId);
          if (!row) return null;
          const position =
            league.table.positions().get(teamId) ?? league.teamIds.length;
          const winRate = row.played ? row.won / row.played : 0;
          return {
            club,
            manager,
            score:
              (league.teamIds.length - position + 1) * 10 +
              winRate * 20 +
              manager.overall * 0.2 +
              (manager.statistics.tacticalSuccess ?? 0) * 0.05,
          };
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score);
      const coachWinner = coachCandidates[0];
      awards.push({
        award: "Coach of the Season",
        winners: coachWinner
          ? [
              {
                playerId: coachWinner.manager.id,
                coachId: coachWinner.manager.id,
                coach: coachWinner.manager.name,
                club: coachWinner.club.name,
                clubId: coachWinner.club.id,
              },
            ]
          : [],
        value: coachWinner?.score ?? null,
        valueLabel: "season score",
        displayValue: coachWinner
          ? `${coachWinner.manager.name} \u2013 ${formatDecimal(coachWinner.score)} pts`
          : null,
      });
      return awards.map((award) => ({
        ...award,
        competition: leagueName,
        leagueId: league.id,
      }));
    };
    const currentLeagueAwards = leagueAwardsFor(
      this.league.name,
      this.league,
      race,
    );
    const otherLeagueAwards = (this.worldLeagues ?? []).flatMap((state) => {
      const leagueRace = awardRace(
        state.performers
          .filter((player) => (player.apps ?? player.stats?.apps ?? 0) > 0)
          .map((player) => ({
            ...player,
            stats: {
              ...(player.stats ?? {}),
              apps: player.apps ?? player.stats?.apps ?? 0,
              ratingSum: player.ratingSum ?? player.stats?.ratingSum ?? 0,
            },
            leagueGoals: player.goals ?? player.leagueGoals ?? 0,
            leagueAssists: player.assists ?? player.leagueAssists ?? 0,
          })),
      );
      return leagueAwardsFor(state.league.name, state.league, leagueRace);
    });
    const awards = [
      ...currentLeagueAwards,
      ...otherLeagueAwards,
      {
        award: "Ballon d'Or",
        competition: "World football",
        leagueId: null,
        winners: ballonRace[0]
          ? [
              {
                ...withClub(ballonRace[0].player),
                playerId: ballonRace[0].playerId ?? ballonRace[0].player.id,
              },
            ]
          : [],
        value: ballonRace[0]?.points ?? null,
        valueLabel: "world player of the year",
        displayValue: ballonRace.length
          ? `${formatDecimal(ballonRace[0].points)} pts`
          : null,
      },
    ];
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status === "complete"
    ) {
      awards.push(...this.championsLeague.awards);
    }
    const worldFootballRace = this.getBallonDorRace({ awards });
    const worldFootballWinner = worldFootballRace[0];
    awards.push({
      award: "World Player of the Season",
      competition: "World football",
      winners: worldFootballWinner
        ? [
            {
              ...withClub(worldFootballWinner.player),
              playerId: worldFootballWinner.playerId,
            },
          ]
        : [],
      value: worldFootballWinner?.points ?? null,
      valueLabel: "global race points",
      displayValue: worldFootballWinner
        ? `${formatDecimal(worldFootballWinner.points)} pts`
        : null,
    });
    const finalBallonRace = this.getBallonDorRace({ awards });
    const evaluatedBallonRace = this.getBallonDorRace({
      awards,
      requireIndividualAward: true,
    });
    const ballonAward = awards.find((award) => award.award === "Ballon d'Or");
    const voteResult = this.getBallonDorVoteResult();
    if (ballonAward && voteResult?.winner) {
      const winnerEntry = voteResult.winner;
      const winner = evaluatedBallonRace.find((entry) => entry.playerId === winnerEntry.playerId) ?? evaluatedBallonRace[0];
      ballonAward.winners = [
        {
          ...withClub(winner.player),
          playerId: winner.playerId,
        },
      ];
      ballonAward.value = winner.points;
      ballonAward.displayValue = `${formatDecimal(winner.points)} / 1000 pts`;
      ballonAward.evaluation = {
        winner: {
          playerId: winner.playerId,
          player: `${winner.player.first} ${winner.player.last}`,
          clubId: winner.clubId,
          club: withClub(winner.player).club,
          nationality: winner.nationality,
          overall: winner.overall,
          points: winner.points,
          categoryScores: winner.categoryScores,
          goals: winner.goals,
          assists: winner.assists,
          domesticAchievements: winner.domesticAchievements,
          championsLeagueAchievements: winner.championsLeagueAchievements,
          votePoints: winnerEntry.points,
          firstPlaceVotes: winnerEntry.firstPlaceVotes,
          secondPlaceVotes: winnerEntry.secondPlaceVotes,
        },
        top10: voteResult.top10.map((entry, index) => {
          const raceEntry = evaluatedBallonRace.find((e) => e.playerId === entry.playerId);
          return {
            rank: index + 1,
            playerId: entry.playerId,
            player: entry.player,
            clubId: raceEntry?.clubId,
            club: raceEntry ? withClub(raceEntry.player).club : "",
            nationality: entry.player.nationality ?? "Unknown",
            overall: raceEntry?.overall ?? 0,
            points: raceEntry?.points ?? entry.points,
            categoryScores: raceEntry?.categoryScores ?? {},
            goals: raceEntry?.goals ?? 0,
            assists: raceEntry?.assists ?? 0,
            domesticAchievements: raceEntry?.domesticAchievements ?? [],
            championsLeagueAchievements: raceEntry?.championsLeagueAchievements ?? [],
            votePoints: entry.points,
            firstPlaceVotes: entry.firstPlaceVotes,
            secondPlaceVotes: entry.secondPlaceVotes,
          };
        }),
        shortlist: voteResult.shortlist,
        voting: {
          totalJournalists: voteResult.totalJournalists,
          winnerVotePoints: winnerEntry.points,
        },
      };
    } else if (ballonAward) {
      ballonAward.winners = [];
      ballonAward.value = null;
      ballonAward.displayValue = null;
      ballonAward.evaluation = null;
    }
    this.currentSeasonAwards = { season: this.season, awards };
    this.seasonAwardHistory.push(this.currentSeasonAwards);
    const ballonNominees = awards
      .find((award) => award.award === "Ballon d'Or")
      ?.evaluation?.top10?.map((entry) => entry.player);
    if (ballonNominees?.length) {
      this.news.unshift(
        `Ballon d'Or nominations for ${this.season}: ${ballonNominees.join(", ")}. The ceremony will take place at the start of next season.`,
      );
    }
    for (const award of awards) {
      if (award.award === "Ballon d'Or") continue;
      if (award.award === "Coach of the Season") {
        const winner = award.winners[0];
        const coachClub = this.clubs.find((club) => club.id === winner?.clubId);
        if (coachClub) {
          const manager = ensureCoachProfile(coachClub);
          manager.statistics.coachAwards++;
          manager.seasonAwards.push({
            season: this.season,
            award: award.award,
            competition: award.competition,
          });
          manager.careerHistory.push({
            season: this.season,
            club: coachClub.name,
            achievement: award.award,
          });
          // Also record in coach's honours for getPlayerHonours compatibility
          this.recordPlayerHonour(manager.id, {
            award: award.award,
            season: this.season,
            competition: award.competition,
            value: award.displayValue ?? `${award.value} ${award.valueLabel}`,
          });
        }
        continue;
      }
      for (const winner of award.winners.slice(
        0,
        award.award === "Team of the Season" ? 11 : 1,
      )) {
        // Resolve the winner wherever he lives: the active league or a background league.
        const winningPlayer =
          this.findWorldPlayer(winner.playerId) ??
          (typeof winner.player === "object" ? winner.player : null) ??
          this.findWorldPlayer(winner.player);
        const honourCompetition =
          award.award === "Ballon d'Or"
            ? "World football"
            : (award.competition ??
              this.competitionForPlayer(winningPlayer, this.league.name));
        this.recordPlayerHonour(
          winningPlayer ?? winner.playerId ?? winner.player,
          {
            award: award.award,
            season: this.season,
            competition: honourCompetition,
            value: award.displayValue ?? `${award.value} ${award.valueLabel}`,
          },
        );
      }
    }
  }

  refreshCurrentBallonDorSnapshot() {
    const awards = this.currentSeasonAwards?.awards;
    if (this.currentSeasonAwards?.season !== this.season || !awards?.length)
      return;
    const ballonAward = awards.find((award) => award.award === "Ballon d'Or");
    if (!ballonAward) return;

    const voteResult = this.getBallonDorVoteResult();
    if (!voteResult?.winner) return;
    const race = this.getBallonDorRace({ awards });
    const eligibleRace = this.getBallonDorRace({
      awards,
      requireIndividualAward: true,
    });
    const winnerEntry = voteResult.winner;
    const winner = eligibleRace.find((entry) => entry.playerId === winnerEntry.playerId) ?? eligibleRace[0];
    if (!winner) return;
    const clubNameFor = (player) =>
      this.clubs.find((club) => club.id === player.clubId)?.name ??
      this.data.careerLeagues?.find((entry) =>
        entry.league.teamIds.includes(player.clubId),
      )?.clubIdentities?.[player.clubId]?.name ??
      "Free agent";
    const snapshotEntry = (entry, rank) => ({
      rank,
      playerId: entry.playerId,
      player: `${entry.player.first} ${entry.player.last}`,
      clubId: entry.clubId,
      club: clubNameFor(entry.player),
      nationality: entry.nationality,
      overall: entry.overall,
      points: entry.points,
      categoryScores: entry.categoryScores,
      goals: entry.goals,
      assists: entry.assists,
      domesticAchievements: entry.domesticAchievements,
      championsLeagueAchievements: entry.championsLeagueAchievements,
    });

    ballonAward.winners = [
      {
        player: `${winner.player.first} ${winner.player.last}`,
        playerId: winner.playerId,
        club: clubNameFor(winner.player),
      },
    ];
    ballonAward.value = winner.points;
    ballonAward.displayValue = `${formatDecimal(winner.points)} / 1000 pts`;
    ballonAward.evaluation = {
      winner: {
        ...snapshotEntry(winner, 1),
        votePoints: winnerEntry.points,
        firstPlaceVotes: winnerEntry.firstPlaceVotes,
        secondPlaceVotes: winnerEntry.secondPlaceVotes,
      },
      top10: voteResult.top10.map((entry, index) => {
        const raceEntry = race.find((e) => e.playerId === entry.playerId);
        return {
          ...snapshotEntry(raceEntry ?? entry, index + 1),
          votePoints: entry.points,
          firstPlaceVotes: entry.firstPlaceVotes,
          secondPlaceVotes: entry.secondPlaceVotes,
        };
      }),
      shortlist: voteResult.shortlist,
      voting: {
        totalJournalists: voteResult.totalJournalists,
        winnerVotePoints: winnerEntry.points,
      },
    };

    this.currentSeasonAwards = { ...this.currentSeasonAwards, awards };
    for (let index = this.seasonAwardHistory.length - 1; index >= 0; index--) {
      if (this.seasonAwardHistory[index].season === this.season) {
        this.seasonAwardHistory[index] = this.currentSeasonAwards;
        break;
      }
    }
  }

  ballonDorTrophyScore(player) {
    if (!player) return 0;
    if (player.isLegend) return 50;
    const clubId = player.clubId;
    let score = 0;
    const leagueChampionIds = new Set();
    const addLeagueChampion = (league) => {
      const championId = league?.table?.sorted?.()?.[0]?.teamId;
      if (championId) leagueChampionIds.add(championId);
    };
    addLeagueChampion(this.league);
    for (const state of this.worldLeagues ?? []) {
      addLeagueChampion(state.league);
    }
    if (leagueChampionIds.has(clubId)) score += 32;
    const championsStats = this.isChampionsLeagueClub(clubId)
      ? Object.values(this.championsLeague?.stats ?? {}).filter(
          (row) =>
            row.clubId === clubId &&
            (row.playerId === player.id ||
              row.player === `${player.first} ${player.last}`),
        )
      : [];
    if (championsStats.length) {
      const contribution = championsStats.reduce(
        (sum, row) =>
          sum +
          row.goals * 2.5 +
          row.assists * 1.5 +
          row.ratingSum / Math.max(1, row.apps),
        0,
      );
      score += Math.min(30, contribution);
      if (this.championsLeague?.winnerId === clubId) score += 18;
      if (
        this.championsLeague?.awards?.some(
          (award) =>
            award.award === "Champions League Player of the Season" &&
            award.winners.some(
              (winner) => winner.playerId === championsStats[0].playerId,
            ),
        )
      )
        score += 12;
      if (
        this.championsLeague?.awards?.some(
          (award) =>
            award.award === "Champions League Golden Boot" &&
            award.winners.some(
              (winner) => winner.playerId === championsStats[0].playerId,
            ),
        )
      )
        score += 8;
    }

    return score;
  }

  getBallonDorRace({
    awards = this.currentSeasonAwards?.awards ?? [],
    requireIndividualAward = false,
  } = {}) {
    return this.getBallonDorRaceRedesigned({ awards, requireIndividualAward });
  }

  getBallonDorRaceRedesigned({
    awards = [],
    requireIndividualAward = false,
  } = {}) {
    const clamp = (value, max) => Math.max(0, Math.min(max, value || 0));
    const diminishing = (value, max, scale) =>
      clamp(max * (1 - Math.exp(-Math.max(0, value) / scale)), max);
    const weighted = (value, weight, max) =>
      clamp(Math.max(0, Number(value) || 0) * weight, max);
    const normalizedName = (player) =>
      `${player?.first ?? ""} ${player?.last ?? player?.player ?? ""}`
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    const competitionNames = new Set([
      "Premier League",
      "La Liga",
      "Bundesliga",
      "Serie A",
      "Ligue 1",
      "UEFA Champions League",
    ]);
    const leagueStates = [
      { league: this.league },
      ...(this.worldLeagues ?? []),
    ];
    const leagueByClub = new Map();
    for (const state of leagueStates) {
      if (!competitionNames.has(state.league?.name)) continue;
      for (const clubId of state.league.teamIds ?? [])
        leagueByClub.set(clubId, state.league);
    }
    const allPlayers = new Map();
    for (const player of [
      ...(this.players ?? []),
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
    ]) {
      if (player?.id) allPlayers.set(player.id, player);
    }
    const clRows = Object.values(this.championsLeague?.stats ?? {});
    const findClRow = (player) => {
      if (!this.isChampionsLeagueClub(player.clubId)) return null;
      return (
        clRows.find(
          (row) =>
            row.clubId === player.clubId &&
            (row.playerId === player.id ||
              normalizedName(row) === normalizedName(player)),
        ) ??
        clRows.find(
          (row) =>
            row.clubId === player.clubId &&
            normalizedName(row) === normalizedName(player),
        )
      );
    };
    const positionStats = (player, stats, goals, assists) => {
      const position = normalizePosition(player.position);
      if (position === "GK")
        return (
          (stats.cleanSheets ?? 0) * 3 +
          (stats.saves ?? 0) * 0.35 +
          (stats.savePercentage ?? 0) * 0.25 +
          (stats.goalsPrevented ?? 0) * 2 +
          goals * 4 +
          assists * 3
        );
      if (["CB", "LB", "RB"].includes(position))
        return (
          goals * 5 +
          assists * 4 +
          (stats.cleanSheets ?? 0) * 3 +
          (stats.tacklesWon ?? stats.tackles ?? 0) * 0.8 +
          (stats.interceptions ?? 0) * 0.7 +
          (stats.blocks ?? 0) * 0.7 +
          (stats.aerialsWon ?? 0) * 0.3
        );
      if (["DM", "CM", "AM"].includes(position))
        return (
          goals * 7 +
          assists * 8 +
          (stats.keyPasses ?? stats.bigChancesCreated ?? 0) * 0.7 +
          (stats.tacklesWon ?? stats.tackles ?? 0) * 0.35 +
          (stats.interceptions ?? 0) * 0.35 +
          (stats.passesCompleted ?? 0) * 0.015
        );
      return (
        goals * 11 +
        assists * 8 +
        (stats.shotsOnTarget ?? 0) * 0.35 +
        (stats.chancesCreated ?? stats.keyPasses ?? 0) * 0.35
      );
    };
    const awardMatches = (award, player) =>
      award.award !== "Ballon d'Or" &&
      (award.winners ?? []).some(
        (winner) =>
          winner.playerId === player.id ||
          normalizedName(winner) === normalizedName(player),
      );
    const playerAwards = (player, competition) =>
      awards.filter(
        (award) =>
          (!competition ||
            String(award.competition ?? "").toLowerCase() ===
              competition.toLowerCase()) &&
          awardMatches(award, player),
      );
    const candidates = [];
    for (const player of allPlayers.values()) {
      const league = leagueByClub.get(player.clubId);
      if (!league || !competitionNames.has(league.name)) continue;
      const stats = player.stats ?? {};
      const hasLeaguePerformance = player.leaguePerformance != null;
      const apps = hasLeaguePerformance
        ? (player.leaguePerformance.apps ?? 0)
        : (player.apps ?? stats.apps ?? 0);
      const ratingSum = hasLeaguePerformance
        ? (player.leaguePerformance.ratingSum ?? 0)
        : (player.ratingSum ?? stats.ratingSum ?? 0);
      const goals = hasLeaguePerformance
        ? (player.leagueGoals ?? 0)
        : (player.leagueGoals ?? player.goals ?? stats.goals ?? 0);
      const assists = hasLeaguePerformance
        ? (player.leagueAssists ?? 0)
        : (player.leagueAssists ?? player.assists ?? stats.assists ?? 0);
      const averageRating = apps ? ratingSum / apps : 0;
      const worldCupTournament =
        this.worldCup?.tournament?.season === this.season &&
        this.worldCup.tournament.status === "complete"
          ? this.worldCup.tournament
          : null;
      const worldCupRow = worldCupTournament?.playerStats?.[player.id] ?? null;
      const worldCupAverage = worldCupRow
        ? worldCupRow.ratingSum / Math.max(1, worldCupRow.apps)
        : 0;
      const worldCupIndividual = worldCupRow
        ? clamp(
            clamp((worldCupAverage - 6) * 9, 40) *
              Math.min(1, worldCupRow.apps / 3),
            40,
          )
        : 0;
      const worldCupGoalsAssists = worldCupRow
        ? clamp(worldCupRow.goals * 3 + worldCupRow.assists * 2.5, 20)
        : 0;
      const worldCupKnockouts = worldCupRow
        ? clamp(
            (worldCupRow.knockoutApps ?? 0) * 2 +
              (worldCupRow.knockoutRatingSum ?? 0) * 0.25 +
              worldCupRow.goals * 0.8,
            15,
          )
        : 0;
      const worldCupTeamAchievement =
        worldCupRow && player.nationality === worldCupTournament?.winnerId
          ? 15
          : worldCupRow && player.nationality === worldCupTournament?.runnerUpId
            ? 10
            : worldCupRow &&
                player.nationality === worldCupTournament?.thirdPlaceId
              ? 6
              : 0;
      const worldCupAwards = worldCupRow
        ? Math.min(
            10,
            (worldCupTournament?.goldenBoot?.playerId === player.id ? 4 : 0) +
              (worldCupTournament?.goldenBall?.playerId === player.id ? 5 : 0) +
              (worldCupTournament?.goldenGlove?.playerId === player.id
                ? 4
                : 0) +
              (worldCupTournament?.bestYoungPlayer?.playerId === player.id
                ? 3
                : 0),
          )
        : 0;
      const worldCupPoints =
        worldCupIndividual +
        worldCupGoalsAssists +
        worldCupKnockouts +
        worldCupTeamAchievement +
        worldCupAwards;
      const cl = findClRow(player);
      const clApps = cl?.apps ?? 0;
      const clRating = clApps ? cl.ratingSum / clApps : 0;
      if (!apps && !clApps && !worldCupRow?.apps) continue;
      const domesticStats = positionStats(player, stats, goals, assists);
      const domesticAwards = awards.filter(
        (award) =>
          awardMatches(award, player) &&
          !["uefa champions league", "world football"].includes(
            String(award.competition ?? "").toLowerCase(),
          ),
      );
      const playingTimeFactor = Math.min(1, apps / 20);
      const domesticLeaguePerformance = clamp(
        (clamp((averageRating - 6) * 38, 70) +
          diminishing(domesticStats, 95, 55) +
          clamp(Math.min(apps, 38) * 1.15, 44) +
          clamp(domesticAwards.length * 8, 24)) *
          (0.65 + playingTimeFactor * 0.35),
        200,
      );
      const weightedDomesticLeaguePerformance = clamp(
        domesticLeaguePerformance,
        200,
      );
      const clStats = cl
        ? positionStats(
            player,
            {
              ...stats,
              cleanSheets: cl.cleanSheets ?? stats.cleanSheets,
            },
            0,
            0,
          )
        : 0;
      const clAwards = playerAwards(player, "UEFA Champions League");
      const clGoals = cl?.goals ?? 0;
      const clAssists = cl?.assists ?? 0;
      const clKnockoutGoals = cl?.knockoutGoals ?? 0;
      const clKnockoutAssists = cl?.knockoutAssists ?? 0;
      const clGoalPoints = clamp(
        clGoals * 5 + clKnockoutGoals * 3 + (cl?.finalGoals ?? 0) * 2,
        55,
      );
      const clAssistPoints = clamp(
        clAssists * 4 + clKnockoutAssists * 2 + (cl?.finalAssists ?? 0),
        32,
      );
      const knockoutApps = cl?.knockoutApps ?? 0;
      const knockoutRating = knockoutApps
        ? (cl.knockoutRatingSum ?? 0) / knockoutApps
        : 0;
      const championsLeaguePerformance = clamp(
        (clApps
          ? clamp((clRating - 6) * 25, 38) +
            clGoalPoints +
            clAssistPoints +
            diminishing(clStats, 14, 35) +
            clamp(clApps * 1.5, 14) +
            clamp(knockoutApps * 4, 20) +
            clamp(Math.max(0, knockoutRating - 7) * 12, 12) +
            clamp((cl?.playerOfMatch ?? 0) * 4, 12) +
            clamp(clAwards.length * 5, 10)
          : 0) *
          Math.min(1, clApps / 4),
        180,
      );
      const combinedStats = positionStats(player, stats, goals, assists);
      const individualStatistics =
        clamp(
          diminishing(combinedStats, 250, 55) +
            clamp((averageRating - 6) * 42, 65) +
            clamp(Math.min(apps, 38) * 1.2, 45),
          250,
        );
      const leagueChampion = league.table?.sorted?.()?.[0]?.teamId === player.clubId;
      const clWinner = this.championsLeague?.winnerId === player.clubId;
      const clRunnerUp = this.championsLeague?.runnerUpId === player.clubId;
      const trophyContribution = Math.min(1, apps / 20);
      const clContribution = Math.min(1, clApps / 4);
      const teamAchievements = clamp(
        (leagueChampion ? 180 * trophyContribution : 0) +
          (clWinner ? 70 * clContribution : 0) +
          (clRunnerUp ? 30 * clContribution : 0),
        250,
      );
      const consistencyBigMatches =
        clamp(
          clamp(Math.min(apps + clApps, 50) * 1.5, 70) +
            clamp((averageRating - 6.2) * 34, 45) +
            clamp(knockoutRating > 0 ? (knockoutRating - 6) * 18 : 0, 25) +
            clamp(
              ((player.matchHistory ?? []).filter(
                (match) => match.rating >= 7.5,
              ).length || 0) * 2,
              30,
            ),
          70,
        );
      const domesticGoalPoints = clamp(goals * 6, 0, 90);
      const domesticAssistPoints = clamp(assists * 4, 0, 50);
      const totalPoints = round(
        Math.min(
          1000,
          weightedDomesticLeaguePerformance +
            championsLeaguePerformance +
            individualStatistics +
            teamAchievements +
            consistencyBigMatches +
            Math.min(worldCupPoints, 50),
        ),
        2,
      );
      candidates.push({
        player,
        playerId: player.id,
        clubId: player.clubId,
        nationality: player.nationality ?? "Unknown",
        overall: player.overall ?? 0,
        apps: apps + clApps,
        goals: goals + (cl?.goals ?? 0),
        assists: assists + (cl?.assists ?? 0),
        averageRating,
        domesticGoalPoints: round(domesticGoalPoints, 2),
        domesticAssistPoints: round(domesticAssistPoints, 2),
        domesticLeaguePerformance: round(weightedDomesticLeaguePerformance, 2),
        championsLeaguePerformance: round(championsLeaguePerformance, 2),
        individualStatistics: round(individualStatistics, 2),
        teamAchievements: round(teamAchievements, 2),
        consistencyBigMatches: round(consistencyBigMatches, 2),
        worldCupPoints: round(worldCupPoints, 2),
        categoryScores: {
          domesticLeaguePerformance: round(
            weightedDomesticLeaguePerformance,
            2,
          ),
          championsLeaguePerformance: round(championsLeaguePerformance, 2),
          individualStatistics: round(individualStatistics, 2),
          teamAchievements: round(teamAchievements, 2),
          consistencyBigMatches: round(consistencyBigMatches, 2),
          worldCup: round(Math.min(worldCupPoints, 50), 2),
        },
        points: totalPoints,
        performanceScore: round(
          individualStatistics +
            weightedDomesticLeaguePerformance +
            consistencyBigMatches +
            championsLeaguePerformance,
          2,
        ),
        trophyScore: round(teamAchievements, 2),
        domesticAchievements: [
          ...(league.table?.sorted?.()?.[0]?.teamId === player.clubId
            ? [`${league.name} champion`]
            : []),
        ],
        championsLeagueAchievements: [
          ...(this.championsLeague?.winnerId === player.clubId
            ? ["UEFA Champions League winner"]
            : []),
          ...(this.championsLeague?.runnerUpId === player.clubId
            ? ["UEFA Champions League runner-up"]
            : []),
        ],
      });
    }
    const eligibleCandidates = requireIndividualAward
      ? candidates.filter((candidate) =>
          awards.some(
            (award) =>
              award.award !== "Ballon d'Or" &&
              award.award !== "World Player of the Season" &&
              !/team of the season|champion|coach of the season/i.test(
                award.award,
              ) &&
              awardMatches(award, candidate.player),
          ),
        )
      : candidates;
    const rankedRace = eligibleCandidates.sort(
      (left, right) =>
        right.points - left.points ||
        right.averageRating - left.averageRating ||
        String(left.playerId).localeCompare(String(right.playerId)),
    );
    const previousRanks = new Map(
      (this.ballonDorWatchlist ?? []).map((entry) => [
        entry.playerId,
        entry.rank,
      ]),
    );
    this.ballonDorShortlist = rankedRace.slice(0, 30).map((entry, index) => ({
      ...entry,
      rank: index + 1,
      rankChange: previousRanks.has(entry.playerId)
        ? previousRanks.get(entry.playerId) - index - 1
        : null,
    }));
    this.ballonDorWatchlist = this.ballonDorShortlist
      .slice(0, 20)
      .map((entry) => ({
        playerId: entry.playerId,
        player: `${entry.player.first} ${entry.player.last}`,
        clubId: entry.clubId,
        overall: entry.overall,
        goals: entry.goals,
        assists: entry.assists,
        averageRating: entry.averageRating,
        points: entry.points,
        rank: entry.rank,
        rankChange: entry.rankChange,
      }));
    return rankedRace;
  }

  getBallonDorVoteResult() {
    const shortlist = (this.ballonDorShortlist ?? []).slice(0, 30);
    if (!shortlist.length) return null;
    const seasonSeed = this.seed ?? 0;
    return runJournalistVoting(shortlist, seasonSeed);
  }

  getLegacyBallonDorRace() {
    const eligibleLeagueIds = new Set(
      (this.worldCareerLeagues ?? this.baseData.careerLeagues ?? [])
        .filter((entry) =>
          [
            "Premier League",
            "La Liga",
            "Bundesliga",
            "Serie A",
            "Ligue 1",
          ].includes(entry.league.name),
        )
        .flatMap((entry) => [entry.league.id, entry.id]),
    );
    const clubLeagueId = new Map(
      (this.worldCareerLeagues ?? this.baseData.careerLeagues ?? []).flatMap(
        (entry) =>
          entry.league.teamIds.flatMap((teamId) => [
            [teamId, entry.league.id],
            [teamId, entry.id],
          ]),
      ),
    );
    const trackedAwardRace = this.getAwardRace();
    const trackedPlayerIds = new Set(
      trackedAwardRace.map((entry) => entry.player.id),
    );
    const trackedNames = new Set(
      trackedAwardRace.map((entry) =>
        `${entry.player.first} ${entry.player.last}`
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, ""),
      ),
    );
    const clubLeagueIds = new Map(
      [...clubLeagueId].map(([clubId, leagueId]) => [clubId, leagueId]),
    );
    const currentSeasonPlayers = this.players
      .filter(
        (player) =>
          !player.isLegend &&
          (player.leaguePerformance?.apps ?? 0) > 0 &&
          (eligibleLeagueIds.size === 0 ||
            eligibleLeagueIds.has(clubLeagueIds.get(player.clubId))),
      )
      .map((player) => {
        const apps = player.leaguePerformance.apps;
        const maxApps =
          (this.worldCareerLeagues ?? this.baseData.careerLeagues ?? []).find(
            (entry) => entry.league.teamIds.includes(player.clubId),
          )?.league.importedMatchesPerTeam ?? apps;
        const ratio = Math.min(apps, maxApps) / apps;
        const goals = Math.round((player.leagueGoals ?? 0) * ratio);
        const assists = Math.round((player.leagueAssists ?? 0) * ratio);
        const averageRating = player.leaguePerformance.ratingSum / apps;
        const usedApps = Math.min(apps, maxApps);
        return {
          player: {
            ...player,
            stats: {
              ...player.stats,
              apps: usedApps,
              ratingSum: player.leaguePerformance.ratingSum * ratio,
            },
            leagueGoals: goals,
            leagueAssists: assists,
          },
          playerId: player.id,
          averageRating,
          goals,
          assists,
          points: awardRacePoints({
            goals,
            assists,
            averageRating,
            apps: usedApps,
          }),
        };
      });
    const activeLeagueIds = new Set([
      this.league.id,
      ...(this.worldLeagues ?? []).map((state) => state.league.id),
    ]);
    const leagueEntries = [
      ...trackedAwardRace.filter(
        (entry) =>
          !activeLeagueIds.has(clubLeagueIds.get(entry.player.clubId)) &&
          (eligibleLeagueIds.size === 0 ||
            eligibleLeagueIds.has(clubLeagueIds.get(entry.player.clubId))),
      ),
      ...trackedAwardRace.filter(
        (entry) =>
          !trackedPlayerIds.has(entry.player.id) &&
          (eligibleLeagueIds.size === 0 ||
            eligibleLeagueIds.has(clubLeagueIds.get(entry.player.clubId))),
      ),
      ...currentSeasonPlayers,
      ...(this.worldLeagues ?? [])
        .filter((state) => eligibleLeagueIds.has(state.league.id))
        .flatMap((state) =>
          state.performers
            .filter(
              (player) =>
                player.apps > 0 &&
                !trackedPlayerIds.has(player.id) &&
                !trackedNames.has(
                  `${player.first} ${player.last}`
                    .normalize("NFKD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLocaleLowerCase()
                    .replace(/[^\p{L}\p{N}]/gu, ""),
                ),
            )
            .map((player) => {
              const maxApps =
                state.league.importedMatchesPerTeam ??
                2 * (state.league.teamIds.length - 1);
              const apps = Math.min(player.apps, maxApps);
              const ratio = player.apps ? apps / player.apps : 1;
              const goals = Math.round(player.goals * ratio);
              const assists = Math.round(player.assists * ratio);
              const ratingSum = player.ratingSum * ratio;
              const averageRating = apps ? ratingSum / apps : 0;
              return {
                player: {
                  ...player,
                  stats: { apps, ratingSum },
                  leagueGoals: goals,
                  leagueAssists: assists,
                },
                playerId: player.id,
                averageRating,
                goals,
                assists,
                points: awardRacePoints({
                  goals,
                  assists,
                  averageRating,
                  apps,
                }),
              };
            }),
        ),
    ];
    const raceByName = new Map();
    for (const entry of leagueEntries) {
      const name = `${entry.player.first} ${entry.player.last}`
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
      const key = name;
      const apps = entry.player.stats?.apps ?? entry.apps ?? 0;
      const ratingSum =
        entry.player.stats?.ratingSum ??
        entry.ratingSum ??
        (entry.averageRating ?? 0) * apps;
      const existing = raceByName.get(key);
      if (!existing) {
        raceByName.set(key, {
          ...entry,
          player: {
            ...entry.player,
            stats: { ...entry.player.stats, apps, ratingSum },
          },
        });
        continue;
      }
      const combinedApps = existing.player.stats.apps + apps;
      const combinedRatingSum = existing.player.stats.ratingSum + ratingSum;
      existing.player.stats.apps = combinedApps;
      existing.player.stats.ratingSum = combinedRatingSum;
      existing.averageRating = combinedApps
        ? combinedRatingSum / combinedApps
        : 0;
      existing.goals += entry.goals;
      existing.assists += entry.assists;

      existing.points = awardRacePoints({
        goals: existing.goals,
        assists: existing.assists,
        averageRating: existing.averageRating,
        apps: combinedApps,
      });
    }
    const race = [...raceByName.values()];
    for (const entry of race) {
      const currentPlayer = this.players.find(
        (player) => player.id === entry.playerId,
      );
      if (currentPlayer) {
        entry.player = { ...entry.player, ...currentPlayer };
        entry.averageRating = currentPlayer.leaguePerformance?.apps
          ? currentPlayer.leaguePerformance.ratingSum /
            currentPlayer.leaguePerformance.apps
          : entry.averageRating;
        entry.goals = currentPlayer.leagueGoals ?? entry.goals;
        entry.assists = currentPlayer.leagueAssists ?? entry.assists;
      }
    }
    const knownLegends = this.getLegends();
    const legendEntries = LEGENDS.map((legend) => {
      const known = knownLegends.find(
        ({ player }) => player.clubId === legend.clubId,
      );
      const player = known?.player ??
        this.players.find(
          (entry) => entry.isLegend && entry.clubId === legend.clubId,
        ) ?? {
          id: `legend-${legend.key}`,
          first: legend.name.split(" ")[0],
          last: legend.name.split(" ").slice(1).join(" "),
          clubId: legend.clubId,
          isLegend: true,
          stats: { apps: 0, ratingSum: 0 },
          leaguePerformance: { apps: 0, ratingSum: 0 },
          leagueGoals: 0,
          leagueAssists: 0,
        };
      const existing = race.find(
        (entry) =>
          (entry.playerId ?? entry.player.id) === player.id ||
          (entry.player.isLegend && entry.player.clubId === legend.clubId),
      );
      if (existing) return existing;
      const apps =
        player.leaguePerformance?.apps ??
        player.apps ??
        player.stats?.apps ??
        0;
      const ratingSum =
        player.leaguePerformance?.ratingSum ??
        player.ratingSum ??
        player.stats?.ratingSum ??
        0;
      const averageRating = apps ? ratingSum / apps : 0;
      const goals = player.leagueGoals ?? player.goals ?? 0;
      const assists = player.leagueAssists ?? player.assists ?? 0;
      return {
        player,
        playerId: player.id,
        apps,
        averageRating,
        goals,
        assists,
        points: awardRacePoints({
          goals,
          assists,
          averageRating,
          apps,
        }),
      };
    });
    for (const legendEntry of legendEntries) {
      const duplicate = race.find(
        (entry) =>
          entry.player.isLegend &&
          entry.player.clubId === legendEntry.player.clubId,
      );
      if (duplicate) {
        duplicate.player = {
          ...duplicate.player,
          ...legendEntry.player,
          stats: duplicate.player.stats,
        };
        duplicate.playerId = legendEntry.playerId;
      }
    }
    const legendPlayerIds = new Set(
      legendEntries.map((entry) => entry.playerId ?? entry.player.id),
    );
    const nonLegendRace = race.filter(
      (entry) =>
        !entry.player.isLegend &&
        !legendPlayerIds.has(entry.playerId ?? entry.player.id),
    );
    const finalRace = [...nonLegendRace, ...legendEntries];
    for (const entry of finalRace) {
      const currentLeaguePlayer = this.players.find(
        (player) => player.id === entry.playerId,
      );
      if (currentLeaguePlayer) {
        entry.player = { ...entry.player, ...currentLeaguePlayer };
      }
      entry.trophyScore = this.ballonDorTrophyScore(entry.player, entry);
      const apps = entry.player.stats?.apps ?? entry.apps ?? 0;
      const starts = entry.player.stats?.starts ?? apps;
      const performance =
        entry.goals * 1.9 +
        entry.assists * 1.35 +
        Math.max(0, entry.averageRating - 6.35) * 18 +
        Math.min(apps, 45) * 0.22 +
        Math.max(0, (entry.player.overall ?? 60) - 75) *
          Math.min(apps, 30) *
          0.018 +
        Math.max(0, entry.averageRating - 7.1) * starts * 0.16;
      entry.performanceScore = round(performance, 2);
      entry.points = performance + entry.trophyScore;
    }
    const rankedRace = finalRace.sort(
      (left, right) =>
        right.points - left.points ||
        right.goals - left.goals ||
        right.assists - left.assists ||
        (left.playerId ?? left.player.id).localeCompare(
          right.playerId ?? right.player.id,
        ),
    );
    const previousRanks = new Map(
      (this.ballonDorWatchlist ?? []).map((entry) => [
        entry.playerId,
        entry.rank,
      ]),
    );
    this.ballonDorWatchlist = rankedRace.slice(0, 20).map((entry, index) => ({
      playerId: entry.playerId ?? entry.player.id,
      player: `${entry.player.first} ${entry.player.last}`,
      clubId: entry.player.clubId,
      overall: entry.player.overall ?? 0,
      goals: entry.goals ?? 0,
      assists: entry.assists ?? 0,
      averageRating: entry.averageRating ?? 0,
      points: entry.points ?? 0,
      rank: index + 1,
      rankChange: previousRanks.has(entry.playerId ?? entry.player.id)
        ? previousRanks.get(entry.playerId ?? entry.player.id) - index - 1
        : null,
    }));
    return rankedRace;
  }

  /** Find a player anywhere in the world, including background performers. */
  findWorldPlayer(playerId) {
    if (!playerId) return null;
    const direct = this.players.find((entry) => entry.id === playerId);
    if (direct) return direct;
    for (const state of this.worldLeagues ?? []) {
      const found = state.performers?.find((entry) => entry.id === playerId);
      if (found) return found;
    }
    // Also check coaches (managers)
    for (const club of this.clubs ?? []) {
      if (club.manager?.id === playerId) return club.manager;
    }
    const legend = LEGENDS.find((entry) => `legend-${entry.key}` === playerId);
    if (legend) {
      const inSave = this.players.find(
        (entry) => entry.isLegend && entry.clubId === legend.clubId,
      );
      if (inSave) return inSave;
      for (const state of this.worldLeagues ?? []) {
        const found = state.performers?.find(
          (entry) => entry.isLegend && entry.clubId === legend.clubId,
        );
        if (found) return found;
      }
      return null;
    }

    return null;
  }

  /**
   * Where an honour was won. A legend or a player whose club is not in the user's league
   * belongs to another league, so his trophy is recorded against that league rather than
   * against the league the user happens to be playing in.
   */
  competitionForPlayer(player, fallback) {
    if (!player) return fallback;
    if (this.clubs.some((club) => club.id === player.clubId)) return fallback;
    const worldLeague = (this.baseData.careerLeagues ?? []).find((entry) =>
      entry.league.teamIds.includes(player.clubId),
    );
    if (worldLeague) return worldLeague.league.name;
    const legend = legendForClub(player.clubId);
    if (legend) return legend.clubName;

    return fallback;
  }

  /**
   * Add a trophy to a player's honour list. Accepts a player object (from any league),
   * an id, or a `"First Last"` name, and silently does nothing if the player cannot be
   * resolved — a missing award is far better than a crash at the end of a season.
   */
  recordPlayerHonour(playerName, honour) {
    let player = null;
    if (typeof playerName === "string") {
      const byId = this.findWorldPlayer(playerName);
      const candidates = [
        ...this.players,
        ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
      ];
      player =
        byId ??
        candidates.find(
          (entry) =>
            `${entry.first} ${entry.last}` === playerName &&
            entry.clubId === this.club.id,
        ) ??
        candidates.find(
          (entry) => `${entry.first} ${entry.last}` === playerName,
        ) ??
        null;
    } else if (playerName?.id) {
      player = this.findWorldPlayer(playerName.id) ?? playerName;
    }
    if (!player) return null;
    player.honours ??= [];
    const id = `${honour.season}:${honour.competition}:${honour.award}`;
    if (!player.honours.some((entry) => entry.id === id)) {
      player.honours.push({ id, ...honour });
    }
    // Legends are recognised by one stable id wherever they are listed, so a trophy won
    // while he was tracked in another league still lands on his trophy case.
    const key = honourKey(player);
    if (player.isLegend) {
      const legend = legendForName(
        `${player.first ?? ""} ${player.last ?? ""}`,
      );
      const representations = [
        ...this.players,
        ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
      ].filter((entry) => {
        if (!entry?.isLegend) return false;
        const entryLegend = legendForName(
          `${entry.first ?? ""} ${entry.last ?? ""}`,
        );
        return entryLegend?.key === legend?.key;
      });
      for (const representation of representations) {
        representation.honours ??= [];
        if (!representation.honours.some((entry) => entry.id === id)) {
          representation.honours.push({ id, ...honour });
        }
      }
    } else if (key && key !== player.id) {
      const canonical = this.findWorldPlayer(key);
      if (canonical && canonical !== player) {
        canonical.honours ??= [];
        if (!canonical.honours.some((entry) => entry.id === id)) {
          canonical.honours.push({ id, ...honour });
        }
      }
    }
    return player;
  }

  /**
   * Every honour earned by a player, wherever in the world he is listed. Legends and
   * world performers live outside `this.players`, so the trophy case has to look them
   * up too — that was why most winners' trophies never appeared.
   */
  getPlayerHonours(player) {
    if (!player) return [];
    const key = honourKey(player);
    const sources = [player];
    if (player.isLegend) {
      const legend = legendForName(
        `${player.first ?? ""} ${player.last ?? ""}`,
      );
      sources.push(
        ...[
          ...this.players,
          ...(this.worldLeagues ?? []).flatMap(
            (state) => state.performers ?? [],
          ),
        ].filter((entry) => {
          if (!entry?.isLegend) return false;
          const entryLegend = legendForName(
            `${entry.first ?? ""} ${entry.last ?? ""}`,
          );
          return entryLegend?.key === legend?.key;
        }),
      );
    } else {
      const canonical =
        key && key !== player.id ? this.findWorldPlayer(key) : null;
      if (canonical && canonical !== player) sources.push(canonical);
    }
    const seen = new Set();
    const honours = [];
    for (const source of sources) {
      for (const honour of source.honours ?? []) {
        const id = honour.id ?? `${honour.season}:${honour.award}`;
        if (seen.has(id)) continue;
        seen.add(id);
        honours.push(honour);
      }
    }
    return honours;
  }

  /** The career player's own trophy case, merged with any honours stored elsewhere. */
  getCareerHonours() {
    return this.getPlayerHonours(this.player);
  }

  backfillAwardHonours() {
    const seasons = [
      ...(this.seasonAwardHistory ?? []),
      ...(this.currentSeasonAwards ? [this.currentSeasonAwards] : []),
    ];
    for (const season of seasons) {
      for (const award of season.awards ?? []) {
        for (const winner of award.winners ?? []) {
          this.recordPlayerHonour(winner.playerId ?? winner.player, {
            award: award.award,
            season: season.season,
            competition:
              award.award === "Ballon d'Or"
                ? "World football"
                : (this.league?.name ?? "World football"),
            value:
              award.displayValue ??
              `${formatDecimal(award.value)} ${award.valueLabel ?? ""}`.trim(),
          });
        }
      }
    }
  }

  recordLeagueChampionHonours() {
    const championId = this.league.table.sorted()[0]?.teamId;
    if (!championId) return;
    const champion = this.clubs.find((club) => club.id === championId);
    if (!champion) return;
    for (const player of this.players.filter(
      (entry) => entry.clubId === championId,
    )) {
      this.recordPlayerHonour(player, {
        award: `${this.league.name} Champion`,
        season: this.season,
        competition: this.league.name,
        value: "League champion",
      });
    }

    // Background leagues use performer records rather than Club instances. Their
    // champions need the same player-level honour so NPC trophy cases are complete.
    for (const state of this.worldLeagues ?? []) {
      const worldChampionId = state.league.table.sorted()[0]?.teamId;
      if (!worldChampionId) continue;
      for (const player of (state.performers ?? []).filter(
        (entry) => entry.clubId === worldChampionId,
      )) {
        this.recordPlayerHonour(player, {
          award: `${state.league.name} Champion`,
          season: this.season,
          competition: state.league.name,
          value: "League champion",
        });
      }
    }
  }

  recordClubMatchHistory(record, homeClubId, awayClubId) {
    if (!record || record.pending) return;
    for (const [clubId, isHome] of [
      [homeClubId, true],
      [awayClubId, false],
    ]) {
      const club = this.clubs.find((entry) => entry.id === clubId);
      if (!club) continue;
      club.matchHistory ??= [];
      const id = `${record.season}:${record.id}`;
      const existing = club.matchHistory.find((entry) => entry.id === id);
      const entry = {
        id,
        season: record.season,
        competition: record.competitionName ?? this.league.name,
        dateIndex: record.scheduledDate ?? record.matchday ?? record.week,
        matchday: record.matchday,
        homeClubId,
        awayClubId,
        home: record.home,
        away: record.away,
        homeGoals: record.homeGoals,
        awayGoals: record.awayGoals,
        result:
          (isHome ? record.homeGoals : record.awayGoals) >
          (isHome ? record.awayGoals : record.homeGoals)
            ? "W"
            : record.homeGoals === record.awayGoals
              ? "D"
              : "L",
      };
      if (existing) Object.assign(existing, entry);
      else club.matchHistory.push(entry);
    }
  }

  recordClubTrophies(trophyWinners) {
    for (const trophy of trophyWinners ?? []) {
      if (!trophy.winnerId || !trophy.competition) continue;
      const club = this.clubs.find((entry) => entry.id === trophy.winnerId);
      const identitySources = [
        ...this.worldCareerLeagues.flatMap((entry) =>
          Object.values(entry.clubIdentities ?? {}),
        ),
        ...Object.values(this.data.clubs ?? {}).flatMap((group) =>
          Object.values(group ?? {}),
        ),
      ];
      const identity =
        club ??
        identitySources.find((entry) => entry.id === trophy.winnerId) ??
        null;
      if (!identity) continue;
      identity.honours ??= [];
      const id = `${this.season}:${trophy.competition}:Champion`;
      if (
        identity.honours.some(
          (honour) =>
            honour.id === id ||
            (honour.season === this.season &&
              honour.competition === trophy.competition),
        )
      )
        continue;
      identity.honours.push({
        id,
        award: "Champion",
        competition: trophy.competition,
        season: this.season,
        value: trophy.finalScore
          ? `Final ${trophy.finalScore}`
          : "Competition winner",
      });
      identity.lastSeasonUpdate = this.season;
      identity.lastTrophy = trophy.competition;
      identity.prestige = clamp(Number(identity.prestige ?? 50) + 1, 1, 100);
      identity.reputation = clamp(
        Number(identity.reputation ?? identity.prestige ?? 50) + 2,
        1,
        110,
      );
      const finance = ensureClubFinance(identity);
      const isChampionsLeague = trophy.competition
        .toLowerCase()
        .includes("champions league");
      const basePrize = isChampionsLeague
        ? 8_000_000
        : identity.tier === 2
          ? 1_000_000
          : 2_500_000;
      const prize = Math.round(
        basePrize * clamp(Number(identity.prestige ?? 50) / 70, 0.65, 1.4),
      );
      const transactionId = `trophy-prize-${this.season}-${trophy.winnerId}-${trophy.competition}`;
      if (!finance.processedEvents.includes(transactionId)) {
        finance.transferBudget += Math.round(prize * 0.7);
        finance.investmentBudget += Math.round(prize * 0.15);
        recordClubTransaction(identity, {
          id: transactionId,
          date:
            typeof this.currentDay === "function"
              ? fromDayIndex(this.currentDay())
              : { year: Number(this.season ?? 2026), month: 5, day: 30 },
          category: "prize-money",
          description: `${trophy.competition} winner prize`,
          income: prize,
        });
      }
    }
  }

  updateClubSeasonRecords() {
    const competitions = [
      { league: this.league, identities: this.clubs },
      ...this.worldLeagues.map((state) => ({
        league: state.league,
        identities: Object.values(
          this.worldCareerLeagues.find(
            (entry) => entry.league.id === state.league.id,
          )?.clubIdentities ?? {},
        ),
      })),
    ];
    for (const { league, identities } of competitions) {
      const positions = league.table.positions();
      for (const identity of identities) {
        const row = league.table.row(identity.id);
        if (!row) continue;
        identity.seasonHistory ??= [];
        if (
          !identity.seasonHistory.some((entry) => entry.season === this.season)
        ) {
          identity.seasonHistory.push({
            season: this.season,
            competition: league.name,
            position: positions.get(identity.id) ?? null,
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            points: row.points,
          });
        }
        identity.lastSeasonUpdate = this.season;
      }
    }
  }

  prepareChampionsLeague() {
    const leagues = [
      { league: this.league },
      ...(this.worldLeagues ?? []).map((state) => ({ league: state.league })),
    ];
    const standings = Object.fromEntries(
      leagues.map(({ league }) => [
        league.id,
        league.table.sorted().map((row) => row.teamId),
      ]),
    );
    const qualified = qualifyChampionsLeague(leagues, standings);
    if (!qualified.length) return null;
    const playersByClub = new Map();
    for (const player of this.players) {
      if (!playersByClub.has(player.clubId))
        playersByClub.set(player.clubId, []);
      playersByClub.get(player.clubId).push(player);
    }
    for (const state of this.worldLeagues ?? []) {
      for (const player of state.performers ?? []) {
        if (!playersByClub.has(player.clubId))
          playersByClub.set(player.clubId, []);
        playersByClub.get(player.clubId).push(player);
      }
    }
    const teams = qualified.map((entry) => {
      const identity = this.data.careerLeagues
        ?.flatMap((league) => Object.entries(league.clubIdentities ?? {}))
        .find(([id]) => id === entry.clubId)?.[1];
      const club = this.clubs.find((item) => item.id === entry.clubId);
      const roster = playersByClub.get(entry.clubId) ?? [];
      return {
        id: entry.clubId,
        name: identity?.name ?? club?.name ?? entry.clubId,
        nation: entry.league,
        rating:
          club?.prestige ??
          roster.reduce(
            (sum, player) => sum + Number(player.overall ?? 60),
            0,
          ) / Math.max(1, roster.length),
        roster,
      };
    });
    this.championsLeague = createChampionsLeague({
      season: this.season + 1,
      qualified,
      teams,
    });
    this.validateCompetitionSchedule();
    this.championsLeague.qualificationPlaces = CHAMPIONS_LEAGUE_PLACES;
    return this.championsLeague;
  }

  isChampionsLeagueClub(clubId) {
    return !!this.championsLeague?.leaguePhaseTeams?.some(
      (team) => team.id === clubId,
    );
  }

  validateCompetitionSchedule() {
    this.league.validateFixtures();
    for (const state of this.worldLeagues ?? [])
      state.league.validateFixtures();
    const occupied = new Map();
    const add = (clubId, date, fixtureId) => {
      if (!Number.isFinite(date)) {
        throw new Error(`Fixture ${fixtureId} has no valid scheduled date.`);
      }
      const key = `${clubId}:${date}`;
      if (occupied.has(key) && occupied.get(key) !== fixtureId) {
        throw new Error(`Club ${clubId} has conflicting fixtures on ${date}.`);
      }
      occupied.set(key, fixtureId);
    };
    for (const league of [
      this.league,
      ...(this.worldLeagues ?? []).map((state) => state.league),
    ]) {
      league.fixtures.forEach((round, roundIndex) => {
        for (const fixture of round) {
          const date =
            fixture.scheduledDate ??
            league.fixtureDays?.[roundIndex] ??
            this.calendar[fixture.week]?.matchday;
          add(fixture.home, date, fixture.id);
          add(fixture.away, date, fixture.id);
        }
      });
    }
    const competition = this.championsLeague;
    if (competition?.season === this.season) {
      const fixtures = [
        ...(competition.leaguePhase?.fixtures ?? []),
        ...["roundOf16", "quarterFinals", "semiFinals"].flatMap((stage) =>
          (competition.knockout?.[stage] ?? []).flatMap((tie) => [
            tie.firstLeg,
            tie.secondLeg,
          ]),
        ),
        competition.knockout?.final,
      ].filter(Boolean);
      for (const fixture of fixtures) {
        const date = this.calendar[fixture.week]?.midweek;
        add(fixture.homeId, date, fixture.id);
        add(fixture.awayId, date, fixture.id);
      }
    }
    return true;
  }

  simulateChampionsLeagueSeason() {
    if (!this.championsLeague || this.championsLeague.season !== this.season)
      return this.championsLeague;
    if (this.championsLeague.status === "complete") {
      this.recordChampionsLeagueChampionHonours();
      return this.championsLeague;
    }
    const result = simulateChampionsLeague(
      this.championsLeague,
      this.rng.stream(`champions-league-${this.season}`),
    );
    const statRows = Object.values(result.stats);
    const winner = result.winnerId;
    const runnerUp = result.runnerUpId;
    const allPlayers = [
      ...this.players,
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
    ];
    const byCategory = {
      "Champions League Player of the Season": statRows,
      "Champions League Golden Boot": statRows.filter((row) => row.goals > 0),
      "Champions League Best Goalkeeper": statRows.filter(
        (row) => row.position === "GK",
      ),
      "Champions League Best Young Player": statRows,
    };
    const pick = (rows, score) =>
      [...rows].sort((a, b) => score(b) - score(a) || b.goals - a.goals)[0];
    result.awards = [];
    const championPlayers = [
      ...new Map(
        allPlayers
          .filter((player) => player.clubId === winner)
          .map((player) => [player.id, player])
          .reverse(),
      ).values(),
    ];
    if (championPlayers.length) {
      const championTeam = result.leaguePhaseTeams.find(
        (team) => team.id === winner,
      );
      result.awards.push({
        award: "Champions League Champion",
        competition: "UEFA Champions League",
        winners: championPlayers.map((player) => ({
          playerId: player.id,
          player:
            `${player.first ?? ""} ${player.last ?? ""}`.trim() || player.name,
          club: championTeam?.name ?? player.clubName ?? player.clubId,
          clubId: player.clubId,
        })),
        value: championPlayers.length,
        valueLabel: "players awarded",
      });
    }
    const winnerFor = (row) =>
      row
        ? (() => {
            const clubId =
              row.clubId ??
              result.leaguePhaseTeams.find((team) => team.name === row.club)
                ?.id;
            const [first, ...lastParts] = row.player.split(" ");
            const actual = [
              ...this.players,
              ...(this.worldLeagues ?? []).flatMap(
                (state) => state.performers ?? [],
              ),
            ].find(
              (player) =>
                player.clubId === clubId &&
                player.first === first &&
                player.last === lastParts.join(" "),
            );
            return {
              playerId: actual?.id ?? row.playerId,
              player: row.player,
              club: row.club,
              clubId,
            };
          })()
        : null;
    const playerOfSeason = pick(
      byCategory["Champions League Player of the Season"],
      (row) =>
        row.ratingSum +
        row.goals * 3 +
        row.assists * 2 +
        (row.clubId === winner ? 8 : 0),
    );
    const boot = pick(
      byCategory["Champions League Golden Boot"],
      (row) => row.goals,
    );
    const keeper = pick(
      byCategory["Champions League Best Goalkeeper"],
      (row) => row.ratingSum,
    );
    const young = pick(
      byCategory["Champions League Best Young Player"],
      (row) => row.ratingSum + row.goals * 2,
    );
    for (const [award, row, value] of [
      [
        "Champions League Player of the Season",
        playerOfSeason,
        playerOfSeason?.ratingSum,
      ],
      ["Champions League Golden Boot", boot, boot?.goals],
      ["Champions League Best Goalkeeper", keeper, keeper?.ratingSum],
      ["Champions League Best Young Player", young, young?.ratingSum],
    ]) {
      const winnerDetails = winnerFor(row);
      if (winnerDetails)
        result.awards.push({
          award,
          competition: "UEFA Champions League",
          winners: [winnerDetails],
          value,
          valueLabel: award.includes("Boot")
            ? "Champions League goals"
            : "Champions League performance",
        });
    }

    result.awards.push({
      award: "Champions League Team of the Season",
      competition: "UEFA Champions League",
      mustHaveWinner: true,
      winners: statRows
        .sort((a, b) => b.ratingSum - a.ratingSum)
        .slice(0, 11)
        .map(winnerFor)
        .filter(Boolean),
      value: 11,
      valueLabel: "players selected",
    });
    for (const award of result.awards) {
      for (const winner of award.winners) {
        this.recordPlayerHonour(winner.playerId, {
          award: award.award,
          season: this.season,
          competition: award.competition,
          value: `${formatDecimal(award.value)} ${award.valueLabel}`,
        });
      }
    }
    return result;
  }

  recordChampionsLeagueChampionHonours() {
    const competition = this.championsLeague;
    if (
      competition?.status !== "complete" ||
      competition.season !== this.season ||
      !competition.winnerId
    ) {
      return;
    }
    const championTeam = competition.leaguePhaseTeams.find(
      (team) => team.id === competition.winnerId,
    );
    const championPlayers = [
      ...new Map(
        [
          ...this.players,
          ...(this.worldLeagues ?? []).flatMap(
            (state) => state.performers ?? [],
          ),
        ]
          .filter((player) => player.clubId === competition.winnerId)
          .map((player) => [player.id, player]),
      ).values(),
    ];
    if (!championPlayers.length) return;

    const award = {
      award: "Champions League Champion",
      competition: "UEFA Champions League",
      winners: championPlayers.map((player) => ({
        playerId: player.id,
        player:
          `${player.first ?? ""} ${player.last ?? ""}`.trim() || player.name,
        club: championTeam?.name ?? player.clubName ?? player.clubId,
        clubId: player.clubId,
      })),
      value: championPlayers.length,
      valueLabel: "players awarded",
    };
    competition.awards ??= [];
    const existingAwardIndex = competition.awards.findIndex(
      (entry) => entry.award === award.award,
    );
    if (existingAwardIndex >= 0) {
      competition.awards[existingAwardIndex] = award;
    } else {
      competition.awards.push(award);
    }
    for (const player of championPlayers) {
      this.recordPlayerHonour(player, {
        award: award.award,
        season: competition.season,
        competition: award.competition,
        value: "Champions League winner",
      });
    }
  }

  getChampionsLeagueFixtureForWeek(week) {
    const competition = this.championsLeague;
    if (!competition || competition.season !== this.season) return null;
    const fixtures = [
      ...(competition.leaguePhase?.fixtures ?? []),
      ...["roundOf16", "quarterFinals", "semiFinals"].flatMap((stage) =>
        (competition.knockout?.[stage] ?? []).flatMap((tie) => [
          tie.firstLeg,
          tie.secondLeg,
        ]),
      ),
      competition.knockout?.final,
    ].filter(Boolean);
    return (
      fixtures.find(
        (fixture) =>
          !fixture.played &&
          fixture.week === week &&
          (fixture.homeId === this.club.id || fixture.awayId === this.club.id),
      ) ?? null
    );
  }

  fixtureDayFor(league, roundIndex, week = this.week) {
    const scheduled = league.fixtureDays?.[roundIndex];
    if (Number.isFinite(scheduled)) return scheduled;
    return this.calendar[week]?.matchday ?? this.currentDay();
  }

  buildFixtureDays(league) {
    const firstWeek = league.fixtureWeeks?.[0] ?? 0;
    const firstMatchday =
      this.calendar[firstWeek]?.matchday ??
      this.calendar[0]?.matchday ??
      this.currentDay();
    return (league.fixtures ?? []).map((_, index) => firstMatchday + index * 4);
  }

  scheduleDomesticLeague(league) {
    if (!this.calendar?.length) {
      this.calendar = seasonWeeks(this.season, this.seasonWeekCount ?? 56);
    }
    const isLegacy = league.fixtureStartWeek === undefined;
    const startWeek = isLegacy ? 0 : (league.fixtureStartWeek ?? 2);
    const planned = planLeagueWeeks(this.calendar, {
      startWeek,
      endWeek: Math.min(this.calendar.length - 2, 43),
      breakWeeks: [8, 16, 24, 32],
    });
    if (planned.weeks.length < league.fixtures.length) {
      planned.weeks.push(
        ...planLeagueWeeks(this.calendar, {
          startWeek: 45,
          endWeek: this.calendar.length - 2,
          breakWeeks: [48],
        }).weeks,
      );
    }
    const weeks = planned.weeks.slice(0, league.fixtures.length);
    const days = weeks.map(
      (week) => this.calendar[week]?.matchday ?? this.currentDay(),
    );
    league.scheduleOn(weeks, days);
    league.fixtures.forEach((round, roundIndex) => {
      for (const fixture of round) {
        fixture.week = weeks[roundIndex];
        fixture.scheduledDate = days[roundIndex];
        fixture.matchday = roundIndex + 1;
        fixture.status = fixture.played ? "completed" : "upcoming";
      }
    });
    return league;
  }

  simulateChampionsLeagueWeek(week, options = {}) {
    if (this.championsLeague?.season !== this.season) return [];
    if (this.championsLeague.status === "complete") {
      this.recordChampionsLeagueChampionHonours();
      return [];
    }
    const before = this.getChampionsLeagueFixtureCount();
    simulateChampionsLeagueWeek(
      this.championsLeague,
      this.rng.stream(`champions-league-${this.season}-week-${week}`),
      week,
      options,
    );
    if (this.championsLeague.status === "complete") {
      this.recordChampionsLeagueChampionHonours();
    }
    return this.getChampionsLeagueFixtureCount() > before
      ? ["Champions League fixtures completed"]
      : [];
  }

  getChampionsLeagueFixtureCount() {
    const competition = this.championsLeague;
    if (!competition) return 0;
    const league = (competition.leaguePhase?.fixtures ?? []).filter(
      (fixture) => fixture.played,
    ).length;
    const knockout = ["roundOf16", "quarterFinals", "semiFinals"]
      .flatMap((stage) => competition.knockout?.[stage] ?? [])
      .flatMap((tie) => [tie.firstLeg, tie.secondLeg])
      .filter((fixture) => fixture?.played).length;
    return (
      league + knockout + Number(competition.knockout?.final?.played ?? false)
    );
  }

  completeChampionsLeagueIfDue() {
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status !== "complete"
    ) {
      return this.simulateChampionsLeagueSeason();
    }
    return this.championsLeague;
  }

  advanceSeason() {
    if (!this.areAllSeasonCompetitionsComplete()) {
      throw new Error(
        "Every playable league must finish, and the Champions League must finish before advancing.",
      );
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error(
        "Finish the live match before advancing to the next season.",
      );
    }
    this.recordChampionsLeagueChampionHonours();
    this.recordSeasonAwards();
    const ballonDorCeremony = this.publishBallonDorCeremony();
    this.prepareChampionsLeague();
    this.recordLeagueChampionHonours();
    const promotionMoves = this.completeLeagueSeason();
    // A manager's season is judged before the world rolls over, while the tables
    // still describe the season he just finished.
    const managerVerdict = this.managerState
      ? this.settleManagerSeason()
      : null;
    this.retireAndReplaceLeaguePlayers();
    this.developLeaguePlayers();
    this.developWorldPlayers();
    this.retireAndReplaceWorldPlayers();
    this.seasonHistory ??= [];
    const trophyWinners = [
      {
        competition: this.league.name,
        winnerId: this.league.table.sorted()[0]?.teamId ?? null,
        winner:
          this.clubs.find(
            (club) => club.id === this.league.table.sorted()[0]?.teamId,
          )?.name ?? null,
      },

      ...this.worldLeagues
        .map((state) => {
          const winnerId = state.league.table.sorted()[0]?.teamId;
          const leagueData = this.data.careerLeagues?.find(
            (entry) => entry.league.id === state.league.id,
          );
          const winner = leagueData?.clubIdentities?.[winnerId]?.name ?? null;
          return {
            competition: state.league.name,
            winnerId,
            winner: winner ?? null,
          };
        })
        .filter((entry) => entry.winnerId && entry.winner),
    ].filter((entry) => entry.winner);
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status === "complete"
    ) {
      const winner = this.championsLeague.leaguePhaseTeams.find(
        (team) => team.id === this.championsLeague.winnerId,
      );
      trophyWinners.push({
        competition: "UEFA Champions League",
        winnerId: this.championsLeague.winnerId,
        winner: winner?.name ?? null,
        runnerUpId: this.championsLeague.runnerUpId,
        finalScore: this.championsLeague.finalScore,
      });
    }

    this.updateClubSeasonRecords();
    this.recordClubTrophies(trophyWinners);
    this.seasonHistory.push({
      season: this.season,
      standings: this.league.table.sorted().map((row) => ({ ...row })),
      awards: this.currentSeasonAwards,
      trophyWinners,
      promotionMoves,
    });
    // Recalculate market value for every player across all leagues/contexts once per completed season,
    // using the finished season's statistics and the players' latest attributes/OVR.
    this.recalculateAllMarketValuesForSeason(this.season, { dayIndex: this.currentDay() });
    for (const entry of this.worldCareerLeagues) {
      entry.league.season = this.season + 1;
      this.leagueHistories[entry.league.id] = entry.league.history ?? [];
    }
    this.season++;
    this.performanceDevelopmentProgress = 0;
    this.week = -1;
    this.seasonComplete = false;
    this.results = [];
    this.lastReport = {
      week: -1,
      fixtures: [],
      userMatch: null,
      headlines: [
        `Welcome to the ${this.season}/${this.season + 1} season.`,
        ...(ballonDorCeremony
          ? [
              `The ${ballonDorCeremony.awardPeriod} Ballon d'Or ceremony is complete: ${ballonDorCeremony.award.evaluation.winner.player} is the winner.`,
            ]
          : []),
      ],
    };
    this.matchSimulation = null;
    this.currentSeasonAwards = null;
    this.lastFanReaction = null;
    for (const player of this.players) {
      player.stats = emptyStats();
      player.leagueGoals = 0;
      player.leagueAssists = 0;
      player.leaguePerformance = { apps: 0, ratingSum: 0 };
      player.lastMatchRating = null;
      player.lastMatchWeek = null;
      // A pre-season is enough time for knocks to heal, so nobody starts a new campaign
      // still carrying last season's injury.
      if (player.injury && player.injury.type === "knock") player.injury = null;
    }
    for (const state of this.worldLeagues) {
      for (const performer of state.performers ?? []) {
        performer.apps = 0;
        performer.goals = 0;
        performer.assists = 0;
        performer.ratingSum = 0;
        performer.lastMatchRating = null;
        if (performer.injury && performer.injury.type === "knock") {
          performer.injury = null;
        }
      }
    }
    this.applyCoachFormations();
    this.calendar = seasonWeeks(this.season, this.seasonWeekCount);
    this.dayCursor = this.calendar[0]?.day - 1;
    this.transferMarketState = {
      season: this.season,
      window: null,
      searchCount: 0,
      lastSearchDay: null,
    };
    this.nextCpuTransferEvaluationWeek = 0;
    this.positionNeedCache = null;
    this.worldCareerLeagues = this.refreshWorldCareerLeagues();
    this.data = { ...this.data, careerLeagues: this.worldCareerLeagues };
    this.leagueHistories ??= {};

    this.seasonWeekCount = Math.max(
      56,
      this.calendar.length,
      ...this.worldCareerLeagues.map(
        (entry) =>
          2 * (entry.league.teamIds.length - 1) +
          (entry.league.fixtureStartWeek ?? 3),
      ),
    );
    this.league = this.buildLeague();
    this.worldLeagues = this.buildWorldLeagues();
    this.applyExpansionSquads();
    this.enforceGeneratedOverallLimit();

    return {
      season: this.season,
      awards: this.seasonHistory.at(-1).awards,
      manager: managerVerdict,
    };
  }

  syncAllPlayerMarketValues({ season = this.season, dayIndex = this.currentDay(), initialize = false } = {}) {
    const clubById = new Map((this.clubs ?? []).map((club) => [club.id, club]));
    for (const player of this.collectAllMarketPlayers()) {
      const club = clubById.get(player.clubId) ?? null;
      if (player.marketValue == null && Number.isFinite(Number(player.value))) {
        player.marketValue = Number(player.value);
      }
      syncPlayerMarketValue(player, {
        club,
        dayIndex,
        season,
        force: initialize || !Number.isFinite(Number(player.marketValue ?? player.value)),
      });
      if (player.previousMarketValue === undefined) player.previousMarketValue = null;
      if (!Number.isFinite(Number(player.marketValueChange))) player.marketValueChange = 0;
    }
  }

  collectAllMarketPlayers() {
    const seen = new Set();
    const players = [];
    const add = (player) => {
      if (!player || typeof player !== "object") return;
      const key = player.id ?? player;
      if (seen.has(key)) return;
      seen.add(key);
      players.push(player);
    };
    for (const player of this.players ?? []) add(player);
    for (const player of this.expansionPlayers ?? []) add(player);
    for (const player of this.worldCupNpcPlayers ?? []) add(player);
    for (const state of this.worldLeagues ?? []) {
      for (const player of state.performers ?? []) add(player);
      for (const player of state.players ?? []) add(player);
    }
    for (const club of this.clubs ?? []) {
      for (const player of club.academy?.players ?? []) add(player);
      for (const player of club.loanedOutPlayers ?? []) add(player);
      for (const player of club.loanedInPlayers ?? []) add(player);
    }
    if (typeof this.internationalPlayers === "function") {
      for (const player of this.internationalPlayers() ?? []) add(player);
    }
    return players;
  }

  recalculateAllMarketValuesForSeason(completedSeason, { dayIndex = this.currentDay() } = {}) {
    const clubById = new Map((this.clubs ?? []).map((club) => [club.id, club]));
    for (const player of this.collectAllMarketPlayers()) {
      if (player.marketValueSeason === completedSeason) continue; // once per season per player
      const club = clubById.get(player.clubId) ?? null;
      if (player.marketValue == null && Number.isFinite(Number(player.value))) {
        player.marketValue = Number(player.value);
      }
      const previous = Number.isFinite(Number(player.marketValue ?? player.value))
        ? Number(player.marketValue ?? player.value)
        : null;
      const current = calculateMarketValue(player, {
        club,
        clubPrestige: club?.prestige ?? club?.reputation,
        dayIndex,
        season: completedSeason,
        completedSeason,
      });
      let adjusted = current;
      if (previous != null && previous > 0) {
        const ratio = current / previous;
        const dampedRatio = ratio > 1 ? Math.min(ratio, 1.45) : Math.max(ratio, 0.65);
        adjusted = Math.round(previous * dampedRatio);
        const age = Number(player.age ?? 25);
        const apps = Number(player.leaguePerformance?.apps ?? player.stats?.apps ?? player.apps ?? 0);
        const ratingSum = Number(player.leaguePerformance?.ratingSum ?? player.stats?.ratingSum ?? player.ratingSum ?? 0);
        const avg = apps > 0 ? ratingSum / apps : 6.4;
        if (age <= 21 && avg >= 7.1 && apps >= 12) {
          adjusted = Math.max(adjusted, Math.round(previous * Math.min(ratio, 1.7)));
        }
        if (apps <= 2 && avg < 6.8) {
          adjusted = Math.min(adjusted, Math.round(previous * Math.max(ratio, 0.82)));
        }
      }
      const step = adjusted >= 50_000_000 ? 1_000_000
        : adjusted >= 10_000_000 ? 500_000
        : adjusted >= 1_000_000 ? 100_000
        : adjusted >= 250_000 ? 25_000
        : 10_000;
      adjusted = Math.max(25_000, Math.round(adjusted / step) * step);

      player.previousMarketValue = previous;
      player.marketValue = adjusted;
      player.value = adjusted; // backward-compatible alias
      player.marketValueChange = previous != null ? adjusted - previous : 0;
      player.marketValueSeason = completedSeason;
      player.marketValueUpdatedSeason = completedSeason;
      player.marketValueUpdatedAt = dayIndex;
    }
  }

  recordManagerResult(match) {
    const state = this.managerState;
    if (!state || !match) return;
    const homeId = match.home?.clubId ?? match.home?.id;
    const awayId = match.away?.clubId ?? match.away?.id;
    const isHome = homeId === this.club.id;
    const isAway = awayId === this.club.id;
    if (!isHome && !isAway) return;
    const scored = isHome ? match.homeGoals : match.awayGoals;
    const conceded = isHome ? match.awayGoals : match.homeGoals;
    state.record ??= {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
    const record = state.record;
    record.played += 1;
    record.goalsFor += scored;
    record.goalsAgainst += conceded;
    if (scored > conceded) record.won += 1;
    else if (scored === conceded) record.drawn += 1;
    else record.lost += 1;
    // Results move the board and the dressing room week to week, not only at season end.
    const delta = scored > conceded ? 2 : scored === conceded ? 0 : -2;
    state.boardConfidence = clamp(
      (state.boardConfidence ?? 50) + delta,
      0,
      100,
    );
    state.squadConfidence = clamp(
      (state.squadConfidence ?? 50) + delta,
      0,
      100,
    );
    state.fanSupport = clamp((state.fanSupport ?? 50) + delta, 0, 100);
    const hierarchy = ensureClubHierarchy(this.club);
    hierarchy.relationships.managerBoard = state.boardConfidence;
    hierarchy.relationships.dressingRoom = state.squadConfidence;
    if (state.boardConfidence < 30 && (state.record.played ?? 0) >= 5) {
      hierarchy.inbox.unshift({
        id: `warning-${this.club.id}-${this.season}-${state.record.played}`,
        type: "performance-warning",
        date: this.currentDay(),
        detail: "The board expects an immediate improvement in results.",
        status: "open",
      });
      hierarchy.inbox = hierarchy.inbox.slice(0, 20);
    }
  }

  /** Create a board request from current table and financial conditions. */
  createOwnerRequest() {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can create board requests.");
    const position = this.league.table.positions().get(this.club.id) ?? null;
    return createOwnerRequest(this.club, position);
  }

  respondToOwnerRequest(requestId, response) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can respond to board requests.");
    const accepted = respondToOwnerRequest(this.club, requestId, response);
    if (accepted) {
      const request = this.club.hierarchy.inbox.find(
        (item) => item.id === requestId,
      );
      this.news.push(
        `Board response recorded: ${request?.label ?? "request"} — ${response}.`,
      );
    }
    return accepted;
  }

  refreshCoachMarket() {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can recruit a head coach.");
    if (
      !this.coachAppointments ||
      this.coachAppointments.season !== this.season
    ) {
      this.coachAppointments = { season: this.season, count: 0 };
    }
    this.coachMarket = generateCoachMarket(
      `${this.seed}-${this.club.id}-${this.season}-${this.currentDay()}`,
      this.season,
      12,
    );
    return this.coachMarket;
  }

  requestCoachDismissal() {
    if (this.isManagerCareer)
      throw new Error("Managers cannot request their own dismissal this way.");
    if (this.player?.retirement)
      throw new Error("A retired player cannot request a coach dismissal.");
    const importance = this.playerImportanceToClub();
    const squad = this.players.filter((p) => p.clubId === this.club.id);
    const apps = this.player.stats?.apps ?? 0;
    const rating =
      apps > 0
        ? (this.player.stats.ratingSum ?? 0) / apps
        : this.player.overall ?? 60;
    const standing = this.league.table.positions().get(this.club.id) ?? 10;
    const ownerPatience = this.club.ownerProfile?.patience ?? 50;
    const baseChance =
      0.08 +
      importance * 0.55 +
      Math.max(0, (rating - 6.4) * 0.08) +
      Math.max(0, (10 - standing)) * 0.015 +
      (ownerPatience < 45 ? 0.08 : 0);
    const threshold = 0.42;
    const roll = this.rng.stream("coach-dismissal-request").next();
    const accepted = baseChance >= threshold && roll < baseChance + 0.12;
    this.news ??= [];
    if (!accepted) {
      const reason =
        importance < 0.25
          ? "The owner feels you are not yet influential enough to make that demand."
          : "The owner has backed the head coach and rejected your request.";
      this.news.unshift(
        `Coach dismissal request declined. ${reason}`,
      );
      return { accepted: false, importance, rating, message: reason };
    }
    const dismissedName = this.club.manager?.name ?? "the head coach";
    const candidates = generateCoachMarket(
      `${this.seed}-${this.club.id}-player-request-${this.currentDay()}`,
      this.season,
      12,
    );
    const finance = this.club.financials();
    const budget = Math.max(0, Number(finance.balance ?? 0));
    const affordable = candidates.filter(
      (c) => Number(c.cost ?? 0) <= Math.max(500000, budget * 0.12),
    );
    const pool = (affordable.length ? affordable : candidates).sort(
      (a, b) =>
        (b.overall ?? b.rating ?? 0) - (a.overall ?? a.rating ?? 0),
    );
    const best = pool[0];
    if (!best) throw new Error("No replacement coach is available.");
    dismissClubManager(
      this.club,
      "Dismissed after a player-led request to the owner.",
      this.currentDay(),
    );
    const hierarchy = ensureClubHierarchy(
      this.club,
      `${this.seed}-${this.club.id}`,
    );
    const cost = Math.max(0, Math.round(Number(best.cost) || 0));
    if (cost > 0 && ensureClubFinance(this.club).balance >= cost) {
      recordClubTransaction(this.club, {
        id: `coach-player-request-${this.club.id}-${this.season}-${best.id}-${this.currentDay()}`,
        date: this.currentDay(),
        category: "coaching",
        description: `Coach appointment after player request: ${best.name}`,
        expense: cost,
      });
    }
    const replacement = ensureCoachProfile({
      ...this.club,
      manager: { ...best, role: "Manager", careerHistory: [] },
    });
    replacement.salary = Math.round(best.salary ?? best.rating ?? 0);
    this.club.manager = { ...replacement, role: "Manager" };
    hierarchy.manager = { ...replacement, role: "Manager", careerHistory: [] };
    hierarchy.employment = {
      status: "active",
      started: this.currentDay(),
      contractEnd: this.season + 3,
      salary: replacement.salary,
    };
    this.news.unshift(
      `${dismissedName} has been dismissed after your request. ${replacement.name} (${replacement.overall ?? replacement.rating}/99) appointed as head coach.`,
    );
    return {
      accepted: true,
      importance,
      rating,
      dismissed: dismissedName,
      replacement,
    };
  }

  playerImportanceToClub() {
    const squad = this.players.filter((p) => p.clubId === this.club.id);
    if (!squad.length) return 0;
    const me = this.player;
    const apps = me.stats?.apps ?? 0;
    const rating =
      apps > 0 ? (me.stats.ratingSum ?? 0) / apps : (me.overall ?? 60) / 10;
    const goalContrib =
      (me.stats?.goals ?? 0) + (me.stats?.assists ?? 0) * 0.7;
    const squadOverallAvg =
      squad.reduce((sum, p) => sum + (p.overall ?? 60), 0) / squad.length;
    const overallEdge = Math.max(
      0,
      ((me.overall ?? 60) - squadOverallAvg) / 20,
    );
    const xi = this.selectedXI?.(this.currentDay?.() ?? 0) ?? [];
    const inXI = xi.some((s) => s.id === me.id || s.player?.id === me.id);
    const appShare = apps / Math.max(1, this.league?.table?.row?.(this.club.id)?.played ?? apps);
    const importance =
      overallEdge * 0.35 +
      Math.min(1, appShare) * 0.25 +
      Math.min(1, goalContrib / 15) * 0.2 +
      clamp((rating - 6) / 2, 0, 1) * 0.15 +
      (inXI ? 0.05 : 0);
    return clamp(importance, 0, 1);
  }

  fireCoach(reason = "The owner has decided to appoint a new head coach.") {
      throw new Error("Only the manager can manage club staff.");
    const dismissed = dismissClubManager(this.club, reason, this.currentDay());
    if (!dismissed)
      throw new Error("The club has no active head coach to dismiss.");
    const oldRating = Number(
      this.club.manager?.overall ?? this.club.manager?.rating ?? 60,
    );
    const finance = this.club.financials();
    const affordable = Number(finance.balance ?? 0);
    const candidates = generateCoachMarket(
      `${this.seed}-${this.club.id}-replacement-${this.currentDay()}`,
      this.season,
      12,
    );
    const byRating = candidates
      .filter(
        (candidate) =>
          Number(candidate.cost ?? 0) <= Math.max(0, affordable * 0.15),
      )
      .sort((left, right) =>
        affordable >= 50_000_000
          ? right.overall - left.overall
          : left.overall - right.overall,
      );
    let replacement =
      byRating[0] ??
      candidates.sort((left, right) =>
        affordable >= 50_000_000
          ? right.overall - left.overall
          : left.overall - right.overall,
      )[0];
    if (!replacement) throw new Error("No replacement coach is available.");
    const replacementCost = Math.max(
      0,
      Math.round(Number(replacement.cost) || 0),
    );
    const replacementFinance = ensureClubFinance(this.club);
    if (replacementCost > 0 && replacementFinance.balance >= replacementCost) {
      recordClubTransaction(this.club, {
        id: `coach-replacement-${this.club.id}-${this.season}-${replacement.id}-${this.currentDay()}`,
        date: this.currentDay(),
        category: "coaching",
        description: `Coach replacement fee: ${replacement.name}`,
        expense: replacementCost,
      });
    }
    replacement = ensureCoachProfile({
      ...this.club,
      manager: { ...replacement, role: "Manager", careerHistory: [] },
    });
    replacement.salary = Math.round(
      replacement.salary ?? replacement.rating ?? 0,
    );
    const hierarchy = ensureClubHierarchy(
      this.club,
      `${this.seed}-${this.club.id}`,
    );
    this.club.manager = { ...replacement, role: "Manager" };
    hierarchy.manager = { ...replacement, role: "Manager", careerHistory: [] };
    hierarchy.employment = {
      status: "active",
      started: this.currentDay(),
      contractEnd: this.season + 3,
      salary: replacement.salary,
    };
    this.news.unshift(
      `${replacement.name} has been appointed automatically after the dismissal. Club budget rating: ${affordable >= 50_000_000 ? "high" : "limited"}.`,
    );
    return { dismissed, replacement, oldRating };
  }

  appointCoach(coachId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can appoint a head coach.");
    if (
      !this.coachAppointments ||
      this.coachAppointments.season !== this.season
    ) {
      this.coachAppointments = { season: this.season, count: 0 };
    }
    if (this.coachAppointments.count >= 2) {
      throw new Error(
        "The club cannot appoint more than two head coaches in one season.",
      );
    }
    const candidate = (this.coachMarket ?? []).find(
      (coach) => coach.id === coachId,
    );
    if (!candidate) throw new Error("That coach is no longer available.");
    const finance = ensureClubFinance(this.club);
    const appointmentCost = Math.max(
      0,
      Math.round(Number(candidate.cost) || 0),
    );
    if (finance.balance < appointmentCost) {
      throw new Error(
        `You need €${candidate.cost.toLocaleString()} to appoint ${candidate.name}.`,
      );
    }
    recordClubTransaction(this.club, {
      id: `coach-appointment-${this.club.id}-${this.season}-${candidate.id}-${this.currentDay()}`,
      date: this.currentDay(),
      category: "coaching",
      description: `Coach appointment fee: ${candidate.name}`,
      expense: appointmentCost,
    });
    const hierarchy = ensureClubHierarchy(
      this.club,
      `${this.seed}-${this.club.id}`,
    );
    const coach = ensureCoachProfile({
      ...this.club,
      manager: { ...candidate, role: "Manager", careerHistory: [] },
      hierarchy: {
        ...hierarchy,
        manager: { ...candidate, role: "Manager", careerHistory: [] },
      },
    });
    this.club.manager = { ...coach, role: "Manager" };
    hierarchy.manager = { ...this.club.manager, careerHistory: [] };
    hierarchy.employment = {
      status: "active",
      started: this.currentDay(),
      contractEnd: this.season + 3,
      salary: candidate.salary ?? candidate.rating,
    };
    hierarchy.inbox.unshift({
      id: `owner-coach-${this.club.id}-${this.currentDay()}`,
      type: "coach-appointed",
      date: this.currentDay(),
      detail: `${candidate.name} appointed by the owner`,
      status: "resolved",
    });
    this.coachAppointments.count += 1;
    this.coachMarket = this.coachMarket.filter(
      (coachEntry) => coachEntry.id !== coachId,
    );
    this.news.unshift(
      `${candidate.name} has been appointed as head coach of ${this.club.name}.`,
    );
    return candidate;
  }

  dismissManager(
    reason = "The board has lost confidence in the current project.",
  ) {
    const dismissed = dismissClubManager(this.club, reason, this.currentDay());
    if (dismissed) {
      this.managerState.sacked = true;
      this.managerState.sackedMessage = reason;
      this.news.push(
        `The board has dismissed ${this.managerState.first} ${this.managerState.last}.`,
      );
    }
    return dismissed;
  }

  /**
   * Close out a manager's season: judge him against the board's target, bank the trophies
   * he won, update the three confidence meters and — if the board has lost faith — sack
   * him. Called from `advanceSeason` while the finished season's table is still live.
   */
  settleManagerSeason() {
    const state = this.managerState;
    if (!state) return null;
    const standings = this.league.table.sorted();
    const position =
      standings.findIndex((row) => row.teamId === this.club.id) + 1 || null;
    const target = boardExpectationFor(this.club);
    const record = state.record ?? {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
    const verdict = judgeSeason({ position, target, record });
    const honours = seasonTrophiesFor({
      leagueName: this.league.name,
      position,
    });
    for (const honour of honours) {
      const id = `${this.season}:${honour.competition}:${honour.award}`;
      if (!state.honours.some((entry) => entry.id === id)) {
        state.honours.push({ id, season: this.season, ...honour });
      }
    }
    state.boardConfidence = clamp(
      (state.boardConfidence ?? 50) + verdict.confidence,
      0,
      100,
    );
    // A good season lifts the dressing room and the terraces; a bad one drains them.
    const mood = verdict.confidence * 0.6 + honours.length * 8;
    state.squadConfidence = clamp((state.squadConfidence ?? 50) + mood, 0, 100);
    state.fanSupport = clamp((state.fanSupport ?? 50) + mood, 0, 100);
    state.seasons ??= [];
    state.seasons.push({
      season: this.season,
      position,
      won: record.won,
      drawn: record.drawn,
      lost: record.lost,
      goalsFor: record.goalsFor,
      goalsAgainst: record.goalsAgainst,
      verdict: verdict.verdict,
      honours,
      message: verdict.message,
    });
    state.record = {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
    if (state.boardConfidence <= 0) {
      state.sacked = true;
      state.sackedSeason = this.season;
      state.sackedMessage = `The board has dismissed ${state.first} ${state.last} after the season fell short of its target.`;
    }
    return { ...verdict, honours, boardConfidence: state.boardConfidence };
  }

  getLeagueSeasonProgress() {
    const leagues = [
      this.league,
      ...this.worldLeagues.map(({ league }) => league),
    ];
    return {
      complete: leagues.filter((league) =>
        league.table.isComplete(2 * (league.teamIds.length - 1)),
      ).length,
      total: leagues.length,
    };
  }

  buildCareerWorldLeagues(selectedLeagueId = null) {
    const entries = [...(this.baseData.careerLeagues ?? [])];
    if (selectedLeagueId && !entries.some((entry) => entry.league.id === selectedLeagueId)) {
      const selected = this.data.careerLeagues?.find((entry) => entry.league.id === selectedLeagueId);
      if (selected) entries.push(selected);
    }
    const included = new Set(entries.map((entry) => entry.league.id));
    const clean = (name) =>
      name
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    for (const config of this.expansionLeagues ?? []) {
      if (included.has(config.id)) continue;
      const league = {
        ...(this.baseData.leagueConfig?.[config.id] ?? {}),
        ...config,
        teamIds: config.teams.map(clean),
        clubGroup: `world-${clean(config.name)}`,
        seasonStartYear: 2026,
        seasonWeeks: 52,
        fixtureStartWeek: 3,
        fixtureEndWeek: 48,
        pointsForWin: 3,
        pointsForDraw: 1,
      };
      const clubIdentities = Object.fromEntries(
        config.teams.map((name) => {
          const id = clean(name);
          const prestige =
            /^(Ajax|PSV Eindhoven|Feyenoord|Benfica|Porto|Sporting CP|Club Brugge|Anderlecht|Celtic|Rangers|Galatasaray|Fenerbahçe|Beşiktaş)$/i.test(
              name,
            )
              ? 78
              : config.tier === 2
                ? 50
                : 58;
          return [
            id,
            {
              id,
              name,
              shortName: name
                .split(/\\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 3)
                .toUpperCase(),
              city: "",
              prestige,
              budget: prestige * 1_000_000,
              wageBudget: prestige * 20_000,
            },
          ];
        }),
      );
      entries.push({
        id: league.id,
        league,
        clubIdentities,
        rostersByClub: {},
      });
      included.add(league.id);
    }
    return entries;
  }

  refreshWorldCareerLeagues() {
    return this.worldCareerLeagues;
  }

  applyExpansionSquads() {
    const knownPlayers = new Set(this.players.map((player) => player.id));
    for (const entry of this.worldCareerLeagues ?? []) {
      if (
        (entry.rostersByClub && Object.keys(entry.rostersByClub).length) ||
        this.worldLeagues
          .find((state) => state.league.id === entry.league.id)
          ?.performers.some((player) => player.source === "real-world")
      )
        continue;
      if (entry.league.id === this.league.id) {
        for (const player of [...this.players]) {
          if (
            player.clubId === this.club.id ||
            !entry.league.teamIds.includes(player.clubId)
          )
            continue;
          const identity = entry.clubIdentities[player.clubId];
          if (
            identity &&
            !this.clubs.some((club) => club.id === player.clubId)
          ) {
            this.clubs.push(
              new Club({
                ...identity,
                id: player.clubId,
                nation: entry.league.nation,
                leagueId: entry.league.id,
              }),
            );
          }
          const ids = new Set(
            this.clubs.find((club) => club.id === player.clubId)?.squad ?? [],
          );
          if (!ids.has(player.id))
            this.clubs
              .find((club) => club.id === player.clubId)
              ?.addPlayer(player.id);
          player.leagueId = entry.league.id;
          continue;
        }
        const missing = entry.league.teamIds.filter(
          (clubId) => !this.clubs.some((club) => club.id === clubId),
        );
        for (const clubId of missing) {
          const identity = entry.clubIdentities[clubId];
          if (!identity) continue;
          const club = new Club({
            ...identity,
            id: clubId,
            nation: entry.league.nation,
            leagueId: entry.league.id,
          });
          this.clubs.push(club);
          const existing = this.players.filter(
            (player) => player.clubId === clubId,
          );
          if (existing.length < 18) {
            const generated = this.generateExpansionPlayers(
              entry,
              club,
              18 - existing.length,
            );
            this.players.push(...generated);
            this.expansionPlayers.push(...generated);
          }
          for (const player of this.players.filter(
            (item) => item.clubId === clubId,
          ))
            club.addPlayer(player.id);
        }
        continue;
      }
      const state = this.worldLeagues.find(
        ({ league }) => league.id === entry.league.id,
      );
      if (!state) continue;
      const retiredIds = new Set();
      for (const performer of state.performers) {
        if (!performer.id.startsWith("real-") || knownPlayers.has(performer.id))
          continue;
        const age = clamp(Number(performer.age) || 24, 16, 40);
        const player = createPlayer({
          id: performer.id,
          first: performer.first,
          last: performer.last,
          nationality: performer.nationality || entry.league.nation,
          dob: toDayIndex(this.season - age, 1, 1),
          position: performer.position,
          archetype:
            performer.position && this.data.archetypes[performer.position]
              ? this.pickArchetypeForPosition(
                  this.rng.stream(`expansion-archetype-${performer.id}`),
                  performer.position,
                )
              : null,
          attrs: performer.attrs,
          subAttrs: performer.subAttrs,
          gkAttrs: performer.gkAttrs,
          potential: performer.potential ?? performer.overall,
          clubId: performer.clubId,
          source:
            performer.source === "real-world"
              ? "real-world"
              : "generated-expansion",
          squadStatus: "First Team",
          value: performer.value,
          contract: performer.wage ? { wage: performer.wage } : null,
        });
        performer.id = player.id;
        performer.source = player.source;
        const club = this.clubs.find((item) => item.id === performer.clubId);
        if (club) club.addPlayer(player.id);
        this.expansionPlayers.push(player);
        this.players.push(player);
        knownPlayers.add(player.id);
      }
    }
  }

  generateExpansionPlayers(entry, club, count) {
    const rng = this.rng.stream(
      `expansion-squad-${entry.league.id}-${club.id}`,
    );
    const positions = this.data.squadTemplate.positions;
    return Array.from({ length: count }, (_, index) => {
      const position = positions[index % positions.length];
      const generated = generateAttributes(
        rng,
        position,
        this.season <= 1 ? rng.int(70, 84) : rng.int(55, 75),
      );
      const { first, last } = this.nameForNationality(rng, entry.league.nation);
      const age = this.season <= 1 ? rng.int(16, 34) : rng.int(16, 21);
      return createPlayer({
        id: `generated-${club.id}-${index + 1}`,
        first,
        last,
        nationality: entry.league.nation,
        dob: toDayIndex(this.season - age, 1, 1),
        position,
        archetype: this.pickArchetypeForPosition(rng, position),
        ...physicalProfileFor(rng, position),
        attrs: generated.attrs,
        subAttrs: generated.subAttrs,
        gkAttrs: generated.gkAttrs,
        potential: clamp(
          calculateOverall({ position, ...generated }) + rng.int(3, 15),
          48,
          92,
        ),
        clubId: club.id,
        source: "generated-expansion",
        squadStatus: index < 11 ? "First Team" : "Rotation",
        contract: { wage: Math.round(club.wageBudget / 30) },
        value: 0,
      });
    });
  }

  buildClubs() {
    const source = {
      ...(this.data.clubs[this.data.league.clubGroup] ?? {}),
      ...(this.baseData.clubs[this.data.league.clubGroup] ?? {}),
    };
    const sourceLeagues =
      this.worldCareerLeagues ?? this.data.careerLeagues ?? [];
    const sourceEntry = sourceLeagues.find(
      (entry) => entry.league.id === this.data.league.id,
    );
    const teamIds = sourceEntry?.league.teamIds ?? this.data.league.teamIds;
    return teamIds.map((id) => {
      const identity =
        source[id] ??
        sourceEntry?.clubIdentities?.[id] ??
        sourceLeagues.find((entry) => entry.clubIdentities?.[id])
          ?.clubIdentities[id] ??
        Object.values(this.baseData.clubs ?? {})
          .map((group) => group?.[id])
          .find(Boolean);
      if (!identity) throw new Error(`League references unknown club "${id}"`);
      const style = this.chooseCoachStyle(id, identity);
      return new Club({
        ...identity,
        id,
        nation: this.data.league.nation,
        leagueId: this.data.league.id,
        manager: {
          id: `manager-${id}`,
          name: `${identity.name} Head Coach`,
          nationality: this.data.league.nation,
          style,
          rating: clamp(Math.round(identity.prestige * 0.72), 42, 90),
        },
      });
    });
  }

  /** Current absolute day used by finance and transfer events. */
  currentDay() {
    if (Number.isFinite(this.dayCursor)) return this.dayCursor;
    return (
      this.calendar?.[
        Math.max(0, Math.min(this.week, this.calendar.length - 1))
      ]?.matchday ?? toDayIndex(this.season, 7, 1)
    );
  }

  financialSummary(club = this.club) {
    return financialSummary(
      club,
      (this.players ?? []).filter((player) => player.clubId === club?.id),
    );
  }

  investmentOptions(club = this.club) {
    return investmentOptions(club);
  }

  scoutingSummary(club = this.club) {
    return scoutingSummary(club);
  }

  scoutingRegions() {
    if (!this.isManagerCareer)
      throw new Error(
        "Scouting controls are restricted to manager-career mode.",
      );
    return scoutingRegions();
  }

  scoutingFocuses() {
    if (!this.isManagerCareer)
      throw new Error(
        "Scouting controls are restricted to manager-career mode.",
      );
    return scoutingFocuses();
  }

  scoutingScouts(club = this.club) {
    if (!this.isManagerCareer)
      throw new Error("Scouting staff are restricted to manager-career mode.");
    return {
      employed: ensureClubScouting(club, this.seed).scouts,
      available: availableScouts(club),
    };
  }

  searchScoutingPlayers(filters = {}) {
    if (!this.isManagerCareer)
      throw new Error("Scouting tools are restricted to manager-career mode.");
    return searchScoutingPlayers(this.players, this.clubs, filters);
  }

  signYouthProspect(prospectId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can sign academy prospects.");
    const academyPlayer = acceptYouthProspect(this.club, prospectId);
    const prospect = academyPlayer;
    if (prospect.age < 16)
      throw new Error(
        "This prospect is not yet eligible for an academy contract.",
      );
    return prospect;
  }

  promoteAcademyPlayer(playerId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can promote academy players.");
    const state = academyState(this.club);
    const prospect = state.players.find(
      (item) => item.id === playerId && item.status === "academy",
    );
    if (!prospect) throw new Error("Academy player not found.");
    if (prospect.age < 16 || prospect.overall < 55)
      throw new Error(
        "This player needs more academy development before promotion.",
      );
    if (this.club.squad.length >= 25)
      throw new Error(
        "The registered squad is full. Release a player before promotion.",
      );
    const generated = generateAttributes(
      this.rng.stream(`academy-${prospect.id}`),
      prospect.position,
      prospect.overall,
    );
    const player = createPlayer({
      ...prospect,
      id: prospect.id,
      clubId: this.club.id,
      attrs: prospect.attrs ?? generated.attrs,
      subAttrs: generated.subAttrs,
      gkAttrs: generated.gkAttrs,
      potential: prospect.potential,
      contract: { wage: 450, expires: this.season + 3 },
    });
    player.academyStatus = "academy";
    this.players.push(player);
    this.club.addPlayer(player.id);
    state.players = state.players.filter((item) => item.id !== prospect.id);
    player.academyStatus = "promoted";
    assignShirtNumbers(this.players, this.club);
    this.news.unshift(`${player.first} ${player.last} joined the academy.`);
    return player;
  }

  releaseAcademyPlayer(playerId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can release academy players.");
    return releaseAcademyPlayer(this.club, playerId);
  }

  recruitScout(scoutId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can recruit scouts.");
    return hireScout(this.club, scoutId, this.currentDay());
  }

  releaseClubScout(scoutId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can release scouts.");
    return releaseScout(this.club, scoutId, this.currentDay());
  }

  createScoutingAssignment(details) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can assign scouts.");
    return startScoutingAssignment(this.club, {
      ...details,
      date: this.currentDay(),
    });
  }

  shortlistScoutingPlayer(playerId) {
    if (!this.isManagerCareer)
      throw new Error(
        "Scouting controls are restricted to manager-career mode.",
      );
    return shortlistPlayer(this.club, playerId);
  }

  removeScoutingPlayer(playerId) {
    if (!this.isManagerCareer)
      throw new Error(
        "Scouting controls are restricted to manager-career mode.",
      );
    return removeFromShortlist(this.club, playerId);
  }

  trainingOverview(club = this.club) {
    const training = ensureClubTraining(club, this.seed, this.season);
    return {
      ...training,
      departments: Object.keys(TRAINING_DEPARTMENTS),
      programmes: TRAINING_PROGRAMMES,
      intensities: TRAINING_INTENSITIES,
      expenditure: training.coaches.reduce(
        (sum, coach) => sum + Number(coach.weeklySalary ?? 0),
        0,
      ),
    };
  }

  refreshTrainingCoachMarket() {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can recruit training coaches.");
    const training = ensureClubTraining(this.club, this.seed, this.season);
    this.trainingMarketRefresh++;
    training.market = generateTrainingCoachMarket(
      this.seed + this.season * 97 + this.trainingMarketRefresh * 7919,
      this.season,
      18,
    );
    return training.market;
  }

  hireTrainingCoach(coachId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can hire training coaches.");
    return hireTrainingCoach(
      this.club,
      coachId,
      this.currentDay(),
      this.seed,
      this.season,
    );
  }

  dismissTrainingCoach(coachId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can dismiss training coaches.");
    return dismissTrainingCoach(this.club, coachId, this.seed, this.season);
  }

  assignTrainingCoach(department, coachId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can assign training coaches.");
    return assignTrainingCoach(
      this.club,
      department,
      coachId,
      this.seed,
      this.season,
    );
  }

  setClubTrainingPlan(details) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can set club training programmes.");
    return setClubTrainingPlan(this.club, details, this.seed, this.season);
  }

  setClubInvestment(projectId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can approve club investments.");
    return this.startClubInvestment(projectId);
  }

  startClubInvestment(projectId) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can approve club investments.");
    const hierarchy = this.club.hierarchy;
    const owner = hierarchy?.owner;
    const option = investmentOptions(this.club).find(
      (item) => item.id === projectId,
    );
    if (!option) throw new Error("That investment is not available.");
    const confidence = Number(hierarchy?.relationships?.managerBoard ?? 60);
    const approved = confidence >= 35 && (owner?.investment ?? 50) >= 30;
    return startInvestment(this.club, projectId, this.currentDay(), {
      approved,
    });
  }

  /** Market view over the same player objects used by the match engine. */
  transferMarket(filters = {}) {
    const query = String(filters.query ?? "").toLowerCase();
    return this.players
      .filter((player) => player.clubId && player.id !== this.player.id)
      .filter(
        (player) =>
          !filters.position ||
          normalizePosition(player.position) ===
            normalizePosition(filters.position),
      )
      .filter((player) => !filters.clubId || player.clubId === filters.clubId)
      .filter(
        (player) =>
          !filters.minOverall || player.overall >= Number(filters.minOverall),
      )
      .filter(
        (player) =>
          !query ||
          `${player.first} ${player.last}`.toLowerCase().includes(query),
      )
      .map((player) => {
        const club = this.clubs.find((entry) => entry.id === player.clubId);
        marketValueForPlayer(player, club, this.currentDay());
        return { player, club, marketValue: player.value };
      })
      .sort((left, right) => right.player.overall - left.player.overall);
  }

  playerManagerRequest(type, details = {}) {
    if (this.isManagerCareer)
      throw new Error("Manager careers control the club directly.");
    if (!["playing-time", "better-teammates", "transfer"].includes(type))
      throw new Error(`Unsupported manager request: ${type}`);
    const manager = this.club.manager;
    const trust = Number(this.player.trusting?.manager ?? 50);
    const request = {
      id: `manager-request-${this.season}-${this.week}-${type}`,
      type,
      details: { ...details },
      status: "reviewed",
      trust,
      createdAt: this.currentDay(),
    };
    const performance = Number(this.player.lastMatchRating ?? 6.5);
    const chance = trust * 0.7 + performance * 3;
    const threshold = type === "better-teammates" ? 55 : 50;
    const destination =
      type === "transfer"
        ? this.clubs.find((club) => club.id === details.clubId)
        : null;
    const requestedPlayer =
      type === "better-teammates" && details.playerId
        ? this.players.find((player) => player.id === details.playerId)
        : null;
    let newTeammate = null;
    let salePlayer = null;
    let saleBuyer = null;
    let saleFee = 0;
    if (type === "better-teammates") {
      const finances = this.financialSummary(this.club);
      const candidates = requestedPlayer
        ? [requestedPlayer]
        : this.transferMarket({
            position: details.position || this.player.position,
          }).map(({ player }) => player);
      const registrationLimit = this.club.registrationLimit ?? 25;
      const candidateSeller = (player) =>
        this.clubs.find(
          (club) =>
            club.id === player.clubId &&
            club.id !== this.club.id &&
            club.squad.length > MIN_REGISTERED_SQUAD_SIZE,
        );
      const affordableCandidate = (player, extraFunds = 0, extraWage = 0) => {
        const seller = candidateSeller(player);
        if (!seller) return false;
        const fee = marketValueForPlayer(player, seller, this.currentDay());
        const wage = player.contract?.wage ?? Math.round(player.overall * 900);
        return (
          fee <= finances.transferBudget + extraFunds &&
          fee <= finances.balance + extraFunds &&
          wage <= finances.remainingWageBudget + extraWage
        );
      };
      newTeammate =
        this.club.squad.length < registrationLimit
          ? (candidates.find((player) => affordableCandidate(player)) ?? null)
          : null;

      if (!newTeammate && this.club.squad.length > MIN_REGISTERED_SQUAD_SIZE) {
        salePlayer =
          this.players
            .filter(
              (player) =>
                player.clubId === this.club.id &&
                player.id !== this.player.id &&
                !player.isLegend &&
                (!details.position ||
                  normalizePosition(player.position) ===
                    normalizePosition(details.position)),
            )
            .sort(
              (left, right) =>
                Number(left.overall ?? 0) - Number(right.overall ?? 0),
            )[0] ?? null;
        if (salePlayer) {
          saleFee = marketValueForPlayer(
            salePlayer,
            this.club,
            this.currentDay(),
          );
          saleBuyer =
            this.clubs.find((club) => {
              const limit = club.registrationLimit ?? 25;
              if (club.id === this.club.id || club.squad.length >= limit)
                return false;
              const buyerFinance = this.financialSummary(club);
              const weakWage =
                salePlayer.contract?.wage ??
                Math.round(salePlayer.overall * 900);
              return (
                saleFee <= buyerFinance.transferBudget &&
                saleFee <= buyerFinance.balance &&
                weakWage <= buyerFinance.remainingWageBudget
              );
            }) ?? null;
          const extraFunds = saleBuyer ? saleFee : 0;
          const extraWage =
            salePlayer.contract?.wage ?? Math.round(salePlayer.overall * 900);
          newTeammate =
            [...candidates]
              .sort(
                (left, right) =>
                  Number(right.overall ?? 0) - Number(left.overall ?? 0),
              )
              .find((candidate) =>
                affordableCandidate(candidate, extraFunds, extraWage),
              ) ?? null;
        }
      }
    }
    let destinationReleasePlayer = null;
    if (type === "transfer" && destination) {
      const registrationLimit = destination.registrationLimit ?? 25;
      if (destination.squad.length >= registrationLimit) {
        destinationReleasePlayer =
          destination.squad.length > MIN_REGISTERED_SQUAD_SIZE
            ? (this.players
                .filter(
                  (player) =>
                    player.clubId === destination.id && !player.isLegend,
                )
                .sort(
                  (left, right) =>
                    Number(left.overall ?? 0) - Number(right.overall ?? 0),
                )[0] ?? null)
            : null;
      }
    }
    const destinationFinance = destination
      ? this.financialSummary(destination)
      : null;
    const requestedWage = this.player.contract?.wage ?? 0;
    const unavailableReason =
      type === "transfer"
        ? !destination || destination.id === this.club.id
          ? "Choose another available club."
          : this.matchSimulation && this.matchSimulation.status !== "finished"
            ? "Finish your current match before completing a transfer."
            : this.player.isLegend
              ? "Protected legends cannot transfer."
              : destination.squad.length >=
                    (destination.registrationLimit ?? 25) &&
                  !destinationReleasePlayer
                ? `${destination.name} has no open squad places.`
                : destinationFinance.transferBudget < 0 ||
                    destinationFinance.balance < 0
                  ? `${destination.name} cannot currently cover the transfer.`
                  : destinationFinance.wageBudget < requestedWage
                    ? `${destination.name} cannot fit your wages.`
                    : this.club.squad.length <= MIN_REGISTERED_SQUAD_SIZE
                      ? `${this.club.name} cannot release another registered player.`
                      : !this.players.includes(this.player) ||
                          !this.club.has(this.player.id)
                        ? "Your player registration is unavailable."
                        : null
        : type === "better-teammates" && !newTeammate
          ? requestedPlayer
            ? "That player cannot be signed within the squad and budget rules."
            : "The club cannot currently afford or register a suitable signing."
          : null;
    request.approved = !unavailableReason && chance >= threshold;
    request.status = request.approved ? "approved" : "declined";
    if (unavailableReason) {
      request.response = `${manager.name} cannot approve this request: ${unavailableReason}`;
    } else if (!request.approved) {
      request.response = `${manager.name} has declined for now. Build trust through performances and team commitment.`;
    } else if (type === "playing-time") {
      const amount = details.amount === "less" ? "less" : "more";
      this.player.requestedPlayingTime = amount;
      this.player.trusting.manager = clamp(trust + 8, 0, 100);
      request.response = `${manager.name} agrees to give you ${amount} playing time.`;
    } else if (type === "better-teammates") {
      if (salePlayer && saleBuyer) {
        const weakWage =
          salePlayer.contract?.wage ?? Math.round(salePlayer.overall * 900);
        transferPlayer({
          seller: this.club,
          buyer: saleBuyer,
          player: salePlayer,
          players: this.players,
          fee: saleFee,
          wage: weakWage,
          date: this.currentDay(),
          transferId: `${request.id}-weak-player-sale`,
        });
        this.transferHistory ??= [];
        this.transferHistory.unshift({
          id: `${request.id}-weak-player-sale`,
          playerId: salePlayer.id,
          playerName: `${salePlayer.first} ${salePlayer.last}`,
          fromClubId: this.club.id,
          fromClub: this.club.name,
          toClubId: saleBuyer.id,
          toClub: saleBuyer.name,
          fee: saleFee,
          date: this.currentDay(),
          type: "player-request-sale",
          wage: weakWage,
        });
      } else if (salePlayer) {
        releaseSquadPlayer(this.club, salePlayer, this.currentDay());
        assignShirtNumbers(this.players, this.club, true);
        this.transferHistory ??= [];
        this.transferHistory.unshift({
          id: `${request.id}-weak-player-release`,
          playerId: salePlayer.id,
          playerName: `${salePlayer.first} ${salePlayer.last}`,
          fromClubId: this.club.id,
          fromClub: this.club.name,
          toClubId: null,
          toClub: "Free agent",
          fee: 0,
          date: this.currentDay(),
          type: "player-request-release",
          wage: 0,
        });
      }
      const seller = this.clubs.find((club) => club.id === newTeammate.clubId);
      const fee = marketValueForPlayer(newTeammate, seller, this.currentDay());
      const wage =
        newTeammate.contract?.wage ?? Math.round(newTeammate.overall * 900);
      transferPlayer({
        seller,
        buyer: this.club,
        player: newTeammate,
        players: this.players,
        fee,
        wage,
        date: this.currentDay(),
        transferId: `${request.id}-signing`,
      });
      assignShirtNumbers(this.players, this.club, true);
      request.signedPlayerId = newTeammate.id;
      this.transferHistory ??= [];
      this.transferHistory.unshift({
        id: `${request.id}-signing`,
        playerId: newTeammate.id,
        playerName: `${newTeammate.first} ${newTeammate.last}`,
        fromClubId: seller.id,
        fromClub: seller.name,
        toClubId: this.club.id,
        toClub: this.club.name,
        fee,
        date: this.currentDay(),
        contractYears: 3,
        type: "player-request",
        wage,
      });
      request.response = salePlayer
        ? `${manager.name} agrees. ${salePlayer.first} ${salePlayer.last} was ${saleBuyer ? "sold" : "released as a free agent"}, and ${newTeammate.first} ${newTeammate.last} joins ${this.club.name} as your new teammate.`
        : `${manager.name} agrees. ${newTeammate.first} ${newTeammate.last} joins ${this.club.name} as your new teammate.`;
    } else {
      const fromClub = this.club;
      const wage = this.player.contract?.wage ?? 0;
      if (destinationReleasePlayer) {
        releaseSquadPlayer(
          destination,
          destinationReleasePlayer,
          this.currentDay(),
        );
        assignShirtNumbers(this.players, destination, true);
        this.transferHistory ??= [];
        this.transferHistory.unshift({
          id: `${request.id}-destination-release`,
          playerId: destinationReleasePlayer.id,
          playerName: `${destinationReleasePlayer.first} ${destinationReleasePlayer.last}`,
          fromClubId: destination.id,
          fromClub: destination.name,
          toClubId: null,
          toClub: "Free agent",
          fee: 0,
          date: this.currentDay(),
          type: "player-request-release",
          wage: 0,
        });
      }
      transferPlayer({
        seller: fromClub,
        buyer: destination,
        player: this.player,
        players: this.players,
        fee: 0,
        wage,
        date: this.currentDay(),
        transferId: `${request.id}-transfer`,
      });
      assignShirtNumbers(this.players, fromClub, true);
      assignShirtNumbers(this.players, destination, true);
      this.player.contract.expires ??= this.season + 3;
      fromClub.isUserClub = false;
      destination.isUserClub = true;
      this.club = destination;
      this.positionNeedCache = null;
      this.transferHistory ??= [];
      this.transferHistory.unshift({
        id: `${request.id}-transfer`,
        playerId: this.player.id,
        playerName: `${this.player.first} ${this.player.last}`,
        fromClubId: fromClub.id,
        fromClub: fromClub.name,
        toClubId: destination.id,
        toClub: destination.name,
        fee: 0,
        date: this.currentDay(),
        contractYears: 3,
        type: "player-request",
        wage,
      });
      this.pendingPlayerTransfer = null;
      request.destinationClubId = destination.id;
      request.response = destinationReleasePlayer
        ? `${manager.name} agrees. ${destinationReleasePlayer.first} ${destinationReleasePlayer.last} was released to make room, and your transfer to ${destination.name} is complete.`
        : `${manager.name} agrees. Your transfer to ${destination.name} is complete.`;
    }

    this.news.push(`${manager.name}: ${request.response}`);
    return request;
  }

  canSignPlayerForPlayerCareer(player) {
    if (!player || player.clubId === this.club.id || player.isLegend)
      return false;
    const seller = this.clubs.find((club) => club.id === player.clubId);
    if (!seller || seller.squad.length <= 20 || this.club.squad.length >= 25)
      return false;
    const fee = marketValueForPlayer(player, seller, this.currentDay());
    const wage = player.contract?.wage ?? Math.round(player.overall * 900);
    const finances = this.financialSummary(this.club);
    return (
      finances.transferBudget >= fee &&
      finances.balance >= fee &&
      finances.remainingWageBudget >= wage
    );
  }

  talkToManager(topic, details = {}) {
    if (this.isManagerCareer)
      throw new Error("Manager careers do not use player conversations.");
    const manager = this.club.manager;
    const trust = Number(this.player.trusting?.manager ?? 50);
    const performance = Number(this.player.stats?.apps ?? 0)
      ? Number(this.player.stats.ratingSum ?? 0) /
        Number(this.player.stats.apps)
      : 6.5;
    const responses = {
      playingTime:
        trust >= 60 || performance >= 7.2
          ? "The manager agrees to review your minutes and include you more often."
          : "The manager says your minutes will depend on training and match performance.",
      development:
        trust >= 55
          ? "The manager will tailor upcoming training to your development needs."
          : "The manager asks you to earn more trust before changing your development plan.",
      role:
        trust >= 65
          ? "The manager is willing to discuss a larger role in the tactical plan."
          : "The manager wants you to keep learning the current role for now.",
      future:
        trust >= 70
          ? "The manager says you are an important part of the club's future."
          : "The manager says your future will be reviewed after the next run of matches.",
      betterTeammate:
        "The manager will review whether your squad needs an upgrade.",
      formation:
        trust >= 60
          ? "The manager is open to adapting the tactical shape."
          : "The manager wants you to prove your case before changing the formation.",
      training:
        trust >= 55
          ? "The manager approves a more personalized training programme."
          : "The manager asks you to maintain the current plan for now.",
    };
    if (!Object.hasOwn(responses, topic)) topic = "future";
    let response = responses[topic];
    let approved = false;
    if (topic === "playingTime") {
      const request = this.requestPlayingTime("more");
      approved = request.approved;
      response = request.response;
    } else if (topic === "development") {
      approved = trust >= 55;
      if (approved) {
        this.player.managerTrainingBonus = true;
        response = `${manager.name} approves a focused training plan. Your next training session will improve an extra point.`;
      }
    } else if (topic === "role") {
      approved = trust >= 65;
      if (approved) {
        this.player.managerRoleApproved = true;
        response = `${manager.name} approves a larger tactical role for you.`;
      }
    } else if (topic === "future") {
      approved = trust >= 70;
      if (approved) {
        this.player.morale = clamp((this.player.morale ?? 50) + 5, 0, 100);
        this.player.trusting.manager = clamp(trust + 5, 0, 100);
        response = `${manager.name} confirms you are part of the club's future and your morale improves.`;
      }
    } else if (topic === "betterTeammate") {
      const request = this.requestBetterTeammates(
        details.position ?? "",
        details.playerId ?? null,
      );
      approved = request.approved;
      response = request.response;
    } else if (topic === "formation") {
      approved = trust >= 60 && FORMATION_NAMES.includes(details.formation);
      if (approved) {
        this.changeFormation(details.formation);
        this.player.requestedFormation = details.formation;
        this.player.trusting.manager = clamp(trust + 3, 0, 100);
        response = `${manager.name} approves your request and will use ${details.formation} as the team formation.`;
      } else {
        response = `${manager.name} cannot change the formation right now. Improve trust and offer a supported tactical shape.`;
      }
    } else if (topic === "training") {
      approved = trust >= 55;
      if (approved) {
        this.player.managerTrainingBonus = true;
        response = `${manager.name} approves an extra training focus tailored to your development.`;
      }
    }
    const entry = {
      id: `conversation-${this.season}-${this.week}-${this.conversationHistory.length + 1}`,
      topic,
      manager: manager.name,
      date: this.currentDay(),
      response,
      trust,
      approved,
      details,
    };
    this.conversationHistory.push(entry);
    if (this.conversationHistory.length > 50) this.conversationHistory.shift();
    if (topic !== "playingTime")
      this.news.unshift(`${manager.name}: ${response}`);
    return entry;
  }

  retireCareer() {
    if (this.isManagerCareer)
      throw new Error(
        "Use manager retirement from the manager career controls.",
      );
    if (this.careerEnded) return this.careerSummary();
    this.careerEnded = true;
    this.player.retired = true;
    this.player.retiredSeason = this.season;
    this.player.retiredDate = this.currentDay();
    this.player.careerEnded = true;
    this.news.unshift(
      `${this.player.first} ${this.player.last} has retired from professional football.`,
    );
    return this.careerSummary();
  }

  careerSummary() {
    const stats = this.player.stats ?? {};
    return {
      name: `${this.player.first} ${this.player.last}`,
      season: this.season,
      appearances: stats.apps ?? 0,
      goals: stats.goals ?? 0,
      assists: stats.assists ?? 0,
      honours: this.getCareerHonours(),
    };
  }

  requestPlayingTime(amount = "more") {
    return this.playerManagerRequest("playing-time", { amount });
  }

  requestBetterTeammates(position = "", playerId = null) {
    return this.playerManagerRequest("better-teammates", {
      position,
      playerId,
    });
  }

  requestTransfer(clubId) {
    const target = this.clubs.find((club) => club.id === clubId);
    if (!target || target.id === this.club.id)
      throw new Error("Choose another available club.");
    return this.playerManagerRequest("transfer", {
      clubId: target.id,
      clubName: target.name,
    });
  }

  approvedPlayerTransfer(clubId) {
    const request = this.pendingPlayerTransfer;
    if (
      !request?.approved ||
      request.type !== "transfer" ||
      (request.destinationClubId && request.destinationClubId !== clubId)
    )
      throw new Error("Your manager has not approved that destination.");
    return request;
  }

  buyPlayer(playerId, { fee, wage, contractYears = 3 } = {}) {
    if (!this.isManagerCareer) throw new Error("Only the manager can approve club transfers.");
    const player = this.players.find((entry) => entry.id === playerId);
    if (!player) throw new Error("That player is not available.");
    const seller = this.clubs.find((club) => club.id === player.clubId);
    if (!seller || seller.id === this.club.id)
      throw new Error("That player is not available from another club.");
    const value = marketValueForPlayer(player, seller, this.currentDay());
    const agreedFee = Math.max(1, Math.round(Number(fee ?? value)));
    const agreedWage = Math.max(
      0,
      Math.round(Number(wage ?? player.contract?.wage ?? player.overall * 900)),
    );
    if (
      this.club.financials().wageBudget - this.club.wageBill(this.players) <
      agreedWage
    )
      throw new Error(
        "There is not enough remaining wage budget for this player.",
      );
    const result = transferPlayer({
      seller,
      buyer: this.club,
      player,
      players: this.players,
      fee: agreedFee,
      wage: agreedWage,
      date: this.currentDay(),
      transferId: `transfer-${this.season}-${this.week}-${player.id}`,
    });
    player.contract.expires = this.season + contractYears;
    this.news.push(
      `${player.first} ${player.last} joins ${this.club.name} for €${agreedFee.toLocaleString()}.`,
    );
    return result;
  }

  listPlayerForSale(playerId, askingPrice) {
    if (!this.isManagerCareer)
      throw new Error("Only the manager can list a player for sale.");
    const player = this.players.find((entry) => entry.id === playerId);
    if (!player || player.clubId !== this.club.id)
      throw new Error("Only a player at your club can be listed.");
    const value = marketValueForPlayer(player, this.club, this.currentDay());
    return {
      id: `listing-${player.id}-${this.season}`,
      playerId: player.id,
      askingPrice: Math.max(1, Math.round(Number(askingPrice ?? value))),
      marketValue: value,
      status: "listed",
    };
  }

  /**
   * Messi and Ronaldo live in their own clubs' squads (FC Barcelona and Manchester United).
   * This returns them for the UI and the award race. They are ordinary players for
   * rating, development and transfers — only their guaranteed presence is special, so
   * honours and records recorded against them survive a career.
   */
  getLegends() {
    // A headliner may be in the user's own league (this.players) or in any other playable
    // league (tracked as a world performer), so look in both.
    const found = new Map();
    for (const player of this.players) {
      if (player.isLegend || isHeadliner(player)) found.set(player.id, player);
    }
    for (const state of this.worldLeagues ?? []) {
      for (const performer of state.performers) {
        if (performer.isLegend || isHeadliner(performer))
          found.set(performer.id, performer);
      }
    }
    return [...found.values()].map((player) => {
      const headliner = headlinerForClub(player.clubId);
      const ownClub = this.clubs.find((club) => club.id === player.clubId);
      return {
        player,
        clubName: ownClub?.name ?? headliner?.clubName ?? "",
        overall: Number.isFinite(Number(player.overall))
          ? Number(player.overall)
          : LEGEND_OVERALL,
      };
    });
  }

  /**
   * Give every club a head coach with a philosophy derived from its prestige and a
   * stable per-club seed, then let the coach pick a formation that suits his squad.
   * Runs at creation and again each pre-season, so formations evolve as squads change.
   */
  applyCoachFormations(dayIndex = 0) {
    const styles = Object.keys(MANAGER_STYLES);
    for (const club of this.clubs) {
      if (club.id === this.club?.id && club.userChosenFormation) continue;
      // A well-known club keeps its real-life signature shape, whatever the coach's style.
      const realShape = realFormationFor(club.name, club.id);
      if (realShape) {
        club.formation = realShape;
        continue;
      }
      if (!club.manager.style || club.manager.style === "Balanced") {
        club.manager.style =
          styles[
            hashString(`coach-style-${club.id}-${this.season}`) % styles.length
          ];
      }
      ensureCoachProfile(club);
      club.formation = chooseTacticalFormation(
        club,
        this.players,
        dayIndex,
      ).formation;
    }
  }

  /**
   * Choose a nationality for a generated player at a club. A squad is mostly made up of
   * its home nation, but real teams carry a meaningful share of imports, so we borrow
   * from a spread of other catalogued footballing nations for the rest.
   */
  pickNationality(rng, homeNation) {
    const home = homeNation ?? this.data.league.nation ?? "ENG";
    // Roughly two thirds home-grown, one third imported, which matches a real squad.
    if (rng.chance(0.66) || !CATALOGUED_NATIONS.length) return home;
    const imports = CATALOGUED_NATIONS.filter((nation) => nation !== home);
    return imports.length ? rng.pick(imports) : home;
  }

  /**
   * A random name drawn from the pool of the player's nationality, so the name always
   * matches the nation the player represents.
   */
  nameForNationality(rng, nationality) {
    return randomNameFor(rng, nationality);
  }

  /** The overall to show in the UI: base rating bent by form. */
  displayOverall(player = this.player) {
    return formAdjustedOverall(player, calculateOverall(player));
  }

  /** The base overall (training/development number), without the form swing. */
  baseOverall(player = this.player) {
    return calculateOverall(player);
  }

  /**
   * A readable injury state for the squad list and the player hub:
   * `{ injured, label, weeks }`. A fit player reports `injured: false`.
   */
  injuryStatus(player) {
    if (!isInjured(player)) return { injured: false, label: "Fit", weeks: 0 };
    const label =
      player.injury.label ?? injurySeverityLabel(player.injury.type);
    return {
      injured: true,
      label,
      weeks: player.injury.weeks ?? 1,
      type: player.injury.type,
    };
  }

  /**
   * How exposed a player is to injury, as a 0..100 score where 100 is the safest.
   * The UI shows this next to his physical attribute so the link is obvious.
   */
  injuryResistance(player) {
    const physical = player?.attrs?.physical ?? 60;
    const fatigue = Number(player?.fatigue) || 0;
    const score = physical * 0.8 - Math.max(0, fatigue - 30) * 0.4 + 20;
    return Math.round(clamp(score, 0, 100));
  }

  /** True when the career player is fit to be selected this week. */
  get playerAvailable() {
    return !isInjured(this.player) && !((this.player.suspensionWeeks ?? 0) > 0);
  }

  /** Stable coaching philosophy for a club, varied by prestige band. */
  chooseCoachStyle(id, identity) {
    const styles = Object.keys(MANAGER_STYLES);
    const prestige = identity.prestige ?? 55;
    // Big clubs attract higher-rated, more attacking coaches; lower clubs are pragmatic.
    const pool =
      prestige >= 75
        ? ["Attacking", "High Press", "Balanced", "Youth"]
        : prestige >= 60
          ? ["Balanced", "High Press", "Attacking", "Pragmatic"]
          : ["Defensive", "Pragmatic", "Balanced", "Youth"];
    return pool[hashString(`coach-${id}`) % pool.length] ?? styles[0];
  }

  /** Picks an archetype for a CPU player, weighted by how well it fits the role. */
  pickArchetypeForPosition(rng, position) {
    const archetypes = this.data.archetypes[position] ?? {};
    const keys = Object.keys(archetypes);
    if (!keys.length) return null;
    return keys[rng.int(0, keys.length - 1)];
  }

  buildSquads() {
    const rng = this.rng.stream("rosters");
    const templates = this.data.squadTemplate;
    const players = [];
    for (const club of this.clubs) {
      const remainingSlots = templates.positions.map((position, index) => ({
        position,
        index,
      }));
      const realPlayers =
        templates.realPlayersByClub?.[club.id] ??
        this.baseData.careerLeagues?.find(
          (entry) =>
            entry.league.id === this.data.league.id ||
            (this.baseData.playerDatabase &&
              entry.league.name === this.data.league.name),
        )?.rostersByClub?.[club.id] ??
        [];
      for (const record of realPlayers) {
        // Legends only ever play for their own club; skip them everywhere else.
        const legend = record.playerId
          ? null
          : legendForName(`${record.first} ${record.last}`);
        if (
          legend &&
          !legendAllowedAt(`${record.first} ${record.last}`, club.id)
        )
          continue;
        const slotIndex = remainingSlots.findIndex(
          (slot) => slot.position === record.position,
        );
        if (slotIndex >= 0) remainingSlots.splice(slotIndex, 1);
        const target = legend
          ? LEGEND_OVERALL
          : clamp(Number(record.overall), 48, 91);
        const hasCsvAttrs =
          !legend &&
          record.attrs &&
          Object.values(record.attrs).some((value) => value != null);
        const generated =
          (!hasCsvAttrs || record.position === "GK") && !legend
            ? generateAttributes(rng, record.position, target)
            : null;
        const age = legend ? 25 : clamp(Number(record.age) || 25, 16, 42);
        const derivedSubAttrs =
          hasCsvAttrs && record.position !== "GK"
            ? deriveSubAttrsFromGroups(record.attrs)
            : null;
        const derivedGkAttrs =
          hasCsvAttrs && record.position === "GK"
            ? ensureGoalkeeperAttributes(record.gkAttrs ?? {}, {
                ...record.attrs,
                overall: record.overall,
              })
            : null;
        const player = createPlayer({
          id: record.playerId ?? `real-${club.id}-${record.id}`,
          first: record.first,
          last: record.last,
          fullName: record.fullName ?? `${record.first} ${record.last}`.trim(),
          nickname: record.nickname ?? null,
          nationality: record.nationality || templates.nationality,
          dob: legend
            ? toDayIndex(2001, 6, 24)
            : (record.dob ?? toDayIndex(2026 - age, 1, 1)),
          position: record.position,
          altPositions: record.altPositions ?? [],
          archetype: legend
            ? legend.archetype
            : this.pickArchetypeForPosition(rng, record.position),
          ...(legend
            ? {
                height: legend.height,
                weight: legend.weight,
                foot: legend.foot,
                weakFoot: legend.weakFoot,
                skillMoves: legend.skillMoves,
                shirtNumber: legend.shirtNumber,
              }
            : {
                ...physicalProfileFor(rng, record.position),
                height: record.height ?? 180,
                weight: record.weight ?? 75,
                foot: record.foot ?? "Right",
                weakFoot: record.weakFoot ?? 3,
                skillMoves: record.skillMoves ?? 3,
                shirtNumber: record.shirtNumber,
                archetype:
                  record.archetype ??
                  this.pickArchetypeForPosition(rng, record.position),
              }),
          attrs: hasCsvAttrs ? { ...record.attrs } : (generated?.attrs ?? null),
          subAttrs: hasCsvAttrs ? derivedSubAttrs : (generated?.subAttrs ?? null),
          gkAttrs: hasCsvAttrs
            ? (derivedGkAttrs ?? generated?.gkAttrs ?? null)
            : (generated?.gkAttrs ?? null),
          potential: legend
            ? LEGEND_OVERALL
            : clamp(Number(record.potential) || target, Math.min(target, Number(record.potential) || target), 99),
          clubId: club.id,
          squadStatus: "First Team",
          value: legend?.value ?? record.value,
          contract:
            (legend?.wage ??
            record.wage ??
            record.contractStartDate ??
            record.contractExpiryDate ??
            record.releaseClause ??
            record.loanStatus)
              ? {
                  wage: legend?.wage ?? record.wage,
                  expires:
                    (legend?.contractYears ?? record.contractYears) == null
                      ? null
                      : this.season +
                        (legend?.contractYears ?? record.contractYears),
                  startDate: record.contractStartDate ?? null,
                  expiryDate: record.contractExpiryDate ?? null,
                  releaseClause: record.releaseClause ?? null,
                  loanStatus: record.loanStatus ?? null,
                  loanParentClub: record.loanParentClub ?? null,
                }
              : null,
          contractStartDate: record.contractStartDate,
          contractExpiryDate: record.contractExpiryDate,
          releaseClause: record.releaseClause,
          loanStatus: record.loanStatus,
          loanParentClub: record.loanParentClub,
          source: record.source ?? "real-world",
          dataSource: record.dataSource,
          dataStatus: record.dataStatus,
          lastVerified: record.lastVerified,
          isLegend: !!legend,
          personality: [
            legend?.personality ??
              record.personality ??
              personalityForPlayer(
                record.first,
                record.last,
                record.position,
                record.overall,
              ),
          ],
        });
        // Imported real players start at their CSV overall and can develop/regress.
        if (hasCsvAttrs && !legend) {
          player.attrs = { ...record.attrs };
          player.overall = clamp(Number(record.overall), 48, 99);
          player.baseOverall = player.overall;
          player.previousOverall = player.overall;
          player.overallAdjustment = 0;
          // Keepers are rated on their goalkeeping line: preserve the CSV OVR exactly and
          // carry the full attribute set through, so import and generation agree.
          if (record.position === "GK") {
            player.gkAttrs = ensureGoalkeeperAttributes(record.gkAttrs ?? {}, {
              ...record.attrs,
              overall: player.overall,
            });
            player.overall = clamp(
              Math.round(goalkeeperOverall(player.gkAttrs, player.overall)),
              48,
              99,
            );
            player.baseOverall = player.overall;
            player.previousOverall = player.overall;
          }
        }
        players.push(player);
        club.addPlayer(player.id);
      }
      const depthNeeded = Math.max(0, 20 - club.squad.length);
      const fullSquadPositions = [
        ...remainingSlots.slice(0, depthNeeded),
        ...Array.from(
          { length: Math.max(0, depthNeeded - remainingSlots.length) },
          (_, extra) => ({
            position: templates.positions[extra % templates.positions.length],
            index: templates.positions.length + extra,
          }),
        ),
      ];
      for (const { position, index } of fullSquadPositions) {
        // Names are drawn at random from the player's nationality pool, so generated
        // squads feel varied and every player's name matches the nation he represents.
        const nationality = this.pickNationality(
          rng,
          templates.nationality ?? this.data.league.nation,
        );
        const { first, last } = this.nameForNationality(rng, nationality);
        const offset = templates.ratingOffsetByPosition[position] ?? 0;
        const target = clamp(
          Math.round(
            templates.clubRatingFormula.base +
              club.prestige * templates.clubRatingFormula.prestigeScale +
              offset +
              rng.normal(0, templates.clubRatingFormula.spread),
          ),
          48,
          84,
        );
        const generated = generateAttributes(rng, position, target);
        const body = physicalProfileFor(rng, position);
        const age = rng.int(16, 34);
        const player = createPlayer({
          id: `squad-${club.id}-${index + 1}`,
          first,
          last,
          nationality,
          dob: toDayIndex(2026 - age, rng.int(1, 12), rng.int(1, 28)),
          position,
          altPositions: SIMILAR_POSITIONS[position] ?? [],
          personality: [personalityForPlayer(first, last, position, target)],
          archetype: this.pickArchetypeForPosition(rng, position),
          height: body.height,
          weight: body.weight,
          attrs: generated.attrs,
          subAttrs: generated.subAttrs,
          gkAttrs: generated.gkAttrs,
          potential: clamp(target + rng.int(0, 10), target, 96),
          clubId: club.id,
          squadStatus: index < 11 ? "First Team" : "Rotation",
          source: "generated",
        });
        players.push(player);
        club.addPlayer(player.id);
      }
      club.registrationLimit = Math.max(25, realPlayers.length + 2);
      ensureSquadRegistration(club, players);
    }
    return players;
  }

  createCareerPlayer(options) {
    const position = POSITIONS.includes(options.position)
      ? options.position
      : "CM";
    const rating = 70;
    const attributes = generateAttributes(
      this.rng.stream("player-creation"),
      position,
      rating,
    );
    const height = clamp(Number(options.height) || 178, 150, 210);
    const weight = clamp(Number(options.weight) || 70, 45, 120);
    // Creation-screen sliders (one per group stat) let the player shape his starting
    // profile. Missing or invalid entries keep the seeded roll above. Because the body
    // is applied on top when the player is built, a slider value is read as "what this
    // player would show with a normal build", and divided by his physique multiplier
    // here — so a heavy winger still ends up visibly slower than a lean one.
    const physique = physiqueProfile(position, height, weight);
    const sliderGroups = position === "GK" ? GOALKEEPER_ATTRIBUTES : ATTRIBUTES;
    let customised = false;
    const customisedGroups = new Set();
    for (const group of sliderGroups) {
      const value = Number(options.attrs?.[group]);
      if (!Number.isFinite(value)) continue;
      const target = clamp(Math.round(value), 1, 99);
      const mult = physique.attrs[group] ?? 1;
      if (position === "GK") {
        attributes.gkAttrs[group] = clamp(Math.round(target / mult), 1, 99);
      } else {
        attributes.attrs[group] = clamp(Math.round(target / mult), 1, 99);
      }
      customised = true;
      customisedGroups.add(group);
    }
    if (position === "GK") {
      // Diving and Speed are derived keeper stats, so keep them in step too.
      for (const derived of ["diving", "speed"]) {
        const value = Number(options.attrs?.[derived]);
        if (!Number.isFinite(value)) continue;
        attributes.gkAttrs[derived] = clamp(Math.round(value), 1, 99);
        customised = true;
      }
    }
    if (customised) {
      // Pre-compensate the detailed layer too, so createPlayer's physique pass lands
      // the sub-attributes back on the player's physical reality instead of un-bending it.
      const raw = deriveSubAttrsFromGroups(attributes.attrs);
      for (const [key, value] of Object.entries(raw)) {
        const mult = physique.subAttrs[key] ?? 1;
        attributes.subAttrs[key] = clamp(Math.round(value / mult), 1, 99);
      }
    }
    const ratingAttributes =
      position === "GK" ? attributes.gkAttrs : attributes.attrs;
    const ratingProbe = {
      position,
      attrs: attributes.attrs,
      gkAttrs: attributes.gkAttrs,
    };
    // The body bends the stats when the player is built, so reconcile the overall
    // against the post-physique numbers: a prospect always starts at 70 OVR, and his
    // height/weight decide how that 70 is spread (fast but light, slow but strong...).
    const reconcileOverall = () => {
      // `calculateOverall` rounds to a whole number, so several stat lines share the same
      // displayed overall, and a fractional nudge cannot move a rounded number at all.
      // Walk out from the rolled line one whole point at a time — on the stats that
      // matter most for the position — and stop at the first line whose rounded overall
      // is exactly the target.
      const levers = Object.entries(
        position === "GK" ? GK_WEIGHTS : POSITION_WEIGHTS[position],
      )
        .sort(([, a], [, b]) => b - a)
        .map(([key]) => key)
        .filter((key) => ratingAttributes[key] != null);
      const snapshot = Object.fromEntries(
        levers.map((key) => [key, ratingAttributes[key]]),
      );
      const restore = () => Object.assign(ratingAttributes, snapshot);
      // Build the real player for a candidate line and test HIS overall: createPlayer's
      // physique pass rounds each stat again, which can move the rounded overall one
      // point either way, so the probe must use the same pipeline.
      const isTarget = () => {
        const probe = applyPhysique({
          position,
          height,
          weight,
          attrs: { ...attributes.attrs },
          gkAttrs: { ...attributes.gkAttrs },
          subAttrs: {},
        });
        return Math.abs(probe.overall - rating) < 1e-9;
      };
      const start = calculateOverall(ratingProbe);
      const directions = start < rating ? [1, -1] : [-1, 1];
      const maxSteps = 40;
      for (const direction of directions) {
        for (let i = 0; i < levers.length; i++) {
          for (let steps = 1; steps <= maxSteps; steps++) {
            restore();
            const value = snapshot[levers[i]] + direction * steps;
            if (value < 1 || value > 99) break;
            ratingAttributes[levers[i]] = value;
            if (isTarget()) return;
          }
        }
        // Two-point moves cover lines where a single stat cannot land on the target.
        for (let i = 0; i < levers.length; i++) {
          for (let j = 0; j < levers.length; j++) {
            if (i === j) continue;
            for (let a = 1; a <= maxSteps; a++) {
              const first = snapshot[levers[i]] + direction * a;
              if (first < 1 || first > 99) break;
              for (let b = 1; b <= maxSteps; b++) {
                const second = snapshot[levers[j]] + direction * b;
                if (second < 1 || second > 99) break;
                restore();
                ratingAttributes[levers[i]] = first;
                ratingAttributes[levers[j]] = second;
                if (isTarget()) return;
              }
            }
          }
        }
      }
      restore();
      throw new Error(`Unable to set the starting overall for ${position}.`);
    };
    reconcileOverall();
    if (customised) {
      // Keep the detailed layer in step with the reconciled group stats.
      const raw = deriveSubAttrsFromGroups(attributes.attrs);
      for (const [key, value] of Object.entries(raw)) {
        const mult = physique.subAttrs[key] ?? 1;
        attributes.subAttrs[key] = clamp(Math.round(value / mult), 1, 99);
      }
    }
    const traits =
      options.trait &&
      [
        "Wonderkid",
        "Late Bloomer",
        "Early Peak",
        "Late Bloomer (Physical)",
      ].includes(options.trait)
        ? [options.trait]
        : [];
    // The player-career fantasy has a deliberately high, but still variable, ceiling.
    // Potential is not current OVR: the player still starts at the established 70 OVR
    // creation contract and must earn the climb through training and performances.
    let potential = this.rng.stream("player-creation").int(91, 94);
    // Development traits bend the growth curve itself, not just the ceiling.
    // Wonderkid: peaks early and fades late. Late Bloomer: slow burn that keeps
    // rising. Early Peak: a short, sharp spike before a quick decline. Late Bloomer
    // (Physical): same slow burn, but the extra years land in the physical group.
    let peakAge = 27;
    let developmentRate = 1;
    if (traits.includes("Wonderkid")) {
      peakAge = 23;
      developmentRate = 1.18;
    } else if (traits.includes("Early Peak")) {
      peakAge = 22;
      developmentRate = 1.1;
    } else if (traits.includes("Late Bloomer")) {
      peakAge = 29;
      developmentRate = 0.88;
    } else if (traits.includes("Late Bloomer (Physical)")) {
      peakAge = 30;
      developmentRate = 0.9;
    }
    const age = clamp(Number(options.age) || 17, 16, 19);
    const created = createPlayer({
      id: this.playerId,
      first: options.first.trim(),
      last: options.last.trim(),
      nationality: options.nationality,
      dob: this.creationBirthday(options, age),
      height,
      weight,
      foot: options.foot === "Left" ? "Left" : "Right",
      weakFoot: clamp(Number(options.weakFoot) || 1, 1, 5),
      skillMoves: clamp(Number(options.skillMoves) || 1, 1, 5),
      position,
      altPositions: SIMILAR_POSITIONS[position] ?? [],
      archetype: options.archetype,
      attrs: attributes.attrs,
      subAttrs: attributes.subAttrs,
      gkAttrs: attributes.gkAttrs,
      potential,
      potentialTrajectory: this.rng.stream("player-creation").int(50, 100),
      traits,
      peakAge,
      developmentRate,
      personality: PERSONALITIES.includes(options.personality)
        ? [options.personality]
        : ["Professional"],
      honours: [],
      form: 55,
      morale: 70,
      sharpness: 65,
      squadStatus: "Prospect",
      trusting: { manager: 48, fans: 50, teammates: 45, board: 40 },
      isUser: true,
    });
    // createPlayer applies the physique pass itself; for the career player the overall
    // has already been reconciled against those same numbers, so recompute it here to
    // prove the two agree rather than trusting the probe.
    // Keep the established creation contract (70 OVR) without assigning a
    // cosmetic number: nudge only an uncustomised, low-impact attribute line.
    // The resulting rating still comes entirely from the stored attributes.
    const levers =
      position === "GK"
        ? Object.keys(GK_WEIGHTS).filter((key) => !customisedGroups.has(key))
        : Object.keys(ATTRIBUTES)
            .map((key) => ATTRIBUTES[key])
            .filter((key) => !customisedGroups.has(key));
    if (!levers.length) {
      levers.push(
        ...(position === "GK"
          ? ["kicking", "handling", "positioning"]
          : ["shooting", "dribbling", "physical"]),
      );
    }
    for (
      let attempt = 0;
      attempt < 20 && calculateOverall(created) !== rating;
      attempt++
    ) {
      const direction = calculateOverall(created) < rating ? 1 : -1;
      const key = levers[attempt % Math.max(1, levers.length)];
      if (!key) break;
      if (position === "GK") {
        created.gkAttrs[key] = clamp(
          (created.gkAttrs[key] ?? 50) + direction,
          1,
          99,
        );
      } else {
        created.attrs[key] = clamp(
          (created.attrs[key] ?? 50) + direction,
          1,
          99,
        );
        for (const sub of SUB_ATTRIBUTES[key] ?? [])
          created.subAttrs[sub] = clamp(
            (created.subAttrs[sub] ?? 50) + direction,
            1,
            99,
          );
      }
    }
    updatePlayerOverall(created, "Career creation", { ceiling: potential });
    const attributeHistory = {
      ...(created.subAttrs ?? {}),
      ...(created.gkAttrs ?? {}),
    };
    created.developmentHistory = [
      {
        season: this.season,
        date: this.currentDay(),
        overall: created.overall,
        change: 0,
        attributes: Object.fromEntries(
          Object.keys(attributeHistory).map((key) => [key, 0]),
        ),
      },
    ];
    return created;
  }

  /**
   * Turns the creation-screen birthday into a day index while keeping the player
   * between 16 and 19 on day one. Falls back to the chosen age on 1 January.
   */
  creationBirthday(options, age) {
    const firstDay = this.calendar?.[0]?.matchday;
    const year = Number(options.birthYear);
    if (Number.isInteger(year)) {
      const month = clamp(Number(options.birthMonth) || 1, 1, 12);
      const day = clamp(Number(options.birthDay) || 1, 1, 30);
      if (!Number.isFinite(firstDay)) return toDayIndex(year, month, day);
      const startYear = fromDayIndex(firstDay).year;
      // The chosen year is kept; if that birthday would put the player outside the
      // 16-19 window on day one, roll the year forward until he fits.
      for (let candidate = year; candidate <= startYear - 16; candidate++) {
        const dob = toDayIndex(candidate, month, day);
        const startAge = ageOn(dob, firstDay);
        if (startAge >= 16 && startAge <= 19) return dob;
      }
      return toDayIndex(startYear - 17, 1, 1);
    }
    return toDayIndex(this.season - age, 1, 1);
  }

  buildAgents() {
    const pool = Array.isArray(this.data.agents)
      ? this.data.agents
      : Array.isArray(this.data.agents?.agents)
        ? this.data.agents.agents
        : [
            {
              id: "agent-ace",
              name: "Milo Ace",
              specialty: "Elite transfers",
              rating: 83,
              fee: 350000,
              reputation: 88,
            },
            {
              id: "agent-merge",
              name: "Tariq Merd",
              specialty: "Contracts",
              rating: 76,
              fee: 220000,
              reputation: 72,
            },
            {
              id: "agent-ross",
              name: "Nora Ross",
              specialty: "Loans & development",
              rating: 72,
              fee: 170000,
              reputation: 65,
            },
          ];
    return pool.map((agent) => new Agent(agent));
  }

  buildLeague() {
    const entry = (
      this.worldCareerLeagues ??
      this.data.careerLeagues ??
      []
    ).find((candidate) => candidate.league.id === this.data.league.id);
    const leagueSpec = entry?.league ?? this.data.league;
    const league = new League({
      ...leagueSpec,
      teamIds: leagueSpec.teamIds,
      season: this.season,
    });
    league.buildFixtures(this.rng.stream("schedule"));
    const breakWeeks = [8, 16, 24, 32];
    const minCalendarWeeks = (leagueSpec.fixtureStartWeek ?? 3) + league.fixtures.length + breakWeeks.length;
    const calendar = seasonWeeks(
      this.season,
      Math.max(
        this.seasonWeekCount ?? this.data.league.seasonWeeks ?? 44,
        minCalendarWeeks,
      ),
    );
    this.calendar = calendar;
    if (!Number.isFinite(this.dayCursor)) {
      this.dayCursor = calendar[0]?.day - 1;
    }
    this.scheduleDomesticLeague(league);
    return league;
  }

  ensureAgent() {
    if (!this.agent)
      throw new Error("You need an agent before you can negotiate transfers.");
    return this.agent;
  }

  agentPerformanceFor(agentId = this.agent?.id) {
    if (!agentId) return { searches: 0, offers: 0, deals: 0 };
    this.agentPerformance ??= {};
    return (this.agentPerformance[agentId] ??= {
      searches: 0,
      offers: 0,
      deals: 0,
    });
  }

  isTransferWindowWeek(dayIndex = this.currentDay()) {
    const month = fromDayIndex(dayIndex).month;
    return month === 7 || month === 8 || month === 1;
  }

  clubLeagueEntry(clubId) {
    return (this.worldCareerLeagues ?? this.baseData.careerLeagues ?? []).find(
      (entry) => entry.league.teamIds.includes(clubId),
    );
  }

  transferNeedAssessment(
    club,
    dayIndex = this.currentDay(),
    players = this.players,
  ) {
    this.positionNeedCache ??= new Map();
    const key = `${club.id}:${this.season}:${this.week}:${dayIndex}`;
    if (!this.positionNeedCache.has(key)) {
      this.positionNeedCache.set(
        key,
        assessClubSquadNeeds(club, players, { dayIndex }),
      );
    }
    return this.positionNeedCache.get(key);
  }

  transferPerformanceBonus(player) {
    const apps = Number(
      player.leaguePerformance?.apps ?? player.stats?.apps ?? 0,
    );
    if (apps < 5) return 0;
    const averageRating =
      Number(
        player.leaguePerformance?.ratingSum ?? player.stats?.ratingSum ?? 0,
      ) / apps;
    const outputRate =
      (Number(player.leagueGoals ?? 0) + Number(player.leagueAssists ?? 0)) /
      apps;
    return clamp(
      Math.round(
        clamp((averageRating - 6.5) * 6, 0, 9) +
          clamp((outputRate - 0.3) * 10, 0, 6) +
          clamp((Number(player.form ?? 50) - 70) * 0.1, 0, 3),
      ),
      0,
      18,
    );
  }

  evaluateTransferInterest(
    player,
    { agent = null, excludeClubId = player.clubId, threshold = 58 } = {},
  ) {
    if (player?.isLegend) return [];
    const day = this.currentDay();
    const candidates = [];
    const marketPlayers = [
      ...new Map(
        [
          ...(this.players ?? []),
          ...(this.worldLeagues ?? []).flatMap(
            (state) => state.performers ?? [],
          ),
        ].map((entry) => [entry.id, entry]),
      ).values(),
    ];
    const destinationClubs = new Map(
      (this.clubs ?? []).map((club) => [club.id, club]),
    );
    for (const entry of this.worldCareerLeagues ?? []) {
      const state = this.worldLeagues?.find(
        (candidate) => candidate.league.id === entry.league.id,
      );
      for (const clubId of entry.league.teamIds) {
        if (destinationClubs.has(clubId)) continue;
        const identity = entry.clubIdentities?.[clubId];
        if (!identity) continue;
        const club = new Club({
          ...identity,
          id: clubId,
          nation: entry.league.nation,
          leagueId: entry.league.id,
          formation: state?.clubFormations?.[clubId] ?? "4-3-3",
          manager: {
            id: `manager-${clubId}`,
            name: `${identity.name} Head Coach`,
            nationality: entry.league.nation,
            rating: identity.prestige ?? 60,
          },
        });
        const roster = marketPlayers.filter(
          (candidate) => candidate.clubId === clubId,
        );
        club.squad = roster.map((candidate) => candidate.id);
        ensureClubFinance(club);
        destinationClubs.set(clubId, club);
      }
    }

    for (const club of destinationClubs.values()) {
      if (club.id === excludeClubId) continue;
      const needs = this.transferNeedAssessment(club, day, marketPlayers);
      const league = this.clubLeagueEntry(club.id);
      const leagueReputation = Number(
        league?.league?.reputation ??
          league?.league?.prestige ??
          club.prestige ??
          50,
      );
      const squad = marketPlayers.filter((item) => item.clubId === club.id);
      const marketClub = {
        ...club,
        currentWageBill: club.wageBill(marketPlayers),
        _marketSquad: squad,
      };
      const fit = scoreTransferSuitability({
        player,
        club: marketClub,
        needs,
        agentQuality: agent?.quality ?? 50,
        leagueReputation,
        performanceBonus: this.transferPerformanceBonus(player),
      });
      if (
        fit.score >= threshold &&
        fit.demand >= 40 &&
        fit.affordability >= 50 &&
        fit.wageFit >= 45
      ) {
        candidates.push({ club, league, fit });
      }
    }
    return candidates.sort(
      (a, b) => b.fit.score - a.fit.score || a.club.id.localeCompare(b.club.id),
    );
  }

  hireAgent(agentId) {
    const agent = this.agentPool.find((item) => item.id === agentId);
    if (!agent) throw new Error("That agent is not available.");
    if (this.agent && this.agent.id !== agent.id)
      throw new Error("Release your current agent before hiring another.");
    if (this.agent?.id === agent.id)
      throw new Error("That agent is already employed.");
    if (!this.spendMoney(agent.fee, `Hired agent: ${agent.name}`)) {
      throw new Error(
        `You need €${agent.fee.toLocaleString()} to hire ${agent.name}.`,
      );
    }
    this.financialHistory ??= [];
    this.financialHistory.push({
      id: `agent-hire-${this.season}-${this.week}-${agent.id}`,
      date: this.currentDay(),
      type: "agent-hire",
      amount: -agent.fee,
      description: `${agent.name} hiring fee`,
    });
    this.agent = agent;
    this.renewAgentSearchWindow();
    this.transferOffers = [];
    const searchFee = Math.round(agent.fee * 0.08);
    const searchAvailable =
      this.transferMarketState.searchCount < agentSearchTerms(agent).searches &&
      (this.transferMarketState.lastSearchDay == null ||
        this.currentDay() - this.transferMarketState.lastSearchDay >= 14);
    const offers =
      this.isTransferWindowWeek() && searchAvailable && this.money >= searchFee
        ? this.generateTransferOffers()
        : [];
    this.news.push(
      `${agent.name} is now your agent for contract and transfer talks.`,
    );
    return { agent, offers };
  }

  renewAgentSearchWindow() {
    const currentWindow = transferWindowForMonth(
      fromDayIndex(this.currentDay()).month,
    );
    const currentKey = currentWindow
      ? `${this.season}-${currentWindow}`
      : `offseason-${this.season}`;
    if (
      this.transferMarketState?.season !== this.season ||
      this.transferMarketState?.window !== currentKey
    ) {
      this.transferMarketState = {
        season: this.season,
        window: currentKey,
        searchCount: 0,
        lastSearchDay: null,
      };
    }
  }

  fireAgent() {
    if (!this.agent) return { agent: null, offers: [] };
    const agent = this.agent;
    this.agent = null;
    this.transferOffers = [];
    this.news.push(`${agent.name} has been released from your representation.`);
    return { agent: null, offers: [] };
  }

  reconcileSquadMembership() {
    const owned = new Set();
    for (const club of this.clubs ?? []) {
      club.squad = (club.squad ?? []).filter((playerId) => {
        const player = this.players.find((item) => item.id === playerId);
        if (!player || player.clubId !== club.id || owned.has(playerId))
          return false;
        owned.add(playerId);
        return true;
      });
    }
    for (const player of this.players ?? []) {
      if (!player.clubId) continue;
      const club = this.clubs.find((item) => item.id === player.clubId);
      if (club && !club.squad.includes(player.id)) club.addPlayer(player.id);
    }
  }

  moveToLeague(leagueId, clubId, { preservePreviousClub = false } = {}) {
    if (this.player?.isLegend)
      throw new Error(
        `${this.player.first} ${this.player.last} must remain at their protected club.`,
      );
    if (!this.isManagerCareer && this.pendingPlayerTransfer) {
      this.approvedPlayerTransfer(clubId);
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error(
        "Finish your current match before completing a transfer.",
      );
    }
    const targetEntry = this.worldCareerLeagues?.find(
      (entry) => entry.id === leagueId,
    );
    if (!targetEntry || !targetEntry.league.teamIds.includes(clubId)) {
      throw new Error("The destination club is no longer available.");
    }
    const targetStateIndex = this.worldLeagues.findIndex(
      ({ league }) => league.id === leagueId,
    );
    if (targetStateIndex < 0)
      throw new Error(
        "The destination league is not available for this season.",
      );
    const previousClubId = this.club.id;
    const currentRatings = Object.fromEntries(
      this.clubs.map((club) => [club.id, club.prestige]),
    );
    const targetState = this.worldLeagues[targetStateIndex];
    this.worldLeagues.splice(targetStateIndex, 1);
    const currentLeagueEntry = this.worldCareerLeagues.find(
      (entry) => entry.league.id === this.league.id,
    );
    this.worldLeagues.push({
      league: this.league,
      clubRatings: currentRatings,
      clubFormations: Object.fromEntries(
        this.clubs.map((club) => [club.id, club.formation]),
      ),
      clubTactics: Object.fromEntries(
        this.clubs.map((club) => [club.id, club.manager.style ?? "Balanced"]),
      ),
      performers: this.players
        .filter((player) => player.clubId)
        .map((player) => ({
          id: player.id,
          first: player.first,
          last: player.last,
          position: player.position,
          clubId: player.clubId,
          apps: player.leaguePerformance?.apps ?? player.stats.apps,
          goals: player.leagueGoals ?? 0,
          assists: player.leagueAssists ?? 0,
          ratingSum:
            player.leaguePerformance?.ratingSum ?? player.stats.ratingSum,
          overall: player.overall,
          age: ageOn(player.dob, this.currentDay()),
          attrs: player.attrs,
          subAttrs: player.subAttrs,
          gkAttrs: player.gkAttrs,
          potential: player.potential,
          age: ageOn(player.dob, this.currentDay()),
          source: player.source,
          value: player.value,
          wage: player.contract?.wage,
          playStyles: player.playStyles,
          lastMatchRating: player.lastMatchRating,
        })),
    });
    const demotedLeague = currentLeagueEntry
      ? this.worldCareerLeagues.find(
          (entry) => entry.league.id === currentLeagueEntry.league.id,
        )
      : null;
    if (
      !preservePreviousClub &&
      demotedLeague &&
      demotedLeague.league.id !== targetEntry.league.id
    ) {
      demotedLeague.league.teamIds = demotedLeague.league.teamIds.filter(
        (id) => id !== previousClubId,
      );
      const formerTier = currentLeagueEntry.league.tier ?? 1;
      const homeTierEntry = this.worldCareerLeagues.find(
        (entry) =>
          entry.league.nation === targetEntry.league.nation &&
          entry.league.tier === formerTier &&
          entry.league.id !== currentLeagueEntry.league.id,
      );
      if (
        homeTierEntry &&
        !homeTierEntry.league.teamIds.includes(previousClubId)
      )
        homeTierEntry.league.teamIds.push(previousClubId);
    }
    this.data = this.dataForLeague(targetEntry);
    this.data = { ...this.data, careerLeagues: this.worldCareerLeagues };
    this.league = targetState.league;
    this.seasonWeekCount = Math.max(
      this.seasonWeekCount,
      this.data.league.seasonWeeks ?? 44,
    );
    for (const club of this.clubs) {
      const lower = this.worldCareerLeagues.find(
        (entry) =>
          entry.league.tier === 2 && entry.league.teamIds.includes(club.id),
      );
      const upper = this.worldCareerLeagues.find(
        (entry) =>
          entry.league.tier === 1 && entry.league.teamIds.includes(club.id),
      );
      if (lower) club.leagueId = lower.league.id;
      if (upper) club.leagueId = upper.league.id;
    }
    this.clubs = this.buildClubs();
    this.players = this.buildSquads();
    for (const player of this.players)
      player.leaguePerformance = { apps: 0, ratingSum: 0 };
    this.worldLeagues = this.buildWorldLeagues();
    this.applyExpansionSquads();
    this.reconcileSquadMembership();
    const restoredPerformerIds = new Set();
    for (const performer of targetState.performers ?? []) {
      const player =
        this.players.find((item) => item.id === performer.id) ??
        this.players.find(
          (item) =>
            item.clubId === performer.clubId &&
            item.position === performer.position &&
            item.stats.apps === 0,
        );
      if (!player) continue;
      if (restoredPerformerIds.has(player.id)) continue;
      restoredPerformerIds.add(player.id);
      player.stats.apps = performer.apps;
      player.stats.goals = performer.goals;
      player.stats.assists = performer.assists;
      player.stats.ratingSum = performer.ratingSum;
      player.lastMatchRating = performer.lastMatchRating;
      player.leagueGoals = performer.goals;
      player.leagueAssists = performer.assists;
      player.leaguePerformance = {
        apps: performer.apps,
        ratingSum: performer.ratingSum,
      };
      player.careerStats = {
        ...player.careerStats,
        apps: performer.apps,
        goals: performer.goals,
        assists: performer.assists,
      };
    }
    this.club = this.clubs.find((club) => club.id === clubId);
    if (!this.club)
      throw new Error(`The destination club "${clubId}" is missing.`);
    this.player.clubId = this.club.id;
    this.club.addPlayer(this.player.id);
    this.club.isUserClub = true;
    this.players.push(this.player);
    this.player.leagueGoals = 0;
    this.player.leagueAssists = 0;
    this.player.leaguePerformance = { apps: 0, ratingSum: 0 };
    this.reconcileSquadMembership();
    this.positionNeedCache = null;
    this.transferHistory ??= [];
    this.transferRumours = [];
    this.transferMarketState = {
      season: this.season,
      window: null,
      searchCount: 0,
      lastSearchDay: null,
    };
    this.hiredManagerId = null;
    this.seasonComplete = this.areAllSeasonCompetitionsComplete();
    if (!this.isManagerCareer) this.pendingPlayerTransfer = null;
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status !== "complete"
    ) {
      const userStillIn =
        this.championsLeague.leaguePhaseTeams?.some(
          (team) => team.id === this.club.id,
        ) ?? false;
      if (!userStillIn) {
        this.completeChampionsLeagueIfDue();
      }
    }
    if (
      this.championsLeague?.season === this.season &&
      this.championsLeague.status !== "complete"
    ) {
      const userStillIn =
        this.championsLeague.leaguePhaseTeams?.some(
          (team) => team.id === this.club.id,
        ) ?? false;
      if (!userStillIn) {
        this.completeChampionsLeagueIfDue();
      }
    }
  }

  generateTransferOffers({ clubIds = [] } = {}) {
    const agent = this.ensureAgent();
    const terms = agentSearchTerms(agent);
    const requestedClubIds = [...new Set(clubIds)];
    if (requestedClubIds.length) {
      const knownClubIds = new Set(
        (this.worldCareerLeagues ?? []).flatMap(
          (entry) => entry.league.teamIds,
        ),
      );
      const unknownClubId = requestedClubIds.find(
        (clubId) => !knownClubIds.has(clubId),
      );
      if (unknownClubId)
        throw new Error(
          `The requested destination "${unknownClubId}" is unavailable.`,
        );
    }
    this.transferMarketState ??= {
      season: this.season,
      window: null,
      searchCount: 0,
      lastSearchDay: null,
    };
    const currentWindow = transferWindowForMonth(
      fromDayIndex(this.currentDay()).month,
    );
    const windowKey = currentWindow
      ? `${this.season}-${currentWindow}`
      : `offseason-${this.season}`;
    if (
      this.transferMarketState.season !== this.season ||
      this.transferMarketState.window !== windowKey
    ) {
      this.transferMarketState = {
        season: this.season,
        window: windowKey,
        searchCount: 0,
        lastSearchDay: null,
      };
    }
    if (this.transferMarketState.searchCount >= terms.searches) {
      throw new Error(
        `${terms.tier} Agent searches are used for this transfer window.`,
      );
    }
    const today = this.currentDay();
    if (!this.isTransferWindowWeek(today))
      throw new Error(
        "Destination searches are available during the summer and winter transfer windows only.",
      );
    if (
      this.transferMarketState.lastSearchDay != null &&
      today - this.transferMarketState.lastSearchDay < 14
    ) {
      throw new Error(
        "Your agent needs at least two weeks before another destination search.",
      );
    }
    const agentCost = Math.round(agent.fee * 0.08);
    if (agentCost > 0 && (this.money ?? 0) < agentCost)
      throw new Error(
        `You need €${agentCost.toLocaleString()} to fund this search.`,
      );
    this.transferMarketState.searchCount++;
    this.transferMarketState.lastSearchDay = today;
    this.transferRefreshCount = this.transferMarketState.searchCount;
    if (agentCost > 0) {
      if (!this.spendMoney(agentCost, `${agent.name} destination search`))
        throw new Error(
          `You need €${agentCost.toLocaleString()} to fund this search.`,
        );
      this.financialHistory ??= [];
      this.financialHistory.push({
        id: `agent-search-${this.season}-${this.week}-${this.transferMarketState.searchCount}`,
        date: today,
        type: "agent-fee",
        amount: -agentCost,
        description: `${agent.name} destination search`,
      });
    }
    const age = ageOn(this.player.dob, today);
    const candidates = this.evaluateTransferInterest(this.player, {
      agent,
      threshold:
        this.player.overall >= 88
          ? 38
          : 48 + Math.max(0, 58 - terms.maxPrestige) * 0.15,
    }).filter(
      ({ club }) =>
        (!requestedClubIds.length || requestedClubIds.includes(club.id)) &&
        Number(club.prestige ?? 50) <=
          terms.maxPrestige + (this.player.overall >= 88 ? 24 : 0),
    );
    if ((this.player.overall ?? 0) >= 90) {
      candidates.sort(
        (left, right) =>
          Number(right.club.prestige ?? 50) -
            Number(left.club.prestige ?? 50) ||
          right.fit.score - left.fit.score,
      );
    }
    const ranked = candidates.slice(0, 3).map(({ club, league, fit }) => {
      const identity = league?.clubIdentities?.[club.id] ?? club;
      const value = marketValueForPlayer(this.player, this.club, today);
      const fee = Math.round(
        clamp(value * (0.82 + fit.score / 300), value * 0.72, value * 1.25),
      );
      const wage = Math.round(
        Math.max(
          this.player.contract?.wage ?? 0,
          (this.player.overall ?? 55) * (650 + Number(club.prestige ?? 50) * 9),
        ),
      );
      const role =
        fit.playingTime >= 82
          ? "Crucial Player"
          : fit.playingTime >= 65
            ? "Important Player"
            : fit.playingTime >= 42
              ? "Rotation Player"
              : age < 22
                ? "Prospect"
                : "Backup Player";
      return {
        id: `offer-${club.id}-${this.season}-${this.week}-${this.transferMarketState.searchCount}`,
        agentId: agent.id,
        leagueId: league?.id ?? club.leagueId,
        leagueName: league?.league?.name ?? this.league.name,
        clubId: club.id,
        clubName: identity.name,
        fee,
        wage,
        interest: fit.score,
        contractYears: fit.playingTime >= 65 ? 4 : 3,
        role,
        squadRole: role,
        expectedPlayingTime: fit.playingTime,
        competitionOpportunities:
          Number(club.prestige ?? 50) >= 75
            ? "Continental football"
            : "Domestic league and cup football",
        reason: `${identity.name} have a ${fit.demandLevel.toLowerCase()} and see you as ${fit.reason}.`,
        window: this.isTransferWindowWeek(today) ? "open" : "next window",
        age,
      };
    });
    if (!ranked.length) {
      this.agentPerformanceFor(agent.id).searches++;
      this.transferOffers = [];
      this.news.unshift(
        "Your agent found no credible club interest: clubs lack a strong positional need, the budget or wage room is insufficient, or the proposed squad role would be too limited.",
      );
      return [];
    }
    const agentPerformance = this.agentPerformanceFor(agent.id);
    agentPerformance.searches++;
    agentPerformance.offers += ranked.length;
    this.transferOffers = ranked;
    this.news.unshift(
      `${agent.name} completed destination search ${this.transferMarketState.searchCount}/${terms.searches}; ${ranked.length} clubs have credible interest.`,
    );
    return ranked;
  }

  evaluateUserTransferInterest(dayIndex = this.currentDay()) {
    if (this.isManagerCareer || !this.player || this.week % 4 !== 0) return [];
    const interest = this.evaluateTransferInterest(this.player, {
      threshold: 72,
    });
    this.transferRumours = interest
      .slice(0, 3)
      .map(({ club, league, fit }) => ({
        playerId: this.player.id,
        clubId: club.id,
        clubName: club.name,
        leagueName: league?.league?.name ?? this.league.name,
        score: fit.score,
        reason: fit.reason,
        date: dayIndex,
      }));
    if (
      this.transferRumours.length &&
      this.rng
        .stream(`transfer-rumours-${this.season}-${this.week}`)
        .chance(0.35)
    ) {
      const rumour = this.transferRumours[0];
      this.news.unshift(
        `${rumour.clubName} are monitoring ${this.player.first} ${this.player.last} after identifying ${rumour.reason}.`,
      );
    }
    return this.transferRumours;
  }

  processCpuTransferMarket(dayIndex = this.currentDay()) {
    const month = fromDayIndex(dayIndex).month;
    if (![1, 7, 8].includes(month)) return [];
    if (
      this.nextCpuTransferEvaluationWeek > this.week &&
      !this._forceCpuTransferEvaluation
    )
      return [];
    this.nextCpuTransferEvaluationWeek = this.week + 4;
    this._forceCpuTransferEvaluation = false;
    const moved = [];
    const marketRng = this.rng.stream(
      `cpu-transfer-market-${this.season}-${this.week}`,
    );
    const cpuClubs = this.clubs.filter((club) => club.id !== this.club.id);
    const buyers = cpuClubs
      .filter((club) => {
        const finance = ensureClubFinance(club);
        return finance.transferBudget > 100_000 && finance.wageBudget > 0;
      })
      .sort((a, b) => b.prestige - a.prestige);
    let deals = 0;
    const maxDeals = Math.max(2, Math.ceil(cpuClubs.length * 0.1));
    const originalClubByPlayer = new Map(
      this.players.map((player) => [player.id, player.clubId]),
    );
    const movedPlayers = new Set();
    for (const buyer of buyers) {
      if (deals >= maxDeals) break;
      const needs = this.transferNeedAssessment(buyer, dayIndex);
      const priorities = Object.values(needs).sort(
        (a, b) => b.demand - a.demand,
      );
      const priority = priorities.find((need) => need.demand >= 58);
      if (!priority) continue;
      const buyerSquad = this.players.filter(
        (player) => player.clubId === buyer.id,
      );
      const marketBuyer = {
        ...buyer,
        currentWageBill: buyer.wageBill(this.players),
        _marketSquad: buyerSquad,
      };
      const candidates = this.players
        .filter(
          (player) =>
            player.clubId &&
            player.clubId !== buyer.id &&
            player.id !== this.player.id &&
            !movedPlayers.has(player.id) &&
            normalizePosition(player.position) === priority.position,
        )
        .filter(
          (player) =>
            !player.injury &&
            (player.contract?.expires == null ||
              Number(player.contract.expires) > this.season),
        )
        .filter((player) => {
          const seller = this.clubs.find((club) => club.id === player.clubId);
          if (!seller) return false;
          const sellerDemand =
            this.transferNeedAssessment(seller, dayIndex)[
              normalizePosition(player.position)
            ]?.demand ?? 0;
          const samePosDepth = this.players.filter(
            (item) =>
              item.clubId === seller.id &&
              normalizePosition(item.position) ===
                normalizePosition(player.position),
          ).length;
          return sellerDemand < 88 || samePosDepth > 2;
        })
        .map((player) => {
          const seller = this.clubs.find((club) => club.id === player.clubId);
          if (!seller) return null;
          const value = marketValueForPlayer(player, seller, dayIndex);
          const fit = scoreTransferSuitability({
            player,
            club: marketBuyer,
            needs,
            agentQuality: 65,
            leagueReputation: buyer.prestige,
          });
          return { player, seller, fit, value };
        })
        .filter(
          (item) =>
            item &&
            item.fit.score >= 64 &&
            item.fit.affordability >= 60 &&
            item.fit.wageFit >= 55,
        )
        .sort((a, b) => b.fit.score - a.fit.score || a.value - b.value);
      const target = candidates[0];
      if (!target) continue;
      if (
        target.seller.id === this.club.id ||
        originalClubByPlayer.get(target.player.id) !== target.seller.id
      )
        continue;
      if (
        this.players.filter((player) => player.clubId === target.seller.id)
          .length <= 15
      )
        continue;
      const fee = Math.round(target.value * (0.88 + marketRng.float() * 0.2));
      const wage = Math.max(
        target.player.contract?.wage ?? 0,
        Math.round(target.player.overall * (570 + buyer.prestige * 8)),
      );
      if (
        ensureClubFinance(buyer).transferBudget < fee ||
        ensureClubFinance(buyer).balance < fee ||
        buyer.wageBill(this.players) + wage >
          ensureClubFinance(buyer).wageBudget
      )
        continue;
      try {
        transferPlayer({
          seller: target.seller,
          buyer,
          player: target.player,
          players: this.players,
          fee,
          wage,
          date: dayIndex,
          transferId: `cpu-transfer-${this.season}-${this.week}-${target.player.id}`,
        });
      } catch {
        continue;
      }
      target.player.contract.expires = this.season + 3;
      target.player.contract.startSeason = this.season;
      target.player.contract.loan = false;
      assignShirtNumbers(this.players, target.seller);
      assignShirtNumbers(this.players, buyer);
      const transfer = {
        id: `cpu-transfer-${this.season}-${this.week}-${target.player.id}`,
        type: "permanent",
        playerId: target.player.id,
        playerName: `${target.player.first} ${target.player.last}`,
        fromClubId:
          originalClubByPlayer.get(target.player.id) ?? target.seller.id,
        fromClub:
          this.clubs.find(
            (club) =>
              club.id ===
              (originalClubByPlayer.get(target.player.id) ?? target.seller.id),
          )?.name ?? target.seller.name,
        toClubId: buyer.id,
        toClub: buyer.name,
        fee,
        date: dayIndex,
        contractYears: 3,
        previousWage: target.player.contract?.wage ?? 0,
        newWage: wage,
        competition: this.clubLeagueEntry(buyer.id)?.league?.name ?? "League",
      };
      const originalClubId = originalClubByPlayer.get(target.player.id);
      if (originalClubId && originalClubId !== target.seller.id) {
        transfer.fromClubId = originalClubId;
        transfer.fromClub =
          this.clubs.find((club) => club.id === originalClubId)?.name ??
          transfer.fromClub;
      }
      this.transferHistory.unshift(transfer);
      moved.push(transfer);
      this.news.unshift(
        `${transfer.playerName} transferred from ${transfer.fromClub} to ${transfer.toClub} for €${transfer.fee.toLocaleString()}.`,
      );
      deals++;
    }
    this.transferHistory = this.transferHistory.slice(0, 1000);
    this.positionNeedCache = null;
    if (moved.length) {
      const headline = `${moved.length} CPU transfer${moved.length === 1 ? "" : "s"} completed this window.`;
      this.news.unshift(headline);
      for (const transfer of moved) {
        if (
          transfer.fromClubId === this.club.id ||
          transfer.toClubId === this.club.id ||
          transfer.fromClub === this.club.name ||
          transfer.toClub === this.club.name
        ) {
          this.news.unshift(
            `${transfer.playerName} transferred from ${transfer.fromClub} to ${transfer.toClub} for €${transfer.fee.toLocaleString()}.`,
          );
        }
      }
    }
    return moved;
  }

  speakToAgent() {
    return this.ensureAgent();
  }

  resolveTransferOffer(offerId, decision = "reject", details = {}) {
    this.ensureAgent();
    if (this.player?.isLegend)
      throw new Error(
        `${this.player.first} ${this.player.last} cannot accept a transfer.`,
      );
    const offer = this.transferOffers.find((item) => item.id === offerId);
    if (!offer) throw new Error("That transfer offer is no longer available.");
    if (decision === "negotiate-wage") {
      const requestedWage = Number(details.wage);
      if (!Number.isSafeInteger(requestedWage) || requestedWage <= 0)
        throw new Error("Enter a valid weekly wage.");
      const baseWage = Number(offer.negotiationBaseWage ?? offer.wage);
      offer.negotiationBaseWage ??= baseWage;
      const premium = Math.max(0, requestedWage / baseWage - 1);
      const willingness = clamp(
        0.9 +
          (Number(this.agent.rating ?? 50) - 50) / 250 +
          (Number(offer.interest ?? 50) - 60) / 250 -
          premium * 1.6,
        0,
        0.98,
      );
      const wageResponse = new Rng(
        hashString(`wage-response-${this.seed}-${offer.id}-${requestedWage}`),
        `wage-response-${offer.id}`,
      );
      const accepted =
        requestedWage <= baseWage || wageResponse.chance(willingness);
      offer.lastRequestedWage = requestedWage;
      offer.wageRequestAccepted = accepted;
      if (accepted) {
        offer.wage = requestedWage;
        offer.negotiated = true;
        this.news.unshift(
          `${offer.clubName} accepted your request for €${requestedWage.toLocaleString()} weekly wages.`,
        );
      } else {
        this.news.unshift(
          `${offer.clubName} rejected your request for €${requestedWage.toLocaleString()} weekly wages; the original terms remain available.`,
        );
      }
      return { accepted, negotiated: true, offer, requestedWage };
    }
    if (decision === "request-role") {
      const roles = [
        "Backup Player",
        "Prospect",
        "Rotation Player",
        "Important Player",
        "Crucial Player",
      ];
      const index = roles.indexOf(offer.role);
      if (index < roles.length - 1 && offer.expectedPlayingTime >= 38) {
        offer.role = roles[index + 1];
        offer.expectedPlayingTime = Math.min(
          95,
          offer.expectedPlayingTime + 10,
        );
        this.news.unshift(
          `Your agent requested a bigger role from ${offer.clubName}.`,
        );
        return { accepted: false, negotiated: true, offer };
      }
      throw new Error("The club cannot promise a bigger role at this time.");
    }
    if (decision === "accept") {
      if (!this.isTransferWindowWeek() && offer.window !== "immediate")
        throw new Error(
          "This offer can only be completed during the next transfer window.",
        );
      const sameLeague = offer.leagueId
        ? offer.leagueId === this.league.id
        : offer.leagueName === this.league.name;
      const currentClubBeforeMove = this.club;
      const targetClubBeforeMove = sameLeague
        ? this.clubs.find((club) => club.id === offer.clubId)
        : null;
      if (!sameLeague) {
        const destinationEntry = this.worldCareerLeagues?.find(
          (entry) => entry.id === offer.leagueId,
        );
        const destinationIdentity =
          destinationEntry?.clubIdentities?.[offer.clubId];
        if (Number(destinationIdentity?.budget ?? 0) < offer.fee)
          throw new Error("The destination club cannot afford this transfer.");
      }
      if (sameLeague && targetClubBeforeMove) {
        transferPlayer({
          seller: currentClubBeforeMove,
          buyer: targetClubBeforeMove,
          player: this.player,
          players: this.players,
          fee: offer.fee,
          wage: offer.wage,
          date: this.currentDay(),
          transferId: `career-transfer-${offer.id}`,
        });
      }
      if (!sameLeague) {
        const sellerFinance = ensureClubFinance(currentClubBeforeMove);
        sellerFinance.transferBudget += offer.fee;
        recordClubTransaction(currentClubBeforeMove, {
          id: `career-transfer-${offer.id}-sell`,
          date: this.currentDay(),
          category: "transfers",
          description: `Transfer income for ${this.player.first} ${this.player.last}`,
          income: offer.fee,
        });
        this.moveToLeague(offer.leagueId, offer.clubId, {
          preservePreviousClub: true,
        });
      }
      const targetClub = this.clubs.find((club) => club.id === offer.clubId);
      if (!targetClub)
        throw new Error("The club in this offer no longer exists.");
      const currentClub = this.club;
      currentClub.removePlayer(this.player.id);
      targetClub.addPlayer(this.player.id);
      if (!sameLeague) {
        const targetFinance = ensureClubFinance(targetClub);
        targetFinance.transferBudget -= offer.fee;
        recordClubTransaction(targetClub, {
          id: `career-transfer-${offer.id}-buy`,
          date: this.currentDay(),
          category: "transfers",
          description: `Transfer fee for ${this.player.first} ${this.player.last}`,
          expense: offer.fee,
        });
      }
      this.club = targetClub;
      this.player.clubId = targetClub.id;
      assignShirtNumbers(this.players, currentClub);
      assignShirtNumbers(this.players, targetClub);
      this.player.contract = {
        wage: offer.wage,
        releaseClause: offer.fee,
        expires: this.season + (offer.contractYears ?? 3),
      };
      const transfer = {
        id: `career-transfer-${offer.id}`,
        agentId: offer.agentId ?? this.agent.id,
        playerId: this.player.id,
        playerName: `${this.player.first} ${this.player.last}`,
        fromClubId: currentClubBeforeMove.id,
        fromClub: currentClubBeforeMove.name,
        toClubId: targetClub.id,
        toClub: targetClub.name,
        fee: offer.fee,
        date: this.currentDay(),
        contractYears: offer.contractYears ?? 3,
        type: "permanent",
        wage: offer.wage,
      };
      this.transferHistory ??= [];
      this.transferHistory.unshift(transfer);
      this.agentPerformanceFor(transfer.agentId).deals++;
      this.reconcileSquadMembership();
      this.positionNeedCache = null;
      if (
        this.championsLeague?.season === this.season &&
        this.championsLeague.status !== "complete"
      ) {
        const userStillIn =
          this.championsLeague.leaguePhaseTeams?.some(
            (team) => team.id === this.club.id,
          ) ?? false;
        if (!userStillIn) {
          this.completeChampionsLeagueIfDue();
        }
      }
      this.transferOffers = [];
      this.news.push(
        `${this.player.first} ${this.player.last} joins ${targetClub.name} for €${offer.fee.toLocaleString()} and €${offer.wage.toLocaleString()} weekly wages.`,
      );
      return { accepted: true, offer };
    }
    if (decision === "request-role") {
      if (offer.expectedPlayingTime < 35)
        throw new Error("The club cannot promise a more important squad role.");
      offer.role =
        offer.role === "Prospect" || offer.role === "Backup Player"
          ? "Rotation Player"
          : "Important Player";
      offer.squadRole = offer.role;
      offer.expectedPlayingTime = Math.max(offer.expectedPlayingTime, 55);
      this.news.unshift(
        `${offer.clubName} agreed to consider a more important role in your contract talks.`,
      );
      return { accepted: false, negotiated: true, offer };
    }
    this.transferOffers = this.transferOffers.filter(
      (item) => item.id !== offerId,
    );
    this.news.push(`You declined a transfer offer from ${offer.clubName}.`);
    return { accepted: false, offer };
  }

  advanceWeek() {
    if (this.careerEnded) throw new Error("This career has ended.");
    if (this.seasonComplete) return this.lastReport;
    if (
      this.lastReport?.userMatch?.playerResult?.keyMoments?.some(
        (moment) => !moment.resolved,
      )
    ) {
      throw new Error("Resolve your outstanding key moments before advancing.");
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error(
        "Finish the live match simulation before advancing the career.",
      );
    }
    this.matchSimulation = null;
    const worldCupDueThisSeason =
      this.worldCup?.nextYear - 1 === this.season &&
      !["complete", "cancelled"].includes(this.worldCup.tournament?.status);
    if (this.week + 1 >= this.calendar.length && worldCupDueThisSeason) {
      this.seasonWeekCount = Math.max(this.seasonWeekCount + 2, 58);
      this.calendar = seasonWeeks(this.season, this.seasonWeekCount);
    }
    if (this.week + 1 >= this.calendar.length) {
      this.week++;
      this.dayCursor = this.calendar.at(-1)?.matchday ?? this.dayCursor;
      if (!this.areAllSeasonCompetitionsComplete()) {
        this.seasonComplete = false;
        throw new Error(
          "The season calendar ended before all leagues and competitions were complete.",
        );
      }

      this.recordSeasonAwards();
      this.seasonComplete = true;
      this.lastReport = {
        week: this.week,
        fixtures: [],
        userMatch: null,
        headlines: [
          "The season has concluded. Final standings have been confirmed.",
        ],
      };
      return this.lastReport;
    }
    this.week++;
    this.dayCursor = this.calendar[this.week]?.matchday ?? this.dayCursor;
    if (this.week >= this.calendar.length) {
      this.seasonComplete = this.areAllSeasonCompetitionsComplete();
      if (!this.seasonComplete) {
        throw new Error(
          "The season calendar ended before all leagues and competitions were complete.",
        );
      }
      this.recordSeasonAwards();
      this.lastReport = {
        week: this.week,
        fixtures: [],
        userMatch: null,
        headlines: ["The season has concluded."],
      };
      return this.lastReport;
    }

    const progression = this.data.careerSettings.training;
    const financeDay = this.calendar[this.week]?.day ?? this.currentDay();
    for (const club of this.clubs) {
      processWeeklyClubFinances(
        club,
        this.players.filter((player) => player.clubId === club.id),
        financeDay,
      );
      processWeeklyHierarchy(club, financeDay);
      processInvestmentWeek(club, financeDay);
      const aiClub = club.id !== this.club.id;
      ensureClubTraining(club, this.seed, this.season);
      if (aiClub)
        manageAITrainingStaff(
          club,
          financeDay,
          this.seed + this.week,
          this.season,
        );
      processClubTrainingWeek(
        club,
        this.players,
        financeDay,
        this.seed,
        this.season,
        { ai: aiClub },
      );
      processScoutingWeek(
        club,
        this.players,
        financeDay,
        this.rng.stream(`scouting-${club.id}`),
        { ai: club.id !== this.club.id },
      );
      if (club.id !== this.club.id) {
        const prospect = (club.scouting?.youthProspects ?? []).find(
          (item) => item.status === "available" && item.age >= 16,
        );
        if (prospect && (club.hierarchy?.manager?.youthAbility ?? 50) >= 55) {
          acceptYouthProspect(club, prospect.id);
        }
      }
      if (this.week % 12 === 0) aiInvestmentDecision(club, financeDay);
    }
    this.positionNeedCache = null;
    if (this.week % 4 === 0 || this.isTransferWindowWeek(financeDay)) {
      this.processCpuTransferMarket(financeDay);
      this.evaluateUserTransferInterest(financeDay);
    }
    // Decide the user's involvement BEFORE weekly recovery runs: a planned entrance
    // based on a tired incumbent must survive the fatigue reset between weeks.
    const userMatchWeek = this.league.fixtureWeeks.includes(this.week);
    const precomputedInvolvement = userMatchWeek
      ? this.matchInvolvement()
      : null;
    for (const player of this.players) {
      progressInjury(player);
      player.suspensionWeeks = Math.max(0, (player.suspensionWeeks ?? 0) - 1);
      ensureStamina(player);
    }
    this.creditMoney(this.player.contract?.wage ?? 0, "Weekly salary");
    this.player.trainingFocus = this.trainingFocus;
    this.player.fatigue = Math.max(
      0,
      this.player.fatigue - progression.weeklyFatigueRecovery,
    );
    for (const teammate of this.players) {
      if (teammate.clubId === this.club.id && teammate.id !== this.player.id) {
        // Squad players only shed fatigue when they actually play; a blanket weekly
        // recovery would erase the tired-incumbent state the selection plan depends on.
        teammate.fatigue = Math.max(
          0,
          (teammate.fatigue ?? 0) -
            progression.weeklyFatigueRecovery * (teammate.stats.apps ? 1 : 0),
        );
      }
    }
    const medicalFactor = investmentModifiers(this.club)?.recovery ?? 1;
    for (const squadPlayer of this.players) {
      applyStaminaRecovery(squadPlayer, 7, 1, medicalFactor);
    }
    this.player.fitness = clamp(
      this.player.fitness + progression.weeklyFitnessRecovery,
      0,
      100,
    );
    this.player.sharpness = clamp(
      this.player.sharpness + progression.weeklySharpnessGain,
      0,
      100,
    );
    this.player.morale = clamp(
      this.player.morale + (this.player.morale < 65 ? 1 : 0),
      0,
      100,
    );
    // Training-week injuries. Every squad member can break down in training, and the
    // risk is driven by his physical attribute, his fatigue and his traits.
    this.rollTrainingInjuries();
    this.applyCoachFormations(
      this.calendar[this.week]?.matchday ?? this.currentDay(),
    );
    const internationalReport = this.processWorldCupCalendar();

    const fixtures = [];
    let userMatch = internationalReport?.worldCupUserMatch ?? null;
    if (userMatch?.worldCupFixtureRecord)
      fixtures.push(userMatch.worldCupFixtureRecord);
    const championsLeagueFixtureForWeek = this.getChampionsLeagueFixtureForWeek(
      this.week,
    );
    const prioritizingChampionsLeague = Boolean(championsLeagueFixtureForWeek);
    const roundIndex = this.league.fixtureWeeks.indexOf(this.week);
    if (roundIndex >= 0) {
      const round = this.league.fixtures[roundIndex];
      for (const fixture of round) {
        const home = this.clubs.find((club) => club.id === fixture.home);
        const away = this.clubs.find((club) => club.id === fixture.away);
        const matchRng = this.rng.stream("matches");
        let result;
        let playerResult = null;
        const isUserMatch =
          !this.worldCupUnavailableIds?.has(this.player.id) &&
          !prioritizingChampionsLeague &&
          (home.id === this.club.id || away.id === this.club.id);
        const dayIndex = this.fixtureDayFor(this.league, roundIndex);
        const difficultyBonus =
          this.data.careerSettings.difficultyBonuses[this.difficulty] ?? 0;
        const homeStrength = matchStrength(home, this.players, dayIndex);
        const awayStrength = matchStrength(away, this.players, dayIndex);
        if (isUserMatch) {
          if (home.id === this.club.id) {
            homeStrength.attack += difficultyBonus;
            homeStrength.defence += difficultyBonus;
          } else {
            awayStrength.attack += difficultyBonus;
            awayStrength.defence += difficultyBonus;
          }
          const involvement = precomputedInvolvement ?? this.matchInvolvement();
          // When the career player is not starting, keep him off the XI entirely so he
          // can never be credited with a scheduled goal, card or key moment while
          // sitting on the bench — the ghost-player bug. The teammate the plan names as
          // the one making way IS forced into the XI, so the planned entrance is real.
          const plannedOutgoingId =
            !involvement.starts && involvement.outgoingPlayerId
              ? [involvement.outgoingPlayerId]
              : [];
          result = simulateMatch({
            home: { club: home, players: this.players, strength: homeStrength },
            away: { club: away, players: this.players, strength: awayStrength },
            rng: matchRng,
            dayIndex,
            detailedPlayerIds: [this.player.id],
            playerRoles: { [this.player.id]: this.matchRole },
            forcedPlayerIds: [
              ...(involvement.starts ? [this.player.id] : []),
              ...plannedOutgoingId,
            ],
            benchOnlyPlayerIds:
              involvement.namedOnBench && !involvement.starts
                ? [this.player.id]
                : [],
            excludedPlayerIds: [
              ...(!involvement.starts && !involvement.namedOnBench
                ? [this.player.id]
                : []),
              ...[...(this.worldCupUnavailableIds ?? [])],
            ],
            competition: "league",
          });
          const side = home.id === this.club.id ? "home" : "away";
          const opponent = side === "home" ? away : home;
          if (involvement.outgoingPlayerId) {
            const outgoingPlayer = this.players.find(
              (player) => player.id === involvement.outgoingPlayerId,
            );
            if (outgoingPlayer)
              outgoingPlayer.fatigue = Math.max(
                0,
                (outgoingPlayer.fatigue ?? 0) - 18,
              );
          }
          const opposingXI = result[side === "home" ? "away" : "home"].xi
            .map((id) => this.players.find((player) => player.id === id))
            .filter(Boolean);
          const detailedPerformance = this.player;
          playerResult = simulatePlayerMatch({
            player: detailedPerformance,
            match: result,
            side,
            opponents: opposingXI,
            rng: this.rng.stream("player-moments"),
            position: involvement.position ?? this.player.position,
            minutes: involvement.minutes,
            role: this.matchRole,
            catalog: this.data.keyMomentOptions,
            season: this.season,
            teamStyle: this.club?.manager?.playstyle,
          });
          this._pendingInvolvement = involvement;
          // A player who is not involved in this match has no objective to grade.
          const objective =
            involvement.minutes > 0 ? this.pickObjective() : null;
          const scheduledGoalEvents = result.events;
          const plannedHomeGoals = result.homeGoals;
          const plannedAwayGoals = result.awayGoals;
          result.events = [];
          result.scheduledGoalEvents = scheduledGoalEvents;
          result.plannedHomeGoals = plannedHomeGoals;
          result.plannedAwayGoals = plannedAwayGoals;
          result.homeGoals = 0;
          result.awayGoals = 0;
          const record = {
            id: fixture.id,
            competitionId: this.league.id,
            season: this.season,
            matchday: fixture.matchday ?? roundIndex + 1,
            scheduledDate: fixture.scheduledDate ?? dayIndex,
            roundIndex,
            week: this.week,
            homeClubId: home.id,
            awayClubId: away.id,
            home: home.name,
            away: away.name,
            homeGoals: 0,
            awayGoals: 0,
            stats: result.stats,
            userMatch: true,
            pending: true,
          };
          fixtures.push(record);
          userMatch = {
            ...result,
            playerResult,
            opponent: opponent.name,
            side,
            objective: objective
              ? objective.title
              : "No objective — did not play",
            objectiveComplete: false,
            objectiveAwarded: false,
          };
          const role = this.playerMatchRole(userMatch, side);
          this.matchSimulation = {
            minute: 0,
            outgoingPlayerId: involvement.outgoingPlayerId ?? null,
            activeMomentIndex: null,
            status: "ready",
            releasedGoalCount: 0,
            finalized: false,
            ...role,
          };
        } else {
          result = simulateMatch({
            home: { club: home, players: this.players, strength: homeStrength },
            away: { club: away, players: this.players, strength: awayStrength },
            rng: matchRng,
            dayIndex,
            excludedPlayerIds: [...(this.worldCupUnavailableIds ?? [])],
            competition: "league",
          });
          const record = {
            id: fixture.id,
            competitionId: this.league.id,
            season: this.season,
            matchday: fixture.matchday ?? roundIndex + 1,
            scheduledDate: fixture.scheduledDate ?? dayIndex,
            roundIndex,
            week: this.week,
            homeClubId: home.id,
            awayClubId: away.id,
            home: home.name,
            away: away.name,
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
            stats: result.stats,
            userMatch: false,
          };
          fixtures.push(record);
          this.results.push(record);
          this.recordClubMatchHistory(record, home.id, away.id);
          fixture.played = true;
          fixture.status = "completed";
          fixture.result = {
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
          };
          this.recordLeaguePlayerStats(result);
          const homeOutcome =
            result.homeGoals > result.awayGoals
              ? "W"
              : result.homeGoals === result.awayGoals
                ? "D"
                : "L";
          recordCoachMatch(home, homeOutcome);
          recordCoachMatch(
            away,
            homeOutcome === "W" ? "L" : homeOutcome === "L" ? "W" : "D",
          );
          processMatchdayRevenue(home, away, {
            date: dayIndex,
            competition: "league",
            importance: 1,
            resultKey: `matchday-${this.season}-${this.week}-${home.id}-${away.id}`,
            outcome: homeOutcome,
          });
          for (const event of result.misc ?? [])
            this.applyMatchIncident(result, event, { live: false });
        }
        if (!isUserMatch) {
          this.league.table.record(
            home.id,
            away.id,
            result.homeGoals,
            result.awayGoals,
          );
          this.recordManagerResult({
            home: { clubId: home.id },
            away: { clubId: away.id },
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
          });
        }
      }
    }

    let liveChampionsLeagueFixtureId = null;
    if (!userMatch && !this.worldCupUnavailableIds?.has(this.player.id)) {
      const fixture = championsLeagueFixtureForWeek;
      if (fixture) {
        liveChampionsLeagueFixtureId =
          this.createChampionsLeagueUserMatch(fixture);
        userMatch = this.lastReport.userMatch;
        fixtures.push(this.lastReport.fixtures[0]);
      }
    }
    const championsLeagueHeadlines = this.simulateChampionsLeagueWeek(
      this.week,
      {
        skipFixtureIds: liveChampionsLeagueFixtureId
          ? [liveChampionsLeagueFixtureId]
          : [],
      },
    );
    const completedLeagueFixtures = fixtures.filter(
      (fixture) =>
        !fixture.pending && fixture.competitionId !== "fifa-world-cup",
    ).length;
    const allHeadlines = [
      ...(internationalReport?.qualificationFixtures?.length
        ? [
            `${internationalReport.qualificationFixtures.length} FIFA World Cup qualifying fixtures completed.`,
          ]
        : []),
      ...(internationalReport?.worldCupMatches?.length
        ? [
            `${internationalReport.worldCupMatches.length} World Cup fixtures completed. The ${internationalReport.tournament.stage} continues.`,
          ]
        : []),
      ...(internationalReport?.tournamentStarted
        ? [
            `The ${internationalReport.tournament.year} FIFA World Cup has begun.`,
          ]
        : []),
      ...(internationalReport?.tournament?.status === "complete"
        ? [
            `The ${internationalReport.tournament.year} FIFA World Cup has concluded: ${internationalReport.tournament.winner} are champions.`,
          ]
        : []),
      ...(completedLeagueFixtures
        ? [`${completedLeagueFixtures} league fixtures completed`]
        : []),
      ...(userMatch
        ? [
            userMatch.competitionId === "fifa-world-cup"
              ? `${userMatch[userMatch.side].name} are ready to play ${userMatch.opponent} at the FIFA World Cup`
              : `${this.club.name} are ready to play ${userMatch.opponent}`,
          ]
        : fixtures.length
          ? ["Results are in across the league"]
          : [
              "Training week completed",
              "The squad is preparing for the next fixture",
            ]),
      ...championsLeagueHeadlines,
    ];
    const headlines = allHeadlines;
    if (userMatch) {
      this.lastReport = { week: this.week, fixtures, userMatch, headlines };
      this.lastReport.tablePosition = this.league.table
        .positions()
        .get(this.club.id);
    } else {
      this.lastReport = {
        week: this.week,
        fixtures,
        userMatch: null,
        headlines,
      };
    }

    this.simulateWorldLeaguesWeek(this.week);
    this.rollWorldLeagueInjuries();
    this.seasonComplete = this.areAllSeasonCompetitionsComplete();
    if (this.seasonComplete) {
      this.recordSeasonAwards();
    }
    return this.lastReport;
  }

  applyPlayerResult(performance, match, side) {
    const matchStats = { ...performance.stats, minutes: 0 };
    addStats(this.player.stats, matchStats);
    addStats(this.player.careerStats, matchStats);
    if (performance.rating != null) {
      const started = performance.stats.started !== false;
      this.player._playStyleMatchEvidence ??= {};
      for (const row of performance.involvementLog ?? []) {
        for (const badgeId of row.badgeIds ?? [])
          this.player._playStyleMatchEvidence[badgeId] =
            (this.player._playStyleMatchEvidence[badgeId] ?? 0) + 1;
      }
      this.player.stats.apps++;
      if (started) this.player.stats.starts++;
      this.player.stats.minutes += performance.minutes;
      this.player.stats.ratingSum += performance.rating;
      this.player.careerStats.apps++;
      if (started) this.player.careerStats.starts++;
      this.player.careerStats.minutes += performance.minutes;
      this.player.careerStats.ratingSum += performance.rating;
      this.player.lastMatchRating = performance.rating;
      this.player.lastMatchWeek = this.week;
      this.player.recentMatchRatings ??= [];
      this.player.recentMatchRatings.push(performance.rating);
      this.player.recentMatchRatings = this.player.recentMatchRatings.slice(-8);
      this.player.form = clamp(
        (this.player.form ?? 50) * 0.8 + performance.rating * 7.5 * 0.2,
        25,
        90,
      );
      this.player.confidence = clamp(
        (this.player.confidence ?? this.player.morale ?? 60) * 0.9 +
          performance.rating * 1.4,
        20,
        96,
      );
      this.applyPerformanceDevelopment(performance.rating);
    }

    const opponentGoals = side === "home" ? match.awayGoals : match.homeGoals;
    // Conceding is only a goalkeeper statistic when the player is a goalkeeper.
    if ((this.player.position ?? "").toUpperCase() === "GK") {
      this.player.stats.goalsConceded += opponentGoals;
      this.player.careerStats.goalsConceded += opponentGoals;
      const shotsFaced = Math.max(0, Number(matchStats.shotsFaced ?? opponentGoals));
      this.player.stats.shotsFaced =
        (this.player.stats.shotsFaced ?? 0) + shotsFaced;
      this.player.careerStats.shotsFaced =
        (this.player.careerStats.shotsFaced ?? 0) + shotsFaced;
      const saves = Number(matchStats.saves ?? 0);
      this.player.stats.saves = (this.player.stats.saves ?? 0) + saves;
      this.player.careerStats.saves = (this.player.careerStats.saves ?? 0) + saves;
      const penaltySaves = Number(matchStats.penaltySaves ?? 0);
      this.player.stats.penaltySaves =
        (this.player.stats.penaltySaves ?? 0) + penaltySaves;
      this.player.careerStats.penaltySaves =
        (this.player.careerStats.penaltySaves ?? 0) + penaltySaves;
      if (opponentGoals === 0) {
        this.player.stats.cleanSheets = (this.player.stats.cleanSheets ?? 0) + 1;
        this.player.careerStats.cleanSheets =
          (this.player.careerStats.cleanSheets ?? 0) + 1;
      }
      const faced = this.player.stats.shotsFaced ?? shotsFaced;
      this.player.stats.savePercentage = faced
        ? round(((this.player.stats.saves ?? 0) / faced) * 100, 1)
        : 0;
    }
  }

  applyPerformanceDevelopment(rating) {
    if (this.player.isLegend || !Number.isFinite(rating)) return;
    ensurePlayStyles(this.player);
    const focus = String(this.trainingFocus ?? "").toLowerCase();
    const focusCategory =
      focus.includes("pass") ||
      focus.includes("vision") ||
      focus.includes("cross")
        ? "passing"
        : focus.includes("drib") ||
            focus.includes("ball") ||
            focus.includes("agility")
          ? "dribbling"
          : focus.includes("tackle") ||
              focus.includes("intercept") ||
              focus.includes("defend")
            ? "defending"
            : focus.includes("shot") || focus.includes("finish")
              ? "shooting"
              : this.player.position === "GK"
                ? "goalkeeping"
                : "physical";
    this.player.playStyles.trainingProgress ??= {};
    this.player.playStyles.trainingProgress[focusCategory] =
      (this.player.playStyles.trainingProgress[focusCategory] ?? 0) + 0.35;
    awardPlayStyleEvidence(
      this.player,
      {
        [focusCategory]:
          this.player.playStyles.trainingProgress[focusCategory] +
          Math.max(0, rating - 6.5) * 0.35,
      },
      { season: this.season, age: this.player.age ?? 25 },
    );
    this.player.lastMatchRating = rating;
    this.player.performanceDevelopmentProgress =
      this.performanceDevelopmentProgress;
    const performanceProgress =
      Number(this.player.performanceDevelopmentProgress ?? 0) +
      clamp((rating - 6.4) * 0.025, -0.04, 0.04);
    this.player.performanceDevelopmentProgress = performanceProgress;
    if (Math.abs(performanceProgress) >= 1) {
      const attributes =
        this.player.position === "GK"
          ? this.player.gkAttrs
          : this.player.subAttrs;
      const attribute = normalizedTrainingFocus(
        this.trainingFocus,
        this.player.position,
      );
      const direction = Math.sign(performanceProgress);
      if (
        attributes?.[attribute] != null &&
        (direction < 0 ||
          calculateOverall(this.player) < (this.player.potential ?? 99))
      ) {
        attributes[attribute] = clamp(attributes[attribute] + direction, 1, 99);
        if (this.player.position !== "GK")
          syncGroupsFromSubAttrs(this.player, [SUB_ATTRIBUTE_GROUP[attribute]]);
        updatePlayerOverall(this.player, "Match performance development", {
          season: this.season,
        });
        this.player.performanceDevelopmentProgress -= direction;
      }
    }
  }

  recordPlayerMatchHistory(match, performance) {
    if (!performance.played) return;
    this.appendPlayerMatchHistory(
      this.player,
      match,
      {
        starts: performance.stats.started !== false,
        minutes: performance.minutes ?? 0,
        goals: performance.stats.goals ?? 0,
        assists: performance.stats.assists ?? 0,
        rating: performance.rating,
      },
      match.side,
    );
  }

  appendPlayerMatchHistory(player, match, performance, playingSide = null) {
    const homeGoals = match.homeGoals;
    const awayGoals = match.awayGoals;
    const side =
      playingSide ?? (match.home.clubId === player.clubId ? "home" : "away");
    const userGoals = side === "home" ? homeGoals : awayGoals;
    const opponentGoals = side === "home" ? awayGoals : homeGoals;
    const opponent = match[side === "home" ? "away" : "home"].name;
    const history = (player.matchHistory ??= []);
    const isChampionsLeague = !!match.uefaFixtureId;
    const uefaFixture = isChampionsLeague
      ? [
          ...(this.championsLeague?.leaguePhase?.fixtures ?? []),
          ...["roundOf16", "quarterFinals", "semiFinals"].flatMap((round) =>
            (this.championsLeague?.knockout?.[round] ?? []).flatMap((tie) => [
              tie.firstLeg,
              tie.secondLeg,
            ]),
          ),
          this.championsLeague?.knockout?.final,
        ]
          .filter(Boolean)
          .find((fixture) => fixture.id === match.uefaFixtureId)
      : null;
    history.push({
      season: this.season,
      dateIndex: match.dayIndex,
      competitionId: isChampionsLeague
        ? "champions-league"
        : (match.competitionId ?? this.league.id),
      competition: isChampionsLeague
        ? "UEFA Champions League"
        : (match.competitionName ?? this.league.name),
      club: match[side].name,
      opponent,
      homeGoals,
      awayGoals,
      result:
        userGoals > opponentGoals ? "W" : userGoals < opponentGoals ? "L" : "D",
      starts: performance.starts,
      minutes: performance.minutes,
      goals: performance.goals,
      assists: performance.assists,
      rating: performance.rating,
      stage: uefaFixture?.stage ?? null,
    });
  }

  releaseScheduledGoals(match, minute) {
    const simulation = this.matchSimulation;
    const scheduled = match.scheduledGoalEvents ?? [];
    match.appliedIncidentIndexes ??= [];
    for (const [index, event] of (match.misc ?? []).entries()) {
      if (match.appliedIncidentIndexes.includes(index) || event.minute > minute)
        continue;
      this.applyMatchIncident(match, event);
      match.appliedIncidentIndexes.push(index);
    }
    this.runCoachSubstitutions(match, minute);
    while (simulation.releasedGoalCount < scheduled.length) {
      const event = scheduled[simulation.releasedGoalCount];
      if (event.minute > minute) break;
      match.events.push(event);
      if (event.side === "home") match.homeGoals++;
      else match.awayGoals++;
      simulation.lastGoalEvent = event;
      simulation.releasedGoalCount++;
    }
  }

  runCoachSubstitutions(match, minute) {
    const windows = [65, 78];
    const simulation = this.matchSimulation;
    simulation.coachSubstitutionWindow ??= 0;
    while (
      simulation.coachSubstitutionWindow < windows.length &&
      minute >= windows[simulation.coachSubstitutionWindow]
    ) {
      const substitutionMinute = windows[simulation.coachSubstitutionWindow++];
      for (const sideName of ["home", "away"]) {
        const side = match[sideName];
        if (!side || (side.substitutionsUsed ?? 0) >= 5) continue;
        const players = side.xi
          .map((id) => this.players.find((player) => player.id === id))
          .filter(
            (player) =>
              player &&
              player.position !== "GK" &&
              !(match.worldCupFixtureId && player.id === this.player.id),
          );
        const averageOverall = players.length
          ? players.reduce(
              (total, player) => total + calculateOverall(player),
              0,
            ) / players.length
          : 60;
        const teamGoals =
          sideName === "home" ? match.homeGoals : match.awayGoals;
        const opponentGoals =
          sideName === "home" ? match.awayGoals : match.homeGoals;
        const candidates = players
          .map((player) => {
            const slot =
              side.xiSlots?.find((entry) => entry.id === player.id)?.slot ??
              player.position;
            const substitute = this.bestSubstituteForSlot(side, slot);
            if (!substitute) return null;
            const rating =
              player.id === this.player.id
                ? (match.playerResult.rating ?? 6.5)
                : 6.4 +
                  (calculateOverall(player) - averageOverall) * 0.02 +
                  (teamGoals > opponentGoals
                    ? 0.25
                    : teamGoals === opponentGoals
                      ? 0.05
                      : -0.15);
            const fatigue = player.fatigue ?? 0;
            return {
              player,
              rating: rating - Math.max(0, fatigue - 60) * 0.01,
              fatigue,
              slot,
              substitute,
            };
          })
          .filter(Boolean)
          .sort((left, right) => left.rating - right.rating);
        const candidate = candidates[0];
        if (
          !candidate ||
          (candidate.rating >= (substitutionMinute === 65 ? 6.15 : 6.4) &&
            candidate.fatigue < 75 &&
            !(teamGoals < opponentGoals && substitutionMinute === 78))
        ) {
          continue;
        }
        this.removePlayerFromMatch(match, candidate.player, {
          type: "coachSub",
          minute: substitutionMinute,
        });
      }
    }
  }

  addLiveGoal(match, side, scorer = this.player, assister = null) {
    const event = {
      type: "goal",
      minute: this.matchSimulation.minute,
      side,
      scorerId: scorer.id,
      scorerName: `${scorer.first} ${scorer.last}`,
      assistId: assister?.id ?? null,
      assistName: assister ? `${assister.first} ${assister.last}` : null,
      penalty: false,
      ownGoal: false,
      keyMoment: true,
    };
    match.events.push(event);
    if (side === "home") match.homeGoals++;
    else match.awayGoals++;
    this.matchSimulation.lastGoalEvent = event;
    return event;
  }

  rollMatchSituation(match) {
    if (
      !this.matchSimulation?.userOnPitch ||
      !match[match.side]?.xi?.includes(this.player.id)
    )
      return null;
    const rng = this.rng.stream("match-situations");
    if (!rng.chance(0.035)) return null;
    const available = MATCH_SITUATIONS.filter(
      (situation) =>
        !situation.once || !this.usedSituationIds.includes(situation.id),
    );
    if (!available.length)
      throw new Error("No match situations remain available.");
    const situation = rng.pick(available);
    if (situation.once) this.usedSituationIds.push(situation.id);
    match.situations ??= [];
    const effect =
      situation.id.endsWith("1") ||
      situation.id.endsWith("4") ||
      situation.id.endsWith("7")
        ? 0.1
        : situation.id.endsWith("2") ||
            situation.id.endsWith("5") ||
            situation.id.endsWith("8")
          ? -0.1
          : 0;
    if (effect) {
      match.playerResult.rating = round(
        clamp(match.playerResult.rating + effect, RATING_MIN, RATING_MAX),
        1,
      );
    }
    const event = {
      id: situation.id,
      minute: this.matchSimulation.minute + 1,
      text: situation.text,
      effect,
    };
    match.situations.push(event);
    return event;
  }

  /**
   * Decide how much the career player features in an upcoming match, before the
   * player-match engine runs. A trusted regular starts and plays the full match; a
   * fringe player (low manager trust) is named as a substitute and gets a late
   * run-out. `minutes` drives the player engine, and the entrance minute is stored
   * so the live sim can bring him on and announce it.
   */
  getPlayerMatchSelection(dayIndex = this.currentDay()) {
    const squad = this.players.filter((player) =>
      this.club.squad.includes(player.id),
    );
    const lineup = selectLineup(squad, this.club.formation, dayIndex, {
      customXI: this.club.customXI ?? [],
    });
    const starter = lineup.xi.find(
      (entry) => entry.player.id === this.player.id,
    );
    const substitute = lineup.subs.find(
      (player) => player.id === this.player.id,
    );
    const unavailable =
      !this.club.squad.includes(this.player.id) ||
      Boolean(this.player.injury) ||
      (this.player.suspensionWeeks ?? 0) > 0 ||
      this.worldCupUnavailableIds?.has(this.player.id) ||
      this.player.requestedPlayingTime === "less";
    return {
      dayIndex,
      lineup,
      starter: unavailable ? null : (starter ?? null),
      substitute: unavailable ? null : (substitute ?? null),
      status: unavailable
        ? "not-selected"
        : starter
          ? "starter"
          : substitute
            ? "bench"
            : "not-selected",
    };
  }

  matchInvolvement(dayIndex = null) {
    if (!Number.isFinite(dayIndex)) {
      const roundIndex = this.league.fixtureWeeks.indexOf(this.week);
      dayIndex =
        roundIndex >= 0
          ? this.fixtureDayFor(this.league, roundIndex)
          : this.currentDay();
    }
    const selection = this.getPlayerMatchSelection(dayIndex);
    if (selection.status === "starter") {
      return {
        starts: true,
        namedOnBench: false,
        minutes: 90,
        subOnMinute: null,
        position: selection.starter.slot,
      };
    }
    if (selection.status !== "bench") {
      return {
        starts: false,
        namedOnBench: false,
        minutes: 0,
        subOnMinute: null,
      };
    }

    const trust = this.player.trusting?.manager ?? 50;
    const formation = FORMATIONS[this.club.formation] ?? FORMATIONS["4-3-3"];
    const naturalPosition = normalizePosition(this.player.position);
    const naturalAlternative = selection.lineup.xi.find(
      (entry) => normalizePosition(entry.slot) === naturalPosition,
    );
    const benchOnly = {
      starts: false,
      namedOnBench: true,
      minutes: 0,
      subOnMinute: null,
      position: naturalPosition,
    };
    if (!naturalAlternative || trust < 25 || (this.player.overall ?? 60) < 50)
      return benchOnly;
    const alternative = naturalAlternative.player;
    const userRating = effectiveRating(this.player, naturalPosition, {
      dayIndex,
    });
    const alternativeRating = effectiveRating(alternative, naturalPosition, {
      dayIndex,
    });
    const isBetterOption = userRating >= alternativeRating - 3;
    const cameoCandidate = userRating >= alternativeRating - 30;
    if (this.player.requestedPlayingTime === "more") {
      return {
        starts: false,
        namedOnBench: true,
        minutes: 25,
        subOnMinute: 65,
        outgoingPlayerId: alternative.id,
        position: naturalPosition,
      };
    }

    const tiredIncumbent = (alternative.fatigue ?? 0) >= 35;
    const likelyComfortableMatch =
      this.club.prestige - alternative.overall >= 8 ||
      this.player.trusting?.fans >= 75;
    const cameo = cameoCandidate && !tiredIncumbent && !likelyComfortableMatch;
    if (!isBetterOption && !tiredIncumbent && !likelyComfortableMatch && !cameo)
      return benchOnly;
    const subOnMinute = tiredIncumbent
      ? 55
      : isBetterOption
        ? 65
        : cameo
          ? 46
          : 75;
    return {
      starts: false,
      namedOnBench: true,
      minutes: 90 - subOnMinute,
      subOnMinute,
      outgoingPlayerId: alternative.id,
      position: naturalPosition,
    };
  }

  /**
   * Translate the pending involvement decision into the live-sim on-pitch fields:
   *   userStarted      - true if he was in the XI at kick-off
   *   userOnPitch      - true while he is actually playing
   *   userEnteredPitch - true once he has come on as a substitute
   *   userStatus       - "starter" | "bench" | "on" | "off" | "unused"
   *   subOnMinute      - minute he is scheduled to enter the pitch (bench only)
   */
  playerMatchRole(match, side) {
    const involvement = this._pendingInvolvement ?? this.matchInvolvement();
    this._pendingInvolvement = null;
    const sideData = match[side];
    const selectedAtKickoff =
      sideData?.xi?.includes(this.player.id) &&
      sideData.xiSlots?.some((entry) => entry.id === this.player.id);
    if (involvement.starts && selectedAtKickoff) {
      return {
        userStarted: true,
        userOnPitch: true,
        userEnteredPitch: false,
        userStatus: "starter",
        subOnMinute: null,
        substituteForPlayerId: null,
      };
    }
    if (involvement.minutes <= 0) {
      if (match.playerResult) {
        match.playerResult.played = false;
        match.playerResult.minutes = 0;
        match.playerResult.rating = null;
        match.playerResult.stats.started = false;
        match.playerResult.keyMoments = [];
      }
      return {
        userStarted: false,
        userOnPitch: false,
        userEnteredPitch: false,
        userStatus: sideData?.subs?.includes(this.player.id)
          ? "unused"
          : "not-selected",
        subOnMinute: null,
        substituteForPlayerId: null,
      };
    }
    const hasNaturalSlot = (match[side]?.xiSlots ?? []).some(
      (entry) =>
        normalizePosition(entry.slot) ===
        normalizePosition(this.player.position),
    );
    if (!hasNaturalSlot) {
      match.playerResult.played = false;
      match.playerResult.minutes = 0;
      match.playerResult.keyMoments = [];
      return {
        userStarted: false,
        userOnPitch: false,
        userEnteredPitch: false,
        userStatus: "unused",
        subOnMinute: null,
        substituteForPlayerId: null,
      };
    }
    // Key moments that fall before he enters the pitch can't involve a player still
    // on the bench, so they are dropped at role time; the live sim auto-resolves any
    // that remain stranded once the clock passes them.
    if (involvement.subOnMinute != null) {
      match.playerResult.keyMoments = (
        match.playerResult.keyMoments ?? []
      ).filter((moment) => moment.minute >= involvement.subOnMinute);
    }
    return {
      userStarted: false,
      userOnPitch: false,
      userEnteredPitch: false,
      userStatus: "bench",
      subOnMinute: involvement.subOnMinute,
      substituteForPlayerId: involvement.outgoingPlayerId ?? null,
    };
  }

  /**
   * Choose the bench player who best covers a given pitch slot in the live match.
   * Preference order: a natural specialist in that exact position, then a player who
   * can play it as an alternative role, then the best available player by how well he
   * performs out of position. This keeps a substitute faithful to the slot he fills
   * instead of dropping a centre-back onto the wing.
   */
  bestSubstituteForSlot(side, slot, dayIndex = 0) {
    const onPitch = new Set(side.xi ?? []);
    const bench = (side.subs ?? [])
      .filter((id) => !onPitch.has(id))
      .map((id) => this.players.find((player) => player.id === id))
      .filter((player) => player && !player.injury);
    if (!bench.length) return null;
    const target = normalizePosition(slot);
    const specialists = bench.filter(
      (player) =>
        normalizePosition(player.position) === target ||
        (player.altPositions ?? []).map(normalizePosition).includes(target),
    );
    return (
      specialists.sort(
        (left, right) =>
          effectiveRating(right, target, { dayIndex }) -
          effectiveRating(left, target, { dayIndex }),
      )[0] ?? null
    );
  }

  /**
   * Put a player on the pitch in place of `offPlayerId`, keeping him in the correct
   * position. He takes the vacated slot when it suits him; otherwise he is handed the
   * team's best-fitting empty slot so the shape still reads correctly. Both `xi` and
   * `xiSlots` are updated together so the live pitch view and the engine agree.
   */
  placePlayerOnPitch(side, player, offPlayerId) {
    if (!side || !player) return null;
    side.xiSlots ??= (side.xi ?? []).map((id) => ({ slot: null, id }));

    const previousSlots = side.xiSlots;
    const slotOf = (id) =>
      previousSlots.find((entry) => entry.id === id)?.slot ??
      normalizePosition(
        this.players.find((entry) => entry.id === id)?.position ?? "CM",
      );

    // A substitute keeps his registered position. If that slot is occupied, the live
    // display may contain overlapping roles rather than silently converting the player.
    const inheritedSlot = normalizePosition(player.position);
    const occupantOfNaturalSlot = side.xiSlots.find(
      (entry) =>
        entry.id !== player.id &&
        normalizePosition(entry.slot) === inheritedSlot,
    )?.id;
    const displacedId = offPlayerId ?? occupantOfNaturalSlot;

    // Rebuild the XI so the incoming player takes the outgoing player's place exactly
    // once. Any earlier, stale listing of the incoming player — the engine can force a
    // bench player into the starting XI — is removed rather than left alongside it.
    const nextXI = [];
    for (const id of side.xi) {
      if (id === displacedId) nextXI.push(player.id);
      else if (id !== player.id) nextXI.push(id);
    }
    if (!nextXI.includes(player.id)) nextXI.push(player.id);
    side.xi = nextXI;

    // Give every XI player exactly one slot; the incoming player holds the vacated one.
    side.xiSlots = side.xi.map((id) => ({
      slot: id === player.id ? inheritedSlot : slotOf(id),
      id,
    }));
    return inheritedSlot;
  }

  /**
   * Bring the career player on as a substitute. Called by the match tick once the
   * clock reaches his scheduled entrance; flips the on-pitch flags and records the
   * moment so the UI can announce it. He replaces the teammate whose slot best suits
   * his position and inherits that slot, so he lines up where he actually belongs.
   */
  bringPlayerOn(match) {
    const simulation = this.matchSimulation;
    if (!simulation || simulation.userOnPitch || simulation.userSubbedOff)
      return null;
    const side = match[match.side];
    const userPos = normalizePosition(this.player.position);
    // A player only enters if a natural-role XI slot is available, and may never
    // inherit an unrelated role from the outgoing teammate.
    const alreadyFielded = side?.xi?.includes(this.player.id);
    let outgoing = null;
    if (alreadyFielded) {
      const currentSlot = normalizePosition(
        side.xiSlots?.find((entry) => entry.id === this.player.id)?.slot ??
          userPos,
      );
      if (currentSlot === userPos) {
        side.xiSlots = side.xi.map((id) => ({
          slot:
            id === this.player.id
              ? userPos
              : (side.xiSlots?.find((entry) => entry.id === id)?.slot ??
                normalizePosition(
                  this.players.find((entry) => entry.id === id)?.position ??
                    "CM",
                )),
          id,
        }));
      } else {
        const wrongRoleId = this.player.id;
        const replacement = side.xiSlots?.find(
          (entry) =>
            normalizePosition(entry.slot) === userPos &&
            entry.id !== wrongRoleId,
        );
        if (!replacement) {
          simulation.userOnPitch = false;
          simulation.userEnteredPitch = false;
          simulation.userStatus = "unused";
          return null;
        }
        const replacementPlayer = this.players.find(
          (player) => player.id === replacement.id,
        );
        side.xi = side.xi.map((id) =>
          id === wrongRoleId
            ? replacement.id
            : id === replacement.id
              ? wrongRoleId
              : id,
        );
        side.xiSlots = side.xiSlots.map((entry) => ({
          ...entry,
          id:
            entry.id === wrongRoleId
              ? replacement.id
              : entry.id === replacement.id
                ? wrongRoleId
                : entry.id,
        }));
        side.subs = (side.subs ?? []).filter(
          (id) => id !== this.player.id && id !== replacement.id,
        );
        outgoing = { id: replacement.id, player: replacementPlayer };
      }
    } else {
      // Keep the best player in the XI until a planned late/fatigue substitution.
      const preferredOutgoingId =
        simulation.substituteForPlayerId ?? simulation.outgoingPlayerId;
      outgoing =
        (side?.xi ?? [])
          .map((id) => ({
            id,
            slot: side.xiSlots?.find((entry) => entry.id === id)?.slot ?? null,
            player: this.players.find((entry) => entry.id === id),
          }))
          .filter(
            (entry) =>
              entry.player &&
              normalizePosition(entry.slot ?? entry.player.position) ===
                userPos,
          )
          .sort((left, right) => {
            if (left.id === preferredOutgoingId) return -1;
            if (right.id === preferredOutgoingId) return 1;
            return (
              effectiveRating(right.player, userPos) -
              effectiveRating(left.player, userPos)
            );
          })[0] ?? null;
      if (!outgoing) {
        simulation.userOnPitch = false;
        simulation.userEnteredPitch = false;
        simulation.userStatus = "unused";
        simulation.subOnMinute = null;
        return null;
      }
      this.placePlayerOnPitch(side, this.player, outgoing.id);
      side.substitutionsUsed = (side.substitutionsUsed ?? 0) + 1;
      side.subs = (side.subs ?? []).filter((id) => id !== this.player.id);
    }
    simulation.userOnPitch = true;
    simulation.userEnteredPitch = true;
    simulation.userStatus = "on";
    simulation.enteredPitchMinute = simulation.minute;
    const event = {
      type: "situation",
      minute: simulation.minute,
      text: `${this.player.first} ${this.player.last} enters the pitch.`,
      entry: true,
    };
    match.situations ??= [];
    match.situations.push(event);
    // Also record the substitution as a first-class match event for the timeline.
    match.misc ??= [];
    match.misc.push({
      type: "sub",
      minute: simulation.minute,
      side: match.side,
      playerId: this.player.id,
      playerName: `${this.player.first} ${this.player.last}`,
      on: true,
      replacedId: outgoing?.id ?? null,
      replacedName: outgoing?.player
        ? `${outgoing.player.first} ${outgoing.player.last}`
        : null,
    });
    if (!this.isManagerCareer)
      this.news.push(
        `${this.player.first} ${this.player.last} comes on in the ${simulation.minute}th minute.`,
      );
    return event;
  }

  substitutePlayer() {
    const match = this.lastReport?.userMatch;
    const simulation = this.matchSimulation;
    if (
      !match ||
      !simulation ||
      !["running", "paused"].includes(simulation.status)
    ) {
      throw new Error(
        "You can only request a substitution during a live match.",
      );
    }
    if (!simulation.userOnPitch)
      throw new Error("Your player is not on the pitch to be substituted.");
    if (simulation.minute < 45)
      throw new Error("Substitutions are available from the 45th minute.");
    if (simulation.userSubbedOff)
      throw new Error("You have already been substituted.");
    if (match.playerResult.rating > 5.8)
      throw new Error(
        "Your match rating is not low enough to request a substitution.",
      );
    const side = match[match.side];
    const playerIndex = side.xi.indexOf(this.player.id);
    if (
      playerIndex < 0 ||
      !side.xiSlots?.some((entry) => entry.id === this.player.id)
    ) {
      throw new Error("Your player is not currently on the pitch.");
    }
    simulation.userOnPitch = true;
    // Bring on the bench player who actually covers the slot you are leaving, so the
    // replacement keeps the team's shape rather than the first name on the bench.
    const vacatedSlot =
      side.xiSlots?.find((item) => item.id === this.player.id)?.slot ??
      normalizePosition(this.player.position);
    const substitute = this.bestSubstituteForSlot(side, vacatedSlot);
    if (!substitute)
      throw new Error("There is no available substitute for your position.");
    this.placePlayerOnPitch(side, substitute, this.player.id);
    side.substitutionsUsed = (side.substitutionsUsed ?? 0) + 1;
    side.subs = (side.subs ?? []).filter((id) => id !== substitute.id);
    for (const event of (match.scheduledGoalEvents ?? []).slice(
      simulation.releasedGoalCount,
    )) {
      if (event.scorerId === this.player.id) {
        event.scorerId = substitute.id;
        event.scorerName = `${substitute.first} ${substitute.last}`;
      }
      if (event.assistId === this.player.id) {
        event.assistId = substitute.id;
        event.assistName = `${substitute.first} ${substitute.last}`;
      }
    }
    substitute.squadStatus = "First Team";
    const playedShare =
      simulation.minute / Math.max(1, match.playerResult.minutes);
    match.playerResult.minutes = simulation.minute;
    for (const [stat, value] of Object.entries(match.playerResult.stats)) {
      if (!["goals", "assists", "ratingSum"].includes(stat)) {
        match.playerResult.stats[stat] = Math.round(value * playedShare);
      }
    }
    match.playerResult.stats.subs = (match.playerResult.stats.subs ?? 0) + 1;
    match.playerResult.keyMoments.forEach((moment) => {
      if (!moment.resolved)
        moment.resolved = {
          success: false,
          probability: 0,
          action: { label: "Substituted" },
          subbedOff: true,
        };
    });
    simulation.activeMomentIndex = null;
    simulation.userSubbedOff = true;
    simulation.userOnPitch = false;
    simulation.userStatus = "off";
    simulation.substituteName = `${substitute.first} ${substitute.last}`;
    simulation.status = "running";
    match.misc ??= [];
    match.misc.push({
      type: "sub",
      minute: simulation.minute,
      side: match.side,
      playerId: this.player.id,
      playerName: `${this.player.first} ${this.player.last}`,
      off: true,
      replacementId: substitute.id,
      replacedBy: simulation.substituteName,
    });
    if (!this.isManagerCareer)
      this.news.push(
        `${this.player.first} ${this.player.last} was substituted for ${simulation.substituteName} in the ${simulation.minute}th minute.`,
      );
    return {
      substituted: true,
      minute: simulation.minute,
      substitute: simulation.substituteName,
    };
  }

  finishWorldCupUserMatch(match) {
    const tournament = this.worldCup.tournament;
    const fixture = tournament?.fixtures.find(
      (entry) => entry.id === match.worldCupFixtureId,
    );
    if (!fixture || fixture.status === "completed")
      throw new Error("The World Cup fixture is no longer available.");
    const result = match.playerResult;
    result.stats.goals = match.events.filter(
      (event) => event.type === "goal" && event.scorerId === this.player.id,
    ).length;
    result.stats.assists = match.events.filter(
      (event) => event.type === "goal" && event.assistId === this.player.id,
    ).length;
    const home = tournament.qualified.find(
      (team) => team.id === fixture.homeId,
    );
    const away = tournament.qualified.find(
      (team) => team.id === fixture.awayId,
    );
    if (!home || !away)
      throw new Error(`Missing World Cup team in fixture ${fixture.id}.`);
    const homeTeam = this.buildInternationalTeam(home, { refresh: false });
    const awayTeam = this.buildInternationalTeam(away, { refresh: false });
    const knockout = fixture.stage !== "group";
    if (match.homeGoals === match.awayGoals && match.penalties?.winner) {
      match.winnerId =
        match.penalties.winner === "home" ? homeTeam.club.id : awayTeam.club.id;
    }
    this.recordInternationalMatch(match, homeTeam, awayTeam, {
      worldCup: true,
      knockout,
    });
    Object.assign(fixture, {
      status: "completed",
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      stats: match.stats,
      penalties: match.penalties ?? null,
      decidedBy: match.decidedBy ?? null,
    });
    if (knockout) {
      const winnerId =
        match.homeGoals === match.awayGoals
          ? match.penalties?.winner === "home"
            ? home.id
            : match.penalties?.winner === "away"
              ? away.id
              : null
          : match.homeGoals > match.awayGoals
            ? home.id
            : away.id;
      if (!winnerId)
        throw new Error(`Knockout fixture ${fixture.id} has no winner.`);
      fixture.winnerId = winnerId;
      if (fixture.round === "Final") {
        tournament.winnerId = winnerId;
        tournament.runnerUpId = winnerId === home.id ? away.id : home.id;
        tournament.winner = tournament.qualified.find(
          (team) => team.id === winnerId,
        )?.name;
        tournament.runnerUp = tournament.qualified.find(
          (team) => team.id === tournament.runnerUpId,
        )?.name;
      }
      if (fixture.round === "Third-place playoff")
        tournament.thirdPlaceId = winnerId;
    } else {
      const group = tournament.groups.find(
        (entry) => entry.id === fixture.groupId,
      );
      if (!group)
        throw new Error(`Missing World Cup group in fixture ${fixture.id}.`);
      updateInternationalTable(group.table, fixture);
    }
    const reportFixture = match.worldCupFixtureRecord;
    Object.assign(reportFixture, {
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      stats: match.stats,
      pending: false,
    });
    this.progressWorldCupFixtures(tournament, this.currentDay());
    this.refreshWorldCupCalendar(tournament);
    this.lastReport.headlines.push(
      `${home.name} ${match.homeGoals}\u2013${match.awayGoals} ${away.name} \u00B7 FIFA World Cup full time`,
    );
    this.news.push(
      `${home.name} ${match.homeGoals}\u2013${match.awayGoals} ${away.name} \u00B7 FIFA World Cup full time.`,
    );
    this.matchSimulation.finalized = true;
    this.matchSimulation.status = "finished";
    this.seasonComplete = this.areAllSeasonCompetitionsComplete();
    if (this.seasonComplete) this.recordSeasonAwards();
  }

  finishMatchSimulation() {
    const match = this.lastReport?.userMatch;
    if (!match) return;
    // Full time is a terminal state: a moment that was not reached or was left
    // behind by an older save must not remain visibly pending forever.
    for (const moment of match.playerResult?.keyMoments ?? []) {
      if (!moment.resolved) {
        moment.resolved = {
          success: false,
          probability: 0,
          action: { label: "Full time" },
        };
      }
    }
    if (this.matchSimulation?.finalized) return;
    this.releaseScheduledGoals(match, Number.POSITIVE_INFINITY);
    for (const side of ["home", "away"]) {
      const stats = match.stats?.[side];
      if (!stats) continue;
      const additionalGoals = match[`${side}Goals`] - stats.goals;
      stats.goals = match[`${side}Goals`];
      if (additionalGoals > 0) {
        stats.shots += additionalGoals;
        stats.shotsOnTarget += additionalGoals;
      }
    }
    if (match.worldCupFixtureId) {
      this.finishWorldCupUserMatch(match);
      return;
    }
    const result = match.playerResult;
    const objective =
      (this.data.objectives ?? []).find(
        (entry) => entry.title === match.objective,
      ) ?? null;
    // A player who never took the pitch has no objectives to grade this match.
    match.objectiveComplete =
      result.played && objective
        ? this.completeObjective(objective, result)
        : false;
    match.objectiveAwarded = match.objectiveAwarded && result.played;
    if (match.objectiveComplete && !match.objectiveAwarded) {
      this.objectivesCompletedSeason =
        (this.objectivesCompletedSeason ?? 0) + 1;
      this.player.trusting.manager = clamp(
        this.player.trusting.manager + 3,
        0,
        100,
      );
      match.objectiveAwarded = true;
    }
    if (this.player.position === "GK") {
      const conceded =
        match.side === "home" ? match.awayGoals : match.homeGoals;
      result.stats.goalsConceded = conceded;
      result.stats.cleanSheets = conceded === 0 ? 1 : 0;
    }
    result.stats.goals = match.events.filter(
      (event) => event.type === "goal" && event.scorerId === this.player.id,
    ).length;
    result.stats.assists = match.events.filter(
      (event) => event.type === "goal" && event.assistId === this.player.id,
    ).length;
    this.applyPlayerResult(result, match, match.side);
    this.recordPlayerMatchHistory(match, result);
    match.teammateRatings = this.recordLeaguePlayerStats(match, {
      league: !match.uefaFixtureId,
    });
    if (result.played) {
      const progression = this.data.careerSettings.training;
      this.player.trusting.manager = clamp(
        this.player.trusting.manager + (result.rating >= 7 ? 2 : -1),
        0,
        100,
      );
      this.player.morale = clamp(
        this.player.morale + (result.rating >= 7 ? 3 : -2),
        0,
        100,
      );
      this.player.fatigue = clamp(
        this.player.fatigue + progression.matchFatigue,
        0,
        100,
      );
      applyMatchStamina(
        this.player,
        result.minutes ?? this.matchSimulation?.minute ?? 90,
        1,
      );
      this.player.form = clamp(
        this.player.form + (result.rating - 6.5) * 2,
        0,
        100,
      );
      const finance = this.data.careerSettings.finance;
      this.creditMoney(
        finance.appearanceBonus + result.stats.goals * finance.goalBonus,
        "Match bonuses",
      );
      const homeClub = this.clubs.find(
        (club) => club.id === (match.home.clubId ?? match.home.id),
      );
      const awayClub = this.clubs.find(
        (club) => club.id === (match.away.clubId ?? match.away.id),
      );
      if (homeClub && awayClub) {
        processMatchdayRevenue(homeClub, awayClub, {
          date: this.currentDay(),
          competition: "league",
          importance: 1,
          resultKey: `matchday-${this.season}-${this.week}-${homeClub.id}-${awayClub.id}`,
          outcome:
            (result.homeGoals ?? result.home?.goals ?? 0) >
            (result.awayGoals ?? result.away?.goals ?? 0)
              ? "W"
              : (result.homeGoals ?? result.home?.goals ?? 0) ===
                  (result.awayGoals ?? result.away?.goals ?? 0)
                ? "D"
                : "L",
        });
      }
    }

    this.updateFanReaction(match, result);
    if (match.uefaFixtureId) {
      const uefaFixtures = [
        ...(this.championsLeague?.leaguePhase?.fixtures ?? []),
        ...["roundOf16", "quarterFinals", "semiFinals"].flatMap((round) =>
          (this.championsLeague?.knockout?.[round] ?? []).flatMap((tie) => [
            tie.firstLeg,
            tie.secondLeg,
          ]),
        ),
        this.championsLeague?.knockout?.final,
      ].filter(Boolean);
      const uefaFixture = uefaFixtures.find(
        (fixture) => fixture.id === match.uefaFixtureId,
      );
      const isLeaguePhase = (
        this.championsLeague?.leaguePhase?.fixtures ?? []
      ).includes(uefaFixture);
      const isKnockout = !!uefaFixture && !isLeaguePhase;
      const participated =
        result.played &&
        (result.minutes ??
          match.playerResult?.minutes ??
          this.matchSimulation?.minute ??
          0) > 0;
      recordChampionsLeagueFixture(this.championsLeague, match.uefaFixtureId, {
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        stats: match.stats,
        playerStats: [
          {
            id: this.player.id,
            clubId: this.player.clubId,
            name: `${this.player.first} ${this.player.last}`,
            club: this.club.name,
            position: this.player.position,
            apps: participated ? 1 : 0,
            goals: participated ? result.stats.goals : 0,
            assists: participated ? result.stats.assists : 0,
            ratingSum: participated ? result.rating : 0,
            knockoutApps: isKnockout ? 1 : 0,
            knockoutGoals: isKnockout ? result.stats.goals : 0,
            knockoutAssists: isKnockout ? result.stats.assists : 0,
            knockoutRatingSum: isKnockout ? result.rating : 0,
          },
        ],
        winnerId:
          match.homeGoals === match.awayGoals && match.penalties?.winner
            ? match.penalties.winner === "home"
              ? uefaFixture.homeId
              : uefaFixture.awayId
            : match.homeGoals > match.awayGoals
              ? uefaFixture.homeId
              : uefaFixture.awayId,
      });
      this.simulateChampionsLeagueWeek(this.week);
      if (
        this.championsLeague?.season === this.season &&
        this.championsLeague.status !== "complete" &&
        !this.isChampionsLeagueClub(this.club.id)
      ) {
        this.completeChampionsLeagueIfDue();
      }
    } else {
      this.league.table.record(
        match.home.clubId,
        match.away.clubId,
        match.homeGoals,
        match.awayGoals,
      );
    }
    const userOutcome =
      match.homeGoals > match.awayGoals
        ? "W"
        : match.homeGoals === match.awayGoals
          ? "D"
          : "L";
    const homeClub = this.clubs.find((club) => club.id === match.home.clubId);
    const awayClub = this.clubs.find((club) => club.id === match.away.clubId);
    if (homeClub && awayClub) {
      recordCoachMatch(homeClub, userOutcome);
      recordCoachMatch(
        awayClub,
        userOutcome === "W" ? "L" : userOutcome === "L" ? "W" : "D",
      );
    }
    this.recordManagerResult(match);
    for (const record of this.lastReport.fixtures ?? []) {
      if (record.userMatch && record.week === this.lastReport.week) {
        record.homeGoals = match.homeGoals;
        record.awayGoals = match.awayGoals;
        record.stats = match.stats;
        record.pending = false;
        this.results.push(record);
        this.recordClubMatchHistory(
          record,
          match.home.clubId,
          match.away.clubId,
        );
        const fixture = this.league.fixtures[record.roundIndex]?.find(
          (entry) =>
            entry.home === match.home.clubId &&
            entry.away === match.away.clubId,
        );
        if (fixture) {
          fixture.played = true;
          fixture.status = "completed";
          fixture.result = {
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
          };
        }
      }
    }
    this.lastReport.tablePosition = this.league.table
      .positions()
      .get(this.club.id);
    this.lastReport.headlines.push(
      `${this.club.name} ${match.homeGoals}–${match.awayGoals} ${match.away.name} · full time`,
    );
    // In a manager career there is no human player to rate, so the final score is the
    // only thing worth an inbox item. The neutral placeholder player is not named.
    this.news.push(
      this.isManagerCareer
        ? `${match.home.name} ${match.homeGoals}–${match.awayGoals} ${match.away.name} · full time.`
        : `${match.home.name} ${match.homeGoals}–${match.awayGoals} ${match.away.name} · ${this.player.first} ${this.player.last} rated ${formatDecimal(result.rating)}.`,
    );
    this.seasonComplete = this.areAllSeasonCompetitionsComplete();
    if (this.seasonComplete) this.recordSeasonAwards();
    this.matchSimulation.finalized = true;
    this.matchSimulation.status = "finished";
  }

  applyMatchIncident(match, event, { live = true } = {}) {
    const player = this.players.find((entry) => entry.id === event.playerId);
    if (!player) return;
    if (
      live &&
      ["injury", "red", "yellow", "foul"].includes(event.type) &&
      !match.home.xi.includes(player.id) &&
      !match.away.xi.includes(player.id)
    ) {
      return;
    }
    player.careerStats ??= { ...player.stats };
    if (event.type === "injury") {
      // Durations come from the one injury catalogue, so a knock is always short and a
      // serious injury always long, wherever the injury was suffered.
      const injury = {
        ...createInjury(
          event.severity,
          this.rng.stream("injuries"),
          event.minute,
        ),
      };
      const existing = player.injury;
      if (existing && (existing.weeks ?? 0) > injury.weeks) {
        injury.weeks = existing.weeks;
        injury.type = existing.type ?? injury.type;
        injury.label = existing.label ?? injury.label;
      }
      player.injury = injury;
      if (player.id === this.player.id) {
        this.news.push(
          `${player.first} ${player.last} is injured (${injurySeverityLabel(injury.type).toLowerCase()}, out for ${injury.weeks} week${injury.weeks === 1 ? "" : "s"}).`,
        );
      }
    } else if (event.type === "red") {
      // A straight red carries a heavier ban than a second-yellow dismissal.
      const redWeeks = event.description === "Second yellow" ? 1 : 3;
      player.suspensionWeeks = Math.max(player.suspensionWeeks ?? 0, redWeeks);
      player.stats.redCards++;
      player.careerStats.redCards++;
      if (player.id === this.player.id && match.playerResult?.stats)
        match.playerResult.stats.redCards++;
    } else if (event.type === "yellow") {
      player.stats.yellowCards++;
      player.careerStats.yellowCards++;
      if (player.id === this.player.id && match.playerResult?.stats)
        match.playerResult.stats.yellowCards++;
      // Two bookings in the same match is a sending-off, as in real football.
      const yellowsThisMatch = (match.misc ?? []).filter(
        (entry) =>
          entry.type === "yellow" &&
          entry.playerId === player.id &&
          (match.appliedIncidentIndexes ?? []).includes(
            (match.misc ?? []).indexOf(entry),
          ),
      ).length;
      if (yellowsThisMatch >= 2) {
        const redEvent = {
          ...event,
          type: "red",
          description: "Second yellow",
        };
        return this.applyMatchIncident(match, redEvent, { live });
      }
      // Five accumulated yellows trigger a one-match ban, like most real leagues.
      player.yellowCardCount ??= 0;
      player.yellowCardCount++;
      if (player.yellowCardCount >= 5) {
        player.yellowCardCount = 0;
        player.suspensionWeeks = Math.max(player.suspensionWeeks ?? 0, 1);
        if (player.id === this.player.id)
          this.news.push(
            `${player.first} ${player.last} is suspended for one match after a fifth booking.`,
          );
      }
    } else if (event.type === "foul" && player.id === this.player.id) {
      match.playerResult.stats.foulsCommitted++;
    }
    if (live && (event.type === "injury" || event.type === "red")) {
      this.removePlayerFromMatch(match, player, event);
    }
  }

  removePlayerFromMatch(match, player, event) {
    const sideName = match.home.xi.includes(player.id)
      ? "home"
      : match.away.xi.includes(player.id)
        ? "away"
        : null;
    if (!sideName) return;
    const side = match[sideName];
    const playerIndex = side.xi.indexOf(player.id);
    // An injury replacement covers the injured player's slot specifically, so the
    // defence or attack is not left a man short in the wrong part of the pitch.
    const vacatedSlot =
      side.xiSlots?.find((entry) => entry.id === player.id)?.slot ??
      normalizePosition(player.position);
    const substitute = ["injury", "coachSub"].includes(event.type)
      ? this.bestSubstituteForSlot(side, vacatedSlot)
      : null;
    if (substitute) {
      this.placePlayerOnPitch(side, substitute, player.id);
      substitute.squadStatus = "First Team";
      side.substitutionsUsed = (side.substitutionsUsed ?? 0) + 1;
      side.subs = (side.subs ?? []).filter((id) => id !== substitute.id);
      match.misc ??= [];
      match.misc.push({
        type: "sub",
        minute: event.minute,
        side: sideName,
        playerId: player.id,
        playerName: `${player.first} ${player.last}`,
        off: true,
        replacementId: substitute.id,
        replacedBy: `${substitute.first} ${substitute.last}`,
      });
    } else {
      side.xi.splice(playerIndex, 1);
      side.xiSlots = side.xiSlots?.filter((entry) => entry.id !== player.id);
    }
    const replacement =
      substitute ??
      side.xi
        .map((id) => this.players.find((entry) => entry.id === id))
        .filter((entry) => entry && entry.position !== "GK")
        .sort((left, right) => (right.overall ?? 60) - (left.overall ?? 60))[0];
    for (const goal of (match.scheduledGoalEvents ?? []).slice(
      this.matchSimulation?.releasedGoalCount ?? 0,
    )) {
      if (goal.scorerId === player.id && replacement) {
        goal.scorerId = replacement.id;
        goal.scorerName = `${replacement.first} ${replacement.last}`;
      }
      if (goal.assistId === player.id && replacement) {
        goal.assistId = replacement.id;
        goal.assistName = `${replacement.first} ${replacement.last}`;
      }
    }
    if (player.id !== this.player.id) return;
    const performance = match.playerResult;
    const playedShare = event.minute / Math.max(1, performance.minutes);
    performance.minutes = event.minute;
    for (const [stat, value] of Object.entries(performance.stats)) {
      if (
        !["goals", "assists", "ratingSum", "yellowCards", "redCards"].includes(
          stat,
        )
      ) {
        performance.stats[stat] = Math.round(value * playedShare);
      }
    }
    performance.keyMoments.forEach((moment) => {
      if (!moment.resolved) {
        moment.resolved = {
          success: false,
          probability: 0,
          action: {
            label:
              event.type === "red"
                ? "Sent off"
                : event.type === "coachSub"
                  ? "Substituted"
                  : "Injured",
          },
          subbedOff: true,
        };
      }
    });
    this.matchSimulation.activeMomentIndex = null;
    this.matchSimulation.userSubbedOff = true;
    this.matchSimulation.userOnPitch = false;
    this.matchSimulation.userStatus = "off";
    this.matchSimulation.substituteName = substitute
      ? `${substitute.first} ${substitute.last}`
      : event.type === "red"
        ? "sent off"
        : event.type === "coachSub"
          ? "substituted"
          : "injured";
    this.matchSimulation.status = "running";
    if (!this.isManagerCareer)
      this.news.push(
        event.type === "red"
          ? `${this.player.first} ${this.player.last} was sent off in the ${event.minute}th minute.`
          : event.type === "coachSub"
            ? `${this.player.first} ${this.player.last} was substituted in the ${event.minute}th minute.`
            : `${this.player.first} ${this.player.last} was injured in the ${event.minute}th minute.`,
      );
  }

  recordLeaguePlayerStats(match, { league = true } = {}) {
    const events = match.events ?? [];
    for (const player of this.players) {
      if (player && !player.stats) player.stats = emptyStats();
      if (player && !player.careerStats)
        player.careerStats = { ...player.stats };
    }
    const knownPlayers = [
      ...this.players,
      ...(this.championsLeague?.leaguePhaseTeams ?? []).flatMap(
        (team) => team.roster ?? [],
      ),
    ];
    const playerGoals = new Map();
    const playerAssists = new Map();
    for (const event of events) {
      if (event.type !== "goal") continue;
      if (event.scorerId) {
        playerGoals.set(
          event.scorerId,
          (playerGoals.get(event.scorerId) ?? 0) + 1,
        );
        const scorer = knownPlayers.find(
          (player) => player.id === event.scorerId,
        );
        if (!scorer)
          throw new Error(`Unknown goalscorer in match: ${event.scorerId}`);
        scorer.careerStats ??= { ...scorer.stats };
        if (league) scorer.leagueGoals = (scorer.leagueGoals ?? 0) + 1;
        if (scorer.id !== this.player.id && this.players.includes(scorer)) {
          scorer.stats.goals++;
          scorer.careerStats.goals++;
        }
      }
      if (event.assistId) {
        playerAssists.set(
          event.assistId,
          (playerAssists.get(event.assistId) ?? 0) + 1,
        );
        const assister = knownPlayers.find(
          (player) => player.id === event.assistId,
        );
        if (!assister)
          throw new Error(`Unknown assister in match: ${event.assistId}`);
        assister.careerStats ??= { ...assister.stats };
        if (league) assister.leagueAssists = (assister.leagueAssists ?? 0) + 1;
        if (assister.id !== this.player.id && this.players.includes(assister)) {
          assister.stats.assists++;
          assister.careerStats.assists++;
        }
      }
    }

    const teamRatings = [];
    for (const side of ["home", "away"]) {
      const team = match[side];
      const startingIds = team.startingXI ?? team.xi;
      const participantIds = new Set([...startingIds, ...team.xi]);
      for (const event of match.misc ?? []) {
        if (event.side !== side || event.type !== "sub") continue;
        if (event.on) participantIds.add(event.playerId);
        else {
          participantIds.add(event.playerId);
          if (event.replacementId) participantIds.add(event.replacementId);
        }
      }
      const players = [...participantIds]
        .map((id) => this.players.find((player) => player.id === id))
        .filter(Boolean);
      const averageOverall =
        players.reduce((total, player) => total + calculateOverall(player), 0) /
        Math.max(1, players.length);
      const teamGoals = side === "home" ? match.homeGoals : match.awayGoals;
      const opponentGoals = side === "home" ? match.awayGoals : match.homeGoals;
      // Goalkeeping statistics belong to the goalkeeper on the pitch for this side,
      // never to an outfielder who happened to make a block.
      const sideKeeper = players.find(
        (player) => (player.position ?? "").toUpperCase() === "GK",
      );
      for (const player of players) {
        player.careerStats ??= { ...player.stats };
        const rating =
          player.id === this.player.id && match.playerResult?.rating != null
            ? match.playerResult.rating
            : player.lastMatchPerformance?.rating != null &&
                player.lastMatchWeek === this.week
              ? player.lastMatchPerformance.rating
              : round(
                  clamp(
                    (primeProfileFor(player)?.averageRating ?? 6.4) +
                      (calculateOverall(player) - averageOverall) * 0.02 +
                      (teamGoals > opponentGoals
                        ? 0.25
                        : teamGoals === opponentGoals
                          ? 0.05
                          : -0.15) +
                      (playerGoals.get(player.id) ?? 0) * 0.75 +
                      (playerAssists.get(player.id) ?? 0) * 0.4,
                    RATING_MIN,
                    RATING_MAX,
                  ),
                  1,
                );
        player.lastMatchRating = rating;
        player.lastMatchWeek = this.week;
        const exitIncident = (match.misc ?? []).find(
          (event) =>
            event.side === side &&
            event.playerId === player.id &&
            (["injury", "red"].includes(event.type) ||
              (event.type === "sub" && event.off)),
        );
        const entryIncident = (match.misc ?? []).find(
          (event) =>
            event.side === side &&
            event.type === "sub" &&
            (event.on
              ? event.playerId === player.id
              : event.replacementId === player.id),
        );
        const minutes = exitIncident
          ? exitIncident.minute
          : entryIncident
            ? 90 - entryIncident.minute
            : 90;
        const started = startingIds.includes(player.id);
        if (player.id !== this.player.id) {
          applyMatchStamina(player, minutes, 1);
          player.stats.apps++;
          if (started) player.stats.starts++;
          player.stats.minutes += minutes;
          player.stats.ratingSum += rating;
          player.careerStats.apps++;
          if (started) player.careerStats.starts++;
          player.careerStats.minutes += minutes;
          player.careerStats.ratingSum += rating;
          this.appendPlayerMatchHistory(
            player,
            match,
            {
              starts: started,
              minutes,
              goals: playerGoals.get(player.id) ?? 0,
              assists: playerAssists.get(player.id) ?? 0,
              rating,
            },
            side,
          );
        }
        if (league) {
          player.leaguePerformance ??= { apps: 0, ratingSum: 0 };
          player.leaguePerformance.apps++;
          player.leaguePerformance.ratingSum += rating;
        }
        // Goalkeeping statistics belong to the goalkeeper on the pitch for this side,
        // never to an outfielder who happened to make a block. They are recorded for
        // both sides: an NPC keeper's save record is what the league table and the
        // awards race are judged on.
        if (player.position === "GK" && sideKeeper?.id === player.id) {
          player.stats ??= emptyStats();
          player.careerStats ??= emptyStats();
          const goalsConceded = Math.max(0, Math.round(Number(opponentGoals) || 0));
          // Shots on target are at least the goals conceded; the keeper's quality
          // decides the rest, so a strong keeper is not left on a 0% save rate.
          const saveFactor = goalkeeperSaveFactor(player.gkAttrs, {
            kind: "shotStopping",
            overall: player.overall,
          });
          // A league match sees roughly 3-7 shots on target against a side; the keeper's
          // quality decides how many he keeps out. The volume is derived from the fixture
          // and the keeper, so the same career replays identically without touching the RNG.
          const shotsFaced = Math.max(
            goalsConceded,
            Math.round(Number(performance.shotsFaced) || 0) ||
              3 +
                Math.round(
                  hashString(
                    `${player.id}:${match.id ?? match.week ?? ""}:${goalsConceded}`,
                  ) % 4,
                ) +
                (goalsConceded > 0 ? 1 : 0),
          );
          const saves = Math.min(
            Math.max(0, shotsFaced - goalsConceded),
            Math.round(shotsFaced * saveFactor),
          );
          player.stats.saves = (player.stats.saves ?? 0) + saves;
          player.careerStats.saves = (player.careerStats.saves ?? 0) + saves;
          player.stats.shotsFaced = (player.stats.shotsFaced ?? 0) + shotsFaced;
          player.careerStats.shotsFaced =
            (player.careerStats.shotsFaced ?? 0) + shotsFaced;
          player.stats.goalsConceded =
            (player.stats.goalsConceded ?? 0) + goalsConceded;
          player.careerStats.goalsConceded =
            (player.careerStats.goalsConceded ?? 0) + goalsConceded;
          if (goalsConceded === 0) {
            player.stats.cleanSheets = (player.stats.cleanSheets ?? 0) + 1;
            player.careerStats.cleanSheets =
              (player.careerStats.cleanSheets ?? 0) + 1;
          }
          const faced = player.stats.shotsFaced ?? shotsFaced;
          player.stats.savePercentage = faced
            ? round(((player.stats.saves ?? 0) / faced) * 100, 1)
            : 0;
        }
        if (side === match.side && player.id !== this.player.id) {
          teamRatings.push({
            id: player.id,
            name: `${player.first} ${player.last}`,
            position: player.position,
            rating,
          });
        }
      }
    }
    return teamRatings.sort((left, right) => right.rating - left.rating);
  }

  pickObjective() {
    const objectives = this.data.objectives ?? [];
    if (!objectives.length)
      return {
        id: "rating",
        title: "Earn a match rating of 7.0",
        type: "rating",
        target: 7,
      };
    return this.rng.stream("objectives").pick(objectives);
  }

  completeObjective(objective, performance) {
    if (!performance.played) return false;
    if (objective.type === "rating")
      return performance.rating >= objective.target;
    if (objective.type === "passes") {
      const accuracy = performance.stats.passes
        ? performance.stats.passesCompleted / performance.stats.passes
        : 0;
      return accuracy >= objective.target;
    }
    if (objective.type === "goalContribution")
      return performance.stats.goals + performance.stats.assists > 0;
    return false;
  }

  resolveKeyMoment(index, decision) {
    const match = this.lastReport?.userMatch;
    if (!match) throw new Error("There is no player match to resolve.");
    const moment = match.playerResult.keyMoments[index];
    if (!moment) throw new Error(`Unknown key moment: ${index}`);
    if (moment.resolved)
      throw new Error("That key moment has already been resolved.");
    if (this.matchSimulation?.activeMomentIndex !== index) {
      throw new Error(
        "Advance the match clock to this key moment before resolving it.",
      );
    }
    if (
      !this.matchSimulation?.userOnPitch ||
      !match[match.side]?.xi?.includes(this.player.id)
    ) {
      throw new Error("You must be on the pitch to resolve a key moment.");
    }
    const resolution = resolveMomentDecision(
      this.player,
      moment,
      decision,
      this.rng.stream("player-moments"),
      this.data.keyMomentOptions,
      moment.position ?? this.player.position,
    );
    moment.resolved = resolution;
    this.matchSimulation.activeMomentIndex = null;
    this.matchSimulation.status = "running";
    const performance = match.playerResult;
    const rng = this.rng.stream("player-moments");
    const attackingSide = match.side;
    const attackingMoment = ["chance", "penalty", "oneOnOne"].includes(
      moment.kind,
    );
    const effect = resolution.action.effect;
    const teammates = match[attackingSide].xi
      .map((id) => this.players.find((player) => player.id === id))
      .filter(
        (player) =>
          player && player.id !== this.player.id && player.position !== "GK",
      )
      .sort(
        (a, b) =>
          (b.tendencies?.goalThreat ?? b.attrs.shooting) -
          (a.tendencies?.goalThreat ?? a.attrs.shooting),
      );
    const blockUpcomingGoal = () => {
      const upcomingGoals = match.scheduledGoalEvents ?? [];
      const blockedIndex = upcomingGoals.findIndex(
        (event, index) =>
          index >= this.matchSimulation.releasedGoalCount &&
          event.side !== match.side,
      );
      if (blockedIndex < 0) return false;
      const [blocked] = upcomingGoals.splice(blockedIndex, 1);
      resolution.blockedGoal = blocked.scorerName;
      return true;
    };
    if (attackingMoment && effect === "layoff") {
      if (resolution.success) {
        performance.stats.passes++;
        performance.stats.passesCompleted++;
        performance.stats.keyPasses++;
        const scorer = teammates[0];
        const keeperQuality = moment.opposingKeeperQuality ?? 60;
        const conversion = clamp(
          0.18 +
            ((scorer?.attrs.shooting ?? 60) - 60) * 0.006 +
            (75 - keeperQuality) * 0.004,
          0.08,
          0.48,
        );
        if (scorer && rng.chance(conversion)) {
          this.addLiveGoal(match, attackingSide, scorer, this.player);
          performance.stats.assists++;
          resolution.goal = true;
        }
      } else {
        performance.stats.passes++;
      }
    } else if (attackingMoment && effect === "shot") {
      performance.stats.shots++;
      if (resolution.success) {
        performance.stats.shotsOnTarget++;
        performance.stats.goals++;
        this.addLiveGoal(match, attackingSide);
        resolution.goal = true;
      }
    } else if (effect === "save") {
      if (resolution.success) {
        performance.stats.saves++;
        blockUpcomingGoal();
      } else {
        const opposingSide = attackingSide === "home" ? "away" : "home";
        const attackers = match[opposingSide].xi
          .map((id) => this.players.find((player) => player.id === id))
          .filter((player) => player && player.position !== "GK")
          .sort(
            (a, b) =>
              (b.tendencies?.goalThreat ?? b.attrs.shooting) -
              (a.tendencies?.goalThreat ?? a.attrs.shooting),
          );
        if (attackers[0]) this.addLiveGoal(match, opposingSide, attackers[0]);
      }
    } else if (moment.kind === "bigPass" && effect === "pass") {
      performance.stats.passes++;
      if (resolution.success) {
        performance.stats.passesCompleted++;
        performance.stats.keyPasses++;
        const scorer = teammates[0];
        const keeperQuality = moment.opposingKeeperQuality ?? 60;
        const conversion = clamp(
          0.2 +
            ((scorer?.attrs.shooting ?? 60) - 60) * 0.006 +
            (75 - keeperQuality) * 0.004,
          0.08,
          0.48,
        );
        if (scorer && rng.chance(conversion)) {
          this.addLiveGoal(match, attackingSide, scorer, this.player);
          performance.stats.assists++;
          resolution.goal = true;
        }
      }
    } else if (["tackle", "interception", "block", "clear"].includes(effect)) {
      if (effect === "tackle") {
        performance.stats.tackles++;
        if (resolution.success) performance.stats.tacklesWon++;
      } else if (effect === "interception") {
        if (resolution.success) performance.stats.interceptions++;
      } else if (effect === "clear" && resolution.success) {
        performance.stats.aerials++;
        performance.stats.aerialsWon++;
      }
      if (resolution.success) {
        blockUpcomingGoal();
      }
    }

    const previousRating = performance.rating;
    const ratingChange =
      (resolution.success ? 0.25 : -0.15) + (resolution.goal ? 0.75 : 0);
    performance.rating = round(
      clamp(previousRating + ratingChange, RATING_MIN, RATING_MAX),
      1,
    );
    this.player.trusting.manager = clamp(
      this.player.trusting.manager + (resolution.success ? 1 : -1),
      0,
      100,
    );
    return resolution;
  }

  advanceMatchSimulation() {
    const match = this.lastReport?.userMatch;
    if (!match) throw new Error("There is no player match to simulate.");
    if (!this.matchSimulation) {
      this.matchSimulation = {
        minute: 0,
        activeMomentIndex: null,
        status: "ready",
      };
    }
    if (this.matchSimulation.status === "finished") {
      throw new Error("This match has already reached full time.");
    }
    if (this.matchSimulation.activeMomentIndex != null) {
      throw new Error(
        "Resolve the current key moment before continuing the match.",
      );
    }

    // Moments scheduled before the user enters the pitch can never involve him; auto-
    // resolve them as missed so they cannot strand the match once the clock passes them.
    const entryMinute = this.matchSimulation.subOnMinute ?? 0;
    for (const moment of match.playerResult.keyMoments) {
      if (!moment.resolved && moment.minute < entryMinute) {
        moment.resolved = {
          success: false,
          probability: 0,
          action: { label: "On the bench" },
        };
      }
    }
    const onBench =
      !this.matchSimulation.userOnPitch &&
      !this.matchSimulation.userEnteredPitch;
    const moments =
      onBench || this.matchSimulation.userSubbedOff
        ? []
        : match.playerResult.keyMoments;
    const nextIndex = moments.findIndex(
      (moment) =>
        !moment.resolved && moment.minute >= this.matchSimulation.minute,
    );
    // Do not surface moments while the career player is absent; simulation advances
    // to the scheduled entry point, then searches the remaining moments on-pitch.
    if (
      this.matchSimulation.subOnMinute != null &&
      onBench &&
      !this.matchSimulation.userEnteredPitch &&
      !this.matchSimulation.userSubbedOff
    ) {
      this.matchSimulation.minute = this.matchSimulation.subOnMinute;
      this.bringPlayerOn(match);
      if (this.matchSimulation.userOnPitch)
        return this.advanceMatchSimulation();
    }
    if (nextIndex >= 0) {
      const moment = moments[nextIndex];
      this.matchSimulation.minute = moment.minute;
      this.releaseScheduledGoals(match, this.matchSimulation.minute);
      if (moment.resolved) {
        this.matchSimulation.activeMomentIndex = null;
        this.matchSimulation.status = "running";
        return {
          status: "running",
          minute: this.matchSimulation.minute,
          momentIndex: null,
        };
      }
      this.matchSimulation.activeMomentIndex = nextIndex;
      this.matchSimulation.status = "paused";
      return {
        status: "paused",
        minute: this.matchSimulation.minute,
        momentIndex: nextIndex,
      };
    }

    const fullTimeMinute = 90 + Math.max(0, Number(match.addedTime) || 0);
    this.matchSimulation.minute = fullTimeMinute;
    this.releaseScheduledGoals(match, fullTimeMinute);
    this.matchSimulation.status = "finished";
    this.finishMatchSimulation();
    return { status: "finished", minute: fullTimeMinute, momentIndex: null };
  }

  startMatchSimulation() {
    if (!this.lastReport?.userMatch)
      throw new Error("There is no player match to simulate.");
    if (this.matchSimulation?.status === "finished")
      throw new Error("This match has already reached full time.");
    if (this.matchSimulation?.status === "paused")
      throw new Error("Resolve the current key moment before continuing.");
    this.matchSimulation ??= {
      minute: 0,
      activeMomentIndex: null,
      status: "ready",
    };
    this.matchSimulation.status = "running";
  }

  finishLiveMatchForSimulation() {
    const match = this.lastReport?.userMatch;
    if (!match) return;
    if (!this.matchSimulation) this.startMatchSimulation();
    let steps = 0;
    while (this.matchSimulation.status !== "finished" && steps++ < 1000) {
      if (this.matchSimulation.status === "ready") {
        this.startMatchSimulation();
        continue;
      }
      if (this.matchSimulation.status === "paused") {
        const index = this.matchSimulation.activeMomentIndex;
        const canResolve =
          index != null &&
          this.matchSimulation.userOnPitch &&
          match[match.side]?.xi?.includes(this.player?.id);
        if (canResolve) {
          this.resolveKeyMoment(index, "play-safe");
        } else {
          const moment = match.playerResult?.keyMoments?.[index];
          if (moment && !moment.resolved) {
            moment.resolved = {
              success: false,
              probability: 0,
              action: { label: "Full time" },
            };
          }
          this.matchSimulation.activeMomentIndex = null;
          this.matchSimulation.status = "running";
        }
        continue;
      }
      this.advanceMatchSimulation();
    }
    if (this.matchSimulation.status !== "finished") {
      throw new Error("The live match could not be completed safely.");
    }
  }

  tickMatchSimulation() {
    const match = this.lastReport?.userMatch;
    if (
      !match ||
      !this.matchSimulation ||
      this.matchSimulation.status !== "running"
    )
      return this.matchSimulation;

    const fullTimeMinute = 90 + Math.max(0, Number(match.addedTime) || 0);
    const nextMinute = Math.min(
      fullTimeMinute,
      this.matchSimulation.minute + 1,
    );
    // Bring an eligible substitute on before checking this minute's key moments.
    const entering =
      !this.matchSimulation.userOnPitch &&
      !this.matchSimulation.userEnteredPitch &&
      this.matchSimulation.subOnMinute != null &&
      nextMinute >= this.matchSimulation.subOnMinute;
    if (entering) {
      const event = this.bringPlayerOn(match);
      if (event)
        this.matchSimulation.lastSituation = {
          minute: event.minute,
          text: event.text,
          entry: true,
        };
    }
    // A bench player enters the pitch the moment the clock passes his scheduled minute.
    const incident = this.rollMatchSituation(match);
    if (incident) this.matchSimulation.lastSituation = incident;
    const onBench =
      !this.matchSimulation.userOnPitch &&
      !this.matchSimulation.userEnteredPitch;
    const moments =
      onBench || this.matchSimulation.userSubbedOff
        ? []
        : match.playerResult.keyMoments;
    const nextIndex = moments.findIndex(
      (moment) => !moment.resolved && moment.minute <= nextMinute,
    );
    if (nextIndex >= 0) {
      const moment = match.playerResult.keyMoments[nextIndex];
      this.matchSimulation.minute = moment.minute;
      this.releaseScheduledGoals(match, moment.minute);
      if (moment.resolved) {
        this.matchSimulation.activeMomentIndex = null;
        this.matchSimulation.status = "running";
      } else {
        this.matchSimulation.activeMomentIndex = nextIndex;
        this.matchSimulation.status = "paused";
      }
    } else {
      this.matchSimulation.minute = nextMinute;
      this.releaseScheduledGoals(match, nextMinute);
      if (nextMinute >= fullTimeMinute) {
        this.matchSimulation.status = "finished";
        this.finishMatchSimulation();
      }
    }
    return this.matchSimulation;
  }

  setTrainingFocus(attribute = this.trainingFocus) {
    if (this.isManagerCareer)
      throw new Error(
        "Only player-career mode can set an individual player focus.",
      );
    const isGoalkeeperAttribute =
      normalizePosition(this.player.position) === "GK" &&
      TRAINABLE_GK_ATTRIBUTES.has(attribute);
    const isSubAttribute =
      normalizePosition(this.player.position) !== "GK" &&
      TRAINABLE_SUB_ATTRIBUTES.has(attribute);
    if (!isGoalkeeperAttribute && !isSubAttribute)
      throw new Error(`Unsupported training attribute: ${attribute}`);
    this.trainingFocus = attribute;
    this.player.trainingFocus = attribute;
    const training = ensureClubTraining(this.club, this.seed, this.season);
    training.playerPlans[this.player.id] = {
      ...(training.playerPlans[this.player.id] ?? {}),
      focus: attribute,
    };
    return {
      selected: true,
      attribute,
      overall: calculateOverall(this.player),
    };
  }

  setDeveloperMode(enabled) {
    this.developerMode = Boolean(enabled);
    return this.developerMode;
  }

  setPlayerAttribute(attribute, value) {
    if (!this.developerMode)
      throw new Error(
        "Enable developer mode before editing player attributes.",
      );
    const supportedAttributes =
      this.player.position === "GK"
        ? [...ATTRIBUTES, ...GOALKEEPER_ATTRIBUTES]
        : ATTRIBUTES;
    if (!supportedAttributes.includes(attribute))
      throw new Error(`Unsupported player attribute: ${attribute}`);
    if (!Number.isInteger(value) || value < 1 || value > 99)
      throw new Error("Player attributes must be whole numbers from 1 to 99.");
    if (!this.developerMode)
      throw new Error(
        "Enable developer mode before editing player attributes.",
      );

    if (GOALKEEPER_ATTRIBUTES.includes(attribute)) {
      this.player.gkAttrs[attribute] = value;
    } else {
      this.player.attrs[attribute] = value;
      if (this.player.subAttrs && SUB_ATTRIBUTES[attribute]) {
        for (const sub of SUB_ATTRIBUTES[attribute])
          this.player.subAttrs[sub] = value;
      }
    }
    updatePlayerOverall(this.player, "Attribute edit", {
      season: this.season,
      attributes: { [attribute]: value },
      ceiling: this.player.potential ?? 99,
    });
    return { attribute, value, overall: this.player.overall };
  }

  setPlayerShirtNumber(number) {
    if (!Number.isInteger(number) || number < 1 || number > 99)
      throw new Error("Shirt number must be a whole number from 1 to 99.");
    const occupied = this.club.squad
      .filter((playerId) => playerId !== this.player.id)
      .map((playerId) => this.players.find((player) => player.id === playerId))
      .some((player) => player?.shirtNumber === number);
    if (occupied)
      throw new Error(
        `Shirt number ${number} is already in use at ${this.club.name}.`,
      );
    this.player.shirtNumber = number;
    return number;
  }

  /**
   * Retire the oldest players in the user's league and promote a generated youngster in
   * each vacated squad slot, so squads never empty out and the world keeps refreshing.
   * A player hangs up his boots at 34+ once his decline has set in, or hard at 38.
   */
  retireAndReplaceLeaguePlayers() {
    const finalDay =
      this.calendar.at(-1)?.matchday ?? toDayIndex(this.season, 12, 31);
    const rng = this.rng.stream("retirement");
    const retiring = [];
    for (const player of this.players) {
      if (player.isUser || player.isLegend || !player.clubId) continue;
      const years = ageOn(player.dob, finalDay);
      const overall = calculateOverall(player);
      // Older, fading players retire; a hard ceiling at 38 keeps even stars moving on.
      const faded = years >= 34 && (player.developmentProgress ?? 0) <= 0;
      if (years >= 38 || (faded && rng.chance((years - 33) / 6)))
        retiring.push(player);
    }
    for (const player of retiring) {
      const club = this.clubs.find((entry) => entry.id === player.clubId);
      club?.removePlayer(player.id);
      const index = this.players.indexOf(player);
      if (index >= 0) this.players.splice(index, 1);
      if (club)
        this.players.push(
          this.generateReplacementPlayer(club, player.position),
        );
      const tracking = (this.populationTracking ??= {
        seasonIntroduced: {},
        retired: {},
      });
      tracking.retired[this.season] = (tracking.retired[this.season] ?? 0) + 1;
      this.news.push(
        `${player.first} ${player.last} has retired at ${ageOn(player.dob, finalDay)}.`,
      );
    }
    this.ensureSquadSizes();
    return retiring.length;
  }

  ensureSquadSizes() {
    for (const club of this.clubs ?? []) {
      ensureSquadRegistration(club, this.players);
      while (club.squad.length < 20) {
        const position = ["GK", "CB", "CM", "ST"][club.squad.length % 4];
        const replacement = this.generateReplacementPlayer(club, position);
        this.players.push(replacement);
        ensureSquadRegistration(club, this.players);
      }
    }
  }

  /** A fresh academy graduate to fill a retired player's position at a club. */
  generateReplacementPlayer(club, position) {
    const rng = this.rng.stream(`regen-${club.id}-${this.season}-${position}`);
    // Random nationality (mostly home-grown) with a name drawn from that nation's pool.
    const nationality = this.pickNationality(
      rng,
      club.nation ?? this.data.league.nation,
    );
    const { first, last } = this.nameForNationality(rng, nationality);
    const roll = rng.int(1, 100);
    const target =
      this.season <= 1
        ? clamp(Math.round(70 + rng.int(0, 14) + club.prestige * 0.02), 70, 84)
        : roll <= 70
          ? rng.int(55, 70)
          : roll <= 90
            ? rng.int(71, 75)
            : rng.int(76, 80);
    const generated = generateAttributes(rng, position, target);
    const body = physicalProfileFor(rng, position);
    const age =
      this.season <= 1
        ? rng.int(16, 34)
        : roll <= 88
          ? rng.int(16, 21)
          : rng.int(22, 24);
    const player = createPlayer({
      id: `regen-${club.id}-${this.season}-${position}-${rng.int(1000, 9999)}`,
      first,
      last,
      nationality,
      dob: toDayIndex(this.season - age, rng.int(1, 12), rng.int(1, 28)),
      position,
      archetype: this.pickArchetypeForPosition(rng, position),
      height: body.height,
      weight: body.weight,
      attrs: generated.attrs,
      subAttrs: generated.subAttrs,
      gkAttrs: generated.gkAttrs,
      potential: clamp(target + rng.int(6, 18), target, 97),
      clubId: club.id,
      squadStatus: "Prospect",
      source: "generated",
      contract: { wage: Math.round(Math.max(800, club.wageBudget / 120)) },
      value: target >= 76 ? target * 250000 : target * 120000,
    });
    club.addPlayer(player.id);
    const tracking = (this.populationTracking ??= {
      seasonIntroduced: {},
      retired: {},
    });
    tracking.seasonIntroduced[this.season] =
      (tracking.seasonIntroduced[this.season] ?? 0) + 1;
    return player;
  }

  playerPopulationStats() {
    const players = [
      ...(this.players ?? []),
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
    ];
    const unique = new Map();
    for (const player of players) unique.set(player.id, player);
    let generated = 0;
    let real = 0;
    for (const player of unique.values()) {
      if (
        player.source === "generated" ||
        player.source?.startsWith?.("generated-") ||
        player.source === "npc"
      )
        generated++;
      else if (
        player.source === "real-world" ||
        player.source?.startsWith?.("fc26")
      )
        real++;
      else real++;
    }
    const total = unique.size;
    const tracking = (this.populationTracking ??= {
      seasonIntroduced: {},
      retired: {},
    });
    return {
      total,
      real,
      generated,
      generatedPercentage: total ? (generated / total) * 100 : 0,
      introducedThisSeason: tracking.seasonIntroduced?.[this.season] ?? 0,
      retiredThisSeason: tracking.retired?.[this.season] ?? 0,
    };
  }

  developLeaguePlayers() {
    const finalDay =
      this.calendar.at(-1)?.matchday ?? toDayIndex(this.season, 12, 31);
    for (const club of this.clubs) {
      const clubPlayers = this.players.filter(
        (player) => player.clubId === club.id,
      );
      for (const player of clubPlayers) {
        if (player.isLegend) continue;
        player.age = ageOn(player.dob, finalDay);
        const report = developPlayer(
          player,
          club,
          this.rng.stream(`development-${this.season}-${player.id}`),
          this.season,
          {
            appearances: player.stats?.apps ?? 0,
            minutes: player.stats?.minutes ?? 0,
            ratingSum: player.stats?.ratingSum ?? 0,
            date: finalDay,
          },
        );
        player.seasonDevelopmentReport = report;
        if (report?.change >= 1 && report.change <= 7) this.news.unshift(`${player.first} ${player.last} advanced ${report.change} OVR this season (${report.reasons.join(", ")}).`);
        else if (report?.change <= -1) this.news.unshift(`${player.first} ${player.last} declined ${Math.abs(report.change)} OVR this season (${report.reasons.join(", ")}).`);
        if (report?.change >= 4 && ageOn(player.dob, finalDay) <= 21) this.news.unshift(`${player.first} ${player.last} is showing exceptional potential with ${report.change} OVR growth.`);
        if (report && !player.isUser) {
          const headCoach = ensureCoachProfile(club);
          developCoach(club, {
            playerGrowth: report.change > 0 ? 1 : report.change < 0 ? -1 : 0,
          });
          headCoach.statistics.playersDeveloped += report.change > 0 ? 1 : 0;
        }
      }
      const training = ensureClubTraining(club, this.seed, this.season);
      const youthCoach = training.coaches.find((coach) => coach.department === "youth");
      for (const prospect of club.academy?.players ?? []) {
        if (prospect.status === "academy") {
          const focusDepartment = prospect.position === "GK" ? "goalkeeper" : prospect.position === "ST" || prospect.position === "LW" || prospect.position === "RW" ? "attacking" : prospect.position === "CB" || prospect.position === "LB" || prospect.position === "RB" ? "defensive" : "midfield";
          const assigned = training.coaches.find((coach) => coach.department === focusDepartment);
          prospect.academyCoachQuality = Math.max(Number(youthCoach?.youthAbility ?? 50), Number(assigned?.overall ?? 45));
          prospect.potentialTrajectory = clamp(((Number(prospect.potentialRange?.max ?? prospect.potential ?? 50) - Number(prospect.overall ?? 40)) * 4) + prospect.academyCoachQuality * 0.2, 0, 100);
          prospect.trainingFocus = (TRAINING_DEPARTMENTS[focusDepartment] ?? [])[0] ?? (prospect.position === "GK" ? "reflexes" : "finishing");
          prospect.morale = prospect.morale ?? prospect.confidence ?? 65;
          developAcademyPlayer(
            club,
            prospect,
            this.rng.stream(`academy-season-${this.season}-${prospect.id}`),
            finalDay,
          );
        }
      }
    }
    for (const state of this.worldLeagues) {
      const entry = this.worldCareerLeagues.find(
        (candidate) => candidate.league.id === state.league.id,
      );
      for (const performer of state.performers ?? []) {
        if (performer.isLegend) continue;
        const club = this.clubs.find((item) => item.id === performer.clubId);
        if (!club) continue;
        performer.age = Number(performer.age ?? 25) + 1;
        this.ensureWorldPlayerModel(performer);
        const result = developPlayer(
          performer,
          club,
          this.rng.stream(`development-${this.season}-${performer.id}`),
          this.season,
          {
            appearances: performer.apps ?? 0,
            minutes: (performer.apps ?? 0) * 75,
            ratingSum: performer.ratingSum ?? (performer.apps ?? 0) * 6.5,
            date: finalDay,
          },
        );
        const snapshot = this.worldPlayerDevelopment[performer.id] ?? {};
        this.worldPlayerDevelopment[performer.id] = {
          ...snapshot,
          overall: performer.overall,
          age: performer.age,
          potential: performer.potential,
          developmentProgress: performer.developmentProgress,
          lastDevelopmentSeason: this.season,
        };
        if (result)
          developCoach(club, {
            playerGrowth: result.change > 0 ? 1 : result.change < 0 ? -1 : 0,
          });
      }
    }
    this.enforceGeneratedOverallLimit();
  }

  playNextScheduledMatch() {
    const next = this.getFixtureList().find((fixture) => fixture.next);
    if (!next) throw new Error("There is no upcoming fixture to play.");

    let report;
    do {
      report = this.advanceWeek();
    } while (!report.userMatch && !this.seasonComplete);
    return {
      played: !!report.userMatch,
      report,
      fixture: next,
      competition: next.competition,
    };
  }

  simulateOneWeek() {
    if (this.seasonComplete) {
      throw new Error("The season is already complete.");
    }
    this.finishLiveMatchForSimulation();

    if (
      this.lastReport?.userMatch?.playerResult?.keyMoments?.some(
        (moment) => !moment.resolved,
      )
    ) {
      throw new Error(
        "Resolve your outstanding key moments before simulating.",
      );
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error("Finish the live match before simulating the week.");
    }

    const leagueResultsBefore = this.results.length;
    const competitionResultsBefore = this.getChampionsLeagueFixtureCount();
    const completeCurrentMatchAutomatically = () => {
      this.finishLiveMatchForSimulation();
    };

    const report = this.advanceWeek();
    if (report.userMatch) completeCurrentMatchAutomatically();

    const leagueMatchesSimulated = this.results.length - leagueResultsBefore;
    const competitionMatchesSimulated =
      this.getChampionsLeagueFixtureCount() - competitionResultsBefore;
    return {
      week: this.week,
      weeksSimulated: 1,
      leagueMatchesSimulated,
      matchesSimulated: leagueMatchesSimulated + competitionMatchesSimulated,
      competitionMatchesSimulated,
      report: this.lastReport ?? report,
    };
  }

  simulateOneDay() {
    if (this.seasonComplete) {
      throw new Error("The season is already complete.");
    }
    this.finishLiveMatchForSimulation();
    if (
      this.lastReport?.userMatch?.playerResult?.keyMoments?.some(
        (moment) => !moment.resolved,
      )
    ) {
      throw new Error(
        "Resolve your outstanding key moments before simulating.",
      );
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error("Finish the live match before simulating the day.");
    }

    const firstDay = this.calendar[0]?.day ?? toDayIndex(this.season, 7, 1);
    this.dayCursor = Number.isFinite(this.dayCursor)
      ? this.dayCursor + 1
      : firstDay;
    const nextWeek = this.week + 1;
    const matchday = this.calendar[nextWeek]?.matchday;
    if (Number.isFinite(matchday) && this.dayCursor >= matchday) {
      const result = this.simulateOneWeek();
      this.dayCursor = this.calendar[this.week]?.matchday ?? this.dayCursor;
      return {
        ...result,
        dayAdvanced: 1,
        weekAdvanced: 1,
      };
    }
    return {
      week: this.week,
      weeksSimulated: 0,
      leagueMatchesSimulated: 0,
      matchesSimulated: 0,
      competitionMatchesSimulated: 0,
      dayAdvanced: 1,
      weekAdvanced: 0,
      report: {
        week: this.week,
        fixtures: [],
        userMatch: null,
        headlines: [`Day ${this.dayCursor} advanced.`],
      },
    };
  }

  simulateToSeasonEnd() {
    if (this.seasonComplete) {
      throw new Error("The season is already complete.");
    }
    this.finishLiveMatchForSimulation();
    if (
      this.lastReport?.userMatch?.playerResult?.keyMoments?.some(
        (moment) => !moment.resolved,
      )
    ) {
      throw new Error(
        "Resolve your outstanding key moments before simulating.",
      );
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error("Finish the live match before simulating the season.");
    }

    let leagueMatchesSimulated = 0;
    const competitionResultsBefore = this.getChampionsLeagueFixtureCount();
    let weeksSimulated = 0;
    const completeCurrentMatchAutomatically = () => {
      this.finishLiveMatchForSimulation();
    };

    while (!this.seasonComplete) {
      if (weeksSimulated >= this.calendar.length) {
        throw new Error("The season did not complete within its calendar.");
      }
      const report = this.advanceWeek();
      weeksSimulated += 1;
      if (report.userMatch) {
        leagueMatchesSimulated += 1;
        completeCurrentMatchAutomatically();
      }
    }

    this.player ??= this.players.find((player) => player?.id === this.playerId);
    if (this.player && !this.player.stats) this.player.stats = emptyStats();
    return {
      matchesSimulated:
        leagueMatchesSimulated +
        (this.getChampionsLeagueFixtureCount() - competitionResultsBefore),
      leagueMatchesSimulated,
      competitionMatchesSimulated:
        this.getChampionsLeagueFixtureCount() - competitionResultsBefore,
      weeksSimulated,
      season: this.season,
      playerStats: { ...(this.player?.stats ?? {}) },
      leaguePosition: this.league.table.positions().get(this.club.id),
    };
  }

  /**
   * Simulate the season up to the halfway point. Same engine as
   * `simulateToSeasonEnd`, but stops once half the scheduled matchdays have been
   * played so you can review mid-season form without committing to the full run.
   */
  simulateToHalfSeason() {
    if (this.seasonComplete) {
      throw new Error("The season is already complete.");
    }
    this.finishLiveMatchForSimulation();
    if (
      this.lastReport?.userMatch?.playerResult?.keyMoments?.some(
        (moment) => !moment.resolved,
      )
    ) {
      throw new Error(
        "Resolve your outstanding key moments before simulating.",
      );
    }
    if (this.matchSimulation && this.matchSimulation.status !== "finished") {
      throw new Error("Finish the live match before simulating the season.");
    }

    const halfway = Math.max(1, Math.ceil(this.calendar.length / 2));
    let leagueMatchesSimulated = 0;
    const competitionResultsBefore = this.getChampionsLeagueFixtureCount();
    let weeksSimulated = 0;
    const completeCurrentMatchAutomatically = () => {
      this.finishLiveMatchForSimulation();
    };

    while (!this.seasonComplete && weeksSimulated < halfway) {
      if (weeksSimulated >= this.calendar.length) {
        throw new Error("The season did not complete within its calendar.");
      }
      const report = this.advanceWeek();
      weeksSimulated += 1;
      if (report.userMatch) {
        leagueMatchesSimulated += 1;
        completeCurrentMatchAutomatically();
      }
    }

    return {
      matchesSimulated:
        leagueMatchesSimulated +
        (this.getChampionsLeagueFixtureCount() - competitionResultsBefore),
      leagueMatchesSimulated,
      competitionMatchesSimulated:
        this.getChampionsLeagueFixtureCount() - competitionResultsBefore,
      weeksSimulated,
      season: this.season,
      playerStats: { ...(this.player?.stats ?? {}) },
      leaguePosition: this.league.table.positions().get(this.club.id),
    };
  }

  getAwardRace() {
    const maxAppsByClub = new Map(
      (this.baseData.careerLeagues ?? []).flatMap((entry) =>
        entry.league.teamIds.map((clubId) => [
          clubId,
          entry.league.importedMatchesPerTeam ??
            2 * (entry.league.teamIds.length - 1),
        ]),
      ),
    );
    return awardRace(
      this.players
        .filter((player) => (player.leaguePerformance?.apps ?? 0) > 0)
        .map((player) => {
          const apps = player.leaguePerformance.apps;
          const maxApps = maxAppsByClub.get(player.clubId) ?? apps;
          const normalizedApps = Math.min(apps, maxApps);
          const ratio = apps ? normalizedApps / apps : 1;
          return {
            ...player,
            stats: {
              ...player.stats,
              apps: normalizedApps,
              ratingSum: player.leaguePerformance.ratingSum * ratio,
            },
            leagueGoals: Math.round((player.leagueGoals ?? 0) * ratio),
            leagueAssists: Math.round((player.leagueAssists ?? 0) * ratio),
          };
        }),
    );
  }

  creditMoney(amount, reason) {
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error("Money transactions must be a non-negative amount.");
    if (!amount) return;
    // Balance updates silently — no transaction log is kept any more.
    this.money += amount;
  }

  spendMoney(amount, reason) {
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error("Money transactions must be a non-negative amount.");
    if (this.money < amount) return false;
    this.money -= amount;
    return true;
  }

  hireManager(managerId) {
    if (this.isManagerCareer)
      throw new Error(
        "Manager-career club staff are controlled through the Club Office.",
      );
    const candidate = this.managerCandidates.find(
      (manager) => manager.id === managerId,
    );
    if (!candidate) throw new Error("That manager is not available.");
    if (this.hiredManagerId === candidate.id)
      throw new Error("That manager is already employed.");
    if (!this.spendMoney(candidate.cost, `Hired manager: ${candidate.name}`)) {
      throw new Error(
        `You need €${candidate.cost.toLocaleString()} to hire ${candidate.name}.`,
      );
    }
    this.club.manager = new Manager({
      id: candidate.id,
      name: candidate.name,
      nationality: this.player.nationality,
      style: candidate.style,
      rating: candidate.rating,
      formation: this.club.formation,
    });
    ensureCoachProfile(this.club);
    this.club.hierarchy.manager = {
      ...this.club.hierarchy.manager,
      id: candidate.id,
      name: candidate.name,
      nationality: this.player.nationality,
      style: candidate.style,
      rating: candidate.rating,
      overall: candidate.rating,
      role: "Manager",
    };
    ensureCoachProfile(this.club);
    this.hiredManagerId = candidate.id;
    this.news.push(
      `${candidate.name} has been hired as ${this.club.name}'s manager.`,
    );
    return candidate;
  }

  updateFanReaction(match, performance) {
    if (!performance.played || performance.rating == null) return;
    const userGoals = match[match.side === "home" ? "homeGoals" : "awayGoals"];
    const opponentGoals =
      match[match.side === "home" ? "awayGoals" : "homeGoals"];
    const result =
      userGoals > opponentGoals
        ? "win"
        : userGoals === opponentGoals
          ? "draw"
          : "loss";
    const resultImpact = result === "win" ? 3 : result === "loss" ? -3 : 0;
    const change = clamp(
      Math.round((performance.rating - 6.5) * 5 + resultImpact),
      -12,
      12,
    );
    const before = this.player.trusting.fans;
    this.player.trusting.fans = clamp(before + change, 0, 100);
    this.lastFanReaction = {
      rating: performance.rating,
      result,
      change: this.player.trusting.fans - before,
      approval: this.player.trusting.fans,
      message:
        change > 0
          ? "Supporters are encouraged by your performance."
          : change < 0
            ? "Supporters are disappointed with your performance."
            : "Supporters felt your performance was about par.",
    };
  }

  getUpcomingFanExpectation() {
    const fixture = this.getFixtureList().find((item) => item.next);
    if (!fixture) return null;
    const opponentId = fixture.userIsHome ? fixture.awayId : fixture.homeId;
    const opponent = this.clubs.find((club) => club.id === opponentId);
    if (!opponent) return null;
    const opponentPrestige = opponent.prestige ?? opponent.rating;
    if (!Number.isFinite(opponentPrestige)) return null;
    const approval = clamp(
      Math.round(
        50 +
          (this.player.trusting.fans - 50) +
          (this.club.prestige - opponentPrestige) * 0.35,
      ),
      0,
      100,
    );
    return {
      opponent: opponent.name,
      competition: fixture.competition,
      approval,
      message:
        approval >= 65
          ? "Fans expect a strong performance."
          : approval <= 40
            ? "Fans are wary and want a response."
            : "Fans are hopeful for the next match.",
    };
  }

  createChampionsLeagueUserMatch(fixture) {
    const teamFor = (id) =>
      this.clubs.find((club) => club.id === id) ??
      this.championsLeague.leaguePhaseTeams.find((team) => team.id === id);
    const rosterFor = (team) =>
      team === this.club
        ? this.players
        : (team.roster ??
          this.players.filter((player) => player.clubId === team.id));
    const clubFor = (team) =>
      team instanceof Club
        ? team
        : new Club({
            id: team.id,
            name: team.name,
            shortName: team.name,
            squad: rosterFor(team).map((player) => player.id),
            formation: "4-3-3",
            manager: { name: `${team.name} manager`, style: "Balanced" },
            prestige: team.rating ?? 60,
          });
    const homeClub = clubFor(teamFor(fixture.homeId));
    const awayClub = clubFor(teamFor(fixture.awayId));
    const homePlayers = rosterFor(teamFor(fixture.homeId));
    const awayPlayers = rosterFor(teamFor(fixture.awayId));
    const side = fixture.homeId === this.club.id ? "home" : "away";
    const opponents = (side === "home" ? awayPlayers : homePlayers).filter(
      Boolean,
    );
    const dayIndex = fixture.scheduledDay ?? this.currentDay();
    const involvement = this.matchInvolvement(dayIndex);
    const plannedOutgoingId =
      !involvement.starts && involvement.outgoingPlayerId
        ? [involvement.outgoingPlayerId]
        : [];
    const homeStrength = matchStrength(homeClub, homePlayers, dayIndex);
    const awayStrength = matchStrength(awayClub, awayPlayers, dayIndex);
    const difficultyBonus =
      this.data.careerSettings.difficultyBonuses[this.difficulty] ?? 0;
    if (side === "home") {
      homeStrength.attack += difficultyBonus;
      homeStrength.defence += difficultyBonus;
    } else {
      awayStrength.attack += difficultyBonus;
      awayStrength.defence += difficultyBonus;
    }
    const result = simulateMatch({
      home: { club: homeClub, players: homePlayers, strength: homeStrength },
      away: { club: awayClub, players: awayPlayers, strength: awayStrength },
      rng: this.rng.stream("champions-league-live-match"),
      dayIndex,
      detailedPlayerIds: [this.player.id],
      playerRoles: { [this.player.id]: this.matchRole },
      forcedPlayerIds: [
        ...(involvement.starts ? [this.player.id] : []),
        ...plannedOutgoingId,
      ],
      benchOnlyPlayerIds:
        involvement.namedOnBench && !involvement.starts ? [this.player.id] : [],
      excludedPlayerIds:
        !involvement.starts && !involvement.namedOnBench
          ? [this.player.id]
          : [],
      competition: "UEFA Champions League",
    });
    const opponent = side === "home" ? awayClub : homeClub;
    const playerResult = simulatePlayerMatch({
      player: this.player,
      match: result,
      side,
      opponents,
      rng: this.rng.stream("champions-league-player-moments"),
      position: involvement.position ?? this.player.position,
      minutes: involvement.minutes,
      role: this.matchRole,
      catalog: this.data.keyMomentOptions,
      season: this.season,
      teamStyle: this.club?.manager?.playstyle,
    });
    this._pendingInvolvement = involvement;
    const scheduledGoalEvents = result.events;
    const record = {
      roundIndex: null,
      week: this.week,
      home: homeClub.name,
      away: awayClub.name,
      homeGoals: 0,
      awayGoals: 0,
      stats: result.stats,
      userMatch: true,
      pending: true,
      competition: "UEFA Champions League",
      competitionId: "champions-league",
      uefaFixtureId: fixture.id,
    };
    result.events = [];
    result.scheduledGoalEvents = scheduledGoalEvents;
    result.plannedHomeGoals = result.homeGoals;
    result.plannedAwayGoals = result.awayGoals;
    result.homeGoals = 0;
    result.awayGoals = 0;
    this.lastReport = {
      week: this.week,
      fixtures: [record],
      userMatch: {
        ...result,
        playerResult,
        opponent: opponent.name,
        side,
        competitionId: "champions-league",
        competitionName: "UEFA Champions League",
        uefaFixtureId: fixture.id,
        objective:
          involvement.minutes > 0
            ? this.pickObjective()
            : "No objective — did not play",
        objectiveComplete: false,
        objectiveAwarded: false,
      },
      headlines: [
        `${this.club.name} played ${opponent.name} in the Champions League`,
      ],
    };
    const role = this.playerMatchRole(this.lastReport.userMatch, side);
    this.matchSimulation = {
      minute: 0,
      outgoingPlayerId: involvement.outgoingPlayerId ?? null,
      activeMomentIndex: null,
      status: "ready",
      releasedGoalCount: 0,
      finalized: false,
      ...role,
    };
    return fixture.id;
  }

  getTeammateStats() {
    return this.players
      .filter(
        (player) =>
          player.clubId === this.club.id && player.id !== this.player.id,
      )
      .map((player) => ({
        player,
        averageRating: player.stats.apps
          ? player.stats.ratingSum / player.stats.apps
          : null,
        goals: player.stats.goals,
        assists: player.stats.assists,
      }))
      .sort(
        (left, right) =>
          right.player.stats.apps - left.player.stats.apps ||
          right.goals - left.goals ||
          right.assists - left.assists ||
          left.player.last.localeCompare(right.player.last),
      );
  }

  getFixtureList() {
    const fixtures = [];
    for (let index = 0; index < this.league.fixtures.length; index++) {
      const fixture = this.league.fixtures[index].find(
        (match) => match.home === this.club.id || match.away === this.club.id,
      );
      if (!fixture) continue;
      const result = this.results.find(
        (item) =>
          item.roundIndex === index &&
          item.home ===
            this.clubs.find((club) => club.id === fixture.home)?.name,
      );
      const home = this.clubs.find((club) => club.id === fixture.home);
      const away = this.clubs.find((club) => club.id === fixture.away);
      fixtures.push({
        id: fixture.id ?? `league-${index}`,
        competition: this.league.name,
        competitionId: this.league.id,
        season: this.season,
        roundLabel: `Matchday ${index + 1}`,
        matchNumber: index + 1,
        date:
          fixture.scheduledDate ??
          this.fixtureDayFor(
            this.league,
            index,
            this.league.fixtureWeeks[index],
          ),
        home: home.name,
        homeShortName: home.shortName,
        homeId: home.id,
        userIsHome: fixture.home === this.club.id,
        away: away.name,
        awayShortName: away.shortName,
        awayId: away.id,
        result:
          result && !result.pending
            ? `${result.homeGoals}\u2013${result.awayGoals}`
            : null,
        stats: result && !result.pending ? (result.stats ?? null) : null,
        played: !!result && !result.pending,
      });
    }
    const championsLeague = this.championsLeague;
    if (championsLeague?.season === this.season) {
      const teams = new Map(
        (championsLeague.leaguePhaseTeams ?? []).map((team) => [team.id, team]),
      );
      const clubFor = (id) =>
        teams.get(id) ??
        this.clubs.find((club) => club.id === id) ?? {
          id,
          name: id,
          shortName: id,
        };
      const dateForWeek = (week) =>
        this.calendar?.[week]?.midweek ??
        this.calendar?.at(-1)?.matchday ??
        this.calendar?.[0]?.matchday ??
        null;
      const addChampionsLeagueFixture = ({
        id,
        stage,
        roundLabel,
        week,
        homeId,
        awayId,
        result,
      }) => {
        if (homeId !== this.club.id && awayId !== this.club.id) return;
        const home = clubFor(homeId);
        const away = clubFor(awayId);
        const played = !!result;
        fixtures.push({
          id,
          competition: "UEFA Champions League",
          competitionId: "champions-league",
          season: championsLeague.season ?? this.season,
          roundLabel,
          date: dateForWeek(week),
          home: home.name,
          homeShortName: home.shortName,
          homeId,
          userIsHome: homeId === this.club.id,
          away: away.name,
          awayShortName: away.shortName,
          awayId,
          // Every tournament fixture renders the score the same way — spaced en dash,
          // with the shoot-out noted — so the fixture list and the match report agree.
          result: played
            ? `${result.homeGoals} \u2013 ${result.awayGoals}${result.decidedBy === "penalties" && result.penalties ? " (pens)" : ""}`
            : null,
          stats: played ? (result.stats ?? null) : null,
          played,
          stage,
        });
      };
      for (const fixture of championsLeague.leaguePhase?.fixtures ?? []) {
        addChampionsLeagueFixture({
          id: fixture.id,
          stage: fixture.stage,
          roundLabel: `League phase · Matchday ${fixture.round}`,
          week: fixture.week,
          homeId: fixture.homeId,
          awayId: fixture.awayId,
          result: fixture.played ? (fixture.result ?? fixture) : null,
        });
      }
      const knockoutRounds = [
        ["roundOf16", "Round of 16"],
        ["quarterFinals", "Quarter-final"],
        ["semiFinals", "Semi-final"],
      ];
      for (const [roundKey, roundName] of knockoutRounds) {
        for (const tie of championsLeague.knockout?.[roundKey] ?? []) {
          for (const [legName, leg] of [
            ["First leg", tie.firstLeg],
            ["Second leg", tie.secondLeg],
          ]) {
            if (!leg) continue;
            addChampionsLeagueFixture({
              id: leg.id,
              stage: tie.stage,
              roundLabel: `${roundName} · ${legName}`,
              week: leg.week,
              homeId: leg.homeId,
              awayId: leg.awayId,
              result: leg.played ? leg : null,
            });
          }
        }
      }
      const final = championsLeague.knockout?.final;
      if (final) {
        addChampionsLeagueFixture({
          id: final.id,
          stage: "final",
          roundLabel: "Final",
          week: final.week,
          homeId: final.homeId,
          awayId: final.awayId,
          result: final.played ? final : null,
        });
      }
    }
    const worldCup = this.worldCup?.tournament;
    if (
      worldCup?.status &&
      ["in-progress", "complete"].includes(worldCup.status)
    ) {
      const userTeam =
        worldCup.qualified.find(
          (team) => team.code === this.player.nationality,
        ) ??
        worldCup.qualified.find((team) =>
          team.squadIds?.includes(this.player.id),
        );
      if (userTeam) {
        for (const fixture of worldCup.fixtures ?? []) {
          const involvesUserTeam =
            fixture.homeId === userTeam.id || fixture.awayId === userTeam.id;
          if (!involvesUserTeam) continue;
          const home = worldCup.qualified.find(
            (team) => team.id === fixture.homeId,
          );
          const away = worldCup.qualified.find(
            (team) => team.id === fixture.awayId,
          );
          if (!home || !away) continue;
          const played = fixture.status === "completed";
          fixtures.push({
            id: fixture.id,
            competition: "FIFA World Cup",
            competitionId: "fifa-world-cup",
            season: worldCup.season ?? worldCup.year - 1,
            roundLabel:
              fixture.stage === "group"
                ? `Group stage · ${fixture.groupId ?? "Group"} · Matchday ${Number(fixture.round ?? 0) + 1}`
                : (fixture.knockoutStage ?? fixture.round ?? fixture.stage),
            matchNumber:
              fixture.stage === "group" ? Number(fixture.round ?? 0) + 1 : null,
            date: fixture.scheduledDay,
            home: home.name,
            homeShortName: home.code,
            homeId: home.id,
            userIsHome: fixture.homeId === userTeam.id,
            away: away.name,
            awayShortName: away.code,
            awayId: away.id,
            result: played
              ? `${fixture.homeGoals} \u2013 ${fixture.awayGoals}${fixture.decidedBy === "penalties" && fixture.penalties ? " (pens)" : ""}`
              : null,
            stats: played ? (fixture.stats ?? null) : null,
            played,
            stage: fixture.stage,
          });
        }
      }
    }
    const leagueDays = new Set(
      this.league.fixtureWeeks.map((weekIndex, index) =>
        this.fixtureDayFor(this.league, index, weekIndex),
      ),
    );
    const sorted = fixtures.sort(
      (left, right) =>
        (left.date ?? Number.MAX_SAFE_INTEGER) -
          (right.date ?? Number.MAX_SAFE_INTEGER) ||
        left.competition.localeCompare(right.competition),
    );
    const next = sorted.find((fixture) => !fixture.played);
    if (next) next.next = true;
    return sorted;
  }

  changePosition(position) {
    if (!POSITIONS.includes(position)) {
      throw new Error(`Unsupported player position: ${position}`);
    }
    const previousOverall = calculateOverall(this.player);
    this.player.position = position;
    updatePlayerOverall(this.player, "Position change", {
      season: this.season,
    });
    return {
      position,
      previousOverall,
      overall: this.player.overall,
      difference: this.player.overall - previousOverall,
    };
  }

  changeFormation(formation) {
    if (!FORMATION_NAMES.includes(formation))
      throw new Error(`Unsupported formation: ${formation}`);
    if (this.club.formation !== formation) this.club.customXI = null;
    this.club.formation = formation;
    this.club.userChosenFormation = true;
    return formation;
  }

  changeLineup(outgoingId, incomingId) {
    if (!outgoingId || !incomingId || outgoingId === incomingId)
      throw new Error("Choose one starter and a different substitute.");
    const squad = this.players.filter(
      (player) => player.clubId === this.club.id,
    );
    const lineup = selectLineup(
      squad,
      this.club.formation,
      this.calendar[Math.max(0, Math.min(this.week, this.calendar.length - 1))]
        ?.matchday ?? 0,
      { customXI: this.club.customXI ?? [] },
    );
    const outgoing = lineup.xi.find((entry) => entry.player.id === outgoingId);
    const incoming = lineup.subs.find((player) => player.id === incomingId);
    if (!outgoing)
      throw new Error("The selected starter is no longer in the starting XI.");
    if (!incoming)
      throw new Error("The selected substitute is no longer available.");
    if (
      (normalizePosition(incoming.position) === "GK") !==
      (normalizePosition(outgoing.slot) === "GK")
    )
      throw new Error("Goalkeepers can only replace the goalkeeper.");
    if (groupOf(incoming.position) !== groupOf(outgoing.slot))
      throw new Error("Players can only replace positions in their category.");
    this.club.customXI = lineup.xi.map(({ slotIndex, slot, player }) => ({
      slotIndex,
      slot,
      playerId: player.id === outgoingId ? incomingId : player.id,
    }));
    return {
      outgoing: `${outgoing.player.first} ${outgoing.player.last}`,
      incoming: `${incoming.first} ${incoming.last}`,
      slot: outgoing.slot,
    };
  }

  get seasonComplete() {
    return this._seasonComplete ?? false;
  }

  set seasonComplete(value) {
    this._seasonComplete = value;
  }

  toJSON() {
    return {
      saveVersion: 2,
      activeLeagueId: this.league.id,
      seed: this.seed,
      difficulty: this.difficulty,
      careerStartYear: this.careerStartYear,
      worldCup: this.worldCup,
      managerState: this.managerState,
      season: this.season,
      seasonWeekCount: this.seasonWeekCount,
      week: this.week,
      dayCursor: this.dayCursor,
      trainingFocus: this.trainingFocus,
      matchRole: this.matchRole,
      generatedEliteIds: this.generatedEliteIds,
      performanceDevelopmentProgress: this.performanceDevelopmentProgress ?? 0,
      trainingMarketRefresh: this.trainingMarketRefresh ?? 0,
      money: this.money,
      financialHistory: this.financialHistory,
      scoutingVersion: 1,
      conversationHistory: this.conversationHistory,
      careerEnded: this.careerEnded,
      lastFanReaction: this.lastFanReaction,
      playerId: this.player.id,
      players: this.players,
      clubs: this.clubs,
      calendar: this.calendar,
      seasonComplete: this.seasonComplete,
      rng: this.rng.toJSON(),
      lastReport: this.lastReport,
      results: this.results,
      creation: this.creation,
      news: this.news,
      agent: this.agent ? { ...this.agent } : null,
      transferOffers: this.transferOffers,
      transferRefreshCount: this.transferRefreshCount,
      transferMarketState: this.transferMarketState,
      transferHistory: this.transferHistory ?? [],
      agentPerformance: this.agentPerformance ?? {},
      transferRumours: this.transferRumours ?? [],
      nextCpuTransferEvaluationWeek: this.nextCpuTransferEvaluationWeek ?? 0,
      pendingPlayerTransfer: this.pendingPlayerTransfer ?? null,
      usedSituationIds: this.usedSituationIds,
      matchSimulation: this.matchSimulation,
      populationTracking: this.populationTracking ?? {
        seasonIntroduced: {},
        retired: {},
      },

      worldCareerLeagues: this.worldCareerLeagues,
      expansionPlayers: this.expansionPlayers,
      worldCupNpcPlayers: this.worldCupNpcPlayers,
      leagueHistories: this.leagueHistories,
      worldLeagues: this.worldLeagues.map(
        ({
          league,
          clubRatings,
          clubFormations,
          clubTactics,
          trainingClubs,
          performers,
        }) => ({
          league: serializeLeague(league),
          clubRatings,
          clubFormations: clubFormations ?? {},
          clubTactics: clubTactics ?? {},
          trainingClubs: trainingClubs ?? {},
          performers: performers ?? [],
        }),
      ),
      worldPlayerDevelopment: this.worldPlayerDevelopment,
      trainingMarketRefresh: this.trainingMarketRefresh ?? 0,
      currentSeasonAwards: this.currentSeasonAwards,
      ballonDorCeremonies: this.ballonDorCeremonies,
      ballonDorWatchlist: this.ballonDorWatchlist ?? [],
      ballonDorShortlist: this.ballonDorShortlist ?? [],
      seasonAwardHistory: this.seasonAwardHistory,
      seasonHistory: this.seasonHistory ?? [],
      championsLeague: this.championsLeague,

      hiredManagerId: this.hiredManagerId,
      coachMarket: this.coachMarket ?? [],
      coachAppointments: this.coachAppointments ?? {
        season: this.season,
        count: 0,
      },
      league: {
        id: this.league.id,
        name: this.league.name,
        fictionalName: this.league.fictionalName,
        nation: this.league.nation,
        tier: this.league.tier,
        teamIds: this.league.teamIds,
        fixtures: this.league.fixtures,
        fixtureWeeks: this.league.fixtureWeeks,
        fixtureDays: this.league.fixtureDays,
        table: {
          rows: [...this.league.table.rows.entries()],
          tiebreakers: this.league.table.tiebreakers,
        },
        cups: this.league.cups,
        rules: this.league.rules,
        season: this.league.season,
        history: this.league.history,
      },
    };
  }

  toCompactJSON() {
    const save = this.toJSON();
    save.news = Array.isArray(save.news) ? save.news.slice(0, 100) : [];
    save.financialHistory = Array.isArray(save.financialHistory)
      ? save.financialHistory.slice(0, 100)
      : [];
    save.transferHistory = Array.isArray(save.transferHistory)
      ? save.transferHistory.slice(0, 100)
      : [];
    save.transferRumours = Array.isArray(save.transferRumours)
      ? save.transferRumours.slice(0, 100)
      : [];
    save.results = Array.isArray(save.results) ? save.results.slice(-500) : [];
    save.usedSituationIds = Array.isArray(save.usedSituationIds)
      ? save.usedSituationIds.slice(-250)
      : [];
    save.conversationHistory = Array.isArray(save.conversationHistory)
      ? save.conversationHistory.slice(-50)
      : [];
    save.seasonHistory = Array.isArray(save.seasonHistory)
      ? save.seasonHistory.slice(-20)
      : [];
    save.seasonAwardHistory = Array.isArray(save.seasonAwardHistory)
      ? save.seasonAwardHistory.slice(-20)
      : [];
    save.ballonDorShortlist = Array.isArray(save.ballonDorShortlist)
      ? save.ballonDorShortlist.slice(0, 100)
      : [];
    save.ballonDorWatchlist = Array.isArray(save.ballonDorWatchlist)
      ? save.ballonDorWatchlist.slice(0, 100)
      : [];
    save.leagueHistories = Array.isArray(save.leagueHistories)
      ? save.leagueHistories.slice(-20)
      : [];
    save.worldLeagues = Array.isArray(save.worldLeagues)
      ? save.worldLeagues.map((state) => ({
          ...state,
          performers: Array.isArray(state.performers)
            ? state.performers.map((player) => ({ ...player, developmentHistory: (player.developmentHistory ?? []).slice(-40), developmentReportHistory: (player.developmentReportHistory ?? []).slice(-20) })).slice(0, 100)
            : [],
        }))
      : [];
    save.worldPlayerDevelopment = Object.fromEntries(
      Object.entries(save.worldPlayerDevelopment ?? {}).slice(-500),
    );
    return save;
  }

  restore(saved) {
    const freshLegendPlayers = [
      ...(this.players ?? []),
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
    ].filter((player) => player.isLegend);
    const savedLeague = saved.activeLeagueId
      ? this.baseData.careerLeagues?.find(
          (entry) => entry.id === saved.activeLeagueId,
        )
      : null;
    if (savedLeague) this.data = this.dataForLeague(savedLeague);
    this.seed = saved.seed >>> 0;
    this.difficulty = saved.difficulty;
    // Manager careers restore their board, dressing room and trophy case with the save.
    this.managerState = saved.managerState ?? null;
    this.isManagerCareer = !!this.managerState;
    this.season = saved.season;
    this.populationTracking = saved.populationTracking ?? {
      seasonIntroduced: {},
      retired: {},
    };
    this.careerStartYear =
      saved.careerStartYear ?? saved.worldCup?.startYear ?? saved.season;
    this.seasonWeekCount = saved.seasonWeekCount ?? this.seasonWeekCount ?? 52;
    this.worldCareerLeagues ??= this.buildCareerWorldLeagues();
    this.expansionPlayers ??= [];
    this.worldCupNpcPlayers = (saved.worldCupNpcPlayers ?? []).map((spec) => {
      const player = createPlayer(spec);
      Object.assign(player, spec);
      return player;
    });
    this.ensureWorldCupMajorNationPlayers();
    this.leagueHistories ??= {};
    this.week = saved.week;
    this.dayCursor = Number.isFinite(saved.dayCursor)
      ? saved.dayCursor
      : (saved.calendar?.[Math.max(0, saved.week)]?.matchday ??
        saved.calendar?.[0]?.day - 1);
    this.developerMode = false;
    this.matchRole = saved.matchRole;
    this.generatedEliteIds = saved.generatedEliteIds ?? [];
    this.performanceDevelopmentProgress =
      saved.performanceDevelopmentProgress ?? 0;
    this.trainingMarketRefresh = saved.trainingMarketRefresh ?? 0;
    this.money =
      saved.money ?? this.data.careerSettings.finance.startingBalance;
    this.financialHistory = saved.financialHistory ?? [];
    this.conversationHistory = saved.conversationHistory ?? [];
    this.careerEnded = !!saved.careerEnded;
    this.championsLeague = saved.championsLeague ?? null;
    normalizeChampionsLeagueSchedule(this.championsLeague);
    this.lastFanReaction = saved.lastFanReaction ?? null;
    this.creation = saved.creation;
    this.results = saved.results ?? [];
    this.news = saved.news ?? [];
    this.agentPool = this.buildAgents();
    this.agent = saved.agent
      ? (this.agentPool.find((item) => item.id === saved.agent.id) ??
        new Agent(saved.agent))
      : null;
    this.transferOffers = saved.transferOffers ?? [];
    this.transferMarketState = saved.transferMarketState ?? {
      season: saved.season,
      searchCount: saved.transferRefreshCount ?? 0,
      lastSearchDay: null,
    };
    this.transferMarketState.season ??= saved.season;
    this.transferMarketState.searchCount ??= saved.transferRefreshCount ?? 0;
    this.transferMarketState.window ??= null;
    this.transferHistory = saved.transferHistory ?? [];
    this.agentPerformance = saved.agentPerformance ?? {};
    this.transferRumours = saved.transferRumours ?? [];
    this.nextCpuTransferEvaluationWeek =
      saved.nextCpuTransferEvaluationWeek ?? 0;
    this._forceCpuTransferEvaluation = false;
    this.positionNeedCache = null;
    this.pendingPlayerTransfer = saved.pendingPlayerTransfer ?? null;
    this.transferRefreshCount =
      saved.transferRefreshCount ?? this.transferOffers.length;
    this.usedSituationIds = saved.usedSituationIds ?? [];
    this.worldPlayerDevelopment = saved.worldPlayerDevelopment ?? {};
    this.worldCareerLeagues =
      saved.worldCareerLeagues ?? this.buildCareerWorldLeagues();
    if (savedLeague) this.data = this.dataForLeague(savedLeague);
    this.data = { ...this.data, careerLeagues: this.worldCareerLeagues };
    this.expansionPlayers = [];
    this.leagueHistories = saved.leagueHistories ?? {};
    this.matchSimulation = saved.matchSimulation ?? null;

    this.currentSeasonAwards = saved.currentSeasonAwards ?? null;
    this.ballonDorCeremonies = saved.ballonDorCeremonies ?? [];
    this.ballonDorWatchlist = saved.ballonDorWatchlist ?? [];
    this.ballonDorShortlist = saved.ballonDorShortlist ?? [];
    this.seasonAwardHistory = saved.seasonAwardHistory ?? [];
    this.seasonHistory = saved.seasonHistory ?? [];

    this.hiredManagerId = saved.hiredManagerId ?? null;
    this.coachMarket = Array.isArray(saved.coachMarket)
      ? saved.coachMarket
      : generateCoachMarket(this.seed, this.season, 12);
    this.coachAppointments = saved.coachAppointments ?? {
      season: this.season,
      count: 0,
    };
    this.rng = RngBundle.fromJSON(saved.rng);
    for (const club of saved.clubs ?? [])
      ensureClubTraining(club, this.seed, this.season);
    this.calendar = saved.calendar;
    if (
      this.championsLeague?.season === this.season &&
      this.calendar.length < 56
    ) {
      this.calendar = seasonWeeks(this.season, 56);
    }
    this.players = saved.players.map((spec) => {
      const player = createPlayer(spec);
      Object.assign(player, spec);
      if (
        !Number.isFinite(player.overallAdjustment) &&
        player.source === "real-world" &&
        Number.isFinite(player.overall)
      ) {
        player.overallAdjustment =
          player.overall -
          calculateOverall({ ...player, source: null, overallAdjustment: 0 });
      }
      if (player.first === "Lionel" && player.last === "Messi") {
        player.position = "AM";
        player.altPositions = ["ST", "RW", "LW"];
        player.displayPosition = "CAM";
      }
      ensurePlayStyles(player);
      player.nationality =
        player.source === "real-world"
          ? normalizePlayerNationality(
              player.nationality,
              `${player.first} ${player.last}`,
            )
          : normalizePlayerNationality(player.nationality);
      player.matchHistory ??= [];
      player.developmentHistory ??= [];
      player.developmentReportHistory ??= [];
      player.careerStats ??= { ...player.stats };
      player.leaguePerformance ??= {
        apps: player.stats.apps,
        ratingSum: player.stats.ratingSum,
      };
      if (player.marketValue == null && Number.isFinite(Number(player.value))) {
        player.marketValue = Number(player.value);
      }
      if (player.marketValue != null && player.value == null) player.value = player.marketValue;
      player.previousMarketValue ??= null;
      player.marketValueChange ??= 0;
      player.overall = calculateOverall(player);
      player.baseOverall = player.overall;
      return player;
    });
    this.expansionPlayers = Array.isArray(saved.expansionPlayers) ? saved.expansionPlayers : (this.expansionPlayers ?? []);
    this.worldCupNpcPlayers = Array.isArray(saved.worldCupNpcPlayers) ? saved.worldCupNpcPlayers : (this.worldCupNpcPlayers ?? []);
    this.syncAllPlayerMarketValues({ season: this.season, dayIndex: this.currentDay(), initialize: false });
    this.player = this.players.find((player) => player.id === saved.playerId);
    if (!this.player) throw new Error("Save is missing its career player.");
    this.trainingFocus = normalizedTrainingFocus(
      saved.trainingFocus ?? this.player.trainingFocus,
      this.player.position,
    );
    this.player.trainingFocus = this.trainingFocus;
    this.player.honours ??= [];
    this.clubs = saved.clubs.map((spec) => {
      const configuredIdentity = Object.values(this.baseData.clubs ?? {})
        .flatMap((group) => Object.values(group ?? {}))
        .find(
          (identity) =>
            normalizeClubName(identity?.name) ===
              normalizeClubName(spec.name) ||
            normalizeClubName(identity?.name) === normalizeClubName(spec.id) ||
            normalizeClubName(identity?.fictionalName) ===
              normalizeClubName(spec.name),
        );
      const realVenue = stadiumIdentityForClub(
        configuredIdentity?.name ?? spec.name ?? spec.id,
      );
      const persistedCapacity = Number(spec.capacity);
      const configuredCapacity = Number(configuredIdentity?.capacity);
      const club = new Club({
        ...spec,
        ...(configuredIdentity
          ? {
              stadium:
                configuredIdentity.stadium ??
                spec.stadium ??
                realVenue?.stadium,
              founded: configuredIdentity.founded ?? spec.founded,
              city: configuredIdentity.city ?? spec.city ?? realVenue?.city,
              capacity:
                Number.isFinite(persistedCapacity) &&
                Number.isFinite(configuredCapacity) &&
                persistedCapacity > configuredCapacity
                  ? persistedCapacity
                  : (configuredIdentity.capacity ?? spec.capacity),
            }
          : {
              stadium: spec.stadium || realVenue?.stadium || "",
              city: spec.city || realVenue?.city || "",
              capacity: spec.capacity || realVenue?.capacity || 20000,
            }),
      });
      Object.assign(club, spec, {
        stadium:
          spec.stadium ||
          configuredIdentity?.stadium ||
          realVenue?.stadium ||
          "",
        city: spec.city || configuredIdentity?.city || realVenue?.city || "",
        capacity:
          Number(spec.capacity) > 0
            ? Number(spec.capacity)
            : (configuredIdentity?.capacity ?? realVenue?.capacity ?? 20000),
      });
      ensureClubFinance(club);
      ensureClubScouting(club, this.seed);
      club.manager = Object.assign(new Manager(spec.manager), spec.manager);
      club.squad = [...spec.squad];
      club.isUserClub = club.id === this.player.clubId;
      ensureClubHierarchy(club, `${this.seed}-${club.id}`);
      return club;
    });
    for (const club of this.clubs) {
      ensureClubFinance(club);
      ensureClubHierarchy(club, `${this.seed}-${club.id}`);
      ensureClubScouting(club, this.seed);
      ensureCoachProfile(club);
      ensureClubTraining(club, this.seed, this.season);
      academyState(club);
      ensureSquadRegistration(club, this.players);
    }
    this.reconcileSquadMembership();
    for (const club of this.clubs) ensureSquadRegistration(club, this.players);
    this.ensureSquadSizes();
    this.club = this.clubs.find((club) => club.id === this.player.clubId);
    for (const club of this.clubs) assignShirtNumbers(this.players, club, true);
    const spec = saved.league;
    this.league = new League(spec);
    this.league.fixtures = spec.fixtures;
    this.league.fixtureWeeks = spec.fixtureWeeks;
    this.league.fixtureDays =
      spec.fixtureDays?.length === this.league.fixtures.length
        ? spec.fixtureDays
        : this.buildFixtureDays(this.league);
    this.league.table = new LeagueTable(spec.teamIds);
    this.league.table.rows = new Map(spec.table.rows);
    this.league.history = spec.history;
    const savedWorldLeagues =
      saved.worldLeagues ??
      this.buildWorldLeagues().map(
        ({ league, clubRatings, clubFormations, clubTactics }) => ({
          league: serializeLeague(league),
          clubRatings,
          clubFormations,
          clubTactics,
        }),
      );
    this.worldCareerLeagues =
      saved.worldCareerLeagues ?? this.buildCareerWorldLeagues();
    this.leagueHistories = saved.leagueHistories ?? {};
    if (savedLeague) this.data = this.dataForLeague(savedLeague);
    this.data = { ...this.data, careerLeagues: this.worldCareerLeagues };
    this.seasonWeekCount = Math.max(
      this.seasonWeekCount ?? 52,
      ...this.worldCareerLeagues.map(
        (entry) =>
          (entry.league.fixtureStartWeek ?? 3) +
          2 * (entry.league.teamIds.length - 1),
      ),
    );
    this.worldLeagues = savedWorldLeagues.map(
      ({
        league: leagueSpec,
        clubRatings,
        clubFormations,
        clubTactics,
        trainingClubs,
        performers,
      }) => {
        const league = new League(leagueSpec);
        league.fixtures = leagueSpec.fixtures;
        league.fixtureWeeks = leagueSpec.fixtureWeeks;
        league.fixtureDays =
          leagueSpec.fixtureDays?.length === league.fixtures.length
            ? leagueSpec.fixtureDays
            : this.buildFixtureDays(league);
        league.table = new LeagueTable(leagueSpec.teamIds);
        league.table.rows = new Map(leagueSpec.table.rows);
        league.history = leagueSpec.history ?? [];
        return {
          league,
          clubRatings,
          clubFormations: clubFormations ?? {},
          clubTactics: clubTactics ?? {},
          trainingClubs: trainingClubs ?? {},
          performers: performers ?? [],
        };
      },
    );
    for (const state of this.worldLeagues) {
      for (const performer of state.performers) {
        this.ensureWorldPlayerModel(performer);
        performer.overall = performer.isLegend
          ? LEGEND_OVERALL
          : calculateOverall(performer);
        performer.baseOverall = performer.overall;
        seedPlayStyles(performer, this.rng.stream("playstyle-seed"));
        performer.playStyles ??= { unlocked: [], progress: {}, history: [] };
        performer.ratingHistory ??= [];
        performer.developmentHistory ??= [];
        performer.developmentReportHistory ??= [];
        performer.matchHistory ??= [];
      }
    }
    this.clearLegacyLegendFlags(freshLegendPlayers);
    this.worldCup = saved.worldCup ?? worldCupSchedule(this.careerStartYear);
    this.worldCup.startYear ??= this.careerStartYear;
    this.worldCup.firstYear =
      this.careerStartYear + WORLD_CUP_START_YEAR_OFFSET;
    this.worldCup.interval = WORLD_CUP_INTERVAL;
    this.worldCup.nationalManagers ??= {};
    this.worldCup.chemistry ??= {};
    this.worldCup.history ??= [];
    const lastCompletedWorldCupYear = Math.max(
      0,
      ...this.worldCup.history.map((entry) => Number(entry.year) || 0),
      ...(this.worldCup.tournament?.status === "complete"
        ? [Number(this.worldCup.tournament.year) || 0]
        : []),
    );
    const earliestNextYear = Math.max(
      this.worldCup.firstYear,
      lastCompletedWorldCupYear + WORLD_CUP_INTERVAL,
    );
    if (
      !Number.isInteger(Number(this.worldCup.nextYear)) ||
      (Number(this.worldCup.nextYear) < earliestNextYear &&
        this.worldCup.tournament?.status !== "in-progress")
    ) {
      this.worldCup.nextYear = earliestNextYear;
      this.worldCup.qualification = null;
    }
    this.initializeWorldCupQualification();
    this.scheduleDomesticLeague(this.league);
    for (const state of this.worldLeagues)
      this.scheduleDomesticLeague(state.league);
    if (this.championsLeague?.season === this.season) {
      this.validateCompetitionSchedule();
    }
    this.seasonComplete =
      saved.seasonComplete && this.areAllSeasonCompetitionsComplete();
    this.lastReport = saved.lastReport;
    if (
      this.matchSimulation?.status === "finished" &&
      this.lastReport?.userMatch
    ) {
      for (const moment of this.lastReport.userMatch.playerResult?.keyMoments ??
        []) {
        if (!moment.resolved) {
          moment.resolved = {
            success: false,
            probability: 0,
            action: { label: "Full time" },
          };
        }
      }
    }
    this.currentObjective = saved.currentObjective ?? null;
    this.backfillAwardHonours();
    this.recordChampionsLeagueChampionHonours();
    const savedBallonAward = this.currentSeasonAwards?.awards?.find(
      (award) => award.award === "Ballon d'Or",
    );
    if (!savedBallonAward?.evaluation) {
      this.refreshCurrentBallonDorSnapshot();
    }
  }

  clearLegacyLegendFlags(freshPlayers = []) {
    const players = [
      ...(this.players ?? []),
      ...(this.worldLeagues ?? []).flatMap((state) => state.performers ?? []),
      ...freshPlayers,
    ];
    for (const player of players) {
      const name = `${player.first ?? ""} ${player.last ?? ""}`
        .trim()
        .toLowerCase();
      if (name === "lionel messi" || name === "cristiano ronaldo")
        player.isLegend = false;
    }
  }

  seasonSummary() {
    const row = this.league.table.row(this.club.id);
    return {
      season: seasonLabel(this.season),
      age: ageOn(this.player.dob, this.calendar.at(-1).matchday),
      position: this.league.table.positions().get(this.club.id),
      points: row.points,
      appearances: this.player.stats.apps,
      goals: this.player.stats.goals,
      assists: this.player.stats.assists,
      averageRating: this.player.stats.apps
        ? round(this.player.stats.ratingSum / this.player.stats.apps, 2)
        : 0,
    };
  }
}

function serializeLeague(league) {
  return {
    id: league.id,
    name: league.name,
    fictionalName: league.fictionalName,
    nation: league.nation,
    tier: league.tier,
    teamIds: league.teamIds,
    fixtures: league.fixtures,
    fixtureWeeks: league.fixtureWeeks,
    fixtureDays: league.fixtureDays,
    table: {
      rows: [...league.table.rows.entries()],
      tiebreakers: league.table.tiebreakers,
    },
    cups: league.cups,
    rules: league.rules,
    season: league.season,
    history: league.history,
  };
}

export function createCareer(data, options, saved = null) {
  if (!options.first?.trim() || !options.last?.trim())
    throw new Error("Enter a first and last name.");
  const selectedLeagueEntry = options.leagueId
    ? data.careerLeagues?.find((entry) => entry.id === options.leagueId)
    : null;
  if (options.leagueId && !selectedLeagueEntry)
    throw new Error("Choose an available league.");
  const selectedLeague = options.leagueId ? selectedLeagueEntry.league : null;
  const league = selectedLeague ?? data.league;
  if (!league.teamIds.includes(options.clubId))
    throw new Error("Choose a club in the selected league.");
  return new Career(data, options, saved);
}

export { emptyStats };

