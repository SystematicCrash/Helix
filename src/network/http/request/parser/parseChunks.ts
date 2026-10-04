import { HEX_DIGITS, MAX_CHUNK_SIZE } from "../../common/constants.js";
import { CRLF } from "../../../common/constants.js";
import HttpError from "../../common/HttpError.js";
import ByteConsumer from "../../../../buffer/ByteConsumer.js";
import type { BufferGenerator } from "../../../../common/types.js";

/**
 * Decodes an HTTP/1.1 chunked stream using a unified ByteConsumer.
 * Strips hex sizes, chunk extensions, and chunk-framing CRLFs.
 * Yields only the decoded chunk payload bytes.
 */
export async function* parseChunks(consumer: ByteConsumer): BufferGenerator {
    for (let last = false; !last;) {
        const size = await readChunkSize(consumer);
        last = size === 0;

        if (size > 0) {
            yield* consumer.stream(size);
        }

        await skipCRLF(consumer);
    }
}

/** Reads and parses the hexadecimal chunk-size line up to CRLF */
async function readChunkSize(consumer: ByteConsumer): Promise<number> {
    const lineBuffer = await consumer.readUntil(CRLF);

    if (lineBuffer === null) {
        throw HttpError.badRequest("Unexpected EOF while reading chunk size", true);
    }

    const line = lineBuffer.toString("ascii");
    const semi = line.indexOf(";");
    const sizePart = (semi < 0 ? line : line.slice(0, semi)).trim();

    if (sizePart.length === 0 || !HEX_DIGITS.test(sizePart)) {
        throw HttpError.badRequest("Invalid chunk framing");
    }

    const size = parseInt(sizePart, 16);
    if (!Number.isFinite(size) || size < 0) {
        throw HttpError.badRequest("Invalid chunk framing");
    }

    if (size > MAX_CHUNK_SIZE) {
        throw HttpError.contentTooLarge(`Chunk size exceeded ${MAX_CHUNK_SIZE}`);
    }

    return size;
}

/** Asserts and consumes the trailing CRLF delimiter following chunk data */
async function skipCRLF(consumer: ByteConsumer): Promise<void> {
    const crlf = await consumer.readExact(CRLF.length);

    if (crlf === null || !crlf.equals(CRLF)) {
        throw HttpError.badRequest("Invalid chunk framing");
    }
}