import test from "node:test";
import assert from "node:assert/strict";
import { messages, pickRandom } from "./helpers.ts";

test("pickRandom returns a non-empty string", () => {
  const result = pickRandom(() => 0);
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0);
});

test("pickRandom maps random values to message indexes", () => {
  assert.equal(pickRandom(() => 0), messages[0]);
  assert.equal(pickRandom(() => 0.5), messages[Math.floor(messages.length * 0.5)]);
  assert.equal(pickRandom(() => 0.999999), messages[messages.length - 1]);
});

test("messages array is non-empty", () => {
  assert.ok(messages.length > 0);
});

test("all messages end with '...'", () => {
  for (const msg of messages) {
    assert.ok(msg.endsWith("..."), `Expected "${msg}" to end with "..."`);
  }
});
