import HttpError from "../common/HttpError.js";
import {HttpHeader, HttpMethod} from "../common/constants.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import HttpResponse from "../response/HttpResponse.js";
import HttpRequest from "./HttpRequest.js";
import type {HttpBody} from "../body/HttpBody.js";
import type {ServerInfo} from "../../../common/types.js";
import type {RouteTree} from "../routing/buildTree.js";

/**
 * Routes a single HTTP request through the compiled radix tree and produces
 * an `HttpResponse`. Three branches:
 *
 *   - `found`:            invoke the matching handler and return its response.
 *   - `methodNotAllowed`: produce a 405 via `mapErrorToResponse` and attach
 *                         an `Allow` header listing every method registered
 *                         at the matched terminal node.
 *   - `notFound`:         produce a 404 via `mapErrorToResponse`.
 *
 * Errors thrown from a handler propagate up; the per-connection error path
 * in `HttpConnection.handleError` maps them via `mapErrorToResponse` /
 * `mapToHttpError`. No try/catch is needed inside this function.
 */
export async function handleRequest(
    request: HttpRequest,
    body: HttpBody,
    info: ServerInfo,
    tree: RouteTree,
): Promise<HttpResponse> {
    const segments = splitPath(request.url);
    const result = tree.lookup(request.method as HttpMethod, segments);

    switch (result.kind) {
        case "found":
            return result.handler(request, body, info, result.params);

        case "methodNotAllowed": {
            const response = mapErrorToResponse(
                HttpError.methodNotAllowed(),
                info,
                request,
            );
            response.headers.set(HttpHeader.Allow, result.allowed.join(", "));
            return response;
        }

        case "notFound":
        default:
            return mapErrorToResponse(HttpError.notFound(), info, request);
    }
}

/**
 * Splits a request URL into radix-friendly path segments. The root path
 * (`/`) and an empty string both yield an empty segment list; everything
 * else is split on `/`, with empty pieces removed (so `//` collapses cleanly).
 */
function splitPath(url: string): string[] {
    if (url === "/" || url === "") return [];
    return url.split("/").filter((s) => s !== "");
}
