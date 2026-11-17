const fs = require('fs');
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
const oldStr = '}\n\nfunction playerProfileLink';
const newStr = '}\n\nfunction bindActionButtons(root) {\n  root.querySelectorAll("[data-action]").forEach((button) =>\n    button.addEventListener("click", (event) => {\n      if (event.defaultPrevented) return;\n      event.preventDefault();\n      handleAction(button.dataset.action, button.dataset);\n    }),\n  );\n}\n\nfunction playerProfileLink';
const result = content.replace(oldStr, newStr);
if (result === content) {
  console.log('NOT FOUND');
} else {
  console.log('FOUND and replaced');
  fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', result);
}