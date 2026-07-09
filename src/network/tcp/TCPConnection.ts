import {Socket} from 'net';
import {DataReader} from "./types";

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
export default class TCPConnection {
    private ended: boolean = false;
    private error: Error|null = null;
    private reader: null|DataReader = null;

    constructor(public socket: Socket) {
        socket.on('data', this.onData);
        socket.on('end', this.onEnd);
        socket.on('error', this.onError);
    }

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    public read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("Another read is in progress!");
        }
        return new Promise((resolve, reject) => {
            if (this.error) {
                return reject(this.error);
            }
            if (this.ended || this.socket.destroyed) {
                return resolve(Buffer.from(''));
            }
            this.reader = {resolve, reject};
            this.socket.resume();
        })
    }

    /** Writes a buffer to the socket and returns a promise that resolves on success. */
    public write(data: Buffer): Promise<void> {
        if (data.length === 0) {
            throw new Error("data length should be greater than 0!");
        }
        return new Promise((resolve, reject) => {
            if (this.error) return reject(this.error);

            this.socket.write(data, (err?: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
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
            this.reader!.reject(err);
            this.reader = null;
        }
    }
}