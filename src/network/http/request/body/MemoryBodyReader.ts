import {BodyReader} from "./BodyReader.js";

/** Returns a BodyReader that yields the given buffer once, then signals EOF. */
export default class MemoryBodyReader extends BodyReader {
    private done = false;

    constructor(private data: Buffer) {
        super();
        this.length = data.length;
        this.checkMaxSize();
    }

    protected async pullBytes(): Promise<Buffer | null> {
        if (this.done) return null;
        this.done = true;
        return this.data;
    }
}
