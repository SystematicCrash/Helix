import {Socket} from 'net';
import TCPError from "../common/TCPError.js";
import SocketReader from "./SocketReader.js";
import SocketWriter from "./SocketWriter.js";
import Timer from "../../common/Timer.js";
import {
    Event,
    IDLE_TIMEOUT,
    TCPErrCode,
} from "../common/constants.js";
import {BufferGenerator} from "../../http/common/types.js";

/**
 * Provides a high-level promise-based wrapper around a Node.js TCP conn.
 *
 * Responsibilities:
 * - Converts conn events into async read/write operations.
 * - Handles connection lifecycle and failures.
 * - Applies read/write/idle timeouts.
 * - Manages write backpressure.
 *
 * This class does not provide message framing. TCP data is still a byte stream.
 */
export default class TCPConnection {
    private timer: Timer;
    private sockReader: SocketReader;
    private sockWriter: SocketWriter;
    private _error: TCPError | null = null;

    constructor(private readonly socket: Socket) {
        this.sockReader = new SocketReader(socket);
        this.sockWriter = new SocketWriter(socket);
        this.timer = new Timer(Event.ERROR, IDLE_TIMEOUT, this.handleTimeout);

        socket.on(Event.END, this.onEnd);
        socket.on(Event.ERROR, this.onError);
        socket.on(Event.CLOSE, this.onClose);

        this.startIdleTimer();
    }

    /**
     * Fires when the connection has been idle (no read AND no write in progress)
     * for IDLE_TIMEOUT milliseconds.
     */
    private handleTimeout = (): void => {
        this.socket.emit(
            Event.ERROR,
            TCPError.from(TCPErrCode.IDLE_TIMEOUT)
        );
    };

    /**
     * Starts the idle timer unless a read or write is currently in progress.
     * Mirrors the SocketReader/SocketWriter timer pattern: armed when the
     * connection is otherwise quiescent, stopped whenever real I/O begins.
     */
    private startIdleTimer(): void {
        if (this.isFullyClosed) return;
        if (this.sockReader.hasPendingRead) return;
        if (this.sockWriter.hasPendingWrite) return;
        this.timer.start();
    }

    /**
     * Stops the idle timer while a read or write operation is in flight.
     */
    private stopIdleTimer(): void {
        this.timer.stop();
    }

    /**
     * Returns the last connection error.
     * Returns null while the connection is healthy.
     */
    public get error(): TCPError | null {
        return this._error;
    }

    /**
     * Indicates whether the socket can currently accept write operations.
     * Returns false if an error occurred, the writer has finished, or the
     * underlying socket is closed/destroyed.
     */
    public get isWritable(): boolean {
        return (
            this._error === null &&
            !this.sockWriter.isFinished &&
            this.socket.writable &&
            !this.socket.destroyed
        );
    }

    /**
     * Indicates whether the socket can currently accept read operations.
     * Returns false if an error occurred, the reader has reached EOF/closed,
     * or the underlying socket is no longer readable.
     */
    public get isReadable(): boolean {
        return (
            this._error === null &&
            !this.sockReader.isFinished &&
            this.socket.readable &&
            !this.socket.destroyed
        );
    }

    /**
     * Indicates that the connection is fully closed or not.
     * Checks that the write and read both are closed.
     */
    public get isFullyClosed(): boolean {
        return this.sockReader.isFinished
            && this.sockWriter.isFinished;
    }

    /**
     * Drains write buffer and sends all the remaining data.
     * Retries on backpressure by waiting for the drain event.
     */
    public async flush(): Promise<void> {
        this.stopIdleTimer();
        try {
            await this.sockWriter.flush();
        } finally {
            this.startIdleTimer();
        }
    }

    /**
     * Reads the next available chunk from the remote connection.
     * Returns the chunk, or null if EOF was reached.
     */
    public async read(): Promise<Buffer | null> {
        if (this._error) {
            throw this._error;
        }

        if (this.isFullyClosed) {
            throw TCPError.from(TCPErrCode.READ_AFTER_CLOSE);
        }

        this.stopIdleTimer();
        try {
            return await this.sockReader.read();
        } finally {
            this.startIdleTimer();
        }
    }

    /**
     * Writes data to the remote connection.
     */
    public async write(data: Buffer): Promise<void> {
        if (this._error) {
            throw this._error;
        }

        if (this.isFullyClosed) {
            throw TCPError.from(TCPErrCode.WRITE_AFTER_CLOSE);
        }

        this.stopIdleTimer();
        try {
            await this.sockWriter.write(data);
        } finally {
            this.startIdleTimer();
        }
    }

    /**
     * Performs a graceful TCP shutdown.
     *
     * Pending writes are flushed before the conn is closed.
     * Further writes are rejected after this method is called.
     */
    public async close(): Promise<void> {
        if (this.sockWriter.isFinished) return;

        this.stopIdleTimer();
        try {
            await this.sockWriter.flush();
            this.sockWriter.finish(this._error);
            this.socket.end();
        } catch (err) {
            this.sockWriter.finish(this._error);
            this.socket.destroy();
            throw err;
        }
    }

    /**
     * Immediately terminates the TCP connection.
     * Pending data may be discarded and the peer may receive a TCP reset.
     */
    public forceClose(): void {
        if (this.isFullyClosed) return;

        this.sockReader.finish(this._error);
        this.sockWriter.finish(this._error);
        this.socket.destroy();
    }

    public async* stream(): BufferGenerator {
        while (true) {
            const data = await this.read();
            if (data === null) break;
            yield data;
        }
    }

    /**
     * Handles remote sent FIN.
     * finishes the pending read operation.
     */
    private onEnd = (): void => {
        this.sockReader.finish(this._error);
    }

    /**
     * Handles conn errors and releases resources associated with this connection.
     */
    private onError = (err: Error): void => {
        this._error = err instanceof TCPError ? err : TCPError.from(TCPErrCode.UNEXPECTED_ERROR, err);
        this.forceClose();
    };

    /**
     * Handles final conn closure.
     * The close event is emitted after the conn is fully closed.
     */
    private onClose = (): void => {
        this.sockReader.finish(this._error);
        this.sockWriter.finish(this._error);
        this.cleanup();
    };

    /**
     * Releases resources owned by this connection.
     */
    private cleanup(): void {
        this.timer.stop();

        this.socket.off(Event.END, this.onEnd);
        this.socket.off(Event.ERROR, this.onError);
        this.socket.off(Event.CLOSE, this.onClose);
    }
}