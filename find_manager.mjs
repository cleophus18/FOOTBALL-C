import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/model/club.mjs', 'utf8');
const idx = content.indexOf('export class Manager');
if (idx === -1) {
  console.log('NOT FOUND');
} else {
  // Find the end of the Manager class (next export class)
  const nextClass = content.indexOf('export class Club', idx + 1);
  console.log('Manager class from', idx, 'to', nextClass);
  console.log('Content:', JSON.stringify(content.substring(idx, nextClass)));
}