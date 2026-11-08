export default async function run(page) {
  await page.getByText(/START NEW GAME/).click();
  await page.waitForSelector("#creation-form", { timeout: 15000 });
  const out = {};
  for (const key of ["body", "attributes", "career"]) {
    await page.click(`[data-creation-tab="${key}"]`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `./qa-creation-${key}.png`, fullPage: true });
    out[key] = await page.$eval(".creation-panel.active", (el) =>
      el.innerText.slice(0, 400),
    );
  }
  return out;
}
