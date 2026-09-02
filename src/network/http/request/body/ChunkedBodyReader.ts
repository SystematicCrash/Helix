import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import {BodyReader, BufferGenerator, ChunkExtension} from "../../common/types.js";
import {HEX_DIGITS, MAX_CHUNK_SIZE} from "../../common/constants.js";
import {consumeBWS, consumeQuotedString, scanToken} from "../../common/parser.js";
import HttpError from "../../common/HttpError.js";

/** Reads a Transfer-Encoding: chunked body, yielding each chunk's payload. */
export default class ChunkedBodyReader implements BodyReader {
    public length = -1;
    private readonly gen: BufferGenerator;
    private _extensions: ChunkExtension[] = [];

    constructor(
        private readonly conn: TCPConnection,
        private readonly buff: DynamicBuffer,
    ) {
        this.gen = this.readChunks();
    }

    /** Extensions parsed from the most recent chunk-size line. */
    public get extensions(): readonly ChunkExtension[] {
        return this._extensions;
    }

    /** Reads the next chunk payload buffer. */
    async read(): Promise<Buffer | null> {
        const r = await this.gen.next();
        return r.done ? null : r.value;
    }

    /** Generator that reads all chunks sequentially until the terminal zero chunk. */
    private async* readChunks(): BufferGenerator {
        for (let last = false; !last;) {
            const remain = await this.readChunkSize();
            last = remain === 0;

            if (remain > 0) {
                yield* this.consumeChunk(remain);
            }

            await this.skipCRLF();
        }
    }

    /** Reads and parses the hexadecimal chunk size line, including any chunk-ext. */
    private async readChunkSize(): Promise<number> {
        while (true) {
            const idx = this.buff.getView().indexOf('\r\n');

            if (idx < 0) {
                await this.readData();
                continue;
            }

            const line = this.buff.getView(idx).toString('ascii');
            const size = ChunkedBodyReader.parseChunkSize(line);
            const ext = ChunkedBodyReader.parseChunkExtensions(line);

            if (size > MAX_CHUNK_SIZE) {
                throw new HttpError(400, `Exceeded chunk size: "${size}"`);
            }

            this._extensions = ext;

            this.buff.clear(idx + 2);
            return size;
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

    /** // TODO: check that the remaining data in buffer is actually CRLF before removing.
     * Consumes the CRLF that terminates the current chunk — either the trailing CRLF
     * after the chunk-data, or the CRLF after the size-line of the terminal 0-chunk.
     * Pulls more bytes from the connection if the buffer doesn't yet have them.
     */
    private async skipCRLF(): Promise<void> {
        while (this.buff.length < 2) {
            await this.readData();
        }
        if (this.buff.getView().toString() !== Delimiter.CRLF) {
            throw new Error('Invalid chunk framing: missing CRLF after chunk data');
        }

        this.buff.clear(2);
    }

    /**
     * Parses the hexadecimal chunk-size from a chunk-size line (no trailing CRLF).
     * Throws HttpError(400) on malformed input.
     *
     * RFC 7230 §4.1.1: chunk-size = 1*HEXDIG
     */
    private static parseChunkSize(line: string): number {
        const semi = line.indexOf(';');
        const sizePart = (semi < 0 ? line : line.slice(0, semi)).trim();

        if (sizePart.length === 0 || !HEX_DIGITS.test(sizePart)) {
            throw new HttpError(400, `Invalid chunk size: "${line}"`);
        }

        const size = parseInt(sizePart, 16);
        if (!Number.isFinite(size) || size < 0) {
            throw new HttpError(400, `Invalid chunk size: "${line}"`);
        }
        return size;
    }

    /**
     * Parses chunk extensions from a chunk-size line (no trailing CRLF).
     * Returns an empty array if no extensions are present.
     *
     * RFC 7230 §4.1.1:
     *   chunk-ext  = *( BWS ";" BWS chunk-ext-name [ BWS "=" BWS chunk-ext-val ] )
     *   chunk-ext-name = token
     *   chunk-ext-val  = token / quoted-string
     */
    private static parseChunkExtensions(line: string): ChunkExtension[] {
        const semi = line.indexOf(';');
        if (semi < 0) return [];

        const ext: ChunkExtension[] = [];
        let rest = line.slice(semi);

        while (rest.length > 0) {
            if (rest[0] !== ';') {
                throw new HttpError(400, `Invalid chunk extension: "${line}"`);
            }
            rest = consumeBWS(rest.slice(1));

            const nameEnd = scanToken(rest);
            if (nameEnd === 0) {
                throw new HttpError(400, `Invalid chunk extension name: "${line}"`);
            }
            const name = rest.slice(0, nameEnd);
            rest = consumeBWS(rest.slice(nameEnd));

            if (rest.length === 0 || rest[0] !== '=') {
                ext.push({name, value: null});
                continue;
            }
            rest = consumeBWS(rest.slice(1));

            if (rest.length > 0 && rest[0] === '"') {
                try {
                    const q = consumeQuotedString(rest);
                    ext.push({name, value: q.value});
                    rest = rest.slice(q.consumed);
                } catch {
                    throw new HttpError(400, `Unterminated quoted-string in chunk extension: "${line}"`);
                }
            } else {
                const valEnd = scanToken(rest);
                if (valEnd === 0) {
                    throw new HttpError(400, `Invalid chunk extension value: "${line}"`);
                }
                ext.push({name, value: rest.slice(0, valEnd)});
                rest = rest.slice(valEnd);
            }
            rest = consumeBWS(rest);
        }

        return ext;
    }
}
