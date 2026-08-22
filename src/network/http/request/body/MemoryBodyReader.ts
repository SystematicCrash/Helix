import {BodyReader} from "../../common/types.js";

/** Returns a BodyReader that yields the given buffer once, then signals EOF. */
export default class MemoryBodyReader implements BodyReader {
    public length: number;
    private done = false;

    constructor(private readonly data: Buffer) {
        this.length = data.length;
    }

    async read(): Promise<Buffer | null> {
        if (this.done) return null; // EOF
        this.done = true;
        return this.data;
    }
}
