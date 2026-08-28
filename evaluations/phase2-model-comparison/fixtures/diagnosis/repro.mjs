import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWorkspaceStatus } from "./src/status-report.mjs";

const root = await mkdtemp(join(tmpdir(), "phase2-settings-repro-"));
const first = join(root, "first-workspace");
const second = join(root, "second-workspace");
await mkdir(first, { recursive: true });
await mkdir(second, { recursive: true });
await writeFile(join(first, "settings.json"), JSON.stringify({
  display: {
    color: "always",
    markers: { pending: "!", complete: "done" },
  },
  execution: { retries: 5, tags: ["deploy"] },
}));
await writeFile(join(second, "settings.json"), JSON.stringify({
  display: { columns: ["name"] },
}));

assert.deepEqual(readWorkspaceStatus(first), {
  color: "always",
  columns: ["name", "status"],
  markers: { pending: "!", complete: "done" },
  retries: 5,
  tags: ["deploy"],
});
assert.deepEqual(readWorkspaceStatus(second), {
  color: "auto",
  columns: ["name"],
  markers: { pending: "…", complete: "✓" },
  retries: 2,
  tags: [],
});
console.log("repro passed");
