// QA part 2: mid-season hub, scrolled (sticky header), then the sacked state.
export default async function run(page, ui) {
  const log = [];
  page.on("pageerror", (error) => log.push(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") log.push(`CONSOLE ${message.text()}`);
  });

  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });
  await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
  await page.waitForSelector("#manager-form", { timeout: 10000 });
  await page.fill('input[name="first"]', "Jesse");
  await page.fill('input[name="last"]', "March");
  // A lower-league club, to see the 'avoid relegation' band and a long fixture list.
  await page.locator('select[name="leagueId"]').selectOption({ index: 1 });
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /Take charge/i }).click();
  await page.waitForSelector(".manager-hub", { timeout: 20000 });

  for (let i = 0; i < 8; i += 1) {
    await page
      .locator('.manager-actions button[data-action="simulate-week"]')
      .click();
    await page.waitForTimeout(450);
  }

  const midSeason = await page.evaluate(() => ({
    heading: document.querySelector(".manager-hero h1")?.innerText,
    sub: document.querySelector(".manager-hero-text p")?.innerText,
    target: document.querySelectorAll(".manager-fact b")[1]?.innerText,
    form: [...document.querySelectorAll(".manager-form-badge")].map(
      (el) => el.title,
    ),
    board: document
      .querySelector(".manager-board-score")
      ?.innerText.replace(/\n/g, " | "),
    fixtureHeight: document.querySelector(".next-match-panel .fixture-preview")
      ?.offsetHeight,
  }));

  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(300);
  const sticky = await page.evaluate(() => {
    const hero = document
      .querySelector(".manager-hero")
      .getBoundingClientRect();
    const bar = document
      .querySelector(".manager-actions")
      .getBoundingClientRect();
    return {
      scrollY: Math.round(window.scrollY),
      heroTop: Math.round(hero.top),
      actionsTop: Math.round(bar.top),
      actionsVisible: bar.top >= 0 && bar.bottom <= window.innerHeight,
    };
  });
  await page.screenshot({ path: "./tmp-hub-scrolled.png" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: "./tmp-hub-mid.png" });

  // Force the sacked state through the live career so the dismissal styling is exercised.
  await page.evaluate(() => {
    const hub = document.querySelector(".manager-hub");
    hub.classList.add("is-sacked");
  });

  return { midSeason, sticky, errors: log };
}
