import {BodyReader} from "./BodyReader.js";
import {BufferGenerator} from "../../common/types.js";

/** Adapts an async buffer generator into a BodyReader, yielding until the generator ends. */
export default class GeneratorBodyReader extends BodyReader {
    public readonly hasLength: boolean = false;

    constructor(private readonly gen: BufferGenerator) {
        super();
    }

    async read(): Promise<Buffer | null> {
        const r = await this.gen.next();
        if (r.done) return null;
        this.length += r.value.length;
        this.checkMaxSize();
        return r.value;
    }

    async readInto(target: Buffer): Promise<number | null> {
        const r = await this.gen.next();
        if (r.done) return null;
        this.length += r.value.length;
        this.checkMaxSize();
        const len = Math.min(r.value.length, target.length);
        r.value.copy(target, 0, 0, len);
        return len;
    }
}
