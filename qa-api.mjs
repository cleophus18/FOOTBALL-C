// QA: start a career, then call the career API directly from the page to check that
// honours, grouping and the injury/form rules behave. The UI is verified separately.
export default async function run(page, ui) {
  const clickLabel = async (label) => {
    await page.evaluate((text) => {
      const target = [...document.querySelectorAll("button, a")].find(
        (el) => el.textContent.replace(/\s+/g, " ").trim() === text,
      );
      target?.click();
    }, label);
    await page.waitForTimeout(700);
  };

  await clickLabel("▶ START NEW GAME");
  await page.evaluate(() => {
    const set = (name, value) => {
      const el = document.querySelector(`[name="${name}"]`);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set("first", "QA");
    set("last", "Tester");
  });
  for (let step = 0; step < 4; step++) {
    const hasNext = await page.evaluate(() => {
      const next = document.querySelector('[data-creation-step="next"]');
      return !!next && !next.disabled;
    });
    if (!hasNext) break;
    await page.evaluate(() =>
      document.querySelector('[data-creation-step="next"]').click(),
    );
    await page.waitForTimeout(500);
  }
  await page.evaluate(() =>
    document.querySelector('#creation-form button[type="submit"]').click(),
  );
  await page.waitForTimeout(2500);

  // Inspect the trophy case via the DOM, and the career API via the module graph.
  const dom = await page.evaluate(() => {
    const panel = document.querySelector("#player-trophies");
    return {
      heading: document.querySelector("h1")?.textContent?.trim(),
      trophyPanel: panel?.innerText.slice(0, 400) ?? null,
      statusFields: [
        ...document.querySelectorAll(".profile-details small"),
      ].map((el) => el.textContent.trim()),
    };
  });

  const api = await page.evaluate(async () => {
    const mod = await import("/src/career.mjs");
    return {
      exports: Object.keys(mod).slice(0, 10),
      formModule: Object.keys(await import("/src/model/form.mjs")),
      injuryModule: Object.keys(await import("/src/sim/injury.mjs")),
      honoursModule: Object.keys(await import("/src/model/honours.mjs")),
    };
  });

  return { dom, api };
}
