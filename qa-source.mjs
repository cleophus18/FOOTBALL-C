// QA: verify the module actually exposes the career, and dump the loaded source snippet.
export default async function run(page, ui) {
  const source = await page.evaluate(async () => {
    const res = await fetch("/src/ui/app.mjs", { cache: "no-store" });
    const text = await res.text();
    const at = text.indexOf("window.__career");
    return {
      found: at >= 0,
      snippet: at >= 0 ? text.slice(at - 200, at + 200) : null,
      length: text.length,
    };
  });
  const windowKeys = await page.evaluate(() =>
    Object.keys(window).filter((k) => k.startsWith("__")),
  );
  return { source, windowKeys, title: await page.title() };
}
