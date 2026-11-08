// Does a simulated season actually settle the manager's season record?
export default async function run(page, ui) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));
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
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => ({
    toast: document.querySelector(".toast")?.innerText,
    eyebrow: document.querySelector(".manager-hero .eyebrow")?.innerText,
    historyTag: document.querySelector(".manager-history-panel .live-tag")
      ?.innerText,
    historyBody: document.querySelector(".manager-history-panel tbody")
      ?.innerText,
    topbarSeason: document.querySelector(".topbar .eyebrow")?.innerText,
    primaryLabel: document
      .querySelector(".manager-actions-buttons .button-primary")
      ?.innerText.trim(),
  }));

  // Now actually enter the next season via the primary action.
  await page.locator(".manager-actions-buttons .button-primary").click();
  await page.waitForTimeout(1500);
  const afterNext = await page.evaluate(() => ({
    toast: document.querySelector(".toast")?.innerText,
    eyebrow: document.querySelector(".manager-hero .eyebrow")?.innerText,
    topbarSeason: document.querySelector(".topbar .eyebrow")?.innerText,
    historyTag: document.querySelector(".manager-history-panel .live-tag")
      ?.innerText,
    historyRow: document
      .querySelector(".manager-history-panel tbody tr")
      ?.innerText.replace(/\t/g, " | "),
    primaryLabel: document
      .querySelector(".manager-actions-buttons .button-primary")
      ?.innerText.trim(),
  }));
  return { state, afterNext, errors };
}
