import {
	type ExecFileOptionsWithStringEncoding,
	execFile,
	execFileSync,
} from "node:child_process";
import { promisify } from "node:util";
import simpleGit, { type SimpleGit } from "simple-git";
import { getProcessEnvWithShellPath } from "./shell-env";
import { isWslPath, getDistributionFromWslPath, wslPathToInternal } from "../../../../../main/lib/wsl/detect";

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

/**
 * Check if a path is a WSL path (re-export for convenience)
 */
export { isWslPath, wslPathToInternal };

/**
 * Get a simple-git instance for the given path.
 * 
 * NOTE: For WSL paths, this returns a simple-git instance without a baseDir,
 * because simple-git cannot validate WSL paths from Windows. Operations on
 * WSL repos should prefer execGitWithShellPath for proper WSL git execution.
 */
export async function getSimpleGitWithShellPath(
	repoPath?: string,
): Promise<SimpleGit> {
	// For WSL paths, we can't use simple-git with a baseDir because it
	// validates the directory exists using Windows file APIs.
	// Return a simple-git instance without a baseDir - operations will fail
	// if they try to use it, but at least instantiation won't throw.
	if (repoPath && isWslRepoPath(repoPath)) {
		// Return simple-git without baseDir - operations should use execGitWithShellPath
		const git = simpleGit();
		git.env(await getProcessEnvWithShellPath());
		return git;
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
			// Execute git via WSL - use git -C to set working directory
			// Note: We don't use cwd option because Windows can't set Linux paths as cwd
			return execFileAsync(
				"wsl.exe",
				["-d", distribution, "--", "git", "-C", internalPath, ...args],
				{
					encoding: "utf8",
					env,
					// Don't set cwd - it won't work with Linux paths on Windows
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
			// Execute git via WSL synchronously - use git -C to set working directory
			const result = execFileSync(
				"wsl.exe",
				["-d", distribution, "--", "git", "-C", internalPath, ...args],
				{
					encoding: "utf8",
					env: process.env,
					// Don't set cwd - it won't work with Linux paths on Windows
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
