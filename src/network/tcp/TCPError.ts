import {TCPCode} from "./constants.js";

export default class TCPError extends Error {
    constructor(readonly code: TCPCode) {
        super(code.toString());
    }
}