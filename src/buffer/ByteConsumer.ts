import DynamicBuffer from "./DynamicBuffer.js";
import type { BufferGenerator } from "../common/types.js";

export default class ByteConsumer {
    private readonly buffer: DynamicBuffer;
    private isSourceExhausted = false;
    private isDisposed = false;

    constructor(
        private readonly source: BufferGenerator,
        initialBuffer?: DynamicBuffer
    ) {
        this.buffer = initialBuffer ?? new DynamicBuffer();
    }

    /** Number of bytes currently held in the internal buffer. */
    public get bufferedBytes(): number {
        return this.buffer.length;
    }

    /**
     * Reads up to `maxBytes` (or the next available buffered chunk).
     * Returns null on EOF when no bytes remain.
     */
    public async read(maxBytes?: number): Promise<Buffer | null> {
        if (this.buffer.length === 0) {
            const hasMore = await this.pullFromSource();
            if (!hasMore) return null;
        }

        const toRead = maxBytes !== undefined
            ? Math.min(maxBytes, this.buffer.length)
            : this.buffer.length;

        return this.buffer.pop(toRead);
    }

    /**
     * Reads until `delimiter` is encountered.
     * Returns the bytes preceding `delimiter`, discarding the delimiter from the stream.
     * Returns null if EOF is reached before the delimiter is found.
     */
    public async readUntil(delimiter: Buffer): Promise<Buffer | null> {
        while (true) {
            const message = this.buffer.consumeUntil(delimiter);
            if (message !== null) {
                return message;
            }

            const hasMore = await this.pullFromSource();
            if (!hasMore) {
                return null;
            }
        }
    }

    /**
     * Reads exactly `size` bytes across one or more chunks.
     * Returns null if EOF was reached before any bytes could be read.
     * Throws an Error if EOF occurs mid-read before satisfying `size`.
     */
    public async readExact(size: number): Promise<Buffer | null> {
        if (size <= 0) return Buffer.alloc(0);

        while (this.buffer.length < size) {
            const hasMore = await this.pullFromSource();
            if (!hasMore) {
                if (this.buffer.length === 0) return null;
                break;
            }
        }

        return this.buffer.pop(size);
    }

    /**
     * Returns a bounded async generator yielding up to `length` bytes.
     * Does NOT dispose this parent consumer when iteration terminates, allowing
     * subsequent reads (like keep-alive requests) to continue seamlessly.
     */
    public async* stream(length?: number): BufferGenerator {
        let remaining = length !== undefined ? Math.max(0, length) : undefined;

        while (true) {
            if (remaining !== undefined && remaining <= 0) {
                break;
            }

            const pullLimit = remaining !== undefined ? remaining : undefined;
            const chunk = await this.read(pullLimit);
            if (chunk === null) {
                break;
            }

            if (remaining !== undefined) {
                remaining -= chunk.length;
            }

            yield chunk;
        }
    }

    /**
     * Consumes chunks from the stream and passes each to the provided sink.
     * If `length` is provided, stops after consuming that many bytes.
     */
    public async consume(sink: (chunk: Buffer) => Promise<void> | void, length?: number): Promise<void> {
        for await (const chunk of this.stream(length)) {
            await sink(chunk);
        }
    }

    /**
     * Pulls the next available chunk from the underlying generator
     * and appends it to the internal DynamicBuffer.
     */
    private async pullFromSource(): Promise<boolean> {
        if (this.isSourceExhausted || this.isDisposed) {
            return false;
        }

        const result = await this.source.next();
        if (result.done || result.value === null) {
            this.isSourceExhausted = true;
            return false;
        }

        this.buffer.push(result.value);
        return true;
    }

    /**
     * Closes the underlying generator and releases resources (e.g., file descriptors, sockets).
     */
    public async dispose(): Promise<void> {
        if (this.isDisposed) return;
        this.isDisposed = true;

        if (typeof this.source.return === "function") {
            try {
                await this.source.return();
            } catch {}
        }
    }
}