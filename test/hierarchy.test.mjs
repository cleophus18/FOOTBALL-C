import test from "node:test";
import assert from "node:assert/strict";
import {
  appointManager,
  createClubHierarchy,
  createOwnerRequest,
  dismissClubManager,
  ensureClubHierarchy,
  processWeeklyHierarchy,
  respondToOwnerRequest,
} from "../src/model/hierarchy.mjs";
import { Club } from "../src/model/club.mjs";

test("clubs receive a persistent hierarchy with real managers for known clubs", () => {
  const club = new Club({ id: "arsenal", name: "Arsenal", prestige: 84 });
  club.hierarchy = createClubHierarchy(club, "test");
  ensureClubHierarchy(club);
  assert.equal(club.hierarchy.manager.name, "Mikel Arteta");
  assert.ok(club.hierarchy.owner.ambition >= 10);
  assert.ok(club.hierarchy.board.length >= 3);
  assert.ok(club.hierarchy.staff.some((member) => member.role === "fitness-coach"));
});

test("owner requests create traceable decisions and change relationships", () => {
  const club = new Club({ id: "small", name: "Small FC", prestige: 45 });
  const request = createOwnerRequest(club, 15);
  const before = club.hierarchy.relationships.managerOwner;
  assert.equal(respondToOwnerRequest(club, request.id, "accept"), true);
  assert.ok(club.hierarchy.relationships.managerOwner > before);
  assert.equal(club.hierarchy.inbox[0].status, "accept");
});

test("staff wages are idempotent and manager employment has a career record", () => {
  const club = new Club({ id: "club", name: "Club", prestige: 60 });
  const before = club.finances.balance;
  processWeeklyHierarchy(club, 42);
  processWeeklyHierarchy(club, 42);
  assert.equal(club.finances.balance < before, true);
  assert.equal(club.finances.ledger.filter((entry) => entry.id === "staff-wages-club-42").length, 1);
  assert.equal(dismissClubManager(club, "Poor results", 42), true);
  assert.equal(club.hierarchy.employment.status, "dismissed");
  appointManager(club, { id: "new-manager", name: "New Manager", rating: 70, style: "Balanced" }, 43);
  assert.equal(club.hierarchy.manager.name, "New Manager");
  assert.equal(club.hierarchy.employment.status, "active");
});
