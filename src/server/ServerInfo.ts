/** Information about the running webserver, exposed to request handlers. */
export interface ServerInfo {
    /** Numeric port the TCP listener is bound to. */
    readonly port: number;
    /** Network interface the listener is bound to (e.g. "0.0.0.0", "::1"). */
    readonly iface: string;
    /** Server version string (e.g. "1.0.0"). */
    readonly version: string;
}
