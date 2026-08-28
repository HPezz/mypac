import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

const TARGET_COMMANDS = new Set(["npm run check:pi-compatibility"]);
const ANSI_ESCAPE = /\x1b\[[0-?]*[ -/]*[@-~]/gu;
const WARNING_LINE = /^\s*(?:(?:\([^\n)]+\)\s*)?(?:[A-Za-z]*Warning|npm\s+warn)\b|⚠)/imu;

export function isCompactableVerificationResult(command: unknown, output: string, isError: boolean): boolean {
	if (isError || typeof command !== "string" || !TARGET_COMMANDS.has(command.trim())) return false;
	return !WARNING_LINE.test(stripAnsi(output)) && getPassingTestCount(output) !== undefined;
}

export function getPassingTestCount(output: string): number | undefined {
	const plainOutput = stripAnsi(output);
	const tests = getTapCount(plainOutput, "tests");
	const passed = getTapCount(plainOutput, "pass");
	const failed = getTapCount(plainOutput, "fail");
	if (tests === undefined || passed === undefined || failed !== 0 || tests !== passed) return undefined;
	return passed;
}

export async function saveFullOutput(output: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-verification-"));
	const path = join(directory, "output.log");
	await withFileMutationQueue(path, () => writeFile(path, output, "utf8"));
	return path;
}

function getTapCount(output: string, label: string): number | undefined {
	const match = output.match(new RegExp(`^ℹ ${label} (\\d+)$`, "mu"));
	return match ? Number(match[1]) : undefined;
}

function stripAnsi(output: string): string {
	return output.replace(ANSI_ESCAPE, "");
}
