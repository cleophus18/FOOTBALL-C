export default async function run(page) {
  await page.waitForSelector(".menu-football", { timeout: 15000 });
  // Sample the ball's transform across frames to prove it is being simulated.
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(90);
    samples.push(await page.$eval(".football", (el) => el.style.transform));
  }
  await page.screenshot({ path: "./qa-menu-ball.png" });

  await page.getByText(/START NEW GAME/).click();
  await page.waitForSelector("#creation-form", { timeout: 15000 });

  const locked = await page.$$eval(".creation-tab.locked", (els) => els.length);
  const submitVisible = await page.$eval('button[type="submit"]', (el) =>
    el.getAttribute("aria-hidden"),
  );

  // Try to jump straight to the last section: it must refuse.
  await page.click('[data-creation-tab="career"]');
  await page.waitForTimeout(150);
  const afterJump = await page.$eval(
    ".creation-panel.active",
    (el) => el.dataset.panel,
  );
  const noticeText = await page
    .$eval(".creation-notice", (el) => el.textContent)
    .catch(() => "");

  // Enter in the name box must not start a career either.
  await page.fill('[name="first"]', "Kylian");
  await page.press('[name="first"]', "Enter");
  await page.waitForTimeout(300);
  const stillOnForm = await page.$("#creation-form");

  // Walk Next through all four sections, then start.
  for (let i = 0; i < 3; i++) {
    await page.click('[data-creation-step="next"]');
    await page.waitForTimeout(150);
  }
  await page.fill('[name="first"]', "Kylian");
  await page.fill('[name="last"]', "Diop");
  const lastPanel = await page.$eval(
    ".creation-panel.active",
    (el) => el.dataset.panel,
  );
  await page.click('[data-creation-tab="body"]');
  await page.waitForTimeout(150);
  const bodyPreview = await page.$eval(
    ".creation-physique-grid",
    (el) => el.innerText,
  );
  await page.fill('[name="weight"]', "98");
  await page.waitForTimeout(250);
  const heavyPreview = await page.$eval(
    ".creation-physique-grid",
    (el) => el.innerText,
  );
  await page.screenshot({ path: "./qa-body-physique.png", fullPage: true });

  await page.click('[data-creation-tab="career"]');
  await page.waitForTimeout(150);
  await page.click('button[type="submit"]');
  await page.waitForSelector(".sidebar, .topbar", { timeout: 20000 });
  await page.click('.nav-item[data-screen="player"]');
  await page.waitForTimeout(600);
  const profile = await page
    .$eval(".profile-details", (el) => el.innerText)
    .catch(() => "no profile");

  return {
    ballMoved: new Set(samples).size > 6,
    sample: samples[0],
    lockedTabs: locked,
    submitHiddenEarly: submitVisible,
    jumpBlocked: afterJump,
    noticeText,
    stillOnForm: !!stillOnForm,
    lastPanel,
    bodyPreview,
    heavyPreview,
    profile,
  };
}
