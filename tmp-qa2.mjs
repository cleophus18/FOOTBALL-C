// QA: create a career, play a season, then read the trophy case, awards and World Cup UI.
export default async function run(page, ui) {
  const report = { steps: [] };
  let snap = await ui.snapshot();
  const start = snap.match(/@(e\d+) button "▶ START NEW GAME"/)?.[1];
  if (!start) return { error: "no start button", snap };
  await ui.click(start);
  await page.waitForTimeout(600);
  snap = await ui.snapshot();
  const go = snap.match(/@(e\d+) button "Start your career →"/)?.[1];
  if (!go) return { error: "no start-your-career", snap };
  await ui.click(go);
  await page.waitForTimeout(2500);
  report.hub = (await page.evaluate(() => document.body.innerText)).slice(
    0,
    1500,
  );
  return report;
}
