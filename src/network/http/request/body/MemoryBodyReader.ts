import {BodyReader} from "./BodyReader.js";

/** Returns a BodyReader that yields the given buffer once, then signals EOF. */
export default class MemoryBodyReader extends BodyReader {
    public readonly hasLength: boolean = true;
    private done = false;

    constructor(private readonly data: Buffer) {
        super();
        this.length = data.length;
        this.checkMaxSize();
    }

    async read(target?: Buffer): Promise<Buffer | null | number> {
        if (this.done) return null; // EOF
        this.done = true;
        if (target) {
            const len = Math.min(this.data.length, target.length);
            this.data.copy(target, 0, 0, len);
            return len;
        }
        return this.data;
    }
}
