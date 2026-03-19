/**
 * Unix domain socket transport for IPC
 *
 * Used on macOS and Linux for communication between the Electron main process
 * and the terminal host daemon.
 */

import { createServer, type Server, Socket } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import type {
	IpcTransport,
	DataCallback,
	ErrorCallback,
	CloseCallback,
} from "./types";

/**
 * Unix domain socket transport for server-side connections
 */
export class UnixSocketServerTransport implements IpcTransport {
	private server: Server | null = null;
	private socket: Socket | null = null;
	private dataCallback: DataCallback | null = null;
	private errorCallback: ErrorCallback | null = null;
	private closeCallback: CloseCallback | null = null;
	private connected = false;
	private readonly path: string;

	constructor(path: string) {
		this.path = path;
	}

	async connect(): Promise<void> {
		// Clean up existing socket file if present
		if (existsSync(this.path)) {
			try {
				unlinkSync(this.path);
			} catch {
				// Ignore if can't unlink
			}
		}

		return new Promise((resolve, reject) => {
			this.server = createServer((socket) => {
				this.handleConnection(socket);
			});

			this.server.on("error", (error: NodeJS.ErrnoException) => {
				if (error.code === "EADDRINUSE") {
					reject(new Error("Socket already in use"));
				} else {
					reject(error);
				}
			});

			this.server.listen(this.path, () => {
				this.connected = true;
				resolve();
			});
		});
	}

	private handleConnection(socket: Socket): void {
		this.socket = socket;
		this.connected = true;

		socket.setEncoding("utf-8");

		socket.on("data", (data: string) => {
			if (this.dataCallback) {
				this.dataCallback(data);
			}
		});

		socket.on("error", (error) => {
			if (this.errorCallback) {
				this.errorCallback(error);
			}
		});

		socket.on("close", () => {
			this.connected = false;
			if (this.closeCallback) {
				this.closeCallback();
			}
		});
	}

	send(data: string): void {
		if (this.socket && this.connected) {
			this.socket.write(data);
		}
	}

	onData(callback: DataCallback): void {
		this.dataCallback = callback;
	}

	onError(callback: ErrorCallback): void {
		this.errorCallback = callback;
	}

	onClose(callback: CloseCallback): void {
		this.closeCallback = callback;
	}

	close(): void {
		this.connected = false;
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}

	isConnected(): boolean {
		return this.connected;
	}
}

/**
 * Unix domain socket transport for client-side connections
 */
export class UnixSocketClientTransport implements IpcTransport {
	private socket: Socket | null = null;
	private dataCallback: DataCallback | null = null;
	private errorCallback: ErrorCallback | null = null;
	private closeCallback: CloseCallback | null = null;
	private connected = false;
	private readonly path: string;

	constructor(path: string) {
		this.path = path;
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = new Socket();

			const timeout = setTimeout(() => {
				this.socket?.destroy();
				reject(new Error("Connection timeout"));
			}, 5000);

			this.socket.on("connect", () => {
				clearTimeout(timeout);
				this.connected = true;
				resolve();
			});

			this.socket.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});

			this.socket.on("close", () => {
				this.connected = false;
				if (this.closeCallback) {
					this.closeCallback();
				}
			});

			this.socket.on("data", (data: string) => {
				if (this.dataCallback) {
					this.dataCallback(data);
				}
			});

			this.socket.connect(this.path);
		});
	}

	send(data: string): void {
		if (this.socket && this.connected) {
			this.socket.write(data);
		}
	}

	onData(callback: DataCallback): void {
		this.dataCallback = callback;
	}

	onError(callback: ErrorCallback): void {
		this.errorCallback = callback;
	}

	onClose(callback: CloseCallback): void {
		this.closeCallback = callback;
	}

	close(): void {
		this.connected = false;
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
	}

	isConnected(): boolean {
		return this.connected;
	}
}

/**
 * Create a Unix socket transport for the given path
 */
export function createUnixSocketTransport(
	path: string,
	options?: { isServer?: boolean },
): IpcTransport {
	if (options?.isServer) {
		return new UnixSocketServerTransport(path);
	}
	return new UnixSocketClientTransport(path);
}
