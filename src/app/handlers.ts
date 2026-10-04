import HttpResponse from "../network/http/response/HttpResponse.js";
import {indexPage} from "../network/http/response/pages.js";
import {RouteHandler} from "../network/http/routing/types.js";
import FileResponder from "../network/http/response/FileResponder.js";

/** Renders the default index page. Bound at `/` and `/index.html`. */
export const indexPageHandler: RouteHandler = (_req, _body, info) =>
    HttpResponse.html(200, indexPage(info));

/** Streams the request body back as the response body. Bound at `GET /echo`. */
export const echoHandler: RouteHandler = (_req, body) =>
    HttpResponse.from(200, body);

/** Serves files under `/files/*filepath`; cache validation, ranges, and method negotiation live in `FileResponder`. */
export const filesHandler: RouteHandler = (req, _body, _info, params) =>
    FileResponder.respond(req, params.filepath ?? "");
