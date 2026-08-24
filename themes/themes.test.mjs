import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const THEME_FILES = (await readdir(new URL(".", import.meta.url)))
	.filter((file) => file.endsWith(".json"))
	.sort();
const FULLSCREEN_COLOR_ROLES = ["thinkingMax", "scrollbarThumb", "searchMatchBg", "searchMatchText"];

for (const file of THEME_FILES) {
	test(`${file} defines Pi fullscreen and maximum-thinking colors`, async () => {
		const theme = JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));

		for (const role of FULLSCREEN_COLOR_ROLES) {
			assert.equal(typeof theme.colors[role], "string", `${role} must be explicit`);
		}
	});
}
