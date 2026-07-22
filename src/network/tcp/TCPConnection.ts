import {Socket} from 'net';
import Timer from "../common/Timer";
import {DataReader, DataWriter} from "./types";
import {Event, IDLE_TIMEOUT, READ_TIMEOUT, MAX_WRITE_BUFFER_SIZE, WRITE_TIMEOUT} from "./constants";

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
export default class TCPConnection {
    private readTimer: Timer;
    private writeTimer: Timer;
    private canWrite: boolean = true;
    private _error: Error | null = null;
    private reader: DataReader | null = null;
    private writer: DataWriter | null = null;

    constructor(private socket: Socket) {
        socket.on(Event.END, this.onEnd);
        socket.on(Event.DATA, this.onData);
        socket.on(Event.ERROR, this.onError);
        socket.on(Event.CLOSE, this.onClose);
        socket.on(Event.DRAIN, this.onDrain);

        socket.setTimeout(IDLE_TIMEOUT, () => this.handleTimeout(Event.IDLE_TIMEOUT));
        this.readTimer = new Timer(Event.READ_TIMEOUT, READ_TIMEOUT, this.handleTimeout);
        this.writeTimer = new Timer(Event.WRITE_TIMEOUT, WRITE_TIMEOUT, this.handleTimeout);
    }

    public get error(): Error | null {
        return this._error;
    }

    public close(): void {
        this.socket.destroy();
    }

    /**
     * Resumes the socket and returns a promise that resolves with the next data chunk.
     * Rejects immediately if the connection has a stored error.
     */
    public async read(): Promise<Buffer> {
        if (this.reader) {
            throw new Error("Another read is in progress!");
        }
        try {
            this.readTimer.start();
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
        if (!this.canWrite) {
            throw new Error("Can't write to connection, send buffer is filled!");
        }
        try {
            this.writeTimer.start();
            const sentToKernel = await this.writePromise(data);
            this.canWrite = sentToKernel || this.socket.writableLength < MAX_WRITE_BUFFER_SIZE;
        } finally {
            this.writeTimer.stop();
        }
    }

    /**
     * Wraps socket.write() in a promise.
     */
    private writePromise(data: Buffer): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this._error) {
                return reject(this._error);
            }
            if (this.socket.writableEnded) {
                return this._error = new Error('Cannot write to a closed connection!');
            }
            this.writer = {resolve, reject};
            const sentToKernel = this.socket.write(data, (err?: Error | null) => {
                this.writer = null;
                if (err) reject(err);
                else resolve(sentToKernel);
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
            if (this.socket.readableEnded) {
                return this._error = new Error('Cannot read from a closed connection!');
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

        this.reader.resolve(data);
        this.reader = null;
    }

    /** Resolves the pending read with an empty buffer to signal EOF. */
    private onEnd = (): void => {
        if (this.reader) {
            this.reader.resolve(Buffer.alloc(0));
            this.reader = null;
        }
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
        if (this.writer) {
            this.writer.reject(err);
            this.writer = null;
        }
        this.cleanup();
    }

    /**
     * Handles socket close events and performs cleanup.
     */
    private onClose = (): void => {
        if (!this._error && !this.socket.readableEnded) {
            this._error = new Error('Connection closed unexpectedly!');
        }
        this.cleanup();
    }

    private onDrain = (): void => {
        this.canWrite = true;
    }

    /**
     * Destroys the socket when a timeout is reached.
     */
    private handleTimeout = (event: string): void => {
        const message = (() => {
            switch (event) {
                case Event.IDLE_TIMEOUT: return 'TCP Connection lifetime exceeded';
                case Event.READ_TIMEOUT: return 'TCP Read timeout exceeded';
                case Event.WRITE_TIMEOUT: return 'TCP Write timeout exceeded';
                default: return 'Unexpected connection timeout';
            }
        })();

        this._error = new Error(message);
        this.socket.destroy(this._error);
    }

    /**
     * Stops timers and removes socket listeners.
     */
    private cleanup(): void {
        this.readTimer.stop();
        this.writeTimer.stop();

        this.socket.off(Event.END, this.onEnd);
        this.socket.off(Event.DATA, this.onData);
        this.socket.off(Event.ERROR, this.onError);
        this.socket.off(Event.CLOSE, this.onClose);
        this.socket.off(Event.DRAIN, this.onDrain);
    }
}