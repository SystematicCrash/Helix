import {HttpBody} from "./HttpBody.js";
import {BufferGenerator} from "../common/types.js";

export default class StreamBody extends HttpBody {

    constructor(readonly generator: BufferGenerator, length?: number) {
        super();
        if (length) {
            this.length = length;
        }
    }

    protected async pullBytes(): Promise<Buffer | null> {
        const result = await this.generator.next();
        if (result.done) return null;
        return result.value;
    }
}