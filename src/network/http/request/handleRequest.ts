import HttpError from "../common/HttpError.js";
import {HttpHeader, HttpMethod} from "../common/constants.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import HttpResponse from "../response/HttpResponse.js";
import HttpRequest from "./HttpRequest.js";
import type {HttpBody} from "../body/HttpBody.js";
import type {ServerInfo} from "../../../common/types.js";
import type {RouteTree} from "../routing/buildTree.js";
import {getServerInfo} from "../../../common/serverInfo.js";
import {LookupResult} from "../routing/types.js";

/** Dispatches a request through the routing tree: handler, 405 + Allow, or 404. */
export async function handleRequest(request: HttpRequest, body: HttpBody, result: LookupResult): Promise<HttpResponse> {
    const info = getServerInfo();

    switch (result.kind) {
        case "found":
            return result.handler(request, body, info, result.params);

        case "methodNotAllowed": {
            const response = mapErrorToResponse(
                HttpError.methodNotAllowed(),
                request,
            );
            response.setHeader(HttpHeader.Allow, result.allowed.join(", "));
            return response;
        }

        case "notFound":
        default:
            return mapErrorToResponse(HttpError.notFound(), request);
    }
}