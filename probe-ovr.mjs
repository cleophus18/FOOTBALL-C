import { createPlayer, calculatePlayerOverall, deriveSubAttrsFromGroups } from "./src/model/player.mjs";
import { SUB_ATTRIBUTES } from "./src/core/constants.mjs";
import { POSITION_ATTRIBUTE_WEIGHTS } from "./src/model/player.mjs";

const attrs = { pace: 87, shooting: 92, passing: 71, dribbling: 80, defending: 47, physical: 89 };
console.log("group map for ST weights:");
const owner = new Map();
for (const [group, list] of Object.entries(SUB_ATTRIBUTES))
  for (const sub of list) owner.set(sub, group);
const subs = deriveSubAttrsFromGroups(attrs);
for (const [key, weight] of Object.entries(POSITION_ATTRIBUTE_WEIGHTS.ST))
  console.log(`  ${key.padEnd(22)} w=${weight} owner=${owner.get(key) ?? key} value=${subs[key] ?? attrs[key]}`);
console.log("overall", calculatePlayerOverall({ position: "ST", attrs, subAttrs: subs }));