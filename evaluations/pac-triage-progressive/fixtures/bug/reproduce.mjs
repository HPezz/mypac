import test from "node:test";
import assert from "node:assert/strict";
import { isEven } from "./is-even.mjs";

test("odd numbers are not even", () => {
	assert.equal(isEven(3), false);
});
