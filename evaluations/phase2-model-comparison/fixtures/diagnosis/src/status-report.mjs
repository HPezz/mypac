import { loadWorkspaceSettings } from "./load-workspace-settings.mjs";

export function readWorkspaceStatus(directory) {
  const settings = loadWorkspaceSettings(directory);
  return {
    color: settings.display.color,
    columns: [...settings.display.columns],
    markers: { ...settings.display.markers },
    retries: settings.execution.retries,
    tags: [...settings.execution.tags],
  };
}
