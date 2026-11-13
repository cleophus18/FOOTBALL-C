/**
 * Player identity.
 *
 * A player's name is data, not a parsing accident. Splitting a full name on the first
 * space is wrong for most of the world: Portuguese and Spanish players carry several
 * surnames, Dutch and Scandinavian players use particles ("van Dijk", "Ødegaard"),
 * and plenty of footballers are known by a single nickname ("Rodri", "Alisson").
 *
 * This module owns three things and nothing else:
 *   1. `playerIdentity` — turn any source name into a stable, complete identity record
 *      (full name, first name, last name, display name, nickname, nationality, ...).
 *   2. `identityKey` — an accent-, spacing- and punctuation-insensitive key used to spot
 *      the same human arriving twice from two differently formatted CSV exports.
 *   3. `matchPlayerIdentity` / `mergeIdentities` — conservative duplicate detection. A
 *      weak name match alone never merges two records; identity keys plus a compatible
 *      club/nationality/date-of-birth always win, and different birth dates veto a merge.
 *
 * The rules here are used by the CSV importer, the legacy migration, and the career
 * loader so every roster source produces the same identity shape.
 */

import { normalizePosition } from "../core/constants.mjs";

/** Lowercase, strip accents, unify spacing. Keeps letters/numbers from any script. */
export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Ø/ø, Ð/ð, Æ/æ, ß, Ł/ł have no combining mark to strip.
    .replace(/[Øø]/g, "o")
    .replace(/[Ðð]/g, "d")
    .replace(/[Ææ]/g, "ae")
    .replace(/ß/g, "ss")
    .replace(/[Łł]/g, "l")
    .replace(/[Đđ]/g, "d")
    .replace(/[Þþ]/g, "th")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A comparison key that ignores accents, punctuation and spacing differences. */
export function nameKey(...parts) {
  return normalizeText(parts.filter(Boolean).join(" ")).replace(/\s+/g, " ").trim();
}

/** Compact key without any spacing — used where word order must not matter. */
export function compactNameKey(...parts) {
  return nameKey(...parts).replace(/\s+/g, "");
}

/** Particles that chain onto the previous name word in Iberian, Dutch and French names. */
const SURNAME_PARTICLES = new Set([
  "van", "der", "den", "del", "della", "di", "da", "dos", "das", "de", "la",
  "las", "los", "le", "du", "ter", "ten", "von", "zu", "zur", "af", "av",
  "mac", "mc", "san", "santa", "bin", "ibn", "al", "e", "y", "y1",
]);

/**
 * Words that may *start* a surname even though they are not particles themselves.
 * Portuguese and Spanish naming puts the given name first and one or more family names
 * last, so a name ending in a particle must absorb the word before it ("dos Santos",
 * "de la Cruz") rather than leaving a bare particle as the surname.
 */
const SURNAME_HEADS = new Set([
  "santos", "sant", "cruz", "sousa", "souza", "oliveira", "silva", "pereira",
  "costa", "fonseca", "machado", "moura", "nunes", "pires", "rocha", "teixeira",
  "vieira", "braga", "andrade", "barros", "campos", "cardoso", "carvalho",
  "fernandes", "ferreira", "gomes", "goncalves", "lopes", "martins", "matos",
  "mendes", "monteiro", "morais", "moreira", "neves", "pinto", "ramos", "ribeiro",
  "azevedo", "almeida", "alves", "araujo", "azevedo", "baptista", "barbosa",
  "bastos", "brito", "correia", "cunha", "duarte", "faria", "freitas",
  "guimaraes", "leite", "lima", "magalhaes", "marques", "mota", "neto",
  "nogueira", "noronha", "paiva", "palhares", "queiros", "rezende",
]);

/** Single-name football nicknames mapped to the legal name the sport uses. */
export const KNOWN_SINGLE_NAME_PLAYERS = {
  rodri: { first: "Rodrigo", last: "Hernández Cascante", display: "Rodri", nickname: "Rodri" },
  alisson: { first: "Alisson", last: "Becker", display: "Alisson", nickname: "Alisson" },
  pedri: { first: "Pedro", last: "González López", display: "Pedri", nickname: "Pedri" },
  raphinha: { first: "Raphael", last: "Dias Belloli", display: "Raphinha", nickname: "Raphinha" },
  marquinhos: { first: "Marcos", last: "Corrêa", display: "Marquinhos", nickname: "Marquinhos" },
  vitinha: { first: "Vítor", last: "Ferreira", display: "Vitinha", nickname: "Vitinha" },
  ederson: { first: "Ederson", last: "Moraes", display: "Ederson", nickname: "Ederson" },
  marta: { first: "Marta", last: "Vieira da Silva", display: "Marta", nickname: "Marta" },
  vini: { first: "Vinícius", last: "Paixão", display: "Vinícius Jr.", nickname: "Vini Jr." },
  neymar: { first: "Neymar", last: "Santos Júnior", display: "Neymar", nickname: "Neymar" },
};

/**
 * Verified names for players whose commonly imported names hide the wrong split.
 * Keyed by the normalized display name the import files use.
 */
const VERIFIED_IDENTITIES = {
  "lamine yamal": {
    first: "Lamine",
    last: "Yamal Nasraoui Ebana",
    display: "Lamine Yamal",
    nickname: "Lamine Yamal",
    fullName: "Lamine Yamal Nasraoui Ebana",
    nationality: "ESP",
    position: "RW",
  },
  "lamine yamal nasraoui ebana": {
    first: "Lamine",
    last: "Yamal Nasraoui Ebana",
    display: "Lamine Yamal",
    nickname: "Lamine Yamal",
    fullName: "Lamine Yamal Nasraoui Ebana",
    nationality: "ESP",
    position: "RW",
  },
  "joao cancelo": {
    first: "João Pedro",
    last: "Cavaco Cancelo",
    display: "João Cancelo",
    nickname: "Cancelo",
    fullName: "João Pedro Cavaco Cancelo",
    nationality: "POR",
    position: "LB",
  },
  "joao pedro cavaco cancelo": {
    first: "João Pedro",
    last: "Cavaco Cancelo",
    display: "João Cancelo",
    nickname: "Cancelo",
    fullName: "João Pedro Cavaco Cancelo",
    nationality: "POR",
    position: "LB",
  },
};

const verifiedIdentity = (rawName, normalized) =>
  VERIFIED_IDENTITIES[normalized] ?? null;

/**
 * The nickname a supporter would actually shout, or null when the display name is
 * already the common form. "Lamine Yamal" stays as-is; "João Pedro Cavaco Cancelo"
 * becomes "João Cancelo" (compound given name + surname).
 */
export function deriveNickname(first, last, display) {
  const full = nameKey(display || `${first} ${last}`);
  if (KNOWN_SINGLE_NAME_PLAYERS[full]) return KNOWN_SINGLE_NAME_PLAYERS[full].nickname;
  const firstWords = String(first ?? "").trim().split(/\s+/).filter(Boolean);
  const lastWords = String(last ?? "").trim().split(/\s+/).filter(Boolean);
  if (firstWords.length >= 2 && lastWords.length >= 1) {
    // Portuguese/Spanish compound given name: keep the first given name only.
    const compound = `${firstWords[0]} ${lastWords[0]}`;
    if (compound.split(/\s+/).length === 2) return compound;
  }
  return null;
}

/**
 * Split a full name into given name(s) and surname(s) without ever dropping parts.
 * The heuristic order is: known nickname -> particle-aware surname -> final token.
 */
export function splitFullName(fullName, { display } = {}) {
  const full = String(fullName ?? "").replace(/\s+/g, " ").trim();
  const normalized = normalizeText(full);
  const verified = verifiedIdentity(full, normalized);
  if (verified) return verified;
  const single = KNOWN_SINGLE_NAME_PLAYERS[normalized];
  if (single) return single;

  if (!full) return { first: "", last: "", display: display ?? "", nickname: null };
  const words = full.split(" ");
  if (words.length === 1) {
    return { first: words[0], last: "", display: display ?? words[0], nickname: null };
  }
  // A trailing particle is part of the surname, not the start of it. Walk back so
  // "dos Santos" / "de la Cruz" stay whole, then extend to the next word when the
  // resulting surname would begin with a bare particle.
  const particleChain = (index) =>
    SURNAME_PARTICLES.has(words[index]?.toLowerCase());
  let split = words.length - 1;
  while (split > 1 && particleChain(split - 1)) split--;
  // A surname must not end on a bare particle: "Gabriel dos Santos" -> "Gabriel",
  // "dos Santos". Stop when the previous word would be swallowed into a given name.
  while (
    split > 1 &&
    particleChain(split) &&
    !SURNAME_HEADS.has(words[split + 1]?.toLowerCase() ?? "")
  ) {
    split -= 1;
    if (particleChain(split - 1)) break;
  }
  const first = words.slice(0, split).join(" ");
  const last = words.slice(split).join(" ");
  return {
    first,
    last,
    display: display ?? `${first} ${last}`,
    nickname: deriveNickname(first, last, display ?? full),
  };
}

/** The shape every source (CSV row, legacy ratings, generated player) must produce. */
export function playerIdentity({
  playerId = null,
  fullName = "",
  firstName = "",
  lastName = "",
  displayName = "",
  nickname = null,
  nationality = null,
  dateOfBirth = null,
  club = null,
  league = null,
  position = "",
  source = "import",
} = {}) {
  const full = String(fullName ?? "").replace(/\s+/g, " ").trim();
  const normalized = normalizeText(full || `${firstName} ${lastName}`);
  const verified = verifiedIdentity(full, normalized);
  const split = full
    ? splitFullName(full, { display: displayName || undefined })
    : {
        first: firstName,
        last: lastName,
        display: displayName,
        nickname: null,
      };
  const first = (verified?.first ?? split.first ?? firstName ?? "").trim();
  const last = (verified?.last ?? split.last ?? lastName ?? "").trim();
  const display = (
    verified?.display ??
    displayName ??
    split.display ??
    `${first} ${last}`
  ).trim();
  const nick =
    verified?.nickname ??
    nickname ??
    split.nickname ??
    deriveNickname(first, last, display) ??
    null;
  return {
    playerId: playerId ? String(playerId).trim() : null,
    fullName: verified?.fullName ?? (full || `${first} ${last}`.trim()),
    first,
    last,
    displayName: display,
    nickname: nick,
    nationality: verified?.nationality ?? (nationality ? String(nationality).trim().toUpperCase() : null),
    dateOfBirth: dateOfBirth ?? null,
    club: club ? String(club).trim() : null,
    league: league ? String(league).trim() : null,
    position: normalizePosition(position || verified?.position || "CM"),
    source,
    identityKey: nameKey(display || `${first} ${last}`),
    strongIdentityKey: strongIdentityKey({
      displayName: display,
      nationality: verified?.nationality ?? nationality,
      dateOfBirth,
      club,
      league,
    }),
  };
}

/**
 * A strong key combines name with identity evidence. Two records with the same strong
 * key are the same person. A name-only key is deliberately NOT enough on its own.
 */
export function strongIdentityKey({ displayName, nationality, dateOfBirth, club, league } = {}) {
  const name = nameKey(displayName);
  const nation = nationality ? normalizeText(nationality).toUpperCase() : "";
  const dob = dateOfBirth ? String(dateOfBirth).trim() : "";
  const clubKey = club ? normalizeText(club).replace(/\s+/g, "-") : "";
  const leagueKey = league ? normalizeText(league).replace(/\s+/g, "-") : "";
  return [name, nation, dob, leagueKey, clubKey].filter(Boolean).join("|");
}

/** True when two records plausibly describe the same human. */
export function matchPlayerIdentity(left, right) {
  if (!left || !right) return false;
  const a = strongIdentityKey(left);
  const b = strongIdentityKey(right);
  if (a && b && a === b) return true;
  const sameName =
    nameKey(left.displayName ?? left.fullName) ===
      nameKey(right.displayName ?? right.fullName) ||
    compactNameKey(left.displayName ?? left.fullName) ===
      compactNameKey(right.displayName ?? right.fullName);
  if (!sameName) return false;
  // Different birth dates or nationalities are a hard veto: similar names are common.
  const dobA = left.dateOfBirth ? String(left.dateOfBirth).trim() : "";
  const dobB = right.dateOfBirth ? String(right.dateOfBirth).trim() : "";
  if (dobA && dobB && dobA !== dobB) return false;
  const natA = left.nationality ? normalizeText(left.nationality).toUpperCase() : "";
  const natB = right.nationality ? normalizeText(right.nationality).toUpperCase() : "";
  if (natA && natB && natA !== natB) return false;
  const clubA = left.club ? nameKey(left.club) : "";
  const clubB = right.club ? nameKey(right.club) : "";
  if (clubA && clubB && clubA !== clubB) return false;
  return true;
}

/** Merge two identity records, keeping the richest value for every field. */
export function mergeIdentities(primary, secondary) {
  const pick = (a, b) => {
    const value = a ?? b;
    return value === "" ? null : value;
  };
  return {
    ...secondary,
    ...Object.fromEntries(
      Object.entries(primary).filter(([, value]) => value != null && value !== ""),
    ),
    first: pick(primary.first, secondary.first) ?? "",
    last: pick(primary.last, secondary.last) ?? "",
    displayName: pick(primary.displayName, secondary.displayName) ?? "",
    fullName: pick(primary.fullName, secondary.fullName) ?? "",
    nationality: pick(primary.nationality, secondary.nationality),
    dateOfBirth: pick(primary.dateOfBirth, secondary.dateOfBirth),
    club: pick(primary.club, secondary.club),
    league: pick(primary.league, secondary.league),
  };
}

/**
 * Group records by identity, returning the deduplicated list and the merge report.
 * Stable: input order decides which record survives, so imports stay deterministic.
 */
export function dedupeIdentities(records, { keyOf = (record) => strongIdentityKey(record) } = {}) {
  const kept = [];
  const byKey = new Map();
  const merges = [];
  for (const record of records) {
    const key = keyOf(record);
    const prior = byKey.get(key);
    if (!prior) {
      byKey.set(key, record);
      kept.push(record);
      continue;
    }
    if (matchPlayerIdentity(prior, record)) {
      const merged = mergeIdentities(prior, record);
      byKey.set(key, merged);
      const index = kept.indexOf(prior);
      if (index >= 0) kept[index] = merged;
      merges.push({ kept: merged.displayName, discarded: record.displayName });
      continue;
    }
    // Same key but conflicting evidence: never merge two different humans.
    byKey.set(`${key}#${kept.length}`, record);
    kept.push(record);
  }
  return { records: kept, merges };
}