// QA: create a career, play a season, then read the trophy case, awards and World Cup UI.
export default async function run(page, ui) {
  const report = { steps: [] };
  let snap = await ui.snapshot();
  const start = snap.match(/@(e\d+) button "▶ START NEW GAME"/)?.[1];
  if (!start) return { error: "no start button", snap };
  await ui.click(start);
  await page.waitForTimeout(600);
  // Walk the four creation sections, then submit.
  for (let i = 0; i < 4; i++) {
    const s = await ui.snapshot();
    const next = s.match(/@(e\d+) button "Next →"/)?.[1];
    if (!next) break;
    await ui.click(next);
    await page.waitForTimeout(500);
  }
  snap = await ui.snapshot();
  const go = snap.match(/@(e\d+) button "Start your career →"/)?.[1];
  if (!go) return { error: "no start-your-career", snap, report };
  await ui.click(go);
  await page.waitForTimeout(3000);
  report.hub = (await page.evaluate(() => document.body.innerText)).slice(
    0,
    2000,
  );
  await page.screenshot({ path: "tmp-hub.png", fullPage: false });
  return report;
}
