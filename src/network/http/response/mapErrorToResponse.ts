import HttpError from "../common/HttpError.js";
import {HttpVersion} from "../common/constants.js";
import {HttpResponse} from "../common/types.js";
import {renderHtml} from "../../../infra/index.js";
import {ServerInfo} from "../../../server/ServerInfo.js";
import MemoryBody from "../body/MemoryBody.js";
import HttpRequest from "../request/HttpRequest.js";
import {internalErrorPage, notFoundPage} from "./pages.js";

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(error: HttpError, info: ServerInfo, request: HttpRequest): HttpResponse {
    let body: MemoryBody;
    let payload: Buffer;

    if (error.status === 404) {
        payload = notFoundPage(request, info);
    } else if (error.status >= 500) {
        payload = internalErrorPage(error.status, request, info);
    } else {
        payload = Buffer.from(error.message);
    }

    return {
        code: error.status,
        body: MemoryBody.from(payload),
        version: HttpVersion.HTTP_1_1,
        headers: new Map(),
    };
}



