import {Socket} from 'net';
import {DataReader} from "./tcp";

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
export default class TCPConnection {
    private ended: boolean = false;
    public error: Error|null = null;
    public reader: null|DataReader = null;

    constructor(public socket: Socket) {
        socket.on('data', this.onData);
        socket.on('end', this.onEnd);
        socket.on('error', this.onError);
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

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("reader should be null at this step!");
        }
        return new Promise((resolve, reject) => {
            if (this.error) return reject(this.error);
            if (this.ended) return reject(Buffer.from(''));

            this.reader = {resolve, reject};
            this.socket.resume();
        })
    }

    /** Writes a buffer to the socket and returns a promise that resolves on success. */
    write(data: Buffer): Promise<void> {
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
}