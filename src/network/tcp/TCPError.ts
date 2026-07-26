import {TCPCode} from "./constants.js";

export default class TCPError extends Error {
    constructor(
        readonly code: TCPCode,
        readonly cause?: Error) {
        super(cause?.message ?? code.toString());
    }

    static from(code: TCPCode, cause?: Error): TCPError {
        return new TCPError(code, cause);
    }

    static is(err: Error, code: TCPCode): boolean {
        return (err instanceof TCPError) && (err.code === code);
    }
}