import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
// Find the duplicate binding code
const idx = content.indexOf('bindActionButtons($app);\r\n  $app.querySelectorAll("[data-lineup-bench]")');
if (idx === -1) {
  console.log('NOT FOUND');
} else {
  console.log('Found at index:', idx);
  console.log('Context:', JSON.stringify(content.substring(idx - 50, idx + 200)));
}