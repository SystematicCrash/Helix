import HttpRequest from "../request/HttpRequest.js";
import {HttpBody} from "../body/HttpBody.js";
import {ServerInfo} from "../../../common/types.js";
import HttpResponse from "../response/HttpResponse.js";
import {HttpMethod} from "../common/constants.js";

/** Path params extracted from the request URL; the tree produces a fresh object per request. */
export type RouteParams = Readonly<Record<string, string>>;

/** A route handler: turns (request, body, info, params) into an HttpResponse. Throws are caught upstream. */
export type RouteHandler = (
    request: HttpRequest,
    body: HttpBody,
    info: ServerInfo,
    params: RouteParams,
) => HttpResponse | Promise<HttpResponse>;

/** Result of a tree lookup: handler + params, no match, or path-matched-but-wrong-method. */
export type LookupResult =
    | {kind: "found"; handler: RouteHandler; params: Record<string, string>}
    | {kind: "notFound"}
    | {kind: "methodNotAllowed"; allowed: ReadonlyArray<HttpMethod>};

/** Segment kinds accepted by `RadixNode.insert`: literal, `:name` param, or terminal `*name` wildcard. */
export type SegmentKind =
    | {kind: "static"; name: string}
    | {kind: "param"; name: string}
    | {kind: "wildcard"; name: string};

/** Frozen (path, method, handler) triple consumed by `buildTree`. */
export interface RouteSpec {
    readonly path: string;
    readonly methods: HttpMethod[];
    readonly handler: RouteHandler;
}

