import test from "node:test";
import assert from "node:assert/strict";
import { formatDecimal } from "../src/core/util.mjs";

test("formatDecimal renders fractional numbers with exactly two places", () => {
  assert.equal(formatDecimal(2.2), "2.20");
  assert.equal(formatDecimal(2.25), "2.25");
  assert.equal(formatDecimal("1.5"), "1.50");
});

test("formatDecimal keeps integers readable and rejects invalid values", () => {
  assert.equal(formatDecimal(2), "2");
  assert.equal(formatDecimal("2"), "2");
  assert.equal(formatDecimal(null), "—");
  assert.equal(formatDecimal("not-a-number"), "—");
});
