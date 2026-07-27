import {DataWriter} from "./types.js";
import Timer from "../common/Timer.js";
import {Socket} from "net";
import {Event, MAX_WRITE_BUFFER_SIZE, TCPErrCode, WRITE_TIMEOUT} from "./constants.js";
import TCPError from "./TCPError.js";

export default class SocketWriter {
    private timer: Timer;
    private canWrite: boolean = true;
    private finished: boolean = false;
    private writer: DataWriter | null = null;

    constructor(readonly socket: Socket) {
        this.timer = new Timer(
            Event.WRITE_TIMEOUT,
            WRITE_TIMEOUT,
            () => this.writer?.reject(TCPError.from(TCPErrCode.WRITE_TIMEOUT))
        );

        socket.on(Event.DRAIN, this.onDrain);
    }

    public get isFinished(): boolean {
        return this.finished;
    }

    /**
     * Sets the finished flag to true,
     * and Rejects/Resolves the pending writer promise,
     * no more writes can be performed after this called.
     */
    public finish(err: TCPError | null): void {
        this.finished = true;

        if (this.writer) {
            if (err) this.writer.reject(err);
        }

        this.cleanup();
    }

    /**
     * Writes data to the TCP socket.
     * Backpressure is reported when the internal buffer is full.
     */
    public async write(data: Buffer): Promise<void> {
        if (this.finished) {
            throw TCPError.from(TCPErrCode.WRITE_AFTER_EOF);
        }

        if (!this.canWrite) {
            throw TCPError.from(TCPErrCode.WRITE_BACKPRESSURE);
        }

        if (data.length === 0) {
            throw TCPError.from(TCPErrCode.EMPTY_DATA_BUFFER);
        }

        if (this.writer) {
            throw TCPError.from(TCPErrCode.SIMULTANEOUS_WRITE);
        }

        try {
            this.timer.start();
            const sentToKernel = await this.writePromise(data);
            this.canWrite = sentToKernel && this.socket.writableLength < MAX_WRITE_BUFFER_SIZE;
        } finally {
            this.timer.stop();
        }
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

    private onDrain = (): void => {
        this.canWrite = true;
    }

    private cleanup(): void  {
        this.timer.stop();
        this.socket.off(Event.DRAIN, this.onDrain);
    }
}