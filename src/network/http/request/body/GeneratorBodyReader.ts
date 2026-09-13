import {BodyReader} from "./BodyReader.js";
import {BufferGenerator} from "../../common/types.js";

/** Adapts an async buffer generator into a BodyReader, yielding until the generator ends. */
export default class GeneratorBodyReader extends BodyReader {
    public readonly hasLength: boolean = false;

    constructor(private readonly gen: BufferGenerator) {
        super();
    }

    async read(target?: Buffer): Promise<Buffer | null | number> {
        const r = await this.gen.next();
        this.length += r?.value?.length ?? 0;
        this.checkMaxSize();
        if (r.done) return null;
        if (target) {
            const len = Math.min(r.value.length, target.length);
            r.value.copy(target, 0, 0, len);
            return len;
        }
        return r.value;
    }
}
