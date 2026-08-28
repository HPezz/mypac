import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLabels } from "./labels.mjs";

test("normalizes label spelling", () => {
  assert.deepEqual(normalizeLabels([" Bug ", "FEATURE"]), ["bug", "feature"]);
});
