/**
 * Additional reference: https://github.com/ferologics/pi-notify/blob/master/index.ts
 *
 * Sends a terminal desktop notification when Pi is ready for input.
 * Supports iTerm2 OSC 9, Kitty OSC 99, tmux passthrough, and OSC 777 for
 * Ghostty, WezTerm, and rxvt-unicode. Also supports an optional
 * PI_NOTIFY_SOUND_CMD hook.
 *
 * Intentional local adaptation: helper logic lives in ./helpers.ts so message
 * extraction and notification formatting can be tested in isolation.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { extractLastAssistantText, formatNotification, formatTerminalNotification } from "./helpers.ts";

function runSoundHook(): void {
	const command = process.env.PI_NOTIFY_SOUND_CMD?.trim();
	if (!command) {
		return;
	}

	try {
		const child = spawn(command, {
			shell: true,
			detached: true,
			stdio: "ignore",
		});
		child.on("error", () => {
			// Ignore hook errors to avoid breaking notifications.
		});
		child.unref();
	} catch {
		// Ignore hook errors to avoid breaking notifications.
	}
}

function dispatchNotification(
	ctx: Pick<ExtensionContext, "mode" | "hasUI" | "ui">,
	title: string,
	body: string,
): void {
	if (ctx.mode === "tui") {
		process.stdout.write(formatTerminalNotification(title, body));
		runSoundHook();
		return;
	}
	if (ctx.hasUI) {
		ctx.ui.notify(body ? `${title}: ${body}` : title, "info");
	}
	// Print and JSON modes have no UI channel; writing OSC bytes would pollute their output.
}

export default function (pi: ExtensionAPI) {
	let pending: { title: string; body: string } | null = null;

	pi.registerCommand("notify-test", {
		description: "Send a test terminal notification",
		handler: async (_args, ctx) => {
			dispatchNotification(ctx, "Pi test", "Ready for input");
		},
	});

	// Per the Pi lifecycle diagram, agent_settled always follows agent_end in
	// the normal flow. We also clear on agent_start so that any stale pending
	// from an interrupted turn (where agent_settled never fired) cannot leak
	// into the next run.
	pi.on("agent_start", async () => {
		pending = null;
	});

	pi.on("agent_end", async (event, _ctx) => {
		const lastText = extractLastAssistantText(event.messages ?? []);
		pending = formatNotification(lastText);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		const notification = pending ?? formatNotification(null);
		pending = null;
		dispatchNotification(ctx, notification.title, notification.body);
	});
}
