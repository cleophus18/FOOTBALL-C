import fs from 'fs';
const content = fs.readFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', 'utf8');
const oldStr = '}\r\n\r\nfunction playerProfileLink';
const newStr = '}\r\n\r\nfunction bindActionButtons(root) {\r\n  root.querySelectorAll("[data-action]").forEach((button) =>\r\n    button.addEventListener("click", (event) => {\r\n      if (event.defaultPrevented) return;\r      event.preventDefault();\r      handleAction(button.dataset.action, button.dataset);\r    }),\r  );\r}\r\n\r\nfunction playerProfileLink';
const result = content.replace(oldStr, newStr);
if (result === content) {
  console.log('NOT FOUND');
} else {
  console.log('FOUND and replaced');
  fs.writeFileSync('C:/Users/cleot/Documents/games/FOOTBALL C/src/ui/app.mjs', result);
}