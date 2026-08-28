import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearConfigCache, loadConfig } from "./config-cache.mjs";

clearConfigCache();
const root = await mkdtemp(join(tmpdir(), "config-cache-repro-"));
const first = join(root, "team-a", "service");
const second = join(root, "team-b", "service");
await mkdir(first, { recursive: true });
await mkdir(second, { recursive: true });
await writeFile(join(first, "config.json"), JSON.stringify({ owner: "team-a" }));
await writeFile(join(second, "config.json"), JSON.stringify({ owner: "team-b" }));

assert.deepEqual(loadConfig(first), { owner: "team-a" });
assert.deepEqual(loadConfig(second), { owner: "team-b" });
console.log("repro passed");
