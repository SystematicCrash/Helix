/** Partially-filled read options; every field optional. */
export interface RawIOOptions {
    /** Destination buffer; allocated when omitted. */
    buffer?: Buffer;
    /** Offset into `buffer` (default 0). */
    offset?: number;
    /** Byte count; defaults to the remaining buffer space. */
    length?: number;
    /** Absolute file position; null/omitted = current cursor. */
    position?: number | null;
}

/** Validated, fully-resolved read options. */
export interface IOOptions {
    buffer: Buffer;
    offset: number;
    length: number;
    position: number | null;
}
