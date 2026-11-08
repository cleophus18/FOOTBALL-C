/**
 * La Liga world-generation check for the deployed build.
 *
 * Both legends live in La Liga, so this selects La Liga in the World tab and reads
 * back the Legends panel plus a sample of a La Liga club's generated roster to
 * confirm nationality-aware name generation works on the live site.
 */
export default async function run(page, ui) {
  await page.waitForSelector('input[name="first"]', { timeout: 30000 });
  await page.fill('input[name="first"]', "QA");
  await page.fill('input[name="last"]', "Tester");
  await page.getByRole("button", { name: /Start your career/ }).click();
  await page.waitForSelector("nav [data-screen]", { timeout: 30000 });
  await page.locator('[data-screen="world"]').first().click();
  await page.waitForSelector("#world-league", { timeout: 30000 });

  await page.selectOption("#world-league", "La Liga");
  await page.waitForTimeout(800);
  await page.selectOption("#world-club", { index: 0 });
  await page.waitForTimeout(800);

  const legends = await page.evaluate(() =>
    [...document.querySelectorAll(".legend-card")].map((c) =>
      c.textContent.replace(/\s+/g, " ").trim(),
    ),
  );
  const worldNames = await page.evaluate(() =>
    [...document.querySelectorAll(".world-roster-table tbody tr")]
      .slice(0, 8)
      .map((r) =>
        r.querySelector("td")?.textContent?.replace(/\s+/g, " ").trim(),
      ),
  );
  const selected = await page.evaluate(() => ({
    league: document.querySelector("#world-league")?.value,
    club: document.querySelector("#world-club")?.value,
  }));

  return { selected, legends, worldNameSample: worldNames };
}
