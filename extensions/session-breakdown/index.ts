import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { analyzeSessionDirectory, DEFAULT_SESSION_ROOT, formatCompactBreakdownReport } from "./helpers.ts";

export default function sessionBreakdownExtension(pi: ExtensionAPI): void {
	pi.registerCommand("session-breakdown", {
		description: "Show local Pi session usage stats with cost-focused drill-downs",
		handler: async (args, ctx) => {
			ctx.ui.notify("Scanning local Pi session stats…", "info");
			const report = await analyzeSessionDirectory({ root: DEFAULT_SESSION_ROOT, signal: ctx.signal });
			if (report.aborted || ctx.signal?.aborted) {
				ctx.ui.notify("Session breakdown cancelled", "info");
				return;
			}
			const flags = new Set((args ?? "").split(/\s+/).filter(Boolean));
			const color = !flags.has("--no-color");
			const content = formatCompactBreakdownReport(report, { color });
			pi.sendMessage(
				{
					customType: "session-breakdown",
					content,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});
}
