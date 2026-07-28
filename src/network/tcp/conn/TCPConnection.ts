import {Socket} from 'net';
import TCPError from "../common/TCPError.js";
import SocketReader from "./SocketReader.js";
import SocketWriter from "./SocketWriter.js";
import {Event, IDLE_TIMEOUT, MAX_WRITE_BUFFER_SIZE, READ_TIMEOUT, TCPErrCode, WRITE_TIMEOUT,} from "../common/constants.js";

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
    private sockReader: SocketReader;
    private sockWriter: SocketWriter;
    private _error: TCPError | null = null;

    constructor(private readonly socket: Socket) {
        this.sockReader = new SocketReader(socket);
        this.sockWriter = new SocketWriter(socket);

        socket.on(Event.END, this.onEnd);
        socket.on(Event.ERROR, this.onError);
        socket.on(Event.CLOSE, this.onClose);

        socket.setTimeout(
            IDLE_TIMEOUT,
            () => this.socket.emit(
                Event.ERROR,
                TCPError.from(TCPErrCode.IDLE_TIMEOUT)
            )
        );
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

    public async read(): Promise<Buffer | null> {
        if (this._error) {
            throw this._error;
        }

        if (this.isFullyClosed) {
            throw TCPError.from(TCPErrCode.READ_AFTER_CLOSE);
        }

        return await this.sockReader.read();
    }

    public async write(data: Buffer): Promise<void> {
        if (this._error) {
            throw this._error;
        }

        if (this.isFullyClosed) {
            throw TCPError.from(TCPErrCode.WRITE_AFTER_CLOSE);
        }

        await this.sockWriter.write(data);
    }

    /**
     * Performs a graceful TCP shutdown.
     *
     * Pending writes are flushed before the conn is closed.
     * Further writes are rejected after this method is called.
     */
    public close(): void {
        if (this.sockWriter.isFinished) return;

        this.sockWriter.finish(this._error);
        this.socket.end();
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
        this.socket.setTimeout(0);

        this.socket.off(Event.END, this.onEnd);
        this.socket.off(Event.ERROR, this.onError);
        this.socket.off(Event.CLOSE, this.onClose);
    }
}