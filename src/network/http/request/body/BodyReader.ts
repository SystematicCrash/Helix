import {MAX_BODY_LENGTH} from "../../common/constants.js";

export abstract class BodyReader {
    public length: number = 0;
    public abstract readonly hasLength: boolean;

    /** Reads the next available chunk of body data. Returns null on EOF. */
    public abstract read(): Promise<Buffer | null>;

    /**
     * Reads the next available chunk of body data into `target`.
     * Returns the number of bytes written, or null on EOF.
     */
    public abstract readInto(target: Buffer): Promise<number | null>;

    protected checkMaxSize(): void {
        if (this.length > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
    }
}