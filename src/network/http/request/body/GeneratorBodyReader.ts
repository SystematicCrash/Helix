import {BodyReader} from "./BodyReader.js";
import {BufferGenerator} from "../../common/types.js";

/** Adapts an async buffer generator into a BodyReader, yielding until the generator ends. */
export default class GeneratorBodyReader extends BodyReader {
    constructor(private readonly gen: BufferGenerator) {
        super();
    }

    protected async pullBytes(): Promise<Buffer | null> {
        const r = await this.gen.next();
        return r.done ? null : r.value;
    }
}
