import {TCPErrCode} from "./constants.js";

export default class TCPError extends Error {
    constructor(
        readonly code: TCPErrCode,
        readonly cause?: Error
    ) {
        super(code.toString() || cause?.message);
    }

    static from(code: TCPErrCode, cause?: Error): TCPError {
        return new TCPError(code, cause);
    }

    static is(err: Error, code: TCPErrCode): boolean {
        return (err instanceof TCPError) && (err.code === code);
    }
}