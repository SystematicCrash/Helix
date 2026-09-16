import * as net from 'node:net';
import TCPListener from '../../../../../src/network/tcp/server/TCPListener.js';
import {serveClient} from '../../../../../src/network/http/server/serveClient.js';
import {ServerInfo} from '../../../../../src/server/ServerInfo.js';

/** A parsed HTTP response head: status line fields plus decoded headers. */
export interface ResponseHead {
    version: string;
    code: number;
    reason: string;
    headers: Map<string, string>;
}

/** A fully read HTTP response: head plus the complete body. */
export interface FullResponse extends ResponseHead {
    body: Buffer;
}

/** Thrown when the connection closes before a complete response was read. */
export class IncompleteResponseError extends Error {
    constructor(
        message: string,
        readonly received: Buffer,
    ) {
        super(message);
        this.name = 'IncompleteResponseError';
    }
}

/** Starts the real server stack (TCPListener + http serveClient) on an OS-assigned port. */
export class HelixServer {
    readonly port: number;
    readonly info: ServerInfo;
    /** Errors escaped from serveClient — non-empty means the server crashed a connection. */
    readonly errors: unknown[] = [];
    private readonly listener: TCPListener;

    private constructor(listener: TCPListener, port: number, info: ServerInfo) {
        this.listener = listener;
        this.port = port;
        this.info = info;
    }

    /** Boots the listener on port 0 and starts the accept/serve loop. */
    static async start(version = 'test'): Promise<HelixServer> {
        const listener = new TCPListener();
        listener.listen(0);
        await new Promise<void>((resolve) => {
            (listener as any).server.once('listening', resolve);
        });

        const addr = (listener as any).server.address() as net.AddressInfo;
        const info: ServerInfo = {port: addr.port, iface: '127.0.0.1', version};
        const server = new HelixServer(listener, addr.port, info);
        void server.loop();
        return server;
    }

    /** Accepts connections forever, dispatching each to the http serveClient. */
    private async loop(): Promise<void> {
        while (true) {
            const conn = await this.listener.accept();
            serveClient(conn, this.info).catch((err: unknown) => this.errors.push(err));
        }
    }

    /** Stops accepting new connections. Open connections are torn down by their clients. */
    stop(): void {
        (this.listener as any).server?.close();
        (this.listener as any).server?.closeAllConnections?.();
    }
}

/**
 * A raw TCP client with byte-level control over an HTTP conversation:
 * dribbled writes, half-closes, pipelining, and incremental response reads.
 */
export class RawHttpClient {
    private socket: net.Socket;
    private pending: Buffer = Buffer.alloc(0);
    private closed = false;
    private notify: (() => void) | null = null;

    private constructor(socket: net.Socket) {
        this.socket = socket;
        socket.on('data', (chunk: Buffer) => {
            this.pending = Buffer.concat([this.pending, chunk]);
            this.notify?.();
        });
        socket.on('close', () => {
            this.closed = true;
            this.notify?.();
        });
        socket.on('error', () => {
            this.closed = true;
            this.notify?.();
        });
    }

    /** Total bytes received from the server so far. */
    get bytesReceived(): number {
        return this.pending.length;
    }

    /** True once the server (or the OS) has closed the connection. */
    get isClosed(): boolean {
        return this.closed;
    }

    /** Opens a connection to the server. */
    static async connect(port: number, timeoutMs = 5_000): Promise<RawHttpClient> {
        return await new Promise((resolve, reject) => {
            const socket = net.createConnection({port, host: '127.0.0.1'});
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`connect timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            socket.once('connect', () => {
                clearTimeout(timer);
                resolve(new RawHttpClient(socket));
            });
            socket.once('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    /** Sends raw bytes and waits until the kernel accepted them. */
    send(data: string | Buffer): Promise<void> {
        const bytes = typeof data === 'string' ? Buffer.from(data) : data;
        return new Promise((resolve, reject) => {
            this.socket.write(bytes, (err) => (err ? reject(err) : resolve()));
        });
    }

    /**
     * Sends data split into randomly-sized chunks with a delay between writes,
     * forcing the server to reassemble a message scattered across TCP segments.
     */
    async sendDribbled(
        data: string | Buffer,
        opts: {minChunk?: number; maxChunk?: number; delayMs?: number} = {},
    ): Promise<void> {
        const bytes = typeof data === 'string' ? Buffer.from(data) : data;
        const min = opts.minChunk ?? 1;
        const max = opts.maxChunk ?? 1;
        const delay = opts.delayMs ?? 2;

        for (let i = 0; i < bytes.length; ) {
            const size = min + Math.floor(Math.random() * (max - min + 1));
            const end = Math.min(bytes.length, i + size);
            await this.send(bytes.subarray(i, end));
            i = end;
            if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        }
    }

    /** Half-closes the connection: sends FIN but keeps reading server output. */
    end(): void {
        this.socket.end();
    }

    /** Destroys the connection immediately (RST on unread data). */
    destroy(): void {
        this.socket.destroy();
    }

    /** Resolves once at least `n` bytes have arrived (without consuming them). */
    async waitForBytes(n: number, timeoutMs = 5_000): Promise<void> {
        await this.waitFor(() => this.pending.length >= n, timeoutMs, `${n} bytes`);
    }

    /** Resolves once the server closed the connection. */
    async waitClose(timeoutMs = 5_000): Promise<void> {
        await this.waitFor(() => this.closed, timeoutMs, 'connection close');
    }

    /** Returns a copy of the first `n` unconsumed bytes, waiting for them to arrive. */
    async peek(n: number, timeoutMs = 5_000): Promise<Buffer> {
        await this.waitForBytes(n, timeoutMs);
        return Buffer.from(this.pending.subarray(0, n));
    }

    /** Reads and consumes the response head (status line + headers). */
    async readHead(timeoutMs = 5_000): Promise<ResponseHead> {
        const idx = await this.waitForHead(timeoutMs);
        const head = this.pending.subarray(0, idx);
        const lines = head.toString('latin1').split('\r\n');

        const status = lines[0] ?? '';
        const match = /^(HTTP\/[\d.]+) (\d{3})(?: (.*))?$/.exec(status);
        if (!match) throw new Error(`malformed status line: ${JSON.stringify(status)}`);

        const headers = new Map<string, string>();
        for (const line of lines.slice(1)) {
            const colon = line.indexOf(':');
            if (colon < 0) continue;
            headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
        }

        this.consume(idx + 4);
        return {
            version: match[1]!,
            code: Number(match[2]),
            reason: match[3] ?? '',
            headers,
        };
    }

    /** Reads and consumes the response body, framed by the given head's headers. */
    async readBody(head: ResponseHead, timeoutMs = 5_000): Promise<Buffer> {
        if (head.headers.get('transfer-encoding') === 'chunked') {
            return await this.readChunkedBody(timeoutMs);
        }

        const length = Number(head.headers.get('content-length') ?? 0);
        await this.waitForBytes(length, timeoutMs);
        const body = Buffer.from(this.pending.subarray(0, length));
        this.consume(length);
        return body;
    }

    /** Reads one complete response: head plus body. Returns null on close before any byte. */
    async readResponse(timeoutMs = 5_000): Promise<FullResponse | null> {
        if (this.closed && this.pending.length === 0) return null;

        const head = await this.readHead(timeoutMs);
        const body = await this.readBody(head, timeoutMs);
        return {...head, body};
    }

    /** Expects the connection to close without any response bytes. */
    async expectSilentClose(timeoutMs = 5_000): Promise<void> {
        await this.waitClose(timeoutMs);
        if (this.pending.length > 0) {
            throw new Error(`expected no bytes before close, got: ${this.pending.toString('latin1')}`);
        }
    }

    /** Decodes a chunked body: all data chunks joined, terminator consumed. */
    private async readChunkedBody(timeoutMs = 5_000): Promise<Buffer> {
        const parts: Buffer[] = [];

        while (true) {
            const line = await this.readLine(timeoutMs);
            const size = parseInt(line.split(';')[0]!, 16);
            if (!Number.isFinite(size) || size < 0) {
                throw new Error(`malformed chunk size line: ${JSON.stringify(line)}`);
            }
            if (size === 0) {
                await this.waitForBytes(2, timeoutMs);
                if (!this.pending.subarray(0, 2).equals(Buffer.from('\r\n'))) {
                    throw new Error('missing final CRLF after terminal chunk');
                }
                this.consume(2);
                return Buffer.concat(parts);
            }

            await this.waitForBytes(size + 2, timeoutMs);
            parts.push(Buffer.from(this.pending.subarray(0, size)));
            if (!this.pending.subarray(size, size + 2).equals(Buffer.from('\r\n'))) {
                throw new Error(`missing CRLF after chunk of ${size} bytes`);
            }
            this.consume(size + 2);
        }
    }

    /** Reads one CRLF-terminated line, consuming it and its terminator. */
    private async readLine(timeoutMs = 5_000): Promise<string> {
        const idx = await this.waitFor(() => {
            const i = this.pending.indexOf('\r\n');
            return i >= 0 ? i : false;
        }, timeoutMs, 'line');

        const line = this.pending.subarray(0, idx).toString('latin1');
        this.consume(idx + 2);
        return line;
    }

    /** Resolves with the index of the header terminator, or rejects on incomplete close. */
    private async waitForHead(timeoutMs: number): Promise<number> {
        return await this.waitFor(() => {
            const i = this.pending.indexOf('\r\n\r\n');
            return i >= 0 ? i : false;
        }, timeoutMs, 'response head');
    }

    /** Generic predicate wait; rejects if the connection closes leaving the predicate unsatisfied. */
    private async waitFor(
        predicate: () => number | boolean,
        timeoutMs: number,
        what: string,
    ): Promise<number> {
        const immediate = predicate();
        if (immediate !== false && immediate !== undefined) return immediate as number;

        return await new Promise<number>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.notify = null;
                reject(new Error(
                    `timeout after ${timeoutMs}ms waiting for ${what}` +
                    (this.closed ? ' (connection closed)' : ''),
                ));
            }, timeoutMs);

            const check = (): void => {
                const result = predicate();
                if (result === false || result === undefined) {
                    if (this.closed) {
                        clearTimeout(timer);
                        this.notify = null;
                        reject(new IncompleteResponseError(
                            `connection closed while waiting for ${what}`,
                            Buffer.from(this.pending),
                        ));
                    }
                    return;
                }
                clearTimeout(timer);
                this.notify = null;
                resolve(result as number);
            };

            this.notify = check;
            check();
        });
    }

    /** Drops the first `n` unconsumed bytes. */
    private consume(n: number): void {
        this.pending = this.pending.subarray(n);
    }
}

/** Builds a request head buffer from a raw string, optionally followed by a body. */
export function rawRequest(head: string, body?: Buffer): Buffer {
    if (!head.endsWith('\r\n\r\n')) throw new Error(`head must end with CRLFCRLF: ${JSON.stringify(head)}`);
    if (!body) return Buffer.from(head);
    return Buffer.concat([Buffer.from(head), body]);
}
