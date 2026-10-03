import type { BufferGenerator } from "../common/types.js";

export default class ByteConsumer {
    private isDone = false;
    private remaining?: number;

    constructor(private readonly source: BufferGenerator, length?: number) {
        if (length !== undefined) {
            this.remaining = Math.max(0, length);
        }
    }

    /**
     * Consumes chunks from the generator and passes each to the provided sink.
     * Guarantees generator cleanup (invoking source.return()) regardless of whether
     * the consumer finishes normally, halts early due to a length cap, or throws.
     */
    public async consume(sink: (chunk: Buffer) => Promise<void> | void): Promise<void> {
        try {
            while (!this.isDone) {
                if (this.remaining !== undefined && this.remaining <= 0) {
                    break;
                }

                const result = await this.source.next();
                if (result.done || result.value === null) {
                    break;
                }

                let chunk = result.value;

                if (this.remaining !== undefined) {
                    if (chunk.length >= this.remaining) {
                        chunk = chunk.subarray(0, this.remaining);
                        this.remaining = 0;
                        this.isDone = true;
                    } else {
                        this.remaining -= chunk.length;
                    }
                }

                if (chunk.length > 0) {
                    await sink(chunk);
                }
            }
        } finally {
            await this.dispose();
        }
    }

    /**
     * Closes the underlying generator and triggers any finally blocks
     * (releasing locks, closing file handles, etc.).
     */
    private async dispose(): Promise<void> {
        if (this.isDone) return;
        this.isDone = true;

        if (typeof this.source.return === "function") {
            try {
                await this.source.return();
            } catch {}
        }
    }
}