import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "./default-settings.mjs";
import { mergeSettings } from "./merge-settings.mjs";

export function loadWorkspaceSettings(directory) {
  const local = JSON.parse(readFileSync(join(directory, "settings.json"), "utf8"));
  return mergeSettings(DEFAULT_SETTINGS, local);
}
