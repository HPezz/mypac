/**
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { pickRandom } from "./helpers.ts";

export default function (pi: ExtensionAPI) {
  pi.on("turn_start", async (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setWorkingMessage(pickRandom());
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (ctx.mode === "tui") ctx.ui.setWorkingMessage(); // Reset for next time
  });
}
