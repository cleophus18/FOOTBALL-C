// QA: create a career, play a season, then read the trophy case, awards and World Cup UI.
export default async function run(page, ui) {
  const report = {};
  let snap = await ui.snapshot();
  const start = snap.match(/@(e\d+) button "▶ START NEW GAME"/)?.[1];
  if (!start) return { error: "no start button", snap };
  await ui.click(start);
  await page.waitForTimeout(800);

  const textInputs = page.locator("#creation-panel-details input[type=text]");
  await textInputs.nth(0).fill("Test");
  await textInputs.nth(1).fill("Career");
  await page.waitForTimeout(600);

  const nav = async (label) => {
    const s = await ui.snapshot();
    const m = s.match(new RegExp(`@(e\\d+) button "${label}"`));
    if (!m) return false;
    await ui.click(m[1]);
    await page.waitForTimeout(600);
    return true;
  };

  for (let i = 0; i < 4; i++) await nav("Next →");

  // Make sure a club and role are chosen in the career section.
  const setup = await page.evaluate(() => {
    const selects = [
      ...document.querySelectorAll("#creation-panel-career select"),
    ];
    for (const select of selects) {
      if (select.value) continue;
      const option = [...select.options].find((o) => o.value);
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    return selects.map((s) => s.value);
  });
  report.setup = setup;
  await page.waitForTimeout(800);

  snap = await ui.snapshot();
  const go = snap.match(/@(e\d+) button "Start your career\s*→"/)?.[1];
  if (!go) return { error: "no start-your-career", snap, report };
  await ui.click(go);
  await page.waitForTimeout(5000);
  report.hub = (await page.evaluate(() => document.body.innerText)).slice(
    0,
    2500,
  );
  await page.screenshot({ path: "tmp-hub.png" });
  return report;
}
