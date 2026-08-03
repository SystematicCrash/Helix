import {DataWriter} from "../common/types.js";
import Timer from "../../common/Timer.js";
import {Socket} from "net";
import {
    Event,
    MAX_WRITE_BUFFER_SIZE,
    TCPErrCode,
    WRITE_BUFFER_FLUSH_THRESHOLD,
    WRITE_TIMEOUT
} from "../common/constants.js";
import TCPError from "../common/TCPError.js";
import DynamicBuffer from "../../mem/DynamicBuffer.js";

export default class SocketWriter {
    private timer: Timer;
    private outputBuff: DynamicBuffer;

    private canWrite: boolean = true;
    private finished: boolean = false;

    private writer: DataWriter | null = null;
    private currentPromise: Promise<boolean> | null = null;

    constructor(readonly socket: Socket) {
        this.outputBuff = new DynamicBuffer();
        this.timer = new Timer(Event.WRITE_TIMEOUT, WRITE_TIMEOUT, this.handleTimeout);
        socket.on(Event.DRAIN, this.onDrain);
    }

    /**
     * Indicates that write is finished and no more data can be sent.
     */
    public get isFinished(): boolean {
        return this.finished;
    }

    /**
     * Sets the finished flag to true,
     * and Rejects/Resolves the pending writer promise,
     * no more writes can be performed after this called.
     */
    public finish(err: TCPError | null): void {
        if (this.finished) return;

        this.finished = true;

        if (this.writer) {
            this.writer.reject(
                err || TCPError.from(TCPErrCode.CLOSED_WHILE_WRITE)
            );
        }

        this.cleanup();
    }

    /**
     * Drains write buffer and sends all the remaining data.
     * Retries on backpressure by waiting for the drain event.
     */
    public async flush(): Promise<void> {
        if (this.writer) {
            await this.currentPromise;
        }

        if (!this.outputBuff.length) {
            return;
        }

        await this.tryToFlush();
    }

    /**
     * Writes data to output buffer so prevent small writes.
     */
    public async write(data: Buffer): Promise<void> {
        this.ensureWritable(data);
        this.outputBuff.push(data);

        if (this.outputBuff.length >= WRITE_BUFFER_FLUSH_THRESHOLD) {
            await this.immediateWrite(this.outputBuff.getView());
            this.outputBuff.clear();
        }
    }

    /**
     * Calls socket.write() and hands data immediately to the kernel send buffer.
     */
    public async immediateWrite(data: Buffer): Promise<void> {
        this.ensureWritable(data);

        try {
            this.timer.start();
            const sentToKernel = await this.writePromise(data);
            this.canWrite = sentToKernel && this.socket.writableLength < MAX_WRITE_BUFFER_SIZE;
        } finally {
            this.timer.stop();
        }
    }

    /**
     * Ensures that the socket is writable otherwise throws.
     * Checks if socket write is closed.
     * Checks if backpressure is enabled.
     * Checks if data length is zero.
     * Checks if another write is in progress.
     */
    private ensureWritable(data: Buffer): void {
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
    }

    /**
     * Wraps conn.write() into a promise.
     * Resolves with whether the data was fully accepted into the kernel buffer.
     */
    private writePromise(data: Buffer): Promise<boolean> {
        this.currentPromise = new Promise<boolean>((resolve, reject) => {
            this.writer = {resolve, reject};
            try {

                const sentToKernel = this.socket.write(data, (err?: Error | null) => {
                    this.writer = this.currentPromise = null;
                    if (err) reject(err);
                    else resolve(sentToKernel);
                });

            } catch (err) {
                this.writer = this.currentPromise = null;
                reject(err);
            }
        });
        return this.currentPromise;
    }

    /**
     * Retries writing the buffered data up to MAX_FLUSH_RETRIES times,
     * waiting for drain events between backpressure failures.
     */
    private async tryToFlush(): Promise<void> {
        let retries = 0;
        const MAX_FLUSH_RETRIES = 10;

        while (this.outputBuff.length > 0 && retries < MAX_FLUSH_RETRIES) {
            try {
                await this.immediateWrite(this.outputBuff.getView());
                this.outputBuff.clear();
                return;
            } catch (err) {
                if (err instanceof TCPError && err.code === TCPErrCode.WRITE_BACKPRESSURE) {
                    retries++;
                    await new Promise((resolve, reject) => {
                        this.socket.on(Event.DRAIN, resolve);
                        this.socket.on(Event.ERROR, reject);
                    });
                    continue;
                }
                throw err;
            }
        }

        if (this.outputBuff.length > 0) {
            throw TCPError.from(TCPErrCode.WRITE_BACKPRESSURE);
        }
    }

    /**
     * Handles write timeout and rejects pending write
     */
    private handleTimeout(): void {
        if (this.writer) {
            this.writer.reject(TCPError.from(TCPErrCode.WRITE_TIMEOUT));
            this.writer = null;
            this.currentPromise = null;
        }
    }

    /**
     * Fires after `drain` event and makes the socket writable again.
     */
    private onDrain = (): void => {
        this.canWrite = true;
    }

    /**
     * Called after finish to clean up timers and event listeners.
     */
    private cleanup(): void  {
        this.timer.stop();
        this.socket.off(Event.DRAIN, this.onDrain);
    }
}