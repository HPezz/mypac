import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkQueue } from "../src/index.mjs";

test("keeps pending work in input order and omits terminal work", () => {
  const result = buildWorkQueue([
    { id: "first", title: "First" },
    { id: "done", title: "Done", status: "done" },
    { id: "archived", title: "Archived", status: "archived" },
    { id: "second", title: "Second" },
  ], { limit: 10 });

  assert.equal(result.total, 4);
  assert.deepEqual(result.items.map(({ id }) => id), ["first", "second"]);
});

test("normalizes defaults without mutating input", () => {
  const input = [{ id: 42, title: "Untitled" }];
  const result = buildWorkQueue(input);

  assert.deepEqual(result.items, [{ id: "42", title: "Untitled", status: "open", dependsOn: [] }]);
  assert.deepEqual(input, [{ id: 42, title: "Untitled" }]);
});
