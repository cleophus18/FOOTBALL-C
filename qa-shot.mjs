export default async function run(page) {
  await page.fill('input[name="first"]', "QA");
  await page.fill('input[name="last"]', "Tester");
  await page.getByRole("button", { name: /Start your career/ }).click();
  await page.waitForSelector("nav [data-screen]", { timeout: 15000 });
  await page.locator('[data-screen="overview"]').first().click();
  await page.waitForTimeout(150);
  const next = page.locator('[data-action="next-match"]');
  if (await next.count()) await next.first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-screen="simulation"]').first().click();
  await page.waitForSelector(".match-formations", { timeout: 5000 });
  await page.waitForTimeout(400);
  await page
    .locator(".match-formations")
    .screenshot({ path: "qa-match-formations.png" });
  return { ok: true };
}
