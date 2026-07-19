import {Socket} from 'net';
import {EventEmitter} from 'events';
import {clearTimeout} from "node:timers";
import {DataReader} from "./types";
import {IDLE_TIMEOUT, READ_TIMEOUT, WRITE_TIMEOUT} from "./config.js";

const events = {
    IDLE: 'idle-timeout',
    READ: 'read-timeout',
    WRITE: 'write-timeout',
    ERROR: 'error',
    DATA: 'data',
    END: 'end',
};

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
export default class TCPConnection {
    private ended: boolean = false;
    private error: Error|null = null;
    private reader: null|DataReader = null;
    private idleTimeout: NodeJS.Timeout|null = null;
    private readTimeout: NodeJS.Timeout|null = null;
    private writeTimeout: NodeJS.Timeout|null = null;
    private emitter: EventEmitter = new EventEmitter();

    constructor(public socket: Socket) {
        socket.on(events.END, this.onEnd);
        socket.on(events.DATA, this.onData);
        socket.on(events.ERROR, this.onError);

        this.emitter.on(events.IDLE, this.onIdleTimeout);
        this.emitter.on(events.READ, this.onReadTimeout);
        this.emitter.on(events.WRITE, this.onWriteTimeout);

        this.resetIdleTimeout();
        this.resetReadTimeout();
        this.resetWriteTimeout();
    }

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    public read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("Another read is in progress!");
        }
        this.resetIdleTimeout();
        this.resetReadTimeout();
        return this.readPromise();
    }

    /** Writes a buffer to the socket and returns a promise that resolves on success. */
    public write(data: Buffer): Promise<void> {
        if (data.length === 0) {
            throw new Error("data length should be greater than 0!");
        }
        this.resetIdleTimeout();
        this.resetWriteTimeout();
        return this.writePromise(data);
    }

    private writePromise(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.error) return reject(this.error);

            this.socket.write(data, (err?: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private readPromise(): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (this.error) {
                return reject(this.error);
            }
            if (this.ended || this.socket.destroyed) {
                return resolve(Buffer.from(''));
            }
            this.reader = {resolve, reject};
            this.socket.resume();
        });
    }

    /** Fulfills the pending read promise with the received chunk and pauses the socket. */
    private onData = (data: Buffer): void => {
        if (!this.reader) {
            throw new Error("reader does not exist!");
        }
        this.socket.pause();
        this.reader!.resolve(data);
        this.reader = null;
    }

    /** Resolves the pending read with an empty buffer to signal EOF. */
    private onEnd = (): void => {
        this.ended = true;
        if (this.reader) {
            this.reader.resolve(Buffer.from(''));
            this.reader = null;
        }
    }

    /**
     * Stores the error on the connection and rejects any pending read.
     * Subsequent soRead calls will fail immediately via conn.error.
     */
    private onError = (err: Error): void => {
        this.error = err;
        if (this.reader) {
            this.reader.reject(err);
            this.reader = null;
        }
    }

    private onIdleTimeout = (): void => {
        this.socket.destroy(new Error('TCP Connection lifetime exceeded'));
    }

    private onReadTimeout = (): void => {
        this.socket.destroy(new Error('TCP Read timeout exceeded'));
    }

    private onWriteTimeout = (): void => {
        this.socket.destroy(new Error('TCP Write timeout exceeded'));
    }

    private resetIdleTimeout(): void {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        this.idleTimeout = setTimeout(() => this.emitter.emit(events.IDLE), IDLE_TIMEOUT);
    }

    private resetReadTimeout(): void {
        if (this.readTimeout) clearTimeout(this.readTimeout);
        this.readTimeout = setTimeout(() => this.emitter.emit(events.READ), READ_TIMEOUT);
    }

    private resetWriteTimeout(): void {
        if (this.writeTimeout) clearTimeout(this.writeTimeout);
        this.writeTimeout = setTimeout(() => this.emitter.emit(events.WRITE), WRITE_TIMEOUT);
    }
}