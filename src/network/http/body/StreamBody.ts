import {HttpBody} from "./HttpBody.js";
import {BufferGenerator} from "../common/types.js";

export default class StreamBody extends HttpBody {

    constructor(readonly generator: BufferGenerator) {
        super();
    }

    protected async pullBytes(): Promise<Buffer | null> {
        const result = await this.generator.next();
        if (result.done) return null;
        return result.value;
    }
}