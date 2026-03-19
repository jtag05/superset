import { homedir } from "node:os";
import { join } from "node:path";
import { type SelectProject, settings } from "@superset/local-db";
import { localDb } from "main/lib/local-db";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import { isWslPath, getDistributionFromWslPath } from "../../../../../main/lib/wsl/detect";

/**
 * Resolves base dir: project override > global setting > default (~/.superset/worktrees)
 *
 * When the project is located in WSL (detected via mainRepoPath being a WSL UNC path),
 * the worktree path will use the WSL distribution's home directory as the base.
 */
export function resolveWorktreePath(
	project: Pick<SelectProject, "name" | "worktreeBaseDir" | "mainRepoPath">,
	branch: string,
): string {
	if (project.worktreeBaseDir) {
		return join(project.worktreeBaseDir, project.name, branch);
	}

	const row = localDb.select().from(settings).get();
	const baseDir =
		row?.worktreeBaseDir ??
		join(homedir(), SUPERSET_DIR_NAME, WORKTREES_DIR_NAME);

	// Check if the main repository is a WSL path
	if (project.mainRepoPath && isWslPath(project.mainRepoPath)) {
		const distribution = getDistributionFromWslPath(project.mainRepoPath);
		if (distribution) {
			// For WSL projects, construct path using WSL home directory
			// e.g., ~/.superset-worktrees/ProjectName/branch -> /home/user/.superset-worktrees/ProjectName/branch
			try {
				const { execSync } = require("node:child_process");
				const wslHome = execSync(
					`wsl.exe -d ${distribution} -- echo $HOME`,
					{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
				).trim();

				// Construct the WSL-style worktree path
				const normalizedBase = baseDir.replace(/\\/g, "/");
				const wslWorktreeBase = join(wslHome, normalizedBase.replace(/^\//, "")).replace(
					/\\/g,
					"/",
				);
				return join(wslWorktreeBase, project.name, branch).replace(/\\/g, "/");
			} catch {
				// Fall through to default behavior
			}
		}
	}

	return join(baseDir, project.name, branch);
}
