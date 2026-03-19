/**
 * WSL Detection Utility
 *
 * Utilities for detecting and interacting with WSL (Windows Subsystem for Linux)
 * on Windows systems. Used to enable terminal sessions and file operations
 * through WSL when the user prefers Linux-based development environments.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Result of WSL detection check
 */
export interface WslDetectionResult {
	/** Whether WSL is available on this system */
	isWslAvailable: boolean;
	/** Whether we're currently running inside WSL */
	isRunningUnderWsl: boolean;
	/** The WSL distribution we're running under (if applicable) */
	distribution: string | null;
}

/**
 * Information about a WSL distribution
 */
export interface WslDistribution {
	/** Display name (e.g., "Ubuntu", "Ubuntu-22.04") */
	name: string;
	/** The distribution name used by wsl.exe commands */
	distributionName: string;
	/** Default user UID */
	defaultUid: number;
	/** Whether this is the default distribution */
	isDefault: boolean;
}

/**
 * Check if we're running under WSL
 *
 * On WSL, /proc/version contains "Microsoft" or "WSL"
 */
export function isRunningUnderWsl(): boolean {
	try {
		const content = existsSync("/proc/version")
			? readFileSync("/proc/version", "utf-8")
			: "";
		return (
			content.toLowerCase().includes("microsoft") ||
			content.toLowerCase().includes("wsl")
		);
	} catch {
		return false;
	}
}

/**
 * Check if WSL is available on this Windows system
 *
 * WSL availability is determined by:
 * 1. We're on Windows (not Unix)
 * 2. The wsl.exe command exists and is executable
 */
export function isWslAvailable(): boolean {
	if (process.platform !== "win32") {
		return false;
	}

	try {
		// Try to run wsl.exe --status to check availability
		// This command exists even if WSL is not enabled
		execFileSync("wsl.exe", ["--status"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return true;
	} catch {
		// If the command fails, WSL might not be installed or enabled
		return false;
	}
}

/**
 * Get WSL detection result in one call
 */
export function detectWsl(): WslDetectionResult {
	const runningUnderWsl = isRunningUnderWsl();
	const wslAvailable = isWslAvailable();

	return {
		isWslAvailable: wslAvailable,
		isRunningUnderWsl: runningUnderWsl,
		distribution: runningUnderWsl ? getWslDistribution() : null,
	};
}

/**
 * Get the current WSL distribution name when running under WSL
 */
export function getWslDistribution(): string | null {
	if (process.platform !== "win32") {
		return null;
	}

	try {
		// When running in WSL, /etc/wsl.conf contains the distribution info
		const wslConfPath = "/etc/wsl.conf";
		if (existsSync(wslConfPath)) {
			const content = readFileSync(wslConfPath, "utf-8");
			const match = content.match(/^\s*name\s*=\s*(.*)$/m);
			if (match) {
				return match[1].trim();
			}
		}

		// Alternative: use os.release() to get release info
		const osRelease = (require("node:os") as typeof import("node:os")).release()
			.toLowerCase();
		if (osRelease.includes("microsoft") || osRelease.includes("wsl")) {
			// Try to get from PRETTY_NAME in /etc/os-release
			try {
				const osReleaseContent = readFileSync("/etc/os-release", "utf-8");
				const prettyMatch = osReleaseContent.match(/PRETTY_NAME="([^"]+)"/);
				if (prettyMatch) {
					return prettyMatch[1];
				}
			} catch {
				// Ignore
			}
		}
	} catch {
		// Ignore errors
	}

	return null;
}

/**
 * List available WSL distributions
 */
export function listWslDistributions(): WslDistribution[] {
	if (process.platform !== "win32") {
		return [];
	}

	try {
		const output = execFileSync("wsl.exe", ["--list", "--verbose"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});

		const distributions: WslDistribution[] = [];
		const lines = output.split("\n");

		// Skip header line and any empty lines
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.includes("NAME") || trimmed.includes("---")) {
				continue;
			}

			// Parse the line: "* Ubuntu-22.04    Running         2"
			// or "  Ubuntu-20.04    Stopped        1"
			const match = trimmed.match(
				/^[*\s]+(\S+(?:-\d+(?:\.\d+)?)?)\s+(\S+)\s+(\d+)/,
			);
			if (match) {
				const [, name, _state, uid] = match;
				const isDefault = trimmed.startsWith("*");
				distributions.push({
					name,
					distributionName: name,
					defaultUid: parseInt(uid, 10),
					isDefault,
				});
			}
		}

		return distributions;
	} catch {
		return [];
	}
}

/**
 * Get the default WSL distribution
 */
export function getDefaultWslDistribution(): WslDistribution | null {
	const distributions = listWslDistributions();
	return distributions.find((d) => d.isDefault) ?? distributions[0] ?? null;
}

/**
 * Check if a path is a WSL UNC path (\\wsl$\...)
 *
 * These paths are Windows representations of WSL filesystem paths.
 */
export function isWslPath(path: string): boolean {
	return path.startsWith("\\\\wsl$\\") || path.startsWith("//wsl$/");
}

/**
 * Extract the distribution name from a WSL UNC path
 *
 * e.g., "\\wsl$\Ubuntu\home\user" -> "Ubuntu"
 */
export function getDistributionFromWslPath(wslPath: string): string | null {
	if (!isWslPath(wslPath)) {
		return null;
	}

	// Remove \\wsl$\ or //wsl$/ prefix
	const pathWithoutPrefix = wslPath
		.replace(/^\\\\wsl\$\\/, "")
		.replace(/^\/\/wsl\$\//, "");

	// The first component is the distribution name
	const parts = pathWithoutPrefix.split("\\").join("/").split("/");
	return parts[0] || null;
}

/**
 * Convert a WSL UNC path to a WSL internal path
 *
 * e.g., "\\wsl$\Ubuntu\home\user" -> "/home/user"
 */
export function wslPathToInternal(wslPath: string): string | null {
	if (!isWslPath(wslPath)) {
		return null;
	}

	// Remove \\wsl$\ or //wsl$/ prefix and distribution name
	const pathWithoutPrefix = wslPath
		.replace(/^\\\\wsl\$\\/, "")
		.replace(/^\/\/wsl\$\//, "");

	// Split by both backslash and forward slash
	const parts = pathWithoutPrefix.split("\\").join("/").split("/");

	// Remove the distribution name (first part) and join the rest
	if (parts.length < 2) {
		return null;
	}

	const internalPath = "/" + parts.slice(1).join("/");
	return internalPath;
}

/**
 * Convert a WSL internal path to a UNC path
 *
 * e.g., "/home/user" -> "\\\\wsl$\\Ubuntu\\home\\user"
 */
export function internalPathToWsl(
	internalPath: string,
	distribution: string,
): string {
	// Normalize path separators and remove leading slash
	const normalizedPath = internalPath.replace(/^\//, "").replace(
		/\//g,
		"\\",
	);
	return `\\\\wsl$\\${distribution}\\${normalizedPath}`;
}

/**
 * Convert a Windows path to a WSL path within a specific distribution
 *
 * Uses the WSL path conversion utility if available.
 */
export function windowsPathToWsl(
	windowsPath: string,
	distribution: string,
): string {
	// If it's already a WSL path, return as-is
	if (isWslPath(windowsPath)) {
		return windowsPath;
	}

	// Handle Windows paths like C:\Users\user -> /mnt/c/Users/user
	// or use wsl.exe -d <distro> -- wslpath -a -w /home/user
	try {
		const result = execFileSync(
			"wsl.exe",
			["-d", distribution, "--", "wslpath", "-a", "-w", windowsPath],
			{
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		return result.trim();
	} catch {
		// Fallback: simple mapping for common paths
		// This is a simplified fallback - real implementation would need
		// proper path mapping based on WSL mount points
		const match = windowsPath.match(/^([A-Z]):\\(.*)$/i);
		if (match) {
			const [, drive, rest] = match;
			const wslDrive = `/mnt/${drive.toLowerCase()}`;
			const normalizedRest = rest.replace(/\\/g, "/");
			return `${wslDrive}/${normalizedRest}`;
		}
		return windowsPath;
	}
}

/**
 * Get the home directory path within WSL for a given distribution
 */
export function getWslHomeDirectory(distribution: string): string {
	if (process.platform === "win32") {
		try {
			const result = execFileSync(
				"wsl.exe",
				["-d", distribution, "--", "echo", "$HOME"],
				{
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				},
			);
			return result.trim();
		} catch {
			// Fallback
		}
	}
	return homedir();
}
