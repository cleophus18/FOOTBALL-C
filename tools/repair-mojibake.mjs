/**
 * One-off maintenance script: repair the mojibake in `src/career.mjs`.
 *
 * The file was at some point decoded as Windows-1252 and re-saved as UTF-8, so every
 * typographic character became a two- or three-character sequence ("â€”" instead of "—",
 * "â‚¬" instead of "€", "Â·" instead of "·", "FenerbahÃ§e" instead of "Fenerbahçe").
 *
 * Run: node tools/repair-mojibake.mjs <file> [--write]
 */
import { readFile, writeFile } from "node:fs/promises";

const REPLACEMENTS = [
  ["\u00e2\u20ac\u201d", "\u2014"], // â€” -> —
  ["\u00e2\u20ac\u201c", "\u2013"], // â€“ -> –
  ["\u00e2\u201a\u00ac", "\u20ac"], // â‚¬ -> €
  ["\u00c2\u00b7", "\u00b7"], //       Â· -> ·
  ["Fenerbah\u00c3\u00a7e", "Fenerbah\u00e7e"],
  ["Be\u00c5\u0178ikta\u00c5\u0178", "Be\u015fikta\u015f"],
];

const target = process.argv[2];
if (!target) {
  console.error("usage: node tools/repair-mojibake.mjs <file> [--write]");
  process.exit(1);
}
const write = process.argv.includes("--write");

const text = await readFile(target, "utf8");
let repaired = text;
const counts = [];
for (const [from, to] of REPLACEMENTS) {
  const hits = repaired.split(from).length - 1;
  if (hits) counts.push(`${JSON.stringify(from)} -> ${JSON.stringify(to)} x${hits}`);
  repaired = repaired.split(from).join(to);
}

// Anything still in the C1 range or a Latin-1 lead byte is suspicious in a UTF-8 source file.
const leftovers = new Set(
  [...repaired].filter((ch) => {
    const code = ch.codePointAt(0);
    return (code >= 0x80 && code <= 0xbf && code !== 0x00b7) || code === 0x00c2 || code === 0x00c3 || code === 0x00c5 || code === 0x00e2;
  }),
);

console.log(counts.length ? counts.join("\n") : "no mojibake sequences found");
console.log(
  leftovers.size
    ? `leftover suspicious characters: ${[...leftovers].map((ch) => JSON.stringify(ch)).join(", ")}`
    : "no leftover suspicious characters",
);

if (!write) {
  console.log("dry run; pass --write to persist");
  process.exit(0);
}
if (!counts.length) process.exit(0);
await writeFile(target, repaired, "utf8");
console.log("written");