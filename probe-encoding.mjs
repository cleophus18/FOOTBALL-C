import { readFile } from "node:fs/promises";

const path = "src/career.mjs";
const text = await readFile(path, "utf8");
const seen = new Map();
for (const ch of text) {
  const code = ch.codePointAt(0);
  const suspicious =
    (code >= 0x80 && code <= 0x9f) ||
    code === 0x00c2 ||
    code === 0x00c3 ||
    code === 0x00e2 ||
    code === 0x00e3 ||
    code === 0x00ac ||
    code === 0x201a ||
    code === 0x201e ||
    code === 0x2013 ||
    code === 0x2014 ||
    code === 0x2018 ||
    code === 0x2019 ||
    code === 0x201c ||
    code === 0x201d ||
    code === 0x20ac ||
    code === 0x00b7 ||
    code === 0x00a0;
  if (!suspicious) continue;
  const key = ch;
  seen.set(key, (seen.get(key) ?? 0) + 1);
}
for (const [ch, count] of [...seen.entries()].sort((a, b) => b[1] - a[1]))
  console.log(
    JSON.stringify(ch),
    "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"),
    count,
  );