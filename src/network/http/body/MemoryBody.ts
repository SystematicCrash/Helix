import {HttpBody} from "./HttpBody.js";

export default class MemoryBody extends HttpBody {
    private done = false;
    readonly buffer: Buffer;

    constructor(data: Buffer | string) {
        super();
        this.buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.length = data.length;
        this.checkMaxSize();
    }

    static from(data: Buffer | string): MemoryBody {
        return new MemoryBody(Buffer.isBuffer(data) ? data : Buffer.from(data));
    }

    protected async pullBytes(): Promise<Buffer | null> {
        if (this.done) return null;
        this.done = true;
        return this.buffer;
    }
}