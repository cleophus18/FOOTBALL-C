import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYSTYLES,
  ensureCoachProfile,
  chooseTacticalFormation,
  applyCoachTactics,
  academyState,
  acceptYouthProspect,
  developAcademy,
} from "../src/core/coaching.mjs";
import { Rng } from "../src/core/rng.mjs";

function player(id, position, overall = 70) {
  return {
    id,
    first: id,
    last: "Player",
    position,
    overall,
    attrs: { pace: overall, passing: overall, stamina: overall, physical: overall },
    fitness: 100,
  };
}

function club() {
  const value = {
    id: "coach-test",
    name: "Coach FC",
    formation: "4-3-3",
    manager: { name: "Coach", style: "Possession", rating: 75 },
    hierarchy: { manager: { name: "Coach", style: "Possession", rating: 75 }, staff: [] },
    squad: [],
    investment: { facilities: { youthAcademy: 2 } },
    strength(players) {
      return { attack: 70, defence: 70, formation: this.formation, overall: 70 };
    },
  };
  return value;
}

test("coaches receive tactical identities and select an eligible XI", () => {
  const team = club();
  const squad = [
    player("gk", "GK"), player("lb", "LB"), player("cb1", "CB"), player("cb2", "CB"),
    player("rb", "RB"), player("cm1", "CM"), player("cm2", "CM"), player("cam", "CAM"),
    player("lw", "LW"), player("rw", "RW"), player("st", "ST"),
  ];
  team.squad = squad.map((item) => item.id);
  const profile = ensureCoachProfile(team);
  assert.ok(PLAYSTYLES[profile.playstyle]);
  const decision = chooseTacticalFormation(team, squad, 0);
  assert.ok(decision.formation in { "4-3-3": true, "4-2-3-1": true, "4-1-4-1": true });
  assert.ok(applyCoachTactics(team, squad).passingMultiplier > 1);
});

test("accepted youth prospects develop through academy state", () => {
  const team = club();
  const prospect = {
    id: "youth-1", first: "Young", last: "Player", position: "CM",
    age: 16, overall: 50, potential: 72, potentialRange: { min: 65, max: 78 },
    status: "available", confidence: 70,
  };
  team.scouting = { youthProspects: [prospect] };
  const accepted = acceptYouthProspect(team, prospect.id);
  assert.equal(accepted.status, "academy");
  assert.equal(academyState(team).players.length, 1);
  for (let week = 0; week < 12; week++)
    developAcademy(team, new Rng(44 + week, "academy-test"), week);
  assert.ok(academyState(team).players[0].overall >= 50);
  assert.ok(academyState(team).developmentHistory.length >= 1);
});
