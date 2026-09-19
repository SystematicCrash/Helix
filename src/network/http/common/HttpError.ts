/*
 * Represents an HTTP protocol error that carries a numeric status code.
 * Thrown during parsing and request handling so it can be turned into an error response.
 */
// src/network/http/common/HttpError.ts
export default class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly fatal: boolean = false,
    ) {
        super(message);
        this.name = 'HttpError';
    }

    static badRequest(msg = 'Bad Request', fatal = false): HttpError {
        return new HttpError(400, msg, fatal);
    }

    static notFound(msg = 'Resource not found'): HttpError {
        return new HttpError(404, msg, false);
    }

    static methodNotAllowed(): HttpError {
        return new HttpError(405, 'Method Not Allowed', false);
    }

    static rangeNotSatisfiable(totalLength: number): HttpError {
        return new HttpError(416, 'Range Not Satisfiable', false);
    }

    static contentTooLarge(msg = 'Content Too Large'): HttpError {
        return new HttpError(413, msg, true);
    }

    static invalidHeaders(): HttpError {
        return HttpError.badRequest('Invalid headers format');
    }

    static invalidRequestLine(): HttpError {
        return HttpError.badRequest('Malformed request Line');
    }
}