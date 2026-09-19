import {CRLF} from "../../../common/constants.js";

export function encodeChunk(data: Buffer): Buffer {
    const chunkLen = Buffer.from(data.length.toString(16));

    if (data.length === 0)
        return Buffer.concat([chunkLen, CRLF, CRLF]);

    return Buffer.concat([chunkLen, CRLF, data, CRLF]);
}