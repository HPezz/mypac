import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const expectedHostDependencies = {
	"@earendil-works/pi-agent-core": "0.84.2",
	"@earendil-works/pi-ai": "0.84.2",
	"@earendil-works/pi-coding-agent": "0.84.2",
	"@earendil-works/pi-tui": "0.84.2",
	typebox: "1.3.7",
};

test("package has installable consumer metadata", () => {
	assert.equal(packageJson.name, "mypac");
	assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
});

test("Pi host dependencies have exact development pins", () => {
	for (const [name, version] of Object.entries(expectedHostDependencies)) {
		assert.equal(packageJson.devDependencies[name], version, `${name} development version`);
	}
});

test("directly imported host dependencies are declared as exact peers", () => {
	for (const [name, version] of Object.entries(expectedHostDependencies)) {
		assert.equal(packageJson.peerDependencies[name], version, `${name} peer version`);
	}
});
