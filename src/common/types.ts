export interface ByteRange {
    start?: number;
    end: number;
    suffix?: number
}

/** Information about the running webserver, exposed to request handlers. */
export interface ServerInfo {
    readonly port: number;
    readonly iface: string;
    readonly version: string;
}

/** Async generator yielding the bytes of a body or file stream. */
export type BufferGenerator = AsyncGenerator<Buffer, void, void>;
