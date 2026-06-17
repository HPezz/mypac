import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	appendVerbositySteeringPrompt,
	formatSharedAppendSystemPrompt,
	insertSharedAppendSystemPrompt,
	loadSharedAppendSystemInstructions,
} from "./prompt.ts";

export default function sharedAppendSystemExtension(pi: ExtensionAPI) {
	let sharedAppendSystemInstructions = "";

	pi.on("session_start", async () => {
		sharedAppendSystemInstructions = await loadSharedAppendSystemInstructions();
	});

	pi.on("before_agent_start", async (event) => {
		const sharedAppendSystemPrompt = formatSharedAppendSystemPrompt(sharedAppendSystemInstructions);
		const systemPrompt = insertSharedAppendSystemPrompt(
			event.systemPrompt,
			sharedAppendSystemPrompt,
			event.systemPromptOptions?.appendSystemPrompt,
		);

		return {
			systemPrompt: appendVerbositySteeringPrompt(systemPrompt),
		};
	});
}
