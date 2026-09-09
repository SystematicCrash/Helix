import {FsErrCode} from "./constants.js";

export default class FsError extends Error {
    constructor(
        readonly code: FsErrCode,
        readonly cause?: Error | string
    ) {
        let message = code.toString();
        if (cause) {
            message = typeof cause === 'string' ? cause : (cause.message || message);
        }
        super(message);
    }

    static from(code: FsErrCode, cause?: Error | string): FsError {
        return new FsError(code, cause);
    }

    static is(err: Error, code: FsErrCode): boolean {
        return (err instanceof FsError) && (err.code === code);
    }
}
