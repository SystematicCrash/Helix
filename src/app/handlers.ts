import HttpResponse from "../network/http/response/HttpResponse.js";
import {indexPage} from "../network/http/response/pages.js";
import {serveStaticFile} from "../fs/index.js";
import {RouteHandler} from "../network/http/routing/types.js";
import {HttpHeader, HttpMethod} from "../network/http/common/constants.js";

/** Renders the default index page. Bound at `/` and `/index.html`. */
export const indexPageHandler: RouteHandler = (_req, _body, info) =>
    HttpResponse.html(200, indexPage(info));

/** Streams the request body back as the response body. Bound at `GET /echo`. */
export const echoHandler: RouteHandler = (_req, body) =>
    HttpResponse.from(200, body);

/** Serves files under `/files/*filepath` via `HttpResponse.file`; range requests honored. */
export const filesHandler: RouteHandler = async (req, _body, _info, params) =>
    HttpResponse.file(await serveStaticFile(params.filepath ?? "", req.rangeSet ?? []));

export const filesHeadHandler: RouteHandler = async (req, _body, _info, params) =>
    HttpResponse.headFile(await serveStaticFile(params.filepath ?? "", req.rangeSet ?? []));

export const filesOptionsHandler: RouteHandler = (req, _body, _info, params) => {
    const response = HttpResponse.empty(204);
    const allowed = [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS].join(', ');
    response.setHeader(HttpHeader.Allow, allowed);
    response.setHeader(HttpHeader.AcceptRange, 'bytes');
    return response;
}