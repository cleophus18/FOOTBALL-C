import { clamp } from "../core/util.mjs";

// Gameplay coefficients are probability/volume multipliers or bounded percentage-point
// nudges; none are overall-rating modifiers. Every definition names its real match hook.
const BASE = {
  powerShot: [
    "shooting",
    "Shot power and appropriate long-range shot selection.",
    "shoot",
    1.12,
  ],
  finesseShot: [
    "shooting",
    "Better curl-shot selection and corner accuracy in suitable angles.",
    "finesse",
    1.12,
  ],
  longShot: [
    "shooting",
    "More selective and consistent shots from outside the area.",
    "longShot",
    1.13,
  ],
  chipShot: [
    "shooting",
    "Improves a lifted finish when the goalkeeper is off their line.",
    "chip",
    1.1,
  ],
  lowDrivenShot: [
    "shooting",
    "Improves controlled low finishes at close range.",
    "lowShot",
    1.1,
  ],
  firstTimeShot: [
    "shooting",
    "Improves shots taken immediately after a pass or cross.",
    "firstTime",
    1.1,
  ],
  acrobaticFinishing: [
    "shooting",
    "Improves suitable volleys and difficult finishes.",
    "volley",
    1.1,
  ],
  deadBall: [
    "shooting",
    "Improves free kicks and set-piece delivery.",
    "setPiece",
    1.12,
  ],
  incisivePass: [
    "passing",
    "Improves line-breaking through balls when a teammate runs beyond.",
    "throughPass",
    1.13,
  ],
  pingedPass: [
    "passing",
    "Improves driven passes over longer distances.",
    "drivenPass",
    1.12,
  ],
  longBallPass: [
    "passing",
    "Improves accurate long passes and switches.",
    "longPass",
    1.12,
  ],
  tikiTaka: [
    "passing",
    "Improves quick short combinations under modest pressure.",
    "shortPass",
    1.1,
  ],
  whippedPass: ["passing", "Improves fast, curved crosses.", "cross", 1.13],
  precisionCross: [
    "passing",
    "Improves accuracy of crosses into dangerous areas.",
    "crossAccuracy",
    1.12,
  ],
  inventivePasser: [
    "passing",
    "Improves creative passes when the lane and receiver support it.",
    "creativePass",
    1.1,
  ],
  technical: [
    "dribbling",
    "Improves close control and controlled dribbling.",
    "dribble",
    1.1,
  ],
  rapid: [
    "dribbling",
    "Improves speed while carrying into open space.",
    "carrySpeed",
    1.1,
  ],
  quickStep: [
    "dribbling",
    "Improves the first acceleration burst when initiating a take-on.",
    "acceleration",
    1.1,
  ],
  firstTouch: [
    "dribbling",
    "Improves control when receiving difficult passes.",
    "firstTouch",
    1.1,
  ],
  flair: [
    "dribbling",
    "Unlocks occasional creative actions with an execution risk.",
    "flair",
    1.08,
  ],
  pressProven: [
    "dribbling",
    "Improves retention when opponents apply pressure.",
    "retention",
    1.12,
  ],
  trickster: [
    "dribbling",
    "Improves advanced skill actions for players with skill-move ability.",
    "skill",
    1.1,
  ],
  aerial: [
    "physical",
    "Improves aerial contest timing and reach.",
    "aerial",
    1.1,
  ],
  powerHeader: [
    "physical",
    "Improves force and accuracy of appropriate headers.",
    "header",
    1.12,
  ],
  acrobatic: [
    "physical",
    "Improves appropriate aerial and acrobatic actions.",
    "acrobatics",
    1.1,
  ],
  rapidBreakaway: [
    "physical",
    "Improves runs into open space when the team breaks forward.",
    "run",
    1.1,
  ],
  relentless: [
    "physical",
    "Reduces fatigue-related performance loss over a match.",
    "fatigue",
    0.78,
  ],
  engine: [
    "physical",
    "Reduces stamina loss, fatigue penalties and low-stamina injury risk.",
    "stamina",
    0.5,
  ],
  bruiser: [
    "physical",
    "Improves physical duels using strength and physical attributes.",
    "duel",
    1.1,
  ],
  trivela: [
    "physical",
    "Improves suitable outside-foot passes and shots.",
    "trivela",
    1.1,
  ],
  anticipate: [
    "defending",
    "Improves anticipation and interception positioning.",
    "anticipate",
    1.12,
  ],
  intercept: [
    "defending",
    "Improves reach and success when cutting out passing lanes.",
    "intercept",
    1.12,
  ],
  jockey: [
    "defending",
    "Improves controlled positioning against a dribbler.",
    "jockey",
    1.1,
  ],
  block: [
    "defending",
    "Improves shot-blocking positioning and effectiveness.",
    "block",
    1.12,
  ],
  slideTackle: [
    "defending",
    "Improves timing and success of sliding challenges.",
    "slideTackle",
    1.1,
  ],
  aerialFortress: [
    "defending",
    "Improves defensive aerial contests.",
    "aerialDefense",
    1.12,
  ],
  trackBack: [
    "defending",
    "Improves recovery runs when defensive transition requires them.",
    "trackBack",
    1.1,
  ],
  farReach: [
    "goalkeeping",
    "Improves saves against difficult shots toward the corners.",
    "farReach",
    1.12,
  ],
  footwork: [
    "goalkeeping",
    "Improves close-range saves made with the feet.",
    "footwork",
    1.12,
  ],
  rushOut: [
    "goalkeeping",
    "Improves decisions and execution when leaving the line.",
    "rushOut",
    1.1,
  ],
  crossClaimer: [
    "goalkeeping",
    "Improves decisions and success when claiming crosses.",
    "crossClaim",
    1.12,
  ],
  farThrow: [
    "goalkeeping",
    "Improves long-distance hand distribution.",
    "farThrow",
    1.12,
  ],
  deflector: [
    "goalkeeping",
    "Directs parries away from dangerous central areas.",
    "deflect",
    1.12,
  ],
  quickReflexes: [
    "goalkeeping",
    "Improves reactions to close-range attempts.",
    "reflex",
    1.12,
  ],
  sweeperKeeper: [
    "goalkeeping",
    "Improves positioning behind a high defensive line.",
    "sweeper",
    1.1,
  ],
};
const GROUP_POSITIONS = {
  shooting: ["ST", "LW", "RW", "AM", "CM"],
  passing: ["CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"],
  dribbling: ["LB", "RB", "CM", "AM", "LW", "RW", "ST"],
  physical: ["CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"],
  defending: ["CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"],
  goalkeeping: ["GK"],
};
const NAMES = {
  powerShot: "Power Shot",
  finesseShot: "Finesse Shot",
  longShot: "Long Shot Specialist",
  chipShot: "Chip Shot",
  lowDrivenShot: "Low Driven Shot",
  firstTimeShot: "First-Time Shot",
  acrobaticFinishing: "Acrobatic Finishing",
  deadBall: "Dead Ball Specialist",
  incisivePass: "Incisive Pass",
  pingedPass: "Pinged Pass",
  longBallPass: "Long Ball Pass",
  tikiTaka: "Tiki-Taka",
  whippedPass: "Whipped Pass",
  precisionCross: "Precision Cross",
  inventivePasser: "Inventive Passer",
  technical: "Technical",
  rapid: "Rapid",
  quickStep: "Quick Step",
  firstTouch: "First Touch",
  flair: "Flair",
  pressProven: "Press Proven",
  trickster: "Trickster",
  aerial: "Aerial",
  powerHeader: "Power Header",
  acrobatic: "Acrobatic",
  rapidBreakaway: "Rapid Breakaway",
  engine: "Endurance Engine",
  relentless: "Relentless",
  bruiser: "Bruiser",
  trivela: "Trivela",
  anticipate: "Anticipate",
  intercept: "Intercept",
  jockey: "Jockey",
  block: "Block",
  slideTackle: "Slide Tackle",
  aerialFortress: "Aerial Fortress",
  trackBack: "Track Back",
  farReach: "Far Reach",
  footwork: "Footwork",
  rushOut: "Rush Out",
  crossClaimer: "Cross Claimer",
  farThrow: "Far Throw",
  deflector: "Deflector",
  quickReflexes: "Quick Reflexes",
  sweeperKeeper: "Sweeper Keeper",
};
export const PLAYSTYLE_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE).map(([id, [category, description, hook, value]]) => [
      id,
      Object.freeze({
        id,
        name: NAMES[id],
        category,
        description,
        eligiblePositions: GROUP_POSITIONS[category],
        eligibleRoles: [],
        relevantAttributes:
          category === "goalkeeping"
            ? ["reflexes", "positioning", "handling"]
            : category === "shooting"
              ? ["shooting", "finishing", "shotPower", "longShots", "curve"]
              : category === "passing"
                ? [
                    "passing",
                    "vision",
                    "shortPassing",
                    "longPassing",
                    "crossing",
                  ]
                : category === "dribbling"
                  ? ["dribbling", "ballControl", "agility", "pace"]
                  : category === "defending"
                    ? [
                        "defending",
                        "interceptions",
                        "defensiveAwareness",
                        "standingTackle",
                      ]
                    : ["physical", "strength", "stamina"],
        effect: { hook, standard: value, plus: 1 + (value - 1) * 1.85 },
        unlockRequirements: {
          minAttribute:
            id === "longShot" ? 68 : id === "incisivePass" ? 68 : 62,
          evidence: 3,
          minAge: 16,
          maxBadges: 8,
        },
        upgradeConditions: { evidence: 12, minOverall: 76, maxPlus: 2 },
        icon: `playstyles/${id}.svg`,
      }),
    ]),
  ),
);
export const PLAYSTYLE_CATEGORIES = [
  "shooting",
  "passing",
  "dribbling",
  "physical",
  "defending",
  "goalkeeping",
];
export const PLAYSTYLE_LABELS = Object.freeze(
  Object.fromEntries(
    Object.entries(PLAYSTYLE_REGISTRY).map(([id, def]) => [id, def.name]),
  ),
);

export function ensurePlayStyles(player) {
  player.playStyles ??= { unlocked: [], progress: {}, history: [] };
  if (Array.isArray(player.playStyles))
    player.playStyles = {
      unlocked: player.playStyles.map((id) => ({ id, tier: "standard" })),
      progress: {},
      history: [],
    };
  player.playStyles.unlocked = Array.isArray(player.playStyles.unlocked)
    ? player.playStyles.unlocked
    : [];
  player.playStyles.progress ??= {};
  player.playStyles.history ??= [];
  const unique = new Map();
  for (const badge of player.playStyles.unlocked)
    if (PLAYSTYLE_REGISTRY[badge.id])
      unique.set(badge.id, {
        tier: badge.tier === "plus" ? "plus" : "standard",
        unlockedAt: badge.unlockedAt ?? null,
      });
  player.playStyles.unlocked = [...unique].map(([id, data]) => ({
    id,
    ...data,
  }));
  return player.playStyles;
}
export function playStyleTier(player, id) {
  const badge = ensurePlayStyles(player).unlocked.find(
    (item) => item.id === id,
  );
  return badge?.tier ?? null;
}
export function playStyleEffect(player, hook, context = {}) {
  if (!player || context.applicable === false) return 1;
  let multiplier = 1;
  for (const badge of ensurePlayStyles(player).unlocked) {
    const def = PLAYSTYLE_REGISTRY[badge.id];
    if (!def || def.effect.hook !== hook) continue;
    if (
      def.category === "goalkeeping" &&
      context.position &&
      context.position !== "GK"
    )
      continue;
    if (def.category !== "goalkeeping" && context.position === "GK") continue;
    if (context.category && context.category !== def.category) continue;
    const standard = def.effect.standard;
    const value = badge.tier === "plus" ? def.effect.plus : standard;
    const strength = clamp(((context.attribute ?? 70) - 45) / 40, 0.25, 1.15);
    const situation = clamp(context.suitability ?? 1, 0, 1);
    // Fade the bonus under pressure and fatigue without making it disappear.
    const pressure = clamp(1 - (context.pressure ?? 0) * 0.45, 0.45, 1);
    multiplier *= 1 + (value - 1) * strength * situation * pressure;
  }
  return clamp(multiplier, 0.8, 1.3);
}
export function awardPlayStyleEvidence(player, evidence = {}, context = {}) {
  const state = ensurePlayStyles(player);
  const age = Number(context.age ?? player.age ?? 25);
  if (player.isLegend) return [];
  const positive = Object.entries(evidence).filter(
    ([, value]) => Number(value) > 0,
  );
  const candidates = Object.entries(PLAYSTYLE_REGISTRY)
    .filter(
      ([, def]) => def.category !== "goalkeeping" || player.position === "GK",
    )
    .filter(
      ([, def]) => def.category === "goalkeeping" || player.position !== "GK",
    )
    .filter(
      ([, def]) =>
        def.eligiblePositions.includes(player.position) ||
        (player.altPositions ?? []).includes(player.position),
    );
  const gained = [];
  for (const [id, def] of candidates) {
    const relevant = positive
      .filter(
        ([key]) =>
          key === def.effect.hook ||
          key === "all" ||
          (key === def.category && def.effect.hook === key),
      )
      .reduce((sum, [, value]) => sum + Number(value), 0);
    if (!relevant) continue;
    state.progress[id] = (state.progress[id] ?? 0) + Math.min(3, relevant);
    const owned = state.unlocked.find((item) => item.id === id);
    if (
      !owned &&
      state.unlocked.length <
        (age < 21
          ? 3
          : (player.overall ?? 0) >= 85
            ? 8
            : (player.overall ?? 0) >= 72
              ? 6
              : 3) &&
      age >= def.unlockRequirements.minAge &&
      (player.attrs?.[
        def.category === "shooting"
          ? "shooting"
          : def.category === "passing"
            ? "passing"
            : def.category === "dribbling"
              ? "dribbling"
              : def.category === "defending"
                ? "defending"
                : def.category === "goalkeeping"
                  ? "reflexes"
                  : "physical"
      ] ?? 60) >= def.unlockRequirements.minAttribute &&
      state.progress[id] >= def.unlockRequirements.evidence &&
      (player.attrs?.[def.relevantAttributes[0]] ??
        player.gkAttrs?.[def.relevantAttributes[0]] ??
        60) >= def.unlockRequirements.minAttribute
    ) {
      state.unlocked.push({
        id,
        tier: "standard",
        unlockedAt: context.season ?? null,
      });
      state.history.push({
        id,
        action: "unlocked",
        season: context.season ?? null,
      });
      state.progress[id] = 0;
      gained.push(id);
    } else if (
      owned &&
      owned.tier !== "plus" &&
      state.progress[id] >= def.upgradeConditions.evidence &&
      (player.overall ?? 0) >= def.upgradeConditions.minOverall &&
      state.unlocked.filter((item) => item.tier === "plus").length < 2
    ) {
      owned.tier = "plus";
      state.progress[id] = 0;
      state.history.push({
        id,
        action: "upgraded",
        season: context.season ?? null,
      });
      gained.push(id);
    }
  }
  return gained;
}
export function seedPlayStyles(player, rng = null) {
  const state = ensurePlayStyles(player);
  if (state.unlocked.length) return state;
  if (player.isLegend) return state;
  const fullName = `${player.first ?? ""} ${player.last ?? ""}`.trim().toLowerCase();
  const endurancePlayers = new Set([
    "rodri hernandez",
    "declan rice",
    "n'golo kante",
    "ngolo kante",
    "casemiro",
    "jude bellingham",
    "federico valverde",
    "aurélien tchouameni",
    "aurelien tchouameni",
    "alexis mac allister",
  ]);
  if (endurancePlayers.has(fullName)) {
    state.unlocked = [{ id: "engine", tier: "plus", unlockedAt: null }];
    return state;
  }
  const picks =
    {
      GK: ["quickReflexes", "farReach", "crossClaimer", "footwork"],
      CB: ["anticipate", "block", "aerialFortress", "intercept", "bruiser"],
      LB: ["trackBack", "rapid", "precisionCross", "intercept", "relentless"],
      RB: ["trackBack", "rapid", "whippedPass", "intercept", "relentless"],
      DM: ["anticipate", "intercept", "pressProven", "bruiser", "longBallPass"],
      CM: ["tikiTaka", "firstTouch", "incisivePass", "technical", "intercept"],
      AM: ["incisivePass", "technical", "finesseShot", "flair", "firstTouch"],
      LW: [
        "rapid",
        "quickStep",
        "technical",
        "precisionCross",
        "finesseShot",
        "flair",
      ],
      RW: [
        "rapid",
        "quickStep",
        "technical",
        "whippedPass",
        "finesseShot",
        "flair",
      ],
      ST: [
        "firstTimeShot",
        "finesseShot",
        "rapidBreakaway",
        "powerShot",
        "aerial",
        "powerHeader",
        "longShot",
      ],
    }[player.position] ?? [];
  const potential = player.overall ?? 60;
  const count =
    potential >= 85 ? 4 : potential >= 76 ? 3 : potential >= 65 ? 2 : 1;
  const sorted = [...picks].sort(
    (a, b) =>
      (player.attrs?.[PLAYSTYLE_REGISTRY[b]?.relevantAttributes[0]] ?? 50) -
        (player.attrs?.[PLAYSTYLE_REGISTRY[a]?.relevantAttributes[0]] ?? 50) ||
      (rng ? rng.float() - 0.5 : 0),
  );
  state.unlocked = sorted
    .slice(0, count)
    .map((id) => ({ id, tier: "standard", unlockedAt: null }));
  return state;
}
