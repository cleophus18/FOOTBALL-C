// QA: create a career, play a season, then read the trophy case, awards and World Cup UI.
export default async function run(page, ui) {
  const report = {};
  let snap = await ui.snapshot();
  const start = snap.match(/@(e\d+) button "▶ START NEW GAME"/)?.[1];
  if (!start) return { error: "no start button", snap };
  await ui.click(start);
  await page.waitForTimeout(800);

  const identity = await page.evaluate(() => {
    const panel = document.querySelector("#creation-panel-details");
    const inputs = [...panel.querySelectorAll("input")];
    const set = (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const text = inputs.filter((el) => el.type === "text" || !el.type);
    if (text[0]) set(text[0], "Test");
    if (text[1]) set(text[1], "Career");
    return { ids: inputs.map((el) => `${el.id}:${el.type}`) };
  });
  report.identity = identity;
  await page.waitForTimeout(600);

  for (const tab of ["body", "attributes", "career"]) {
    await page.evaluate((key) => {
      document
        .querySelector(`[data-creation-tab="${key}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, tab);
    await page.waitForTimeout(500);
  }

  // Choose a club in the career section so the form is valid.
  const clubs = await page.evaluate(() => {
    const panel = document.querySelector("#creation-panel-career");
    const options = [...panel.querySelectorAll("button[data-club]")]
      .slice(0, 3)
      .map((b) => b.dataset.club);
    const selects = [...panel.querySelectorAll("select")].map(
      (s) => `${s.id}=${s.value}`,
    );
    return { options, selects };
  });
  report.clubs = clubs;

  snap = await ui.snapshot();
  const go = snap.match(/@(e\d+) button "Start your career\s*→"/)?.[1];
  if (!go) return { error: "no start-your-career", snap, report };
  await ui.click(go);
  await page.waitForTimeout(4000);
  report.hub = (await page.evaluate(() => document.body.innerText)).slice(
    0,
    2000,
  );
  await page.screenshot({ path: "tmp-hub.png", fullPage: false });
  return report;
}
