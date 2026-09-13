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
     * Reads data from remote connection into `target` buffer.
     * Returns the number of bytes read, or null if EOF.
     */
    public async readInto(target: Buffer): Promise<number | null> {
        const result = await this.read(target);
        if (result === null) return null;
        return typeof result === 'number' ? result : result.length;
    }

    /**
     * Reads data from remote connection.
     * If `target` is provided, copies data into it and returns the number of bytes written.
     * If no target is provided, returns the next available chunk.
     */
    public async read(target?: Buffer): Promise<Buffer | null | number> {
        if (this._error) {
            throw this._error;
        }

        if (this.isFullyClosed) {
            throw TCPError.from(TCPErrCode.READ_AFTER_CLOSE);
        }

        this.stopIdleTimer();
        try {
            return await this.sockReader.read(target);
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