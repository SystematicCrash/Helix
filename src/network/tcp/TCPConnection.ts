import {Socket} from 'net';
import TCPError from "./TCPError";
import Timer from "../common/Timer";
import {DataReader, DataWriter} from "./types";
import {Event, IDLE_TIMEOUT, MAX_WRITE_BUFFER_SIZE, READ_TIMEOUT, TCPErrCode, WRITE_TIMEOUT,} from "./constants";

enum ConnectionState {
    OPEN,
    CLOSED,
    WRITE_CLOSED,
    READ_CLOSED,
    ERROR,
}

/**
 * Provides a high-level promise-based wrapper around a Node.js TCP socket.
 *
 * Responsibilities:
 * - Converts socket events into async read/write operations.
 * - Handles connection lifecycle and failures.
 * - Applies read/write/idle timeouts.
 * - Manages write backpressure.
 *
 * This class does not provide message framing. TCP data is still a byte stream.
 */
export default class TCPConnection {
    private readonly readTimer: Timer;
    private readonly writeTimer: Timer;

    private state: ConnectionState = ConnectionState.OPEN;

    private _error: TCPError | null = null;

    private reader: DataReader | null = null;
    private writer: DataWriter | null = null;

    private canWrite = true;

    constructor(private readonly socket: Socket) {
        socket.on(Event.END, this.onEnd);
        socket.on(Event.DATA, this.onData);
        socket.on(Event.ERROR, this.onError);
        socket.on(Event.CLOSE, this.onClose);
        socket.on(Event.DRAIN, this.onDrain);

        socket.setTimeout(
            IDLE_TIMEOUT,
            () => this.handleTimeout(Event.IDLE_TIMEOUT)
        );

        this.readTimer = new Timer(
            Event.READ_TIMEOUT,
            READ_TIMEOUT,
            this.handleTimeout
        );

        this.writeTimer = new Timer(
            Event.WRITE_TIMEOUT,
            WRITE_TIMEOUT,
            this.handleTimeout
        );
    }

    /**
     * Returns the last connection error.
     *
     * Returns null while the connection is healthy.
     */
    public get error(): TCPError | null {
        return this._error;
    }

    /**
     * Performs a graceful TCP shutdown.
     *
     * Pending writes are flushed before the socket is closed.
     * Further writes are rejected after this method is called.
     */
    public close(): void {
        if (this.state === ConnectionState.READ_CLOSED) {
            this.state = ConnectionState.CLOSED;
        } else {
            this.state = ConnectionState.WRITE_CLOSED;
        }

        this.socket.end();
    }

    /**
     * Immediately terminates the TCP connection.
     * Pending data may be discarded and the peer may receive a TCP reset.
     */
    public forceClose(): void {
        if (this.state === ConnectionState.CLOSED) {
            return;
        }

        this.socket.destroy();
    }

    /**
     * Reads the next available chunk from the TCP stream.
     * Only one read operation can be pending at a time.
     * Returns empty buffer when the remote peer performs a graceful shutdown.
     */
    public async read(): Promise<Buffer | null> {
        this.ensureReadable();

        if (this.reader) {
            throw TCPError.from(TCPErrCode.SIMULTANEOUS_READ);
        }

        try {
            this.readTimer.start();
            return await this.readPromise();
        } finally {
            this.readTimer.stop();
        }
    }

    /**
     * Writes data to the TCP socket.
     * Backpressure is reported when the internal buffer is full.
     */
    public async write(data: Buffer): Promise<void> {
        this.ensureWritable();

        if (data.length === 0)
            throw TCPError.from(TCPErrCode.EMPTY_DATA_BUFFER);

        if (!this.canWrite)
            throw TCPError.from(TCPErrCode.WRITE_BACKPRESSURE);

        if (this.writer)
            throw TCPError.from(TCPErrCode.SIMULTANEOUS_WRITE);

        try {
            this.writeTimer.start();
            const sentToKernel = await this.writePromise(data);
            this.canWrite = sentToKernel && this.socket.writableLength < MAX_WRITE_BUFFER_SIZE;
        } finally {
            this.writeTimer.stop();
        }
    }

    /**
     * Validates that a read operation can be performed.
     * Checks the socket current status.
     */
    private ensureReadable(): void {
        if (this.state === ConnectionState.ERROR)
            throw this._error;

        if (this.state === ConnectionState.CLOSED)
            throw TCPError.from(TCPErrCode.READ_AFTER_CLOSE);

        if (this.state === ConnectionState.READ_CLOSED)
            throw TCPError.from(TCPErrCode.READ_AFTER_EOF);
    }

    /**
     * Validates that a write operation can be performed.
     * Checks the current socket status.
     */
    private ensureWritable(): void {
        if (this.state === ConnectionState.ERROR)
            throw this._error;

        if (this.state === ConnectionState.CLOSED)
            throw TCPError.from(TCPErrCode.WRITE_AFTER_CLOSE);

        if (this.state === ConnectionState.WRITE_CLOSED)
            throw TCPError.from(TCPErrCode.WRITE_AFTER_EOF);
    }

    /**
     * Wraps socket.write() into a promise.
     * Resolves with whether the data was fully accepted into the kernel buffer.
     */
    private writePromise(data: Buffer): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this._error) {
                return reject(this._error);
            }
            if (this.socket.writableEnded) {
                return this._error = TCPError.from(TCPCode.WRITE_TO_CLOSED_CONNECTION);
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
     * Creates a pending read promise and resumes socket consumption.
     */
    private readPromise(): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            if (this._error) {
                return reject(this._error);
            }
            if (this.socket.readableEnded) {
                return this._error = TCPError.from(TCPCode.READ_FROM_CLOSED_CONNECTION);
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
     * Handles socket errors and releases resources associated with this connection.
     */
    private onError = (err: Error): void => {
        this._error = (err instanceof TCPError) ? err : TCPError.from(TCPCode.UNEXPECTED_ERROR, err);
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
     * Handles final socket closure.
     * The close event is emitted after the socket is fully closed.
     */
    private onClose = (): void => {
        if (!this._error && !this.socket.readableEnded) {
            this._error = TCPError.from(TCPCode.UNEXPECTED_CLOSE);
        }
        this.cleanup();
    }

    /**
     * Handles socket drain notifications.
     * Signals sending more data.
     */
    private onDrain = (): void => {
        this.canWrite = true;
    }

    /**
     * Handles idle, read, and write timeout events.
     * Closes the connection immediately.
     */
    private handleTimeout = (event: string): void => {
        const code: TCPCode = (() => {
            switch (event) {
                case Event.IDLE_TIMEOUT: return TCPCode.IDLE_TIMEOUT;
                case Event.READ_TIMEOUT: return TCPCode.READ_TIMEOUT;
                case Event.WRITE_TIMEOUT: return TCPCode.WRITE_TIMEOUT;
                default: return TCPCode.UNKNOWN_TIMEOUT;
            }
        })();

        this._error = TCPError.from(code);
        this.socket.destroy(this._error);
    }

    /**
     * Releases resources owned by this connection.
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