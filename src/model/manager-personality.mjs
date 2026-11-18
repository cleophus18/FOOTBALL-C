/**
 * Manager identity: names, personalities and the decisions those personalities drive.
 *
 * This module deliberately builds on the systems that already exist rather than
 * replacing them:
 *
 *   - `Manager` in `model/club.mjs` already owns `style`, `personality`,
 *     `tacticalPhilosophy`, `transferPhilosophy`, `riskTolerance` and friends.
 *   - `core/coaching.mjs` already owns coaching attributes, playstyles and formation
 *     suitability.
 *
 * What was missing is that those labels had no effect and generated managers were named
 * after their clubs ("Borussia Dortmund Head Coach"). So this file adds two things:
 *
 *   1. A stable, nationality-aware name generator for every club coach, with a persistent
 *      remember-list so the same person is never invented twice.
 *   2. A shared personality profile (tastes, recruitment rules, squad rotation) that is
 *      *derived* from the existing style/personality fields and consumed by the AI
 *      recruitment, contract and selection code.
 *
 * Everything here is pure and deterministic: the same manager object always produces the
 * same profile, so nothing has to be recomputed or re-rolled on render or on save load.
 */

import { clamp } from "../core/util.mjs";
import { ageOn } from "../core/calendar.mjs";
import { normalizePosition } from "../core/constants.mjs";
import { calculateOverall } from "./player.mjs";
import { CATALOGUED_NATIONS, NAME_POOLS } from "./names.mjs";

/** The personality vocabulary the rest of the game already uses. */
export const MANAGER_TRAITS = [
  "Ambitious",
  "Disciplined",
  "Tactical Genius",
  "Pragmatic",
  "Demanding",
  "Patient",
  "Youth Developer",
  "Risk-Taker",
  "Defensive Strategist",
  "Attacking Specialist",
  "Possession Specialist",
  "Experienced-Player Specialist",
  "Counterattacking Specialist",
  "High-Press Specialist",
];

/**
 * Which traits a philosophy tends to produce. The first entry is the defining trait of
 * the style; the others are the supporting ones. These names match the traits the AI
 * contract engine already looks for, so a coach labelled "Youth Developer" now actually
 * behaves like one.
 */
export const STYLE_TRAITS = {
  Possession: ["Possession Specialist", "Patient", "Tactical Genius"],
  Counterattacking: ["Counterattacking Specialist", "Pragmatic", "Risk-Taker"],
  "High Press": ["High-Press Specialist", "Demanding", "Disciplined"],
  Defensive: ["Defensive Strategist", "Disciplined", "Pragmatic"],
  Youth: ["Youth Developer", "Patient", "Ambitious"],
  Attacking: ["Attacking Specialist", "Risk-Taker", "Demanding"],
  Pragmatic: ["Pragmatic", "Disciplined", "Experienced-Player Specialist"],
  Balanced: ["Tactical Genius", "Patient", "Ambitious"],
};

/** Traits that may be added on top of the defining trio, with what they mean. */
export const SECONDARY_TRAITS = [
  "Ambitious",
  "Disciplined",
  "Pragmatic",
  "Patient",
  "Demanding",
  "Youth Developer",
  "Risk-Taker",
  "Experienced-Player Specialist",
  "Tactical Genius",
];

/**
 * What each personality wants from a signing. `positions` is a list of groups or exact
 * positions the coach leans towards; `ageBand` is the age window he trusts most;
 * `potentialWeight` / `ratingWeight` decide whether he buys upside or ready-made
 * quality; `wageTolerance` limits how far over the club's wage norm he will go.
 */
export const TRAIT_RECRUITMENT = {
  Ambitious: { ratingWeight: 0.25, potentialWeight: 0.15, qualityBar: 2 },
  Disciplined: { wageTolerance: 0.85, qualityBar: 1 },
  "Tactical Genius": { ratingWeight: 0.2, potentialWeight: 0.1, qualityBar: 1 },
  Pragmatic: { ratingWeight: 0.35, potentialWeight: -0.15, qualityBar: 3 },
  Demanding: { qualityBar: 3, wageTolerance: 1.1 },
  Patient: { potentialWeight: 0.2, qualityBar: -1 },
  "Youth Developer": {
    potentialWeight: 0.4,
    ageBand: [16, 23],
    qualityBar: -2,
  },
  "Risk-Taker": { potentialWeight: 0.25, wageTolerance: 1.15, qualityBar: -1 },
  "Defensive Strategist": {
    positions: ["GK", "CB", "CDM", "LB", "RB"],
    ratingWeight: 0.15,
  },
  "Attacking Specialist": {
    positions: ["ST", "LW", "RW", "CAM", "CM"],
    ratingWeight: 0.15,
  },
  "Possession Specialist": { positions: ["CM", "CAM", "CDM", "AM"] },
  "Experienced-Player Specialist": {
    ageBand: [26, 34],
    ratingWeight: 0.3,
    potentialWeight: -0.2,
  },
  "Counterattacking Specialist": { positions: ["ST", "RW", "LW", "CB"] },
  "High-Press Specialist": { positions: ["ST", "CM", "CDM", "RW", "LW"] },
};

/**
 * Positions each tactical style prioritises, most important first. Used when the club
 * has no urgent hole to fill and the coach can sign for the shape he believes in.
 */
export const STYLE_POSITION_PRIORITIES = {
  Possession: ["CM", "CAM", "DM", "CDM", "LB", "RB", "ST"],
  Counterattacking: ["ST", "RW", "LW", "CB", "CDM", "GK"],
  "High Press": ["ST", "CM", "CDM", "RW", "LW", "CB"],
  Defensive: ["CB", "GK", "CDM", "LB", "RB", "CM"],
  Youth: ["CM", "CAM", "ST", "CB", "GK"],
  Attacking: ["ST", "LW", "RW", "CAM", "CM"],
  Pragmatic: ["CB", "GK", "CM", "ST", "RB", "LB"],
  Balanced: ["CM", "CB", "ST", "GK", "RB", "LB"],
};

/** How much each style wants a result now versus a player for two years' time. */
const STYLE_URGENCY = {
  Possession: 0.55,
  Counterattacking: 0.65,
  "High Press": 0.6,
  Defensive: 0.75,
  Youth: 0.25,
  Attacking: 0.6,
  Pragmatic: 0.85,
  Balanced: 0.55,
};

/* ------------------------------------------------------------------------- *
 * Names
 * ------------------------------------------------------------------------- */

/**
 * Nation-aware manager name pools.
 *
 * Managers skew older than players, so these are separate pools rather than the player
 * pools: "Graham", "Bernd" and "Gennaro" belong in a dugout, not in a youth intake.
 * Each pool has 24 first names and 24 surnames, giving 576 combinations per nation.
 */
export const MANAGER_NAME_POOLS = {
  ENG: {
    first: [
      "Graham",
      "Steve",
      "Paul",
      "Neil",
      "Gary",
      "Eddie",
      "Michael",
      "Sean",
      "Russell",
      "Chris",
      "Frank",
      "Alan",
      "David",
      "Mark",
      "Ian",
      "Owen",
      "Nathan",
      "Lee",
      "John",
      "Tom",
      "Rob",
      "Dan",
      "Keith",
      "Sam",
    ],
    last: [
      "Hartley",
      "Brooks",
      "Jennings",
      "Parker",
      "Oakes",
      "Whelan",
      "Ashcroft",
      "Barlow",
      "Chadwick",
      "Dawson",
      "Ellison",
      "Fielding",
      "Hargreaves",
      "Ingham",
      "Keane",
      "Lindley",
      "Marsden",
      "Naylor",
      "Oxley",
      "Pritchard",
      "Radcliffe",
      "Sutcliffe",
      "Tinsley",
      "Warburton",
    ],
  },
  ESP: {
    first: [
      "Iñaki",
      "Unai",
      "Pablo",
      "Santiago",
      "Marcelino",
      "Javier",
      "Luis",
      "Rubén",
      "Alberto",
      "Sergio",
      "Carlos",
      "Míchel",
      "Andoni",
      "Joaquín",
      "Manuel",
      "Diego",
      "Fran",
      "Xavi",
      "Jagoba",
      "Imanol",
      "Abelardo",
      "Quique",
      "Julio",
      "Vicente",
    ],
    last: [
      "Aranalde",
      "Belmonte",
      "Cordero",
      "Delgado",
      "Echeverría",
      "Fuentes",
      "Garrido",
      "Herrera",
      "Iriarte",
      "Jiménez",
      "Laborda",
      "Mendizábal",
      "Noceda",
      "Olabarria",
      "Pérez",
      "Quintana",
      "Rincón",
      "Sarabia",
      "Terán",
      "Urrutia",
      "Valverde",
      "Zabala",
      "Aguado",
      "Berrocal",
    ],
  },
  GER: {
    first: [
      "Thomas",
      "Bernd",
      "Jürgen",
      "Stefan",
      "Friedhelm",
      "Ralf",
      "Oliver",
      "Frank",
      "Uwe",
      "Matthias",
      "Niko",
      "Julian",
      "Christian",
      "Sandro",
      "Bo",
      "Marco",
      "Ralph",
      "Daniel",
      "André",
      "Holger",
      "Gerhard",
      "Klaus",
      "Peter",
      "Sebastian",
    ],
    last: [
      "Brandt",
      "Kessler",
      "Wendt",
      "Hoffmeister",
      "Grimm",
      "Böhmer",
      "Steinbach",
      "Kirchner",
      "Lauer",
      "Renner",
      "Neuhaus",
      "Zwick",
      "Maier",
      "Schäfer",
      "Dorn",
      "Wagner",
      "Busch",
      "Krämer",
      "Heller",
      "Engel",
      "Vogel",
      "Ritter",
      "Prinz",
      "Fuchs",
    ],
  },
  ITA: {
    first: [
      "Gennaro",
      "Massimiliano",
      "Stefano",
      "Claudio",
      "Fabio",
      "Vincenzo",
      "Eusebio",
      "Thiago",
      "Simone",
      "Alessandro",
      "Roberto",
      "Luca",
      "Marco",
      "Andrea",
      "Domenico",
      "Davide",
      "Ivan",
      "Gianpiero",
      "Serse",
      "Alberto",
      "Giovanni",
      "Paolo",
      "Francesco",
      "Filippo",
    ],
    last: [
      "Bellotto",
      "Caravello",
      "Danesi",
      "Ferraro",
      "Gambardella",
      "Ianni",
      "Lodovici",
      "Merolla",
      "Nicolini",
      "Orsini",
      "Pellizzari",
      "Quaranta",
      "Ranza",
      "Salvi",
      "Tacconi",
      "Ussia",
      "Villa",
      "Zaccardo",
      "Bottaro",
      "Ceravolo",
      "Di Matteo",
      "Esposito",
      "Fiorentino",
      "Gattuso",
    ],
  },
  FRA: {
    first: [
      "Didier",
      "Christophe",
      "Bruno",
      "Franck",
      "Rudi",
      "Luis",
      "Jean-Louis",
      "Philippe",
      "Thierry",
      "Hervé",
      "Patrick",
      "Olivier",
      "Régis",
      "Michel",
      "Julien",
      "Willy",
      "Claude",
      "Lionel",
      "Bernard",
      "Vincent",
      "Éric",
      "Stéphane",
      "Antoine",
      "Nicolas",
    ],
    last: [
      "Duverne",
      "Lemoine",
      "Bertrand",
      "Charbonnier",
      "Delmas",
      "Fournier",
      "Girardin",
      "Husson",
      "Joubert",
      "Lacroix",
      "Moreau",
      "Noguera",
      "Perrin",
      "Roussel",
      "Sauvage",
      "Thibault",
      "Vasseur",
      "Wallemme",
      "Bastien",
      "Cordier",
      "Douchez",
      "Estève",
      "Fontaine",
      "Gazier",
    ],
  },
  POR: {
    first: [
      "Sérgio",
      "Rui",
      "Jorge",
      "Luís",
      "Paulo",
      "Vítor",
      "Carlos",
      "Bruno",
      "Abel",
      "Pedro",
      "Nuno",
      "Ricardo",
      "José",
      "Manuel",
      "Álvaro",
      "Ivo",
      "Filipe",
      "Rogério",
      "Artur",
      "Tiago",
      "André",
      "Hélder",
      "Fábio",
      "Miguel",
    ],
    last: [
      "Conceição",
      "Vieira",
      "Almeida",
      "Castro",
      "Fonseca",
      "Moutinho",
      "Pimenta",
      "Quaresma",
      "Ramos",
      "Sequeira",
      "Teixeira",
      "Vasconcelos",
      "Bastos",
      "Carvalhal",
      "Dias",
      "Esteves",
      "Freitas",
      "Guedes",
      "Leitão",
      "Machado",
      "Neves",
      "Pereira",
      "Simões",
      "Tavares",
    ],
  },
  NED: {
    first: [
      "Ronald",
      "Frank",
      "Arne",
      "Peter",
      "Erik",
      "Dick",
      "Guus",
      "Bert",
      "Johnny",
      "Ruud",
      "Pascal",
      "Mark",
      "Joseph",
      "Maurice",
      "Erwin",
      "Dennis",
      "Kees",
      "Wim",
      "Henk",
      "Fred",
      "Ron",
      "Jaap",
      "Martin",
      "Hans",
    ],
    last: [
      "Bergkamp",
      "Cocu",
      "Hendriks",
      "Jansen",
      "Kluivert",
      "Lodewijks",
      "Meijer",
      "Nieuwenhuyzen",
      "Ooijer",
      "Postma",
      "Reiziger",
      "Snoei",
      "Timmer",
      "van Bronckhorst",
      "Wouters",
      "Zenden",
      "Bakker",
      "de Haan",
      "Eikelboom",
      "Fraser",
      "Groenendijk",
      "Hoekstra",
      "Jonker",
      "Kuijpers",
    ],
  },
  BEL: {
    first: [
      "Marc",
      "Herman",
      "Michel",
      "Hein",
      "Rudi",
      "Yves",
      "Gert",
      "Wim",
      "Luc",
      "Dirk",
      "Bart",
      "Nicky",
      "Philippe",
      "Alex",
      "Erwin",
      "Karel",
      "Stijn",
      "Jelle",
      "Pieter",
      "Tom",
      "Geert",
      "Franky",
      "Danny",
      "Walter",
    ],
    last: [
      "Callebaut",
      "De Wilde",
      "Everaert",
      "Francken",
      "Goossens",
      "Hermans",
      "Jacobs",
      "Lambrechts",
      "Maes",
      "Nauwelaerts",
      "Oyen",
      "Peeters",
      "Raeymaekers",
      "Segers",
      "Vandeputte",
      "Wauters",
      "Boeckx",
      "Claes",
      "Degryse",
      "Engelen",
      "Fonteyn",
      "Goor",
      "Heynen",
      "Isenborghs",
    ],
  },
  BRA: {
    first: [
      "Abel",
      "Dunga",
      "Tite",
      "Fernando",
      "Rodrigo",
      "Eduardo",
      "Marcelo",
      "Rogério",
      "Zé",
      "Fábio",
      "Léo",
      "Vinícius",
      "Thiago",
      "Paulo",
      "Rafael",
      "Jorge",
      "Antônio",
      "Renato",
      "Dorival",
      "André",
      "Gustavo",
      "Sérgio",
      "Márcio",
      "Luiz",
    ],
    last: [
      "Ferreira",
      "Barroso",
      "Cardoso",
      "Duarte",
      "Estevão",
      "Figueiredo",
      "Gonçalves",
      "Hollanda",
      "Inácio",
      "Junqueira",
      "Lourenço",
      "Mancini",
      "Nogueira",
      "Oliveira",
      "Prandelli",
      "Queiroz",
      "Ramalho",
      "Salgado",
      "Teixeira",
      "Ulhoa",
      "Velloso",
      "Wanderley",
      "Xavier",
      "Zanotta",
    ],
  },
  ARG: {
    first: [
      "Mauricio",
      "Jorge",
      "Marcelo",
      "Néstor",
      "Gustavo",
      "Diego",
      "Lionel",
      "Ricardo",
      "Eduardo",
      "Matías",
      "Alejandro",
      "Fernando",
      "Javier",
      "Claudio",
      "Esteban",
      "Ángel",
      "Hugo",
      "Ramón",
      "Rubén",
      "Víctor",
      "Ariel",
      "Emiliano",
      "Juan",
      "Pablo",
    ],
    last: [
      "Bermúdez",
      "Cagna",
      "Delfino",
      "Escudero",
      "Figueroa",
      "Gallardo",
      "Hernán",
      "Insúa",
      "Juárez",
      "Lavallén",
      "Méndez",
      "Navarro",
      "Ortiz",
      "Pizzi",
      "Quiroga",
      "Riquelme",
      "Scaloni",
      "Toledo",
      "Ubeda",
      "Vázquez",
      "Ware",
      "Yorio",
      "Zeballos",
      "Almirón",
    ],
  },
  USA: {
    first: [
      "Gregg",
      "Bruce",
      "Bob",
      "Peter",
      "Jason",
      "Mike",
      "Chris",
      "Dave",
      "Kevin",
      "Steve",
      "Matt",
      "Rick",
      "Jim",
      "Brian",
      "Tim",
      "Eric",
      "Scott",
      "Tom",
      "Mark",
      "Rob",
      "Jeff",
      "Josh",
      "Todd",
      "Kyle",
    ],
    last: [
      "Berhalter",
      "Arena",
      "Bradley",
      "Nowak",
      "Kreis",
      "Schmetzer",
      "Curtin",
      "Varas",
      "Mastroeni",
      "Sarachan",
      "Fraser",
      "Noonan",
      "Savarese",
      "Razov",
      "Vermes",
      "Robin",
      "Pareja",
      "Curtis",
      "Hernández",
      "Gonzalez",
      "O'Keefe",
      "Whitworth",
      "Leeper",
      "Dooley",
    ],
  },
  RSA: {
    first: [
      "Pitso",
      "Stuart",
      "Gavin",
      "Benni",
      "Rhulani",
      "Eric",
      "Josef",
      "Steve",
      "Manqoba",
      "Sead",
      "Cavin",
      "Rulani",
      "Arthur",
      "Shaun",
      "Roger",
      "Kaitano",
      "Lehlohonolo",
      "Musa",
      "Dan",
      "Thabo",
      "Vusi",
      "Brandon",
      "Grant",
      "Siyabonga",
    ],
    last: [
      "Mosimane",
      "Baxter",
      "Hunt",
      "McCarthy",
      "Mokoena",
      "Tinkler",
      "Zinnbauer",
      "Komphela",
      "Ncikazi",
      "Rameroupi",
      "Johnson",
      "Mabena",
      "Zwane",
      "Barker",
      "Pape",
      "Chirwa",
      "Sebola",
      "Nyathi",
      "Molefe",
      "Duiker",
      "Flemmer",
      "Roos",
      "Hlophe",
      "Nkosi",
    ],
  },
  NGA: {
    first: [
      "Sunday",
      "Finidi",
      "Augustine",
      "Samson",
      "José",
      "Gernot",
      "Austin",
      "Stephen",
      "Daniel",
      "Ndubuisi",
      "Kennedy",
      "Emmanuel",
      "Peter",
      "Joseph",
      "Amaju",
      "Benedict",
      "Rashidi",
      "Gbenga",
      "Tunde",
      "Bright",
      "Ifeanyi",
      "Chidi",
      "Kelechi",
      "Musa",
    ],
    last: [
      "Oliseh",
      "Eguavoen",
      "Okechukwu",
      "Siasia",
      "Amodu",
      "Rohr",
      "Egbo",
      "Keshi",
      "Amunike",
      "Okon",
      "Bobb",
      "Abiodun",
      "Ikhana",
      "Ogbeide",
      "Balogun",
      "Osho",
      "Yekini",
      "Adeyemi",
      "Chukwu",
      "Nwosu",
      "Okafor",
      "Uche",
      "Ogunbiyi",
      "Salami",
    ],
  },
  JPN: {
    first: [
      "Hajime",
      "Hiroshi",
      "Takashi",
      "Akira",
      "Masatada",
      "Yoshihisa",
      "Toru",
      "Koji",
      "Yasuhiro",
      "Shinji",
      "Hideaki",
      "Kiyoshi",
      "Takayuki",
      "Naoki",
      "Ryoichi",
      "Tetsuya",
      "Jun",
      "Kenji",
      "Satoshi",
      "Masayuki",
      "Go",
      "Takeo",
      "Nobuhiro",
      "Yasushi",
    ],
    last: [
      "Moriyasu",
      "Nishino",
      "Yamada",
      "Ono",
      "Kawasaki",
      "Fujita",
      "Ohashi",
      "Kinoshita",
      "Tani",
      "Omura",
      "Matsuda",
      "Saito",
      "Kurata",
      "Miyamoto",
      "Hara",
      "Kogure",
      "Ishii",
      "Sekizuka",
      "Okamoto",
      "Yasuhara",
      "Takahara",
      "Nakayama",
      "Wada",
      "Yoshimura",
    ],
  },
};

/** Fallback nations for a manager whose nation has no dedicated pool. */
const RELOCATED_NATIONS = ["ENG", "ESP", "ITA", "GER", "FRA", "POR"];

function hashString(value) {
  let hash = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function poolFor(nation) {
  if (MANAGER_NAME_POOLS[nation]) return MANAGER_NAME_POOLS[nation];
  // Non-footballing-coach nations borrow a nearby footballing identity, but the manager
  // keeps his real nationality — only the name pool is borrowed.
  if (NAME_POOLS[nation]) {
    return {
      first: NAME_POOLS[nation].first.slice(0, 24),
      last: NAME_POOLS[nation].last.slice(0, 24),
    };
  }
  const fallback =
    RELOCATED_NATIONS[hashString(nation) % RELOCATED_NATIONS.length];
  return MANAGER_NAME_POOLS[fallback];
}

/**
 * A believable full manager name for a nationality. `used` is a Set of already-taken
 * names; the generator keeps trying different combinations before falling back to a
 * middle initial, so two clubs virtually never get the same manager.
 */
export function generateManagerName(
  nation = "ENG",
  used = new Set(),
  seedKey = "",
) {
  const pool = poolFor(nation);
  const base = hashString(`${nation}|${seedKey}`);
  const firstCount = pool.first.length;
  const lastCount = pool.last.length;
  for (let attempt = 0; attempt < firstCount * lastCount; attempt++) {
    const first = pool.first[(base + attempt * 7) % firstCount];
    const last =
      pool.last[
        (base +
          Math.floor(attempt / firstCount) +
          ((attempt * 5) % lastCount)) %
          lastCount
      ];
    const candidate = `${first} ${last}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Deliberately verbose corner case: every combination is taken, so add an initial.
  for (let attempt = 0; attempt < 60; attempt++) {
    const first = pool.first[(base + attempt) % firstCount];
    const last = pool.last[(base + attempt * 5) % lastCount];
    const initial = String.fromCharCode(65 + (attempt % 26));
    const candidate = `${first} ${initial}. ${last}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return `Manager ${used.size + 1}`;
}

/** True for placeholder names the game must never display as a person. */
export function isPlaceholderManagerName(name) {
  const text = String(name ?? "").trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  if (
    lower === "unknown manager" ||
    lower === "head coach" ||
    lower === "no manager"
  )
    return true;
  if (lower === "random coach" || lower === "national manager") return true;
  if (/^manager\s*\d+$/.test(lower)) return true;
  if (/\bhead coach\b/i.test(text)) return true;
  if (/\bmanager$/i.test(text) && text.split(/\s+/).length <= 3) return true;
  return false;
}

/* ------------------------------------------------------------------------- *
 * Personality profiles
 * ------------------------------------------------------------------------- */

function traitList(manager) {
  const list = Array.isArray(manager?.personality)
    ? manager.personality
    : typeof manager?.personality === "string" && manager.personality
      ? [manager.personality]
      : [];
  return list.filter((trait) => MANAGER_TRAITS.includes(trait));
}

/**
 * Personality traits for a philosophy and a stable seed. Deterministic: the same club
 * always gets the same coach personality, so nothing has to be rolled on render.
 */
export function personalityForStyle(style, seedKey = "") {
  const defining = STYLE_TRAITS[style] ?? STYLE_TRAITS.Balanced;
  const traits = [...defining];
  const hash = hashString(`${style}|${seedKey}`);
  // Two coaches of the same school still differ: one or two supporting traits.
  const extra = 1 + (hash % 2);
  for (let index = 0; index < extra; index++) {
    const trait =
      SECONDARY_TRAITS[(hash + index * 13) % SECONDARY_TRAITS.length];
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
}

/**
 * The coach's reference wage: what this club normally pays a squad player. Used to judge
 * whether a requested signing's wages would break the dressing-room pay structure.
 */
function wageReference(club, finance) {
  const budget = Number(finance?.wageBudget ?? club?.wageBudget ?? 0);
  return Math.max(1500, Math.round(budget / 26));
}

/**
 * The full decision profile for a manager at a club.
 *
 * Pure function of (manager, club): cheap enough to call per decision, and stable enough
 * to be used directly in the UI without caching. It does NOT mutate anything.
 */
export function managerProfile(manager, club = null) {
  const style = manager?.style ?? manager?.playstyle ?? "Balanced";
  const traits = traitList(manager);
  const traitSet = new Set(traits);
  const effectiveStyle = STYLE_TRAITS[style] ? style : "Balanced";

  const base = {
    style: effectiveStyle,
    traits: traits.length ? traits : STYLE_TRAITS[effectiveStyle],
    riskTolerance: Number(manager?.riskTolerance ?? 0.5),
    tacticalFlexibility: Number(manager?.tacticalFlexibility ?? 0.5),
    squadRotation: Number(manager?.squadRotationPreference ?? 0.5),
    ambition: Number(manager?.ambition ?? 0.6),
    youthPreference: Number(manager?.youthBias ?? 0.5),
    patience: Number(manager?.careerStats?.boardConfidence ?? 50) / 100,
    transferPhilosophy: manager?.transferPhilosophy ?? "",
    tacticalPhilosophy: manager?.tacticalPhilosophy ?? "",
  };

  // Recruitment weighting: how much the coach values quality now vs. upside later.
  let ratingWeight = 0.3;
  let potentialWeight = 0.12;
  let qualityBar = 0; // points of overall above the squad's positional average
  let wageTolerance = 1;
  let ageBand = null;
  const positions = new Set();
  for (const trait of base.traits) {
    const rule = TRAIT_RECRUITMENT[trait];
    if (!rule) continue;
    if (rule.ratingWeight != null) ratingWeight += rule.ratingWeight;
    if (rule.potentialWeight != null) potentialWeight += rule.potentialWeight;
    if (rule.qualityBar != null) qualityBar += rule.qualityBar;
    if (rule.wageTolerance != null) wageTolerance *= rule.wageTolerance;
    if (rule.ageBand) ageBand = rule.ageBand;
    for (const position of rule.positions ?? []) positions.add(position);
  }
  // Youth preference sharpens the upside weighting and softens the quality bar.
  if (base.youthPreference >= 0.7 || traitSet.has("Youth Developer")) {
    potentialWeight += 0.15;
    qualityBar -= 1;
  }
  if (traitSet.has("Pragmatic")) potentialWeight -= 0.1;
  // A patient, flexible coach tolerates a signing that is not an instant upgrade.
  if (traitSet.has("Patient")) qualityBar -= 1;
  // Ambitious and demanding coaches expect better than the squad average.
  if (traitSet.has("Ambitious") || traitSet.has("Demanding")) qualityBar += 1;

  return {
    ...base,
    ratingWeight: clamp(ratingWeight, 0.05, 0.9),
    potentialWeight: clamp(potentialWeight, 0, 0.7),
    qualityBar: clamp(qualityBar, -3, 5),
    wageTolerance: clamp(wageTolerance, 0.7, 1.4),
    ageBand,
    structuredPositions: [...positions],
    positionPriorities:
      STYLE_POSITION_PRIORITIES[effectiveStyle] ??
      STYLE_POSITION_PRIORITIES.Balanced,
    urgency: STYLE_URGENCY[effectiveStyle] ?? 0.55,
    // Rotation: a demanding high-press coach churns the XI; a defensive one keeps it.
    rotatesHeavily:
      base.squadRotation >= 0.55 || traitSet.has("High-Press Specialist"),
    developsYouth:
      base.youthPreference >= 0.65 || traitSet.has("Youth Developer"),
    favoursExperience: traitSet.has("Experienced-Player Specialist"),
    flexible:
      base.tacticalFlexibility >= 0.6 || traitSet.has("Tactical Genius"),
    wantsAffordable: traitSet.has("Disciplined") || traitSet.has("Pragmatic"),
  };
}

/** A short human description of a personality, for the UI. */
export function personalitySummary(manager) {
  const profile = managerProfile(manager);
  const traits = profile.traits.slice(0, 4).join(" · ");
  return `${profile.style} · ${traits}`;
}

/**
 * Score a candidate for a coach. This is the one function the AI recruitment path and
 * the player's recruitment request both use, so a Youth Developer reacts the same way
 * whether the club finds the player itself or the user asks for him.
 *
 * Returns `{ score, reasons, ageFit, suitability }`; a positive score means the coach
 * wants him. `target` is the squad's current best rating at the position, and
 * `positionDemand` is the 0..100 need from `assessClubSquadNeeds`.
 */
export function scoreManagerFit({
  manager,
  club = null,
  player,
  positionDemand = 50,
  targetRating = null,
  position = null,
  clubPrestige = null,
}) {
  if (!player || !manager)
    return { score: 0, reasons: [], ageFit: 0.5, suitability: 0 };
  const profile = managerProfile(manager, club);
  const overall = Number(player.overall ?? calculateOverall(player) ?? 55);
  const potential = Number(player.potential ?? overall);
  // `age` is the canonical field on every player record. Fall back to the birthday only
  // when it is missing, so an imported roster without an explicit age is still judged.
  const playerAge = Number.isFinite(Number(player.age))
    ? Number(player.age)
    : Number(player.dob) > 0
      ? ageOn(Number(player.dob), Date.now())
      : 25;
  const slot = position ?? player.position ?? "CM";

  // Tactical suitability: does the player's position belong to the coach's list?
  const suit = profile.structuredPositions.length
    ? profile.structuredPositions.includes(slot) ||
      profile.structuredPositions.includes(String(slot).slice(0, 3))
      ? 1
      : profile.positionPriorities.includes(slot)
        ? 0.7
        : 0.35
    : profile.positionPriorities.includes(slot)
      ? 0.85
      : 0.6;

  // Age fit: inside the coach's preferred window counts full, outside tapers off.
  const band = profile.ageBand ?? (profile.developsYouth ? [16, 24] : [21, 31]);
  const [minAge, maxAge] = band;
  const ageFit =
    playerAge >= minAge && playerAge <= maxAge
      ? 1
      : playerAge < minAge
        ? clamp(1 - (minAge - playerAge) * 0.12, 0.2, 1)
        : clamp(1 - (playerAge - maxAge) * 0.15, 0.1, 1);

  const target = Number.isFinite(targetRating) ? targetRating : overall;
  const improvement = overall - target;
  const upside = potential - overall;
  const prestige = Number(clubPrestige ?? club?.prestige ?? 50);
  const expectedLevel = 46 + prestige * 0.24;

  const needsPosition = positionDemand >= 55;
  const quality =
    (improvement + profile.qualityBar * 2) * profile.ratingWeight * 8 +
    upside * profile.potentialWeight * 3.2 +
    (overall - expectedLevel) * 0.35;

  // Where a player would rank in the club's current pecking order for his role. A player
  // who is clearly better than the men already there is wanted even when the squad is
  // numerically deep at that position; a squad with enough numbers rejects only a
  // player who is no upgrade at all.
  const rankedAtPosition = (club?._marketSquad ?? club?.squadPlayers ?? [])
    .filter((candidate) => candidate && candidate.clubId === club?.id)
    .map((candidate) =>
      normalizePosition(candidate.position) === normalizePosition(slot)
        ? Number(candidate.overall ?? 55)
        : null,
    )
    .filter((rating) => rating != null)
    .sort((left, right) => right - left);
  const bestAtPosition = rankedAtPosition[0] ?? null;
  const outRanksIncumbent =
    bestAtPosition == null ? improvement >= 0 : overall > bestAtPosition;

  // A coach refuses to pile up players in a position he is already well stocked in,
  // but a clear upgrade on the current best there is worth breaking that habit: a
  // squad with enough numbers at a position still benefits from a better player.
  const clearUpgrade = improvement >= 3 || outRanksIncumbent;
  const crowding = needsPosition
    ? 0
    : clearUpgrade
      ? 4
      : positionDemand <= 30
        ? 26
        : 12;
  const score = Math.round(
    quality +
      positionDemand * 0.32 +
      suit * 14 +
      (ageFit - 0.55) * 18 -
      crowding +
      (profile.urgency > 0.7 && improvement >= 2 ? 6 : 0) +
      (profile.developsYouth && playerAge <= 22 && upside >= 6 ? 10 : 0) +
      (profile.favoursExperience && playerAge >= 27 ? 5 : 0) -
      (profile.favoursExperience && playerAge <= 21 ? 4 : 0),
  );

  const reasons = [];
  if (needsPosition) reasons.push(`the squad has a real need at ${slot}`);
  else if (clearUpgrade)
    reasons.push(`he is an upgrade on our current ${slot} options`);
  else if (crowding > 20)
    reasons.push(`we already have enough quality at ${slot}`);
  if (improvement >= 3) reasons.push("he improves the starting XI immediately");
  if (profile.developsYouth && playerAge <= 22 && upside >= 6)
    reasons.push("he is a young player worth developing");
  else if (upside >= 6) reasons.push("he still has room to grow");
  if (suit >= 1)
    reasons.push(`he suits our ${profile.style.toLowerCase()} system`);
  else if (suit < 0.5) reasons.push("he does not fit how we play");

  return {
    score,
    reasons,
    ageFit,
    suitability: suit,
    profile,
    outRanksIncumbent,
    bestAtPosition,
  };
}

/**
 * How should the manager answer a recruitment request?
 *
 * Returns a decision object the career can act on:
 *   { approved, reason, message, candidate }
 *
 * Rules, in order: affordability and registration space are hard vetoes; then the
 * coach's own preference decides. The message always explains the verdict.
 */
export function evaluateRecruitmentRequest({
  manager,
  club,
  player,
  needs = {},
  finance = {},
  wageBill = 0,
  squadSize = 0,
  registrationLimit = 25,
  transferBudget = null,
  balance = null,
  requestedFee = 0,
  requestedWage = 0,
  currentDay = 0,
  position = null,
  season = null,
  // True when the club has already identified a squad player it can sell or release
  // to free the registration space this signing needs. Without it a full squad is a
  // hard veto; with it the signing is judged on its merits.
  makesRoom = false,
}) {
  const profile = managerProfile(manager, club);
  const slot = position ?? player?.position ?? "CM";
  const need = needs?.[slot] ??
    needs?.[String(slot).slice(0, 3)] ?? {
      demand: 45,
      level: "Moderate Need",
    };
  const wages = wageReference(club, finance);
  const budget = Number(transferBudget ?? finance.transferBudget ?? 0);
  const cash = Number(balance ?? finance.balance ?? budget);
  const wageRoom = Number(finance.wageBudget ?? 0) - Number(wageBill ?? 0);

  const deny = (reason) => ({
    approved: false,
    reason,
    message: `${managerName(manager)} cannot approve this signing: ${reason}`,
    candidate: player ?? null,
  });

  if (squadSize >= registrationLimit && !makesRoom) {
    return deny(
      `the ${registrationLimit}-player registration limit is full and he will not release anyone this late`,
    );
  }
  if (!player) {
    return deny("there is no suitable player available to sign right now");
  }
  if (requestedFee > budget || requestedFee > cash) {
    return deny(
      `the club cannot afford the €${Math.round(requestedFee).toLocaleString()} fee on its transfer budget`,
    );
  }
  if (requestedWage > wageRoom) {
    return deny(
      `his wages would take the club past its wage budget (only €${Math.round(Math.max(0, wageRoom)).toLocaleString()} a week left)`,
    );
  }
  if (
    profile.wantsAffordable &&
    requestedWage > wages * 5 * profile.wageTolerance
  ) {
    return deny(
      `his wage would break our pay structure — we do not pay one player five times a squad wage`,
    );
  }

  const fit = scoreManagerFit({
    manager,
    club,
    player,
    positionDemand: need.demand,
    position: slot,
    targetRating: needs?.[slot]?.starterQuality,
  });
  const threshold = profile.developsYouth ? 38 : 44;
  if (fit.score < threshold) {
    const why = fit.reasons.length
      ? fit.reasons.join("; ")
      : `${slot} is not a priority for the way ${managerName(manager)} wants to play`;
    return {
      approved: false,
      reason: why,
      message: `${managerName(manager)} has rejected the request. ${why.charAt(0).toUpperCase() + why.slice(1)}.`,
      candidate: player,
      fit,
      season,
      currentDay,
    };
  }
  return {
    approved: true,
    reason: fit.reasons.join("; ") || `he strengthens the ${slot} position`,
    message: `${managerName(manager)} approves: ${fit.reasons[0] ?? `${slot} needs strengthening`}.`,
    candidate: player,
    fit,
    season,
    currentDay,
  };
}

/** The manager's display name, never a placeholder. */
export function managerName(manager) {
  const name = String(manager?.name ?? "").trim();
  if (!isPlaceholderManagerName(name)) return name;
  const first = String(manager?.first ?? "").trim();
  const last = String(manager?.last ?? "").trim();
  if (first && last) return `${first} ${last}`;
  return "the manager";
}

/**
 * Which positions should this coach prioritise when nobody has asked for anything?
 * Merges the squad's actual gaps with the style's taste, so a defensive coach with a
 * gap at centre-back fixes it first, and a stocked squad is left alone.
 */
export function coachRecruitmentPriorities(
  manager,
  needs = {},
  { limit = 3 } = {},
) {
  const profile = managerProfile(manager);
  const scored = Object.values(needs ?? {}).map((entry, index) => {
    const styleBoost = profile.positionPriorities.indexOf(entry.position);
    const taste =
      styleBoost >= 0
        ? 12 - styleBoost * 2
        : profile.structuredPositions.includes(entry.position)
          ? 6
          : 0;
    return {
      ...entry,
      priority: entry.demand + taste + (index === 0 ? 0 : 0),
    };
  });
  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, limit);
}

/** Deep-copy-safe list of the personality fields that belong in a save. */
export function personalitySnapshot(manager) {
  const profile = managerProfile(manager);
  return {
    personality: [...profile.traits],
    tacticalPhilosophy: profile.tacticalPhilosophy,
    transferPhilosophy: profile.transferPhilosophy,
    riskTolerance: profile.riskTolerance,
    tacticalFlexibility: profile.tacticalFlexibility,
    squadRotationPreference: profile.squadRotation,
    ambition: profile.ambition,
    youthBias: profile.youthPreference,
  };
}

/** Catalogue of nations the manager name generator knows. */
export const MANAGER_NATIONS = [
  ...new Set([...CATALOGUED_NATIONS, ...Object.keys(MANAGER_NAME_POOLS)]),
];

/* ------------------------------------------------------------------------- *
 * Identity assignment across a whole world
 * ------------------------------------------------------------------------- */

/**
 * Build a world-wide manager name generator.
 *
 * One generator per career/world, seeded from the save seed, so:
 *   - names are deterministic for a given seed (saving and reloading changes nothing),
 *   - two clubs never share a coach (the generator remembers every name it issued),
 *   - real managers already in the world are reserved first, so a generated coach is
 *     never accidentally named after somebody already in a dugout.
 *
 * `known` doubles as the persisted registry: store it on the career save and pass it
 * back on load, and a replacement coach is always a new person.
 */
export function buildManagerNameGenerator({ seed = 1, reserved = [] } = {}) {
  const used = new Set();
  for (const name of reserved) {
    const clean = String(name ?? "").trim();
    if (clean && !isPlaceholderManagerName(clean)) used.add(clean);
  }
  let counter = 0;
  return {
    used,
    reserve(name) {
      const clean = String(name ?? "").trim();
      if (!clean || isPlaceholderManagerName(clean)) return false;
      used.add(clean);
      return true;
    },
    /** A fresh name for a nationality, unique against everything issued so far. */
    next(nation = "ENG", salt = "") {
      counter += 1;
      const key = `${seed}|${nation}|${salt}|${counter}`;
      return generateManagerName(nation, used, key);
    },
    toJSON() {
      return [...used];
    },
  };
}

/**
 * Give a club a properly named, uniquely identified coach without re-rolling a good one.
 *
 * - A real manager (Pep Guardiola, Diego Simeone, ...) keeps his name.
 * - A legacy placeholder name is replaced with a generated name for the club's nation.
 * - A manager who lost his personality fields (old save) has them restored from his style.
 * - `generator` is optional; without it the club is still fixed, just not deduplicated
 *   against the other clubs in the world.
 */
export function ensureClubManagerIdentity(
  club,
  { generator = null, nation = null } = {},
) {
  if (!club || !club.manager) return club?.manager ?? null;
  const manager = club.manager;
  const coachNation = nation ?? manager.nationality ?? club.nation ?? "ENG";
  manager.nationality = manager.nationality ?? coachNation;

  if (isPlaceholderManagerName(manager.name)) {
    const proposed = generator
      ? generator.next(coachNation, club.id)
      : generateManagerName(coachNation, new Set(), club.id);
    manager.name = proposed;
  } else if (generator) {
    // A real/known name may clash with a generated one issued earlier; keep the real one
    // and make sure later generations avoid it.
    generator.reserve(manager.name);
  }
  const [firstName, ...lastParts] = String(manager.name).split(/\s+/);
  manager.first = manager.first ?? firstName;
  manager.last = manager.last ?? lastParts.join(" ");
  manager.style = manager.style ?? "Balanced";
  if (!Array.isArray(manager.personality)) {
    manager.personality = personalityForStyle(
      manager.style,
      manager.id ?? `${club.id}`,
    );
  }
  return manager;
}

/**
 * Replace a club's manager with a new, properly named person.
 * Used by dismissal, retirement and owner-requested sackings, so a replacement is never
 * an anonymous "Head Coach".
 */
export function createReplacementManager(
  club,
  { generator = null, style = null, seedKey = "" } = {},
) {
  const nation = club?.nation ?? "ENG";
  const coachStyle = style ?? club?.manager?.style ?? "Balanced";
  const name = generator
    ? generator.next(nation, `${club.id}|${seedKey}|${Date.now() % 100000}`)
    : generateManagerName(nation, new Set(), `${club.id}|${seedKey}`);
  return {
    id: `manager-${club.id}-${seedKey || "replacement"}`,
    name,
    nationality: nation,
    style: coachStyle,
    rating: club?.manager?.rating ?? 60,
    personality: personalityForStyle(coachStyle, `${club.id}|${name}`),
  };
}
