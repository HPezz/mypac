import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(repository, "chatgpt-skills.json"), "utf8")) as { skills: string[] };

for (const skill of manifest.skills) {
	const result = spawnSync(
		"uvx",
		["--from", "skills-ref==0.1.1", "agentskills", "validate", join(repository, "dist", "chatgpt-skills", skill)],
		{ encoding: "utf8", stdio: "inherit" },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
