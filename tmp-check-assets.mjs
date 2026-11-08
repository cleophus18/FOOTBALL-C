import { readFile } from "node:fs/promises";

const missing = [];
const html = await readFile("index.html", "utf8");
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  try {
    await readFile(m[1]);
  } catch {
    missing.push(m[1]);
  }
}
const app = await readFile("src/ui/app.mjs", "utf8");
for (const m of app.matchAll(/fetchData\("([^"]+)"/g)) {
  try {
    await readFile(m[1]);
  } catch {
    missing.push(m[1]);
  }
}
console.log(
  missing.length
    ? `MISSING:\n${missing.join("\n")}`
    : "all local assets and data files resolve",
);
