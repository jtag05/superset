import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
	execFileSync,
} from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";
import { isWslPath, getDistributionFromWslPath } from "../../../../../main/lib/wsl/detect";
import { wslPathToInternal } from "../../../../../main/lib/wsl/detect";

const execFileAsync = promisify(execFile);

/**
 * Normalize a path to string, handling URL type
 */
function normalizePathToString(path: string | URL | undefined): string | undefined {
	if (!path) return undefined;
	if (path instanceof URL) return path.pathname;
	return path;
}

/**
 * Check if a repo path is a WSL path
 */
function isWslRepoPath(repoPath: string | undefined): boolean {
	if (!repoPath) return false;
	return isWslPath(repoPath);
}

/**
 * Get WSL distribution for a repo path, if it's a WSL path
 */
function getWslDistributionForPath(
	repoPath: string | undefined,
): string | null {
	if (!repoPath) return null;
	return getDistributionFromWslPath(repoPath);
}

/**
 * Convert a WSL UNC path to internal path for use with WSL git
 */
function toWslInternalPath(repoPath: string): string {
	const internal = wslPathToInternal(repoPath);
	return internal ?? repoPath;
}

export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	// For WSL paths, we need to use simple-git with WSL git
	if (isWslRepoPath(repoPath)) {
		const distribution = getWslDistributionForPath(repoPath);
		if (distribution) {
			const internalPath = toWslInternalPath(repoPath!);
			// Create a simple-git instance that will use WSL git
			const git = simpleGit({
				baseDir: internalPath,
				config: [
					`core.fsmonitor=true`,
				],
			});
			// The actual git commands will be wrapped via execGitWithShellPath
			return git;
		}
	}

	const git = repoPath ? simpleGit(repoPath) : simpleGit();
	git.env(await getProcessEnvWithShellPath());
	return git;
}

export async function execGitWithShellPath(
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): Promise<{ stdout: string; stderr: string }> {
	const env = await getProcessEnvWithShellPath(
		options?.env ? { ...process.env, ...options.env } : process.env,
	);

	// Check if this is a WSL repo path from the options.cwd
	const repoPath = normalizePathToString(options?.cwd);
	if (isWslRepoPath(repoPath)) {
		const distribution = getWslDistributionForPath(repoPath);
		if (distribution) {
			const internalPath = toWslInternalPath(repoPath!);
			// Execute git via WSL
			return execFileAsync(
				"wsl.exe",
				["-d", distribution, "--", "git", ...args],
				{
					...options,
					encoding: "utf8",
					env,
					cwd: internalPath,
				},
			);
		}
	}

	return execFileAsync("git", args, {
		...options,
		encoding: "utf8",
		env,
	});
}

/**
 * Execute a git command, automatically using WSL git for WSL paths
 *
 * This is a synchronous version that detects WSL paths automatically.
 */
export function execGitWithShellPathSync(
	args: string[],
	options?: Omit<ExecFileOptionsWithStringEncoding, "encoding">,
): { stdout: string; stderr: string } {
	// Check if this is a WSL repo path from the options.cwd
	const repoPath = normalizePathToString(options?.cwd);
	if (isWslRepoPath(repoPath)) {
		const distribution = getWslDistributionForPath(repoPath);
		if (distribution) {
			const internalPath = toWslInternalPath(repoPath!);
			// Execute git via WSL synchronously
			const result = execFileSync(
				"wsl.exe",
				["-d", distribution, "--", "git", ...args],
				{
					...options,
					encoding: "utf8",
					env: process.env,
					cwd: internalPath,
				},
			) as string;
			return { stdout: result, stderr: "" };
		}
	}

	const result = execFileSync("git", args, {
		...options,
		encoding: "utf8",
		env: process.env,
	}) as string;
	return { stdout: result, stderr: "" };
}
