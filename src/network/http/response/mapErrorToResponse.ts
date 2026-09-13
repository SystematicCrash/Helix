import HttpError from "../common/HttpError.js";
import {HttpVersion} from "../common/constants.js";
import {HttpRequest, HttpResponse} from "../common/types.js";
import MemoryBodyReader from "../request/body/MemoryBodyReader.js";
import {renderHtml} from "../../../infra/index.js";
import {ServerInfo} from "../../../server/ServerInfo.js";

/**
 * Converts any thrown error into an HttpResponse with an appropriate status code.
 * Renders the notFound.eta template for 404s and a generic plain-text body for
 * 5xx responses (raw error messages are not leaked to the client).
 */
export function mapErrorToResponse(
    error: unknown,
    request: HttpRequest,
    info: ServerInfo,
): HttpResponse {
    let code: number;
    let body: MemoryBodyReader;

    if (error instanceof HttpError && error.status === 404) {
        const html = renderHtml('notFound', {
            path: request.url,
            method: request.method,
            version: info.version,
        });
        body = new MemoryBodyReader(html);
        code = 404;
    } else if (error instanceof HttpError) {
        code = error.status;
        body = new MemoryBodyReader(Buffer.from(error.message));
    } else {
        code = 500;
        body = new MemoryBodyReader(Buffer.from('Internal Server Error'));
    }

    return {
        code,
        version: HttpVersion.HTTP_1_1,
        headers: new Map(),
        body,
    };
}
