// QA: capture console errors during the full creation flow.
export default async function run(page, ui) {
  const logs = [];
  page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) =>
    logs.push(`pageerror: ${err.message}\n${err.stack}`),
  );

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
  const submitted = await page.evaluate(() => {
    const form = document.querySelector("#creation-form");
    if (!form) return "no form";
    const submit = form.querySelector('button[type="submit"]');
    submit.click();
    return "clicked";
  });
  await page.waitForTimeout(2500);

  return {
    submitted,
    logs,
    hasCareer: await page.evaluate(() => !!window.__career),
    keys: await page.evaluate(() =>
      Object.keys(window).filter((k) => k.startsWith("__")),
    ),
    heading: await page.evaluate(() =>
      document.querySelector("h1")?.textContent?.trim(),
    ),
  };
}
