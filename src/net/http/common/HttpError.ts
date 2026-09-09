/*
 * Represents an HTTP protocol error that carries a numeric status code.
 * Thrown during parsing and request handling so it can be turned into an error response.
 */
export default class HttpError extends Error {
    constructor(readonly status: number, message?: string) {
        super(message);
        this.status = status;
    }
}
