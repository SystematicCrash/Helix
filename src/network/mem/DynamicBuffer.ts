import {MAX_BUFFER_SIZE} from "./constants.js";

/** A growable buffer with a sliding window to avoid redundant copies on consume. */
export default class DynamicBuffer {
    private _length: number;
    private _start: number;
    private _capacity: number;

    constructor(private _data: Buffer = Buffer.alloc(0)) {
        this._start = 0;
        this._length = _data.length;
        this._capacity = _data.length;
    }

    /** Index of the first valid byte in the underlying buffer. */
    public get start(): number {
        return this._start;
    }

    /** Number of valid bytes currently held in the buffer. */
    public get length(): number {
        return this._length;
    }

    /** Total allocated size of the underlying buffer. */
    public get capacity(): number {
        return this._capacity;
    }

    /** Index one past the last valid byte (start + length). */
    public get end(): number {
        return this._start + this._length;
    }
    // TODO: return a view instead of copying data to another buffer.
    /** Returns a copy of the first `length` bytes without consuming them from the buffer. */
    public getView(length = this._length): Buffer<ArrayBufferLike> {
        if (length > this._length) {
            throw new Error(`Cannot cut ${length} bytes, only ${this._length} is available!`);
        }
        return this._data.subarray(this._start, this._start + length);
    }

    /** Appends data to the buffer, doubling its capacity when the current allocation is exceeded. */
    public push(data: Buffer | null): void {
        if (!data) return;
        const newLen = this.length + data.length;

        if (newLen >= MAX_BUFFER_SIZE) {
            throw new Error('Buffer maximum size exceeded!');
        }

        if (newLen > this._capacity) {
            let newCap = Math.max(this._capacity, 32);

            while(newCap < newLen) newCap *= 2;

            const grown = Buffer.alloc(newCap);
            this._data.copy(grown, 0, this._start, this.end);
            this._capacity = newCap;
            this._start = 0;
            this._data = grown;
        }

        data.copy(this._data, this.end, 0);
        this._length = newLen;
    }

    /**
     * Compacts the buffer by shifting remaining data to the front.
     * Only triggers when consumed bytes exceed half the allocated capacity, to amortize copy cost.
     */
    public clear(length = this._length): void {
        if (length > this._length) {
            throw new Error(`Cannot pop ${length} bytes, only ${this._length} is available!`);
        }
        this._start += length;
        this._length -= length;

        if (this._start > (this._capacity / 2)) {
            this._data.copyWithin(0, this._start, this.end);
            this._start = 0;
        }
    }

    /**
     * TODO: This is just a toy and should be removed from the main product
     * Scans for the next newline-delimited message and returns it, advancing the start pointer.
     * Returns null if no complete message is available yet.
     */
    public popMessage(): Buffer|null {
        let idx = this.getView(this._length).indexOf('\n');

        if (idx < 0) return null;

        const msg = this.getView(idx + 1)
        this.clear(idx + 1);
        return msg;
    }
}