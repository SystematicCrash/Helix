export class TCPError extends Error {
    constructor(readonly code: TCPCode) {
        super(code);
    }
}

export enum TCPCode {
    IDLE_TIMEOUT = 'TCP connection lifetime exceeded',
    WRITE_TIMEOUT = 'TCP write timeout exceeded',
    READ_TIMEOUT = 'TCP read timeout exceeded',
    UNKNOWN_TIMEOUT = 'Unexpected connection timeout',
    UNEXPECTED_CLOSE = 'Connection closed unexpectedly',
    READ_FROM_CLOSED_CONNECTION = 'Cannot read from a closed connection',
    WRITE_TO_CLOSED_CONNECTION = 'Cannot write to a closed connection',
    SEND_BACKPRESSURE = 'Send buffer is full; cannot write to connection',
    EMPTY_DATA_BUFFER = 'Data length must be greater than zero',
    SIMULTANEOUS_READ = 'Another read is already in progress',
    UNEXPECTED_ERROR = 'Unexpected error occurred',
}