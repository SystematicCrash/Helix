import {BufferErrCode} from "./constants.js";

export default class BufferError extends Error {
    constructor(
        readonly code: BufferErrCode,
        readonly cause?: Error | string
    ) {
        let message = code.toString();
        if (cause) {
            message = typeof cause === 'string' ? cause : (cause.message || message);
        }
        super(message);
    }

    static from(code: BufferErrCode, cause?: Error | string): BufferError {
        return new BufferError(code, cause);
    }

    static is(err: Error, code: BufferErrCode): boolean {
        return (err instanceof BufferError) && (err.code === code);
    }
}
