import DynamicBuffer from "../../../../buffer/DynamicBuffer.js";
import {HEX_DIGITS, MAX_CHUNK_SIZE} from "../../common/constants.js";
import {CRLF} from "../../../common/constants.js";
import HttpError from "../../common/HttpError.js";
import {BufferGenerator} from "../../common/types.js";

/**
 * Decodes an HTTP/1.1 chunked stream from any Buffer generator/iterator.
 * Strips hex sizes, extensions, and chunk-framing CRLFs.
 * Leaves unconsumed pipelined bytes inside `buff`.
 */
export async function* parseChunks(source: BufferGenerator, buff: DynamicBuffer,): BufferGenerator {
    for (let last = false; !last;) {
        const size = await readChunkSize(source, buff);
        last = size === 0;

        if (size > 0) {
            yield* consumeChunkData(source, buff, size);
        }

        await skipCRLF(source, buff);
    }
}

/** Pulls the next chunk from the source generator and pushes into the sliding buffer */
async function pullFromSource(source: BufferGenerator, buff: DynamicBuffer): Promise<void> {
    const result = await source.next();
    if (result.done || result.value === null) {
        throw HttpError.badRequest("Unexpected EOF", true);
    }
    buff.push(result.value);
}

/** Reads and parses the hexadecimal chunk-size line */
async function readChunkSize(source: BufferGenerator, buff: DynamicBuffer): Promise<number> {
    while (true) {
        const idx = buff.getView().indexOf(CRLF);

        if (idx < 0) {
            await pullFromSource(source, buff);
            continue;
        }

        const line = buff.getView(idx).toString("ascii");
        const size = parseChunkSizeLine(line);

        if (size > MAX_CHUNK_SIZE) {
            throw HttpError.contentTooLarge(`Chunk size exceeded ${MAX_CHUNK_SIZE}`);
        }

        buff.clear(idx + CRLF.length);
        return size;
    }
}

/** Slices and yields exact chunk payload bytes */
async function* consumeChunkData(source: BufferGenerator, buff: DynamicBuffer, remain: number,): BufferGenerator {
    while (remain > 0) {
        if (!buff.length) {
            await pullFromSource(source, buff);
        }

        const consume = Math.min(remain, buff.length);
        const data = buff.pop(consume);
        remain -= consume;
        yield data;
    }
}

/** Asserts and consumes the trailing CRLF delimiter */
async function skipCRLF(source: BufferGenerator, buff: DynamicBuffer): Promise<void> {
    while (buff.length < CRLF.length) {
        await pullFromSource(source, buff);
    }

    if (!buff.getView(CRLF.length).equals(CRLF)) {
        throw HttpError.badRequest('Invalid chunk framing');
    }

    buff.clear(CRLF.length);
}

/** Validates and parses the hex size up to any chunk extension delimiter */
function parseChunkSizeLine(line: string): number {
    const semi = line.indexOf(";");
    const sizePart = (semi < 0 ? line : line.slice(0, semi)).trim();

    if (sizePart.length === 0 || !HEX_DIGITS.test(sizePart)) {
        throw HttpError.badRequest('Invalid chunk framing');
    }

    const size = parseInt(sizePart, 16);
    if (!Number.isFinite(size) || size < 0) {
        throw HttpError.badRequest('Invalid chunk framing');
    }
    return size;
}