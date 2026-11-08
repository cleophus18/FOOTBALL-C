export default async function run(page) {
  await page.waitForSelector(".menu-shell");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);

  const box = async (sel) => {
    const b = await page
      .locator(sel)
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        };
      });
    return b;
  };

  const card = await box(".menu-card");
  const lane = await box(".menu-football");
  // Sample the ball over a full cycle to see where it goes.
  const tops = [];
  for (let i = 0; i < 12; i++) {
    tops.push(await box(".football"));
    await page.waitForTimeout(170);
  }
  return {
    card,
    lane,
    ballAtRest: tops[0],
    minTop: Math.min(...tops.map((t) => t.top)),
    maxTop: Math.max(...tops.map((t) => t.top)),
    ballLeft: tops[0].left,
    ballRight: tops[0].right,
    cardOverlapsBall: card.bottom > tops[0].top && card.right > tops[0].left,
  };
}
