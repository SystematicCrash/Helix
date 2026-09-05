import {MAX_BODY_LENGTH} from "../../common/constants.js";

export abstract class BodyReaderAbs {
    public length: number = 0;

    public abstract read(): Promise<Buffer | null>;

    protected checkMaxSize(): void {
        if (this.length > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
    }
}