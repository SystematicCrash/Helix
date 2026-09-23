import type HttpRequest from "../request/HttpRequest.js";
import type {HttpBody} from "../body/HttpBody.js";
import type HttpResponse from "../response/HttpResponse.js";
import type {ServerInfo} from "../../../common/types.js";

/**
 * Path parameters extracted from the request URL by the radix tree.
 * Read-only at the handler boundary; the tree produces a fresh object per request.
 */
export type RouteParams = Readonly<Record<string, string>>;

/**
 * A route handler receives the parsed request, body, server info, and any path
 * parameters, and produces a response (or a promise of one).
 *
 * Errors thrown from a handler are caught by the dispatcher and mapped to an
 * HttpResponse via the existing `mapErrorToResponse` path — no per-route
 * try/catch needed.
 */
export type RouteHandler = (
    request: HttpRequest,
    body: HttpBody,
    info: ServerInfo,
    params: RouteParams,
) => HttpResponse | Promise<HttpResponse>;
