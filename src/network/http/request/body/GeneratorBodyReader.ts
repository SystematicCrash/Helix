import {BodyReader, BufferGenerator} from "../../common/types.js";

/** Adapts an async buffer generator into a BodyReader, yielding until the generator ends. */
export default class GeneratorBodyReader implements BodyReader {
    public length = -1;

    constructor(private readonly gen: BufferGenerator) {}

    async read(): Promise<Buffer | null> {
        const r = await this.gen.next();
        return r.done ? null : r.value;
    }
}
