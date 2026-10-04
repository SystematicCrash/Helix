import {MAX_BODY_LENGTH} from "../common/constants.js";
import HttpError from "../common/HttpError.js";

export abstract class HttpBody {
    /**
     * The total body length in bytes, or `-1` when the length is unknown
     * and only discoverable during reads (e.g. chunked, EOF-delimited).
     */
    public length: number = -1;

    /** Bytes pulled from the underlying source so far. Always starts at 0. */
    public readBytes: number = 0;

    /**
     * Reads the next available chunk of body data, or null on EOF.
     * Subclasses implement this to fetch from their underlying source.
     */
    protected abstract pullBytes(): Promise<Buffer | null>;

    public async read(): Promise<Buffer | null> {
        const chunk = await this.pullBytes();
        if (chunk === null) return null;
        this.readBytes += chunk.length;
        this.checkMaxSize();
        return chunk;
    }

    /**
     * Streams each chunk to a sink callback.
     * Subclasses can override this to implement managed consumption with
     * automatic cleanup (e.g. using ByteConsumer for generators).
     */
    public async consume(sink: (chunk: Buffer) => Promise<void> | void): Promise<void> {
        while (true) {
            const chunk = await this.read();
            if (chunk === null) break;
            await sink(chunk);
        }
    }

    /**
     * Reads and discards every remaining chunk until EOF. Throws
     * `contentTooLarge` if the cumulative size exceeds `MAX_BODY_LENGTH`.
     */
    public async drain(): Promise<void> {
        await this.consume(() => {});
    }

    protected checkMaxSize(): void {
        if (this.length !== -1 && this.length > MAX_BODY_LENGTH) {
            throw HttpError.contentTooLarge();
        }
        if (this.readBytes > MAX_BODY_LENGTH) {
            throw HttpError.contentTooLarge();
        }
    }
}