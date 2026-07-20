import {Socket} from 'net';
import {DataReader} from "./types";
import Timer from "../common/Timer";
import {EOF, events, IDLE_TIMEOUT, READ_TIMEOUT, WRITE_TIMEOUT} from "./constants";

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
export default class TCPConnection {
    private idleTimer: Timer;
    private readTimer: Timer;
    private writeTimer: Timer;

    private _ended: boolean = false;
    private _isDead: boolean = false;
    private _error: Error | null = null;
    private reader: DataReader | null = null;

    constructor(public socket: Socket) {
        socket.on(events.END, this.onEnd);
        socket.on(events.DATA, this.onData);
        socket.on(events.ERROR, this.onError);
        socket.on(events.CLOSE, this.onClose);

        this.idleTimer = new Timer(events.IDLE_TIMEOUT, IDLE_TIMEOUT, this.onIdleTimeout);
        this.readTimer = new Timer(events.READ_TIMEOUT, READ_TIMEOUT, this.onReadTimeout);
        this.writeTimer = new Timer(events.WRITE_TIMEOUT, WRITE_TIMEOUT, this.onWriteTimeout);

        this.idleTimer.start();
    }

    public get error(): Error | null {
        return this._error;
    }

    public get ended(): boolean {
        return this._ended;
    }

    public get isDead(): boolean {
        return this._isDead;
    }

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    public async read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("Another read is in progress!");
        }
        this.idleTimer.stop();
        this.readTimer.start();
        try {
            return await this.readPromise();
        } finally {
            this.readTimer.stop();
            if (!this._isDead) this.idleTimer.restart();
        }
    }

    /** Writes a buffer to the socket and returns a promise that resolves on success. */
    public async write(data: Buffer): Promise<void> {
        if (data.length === 0) {
            throw new Error("data length should be greater than 0!");
        }
        this.idleTimer.stop();
        this.writeTimer.start();
        try {
            return await this.writePromise(data);
        } finally {
            this.writeTimer.stop();
            if (!this._isDead) this.idleTimer.restart();
        }
    }

    /**
     * Wraps socket.write in a promise.
     */
    private writePromise(data: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this._error) {
                return reject(this._error);
            }
            if (this._isDead) {
                return reject(new Error('Cannot write to a dead connection!'));
            }
            this.writer = {resolve, reject};
            this.socket.write(data, (err?: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Creates a pending read operation waiting for incoming data.
     */
    private readPromise(): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (this._error) {
                return reject(this._error);
            }
            if (this._ended || this._isDead) {
                return resolve(EOF);
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
        this._ended = true;
        if (this.reader) {
            this.reader.resolve(EOF);
            this.reader = null;
        }
        this.cleanup();
    }

    /**
     * Stores the error on the connection and rejects any pending read.
     * Subsequent soRead calls will fail immediately via conn.error.
     */
    private onError = (err: Error): void => {
        this._error = err;
        if (this.reader) {
            this.reader.reject(err);
            this.reader = null;
        }
        this.cleanup();
    }

    /**
     * Handles socket close events and performs cleanup.
     */
    private onClose = (hadError: boolean): void => {
        if (!this._error && !this._ended) {
            this._error = new Error('Connection closed unexpectedly!');
        }
        this.cleanup();
    }

    /**
     * Destroys the socket when idle timeout is reached.
     */
    private onIdleTimeout = (): void => {
        this._error = new Error('TCP Connection lifetime exceeded');
        this.socket.destroy(this._error);
    }

    /**
     * Destroys the socket when read timeout is reached.
     */
    private onReadTimeout = (): void => {
        this._error = new Error('TCP Read timeout exceeded');
        this.socket.destroy(this._error);
    }

    /**
     * Destroys the socket when write timeout is reached.
     */
    private onWriteTimeout = (): void => {
        this._error = new Error('TCP Write timeout exceeded');
        this.socket.destroy(this._error);
    }

    /**
     * Stops timers and removes socket listeners.
     */
    private cleanup(): void {
        this._isDead = true;
        this.idleTimer.stop();
        this.readTimer.stop();
        this.writeTimer.stop();

        this.socket.off(events.END, this.onEnd);
        this.socket.off(events.DATA, this.onData);
        this.socket.off(events.ERROR, this.onError);
        this.socket.off(events.CLOSE, this.onClose);
    }
}