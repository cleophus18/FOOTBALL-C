// QA: create a career, play a season, then read the trophy case, awards and World Cup UI.
export default async function run(page, ui) {
  const report = { steps: [] };
  let snap = await ui.snapshot();
  const start = snap.match(/@(e\d+) button "▶ START NEW GAME"/)?.[1];
  if (!start) return { error: "no start button", snap };
  await ui.click(start);
  await page.waitForTimeout(800);

  // Fill the identity fields the first section requires.
  const filled = await page.evaluate(() => {
    const set = (el, value) => {
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    const text = [
      ...document.querySelectorAll("#creation-panel-identity input"),
    ];
    return {
      inputs: text.map((el) => el.id),
      setFirst: text[0] ? set(text[0], "Test") : false,
      setLast: text[1] ? set(text[1], "Career") : false,
    };
  });
  report.filled = filled;
  await page.waitForTimeout(500);

  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll("[data-creation-tab]")].map(
      (el) => el.dataset.creationTab,
    ),
  );
  report.tabs = tabs;
  for (const tab of tabs.slice(1)) {
    await page.evaluate((key) => {
      document
        .querySelector(`[data-creation-tab="${key}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, tab);
    await page.waitForTimeout(400);
  }
  snap = await ui.snapshot();
  const go = snap.match(/@(e\d+) button "Start your career →"/)?.[1];
  if (!go) return { error: "no start-your-career", snap, report };
  await ui.click(go);
  await page.waitForTimeout(3500);
  report.hub = (await page.evaluate(() => document.body.innerText)).slice(
    0,
    2000,
  );
  await page.screenshot({ path: "tmp-hub.png", fullPage: false });
  return report;
}
