import { loadData } from "./src/data/loader.mjs";

console.time("loadData");
const data = await loadData();
console.timeEnd("loadData");
console.time("parse");
console.timeEnd("parse");
console.log("players", data.fc25Players.length);