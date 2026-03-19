/**
 * Windows named pipe transport for IPC
 *
 * Used on Windows for communication between the Electron main process
 * and the terminal host daemon. Named pipes are the Windows equivalent
 * of Unix domain sockets.
 */

import { createServer, connect, type Server, Socket } from "node:net";
import type {
	IpcTransport,
	DataCallback,
	ErrorCallback,
	CloseCallback,
} from "./types";

/**
 * Windows named pipe transport for server-side connections
 */
export class NamedPipeServerTransport implements IpcTransport {
	private server: Server | null = null;
	private socket: Socket | null = null;
	private dataCallback: DataCallback | null = null;
	private errorCallback: ErrorCallback | null = null;
	private closeCallback: CloseCallback | null = null;
	private connected = false;
	private readonly pipePath: string;

	constructor(pipePath: string) {
		// Named pipe paths on Windows use \\.\pipe\ prefix
		this.pipePath = pipePath.startsWith("\\\\.\\pipe\\")
			? pipePath
			: `\\\\.\\pipe\\${pipePath}`;
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = createServer((socket) => {
				this.handleConnection(socket);
			});

			this.server.on("error", (error: NodeJS.ErrnoException) => {
				if (error.code === "EADDRINUSE") {
					reject(new Error("Pipe already in use"));
				} else {
					reject(error);
				}
			});

			// On Windows, listening on a named pipe path works directly
			this.server.listen(this.pipePath, () => {
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
 * Windows named pipe transport for client-side connections
 */
export class NamedPipeClientTransport implements IpcTransport {
	private socket: Socket | null = null;
	private dataCallback: DataCallback | null = null;
	private errorCallback: ErrorCallback | null = null;
	private closeCallback: CloseCallback | null = null;
	private connected = false;
	private readonly pipePath: string;

	constructor(pipePath: string) {
		// Named pipe paths on Windows use \\.\pipe\ prefix
		this.pipePath = pipePath.startsWith("\\\\.\\pipe\\")
			? pipePath
			: `\\\\.\\pipe\\${pipePath}`;
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = connect(this.pipePath);

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
 * Create a named pipe transport for the given path
 */
export function createNamedPipeTransport(
	pipePath: string,
	options?: { isServer?: boolean },
): IpcTransport {
	if (options?.isServer) {
		return new NamedPipeServerTransport(pipePath);
	}
	return new NamedPipeClientTransport(pipePath);
}
