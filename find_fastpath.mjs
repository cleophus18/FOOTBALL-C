import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
// Find the fast path return
const idx = content.indexOf('bindPlayerLinks(content');
if (idx === -1) {
  console.log('bindPlayerLinks not found');
} else {
  console.log('Found at index:', idx);
  console.log('Context:', JSON.stringify(content.substring(idx - 100, idx + 200)));
}