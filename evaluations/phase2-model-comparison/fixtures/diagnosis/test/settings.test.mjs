import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readWorkspaceStatus } from "../src/status-report.mjs";

test("reports one workspace's layered settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase2-settings-test-"));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "settings.json"), JSON.stringify({
    display: { color: "always" },
    execution: { retries: 5 },
  }));

  assert.deepEqual(readWorkspaceStatus(directory), {
    color: "always",
    columns: ["name", "status"],
    markers: { pending: "…", complete: "✓" },
    retries: 5,
    tags: [],
  });
});
