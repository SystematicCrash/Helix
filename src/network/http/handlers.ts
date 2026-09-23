import type {RouteHandler} from "./routing/RouteHandler.js";
import HttpResponse from "./response/HttpResponse.js";
import StreamBody from "./body/StreamBody.js";
import {HttpHeader} from "./common/constants.js";
import {indexPage} from "./response/pages.js";
import {serveStaticFile} from "../../fs/index.js";

/** Renders the default index page. Bound at `/` and `/index.html`. */
export const indexPageHandler: RouteHandler = (_req, _body, info) =>
    HttpResponse.html(200, indexPage(info));

/** Streams the request body back as the response body. Bound at `GET /echo`. */
export const echoHandler: RouteHandler = (_req, body) =>
    HttpResponse.from(200, body);

/** Serves files under `/files/*filepath`; honors range requests and sets `Accept-Range` / `Content-Range`. */
export const filesHandler: RouteHandler = async (req, _body, _info, params) => {
    const file = await serveStaticFile(params.filepath ?? "", req.rangeSet ?? []);
    const response = HttpResponse.from(
        file.status,
        new StreamBody(file.stream, file.size),
    );
    response.headers.set(HttpHeader.AcceptRange, "bytes");
    if (file.contentRange) {
        response.headers.set("content-range", file.contentRange);
    }
    return response;
};
