/**
 * WSL Shell Provider
 *
 * Provides configuration and utilities for spawning shells within WSL.
 * Used when the user wants to work with Linux-based development environments
 * on Windows through WSL.
 */

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import type { WslDistribution } from "./detect";
import {
	getDefaultWslDistribution,
	getDistributionFromWslPath,
	isWslPath,
	listWslDistributions,
	wslPathToInternal,
} from "./detect";

/**
 * Configuration for a WSL shell
 */
export interface WslShellConfig {
	/** The WSL distribution to use */
	distribution: string;
	/** The shell to run (e.g., "/bin/bash", "/bin/zsh") */
	shell: string;
	/** Default arguments to pass to the shell */
	shellArgs?: string[];
}

/**
 * Result of a shell configuration lookup
 */
export type ShellLookupResult =
	| { success: true; config: WslShellConfig }
	| { success: false; reason: string };

/**
 * Get the default WSL shell configuration
 *
 * Uses the default WSL distribution and the user's default shell in that distribution.
 */
export function getDefaultWslShell(): ShellLookupResult {
	const distro = getDefaultWslDistribution();

	if (!distro) {
		return {
			success: false,
			reason: "No WSL distributions found",
		};
	}

	const shell = getWslShellForDistribution(distro.distributionName);

	if (!shell) {
		return {
			success: false,
			reason: `Could not determine default shell for ${distro.name}`,
		};
	}

	return {
		success: true,
		config: {
			distribution: distro.distributionName,
			shell,
		},
	};
}

/**
 * Get the default shell for a WSL distribution
 */
export function getWslShellForDistribution(
	distribution: string,
): string | null {
	if (process.platform !== "win32") {
		return null;
	}

	try {
		// Try to get the default shell from the distribution
		// First try reading /etc/passwd to find the default user's shell
		const passwdEntry = execFileSync(
			"wsl.exe",
			["-d", distribution, "--", "getent", "passwd", "$(id -ru)"],
			{
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		// Format: username:password:uid:gid:gecos:home:shell
		const parts = passwdEntry.trim().split(":");
		if (parts.length >= 7) {
			return parts[6];
		}
	} catch {
		// Fall through to defaults
	}

	// Fallback: check common shell paths
	const commonShells = ["/bin/bash", "/bin/zsh", "/bin/sh"];
	for (const shell of commonShells) {
		try {
			execFileSync(
				"wsl.exe",
				["-d", distribution, "--", "test", "-f", shell],
				{
					stdio: ["pipe", "pipe", "pipe"],
				},
			);
			return shell;
		} catch {
			// Shell doesn't exist at this path
		}
	}

	return null;
}

/**
 * Get shell configuration for a given path
 *
 * If the path is a WSL path, returns a WSL shell configuration
 * for the appropriate distribution. Otherwise returns null.
 */
export function getWslShellForPath(
	path: string | undefined,
): ShellLookupResult | null {
	if (!path) {
		return null;
	}

	// Check if path is a WSL path
	if (!isWslPath(path)) {
		return null;
	}

	const distroName = getDistributionFromWslPath(path);
	if (!distroName) {
		return null;
	}

	// Check if the distribution exists
	const distros = listWslDistributions();
	const distro = distros.find(
		(d) =>
			d.distributionName === distroName ||
			d.name.toLowerCase() === distroName.toLowerCase(),
	);

	if (!distro) {
		return {
			success: false,
			reason: `WSL distribution "${distroName}" not found`,
		};
	}

	const shell = getWslShellForDistribution(distro.distributionName);
	if (!shell) {
		return {
			success: false,
			reason: `Could not determine shell for ${distro.name}`,
		};
	}

	return {
		success: true,
		config: {
			distribution: distro.distributionName,
			shell,
		},
	};
}

/**
 * Build the wsl.exe command line for spawning a shell
 */
export function buildWslShellCommand(
	config: WslShellConfig,
	options?: {
		workingDirectory?: string;
		environment?: Record<string, string>;
	},
): { command: string; args: string[] } {
	const args: string[] = ["-d", config.distribution];

	// Build the shell command with optional cd and environment
	const shellCommandParts: string[] = [];

	// Add environment variables if provided
	if (options?.environment) {
		for (const [key, value] of Object.entries(options.environment)) {
			shellCommandParts.push(`export ${key}='${value.replace(/'/g, "'\\''")}';`);
		}
	}

	// Add cd to working directory if provided
	if (options?.workingDirectory) {
		const internalPath = wslPathToInternal(options.workingDirectory);
		if (internalPath) {
			shellCommandParts.push(`cd '${internalPath.replace(/'/g, "'\\''")}'`);
		}
	}

	// Add the shell invocation
	const shellWithArgs = config.shellArgs
		? `${config.shell} ${config.shellArgs.join(" ")}`
		: config.shell;

	if (shellCommandParts.length > 0) {
		// Use bash -c to run multiple commands
		const fullCommand = shellCommandParts.join(" ") + " && " + shellWithArgs;
		args.push("--", "bash", "-c", fullCommand);
	} else {
		args.push("--", shellWithArgs);
	}

	return {
		command: "wsl.exe",
		args,
	};
}

/**
 * Get WSL shell configuration with user preferences
 *
 * Takes into account:
 * 1. User's preferred distribution (from settings)
 * 2. Distribution inferred from working directory
 * 3. Default distribution
 */
export function getWslShellWithPreferences(options?: {
	preferredDistribution?: string;
	workingDirectory?: string;
}): ShellLookupResult {
	// First, try to infer from working directory
	if (options?.workingDirectory) {
		const wslShell = getWslShellForPath(options.workingDirectory);
		if (wslShell) {
			return wslShell;
		}
	}

	// Second, try user's preferred distribution
	if (options?.preferredDistribution) {
		const shell = getWslShellForDistribution(options.preferredDistribution);
		if (shell) {
			return {
				success: true,
				config: {
					distribution: options.preferredDistribution,
					shell,
				},
			};
		}
	}

	// Fall back to default
	return getDefaultWslShell();
}

/**
 * Get environment variables for WSL shell execution
 *
 * Includes DISPLAY for X11 forwarding if available.
 */
export function getWslShellEnvironment(): Record<string, string> {
	const env: Record<string, string> = {};

	if (process.platform === "win32") {
		// Set DISPLAY to use Windows X server if available
		// This allows GUI applications to display on Windows
		try {
			// Check if WSLENV is set with DISPLAY
			// Most WSL installations have a Windows X server configured
			env.DISPLAY = ":0";
		} catch {
			// Ignore
		}
	}

	return env;
}
