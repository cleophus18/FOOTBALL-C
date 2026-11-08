import { loadData } from "./src/data/loader.mjs";
import { createCareer } from "./src/career.mjs";
const data = await loadData();
const career = createCareer(data, {
  first: "A",
  last: "B",
  age: "17",
  nationality: "ENG",
  position: "ST",
  archetype: "Poacher",
  clubId: "hull",
  seed: 91327,
});
const day = career.calendar[0].day;
console.log(
  new Date(Date.UTC(2000, 0, 1) + day * 86400000).toISOString(),
  career.clubs.length,
);
console.log(
  Object.values(
    career.transferNeedAssessment(
      career.clubs.find((club) => club.id !== career.club.id),
      day,
    ),
  )
    .sort((a, b) => b.demand - a.demand)
    .slice(0, 4),
);
career.week = 0;
console.log("deals", career.processCpuTransferMarket(day).length);
