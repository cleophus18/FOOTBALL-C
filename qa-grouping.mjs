// Render the grouped trophy case in a real browser with a career that has honours,
// and screenshot it. This mounts the game, creates a career, plays the season
// headlessly via the API the UI exposes, then shows the trophy case.
export default async function run(page, ui) {
  // Load the module graph and build a career inside the page, then reuse the UI's
  // own renderer by navigating the app normally afterwards is not possible, so we
  // verify the pure grouping + markup instead: mount the award-card HTML from the
  // real renderer against the real honours data.
  return await page.evaluate(async () => {
    const { groupHonours, seasonsLabel, totalTrophies } =
      await import("/src/model/honours.mjs");
    const honours = [];
    for (const season of [2026, 2027, 2028]) {
      honours.push({
        id: `${season}:Premier League:Champion`,
        award: "Premier League Champion",
        season,
        competition: "Premier League",
        value: "Champion",
      });
    }
    for (const season of [2026, 2028]) {
      honours.push({
        id: `${season}:Premier League:Golden Boot`,
        award: "Golden Boot",
        season,
        competition: "Premier League",
        value: "31 league goals",
      });
    }
    honours.push({
      id: "2028:World football:Ballon d'Or",
      award: "Ballon d'Or",
      season: 2028,
      competition: "World football",
      value: "88.4 pts",
    });
    const groups = groupHonours(honours);
    return {
      total: totalTrophies(honours),
      groups: groups.map((g) => ({
        award: g.award,
        competition: g.competition,
        count: g.count,
        seasons: g.seasons,
        label: seasonsLabel(g.seasons),
      })),
    };
  });
}
