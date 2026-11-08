// Temporary QA: verifies the new features — vertical pitch, Stats tab replacing
// Top performers, removed Teammates tab, live player on-pitch status during sim,
// and the fixture-driven schedule with tournament bracket.
export default async function run(page) {
  const out = { checks: {}, issues: [] };

  await page.fill('input[name="first"]', "QA");
  await page.fill('input[name="last"]', "Tester");
  await page.getByRole("button", { name: /Start your career/ }).click();
  await page.waitForSelector("nav [data-screen]", { timeout: 15000 });

  // Nav: Stats present, Top performers and Teammates gone.
  const navLabels = await page.evaluate(() =>
    [...document.querySelectorAll("nav [data-screen]")].map(
      (b) => b.dataset.screen,
    ),
  );
  out.checks.nav = navLabels;
  if (navLabels.includes("teammates"))
    out.issues.push("Teammates tab still in nav");
  if (navLabels.includes("performers"))
    out.issues.push("Top performers tab still in nav");
  if (!navLabels.includes("stats"))
    out.issues.push("Stats tab missing from nav");

  // Squad: vertical pitch with slots.
  await page.locator('[data-screen="squad"]').first().click();
  await page.waitForTimeout(250);
  out.checks.pitch = await page.evaluate(() => {
    const slots = [...document.querySelectorAll(".pitch-slot")];
    return {
      slotCount: slots.length,
      hasBadges: slots.every((s) => !!s.querySelector(".pitch-badge")),
      badges: slots.map((s) => s.querySelector(".pitch-badge")?.textContent),
      firstStyle: slots[0]?.getAttribute("style"),
    };
  });
  if (out.checks.pitch.slotCount !== 11)
    out.issues.push(
      `pitch has ${out.checks.pitch.slotCount} slots, expected 11`,
    );

  // Stats tab: table with goals/assists/yellow/red columns.
  await page.locator('[data-screen="stats"]').first().click();
  await page.waitForTimeout(300);
  out.checks.stats = await page.evaluate(() => {
    const table = document.querySelector(".stats-table");
    if (!table) return null;
    return {
      headers: [...table.querySelectorAll("thead th")].map((th) =>
        th.textContent.trim(),
      ),
      rowCount: table.querySelectorAll("tbody tr").length,
    };
  });
  if (!out.checks.stats) out.issues.push("stats-table not found");
  else {
    const need = ["GLS", "AST", "YC", "RC"];
    for (const col of need)
      if (!out.checks.stats.headers.includes(col))
        out.issues.push(`stats table missing ${col}`);
  }

  // Fixtures: UP NEXT tag present on the next unplayed fixture.
  await page.locator('[data-screen="fixtures"]').first().click();
  await page.waitForTimeout(250);
  out.checks.fixtures = await page.evaluate(() => ({
    rows: document.querySelectorAll(".fixture-row").length,
    nextTag: !!document.querySelector(".next-tag"),
    nextRow:
      document
        .querySelector(".fixture-row.next")
        ?.textContent?.trim()
        .slice(0, 80) ?? null,
  }));
  if (!out.checks.fixtures.nextTag)
    out.issues.push("no UP NEXT fixture marked");

  // Tournaments: bracket renders for the Champions League.
  await page.locator('[data-screen="tournaments"]').first().click();
  await page.waitForTimeout(250);
  out.checks.tournaments = await page.evaluate(() => ({
    panels: document.querySelectorAll(".tournament-panel").length,
    groupTables: document.querySelectorAll(".tournament-group-table").length,
  }));

  // Match sim: start a match and confirm the player on-pitch status strip exists.
  await page.locator('[data-screen="overview"]').first().click();
  await page.waitForTimeout(150);
  const next = page.locator('[data-action="next-match"]');
  if (await next.count()) await next.first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-screen="simulation"]').first().click();
  await page.waitForTimeout(200);
  out.checks.simBefore = await page.evaluate(() => {
    const strip = document.querySelector("#player-pitch-status");
    return {
      text: strip?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      cls: strip?.className ?? null,
    };
  });
  const start = page.locator('[data-action="start-simulation"]');
  if (await start.count()) await start.first().click();
  // Run the clock and resolve moments; capture any entrance announcement.
  let entrance = null;
  for (let i = 0; i < 260; i += 1) {
    const decision = page.locator('[data-action="moment-decision"]');
    if (await decision.count()) await decision.first().click();
    const seen = await page.evaluate(
      () =>
        document.querySelector("#live-situation")?.textContent?.trim() ?? "",
    );
    if (/enters the pitch/i.test(seen)) entrance = seen;
    const done = await page.locator('[data-action="back-to-career"]').count();
    if (done) break;
    await page.waitForTimeout(100);
  }
  out.checks.simAfter = await page.evaluate(() => {
    const strip = document.querySelector("#player-pitch-status");
    return {
      text: strip?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      cls: strip?.className ?? null,
      timelineEntry: !!document.querySelector(".timeline-event.event-entry"),
    };
  });
  out.checks.entranceAnnounced = entrance;

  return out;
}
