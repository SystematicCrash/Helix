import {Socket} from 'net';
import {DataReader} from "./types";
import {IDLE_TIMEOUT, READ_TIMEOUT, WRITE_TIMEOUT} from "./config";
import Timer from "../common/Timer";


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
    private idleTimer: Timer;
    private readTimer: Timer;
    private writeTimer: Timer;

    constructor(public socket: Socket) {
        socket.on(events.END, this.onEnd);
        socket.on(events.DATA, this.onData);
        socket.on(events.ERROR, this.onError);

        this.idleTimer = new Timer(events.IDLE, IDLE_TIMEOUT, this.onIdleTimeout);
        this.readTimer = new Timer(events.READ, READ_TIMEOUT, this.onReadTimeout);
        this.writeTimer = new Timer(events.WRITE, WRITE_TIMEOUT, this.onWriteTimeout);

        this.idleTimer.start();
    }

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    public async read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("Another read is in progress!");
        }
        this.idleTimer.reset();
        this.readTimer.start();
        try {
            return await this.readPromise();
        } finally {
             this.readTimer.stop();
        }
    }

    /** Writes a buffer to the socket and returns a promise that resolves on success. */
    public async write(data: Buffer): Promise<void> {
        if (data.length === 0) {
            throw new Error("data length should be greater than 0!");
        }
        this.idleTimer.reset();
        this.writeTimer.start();
        try {
            return await this.writePromise(data);
        } finally {
            this.writeTimer.stop();
        }
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
        this.socket.pause();

        if (!this.reader) {
            return;
        }

        this.socket.pause();
        this.reader.resolve(data);
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

    /** Executed on idle timeout */
    private onIdleTimeout = (): void => {
        this.error = new Error('TCP Connection lifetime exceeded');
        this.socket.destroy(this.error);
    }

    /**
     * Destroys the socket when read timeout is reached.
     */
    private onReadTimeout = (): void => {
        this.error = new Error('TCP Read timeout exceeded');
        this.socket.destroy(this.error);
    }

    /**
     * Destroys the socket when write timeout is reached.
     */
    private onWriteTimeout = (): void => {
        this.error = new Error('TCP Write timeout exceeded');
        this.socket.destroy(this.error);
    }

    /**
     * Stops timers and removes socket listeners.
     */
    private cleanup(): void {
        this.isDead = true;
        this.idleTimer.stop();
        this.readTimer.stop();
        this.writeTimer.stop();

        this.socket.off(events.end, this.onEnd);
        this.socket.off(events.data, this.onData);
        this.socket.off(events.error, this.onError);
        this.socket.off(events.close, this.onClose);
    }
}