import {Socket} from 'net';
import {DataReader} from "./types.js";
import Timer from "../common/Timer.js";
import {Event, READ_TIMEOUT, TCPErrCode} from "./constants.js";
import TCPError from "./TCPError.js";

export default class SocketReader {
    private timer: Timer;
    private finished: boolean = false;
    private reader: DataReader | null = null;

    constructor(readonly socket: Socket) {
        this.timer = new Timer(
            Event.READ_TIMEOUT,
            READ_TIMEOUT,
            () => this.reader?.reject(TCPError.from(TCPErrCode.READ_TIMEOUT))
        );

        this.socket.on(Event.DATA, this.onData);
    }

    public get isFinished(): boolean {
        return this.finished;
    }

    /**
     * Reads the next available chunk from the TCP stream.
     * Only one read operation can be pending at a time.
     * Returns empty buffer when the remote peer performs a graceful shutdown.
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
            return await this.readPromise();
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
        this.finished = true;
        if (this.reader) {
            if (err) this.reader.reject(err);
            else this.reader.resolve(null);
        }
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
}