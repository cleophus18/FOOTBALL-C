// Regression: a PLAYER career still starts, plays a week, and keeps its own inbox.
export default async function run(page, ui) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`PAGEERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`CONSOLE ${message.text()}`);
  });

  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });
  await page.getByRole("button", { name: /START NEW GAME/i }).click();
  await page.waitForTimeout(800);

  await page.waitForSelector(".creation-card form", { timeout: 15000 });
  await page.locator('input[name="first"]').fill("Testy");
  await page.locator('input[name="last"]').fill("McTestface");

  const fillSection = async () => {
    const fields = page.locator(
      ".creation-card form input:not([type=range]):not([type=hidden]), .creation-card form select",
    );
    const count = await fields.count();
    for (let i = 0; i < count; i += 1) {
      const field = fields.nth(i);
      const name = await field.getAttribute("name");
      if (!name) continue;
      const tag = await field.evaluate((el) => el.tagName);
      if (tag === "SELECT") {
        const options = await field.locator("option:not([disabled])").count();
        if (options > 1) await field.selectOption({ index: 1 }).catch(() => {});
      } else if (!(await field.inputValue().catch(() => ""))) {
        await field
          .fill(name.toLowerCase().includes("last") ? "McTestface" : "Testy")
          .catch(() => {});
      }
    }
  };

  for (let step = 0; step < 6; step += 1) {
    await fillSection();
    const next = page.locator('[data-creation-step="next"]');
    if (await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(600);
  }
  await fillSection();
  await page.locator('button[type="submit"]').first().click();
  await page.waitForSelector(".game-shell", { timeout: 25000 });
  await page.waitForTimeout(1200);

  const onCareer = await page.evaluate(() => ({
    inGame: !!document.querySelector(".game-shell"),
    navCount: document.querySelectorAll(".sidebar-nav .nav-item").length,
    hasPlayerHub: !!document.querySelector('.nav-item[data-screen="player"]'),
    hasManagerHub: !!document.querySelector('.nav-item[data-screen="manager"]'),
    heading: document.querySelector(".page-heading h1")?.innerText,
  }));

  if (onCareer.inGame) {
    await page.locator('.nav-item[data-screen="overview"]').click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /^Advance one week/i }).click();
    await page.waitForTimeout(1500);
  }

  const afterWeek = await page.evaluate(() => ({
    toast: document.querySelector(".toast")?.innerText?.slice(0, 160),
    news: [...document.querySelectorAll(".news-item")]
      .slice(0, 3)
      .map((el) => el.innerText.trim()),
    mentionsPlaceholder: [...document.querySelectorAll(".news-item")].some(
      (el) => el.innerText.includes("Academy"),
    ),
  }));

  return { onCareer, afterWeek, errors };
}
