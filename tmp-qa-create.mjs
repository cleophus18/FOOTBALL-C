// QA: create a career, simulate a whole season, then read the trophy case and the
// World Cup / awards screens for the new UI.
export default async function run(page, ui) {
  const report = { steps: [] };

  // 1. Start a new game from the landing screen.
  let snap = await ui.snapshot();
  const start = snap.match(/@(e\d+) button "▶ START NEW GAME"/)?.[1];
  if (!start) return { error: "no start button", snap };
  await ui.click(start);
  await page.waitForTimeout(800);
  snap = await ui.snapshot();
  report.steps.push({ afterStart: snap.slice(0, 1200) });

  // Fill the creation form with the first club available and create the career.
  const values = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    return inputs.map((el) => ({ id: el.id, type: el.type, value: el.value }));
  });
  report.inputs = values;

  const first = await page.$("#creation-first");
  if (first) await first.fill("Test");
  const last = await page.$("#creation-last");
  if (last) await last.fill("Career");

  const selects = await page.evaluate(() =>
    [...document.querySelectorAll("select")].map((el) => ({
      id: el.id,
      value: el.value,
      options: [...el.options].slice(0, 4).map((o) => o.value),
    })),
  );
  report.selects = selects;

  const create = snap.match(
    /@(e\d+) button "[^"]*START YOUR CAREER[^"]*"/i,
  )?.[1];
  if (!create) return { error: "no create button", snap, report };
  await ui.click(create);
  await page.waitForTimeout(1500);
  report.steps.push({ afterCreate: (await ui.snapshot()).slice(0, 1500) });

  // The game is a module; drive it through the console via the app's own buttons.
  report.hubText = (await page.evaluate(() => document.body.innerText)).slice(
    0,
    800,
  );
  return report;
}
