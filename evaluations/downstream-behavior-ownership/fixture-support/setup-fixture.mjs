import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const remote = path.join(root, ".fixture-state", "remote.git");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();

await rm(path.dirname(remote), { recursive: true, force: true });
await mkdir(path.dirname(remote), { recursive: true });
await writeFile(path.join(path.dirname(remote), "user-pull-request-body.md"), "## Summary\n\nImplement the requested change.\n");
git(root, "init", "--bare", "-q", remote);
git(root, "remote", "add", "origin", remote);
const defaultBranch = git(root, "branch", "--show-current");
git(root, "push", "-q", "origin", `${defaultBranch}:${defaultBranch}`);

try {
	git(root, "config", "core.hooksPath", ".githooks");
} catch {
	// Fixtures without hooks need no additional setup.
}
