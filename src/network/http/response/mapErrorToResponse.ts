import HttpError from "../common/HttpError.js";
import {HttpVersion} from "../common/constants.js";
import {ServerInfo} from "../../../server/ServerInfo.js";
import MemoryBody from "../body/MemoryBody.js";
import HttpRequest from "../request/HttpRequest.js";
import {internalErrorPage, notFoundPage} from "./pages.js";
import HttpResponse from "./HttpResponse.js";

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(error: HttpError, info: ServerInfo, request: HttpRequest | null): HttpResponse {
    let response: HttpResponse;

    if (error.status === 404) {
        response = HttpResponse.html(error.status, notFoundPage(request, info));
    } else if (error.status >= 500) {
        response = HttpResponse.html(error.status, internalErrorPage(error.status, request, info));
    } else {
        response = HttpResponse.from(error.status, MemoryBody.from(error.message));
    }

    return response;
}



