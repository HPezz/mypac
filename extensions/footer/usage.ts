import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FooterProviderUsage, FooterUsageWindow } from "./helpers.ts";

const PROVIDER_MAP: Record<string, "claude" | "codex" | "copilot"> = {
	anthropic: "claude",
	"openai-codex": "codex",
	"github-copilot": "copilot",
};

function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, value));
}

function normalizePercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return clampPercent(value >= 0 && value <= 1 ? value * 100 : value);
}

function formatResetTime(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	if (diffMs <= 0) return "now";
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	if (hours < 24) return remainingMinutes ? `${hours}h${remainingMinutes}m` : `${hours}h`;
	const days = Math.floor(hours / 24);
	const remainingHours = hours % 24;
	return remainingHours ? `${days}d${remainingHours}h` : `${days}d`;
}

function loadJson(path: string): any {
	try {
		if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
	} catch {}
	return {};
}

export function getAgentAuthPath(agentDir: string = getAgentDir()): string {
	return join(agentDir, "auth.json");
}

function loadAgentAuth(): any {
	return loadJson(getAgentAuthPath());
}

function getClaudeToken(): string | undefined {
	const auth = loadAgentAuth();
	return auth.anthropic?.access;
}

function getCopilotToken(): string | undefined {
	const auth = loadAgentAuth();
	return auth["github-copilot"]?.refresh;
}

function getCodexToken(): { token: string; accountId?: string } | undefined {
	const auth = loadAgentAuth();
	if (auth["openai-codex"]?.access) {
		return { token: auth["openai-codex"].access, accountId: auth["openai-codex"]?.accountId };
	}

	const codexAuth = loadJson(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"));
	if (codexAuth.OPENAI_API_KEY) return { token: codexAuth.OPENAI_API_KEY };
	if (codexAuth.tokens?.access_token) {
		return { token: codexAuth.tokens.access_token, accountId: codexAuth.tokens.account_id };
	}
	return undefined;
}

async function fetchJson(url: string, init: RequestInit): Promise<any | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);
	try {
		const response = await fetch(url, { ...init, signal: controller.signal });
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchClaudeUsage(): Promise<FooterProviderUsage | null> {
	const token = getClaudeToken();
	if (!token) return null;
	const data = await fetchJson("https://api.anthropic.com/api/oauth/usage", {
		headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
	});
	if (!data) return null;

	const windows: FooterUsageWindow[] = [];
	if (data.five_hour?.utilization !== undefined) {
		windows.push({
			label: "5h",
			usedPercent: normalizePercent(data.five_hour.utilization),
			resetsIn: data.five_hour.resets_at ? formatResetTime(new Date(data.five_hour.resets_at)) : undefined,
		});
	}
	if (data.seven_day?.utilization !== undefined) {
		windows.push({
			label: "Week",
			usedPercent: normalizePercent(data.seven_day.utilization),
			resetsIn: data.seven_day.resets_at ? formatResetTime(new Date(data.seven_day.resets_at)) : undefined,
		});
	}
	return windows.length ? { provider: "Claude", windows } : null;
}

async function fetchCopilotUsage(): Promise<FooterProviderUsage | null> {
	const token = getCopilotToken();
	if (!token) return null;
	const data = await fetchJson("https://api.github.com/copilot_internal/user", {
		headers: {
			"Editor-Version": "vscode/1.96.2",
			"User-Agent": "GitHubCopilotChat/0.26.7",
			"X-Github-Api-Version": "2025-04-01",
			Accept: "application/json",
			Authorization: `token ${token}`,
		},
	});
	if (!data) return null;

	const resetDate = data.quota_reset_date_utc ? new Date(data.quota_reset_date_utc) : undefined;
	const resetsIn = resetDate ? formatResetTime(resetDate) : undefined;
	const windows: FooterUsageWindow[] = [];
	const premium = data.quota_snapshots?.premium_interactions;
	if (premium) windows.push({ label: "Premium", usedPercent: clampPercent(100 - (premium.percent_remaining || 0)), resetsIn });
	const chat = data.quota_snapshots?.chat;
	if (chat && !chat.unlimited) windows.push({ label: "Chat", usedPercent: clampPercent(100 - (chat.percent_remaining || 0)), resetsIn });
	return windows.length ? { provider: "Copilot", windows } : null;
}

function getWindowLabel(seconds: number | undefined, fallback: string): string {
	if (!seconds || !Number.isFinite(seconds)) return fallback;
	const hours = Math.round(seconds / 3600);
	if (hours >= 1 && hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	return days >= 1 ? `${days}d` : fallback;
}

async function fetchCodexUsage(): Promise<FooterProviderUsage | null> {
	const creds = getCodexToken();
	if (!creds) return null;
	const headers: Record<string, string> = {
		Authorization: `Bearer ${creds.token}`,
		"User-Agent": "pi-agent",
		Accept: "application/json",
	};
	if (creds.accountId) headers["ChatGPT-Account-Id"] = creds.accountId;
	const data = await fetchJson("https://chatgpt.com/backend-api/wham/usage", { method: "GET", headers });
	if (!data) return null;

	const windows: FooterUsageWindow[] = [];
	for (const [key, fallback] of [
		["primary_window", "5h"],
		["secondary_window", "Week"],
	] as const) {
		const window = data.rate_limit?.[key];
		if (!window) continue;
		windows.push({
			label: getWindowLabel(window.limit_window_seconds, fallback),
			usedPercent: clampPercent(window.used_percent || 0),
			resetsIn: window.reset_at ? formatResetTime(new Date(window.reset_at * 1000)) : undefined,
		});
	}
	return windows.length ? { provider: "Codex", windows } : null;
}

export function detectUsageProvider(modelProvider: string | undefined): "claude" | "codex" | "copilot" | null {
	return modelProvider ? (PROVIDER_MAP[modelProvider] ?? null) : null;
}

export async function fetchProviderUsage(provider: "claude" | "codex" | "copilot"): Promise<FooterProviderUsage | null> {
	switch (provider) {
		case "claude":
			return fetchClaudeUsage();
		case "codex":
			return fetchCodexUsage();
		case "copilot":
			return fetchCopilotUsage();
	}
}
