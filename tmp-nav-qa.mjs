// Why does the mobile nav still overflow?
export default async function run(page, ui) {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForSelector(".menu-shell", { timeout: 20000 });
  await page.getByRole("button", { name: /MANAGER CAREER/i }).click();
  await page.waitForSelector("#manager-form", { timeout: 10000 });
  await page.getByRole("button", { name: /Take charge/i }).click();
  await page.waitForSelector(".manager-hub", { timeout: 20000 });
  return page.evaluate(() => {
    const nav = document.querySelector(".sidebar-nav");
    const items = [...nav.querySelectorAll(".nav-item")];
    const sidebar = document.querySelector(".sidebar");
    return {
      mediaMatches720: matchMedia("(max-width: 720px)").matches,
      navClass: nav.className,
      navWidth: Math.round(nav.getBoundingClientRect().width),
      navScrollWidth: nav.scrollWidth,
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      sidebarScrollWidth: sidebar.scrollWidth,
      firstItemFlex: getComputedStyle(items[0]).flex,
      firstItemWidth: getComputedStyle(items[0]).width,
      itemCount: items.length,
      brandWidth: Math.round(
        document.querySelector(".sidebar .brand").getBoundingClientRect().width,
      ),
      navParents: [...items[0].parentElement.children].length,
    };
  });
}
