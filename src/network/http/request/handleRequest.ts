import HttpError from "../common/HttpError.js";
import {HttpHeader, HttpMethod} from "../common/constants.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import HttpResponse from "../response/HttpResponse.js";
import HttpRequest from "./HttpRequest.js";
import type {HttpBody} from "../body/HttpBody.js";
import type {ServerInfo} from "../../../common/types.js";
import type {RouteTree} from "../routing/buildTree.js";
import {getServerInfo} from "../../../common/serverInfo.js";

/** Dispatches a request through the routing tree: handler, 405 + Allow, or 404. */
export async function handleRequest(
    request: HttpRequest,
    body: HttpBody,
    tree: RouteTree,
): Promise<HttpResponse> {
    const info = getServerInfo();
    const segments = splitPath(request.url);
    const result = tree.lookup(request.method as HttpMethod, segments);

    switch (result.kind) {
        case "found":
            return result.handler(request, body, info, result.params);

        case "methodNotAllowed": {
            const response = mapErrorToResponse(
                HttpError.methodNotAllowed(),
                request,
            );
            response.headers.set(HttpHeader.Allow, result.allowed.join(", "));
            return response;
        }

        case "notFound":
        default:
            return mapErrorToResponse(HttpError.notFound(), request);
    }
}

/** Splits a URL into segments; `''` and `'/'` yield `[]`, otherwise split on `/` and drop empties. */
function splitPath(url: string): string[] {
    if (url === "/" || url === "") return [];
    return url.split("/").filter((s) => s !== "");
}
