// QA: create a manager career through the UI and inspect the new manager hub.
export default async function run(page, ui) {
  const log = [];
  page.on("pageerror", (error) => log.push(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") log.push(`CONSOLE ${message.text()}`);
  });

  await page.waitForSelector(".menu-shell", { timeout: 20000 });
  await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
  await page.waitForSelector("#manager-form", { timeout: 10000 });

  // Give the manager a recognisable name, then take charge of a mid-table club.
  await page.fill('input[name="last"]', "Holloway");
  await page.locator('select[name="clubId"]').selectOption({ index: 6 });
  await page.getByRole("button", { name: /Take charge/i }).click();

  await page.waitForSelector(".manager-hub", { timeout: 20000 });

  const describe = () =>
    page.evaluate(() => {
      const text = (selector) =>
        document.querySelector(selector)?.innerText.trim() ?? null;
      const count = (selector) => document.querySelectorAll(selector).length;
      return {
        heading: text(".manager-hero h1"),
        clubLine: text(".manager-hero-text p"),
        facts: [...document.querySelectorAll(".manager-fact")].map((el) =>
          el.innerText.replace(/\n/g, ": "),
        ),
        actions: [
          ...document.querySelectorAll(".manager-actions-buttons button"),
        ].map((el) => el.innerText.trim()),
        boardScore: text(".manager-board-score"),
        meters: [...document.querySelectorAll(".manager-meter")].map((el) =>
          el.innerText.replace(/\n/g, ": "),
        ),
        seasonCells: [...document.querySelectorAll(".manager-season-cell")].map(
          (el) => el.innerText.replace(/\n/g, " | "),
        ),
        last5: [...document.querySelectorAll(".manager-form-badge")].map(
          (el) => el.innerText,
        ),
        nextFixture: text(".next-match-panel h2"),
        starters: count(".manager-lineup li"),
        firstStarter: text(".manager-lineup li"),
        squadStats: [
          ...document.querySelectorAll(".manager-squad-stats > div"),
        ].map((el) => el.innerText.replace(/\n/g, " ")),
        inboxItems: count(".manager-hub-side .news-item"),
        clubRows: [...document.querySelectorAll(".manager-club-list li")].map(
          (el) => el.innerText.replace(/\n/g, ": "),
        ),
        historyRows: count(".manager-history-panel tbody tr"),
        emptyLayout: {
          hero: count(".manager-hero"),
          layout: count(".manager-hub-layout"),
          side: count(".manager-hub-side"),
        },
      };
    });

  const afterCreate = await describe();

  // Simulate a chunk of the season so the season record, form strip and history fill in.
  await page.getByRole("button", { name: /Simulate one week/i }).click();
  await page.waitForTimeout(900);
  for (let i = 0; i < 3; i += 1) {
    await page
      .locator('.manager-actions button[data-action="simulate-week"]')
      .click();
    await page.waitForTimeout(700);
  }
  const afterWeeks = await describe();

  // The in-panel shortcut must land on the squad screen.
  await page.getByRole("button", { name: /Manage XI/i }).click();
  await page.waitForTimeout(400);
  const squadScreen = await page.evaluate(() => ({
    activeNav: document.querySelector(".nav-item.active")?.innerText.trim(),
    hasPitch: !!document.querySelector(".pitch"),
  }));

  // Back to the hub via the sidebar.
  await page.locator('.nav-item[data-screen="manager"]').click();
  await page.waitForSelector(".manager-hub");

  return { afterCreate, afterWeeks, squadScreen, errors: log };
}
