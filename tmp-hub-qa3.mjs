// Final QA: desktop hub, scrolled (sticky), mobile hub, and the sacked state.
export default async function run(page, ui) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`CONSOLE ${message.text()}`);
  });

  const startCareer = async () => {
    await page.goto("http://127.0.0.1:4173/");
    await page.waitForSelector(".menu-shell", { timeout: 20000 });
    await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
    await page.waitForSelector("#manager-form", { timeout: 10000 });
    await page.locator('select[name="leagueId"]').selectOption({ index: 1 });
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /Take charge/i }).click();
    await page.waitForSelector(".manager-hub", { timeout: 20000 });
  };

  await startCareer();
  for (let i = 0; i < 6; i += 1) {
    await page
      .locator('.manager-actions button[data-action="simulate-week"]')
      .click();
    await page.waitForTimeout(420);
  }

  const desktop = await page.evaluate(() => ({
    sidebarLeague: document.querySelector(".club-mini small")?.innerText,
    inbox: [...document.querySelectorAll(".manager-hub-side .news-item")].map(
      (el) => el.innerText.trim(),
    ),
    form: [...document.querySelectorAll(".manager-form-badge")].map(
      (el) => el.title,
    ),
  }));
  await page.screenshot({ path: "./tmp-final-desktop.png" });

  await page.setViewportSize({ width: 420, height: 900 });
  await page.waitForTimeout(400);
  const mobile = await page.evaluate(() => {
    const hub = document.querySelector(".manager-hub");
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      layoutCols: getComputedStyle(
        document.querySelector(".manager-hub-layout"),
      ).gridTemplateColumns,
      stickyIsStatic: getComputedStyle(
        document.querySelector(".manager-sticky"),
      ).position,
      seasonCols: getComputedStyle(
        document.querySelector(".manager-season-grid"),
      ).gridTemplateColumns,
      heroOverflow: hub.scrollWidth > hub.clientWidth + 1,
    };
  });
  await page.screenshot({ path: "./tmp-final-mobile.png", fullPage: false });

  // The sacked state: save, flip the saved board state, then load it back in.
  await page.setViewportSize({ width: 1440, height: 1040 });
  await startCareer();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const key = "touchline-career-slot-1";
    const saved = JSON.parse(localStorage.getItem(key));
    saved.managerState.sacked = true;
    saved.managerState.boardConfidence = 0;
    saved.managerState.sackedMessage =
      "The board has dismissed you after a run of seven defeats left the club in the relegation places.";
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.waitForTimeout(500);
  const sacked = await page.evaluate(() => ({
    status: document.querySelector(".manager-fact-status b")?.innerText,
    badge: document.querySelector(".manager-board-panel .live-tag")?.innerText,
    note: document.querySelectorAll(
      ".manager-board-panel .manager-panel-note",
    )[1]?.innerText,
    actions: [
      ...document.querySelectorAll(".manager-actions-buttons button"),
    ].map((el) => el.innerText.trim()),
  }));
  await page.screenshot({ path: "./tmp-final-sacked.png" });

  return { desktop, mobile, sacked, errors };
}
