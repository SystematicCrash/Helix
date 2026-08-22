import {Socket} from 'net';
import {DataReader} from "../common/types.js";
import Timer from "../../common/Timer.js";
import {Event, READ_TIMEOUT, TCPErrCode} from "../common/constants.js";
import TCPError from "../common/TCPError.js";

export default class SocketReader {
    private timer: Timer;
    private finished: boolean = false;
    private reader: DataReader | null = null;

    constructor(readonly socket: Socket) {
        this.timer = new Timer(Event.READ_TIMEOUT, READ_TIMEOUT, this.handleTimeout);
        this.socket.on(Event.DATA, this.onData);
    }

    public get isFinished(): boolean {
        return this.finished;
    }

    /**
     * Reads the next available chunk from the TCP stream.
     * Only one read operation can be pending at a time.
     * Returns the next non-empty chunk, or null when the peer closes the connection.
     * Zero-length chunks are consumed and skipped internally so callers never see them.
     */
    public async read(): Promise<Buffer | null> {
        if (this.finished) {
            throw TCPError.from(TCPErrCode.READ_AFTER_EOF);
        }

        if (this.reader) {
            throw TCPError.from(TCPErrCode.SIMULTANEOUS_READ);
        }

        try {
            this.timer.start();
            let data: Buffer | null;
            do {
                data = await this.readPromise();
            } while (data !== null && data.length === 0);
            return data;
        } finally {
            this.timer.stop();
        }
    }

    /**
     * Sets the closed flag to true,
     * and Resolves/Rejects the pending reader promise if exists,
     * no more reads can be performed after this called.
     */
    public finish(err: TCPError | null): void {
        if (this.finished) return;

        this.finished = true;

        if (this.reader) {
            if (err) this.reader.reject(err);
            else this.reader.resolve(null);
        }

        this.cleanup();
    }

    /**
     * Creates a pending read promise and resumes conn consumption.
     */
    private readPromise(): Promise<Buffer | null> {
        return new Promise((resolve, reject) => {
            this.reader = {resolve, reject};
            this.socket.resume();
        });
    }

    /**
     * Handles incoming conn data.
     * Pauses conn until the next read is called.
     * sets reader to null to signal that the read is completed.
     */
    private onData = (data: Buffer): void => {
        this.socket.pause();

        if (!this.reader) return;

        this.reader.resolve(data);
        this.reader = null;
    };

    /**
     * Handles write timeout and rejects pending write
     */
    private handleTimeout = (): void => {
        if (this.reader) {
            this.reader.reject(TCPError.from(TCPErrCode.READ_TIMEOUT));
            this.reader = null;
        }
    }

    private cleanup(): void  {
        this.timer.stop();
        this.socket.off(Event.DATA, this.onData);
    }
}