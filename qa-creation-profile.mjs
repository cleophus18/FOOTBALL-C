export default async function run(page) {
  await page.getByText(/START NEW GAME/).click();
  await page.waitForSelector("#creation-form", { timeout: 15000 });

  await page.fill('[name="first"]', "Kylian");
  await page.fill('[name="last"]', "Diop");
  await page.selectOption('[name="birthYear"]', "2009");
  await page.selectOption('[name="birthMonth"]', "7");
  await page.selectOption('[name="birthDay"]', "12");
  await page.selectOption('[name="nationality"]', "FRA");
  await page.click('[data-creation-tab="body"]');
  await page.fill('[name="height"]', "192");
  await page.fill('[name="weight"]', "86");
  await page.click('[data-creation-tab="attributes"]');
  await page.selectOption('[name="weakFoot"]', "4");
  await page.selectOption('[name="skillMoves"]', "5");
  await page.locator('[data-creation-attr="pace"]').evaluate((el) => {
    el.value = "90";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click('[data-creation-tab="career"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector(".sidebar, .topbar", { timeout: 20000 });

  await page.click('.nav-item[data-screen="player"]');
  await page.waitForTimeout(600);
  const text = await page.evaluate(() => document.body.innerText);
  const details = await page
    .$eval(".profile-details", (el) => el.innerText)
    .catch(() => "no profile");
  await page.screenshot({ path: "./qa-creation-profile.png", fullPage: true });
  return { details, paceShown: /PACE\s*90/i.test(text) };
}
