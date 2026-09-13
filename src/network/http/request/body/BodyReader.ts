import {MAX_BODY_LENGTH} from "../../common/constants.js";

export abstract class BodyReader {
    public length: number = 0;
    public abstract readonly hasLength: boolean;

    public abstract read(target?: Buffer): Promise<Buffer | null | number>;

    /** Fills `target` with data and returns bytes read, or null on EOF. */
    public async readInto(target: Buffer): Promise<number | null> {
        const result = await this.read(target);
        if (result === null) return null;
        return typeof result === 'number' ? result : result.length;
    }

    protected checkMaxSize(): void {
        if (this.length > MAX_BODY_LENGTH) {
            throw new Error('Body length exceeded the maximum number of bytes');
        }
    }
}