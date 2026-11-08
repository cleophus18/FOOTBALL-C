// Capture the stack behind the next-season TypeError by tagging every TypeError created.
export default async function run(page, ui) {
  await page.addInitScript(() => {
    window.__stacks = [];
    const RealError = Error;
    class TracedError extends RealError {
      constructor(...args) {
        super(...args);
        if (this.message.includes("reading 'status'")) {
          window.__stacks.push(this.stack);
        }
      }
    }
    Object.setPrototypeOf(TracedError, RealError);
    window.Error = TracedError;
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
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(500);
    const done = await page.evaluate(
      () =>
        !!document
          .querySelector(".manager-actions-buttons .button-primary")
          ?.innerText.includes("Start "),
    );
    if (done) break;
  }
  await page.locator(".manager-actions-buttons .button-primary").click();
  await page.waitForTimeout(1500);
  return page.evaluate(() => ({
    toast: document.querySelector(".toast")?.innerText,
    stacks: window.__stacks,
  }));
}
