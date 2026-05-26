import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	buildPersonaSystemPrompt,
	findPersona,
	formatPersonaList,
	getPersonaStateFromBranch,
	insertPersonaSystemPrompt,
	loadPersonas,
	parsePersonaCommand,
	PERSONA_STATE_TYPE,
	type Persona,
} from "./helpers.ts";

export default function personasExtension(pi: ExtensionAPI): void {
	const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
	let personas: Persona[] = [];
	let personasLoaded = false;
	let activePersona: string | undefined;

	function updateStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(
			"persona",
			activePersona ? ctx.ui.theme.fg("accent", `🎭 ${activePersona}`) : undefined,
		);
	}

	async function loadAvailablePersonas(_ctx: ExtensionContext): Promise<void> {
		if (personasLoaded) return;
		personas = await loadPersonas(packageRoot);
		personasLoaded = true;
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		activePersona = getPersonaStateFromBranch(ctx.sessionManager.getBranch())?.activePersona;
		if (activePersona && !findPersona(personas, activePersona)) {
			activePersona = undefined;
		}
		updateStatus(ctx);
	}

	pi.registerCommand("persona", {
		description: "List, enable, or disable a Pi persona",
		handler: async (args, ctx) => {
			if (personas.length === 0) {
				await loadAvailablePersonas(ctx);
			}

			const command = parsePersonaCommand(args);
			if (command.action === "list") {
				ctx.ui.notify(formatPersonaList(personas, activePersona), "info");
				return;
			}

			if (command.action === "off") {
				activePersona = undefined;
				pi.appendEntry(PERSONA_STATE_TYPE, { activePersona });
				updateStatus(ctx);
				ctx.ui.notify("Persona disabled.", "info");
				return;
			}

			const persona = findPersona(personas, command.name);
			if (!persona) {
				ctx.ui.notify(`Unknown persona: ${command.name}\n\n${formatPersonaList(personas, activePersona)}`, "error");
				return;
			}

			activePersona = persona.name;
			pi.appendEntry(PERSONA_STATE_TYPE, { activePersona });
			updateStatus(ctx);
			ctx.ui.notify(`Persona enabled: ${persona.name}`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await loadAvailablePersonas(ctx);
		restoreFromBranch(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await loadAvailablePersonas(ctx);
		restoreFromBranch(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		if (!activePersona) return;
		const persona = findPersona(personas, activePersona);
		if (!persona) return;

		return {
			systemPrompt: insertPersonaSystemPrompt(
				event.systemPrompt,
				buildPersonaSystemPrompt(persona),
				event.systemPromptOptions?.appendSystemPrompt,
			),
		};
	});
}
