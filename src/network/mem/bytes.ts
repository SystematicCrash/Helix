import {Delimiter} from "../common/constants";

/** Splits a buffer on all occurrences of a delimiter, returning the parts without the delimiter.
 * Empty parts are dropped unless `keepEmpty` is set (needed when empty parts are significant,
 * e.g. double spaces in a request-line are malformed per RFC 9112 §3). */
export function splitBuffer(bytes: Buffer, delimiter: Delimiter|string, keepEmpty = false): Buffer[] {
    let start = 0;
    const parts: Buffer[] = [];
    const target = Buffer.from(delimiter);

    while (true) {
        const idx = bytes.indexOf(target, start);
        if (idx === -1) break;
        const part = bytes.subarray(start, idx);
        if (part.length || keepEmpty) parts.push(part);
        start = idx + target.length;
    }

    parts.push(bytes.subarray(start));
    return parts;
}

/** Removes all leading and trailing occurrences of a delimiter sequence from a buffer. */
export function stripBuffer(bytes: Buffer, delimiter: Delimiter): Buffer {
    let trim = Buffer.from(delimiter);
    // Removing from start
    while (bytes.length >= trim.length && bytes.subarray(0, trim.length).equals(trim))
        bytes = bytes.subarray(trim.length);
    // Removing from end
    bytes = bytes.reverse();
    trim = trim.reverse();
    while (bytes.length >= trim.length && bytes.subarray(0, trim.length).equals(trim))
        bytes = bytes.subarray(trim.length);

    return bytes.reverse();
}