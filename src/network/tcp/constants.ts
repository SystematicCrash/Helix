import {Buffer} from "node:buffer";

export const IDLE_TIMEOUT = 10_000;
export const READ_TIMEOUT = 10_000;
export const WRITE_TIMEOUT = 10_000;

export const EOF = Buffer.alloc(0);

export const events = Object.freeze({
    IDLE_TIMEOUT: 'idle-timeout',
    READ_TIMEOUT: 'read-timeout',
    WRITE_TIMEOUT: 'write-timeout',
    ERROR: 'error',
    DATA: 'data',
    END: 'end',
    write: 'write',
    CLOSE: 'close',
});
