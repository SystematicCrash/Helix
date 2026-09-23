import type {RouteHandler} from "./routing/RouteHandler.js";
import HttpResponse from "./response/HttpResponse.js";
import {indexPage} from "./response/pages.js";
import {serveStaticFile} from "../../fs/index.js";

/** Renders the default index page. Bound at `/` and `/index.html`. */
export const indexPageHandler: RouteHandler = (_req, _body, info) =>
    HttpResponse.html(200, indexPage(info));

/** Streams the request body back as the response body. Bound at `GET /echo`. */
export const echoHandler: RouteHandler = (_req, body) =>
    HttpResponse.from(200, body);

/** Serves files under `/files/*filepath` via `HttpResponse.file`; range requests honored. */
export const filesHandler: RouteHandler = async (req, _body, _info, params) =>
    HttpResponse.file(await serveStaticFile(params.filepath ?? "", req.rangeSet ?? []));
