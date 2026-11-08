/**
 * Verify the deployed game on the public Firebase Hosting URL.
 *
 * Creates a career, opens the World tab, and reads back the Legends panel and a
 * sample of a La Liga club's roster to confirm the live build generates the world.
 */
export default async function run(page, ui) {
  await page.waitForSelector('input[name="first"]', { timeout: 30000 });
  await page.fill('input[name="first"]', "QA");
  await page.fill('input[name="last"]', "Tester");
  await page.getByRole("button", { name: /Start your career/ }).click();
  await page.waitForSelector("nav [data-screen]", { timeout: 30000 });
  await page.locator('[data-screen="world"]').first().click();
  await page.waitForTimeout(1500);

  // Select a La Liga club to confirm the roster table renders for a generated squad.
  await page.selectOption("#world-league", "La Liga");
  await page.waitForSelector("#world-club", { timeout: 30000 });
  await page.selectOption("#world-club", { index: 0 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => ({
    title: document.title,
    navScreens: document.querySelectorAll("nav [data-screen]").length,
    leagues: [...document.querySelectorAll("#world-league option")].map(
      (o) => o.value,
    ),
    legends: [...document.querySelectorAll(".legend-card")].map((c) =>
      c.textContent.replace(/\s+/g, " ").trim(),
    ),
    worldNameSample: [
      ...document.querySelectorAll(".world-roster-table tbody tr"),
    ]
      .slice(0, 8)
      .map((r) =>
        r.querySelector("td")?.textContent?.replace(/\s+/g, " ").trim(),
      ),
  }));

  return result;
}
