/**
 * Platform-agnostic IPC transport abstraction
 *
 * This module defines the interface for IPC transports that work across
 * different platforms (Unix domain sockets on macOS/Linux, named pipes on Windows).
 */

import { join } from "node:path";

/**
 * Callback for when data is received on the transport
 */
export type DataCallback = (data: string) => void;

/**
 * Callback for when an error occurs
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Callback for when the connection closes
 */
export type CloseCallback = () => void;

/**
 * Platform-agnostic IPC transport interface
 *
 * An IPC transport handles the low-level communication between processes.
 * On Unix systems this uses Unix domain sockets; on Windows it uses named pipes.
 */
export interface IpcTransport {
	/**
	 * Connect to or create the IPC endpoint
	 */
	connect(): Promise<void>;

	/**
	 * Send data through the transport
	 */
	send(data: string): void;

	/**
	 * Register a callback for incoming data
	 */
	onData(callback: DataCallback): void;

	/**
	 * Register a callback for errors
	 */
	onError(callback: ErrorCallback): void;

	/**
	 * Register a callback for connection close
	 */
	onClose(callback: CloseCallback): void;

	/**
	 * Destroy the connection
	 */
	close(): void;

	/**
	 * Check if the transport is currently connected
	 */
	isConnected(): boolean;
}

/**
 * Create a platform-appropriate IPC transport
 */
export function createIpcTransport(
	path: string,
	options?: {
		isServer?: boolean;
	},
): IpcTransport {
	if (process.platform === "win32") {
		// Lazy import to avoid issues on Unix
		const { createNamedPipeTransport } = require("./named-pipe-transport");
		return createNamedPipeTransport(path, options);
	} else {
		// Lazy import to avoid issues on Windows
		const { createUnixSocketTransport } = require("./unix-socket-transport");
		return createUnixSocketTransport(path, options);
	}
}

/**
 * Get the platform-appropriate IPC path for the terminal host
 */
export function getTerminalHostIpcPath(supersetHomeDir: string): string {
	if (process.platform === "win32") {
		// Windows named pipe path
		return "\\\\.\\pipe\\superset-terminal-host";
	} else {
		// Unix domain socket path
		return join(supersetHomeDir, "terminal-host.sock");
	}
}
