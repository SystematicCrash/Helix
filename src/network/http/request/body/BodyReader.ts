import {MAX_BODY_LENGTH} from "../../common/constants.js";

export abstract class BodyReader {
    public length: number = 0;

    /**
     * True when the total body length is known at construction time
     * (Content-Length framing). False when length is only discovered
     * incrementally during reads (chunked / connection-close framing).
     */
    public abstract readonly hasLength: boolean;

    public abstract read(): Promise<Buffer | null>;

    protected checkMaxSize(): void {
        if (this.length > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
    }
}