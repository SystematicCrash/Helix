import {HttpBody} from "./HttpBody.js";
import ByteConsumer from "../../../buffer/ByteConsumer.js";
import type {BufferGenerator} from "../../../common/types.js";

export default class StreamBody extends HttpBody {
    private consumer!: ByteConsumer;

    constructor(source: ByteConsumer | BufferGenerator, length?: number) {
        super();
        if (length !== undefined) {
            this.length = length;
        }

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
        await this.consumer.consume(async (chunk) => {
                this.readBytes += chunk.length;
                this.checkMaxSize();
                await sink(chunk);
            },
            this.length
        );
    }

    /**
     * Fallback for callers using individual read() calls.
     */
    protected async pullBytes(): Promise<Buffer | null> {
        let chunk: Buffer | null = null;
        await this.consumer.consume((data) => {
            chunk = data;
        });
        return chunk;
    }
}