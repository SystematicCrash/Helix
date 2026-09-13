import HttpError from "../common/HttpError.js";
import {HttpVersion} from "../common/constants.js";
import {HttpRequest, HttpResponse} from "../common/types.js";
import MemoryBodyReader from "../request/body/MemoryBodyReader.js";
import {renderHtml} from "../../../infra/index.js";
import {ServerInfo} from "../../../server/ServerInfo.js";

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(
    error: unknown,
    request: HttpRequest,
    info: ServerInfo,
    code: number = 500,
): HttpResponse {
    let body: MemoryBodyReader;

    if (error instanceof HttpError) {
        if (error.status === 404) {
            const html = renderHtml('notFound', {
                path: request.url,
                method: request.method,
                version: info.version,
            });
            body = new MemoryBodyReader(html);
            code = 404;
        } else {
            body = new MemoryBodyReader(Buffer.from(error.message));
            code = error.status;
        }
    } else {
        body = new MemoryBodyReader(Buffer.from('Internal Server Error'));
    }


    return {
        code,
        version: HttpVersion.HTTP_1_1,
        headers: new Map(),
        body,
    };
}
