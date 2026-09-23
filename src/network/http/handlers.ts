import type {RouteHandler} from "./routing/RouteHandler.js";
import HttpResponse from "./response/HttpResponse.js";
import StreamBody from "./body/StreamBody.js";
import {HttpHeader} from "./common/constants.js";
import {indexPage} from "./response/pages.js";
import {serveStaticFile} from "../../fs/index.js";

/**
 * Concrete route handlers used by `routing/routes.ts`. Each handler matches
 * the `RouteHandler` signature: `(request, body, info, params) =>
 * HttpResponse | Promise<HttpResponse>`.
 *
 * The actual render for `indexPageHandler` lives in `response/pages.ts`
 * (`indexPage`); this file only adapts that function to the `RouteHandler`
 * contract. Adding a new handler: define it here, then register it in
 * `routing/routes.ts`.
 */

/** Renders the default index page. Bound at `/` and `/index.html`. */
export const indexPageHandler: RouteHandler = (_req, _body, info) =>
    HttpResponse.html(200, indexPage(info));

/** Streams the request body back as the response body. Bound at `GET /echo`. */
export const echoHandler: RouteHandler = (_req, body) =>
    HttpResponse.from(200, body);

/**
 * Serves files from the configured file root. The wildcard segment in the
 * route table (`/files/*filepath`) makes the relative path available as
 * `params.filepath`; range requests are honored via `request.rangeSet`.
 *
 * Returns the status code reported by `serveStaticFile` (200 / 206 / 404)
 * and sets `Accept-Range` plus, when present, `Content-Range` headers.
 */
export const filesHandler: RouteHandler = async (req, _body, _info, params) => {
    const filepath = params.filepath ?? "";
    const file = await serveStaticFile(filepath, req.rangeSet ?? []);
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
