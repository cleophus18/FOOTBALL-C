// QA: create a career, then inspect the screens that changed:
// player hub (form OVR + injury status + grouped trophy case), awards, World Cup scorers.
export default async function run(page, ui) {
  const result = { steps: [] };

  const clickLabel = async (label, { prefix = false } = {}) => {
    const clicked = await page.evaluate(
      ([text, usePrefix]) => {
        const target = [...document.querySelectorAll("button, a")].find(
          (el) => {
            const label = el.textContent.replace(/\s+/g, " ").trim();
            return usePrefix ? label.startsWith(text) : label === text;
          },
        );
        if (!target) return false;
        target.click();
        return true;
      },
      [label, prefix],
    );
    if (!clicked) throw new Error(`missing button: ${label}`);
    await page.waitForTimeout(700);
    result.steps.push(`clicked ${label}`);
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
    const hasNext = await page.evaluate(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.replace(/\s+/g, " ").trim() === "Next →",
      ),
    );
    if (!hasNext) break;
    await clickLabel("Next →");
  }
  await clickLabel("Start your career →");
  await page.waitForTimeout(2000);

  // Player hub — form OVR, injury status, trophy case.
  await clickLabel("◎Player hub");
  // Give the player a few trophies across seasons so the grouped trophy case has
  // something to group. This drives the real engine, not a mock.
  await page.evaluate(() => {
    const career = window.__career;
    if (!career) return false;
    career.player.honours = [];
    for (const season of [2026, 2027, 2028]) {
      career.recordPlayerHonour(career.player, {
        award: "Premier League Champion",
        season,
        competition: "Premier League",
        value: "Champion",
      });
    }
    for (const season of [2026, 2028]) {
      career.recordPlayerHonour(career.player, {
        award: "Golden Boot",
        season,
        competition: "Premier League",
        value: "31 league goals",
      });
    }
    return true;
  });
  await page.evaluate(() => window.__renderGame?.());
  await page.waitForTimeout(600);
  result.playerHub = await page.evaluate(() => {
    const text = document.body.innerText;
    const section = (start, end) => {
      const from = text.indexOf(start);
      if (from < 0) return null;
      const to = end ? text.indexOf(end, from + start.length) : from + 1200;
      return text.slice(from, to < 0 ? from + 1200 : to);
    };
    return {
      heading: document.querySelector(".page-heading h1")?.textContent?.trim(),
      badge: document.querySelector(".rating-badge")?.innerText,
      baseAndPotential: section("BASE OVERALL / POTENTIAL", "STATUS"),
      status: section("STATUS", "INJURY RESISTANCE"),
      resistance: section("INJURY RESISTANCE", "CONTRACT"),
      trophyCase: section("Trophy case", "PLAYER HISTORY"),
      trophyCards: document.querySelectorAll("#player-trophies .trophy-card")
        .length,
      trophyCounts: [
        ...document.querySelectorAll("#player-trophies .trophy-count"),
      ].map((el) => el.textContent),
    };
  });
  await page.screenshot({ path: "qa-trophy-case.png", fullPage: false });

  // Training screen — base vs form overall.
  await clickLabel("↗Training");
  result.training = await page.evaluate(() => {
    const text = document.body.innerText;
    const from = text.indexOf("Base overall");
    return from < 0 ? text.slice(0, 600) : text.slice(from - 40, from + 500);
  });

  // Tournaments — the World Cup scorer board.
  await clickLabel("♜Tournaments");
  result.tournaments = await page.evaluate(() => ({
    body: document.body.innerText.slice(0, 500),
    hasWorldCupScorers: !!document.querySelector(".world-cup-scorers"),
  }));

  return result;
}
