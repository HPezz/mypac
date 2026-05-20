/**
 * Original source: https://github.com/mitsuhiko/agent-stuff/blob/main/extensions/notify.ts
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
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

function notify(title: string, body: string): void {
	process.stdout.write(formatTerminalNotification(title, body));
	runSoundHook();
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("notify-test", {
		description: "Send a test terminal notification",
		handler: async () => {
			notify("Pi test", "Ready for input");
		},
	});

	pi.on("agent_end", async (event) => {
		const lastText = extractLastAssistantText(event.messages ?? []);
		const { title, body } = formatNotification(lastText);
		notify(title, body);
	});
}
