import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
const oldStr = 'bindPlayerLinks(content ?? $app);\r\n    scheduleMatchSimulationTick();\r\n    return;';
const newStr = 'bindPlayerLinks(content ?? $app);\r\n    bindActionButtons(content ?? $app);\r\n    scheduleMatchSimulationTick();\r\n    return;';
const result = content.replace(oldStr, newStr);
if (result === content) {
  console.log('NOT FOUND');
} else {
  console.log('FOUND and replaced');
  fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', result);
}