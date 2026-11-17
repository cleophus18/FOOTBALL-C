import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/core/contracts.mjs', 'utf8');

// Find the function using regex
const startIdx = content.indexOf('export function aiContractDecision');
if (startIdx === -1) {
  console.log('Function not found');
  process.exit(1);
}

// Find the end of the function (next export function)
const nextFuncIdx = content.indexOf('export function aiRenewalOffer', startIdx + 1);
if (nextFuncIdx === -1) {
  console.log('Next function not found');
  process.exit(1);
}

const oldFunc = content.substring(startIdx, nextFuncIdx);
console.log('Old function length:', oldFunc.length);
console.log('First 200 chars:', oldFunc.substring(0, 200));
console.log('Last 200 chars:', oldFunc.substring(oldFunc.length - 200));

// Write the old function to a file for inspection
fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/old_func.txt', oldFunc);
console.log('Written to old_func.txt');