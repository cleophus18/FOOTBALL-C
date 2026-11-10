import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCareer, MATCH_SITUATIONS } from "../src/career.mjs";
import { selectNationalTeamSquad } from "../src/model/international.mjs";
import { CATALOGUED_NATIONS } from "../src/model/names.mjs";
import {
  groupOf,
  POSITIONS,
  SUB_ATTRIBUTES,
  SUB_ATTRIBUTE_GROUP,
} from "../src/core/constants.mjs";
import { RngBundle } from "../src/core/rng.mjs";
import { ageOn, fromDayIndex, toDayIndex } from "../src/core/calendar.mjs";
import { calculateOverall, createPlayer } from "../src/model/player.mjs";
import {
  groupHonours,
  seasonsLabel,
  totalTrophies,
} from "../src/model/honours.mjs";
import {
  INJURY_SEVERITIES,
  createInjury,
  injuryRiskMultiplier,
  matchInjuryChance,
} from "../src/sim/injury.mjs";
import {
  FORMATIONS,
  FORMATION_NAMES,
  REAL_FORMATIONS,
  selectLineup,
} from "../src/model/club.mjs";
import {
  buildPlayableCareerLeagues,
  combineRosterPlayers,
  parseCompetitionMetadataCsv,
  parseFc26RatingsCsv,
  parseSupplementalPlayersCsv,
} from "../src/data/fc25-roster.mjs";
import {
  autoSuccessChance,
  keyMomentActions,
  PLAYER_ROLE_OPTIONS,
  ROLE_DESCRIPTIONS,
  ROLE_MODIFIERS,
  playerRoleOptionsForPosition,
  simulatePlayerMatch,
} from "../src/sim/playermatch.mjs";
import { simulateMatch } from "../src/sim/match.mjs";
import { expectedGoals, matchStrength } from "../src/sim/strength.mjs";

async function loadData() {
  const [
    clubs,
    leagues,
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    ratings,
    mappings,
    metadata,
    teams,
    additions,
    aliases,
    keyMomentOptions,
    expandedLeagueConfig,
    europeanAccessConfig,
  ] = await Promise.all([
    readFile(
      new URL("../data/config/clubs.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/leagues.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/archetypes.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(new URL("../data/squads/ENG.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
    readFile(
      new URL("../data/config/objectives.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/career.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/squads/fc26_player_ratings.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../data/config/fc26-club-leagues.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/football_leagues.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../data/config/career-league-teams.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/squads/player_additions.csv", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../data/config/supplemental-club-aliases.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/key-moment-options.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/expanded-leagues.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../data/config/europe-access.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
  ]);
  return {
    clubs,
    league: leagues["premier-league"],
    leagueConfig: leagues,
    archetypes,
    squadTemplate,
    objectives,
    careerSettings,
    keyMomentOptions,
    expandedLeagueConfig,
    europeanAccessConfig,
    careerLeagues: buildPlayableCareerLeagues(
      combineRosterPlayers(
        parseFc26RatingsCsv(ratings, mappings),
        parseSupplementalPlayersCsv(additions, aliases),
      ),
      parseCompetitionMetadataCsv(metadata),
      teams,
    ),
  };
}

function options(seed = 41827) {
  return {
    first: "Alex",
    last: "Hunter",
    age: "17",
    nationality: "ENG",
    height: "178",
    weight: "70",
    foot: "Right",
    weakFoot: "3",
    skillMoves: "4",
    position: "ST",
    archetype: "Poacher",
    startingOverall: "62",
    trait: "Wonderkid",
    personality: "Professional",
    difficulty: "Realistic",
    clubId: "hull",
    seed,
  };
}

test("major World Cup nations reuse existing stars and South Africa remains in the tournament pool", async () => {
  const career = createCareer(await loadData(), options(52121));
  const international = career.internationalPlayers();

  for (const nation of [
    "ESP",
    "FRA",
    "NED",
    "ENG",
    "POR",
    "RSA",
    "ARG",
    "BRA",
    "GER",
    "ITA",
  ]) {
    const squad = selectNationalTeamSquad(
      international,
      nation,
      career.internationalClubLevels(),
    );
    assert.ok(squad, `${nation} has a selectable 26-player World Cup squad`);
    assert.equal(squad.length, 26);
    assert.equal(
      new Set(squad.map((entry) => entry.player.id)).size,
      26,
      `${nation} must not contain duplicate players`,
    );
  }

  const southAfrica = international.filter(
    (player) => player.nationality === "RSA",
  );
  assert.ok(
    southAfrica.some(
      (player) => player.first === "Ronwen" && player.last === "Williams",
    ),
  );
  assert.equal(
    international.filter(
      (player) =>
        player.nationality === "ENG" &&
        player.first === "Bukayo" &&
        player.last === "Saka",
    ).length,
    1,
    "an existing England star must be reused instead of duplicated",
  );
});

test("existing World Cup nations are completed with positional NPCs when needed", async () => {
  const career = createCareer(await loadData(), options(52120));
  const qualification = career.worldCup.qualification;
  const existingNationCodes = new Set([
    ...CATALOGUED_NATIONS,
    ...career.internationalPlayers().map((player) => player.nationality),
  ]);
  const teams = qualification.groups.flatMap((group) => group.teams);

  assert.ok(teams.length > 0);
  assert.ok(teams.every((team) => existingNationCodes.has(team.code)));
  for (const team of teams) {
    const squad = selectNationalTeamSquad(
      career.internationalPlayers(),
      team.code,
      career.internationalClubLevels(),
    );
    assert.equal(
      squad.length,
      26,
      `${team.code} has a complete World Cup squad`,
    );
  }
  assert.ok(
    career.worldCupNpcPlayers.some(
      (player) => player.source === "generated-national-team",
    ),
  );
});

test("good seasons improve transfer interest and club trophies fund future signings", async () => {
  const career = createCareer(await loadData(), options(52121));
  const player = career.player;
  player.leaguePerformance = { apps: 20, ratingSum: 150 };
  player.leagueGoals = 20;
  player.leagueAssists = 8;
  player.form = 90;
  assert.ok(career.transferPerformanceBonus(player) > 0);

  const club = career.club;
  const finance = club.finances;
  const originalBalance = finance.balance;
  const originalBudget = finance.transferBudget;
  const trophy = {
    competition: career.league.name,
    winnerId: club.id,
  };
  career.recordClubTrophies([trophy]);
  const awardedBalance = finance.balance;
  const awardedBudget = finance.transferBudget;

  assert.ok(awardedBalance > originalBalance);
  assert.ok(awardedBudget > originalBudget);
  assert.ok(finance.ledger.some((entry) => entry.category === "prize-money"));
  career.recordClubTrophies([trophy]);
  assert.equal(finance.balance, awardedBalance);
  assert.equal(finance.transferBudget, awardedBudget);
});

function advanceAndResolve(career) {
  const report = career.advanceWeek();
  if (report.userMatch) {
    while (career.matchSimulation.status !== "finished") {
      const state = career.advanceMatchSimulation();
      if (
        state.status === "paused" &&
        !career.lastReport.userMatch.playerResult.keyMoments[state.momentIndex]
          .resolved
      ) {
        career.resolveKeyMoment(state.momentIndex, "play-safe");
      }
    }
  }
  return report;
}

test("career creation builds a seeded 20-club double round-robin", async () => {
  const data = await loadData();
  const first = createCareer(data, options());
  const second = createCareer(data, options());

  assert.equal(first.clubs.length, 20);
  assert.equal(first.league.fixtures.length, 38);
  assert.ok(first.club.squad.length >= 20);
  assert.ok(
    first.players.some(
      (player) =>
        player.first === "Bukayo" &&
        player.last === "Saka" &&
        player.clubId === "arsenal",
    ),
  );
  assert.ok(
    first.players.some(
      (player) =>
        player.first === "Erling" &&
        player.last === "Haaland" &&
        player.clubId === "manchestercity",
    ),
  );
  assert.ok(
    first.players.filter((player) => player.source === "real-world").length >=
      40,
  );
  assert.equal(first.player.potential > first.player.overall, true);
  assert.equal(first.player.weakFoot, 3);
  assert.equal(first.player.skillMoves, 4);
  assert.deepEqual(first.league.fixtures, second.league.fixtures);
  assert.deepEqual(
    first.players.map((player) => player.attrs),
    second.players.map((player) => player.attrs),
  );
});

test("generated NPCs start below 90 and restores keep at most four 90+ players", async () => {
  const data = await loadData();
  const career = createCareer(data, options(41828));
  const generated = [
    ...career.players,
    ...career.expansionPlayers,
    ...career.worldLeagues.flatMap((state) => state.performers),
  ].filter((player) =>
    ["generated", "generated-expansion"].includes(player.source),
  );
  const currentRatings = new Map();
  for (const player of generated) {
    currentRatings.set(
      player.id,
      Math.max(currentRatings.get(player.id) ?? 0, calculateOverall(player)),
    );
  }
  assert.equal(
    [...currentRatings.values()].some((overall) => overall >= 90),
    false,
  );
  assert.ok(
    generated.some(
      (player) => player.potential >= 90 && calculateOverall(player) < 90,
    ),
    "generated players should retain potential above their starting overall",
  );
  assert.equal(career.generatedEliteIds.length, 4);
  const generatedById = new Map(generated.map((player) => [player.id, player]));
  const eliteClubIds = career.generatedEliteIds.map(
    (id) => generatedById.get(id)?.clubId,
  );
  assert.equal(new Set(eliteClubIds).size, 4);
  const clubStrengths = new Map();
  for (const state of career.worldLeagues) {
    for (const [clubId, rating] of Object.entries(state.clubRatings))
      clubStrengths.set(clubId, rating);
  }
  for (const club of career.clubs) {
    if (clubStrengths.has(club.id)) continue;
    clubStrengths.set(
      club.id,
      Math.max(48, Math.min(91, Math.round(55 + club.prestige * 0.32))),
    );
  }
  const candidateClubStrengths = [
    ...new Map(
      generated.map((player) => [
        player.clubId,
        clubStrengths.get(player.clubId) ?? 60,
      ]),
    ).values(),
  ].sort((a, b) => a - b);
  const eliteClubStrengths = eliteClubIds
    .map((clubId) => clubStrengths.get(clubId) ?? 60)
    .sort((a, b) => a - b);
  assert.deepEqual(eliteClubStrengths, candidateClubStrengths.slice(0, 4));

  const saved = career.toJSON();
  const savedGenerated = saved.players
    .filter((player) =>
      ["generated", "generated-expansion"].includes(player.source),
    )
    .filter((player) => !saved.generatedEliteIds.includes(player.id))
    .slice(0, 2);
  assert.equal(savedGenerated.length, 2);
  const playersToElevate = [
    ...saved.generatedEliteIds,
    ...savedGenerated.map((player) => player.id),
  ];
  for (const player of [
    ...saved.players,
    ...saved.expansionPlayers,
    ...saved.worldLeagues.flatMap((state) => state.performers),
  ]) {
    if (!playersToElevate.includes(player.id)) continue;
    player.attrs = Object.fromEntries(
      Object.keys(player.attrs ?? {}).map((key) => [key, 99]),
    );
    player.subAttrs = Object.fromEntries(
      Object.keys(player.subAttrs ?? {}).map((key) => [key, 99]),
    );
    player.gkAttrs = Object.fromEntries(
      Object.keys(player.gkAttrs ?? {}).map((key) => [key, 99]),
    );
    player.potential = 99;
  }
  const restored = createCareer(data, saved.creation, saved);
  const restoredRatings = new Map();
  for (const player of [
    ...restored.players,
    ...restored.expansionPlayers,
    ...restored.worldLeagues.flatMap((state) => state.performers),
  ]) {
    if (!["generated", "generated-expansion"].includes(player.source)) continue;
    restoredRatings.set(
      player.id,
      Math.max(restoredRatings.get(player.id) ?? 0, calculateOverall(player)),
    );
  }
  assert.equal(
    [...restoredRatings.values()].filter((overall) => overall >= 90).length,
    4,
  );
  assert.ok(
    [...restoredRatings.entries()]
      .filter(([, overall]) => overall >= 90)
      .every(([id]) => saved.generatedEliteIds.includes(id)),
    "only the weaker-club elite pathways can reach 90 overall",
  );
  assert.ok(
    [
      ...restored.players,
      ...restored.worldLeagues.flatMap((state) => state.performers),
    ].some(
      (player) =>
        saved.generatedEliteIds.includes(player.id) &&
        player.potential === 99 &&
        calculateOverall(player) === 99,
    ),
    "generated elites should retain their rating and high potential after restore",
  );
});

test("career player always starts at 70 overall regardless of supplied rating", async () => {
  const data = await loadData();
  for (const position of POSITIONS) {
    const career = createCareer(data, {
      ...options(),
      position,
      startingOverall: "56",
    });
    assert.equal(calculateOverall(career.player), 70, `${position} player`);
  }
});

test("creation details, body and attribute choices are stored on the player", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    ...options(931),
    birthYear: "2009",
    birthMonth: "7",
    birthDay: "12",
    height: "191",
    weight: "84",
    foot: "Left",
    weakFoot: "4",
    skillMoves: "5",
    attrs: {
      pace: 88,
      shooting: 80,
      passing: 55,
      dribbling: 64,
      defending: 30,
      physical: 71,
    },
  });

  const player = career.player;
  // Birthday is kept exactly as chosen, with the age still inside the 16-19 window.
  const birthday = fromDayIndex(player.dob);
  assert.equal(birthday.year, 2009);
  assert.equal(birthday.month, 7);
  assert.equal(birthday.day, 12);
  const startAge = ageOn(player.dob, career.calendar[0].matchday);
  assert.ok(startAge === 16 || startAge === 17, `start age ${startAge}`);
  assert.equal(player.height, 191);
  assert.equal(player.weight, 84);
  assert.equal(player.foot, "Left");
  assert.equal(player.weakFoot, 4);
  assert.equal(player.skillMoves, 5);
  // The sliders are honoured, but the starting overall is never boosted: the position's
  // most important stat is the one nudged to land back on exactly 70.
  assert.equal(player.attrs.pace, 88);
  assert.equal(player.attrs.passing, 55);
  assert.equal(player.attrs.defending, 30);
  assert.equal(calculateOverall(player), 70);
  assert.ok(player.subAttrs.finishing > 60);
});

test("a player's body decides how his stats are shaped, from creation onward", async () => {
  const data = await loadData();
  const make = (height, weight, seed) =>
    createCareer(data, {
      ...options(seed),
      position: "ST",
      height: String(height),
      weight: String(weight),
      attrs: {},
    }).player;

  const heavy = make(178, 100, 41);
  const lean = make(178, 62, 41);
  const short = make(158, 62, 41);
  const tall = make(198, 88, 41);

  // Overweight: slower but stronger.
  assert.ok(
    heavy.attrs.pace < lean.attrs.pace,
    "heavy player should be slower",
  );
  assert.ok(
    heavy.attrs.physical > lean.attrs.physical,
    "heavy player should be stronger",
  );
  assert.ok(heavy.subAttrs.sprintSpeed < lean.subAttrs.sprintSpeed);
  assert.ok(heavy.subAttrs.strength > lean.subAttrs.strength);
  // Short: cannot jump or head like a giant, but keeps the ball closer.
  assert.ok(short.subAttrs.jumping < tall.subAttrs.jumping);
  assert.ok(short.subAttrs.headingAccuracy < tall.subAttrs.headingAccuracy);
  assert.ok(short.subAttrs.ballControl > tall.subAttrs.ballControl);
  assert.ok(short.subAttrs.agility > tall.subAttrs.agility);
  // Whatever the body, a new career player still starts at 70.
  for (const player of [heavy, lean, short, tall]) {
    assert.equal(calculateOverall(player), 70);
  }
});

test("every generated player in the world gets a believable body", async () => {
  const data = await loadData();
  const career = createCareer(data, options(77));
  for (const player of career.players) {
    assert.ok(
      player.height >= 150 && player.height <= 210,
      `${player.last} ${player.height}cm`,
    );
    assert.ok(
      player.weight >= 50 && player.weight <= 120,
      `${player.last} ${player.weight}kg`,
    );
    assert.ok(player.physique, `${player.last} has no physique profile`);
  }
  const keepers = career.players.filter((p) => p.position === "GK");
  const wingers = career.players.filter(
    (p) => p.position === "LW" || p.position === "RW",
  );
  const mean = (list) =>
    list.reduce((sum, p) => sum + p.height, 0) / list.length;
  assert.ok(
    mean(keepers) > mean(wingers),
    "keepers should be taller than wingers",
  );
});

test("individual training can raise attributes but never the overall past potential", async () => {
  const data = await loadData();
  const career = createCareer(data, options(700));
  career.player.potential = calculateOverall(career.player);
  career.trainingPoints = data.careerSettings.training.attributePointCost * 99;
  const initialShooting = career.player.attrs.shooting;
  const initialFinishing = career.player.subAttrs.finishing;

  // A player already at his ceiling cannot train his base overall any higher: the
  // potential set when he was built is the ceiling, whatever he does on the pitch.
  const atCeiling = career.train("finishing");
  assert.equal(atCeiling.trained, false);
  assert.match(atCeiling.reason, /potential/);
  assert.equal(career.player.overall, career.player.potential);

  // With headroom, training works — and stops exactly at the potential.
  career.player.potential = Math.min(99, career.player.overall + 6);
  const ceiling = career.player.potential;
  const startOverall = career.player.overall;
  let sessions = 0;
  while (sessions < 99) {
    const result = career.train("finishing");
    if (!result.trained) break;
    sessions++;
  }
  assert.ok(sessions > 0);
  assert.ok(career.player.subAttrs.finishing > initialFinishing);
  assert.ok(career.player.attrs.shooting > initialShooting);
  // The ceiling holds: training closes the gap but never crosses the potential.
  assert.ok(career.player.overall >= startOverall);
  assert.ok(career.player.overall <= ceiling);
});

test("individual training upgrades one detailed attribute and supports keepers", async () => {
  const data = await loadData();
  const cost = data.careerSettings.training.attributePointCost;
  const career = createCareer(data, options(701));
  career.trainingPoints = cost;
  const initialFinishing = career.player.subAttrs.finishing;
  const initialAttributes = { ...career.player.attrs };

  const result = career.train("finishing");

  assert.equal(result.trained, true);
  assert.equal(career.player.subAttrs.finishing, initialFinishing + 1);
  assert.equal(
    career.player.attrs[SUB_ATTRIBUTE_GROUP.finishing],
    Math.round(
      SUB_ATTRIBUTES.shooting.reduce(
        (sum, attribute) => sum + career.player.subAttrs[attribute],
        0,
      ) / SUB_ATTRIBUTES.shooting.length,
    ),
  );
  assert.equal(
    career.player.attrs.shooting >= initialAttributes.shooting,
    true,
  );
  for (const attribute of Object.keys(initialAttributes)) {
    if (attribute !== "shooting")
      assert.equal(
        career.player.attrs[attribute],
        initialAttributes[attribute],
      );
  }
  assert.equal(career.trainingPoints, 0);
  assert.throws(
    () => career.train("shooting"),
    /Unsupported training attribute/,
  );

  const goalkeeper = createCareer(data, {
    ...options(702),
    position: "GK",
  });
  goalkeeper.trainingPoints = cost;
  const initialReflexes = goalkeeper.player.gkAttrs.reflexes;
  assert.equal(goalkeeper.train("reflexes").trained, true);
  assert.equal(goalkeeper.player.gkAttrs.reflexes, initialReflexes + 1);
});

test("correcting a career player's wrong XI role does not duplicate them", async () => {
  const data = await loadData();
  const career = createCareer(data, options(703));
  const user = career.player;
  const striker = career.players.find(
    (player) =>
      player.id !== user.id &&
      player.clubId === career.club.id &&
      player.position === user.position,
  );
  assert.ok(striker);

  const side = {
    xi: [user.id, striker.id],
    xiSlots: [
      { slot: "LW", id: user.id },
      { slot: "ST", id: striker.id },
    ],
    subs: [user.id],
  };
  career.matchSimulation = {
    userOnPitch: false,
    userSubbedOff: false,
    minute: 60,
  };

  career.bringPlayerOn({ side: "home", home: side, situations: [], misc: [] });

  assert.equal(side.xi.filter((id) => id === user.id).length, 1);
  assert.equal(side.xiSlots.find((entry) => entry.id === user.id).slot, "ST");
  assert.equal(
    side.xiSlots.find((entry) => entry.id === striker.id).slot,
    "LW",
  );
  assert.equal(side.subs.includes(user.id), false);
  assert.equal(new Set(side.xi).size, side.xi.length);
});

test("coach substitutions replace fatigued players for both live teams", async () => {
  const data = await loadData();
  const career = createCareer(data, options(704));
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  const match = report.userMatch;
  for (const sideName of ["home", "away"]) {
    for (const id of match[sideName].xi) {
      const player = career.players.find((entry) => entry.id === id);
      player.fatigue = 95;
    }
  }

  career.runCoachSubstitutions(match, 65);

  for (const sideName of ["home", "away"]) {
    assert.equal(match[sideName].substitutionsUsed, 1);
    assert.equal(new Set(match[sideName].xi).size, match[sideName].xi.length);
    assert.ok(
      match[sideName].xi.some((id) => !match[sideName].subs.includes(id)),
    );
  }
  assert.equal(match.misc.filter((event) => event.type === "sub").length, 2);
  const outgoingId = match.misc.find(
    (event) => event.type === "sub" && event.side === "home",
  ).playerId;
  const outgoingPlayer = career.players.find(
    (player) => player.id === outgoingId,
  );
  career.applyMatchIncident(match, {
    type: "injury",
    playerId: outgoingId,
    minute: 80,
    severity: "moderate",
  });
  assert.equal(outgoingPlayer.injury, null);
});

test("all supported formations provide a complete playable XI", async () => {
  const data = await loadData();
  const career = createCareer(data, options(702));

  assert.equal(FORMATION_NAMES.length, 14);
  for (const formation of FORMATION_NAMES) {
    assert.equal(
      FORMATIONS[formation].slots.length,
      11,
      `${formation} must have 11 slots`,
    );
    assert.equal(career.changeFormation(formation), formation);
    const lineup = selectLineup(
      career.players.filter((player) => career.club.squad.includes(player.id)),
      formation,
    );
    assert.equal(
      lineup.xi.length,
      11,
      `${formation} should fill all starting positions`,
    );
    assert.equal(
      new Set(lineup.xi.map((entry) => entry.player.id)).size,
      11,
      `${formation} must not place a player in more than one slot`,
    );
    assert.equal(lineup.formation, formation);
  }
  assert.throws(() => career.changeFormation("4-1-5"), /Unsupported formation/);
  const restored = createCareer(data, options(702), career.toJSON());
  assert.equal(restored.club.formation, "4-4-1-1");
  assert.equal(restored.club.userChosenFormation, true);
});

test("coaches keep the best players within their positional category", () => {
  const positions = [
    "GK",
    "LB",
    "CB",
    "CB",
    "RB",
    "CDM",
    "CDM",
    "CAM",
    "LW",
    "RW",
    "ST",
  ];
  const squad = positions.map((position, index) =>
    createPlayer({
      id: `lineup-test-${index}`,
      first: "Lineup",
      last: `${index}`,
      position,
      attrs: Object.fromEntries(
        [
          "pace",
          "shooting",
          "passing",
          "dribbling",
          "defending",
          "physical",
        ].map((attribute) => [attribute, position === "RW" ? 92 : 72]),
      ),
      gkAttrs:
        position === "GK"
          ? { reflexes: 72, handling: 72, positioning: 72, kicking: 72 }
          : {},
    }),
  );
  const secondRW = createPlayer({
    id: "lineup-test-second-rw",
    first: "Second",
    last: "RW",
    position: "RW",
    altPositions: ["CAM"],
    attrs: {
      pace: 91,
      shooting: 91,
      passing: 91,
      dribbling: 91,
      defending: 91,
      physical: 91,
    },
  });
  squad.push(secondRW);

  const lineup = selectLineup(squad, "4-2-3-1");
  const secondRwSlot = lineup.xi.find(
    (entry) => entry.player.id === "lineup-test-second-rw",
  )?.slot;
  assert.ok(["LW", "RW", "ST"].includes(secondRwSlot));
  assert.notEqual(secondRwSlot, "CAM");
  assert.equal(lineup.xi.length, 11);
});

test("coaches never move players between goalkeeper, defence, midfield, and forward", () => {
  const striker = createPlayer({
    id: "category-striker",
    position: "ST",
    attrs: {
      pace: 99,
      shooting: 99,
      passing: 99,
      dribbling: 99,
      defending: 99,
      physical: 99,
    },
  });
  const lineup = selectLineup(
    [
      striker,
      ...["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "CAM", "LW", "RW"].map(
        (position, index) =>
          createPlayer({
            id: `category-player-${index}`,
            position,
            attrs: Object.fromEntries(
              [
                "pace",
                "shooting",
                "passing",
                "dribbling",
                "defending",
                "physical",
              ].map((attribute) => [attribute, 60]),
            ),
            gkAttrs:
              position === "GK"
                ? { reflexes: 60, handling: 60, positioning: 60, kicking: 60 }
                : {},
          }),
      ),
    ],
    "4-2-3-1",
  );
  assert.ok(lineup.xi.some((entry) => entry.player.id === striker.id));
  assert.ok(
    ["LW", "RW", "ST"].includes(
      lineup.xi.find((entry) => entry.player.id === striker.id)?.slot,
    ),
  );
});

test("player careers negotiate with the manager instead of controlling formation or transfers", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7021));
  const moreTime = career.requestPlayingTime("more");
  assert.equal(moreTime.type, "playing-time");
  assert.ok(typeof moreTime.response === "string");
  const target = career.clubs.find((club) => club.id !== career.club.id);
  const transfer = career.requestTransfer(target.id);
  assert.equal(transfer.type, "transfer");
  assert.equal(transfer.details.clubId, target.id);
  assert.ok(
    career.pendingPlayerTransfer === null ||
      career.pendingPlayerTransfer.approved,
  );
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.deepEqual(
    restored.pendingPlayerTransfer,
    career.pendingPlayerTransfer,
  );
});

test("an approved transfer request moves the player and a declined request does not", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7022));
  const originalClub = career.club;
  const destination = career.clubs.find((club) => club.id !== originalClub.id);
  if (destination.squad.length >= 25) destination.squad.pop();
  destination.finances.transferBudget = 1_000_000_000;
  destination.finances.balance = 1_000_000_000;
  destination.finances.wageBudget = 1_000_000_000;
  career.player.trusting.manager = 0;
  career.player.lastMatchRating = 1;

  const declined = career.requestTransfer(destination.id);
  assert.equal(declined.approved, false);
  assert.equal(career.club, originalClub);
  assert.equal(career.player.clubId, originalClub.id);

  career.player.trusting.manager = 100;
  career.player.lastMatchRating = 10;
  const approved = career.requestTransfer(destination.id);
  assert.equal(approved.approved, true);
  assert.equal(career.club, destination);
  assert.equal(career.player.clubId, destination.id);
  assert.equal(originalClub.has(career.player.id), false);
  assert.equal(destination.has(career.player.id), true);
  assert.equal(career.transferHistory[0].toClubId, destination.id);
  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career.toJSON())),
  );
  assert.equal(restored.club.id, destination.id);
  assert.equal(restored.player.clubId, destination.id);
  assert.equal(restored.transferHistory[0].toClubId, destination.id);
});

test("an approved request for a better teammate signs the requested player", async () => {
  const career = createCareer(await loadData(), options(7024));
  const originalClub = career.club;
  const playerToSign = career.players.find(
    (player) => player.clubId !== originalClub.id && !player.isLegend,
  );
  assert.ok(playerToSign);
  const seller = career.clubs.find((club) => club.id === playerToSign.clubId);
  const reserve = createPlayer({
    id: "manager-request-reserve",
    first: "Reserve",
    last: "Player",
    position: "ST",
    clubId: seller.id,
    attrs: {
      pace: 55,
      shooting: 55,
      passing: 55,
      dribbling: 55,
      defending: 55,
      physical: 55,
    },
  });
  career.players.push(reserve);
  seller.squad.push(reserve.id);
  if (originalClub.squad.length >= 25) originalClub.squad.pop();
  originalClub.finances.transferBudget = 1_000_000_000;
  originalClub.finances.balance = 1_000_000_000;
  originalClub.finances.wageBudget = 1_000_000_000;
  career.player.trusting.manager = 100;
  career.player.lastMatchRating = 10;

  const request = career.requestBetterTeammates("", playerToSign.id);
  assert.equal(request.approved, true);
  assert.equal(request.signedPlayerId, playerToSign.id);
  assert.equal(playerToSign.clubId, originalClub.id);
  assert.equal(originalClub.has(playerToSign.id), true);
  assert.equal(seller.has(playerToSign.id), false);
  assert.equal(career.transferHistory[0].playerId, playerToSign.id);
  assert.equal(career.transferHistory[0].toClubId, originalClub.id);
});

test("approved playing-time and development requests affect selection and training", async () => {
  const career = createCareer(await loadData(), options(7023));
  career.player.trusting.manager = 100;
  career.player.lastMatchRating = 10;

  const moreTime = career.requestPlayingTime("more");
  assert.equal(moreTime.approved, true);
  assert.ok(career.matchInvolvement().minutes >= 25);

  const lessTime = career.requestPlayingTime("less");
  assert.equal(lessTime.approved, true);
  assert.equal(career.matchInvolvement().minutes, 0);

  const development = career.talkToManager("development");
  assert.equal(development.approved, true);
  const focus = career.trainingFocus;
  const attributes =
    career.player.position === "GK"
      ? career.player.gkAttrs
      : career.player.subAttrs;
  const previous = attributes[focus];
  career.trainingPoints =
    career.data.careerSettings.training.attributePointCost;
  const training = career.train(focus);
  assert.equal(training.trained, true);
  assert.equal(attributes[focus], previous + 2);
  assert.equal(career.player.managerTrainingBonus, false);
});

test("player conversations and retirement persist without deleting career records", async () => {
  const career = createCareer(await loadData(), options(98761));
  const conversation = career.talkToManager("future");
  assert.equal(conversation.manager, career.club.manager.name);
  assert.equal(career.conversationHistory.length, 1);
  career.player.stats.apps = 12;
  career.player.stats.goals = 4;
  career.player.honours.push({
    id: "test-honour",
    season: career.season,
    competition: career.league.name,
    award: "Champion",
  });
  const summary = career.retireCareer();
  assert.equal(career.careerEnded, true);
  assert.equal(career.player.retired, true);
  assert.equal(summary.goals, 4);
  const restored = createCareer(
    await loadData(),
    career.creation,
    career.toJSON(),
  );
  assert.equal(restored.careerEnded, true);
  assert.equal(restored.conversationHistory.length, 1);
  assert.equal(restored.player.honours.length, 1);
});

test("custom squad selection swaps a substitute into the selected matchday slot", async () => {
  const data = await loadData();
  const career = createCareer(data, options(703));
  const squad = career.players.filter((player) =>
    career.club.squad.includes(player.id),
  );
  const lineup = selectLineup(squad, career.club.formation);
  const outgoing = lineup.xi.find((entry) => entry.slot !== "GK");
  const goalkeeper = lineup.xi.find((entry) => entry.slot === "GK");
  const outgoingCategory = outgoing ? groupOf(outgoing.player.position) : null;
  const incoming = lineup.subs.find(
    (player) =>
      player.position !== "GK" && groupOf(player.position) === outgoingCategory,
  );
  assert.ok(outgoing);
  assert.ok(goalkeeper);
  assert.ok(incoming);
  assert.throws(
    () => career.changeLineup(goalkeeper.player.id, incoming.id),
    /Goalkeepers can only replace the goalkeeper/,
  );

  const change = career.changeLineup(outgoing.player.id, incoming.id);
  assert.equal(change.slot, outgoing.slot);
  assert.equal(
    career.club.customXI.find((entry) => entry.slotIndex === outgoing.slotIndex)
      .playerId,
    incoming.id,
  );
  const updated = selectLineup(squad, career.club.formation, 0, {
    customXI: career.club.customXI,
  });
  assert.equal(
    updated.xi.find((entry) => entry.slotIndex === outgoing.slotIndex).player
      .id,
    incoming.id,
  );
  assert.ok(updated.subs.some((player) => player.id === outgoing.player.id));

  const opponent = career.clubs.find((club) => club.id !== career.club.id);
  const match = simulateMatch({
    home: {
      club: career.club,
      players: career.players,
      strength: matchStrength(career.club, career.players, 0),
    },
    away: {
      club: opponent,
      players: career.players,
      strength: matchStrength(opponent, career.players, 0),
    },
    rng: new RngBundle(703).stream("custom-lineup-test"),
    dayIndex: 0,
  });
  assert.equal(
    match.home.xiSlots.find((entry) => entry.slotIndex === outgoing.slotIndex)
      .id,
    incoming.id,
  );

  const restored = createCareer(data, options(703), career.toJSON());
  assert.deepEqual(restored.club.customXI, career.club.customXI);
  assert.equal(
    selectLineup(
      restored.players.filter((player) =>
        restored.club.squad.includes(player.id),
      ),
      restored.club.formation,
      0,
      { customXI: restored.club.customXI },
    ).xi.find((entry) => entry.slotIndex === outgoing.slotIndex).player.id,
    incoming.id,
  );
});

test("career player in a custom starting XI is marked on the pitch, not on the bench", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7032));
  const squad = career.players.filter((player) =>
    career.club.squad.includes(player.id),
  );
  const lineup = selectLineup(squad, career.club.formation);
  const naturalSlot = lineup.xi.find(
    (entry) => entry.slot === career.player.position,
  );
  assert.ok(
    naturalSlot,
    "the selected formation must include the player's role",
  );
  career.club.customXI = lineup.xi.map(({ slot, slotIndex, player }) => ({
    slot,
    slotIndex,
    playerId:
      slotIndex === naturalSlot.slotIndex ? career.player.id : player.id,
  }));

  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);

  assert.ok(
    report.userMatch[report.userMatch.side].xi.includes(career.player.id),
  );
  assert.equal(career.matchSimulation.userStarted, true);
  assert.equal(career.matchSimulation.userOnPitch, true);
  assert.equal(career.matchSimulation.userStatus, "starter");
});

test("a player excluded from the squad cannot appear in the match", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7033));
  career.club.squad = career.club.squad.filter(
    (playerId) => playerId !== career.player.id,
  );
  assert.equal(career.getPlayerMatchSelection().status, "not-selected");
  assert.equal(career.matchInvolvement().minutes, 0);

  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);

  const match = report.userMatch;
  const side = match[match.side];
  assert.equal(side.xi.includes(career.player.id), false);
  assert.equal(side.subs.includes(career.player.id), false);
  assert.equal(career.matchSimulation.userStatus, "not-selected");
  assert.equal(match.playerResult.played, false);
  assert.equal(match.playerResult.minutes, 0);
  assert.equal(match.playerResult.rating, null);
  assert.deepEqual(match.playerResult.keyMoments, []);

  career.startMatchSimulation();
  while (career.matchSimulation.status !== "finished") {
    const state = career.tickMatchSimulation();
    assert.notEqual(state.status, "paused");
  }
  assert.equal(career.player.stats.apps, 0);
  assert.equal(career.player.stats.goals, 0);
  assert.equal(career.player.stats.assists, 0);
  assert.equal(career.league.table.row(career.club.id).played, 1);
});

test("injured and suspended players are excluded from the player match", async () => {
  const data = await loadData();
  for (const [seed, unavailable] of [
    [
      7034,
      (player) =>
        (player.injury = {
          type: "moderate",
          label: "Moderate injury",
          weeks: 100,
        }),
    ],
    [7035, (player) => (player.suspensionWeeks = 100)],
  ]) {
    const career = createCareer(data, options(seed));
    unavailable(career.player);
    assert.equal(career.getPlayerMatchSelection().status, "not-selected");

    let report;
    do {
      report = career.advanceWeek();
    } while (!report.userMatch);

    const match = report.userMatch;
    const side = match[match.side];
    assert.equal(side.xi.includes(career.player.id), false);
    assert.equal(side.subs.includes(career.player.id), false);
    assert.equal(career.matchSimulation.userStatus, "not-selected");
    assert.equal(match.playerResult.played, false);
    assert.equal(match.playerResult.minutes, 0);
    assert.equal(match.playerResult.rating, null);
    assert.deepEqual(match.playerResult.keyMoments, []);
  }
});

test("custom XI assignments preserve both slots when a formation repeats a position", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7031));
  career.changeFormation("4-4-2");
  const squad = career.players.filter((player) =>
    career.club.squad.includes(player.id),
  );
  const lineup = selectLineup(squad, career.club.formation);
  const centerBacks = lineup.xi.filter((entry) => entry.slot === "CB");
  const strikers = lineup.xi.filter((entry) => entry.slot === "ST");
  assert.equal(centerBacks.length, 2);
  assert.equal(strikers.length, 2);

  career.club.customXI = lineup.xi.map(({ slot, slotIndex, player }) => ({
    slot,
    slotIndex,
    playerId: player.id,
  }));
  const updated = selectLineup(squad, career.club.formation, 0, {
    customXI: career.club.customXI,
  });
  assert.equal(new Set(updated.xi.map((entry) => entry.player.id)).size, 11);
  for (const entry of [...centerBacks, ...strikers]) {
    assert.equal(
      updated.xi.find((candidate) => candidate.slotIndex === entry.slotIndex)
        .player.id,
      entry.player.id,
    );
  }
});

test("Real Madrid uses a formation with two strikers", () => {
  assert.equal(REAL_FORMATIONS["real madrid"], "4-4-2");
  assert.equal(
    FORMATIONS[REAL_FORMATIONS["real madrid"]].slots.filter(
      (slot) => slot === "ST",
    ).length,
    2,
  );
});

test("clubs with empty imported rosters receive a full generated squad in every playable league", async () => {
  const data = await loadData();
  const emptyRosterData = {
    ...data,
    careerLeagues: data.careerLeagues.map((entry) => ({
      ...entry,
      rostersByClub: {},
    })),
  };

  for (const entry of emptyRosterData.careerLeagues) {
    const career = createCareer(emptyRosterData, {
      ...options(),
      leagueId: entry.id,
      clubId: entry.league.teamIds[0],
    });

    for (const club of career.clubs) {
      const generatedPlayers = career.players.filter(
        (player) => player.clubId === club.id && player.id.startsWith("squad-"),
      );
      assert.equal(
        generatedPlayers.length,
        20,
        `${entry.league.name}: ${club.name}`,
      );
      assert.ok(
        club.squad.length >= 20,
        `${entry.league.name}: ${club.name} has enough registered players`,
      );
    }
  }
});

test("key moments offer more than 30 position-specific action choices", async () => {
  const data = await loadData();
  const actionIds = new Set();

  for (const [kind, groups] of Object.entries(data.keyMomentOptions.moments)) {
    for (const actions of Object.values(groups)) {
      assert.ok(
        actions.length >= 4,
        `${kind} should offer at least four choices per position group`,
      );
      for (const action of actions) actionIds.add(action.id);
    }
  }
  assert.ok(actionIds.size > 30);

  for (const position of POSITIONS) {
    for (const kind of Object.keys(data.keyMomentOptions.moments)) {
      assert.ok(
        keyMomentActions(kind, position, data.keyMomentOptions).length >= 4,
        `${position} ${kind}`,
      );
    }
    for (const position of POSITIONS) {
      const actions = keyMomentActions(
        "bigPass",
        position,
        data.keyMomentOptions,
      );
      assert.ok(
        actions.some((action) => action.id.startsWith("extra-")),
        `${position} should have actions tailored to its exact position`,
      );
    }
  }
  assert.equal(data.keyMomentOptions.positionGroups.ST, "striker");
  for (const kind of ["bigPass", "chance", "penalty", "oneOnOne"]) {
    assert.ok(
      keyMomentActions(kind, "ST", data.keyMomentOptions).length >= 5,
      `strikers need expanded ${kind} choices`,
    );
  }
  for (const position of Object.keys(data.keyMomentOptions.positionGroups)) {
    const kinds =
      position === "GK"
        ? ["bigPass", "keeperSave"]
        : ["bigPass", "chance", "penalty", "oneOnOne", "lastDitch"];
    assert.equal(
      kinds.reduce(
        (sum, kind) =>
          sum +
          keyMomentActions(kind, position, data.keyMomentOptions).filter(
            (action) => action.id.startsWith("extra-"),
          ).length,
        0,
      ),
      kinds.length * 10,
    );
  }
  const career = createCareer(data, options(7128));
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  assert.ok(report.userMatch.playerResult.keyMoments.length <= 3);
  for (const moment of report.userMatch.playerResult.keyMoments) {
    assert.equal(moment.options.length, 3);
    assert.equal(new Set(moment.options).size, 3);
    const actionIdsForMoment = new Set(
      keyMomentActions(
        moment.kind,
        career.player.position,
        data.keyMomentOptions,
      ).map((action) => action.id),
    );
    assert.ok(moment.options.every((id) => actionIdsForMoment.has(id)));
  }
});

test("live key moments cover the responsibilities of every position", async () => {
  const data = await loadData();
  const career = createCareer(data, options(71281));
  const match = {
    homeGoals: 2,
    awayGoals: 1,
    events: [],
    misc: [],
  };
  const expectedMoment = {
    GK: "keeperSave",
    CB: "lastDitch",
    LB: "lastDitch",
    RB: "lastDitch",
    DM: "lastDitch",
    CDM: "lastDitch",
    CM: "bigPass",
    AM: "chance",
    CAM: "chance",
    LW: "oneOnOne",
    RW: "oneOnOne",
    ST: "chance",
  };

  for (const [index, position] of POSITIONS.entries()) {
    const observed = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const result = simulatePlayerMatch({
        player: career.player,
        match,
        side: "home",
        opponents: [],
        rng: new RngBundle(seed + index * 100).stream("position-moments"),
        position,
        minutes: 90,
        role: "Balanced",
        catalog: data.keyMomentOptions,
      });
      for (const moment of result.keyMoments) observed.add(moment.kind);
    }
    assert.ok(
      observed.has(expectedMoment[position]),
      `${position} should receive ${expectedMoment[position]} moments`,
    );
  }
});

test("selected passing actions resolve with their own attributes and match effects", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7129));
  let report;
  do {
    report = career.advanceWeek();
    if (
      report.userMatch &&
      report.userMatch.playerResult.keyMoments.length === 0
    ) {
      while (career.matchSimulation.status !== "finished") {
        career.advanceMatchSimulation();
      }
    }
  } while (
    !report.userMatch ||
    !report.userMatch.playerResult.keyMoments.length
  );

  const match = report.userMatch;
  match.playerResult.keyMoments[0].kind = "bigPass";
  career.startMatchSimulation();
  const state = career.advanceMatchSimulation();
  assert.equal(state.status, "paused");
  const action = keyMomentActions(
    "bigPass",
    career.player.position,
    data.keyMomentOptions,
  )[0];
  const originalStream = career.rng.stream.bind(career.rng);
  career.rng.stream = (name) =>
    name === "player-moments" ? { chance: () => true } : originalStream(name);
  const keyPassesBefore = match.playerResult.stats.keyPasses;
  const result = career.resolveKeyMoment(state.momentIndex, action.id);

  assert.equal(result.decision, action.id);
  assert.equal(result.action.label, action.label);
  assert.equal(result.success, true);
  assert.equal(match.playerResult.stats.keyPasses, keyPassesBefore + 1);
  assert.equal(match.playerResult.stats.passesCompleted > 0, true);
});

test("player roles change match behavior and cover specialist styles", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7130));
  const player = career.player;
  const opponents = [
    career.players.find((candidate) => candidate.position === "GK"),
    career.players.find((candidate) => candidate.position === "CB"),
  ].filter(Boolean);
  const match = {
    homeGoals: 2,
    awayGoals: 1,
    events: [],
    misc: [],
  };
  const totalStats = (role) => {
    const totals = { passes: 0, shots: 0, tackles: 0, keyPasses: 0 };
    for (let seed = 1; seed <= 80; seed++) {
      const result = simulatePlayerMatch({
        player,
        match,
        side: "home",
        opponents,
        rng: new RngBundle(seed).stream("role-behavior"),
        position: "ST",
        minutes: 90,
        role,
        catalog: data.keyMomentOptions,
      });
      assert.equal(result.role, role);
      for (const stat of Object.keys(totals))
        totals[stat] += result.stats[stat];
    }
    return totals;
  };
  const balanced = totalStats("Balanced");
  const poacher = totalStats("Poacher");
  const ballWinner = totalStats("Ball-Winning Midfielder");
  const playmaker = totalStats("Deep-Lying Playmaker");

  assert.ok(PLAYER_ROLE_OPTIONS.length >= 15);
  const modifierFields = Object.keys(ROLE_MODIFIERS.Balanced);
  for (const { name, description } of PLAYER_ROLE_OPTIONS) {
    assert.deepEqual(
      Object.keys(ROLE_MODIFIERS[name]).sort(),
      modifierFields.slice().sort(),
      `${name} defines every simulation modifier`,
    );
    assert.ok(
      Object.values(ROLE_MODIFIERS[name]).every(Number.isFinite),
      `${name} has finite simulation modifiers`,
    );
    assert.equal(ROLE_DESCRIPTIONS[name], description);
    assert.ok(description.length > 20, `${name} has a useful description`);
  }
  assert.ok(
    playerRoleOptionsForPosition("ST").some(({ name }) => name === "Poacher"),
  );
  assert.equal(
    playerRoleOptionsForPosition("ST").some(
      ({ name }) => name === "Sweeper Keeper",
    ),
    false,
  );
  assert.ok(
    playerRoleOptionsForPosition("GK").some(
      ({ name }) => name === "Sweeper Keeper",
    ),
  );
  assert.ok(poacher.shots > balanced.shots);
  assert.ok(ballWinner.tackles > balanced.tackles);
  assert.ok(playmaker.passes > balanced.passes);
  assert.ok(playmaker.keyPasses > balanced.keyPasses);
});

test("the agent gate enables transfer offers and a transfer acceptance path", async () => {
  const data = await loadData();
  data.agents = [
    {
      id: "agent-1",
      name: "Milo Ace",
      specialty: "Deals",
      rating: 80,
      fee: 100000,
      reputation: 75,
    },
    {
      id: "agent-2",
      name: "Ava North",
      specialty: "Contracts",
      rating: 75,
      fee: 90000,
      reputation: 70,
    },
  ];
  const career = createCareer(data, options());
  career.money = 500000;
  assert.throws(() => career.generateTransferOffers(), /agent/);
  const startingMoney = career.money;
  const hired = career.hireAgent("agent-1");
  assert.equal(hired.agent.name, "Milo Ace");
  assert.equal(career.money, startingMoney - 100000 - 8000);
  assert.ok(
    career.financialHistory.some((entry) => entry.type === "agent-hire"),
  );
  assert.ok(career.transferOffers.length > 0);
  assert.deepEqual(career.agentPerformance["agent-1"], {
    searches: 1,
    offers: career.transferOffers.length,
    deals: 0,
  });
  assert.throws(() => career.generateTransferOffers(), /two weeks/);

  const requestedClubId = career.transferOffers[0].clubId;
  career.transferMarketState.searchCount = 0;
  career.transferMarketState.lastSearchDay = null;
  const requestedOffers = career.generateTransferOffers({
    clubIds: [requestedClubId],
  });
  assert.ok(requestedOffers.length > 0);
  assert.ok(requestedOffers.every((offer) => offer.clubId === requestedClubId));
});

test("hiring an agent requires enough money and charges the user", async () => {
  const data = await loadData();
  const career = createCareer(data, options(41828));
  const startingMoney = career.money;
  assert.throws(() => career.hireAgent(career.agentPool[0].id), /to hire/);
  assert.equal(career.money, startingMoney);
  assert.equal(career.agent, null);
});

test("limited destination searches accept a move into another playable league", async () => {
  const data = await loadData();
  const career = createCareer(data, options(22841));
  career.week = 0;
  career.money = 5_000_000;
  const summer = new Date(
    Date.UTC(2000, 0, 1) + career.calendar[0].day * 86400000,
  );
  summer.setUTCMonth(6, 15);
  career.calendar[0].day = Math.round(
    (summer.getTime() - Date.UTC(2000, 0, 1)) / 86400000,
  );
  career.calendar[0].matchday = career.calendar[0].day + 5;
  career.player.overall = 90;
  career.player.potential = 94;
  career.hireAgent(career.agentPool[0].id);
  for (const club of career.clubs) {
    const striker = career.players.find(
      (item) => item.clubId === club.id && item.position === "ST",
    );
    if (!striker) continue;
    striker.overall = 45;
    striker.potential = 52;
    striker.source = "generated";
    for (const attribute of Object.keys(striker.subAttrs ?? {}))
      striker.subAttrs[attribute] = 45;
  }
  career.transferMarketState.searchCount = 0;
  career.transferMarketState.lastSearchDay = null;
  const searchedOffers = career.generateTransferOffers();
  assert.ok(
    searchedOffers.length > 0,
    "the window search should find some suitable clubs",
  );
  const crossLeagueOffer = searchedOffers.find(
    (offer) => offer.leagueName !== career.league.name,
  );
  if (!crossLeagueOffer) {
    assert.throws(
      () => career.generateTransferOffers(),
      /two weeks|searches are used/,
    );
    return;
  }
  const formerClub = career.club;
  const result = career.resolveTransferOffer(crossLeagueOffer.id, "accept");
  const destinationClub = career.clubs.find(
    (club) => club.id === crossLeagueOffer.clubId,
  );
  assert.equal(result.accepted, true);
  assert.equal(career.agentPerformance[career.agent.id].deals, 1);
  assert.equal(career.league.name, crossLeagueOffer.leagueName);
  assert.equal(career.club.id, crossLeagueOffer.clubId);
  assert.equal(career.player.clubId, crossLeagueOffer.clubId);
  assert.ok(destinationClub.squad.includes(career.player.id));
  assert.ok(!formerClub?.squad.includes(career.player.id));
  assert.equal(career.player.leagueGoals, 0);
  assert.equal(career.player.leagueAssists, 0);
  assert.deepEqual(career.player.leaguePerformance, { apps: 0, ratingSum: 0 });
  assert.equal(career.getLeagueSeasonProgress().total, 6);
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.equal(restored.league.name, crossLeagueOffer.leagueName);
  assert.equal(restored.club.id, crossLeagueOffer.clubId);
  assert.ok(restored.club.squad.includes(restored.player.id));
  assert.ok(
    !restored.clubs.some(
      (club) =>
        club.id !== restored.club.id && club.squad.includes(restored.player.id),
    ),
  );
  assert.deepEqual(restored.agentPerformance, career.agentPerformance);
  assert.deepEqual(restored.player.leaguePerformance, {
    apps: 0,
    ratingSum: 0,
  });
  assert.equal(restored.worldLeagues.length, 5);
});

test("manager transfers reconcile the destination squad and survive save restoration", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    ...options(55118),
    managerMode: true,
    manager: {
      first: "Alex",
      last: "Manager",
      clubId: "hull",
      nationality: "ENG",
    },
  });
  const destination = career.club;
  destination.finances.transferBudget = 1_000_000_000;
  destination.finances.balance = 1_000_000_000;
  destination.finances.wageBudget = 1_000_000_000;
  const formerClub = career.clubs.find((club) => club.id !== destination.id);
  const target = career.players.find(
    (player) => player.clubId === formerClub.id && !player.isLegend,
  );
  const extraPlayer = career.players.find(
    (player) => player.clubId === destination.id && !player.isLegend,
  );
  assert.ok(target && extraPlayer, "a transferable player should be available");
  destination.removePlayer(extraPlayer.id);
  extraPlayer.clubId = formerClub.id;
  formerClub.addPlayer(extraPlayer.id);
  assert.ok(formerClub.squad.length > 20);
  career.buyPlayer(target.id, { fee: 1, wage: 0 });

  assert.equal(target.clubId, destination.id);
  assert.ok(destination.squad.includes(target.id));
  assert.ok(!formerClub.squad.includes(target.id));
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  const restoredPlayer = restored.players.find((player) => player.id === target.id);
  assert.equal(restoredPlayer.clubId, restored.club.id);
  assert.ok(restored.club.squad.includes(target.id));
  assert.ok(
    !restored.clubs.some(
      (club) =>
        club.id !== restored.club.id && club.squad.includes(target.id),
    ),
  );
});

test("background leagues record player scoring and rating stats for cross-league browsing", async () => {
  const data = await loadData();
  const career = createCareer(data, options(66519));
  for (let week = 0; week < 8; week++) advanceAndResolve(career);
  const worldLeague = career.worldLeagues.find(
    ({ league }) => league.name !== "Premier League",
  );
  assert.ok(worldLeague.performers.some((player) => player.apps > 0));
  for (const performer of worldLeague.performers) {
    assert.ok(Number.isFinite(performer.overall));
    assert.equal(performer.overall, calculateOverall(performer));
  }
  const totalGoals = worldLeague.league.table
    .sorted()
    .reduce((sum, row) => sum + row.goalsFor, 0);
  assert.equal(
    worldLeague.performers.reduce((sum, player) => sum + player.goals, 0),
    totalGoals,
  );
  assert.ok(worldLeague.performers.some((player) => player.ratingSum > 0));
  assert.ok(worldLeague.performers.some((player) => player.assists > 0));
});

test("background-league player match histories are recorded and saved", async () => {
  const data = await loadData();
  const career = createCareer(data, options(66520));
  for (let week = 0; week < 8; week++) advanceAndResolve(career);
  const worldLeague = career.worldLeagues.find(
    ({ league }) => league.name !== "Premier League",
  );
  const playersWithAppearances = worldLeague.performers.filter(
    (player) => player.apps > 0,
  );
  assert.ok(playersWithAppearances.length > 0);
  for (const player of playersWithAppearances) {
    assert.equal(player.matchHistory.length, player.apps);
    assert.ok(
      player.matchHistory.every(
        (match) =>
          match.competitionId === worldLeague.league.id &&
          match.competition === worldLeague.league.name &&
          match.club &&
          match.opponent &&
          match.rating != null,
      ),
    );
  }

  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  const restoredLeague = restored.worldLeagues.find(
    ({ league }) => league.id === worldLeague.league.id,
  );
  for (const performer of playersWithAppearances) {
    assert.deepEqual(
      restoredLeague.performers.find((entry) => entry.id === performer.id)
        ?.matchHistory,
      performer.matchHistory,
    );
  }
});

test("world-league match stats avoid goalkeeper assists and cap individual match scoring", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7041));
  const state = career.worldLeagues.find(
    (entry) => entry.league.name === "Serie A",
  );
  const [clubId, opponentId] = state.league.teamIds;
  const positions = [
    "GK",
    "ST",
    "ST",
    "LW",
    "RW",
    "AM",
    "CM",
    "CDM",
    "LB",
    "RB",
    "CB",
  ];
  const players = positions.map((position, index) => ({
    id: `test-world-performer-${index}`,
    first: `Test${index}`,
    last: "Player",
    position,
    overall: 90,
    clubId,
    apps: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
  }));
  state.performers = players;

  career.recordWorldLeaguePerformers(
    state,
    clubId,
    opponentId,
    10,
    0,
    new RngBundle(7041).stream("world-stats-realism"),
  );

  const goalkeeper = players.find((player) => player.position === "GK");
  assert.equal(goalkeeper.assists, 0);
  assert.ok(players.every((player) => player.goals <= 2));
  assert.ok(players.every((player) => player.assists <= 1));
});

test("world-league player records use the simulated scorers and match statistics", async () => {
  const career = createCareer(await loadData(), options(7042));
  const state = career.worldLeagues.find(
    (entry) => entry.league.name === "Serie A",
  );
  const [clubId, opponentId] = state.league.teamIds;
  const players = [
    "GK",
    "ST",
    "ST",
    "LW",
    "RW",
    "AM",
    "CM",
    "CDM",
    "LB",
    "RB",
    "CB",
  ].map((position, index) => ({
    id: `world-event-player-${index}`,
    first: `World${index}`,
    last: "Event",
    position,
    overall: 80,
    clubId,
    apps: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
  }));
  state.performers = players;
  const xi = career.worldClubStartingXI(state, clubId);
  const scorer = xi.find((player) => player.position === "ST");
  const assister = xi.find((player) => player.position === "CM");
  const matchSimulation = {
    events: [
      {
        type: "goal",
        side: "home",
        scorerId: scorer.id,
        assistId: assister.id,
      },
    ],
    playerStats: Object.fromEntries(
      xi.map((player) => [
        player.id,
        {
          minutes: 90,
          passAttempts: 10,
          completedPasses: 9,
          shots: player.id === scorer.id ? 1 : 0,
          shotsOnTarget: player.id === scorer.id ? 1 : 0,
          goals: player.id === scorer.id ? 1 : 0,
          assists: player.id === assister.id ? 1 : 0,
          tacklesWon: 0,
          interceptions: 0,
          dribblesWon: 0,
          keyPasses: player.id === assister.id ? 1 : 0,
          saves: 0,
          possessionLosses: 0,
        },
      ]),
    ),
  };

  career.recordWorldLeaguePerformers(
    state,
    clubId,
    opponentId,
    1,
    0,
    new RngBundle(7042).stream("world-event-records"),
    matchSimulation,
  );

  assert.equal(scorer.goals, 1);
  assert.equal(assister.assists, 1);
  assert.equal(scorer.lastMatchPerformance.goals, 1);
  assert.equal(assister.lastMatchPerformance.assists, 1);
  assert.equal(
    players.reduce((total, player) => total + player.goals, 0),
    1,
  );
});

test("career player starts only in their natural position across every field role", async () => {
  const data = await loadData();
  const career = createCareer(data, options(74901));
  career.club.formation = "4-3-3";
  const squad = career.players.filter((player) =>
    career.club.squad.includes(player.id),
  );
  for (const position of [
    "GK",
    "CB",
    "LB",
    "RB",
    "DM",
    "CM",
    "AM",
    "LW",
    "RW",
    "ST",
  ]) {
    career.player.position = position;
    career.player.altPositions = ["CB"];
    career.player.overall = 99;
    const lineup = selectLineup(squad, "4-3-3", 0, {
      forcedXI: [career.player.id],
    });
    const entry = lineup.xi.find((item) => item.player.id === career.player.id);
    if (entry)
      assert.equal(
        entry.slot,
        position,
        `${position} career player must not be assigned to ${entry.slot}`,
      );
    assert.equal(
      lineup.xi.some(
        (item) => item.player.id === career.player.id && item.slot !== position,
      ),
      false,
    );
  }
});

test("the best natural-position player starts and the user can replace them when tired", async () => {
  const data = await loadData();
  const career = createCareer(data, options(74902));
  career.club.formation = "4-3-3";
  career.club.userChosenFormation = true;
  career.club.customXI = [];
  const incumbent = career.players.find(
    (player) =>
      player.clubId === career.club.id &&
      player.position === career.player.position &&
      player.id !== career.player.id,
  );
  assert.ok(incumbent);
  career.club.squad = [...new Set([...career.club.squad, incumbent.id])];
  const supportingAttackers = career.players.filter(
    (player) =>
      player.clubId === career.club.id &&
      career.club.squad.includes(player.id) &&
      player.id !== career.player.id &&
      player.id !== incumbent.id &&
      groupOf(player.position) === "ATT",
  );
  assert.ok(supportingAttackers.length >= 2);
  career.club.customXI = [
    {
      slot: "ST",
      slotIndex: FORMATIONS["4-3-3"].slots.indexOf("ST"),
      playerId: incumbent.id,
    },
    ...["LW", "RW"].map((slot, index) => ({
      slot,
      slotIndex: FORMATIONS["4-3-3"].slots.indexOf(slot),
      playerId: supportingAttackers[index].id,
    })),
  ];
  career.player.overall = 55;
  career.player.attrs = Object.fromEntries(
    Object.keys(career.player.attrs).map((attribute) => [attribute, 45]),
  );
  career.player.attrs.shooting = 50;
  incumbent.attrs = Object.fromEntries(
    Object.keys(incumbent.attrs).map((attribute) => [attribute, 99]),
  );
  incumbent.overall = 99;
  incumbent.fatigue = 0;
  assert.equal(career.matchInvolvement().starts, false);
  assert.equal(career.matchInvolvement().minutes, 0);
  assert.equal(career.matchInvolvement().outgoingPlayerId, undefined);

  career.player.trusting.manager = 60;
  career.player.attrs = Object.fromEntries(
    Object.keys(career.player.attrs).map((attribute) => [attribute, 88]),
  );
  career.player.attrs.shooting = 92;
  career.player.overall = 70;
  incumbent.fatigue = 40;
  const tiredRotation = career.matchInvolvement();
  assert.equal(tiredRotation.starts, false);
  assert.equal(tiredRotation.subOnMinute, 55);
  assert.equal(tiredRotation.outgoingPlayerId, incumbent.id);

  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  const side = report.userMatch[report.userMatch.side];
  assert.ok(
    side.xi.includes(incumbent.id),
    "the higher-rated player must start",
  );
  assert.equal(side.xi.includes(career.player.id), false);
  assert.equal(side.subs.includes(career.player.id), true);
  career.startMatchSimulation();
  career.matchSimulation.minute = 55;
  career.matchSimulation.status = "running";
  const entry = career.bringPlayerOn(report.userMatch);
  assert.ok(entry, "a tired incumbent should trigger the planned substitution");
  assert.equal(side.xi.includes(incumbent.id), false);
  assert.equal(
    side.xiSlots.find((slot) => slot.id === career.player.id)?.slot,
    "ST",
  );
});

test("a top-rated career player starts even when manager trust is low", async () => {
  const data = await loadData();
  const career = createCareer(data, options(74904));
  career.club.formation = "4-3-3";
  career.player.trusting.manager = 10;
  career.player.attrs = Object.fromEntries(
    Object.keys(career.player.attrs).map((attribute) => [attribute, 99]),
  );
  career.player.overall = calculateOverall(career.player);
  for (const teammate of career.players) {
    if (
      teammate.clubId === career.club.id &&
      teammate.position === career.player.position &&
      teammate.id !== career.player.id
    ) {
      teammate.attrs = Object.fromEntries(
        Object.keys(teammate.attrs).map((attribute) => [attribute, 30]),
      );
      teammate.overall = calculateOverall(teammate);
    }
  }

  assert.equal(career.matchInvolvement().starts, true);
});

test("developer mode edits attributes without spending training points and shirt numbers persist", async () => {
  const data = await loadData();
  const career = createCareer(data, options(74905));
  const pointsBefore = career.trainingPoints;
  const shirtNumber = career.player.shirtNumber;

  assert.equal(
    new Set(
      career.players
        .filter((player) => career.club.squad.includes(player.id))
        .map((player) => player.shirtNumber),
    ).size,
    career.club.squad.length,
  );
  assert.equal(Number.isInteger(shirtNumber), true);
  const teammateNumber = career.players.find(
    (player) =>
      player.id !== career.player.id && career.club.squad.includes(player.id),
  ).shirtNumber;
  assert.throws(
    () => career.setPlayerShirtNumber(teammateNumber),
    /already in use/,
  );
  assert.throws(
    () => career.setPlayerShirtNumber(100),
    /whole number from 1 to 99/,
  );
  const availableNumber = Array.from(
    { length: 99 },
    (_, index) => index + 1,
  ).find(
    (number) =>
      !career.players.some(
        (player) =>
          player.id !== career.player.id &&
          career.club.squad.includes(player.id) &&
          player.shirtNumber === number,
      ),
  );
  assert.equal(career.setPlayerShirtNumber(availableNumber), availableNumber);
  assert.throws(
    () => career.setPlayerAttribute("pace", 99),
    /Enable developer mode/,
  );
  career.setDeveloperMode(true);
  career.setPlayerAttribute("pace", 99);

  assert.equal(career.player.attrs.pace, 99);
  assert.equal(career.trainingPoints, pointsBefore);
  assert.equal(career.developerMode, true);
  const restored = createCareer(data, options(74905), career.toJSON());
  assert.equal(restored.developerMode, false);
  assert.equal(restored.player.shirtNumber, availableNumber);
});

test("ST substitute enters only in the ST slot and does not replace another position", async () => {
  const data = await loadData();
  const career = createCareer(data, options(74903));
  career.player.trusting.manager = 35;
  career.club.formation = "4-3-3";
  career.club.userChosenFormation = true;
  career.player.attrs = Object.fromEntries(
    Object.keys(career.player.attrs).map((attribute) => [attribute, 80]),
  );
  career.player.overall = calculateOverall(career.player);
  const incumbent = career.players.find(
    (player) =>
      player.clubId === career.club.id &&
      player.position === "ST" &&
      player.id !== career.player.id,
  );
  assert.ok(incumbent);
  const supportingAttackers = career.players.filter(
    (player) =>
      player.clubId === career.club.id &&
      career.club.squad.includes(player.id) &&
      player.id !== career.player.id &&
      player.id !== incumbent.id &&
      groupOf(player.position) === "ATT",
  );
  assert.ok(supportingAttackers.length >= 2);
  career.club.customXI = [
    {
      slot: "ST",
      slotIndex: FORMATIONS["4-3-3"].slots.indexOf("ST"),
      playerId: incumbent.id,
    },
    ...["LW", "RW"].map((slot, index) => ({
      slot,
      slotIndex: FORMATIONS["4-3-3"].slots.indexOf(slot),
      playerId: supportingAttackers[index].id,
    })),
  ];
  incumbent.attrs = Object.fromEntries(
    Object.keys(incumbent.attrs).map((attribute) => [attribute, 99]),
  );
  incumbent.overall = calculateOverall(incumbent);
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  const side = report.userMatch[report.userMatch.side];
  const opponentStriker = career.players.find(
    (player) =>
      side.xi.includes(player.id) &&
      player.id !== career.player.id &&
      player.position === "ST" &&
      player.clubId === career.club.id,
  );
  assert.ok(opponentStriker, "the match XI should have a natural striker slot");
  career.startMatchSimulation();
  career.matchSimulation.minute = 60;
  career.matchSimulation.status = "running";
  const entry = career.bringPlayerOn(report.userMatch);
  assert.ok(entry, "career player should enter in place of an ST");
  assert.equal(
    side.xiSlots.find((slot) => slot.id === career.player.id)?.slot,
    "ST",
  );
  assert.equal(
    side.xiSlots.some(
      (slot) => slot.id === career.player.id && slot.slot !== "ST",
    ),
    false,
  );
  assert.equal(side.xi.includes(opponentStriker.id), false);
  assert.equal(side.xi.length, 11);
});

test("a poorly rated player can be substituted without losing the match result", async () => {
  const data = await loadData();
  const career = createCareer(data, options(74902));
  career.player.position = "ST";
  career.player.trusting.manager = 90;
  career.player.altPositions = [];
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  career.startMatchSimulation();
  const side = report.userMatch[report.userMatch.side];
  if (!career.matchSimulation.userOnPitch) {
    const striker = career.players.find(
      (player) =>
        player.clubId === career.club.id &&
        player.position === "ST" &&
        side.xi.includes(player.id),
    );
    assert.ok(
      striker,
      "a natural ST must be on the pitch for a ST substitution",
    );
    side.xi = side.xi.map((id) => (id === striker.id ? career.player.id : id));
    side.xiSlots = side.xiSlots.map((entry) =>
      entry.id === striker.id
        ? { ...entry, id: career.player.id, slot: "ST" }
        : entry,
    );
    side.subs.push(striker.id);
    career.matchSimulation.userOnPitch = true;
    career.matchSimulation.userStarted = true;
    career.matchSimulation.userStatus = "starter";
  }
  career.matchSimulation.minute = 45;
  career.matchSimulation.status = "running";
  report.userMatch.playerResult.rating = 5.2;
  const playerId = career.player.id;
  const result = career.substitutePlayer();
  assert.equal(result.substituted, true);
  assert.equal(report.userMatch.playerResult.minutes, 45);
  assert.equal(
    report.userMatch[report.userMatch.side].xi.includes(playerId),
    false,
  );
  assert.equal(career.matchSimulation.userSubbedOff, true);
  assert.equal(career.advanceMatchSimulation().status, "finished");
  assert.equal(career.player.stats.minutes, 45);
  assert.equal(career.player.stats.subs, 1);
});

test("50 safe match situations include career-once events and persist their usage", async () => {
  const data = await loadData();
  const career = createCareer(data, options(99014));
  assert.equal(MATCH_SITUATIONS.length, 50);
  assert.equal(
    MATCH_SITUATIONS.filter((situation) => situation.once).length,
    10,
  );
  const match = {
    playerResult: { rating: 6.5 },
    situations: [],
    side: "home",
    home: { xi: [career.player.id] },
  };
  career.matchSimulation = { minute: 0, userOnPitch: true };
  for (
    let index = 0;
    index < 10_000 && career.usedSituationIds.length < 10;
    index++
  ) {
    career.rollMatchSituation(match);
  }
  assert.equal(career.usedSituationIds.length, 10);
  assert.equal(new Set(career.usedSituationIds).size, 10);
  assert.ok(
    match.situations.some((situation) => situation.id.startsWith("repeat-")),
  );
  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career.toJSON())),
  );
  assert.deepEqual(restored.usedSituationIds, career.usedSituationIds);
});

test("weekly matches drive player performance, training and league results", async () => {
  const data = await loadData();
  const career = createCareer(data, options());
  let userMatch;
  for (let week = 0; week < 8; week++) {
    const report = advanceAndResolve(career);
    if (report.userMatch) userMatch = report.userMatch;
  }

  assert.ok(userMatch);
  assert.equal(userMatch.playerResult.played, true);
  assert.ok(
    userMatch.playerResult.rating >= 3.1 && userMatch.playerResult.rating <= 10,
  );
  assert.ok(userMatch.objective);
  assert.equal(career.league.table.row(career.club.id).played, 5);
  assert.equal(career.player.stats.apps, 5);
  assert.equal(career.player.matchHistory.length, career.player.stats.apps);
  assert.equal(career.club.matchHistory.length, 5);
  assert.ok(
    career.club.matchHistory.every(
      (match) =>
        match.season === career.season &&
        match.competition === career.league.name &&
        typeof match.homeGoals === "number" &&
        typeof match.awayGoals === "number",
    ),
  );
  assert.ok(
    career.player.matchHistory.every(
      (match) =>
        match.club === career.club.name &&
        match.competitionId === career.league.id &&
        match.rating != null,
    ),
  );
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.deepEqual(restored.player.matchHistory, career.player.matchHistory);
  assert.deepEqual(restored.club.matchHistory, career.club.matchHistory);
  assert.ok(career.trainingPoints >= 10);
  const before =
    career.player.subAttrs[career.trainingFocus] ??
    career.player.gkAttrs[career.trainingFocus];
  const training = career.train();
  assert.equal(training.trained, true);
  assert.equal(
    career.player.subAttrs[career.trainingFocus] ??
      career.player.gkAttrs[career.trainingFocus],
    before + 1,
  );
});

test("played matches record and persist match histories for NPC players", async () => {
  const data = await loadData();
  const career = createCareer(data, options(62490));
  for (let week = 0; week < 8; week++) advanceAndResolve(career);

  const npcPlayers = career.players.filter(
    (player) => player.id !== career.player.id && player.stats.apps > 0,
  );
  assert.ok(npcPlayers.length > 0);
  assert.ok(
    npcPlayers.every(
      (player) => player.matchHistory?.length === player.stats.apps,
    ),
  );

  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  for (const player of npcPlayers) {
    assert.deepEqual(
      restored.players.find((entry) => entry.id === player.id)?.matchHistory,
      player.matchHistory,
    );
  }
});

test("league scorer totals follow every club's recorded goals and teammate ratings are saved", async () => {
  const data = await loadData();
  const career = createCareer(data, options(62491));
  let userReport = null;
  for (let week = 0; week < 8; week++) {
    const report = advanceAndResolve(career);
    if (report.userMatch) userReport = report.userMatch;
  }

  assert.ok(userReport?.teammateRatings.length > 0);
  const userSide = userReport[userReport.side];
  const participantIds = new Set([
    ...(userSide.startingXI ?? userSide.xi),
    ...userSide.xi,
  ]);
  for (const event of userReport.misc) {
    if (event.side !== userReport.side || event.type !== "sub") continue;
    participantIds.add(event.playerId);
    if (event.replacementId) participantIds.add(event.replacementId);
  }
  assert.equal(
    userReport.teammateRatings.length,
    [...participantIds].filter((id) => id !== career.player.id).length,
  );
  for (const teammate of userReport.teammateRatings) {
    const player = career.players.find((entry) => entry.id === teammate.id);
    assert.equal(player.lastMatchRating, teammate.rating);
    assert.ok(player.stats.apps > 0);
  }
  for (const row of career.league.table.sorted()) {
    const leagueGoals = career.players
      .filter((player) => player.clubId === row.teamId)
      .reduce((sum, player) => sum + player.leagueGoals, 0);
    assert.equal(
      leagueGoals,
      row.goalsFor,
      `${row.teamId} scorer total should match league goals`,
    );
  }
  assert.ok(
    career.players.some((player) => !player.isUser && player.leagueGoals > 0),
  );
  const teammateStats = career.getTeammateStats();
  assert.ok(teammateStats.length > 0);
  assert.ok(teammateStats.some((entry) => entry.goals > 0));
  assert.ok(
    teammateStats.every(
      (entry) =>
        entry.averageRating == null || Number.isFinite(entry.averageRating),
    ),
  );
});

test("weak foot and skill-move upgrades share the same rising cost curve", async () => {
  const data = await loadData();
  const career = createCareer(data, {
    ...options(914),
    weakFoot: "1",
    skillMoves: "1",
  });
  career.trainingPoints = 5;

  const result = career.upgradeSkill("weakFoot");
  assert.deepEqual(result, { upgraded: true, skill: "weakFoot", value: 2 });
  assert.equal(career.trainingPoints, 0);
  assert.equal(career.skillUpgradeCost("weakFoot"), 30);
  assert.equal(career.skillUpgradeCost("skillMoves"), 5);
  assert.equal(career.upgradeSkill("weakFoot").upgraded, false);
  career.trainingPoints = 5;
  assert.deepEqual(career.upgradeSkill("skillMoves"), {
    upgraded: true,
    skill: "skillMoves",
    value: 2,
  });
  assert.equal(
    career.skillUpgradeCost("weakFoot"),
    career.skillUpgradeCost("skillMoves"),
  );
  career.trainingPoints = 30;
  assert.deepEqual(career.upgradeSkill("weakFoot"), {
    upgraded: true,
    skill: "weakFoot",
    value: 3,
  });
  assert.equal(career.trainingPoints, 0);
  assert.equal(career.skillUpgradeCost("weakFoot"), 45);
  assert.equal(career.skillUpgradeCost("skillMoves"), 30);
  career.trainingPoints = 45;
  assert.deepEqual(career.upgradeSkill("weakFoot"), {
    upgraded: true,
    skill: "weakFoot",
    value: 4,
  });
  assert.equal(career.skillUpgradeCost("weakFoot"), 60);
  assert.equal(career.upgradeSkill("skillMoves").upgraded, false);
  career.trainingPoints = 30;
  assert.throws(() => career.upgradeSkill("pace"), /Unsupported player skill/);
  assert.equal(career.upgradeSkill("skillMoves").upgraded, true);
  assert.equal(career.player.skillMoves, 3);
  assert.equal(career.skillUpgradeCost("skillMoves"), 45);
});

test("weak foot and skill moves improve relevant in-match outcomes", async () => {
  const data = await loadData();
  const career = createCareer(data, options(748));
  const basic = { ...career.player, weakFoot: 1, skillMoves: 1 };
  const developed = { ...career.player, weakFoot: 5, skillMoves: 5 };

  assert.ok(
    autoSuccessChance(developed, "ST", "chance") >
      autoSuccessChance(basic, "ST", "chance"),
  );
  assert.ok(
    autoSuccessChance(developed, "ST", "penalty") >
      autoSuccessChance(basic, "ST", "penalty"),
  );
  assert.ok(
    autoSuccessChance(developed, "ST", "oneOnOne") >
      autoSuccessChance(basic, "ST", "oneOnOne"),
  );
});

test("assists and the award race use league-only player totals", async () => {
  const data = await loadData();
  const career = createCareer(data, options(812));
  for (let week = 0; week < 8; week++) advanceAndResolve(career);

  assert.ok(career.players.some((player) => player.leagueAssists > 0));
  const assistTotal = career.players.reduce(
    (total, player) => total + player.leagueAssists,
    0,
  );
  assert.ok(assistTotal > 0);
  const race = career.getAwardRace();
  assert.ok(race.length > 0);
  assert.ok(
    race.every(
      (entry) => Number.isFinite(entry.points) && entry.player.stats.apps > 0,
    ),
  );
  assert.ok(
    race.every(
      (entry, index) => index === 0 || race[index - 1].points >= entry.points,
    ),
  );
});

test("salary and match bonuses update a saved player balance without a transaction log", async () => {
  const data = await loadData();
  const career = createCareer(data, options(661));
  const startingBalance = career.money;
  assert.equal(
    career.player.contract.wage,
    data.careerSettings.finance.startingWeeklyWage,
  );

  career.advanceWeek();
  assert.equal(career.money, startingBalance + career.player.contract.wage);
  // The balance updates silently: no transaction history is recorded any more.
  assert.deepEqual(career.financialHistory, []);
  const restored = createCareer(data, options(661), career.toJSON());
  assert.equal(restored.money, career.money);

  let report;
  do {
    report = restored.advanceWeek();
  } while (!report.userMatch);
  while (restored.matchSimulation.status !== "finished") {
    const state = restored.advanceMatchSimulation();
    if (state.status === "paused")
      restored.resolveKeyMoment(state.momentIndex, "play-safe");
  }
  assert.ok(restored.money > career.money);
});

test("fan approval reacts to good and poor performances and forecasts the next fixture", async () => {
  const data = await loadData();
  const career = createCareer(data, options(521));
  const approvalBefore = career.player.trusting.fans;
  assert.ok(career.getUpcomingFanExpectation()?.opponent);

  career.updateFanReaction(
    { homeGoals: 0, awayGoals: 3, side: "home" },
    { played: true, rating: 4.5 },
  );
  assert.ok(career.player.trusting.fans < approvalBefore);
  assert.ok(career.lastFanReaction.change < 0);
  const approvalAfterPoorMatch = career.player.trusting.fans;
  career.updateFanReaction(
    { homeGoals: 4, awayGoals: 0, side: "home" },
    { played: true, rating: 9.5 },
  );
  assert.ok(career.player.trusting.fans > approvalAfterPoorMatch);
  assert.ok(career.lastFanReaction.change > 0);
  assert.ok(career.lastFanReaction.approval <= 100);
});

test("domestic award races ignore players with only non-league appearances", async () => {
  const data = await loadData();
  const career = createCareer(data, options(442));
  const cupOnlyPlayer = career.players.find(
    (player) => player.id !== career.player.id,
  );
  cupOnlyPlayer.stats.apps = 8;
  cupOnlyPlayer.stats.ratingSum = 80;
  cupOnlyPlayer.leagueGoals = 50;
  cupOnlyPlayer.leagueAssists = 50;

  assert.equal(
    career.getAwardRace().some((entry) => entry.player.id === cupOnlyPlayer.id),
    false,
  );
});

test("hiring a manager spends personal funds, saves the hire, and applies the new tactics", async () => {
  const data = await loadData();
  const career = createCareer(data, options(6735));
  career.money = 50000;
  const oldManager = career.club.manager;
  const candidate = career.managerCandidates.find(
    (manager) => manager.style === "Attacking",
  );
  const hired = career.hireManager(candidate.id);

  assert.equal(hired.id, career.club.manager.id);
  assert.equal(career.club.manager.style, "Attacking");
  assert.notDeepEqual(career.club.manager.tactics, oldManager.tactics);
  assert.equal(career.money, 50000 - candidate.cost);
  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career)),
  );
  assert.equal(restored.club.manager.id, candidate.id);
  assert.equal(restored.money, career.money);
  assert.ok(
    matchStrength(
      restored.club,
      restored.players,
      restored.calendar[0].matchday,
    ).managerBonus > 0,
  );
});

test("Messi is at Barcelona and Ronaldo is at Manchester United", async () => {
  const data = await loadData();
  const laLiga = data.careerLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const premierLeague = data.careerLeagues.find(
    (entry) => entry.league.name === "Premier League",
  );
  const messi = laLiga.rostersByClub["fc-barcelona"].find(
    (player) => player.first === "Lionel" && player.last === "Messi",
  );
  const ronaldo = premierLeague.rostersByClub["manchester-united"].find(
    (player) => player.first === "Cristiano" && player.last === "Ronaldo",
  );

  assert.ok(messi);
  assert.ok(ronaldo);
  assert.equal(
    laLiga.rostersByClub["real-madrid"].some(
      (player) => player.first === "Cristiano" && player.last === "Ronaldo",
    ),
    false,
  );
});

test("Messi and Ronaldo use normal player ratings and development", async () => {
  const data = await loadData();
  const laLiga = data.careerLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const career = createCareer(data, {
    ...options(463),
    leagueId: laLiga.id,
    clubId: "fc-barcelona",
  });

  const players = [
    ...career.players,
    ...career.worldLeagues.flatMap((state) => state.performers),
  ];
  const messi = players.find((player) => player.last === "Messi");
  const ronaldo = players.find((player) => player.last === "Ronaldo");

  assert.ok(messi);
  assert.ok(ronaldo);
  assert.equal(messi.isLegend, false);
  assert.equal(ronaldo.isLegend, false);
  assert.equal(messi.position, "AM");
  assert.deepEqual(messi.altPositions, ["ST", "RW", "LW"]);
  assert.ok(messi.potential >= messi.overall);
  assert.ok(ronaldo.potential >= ronaldo.overall);
  assert.equal(messi.source, "real-world");
  assert.equal(ronaldo.source, "real-world");
  assert.equal(ronaldo.clubId, "manchester-united");
  const defaultCareer = createCareer(data, options(4631));
  const defaultLeagueRonaldo = [
    ...defaultCareer.players,
    ...defaultCareer.worldLeagues.flatMap((state) => state.performers),
  ].find((player) => player.first === "Cristiano" && player.last === "Ronaldo");
  assert.equal(defaultLeagueRonaldo?.isLegend, false);
});

test("restoring old saves removes Messi and Ronaldo's legacy legend protection", async () => {
  const data = await loadData();
  const laLiga = data.careerLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const careerOptions = {
    ...options(4632),
    leagueId: laLiga.id,
    clubId: "fc-barcelona",
  };
  const career = createCareer(data, careerOptions);
  const saved = JSON.parse(JSON.stringify(career));
  const premierLeague = saved.worldLeagues.find(
    (state) => state.league.name === "Premier League",
  );
  const ronaldo = premierLeague.performers.find(
    (player) => player.first === "Cristiano" && player.last === "Ronaldo",
  );
  assert.ok(ronaldo);
  premierLeague.performers = premierLeague.performers.filter(
    (player) => player.id !== ronaldo.id,
  );
  ronaldo.clubId = "real-madrid";
  ronaldo.isLegend = true;
  saved.players.push(ronaldo);
  saved.clubs.find((club) => club.id === "real-madrid").squad.push(ronaldo.id);

  const restored = createCareer(data, careerOptions, saved);
  const restoredRonaldo = restored.players.find(
    (player) => player.first === "Cristiano" && player.last === "Ronaldo",
  );
  assert.equal(restoredRonaldo.isLegend, false);
  assert.equal(restoredRonaldo.clubId, "real-madrid");
});

test("changing the career player's position recalculates overall for the new role", async () => {
  const data = await loadData();
  const career = createCareer(data, options(462));
  career.player.attrs = {
    pace: 90,
    shooting: 90,
    passing: 40,
    dribbling: 90,
    defending: 20,
    physical: 80,
  };
  const strikerOverall = calculateOverall(career.player);
  const changed = career.changePosition("CB");

  assert.equal(career.player.position, "CB");
  assert.equal(changed.previousOverall, strikerOverall);
  assert.equal(changed.overall, calculateOverall(career.player));
  assert.ok(changed.overall < strikerOverall);
  assert.throws(
    () => career.changePosition("INVALID"),
    /Unsupported player position/,
  );
});

test("key-moment decisions change the live score and count only after full time", async () => {
  const data = await loadData();
  const career = createCareer(data, options(91827));
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);

  const match = report.userMatch;
  const ratingBefore = match.playerResult.rating;
  assert.ok(match.playerResult.keyMoments.length > 0);
  assert.deepEqual([match.homeGoals, match.awayGoals], [0, 0]);
  assert.equal(career.league.table.row(career.club.id).played, 0);
  assert.equal(career.player.stats.apps, 0);
  match.playerResult.keyMoments[0].kind = "chance";
  match.playerResult.keyMoments[0].minute = 5;
  const originalStream = career.rng.stream.bind(career.rng);
  career.rng.stream = (name) =>
    name === "player-moments" ? { chance: () => true } : originalStream(name);
  assert.throws(
    () => career.advanceWeek(),
    /Resolve your outstanding key moments/,
  );
  const activeMoment = career.advanceMatchSimulation();
  assert.equal(activeMoment.status, "paused");
  const scoreBeforeDecision =
    match[match.side === "home" ? "homeGoals" : "awayGoals"];
  const playerGoalsBeforeDecision = match.playerResult.stats.goals;
  const decision = career.resolveKeyMoment(
    activeMoment.momentIndex,
    "take-risk",
  );

  assert.equal(typeof decision.success, "boolean");
  assert.ok(decision.probability >= 0.05 && decision.probability <= 0.95);
  assert.equal(
    match[match.side === "home" ? "homeGoals" : "awayGoals"],
    scoreBeforeDecision + 1,
  );
  assert.equal(match.playerResult.stats.goals, playerGoalsBeforeDecision + 1);
  assert.equal(
    match.events.at(-1).scorerName,
    `${career.player.first} ${career.player.last}`,
  );
  assert.equal(
    career.matchSimulation.lastGoalEvent.scorerName,
    `${career.player.first} ${career.player.last}`,
  );
  assert.notEqual(match.playerResult.rating, ratingBefore);
  assert.throws(
    () => career.resolveKeyMoment(activeMoment.momentIndex, "play-safe"),
    /already been resolved/,
  );
  while (career.matchSimulation.status !== "finished") {
    const next = career.advanceMatchSimulation();
    if (next.status === "paused")
      career.resolveKeyMoment(next.momentIndex, "play-safe");
  }
  assert.equal(career.league.table.row(career.club.id).played, 1);
  assert.equal(career.player.stats.apps, 1);
  assert.equal(career.player.stats.goals, match.playerResult.stats.goals);
  assert.equal(career.player.leagueGoals, match.playerResult.stats.goals);
  career.rng.stream = originalStream;
  assert.doesNotThrow(() => career.advanceWeek());
});

test("live match clock pauses at key moments and resumes after a decision", async () => {
  const data = await loadData();
  const career = createCareer(data, options(23841));
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);

  assert.deepEqual(
    [report.userMatch.homeGoals, report.userMatch.awayGoals],
    [0, 0],
  );
  assert.equal(career.league.table.row(career.club.id).played, 0);
  report.userMatch.playerResult.keyMoments = [
    {
      minute: 5,
      kind: "chance",
      position: career.player.position,
      options: [],
      resolved: null,
    },
  ];
  career.startMatchSimulation();
  assert.equal(career.matchSimulation.status, "running");
  const homeScorer = career.players.find(
    (player) =>
      player.clubId === report.userMatch.home.clubId && !player.isUser,
  );
  report.userMatch.scheduledGoalEvents.unshift({
    type: "goal",
    minute: 1,
    side: "home",
    scorerId: homeScorer.id,
    scorerName: `${homeScorer.first} ${homeScorer.last}`,
    assistId: null,
    assistName: null,
    penalty: false,
    ownGoal: false,
  });
  let state = career.tickMatchSimulation();
  assert.equal(report.userMatch.homeGoals, 1);
  while (state.status === "running") state = career.tickMatchSimulation();
  assert.equal(state.status, "paused");
  assert.equal(
    state.minute,
    report.userMatch.playerResult.keyMoments[state.activeMomentIndex].minute,
  );
  const firstIndex = state.activeMomentIndex;
  career.resolveKeyMoment(firstIndex, "play-safe");
  assert.equal(career.matchSimulation.status, "running");

  while (career.matchSimulation.status === "running") {
    state = career.tickMatchSimulation();
    if (state.status === "paused")
      career.resolveKeyMoment(state.activeMomentIndex, "play-safe");
  }
  assert.equal(career.matchSimulation.status, "finished");
  assert.equal(career.league.table.row(career.club.id).played, 1);
  assert.equal(career.player.stats.apps, 1);
  assert.ok(
    report.userMatch.playerResult.keyMoments.every((moment) => moment.resolved),
  );
});

test("full time resolves key moments that were left beyond the match clock", async () => {
  const data = await loadData();
  const career = createCareer(data, options(23842));
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);

  report.userMatch.playerResult.keyMoments.push({
    minute: 91,
    kind: "chance",
    options: [],
  });
  career.matchSimulation = {
    minute: 90,
    activeMomentIndex: null,
    status: "finished",
    finalized: false,
  };
  career.finishMatchSimulation();

  const finalMoment = report.userMatch.playerResult.keyMoments.at(-1);
  assert.equal(finalMoment.resolved.success, false);
  assert.equal(finalMoment.resolved.action.label, "Full time");
});

test("an in-match injury ends the player's participation and carries into recovery", async () => {
  const data = await loadData();
  const career = createCareer(data, options(99031));
  let report;
  do {
    report = career.advanceWeek();
    if (report.userMatch) break;
    if (career.lastReport?.userMatch) {
      while (career.matchSimulation.status !== "finished") {
        const state = career.advanceMatchSimulation();
        if (state.status === "paused")
          career.resolveKeyMoment(state.momentIndex, "play-safe");
      }
    }
  } while (!report.userMatch);
  const match = report.userMatch;
  match.misc = match.misc.filter(
    (event) => event.playerId !== career.player.id,
  );
  match.misc.push({
    type: "injury",
    side: match.side,
    minute: 1,
    playerId: career.player.id,
    playerName: `${career.player.first} ${career.player.last}`,
    severity: "minor",
  });

  career.startMatchSimulation();
  const side = match[match.side];
  const striker = career.players.find(
    (player) =>
      player.clubId === career.club.id &&
      player.position === "ST" &&
      side.xi.includes(player.id),
  );
  assert.ok(striker);
  side.xi = side.xi.filter((id) => id !== striker.id);
  side.xiSlots = side.xiSlots.filter((entry) => entry.id !== striker.id);
  side.xi.push(career.player.id);
  side.xiSlots.push({ slot: "ST", id: career.player.id });
  career.matchSimulation.userOnPitch = true;
  career.matchSimulation.userStatus = "starter";
  career.tickMatchSimulation();
  assert.ok(career.player.injury.weeks >= 2);
  assert.equal(career.player.injury.type, "minor");
  assert.equal(career.matchSimulation.userSubbedOff, true);
  assert.ok(
    match.playerResult.keyMoments.every((moment) => moment.resolved?.subbedOff),
  );
  assert.ok(
    !career.club
      .bestEleven(career.players, career.calendar[career.week].matchday)
      .includes(career.player.id),
  );
  while (career.matchSimulation.status !== "finished")
    career.advanceMatchSimulation();
  assert.ok(
    match.misc.some(
      (event) => event.type === "injury" && event.playerId === career.player.id,
    ),
  );
  career.advanceWeek();
  assert.ok(
    !career.player.injury || career.player.injury.weeks >= 1,
    "the injury must carry into the next week",
  );
});

test("AI players develop with potential and context, and world-player growth persists", async () => {
  const data = await loadData();
  const career = createCareer(data, options(99032));
  const youngPlayer = career.players.find(
    (player) => !player.isUser && player.position === "ST",
  );
  youngPlayer.dob = toDayIndex(career.season - 18, 1, 1);
  youngPlayer.potential = calculateOverall(youngPlayer) + 12;
  youngPlayer.developmentProgress = 2;
  youngPlayer.stats.apps = 30;
  const attributesBefore = Object.values(youngPlayer.attrs).reduce(
    (sum, value) => sum + value,
    0,
  );
  career.developLeaguePlayers();
  assert.ok(
    Object.values(youngPlayer.attrs).reduce((sum, value) => sum + value, 0) >
      attributesBefore,
  );

  const worldPlayer = career.worldLeagues[0].performers[0];
  worldPlayer.age = 18;
  worldPlayer.potential = worldPlayer.overall + 5;
  worldPlayer.developmentProgress = 2;
  worldPlayer.apps = 30;
  const worldOverallBefore = worldPlayer.overall;
  career.developWorldPlayers();
  assert.ok(worldPlayer.overall > worldOverallBefore);
  const restored = createCareer(data, options(99032), career.toJSON());
  const restoredWorldPlayer = restored.worldLeagues
    .flatMap((state) => state.performers)
    .find((player) => player.id === worldPlayer.id);
  assert.equal(restoredWorldPlayer.overall, worldPlayer.overall);
  assert.equal(
    restored.worldPlayerDevelopment[worldPlayer.id].overall,
    worldPlayer.overall,
  );
});

test("finishing tendencies and goalkeeper quality affect scoring chances", async () => {
  const data = await loadData();
  const career = createCareer(data, options(7788));
  const striker = career.players.find((player) => player.position === "ST");
  const keeper = career.players.find((player) => player.position === "GK");
  assert.ok(striker.tendencies.goalThreat > keeper.tendencies.goalThreat);
  assert.ok(keeper.tendencies.shotStopping > 0);

  const even = { attack: 68, defence: 68 };
  const baseline = expectedGoals(even, even).home;
  const againstEliteKeeper = expectedGoals(even, {
    ...even,
    goalkeeping: 90,
  }).home;
  assert.ok(againstEliteKeeper < baseline);
  const chanceAgainstWeakKeeper = autoSuccessChance(
    career.player,
    "ST",
    "oneOnOne",
    55,
  );
  const chanceAgainstStrongKeeper = autoSuccessChance(
    career.player,
    "ST",
    "oneOnOne",
    90,
  );
  assert.ok(chanceAgainstStrongKeeper < chanceAgainstWeakKeeper);
});

test("elite defenders and goalkeepers stop more goals across repeated matches", async () => {
  const data = await loadData();
  const career = createCareer(data, options(99033));
  const homeClub = career.clubs.find((club) => club.id === "hull");
  const awayClub = career.clubs.find((club) => club.id === "liverpool");
  const setDefensiveQuality = (quality) => {
    for (const player of career.players.filter((entry) =>
      awayClub.squad.includes(entry.id),
    )) {
      if (player.position === "GK") {
        for (const attribute of ["reflexes", "positioning", "handling"]) {
          player.gkAttrs[attribute] = quality;
        }
      } else if (["CB", "LB", "RB", "DM"].includes(player.position)) {
        player.attrs.defending = quality;
      }
    }
  };
  let lowQualityGoals = 0;
  let highQualityGoals = 0;
  let lowQualityStops = 0;
  let highQualityStops = 0;
  let lowQualityShots = 0;
  let highQualityShots = 0;
  for (let seed = 1; seed <= 120; seed++) {
    setDefensiveQuality(20);
    const weak = simulateMatch({
      home: {
        club: homeClub,
        players: career.players,
        strength: { attack: 70, defence: 70, goalkeeping: 70 },
      },
      away: {
        club: awayClub,
        players: career.players,
        strength: { attack: 70, defence: 70, goalkeeping: 70 },
      },
      rng: new RngBundle(seed).stream("defence-check"),
      dayIndex: career.calendar[0].matchday,
    });
    lowQualityGoals += weak.homeGoals;
    lowQualityShots += weak.stats.home.shots;
    lowQualityStops += weak.misc.filter((event) =>
      ["block", "save"].includes(event.type),
    ).length;

    setDefensiveQuality(95);
    const strong = simulateMatch({
      home: {
        club: homeClub,
        players: career.players,
        strength: { attack: 70, defence: 70, goalkeeping: 70 },
      },
      away: {
        club: awayClub,
        players: career.players,
        strength: { attack: 70, defence: 70, goalkeeping: 70 },
      },
      rng: new RngBundle(seed).stream("defence-check"),
      dayIndex: career.calendar[0].matchday,
    });
    highQualityGoals += strong.homeGoals;
    highQualityShots += strong.stats.home.shots;
    highQualityStops += strong.misc.filter((event) =>
      ["block", "save"].includes(event.type),
    ).length;
  }
  assert.ok(highQualityGoals < lowQualityGoals);
  assert.ok(
    highQualityStops / highQualityShots > lowQualityStops / lowQualityShots,
  );
});

test("saving and restoring during a live match preserves its pending goals and score", async () => {
  const data = await loadData();
  const career = createCareer(data, options(8821));
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  career.startMatchSimulation();
  career.tickMatchSimulation();

  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career)),
  );
  assert.deepEqual(restored.matchSimulation, career.matchSimulation);
  assert.deepEqual(
    restored.lastReport.userMatch.events,
    career.lastReport.userMatch.events,
  );
  assert.deepEqual(
    [
      restored.lastReport.userMatch.homeGoals,
      restored.lastReport.userMatch.awayGoals,
    ],
    [
      career.lastReport.userMatch.homeGoals,
      career.lastReport.userMatch.awayGoals,
    ],
  );
  assert.equal(restored.league.table.row(restored.club.id).played, 0);
});

test("saving at a key moment resumes the paused decision without duplicating the result", async () => {
  const data = await loadData();
  const career = createCareer(data, options(23841));
  career.club.formation = "4-3-3";
  career.club.userChosenFormation = true;
  career.player.attrs = Object.fromEntries(
    Object.keys(career.player.attrs).map((attribute) => [attribute, 99]),
  );
  career.player.overall = calculateOverall(career.player);
  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);

  assert.equal(career.matchSimulation.userOnPitch, true);
  report.userMatch.playerResult.keyMoments = [
    {
      minute: 1,
      kind: "chance",
      position: career.player.position,
      options: [],
      resolved: null,
    },
  ];
  career.startMatchSimulation();
  assert.equal(career.tickMatchSimulation().status, "paused");

  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career.toJSON())),
  );
  assert.equal(restored.matchSimulation.status, "paused");
  assert.equal(restored.matchSimulation.activeMomentIndex, 0);
  assert.equal(
    restored.lastReport.userMatch.playerResult.keyMoments[0].resolved,
    null,
  );
  restored.resolveKeyMoment(0, "play-safe");
  assert.throws(
    () => restored.resolveKeyMoment(0, "play-safe"),
    /already been resolved/,
  );

  while (restored.matchSimulation.status !== "finished") {
    const state = restored.advanceMatchSimulation();
    if (state.status === "paused")
      restored.resolveKeyMoment(state.momentIndex, "play-safe");
  }
  assert.equal(
    restored.matchSimulation.minute,
    90 + Math.max(0, Number(report.userMatch.addedTime) || 0),
  );
  assert.equal(restored.league.table.row(restored.club.id).played, 1);
  assert.equal(restored.player.stats.apps, 1);
  restored.finishMatchSimulation();
  assert.equal(restored.league.table.row(restored.club.id).played, 1);
  assert.equal(restored.player.stats.apps, 1);
});

test("career creation supports a roster-backed club in an imported league", async () => {
  const data = await loadData();
  data.careerLeagues = [
    {
      id: "world-la-liga",
      league: {
        id: "world-la-liga",
        name: "La Liga",
        nation: "ESP",
        tier: 1,
        clubGroup: "world-la-liga",
        teamIds: ["real-madrid", "fc-barcelona", "atletico-madrid"],
        seasonStartYear: 2026,
        seasonWeeks: 44,
        fixtureStartWeek: 3,
        fixtureEndWeek: 40,
      },
      clubIdentities: {
        "real-madrid": {
          id: "real-madrid",
          name: "Real Madrid",
          shortName: "RMA",
          prestige: 90,
        },
        "fc-barcelona": {
          id: "fc-barcelona",
          name: "FC Barcelona",
          shortName: "FCB",
          prestige: 90,
        },
        "atletico-madrid": {
          id: "atletico-madrid",
          name: "Atlético Madrid",
          shortName: "ATM",
          prestige: 88,
        },
      },
      rostersByClub: {
        "real-madrid": [],
        "fc-barcelona": [],
        "atletico-madrid": [],
      },
    },
  ];
  const career = createCareer(data, {
    ...options(),
    leagueId: "world-la-liga",
    clubId: "real-madrid",
  });
  assert.equal(career.league.name, "La Liga");
  assert.equal(career.clubs.length, 3);
  assert.equal(career.club.name, "Real Madrid");
  assert.equal(career.league.fixtures.length, 6);
});

test("restoring a legacy save normalizes imported real-player countries", async () => {
  const data = await loadData();
  const spain = data.careerLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const optionsForSpain = {
    ...options(6711),
    leagueId: spain.id,
    clubId: "real-madrid",
  };
  const career = createCareer(data, optionsForSpain);
  const messi = career.players.find(
    (player) => player.first === "Lionel" && player.last === "Messi",
  );
  assert.ok(messi);
  const save = JSON.parse(JSON.stringify(career.toJSON()));
  save.players.find((player) => player.id === messi.id).nationality = "ENG";

  const restored = createCareer(data, optionsForSpain, save);
  assert.equal(
    restored.players.find((player) => player.id === messi.id).nationality,
    "ARG",
  );
});

test("all listed Premier League clubs build playable generated squads", async () => {
  const data = await loadData();
  const league = data.careerLeagues.find(
    (entry) => entry.league.name === "Premier League",
  );
  const career = createCareer(data, {
    ...options(462),
    leagueId: league.id,
    clubId: league.league.teamIds[0],
  });

  assert.equal(career.clubs.length, 20);
  assert.ok(career.clubs.every((club) => club.squad.length >= 18));
  assert.equal(career.league.name, "Premier League");
  assert.ok(
    career.players.some(
      (player) =>
        player.clubId === "manchester-city" &&
        player.first === "Erling" &&
        player.last === "Haaland",
    ),
  );
  assert.ok(
    career.players.some(
      (player) =>
        player.clubId === "liverpool" &&
        player.first === "Mohamed" &&
        player.last === "Salah" &&
        player.position === "RW",
    ),
  );
});

test("save and restore preserve standings and future seeded results", async () => {
  const data = await loadData();
  const career = createCareer(data, options());
  for (let week = 0; week < 12; week++) advanceAndResolve(career);
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);

  assert.deepEqual(
    restored.league.table.sorted(),
    career.league.table.sorted(),
  );
  assert.equal(restored.player.stats.apps, career.player.stats.apps);
  for (let week = 0; week < 6; week++) {
    const originalReport = advanceAndResolve(career);
    const restoredReport = advanceAndResolve(restored);
    assert.deepEqual(
      originalReport.fixtures.map(({ home, away, homeGoals, awayGoals }) => ({
        home,
        away,
        homeGoals,
        awayGoals,
      })),
      restoredReport.fixtures.map(({ home, away, homeGoals, awayGoals }) => ({
        home,
        away,
        homeGoals,
        awayGoals,
      })),
    );
  }
});

test("league rounds start at the first configured week and completed results include the user match", async () => {
  const data = await loadData();
  const career = createCareer(data, options(77020));
  const userFixtures = career.league.fixturesFor(career.club.id);
  assert.equal(career.league.fixtureWeeks[0], data.league.fixtureStartWeek);

  let report;
  do {
    report = career.advanceWeek();
  } while (!report.userMatch);
  assert.equal(report.week, career.league.fixtureWeeks[userFixtures[0].round]);
  assert.equal(
    career.results.some((result) => result.userMatch && result.pending),
    false,
  );
  assert.equal(
    career.lastReport.fixtures.some(
      (result) => result.userMatch && result.pending,
    ),
    true,
  );
  career.startMatchSimulation();
  while (career.matchSimulation.status !== "finished") {
    const state = career.advanceMatchSimulation();
    if (state.status === "paused")
      career.resolveKeyMoment(state.momentIndex, "play-safe");
  }
  assert.equal(career.results.length, report.fixtures.length);
  const completedUserResult = career.results.find((result) => result.userMatch);
  assert.equal(completedUserResult.pending, false);
  assert.equal(typeof completedUserResult.homeGoals, "number");
  assert.equal(typeof completedUserResult.awayGoals, "number");

  const legacyData = {
    ...data,
    league: {
      ...data.league,
      fixtureStartWeek: undefined,
      fixtureEndWeek: undefined,
    },
  };
  const legacyCareer = createCareer(legacyData, options(77021));
  assert.equal(legacyCareer.league.fixtureWeeks[0], 0);
  assert.equal(
    legacyCareer.league.fixtureWeeks.length,
    legacyCareer.league.fixtures.length,
  );
});

test("one-week simulation completes scheduled matches and stores stats for fixture history", async () => {
  const data = await loadData();
  const career = createCareer(data, options(77023));
  let result;
  while (!career.results.some((fixture) => fixture.userMatch)) {
    const previousWeek = career.week;
    result = career.simulateOneWeek();
    assert.equal(career.week, previousWeek + 1);
    assert.equal(result.weeksSimulated, 1);
  }

  const userResult = career.results.find((fixture) => fixture.userMatch);
  assert.equal(userResult.pending, false);
  assert.ok(userResult.stats);
  assert.equal(
    career.results
      .filter((fixture) => fixture.week === userResult.week)
      .every((fixture) => !fixture.pending),
    true,
  );
  assert.equal(
    result.matchesSimulated,
    result.leagueMatchesSimulated + result.competitionMatchesSimulated,
  );
  assert.ok(result.leagueMatchesSimulated > 0);
  assert.equal(career.matchSimulation.status, "finished");

  const fixture = career
    .getFixtureList()
    .find(
      (entry) =>
        entry.competition === career.league.name &&
        entry.played &&
        (entry.homeId === career.club.id || entry.awayId === career.club.id),
    );
  assert.ok(fixture?.stats);
  assert.equal(
    fixture.stats.home.possession + fixture.stats.away.possession,
    100,
  );
  for (const side of ["home", "away"]) {
    assert.ok(fixture.stats[side].goals <= fixture.stats[side].shotsOnTarget);
    assert.ok(fixture.stats[side].shotsOnTarget <= fixture.stats[side].shots);
  }
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.deepEqual(
    restored.getFixtureList().find((entry) => entry.id === fixture.id).stats,
    fixture.stats,
  );
});

test("selected World Cup players see only their nation's tournament matches in the fixture list", async () => {
  const data = await loadData();
  const career = createCareer(data, options(77022));
  career.worldCup.userSelection = {
    year: 2030,
    nation: career.player.nationality,
    selected: true,
    qualified: true,
  };
  career.worldCup.tournament = {
    year: 2030,
    season: 2029,
    status: "in-progress",
    stage: "Group stage",
    qualified: [
      {
        id: "user-nation",
        code: career.player.nationality,
        name: "User Nation",
        squadIds: [career.player.id],
      },
      {
        id: "rival-a",
        code: "BRA",
        name: "Brazil",
        squadIds: ["brazil-player"],
      },
      {
        id: "rival-b",
        code: "ARG",
        name: "Argentina",
        squadIds: ["argentina-player"],
      },
    ],
    fixtures: [
      {
        id: "world-cup-user-group",
        stage: "group",
        round: 1,
        homeId: "user-nation",
        awayId: "rival-a",
        status: "scheduled",
        scheduledDay: toDayIndex(2030, 6, 19),
      },
      {
        id: "world-cup-rival-group",
        stage: "group",
        round: 1,
        homeId: "rival-a",
        awayId: "rival-b",
        status: "scheduled",
        scheduledDay: toDayIndex(2030, 6, 19),
      },
      {
        id: "world-cup-user-completed",
        stage: "group",
        round: 2,
        homeId: "rival-b",
        awayId: "user-nation",
        status: "completed",
        homeGoals: 1,
        awayGoals: 2,
        scheduledDay: toDayIndex(2030, 6, 26),
      },
      {
        id: "world-cup-unrelated",
        stage: "group",
        round: 2,
        homeId: "rival-a",
        awayId: "rival-b",
        status: "scheduled",
        scheduledDay: toDayIndex(2030, 6, 26),
      },
    ],
  };

  const worldCupFixtures = career
    .getFixtureList()
    .filter((fixture) => fixture.competitionId === "fifa-world-cup");
  assert.equal(worldCupFixtures.length, 2);
  assert.equal(worldCupFixtures[0].id, "world-cup-user-group");
  assert.equal(worldCupFixtures[0].season, 2029);
  assert.equal(worldCupFixtures[0].date, toDayIndex(2030, 6, 19));
  assert.equal(worldCupFixtures[0].away, "Brazil");
  assert.equal(worldCupFixtures[0].userIsHome, true);
  assert.match(worldCupFixtures[0].roundLabel, /Group stage.*Matchday 2/);
  assert.equal(worldCupFixtures[0].matchNumber, 2);
  assert.equal(worldCupFixtures[1].result, "1 – 2");
  assert.equal(worldCupFixtures[1].userIsHome, false);
  assert.equal(worldCupFixtures[1].played, true);
  assert.equal(
    worldCupFixtures.some((fixture) => fixture.id === "world-cup-unrelated"),
    false,
  );
  career.worldCup.userSelection.selected = false;
  assert.equal(
    career
      .getFixtureList()
      .filter((fixture) => fixture.competitionId === "fifa-world-cup").length,
    2,
  );
});

test("a full Premier League season completes with 38 matches per club", async () => {
  const data = await loadData();
  const career = createCareer(data, options(77021));
  for (const row of career.league.table.rows.values()) row.played = 38;
  assert.equal(career.league.table.isComplete(38), true);
  assert.throws(
    () => career.advanceSeason(),
    /Every playable league must finish/,
  );
  for (const row of career.league.table.rows.values()) row.played = 0;
  let weeks = 0;
  while (!career.seasonComplete && weeks < 44) {
    advanceAndResolve(career);
    weeks++;
  }
  assert.equal(
    career.seasonComplete,
    true,
    JSON.stringify({
      week: career.week,
      season: career.season,
      worldCupYear: career.worldCup.nextYear,
      tournament: career.worldCup.tournament?.status,
      leagues: career.getLeagueSeasonProgress(),
      championsLeague: career.championsLeague?.status,
    }),
  );
  assert.equal(weeks <= 44, true);
  assert.ok(career.league.table.sorted().every((row) => row.played === 38));
  assert.ok(career.player.stats.apps > 0 && career.player.stats.apps <= 38);
  assert.equal(career.results.length, 380);
  assert.equal(career.seasonSummary().appearances, career.player.stats.apps);
  assert.deepEqual(
    career.getLeagueSeasonProgress(),
    { complete: 5, total: 5 },
    JSON.stringify(
      career.worldLeagues.map(({ league }) => [league.id, league.name]),
    ),
  );
  for (const row of career.league.table.sorted()) {
    const playerGoals = career.players
      .filter((player) => player.clubId === row.teamId)
      .reduce((total, player) => total + player.leagueGoals, 0);
    assert.equal(
      playerGoals,
      row.goalsFor,
      `${row.teamId} scorer totals should reconcile`,
    );
  }
  assert.ok(
    career.players.every(
      (player) =>
        player.leaguePerformance.apps <= 38 &&
        Number.isFinite(player.leaguePerformance.ratingSum),
    ),
  );
  const race = career.getAwardRace();
  assert.ok(race.length > 0);
  assert.ok(
    race.every(
      (entry) =>
        entry.apps === entry.player.stats.apps &&
        entry.apps === entry.player.leaguePerformance.apps &&
        entry.averageRating ===
          entry.player.leaguePerformance.ratingSum /
            entry.player.leaguePerformance.apps,
    ),
  );
  const awardByName = (name) =>
    career.currentSeasonAwards.awards.find((award) => award.award === name);
  assert.ok(
    career.currentSeasonAwards.awards.every((award) =>
      award.winners.every(
        (winner) =>
          typeof winner.playerId === "string" ||
          typeof winner.coachId === "string",
      ),
    ),
  );
  const winnerKeys = (award) =>
    award.winners.map((winner) => `${winner.clubId}:${winner.player}`).sort();
  const expectedWinners = (entries) =>
    entries
      .map(
        (entry) =>
          `${entry.player.clubId}:${entry.player.first} ${entry.player.last}`,
      )
      .sort();
  const seasonWinner = awardByName("Player of the Season").winners[0];
  assert.ok(seasonWinner);
  assert.equal(seasonWinner.clubId, career.league.table.sorted()[0].teamId);
  const goalScorers = career.players.filter((player) => player.leagueGoals > 0);
  const mostGoals = Math.max(
    ...goalScorers.map((player) => player.leagueGoals),
  );
  assert.deepEqual(
    winnerKeys(awardByName("Golden Boot")),
    goalScorers
      .filter((player) => player.leagueGoals === mostGoals)
      .map((player) => `${player.clubId}:${player.first} ${player.last}`)
      .sort(),
  );
  const playmakers = career.players.filter(
    (player) => player.leagueAssists > 0,
  );
  const mostAssists = Math.max(
    ...playmakers.map((player) => player.leagueAssists),
  );
  assert.deepEqual(
    winnerKeys(awardByName("Playmaker of the Season")),
    playmakers
      .filter((player) => player.leagueAssists === mostAssists)
      .map((player) => `${player.clubId}:${player.first} ${player.last}`)
      .sort(),
  );
  const ratedPlayers = race.filter((entry) => entry.player.stats.apps >= 5);
  const topAverage = Math.max(
    ...ratedPlayers.map((entry) => entry.averageRating),
  );
  assert.deepEqual(
    winnerKeys(awardByName("Best Average Rating")),
    expectedWinners(
      ratedPlayers.filter((entry) => entry.averageRating === topAverage),
    ),
  );
  assert.ok(awardByName("Ballon d'Or").winners.length > 0);
  assert.ok(career.player.careerStats.apps >= career.player.stats.apps);
  career.recordPlayerHonour(`${career.player.first} ${career.player.last}`, {
    award: "Test International Honour",
    season: career.season,
    competition: "International",
    value: "Winner",
  });
  const earnedHonours = [...career.player.honours];
  const saved = JSON.parse(JSON.stringify(career));
  const restored = createCareer(data, career.creation, saved);
  assert.deepEqual(restored.getLeagueSeasonProgress(), {
    complete: 5,
    total: 5,
  });
  assert.deepEqual(restored.currentSeasonAwards, career.currentSeasonAwards);
  const careerApps = restored.player.careerStats.apps;
  restored.advanceSeason();
  assert.equal(restored.season, career.season + 1);
  assert.equal(restored.week, -1);
  assert.equal(restored.player.stats.apps, 0);
  assert.equal(restored.player.leaguePerformance.apps, 0);
  assert.equal(restored.player.careerStats.apps, careerApps);
  assert.equal(restored.currentSeasonAwards, null);
  assert.ok(
    earnedHonours.every((honour) =>
      restored.player.honours.some(
        (entry) =>
          entry.award === honour.award &&
          entry.season === honour.season &&
          entry.value === honour.value,
      ),
    ),
  );
  assert.equal(restored.ballonDorCeremonies.length, 1);
  assert.equal(restored.ballonDorCeremonies[0].awardPeriod, career.season);
  assert.equal(restored.ballonDorCeremonies[0].ceremonySeason, restored.season);
  assert.equal(restored.publishBallonDorCeremony(), null);
  assert.equal(restored.getLeagueSeasonProgress().complete, 0);
});

test("unknown clubs and empty player names are rejected", async () => {
  const data = await loadData();
  assert.throws(
    () => createCareer(data, { ...options(), clubId: "not-a-club" }),
    /Choose a club/,
  );
  assert.throws(
    () => createCareer(data, { ...options(), first: " " }),
    /first and last name/,
  );
});

/* ------------------------------------------------------------------------- *
 * Trophies: every winner keeps his honours, grouped by trophy type.
 * ------------------------------------------------------------------------- */

test("season awards are recorded on every winner, including legends and other leagues", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55101));
  let weeks = 0;
  while (!career.seasonComplete && weeks < 44) {
    advanceAndResolve(career);
    weeks++;
  }
  assert.equal(career.seasonComplete, true);
  const awards = career.currentSeasonAwards.awards;
  assert.ok(awards.length >= 5);

  const everyHonour = () => [
    ...career.players.flatMap((player) => player.honours ?? []),
    ...career.worldLeagues.flatMap((state) =>
      state.performers.flatMap((player) => player.honours ?? []),
    ),
  ];
  for (const award of awards) {
    if (award.award === "Ballon d'Or") continue;
    for (const winner of award.winners) {
      const owner = career.findWorldPlayer(winner.playerId);
      assert.ok(owner, `winner ${winner.player} should exist in the world`);
      const honours = career.getPlayerHonours(owner);
      assert.ok(
        honours.some(
          (honour) =>
            honour.award === award.award && honour.season === career.season,
        ),
        `${winner.player} should hold the ${award.award} honour`,
      );
    }
  }

  // The Ballon d'Or is global, so its winner must hold the honour too.
  const ballon = awards.find((award) => award.award === "Ballon d'Or");
  assert.ok(ballon.winners.length > 0);
  const ballonOwner = career.findWorldPlayer(ballon.winners[0].playerId);
  assert.ok(
    !career
      .getPlayerHonours(ballonOwner)
      .some((honour) => honour.award === "Ballon d'Or"),
  );
  career.advanceSeason();
  assert.ok(
    career
      .getPlayerHonours(ballonOwner)
      .some((honour) => honour.award === "Ballon d'Or"),
  );
  assert.equal(career.ballonDorCeremonies[0].ceremonySeason, career.season);
  assert.ok(everyHonour().length > 0);

  // A legend keeps his trophy even though he lives outside the user's squad.
  const legends = career.getLegends();
  assert.ok(legends.length > 0);
});

test("league winners receive a league champion trophy", async () => {
  const career = createCareer(await loadData(), options(55103));
  let weeks = 0;
  while (!career.seasonComplete && weeks < 44) {
    advanceAndResolve(career);
    weeks++;
  }
  const championId = career.league.table.sorted()[0].teamId;
  const championName = career.clubs.find((club) => club.id === championId).name;
  career.advanceSeason();
  const history = career.seasonHistory[0].trophyWinners.find(
    (trophy) => trophy.competition === career.data.league.name,
  );
  assert.equal(history.winner, championName);
  const championPlayers = career.players.filter(
    (player) => player.clubId === championId,
  );
  assert.ok(
    championPlayers.some((player) =>
      player.honours?.some(
        (honour) =>
          honour.award === `${career.data.league.name} Champion` &&
          honour.competition === career.data.league.name,
      ),
    ),
  );
});

test("NPC league champions receive player honours and appear in season history", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55104));
  const state = career.worldLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const championId = state.league.teamIds[0];
  const championRow = state.league.table.row(championId);
  championRow.points = 100;
  championRow.played = 38;
  for (const row of state.league.table.rows.values()) {
    row.played = 38;
    if (row.teamId !== championId) row.points = 20;
  }
  career.recordLeagueChampionHonours();
  const champion = state.performers.find(
    (player) => player.clubId === championId,
  );
  assert.ok(champion);
  assert.ok(
    champion.honours?.some(
      (honour) =>
        honour.award === "La Liga Champion" && honour.competition === "La Liga",
    ),
  );
  const ratingChange = {
    previous: 60,
    current: 61,
    change: 1,
    season: career.season,
    reason: "Test rating history persistence",
  };
  const historyPlayer = state.performers.find(
    (player) =>
      player.id !== champion.id &&
      player.age < 28 &&
      player.source === "generated",
  );
  assert.ok(historyPlayer);
  historyPlayer.ratingHistory = [ratingChange];
  career.seasonHistory = [];
  for (const league of [
    career.league,
    ...career.worldLeagues.map((entry) => entry.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.advanceSeason();
  assert.ok(
    career.seasonHistory[0].trophyWinners.some(
      (trophy) =>
        trophy.competition === "La Liga" && trophy.winnerId === championId,
    ),
  );
  const currentHistoryPlayer = career.worldLeagues
    .flatMap((worldState) => worldState.performers)
    .find((player) => player.id === historyPlayer.id);
  assert.ok(
    currentHistoryPlayer.ratingHistory.some(
      (entry) => entry.reason === ratingChange.reason,
    ),
  );
  const restored = createCareer(
    data,
    career.creation,
    JSON.parse(JSON.stringify(career.toJSON())),
  );
  assert.ok(
    restored.worldLeagues
      .flatMap((worldState) => worldState.performers)
      .find((player) => player.id === historyPlayer.id)
      .ratingHistory.some((entry) => entry.reason === ratingChange.reason),
  );
});

test("league Player of the Season comes from the champion club", async () => {
  const career = createCareer(await loadData(), options(55105));
  const championId = career.league.table.sorted()[0].teamId;
  for (const row of career.league.table.rows.values()) {
    row.played = 38;
    row.points = row.teamId === championId ? 100 : 20;
  }
  for (const state of career.worldLeagues) {
    const matches = 2 * (state.league.teamIds.length - 1);
    for (const row of state.league.table.rows.values()) row.played = matches;
  }
  const championPlayer = career.players.find(
    (player) => player.clubId === championId,
  );
  const rivalPlayer = career.players.find(
    (player) => player.clubId !== championId,
  );
  championPlayer.stats.apps = 30;
  championPlayer.stats.ratingSum = 240;
  championPlayer.leaguePerformance = { apps: 30, ratingSum: 240 };
  championPlayer.leagueGoals = 8;
  championPlayer.leagueAssists = 6;
  rivalPlayer.stats.apps = 30;
  rivalPlayer.stats.ratingSum = 300;
  rivalPlayer.leaguePerformance = { apps: 30, ratingSum: 300 };
  rivalPlayer.leagueGoals = 40;
  rivalPlayer.leagueAssists = 30;
  career.seasonAwardHistory = [];
  career.areAllLeagueSeasonsComplete = () => true;
  career.recordSeasonAwards();
  const award = career.currentSeasonAwards.awards.find(
    (entry) => entry.award === "Player of the Season",
  );
  assert.equal(award.winners[0].playerId, championPlayer.id);
});

test("every playable league receives its own non-global awards", async () => {
  const career = createCareer(await loadData(), options(55107));
  for (const league of [
    career.league,
    ...career.worldLeagues.map((state) => state.league),
  ]) {
    const matches = 2 * (league.teamIds.length - 1);
    for (const row of league.table.rows.values()) row.played = matches;
  }
  career.seasonAwardHistory = [];
  career.areAllLeagueSeasonsComplete = () => true;
  career.recordSeasonAwards();
  const playableLeagues = [
    career.league.name,
    ...career.worldLeagues.map((state) => state.league.name),
  ];
  for (const leagueName of playableLeagues) {
    const playerAward = career.currentSeasonAwards.awards.find(
      (award) =>
        award.award === "Player of the Season" &&
        award.competition === leagueName,
    );
    assert.ok(playerAward, `${leagueName} should have a Player of the Season`);
  }
  assert.equal(
    career.currentSeasonAwards.awards.filter(
      (award) => award.award === "Ballon d'Or",
    ).length,
    1,
  );
});

test("background league strength is measured from the current squad", async () => {
  const career = createCareer(await loadData(), options(55106));
  const state = career.worldLeagues.find(
    (entry) => entry.league.name === "La Liga",
  );
  const clubIds = state.league.teamIds.slice(0, 2);
  state.performers
    .filter((player) => player.clubId === clubIds[0])
    .forEach((player) => {
      player.overall = 90;
    });
  state.performers
    .filter((player) => player.clubId === clubIds[1])
    .forEach((player) => {
      player.overall = 60;
    });
  assert.ok(
    career.worldClubStrength(state, clubIds[0]) >
      career.worldClubStrength(state, clubIds[1]),
  );
});

test("the trophy case groups identical trophies and shows the total count", async () => {
  const career = createCareer(await loadData(), options(55102));
  career.player.honours = [];
  for (const season of [2026, 2027, 2028]) {
    career.recordPlayerHonour(career.player, {
      award: "Premier League Champion",
      season,
      competition: "Premier League",
      value: "Champion",
    });
  }
  career.recordPlayerHonour(career.player, {
    award: "Golden Boot",
    season: 2028,
    competition: "Premier League",
    value: "31 league goals",
  });

  const honours = career.getCareerHonours();
  assert.equal(honours.length, 4);
  const groups = groupHonours(honours);
  assert.equal(groups.length, 2);
  const league = groups.find(
    (group) => group.award === "Premier League Champion",
  );
  assert.equal(league.count, 3);
  assert.deepEqual(league.seasons, [2026, 2027, 2028]);
  assert.equal(seasonsLabel(league.seasons), "2026, 2027, 2028");
  assert.equal(totalTrophies(honours), 4);
});

/* ------------------------------------------------------------------------- *
 * Every award winner keeps his trophy — including the legends and players who do not
 * play in the user's league. This was the "Messi and Ronaldo's stats are not saved"
 * report: their honours were recorded against a player object that lived elsewhere.
 * ------------------------------------------------------------------------- */

test("legends and other leagues' players keep the trophies they win", async () => {
  const career = createCareer(await loadData(), options(55109));
  const legends = career.getLegends();
  assert.ok(legends.length >= 2, "Messi and Ronaldo should be in the world");
  for (const { player } of legends) player.honours = [];

  const messi = legends.find((entry) => entry.player.clubId === "fc-barcelona");
  career.recordPlayerHonour(messi.player, {
    award: "Ballon d'Or",
    season: 2026,
    competition: "World football",
    value: "88.4 pts",
  });
  assert.equal(career.getPlayerHonours(messi.player).length, 1);

  // A player from another playable league — found by id, the way the award race does it.
  const otherLeague = career.worldLeagues[0];
  const performer = otherLeague.performers.find(
    (entry) => !entry.isLegend && !entry.injury,
  );
  career.recordPlayerHonour(performer.id, {
    award: "Golden Boot",
    season: 2026,
    competition: otherLeague.league.name,
    value: "29 league goals",
  });
  assert.equal(career.getPlayerHonours(performer).length, 1);
  // ... and it is recorded against HIS league, not the user's.
  assert.equal(
    career.competitionForPlayer(performer, career.league.name),
    otherLeague.league.name,
  );

  // A legend's honour survives a save/load round trip.
  const restored = createCareer(
    await loadData(),
    career.creation,
    JSON.parse(JSON.stringify(career)),
  );
  const restoredMessi = restored
    .getLegends()
    .find((entry) => entry.player.clubId === "fc-barcelona");
  assert.equal(restored.getPlayerHonours(restoredMessi.player).length, 1);
});

/* ------------------------------------------------------------------------- *
 * Potential is a hard ceiling for the base overall.
 * ------------------------------------------------------------------------- */

test("development and the transfer market never push the base overall past potential", async () => {
  const career = createCareer(await loadData(), options(55103));
  for (const player of career.players) {
    if (player.isUser || player.isLegend) continue;
    player.potential = calculateOverall(player);
    player.developmentProgress = 0;
  }
  const before = career.players.map((player) => ({
    id: player.id,
    overall: player.overall,
    potential: player.potential,
  }));
  career.developLeaguePlayers();
  for (const entry of before) {
    const player = career.players.find(
      (candidate) => candidate.id === entry.id,
    );
    assert.ok(
      player.overall <= player.potential,
      `${player.last} overall ${player.overall} exceeded potential ${player.potential}`,
    );
  }
  // World-league performers follow the same ceiling.
  for (const state of career.worldLeagues) {
    for (const performer of state.performers) {
      if (performer.isLegend) continue;
      assert.ok(performer.overall <= (performer.potential ?? 99));
    }
  }
});

test("form lifts the displayed overall above the base and drops it when out of form", async () => {
  const career = createCareer(await loadData(), options(55104));
  const player = career.player;
  player.potential = Math.min(99, calculateOverall(player) + 4);

  player.form = 50;
  assert.equal(career.displayOverall(player), calculateOverall(player));

  player.form = 100;
  assert.ok(career.displayOverall(player) > calculateOverall(player));
  assert.ok(
    career.displayOverall(player) <= player.potential,
    "form can never carry a player past his potential",
  );

  player.form = 0;
  assert.ok(career.displayOverall(player) < calculateOverall(player));
  // The base rating itself never moved: form is a temporary layer.
  assert.equal(calculateOverall(player), career.baseOverall(player));
});

/* ------------------------------------------------------------------------- *
 * The World Cup goal race.
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------------- *
 * Injuries: physicality decides the risk, and an injured player sits out.
 * ------------------------------------------------------------------------- */

test("injured players are never selected for a match", async () => {
  const career = createCareer(await loadData(), options(55106));
  const squad = career.players.filter(
    (player) => player.clubId === career.club.id && !player.isUser,
  );
  for (const player of squad) {
    player.injury = { type: "moderate", label: "Moderate injury", weeks: 4 };
  }
  const report = (() => {
    let value;
    do {
      value = advanceAndResolve(career);
    } while (!value.userMatch);
    return value;
  })();
  const xi = report.userMatch[report.userMatch.side].xi;
  for (const id of xi) {
    const player = career.players.find((entry) => entry.id === id);
    assert.ok(!player?.injury, `${player?.last} was selected while injured`);
  }
});

test("a fitter, stronger player is less likely to be injured", async () => {
  const career = createCareer(await loadData(), options(55107));
  const strong = {
    ...career.player,
    attrs: { ...career.player.attrs, physical: 90 },
  };
  const frail = {
    ...career.player,
    attrs: { ...career.player.attrs, physical: 40 },
  };
  assert.ok(injuryRiskMultiplier(strong) < injuryRiskMultiplier(frail));
  assert.ok(matchInjuryChance(strong) < matchInjuryChance(frail));

  const tired = {
    ...strong,
    fatigue: 90,
    fitness: 45,
  };
  assert.ok(injuryRiskMultiplier(tired) > injuryRiskMultiplier(strong));
});

test("training injuries are rolled each week and heal over time", async () => {
  const career = createCareer(await loadData(), options(55108));
  // A whole squad on 100% injury rolls guarantees a training injury, which proves the
  // roll runs; the physical attribute then decides how likely it is in normal play.
  const teammate = career.players.find(
    (player) => player.clubId === career.club.id && !player.isUser,
  );
  const original = injuryRiskMultiplier;
  let injuredSeen = false;
  for (let week = 0; week < 8 && !injuredSeen; week++) {
    advanceAndResolve(career);
    injuredSeen = career.players.some(
      (player) => player.clubId === career.club.id && player.injury,
    );
  }
  // Either the seeded rolls produced an injury, or the squad is healthy: in both cases
  // every injury on record must carry a valid duration from the catalogue.
  for (const player of career.players) {
    if (!player.injury) continue;
    assert.ok(player.injury.weeks >= 1);
    assert.ok(
      INJURY_SEVERITIES.some((entry) => entry.type === player.injury.type),
      `unknown injury type ${player.injury.type}`,
    );
  }
  assert.ok(teammate);
  assert.equal(typeof original, "function");

  // Force a serious injury and confirm the weeks count down to fitness.
  career.player.injury = createInjury("serious", career.rng.stream("test"), 12);
  const weeks = career.player.injury.weeks;
  assert.ok(weeks >= 8);
  for (let i = 0; i < weeks; i++) advanceAndResolve(career);
  assert.equal(career.player.injury, null);
});

test("World Cup calendar advances from a prior edition and does not replay a completed edition", async () => {
  const career = createCareer(await loadData(), options(55109));
  career.worldCup.nextYear = 2034;
  career.season = 2030;
  career.week = -1;
  career.worldCup.tournament = { year: 2030, status: "complete" };
  career.dayCursor = toDayIndex(2034, 6, 1);
  let starts = 0;
  let progressions = 0;
  career.startWorldCupTournament = () => {
    starts++;
    career.worldCup.tournament = {
      year: 2034,
      status: "in-progress",
      qualified: [],
      fixtures: [],
    };
    return career.worldCup.tournament;
  };
  career.progressWorldCupFixtures = () => {
    progressions++;
    career.worldCup.tournament.status = "complete";
    career.worldCup.nextYear = 2038;
    return [];
  };

  const report = career.processWorldCupCalendar();
  assert.equal(starts, 1);
  assert.equal(progressions, 1);
  assert.equal(report.tournament.year, 2034);
  assert.equal(career.processWorldCupCalendar(), null);
  assert.equal(starts, 1);
  assert.equal(progressions, 1);
});

test("the World Cup fixture calendar is unique, scheduled, and save-persistent", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55115));
  const tournament = career.simulateWorldCup();
  const fixtureIds = tournament.fixtures.map((fixture) => fixture.id);
  assert.equal(new Set(fixtureIds).size, fixtureIds.length);
  assert.deepEqual(tournament.fixtureIds, fixtureIds);
  assert.ok(tournament.calendar.length > 1);
  assert.ok(
    tournament.fixtures.every(
      (fixture) =>
        Number.isFinite(fixture.scheduledDay) &&
        tournament.calendar.some(
          (matchday) =>
            matchday.day === fixture.scheduledDay &&
            matchday.fixtureIds.includes(fixture.id),
        ),
    ),
  );
  for (const matchday of tournament.calendar) {
    const teams = tournament.fixtures
      .filter((fixture) => matchday.fixtureIds.includes(fixture.id))
      .flatMap((fixture) => [fixture.homeId, fixture.awayId]);
    assert.equal(new Set(teams).size, teams.length);
  }
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.deepEqual(restored.worldCup.tournament.calendar, tournament.calendar);
  assert.deepEqual(restored.worldCup.tournament.fixtureIds, fixtureIds);
});

test("selected World Cup group fixtures run in Match Sim and record only international results", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55119));
  const tournament = career.startWorldCupTournament();
  const userTeam = tournament.qualified.find(
    (team) => team.code === career.player.nationality,
  );
  assert.ok(userTeam, "the player's national team should qualify");
  if (!userTeam.squadIds.includes(career.player.id))
    userTeam.squadIds.push(career.player.id);
  career.worldCup.userSelection = {
    year: tournament.year,
    nation: career.player.nationality,
    selected: true,
    qualified: true,
  };
  const fixture = tournament.fixtures
    .filter(
      (entry) =>
        entry.stage === "group" &&
        (entry.homeId === userTeam.id || entry.awayId === userTeam.id),
    )
    .sort((left, right) => left.scheduledDay - right.scheduledDay)[0];
  const listedFixture = career
    .getFixtureList()
    .find((entry) => entry.id === fixture.id);
  assert.equal(listedFixture.date, fixture.scheduledDay);
  assert.equal(listedFixture.competitionId, "fifa-world-cup");
  assert.equal(
    listedFixture.home,
    tournament.qualified.find((team) => team.id === fixture.homeId).name,
  );
  assert.equal(
    listedFixture.away,
    tournament.qualified.find((team) => team.id === fixture.awayId).name,
  );
  const leaguePlayedBefore = career.league.table.row(career.club.id).played;
  career.season = tournament.year - 1;
  career.week = 31;
  career.calendar[32].matchday = fixture.scheduledDay;
  career.league.fixtureWeeks = career.league.fixtureWeeks.filter(
    (week) => week !== 32,
  );
  const report = career.advanceWeek();
  assert.equal(report.userMatch.worldCupFixtureId, fixture.id);
  assert.equal(report.userMatch.competitionName, "FIFA World Cup");
  assert.equal(
    report.userMatch[report.userMatch.side].name,
    userTeam.name,
  );
  assert.equal(fixture.status, "scheduled");
  career.lastReport = {
    week: career.week,
    ...report,
  };
  career.finishMatchSimulation();

  assert.equal(fixture.status, "completed");
  assert.equal(fixture.homeGoals >= 0, true);
  assert.equal(fixture.awayGoals >= 0, true);
  assert.equal(career.league.table.row(career.club.id).played, leaguePlayedBefore);
  assert.ok(career.player.internationalStats.worldCupApps > 0);
  assert.ok(
    career.player.internationalHistory.some(
      (entry) => entry.id === `${fixture.id}:${career.player.id}`,
    ),
  );
  assert.ok(tournament.playerStats[career.player.id].apps > 0);
  assert.ok(career.getFixtureList().find((entry) => entry.id === fixture.id).stats);
  assert.ok(!career.results.some((entry) => entry.id === fixture.id));

  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  const internationalApps = restored.player.internationalStats.worldCupApps;
  const replay = restored.progressWorldCupFixtures(
    restored.worldCup.tournament,
    fixture.scheduledDay,
  );
  assert.deepEqual(replay.completed, []);
  assert.equal(restored.player.internationalStats.worldCupApps, internationalApps);
});

test("selected World Cup knockout fixtures use Match Sim and advance the bracket", async () => {
  const career = createCareer(await loadData(), options(55120));
  const tournament = career.startWorldCupTournament();
  const userTeam = tournament.qualified.find(
    (team) => team.code === career.player.nationality,
  );
  assert.ok(userTeam);
  if (!userTeam.squadIds.includes(career.player.id))
    userTeam.squadIds.push(career.player.id);
  career.worldCup.userSelection = {
    year: tournament.year,
    nation: career.player.nationality,
    selected: true,
    qualified: true,
  };
  const bracketTeams = [
    userTeam,
    ...tournament.qualified.filter((team) => team.id !== userTeam.id).slice(0, 7),
  ];
  const day = toDayIndex(tournament.year, 7, 5);
  tournament.fixtures = [];
  tournament.groupsAdvanced = true;
  tournament.knockoutTeams = bracketTeams.map((team) => team.id);
  tournament.knockoutStage = "Quarter-finals";
  tournament.stage = "Quarter-finals";
  for (let index = 0; index < bracketTeams.length / 2; index++) {
    const home = bracketTeams[index];
    const away = bracketTeams[bracketTeams.length - 1 - index];
    tournament.fixtures.push({
      id: `test-quarter-final-${index}`,
      stage: "knockout",
      knockoutStage: "Quarter-finals",
      round: "Quarter-finals",
      homeId: home.id,
      awayId: away.id,
      status: "scheduled",
      scheduledDay: day,
    });
  }
  const fixture = tournament.fixtures.find(
    (entry) => entry.homeId === userTeam.id || entry.awayId === userTeam.id,
  );
  const progress = career.progressWorldCupFixtures(tournament, day);
  assert.equal(progress.userMatch.worldCupFixtureId, fixture.id);
  career.lastReport = {
    week: career.week,
    fixtures: [progress.userMatch.worldCupFixtureRecord],
    userMatch: progress.userMatch,
    headlines: [],
  };
  career.finishMatchSimulation();
  assert.equal(fixture.status, "completed");
  assert.ok(fixture.winnerId);
  assert.equal(tournament.knockoutStage, "Semi-finals");
  assert.equal(
    tournament.fixtures.filter(
      (entry) =>
        entry.stage === "knockout" &&
        entry.knockoutStage === "Semi-finals",
    ).length,
    2,
  );
});

test("World Cup fixtures progress by date and completed matches do not replay after loading", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55117));
  const year = career.worldCup.nextYear;
  career.season = year - 1;
  career.week = 32;
  career.dayCursor = toDayIndex(year, 6, 10);
  const started = career.processWorldCupCalendar();
  assert.ok(
    started,
    `expected tournament start (year=${year}, day=${career.currentDay()}, season=${career.season}, week=${career.week}, next=${career.worldCup.nextYear})`,
  );
  assert.equal(started.tournament.status, "in-progress");
  assert.equal(started.worldCupMatches.length, 0);
  const firstFixture = career.worldCup.tournament.fixtures
    .filter((fixture) => fixture.stage === "group")
    .sort((left, right) => left.scheduledDay - right.scheduledDay)[0];
  assert.equal(firstFixture.status, "scheduled");

  career.dayCursor = firstFixture.scheduledDay;
  const matchday = career.processWorldCupCalendar();
  assert.ok(matchday.worldCupMatches.includes(firstFixture.id));
  assert.equal(firstFixture.status, "completed");
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  const repeated = restored.processWorldCupCalendar();
  assert.deepEqual(repeated.worldCupMatches, []);
  assert.equal(
    restored.worldCup.tournament.fixtures.filter(
      (fixture) =>
        fixture.id === firstFixture.id && fixture.status === "completed",
    ).length,
    1,
  );
  for (
    let day = firstFixture.scheduledDay + 7;
    day <= toDayIndex(year, 8, 1) &&
    restored.worldCup.tournament.status === "in-progress";
    day += 7
  ) {
    restored.dayCursor = day;
    restored.processWorldCupCalendar();
    if (day === toDayIndex(year, 7, 9)) {
      const activeTeamIds = new Set(restored.worldCup.tournament.knockoutTeams);
      const eliminatedTeams = restored.worldCup.tournament.qualified.filter(
        (team) => !activeTeamIds.has(team.id),
      );
      assert.ok(eliminatedTeams.length > 0);
      assert.ok(
        eliminatedTeams
          .flatMap((team) => team.squadIds)
          .every((playerId) => !restored.worldCupUnavailableIds.has(playerId)),
      );
    }
  }
  assert.equal(restored.worldCup.tournament.status, "complete");
  assert.ok(restored.worldCup.tournament.winnerId);
  assert.ok(restored.worldCup.tournament.runnerUpId);
  assert.ok(
    restored.worldCup.tournament.fixtures.every(
      (fixture) => fixture.status === "completed",
    ),
  );
  assert.equal(restored.worldCup.history.length, 1);
  assert.equal(
    restored.worldCup.history[0].winnerId,
    restored.worldCup.tournament.winnerId,
  );
});

test("a season cannot finish before its scheduled World Cup resolves", async () => {
  const career = createCareer(await loadData(), options(55116));
  career.areAllLeagueSeasonsComplete = () => true;
  career.worldCup.nextYear = career.season + 1;
  career.championsLeague = null;
  assert.equal(career.areAllSeasonCompetitionsComplete(), false);
  career.worldCup.tournament = {
    year: career.worldCup.nextYear,
    season: career.season,
    status: "complete",
  };
  assert.equal(career.areAllSeasonCompetitionsComplete(), true);
});

test("the Ballon d'Or ceremony is a next-season, persisted, one-time event", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55118));
  const winner = career.player;
  const evaluation = {
    winner: {
      playerId: winner.id,
      player: `${winner.first} ${winner.last}`,
      points: 825,
    },
    top10: [],
  };
  career.currentSeasonAwards = {
    season: career.season,
    awards: [
      {
        award: "Ballon d'Or",
        competition: "World football",
        winners: [
          {
            playerId: winner.id,
            player: `${winner.first} ${winner.last}`,
            club: career.club.name,
          },
        ],
        displayValue: "825 / 1000 pts",
        evaluation,
      },
    ],
  };
  career.refreshCurrentBallonDorSnapshot = () => {};
  const ceremony = career.publishBallonDorCeremony();
  assert.equal(ceremony.awardPeriod, career.season);
  assert.equal(ceremony.ceremonySeason, career.season + 1);
  assert.equal(career.publishBallonDorCeremony(), null);
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.deepEqual(restored.ballonDorCeremonies, [ceremony]);
  assert.equal(restored.publishBallonDorCeremony(), null);
  assert.equal(
    restored
      .getPlayerHonours(restored.player)
      .filter((honour) => honour.award === "Ballon d'Or").length,
    1,
  );
});

test("legacy World Cup schedules migrate without resetting the career save", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55110));
  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  saved.worldCup.nextYear = 2028;
  saved.worldCup.qualification = {
    year: 2028,
    status: "in-progress",
    groups: [],
    fixtures: [],
  };

  const restored = createCareer(data, saved.creation, saved);
  assert.equal(restored.worldCup.firstYear, 2030);
  assert.equal(restored.worldCup.interval, 4);
  assert.equal(restored.worldCup.nextYear, 2030);
  assert.equal(restored.worldCup.qualification.year, 2030);
  assert.equal(restored.player.id, career.player.id);
  assert.equal(restored.season, career.season);
});

test("the available national pool completes a balanced World Cup with durable honours", async () => {
  const data = await loadData();
  const career = createCareer(data, options(55111));
  assert.equal(career.worldCup.firstYear, career.careerStartYear + 4);
  assert.ok(career.worldCup.qualification.fieldSize >= 4);

  const tournament = career.simulateWorldCup();
  assert.equal(tournament.status, "complete");
  assert.equal(tournament.year, career.careerStartYear + 4);
  assert.equal(tournament.qualified.length, 32);
  assert.deepEqual(
    tournament.groups.map((group) => group.teams.length),
    Array(8).fill(4),
  );
  assert.equal(
    tournament.fixtures.filter((fixture) => fixture.round === "Final").length,
    1,
  );
  assert.ok(tournament.winnerId);
  assert.ok(tournament.runnerUpId);
  assert.notEqual(tournament.winnerId, tournament.runnerUpId);
  assert.ok(Object.keys(tournament.playerStats).length > 0);
  assert.equal(career.worldCup.history.length, 1);
  assert.equal(career.worldCup.nextYear, career.careerStartYear + 8);

  const champion = tournament.qualified.find(
    (team) => team.id === tournament.winnerId,
  );
  const championPlayer = career
    .internationalPlayers()
    .find((player) => champion.squadIds.includes(player.id));
  assert.ok(championPlayer);
  const wins = championPlayer.internationalStats.worldCupWins;
  const honours = championPlayer.honours.length;
  assert.equal(
    championPlayer.honours.filter(
      (honour) =>
        honour.award === "FIFA World Cup Winner" &&
        honour.season === tournament.season,
    ).length,
    1,
  );
  career.awardWorldCupHonours(tournament);
  assert.equal(championPlayer.internationalStats.worldCupWins, wins);
  assert.equal(championPlayer.honours.length, honours);

  career.season = tournament.season;
  const worldCupRace = career
    .getBallonDorRace()
    .filter((entry) => entry.worldCupPoints > 0);
  assert.ok(worldCupRace.length > 0);
  assert.ok(worldCupRace.every((entry) => entry.points <= 1000));

  const secondTournament = career.simulateWorldCup();
  assert.equal(secondTournament.year, tournament.year + 4);
  assert.equal(secondTournament.status, "complete");
  assert.equal(career.worldCup.history.length, 2);
  assert.equal(career.worldCup.nextYear, tournament.year + 8);

  const saved = JSON.parse(JSON.stringify(career.toJSON()));
  const restored = createCareer(data, saved.creation, saved);
  assert.equal(restored.worldCup.history[0].year, tournament.year);
  assert.equal(restored.worldCup.history[1].year, tournament.year + 4);
  assert.equal(restored.worldCup.nextYear, tournament.year + 8);
  assert.ok(
    restored
      .internationalPlayers()
      .find((player) => player.id === championPlayer.id)
      .honours.some((honour) => honour.award === "FIFA World Cup Winner"),
  );
});
