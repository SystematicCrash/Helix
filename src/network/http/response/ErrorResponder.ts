import HttpError from "../common/HttpError.js";
import {ContentType, HttpHeader} from "../common/constants.js";
import MemoryBody from "../body/MemoryBody.js";
import HttpRequest from "../request/HttpRequest.js";
import {internalErrorPage, notFoundPage} from "./pages.js";
import HttpResponse from "./HttpResponse.js";
import {getServerInfo} from "../../../common/serverInfo.js";

/**
 * Translates an `HttpError` into an `HttpResponse`: picks JSON / Plain Text /
 * HTML based on the client's Accept header and applies `Connection: close` on
 * fatal errors. Unknown thrown values fall back to a generic 500.
 */
export default class ErrorResponder {
    /** Builds the error response in the client's preferred format. */
    public static respond(error: HttpError, request: HttpRequest | null): HttpResponse {
        try {
            const response = ErrorResponder.formatPayload(error, request);

            if (error.fatal) {
                response.setHeader(HttpHeader.Connection, "close");
            }

            return response;
        } catch(error) {
            return HttpResponse.from(500, MemoryBody.from("Internal server error"));
        }
    }

    private static formatPayload(error: HttpError, request: HttpRequest | null): HttpResponse {
        const format = ErrorResponder.resolveFormat(request);

        if (format === "json") return ErrorResponder.buildJson(error, request);
        if (format === "text") return ErrorResponder.buildText(error, request);

        return ErrorResponder.buildHtml(error, request);
    }

    private static buildText(error: HttpError, request: HttpRequest | null): HttpResponse {
        const textPayload = `${error.status} ${error.message}\n`;
        const res = HttpResponse.from(error.status, MemoryBody.from(textPayload));
        res.setHeader(HttpHeader.ContentType, ContentType.TextPlainUtf8);
        return res;
    }

    private static buildJson(error: HttpError, request: HttpRequest | null): HttpResponse {
        return HttpResponse.json(error.status, {
            error: {
                status: error.status,
                message: error.message,
                path: request?.url ?? "",
                method: request?.method ?? "",
            },
        });
    }

    private static buildHtml(error: HttpError, request: HttpRequest | null): HttpResponse {
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
    private static resolveFormat(request: HttpRequest | null): "json" | "text" | "html" {
        if (!request) return "html";

        for (const type of request.acceptTypes) {
            if (type === ContentType.Json || type === ContentType.JsonUtf8) return "json";
            if (type === ContentType.TextPlain || type === ContentType.TextPlainUtf8) return "text";
            if (type === ContentType.TextHtml || type === ContentType.TextHtmlUtf8) return "html";
        }

        return "html";
    }
}
