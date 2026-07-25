import {TCPCode} from "./constants.js";

export default class TCPError extends Error {
    constructor(readonly code: TCPCode) {
        super(code.toString());
    }

    static from(code: TCPCode): TCPError {
    return new TCPError(code);
    }

    static is(err: Error, code: TCPCode): boolean {
        return (err instanceof TCPError) && (err.code === code);
    }
}