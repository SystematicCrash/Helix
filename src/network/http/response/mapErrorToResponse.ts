import HttpError from "../common/HttpError.js";
import {ContentType, HttpHeader} from "../common/constants.js";
import MemoryBody from "../body/MemoryBody.js";
import HttpRequest from "../request/HttpRequest.js";
import {internalErrorPage, notFoundPage} from "./pages.js";
import HttpResponse from "./HttpResponse.js";
import {getServerInfo} from "../../../common/serverInfo.js";

type PreferredFormat = "json" | "text" | "html";

const buildTextResponse = (error: HttpError, request: HttpRequest | null): HttpResponse => {
    const textPayload = `${error.status} ${error.message}\n`;
    const res = HttpResponse.from(error.status, MemoryBody.from(textPayload));
    res.setHeader(HttpHeader.ContentType, ContentType.TextPlainUtf8);
    return res;
}

const buildJsonResponse = (error: HttpError, request: HttpRequest | null): HttpResponse =>
    HttpResponse.json(error.status, {
        error: {
            status: error.status,
            message: error.message,
            path: request?.url ?? "",
            method: request?.method ?? "",
        },
    })

const buildHtmlResponse = (error: HttpError, request: HttpRequest | null): HttpResponse => {
    const info = getServerInfo();
    if (error.status === 404) {
        return HttpResponse.html(error.status, notFoundPage(request, info));
    }
    if (error.status >= 500) {
        return HttpResponse.html(error.status, internalErrorPage(error.status, request, info));
    }
    return HttpResponse.from(error.status, MemoryBody.from(error.message));
}

/** Resolves the highest-priority supported format from the client's Accept header. */
function resolveFormat(request: HttpRequest | null): PreferredFormat {
    if (!request) return "html";

    for (const type of request.acceptTypes) {
        if (type === ContentType.Json || type === ContentType.JsonUtf8) return "json";
        if (type === ContentType.TextPlain || type === ContentType.TextPlainUtf8) return "text";
        if (type === ContentType.TextHtml || type === ContentType.TextHtmlUtf8) return "html";
    }

    return "html";
}


/** Formats the error into JSON, Plain Text, or HTML based on client Accept preference. */
function formatErrorPayload(error: HttpError, request: HttpRequest | null): HttpResponse {
    const format = resolveFormat(request);

    if (format === "json") return buildJsonResponse(error, request);
    if (format === "text") return buildTextResponse(error, request);

    return buildHtmlResponse(error, request);
}

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(error: HttpError, request: HttpRequest | null): HttpResponse {
    try {
        const response = formatErrorPayload(error, request);

        if (error.fatal) {
            response.setHeader(HttpHeader.Connection, "close");
        }

        return response;
    } catch(error) {
        return HttpResponse.from(500, MemoryBody.from("Internal server error"));
    }
}