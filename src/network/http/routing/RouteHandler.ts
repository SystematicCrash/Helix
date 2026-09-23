import type HttpRequest from "../request/HttpRequest.js";
import type {HttpBody} from "../body/HttpBody.js";
import type HttpResponse from "../response/HttpResponse.js";
import type {ServerInfo} from "../../../common/types.js";

/** Path params extracted from the request URL; the tree produces a fresh object per request. */
export type RouteParams = Readonly<Record<string, string>>;

/** A route handler: turns (request, body, info, params) into an HttpResponse. Throws are caught upstream. */
export type RouteHandler = (
    request: HttpRequest,
    body: HttpBody,
    info: ServerInfo,
    params: RouteParams,
) => HttpResponse | Promise<HttpResponse>;
