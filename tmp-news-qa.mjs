// What does the manager career actually push into news?
export default async function run(page, ui) {
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });
  await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
  await page.waitForSelector("#manager-form", { timeout: 10000 });
  await page.getByRole("button", { name: /Take charge/i }).click();
  await page.waitForSelector(".manager-hub", { timeout: 20000 });
  for (let i = 0; i < 4; i += 1) {
    await page
      .locator('.manager-actions button[data-action="simulate-week"]')
      .click();
    await page.waitForTimeout(500);
  }
  return page.evaluate(() =>
    [...document.querySelectorAll(".manager-hub-side .news-item")].map((el) =>
      el.innerText.trim(),
    ),
  );
}
