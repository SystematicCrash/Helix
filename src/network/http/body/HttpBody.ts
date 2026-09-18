import {MAX_BODY_LENGTH} from "../common/constants.js";

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

    protected checkMaxSize(): void {
        if (this.length !== -1 && this.length > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
        if (this.readBytes > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
    }
}