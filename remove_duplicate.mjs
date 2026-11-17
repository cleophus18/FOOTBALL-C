import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
const oldStr = 'renderGame();\r\n    });\r\n  bindActionButtons($app);\r\n  $app.querySelectorAll("[data-lineup-bench]")';
const newStr = 'renderGame();\r\n    });\r\n  $app.querySelectorAll("[data-lineup-bench]")';
const result = content.replace(oldStr, newStr);
if (result === content) {
  console.log('NOT FOUND');
} else {
  console.log('FOUND and replaced');
  fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', result);
}