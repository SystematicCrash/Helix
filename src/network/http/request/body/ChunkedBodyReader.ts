import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import {BodyReader, BufferGenerator} from "../../common/types.js";
import {MAX_CHUNK_SIZE} from "../../common/constants.js";
import HttpError from "../../common/HttpError.js";

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

    /** Reads the next chunk payload buffer. */
    async read(): Promise<Buffer | null> {
        const r = await this.gen.next();
        return r.done ? null : r.value;
    }

    /** Generator that reads all chunks sequentially until the terminal zero chunk. */
    private async *readChunks(): BufferGenerator {
        for (let last = false; !last;) {
            const remain = await this.readChunkSize();
            last = remain === 0;

            if (remain > 0) {
                yield* this.consumeChunk(remain);
            }

            this.buff.clear(2);
        }
    }

    /** Reads and parses the hexadecimal chunk size line. */
    private async readChunkSize(): Promise<number> {
        while (true) {
            const idx = this.buff.getView().indexOf('\r\n');

            if (idx < 0) {
                await this.readData();
                continue;
            }

            const chunkSize = this.buff.getView(idx).toString().trim();
            const remain = parseInt(chunkSize, 16);
            if (isNaN(remain)) {
                throw new HttpError(400, `Invalid chunk size: "${chunkSize}"`);
            }
            if (remain > MAX_CHUNK_SIZE) {
                throw new HttpError(400, `Exceeded chunk size: "${chunkSize}"`);
            }

            this.buff.clear(idx + 2);
            return remain;
        }
    }

    /** Yields the payload bytes for the current chunk. */
    private async *consumeChunk(remain: number): BufferGenerator {
        while (remain > 0) {
            if (!this.buff.length) {
                await this.readData();
            }

            const consume = Math.min(remain, this.buff.length);
            const data = this.buff.getView(consume);
            this.buff.clear(consume);
            remain -= consume;
            yield data;
        }
    }

    /** Reads chunk data from socket and pushes it into the buffer */
    private async readData(): Promise<void> {
        const chunk = await this.conn.read();
        if (chunk === null) {
            throw new HttpError(410, 'Unexpected EOF while reading chunk data');
        }
        this.buff.push(chunk);
    }
}
