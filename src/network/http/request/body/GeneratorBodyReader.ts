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
        this.length += r?.value?.length ?? 0;
        this.checkMaxSize();
        return r.done ? null : r.value;
    }
}
