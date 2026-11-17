import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
// Find the exact location
const idx = content.indexOf('function playerProfileLink');
if (idx === -1) {
  console.log('function playerProfileLink not found');
} else {
  console.log('Found at index:', idx);
  // Show context
  console.log('Context:', JSON.stringify(content.substring(idx - 50, idx + 50)));
}