/** Splits a buffer on all occurrences of a delimiter, returning the parts without the delimiter.
 * Empty parts are dropped unless `keepEmpty` is set (needed when empty parts are significant,
 * e.g. double spaces in a request-line are malformed per RFC 9112 §3). */
export function splitBuffer(bytes: Buffer, delimiter: Buffer, keepEmpty = false): Buffer[] {
    let start = 0;
    const parts: Buffer[] = [];

    while (true) {
        const idx = bytes.indexOf(delimiter, start);
        if (idx === -1) break;
        const part = bytes.subarray(start, idx);
        if (part.length || keepEmpty) parts.push(part);
        start = idx + delimiter.length;
    }

    parts.push(bytes.subarray(start));
    return parts;
}

/** Removes all leading and trailing occurrences of a delimiter sequence from a buffer. */
export function stripBuffer(bytes: Buffer, delimiter: Buffer): Buffer {
    // Removing from start
    while (bytes.length >= delimiter.length && bytes.subarray(0, delimiter.length).equals(delimiter))
        bytes = bytes.subarray(delimiter.length);
    // Removing from end: reverse both, strip from front, then reverse result.
    const reversed = Buffer.from(bytes).reverse();
    const delimRev = Buffer.from(delimiter).reverse();
    let r = reversed;
    while (r.length >= delimRev.length && r.subarray(0, delimRev.length).equals(delimRev))
        r = r.subarray(delimRev.length);

    return r.reverse();
}
