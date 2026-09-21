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
