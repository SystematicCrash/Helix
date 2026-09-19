import HttpError from "../common/HttpError.js";
import {HttpVersion} from "../common/constants.js";
import {HttpResponse} from "../common/types.js";
import {renderHtml} from "../../../infra/index.js";
import {ServerInfo} from "../../../server/ServerInfo.js";
import MemoryBody from "../body/MemoryBody.js";
import HttpRequest from "../request/HttpRequest.js";

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(
    error: unknown,
    request: HttpRequest | null,
    info: ServerInfo,
    code: number = 500,
): HttpResponse {
    let body: MemoryBody;

    if (error instanceof HttpError) {
        if (error.status === 404) {
            const html = renderHtml('notFound', {
                path: request?.url ?? '',
                method: request?.method ?? 'UNKNOWN',
                version: request?.version ?? info.version,
            });
            body = new MemoryBody(html);
            code = 404;
        } else {
            body = new MemoryBody(Buffer.from(error.message));
            code = error.status;
        }
    } else {
        body = new MemoryBody(Buffer.from('Internal Server Error'));
    }


    return {
        code,
        version: HttpVersion.HTTP_1_1,
        headers: new Map(),
        body,
    };
}
