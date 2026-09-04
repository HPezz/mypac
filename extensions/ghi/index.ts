import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	resolveForgeRepository as defaultResolveForgeRepository,
	type ForgeRepository,
} from "../../lib/forge.ts";
import { loadPackageSkill as defaultLoadPackageSkill } from "../../lib/skill-loader.ts";
import {
	buildIssueCreatePrompt,
	buildIssueSessionName,
	findExplicitForgeUrl,
	normalizeIssueNote,
} from "./helpers.ts";

type IssueCreateDeps = {
	loadPackageSkill?: typeof defaultLoadPackageSkill;
	resolveForgeRepository?: typeof defaultResolveForgeRepository;
};

export default function ghiExtension(pi: ExtensionAPI, deps: IssueCreateDeps = {}): void {
	const loadPackageSkill = deps.loadPackageSkill ?? defaultLoadPackageSkill;
	const resolveForgeRepository = deps.resolveForgeRepository ?? defaultResolveForgeRepository;

	const handler = async (args: string | undefined, ctx: Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1]) => {
		if (!ctx.isIdle()) {
			ctx.ui.notify("/issue-create can only run while the agent is idle", "warning");
			return;
		}

		const repoCheck = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"]);
		if (repoCheck.code !== 0 || repoCheck.stdout.trim() !== "true") {
			ctx.ui.notify("/issue-create must be run inside a git repository", "error");
			return;
		}

		let note = normalizeIssueNote(args ?? "");
		if (!note) {
			if (!ctx.hasUI) {
				ctx.ui.notify("Provide an issue note, for example: /issue-create fix README install steps", "error");
				return;
			}

			const input = await ctx.ui.input("Create issue", "Short issue note or title");
			note = normalizeIssueNote(input ?? "");
			if (!note) {
				ctx.ui.notify("Issue creation cancelled", "info");
				return;
			}
		}

		const run = (command: string, commandArgs: string[]) => pi.exec(command, commandArgs, { timeout: 30_000 });
		let repositoryResult = await resolveForgeRepository(run, { explicitUrl: findExplicitForgeUrl(note) });
		if (!repositoryResult.ok && ctx.hasUI) {
			const explicitUrl = await ctx.ui.input(
				"Forge could not be resolved",
				"Explicit GitHub or GitLab repository/issue URL",
			);
			if (explicitUrl?.trim()) {
				repositoryResult = await resolveForgeRepository(run, { explicitUrl: explicitUrl.trim() });
			}
		}
		if (!repositoryResult.ok) {
			ctx.ui.notify(repositoryResult.error, "error");
			return;
		}

		const skillResult = await loadPackageSkill("pac-issue-create");
		if (!skillResult) {
			ctx.ui.notify("Could not load skills/pac-issue-create/SKILL.md", "error");
			return;
		}

		const repository: ForgeRepository = repositoryResult.value;
		const sessionName = buildIssueSessionName(note);
		if (sessionName) pi.setSessionName(sessionName);
		pi.sendUserMessage(buildIssueCreatePrompt(skillResult.content, note, repository));
	};

	pi.registerCommand("issue-create", {
		description: "Create an issue on the current GitHub or GitLab forge",
		handler,
	});
	pi.registerCommand("ghi", {
		description: "Create an issue (/issue-create compatibility alias)",
		handler,
	});
}
