/**
 * Club and Manager models.
 *
 * A club is mostly a *container*: identity, finances, a squad list, and a philosophy.
 * The interesting behaviour (selection, transfers, board expectations) lives in the sim
 * layer, because it needs to see the whole world. Keeping the club dumb is what makes
 * the 600-club background simulation cheap and makes AI transfers possible later.
 */

import { groupOf, normalizePosition } from "../core/constants.mjs";
import { clamp, mean, round, topMean } from "../core/util.mjs";
import { calculateOverall, effectiveRating, age } from "./player.mjs";
import { createClubFinance, ensureClubFinance } from "../core/finance.mjs";
import { ensureClubHierarchy } from "./hierarchy.mjs";
import { ensureClubInvestment } from "../core/investment.mjs";
import { calculateTeamRatings } from "./team-rating.mjs";
import { stadiumIdentityForClub } from "./stadiums.mjs";

export const TEAM_BOOSTERS = {
  "manchester city": 10, arsenal: 9, liverpool: 9, chelsea: 8,
  "manchester united": 8, "tottenham hotspur": 7, "newcastle united": 7,
  "aston villa": 6,   "real madrid": 10, barcelona: 10, "fc barcelona": 10, "atletico madrid": 9,
  "athletic club": 7, "real sociedad": 7, villarreal: 7, "real betis": 6,
  sevilla: 6,   "bayern munich": 10, "bayern munchen": 10, "borussia dortmund": 9,
  "bayer leverkusen": 9, "rb leipzig": 8, "vfb stuttgart": 7,
  "eintracht frankfurt": 7, wolfsburg: 6, "borussia monchengladbach": 6,
  "inter milan": 10, inter: 10, juventus: 9, "ac milan": 9, napoli: 8,
  "as roma": 8, roma: 8, atalanta: 8, lazio: 7, fiorentina: 6,
  "paris saint germain": 10,
  monaco: 8, marseille: 8, lyon: 7, lille: 7, nice: 6, lens: 6, rennes: 6,
};

export const MIN_REGISTERED_SQUAD_SIZE = 20;
export const MAX_REGISTERED_SQUAD_SIZE = 25;

function normalizedClubName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function teamBoosterFor(name) {
  return TEAM_BOOSTERS[normalizedClubName(name)] ?? 0;
}

/**
 * Each coaching philosophy leans toward certain shapes. A coach does not pick blindly:
 * the list is a preference order he draws from, then the squad decides which of his
 * preferred shapes actually fits. This is what makes "the coach decides the formation".
 */
export const COACH_STYLE_FORMATIONS = {
  Attacking: ["4-3-3", "4-2-3-1", "3-4-3", "4-4-2", "3-4-2-1"],
  Balanced: ["4-3-3", "4-2-3-1", "4-2-2-2", "4-4-2", "4-4-1-1"],
  Defensive: ["4-1-4-1", "4-2-3-1", "5-3-2", "4-4-2", "5-4-1"],
  "High Press": ["4-3-3", "4-2-3-1", "3-5-2", "4-1-2-1-2", "4-5-1"],
  Youth: ["4-3-3", "4-2-2-2", "4-3-2-1", "4-2-3-1", "3-4-2-1"],
  Pragmatic: ["4-4-2", "4-2-3-1", "4-1-4-1", "5-3-2", "5-4-1"],
};

/** Manager tactical preferences. These are data-shaped so leagues can vary them. */
export const MANAGER_STYLES = {
  Attacking: {
    attack: 1.12,
    defence: 0.94,
    youthTrust: 0.9,
    patienceLow: 0.85,
  },
  Balanced: { attack: 1.0, defence: 1.0, youthTrust: 1.0, patienceLow: 1.0 },
  Defensive: { attack: 0.9, defence: 1.12, youthTrust: 0.95, patienceLow: 1.1 },
  "High Press": {
    attack: 1.08,
    defence: 1.04,
    youthTrust: 1.1,
    patienceLow: 0.75,
  },
  Youth: { attack: 1.02, defence: 0.98, youthTrust: 1.35, patienceLow: 1.25 },
  Pragmatic: {
    attack: 0.98,
    defence: 1.02,
    youthTrust: 0.85,
    patienceLow: 1.15,
  },
};

export class Manager {
  constructor(spec = {}) {
    this.id = spec.id ?? `mgr_${Math.random().toString(36).slice(2, 9)}`;
    this.name = spec.name ?? "Unknown Manager";
    this.nationality = spec.nationality ?? "ENG";
    this.style = MANAGER_STYLES[spec.style] ? spec.style : "Balanced";
    this.formation = spec.formation ?? "4-3-3";
    this.rating = clamp(spec.rating ?? 60, 1, 99);
    this.age = spec.age ?? 48;
    /**
     * How much the manager likes each player, keyed by player id, 0..100.
     * This is the hidden number behind "the manager trusts you". Squad selection reads
     * it directly, so a player can be visibly better than his rival and still be benched.
     */
    this.trust = {};
    /** Season objectives set by the board; drives manager pressure. */
    this.expectation = spec.expectation ?? "mid-table";
    this.pressure = 0;
    this.trophies = 0;
    /** Coaching bias 0..1: how much this coach favours youth over experience. */
    this.youthBias = clamp(spec.youthBias ?? (this.style === "Youth" ? 0.8 : 0.5), 0, 1);
  }

  /** Tactical multipliers for this manager's preferred setup. */
  get tactics() {
    return MANAGER_STYLES[this.style] ?? MANAGER_STYLES.Balanced;
  }

  /** The shapes this coach will consider, best-fit first. */
  get preferredFormations() {
    return COACH_STYLE_FORMATIONS[this.style] ?? COACH_STYLE_FORMATIONS.Balanced;
  }

  /**
   * Pick the formation this coach will actually use, given the players available.
   * He walks his preferred shapes and scores each by how many of its slots his squad
   * can fill with natural specialists, then keeps the best. A defensive coach will
   * still play four at the back if he has no third centre-back, which is realistic.
   */
  chooseFormation(players, dayIndex = 0) {
    const squad = players.filter((p) => !!p.position);
    if (!squad.length) return this.formation;
    const fitFor = (name) => {
      const shape = FORMATIONS[name];
      if (!shape) return -Infinity;
      const sel = selectLineup(squad, name, dayIndex);
      let fit = 0;
      for (const { slot, player } of sel.xi) {
        const natural = groupOf(player.position) === groupOf(slot);
        fit += natural ? 2 : -1;
        if (player.position === slot) fit += 1;
      }
      // A small bias so the coach's first choice wins ties.
      return fit + Math.max(0, 6 - this.preferredFormations.indexOf(name)) * 0.25;
    };
    let best = this.formation;
    let bestFit = -Infinity;
    for (const name of this.preferredFormations) {
      const fit = fitFor(name);
      if (fit > bestFit) {
        bestFit = fit;
        best = name;
      }
    }
    return best;
  }

  trustOf(playerId, fallback = 50) {
    return this.trust?.[playerId] ?? fallback;
  }

  /** Move a player's trust toward a target, respecting the manager's patience. */
  adjustTrust(playerId, delta) {
    const cur = this.trustOf(playerId);
    this.trust ??= {};
    this.trust[playerId] = clamp(cur + delta, 0, 100);
  }
}

export class Club {
  constructor(spec = {}) {
    this.id = spec.id;
    this.name = spec.name;
    this.shortName = spec.shortName ?? spec.name?.slice(0, 3).toUpperCase();
    this.fictionalName = spec.fictionalName ?? spec.name;
    this.nation = spec.nation;
    const venue = stadiumIdentityForClub(spec.name ?? spec.id);
    this.city = spec.city || venue?.city || "";
    this.stadium = spec.stadium || venue?.stadium || "";
    this.capacity = spec.capacity || venue?.capacity || 20000;
    this.founded = spec.founded ?? null;
    /** Small match-performance edge for designated elite clubs; never a player rating. */
    this.booster = clamp(spec.booster ?? teamBoosterFor(this.name), 0, 10);

    /** Long-run reputation, 1..100. Moves slowly, over years. */
    this.prestige = spec.prestige ?? 50;
    /** Short-run form of the club as an organisation. Moves faster than prestige. */
    this.reputation = spec.reputation ?? this.prestige;

    /** Finances, in euros. */
    this.finances = createClubFinance(spec, this);
    this.budget = this.finances.transferBudget;
    this.wageBudget = this.finances.wageBudget;
    this.balance = this.finances.balance;

    /** Squad as an array of player ids. Player objects live in the World. */
    this.squad = spec.squad ? [...spec.squad] : [];
    this.registrationLimit =
      Number.isInteger(spec.registrationLimit) && spec.registrationLimit >= 25
        ? spec.registrationLimit
        : null;

    this.manager =
      spec.manager instanceof Manager
        ? spec.manager
        : new Manager(spec.manager ?? {});
    this.hierarchy = spec.hierarchy ? structuredClone(spec.hierarchy) : null;
    ensureClubHierarchy(this);
    this.investment = spec.investment ? structuredClone(spec.investment) : null;
    ensureClubInvestment(this);

    /** Formation string, e.g. '4-3-3'. Kept as data so lineups are computed, not hardcoded. */
    this.formation = spec.formation ?? this.manager.formation;
    this.customXI = spec.customXI ? [...spec.customXI] : null;

    /** Domestic league id, or null if the club is not in a league (e.g. cup-only). */
    this.leagueId = spec.leagueId ?? null;

    /** UEFA coefficient, used for European seeding from Phase 4. */
    this.coefficient = spec.coefficient ?? this.prestige * 2;

    /** Honours: [{ competitionId, season }]. */
    this.honours = spec.honours ? [...spec.honours] : [];
    this.seasonHistory = spec.seasonHistory ? [...spec.seasonHistory] : [];
    this.matchHistory = spec.matchHistory ? [...spec.matchHistory] : [];

    /** The club's own colour identity, used to draw a generated crest. */
    this.colors = spec.colors ?? ["#1f2937", "#f8fafc"];

    /** Set when the club is the user's employer, purely for UI emphasis. */
    this.isUserClub = false;
  }

  /** True if the club's real name is being used. Set by the loader from config. */
  get displayName() {
    return this._useRealNames === false ? this.fictionalName : this.name;
  }

  /**
   * Squad strength, split by area.
   *
   * Uses `effectiveRating` rather than raw overall so that tiredness and form actually
   * show up in results, and takes the best N per area so a club is judged on its
   * strongest available XI rather than the average of a bloated squad.
   */
  strength(players, dayIndex, { tactics = null } = {}) {
    const tSource = tactics ?? this.manager?.tactics;
    const attackMultiplier = Number(tSource?.attack);
    const defenceMultiplier = Number(tSource?.defence);
    const t = {
      attack: tSource?.attack != null && Number.isFinite(attackMultiplier) ? attackMultiplier : 1,
      defence: tSource?.defence != null && Number.isFinite(defenceMultiplier) ? defenceMultiplier : 1,
    };
    // The formation changes how a side plays: a back five defends better but attacks
    // less, a front three attacks more but leaves the defence lighter. These shape
    // multipliers are what make two equally-rated teams behave differently.
    const shape = FORMATIONS[this.formation]?.shape ?? { attack: 1, defence: 1, midfield: 1 };
    const squad = players.filter((p) => this.squad.includes(p.id));

    const byGroup = { GK: [], DEF: [], MID: [], ATT: [] };
    for (const p of squad) {
      if (p.injury || p.suspensionWeeks > 0) continue;
      byGroup[groupOf(p.position)].push(effectiveRating(p, p.position));
    }

    // How many defenders/midfielders/attackers the chosen shape actually fields, so a
    // 3-5-2 is judged on five midfielders and a 4-4-2 on two strikers.
    const slots = FORMATIONS[this.formation]?.slots ?? [];
    const count = (group) => slots.filter((slot) => groupOf(slot) === group).length || 1;
    const defCount = count("DEF");
    const midCount = count("MID");
    const attCount = count("ATT");

    const gk = topMean(byGroup.GK, 1);
    const def = topMean(byGroup.DEF, defCount);
    const mid = topMean(byGroup.MID, midCount);
    const att = topMean(byGroup.ATT, attCount);

    // Weighted so the spine of the team dominates: defence is defended by the back line
    // and the keeper, but a good midfield shields them, so midfield feeds both.
    const defence = (def * 0.5 + gk * 0.25 + mid * 0.25) * t.defence * shape.defence;
    const attack = (att * 0.55 + mid * 0.35 + def * 0.1) * t.attack * shape.attack;

    const ratings = calculateTeamRatings(this, players, dayIndex);
    const integratedAttack = attack * 0.6 + ratings.matchdayAttack * 0.4;
    const integratedDefence = defence * 0.6 + ratings.matchdayDefence * 0.4;
    return {
      gk,
      defence: round(integratedDefence, 2),
      attack: round(integratedAttack, 2),
      midfield: ratings.midfield,
      squadOverall: ratings.squadOverall,
      startingXIOverall: ratings.startingXIOverall,
      matchdayOverall: ratings.matchdayOverall,
      formation: this.formation,
      // A single composite "quality" number, used for prestige-weighted decisions.
      overall: round(
        integratedAttack * 0.4 +
          ratings.matchdayMidfield * 0.2 +
          integratedDefence * 0.4,
        2,
      ),
      squadSize: squad.length,
      avgAge: squad.length
        ? round(
            mean(squad, (p) => age(p, dayIndex)),
            1,
          )
        : 0,
    };
  }

  /** The club's current best XI, as player ids, positioned by formation. */
  bestEleven(players, dayIndex) {
    const squad = players.filter((p) => this.squad.includes(p.id) && !p.injury && !(p.suspensionWeeks > 0));
    return selectLineup(squad, this.formation, dayIndex).xi.map(
      (s) => s.player.id,
    );
  }

  /** Total wage bill per week. */
  wageBill(players) {
    return players
      .filter((p) => this.squad.includes(p.id))
      .reduce((acc, player) => {
        player.contract ??= {};
        const fallback =
          900 +
          Math.max(0, Number(player.overall ?? 50) - 50) * 250 +
          Math.max(0, Number(player.age ?? 24) - 30) * 75;
        const wage = Math.max(0, Number(player.contract.wage ?? fallback));
        player.contract.wage = wage;
        return acc + wage;
      }, 0);
  }

  financials() {
    return ensureClubFinance(this);
  }

  /** Squad value, used by AI clubs to judge their own standing. */
  squadValue(players, dayIndex) {
    return players
      .filter((p) => this.squad.includes(p.id))
      .reduce((acc, p) => acc + (p.value ?? 0), 0);
  }

  /** Add a player to the squad. Ignores duplicates. */
  addPlayer(playerId) {
    if (!this.squad.includes(playerId)) this.squad.push(playerId);
  }

  removePlayer(playerId) {
    const i = this.squad.indexOf(playerId);
    if (i >= 0) this.squad.splice(i, 1);
  }

  has(playerId) {
    return this.squad.includes(playerId);
  }

  squadGroups(players, dayIndex = 0) {
    const registered = players.filter((player) => this.squad.includes(player.id));
    const selection = selectLineup(registered, this.formation, dayIndex);
    const starters = selection.xi.map(({ player, slot }) => ({
      player,
      slot,
      status: "starter",
    }));
    const substitutes = selection.subs.map((player) => ({
      player,
      slot: null,
      status: "substitute",
    }));
    const reserves = selection.unused.map((player) => ({
      player,
      slot: null,
      status: "reserve",
    }));
    return { starters, substitutes, reserves };
  }
}

/**
 * Keep the registered list within football-registration limits. Players removed from
 * registration remain attached to their club as reserves until the next window.
 */
export function ensureSquadRegistration(
  club,
  players,
  options = {},
) {
  const min = options.min ?? MIN_REGISTERED_SQUAD_SIZE;
  const max =
    options.max ?? club.registrationLimit ?? MAX_REGISTERED_SQUAD_SIZE;
  const known = new Map(players.map((player) => [player.id, player]));
  club.squad = [...new Set((club.squad ?? []).filter((id) => known.has(id)))];
  if (club.squad.length > max) {
    const ranked = club.squad
      .map((id) => known.get(id))
      .sort((left, right) => {
        const leftScore = effectiveRating(left, left.position);
        const rightScore = effectiveRating(right, right.position);
        return rightScore - leftScore;
      });
    const registered = ranked.slice(0, max);
    const registeredIds = new Set(registered.map((player) => player.id));
    for (const player of ranked) {
      if (!registeredIds.has(player.id) && player.squadStatus !== "Unregistered")
        player.squadStatus = "Reserve";
    }
    club.squad = registered.map((player) => player.id);
  }
  for (const id of club.squad) {
    const player = known.get(id);
    if (player && player.squadStatus === "Unregistered")
      player.squadStatus = "Rotation";
  }
  return {
    size: club.squad.length,
    valid: club.squad.length >= min && club.squad.length <= max,
    registered: [...club.squad],
  };
}

/**
 * Formation definitions: how many players in each area, and where they line up.
 * `slots` is position-keyed so the selector knows what it is looking for.
 */
export const FORMATIONS = {
  "4-3-3": {
    // Modern holding-midfield 4-3-3: one CDM screening, two CMs ahead, a front three.
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"],
    shape: { attack: 1.08, defence: 1.0, midfield: 1.04 },
  },
  "4-2-3-1": {
    // Double pivot + a CAM behind the striker.
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "CAM", "LW", "RW", "ST"],
    shape: { attack: 1.02, defence: 1.05, midfield: 1.06 },
  },
  "4-4-2": {
    slots: ["GK", "LB", "CB", "CB", "RB", "LW", "CM", "CM", "RW", "ST", "ST"],
    shape: { attack: 1.06, defence: 1.0, midfield: 0.96 },
  },
  "3-5-2": {
    slots: ["GK", "CB", "CB", "CB", "LB", "CDM", "CM", "CM", "RB", "ST", "ST"],
    shape: { attack: 1.04, defence: 0.98, midfield: 1.1 },
  },
  "4-1-4-1": {
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "LW", "CM", "CM", "RW", "ST"],
    shape: { attack: 0.98, defence: 1.06, midfield: 1.04 },
  },
  "5-3-2": {
    slots: ["GK", "LB", "CB", "CB", "CB", "RB", "CDM", "CM", "CM", "ST", "ST"],
    shape: { attack: 0.96, defence: 1.12, midfield: 0.98 },
  },
  "3-4-3": {
    slots: ["GK", "CB", "CB", "CB", "LB", "CM", "CM", "RB", "LW", "ST", "RW"],
    shape: { attack: 1.1, defence: 0.96, midfield: 1.0 },
  },
  "4-3-2-1": {
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CAM", "CAM", "ST"],
    shape: { attack: 1.05, defence: 1.0, midfield: 1.05 },
  },
  "4-2-2-2": {
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "CAM", "CAM", "ST", "ST"],
    shape: { attack: 1.09, defence: 0.99, midfield: 1.0 },
  },
  "4-1-2-1-2": {
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CAM", "ST", "ST"],
    shape: { attack: 1.06, defence: 1.01, midfield: 1.02 },
  },
  "4-5-1": {
    slots: ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "CM", "CAM", "ST"],
    shape: { attack: 0.98, defence: 1.05, midfield: 1.1 },
  },
  "5-4-1": {
    slots: ["GK", "LB", "CB", "CB", "CB", "RB", "CDM", "CM", "CM", "CM", "ST"],
    shape: { attack: 0.92, defence: 1.14, midfield: 1.02 },
  },
  "3-4-2-1": {
    slots: ["GK", "CB", "CB", "CB", "LB", "CM", "CM", "RB", "CAM", "CAM", "ST"],
    shape: { attack: 1.08, defence: 0.98, midfield: 1.04 },
  },
  "4-4-1-1": {
    slots: ["GK", "LB", "CB", "CB", "RB", "LW", "CM", "CM", "RW", "CAM", "ST"],
    shape: { attack: 1.02, defence: 1.02, midfield: 1.02 },
  },
};

/** The formation names a coach may choose, in a stable order. */
export const FORMATION_NAMES = Object.keys(FORMATIONS);

/**
 * The shapes well-known clubs are famous for, keyed by a normalised club name. When a
 * club appears here, its coach uses this formation regardless of the generic style
 * logic, so the big sides line up the way they do in real life (Manchester City's
 * 4-3-3, Real Madrid's 4-3-3, Inter's back three, and so on).
 */
export const REAL_FORMATIONS = {
  // England
  "manchester city": "4-3-3",
  "arsenal": "4-3-3",
  "liverpool": "4-3-3",
  "manchester united": "4-2-3-1",
  "chelsea": "4-2-3-1",
  "tottenham hotspur": "4-2-3-1",
  "tottenham": "4-2-3-1",
  "newcastle united": "4-3-3",
  "aston villa": "4-2-3-1",
  "brighton & hove albion": "4-2-3-1",
  "brighton": "4-2-3-1",
  "west ham united": "4-2-3-1",
  "everton": "4-4-2",
  "crystal palace": "3-4-3",
  "wolverhampton wanderers": "4-2-3-1",
  "nottingham forest": "4-2-3-1",
  "leicester city": "4-2-3-1",
  "southampton": "4-2-3-1",
  "bournemouth": "4-2-3-1",
  "brentford": "4-3-3",
  "fulham": "4-2-3-1",
  "ipswich town": "4-2-3-1",
  // Spain
  "real madrid": "4-4-2",
  "fc barcelona": "4-3-3",
  "barcelona": "4-3-3",
  "atletico madrid": "3-5-2",
  "atlético madrid": "3-5-2",
  "athletic club": "4-2-3-1",
  "real sociedad": "4-3-3",
  "sevilla": "4-2-3-1",
  "villarreal": "4-4-2",
  "real betis": "4-2-3-1",
  "valencia": "4-4-2",
  "girona": "4-3-3",
  // Germany
  "bayern munich": "4-2-3-1",
  "fc bayern munich": "4-2-3-1",
  "borussia dortmund": "4-2-3-1",
  "bayer leverkusen": "3-4-3",
  "rb leipzig": "4-2-2-2",
  "eintracht frankfurt": "3-4-3",
  "vfb stuttgart": "4-2-3-1",
  "borussia monchengladbach": "4-2-3-1",
  "vfl wolfsburg": "4-2-3-1",
  "sc freiburg": "3-4-3",
  // Italy
  "inter": "3-5-2",
  "inter milan": "3-5-2",
  "ac milan": "4-2-3-1",
  "juventus": "3-5-2",
  "napoli": "4-3-3",
  "as roma": "4-3-3",
  "roma": "4-3-3",
  "lazio": "4-3-3",
  "atalanta": "3-4-3",
  "fiorentina": "4-2-3-1",
  "bologna": "4-2-3-1",
  "torino": "3-5-2",
  // France
  "paris saint-germain": "4-3-3",
  "psg": "4-3-3",
  "marseille": "4-3-3",
  "olympique marseille": "4-3-3",
  "monaco": "4-4-2",
  "as monaco": "4-4-2",
  "lyon": "4-2-3-1",
  "olympique lyonnais": "4-2-3-1",
  "lille": "4-2-3-1",
  "losc lille": "4-2-3-1",
  "nice": "4-3-3",
  "rennes": "4-4-2",
  "lens": "3-4-3",
};

/**
 * The real-life shape for a club, looked up by a normalised name, or null if we do not
 * have a signature formation for it.
 */
export function realFormationFor(clubName, clubId = "") {
  const normalise = (value) => String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const keys = [normalise(clubName), normalise(String(clubId).replace(/-/g, " "))];
  for (const key of keys) {
    if (key && REAL_FORMATIONS[key]) return REAL_FORMATIONS[key];
  }
  return null;
}

/**
 * Pick a starting XI and bench for a formation.
 *
 * Greedy but *sensible*: we walk the formation's slots from most specialist to least
 * (goalkeeper first, then the back line, then midfield, then attack). Coaches consider
 * every outfield player for every outfield slot, then apply a positional penalty. This
 * lets a much better player beat a weaker natural specialist while still preserving
 * sensible role assignments whenever the ratings are close.
 */
export function selectLineup(
  squad,
  formation = "4-3-3",
  dayIndex = 0,
  opts = {},
) {
  const {
    benchSize = 9,
    forcedXI = [],
    excluded = [],
    benchOnly = [],
    prioritizeRating = true,
    customXI = [],
  } = opts;
  const shape = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
  const available = squad.filter((p) => !p.injury && !(p.suspensionWeeks > 0) && !excluded.includes(p.id));
  const benchOnlyIds = new Set(benchOnly);
  const xiAvailable = available.filter((player) => !benchOnlyIds.has(player.id));
  const mandatory = new Set(forcedXI);

  const used = new Set();
  const xi = [];

  // Slots ordered GK -> defence -> midfield -> attack. Sorting by how rare the
  // position is stops the selector from spending a CB on a full-back slot.
  const order = shape.slots
    .map((slot, slotIndex) => ({ slot, slotIndex }))
    .sort((a, b) => slotPriority(a.slot) - slotPriority(b.slot));

  // A forced starter always takes his NATURAL slot, never an alt-position slot, so a
  // forced LB is never consumed by an earlier CB slot just because he lists CB as an
  // alternative. The match is by exact slot label so a DM is only forced into a slot
  // the formation actually names DM; otherwise normal selection applies.
  const preassigned = new Map(); // player id -> slot index
  const preSlotted = new Set(); // slot index already reserved
  for (const assignment of customXI) {
    const legacySlotIndex =
      Number.isInteger(assignment?.slotIndex)
        ? assignment.slotIndex
        : shape.slots.findIndex(
            (slot, index) =>
              slot === assignment?.slot && !preSlotted.has(index),
          );
    const slotIndex = legacySlotIndex;
    const slot = shape.slots[slotIndex];
    if (
      !assignment ||
      !slot ||
      preSlotted.has(slotIndex) ||
      preassigned.has(assignment.playerId)
    )
      continue;
    const player = xiAvailable.find((p) => p.id === assignment.playerId);
    if (
      !player ||
      (normalizePosition(player.position) === "GK") !==
        (normalizePosition(slot) === "GK") ||
      groupOf(player.position) !== groupOf(slot)
    )
      continue;
    preassigned.set(player.id, slotIndex);
    preSlotted.add(slotIndex);
  }
  for (const id of mandatory) {
    if (preassigned.has(id)) continue;
    const player = xiAvailable.find((p) => p.id === id);
    if (!player) continue;
    const natural = normalizePosition(player.position);
    let slotIndex = shape.slots.findIndex(
      (slot, index) => slot === natural && !preSlotted.has(index),
    );
    if (slotIndex < 0) {
      slotIndex = shape.slots.findIndex((slot, index) => {
        if (preSlotted.has(index)) return false;
        const target = normalizePosition(slot);
        if ((natural === "GK") !== (target === "GK")) return false;
        if (groupOf(natural) !== groupOf(target)) return false;
        const alternatives = [
          natural,
          ...(player.altPositions ?? []).map(normalizePosition),
        ];
        return (
          alternatives.includes(target) ||
          groupOf(natural) === groupOf(target)
        );
      });
    }
    if (slotIndex >= 0) {
      preassigned.set(id, slotIndex);
      preSlotted.add(slotIndex);
    }
  }

  const openSlots = new Set(
    order
      .filter(({ slotIndex }) => !preSlotted.has(slotIndex))
      .map(({ slotIndex }) => slotIndex),
  );
  for (const [playerId, slotIndex] of preassigned) {
    const player = available.find((candidate) => candidate.id === playerId);
    if (!player) continue;
    used.add(player.id);
    xi.push({ slot: shape.slots[slotIndex], slotIndex, player });
  }

  // Rank players before assigning slots so the strongest player keeps the best
  // natural role and the next strongest can use a compatible role elsewhere.
  const rankedPlayers = xiAvailable
    .filter((player) => !used.has(player.id))
    .sort((a, b) => effectiveRating(b, b.position, { dayIndex }) - effectiveRating(a, a.position, { dayIndex }));
  for (const player of rankedPlayers) {
    if (mandatory.has(player.id)) continue;
    let bestSlotIndex = -1;
    let bestScore = -Infinity;
    for (const slotIndex of openSlots) {
      const slot = shape.slots[slotIndex];
      const natural = normalizePosition(player.position);
      const target = normalizePosition(slot);
      if ((natural === "GK") !== (target === "GK")) continue;
      if (groupOf(natural) !== groupOf(target)) continue;
      const allowed = [natural, ...(player.altPositions ?? []).map(normalizePosition)];
      const positionalAlternative = allowed.includes(target);
      const sameLineFallback =
        !positionalAlternative && groupOf(natural) === groupOf(target);
      if (!positionalAlternative && !sameLineFallback) continue;
      let score =
        calculateOverall(player) * (prioritizeRating ? 1.5 : 0.8) +
        effectiveRating(player, slot, { dayIndex }) * 0.25;
      if (natural !== target) {
        score -= positionalAlternative ? 4 : sameLineFallback ? 10 : 24;
      }
      if (!prioritizeRating) score += (player._managerTrust ?? 50) * 0.06;
      if (score > bestScore) {
        bestScore = score;
        bestSlotIndex = slotIndex;
      }
    }
    if (bestSlotIndex >= 0) {
      openSlots.delete(bestSlotIndex);
      used.add(player.id);
      xi.push({ slot: shape.slots[bestSlotIndex], slotIndex: bestSlotIndex, player });
    }
  }
  xi.sort((a, b) => a.slotIndex - b.slotIndex);

  // Bench: the best remaining players, covering each area so the manager has options.
  const rest = available.filter((player) => !used.has(player.id));
  const bench = [];
  for (const g of ["GK", "DEF", "MID", "ATT"]) {
    const cands = rest
      .filter(
        (p) =>
          groupOf(p.position) === g &&
          !benchOnlyIds.has(p.id) &&
          !bench.includes(p),
      )
      .sort(
        (a, b) =>
          effectiveRating(b, b.position, { dayIndex }) -
          effectiveRating(a, a.position, { dayIndex }),
      );
    for (const c of cands.slice(0, g === "GK" ? 1 : 3)) bench.push(c);
  }
  bench.sort((a, b) => calculateOverall(b) - calculateOverall(a));

  const reservedBench = available.filter((player) =>
    benchOnlyIds.has(player.id),
  );
  const subs = [...reservedBench, ...bench].slice(0, benchSize);
  const unused = squad.filter(
    (p) => !used.has(p.id) && !subs.includes(p) && !p.injury && !(p.suspensionWeeks > 0),
  );

  return { xi, subs, unused, formation };
}

/** Lower number = fill this slot first. Keepers are unique, so they go first. */
function slotPriority(slot) {
  switch (slot) {
    case "GK":
      return 0;
    case "CB":
      return 1;
    case "LB":
    case "RB":
      return 2;
    case "DM":
    case "CDM":
      return 3;
    case "CM":
      return 4;
    case "AM":
    case "CAM":
      return 5;
    case "LW":
    case "RW":
      return 6;
    case "ST":
      return 7;
    default:
      return 8;
  }
}
