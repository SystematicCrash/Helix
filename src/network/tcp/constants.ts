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
    write = 'write',
    CLOSE = 'close',
    DRAIN = 'drain',
}
