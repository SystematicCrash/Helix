import {HttpBody} from "./HttpBody.js";
import ByteConsumer from "../../../buffer/ByteConsumer.js";
import type {BufferGenerator} from "../../../common/types.js";

export default class StreamBody extends HttpBody {
    private consumer!: ByteConsumer;
    /** True when the source was a raw generator we wrapped, so we own its cleanup. */
    private readonly ownsSource: boolean;

    constructor(source: ByteConsumer | BufferGenerator, length?: number) {
        super();
        if (length !== undefined) {
            this.length = length;
        }

        this.ownsSource = !(source instanceof ByteConsumer);
        this.consumer = source instanceof ByteConsumer
            ? source
            : new ByteConsumer(source);
    }

    /**
     * Managed consumption override: feeds chunks directly through ByteConsumer,
     * enforcing the length limit, slicing boundaries, tracking readBytes,
     * and guaranteeing generator cleanup on EOF or writer aborts.
     */
    public override async consume(sink: (chunk: Buffer) => Promise<void> | void): Promise<void> {
        try {
            await this.consumer.consume(async (chunk) => {
                    this.readBytes += chunk.length;
                    this.checkMaxSize();
                    await sink(chunk);
                },
                this.length === -1 ? undefined : this.length
            );
        } finally {
            // A bounded read stops before the underlying generator is exhausted,
            // so its finally-cleanup (e.g. handle.close) never runs on its own.
            // Dispose only generators we wrapped — never a shared consumer.
            if (this.ownsSource) {
                await this.consumer.dispose();
            }
        }
    }

    /**
     * Fallback for callers using individual read() calls.
     * Returns the next chunk (bounded by the remaining content length),
     * or null at EOF.
     */
    protected async pullBytes(): Promise<Buffer | null> {
        if (this.length !== -1) {
            const remaining = this.length - this.readBytes;
            if (remaining <= 0) {
                if (this.ownsSource) {
                    await this.consumer.dispose();
                }
                return null;
            }
            return this.consumer.read(remaining);
        }
        return this.consumer.read();
    }
}