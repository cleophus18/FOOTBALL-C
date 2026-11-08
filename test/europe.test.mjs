import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPromotionRelegation,
  defaultEuropeanAccessList,
  qualifyEuropeanClubs,
  updateAssociationCoefficients,
} from "../src/model/europe.mjs";

function entry(id, nation, tier, clubIds, rules = {}) {
  return {
    id,
    league: { id, nation, tier, teamIds: [...clubIds], ...rules },
    clubIdentities: Object.fromEntries(
      clubIds.map((clubId) => [clubId, { id: clubId }]),
    ),
  };
}

test("configured club access uses final standings, titleholders and one unique entry per club", () => {
  const clubs = ["e1", "e2", "e3", "e4", "e5", "f1", "f2", "f3", "f4", "f5"];
  const leagues = [
    entry("eng", "ENG", 1, clubs.slice(0, 5)),
    entry("fra", "FRA", 1, clubs.slice(5)),
  ];
  const access = {
    ENG: { direct: 2, qualifying: 1 },
    FRA: { direct: 1, qualifying: 1 },
  };
  const qualified = qualifyEuropeanClubs({
    leagues,
    accessList: access,
    standings: {
      eng: ["e4", "e2", "e1", "e3", "e5"],
      fra: ["f4", "f1", "f2", "f3", "f5"],
    },
    titleholders: [
      { clubId: "e2", route: "titleholder" },
      { clubId: "f5", competition: "Europa League" },
    ],
    extraSpots: [{ nation: "ENG", position: 5 }],
  });
  assert.deepEqual(
    new Set(qualified.map((item) => item.clubId)),
    new Set(["e1", "e2", "e4", "f1", "f4", "f5"]),
  );
  assert.equal(qualified.length, 6);
  assert.ok(qualified.every((item) => !item.clubId.startsWith("e5")));
});

test("promotion and relegation preserve division sizes and return club moves", () => {
  const top = entry("eng1", "ENG", 1, ["a", "b", "c", "d"], {
    relegation: { direct: 2 },
  });
  const second = entry("eng2", "ENG", 2, ["e", "f", "g", "h"], {
    promotion: { direct: 1, playoff: 1 },
  });
  const clubs = Object.fromEntries(
    [...top.league.teamIds, ...second.league.teamIds].map((id) => [id, { id }]),
  );
  const moves = applyPromotionRelegation({
    leagues: [top, second],
    leagueTables: { eng1: ["a", "b", "c", "d"], eng2: ["h", "g", "f", "e"] },
    clubIdentities: clubs,
    playoffWinners: { eng2: "f" },
  });
  assert.equal(top.league.teamIds.length, 4);
  assert.equal(second.league.teamIds.length, 4);
  assert.deepEqual(new Set(top.league.teamIds), new Set(["a", "b", "h", "f"]));
  assert.deepEqual(
    new Set(second.league.teamIds),
    new Set(["c", "d", "e", "g"]),
  );
  assert.equal(moves.filter((move) => move.outcome === "promoted").length, 2);
  assert.equal(moves.filter((move) => move.outcome === "relegated").length, 2);
});

test("coefficient history is points-per-club and performance places use the highest coefficients", () => {
  const current = updateAssociationCoefficients(
    {},
    [
      { nation: "NED", result: "win" },
      { nation: "NED", result: "draw" },
      { nation: "ENG", result: "loss" },
    ],
    { season: 2027, clubsPerAssociation: { NED: 2, ENG: 1 } },
  );
  assert.equal(current.NED.coefficient, 1.5);
  assert.equal(current.ENG.coefficient, 0);
  assert.equal(current.NED.history[0].season, 2027);
  assert.deepEqual(defaultEuropeanAccessList().ENG.direct, 4);
});
