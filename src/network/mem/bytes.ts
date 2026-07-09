import Delimiter from "../common/constants";

/** Splits a buffer on all occurrences of a delimiter, returning the parts without the delimiter. */
export function splitBuffer(bytes: Buffer, delimiter: Delimiter|string): Buffer[] {
    let start = 0;
    const parts: Buffer[] = [];
    const target = Buffer.from(delimiter);

    while (true) {
        const idx = bytes.indexOf(target, start);
        if (idx === -1) break;
        parts.push(bytes.subarray(start, idx));
        start = idx + target.length;
    }

    parts.push(bytes.subarray(start));
    return parts;
}

/** Removes all leading and trailing occurrences of a delimiter sequence from a buffer. */
export function stripBuffer(bytes: Buffer, delimiter: Delimiter): Buffer {
    const trim = Buffer.from(delimiter);
    // Removing from start
    while (bytes.length >= trim.length && bytes.subarray(0, trim.length).equals(trim))
        bytes = bytes.subarray(trim.length);
    // Removing from end
    bytes = bytes.reverse();
    while (bytes.length >= trim.length && bytes.subarray(0, trim.length).equals(trim))
        bytes = bytes.subarray(trim.length);

    return bytes.reverse();
}