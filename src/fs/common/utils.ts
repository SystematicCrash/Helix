import {ByteRange} from "../../common/types.js";
import {RawIOOptions} from "./types.js";

/**
 * Maps a ByteRange to RawIOOptions for file reading.
 * Returns null if the range cannot be satisfied (RFC 9110 §14.2 -> HTTP 416).
 */
export function rangeToIOOptions(range: ByteRange, fileSize: number): RawIOOptions | null {
    if (fileSize <= 0) return null;

    let position: number;
    let endOffset: number;

    if (range.suffix !== undefined) {
        position = Math.max(0, fileSize - range.suffix);
        endOffset = fileSize - 1;
    } else {
        position = range.start ?? 0;
        endOffset = range.end === -1
            ? fileSize - 1
            : Math.min(range.end, fileSize - 1);
    }

    if (position >= fileSize || position > endOffset) {
        return null;
    }

    const length = endOffset - position + 1;

    return { position, length, offset: 0 };
}