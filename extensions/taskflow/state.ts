import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentDir } from "../../lib/agent-dir.ts";
import type { TaskPointer } from "./types.ts";

function pointerPath(cwd: string, env: NodeJS.ProcessEnv): string {
	const key = crypto.createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 24);
	return path.join(resolveAgentDir(env), "taskflow", "active", `${key}.json`);
}

function isTaskPointer(value: unknown): value is TaskPointer {
	if (!value || typeof value !== "object") return false;
	const pointer = value as Record<string, unknown>;
	const repository = pointer.repository as Record<string, unknown> | undefined;
	return Boolean(
		repository && repository.provider === "gitlab" &&
		typeof repository.host === "string" && typeof repository.project === "string" &&
		typeof pointer.iid === "number" && Number.isSafeInteger(pointer.iid) && pointer.iid > 0 &&
		typeof pointer.webUrl === "string" && typeof pointer.selectedAt === "string",
	);
}

export async function readTaskPointer(
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<TaskPointer | null> {
	try {
		const parsed = JSON.parse(await fs.readFile(pointerPath(cwd, env), "utf8")) as { cwd?: unknown; pointer?: unknown };
		return parsed.cwd === path.resolve(cwd) && isTaskPointer(parsed.pointer) ? parsed.pointer : null;
	} catch (error: any) {
		if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
		throw error;
	}
}

export async function writeTaskPointer(
	cwd: string,
	pointer: TaskPointer,
	env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
	const target = pointerPath(cwd, env);
	await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
	const temporary = `${target}.${process.pid}.tmp`;
	await fs.writeFile(temporary, `${JSON.stringify({ cwd: path.resolve(cwd), pointer }, null, 2)}\n`, { mode: 0o600 });
	await fs.rename(temporary, target);
}
