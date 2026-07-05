/** A growable buffer with a sliding window to avoid redundant copies on consume. */
export default class DynamicBuffer {
    public length: number;
    public start: number;

    constructor(public data: Buffer = Buffer.alloc(0)) {
        this.length = data.length;
        this.start = 0;
    }

    /** Appends data to the buffer, doubling its capacity when the current allocation is exceeded. */
    push(data: Buffer) {
        const newLen = this.length + data.length;

        if (newLen > this.data.length) {
            let cap = Math.max(this.data.length, 32);

            while(cap < newLen) cap *= 2;

            const grown = Buffer.alloc(cap);
            this.data.copy(grown, 0, 0);
            this.data = grown;
        }

        data.copy(this.data, this.length, 0);
        this.length = newLen;
    }

    /**
     * Compacts the buffer by shifting remaining data to the front.
     * Only triggers when consumed bytes exceed half the allocated capacity, to amortize copy cost.
     */
    pop(length: number): void {
        if (length < (this.data.length / 2)) return;

        this.data.copyWithin(0, length, this.length);
        this.length -= length;
        this.start = 0;
    }

    /**
     * TODO: This is just a toy and should be removed from the main product
     * Scans for the next newline-delimited message and returns it, advancing the start pointer.
     * Returns null if no complete message is available yet.
     */
    popMessage(): Buffer|null {
        let idx = this.data.subarray(this.start, this.length)
            .indexOf('\n') + this.start;

        if (idx < this.start) return null;

        const msg = Buffer.from(
            this.data.subarray(this.start, idx + 1)
        );
        this.start = idx + 1;
        this.pop(idx + 1);
        return msg;
    }
}