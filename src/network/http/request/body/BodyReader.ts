import {MAX_BODY_LENGTH} from "../../common/constants.js";

export abstract class BodyReader {
    /**
     * The total body length in bytes, or `-1` when the length is unknown
     * and only discoverable during reads (e.g. chunked, EOF-delimited).
     */
    public length: number = -1;

    /** Bytes pulled from the underlying source so far. Always starts at 0. */
    public readBytes: number = 0;

    public abstract read(): Promise<Buffer | null>;

    /**
     * Reads the next available chunk of body data into `target`.
     * Returns the number of bytes written, or null on EOF.
     */
    public abstract readInto(target: Buffer): Promise<number | null>;

    protected checkMaxSize(): void {
        if (this.length !== -1 && this.length > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
    }
}