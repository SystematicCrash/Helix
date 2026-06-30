type DynBuf = {
    data: Buffer;
    length: number;
    start: number;
}

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

function bufPop(buf: DynBuf, length: number): void {
    if (length < (buf.data.length / 2)) return;

    buf.data.copyWithin(0, length, buf.length);
    buf.length -= length;
    buf.start = 0;
}

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