import {Socket} from 'net';
import {DataReader} from "./types";
import {IDLE_TIMEOUT} from "./config.js";

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
export default class TCPConnection {
    private ended: boolean;
    private error: Error|null;
    private reader: null|DataReader;
    private ideTimeout: NodeJS.Timeout|null;

    constructor(public socket: Socket) {
        socket.on('data', this.onData);
        socket.on('end', this.onEnd);
        socket.on('error', this.onError);

        this.ended = false;
        this.error = null;
        this.reader = null;
        this.ideTimeout = null;
        this.setIdleTimeout();
    }

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    public read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("Another read is in progress!");
        }
        return this.readPromise();
    }

    /** Writes a buffer to the socket and returns a promise that resolves on success. */
    public write(data: Buffer): Promise<void> {
        if (data.length === 0) {
            throw new Error("data length should be greater than 0!");
        }
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
        this.setIdleTimeout();
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

    private setIdleTimeout(): void {
        if (this.ideTimeout) {
            clearTimeout(this.ideTimeout);
        }
        this.ideTimeout = setTimeout((): void => {
            this.socket.destroy(new Error('Connection lifetime exceeded'));
        }, IDLE_TIMEOUT);
    }
}