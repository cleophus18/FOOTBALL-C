// Capture the real stack: patch Error construction inside the career module via a query-string
// re-import of the app is overkill, so instead wrap every prototype method of the loaded module.
export default async function run(page, ui) {
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });

  // Load the same module instance the app uses and wrap the suspicious call.
  const trace = await page.evaluate(async () => {
    const mod = await import("/src/career.mjs");
    const proto = mod.Career.prototype;
    const names = [
      "advanceSeason",
      "settleManagerSeason",
      "retireAndReplaceLeaguePlayers",
      "developLeaguePlayers",
      "developWorldPlayers",
      "retireAndReplaceWorldPlayers",
      "buildLeague",
      "buildWorldLeagues",
      "applyCoachFormations",
      "buildWorldCupRosters",
    ];
    for (const name of names) {
      const original = proto[name];
      proto[name] = function (...args) {
        try {
          return original.apply(this, args);
        } catch (error) {
          window.__trace = `${name}: ${error.message}\n${error.stack}`;
          throw error;
        }
      };
    }
    return true;
  });

  await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
  await page.waitForSelector("#manager-form", { timeout: 10000 });
  await page.locator('select[name="leagueId"]').selectOption({ index: 1 });
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Take charge/i }).click();
  await page.waitForSelector(".manager-hub", { timeout: 20000 });
  await page
    .locator('.manager-actions button[data-action="simulate-season"]')
    .click();
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(500);
    const done = await page.evaluate(
      () =>
        !!document
          .querySelector(".manager-actions-buttons .button-primary")
          ?.innerText.includes("Start "),
    );
    if (done) break;
  }
  await page.locator(".manager-actions-buttons .button-primary").click();
  await page.waitForTimeout(1200);
  return page.evaluate(() => ({
    toast: document.querySelector(".toast")?.innerText,
    trace: window.__trace ?? "(no trace captured)",
  }));
}
