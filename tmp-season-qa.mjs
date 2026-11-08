// End of season 1, then a fresh season 2, on the manager hub.
export default async function run(page, ui) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`CONSOLE ${message.text()}`);
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
  await page.waitForTimeout(2500);

  const seasonEnd = await page.evaluate(() => ({
    primaryAction: document
      .querySelector(".manager-actions-buttons .button-primary")
      ?.innerText.trim(),
    actions: [
      ...document.querySelectorAll(".manager-actions-buttons button"),
    ].map((el) => el.innerText.trim()),
    nextFixture: document.querySelector(".next-match-panel h2")?.innerText,
    historyRows: [
      ...document.querySelectorAll(".manager-history-panel tbody tr"),
    ].map((el) => el.innerText.replace(/\t/g, " | ")),
    trophies: document.querySelector(".trophy-case .live-tag")?.innerText,
    heroSub: document.querySelector(".manager-hero-text p")?.innerText,
  }));
  await page.screenshot({ path: "./tmp-season-end.png" });

  await page.locator(".manager-actions-buttons .button-primary").click();
  await page.waitForTimeout(1200);
  const newSeason = await page.evaluate(() => ({
    heroEyebrow: document.querySelector(".manager-hero .eyebrow")?.innerText,
    primaryAction: document
      .querySelector(".manager-actions-buttons .button-primary")
      ?.innerText.trim(),
    historyRows: document.querySelectorAll(".manager-history-panel tbody tr")
      .length,
    record: document.querySelectorAll(".manager-season-cell b")[1]?.innerText,
  }));

  // Mobile sanity after the season rollover.
  await page.setViewportSize({ width: 400, height: 860 });
  await page.waitForTimeout(300);
  const mobile = await page.evaluate(() => {
    const nav = document.querySelector(".sidebar-nav");
    const items = [...document.querySelectorAll(".sidebar-nav .nav-item")];
    const last = items.at(-1).getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      navScrolls: nav.scrollWidth > nav.clientWidth + 1,
      lastItemRight: Math.round(last.right),
      viewport: window.innerWidth,
      lastNavLabel: items.at(-1).getAttribute("aria-label"),
    };
  });
  await page.screenshot({ path: "./tmp-season-mobile.png" });

  return { seasonEnd, newSeason, mobile, errors };
}
