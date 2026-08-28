import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "evaluations/phase1-model-comparison/fixtures/diagnosis";
execFileSync(process.execPath, [`${root}/repro.mjs`], { stdio: "pipe" });
execFileSync(process.execPath, ["--test", `${root}/config-cache.test.mjs`], { stdio: "pipe" });
const { clearConfigCache, loadConfig } = await import(`${pathToFileURL(`${process.cwd()}/${root}/config-cache.mjs`)}?verify=${Date.now()}`);
clearConfigCache();
const temporary = await mkdtemp(join(tmpdir(), "config-cache-verify-"));
const expected = [];
for (const [parent, owner] of [["north", "alpha"], ["south", "beta"], ["west", "gamma"]]) {
  const directory = join(temporary, parent, "service");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config.json"), JSON.stringify({ owner }));
  expected.push([directory, owner]);
}
for (const [directory, owner] of expected) {
  assert.deepEqual(loadConfig(directory), { owner });
}
const [firstDirectory] = expected[0];
const firstValue = loadConfig(firstDirectory);
await writeFile(join(firstDirectory, "config.json"), JSON.stringify({ owner: "changed" }));
assert.equal(loadConfig(firstDirectory), firstValue, "the cache must still reuse values for the same directory");
assert.deepEqual(
  execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).trim().split("\n").sort(),
  [`${root}/config-cache.mjs`, `${root}/config-cache.test.mjs`],
  "only the root-cause fix and its focused test may change",
);
