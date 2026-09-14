import {BodyReader} from "./BodyReader.js";

/** Returns a BodyReader that yields the given buffer once, then signals EOF. */
export default class MemoryBodyReader extends BodyReader {
    private done = false;

    constructor(private readonly data: Buffer) {
        super();
        this.length = data.length;
        this.checkMaxSize();
    }

    async read(): Promise<Buffer | null> {
        if (this.done) return null; // EOF
        this.done = true;
        return this.data;
    }

    async readInto(target: Buffer): Promise<number | null> {
        if (this.done) return null;
        this.done = true;
        const len = Math.min(this.data.length, target.length);
        this.data.copy(target, 0, 0, len);
        return len;
    }
}
