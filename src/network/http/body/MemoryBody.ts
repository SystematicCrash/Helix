import {HttpBody} from "./HttpBody.js";

export default class MemoryBody extends HttpBody {
    private done = false;

    constructor(readonly buffer: Buffer) {
        super();
        this.length = buffer.length;
        this.checkMaxSize();
    }

    protected async pullBytes(): Promise<Buffer | null> {
        if (this.done) return null;
        this.done = true;
        return this.buffer;
    }
}