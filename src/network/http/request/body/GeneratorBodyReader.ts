import {BodyReader} from "./BodyReader.js";
import {BufferGenerator} from "../../common/types.js";

/** Adapts an async buffer generator into a BodyReader, yielding until the generator ends. */
export default class GeneratorBodyReader extends BodyReader {
    constructor(private readonly gen: BufferGenerator) {
        super();
    }

    async read(): Promise<Buffer | null> {
        const r = await this.gen.next();
        if (r.done) return null;
        return r.value;
    }

    async readInto(target: Buffer): Promise<number | null> {
        const r = await this.gen.next();
        if (r.done) return null;
        const len = Math.min(r.value.length, target.length);
        r.value.copy(target, 0, 0, len);
        return len;
    }
}
