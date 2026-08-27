import { basename } from "node:path";

export interface PiSessionTelemetryAvailability {
	inputTokens: boolean;
	outputTokens: boolean;
	cacheReadTokens: boolean;
	cacheWriteTokens: boolean;
	totalTokens: boolean;
	reportedCost: boolean;
	estimatedCost: boolean;
	context: boolean;
	maxContext: boolean;
}

export interface PiSessionConfiguration {
	provider: string | null;
	model: string | null;
	thinking: string | null;
}

export interface ParsedPiSessionTelemetry {
	filePath: string;
	sessionId: string | null;
	startedAt: Date | null;
	cwd: string | null;
	name: string | null;
	firstUserText: string | null;
	messages: number;
	assistantTurns: number;
	tokens: number;
	totalCost: number;
	estimatedCost: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	inputTokens: number;
	outputTokens: number;
	contextTokensTotal: number;
	contextSamples: number;
	contextTokenSamples: number[];
	maxContextTokens: number;
	skippedLines: number;
	modelsUsed: Set<string>;
	thinkingLevelsUsed: Set<string>;
	actualConfiguration: PiSessionConfiguration;
	messagesByModel: Map<string, number>;
	tokensByModel: Map<string, number>;
	costByModel: Map<string, number>;
	availability: PiSessionTelemetryAvailability;
}

export interface PiSessionParseState extends ParsedPiSessionTelemetry {
	currentModel: string | null;
	usesUsageLedger: boolean;
	entryModels: Map<string, string>;
	usageRecords: Array<{ cause: string; entryId?: string; usage: unknown }>;
}

function readNumber(value: unknown): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function hasNumber(value: unknown): boolean {
	return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
}

function hasAnyNumber(usage: any, names: string[]): boolean {
	return names.some((name) => hasNumber(usage?.[name]));
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
	if (value === 0) return;
	map.set(key, (map.get(key) ?? 0) + value);
}

function modelKey(provider: unknown, model: unknown): string | null {
	const providerText = typeof provider === "string" ? provider.trim() : "";
	const modelText = typeof model === "string" ? model.trim() : "";
	if (!providerText && !modelText) return null;
	if (!providerText) return modelText;
	if (!modelText) return providerText;
	return `${providerText}/${modelText}`;
}

function modelKeyFromFields(provider: unknown, model: unknown, modelId: unknown): string | null {
	const modelText = typeof model === "string" && model.trim() ? model : undefined;
	const modelIdText = typeof modelId === "string" && modelId.trim() ? modelId : undefined;
	if (!modelText && !modelIdText) return null;
	return modelKey(provider, modelText ?? modelIdText);
}

function splitModelKey(key: string): { provider: string | null; model: string | null } {
	if (key === "unknown" || key === "Tools/summaries") return { provider: null, model: null };
	const separator = key.indexOf("/");
	return separator < 0 ? { provider: null, model: key } : { provider: key.slice(0, separator), model: key.slice(separator + 1) };
}

function extractMessageFields(entry: any): { provider?: unknown; model?: unknown; modelId?: unknown; usage?: unknown } {
	const message = entry?.message;
	return {
		provider: entry?.provider ?? message?.provider,
		model: entry?.responseModel ?? message?.responseModel ?? entry?.model ?? message?.model,
		modelId: entry?.modelId ?? message?.modelId,
		usage: entry?.usage ?? message?.usage,
	};
}

function extractCacheReadTokens(usage: any): number {
	return readNumber(usage?.cacheRead) + readNumber(usage?.cache_read) + readNumber(usage?.cacheReadTokens) + readNumber(usage?.cache_read_tokens);
}

function extractCacheWriteTokens(usage: any): number {
	return readNumber(usage?.cacheWrite) + readNumber(usage?.cache_write) + readNumber(usage?.cacheWriteTokens) + readNumber(usage?.cache_write_tokens);
}

function extractInputTokens(usage: any): number {
	return readNumber(usage?.promptTokens) || readNumber(usage?.prompt_tokens) || readNumber(usage?.inputTokens) || readNumber(usage?.input_tokens) || readNumber(usage?.input);
}

function extractOutputTokens(usage: any): number {
	return readNumber(usage?.completionTokens) || readNumber(usage?.completion_tokens) || readNumber(usage?.outputTokens) || readNumber(usage?.output_tokens) || readNumber(usage?.output);
}

function extractTokens(usage: any): number {
	const direct = readNumber(usage?.totalTokens) || readNumber(usage?.total_tokens) || readNumber(usage?.tokens) || readNumber(usage?.tokenCount) || readNumber(usage?.token_count);
	if (direct > 0) return direct;
	const nested = readNumber(usage?.tokens?.total) || readNumber(usage?.tokens?.totalTokens) || readNumber(usage?.tokens?.total_tokens);
	return nested > 0 ? nested : extractInputTokens(usage) + extractOutputTokens(usage) + extractCacheReadTokens(usage) + extractCacheWriteTokens(usage);
}

function extractContextTokens(usage: any): number {
	return readNumber(usage?.contextTokens) || readNumber(usage?.context_tokens) || readNumber(usage?.context);
}

function extractMaxContextTokens(usage: any): number {
	return readNumber(usage?.maxContextTokens) || readNumber(usage?.max_context_tokens) || readNumber(usage?.contextWindow) || readNumber(usage?.context_window);
}

function extractCost(usage: any): number {
	const direct = readNumber(usage?.cost);
	return direct > 0 ? direct : readNumber(usage?.cost?.total);
}

function updateAvailability(state: PiSessionParseState, usage: any): void {
	if (!usage) return;
	state.availability.inputTokens ||= hasAnyNumber(usage, ["promptTokens", "prompt_tokens", "inputTokens", "input_tokens", "input"]);
	state.availability.outputTokens ||= hasAnyNumber(usage, ["completionTokens", "completion_tokens", "outputTokens", "output_tokens", "output"]);
	state.availability.cacheReadTokens ||= hasAnyNumber(usage, ["cacheRead", "cache_read", "cacheReadTokens", "cache_read_tokens"]);
	state.availability.cacheWriteTokens ||= hasAnyNumber(usage, ["cacheWrite", "cache_write", "cacheWriteTokens", "cache_write_tokens"]);
	state.availability.totalTokens ||= hasAnyNumber(usage, ["totalTokens", "total_tokens", "tokens", "tokenCount", "token_count"])
		|| hasAnyNumber(usage?.tokens, ["total", "totalTokens", "total_tokens"])
		|| state.availability.inputTokens || state.availability.outputTokens || state.availability.cacheReadTokens || state.availability.cacheWriteTokens;
	state.availability.reportedCost ||= hasNumber(usage.cost) || hasNumber(usage.cost?.total);
	state.availability.context ||= hasAnyNumber(usage, ["contextTokens", "context_tokens", "context"]);
	state.availability.maxContext ||= hasAnyNumber(usage, ["maxContextTokens", "max_context_tokens", "contextWindow", "context_window"]);
}

interface ModelPricing { input: number; output: number; cacheRead?: number; cacheWrite?: number }
const COPILOT_MARKET_PRICING: Array<{ pattern: RegExp; pricing: ModelPricing }> = [
	{ pattern: /(?:^|\/)claude-sonnet(?:$|[-_.])/, pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
];

function estimateMarketCost(model: string, usage: any): { applicable: boolean; cost: number } {
	if (!usage || (!/(^|\/)github-copilot\//.test(model) && !/(^|\/)copilot\//.test(model))) return { applicable: false, cost: 0 };
	const match = COPILOT_MARKET_PRICING.find((entry) => entry.pattern.test(model));
	if (!match) return { applicable: false, cost: 0 };
	const hasPricedUsage = hasAnyNumber(usage, [
		"promptTokens", "prompt_tokens", "inputTokens", "input_tokens", "input",
		"completionTokens", "completion_tokens", "outputTokens", "output_tokens", "output",
		"cacheRead", "cache_read", "cacheReadTokens", "cache_read_tokens",
		"cacheWrite", "cache_write", "cacheWriteTokens", "cache_write_tokens",
	]);
	if (!hasPricedUsage) return { applicable: false, cost: 0 };
	const input = extractInputTokens(usage);
	const output = extractOutputTokens(usage);
	const cacheRead = extractCacheReadTokens(usage);
	const cacheWrite = extractCacheWriteTokens(usage);
	const pricing = match.pricing;
	return {
		applicable: true,
		cost: (input * pricing.input + output * pricing.output + cacheRead * (pricing.cacheRead ?? pricing.input) + cacheWrite * (pricing.cacheWrite ?? pricing.input)) / 1_000_000,
	};
}

function addUsage(state: PiSessionParseState, key: string, usage: unknown, allowEstimate: boolean): void {
	updateAvailability(state, usage);
	const tokens = extractTokens(usage);
	const reportedCost = extractCost(usage);
	const estimate = allowEstimate && reportedCost === 0 ? estimateMarketCost(key, usage) : { applicable: false, cost: 0 };
	state.availability.estimatedCost ||= estimate.applicable;
	const estimatedCost = estimate.cost;
	const cost = reportedCost || estimatedCost;
	const contextTokens = extractContextTokens(usage);
	const maxContextTokens = extractMaxContextTokens(usage);
	state.tokens += tokens;
	state.totalCost += cost;
	state.estimatedCost += estimatedCost;
	state.cacheReadTokens += extractCacheReadTokens(usage);
	state.cacheWriteTokens += extractCacheWriteTokens(usage);
	state.inputTokens += extractInputTokens(usage);
	state.outputTokens += extractOutputTokens(usage);
	if (contextTokens > 0) {
		state.contextTokenSamples.push(contextTokens);
		state.contextTokensTotal += contextTokens;
		state.contextSamples += 1;
	}
	state.maxContextTokens = Math.max(state.maxContextTokens, contextTokens, maxContextTokens);
	state.modelsUsed.add(key);
	addToMap(state.tokensByModel, key, tokens);
	addToMap(state.costByModel, key, cost);
}

export function parsePiSessionStartFromFilename(name: string): Date | null {
	const match = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_/);
	if (!match) return null;
	const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
	return Number.isFinite(date.getTime()) ? date : null;
}

function parseIdFromFilename(name: string): string | null {
	return name.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_(.+)\.jsonl$/)?.[1] ?? null;
}

function textContent(content: unknown): string | null {
	if (typeof content === "string") return content.replace(/\s+/g, " ").trim() || null;
	if (!Array.isArray(content)) return null;
	const text = content.filter((part) => part && typeof part === "object" && (part as any).type === "text").map((part) => String((part as any).text ?? "")).join(" ").trim();
	return text ? text.replace(/\s+/g, " ") : null;
}

export function createPiSessionParseState(filePath: string): PiSessionParseState {
	return {
		filePath,
		sessionId: parseIdFromFilename(basename(filePath)),
		startedAt: parsePiSessionStartFromFilename(basename(filePath)),
		cwd: null,
		name: null,
		firstUserText: null,
		messages: 0,
		assistantTurns: 0,
		tokens: 0,
		totalCost: 0,
		estimatedCost: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
		contextTokensTotal: 0,
		contextSamples: 0,
		contextTokenSamples: [],
		maxContextTokens: 0,
		skippedLines: 0,
		modelsUsed: new Set(),
		thinkingLevelsUsed: new Set(),
		actualConfiguration: { provider: null, model: null, thinking: null },
		messagesByModel: new Map(),
		tokensByModel: new Map(),
		costByModel: new Map(),
		availability: { inputTokens: false, outputTokens: false, cacheReadTokens: false, cacheWriteTokens: false, totalTokens: false, reportedCost: false, estimatedCost: false, context: false, maxContext: false },
		currentModel: null,
		usesUsageLedger: false,
		entryModels: new Map(),
		usageRecords: [],
	};
}

export function parsePiSessionLine(state: PiSessionParseState, line: string): void {
	if (!line.trim()) return;
	let entry: any;
	try { entry = JSON.parse(line); } catch { state.skippedLines += 1; return; }

	if (entry?.kind === "header" && entry?.version === 4) {
		state.usesUsageLedger = true;
		if (typeof entry.id === "string" && entry.id.trim()) state.sessionId = entry.id.trim();
		if (!state.startedAt && Number.isSafeInteger(entry.createdAt)) state.startedAt = new Date(entry.createdAt);
		if (typeof entry.cwd === "string" && entry.cwd.trim()) state.cwd = entry.cwd.trim();
		return;
	}
	if (entry?.type === "session") {
		if (typeof entry.id === "string" && entry.id.trim()) state.sessionId = entry.id.trim();
		if (!state.startedAt && typeof entry.timestamp === "string") {
			const date = new Date(entry.timestamp);
			if (Number.isFinite(date.getTime())) state.startedAt = date;
		}
		if (typeof entry.cwd === "string" && entry.cwd.trim()) state.cwd = entry.cwd.trim();
		return;
	}
	if (entry?.type === "session_info" || (entry?.kind === "fact" && entry?.fact === "name")) {
		if (typeof entry.name === "string" && entry.name.trim()) state.name = entry.name.trim();
		return;
	}
	if (entry?.type === "model_change") {
		const key = modelKey(entry.provider, entry.modelId ?? entry.model);
		if (key) {
			state.currentModel = key;
			state.modelsUsed.add(key);
			const split = splitModelKey(key);
			state.actualConfiguration.provider = split.provider;
			state.actualConfiguration.model = split.model;
		}
		return;
	}
	if (entry?.type === "thinking_level_change" && typeof entry.thinkingLevel === "string" && entry.thinkingLevel.trim()) {
		state.actualConfiguration.thinking = entry.thinkingLevel.trim();
		state.thinkingLevelsUsed.add(entry.thinkingLevel.trim());
		return;
	}
	if (entry?.kind === "record" && entry?.type === "usage") {
		state.usageRecords.push({ cause: String(entry.cause ?? "unknown"), entryId: entry.entryId, usage: entry.usage });
		return;
	}
	if (!state.usesUsageLedger && (entry?.type === "compaction" || entry?.type === "branch_summary") && entry?.usage) {
		addUsage(state, "Tools/summaries", entry.usage, false);
		return;
	}
	if (entry?.type !== "message") return;
	const role = entry?.message?.role ?? entry?.role;
	if (!state.firstUserText && role === "user") state.firstUserText = textContent(entry?.message?.content ?? entry?.content);
	const fields = extractMessageFields(entry);
	const key = modelKeyFromFields(fields.provider, fields.model, fields.modelId) ?? state.currentModel ?? "unknown";
	if (typeof entry.id === "string") state.entryModels.set(entry.id, key);
	state.messages += 1;
	if (role === "assistant") state.assistantTurns += 1;
	state.modelsUsed.add(key);
	addToMap(state.messagesByModel, key, 1);
	if (role === "assistant" && key !== "unknown") {
		const split = splitModelKey(key);
		state.actualConfiguration.provider = split.provider;
		state.actualConfiguration.model = split.model;
	}
	if (!state.usesUsageLedger) addUsage(state, key, fields.usage, true);
}

export function finalizePiSessionParseState(state: PiSessionParseState): ParsedPiSessionTelemetry {
	if (state.usesUsageLedger) {
		for (const record of state.usageRecords) {
			const key = record.cause === "assistant" || record.cause === "deferred_fetch"
				? (record.entryId && state.entryModels.get(record.entryId)) ?? "unknown"
				: "Tools/summaries";
			addUsage(state, key, record.usage, false);
		}
	}
	return state;
}

export function parsePiSessionLines(content: string, filePath = "session.jsonl"): ParsedPiSessionTelemetry {
	const state = createPiSessionParseState(filePath);
	for (const line of content.split(/\r?\n/)) parsePiSessionLine(state, line);
	return finalizePiSessionParseState(state);
}
