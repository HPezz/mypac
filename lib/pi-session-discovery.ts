import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { getSessionRoot } from "./agent-dir.ts";
import {
	createPiSessionParseState,
	finalizePiSessionParseState,
	parsePiSessionLine,
	parsePiSessionStartFromFilename,
} from "./pi-session-telemetry.ts";

export interface PiSessionDiscoveryMetadata {
	filePath: string;
	sessionId: string | null;
	startedAt: Date | null;
	cwd: string | null;
	repository: string | null;
	messages: number;
	skippedLines: number;
}

export interface DiscoverPiSessionsOptions {
	root?: string;
	repository?: string;
	limit?: number;
	signal?: AbortSignal;
}

export interface PiSessionFileScan {
	files: string[];
	unreadableFiles: number;
	lastError?: string;
}

const canonicalDirectoryGroupCache = new Map<string, Promise<string>>();

function getErrorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

function localMidnight(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function inferCanonicalRepoPathFromWorktreePath(path: string): string | null {
	const normalized = path.replace(/\\/g, "/");
	const match = normalized.match(/^(.*\/dev)\/worktrees\/([^/]+)\/([^/]+)(?:\/.*)?$/);
	return match ? `${match[1]}/${match[2]}/${match[3]}` : null;
}

async function resolveCanonicalDirectoryGroupUncached(cwd: string): Promise<string> {
	const worktreeFallback = inferCanonicalRepoPathFromWorktreePath(cwd);
	let current = cwd;
	while (true) {
		const dotGit = join(current, ".git");
		try {
			const metadata = await stat(dotGit);
			if (metadata.isDirectory()) return current;
			if (metadata.isFile()) {
				const text = await readFile(dotGit, "utf8");
				const match = text.match(/^gitdir:\s*(.+)\s*$/m);
				if (!match) return current;
				const gitDir = resolve(current, match[1]);
				const commonDirText = await readFile(join(gitDir, "commondir"), "utf8").catch(() => "");
				const commonGitDir = commonDirText.trim() ? resolve(gitDir, commonDirText.trim()) : gitDir;
				return basename(commonGitDir) === ".git" ? dirname(commonGitDir) : current;
			}
		} catch {
			// Keep walking toward the filesystem root.
		}
		const parent = dirname(current);
		if (parent === current) return worktreeFallback ?? cwd;
		current = parent;
	}
}

export async function resolveCanonicalDirectoryGroup(cwd: string): Promise<string> {
	let cached = canonicalDirectoryGroupCache.get(cwd);
	if (!cached) {
		cached = resolveCanonicalDirectoryGroupUncached(cwd).catch((error) => {
			canonicalDirectoryGroupCache.delete(cwd);
			throw error;
		});
		canonicalDirectoryGroupCache.set(cwd, cached);
	}
	return cached;
}

export async function walkPiSessionFiles(root: string, cutoff?: Date, signal?: AbortSignal): Promise<PiSessionFileScan> {
	const files: string[] = [];
	let unreadableFiles = 0;
	let lastError: string | undefined;
	const stack = [root];
	while (stack.length > 0) {
		if (signal?.aborted) break;
		const dir = stack.pop();
		if (!dir) continue;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch (error) {
			if (getErrorCode(error) !== "ENOENT") {
				unreadableFiles += 1;
				lastError = `Could not read ${basename(dir)}`;
			}
			continue;
		}
		for (const entry of entries) {
			const filePath = join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(filePath);
				continue;
			}
			if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
			const filenameDate = parsePiSessionStartFromFilename(entry.name);
			if (filenameDate) {
				if (!cutoff || localMidnight(filenameDate) >= cutoff) files.push(filePath);
				continue;
			}
			try {
				const stats = await stat(filePath);
				if (!cutoff || localMidnight(new Date(stats.mtimeMs)) >= cutoff) files.push(filePath);
			} catch {
				unreadableFiles += 1;
				lastError = `Could not stat ${entry.name}`;
			}
		}
	}
	return { files, unreadableFiles, lastError };
}

async function readMetadata(filePath: string, signal?: AbortSignal): Promise<PiSessionDiscoveryMetadata | null> {
	const state = createPiSessionParseState(filePath);
	const stream = createReadStream(filePath, { encoding: "utf8" });
	const reader = createInterface({ input: stream, crlfDelay: Infinity });
	try {
		for await (const line of reader) {
			if (signal?.aborted) return null;
			parsePiSessionLine(state, line);
		}
		const parsed = finalizePiSessionParseState(state);
		const repository = parsed.cwd ? await resolveCanonicalDirectoryGroup(parsed.cwd).catch(() => parsed.cwd) : null;
		return {
			filePath,
			sessionId: parsed.sessionId,
			startedAt: parsed.startedAt,
			cwd: parsed.cwd,
			repository,
			messages: parsed.messages,
			skippedLines: parsed.skippedLines,
		};
	} catch {
		return null;
	} finally {
		reader.close();
		stream.destroy();
	}
}

export async function discoverPiSessions(options: DiscoverPiSessionsOptions = {}): Promise<PiSessionDiscoveryMetadata[]> {
	const root = options.root ?? getSessionRoot();
	const scan = await walkPiSessionFiles(root, undefined, options.signal);
	const sessions: PiSessionDiscoveryMetadata[] = [];
	for (const filePath of scan.files.sort()) {
		if (options.signal?.aborted) break;
		const metadata = await readMetadata(filePath, options.signal);
		if (!metadata) continue;
		if (options.repository && metadata.repository !== options.repository && basename(metadata.repository ?? "") !== options.repository) continue;
		sessions.push(metadata);
	}
	sessions.sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) || a.filePath.localeCompare(b.filePath));
	return sessions.slice(0, Math.max(0, options.limit ?? 20));
}
