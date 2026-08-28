import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getPassingTestCount, isCompactableVerificationResult, saveFullOutput } from "./helpers.ts";

export default function compactVerificationOutputExtension(pi: ExtensionAPI): void {
	pi.on("tool_result", async (event) => {
		if (event.toolName !== "bash") return;

		const output = event.content
			.filter((item) => item.type === "text")
			.map((item) => item.text)
			.join("\n");
		const command = event.input.command;
		if (!isCompactableVerificationResult(command, output, event.isError)) return;

		const passingTests = getPassingTestCount(output);
		if (passingTests === undefined) return;

		const fullOutputPath = await saveFullOutput(output);
		return {
			content: [
				{
					type: "text" as const,
					text: `exit code 0\n${passingTests} tests passed\nFull output: ${fullOutputPath}`,
				},
			],
			details: { fullOutputPath },
		};
	});
}
