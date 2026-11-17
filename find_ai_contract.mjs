import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/core/contracts.mjs', 'utf8');
const idx = content.indexOf('export function aiContractDecision');
if (idx === -1) {
  console.log('NOT FOUND');
} else {
  // Find the end of the function (next export function)
  const nextFunc = content.indexOf('export function aiRenewalOffer', idx + 1);
  console.log('Function from', idx, 'to', nextFunc);
  console.log('Content:', JSON.stringify(content.substring(idx, nextFunc)));
}