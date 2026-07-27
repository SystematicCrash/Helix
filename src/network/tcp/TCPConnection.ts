import {Socket} from 'net';
import TCPError from "./TCPError";
import Timer from "../common/Timer";
import {DataReader, DataWriter} from "./types";
import {Event, IDLE_TIMEOUT, MAX_WRITE_BUFFER_SIZE, READ_TIMEOUT, TCPErrCode, WRITE_TIMEOUT,} from "./constants";

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

    private canWrite = true;
    private readClosed: boolean = false;
    private writeClosed: boolean = false;

    private _error: TCPError | null = null;

    private reader: DataReader | null = null;
    private writer: DataWriter | null = null;

    constructor(private readonly socket: Socket) {
        socket.on(Event.END, this.onEnd);
        socket.on(Event.DATA, this.onData);
        socket.on(Event.DRAIN, this.onDrain);
        socket.on(Event.ERROR, this.onError);
        socket.on(Event.CLOSE, this.onClose);

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

    public get isFullyClosed(): boolean {
        return this.readClosed && this.writeClosed;
    }

    /**
     * Performs a graceful TCP shutdown.
     *
     * Pending writes are flushed before the socket is closed.
     * Further writes are rejected after this method is called.
     */
    public close(): void {
        if (this.writeClosed) return;

        this.writeClosed = true;
        this.socket.end();
    }

    /**
     * Immediately terminates the TCP connection.
     * Pending data may be discarded and the peer may receive a TCP reset.
     */
    public forceClose(): void {
        if (this.isFullyClosed) return;

        this._error = this._error ?? TCPError.from(TCPErrCode.FORCED_CLOSE);
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
        if (this._error)
            throw this._error;

        if (this.isFullyClosed)
            throw TCPError.from(TCPErrCode.READ_AFTER_CLOSE);

        if (this.readClosed)
            throw TCPError.from(TCPErrCode.READ_AFTER_EOF);
    }

    /**
     * Validates that a write operation can be performed.
     * Checks the current socket status.
     */
    private ensureWritable(): void {
        if (this._error)
            throw this._error;

        if (this.isFullyClosed)
            throw TCPError.from(TCPErrCode.WRITE_AFTER_CLOSE);

        if (this.writeClosed)
            throw TCPError.from(TCPErrCode.WRITE_AFTER_EOF);
    }

    /**
     * Wraps socket.write() into a promise.
     * Resolves with whether the data was fully accepted into the kernel buffer.
     */
    private writePromise(data: Buffer): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.writer = {resolve, reject};
            try {

                const sentToKernel = this.socket.write(data, (err?: Error | null) => {
                    this.writer = null;
                    if (err) reject(err);
                    else resolve(sentToKernel);
                });

            } catch (err) {
                this.writer = null;
                reject(err);
            }
        });
    }

    /**
     * Creates a pending read promise and resumes socket consumption.
     */
    private readPromise(): Promise<Buffer | null> {
        return new Promise((resolve, reject) => {
            this.reader = {resolve, reject};
            this.socket.resume();
        });
    }

    /**
     * Handles graceful remote shutdown.
     */
    private onEnd = (): void => {
        this.readClosed = true;

        if (this.reader) {
            this.reader.resolve(null);
            this.reader = null;
        }
    };

    /**
     * Handles incoming socket data.
     * Pauses socket until the next read is called.
     * sets reader to null to signal that the read is completed.
     */
    private onData = (data: Buffer): void => {
        this.socket.pause();

        if (!this.reader) return;

        this.reader.resolve(data);
        this.reader = null;
    };

    /**
     * Handles socket errors and releases resources associated with this connection.
     */
    private onError = (err: Error): void => {
        this._error = err instanceof TCPError ? err : TCPError.from(TCPErrCode.UNEXPECTED_ERROR, err);
        this.forceClose();
    };

    /**
     * Handles final socket closure.
     * The close event is emitted after the socket is fully closed.
     */
    private onClose = (): void => {
        this.readClosed = true;
        this.writeClosed = true;

        if (this._error) {
            this.failPending(this._error);
        }

        this.cleanup();
    };

    /**
     * Handles socket drain notifications.
     * Signals sending more data.
     */
    private onDrain = (): void => {
        this.canWrite = true;
    };

    /**
     * Handles idle, read, and write timeout events.
     * Closes the connection immediately.
     */
    private handleTimeout = (event: string): void => {
        const code: TCPErrCode = (() => {
            switch (event) {
                case Event.IDLE_TIMEOUT:
                    return TCPErrCode.IDLE_TIMEOUT;
                case Event.READ_TIMEOUT:
                    return TCPErrCode.READ_TIMEOUT;
                case Event.WRITE_TIMEOUT:
                    return TCPErrCode.WRITE_TIMEOUT;
                default:
                    return TCPErrCode.UNKNOWN_TIMEOUT;
            }
        })();
        this.socket.emit('error', TCPError.from(code));
    };

    /**
     * Rejects all currently pending asynchronous operations.
     */
    private failPending(error: TCPError): void {
        if (this.reader) {
            this.reader.reject(error);
            this.reader = null;
        }

        if (this.writer) {
            this.writer.reject(error);
            this.writer = null;
        }
    };

    /**
     * Releases resources owned by this connection.
     */
    private cleanup(): void {
        this.readTimer.stop();
        this.writeTimer.stop();
        this.socket.setTimeout(0);

        this.socket.off(Event.END, this.onEnd);
        this.socket.off(Event.DATA, this.onData);
        this.socket.off(Event.ERROR, this.onError);
        this.socket.off(Event.CLOSE, this.onClose);
        this.socket.off(Event.DRAIN, this.onDrain);
    }
}