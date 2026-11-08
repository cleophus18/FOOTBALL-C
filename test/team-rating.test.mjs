import test from "node:test";
import assert from "node:assert/strict";
import { Club } from "../src/model/club.mjs";
import { calculateTeamRatings } from "../src/model/team-rating.mjs";

const slots = ["GK", "LB", "CB", "CB", "RB", "CDM", "CM", "CM", "LW", "ST", "RW"];

function makeSquad(extra = []) {
  const players = slots.map((position, index) => ({
    id: `p${index}`,
    position,
    overall: 70,
    baseOverall: 70,
    fitness: 100,
    sharpness: 100,
    morale: 60,
  }));
  return players.concat(extra);
}

function clubFor(players) {
  return new Club({
    id: "club",
    name: "Test Club",
    formation: "4-3-3",
    squad: players.map((player) => player.id),
  });
}

test("signing and selling players changes squad and team ratings", () => {
  const players = makeSquad();
  const club = clubFor(players);
  const before = calculateTeamRatings(club, players);
  const signing = { id: "new", position: "ST", overall: 95, baseOverall: 95 };
  players.push(signing);
  club.addPlayer(signing.id);
  const signed = calculateTeamRatings(club, players);
  assert.ok(signed.squadOverall > before.squadOverall);
  club.removePlayer(signing.id);
  const sold = calculateTeamRatings(club, players);
  assert.equal(sold.squadOverall, before.squadOverall);
});

test("improving a player raises the relevant team rating", () => {
  const players = makeSquad();
  const club = clubFor(players);
  const before = calculateTeamRatings(club, players);
  players.find((player) => player.position === "ST").overall = 95;
  const after = calculateTeamRatings(club, players);
  assert.ok(after.attack > before.attack);
  assert.ok(after.overall > before.overall);
});

test("injury changes matchday rating, not squad or starting-XI rating", () => {
  const players = makeSquad();
  const club = clubFor(players);
  const before = calculateTeamRatings(club, players);
  players[9].overall = 95;
  const improved = calculateTeamRatings(club, players);
  players[9].injury = { type: "hamstring", weeks: 3 };
  const injured = calculateTeamRatings(club, players);
  assert.equal(injured.squadOverall, improved.squadOverall);
  assert.equal(injured.startingXIOverall, improved.startingXIOverall);
  assert.ok(injured.matchdayOverall < improved.matchdayOverall);
  assert.ok(injured.matchdayOverall >= 1 && injured.matchdayOverall <= 99);
  assert.ok(before.overall < improved.overall);
});
