// Full-page mobile render of the manager hub, scrolled to the lower panels.
export default async function run(page, ui) {
  await page.setViewportSize({ width: 460, height: 1100 });
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });
  await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
  await page.waitForSelector("#manager-form", { timeout: 10000 });
  await page.locator('select[name="leagueId"]').selectOption({ index: 1 });
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Take charge/i }).click();
  await page.waitForSelector(".manager-hub", { timeout: 20000 });
  for (let i = 0; i < 5; i += 1) {
    await page
      .locator('.manager-actions button[data-action="simulate-week"]')
      .click();
    await page.waitForTimeout(400);
  }
  const squad = await page.$(".manager-squad-stats");
  await squad.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: "./tmp-mobile-lower.png" });
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    lineupCols: getComputedStyle(document.querySelector(".manager-lineup"))
      .gridTemplateColumns,
    squadCols: getComputedStyle(document.querySelector(".manager-squad-stats"))
      .gridTemplateColumns,
  }));
}
