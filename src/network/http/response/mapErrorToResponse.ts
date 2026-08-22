import HttpError from "../common/HttpError.js";
import {HttpVersion} from "../common/constants.js";
import {HttpResponse} from "../common/types.js";
import {memoryReader} from "../request/body/MemoryBodyReader.js";

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(error: unknown): HttpResponse {
    let code: number;
    let body;

    if (error instanceof HttpError) {
        code = error.status;
        body = memoryReader(Buffer.from(error.message));
    } else if (error instanceof Error) {
        code = 500;
        body = memoryReader(Buffer.from(error.message));
    } else {
        code = 500;
        body = memoryReader(Buffer.from("Webserver Internal Error"));
    }

    return {
        code,
        body,
        version: HttpVersion.HTTP_1_1,
        headers: new Map(),
    };
}
