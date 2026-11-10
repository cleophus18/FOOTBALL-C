export default async function run(page, ui) {
  await page.waitForLoadState("domcontentloaded");
  const before = await ui.snapshot({ full: true });
  const trainingRoute = await page.evaluate(() => ({
    title: document.title,
    appMounted: !!document.querySelector("#app"),
    trainingNavigation: !!document.querySelector('[data-screen="training"]'),
    errors: [],
  }));
  await page.screenshot({ path: "training-dashboard-qa.png", fullPage: true });
  return {
    before: before.slice(0, 1800),
    trainingRoute,
    bodyText: (await page.locator("body").innerText()).slice(0, 1200),
  };
}
