/** A growable buffer with a sliding window to avoid redundant copies on consume. */
type DynBuf = {
    data: Buffer;
    length: number;
    start: number;
}

/** Appends data to the buffer, doubling its capacity when the current allocation is exceeded. */
function bufPush(buf: DynBuf, data: Buffer) {
    const newLen = buf.length + data.length;

    if (newLen > buf.data.length) {
        let cap = Math.max(buf.data.length, 32);

        while(cap < newLen) cap *= 2;

        const grown = Buffer.alloc(cap);
        buf.data.copy(grown, 0, 0);
        buf.data = grown;
    }

    data.copy(buf.data, buf.length, 0);
    buf.length = newLen;
}

/**
 * Compacts the buffer by shifting remaining data to the front.
 * Only triggers when consumed bytes exceed half the allocated capacity, to amortize copy cost.
 */
function bufPop(buf: DynBuf, length: number): void {
    if (length < (buf.data.length / 2)) return;

    buf.data.copyWithin(0, length, buf.length);
    buf.length -= length;
    buf.start = 0;
}

/**
 * Scans for the next newline-delimited message and returns it, advancing the start pointer.
 * Returns null if no complete message is available yet.
 */
function popMessage(buf: DynBuf): Buffer|null {
    let idx = buf.data.subarray(buf.start, buf.length)
        .indexOf('\n') + buf.start;

    if (idx < buf.start) return null;

    const msg = Buffer.from(
        buf.data.subarray(buf.start, idx + 1)
    );
    buf.start = idx + 1;
    bufPop(buf, idx + 1);
    return msg;
}

export { bufPush, popMessage, DynBuf };