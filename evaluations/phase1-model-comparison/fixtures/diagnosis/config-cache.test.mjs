import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearConfigCache, loadConfig } from "./config-cache.mjs";

test("reuses a cached config for the same directory", async () => {
  clearConfigCache();
  const directory = await mkdtemp(join(tmpdir(), "config-cache-"));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config.json"), JSON.stringify({ name: "first" }));
  const first = loadConfig(directory);
  await writeFile(join(directory, "config.json"), JSON.stringify({ name: "changed" }));
  assert.equal(loadConfig(directory), first);
  assert.deepEqual(first, { name: "first" });
});
