export default async function run(page, ui) {
  await page.waitForSelector(".menu-shell");
  const before = await page.locator("#app").innerHTML();
  await page.click('[data-action="open-credits"]');
  await page.waitForTimeout(800);
  const after = await page.locator("#app").innerHTML();
  return {
    changed: before !== after,
    head: after.slice(0, 260),
    shellClass: await page.locator("#app > *").first().getAttribute("class"),
    hasList: await page.locator(".menu-list").count(),
    listHTML: await page
      .locator("#app")
      .innerHTML()
      .then((h) => h.includes("What's inside")),
  };
}
