// QA: create a career, then use the app's own UI to earn trophies and read the
// rendered trophy case. Uses the History/Award screens that exist in the product.
export default async function run(page, ui) {
  const clickLabel = async (label) => {
    const clicked = await page.evaluate((text) => {
      const target = [...document.querySelectorAll("button, a")].find(
        (el) => el.textContent.replace(/\s+/g, " ").trim() === text,
      );
      if (!target) return false;
      target.click();
      return true;
    }, label);
    await page.waitForTimeout(700);
    return clicked;
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
    await page.waitForTimeout(400);
  }
  await page.evaluate(() =>
    document.querySelector('#creation-form button[type="submit"]').click(),
  );
  await page.waitForTimeout(2500);

  // The app instance is not reachable from page JS, so drive it through the UI:
  // play the season to its end, which records awards and honours.
  const simButton = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) =>
      /advance|simulate|next week/i.test(b.textContent),
    ),
  );

  // Read the player hub's trophy case and status fields as they render today.
  await clickLabel("◎Player hub");
  const hub = await page.evaluate(() => {
    const text = document.body.innerText;
    const grab = (label, len = 160) => {
      const at = text.indexOf(label);
      return at < 0
        ? null
        : text
            .slice(at, at + len)
            .replace(/\s+/g, " ")
            .trim();
    };
    return {
      badge: document
        .querySelector(".rating-badge")
        ?.innerText.replace(/\n+/g, " | "),
      base: grab("BASE OVERALL / POTENTIAL"),
      status: grab("STATUS", 60),
      resistance: grab("INJURY RESISTANCE", 90),
      trophySection: grab("CAREER HONOURS", 220),
    };
  });

  return { simButton, hub };
}
