// Deep-dive: capture the stack trace behind the next-season crash.
export default async function run(page, ui) {
  await page.addInitScript(() => {
    window.__errors = [];
    window.addEventListener("error", (event) => {
      window.__errors.push(
        `${event.message}\n${event.error?.stack ?? "(no stack)"}`,
      );
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.__errors.push(
        `REJECTION ${event.reason?.message}\n${event.reason?.stack ?? ""}`,
      );
    });
  });

  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });
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

  // Instrument the career through a save so we can call advanceSeason in isolation
  // and get a stack trace rather than the toast's one-line message.
  await page.evaluate(async () => {
    const original = console.error;
    console.error = (...args) => {
      window.__errors.push(`console.error ${args.map(String).join(" ")}`);
      original(...args);
    };
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => ({
    save: JSON.parse(localStorage.getItem("touchline-career-slot-1")),
  }));
  await page.locator(".manager-actions-buttons .button-primary").click();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({
    toast: document.querySelector(".toast")?.innerText,
    errors: window.__errors,
  }));
  const save = before.save;
  return {
    after,
    saveFacts: {
      season: save.season,
      seasonComplete: save.seasonComplete,
      week: save.week,
      matchSimulation: save.matchSimulation,
      managerSeasons: save.managerState?.seasons?.length,
      resultsLength: save.results?.length,
    },
  };
}
