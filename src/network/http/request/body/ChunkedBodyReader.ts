import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import {BodyReader, BufferGenerator} from "../../common/types.js";

/** Reads a Transfer-Encoding: chunked body, yielding each chunk's payload. */
export default class ChunkedBodyReader implements BodyReader {
    public length = -1;
    private readonly gen: BufferGenerator;

    constructor(
        private readonly conn: TCPConnection,
        private readonly buff: DynamicBuffer,
    ) {
        this.gen = this.readChunks();
    }

    async read(): Promise<Buffer | null> {
        const r = await this.gen.next();
        return r.done ? null : r.value;
    }

    private async *readChunks(): BufferGenerator {
        for (let last = false; !last;) {
            const idx = this.buff.getView().indexOf('\r\n');

            if (idx < 0) {
                const chunk = await this.conn.read();
                if (chunk === null) {
                    throw new Error('Unexpected EOF while reading chunk size');
                }
                this.buff.push(chunk);
                continue;
            }

            const sizeLine = this.buff.getView(idx).toString().trim();
            let remain = parseInt(sizeLine, 16);
            if (isNaN(remain)) {
                throw new Error(`Invalid chunk size: "${sizeLine}"`);
            }

            this.buff.clear(idx + 2);
            last = remain === 0;

            while (remain > 0) {
                if (!this.buff.length) {
                    const chunk = await this.conn.read();
                    if (chunk === null) {
                        throw new Error('Unexpected EOF while reading chunk data');
                    }
                    this.buff.push(chunk);
                }

                const consume = Math.min(remain, this.buff.length);
                const data = this.buff.getView(consume);
                this.buff.clear(consume);
                remain -= consume;
                yield data;
            }
            this.buff.clear(2);
        }
    }
}
