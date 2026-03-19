/**
 * WSL Path Utilities
 *
 * Utilities for converting between Windows paths, WSL UNC paths (\\wsl$\...),
 * and WSL internal paths (/mnt/...).
 */

import path from "node:path";

/**
 * Check if a path is a WSL UNC path (\\wsl$\...)
 *
 * These paths are Windows representations of WSL filesystem paths.
 * e.g., "\\wsl$\Ubuntu\home\user" or "//wsl$/Ubuntu/home/user"
 */
export function isWslPath(inputPath: string): boolean {
	return (
		inputPath.startsWith("\\\\wsl$\\") || inputPath.startsWith("//wsl$/")
	);
}

/**
 * Check if a path is a Unix-style path (starts with /)
 *
 * This includes both native Unix paths and WSL internal paths.
 */
export function isUnixPath(inputPath: string): boolean {
	return inputPath.startsWith("/");
}

/**
 * Extract the distribution name from a WSL UNC path
 *
 * e.g., "\\wsl$\Ubuntu\home\user" -> "Ubuntu"
 * e.g., "//wsl$/Ubuntu/home/user" -> "Ubuntu"
 */
export function getDistributionFromWslPath(wslPath: string): string | null {
	if (!isWslPath(wslPath)) {
		return null;
	}

	// Remove \\wsl$\ or //wsl$/ prefix
	const pathWithoutPrefix = wslPath
		.replace(/^\\\\wsl\$\\/, "")
		.replace(/^\/\/wsl\$\//, "");

	// Split by both backslash and forward slash
	const parts = pathWithoutPrefix.split("\\").join("/").split("/");

	return parts[0] || null;
}

/**
 * Convert a WSL UNC path to a WSL internal path
 *
 * e.g., "\\wsl$\Ubuntu\home\user" -> "/home/user"
 * e.g., "//wsl$/Ubuntu/home/user" -> "/home/user"
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
 * e.g., "/home/user" with distribution "Ubuntu" -> "\\\\wsl$\\Ubuntu\\home\\user"
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
 * Check if a path is a WSL mount point path
 *
 * WSL mount points are typically under /mnt/<drive-letter>/
 * e.g., /mnt/c/Users -> c:\Users
 */
export function isWslMountPointPath(inputPath: string): boolean {
	// Match /mnt/<drive-letter>/... pattern
	const mountPointMatch = inputPath.match(/^\/mnt\/([a-z])\//i);
	return mountPointMatch !== null;
}

/**
 * Convert a WSL mount point path to a Windows path
 *
 * e.g., /mnt/c/Users -> C:\Users
 */
export function wslMountPointToWindows(wslMountPath: string): string | null {
	const match = wslMountPath.match(/^\/mnt\/([a-z])\/(.*)$/i);
	if (!match) {
		return null;
	}

	const [, driveLetter, rest] = match;
	const windowsPath = `${driveLetter.toUpperCase()}:\\${rest.replace(
		/\//g,
		"\\",
	)}`;
	return windowsPath;
}

/**
 * Convert a Windows path to a WSL mount point path
 *
 * e.g., C:\Users -> /mnt/c/Users
 */
export function windowsPathToWslMountPoint(
	windowsPath: string,
): string | null {
	const match = windowsPath.match(/^([A-Z]):\\(.*)$/i);
	if (!match) {
		return null;
	}

	const [, driveLetter, rest] = match;
	const wslPath = `/mnt/${driveLetter.toLowerCase()}/${rest.replace(
		/\\/g,
		"/",
	)}`;
	return wslPath;
}

/**
 * Normalize a path that could be in any format (Windows, WSL UNC, Unix)
 *
 * Returns a normalized path in the format appropriate for the current platform.
 */
export function normalizeWslPath(inputPath: string): string {
	// If it's a WSL UNC path, convert to internal path
	if (isWslPath(inputPath)) {
		const internal = wslPathToInternal(inputPath);
		if (internal) {
			return internal;
		}
	}

	// If it's a Unix path (including WSL mount points), return as-is
	if (isUnixPath(inputPath)) {
		return inputPath;
	}

	// If it's a Windows path, try to convert to WSL mount point or return as-is
	const wslMount = windowsPathToWslMountPoint(inputPath);
	if (wslMount) {
		return wslMount;
	}

	// Fallback: return as-is and let the system handle it
	return inputPath;
}

/**
 * Get the canonical path for a WSL-based project
 *
 * Returns the WSL internal path (e.g., /home/user/project) which is
 * the canonical form for WSL environments.
 */
export function getCanonicalWslPath(
	inputPath: string,
	distribution?: string,
): string {
	// If it's already a Unix path, return as-is
	if (isUnixPath(inputPath)) {
		return inputPath;
	}

	// If it's a WSL UNC path, convert to internal
	if (isWslPath(inputPath)) {
		const internal = wslPathToInternal(inputPath);
		if (internal) {
			return internal;
		}
	}

	// If it's a Windows path, we need a distribution to convert
	if (distribution) {
		// Try to use wslpath command if available
		try {
			const { execSync } = require("node:child_process");
			const result = execSync(
				`wsl.exe -d ${distribution} -- wslpath -a -w "${inputPath}"`,
				{
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				},
			);
			const windowsPath = result.trim();
			// Now convert Windows path to WSL internal path
			if (distribution) {
				const wslPath = internalPathToWsl(windowsPath, distribution);
				return wslPathToInternal(wslPath) ?? windowsPath;
			}
			return windowsPath;
		} catch {
			// Fall through to simple mapping
		}

		// Simple fallback for drive letters
		const wslMount = windowsPathToWslMountPoint(inputPath);
		if (wslMount) {
			return wslMount;
		}
	}

	// Fallback: return as-is
	return inputPath;
}
