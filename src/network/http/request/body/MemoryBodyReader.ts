import {BodyReaderAbs} from "./BodyReaderAbs.js";

/** Returns a BodyReader that yields the given buffer once, then signals EOF. */
export default class MemoryBodyReader extends BodyReaderAbs {
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
}
