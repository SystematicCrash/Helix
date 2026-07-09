export default class HttpError extends Error {
    constructor(readonly status: number, message?: string) {
        super(message);
        this.status = status;
    }
}