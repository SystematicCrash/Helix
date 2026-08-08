import {TCPErrCode} from "./constants.js";

export default class TCPError extends Error {
    constructor(
        readonly code: TCPErrCode,
        readonly cause?: Error | string
    ) {
        let message = code.toString();
        if (cause) {
            message = typeof cause === 'string' ? cause : (cause.message || message);
        }
        super(message);
    }

    static from(code: TCPErrCode, cause?: Error | string): TCPError {
        return new TCPError(code, cause);
    }

    static is(err: Error, code: TCPErrCode): boolean {
        return (err instanceof TCPError) && (err.code === code);
    }
}