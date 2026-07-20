import {Buffer} from "node:buffer";

export const IDLE_TIMEOUT = 10_000;
export const READ_TIMEOUT = 10_000;
export const WRITE_TIMEOUT = 10_000;

export const EOF = Buffer.alloc(0);

export const events = {
    idleTimeout: 'idle-timeout',
    readTimeout: 'read-timeout',
    writeTimeout: 'write-timeout',
    error: 'error',
    data: 'data',
    end: 'end',
    write: 'write',
    close: 'close',
};
