export const IDLE_TIMEOUT = 10_000;
export const READ_TIMEOUT = 10_000;
export const WRITE_TIMEOUT = 10_000;
export const MAX_WRITE_BUFFER_SIZE = 1024 * 1024;

export enum Event {
    IDLE_TIMEOUT = 'idle-timeout',
    READ_TIMEOUT = 'read-timeout',
    WRITE_TIMEOUT = 'write-timeout',
    ERROR = 'error',
    DATA = 'data',
    END = 'end',
    CLOSE = 'close',
    DRAIN = 'drain',
}

export enum TCPErrCode {
    READ_AFTER_EOF = 'Cannot read after EOF',
    WRITE_AFTER_EOF = 'Cannot write after EOF',
    READ_AFTER_CLOSE = 'Cannot read from a closed connection',
    WRITE_AFTER_CLOSE = 'Cannot write to a closed connection',
    WRITE_BACKPRESSURE = 'Send buffer is full; cannot write to connection',
    EMPTY_DATA_BUFFER = 'Data length must be greater than zero',
    SIMULTANEOUS_READ = 'Another read is already in progress',
    SIMULTANEOUS_WRITE = 'Another write is already in progress',
    IDLE_TIMEOUT = 'TCP connection lifetime exceeded',
    WRITE_TIMEOUT = 'TCP write timeout exceeded',
    READ_TIMEOUT = 'TCP read timeout exceeded',
    UNKNOWN_TIMEOUT = 'Unexpected connection timeout',
    UNEXPECTED_CLOSE = 'Connection closed unexpectedly',
    UNEXPECTED_ERROR = 'Unexpected error occurred',
    GRACEFUL_CLOSE = 'Connection closed gracefully but between an async operation',
}